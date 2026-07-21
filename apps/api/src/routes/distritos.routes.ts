import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje } from "@cayena/shared";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";

export const distritosRouter = Router();
distritosRouter.use(requireAuth);

// RF-13.4: no existe geometría real disponible para distritos municipales en
// las fuentes GeoJSON usadas (geoBoundaries no publica ADM3 para RD), así que
// se listan como tabla con el mismo semáforo rojo/amarillo/verde que el mapa.
distritosRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { municipioId } = req.query as { municipioId?: string };
    if (!municipioId) throw new HttpError(400, "Debe indicar municipioId");

    const [distritos, conteos, metas] = await Promise.all([
      prisma.distritoMunicipal.findMany({ where: { municipioId }, orderBy: { nombre: "asc" } }),
      prisma.militante.groupBy({ by: ["distritoMunicipalId"], where: { municipioId }, _count: { _all: true } }),
      prisma.metaMilitantes.findMany({
        where: { distritoMunicipalId: { not: null } },
        orderBy: { vigenciaDesde: "desc" },
      }),
    ]);
    const conteoMap = new Map(conteos.map((c) => [c.distritoMunicipalId, c._count._all]));
    const metaMap = new Map<string, number>();
    for (const m of metas) {
      if (m.distritoMunicipalId && !metaMap.has(m.distritoMunicipalId)) metaMap.set(m.distritoMunicipalId, m.meta);
    }

    res.json(
      distritos.map((d) => {
        const captados = conteoMap.get(d.id) ?? 0;
        const meta = metaMap.get(d.id) ?? 0;
        return {
          id: d.id,
          nombre: d.nombre,
          municipioId: d.municipioId,
          militantesCaptados: captados,
          meta,
          porcentaje: calcularPorcentaje(captados, meta),
          estado: calcularEstadoAvance(captados, meta),
        };
      }),
    );
  }),
);

const distritoSchema = z.object({
  nombre: z.string().min(2),
  municipioId: z.string().min(1),
});

distritosRouter.post(
  "/",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = distritoSchema.parse(req.body);
    const municipio = await prisma.municipio.findUnique({ where: { id: data.municipioId } });
    if (!municipio) throw new HttpError(404, "Municipio no encontrado");
    const existente = await prisma.distritoMunicipal.findFirst({
      where: { municipioId: data.municipioId, nombre: { equals: data.nombre, mode: "insensitive" } },
    });
    if (existente) throw new HttpError(409, "Ya existe un distrito municipal con ese nombre en este municipio");
    const distrito = await prisma.distritoMunicipal.create({ data });
    res.status(201).json(distrito);
  }),
);

distritosRouter.patch(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = distritoSchema.pick({ nombre: true }).parse(req.body);
    const distrito = await prisma.distritoMunicipal.update({ where: { id: req.params.id }, data });
    res.json(distrito);
  }),
);

distritosRouter.delete(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const enUso = await prisma.militante.count({ where: { distritoMunicipalId: req.params.id } });
    if (enUso > 0) {
      throw new HttpError(409, `No se puede eliminar: ${enUso} militante(s) están asignados a este distrito`);
    }
    await prisma.metaMilitantes.deleteMany({ where: { distritoMunicipalId: req.params.id } });
    await prisma.distritoMunicipal.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);
