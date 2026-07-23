-- AlterTable
ALTER TABLE "Colegio" ADD COLUMN     "responsableId" TEXT;

-- CreateTable
CREATE TABLE "RecordatorioVoto" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordatorioVoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaParticipacion" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "provinciaId" TEXT,
    "municipioId" TEXT,
    "distritoMunicipalId" TEXT,
    "porcentajeObjetivo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaParticipacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidenciaMesa" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "reportadoPorId" TEXT NOT NULL,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidenciaMesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecordatorioVoto_eventoId_hora_key" ON "RecordatorioVoto"("eventoId", "hora");

-- CreateIndex
CREATE INDEX "MetaParticipacion_eventoId_idx" ON "MetaParticipacion"("eventoId");

-- CreateIndex
CREATE INDEX "MetaParticipacion_provinciaId_idx" ON "MetaParticipacion"("provinciaId");

-- CreateIndex
CREATE INDEX "MetaParticipacion_municipioId_idx" ON "MetaParticipacion"("municipioId");

-- CreateIndex
CREATE INDEX "MetaParticipacion_distritoMunicipalId_idx" ON "MetaParticipacion"("distritoMunicipalId");

-- CreateIndex
CREATE INDEX "IncidenciaMesa_eventoId_idx" ON "IncidenciaMesa"("eventoId");

-- CreateIndex
CREATE INDEX "IncidenciaMesa_colegioId_idx" ON "IncidenciaMesa"("colegioId");

-- CreateIndex
CREATE INDEX "Colegio_responsableId_idx" ON "Colegio"("responsableId");

-- AddForeignKey
ALTER TABLE "Colegio" ADD CONSTRAINT "Colegio_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordatorioVoto" ADD CONSTRAINT "RecordatorioVoto_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "EventoElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaParticipacion" ADD CONSTRAINT "MetaParticipacion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "EventoElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaParticipacion" ADD CONSTRAINT "MetaParticipacion_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "Provincia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaParticipacion" ADD CONSTRAINT "MetaParticipacion_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaParticipacion" ADD CONSTRAINT "MetaParticipacion_distritoMunicipalId_fkey" FOREIGN KEY ("distritoMunicipalId") REFERENCES "DistritoMunicipal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaMesa" ADD CONSTRAINT "IncidenciaMesa_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "EventoElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaMesa" ADD CONSTRAINT "IncidenciaMesa_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaMesa" ADD CONSTRAINT "IncidenciaMesa_reportadoPorId_fkey" FOREIGN KEY ("reportadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
