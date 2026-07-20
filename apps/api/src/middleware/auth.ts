import type { NextFunction, Request, Response } from "express";
import type { Role } from "@cayena/database";
import { verifyAccessToken } from "../lib/jwt";

export type AuthUser = {
  id: string;
  role: Role;
  secretariaId: string | null;
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
    req.user = { id: payload.sub, role: payload.role, secretariaId: payload.secretariaId };
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
