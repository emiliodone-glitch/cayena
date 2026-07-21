import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";

export const localidadesRouter = Router();
localidadesRouter.use(requireAuth);

// Localidad dentro de un municipio (barrio/paraje/sección). Sin geometría real
// disponible (igual que el distrito municipal), se gestiona como catálogo
// editable que crece desde el propio formulario de registro de militantes.
localidadesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { municipioId } = req.query as { municipioId?: string };
    if (!municipioId) throw new HttpError(400, "Debe indicar municipioId");
    const localidades = await prisma.localidad.findMany({
      where: { municipioId },
      orderBy: { nombre: "asc" },
    });
    res.json(localidades);
  }),
);

const localidadSchema = z.object({
  nombre: z.string().min(2),
  municipioId: z.string().min(1),
});

// Cualquier rol que pueda registrar militantes puede agregar una localidad
// nueva sobre la marcha (igual que un promotor descubre un barrio no listado).
localidadesRouter.post(
  "/",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const data = localidadSchema.parse(req.body);
    const municipio = await prisma.municipio.findUnique({ where: { id: data.municipioId } });
    if (!municipio) throw new HttpError(404, "Municipio no encontrado");
    const existente = await prisma.localidad.findFirst({
      where: { municipioId: data.municipioId, nombre: { equals: data.nombre, mode: "insensitive" } },
    });
    if (existente) throw new HttpError(409, "Ya existe una localidad con ese nombre en este municipio");
    const localidad = await prisma.localidad.create({ data });
    res.status(201).json(localidad);
  }),
);

localidadesRouter.patch(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = localidadSchema.pick({ nombre: true }).parse(req.body);
    const localidad = await prisma.localidad.update({ where: { id: req.params.id }, data });
    res.json(localidad);
  }),
);

localidadesRouter.delete(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const enUso = await prisma.militante.count({ where: { localidadId: req.params.id } });
    if (enUso > 0) {
      throw new HttpError(409, `No se puede eliminar: ${enUso} militante(s) están asignados a esta localidad`);
    }
    await prisma.recintoElectoral.deleteMany({ where: { localidadId: req.params.id } });
    await prisma.localidad.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);
