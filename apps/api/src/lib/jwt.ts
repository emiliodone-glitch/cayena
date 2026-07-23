import jwt from "jsonwebtoken";
import type { Role } from "@cayena/database";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret";

export type AccessTokenPayload = {
  sub: string;
  role: Role;
  secretariaId: string | null;
  // Territorio asignado (coordinador de zona) — ver comentario en el modelo
  // User del schema. Viaja en el token para que el middleware de alcance no
  // necesite una consulta extra a la BD en cada request.
  provinciaId: string | null;
  municipioId: string | null;
  distritoMunicipalId: string | null;
  // Control de accesos por usuario — ver comentario en el modelo User.
  // Viaja en el token por la misma razón que el territorio: evitar una
  // consulta extra a la BD en cada request.
  modulosVisibles: string[];
  limitarASecretaria: boolean;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "30m" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}
