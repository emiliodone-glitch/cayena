-- AlterTable
ALTER TABLE "User" ADD COLUMN     "modulosVisibles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "limitarASecretaria" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: jefes de secretaría y promotores ya operaban de facto limitados
-- a la suya en al menos una parte del sistema (actividades, dashboard); se
-- deja explícito para todos los módulos y así el nuevo toggle centralizado
-- no afloje el alcance real de ninguna cuenta existente.
UPDATE "User" SET "limitarASecretaria" = true WHERE "role" IN ('JEFE_SECRETARIA', 'PROMOTOR');
