-- CreateTable
CREATE TABLE "ReconocimientoRanking" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "rango" INTEGER NOT NULL,
    "userId" TEXT,
    "secretariaId" TEXT,
    "nombre" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "otorgadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconocimientoRanking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReconocimientoRanking_tipo_periodo_cicloId_rango_key" ON "ReconocimientoRanking"("tipo", "periodo", "cicloId", "rango");

-- CreateIndex
CREATE INDEX "ReconocimientoRanking_userId_idx" ON "ReconocimientoRanking"("userId");

-- CreateIndex
CREATE INDEX "ReconocimientoRanking_secretariaId_idx" ON "ReconocimientoRanking"("secretariaId");

-- AddForeignKey
ALTER TABLE "ReconocimientoRanking" ADD CONSTRAINT "ReconocimientoRanking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconocimientoRanking" ADD CONSTRAINT "ReconocimientoRanking_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
