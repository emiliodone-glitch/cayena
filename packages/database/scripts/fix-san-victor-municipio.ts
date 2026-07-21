// Corrige un vacío en la geodata original: "San Víctor" es su propio municipio
// de Espaillat (código oficial 090501), no una sección de Moca. La primera
// importación de recintos/colegios de la JCE (import-jce-recintos-colegios.ts)
// tuvo que asignarlo a Moca por falta de este dato — este script lo corrige:
// 1. Crea el municipio San Víctor si no existe.
// 2. Mueve los recintos electorales (y sus colegios) que en realidad son de
//    San Víctor desde Moca hacia el municipio correcto, usando nombre +
//    dirección del recinto (algunos recintos comparten nombres genéricos
//    como "Escuela Primaria Rural" entre varios sectores, así que hace falta
//    la dirección exacta para no mover el recinto equivocado).
//
// Idempotente: si ya se corrió, no hace nada en la segunda ejecución.
//
// Uso: DATABASE_URL="postgresql://..." npx tsx packages/database/scripts/fix-san-victor-municipio.ts
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

async function main() {
  await prisma.municipio.upsert({
    where: { id: "espaillat__san-victor" },
    update: { nombre: "San Víctor" },
    create: { id: "espaillat__san-victor", nombre: "San Víctor", provinciaId: "espaillat" },
  });
  console.log("Municipio San Víctor verificado/creado.");

  const raw = fs.readFileSync(
    path.join(__dirname, "..", "data", "jce-recintos-colegios-2024.json"),
    "utf-8",
  );
  const records: { provincia: string; municipio: string; sector: string; recinto: string; direccion: string }[] =
    JSON.parse(raw);

  const sanVictorRecords = records.filter(
    (r) => norm(r.provincia) === "ESPAILLAT" && norm(r.municipio) === "SAN VICTOR",
  );
  console.log("Registros de San Víctor en la data de la JCE:", sanVictorRecords.length);

  const moca = await prisma.municipio.findUniqueOrThrow({ where: { id: "espaillat__moca" } });
  const sanVictor = await prisma.municipio.findUniqueOrThrow({ where: { id: "espaillat__san-victor" } });

  let recintosMovidos = 0;
  let localidadesCreadas = 0;

  for (const r of sanVictorRecords) {
    const recintoNombre = titleCase(r.recinto);
    const direccionNombre = titleCase(r.direccion);
    const sectorNombre = titleCase(r.sector);

    // nombre Y dirección: varios recintos comparten nombres genéricos como
    // "Escuela Primaria Rural" entre distintos sectores/municipios.
    const recintoExistente = await prisma.recintoElectoral.findFirst({
      where: {
        nombre: { equals: recintoNombre, mode: "insensitive" },
        direccion: { equals: direccionNombre, mode: "insensitive" },
        localidad: { municipioId: moca.id },
      },
      include: { localidad: true },
    });

    if (!recintoExistente) {
      continue; // ya fue movido en una corrida anterior, o no existe en este entorno
    }

    let localidadSanVictor = await prisma.localidad.findFirst({
      where: { municipioId: sanVictor.id, nombre: { equals: sectorNombre, mode: "insensitive" } },
    });
    if (!localidadSanVictor) {
      localidadSanVictor = await prisma.localidad.create({
        data: { municipioId: sanVictor.id, nombre: sectorNombre },
      });
      localidadesCreadas++;
    }

    await prisma.recintoElectoral.update({
      where: { id: recintoExistente.id },
      data: { localidadId: localidadSanVictor.id },
    });
    recintosMovidos++;
  }

  console.log("\n=== RESUMEN ===");
  console.log("Localidades creadas bajo San Víctor:", localidadesCreadas);
  console.log("Recintos movidos de Moca a San Víctor:", recintosMovidos);

  // limpiar localidades de Moca que quedaron sin ningún recinto ni militante
  const localidadesMoca = await prisma.localidad.findMany({
    where: { municipioId: moca.id },
    include: { _count: { select: { recintos: true, militantes: true } } },
  });
  const huerfanas = localidadesMoca.filter((l) => l._count.recintos === 0 && l._count.militantes === 0);
  for (const h of huerfanas) {
    await prisma.localidad.delete({ where: { id: h.id } });
  }
  console.log("Localidades huérfanas de Moca eliminadas:", huerfanas.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
