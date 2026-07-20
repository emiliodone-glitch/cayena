import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";

export const poaRouter = Router();
poaRouter.use(requireAuth);

// RF-18 + RF-20: metas del POA con su avance para graficar (barra/dona)
poaRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { secretariaId } = req.query as { secretariaId?: string };
    const scopedSecretariaId =
      req.user!.role === "JEFE_SECRETARIA" ? req.user!.secretariaId ?? undefined : secretariaId;

    const metas = await prisma.metaPOA.findMany({
      where: scopedSecretariaId ? { secretariaId: scopedSecretariaId } : {},
      include: { avances: { orderBy: { fecha: "asc" } }, secretaria: { select: { nombre: true } } },
      orderBy: { fechaLimite: "asc" },
    });

    const conAvance = metas.map((m) => {
      const totalAvance = m.avances.reduce((sum, a) => sum + a.valor, 0);
      const porcentaje =
        m.indicadorObjetivo > 0 ? Math.round((totalAvance / m.indicadorObjetivo) * 1000) / 10 : 0;
      return { ...m, totalAvance, porcentaje };
    });

    res.json(conAvance);
  }),
);

const metaPoaSchema = z.object({
  secretariaId: z.string(),
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  indicadorObjetivo: z.number().positive(),
  fechaLimite: z.coerce.date(),
});

poaRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    if (req.user!.role === "AUDITOR") throw new HttpError(403, "Auditor es de solo lectura");
    const data = metaPoaSchema.parse(req.body);
    if (req.user!.role === "JEFE_SECRETARIA" && data.secretariaId !== req.user!.secretariaId) {
      throw new HttpError(403, "No autorizado para esta secretaría");
    }
    const meta = await prisma.metaPOA.create({ data });
    res.status(201).json(meta);
  }),
);

const avanceSchema = z.object({ valor: z.number(), nota: z.string().optional() });

// RF-19: registrar avances periódicos
poaRouter.post(
  "/:id/avances",
  asyncRoute(async (req, res) => {
    if (req.user!.role === "AUDITOR") throw new HttpError(403, "Auditor es de solo lectura");
    const data = avanceSchema.parse(req.body);
    const metaPoa = await prisma.metaPOA.findUniqueOrThrow({ where: { id: req.params.id } });
    if (req.user!.role === "JEFE_SECRETARIA" && metaPoa.secretariaId !== req.user!.secretariaId) {
      throw new HttpError(403, "No autorizado para esta secretaría");
    }
    const avance = await prisma.avancePOA.create({
      data: { ...data, metaPoaId: req.params.id, registradoPorId: req.user!.id },
    });
    res.status(201).json(avance);
  }),
);
