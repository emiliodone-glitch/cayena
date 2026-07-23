-- AlterTable
ALTER TABLE "DeviceToken" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Notificacion" ADD COLUMN     "destinatarioUserId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "distritoMunicipalId" TEXT,
ADD COLUMN     "municipioId" TEXT,
ADD COLUMN     "provinciaId" TEXT;

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "Notificacion_destinatarioUserId_idx" ON "Notificacion"("destinatarioUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "Provincia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_distritoMunicipalId_fkey" FOREIGN KEY ("distritoMunicipalId") REFERENCES "DistritoMunicipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_destinatarioUserId_fkey" FOREIGN KEY ("destinatarioUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
