import { Router } from "express";
import { z } from "zod";
import { TipoMovimiento, prisma } from "@cayena/database";
import {
  requireAuth,
  requireRole,
  requireModulo,
  resolverAlcanceSecretaria,
  puedeGestionarSecretaria,
} from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";

export const gastosRouter = Router();
gastosRouter.use(requireAuth);
gastosRouter.use(requireModulo("gastos"));

const querySchema = z.object({
  secretariaId: z.string().optional(),
  categoria: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

// RF-17: reportes de gastos por período, secretaría o categoría
gastosRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { secretariaId, categoria, desde, hasta } = querySchema.parse(req.query);
    const fechaFilter: Record<string, Date> = {};
    if (desde) fechaFilter.gte = new Date(desde);
    if (hasta) fechaFilter.lte = new Date(hasta);

    const scopedSecretariaId = resolverAlcanceSecretaria(req.user!) ?? secretariaId;

    const gastos = await prisma.gasto.findMany({
      where: {
        ...(scopedSecretariaId ? { secretariaId: scopedSecretariaId } : {}),
        ...(categoria ? { categoria } : {}),
        ...(Object.keys(fechaFilter).length ? { fecha: fechaFilter } : {}),
      },
      include: { secretaria: { select: { nombre: true } } },
      orderBy: { fecha: "desc" },
    });

    const totales = gastos.reduce(
      (acc, g) => {
        const monto = Number(g.monto);
        if (g.tipo === "INGRESO") acc.ingresos += monto;
        else acc.gastos += monto;
        return acc;
      },
      { ingresos: 0, gastos: 0 },
    );

    res.json({ gastos, totales });
  }),
);

const gastoSchema = z.object({
  tipo: z.nativeEnum(TipoMovimiento),
  monto: z.number().positive(),
  categoria: z.string().min(1),
  fecha: z.coerce.date(),
  comprobanteUrl: z.string().optional(),
  secretariaId: z.string().optional(),
});

// RF-16
gastosRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    if (req.user!.role === "AUDITOR") throw new HttpError(403, "Auditor es de solo lectura");
    const data = gastoSchema.parse(req.body);
    if (data.secretariaId && !puedeGestionarSecretaria(req.user!, data.secretariaId)) {
      throw new HttpError(403, "No autorizado para registrar en esta secretaría");
    }
    const gasto = await prisma.gasto.create({
      data: { ...data, registradoPorId: req.user!.id },
    });
    res.status(201).json(gasto);
  }),
);

gastosRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    if (req.user!.role === "AUDITOR") throw new HttpError(403, "Auditor es de solo lectura");
    const data = gastoSchema.partial().parse(req.body);
    const gasto = await prisma.gasto.findUniqueOrThrow({ where: { id: req.params.id } });
    if (gasto.secretariaId && !puedeGestionarSecretaria(req.user!, gasto.secretariaId)) {
      throw new HttpError(403, "No autorizado para editar este movimiento");
    }
    const actualizado = await prisma.gasto.update({ where: { id: req.params.id }, data });
    res.json(actualizado);
  }),
);

gastosRouter.delete(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    await prisma.gasto.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);
