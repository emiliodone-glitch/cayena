-- AlterTable
ALTER TABLE "Secretaria" ADD COLUMN     "presupuestoAsignado" DECIMAL(14,2),
ADD COLUMN     "titularId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cargoSecretaria" TEXT;

-- CreateTable
CREATE TABLE "HistorialTitularSecretaria" (
    "id" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombreTitular" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialTitularSecretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformeSecretaria" (
    "id" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "archivoUrl" TEXT,
    "subidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InformeSecretaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistorialTitularSecretaria_secretariaId_idx" ON "HistorialTitularSecretaria"("secretariaId");

-- CreateIndex
CREATE INDEX "InformeSecretaria_secretariaId_idx" ON "InformeSecretaria"("secretariaId");

-- CreateIndex
CREATE UNIQUE INDEX "InformeSecretaria_secretariaId_periodo_key" ON "InformeSecretaria"("secretariaId", "periodo");

-- AddForeignKey
ALTER TABLE "Secretaria" ADD CONSTRAINT "Secretaria_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialTitularSecretaria" ADD CONSTRAINT "HistorialTitularSecretaria_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialTitularSecretaria" ADD CONSTRAINT "HistorialTitularSecretaria_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeSecretaria" ADD CONSTRAINT "InformeSecretaria_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeSecretaria" ADD CONSTRAINT "InformeSecretaria_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
