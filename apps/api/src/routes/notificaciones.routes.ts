import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { enviarPushATodos } from "../lib/push";
import { verifyAccessToken } from "../lib/jwt";

export const notificacionesRouter = Router();

const tokenSchema = z.object({ token: z.string().min(10), plataforma: z.string().default("expo") });

// Registro de dispositivo desde la app (sin auth obligatoria: cualquier
// usuario de la app, haya iniciado sesión o no, debe poder recibir
// notificaciones). Si SÍ mandó un token de sesión válido (Authorization),
// el dispositivo queda ligado a ese usuario — así una alerta de
// estancamiento dirigida a un responsable de territorio le puede llegar
// como push, no solo como registro en la campanita del back office.
notificacionesRouter.post(
  "/device-token",
  asyncRoute(async (req, res) => {
    const data = tokenSchema.parse(req.body);
    let userId: string | undefined;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        userId = verifyAccessToken(header.slice("Bearer ".length)).sub;
      } catch {
        // Token vencido/ausente: se registra igual, solo que sin dueño.
      }
    }
    await prisma.deviceToken.upsert({
      where: { token: data.token },
      update: { userId },
      create: { ...data, userId },
    });
    res.status(204).send();
  }),
);

// Historial de notificaciones enviadas (back office). SUPERADMIN ve todo;
// el resto solo ve los broadcasts (destinatarioUserId null, como OBRA,
// ACTIVIDAD, CONVOCATORIA y las alertas sin responsable asignado) más las
// que le llegaron dirigidas específicamente a él (un coordinador con
// territorio asignado ya no ve las alertas de zonas ajenas).
notificacionesRouter.get(
  "/",
  requireAuth,
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR", "DIRIGENCIA"),
  asyncRoute(async (req, res) => {
    const notificaciones = await prisma.notificacion.findMany({
      where:
        req.user!.role === "SUPERADMIN"
          ? undefined
          : { OR: [{ destinatarioUserId: null }, { destinatarioUserId: req.user!.id }] },
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
