import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient, Role, CategoriaObra } from "@prisma/client";

const prisma = new PrismaClient();

type GeoFeature = {
  properties: Record<string, string>;
};
type GeoFC = { features: GeoFeature[] };

function loadGeo(file: string): GeoFC {
  const p = path.join(__dirname, "..", "geo", file);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function seedGeografia() {
  const provincias = loadGeo("provincias.geojson");
  const municipios = loadGeo("municipios.geojson");

  for (const f of provincias.features) {
    const { id, codigo, nombre } = f.properties;
    await prisma.provincia.upsert({
      where: { id },
      update: { codigo, nombre },
      create: { id, codigo, nombre },
    });
  }
  console.log(`Provincias sembradas: ${provincias.features.length}`);

  for (const f of municipios.features) {
    const { id, nombre, provinciaId } = f.properties;
    await prisma.municipio.upsert({
      where: { id },
      update: { nombre, provinciaId },
      create: { id, nombre, provinciaId },
    });
  }
  console.log(`Municipios sembrados: ${municipios.features.length}`);
}

const SECRETARIAS = [
  { nombre: "Juventud", descripcion: "Secretaría de la Juventud" },
  { nombre: "Organización", descripcion: "Secretaría de Organización" },
  { nombre: "Finanzas", descripcion: "Secretaría de Finanzas" },
  { nombre: "Comunicación", descripcion: "Secretaría de Comunicación" },
  { nombre: "Municipal", descripcion: "Secretaría de Asuntos Municipales" },
  { nombre: "Femenina", descripcion: "Secretaría Femenina" },
];

async function seedSecretarias() {
  for (const s of SECRETARIAS) {
    await prisma.secretaria.upsert({
      where: { nombre: s.nombre },
      update: {},
      create: s,
    });
  }
  console.log(`Secretarías sembradas: ${SECRETARIAS.length}`);
}

async function seedSuperadmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@fuerzadelpueblo.do";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Cayena2026!";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      nombre: "Superadministrador",
      role: Role.SUPERADMIN,
    },
  });
  console.log(`Superadmin: ${email} / ${password}`);
}

async function seedMetasYDemo() {
  const provincias = await prisma.provincia.findMany({ include: { municipios: true } });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: Role.SUPERADMIN } });

  // Meta nacional de referencia repartida de forma dispareja entre provincias
  // para poder demostrar el semáforo rojo/amarillo/verde desde el día uno.
  let i = 0;
  for (const prov of provincias) {
    const metaProvincia = 300 + (i % 5) * 150;
    await prisma.metaMilitantes.create({
      data: { provinciaId: prov.id, meta: metaProvincia },
    });
    const porMunicipio = Math.max(20, Math.round(metaProvincia / Math.max(1, prov.municipios.length)));
    for (const mun of prov.municipios) {
      await prisma.metaMilitantes.create({
        data: { municipioId: mun.id, meta: porMunicipio },
      });
    }
    i++;
  }
  console.log("Metas de militantes sembradas (provincia + municipio).");

  // Militantes demo: distribución variada para ver rojo/amarillo/verde en el mapa.
  const nombres = [
    "Juan Pérez", "María González", "Luis Ramírez", "Carmen Rosario", "Pedro Martínez",
    "Ana Castillo", "José Reyes", "Rosa Jiménez", "Miguel Cruz", "Yolanda Peña",
  ];
  const demoTargets = provincias.slice(0, 12);
  let cedulaSeq = 40100000000;
  for (const prov of demoTargets) {
    const mun = prov.municipios[0];
    if (!mun) continue;
    const cantidad = [5, 40, 90, 150, 280][Math.floor(Math.random() * 5)];
    for (let n = 0; n < Math.min(cantidad, 30); n++) {
      cedulaSeq++;
      await prisma.militante.create({
        data: {
          nombre: nombres[n % nombres.length],
          cedula: String(cedulaSeq),
          provinciaId: prov.id,
          municipioId: mun.id,
          consentimientoDatos: true,
          capturadoPorId: admin.id,
        },
      });
    }
  }
  console.log("Militantes demo sembrados.");

  // Obra de gobierno demo
  const santiago = provincias.find((p) => p.nombre === "Santiago");
  if (santiago && santiago.municipios[0]) {
    await prisma.obra.create({
      data: {
        titulo: "Remodelación Hospital Regional",
        resena: "Remodelación completa de la sala de emergencias, ampliación de camas y nuevo equipo de diagnóstico.",
        categoria: CategoriaObra.SALUD,
        fotos: [],
        lat: 19.4517,
        lng: -70.6970,
        provinciaId: santiago.id,
        municipioId: santiago.municipios[0].id,
        publicada: true,
        creadoPorId: admin.id,
      },
    });
    console.log("Obra demo sembrada.");
  }

  // Actividad demo
  const secretariaJuventud = await prisma.secretaria.findFirstOrThrow({ where: { nombre: "Juventud" } });
  await prisma.actividad.create({
    data: {
      titulo: "Encuentro Juvenil FP",
      descripcion: "Encuentro nacional de jóvenes militantes.",
      fecha: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      ubicacion: "Santo Domingo",
      fotos: [],
      secretariaId: secretariaJuventud.id,
      publicadaApp: true,
      creadoPorId: admin.id,
    },
  });
  console.log("Actividad demo sembrada.");
}

async function seedInsignias() {
  await prisma.insigniaDefinicion.upsert({
    where: { codigo: "BIENVENIDA" },
    update: {},
    create: {
      codigo: "BIENVENIDA",
      nombre: "Bienvenida",
      descripcion: "Te uniste a Fuerza del Pueblo",
      puntos: 10,
    },
  });
  console.log("Insignias sembradas.");
}

async function main() {
  await seedGeografia();
  await seedSecretarias();
  await seedSuperadmin();
  await seedInsignias();
  await seedMetasYDemo();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
