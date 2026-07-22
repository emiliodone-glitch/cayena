import { Router } from "express";
import { z } from "zod";
import { prisma, loadProvinciasGeo, loadMunicipiosGeo, loadDistritosMunicipalesGeo } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje } from "@cayena/shared";
import { asyncRoute } from "../middleware/errorHandler";
import { calcularRango, type Periodo } from "../lib/periodo";

export const geoRouter = Router();

// Umbral compartido con lib/alertas.ts: una demarcación se considera
// "estancada" si no cumple su meta y no registra militantes nuevos en 14 días.
const DIAS_ESTANCAMIENTO = 14;

// Listas planas (sin geometría) para selects de formularios.
geoRouter.get(
  "/lista/provincias",
  asyncRoute(async (_req, res) => {
    const provincias = await prisma.provincia.findMany({
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    res.json(provincias);
  }),
);

geoRouter.get(
  "/lista/municipios",
  asyncRoute(async (req, res) => {
    const { provinciaId } = req.query as { provinciaId?: string };
    const municipios = await prisma.municipio.findMany({
      where: provinciaId ? { provinciaId } : undefined,
      select: { id: true, nombre: true, provinciaId: true },
      orderBy: { nombre: "asc" },
    });
    res.json(municipios);
  }),
);

// Catálogo plano de todas las demarcaciones (provincias, municipios y
// distritos municipales) con su cadena de padres, para el buscador del mapa:
// escribir "Moca" debe poder saltar directo al municipio sin navegar nivel
// por nivel. Un solo fetch, el cliente lo cachea.
geoRouter.get(
  "/lista/demarcaciones",
  asyncRoute(async (_req, res) => {
    const [provincias, municipios, distritos] = await Promise.all([
      prisma.provincia.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.municipio.findMany({
        select: { id: true, nombre: true, provinciaId: true, provincia: { select: { nombre: true } } },
        orderBy: { nombre: "asc" },
      }),
      prisma.distritoMunicipal.findMany({
        select: {
          id: true,
          nombre: true,
          municipioId: true,
          municipio: { select: { nombre: true, provinciaId: true, provincia: { select: { nombre: true } } } },
        },
        orderBy: { nombre: "asc" },
      }),
    ]);
    res.json([
      ...provincias.map((p) => ({ tipo: "provincia" as const, id: p.id, nombre: p.nombre, ruta: "Provincia" })),
      ...municipios.map((m) => ({
        tipo: "municipio" as const,
        id: m.id,
        nombre: m.nombre,
        provinciaId: m.provinciaId,
        provinciaNombre: m.provincia.nombre,
        ruta: m.provincia.nombre,
      })),
      ...distritos.map((d) => ({
        tipo: "distrito" as const,
        id: d.id,
        nombre: d.nombre,
        municipioId: d.municipioId,
        municipioNombre: d.municipio.nombre,
        provinciaId: d.municipio.provinciaId,
        provinciaNombre: d.municipio.provincia.nombre,
        ruta: `${d.municipio.provincia.nombre} › ${d.municipio.nombre}`,
      })),
    ]);
  }),
);

// ---------------------------------------------------------------------------
// Filtros comunes de los endpoints del mapa (RF-13 ampliado): período de
// registro, origen del registro y promotor que lo capturó. El período usa la
// misma librería que el dashboard/ranking para que "mes" signifique lo mismo
// en toda la app, e incluye la ventana anterior comparable para la tendencia.
const filtrosSchema = z.object({
  periodo: z.enum(["semana", "mes", "trimestre", "custom"]).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  origen: z.enum(["BACKOFFICE", "APP_PUBLICA"]).optional(),
  capturadoPorId: z.string().optional(),
});

type Filtros = z.infer<typeof filtrosSchema>;

function whereFiltros(f: Filtros): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (f.origen) where.origen = f.origen;
  if (f.capturadoPorId) where.capturadoPorId = f.capturadoPorId;
  return where;
}

function rangoDeFiltros(f: Filtros) {
  if (!f.periodo) return null;
  return calcularRango(f.periodo as Periodo, f.desde, f.hasta);
}

function hayFiltros(f: Filtros): boolean {
  return !!(f.periodo || f.origen || f.capturadoPorId);
}

type ConteoAgrupado = { _count: { _all: number } } & Record<string, unknown>;

// Estadísticas de militantes agrupadas por una demarcación, con todo lo que
// el mapa necesita por feature: total histórico, último registro (para
// estancamiento), conteo del período filtrado y del período anterior.
async function statsPorCampo(
  campo: "provinciaId" | "municipioId" | "distritoMunicipalId",
  filtros: Filtros,
  whereBase: Record<string, unknown> = {},
) {
  const rango = rangoDeFiltros(filtros);
  const extra = whereFiltros(filtros);

  const [totales, ultimos, filtrados, previos] = await Promise.all([
    prisma.militante.groupBy({ by: [campo], where: whereBase, _count: { _all: true } }),
    prisma.militante.groupBy({ by: [campo], where: whereBase, _max: { createdAt: true } }),
    hayFiltros(filtros)
      ? prisma.militante.groupBy({
          by: [campo],
          where: {
            ...whereBase,
            ...extra,
            ...(rango ? { createdAt: { gte: rango.inicio, lte: rango.fin } } : {}),
          },
          _count: { _all: true },
        })
      : Promise.resolve([] as ConteoAgrupado[]),
    rango
      ? prisma.militante.groupBy({
          by: [campo],
          where: {
            ...whereBase,
            ...extra,
            createdAt: { gte: rango.inicioAnterior, lte: rango.finAnterior },
          },
          _count: { _all: true },
        })
      : Promise.resolve([] as ConteoAgrupado[]),
  ]);

  const limiteEstancamiento = new Date(Date.now() - DIAS_ESTANCAMIENTO * 24 * 3600 * 1000);
  return {
    total: new Map((totales as ConteoAgrupado[]).map((t) => [t[campo] as string | null, t._count._all])),
    ultimo: new Map(
      (ultimos as ({ _max: { createdAt: Date | null } } & Record<string, unknown>)[]).map((u) => [
        u[campo] as string | null,
        u._max.createdAt,
      ]),
    ),
    filtrado: new Map((filtrados as ConteoAgrupado[]).map((t) => [t[campo] as string | null, t._count._all])),
    previo: new Map((previos as ConteoAgrupado[]).map((t) => [t[campo] as string | null, t._count._all])),
    conFiltros: hayFiltros(filtros),
    conTendencia: !!rango,
    limiteEstancamiento,
  };
}

type Stats = Awaited<ReturnType<typeof statsPorCampo>>;

function propsDemarcacion(id: string | null, meta: number, electores: number | null | undefined, stats: Stats) {
  const captados = stats.total.get(id) ?? 0;
  const estado = calcularEstadoAvance(captados, meta);
  const ultimo = stats.ultimo.get(id) ?? null;
  const estancada = estado !== "verde" && (!ultimo || ultimo < stats.limiteEstancamiento);
  return {
    militantesCaptados: captados,
    meta,
    porcentaje: calcularPorcentaje(captados, meta),
    estado,
    estancada,
    electores: electores ?? null,
    penetracion: electores && electores > 0 ? Math.round((captados / electores) * 1000) / 10 : null,
    ...(stats.conFiltros ? { captadosFiltrados: stats.filtrado.get(id) ?? 0 } : {}),
    ...(stats.conTendencia ? { captadosPrevio: stats.previo.get(id) ?? 0 } : {}),
  };
}

async function metasActivasPorProvincia(): Promise<Map<string, number>> {
  const metas = await prisma.metaMilitantes.findMany({
    where: { provinciaId: { not: null } },
    orderBy: { vigenciaDesde: "desc" },
  });
  const map = new Map<string, number>();
  for (const m of metas) {
    if (m.provinciaId && !map.has(m.provinciaId)) map.set(m.provinciaId, m.meta);
  }
  return map;
}

async function metasActivasPorMunicipio(): Promise<Map<string, number>> {
  const metas = await prisma.metaMilitantes.findMany({
    where: { municipioId: { not: null } },
    orderBy: { vigenciaDesde: "desc" },
  });
  const map = new Map<string, number>();
  for (const m of metas) {
    if (m.municipioId && !map.has(m.municipioId)) map.set(m.municipioId, m.meta);
  }
  return map;
}

async function metasActivasPorDistritoMunicipal(): Promise<Map<string, number>> {
  const metas = await prisma.metaMilitantes.findMany({
    where: { distritoMunicipalId: { not: null } },
    orderBy: { vigenciaDesde: "desc" },
  });
  const map = new Map<string, number>();
  for (const m of metas) {
    if (m.distritoMunicipalId && !map.has(m.distritoMunicipalId)) map.set(m.distritoMunicipalId, m.meta);
  }
  return map;
}

// GET /geo/provincias — mapa nacional con semáforo (RF-13)
geoRouter.get(
  "/provincias",
  asyncRoute(async (req, res) => {
    const filtros = filtrosSchema.parse(req.query);
    const geo = loadProvinciasGeo();
    const [stats, metas, provincias] = await Promise.all([
      statsPorCampo("provinciaId", filtros),
      metasActivasPorProvincia(),
      prisma.provincia.findMany({ select: { id: true, electores: true } }),
    ]);
    const electoresMap = new Map(provincias.map((p) => [p.id, p.electores]));

    const features = geo.features.map((f) => {
      const id = String(f.properties?.id);
      return {
        ...f,
        properties: {
          ...f.properties,
          ...propsDemarcacion(id, metas.get(id) ?? 0, electoresMap.get(id), stats),
        },
      };
    });

    res.json({ type: "FeatureCollection", features });
  }),
);

// GET /geo/provincias/:provinciaId/municipios — drill-down (RF-13.1)
geoRouter.get(
  "/provincias/:provinciaId/municipios",
  asyncRoute(async (req, res) => {
    const { provinciaId } = req.params;
    const filtros = filtrosSchema.parse(req.query);
    const geo = loadMunicipiosGeo();
    const featuresProv = geo.features.filter((f) => f.properties?.provinciaId === provinciaId);

    const [stats, metas, municipios] = await Promise.all([
      statsPorCampo("municipioId", filtros, { provinciaId }),
      metasActivasPorMunicipio(),
      prisma.municipio.findMany({ where: { provinciaId }, select: { id: true, electores: true } }),
    ]);
    const electoresMap = new Map(municipios.map((m) => [m.id, m.electores]));

    const features = featuresProv.map((f) => {
      const id = String(f.properties?.id);
      return {
        ...f,
        properties: {
          ...f.properties,
          ...propsDemarcacion(id, metas.get(id) ?? 0, electoresMap.get(id), stats),
        },
      };
    });

    res.json({ type: "FeatureCollection", features });
  }),
);

function normalizarDM(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function sinArticulo(s: string): string {
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out.replace(/^(EL|LA|LOS|LAS|DE|DEL)\s+/, "");
  }
  return out;
}

// GET /geo/municipios/:municipioId/distritos-municipales — drill-down de tercer nivel.
// El geojson trae, por municipio, sus distritos municipales reales MÁS un
// polígono "cabecera" (esCabecera: true) que cubre el resto del territorio del
// municipio no repartido en ningún distrito — sin él, el mapa dejaría zonas
// sin sombrear (el área urbana/central del municipio) al entrar a este nivel,
// igual que pasaría con el mapa de provincias si faltara alguno de sus
// municipios. La cabecera no tiene fila propia en DistritoMunicipal (sería un
// distrito "de sí mismo"): sus estadísticas son los militantes del municipio
// sin distrito municipal asignado. El resto de features sí se resuelven/crean
// contra la tabla real DistritoMunicipal, igual que el resto del catálogo
// geográfico gestionado desde el back office.
geoRouter.get(
  "/municipios/:municipioId/distritos-municipales",
  asyncRoute(async (req, res) => {
    const { municipioId } = req.params;
    const filtros = filtrosSchema.parse(req.query);
    const geo = loadDistritosMunicipalesGeo();
    const featuresMuni = geo.features.filter((f) => f.properties?.municipioId === municipioId);

    const existentes = await prisma.distritoMunicipal.findMany({ where: { municipioId } });
    const porNombreExacto = new Map(existentes.map((d) => [normalizarDM(d.nombre), d]));
    const porNombreSinArticulo = new Map<string, (typeof existentes)[number]>();
    for (const d of existentes) {
      const key = sinArticulo(normalizarDM(d.nombre));
      if (!porNombreSinArticulo.has(key)) porNombreSinArticulo.set(key, d);
    }

    const resueltos = await Promise.all(
      featuresMuni.map(async (f) => {
        if (f.properties?.esCabecera) return { feature: f, distrito: null };
        const nombre = String(f.properties?.nombre ?? "");
        const exacto = porNombreExacto.get(normalizarDM(nombre));
        const suelto = porNombreSinArticulo.get(sinArticulo(normalizarDM(nombre)));
        let distrito = exacto ?? suelto;
        if (!distrito) {
          distrito = await prisma.distritoMunicipal.create({ data: { municipioId, nombre } });
        }
        return { feature: f, distrito };
      }),
    );

    const [stats, metas] = await Promise.all([
      statsPorCampo("distritoMunicipalId", filtros, { municipioId }),
      metasActivasPorDistritoMunicipal(),
    ]);

    const features = resueltos.map(({ feature, distrito }) => {
      if (!distrito) {
        // cabecera: militantes del municipio sin distrito municipal asignado
        return {
          ...feature,
          properties: {
            ...feature.properties,
            id: null,
            ...propsDemarcacion(null, 0, null, stats),
          },
        };
      }
      return {
        ...feature,
        properties: {
          ...feature.properties,
          id: distrito.id,
          nombre: distrito.nombre,
          ...propsDemarcacion(distrito.id, metas.get(distrito.id) ?? 0, distrito.electores, stats),
        },
      };
    });

    res.json({ type: "FeatureCollection", features });
  }),
);

// GET /geo/militantes-puntos — coordenadas de militantes con GPS registrado,
// para la capa opcional de puntos del mapa (concentración geográfica real).
geoRouter.get(
  "/militantes-puntos",
  asyncRoute(async (req, res) => {
    const alcance = z
      .object({
        provinciaId: z.string().optional(),
        municipioId: z.string().optional(),
        distritoMunicipalId: z.string().optional(),
        sinDistritoMunicipal: z.enum(["true"]).optional(),
      })
      .parse(req.query);
    const filtros = filtrosSchema.parse(req.query);
    const rango = rangoDeFiltros(filtros);

    const puntos = await prisma.militante.findMany({
      where: {
        lat: { not: null },
        lng: { not: null },
        ...(alcance.provinciaId ? { provinciaId: alcance.provinciaId } : {}),
        ...(alcance.municipioId ? { municipioId: alcance.municipioId } : {}),
        ...(alcance.distritoMunicipalId ? { distritoMunicipalId: alcance.distritoMunicipalId } : {}),
        ...(alcance.sinDistritoMunicipal === "true" ? { distritoMunicipalId: null } : {}),
        ...whereFiltros(filtros),
        ...(rango ? { createdAt: { gte: rango.inicio, lte: rango.fin } } : {}),
      },
      select: { lat: true, lng: true },
      take: 5000,
    });
    res.json(puntos);
  }),
);

// GET /geo/provincias/:provinciaId — resumen para el panel fijo (RF-13.3)
geoRouter.get(
  "/provincias/:provinciaId",
  asyncRoute(async (req, res) => {
    const { provinciaId } = req.params;
    const provincia = await prisma.provincia.findUniqueOrThrow({ where: { id: provinciaId } });
    const [captados, metas] = await Promise.all([
      prisma.militante.count({ where: { provinciaId } }),
      metasActivasPorProvincia(),
    ]);
    const meta = metas.get(provinciaId) ?? 0;
    res.json({
      id: provincia.id,
      nombre: provincia.nombre,
      codigo: provincia.codigo,
      militantesCaptados: captados,
      meta,
      porcentaje: calcularPorcentaje(captados, meta),
      estado: calcularEstadoAvance(captados, meta),
    });
  }),
);

// Resúmenes equivalentes para municipio y distrito municipal — los usa el
// buscador del mapa para llenar el panel al saltar directo a una demarcación.
geoRouter.get(
  "/resumen/municipio/:municipioId",
  asyncRoute(async (req, res) => {
    const { municipioId } = req.params;
    const municipio = await prisma.municipio.findUniqueOrThrow({ where: { id: municipioId } });
    const [captados, metas] = await Promise.all([
      prisma.militante.count({ where: { municipioId } }),
      metasActivasPorMunicipio(),
    ]);
    const meta = metas.get(municipioId) ?? 0;
    res.json({
      id: municipio.id,
      nombre: municipio.nombre,
      militantesCaptados: captados,
      meta,
      porcentaje: calcularPorcentaje(captados, meta),
      estado: calcularEstadoAvance(captados, meta),
    });
  }),
);

geoRouter.get(
  "/resumen/distrito-municipal/:distritoId",
  asyncRoute(async (req, res) => {
    const { distritoId } = req.params;
    const distrito = await prisma.distritoMunicipal.findUniqueOrThrow({ where: { id: distritoId } });
    const [captados, metas] = await Promise.all([
      prisma.militante.count({ where: { distritoMunicipalId: distritoId } }),
      metasActivasPorDistritoMunicipal(),
    ]);
    const meta = metas.get(distritoId) ?? 0;
    res.json({
      id: distrito.id,
      nombre: distrito.nombre,
      municipioId: distrito.municipioId,
      militantesCaptados: captados,
      meta,
      porcentaje: calcularPorcentaje(captados, meta),
      estado: calcularEstadoAvance(captados, meta),
    });
  }),
);
