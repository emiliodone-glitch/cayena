// Carga la cantidad de electores hábiles del padrón de la JCE por demarcación
// (provincia, municipio y/o distrito municipal), para que el mapa pueda
// calcular penetración electoral (militantes captados / electores).
//
// Espera un archivo packages/database/data/electores-jce.json con el formato:
// [
//   { "provincia": "Santiago", "electores": 745123 },
//   { "provincia": "Santiago", "municipio": "Santiago de los Caballeros", "electores": 512345 },
//   { "provincia": "Santiago", "municipio": "Santiago de los Caballeros",
//     "distritoMunicipal": "Pedro García", "electores": 8123 }
// ]
// - Solo "provincia"                     -> actualiza la provincia.
// - "provincia" + "municipio"            -> actualiza el municipio.
// - + "distritoMunicipal"                -> actualiza el distrito municipal.
// Los nombres se comparan sin acentos ni mayúsculas. Idempotente: puede
// correrse varias veces; sobreescribe el valor anterior con el del archivo.
//
// Uso: DATABASE_URL="postgresql://..." npx tsx packages/database/scripts/import-electores.ts
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Registro = {
  provincia: string;
  municipio?: string;
  distritoMunicipal?: string;
  electores: number;
};

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function main() {
  const archivo = path.join(__dirname, "..", "data", "electores-jce.json");
  if (!fs.existsSync(archivo)) {
    console.error(`No existe ${archivo}.`);
    console.error("Crea el archivo con el formato documentado en el encabezado de este script.");
    process.exit(1);
  }
  const registros: Registro[] = JSON.parse(fs.readFileSync(archivo, "utf-8"));
  console.log(`Registros de electores a importar: ${registros.length}`);

  const provincias = await prisma.provincia.findMany();
  const municipios = await prisma.municipio.findMany();
  const distritos = await prisma.distritoMunicipal.findMany();

  const provPorNombre = new Map(provincias.map((p) => [norm(p.nombre), p]));
  const muniPorClave = new Map(municipios.map((m) => [`${m.provinciaId}::${norm(m.nombre)}`, m]));
  const dmPorClave = new Map(distritos.map((d) => [`${d.municipioId}::${norm(d.nombre)}`, d]));

  let provinciasActualizadas = 0;
  let municipiosActualizados = 0;
  let distritosActualizados = 0;
  let sinMatch = 0;

  for (const r of registros) {
    const provincia = provPorNombre.get(norm(r.provincia));
    if (!provincia) {
      console.warn("Provincia no encontrada:", r.provincia);
      sinMatch++;
      continue;
    }

    if (!r.municipio) {
      await prisma.provincia.update({ where: { id: provincia.id }, data: { electores: r.electores } });
      provinciasActualizadas++;
      continue;
    }

    const municipio = muniPorClave.get(`${provincia.id}::${norm(r.municipio)}`);
    if (!municipio) {
      console.warn("Municipio no encontrado:", r.provincia, "|", r.municipio);
      sinMatch++;
      continue;
    }

    if (!r.distritoMunicipal) {
      await prisma.municipio.update({ where: { id: municipio.id }, data: { electores: r.electores } });
      municipiosActualizados++;
      continue;
    }

    const dm = dmPorClave.get(`${municipio.id}::${norm(r.distritoMunicipal)}`);
    if (!dm) {
      console.warn("Distrito municipal no encontrado:", r.municipio, "|", r.distritoMunicipal);
      sinMatch++;
      continue;
    }
    await prisma.distritoMunicipal.update({ where: { id: dm.id }, data: { electores: r.electores } });
    distritosActualizados++;
  }

  console.log("\n=== RESUMEN ===");
  console.log("Provincias actualizadas:", provinciasActualizadas);
  console.log("Municipios actualizados:", municipiosActualizados);
  console.log("Distritos municipales actualizados:", distritosActualizados);
  console.log("Sin match (revisar nombres):", sinMatch);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
