import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role, prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

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
    const usuario = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
    });
    const { passwordHash: _ph, ...rest } = usuario;
    res.json(rest);
  }),
);
