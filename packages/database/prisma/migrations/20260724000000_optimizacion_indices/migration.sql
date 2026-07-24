-- Optimización de rendimiento (RF nuevo): estas columnas se filtran/agrupan
-- en cada carga del dashboard, del padrón de militantes y del ranking de
-- captación, pero no tenían índice — forzaban un recorrido completo de la
-- tabla en cada consulta.

-- CreateIndex
CREATE INDEX "Militante_capturadoPorId_idx" ON "Militante"("capturadoPorId");

-- CreateIndex
CREATE INDEX "Militante_createdAt_idx" ON "Militante"("createdAt");

-- CreateIndex
CREATE INDEX "User_secretariaId_idx" ON "User"("secretariaId");
