-- CreateTable
CREATE TABLE "EventoElectoral" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoElectoral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmacionVoto" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "militanteId" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "confirmadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmacionVoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoElectoral_activo_idx" ON "EventoElectoral"("activo");

-- CreateIndex
CREATE INDEX "ConfirmacionVoto_eventoId_idx" ON "ConfirmacionVoto"("eventoId");

-- CreateIndex
CREATE INDEX "ConfirmacionVoto_militanteId_idx" ON "ConfirmacionVoto"("militanteId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmacionVoto_eventoId_militanteId_key" ON "ConfirmacionVoto"("eventoId", "militanteId");

-- AddForeignKey
ALTER TABLE "ConfirmacionVoto" ADD CONSTRAINT "ConfirmacionVoto_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "EventoElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmacionVoto" ADD CONSTRAINT "ConfirmacionVoto_militanteId_fkey" FOREIGN KEY ("militanteId") REFERENCES "Militante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmacionVoto" ADD CONSTRAINT "ConfirmacionVoto_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
