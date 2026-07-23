import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole, requireModulo, resolverAlcanceSecretaria } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { enviarPushATodos } from "../lib/push";

export const actividadesRouter = Router();

// RF-25: feed público de actividades publicadas — sin auth, usado por la app móvil.
actividadesRouter.get(
  "/publicas",
  asyncRoute(async (req, res) => {
    const actividades = await prisma.actividad.findMany({
      where: { publicadaApp: true },
      include: {
        secretaria: { select: { nombre: true } },
        _count: { select: { asistencias: true } },
      },
      orderBy: { fecha: "desc" },
      take: 100,
    });
    res.json(actividades);
  }),
);

// Detalle público de una actividad (pantalla de detalle en la app móvil) —
// incluye cuántos militantes confirmaron, para que se vea "viva" antes de
// que el usuario confirme la suya.
actividadesRouter.get(
  "/publicas/:id",
  asyncRoute(async (req, res) => {
    const actividad = await prisma.actividad.findFirst({
      where: { id: req.params.id, publicadaApp: true },
      include: { secretaria: { select: { nombre: true } } },
    });
    if (!actividad) throw new HttpError(404, "Actividad no encontrada");
    const confirmados = await prisma.asistenciaActividad.count({
      where: { actividadId: actividad.id, confirmado: true },
    });
    res.json({ ...actividad, confirmados });
  }),
);

const rsvpSchema = z.object({
  militanteId: z.string(),
  confirmado: z.boolean().default(true),
});

// RSVP público (RF nuevo): un militante confirma o cancela su asistencia
// desde la app, identificándose con el id guardado en su carnet (no hay
// cuenta de usuario para el auto-registro público, igual que en /mi-progreso).
actividadesRouter.post(
  "/publicas/:id/rsvp",
  asyncRoute(async (req, res) => {
    const { militanteId, confirmado } = rsvpSchema.parse(req.body);
    const actividad = await prisma.actividad.findFirst({
      where: { id: req.params.id, publicadaApp: true },
    });
    if (!actividad) throw new HttpError(404, "Actividad no encontrada");
    const militante = await prisma.militante.findUnique({ where: { id: militanteId } });
    if (!militante) throw new HttpError(404, "No se encontró tu registro de militante");

    const asistencia = await prisma.asistenciaActividad.upsert({
      where: { actividadId_militanteId: { actividadId: actividad.id, militanteId } },
      update: { confirmado },
      create: { actividadId: actividad.id, militanteId, confirmado },
    });
    res.json(asistencia);
  }),
);

// El militante consulta si ya tiene una confirmación registrada, para que la
// app muestre el estado correcto al abrir el detalle (sin necesitar sesión).
actividadesRouter.get(
  "/publicas/:id/rsvp/:militanteId",
  asyncRoute(async (req, res) => {
    const asistencia = await prisma.asistenciaActividad.findUnique({
      where: { actividadId_militanteId: { actividadId: req.params.id, militanteId: req.params.militanteId } },
    });
    res.json({ confirmado: asistencia?.confirmado ?? null, checkInAt: asistencia?.checkInAt ?? null });
  }),
);

actividadesRouter.use(requireAuth);
actividadesRouter.use(requireModulo("actividades"));

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

    const scopedSecretariaId = resolverAlcanceSecretaria(req.user!) ?? secretariaId;

    const actividades = await prisma.actividad.findMany({
      where: {
        ...(scopedSecretariaId ? { secretariaId: scopedSecretariaId } : {}),
        ...(Object.keys(fechaFilter).length ? { fecha: fechaFilter } : {}),
      },
      include: {
        secretaria: { select: { nombre: true } },
        asistencias: { select: { confirmado: true, checkInAt: true } },
      },
      orderBy: { fecha: "desc" },
    });
    res.json(
      actividades.map(({ asistencias, ...a }) => ({
        ...a,
        confirmados: asistencias.filter((x) => x.confirmado).length,
        checkIns: asistencias.filter((x) => x.checkInAt).length,
      })),
    );
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

// Lista de asistentes (confirmados + check-ins) de una actividad, para el
// drawer "Asistentes" del back office.
actividadesRouter.get(
  "/:id/asistencia",
  asyncRoute(async (req, res) => {
    const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: req.params.id } });
    if (req.user!.role !== "SUPERADMIN" && req.user!.role !== "AUDITOR" && req.user!.secretariaId !== actividad.secretariaId) {
      throw new HttpError(403, "No autorizado");
    }
    const asistencias = await prisma.asistenciaActividad.findMany({
      where: { actividadId: req.params.id },
      include: { militante: { select: { nombre: true, cedula: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(asistencias);
  }),
);

const checkinSchema = z.object({ codigo: z.string().min(3) });

// Check-in con QR: el organizador escanea (o pega a mano) el código del
// carnet del militante — mismo esquema que /militantes/carnet/:id, el QR
// codifica el id interno; también se acepta la cédula como respaldo manual.
actividadesRouter.post(
  "/:id/checkin",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const { codigo } = checkinSchema.parse(req.body);
    const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: req.params.id } });
    if (req.user!.role !== "SUPERADMIN" && req.user!.secretariaId !== actividad.secretariaId) {
      throw new HttpError(403, "No autorizado para registrar asistencia en esta actividad");
    }
    const militante = await prisma.militante.findFirst({
      where: { OR: [{ id: codigo }, { cedula: codigo }] },
    });
    if (!militante) throw new HttpError(404, "Carnet no válido: no existe ningún militante con ese código");

    const asistencia = await prisma.asistenciaActividad.upsert({
      where: { actividadId_militanteId: { actividadId: actividad.id, militanteId: militante.id } },
      update: { confirmado: true, checkInAt: new Date(), checkInPorId: req.user!.id },
      create: {
        actividadId: actividad.id,
        militanteId: militante.id,
        confirmado: true,
        checkInAt: new Date(),
        checkInPorId: req.user!.id,
      },
    });
    res.json({ ...asistencia, militante: { nombre: militante.nombre, cedula: militante.cedula } });
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

actividadesRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: req.params.id } });
    if (req.user!.role !== "SUPERADMIN" && req.user!.secretariaId !== actividad.secretariaId) {
      throw new HttpError(403, "No autorizado");
    }
    if (req.user!.role === "AUDITOR") throw new HttpError(403, "Auditor es de solo lectura");
    await prisma.actividad.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);
