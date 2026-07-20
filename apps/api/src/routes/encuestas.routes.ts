import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";

export const encuestasRouter = Router();

// Encuestas activas visibles públicamente en la app (sin resultados, para votar).
encuestasRouter.get(
  "/publicas",
  asyncRoute(async (_req, res) => {
    const encuestas = await prisma.encuesta.findMany({
      where: { activa: true },
      include: { opciones: { select: { id: true, texto: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(encuestas);
  }),
);

const votoSchema = z.object({ opcionId: z.string(), cedula: z.string().min(5) });

// Un militante vota usando su cédula como identificador único (evita doble voto).
encuestasRouter.post(
  "/:id/votar",
  asyncRoute(async (req, res) => {
    const { opcionId, cedula } = votoSchema.parse(req.body);
    const opcion = await prisma.encuestaOpcion.findFirst({
      where: { id: opcionId, encuestaId: req.params.id },
    });
    if (!opcion) throw new HttpError(404, "Opción no encontrada para esta encuesta");

    const yaVoto = await prisma.encuestaVoto.findUnique({
      where: { encuestaId_cedulaVotante: { encuestaId: req.params.id, cedulaVotante: cedula } },
    });
    if (yaVoto) throw new HttpError(409, "Ya registraste tu voto en esta encuesta");

    await prisma.encuestaVoto.create({
      data: { encuestaId: req.params.id, opcionId, cedulaVotante: cedula },
    });
    res.status(201).json({ ok: true });
  }),
);

// Resultados agregados (back office).
encuestasRouter.get(
  "/:id/resultados",
  requireAuth,
  asyncRoute(async (req, res) => {
    const encuesta = await prisma.encuesta.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { opciones: { include: { _count: { select: { votos: true } } } } },
    });
    const total = encuesta.opciones.reduce((sum, o) => sum + o._count.votos, 0);
    res.json({
      id: encuesta.id,
      titulo: encuesta.titulo,
      totalVotos: total,
      opciones: encuesta.opciones.map((o) => ({
        id: o.id,
        texto: o.texto,
        votos: o._count.votos,
        porcentaje: total > 0 ? Math.round((o._count.votos / total) * 1000) / 10 : 0,
      })),
    });
  }),
);

encuestasRouter.use(requireAuth);

encuestasRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const encuestas = await prisma.encuesta.findMany({
      include: { opciones: true, _count: { select: { votos: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(encuestas);
  }),
);

const crearEncuestaSchema = z.object({
  titulo: z.string().min(3),
  descripcion: z.string().optional(),
  opciones: z.array(z.string().min(1)).min(2),
});

encuestasRouter.post(
  "/",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (req, res) => {
    const data = crearEncuestaSchema.parse(req.body);
    const encuesta = await prisma.encuesta.create({
      data: {
        titulo: data.titulo,
        descripcion: data.descripcion,
        creadoPorId: req.user!.id,
        opciones: { create: data.opciones.map((texto) => ({ texto })) },
      },
      include: { opciones: true },
    });
    res.status(201).json(encuesta);
  }),
);

encuestasRouter.patch(
  "/:id/estado",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (req, res) => {
    const { activa } = z.object({ activa: z.boolean() }).parse(req.body);
    const encuesta = await prisma.encuesta.update({ where: { id: req.params.id }, data: { activa } });
    res.json(encuesta);
  }),
);
