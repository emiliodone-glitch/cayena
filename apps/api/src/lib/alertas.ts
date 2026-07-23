import { prisma, Prisma } from "@cayena/database";
import { calcularEstadoAvance } from "@cayena/shared";
import { enviarPushAUsuario } from "./push";

const DIAS_SIN_AVANCE = 14;
const DIAS_ANTI_SPAM = 7;

async function yaAlertadoRecientemente(titulo: string): Promise<boolean> {
  const desde = new Date(Date.now() - DIAS_ANTI_SPAM * 24 * 3600 * 1000);
  const existente = await prisma.notificacion.findFirst({
    where: { tipo: "ALERTA_META", titulo, enviadaAt: { gte: desde } },
  });
  return !!existente;
}

// Si se encuentra un responsable de esa demarcación exacta (usuario con el
// territorio asignado), la alerta se le dirige a él (push + campanita); si
// no hay nadie asignado todavía, se guarda como antes — un registro general
// visible para SUPERADMIN/JEFE_SECRETARIA en el historial.
async function crearAlerta(titulo: string, cuerpo: string, responsableId: string | null) {
  if (await yaAlertadoRecientemente(titulo)) return;
  if (responsableId) {
    await enviarPushAUsuario(responsableId, titulo, cuerpo, "ALERTA_META");
  } else {
    await prisma.notificacion.create({ data: { titulo, cuerpo, tipo: "ALERTA_META", destinatarios: 0 } });
  }
}

type CampoTerritorio = "provinciaId" | "municipioId" | "distritoMunicipalId";

function whereMilitante(campo: CampoTerritorio, id: string): Prisma.MilitanteWhereInput {
  if (campo === "provinciaId") return { provinciaId: id };
  if (campo === "municipioId") return { municipioId: id };
  return { distritoMunicipalId: id };
}

function whereResponsable(campo: CampoTerritorio, id: string): Prisma.UserWhereInput {
  if (campo === "provinciaId") return { provinciaId: id, active: true };
  if (campo === "municipioId") return { municipioId: id, active: true };
  return { distritoMunicipalId: id, active: true };
}

// Chequeo genérico de estancamiento para un nivel geográfico (provincia,
// municipio o distrito municipal) — mismo criterio que usa el mapa para
// pintar el borde/badge de "estancada": meta sin cumplir + sin militantes
// nuevos en DIAS_SIN_AVANCE días.
async function verificarNivel(
  campo: CampoTerritorio,
  demarcaciones: { id: string; nombre: string }[],
  metaPorId: Map<string, number>,
  limite: Date,
  // A nivel provincia se mantiene el comportamiento histórico (alerta
  // general aunque nadie esté asignado). A nivel municipio/distrito son
  // ~158+ demarcaciones — la mayoría sin meta ni responsable propio
  // todavía — así que ahí solo tiene sentido generar la alerta si hay a
  // quién dirigírsela; si no, sería puro ruido sin nadie que pueda actuar.
  soloSiHayResponsable: boolean,
): Promise<number> {
  let generadas = 0;
  for (const d of demarcaciones) {
    const meta = metaPorId.get(d.id) ?? 0;
    const captados = await prisma.militante.count({ where: whereMilitante(campo, d.id) });
    const estado = calcularEstadoAvance(captados, meta);
    if (estado === "verde") continue;

    const ultimoRegistro = await prisma.militante.findFirst({
      where: whereMilitante(campo, d.id),
      orderBy: { createdAt: "desc" },
    });
    const sinAvanceReciente = !ultimoRegistro || ultimoRegistro.createdAt < limite;
    if (!sinAvanceReciente) continue;

    const responsable = await prisma.user.findFirst({ where: whereResponsable(campo, d.id) });
    if (soloSiHayResponsable && !responsable) continue;
    await crearAlerta(
      `Meta estancada: ${d.nombre}`,
      `${d.nombre} no registra nuevos militantes en los últimos ${DIAS_SIN_AVANCE} días y su meta sigue en estado "${estado}".`,
      responsable?.id ?? null,
    );
    generadas++;
  }
  return generadas;
}

function mapaMetas(metas: { provinciaId?: string | null; municipioId?: string | null; distritoMunicipalId?: string | null; meta: number }[], campo: CampoTerritorio): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of metas) {
    const id = m[campo];
    if (id && !map.has(id)) map.set(id, m.meta);
  }
  return map;
}

// Fase 2: detecta demarcaciones y metas POA sin avance reciente y genera
// alertas — dirigidas al responsable de esa zona si hay uno asignado
// (ver middleware/auth.ts sobre territorio), o al historial general si no.
export async function verificarEstancamientoMetas() {
  const limite = new Date(Date.now() - DIAS_SIN_AVANCE * 24 * 3600 * 1000);
  let alertasGeneradas = 0;

  const [provincias, municipios, distritos, metasActivas] = await Promise.all([
    prisma.provincia.findMany({ select: { id: true, nombre: true } }),
    prisma.municipio.findMany({ select: { id: true, nombre: true } }),
    prisma.distritoMunicipal.findMany({ select: { id: true, nombre: true } }),
    prisma.metaMilitantes.findMany({ where: { vigenciaHasta: null } }),
  ]);

  alertasGeneradas += await verificarNivel(
    "provinciaId",
    provincias,
    mapaMetas(metasActivas, "provinciaId"),
    limite,
    false,
  );
  alertasGeneradas += await verificarNivel(
    "municipioId",
    municipios,
    mapaMetas(metasActivas, "municipioId"),
    limite,
    true,
  );
  alertasGeneradas += await verificarNivel(
    "distritoMunicipalId",
    distritos,
    mapaMetas(metasActivas, "distritoMunicipalId"),
    limite,
    true,
  );

  const metasPoa = await prisma.metaPOA.findMany({
    where: { fechaLimite: { gte: new Date() } },
    include: { secretaria: true, avances: { orderBy: { fecha: "desc" }, take: 1 } },
  });
  for (const meta of metasPoa) {
    const totalAvance = await prisma.avancePOA.aggregate({
      where: { metaPoaId: meta.id },
      _sum: { valor: true },
    });
    const porcentaje = meta.indicadorObjetivo > 0 ? (totalAvance._sum.valor ?? 0) / meta.indicadorObjetivo : 0;
    if (porcentaje >= 1) continue;

    const ultimoAvance = meta.avances[0];
    const sinAvanceReciente = !ultimoAvance || ultimoAvance.fecha < limite;
    if (sinAvanceReciente) {
      // El POA es por secretaría, no por territorio geográfico — se le
      // avisa al jefe de esa secretaría si hay uno, si no queda como antes.
      const jefe = await prisma.user.findFirst({
        where: { secretariaId: meta.secretariaId, role: "JEFE_SECRETARIA", active: true },
      });
      await crearAlerta(
        `POA estancado: ${meta.nombre}`,
        `La meta "${meta.nombre}" de ${meta.secretaria.nombre} no registra avances en los últimos ${DIAS_SIN_AVANCE} días (${Math.round(porcentaje * 100)}% completado).`,
        jefe?.id ?? null,
      );
      alertasGeneradas++;
    }
  }

  return alertasGeneradas;
}

export function iniciarVerificacionPeriodica() {
  const UN_DIA_MS = 24 * 3600 * 1000;
  // Primera corrida a los 5 minutos de arrancar (deja que el seed/migraciones asienten), luego cada 24h.
  setTimeout(() => {
    verificarEstancamientoMetas().catch((err) => console.error("Error verificando estancamiento de metas:", err));
    setInterval(() => {
      verificarEstancamientoMetas().catch((err) => console.error("Error verificando estancamiento de metas:", err));
    }, UN_DIA_MS);
  }, 5 * 60 * 1000);
}
