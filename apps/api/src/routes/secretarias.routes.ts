import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";

export const secretariasRouter = Router();
secretariasRouter.use(requireAuth);

// RF-01
secretariasRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const secretarias = await prisma.secretaria.findMany({ orderBy: { nombre: "asc" } });
    res.json(secretarias);
  }),
);

const secretariaSchema = z.object({
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
});

secretariasRouter.post(
  "/",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = secretariaSchema.parse(req.body);
    const secretaria = await prisma.secretaria.create({ data });
    res.status(201).json(secretaria);
  }),
);

secretariasRouter.patch(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = secretariaSchema.partial().parse(req.body);
    const secretaria = await prisma.secretaria.update({ where: { id: req.params.id }, data });
    res.json(secretaria);
  }),
);

secretariasRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const secretaria = await prisma.secretaria.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(secretaria);
  }),
);

// RF-03: historial filtrable por fecha
secretariasRouter.get(
  "/:id/historial",
  asyncRoute(async (req, res) => {
    if (!req.user) throw new HttpError(401, "No autenticado");
    if (req.user.role !== "SUPERADMIN" && req.user.role !== "AUDITOR" && req.user.secretariaId !== req.params.id) {
      throw new HttpError(403, "No autorizado para ver esta secretaría");
    }
    const { desde, hasta } = req.query as { desde?: string; hasta?: string };
    const fechaFilter: Record<string, Date> = {};
    if (desde) fechaFilter.gte = new Date(desde);
    if (hasta) fechaFilter.lte = new Date(hasta);

    const [actividades, documentos] = await Promise.all([
      prisma.actividad.findMany({
        where: {
          secretariaId: req.params.id,
          ...(Object.keys(fechaFilter).length ? { fecha: fechaFilter } : {}),
        },
        orderBy: { fecha: "desc" },
      }),
      prisma.documentoSecretaria.findMany({
        where: { secretariaId: req.params.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({ actividades, documentos });
  }),
);

// RF-02: documentos internos
const documentoSchema = z.object({ titulo: z.string().min(1), url: z.string().min(1) });

secretariasRouter.post(
  "/:id/documentos",
  asyncRoute(async (req, res) => {
    if (!req.user) throw new HttpError(401, "No autenticado");
    if (req.user.role !== "SUPERADMIN" && req.user.secretariaId !== req.params.id) {
      throw new HttpError(403, "No autorizado para esta secretaría");
    }
    const data = documentoSchema.parse(req.body);
    const doc = await prisma.documentoSecretaria.create({
      data: { ...data, secretariaId: req.params.id, subidoPorId: req.user.id },
    });
    res.status(201).json(doc);
  }),
);
