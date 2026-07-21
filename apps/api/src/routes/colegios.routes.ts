import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";

export const colegiosRouter = Router();
colegiosRouter.use(requireAuth);

// Colegio electoral (la mesa exacta impresa en la cédula), dentro de un recinto.
colegiosRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { recintoElectoralId } = req.query as { recintoElectoralId?: string };
    if (!recintoElectoralId) throw new HttpError(400, "Debe indicar recintoElectoralId");
    const colegios = await prisma.colegio.findMany({
      where: { recintoElectoralId },
      orderBy: { numero: "asc" },
    });
    res.json(colegios);
  }),
);

const colegioSchema = z.object({
  numero: z.string().min(1),
  recintoElectoralId: z.string().min(1),
});

colegiosRouter.post(
  "/",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const data = colegioSchema.parse(req.body);
    const recinto = await prisma.recintoElectoral.findUnique({ where: { id: data.recintoElectoralId } });
    if (!recinto) throw new HttpError(404, "Recinto electoral no encontrado");
    const existente = await prisma.colegio.findFirst({
      where: { recintoElectoralId: data.recintoElectoralId, numero: { equals: data.numero, mode: "insensitive" } },
    });
    if (existente) throw new HttpError(409, "Ya existe ese número de colegio en este recinto");
    const colegio = await prisma.colegio.create({ data });
    res.status(201).json(colegio);
  }),
);

colegiosRouter.patch(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = colegioSchema.pick({ numero: true }).parse(req.body);
    const colegio = await prisma.colegio.update({ where: { id: req.params.id }, data });
    res.json(colegio);
  }),
);

colegiosRouter.delete(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const enUso = await prisma.militante.count({ where: { colegioId: req.params.id } });
    if (enUso > 0) {
      throw new HttpError(409, `No se puede eliminar: ${enUso} militante(s) están asignados a este colegio`);
    }
    await prisma.colegio.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);
