-- AlterTable
ALTER TABLE "RecintoElectoral" ADD COLUMN "direccion" TEXT;

-- AlterTable
ALTER TABLE "Militante" ADD COLUMN "colegioId" TEXT;

-- CreateTable
CREATE TABLE "Colegio" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "recintoElectoralId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Colegio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Colegio_recintoElectoralId_idx" ON "Colegio"("recintoElectoralId");

-- CreateIndex
CREATE UNIQUE INDEX "Colegio_recintoElectoralId_numero_key" ON "Colegio"("recintoElectoralId", "numero");

-- CreateIndex
CREATE INDEX "Militante_colegioId_idx" ON "Militante"("colegioId");

-- AddForeignKey
ALTER TABLE "Colegio" ADD CONSTRAINT "Colegio_recintoElectoralId_fkey" FOREIGN KEY ("recintoElectoralId") REFERENCES "RecintoElectoral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Militante" ADD CONSTRAINT "Militante_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
