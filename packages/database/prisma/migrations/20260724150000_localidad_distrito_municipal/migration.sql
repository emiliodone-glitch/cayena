-- AlterTable
ALTER TABLE "Localidad" ADD COLUMN     "distritoMunicipalId" TEXT;

-- Backfill (RF nuevo): antes de esta migración no había forma de saber a
-- qué distrito municipal pertenece cada localidad — las mesas electorales
-- (que cuelgan de Localidad vía RecintoElectoral) nunca se pudieron
-- filtrar por distrito, solo por municipio completo. Se infiere el
-- distrito de cada localidad por el distrito MÁS FRECUENTE entre los
-- militantes que ya tienen esa localidad Y un distrito asignado — no es
-- perfecto (una localidad sin NINGÚN militante con distrito asignado
-- queda en NULL) y se puede corregir después a mano desde el back office.
UPDATE "Localidad" l
SET "distritoMunicipalId" = ranked."distritoMunicipalId"
FROM (
  SELECT "localidadId", "distritoMunicipalId",
         ROW_NUMBER() OVER (PARTITION BY "localidadId" ORDER BY COUNT(*) DESC) AS rn
  FROM "Militante"
  WHERE "localidadId" IS NOT NULL AND "distritoMunicipalId" IS NOT NULL
  GROUP BY "localidadId", "distritoMunicipalId"
) ranked
WHERE l.id = ranked."localidadId" AND ranked.rn = 1;

-- CreateIndex
CREATE INDEX "Localidad_distritoMunicipalId_idx" ON "Localidad"("distritoMunicipalId");

-- AddForeignKey
ALTER TABLE "Localidad" ADD CONSTRAINT "Localidad_distritoMunicipalId_fkey" FOREIGN KEY ("distritoMunicipalId") REFERENCES "DistritoMunicipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
