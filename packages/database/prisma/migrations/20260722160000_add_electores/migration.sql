-- Electores hábiles del padrón JCE por demarcación, para calcular penetración
-- electoral en el mapa (militantes captados / electores).
ALTER TABLE "Provincia" ADD COLUMN "electores" INTEGER;
ALTER TABLE "Municipio" ADD COLUMN "electores" INTEGER;
ALTER TABLE "DistritoMunicipal" ADD COLUMN "electores" INTEGER;
