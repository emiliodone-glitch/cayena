-- AlterTable
ALTER TABLE "Militante" ADD COLUMN     "puntos" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL DEFAULT 'expo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "enviadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destinatarios" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encuesta" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Encuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncuestaOpcion" (
    "id" TEXT NOT NULL,
    "encuestaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "EncuestaOpcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncuestaVoto" (
    "id" TEXT NOT NULL,
    "encuestaId" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "cedulaVotante" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncuestaVoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsigniaDefinicion" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "puntos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InsigniaDefinicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilitanteInsignia" (
    "id" TEXT NOT NULL,
    "militanteId" TEXT NOT NULL,
    "insigniaId" TEXT NOT NULL,
    "otorgadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilitanteInsignia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "EncuestaOpcion_encuestaId_idx" ON "EncuestaOpcion"("encuestaId");

-- CreateIndex
CREATE INDEX "EncuestaVoto_opcionId_idx" ON "EncuestaVoto"("opcionId");

-- CreateIndex
CREATE UNIQUE INDEX "EncuestaVoto_encuestaId_cedulaVotante_key" ON "EncuestaVoto"("encuestaId", "cedulaVotante");

-- CreateIndex
CREATE UNIQUE INDEX "InsigniaDefinicion_codigo_key" ON "InsigniaDefinicion"("codigo");

-- CreateIndex
CREATE INDEX "MilitanteInsignia_militanteId_idx" ON "MilitanteInsignia"("militanteId");

-- CreateIndex
CREATE UNIQUE INDEX "MilitanteInsignia_militanteId_insigniaId_key" ON "MilitanteInsignia"("militanteId", "insigniaId");

-- AddForeignKey
ALTER TABLE "EncuestaOpcion" ADD CONSTRAINT "EncuestaOpcion_encuestaId_fkey" FOREIGN KEY ("encuestaId") REFERENCES "Encuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncuestaVoto" ADD CONSTRAINT "EncuestaVoto_encuestaId_fkey" FOREIGN KEY ("encuestaId") REFERENCES "Encuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncuestaVoto" ADD CONSTRAINT "EncuestaVoto_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "EncuestaOpcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilitanteInsignia" ADD CONSTRAINT "MilitanteInsignia_militanteId_fkey" FOREIGN KEY ("militanteId") REFERENCES "Militante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilitanteInsignia" ADD CONSTRAINT "MilitanteInsignia_insigniaId_fkey" FOREIGN KEY ("insigniaId") REFERENCES "InsigniaDefinicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
