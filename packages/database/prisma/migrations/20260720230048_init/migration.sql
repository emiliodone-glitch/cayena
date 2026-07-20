-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'JEFE_SECRETARIA', 'PROMOTOR', 'AUDITOR', 'DIRIGENCIA', 'MILITANTE');

-- CreateEnum
CREATE TYPE "CategoriaObra" AS ENUM ('EDUCACION', 'SALUD', 'VIALIDAD', 'VIVIENDA', 'DEPORTE', 'AGUA_SANEAMIENTO', 'ELECTRICIDAD', 'SEGURIDAD', 'OTRA');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('INGRESO', 'GASTO');

-- CreateTable
CREATE TABLE "Provincia" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provincia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Municipio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "provinciaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Municipio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MILITANTE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "secretariaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Secretaria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Secretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoSecretaria" (
    "id" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "subidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoSecretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actividad" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "ubicacion" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "fotos" TEXT[],
    "secretariaId" TEXT NOT NULL,
    "publicadaApp" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obra" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resena" TEXT NOT NULL,
    "categoria" "CategoriaObra" NOT NULL,
    "fotos" TEXT[],
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "provinciaId" TEXT NOT NULL,
    "municipioId" TEXT NOT NULL,
    "publicada" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Militante" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "provinciaId" TEXT NOT NULL,
    "municipioId" TEXT NOT NULL,
    "localidad" TEXT,
    "recintoElectoral" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "consentimientoDatos" BOOLEAN NOT NULL DEFAULT false,
    "capturadoPorId" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'BACKOFFICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Militante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaMilitantes" (
    "id" TEXT NOT NULL,
    "provinciaId" TEXT,
    "municipioId" TEXT,
    "meta" INTEGER NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenciaHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaMilitantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "categoria" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "comprobanteUrl" TEXT,
    "secretariaId" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPOA" (
    "id" TEXT NOT NULL,
    "secretariaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "indicadorObjetivo" DOUBLE PRECISION NOT NULL,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaPOA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvancePOA" (
    "id" TEXT NOT NULL,
    "metaPoaId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nota" TEXT,
    "registradoPorId" TEXT NOT NULL,

    CONSTRAINT "AvancePOA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Provincia_codigo_key" ON "Provincia"("codigo");

-- CreateIndex
CREATE INDEX "Municipio_provinciaId_idx" ON "Municipio"("provinciaId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Secretaria_nombre_key" ON "Secretaria"("nombre");

-- CreateIndex
CREATE INDEX "DocumentoSecretaria_secretariaId_idx" ON "DocumentoSecretaria"("secretariaId");

-- CreateIndex
CREATE INDEX "Actividad_secretariaId_idx" ON "Actividad"("secretariaId");

-- CreateIndex
CREATE INDEX "Actividad_fecha_idx" ON "Actividad"("fecha");

-- CreateIndex
CREATE INDEX "Obra_provinciaId_idx" ON "Obra"("provinciaId");

-- CreateIndex
CREATE INDEX "Obra_municipioId_idx" ON "Obra"("municipioId");

-- CreateIndex
CREATE INDEX "Obra_publicada_idx" ON "Obra"("publicada");

-- CreateIndex
CREATE UNIQUE INDEX "Militante_cedula_key" ON "Militante"("cedula");

-- CreateIndex
CREATE INDEX "Militante_provinciaId_idx" ON "Militante"("provinciaId");

-- CreateIndex
CREATE INDEX "Militante_municipioId_idx" ON "Militante"("municipioId");

-- CreateIndex
CREATE INDEX "Militante_cedula_idx" ON "Militante"("cedula");

-- CreateIndex
CREATE INDEX "Militante_telefono_idx" ON "Militante"("telefono");

-- CreateIndex
CREATE INDEX "MetaMilitantes_provinciaId_idx" ON "MetaMilitantes"("provinciaId");

-- CreateIndex
CREATE INDEX "MetaMilitantes_municipioId_idx" ON "MetaMilitantes"("municipioId");

-- CreateIndex
CREATE INDEX "Gasto_secretariaId_idx" ON "Gasto"("secretariaId");

-- CreateIndex
CREATE INDEX "Gasto_fecha_idx" ON "Gasto"("fecha");

-- CreateIndex
CREATE INDEX "Gasto_tipo_idx" ON "Gasto"("tipo");

-- CreateIndex
CREATE INDEX "MetaPOA_secretariaId_idx" ON "MetaPOA"("secretariaId");

-- CreateIndex
CREATE INDEX "AvancePOA_metaPoaId_idx" ON "AvancePOA"("metaPoaId");

-- AddForeignKey
ALTER TABLE "Municipio" ADD CONSTRAINT "Municipio_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "Provincia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoSecretaria" ADD CONSTRAINT "DocumentoSecretaria_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "Provincia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Militante" ADD CONSTRAINT "Militante_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "Provincia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Militante" ADD CONSTRAINT "Militante_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Militante" ADD CONSTRAINT "Militante_capturadoPorId_fkey" FOREIGN KEY ("capturadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMilitantes" ADD CONSTRAINT "MetaMilitantes_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "Provincia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMilitantes" ADD CONSTRAINT "MetaMilitantes_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "Municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPOA" ADD CONSTRAINT "MetaPOA_secretariaId_fkey" FOREIGN KEY ("secretariaId") REFERENCES "Secretaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvancePOA" ADD CONSTRAINT "AvancePOA_metaPoaId_fkey" FOREIGN KEY ("metaPoaId") REFERENCES "MetaPOA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvancePOA" ADD CONSTRAINT "AvancePOA_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
