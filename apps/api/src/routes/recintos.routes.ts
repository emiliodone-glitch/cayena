import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";

export const recintosRouter = Router();
recintosRouter.use(requireAuth);

// Mesa / recinto electoral, vinculado a una localidad específica. Igual que
// la localidad, se gestiona como catálogo que crece desde el formulario de
// registro de militantes en vez de un dataset oficial pre-cargado.
recintosRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { localidadId } = req.query as { localidadId?: string };
    if (!localidadId) throw new HttpError(400, "Debe indicar localidadId");
    const recintos = await prisma.recintoElectoral.findMany({
      where: { localidadId },
      orderBy: { nombre: "asc" },
    });
    res.json(recintos);
  }),
);

const recintoSchema = z.object({
  nombre: z.string().min(2),
  localidadId: z.string().min(1),
});

recintosRouter.post(
  "/",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const data = recintoSchema.parse(req.body);
    const localidad = await prisma.localidad.findUnique({ where: { id: data.localidadId } });
    if (!localidad) throw new HttpError(404, "Localidad no encontrada");
    const existente = await prisma.recintoElectoral.findFirst({
      where: { localidadId: data.localidadId, nombre: { equals: data.nombre, mode: "insensitive" } },
    });
    if (existente) throw new HttpError(409, "Ya existe un recinto electoral con ese nombre en esta localidad");
    const recinto = await prisma.recintoElectoral.create({ data });
    res.status(201).json(recinto);
  }),
);

recintosRouter.patch(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = recintoSchema.pick({ nombre: true }).parse(req.body);
    const recinto = await prisma.recintoElectoral.update({ where: { id: req.params.id }, data });
    res.json(recinto);
  }),
);

recintosRouter.delete(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const enUso = await prisma.militante.count({ where: { recintoElectoralId: req.params.id } });
    if (enUso > 0) {
      throw new HttpError(409, `No se puede eliminar: ${enUso} militante(s) están asignados a este recinto`);
    }
    await prisma.recintoElectoral.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);
