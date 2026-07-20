import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { enviarPushATodos } from "../lib/push";

export const actividadesRouter = Router();

// RF-25: feed público de actividades publicadas — sin auth, usado por la app móvil.
actividadesRouter.get(
  "/publicas",
  asyncRoute(async (req, res) => {
    const actividades = await prisma.actividad.findMany({
      where: { publicadaApp: true },
      include: { secretaria: { select: { nombre: true } } },
      orderBy: { fecha: "desc" },
      take: 100,
    });
    res.json(actividades);
  }),
);

actividadesRouter.use(requireAuth);

const querySchema = z.object({
  secretariaId: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

// RF-04, RF-05: listar en formato lista/calendario (el cliente decide la vista)
actividadesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { secretariaId, desde, hasta } = querySchema.parse(req.query);
    const fechaFilter: Record<string, Date> = {};
    if (desde) fechaFilter.gte = new Date(desde);
    if (hasta) fechaFilter.lte = new Date(hasta);

    const scopedSecretariaId =
      req.user!.role === "JEFE_SECRETARIA" || req.user!.role === "PROMOTOR"
        ? req.user!.secretariaId ?? undefined
        : secretariaId;

    const actividades = await prisma.actividad.findMany({
      where: {
        ...(scopedSecretariaId ? { secretariaId: scopedSecretariaId } : {}),
        ...(Object.keys(fechaFilter).length ? { fecha: fechaFilter } : {}),
      },
      include: { secretaria: { select: { nombre: true } } },
      orderBy: { fecha: "desc" },
    });
    res.json(actividades);
  }),
);

const actividadSchema = z.object({
  titulo: z.string().min(2),
  descripcion: z.string().optional(),
  fecha: z.coerce.date(),
  ubicacion: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  fotos: z.array(z.string()).default([]),
  secretariaId: z.string(),
  publicadaApp: z.boolean().default(false),
});

// RF-04
actividadesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = actividadSchema.parse(req.body);
    if (
      req.user!.role !== "SUPERADMIN" &&
      req.user!.role !== "AUDITOR" &&
      req.user!.secretariaId !== data.secretariaId
    ) {
      throw new HttpError(403, "No autorizado para registrar en esta secretaría");
    }
    if (req.user!.role === "AUDITOR") throw new HttpError(403, "Auditor es de solo lectura");

    const actividad = await prisma.actividad.create({
      data: { ...data, creadoPorId: req.user!.id },
    });
    if (actividad.publicadaApp) {
      enviarPushATodos("Nueva actividad", actividad.titulo, "ACTIVIDAD").catch(() => {});
    }
    res.status(201).json(actividad);
  }),
);

// RF-06: marcar como publicada en la app
actividadesRouter.patch(
  "/:id/publicar",
  asyncRoute(async (req, res) => {
    const { publicadaApp } = z.object({ publicadaApp: z.boolean() }).parse(req.body);
    const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: req.params.id } });
    if (
      req.user!.role !== "SUPERADMIN" &&
      req.user!.secretariaId !== actividad.secretariaId
    ) {
      throw new HttpError(403, "No autorizado");
    }
    const updated = await prisma.actividad.update({
      where: { id: req.params.id },
      data: { publicadaApp },
    });
    if (!actividad.publicadaApp && publicadaApp) {
      enviarPushATodos("Nueva actividad", updated.titulo, "ACTIVIDAD").catch(() => {});
    }
    res.json(updated);
  }),
);

actividadesRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const data = actividadSchema.partial().parse(req.body);
    const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: req.params.id } });
    if (req.user!.role !== "SUPERADMIN" && req.user!.secretariaId !== actividad.secretariaId) {
      throw new HttpError(403, "No autorizado");
    }
    const updated = await prisma.actividad.update({ where: { id: req.params.id }, data });
    res.json(updated);
  }),
);
