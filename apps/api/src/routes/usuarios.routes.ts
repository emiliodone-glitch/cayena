import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role, prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { calcularRango, type Periodo } from "../lib/periodo";

export const usuariosRouter = Router();

// RF-29: directorio de dirigentes por secretaría y territorio — visible en la app sin login.
usuariosRouter.get(
  "/directorio",
  asyncRoute(async (_req, res) => {
    const dirigentes = await prisma.user.findMany({
      where: { role: { in: [Role.JEFE_SECRETARIA, Role.PROMOTOR] }, active: true },
      select: {
        id: true,
        nombre: true,
        telefono: true,
        role: true,
        secretaria: { select: { nombre: true } },
      },
      orderBy: { nombre: "asc" },
    });
    res.json(dirigentes);
  }),
);

usuariosRouter.use(requireAuth);

// Fase 2 — ranking interno de promotores/digitadores: quién ha captado más
// militantes, para generar competencia sana entre el equipo de campo.
const rankingQuerySchema = z.object({
  periodo: z.enum(["semana", "mes", "trimestre", "todo", "custom"]).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

usuariosRouter.get(
  "/ranking-captacion",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "AUDITOR"),
  asyncRoute(async (req, res) => {
    const scopedSecretariaId = req.user!.role === "JEFE_SECRETARIA" ? req.user!.secretariaId ?? undefined : undefined;
    const { periodo, desde, hasta } = rankingQuerySchema.parse(req.query);
    const rangoFecha =
      periodo && periodo !== "todo" ? calcularRango(periodo as Periodo, desde, hasta) : null;

    const conteos = await prisma.militante.groupBy({
      by: ["capturadoPorId"],
      where: {
        capturadoPorId: { not: null },
        ...(scopedSecretariaId ? { capturadoPor: { secretariaId: scopedSecretariaId } } : {}),
        ...(rangoFecha ? { createdAt: { gte: rangoFecha.inicio, lte: rangoFecha.fin } } : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { capturadoPorId: "desc" } },
      take: 20,
    });

    const usuarios = await prisma.user.findMany({
      where: { id: { in: conteos.map((c) => c.capturadoPorId as string) } },
      select: { id: true, nombre: true, role: true, secretaria: { select: { nombre: true } } },
    });
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));

    res.json(
      conteos
        .map((c) => {
          const u = usuarioPorId.get(c.capturadoPorId as string);
          if (!u) return null;
          return {
            id: u.id,
            nombre: u.nombre,
            role: u.role,
            secretaria: u.secretaria?.nombre ?? null,
            militantesCaptados: c._count._all,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    );
  }),
);

usuariosRouter.use(requireRole("SUPERADMIN"));

// RF-21
usuariosRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const usuarios = await prisma.user.findMany({
      include: { secretaria: { select: { nombre: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(usuarios.map(({ passwordHash: _ph, ...rest }) => rest));
  }),
);

const crearUsuarioSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nombre: z.string().min(2),
  telefono: z.string().optional(),
  role: z.nativeEnum(Role),
  secretariaId: z.string().optional(),
});

usuariosRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = crearUsuarioSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const usuario = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        nombre: data.nombre,
        telefono: data.telefono,
        role: data.role,
        secretariaId: data.secretariaId,
      },
    });
    const { passwordHash: _ph, ...rest } = usuario;
    res.status(201).json(rest);
  }),
);

const actualizarUsuarioSchema = z.object({
  nombre: z.string().min(2).optional(),
  telefono: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  secretariaId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

usuariosRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const { password, ...data } = actualizarUsuarioSchema.parse(req.body);
    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
    const usuario = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
    const { passwordHash: _ph, ...rest } = usuario;
    res.json(rest);
  }),
);
