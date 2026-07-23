import type { NextFunction, Request, Response } from "express";
import { prisma, type Role } from "@cayena/database";
import { verifyAccessToken } from "../lib/jwt";

export type AuthUser = {
  id: string;
  role: Role;
  secretariaId: string | null;
  provinciaId: string | null;
  municipioId: string | null;
  distritoMunicipalId: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      secretariaId: payload.secretariaId,
      provinciaId: payload.provinciaId ?? null,
      municipioId: payload.municipioId ?? null,
      distritoMunicipalId: payload.distritoMunicipalId ?? null,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "No autenticado" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "No autorizado para esta acción" });
    }
    next();
  };
}

// Un jefe de secretaría / promotor solo puede operar dentro de su propia
// secretaría; superadmin y auditor pueden ver todas.
export function scopeSecretaria(req: Request, secretariaId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === "SUPERADMIN" || req.user.role === "AUDITOR") return true;
  return req.user.secretariaId === secretariaId;
}

// ---------------------------------------------------------------------------
// Territorio asignado (coordinador de zona) — ver comentario en el modelo
// User del schema. SUPERADMIN y AUDITOR siempre tienen visibilidad nacional;
// el resto de roles la conservan también si no tienen nada asignado (así las
// cuentas ya existentes, sin territorio, no pierden acceso a nada).
// ---------------------------------------------------------------------------

const ROLES_SIEMPRE_NACIONALES: Role[] = ["SUPERADMIN", "AUDITOR"];

export function tieneTerritorioAsignado(user: AuthUser): boolean {
  return !!(user.provinciaId || user.municipioId || user.distritoMunicipalId);
}

export function esNacional(user: AuthUser): boolean {
  return ROLES_SIEMPRE_NACIONALES.includes(user.role) || !tieneTerritorioAsignado(user);
}

// `null` = alcance nacional (sin restricción). Con territorio, siempre trae
// también los ids padre (resueltos contra la jerarquía geo) para poder
// comparar contra cualquier nivel del mapa sin otra consulta.
export type AlcanceTerritorio =
  | { nivel: "provincia"; provinciaId: string }
  | { nivel: "municipio"; municipioId: string; provinciaId: string }
  | { nivel: "distrito"; distritoMunicipalId: string; municipioId: string; provinciaId: string }
  | null;

export async function resolverAlcance(user: AuthUser): Promise<AlcanceTerritorio> {
  if (esNacional(user)) return null;
  if (user.distritoMunicipalId) {
    const distrito = await prisma.distritoMunicipal.findUnique({
      where: { id: user.distritoMunicipalId },
      select: { municipioId: true, municipio: { select: { provinciaId: true } } },
    });
    if (!distrito) return null;
    return {
      nivel: "distrito",
      distritoMunicipalId: user.distritoMunicipalId,
      municipioId: distrito.municipioId,
      provinciaId: distrito.municipio.provinciaId,
    };
  }
  if (user.municipioId) {
    const municipio = await prisma.municipio.findUnique({
      where: { id: user.municipioId },
      select: { provinciaId: true },
    });
    if (!municipio) return null;
    return { nivel: "municipio", municipioId: user.municipioId, provinciaId: municipio.provinciaId };
  }
  if (user.provinciaId) {
    return { nivel: "provincia", provinciaId: user.provinciaId };
  }
  return null;
}

export function puedeVerProvincia(alcance: AlcanceTerritorio, provinciaId: string): boolean {
  if (!alcance) return true;
  return alcance.provinciaId === provinciaId;
}

export function puedeVerMunicipio(alcance: AlcanceTerritorio, municipioId: string, provinciaId: string): boolean {
  if (!alcance) return true;
  if (alcance.nivel === "provincia") return alcance.provinciaId === provinciaId;
  return alcance.municipioId === municipioId;
}

export function puedeVerDistrito(
  alcance: AlcanceTerritorio,
  distritoMunicipalId: string | null,
  municipioId: string,
  provinciaId: string,
): boolean {
  if (!alcance) return true;
  if (alcance.nivel === "provincia") return alcance.provinciaId === provinciaId;
  if (alcance.nivel === "municipio") return alcance.municipioId === municipioId;
  return alcance.distritoMunicipalId === distritoMunicipalId;
}

// Fragmento de `where` de Prisma para filtrar militantes por el alcance —
// se usa tal cual (spread) en cualquier `findMany`/`count`/`groupBy`.
export function whereMilitanteAlcance(alcance: AlcanceTerritorio): Record<string, unknown> {
  if (!alcance) return {};
  if (alcance.nivel === "distrito") return { distritoMunicipalId: alcance.distritoMunicipalId };
  if (alcance.nivel === "municipio") return { municipioId: alcance.municipioId };
  return { provinciaId: alcance.provinciaId };
}

// Valida que la demarcación de un militante a crear (o de una fila del CSV)
// caiga dentro del territorio asignado al usuario que lo está registrando.
export function puedeGestionarMilitante(
  alcance: AlcanceTerritorio,
  demarcacion: { provinciaId: string; municipioId: string; distritoMunicipalId?: string | null },
): boolean {
  if (!alcance) return true;
  if (alcance.nivel === "provincia") return alcance.provinciaId === demarcacion.provinciaId;
  if (alcance.nivel === "municipio") return alcance.municipioId === demarcacion.municipioId;
  return alcance.distritoMunicipalId === (demarcacion.distritoMunicipalId ?? null);
}
