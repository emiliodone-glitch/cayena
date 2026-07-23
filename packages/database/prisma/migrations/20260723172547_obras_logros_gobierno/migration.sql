-- AlterTable
ALTER TABLE "Obra" ADD COLUMN     "beneficiarios" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "fechaInauguracion" TIMESTAMP(3),
ADD COLUMN     "fotosAntes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "inversion" DECIMAL(14,2);
