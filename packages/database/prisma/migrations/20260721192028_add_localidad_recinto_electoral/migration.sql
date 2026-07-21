-- CreateTable
CREATE TABLE "Localidad" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "municipioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Localidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecintoElectoral" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "localidadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecintoElectoral_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Militante" ADD COLUMN     "localidadId" TEXT,
                        ADD COLUMN     "recintoElectoralId" TEXT;

-- Backfill: las pocas filas existentes con "localidad"/"recintoElectoral"
-- como texto libre (datos de prueba de la importación CSV) se normalizan
-- a las nuevas tablas de catálogo antes de eliminar las columnas de texto.
INSERT INTO "Localidad" ("id", "nombre", "municipioId", "createdAt")
SELECT gen_random_uuid()::text, t."localidad", t."municipioId", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "municipioId", "localidad" FROM "Militante" WHERE "localidad" IS NOT NULL
) t;

UPDATE "Militante" m
SET "localidadId" = l."id"
FROM "Localidad" l
WHERE m."localidad" IS NOT NULL
  AND l."municipioId" = m."municipioId"
  AND l."nombre" = m."localidad";

INSERT INTO "RecintoElectoral" ("id", "nombre", "localidadId", "createdAt")
SELECT gen_random_uuid()::text, t."recintoElectoral", t."localidadId", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT m."localidadId", m."recintoElectoral"
    FROM "Militante" m
    WHERE m."recintoElectoral" IS NOT NULL AND m."localidadId" IS NOT NULL
) t;

UPDATE "Militante" m
SET "recintoElectoralId" = r."id"
FROM "RecintoElectoral" r
WHERE m."recintoElectoral" IS NOT NULL
  AND m."localidadId" IS NOT NULL
  AND r."localidadId" = m."localidadId"
  AND r."nombre" = m."recintoElectoral";

-- AlterTable
ALTER TABLE "Militante" DROP COLUMN "localidad",
                        DROP COLUMN "recintoElectoral";

-- CreateIndex
CREATE INDEX "Localidad_municipioId_idx" ON "Localidad"("municipioId");

-- CreateIndex
CREATE UNIQUE INDEX "Localidad_municipioId_nombre_key" ON "Localidad"("municipioId", "nombre");

-- CreateIndex
CREATE INDEX "RecintoElectoral_localidadId_idx" ON "RecintoElectoral"("localidadId");

-- CreateIndex
CREATE UNIQUE INDEX "RecintoElectoral_localidadId_nombre_key" ON "RecintoElectoral"("localidadId", "nombre");

-- CreateIndex
CREATE INDEX "Militante_localidadId_idx" ON "Militante"("localidadId");

-- CreateIndex
CREATE INDEX "Militante_recintoElectoralId_idx" ON "Militante"("recintoElectoralId");

-- AddForeignKey
ALTER TABLE "Localidad" ADD CONSTRAINT "Localidad_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecintoElectoral" ADD CONSTRAINT "RecintoElectoral_localidadId_fkey" FOREIGN KEY ("localidadId") REFERENCES "Localidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Militante" ADD CONSTRAINT "Militante_localidadId_fkey" FOREIGN KEY ("localidadId") REFERENCES "Localidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Militante" ADD CONSTRAINT "Militante_recintoElectoralId_fkey" FOREIGN KEY ("recintoElectoralId") REFERENCES "RecintoElectoral"("id") ON DELETE SET NULL ON UPDATE CASCADE;
