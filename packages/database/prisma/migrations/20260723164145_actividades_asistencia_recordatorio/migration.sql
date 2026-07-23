-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN     "recordatorioEnviado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DeviceToken" ADD COLUMN     "militanteId" TEXT;

-- CreateTable
CREATE TABLE "AsistenciaActividad" (
    "id" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "militanteId" TEXT NOT NULL,
    "confirmado" BOOLEAN NOT NULL DEFAULT true,
    "checkInAt" TIMESTAMP(3),
    "checkInPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsistenciaActividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AsistenciaActividad_actividadId_idx" ON "AsistenciaActividad"("actividadId");

-- CreateIndex
CREATE INDEX "AsistenciaActividad_militanteId_idx" ON "AsistenciaActividad"("militanteId");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaActividad_actividadId_militanteId_key" ON "AsistenciaActividad"("actividadId", "militanteId");

-- CreateIndex
CREATE INDEX "DeviceToken_militanteId_idx" ON "DeviceToken"("militanteId");

-- AddForeignKey
ALTER TABLE "AsistenciaActividad" ADD CONSTRAINT "AsistenciaActividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaActividad" ADD CONSTRAINT "AsistenciaActividad_militanteId_fkey" FOREIGN KEY ("militanteId") REFERENCES "Militante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaActividad" ADD CONSTRAINT "AsistenciaActividad_checkInPorId_fkey" FOREIGN KEY ("checkInPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_militanteId_fkey" FOREIGN KEY ("militanteId") REFERENCES "Militante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
