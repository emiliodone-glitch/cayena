import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const INCLUDE_TERRITORIO = {
  provincia: { select: { nombre: true } },
  municipio: { select: { nombre: true, provincia: { select: { id: true, nombre: true } } } },
  distritoMunicipal: {
    select: {
      nombre: true,
      municipio: { select: { id: true, nombre: true, provincia: { select: { id: true, nombre: true } } } },
    },
  },
} as const;

type UsuarioConTerritorio = {
  provinciaId: string | null;
  provincia: { nombre: string } | null;
  municipioId: string | null;
  municipio: { nombre: string; provincia: { id: string; nombre: string } } | null;
  distritoMunicipalId: string | null;
  distritoMunicipal: {
    nombre: string;
    municipio: { id: string; nombre: string; provincia: { id: string; nombre: string } };
  } | null;
};

// El usuario solo tiene UNO de los tres ids propios (ver comentario en el
// modelo User), pero el mapa necesita la cadena completa de ancestros para
// poder ubicarse (nivel, provinciaSeleccionada, municipioSeleccionado) sin
// consultas adicionales — por eso se resuelve acá, una sola vez, con los
// includes de arriba.
function serializarTerritorio(user: UsuarioConTerritorio) {
  if (user.distritoMunicipalId && user.distritoMunicipal) {
    const dm = user.distritoMunicipal;
    return {
      alcanceProvinciaId: dm.municipio.provincia.id,
      alcanceProvinciaNombre: dm.municipio.provincia.nombre,
      alcanceMunicipioId: dm.municipio.id,
      alcanceMunicipioNombre: dm.municipio.nombre,
      alcanceDistritoId: user.distritoMunicipalId,
      alcanceDistritoNombre: dm.nombre,
    };
  }
  if (user.municipioId && user.municipio) {
    return {
      alcanceProvinciaId: user.municipio.provincia.id,
      alcanceProvinciaNombre: user.municipio.provincia.nombre,
      alcanceMunicipioId: user.municipioId,
      alcanceMunicipioNombre: user.municipio.nombre,
      alcanceDistritoId: null,
      alcanceDistritoNombre: null,
    };
  }
  if (user.provinciaId && user.provincia) {
    return {
      alcanceProvinciaId: user.provinciaId,
      alcanceProvinciaNombre: user.provincia.nombre,
      alcanceMunicipioId: null,
      alcanceMunicipioNombre: null,
      alcanceDistritoId: null,
      alcanceDistritoNombre: null,
    };
  }
  return {
    alcanceProvinciaId: null,
    alcanceProvinciaNombre: null,
    alcanceMunicipioId: null,
    alcanceMunicipioNombre: null,
    alcanceDistritoId: null,
    alcanceDistritoNombre: null,
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: INCLUDE_TERRITORIO,
    });
    if (!user || !user.active) throw new HttpError(401, "Credenciales inválidas");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new HttpError(401, "Credenciales inválidas");

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      secretariaId: user.secretariaId,
      provinciaId: user.provinciaId,
      municipioId: user.municipioId,
      distritoMunicipalId: user.distritoMunicipalId,
    });
    const refreshToken = signRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        role: user.role,
        secretariaId: user.secretariaId,
        ...serializarTerritorio(user),
      },
    });
  }),
);

const refreshSchema = z.object({ refreshToken: z.string() });

authRouter.post(
  "/refresh",
  asyncRoute(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new HttpError(401, "Refresh token inválido");
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new HttpError(401, "Refresh token inválido o expirado");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new HttpError(401, "Usuario inválido");

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      secretariaId: user.secretariaId,
      provinciaId: user.provinciaId,
      municipioId: user.municipioId,
      distritoMunicipalId: user.distritoMunicipalId,
    });
    res.json({ accessToken });
  }),
);

authRouter.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      include: INCLUDE_TERRITORIO,
    });
    res.json({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role,
      secretariaId: user.secretariaId,
      ...serializarTerritorio(user),
    });
  }),
);
