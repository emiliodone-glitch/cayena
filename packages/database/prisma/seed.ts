import fs from "fs";
import path from "path";
import crypto from "crypto";
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

// Organigrama oficial vigente: nombre corto (como ya se venía usando en el
// resto de la app — dropdowns, tarjetas, etc. — que muestran el nombre tal
// cual, sin anteponerle "Secretaría de") + el titular actual en la
// descripción. "Vacante / sin titular" cuando no hay nadie designado.
const SECRETARIAS = [
  { nombre: "Organización", descripcion: "Titular: Bautista Rojas Gómez" },
  { nombre: "Propaganda", descripcion: "Titular: César Arturo Fernández" },
  { nombre: "Informática", descripcion: "Titular: Domingo Tavárez" },
  { nombre: "Gestión Operativa y Eventos", descripcion: "Titular: Franklin de Jesús Labour" },
  { nombre: "Formación Política", descripcion: "Vacante / sin titular" },
  { nombre: "Movilidad y Transporte", descripcion: "Titular: Germán Peña Guadalupe" },
  { nombre: "Fiscalización, Evaluación y Control", descripcion: "Titular: Luis Daniel Beltré López" },
  { nombre: "Asuntos Electorales", descripcion: "Titular: Luis Toral Córdova" },
  { nombre: "Finanzas", descripcion: "Titular: Nicolás Calderón" },
  { nombre: "Comunicación", descripcion: "Titular: Rafael Omar Liriano" },
  { nombre: "Ética, Transparencia y Rendición de Cuentas", descripcion: "Titular: Ruth Divina Méndez" },
  { nombre: "Asuntos Profesionales y Gremiales", descripcion: "Titular: Freddy Pérez" },
  { nombre: "Asuntos Laborales", descripcion: "Titular: Nelsida Marmolejos" },
  { nombre: "Deportes", descripcion: 'Titular: Felipe "Jay" Payano' },
  { nombre: "de la Mujer", descripcion: "Titular: Angie Brooks" },
  { nombre: "Relación entre Partidos Políticos y Sociedad Civil", descripcion: "Titular: Aníbal García Duvergé" },
  { nombre: "Juventud", descripcion: "Titular: Lenin Campos" },
  { nombre: "Asuntos Comunitarios", descripcion: "Titular: Juana Sánchez" },
  { nombre: "Cultos", descripcion: "Titular: Francisco Cruz Pascual" },
  { nombre: "Niños, Niñas y Adolescentes", descripcion: "Titular: Milqueya Emilia Monteagudo" },
];

// Secretarías que existían en un organigrama anterior y ya no están en la
// lista oficial vigente (SECRETARIAS de arriba): "Femenina" se renombra a su
// nombre actual ("de la Mujer", que sí sembrará seedSecretarias) en vez de
// quedar duplicada, y "Municipal" se elimina por no tener equivalente — solo
// si no quedó nada vinculado a ella (para no perder datos reales por error).
async function migrarSecretariasLegado() {
  const femenina = await prisma.secretaria.findUnique({ where: { nombre: "Femenina" } });
  if (femenina) {
    await prisma.secretaria.update({ where: { id: femenina.id }, data: { nombre: "de la Mujer" } });
    console.log('Secretaría "Femenina" renombrada a "de la Mujer".');
  }

  const municipal = await prisma.secretaria.findUnique({
    where: { nombre: "Municipal" },
    include: {
      _count: { select: { usuarios: true, actividades: true, documentos: true, gastos: true, metasPoa: true } },
    },
  });
  if (municipal) {
    const c = municipal._count;
    const sinDatosVinculados = c.usuarios + c.actividades + c.documentos + c.gastos + c.metasPoa === 0;
    if (sinDatosVinculados) {
      await prisma.secretaria.delete({ where: { id: municipal.id } });
      console.log('Secretaría "Municipal" eliminada (sin equivalente en el organigrama vigente).');
    } else {
      console.warn('Secretaría "Municipal" tiene datos vinculados — no se elimina automáticamente.');
    }
  }
}

async function seedSecretarias() {
  for (const s of SECRETARIAS) {
    await prisma.secretaria.upsert({
      where: { nombre: s.nombre },
      update: { descripcion: s.descripcion },
      create: s,
    });
  }
  console.log(`Secretarías sembradas: ${SECRETARIAS.length}`);
}

// Un usuario JEFE_SECRETARIA por titular, para que cada quien tenga su
// cuenta en el sistema desde ya. Quedan INACTIVOS a propósito: el correo es
// un placeholder (todavía no se cargó el real de cada persona) y no tienen
// contraseña conocida — un SUPERADMIN debe entrar a Usuarios, corregir el
// correo, fijar una contraseña y activar la cuenta antes de que puedan
// iniciar sesión (active:false ya bloquea el login por sí solo).
const TITULARES = [
  { secretaria: "Organización", nombre: "Bautista Rojas Gómez", email: "bautista.rojas@fuerzadelpueblo.do" },
  { secretaria: "Propaganda", nombre: "César Arturo Fernández", email: "cesar.fernandez@fuerzadelpueblo.do" },
  { secretaria: "Informática", nombre: "Domingo Tavárez", email: "domingo.tavarez@fuerzadelpueblo.do" },
  {
    secretaria: "Gestión Operativa y Eventos",
    nombre: "Franklin de Jesús Labour",
    email: "franklin.labour@fuerzadelpueblo.do",
  },
  // Formación Política: vacante, sin usuario.
  { secretaria: "Movilidad y Transporte", nombre: "Germán Peña Guadalupe", email: "german.pena@fuerzadelpueblo.do" },
  {
    secretaria: "Fiscalización, Evaluación y Control",
    nombre: "Luis Daniel Beltré López",
    email: "luis.beltre@fuerzadelpueblo.do",
  },
  { secretaria: "Asuntos Electorales", nombre: "Luis Toral Córdova", email: "luis.toral@fuerzadelpueblo.do" },
  { secretaria: "Finanzas", nombre: "Nicolás Calderón", email: "nicolas.calderon@fuerzadelpueblo.do" },
  { secretaria: "Comunicación", nombre: "Rafael Omar Liriano", email: "rafael.liriano@fuerzadelpueblo.do" },
  {
    secretaria: "Ética, Transparencia y Rendición de Cuentas",
    nombre: "Ruth Divina Méndez",
    email: "ruth.mendez@fuerzadelpueblo.do",
  },
  {
    secretaria: "Asuntos Profesionales y Gremiales",
    nombre: "Freddy Pérez",
    email: "freddy.perez@fuerzadelpueblo.do",
  },
  { secretaria: "Asuntos Laborales", nombre: "Nelsida Marmolejos", email: "nelsida.marmolejos@fuerzadelpueblo.do" },
  { secretaria: "Deportes", nombre: 'Felipe "Jay" Payano', email: "felipe.payano@fuerzadelpueblo.do" },
  { secretaria: "de la Mujer", nombre: "Angie Brooks", email: "angie.brooks@fuerzadelpueblo.do" },
  {
    secretaria: "Relación entre Partidos Políticos y Sociedad Civil",
    nombre: "Aníbal García Duvergé",
    email: "anibal.garcia@fuerzadelpueblo.do",
  },
  { secretaria: "Juventud", nombre: "Lenin Campos", email: "lenin.campos@fuerzadelpueblo.do" },
  { secretaria: "Asuntos Comunitarios", nombre: "Juana Sánchez", email: "juana.sanchez@fuerzadelpueblo.do" },
  { secretaria: "Cultos", nombre: "Francisco Cruz Pascual", email: "francisco.cruz@fuerzadelpueblo.do" },
  {
    secretaria: "Niños, Niñas y Adolescentes",
    nombre: "Milqueya Emilia Monteagudo",
    email: "milqueya.monteagudo@fuerzadelpueblo.do",
  },
];

async function seedTitulares() {
  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
  let creados = 0;
  for (const t of TITULARES) {
    const secretaria = await prisma.secretaria.findUniqueOrThrow({ where: { nombre: t.secretaria } });
    await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email,
        passwordHash,
        nombre: t.nombre,
        role: Role.JEFE_SECRETARIA,
        secretariaId: secretaria.id,
        active: false,
      },
    });
    creados++;
  }
  console.log(`Usuarios de titulares sembrados (inactivos, pendientes de correo real): ${creados}`);
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
  await migrarSecretariasLegado();
  await seedSecretarias();
  await seedSuperadmin();
  await seedTitulares();
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
