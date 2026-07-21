import { Router } from "express";
import { prisma, loadProvinciasGeo, loadMunicipiosGeo, loadDistritosMunicipalesGeo } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje } from "@cayena/shared";
import { asyncRoute } from "../middleware/errorHandler";

export const geoRouter = Router();

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
  asyncRoute(async (_req, res) => {
    const geo = loadProvinciasGeo();
    const [conteos, metas] = await Promise.all([
      prisma.militante.groupBy({ by: ["provinciaId"], _count: { _all: true } }),
      metasActivasPorProvincia(),
    ]);
    const conteoMap = new Map(conteos.map((c) => [c.provinciaId, c._count._all]));

    const features = geo.features.map((f) => {
      const id = String(f.properties?.id);
      const captados = conteoMap.get(id) ?? 0;
      const meta = metas.get(id) ?? 0;
      return {
        ...f,
        properties: {
          ...f.properties,
          militantesCaptados: captados,
          meta,
          porcentaje: calcularPorcentaje(captados, meta),
          estado: calcularEstadoAvance(captados, meta),
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
    const geo = loadMunicipiosGeo();
    const featuresProv = geo.features.filter((f) => f.properties?.provinciaId === provinciaId);
    const municipioIds = featuresProv.map((f) => String(f.properties?.id));

    const [conteos, metas] = await Promise.all([
      prisma.militante.groupBy({
        by: ["municipioId"],
        where: { municipioId: { in: municipioIds } },
        _count: { _all: true },
      }),
      metasActivasPorMunicipio(),
    ]);
    const conteoMap = new Map(conteos.map((c) => [c.municipioId, c._count._all]));

    const features = featuresProv.map((f) => {
      const id = String(f.properties?.id);
      const captados = conteoMap.get(id) ?? 0;
      const meta = metas.get(id) ?? 0;
      return {
        ...f,
        properties: {
          ...f.properties,
          militantesCaptados: captados,
          meta,
          porcentaje: calcularPorcentaje(captados, meta),
          estado: calcularEstadoAvance(captados, meta),
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
// El geojson solo trae nombre + geometría (sin id de base de datos: sería un cuid
// fijo de un entorno específico y no tendría sentido en otro). Cada feature se
// resuelve/crea aquí contra la tabla real DistritoMunicipal, igual que el resto
// del catálogo geográfico gestionado desde el back office.
geoRouter.get(
  "/municipios/:municipioId/distritos-municipales",
  asyncRoute(async (req, res) => {
    const { municipioId } = req.params;
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

    const distritoIds = resueltos.map((r) => r.distrito.id);
    const [conteos, metas] = await Promise.all([
      prisma.militante.groupBy({
        by: ["distritoMunicipalId"],
        where: { distritoMunicipalId: { in: distritoIds } },
        _count: { _all: true },
      }),
      metasActivasPorDistritoMunicipal(),
    ]);
    const conteoMap = new Map(conteos.map((c) => [c.distritoMunicipalId, c._count._all]));

    const features = resueltos.map(({ feature, distrito }) => {
      const captados = conteoMap.get(distrito.id) ?? 0;
      const meta = metas.get(distrito.id) ?? 0;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          id: distrito.id,
          nombre: distrito.nombre,
          militantesCaptados: captados,
          meta,
          porcentaje: calcularPorcentaje(captados, meta),
          estado: calcularEstadoAvance(captados, meta),
        },
      };
    });

    res.json({ type: "FeatureCollection", features });
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
