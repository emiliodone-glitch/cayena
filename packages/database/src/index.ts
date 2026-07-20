import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __cayenaPrisma: PrismaClient | undefined;
}

export const prisma = global.__cayenaPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__cayenaPrisma = prisma;
}

export * from "@prisma/client";
export * from "./geo";
