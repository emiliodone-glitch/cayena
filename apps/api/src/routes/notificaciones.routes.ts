import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { enviarPushATodos } from "../lib/push";

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

const convocatoriaSchema = z.object({ titulo: z.string().min(3), cuerpo: z.string().min(3) });

// Convocatorias/anuncios manuales: a diferencia de OBRA/ACTIVIDAD (que se
// disparan automáticamente al publicar), este es el único tipo de push que un
// admin envía a mano — para avisos que no corresponden a ningún otro módulo.
notificacionesRouter.post(
  "/",
  requireAuth,
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (req, res) => {
    const { titulo, cuerpo } = convocatoriaSchema.parse(req.body);
    await enviarPushATodos(titulo, cuerpo, "CONVOCATORIA");
    const notificacion = await prisma.notificacion.findFirstOrThrow({
      where: { titulo, cuerpo, tipo: "CONVOCATORIA" },
      orderBy: { enviadaAt: "desc" },
    });
    res.status(201).json(notificacion);
  }),
);
