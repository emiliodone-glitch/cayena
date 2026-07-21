// Carga el catálogo real de localidades, recintos y colegios electorales de
// la JCE (elecciones del 19 de mayo de 2024) en las tablas Localidad,
// RecintoElectoral y Colegio. Idempotente: se puede correr varias veces sin
// duplicar datos (usa findFirst/upsert por nombre).
//
// Uso (con DATABASE_URL apuntando a la base de datos destino):
//   DATABASE_URL="postgresql://..." npx tsx packages/database/scripts/import-jce-recintos-colegios.ts
//
// Los datos vienen del PDF oficial "Relación de recintos y colegios
// electorales" publicado por la JCE, extraídos con PyMuPDF usando la
// posición geométrica de cada celda de la tabla (no el orden de lectura del
// texto, que queda desalineado cuando el PDF se convierte a texto plano).
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type JceRecord = {
  provincia: string;
  municipio: string;
  distrito_municipal: string;
  recinto: string;
  direccion: string;
  sector: string;
  colegios: string;
  file: number;
  page: number;
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

// (provinciaNorm, municipioJceNorm) -> real DB municipio name (normalized) it maps to.
const MUNI_ALIAS: Record<string, string> = {
  "EL SEIBO|EL SEIBO": "SANTA CRUZ DEL SEYBO",
  "MONTE CRISTI|MONTECRISTI": "SAN FERNANDO DE MONTE CRISTI",
  "ESPAILLAT|SAN VICTOR": "MOCA",
};

// La geodata original (GeoBoundaries ADM2) tenía un municipio mal escrito y
// le faltaban 4 municipios reales que sí aparecen en los datos de la JCE.
async function corregirMunicipios() {
  const fixed = await prisma.municipio.updateMany({
    where: { nombre: "Quisquella" },
    data: { nombre: "Quisqueya" },
  });
  if (fixed.count) console.log("Corregido Quisquella -> Quisqueya:", fixed.count);

  const faltantes = [
    { id: "pedernales__oviedo", nombre: "Oviedo", provinciaId: "pedernales" },
    { id: "peravia__matanzas", nombre: "Matanzas", provinciaId: "peravia" },
    { id: "santiago__baitoa", nombre: "Baitoa", provinciaId: "santiago" },
    { id: "santiago__sabana-iglesia", nombre: "Sabana Iglesia", provinciaId: "santiago" },
  ];
  for (const m of faltantes) {
    await prisma.municipio.upsert({ where: { id: m.id }, update: { nombre: m.nombre }, create: m });
  }
  console.log("Municipios faltantes verificados/creados:", faltantes.length);
}

async function main() {
  await corregirMunicipios();

  const raw = fs.readFileSync(path.join(__dirname, "..", "data", "jce-recintos-colegios-2024.json"), "utf-8");
  const records: JceRecord[] = JSON.parse(raw);
  console.log(`Registros a importar: ${records.length}`);

  const provincias = await prisma.provincia.findMany();
  const provinciaIdByNorm = new Map(provincias.map((p) => [norm(p.nombre), p.id]));

  const municipios = await prisma.municipio.findMany();
  const municipiosByProvincia = new Map<string, { id: string; nombre: string }[]>();
  for (const m of municipios) {
    const list = municipiosByProvincia.get(m.provinciaId) ?? [];
    list.push({ id: m.id, nombre: m.nombre });
    municipiosByProvincia.set(m.provinciaId, list);
  }

  function findMunicipio(provinciaNorm: string, provinciaId: string, jceMuniName: string) {
    const list = municipiosByProvincia.get(provinciaId) ?? [];
    let target = norm(jceMuniName);
    const alias = MUNI_ALIAS[`${provinciaNorm}|${target}`];
    if (alias) target = alias;
    for (const m of list) if (norm(m.nombre) === target) return m;
    for (const m of list) {
      const mn = norm(m.nombre);
      if (mn.includes(target) || target.includes(mn)) return m;
    }
    for (const m of list) {
      const mn = norm(m.nombre);
      if (mn.split(" ")[0] === target.split(" ")[0]) return m;
    }
    return null;
  }

  let noProvincia = 0;
  let noMunicipio = 0;
  let distritosCreados = 0;
  let localidadesCreadas = 0;
  let recintosCreados = 0;
  let colegiosCreados = 0;
  let colegiosOmitidos = 0;
  let procesados = 0;

  // caches keyed by composite string to avoid redundant upserts within this run
  const distritoCache = new Map<string, string>(); // `${municipioId}::${nombreNorm}` -> id
  const localidadCache = new Map<string, string>(); // `${municipioId}::${nombreNorm}` -> id
  const recintoCache = new Map<string, string>(); // `${localidadId}::${nombreNorm}` -> id

  for (const r of records) {
    const provinciaNorm = norm(r.provincia);
    const provinciaId = provinciaIdByNorm.get(provinciaNorm);
    if (!provinciaId) {
      noProvincia++;
      continue;
    }
    const municipio = findMunicipio(provinciaNorm, provinciaId, r.municipio);
    if (!municipio) {
      noMunicipio++;
      console.warn("Municipio no encontrado:", r.provincia, "|", r.municipio);
      continue;
    }
    const municipioId = municipio.id;

    // Distrito municipal: la JCE marca los distritos municipales reales con
    // el sufijo "(DM)"; sin ese sufijo es solo la cabecera del municipio
    // repetida (a veces con variantes de redacción), no una subdivisión real.
    let distritoMunicipalId: string | null = null;
    const dmNorm = norm(r.distrito_municipal);
    if (dmNorm && /\(DM\)/i.test(r.distrito_municipal)) {
      const dmNombre = titleCase(r.distrito_municipal.replace(/\s*\(DM\)\s*$/i, ""));
      const key = `${municipioId}::${dmNorm}`;
      let id = distritoCache.get(key);
      if (!id) {
        const existente = await prisma.distritoMunicipal.findFirst({
          where: { municipioId, nombre: { equals: dmNombre, mode: "insensitive" } },
        });
        if (existente) {
          id = existente.id;
        } else {
          const creado = await prisma.distritoMunicipal.create({
            data: { municipioId, nombre: dmNombre },
          });
          id = creado.id;
          distritosCreados++;
        }
        distritoCache.set(key, id);
      }
      distritoMunicipalId = id;
    }

    // Localidad (sector)
    const sectorNombre = titleCase(r.sector);
    const sectorNorm = norm(r.sector);
    const localidadKey = `${municipioId}::${sectorNorm}`;
    let localidadId = localidadCache.get(localidadKey);
    if (!localidadId) {
      const existente = await prisma.localidad.findFirst({
        where: { municipioId, nombre: { equals: sectorNombre, mode: "insensitive" } },
      });
      if (existente) {
        localidadId = existente.id;
      } else {
        const creada = await prisma.localidad.create({ data: { municipioId, nombre: sectorNombre } });
        localidadId = creada.id;
        localidadesCreadas++;
      }
      localidadCache.set(localidadKey, localidadId);
    }

    // Recinto electoral
    const recintoNombre = titleCase(r.recinto);
    const recintoNorm = norm(r.recinto);
    const recintoKey = `${localidadId}::${recintoNorm}`;
    let recintoId = recintoCache.get(recintoKey);
    if (!recintoId) {
      const existente = await prisma.recintoElectoral.findFirst({
        where: { localidadId, nombre: { equals: recintoNombre, mode: "insensitive" } },
      });
      if (existente) {
        recintoId = existente.id;
        if (!existente.direccion && r.direccion.trim()) {
          await prisma.recintoElectoral.update({
            where: { id: recintoId },
            data: { direccion: titleCase(r.direccion) },
          });
        }
      } else {
        const creado = await prisma.recintoElectoral.create({
          data: { localidadId, nombre: recintoNombre, direccion: titleCase(r.direccion) },
        });
        recintoId = creado.id;
        recintosCreados++;
      }
      recintoCache.set(recintoKey, recintoId);
    }

    // Colegios (códigos separados por coma)
    const codigos = r.colegios
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    for (const codigo of codigos) {
      try {
        await prisma.colegio.upsert({
          where: { recintoElectoralId_numero: { recintoElectoralId: recintoId, numero: codigo } },
          update: {},
          create: { recintoElectoralId: recintoId, numero: codigo },
        });
        colegiosCreados++;
      } catch (err) {
        colegiosOmitidos++;
      }
    }

    procesados++;
    if (procesados % 500 === 0) console.log(`  ...${procesados}/${records.length}`);
  }

  console.log("\n=== RESUMEN ===");
  console.log("Registros procesados:", procesados);
  console.log("Sin provincia reconocida:", noProvincia);
  console.log("Sin municipio reconocido:", noMunicipio);
  console.log("Distritos municipales creados:", distritosCreados);
  console.log("Localidades creadas:", localidadesCreadas);
  console.log("Recintos electorales creados:", recintosCreados);
  console.log("Colegios creados/actualizados:", colegiosCreados);
  console.log("Colegios con error:", colegiosOmitidos);
}

function titleCase(s: string): string {
  // \b no reconoce letras acentuadas como "de palabra", así que capitaliza mal
  // alrededor de vocales con tilde y de la ñ (ej. "cañitas" -> "CaÑItas").
  // En su lugar, buscamos explícitamente inicio de string / espacio / guion.
  return s
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
