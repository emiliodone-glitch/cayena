import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const notificacionesRouter = Router();

const tokenSchema = z.object({ token: z.string().min(10), plataforma: z.string().default("expo") });

// Registro de dispositivo desde la app (sin auth: cualquier usuario de la app,
// haya iniciado sesión o no, debe poder recibir notificaciones).
notificacionesRouter.post(
  "/device-token",
  asyncRoute(async (req, res) => {
    const data = tokenSchema.parse(req.body);
    await prisma.deviceToken.upsert({
      where: { token: data.token },
      update: {},
      create: data,
    });
    res.status(204).send();
  }),
);

// Historial de notificaciones enviadas (back office).
notificacionesRouter.get(
  "/",
  requireAuth,
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (_req, res) => {
    const notificaciones = await prisma.notificacion.findMany({
      orderBy: { enviadaAt: "desc" },
      take: 100,
    });
    res.json(notificaciones);
  }),
);
