import { Router } from "express";
import { z } from "zod";
import { prisma, Prisma, loadProvinciasGeo, loadMunicipiosGeo, loadDistritosMunicipalesGeo } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje } from "@cayena/shared";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import {
  requireAuth,
  resolverAlcance,
  puedeVerProvincia,
  puedeVerMunicipio,
  puedeVerDistrito,
  whereMilitanteAlcance,
} from "../middleware/auth";
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

// El registro público de militantes (RF-26, sin sesión) necesita las listas
// de arriba para sus selects — el resto de endpoints de este router sí
// requieren sesión, porque de acá en adelante se filtra por el territorio
// asignado al usuario (ver middleware/auth.ts).
geoRouter.use(requireAuth);

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
    const alcanceUsuario = await resolverAlcance(req.user!);
    const geo = loadProvinciasGeo();
    const [stats, metas, provincias] = await Promise.all([
      statsPorCampo("provinciaId", filtros),
      metasActivasPorProvincia(),
      prisma.provincia.findMany({ select: { id: true, electores: true } }),
    ]);
    const electoresMap = new Map(provincias.map((p) => [p.id, p.electores]));

    // Un coordinador con territorio asignado solo ve su propia provincia en
    // el mapa nacional (o ninguna, si su territorio queda por debajo de ese
    // nivel — igual puede entrar directo a su municipio/distrito).
    const features = geo.features
      .filter((f) => puedeVerProvincia(alcanceUsuario, String(f.properties?.id)))
      .map((f) => {
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
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeVerProvincia(alcanceUsuario, provinciaId)) {
      throw new HttpError(403, "No tienes acceso a esta provincia");
    }
    const geo = loadMunicipiosGeo();
    let featuresProv = geo.features.filter((f) => f.properties?.provinciaId === provinciaId);
    // Coordinador con territorio a nivel municipio/distrito: dentro de su
    // propia provincia solo ve su propio municipio, no los vecinos.
    if (alcanceUsuario && alcanceUsuario.nivel !== "provincia") {
      featuresProv = featuresProv.filter((f) => f.properties?.id === alcanceUsuario.municipioId);
    }

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
    const alcanceUsuario = await resolverAlcance(req.user!);
    const municipioBase = await prisma.municipio.findUniqueOrThrow({
      where: { id: municipioId },
      select: { provinciaId: true, electores: true },
    });
    if (!puedeVerMunicipio(alcanceUsuario, municipioId, municipioBase.provinciaId)) {
      throw new HttpError(403, "No tienes acceso a este municipio");
    }
    const geo = loadDistritosMunicipalesGeo();
    const featuresMuni = geo.features.filter((f) => f.properties?.municipioId === municipioId);

    const existentes = await prisma.distritoMunicipal.findMany({ where: { municipioId } });
    const porNombreExacto = new Map(existentes.map((d) => [normalizarDM(d.nombre), d]));
    const porNombreSinArticulo = new Map<string, (typeof existentes)[number]>();
    for (const d of existentes) {
      const key = sinArticulo(normalizarDM(d.nombre));
      if (!porNombreSinArticulo.has(key)) porNombreSinArticulo.set(key, d);
    }

    let resueltos = await Promise.all(
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
    // Coordinador con territorio a nivel distrito: dentro de su propio
    // municipio solo ve su propio distrito (nunca la cabecera, que no tiene
    // fila propia en DistritoMunicipal — el filtro solo pasa la coincidencia
    // exacta por id real).
    if (alcanceUsuario?.nivel === "distrito") {
      resueltos = resueltos.filter((r) => r.distrito?.id === alcanceUsuario.distritoMunicipalId);
    }

    const [stats, metas] = await Promise.all([
      statsPorCampo("distritoMunicipalId", filtros, { municipioId }),
      metasActivasPorDistritoMunicipal(),
    ]);

    const features = resueltos.map(({ feature, distrito }) => {
      if (!distrito) {
        // cabecera: militantes del municipio sin distrito municipal asignado.
        // No tiene electorado propio, pero mostrar la comparación en null
        // hacía que, al volver a seleccionar esta zona (que en el mapa se ve
        // y se llama igual que el municipio), la comparación de electores
        // JCE pareciera desaparecer — se usa el total del municipio para el
        // dato de contexto, sin calcular un % de captación con él (esa
        // captación es solo la porción sin distrito, no la del municipio
        // completo, así que un porcentaje ahí sería engañoso).
        return {
          ...feature,
          properties: {
            ...feature.properties,
            id: null,
            ...propsDemarcacion(null, 0, null, stats),
            electores: municipioBase.electores ?? null,
            penetracion: null,
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
    const filtroAlcance = z
      .object({
        provinciaId: z.string().optional(),
        municipioId: z.string().optional(),
        distritoMunicipalId: z.string().optional(),
        sinDistritoMunicipal: z.enum(["true"]).optional(),
      })
      .parse(req.query);
    const filtros = filtrosSchema.parse(req.query);
    const rango = rangoDeFiltros(filtros);
    const alcanceUsuario = await resolverAlcance(req.user!);

    const puntos = await prisma.militante.findMany({
      where: {
        lat: { not: null },
        lng: { not: null },
        ...(filtroAlcance.provinciaId ? { provinciaId: filtroAlcance.provinciaId } : {}),
        ...(filtroAlcance.municipioId ? { municipioId: filtroAlcance.municipioId } : {}),
        ...(filtroAlcance.distritoMunicipalId ? { distritoMunicipalId: filtroAlcance.distritoMunicipalId } : {}),
        ...(filtroAlcance.sinDistritoMunicipal === "true" ? { distritoMunicipalId: null } : {}),
        ...whereFiltros(filtros),
        ...(rango ? { createdAt: { gte: rango.inicio, lte: rango.fin } } : {}),
        // Se aplica al final para que un coordinador con territorio asignado
        // no pueda ver puntos fuera de su alcance aunque pase otros ids por
        // query string — siempre gana la restricción real del usuario.
        ...whereMilitanteAlcance(alcanceUsuario),
      },
      select: { lat: true, lng: true },
      take: 5000,
    });
    res.json(puntos);
  }),
);

// GET /geo/serie-diaria — captación día por día de una demarcación (últimos
// N días, 14 por defecto), para la mini-tendencia del panel del mapa.
geoRouter.get(
  "/serie-diaria",
  asyncRoute(async (req, res) => {
    const filtroAlcance = z
      .object({
        provinciaId: z.string().optional(),
        municipioId: z.string().optional(),
        distritoMunicipalId: z.string().optional(),
        sinDistritoMunicipal: z.enum(["true"]).optional(),
        dias: z.coerce.number().int().min(3).max(60).optional(),
      })
      .parse(req.query);
    const alcanceUsuario = await resolverAlcance(req.user!);
    const dias = filtroAlcance.dias ?? 14;
    const fin = new Date();
    fin.setHours(23, 59, 59, 999);
    const inicio = new Date(fin);
    inicio.setDate(inicio.getDate() - (dias - 1));
    inicio.setHours(0, 0, 0, 0);

    const condiciones = [Prisma.sql`"createdAt" >= ${inicio}`, Prisma.sql`"createdAt" <= ${fin}`];
    if (filtroAlcance.provinciaId) condiciones.push(Prisma.sql`"provinciaId" = ${filtroAlcance.provinciaId}`);
    if (filtroAlcance.municipioId) condiciones.push(Prisma.sql`"municipioId" = ${filtroAlcance.municipioId}`);
    if (filtroAlcance.distritoMunicipalId) {
      condiciones.push(Prisma.sql`"distritoMunicipalId" = ${filtroAlcance.distritoMunicipalId}`);
    }
    if (filtroAlcance.sinDistritoMunicipal === "true") {
      condiciones.push(Prisma.sql`"distritoMunicipalId" IS NULL`);
    }
    // Restricción real del usuario, siempre — ver comentario equivalente en
    // /militantes-puntos.
    if (alcanceUsuario?.nivel === "distrito") {
      condiciones.push(Prisma.sql`"distritoMunicipalId" = ${alcanceUsuario.distritoMunicipalId}`);
    } else if (alcanceUsuario?.nivel === "municipio") {
      condiciones.push(Prisma.sql`"municipioId" = ${alcanceUsuario.municipioId}`);
    } else if (alcanceUsuario?.nivel === "provincia") {
      condiciones.push(Prisma.sql`"provinciaId" = ${alcanceUsuario.provinciaId}`);
    }
    const where = Prisma.join(condiciones, " AND ");

    const filas = await prisma.$queryRaw<{ dia: Date; total: bigint }[]>`
      SELECT date_trunc('day', "createdAt") as dia, COUNT(*) as total
      FROM "Militante"
      WHERE ${where}
      GROUP BY dia
      ORDER BY dia ASC
    `;
    const porDia = new Map(filas.map((f) => [f.dia.toISOString().slice(0, 10), Number(f.total)]));

    const serie: { fecha: string; total: number }[] = [];
    const cursor = new Date(inicio);
    for (let i = 0; i < dias; i++) {
      const clave = cursor.toISOString().slice(0, 10);
      serie.push({ fecha: clave, total: porDia.get(clave) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    res.json(serie);
  }),
);

// Cálculo de electores/penetración compartido con propsDemarcacion, para que
// el panel muestre el mismo dato tanto si la demarcación se selecciona en el
// mapa (listas /geo/provincias, /geo/provincias/:id/municipios, etc., que sí
// pasaban por propsDemarcacion) como si se llega por el buscador o al volver
// de un nivel más profundo (estos resúmenes puntuales, que antes se armaban
// a mano sin electores/penetracion y por eso la comparación desaparecía).
function electoresYPenetracion(captados: number, electores: number | null | undefined) {
  return {
    electores: electores ?? null,
    penetracion: electores && electores > 0 ? Math.round((captados / electores) * 1000) / 10 : null,
  };
}

// GET /geo/provincias/:provinciaId — resumen para el panel fijo (RF-13.3)
geoRouter.get(
  "/provincias/:provinciaId",
  asyncRoute(async (req, res) => {
    const { provinciaId } = req.params;
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeVerProvincia(alcanceUsuario, provinciaId)) {
      throw new HttpError(403, "No tienes acceso a esta provincia");
    }
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
      ...electoresYPenetracion(captados, provincia.electores),
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
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeVerMunicipio(alcanceUsuario, municipioId, municipio.provinciaId)) {
      throw new HttpError(403, "No tienes acceso a este municipio");
    }
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
      ...electoresYPenetracion(captados, municipio.electores),
    });
  }),
);

geoRouter.get(
  "/resumen/distrito-municipal/:distritoId",
  asyncRoute(async (req, res) => {
    const { distritoId } = req.params;
    const distrito = await prisma.distritoMunicipal.findUniqueOrThrow({
      where: { id: distritoId },
      include: { municipio: { select: { provinciaId: true } } },
    });
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeVerDistrito(alcanceUsuario, distrito.id, distrito.municipioId, distrito.municipio.provinciaId)) {
      throw new HttpError(403, "No tienes acceso a este distrito municipal");
    }
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
      ...electoresYPenetracion(captados, distrito.electores),
    });
  }),
);
