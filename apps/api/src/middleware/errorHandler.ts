import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@cayena/database";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Datos inválidos", detalles: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2003") {
      return res.status(400).json({ error: "Referencia inválida (provincia/municipio/secretaría inexistente)" });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un registro con ese valor único" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
  }
  console.error(err);
  return res.status(500).json({ error: "Error interno del servidor" });
}

export function asyncRoute<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
