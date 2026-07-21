-- AlterTable
ALTER TABLE "MetaMilitantes" ADD COLUMN     "distritoMunicipalId" TEXT;

-- AlterTable
ALTER TABLE "Militante" ADD COLUMN     "distritoMunicipalId" TEXT;

-- CreateTable
CREATE TABLE "DistritoMunicipal" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "municipioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistritoMunicipal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistritoMunicipal_municipioId_idx" ON "DistritoMunicipal"("municipioId");

-- CreateIndex
CREATE UNIQUE INDEX "DistritoMunicipal_municipioId_nombre_key" ON "DistritoMunicipal"("municipioId", "nombre");

-- CreateIndex
CREATE INDEX "MetaMilitantes_distritoMunicipalId_idx" ON "MetaMilitantes"("distritoMunicipalId");

-- CreateIndex
CREATE INDEX "Militante_distritoMunicipalId_idx" ON "Militante"("distritoMunicipalId");

-- AddForeignKey
ALTER TABLE "DistritoMunicipal" ADD CONSTRAINT "DistritoMunicipal_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Militante" ADD CONSTRAINT "Militante_distritoMunicipalId_fkey" FOREIGN KEY ("distritoMunicipalId") REFERENCES "DistritoMunicipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMilitantes" ADD CONSTRAINT "MetaMilitantes_distritoMunicipalId_fkey" FOREIGN KEY ("distritoMunicipalId") REFERENCES "DistritoMunicipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
