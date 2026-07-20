import { prisma } from "@cayena/database";
import { calcularEstadoAvance } from "@cayena/shared";

const DIAS_SIN_AVANCE = 14;
const DIAS_ANTI_SPAM = 7;

async function yaAlertadoRecientemente(titulo: string): Promise<boolean> {
  const desde = new Date(Date.now() - DIAS_ANTI_SPAM * 24 * 3600 * 1000);
  const existente = await prisma.notificacion.findFirst({
    where: { tipo: "ALERTA_META", titulo, enviadaAt: { gte: desde } },
  });
  return !!existente;
}

async function crearAlerta(titulo: string, cuerpo: string) {
  if (await yaAlertadoRecientemente(titulo)) return;
  await prisma.notificacion.create({ data: { titulo, cuerpo, tipo: "ALERTA_META", destinatarios: 0 } });
}

// Fase 2: detecta provincias y metas POA sin avance reciente y genera
// alertas internas visibles en el dashboard del back office (no se envían
// como push públicos: son información de gestión interna).
export async function verificarEstancamientoMetas() {
  const limite = new Date(Date.now() - DIAS_SIN_AVANCE * 24 * 3600 * 1000);
  let alertasGeneradas = 0;

  const provincias = await prisma.provincia.findMany();
  const metasProvincia = await prisma.metaMilitantes.findMany({
    where: { provinciaId: { not: null }, vigenciaHasta: null },
  });
  const metaPorProvincia = new Map(metasProvincia.filter((m) => m.provinciaId).map((m) => [m.provinciaId as string, m.meta]));

  for (const provincia of provincias) {
    const meta = metaPorProvincia.get(provincia.id) ?? 0;
    const captados = await prisma.militante.count({ where: { provinciaId: provincia.id } });
    const estado = calcularEstadoAvance(captados, meta);
    if (estado === "verde") continue;

    const ultimoRegistro = await prisma.militante.findFirst({
      where: { provinciaId: provincia.id },
      orderBy: { createdAt: "desc" },
    });
    const sinAvanceReciente = !ultimoRegistro || ultimoRegistro.createdAt < limite;
    if (sinAvanceReciente) {
      await crearAlerta(
        `Meta estancada: ${provincia.nombre}`,
        `${provincia.nombre} no registra nuevos militantes en los últimos ${DIAS_SIN_AVANCE} días y su meta sigue en estado "${estado}".`,
      );
      alertasGeneradas++;
    }
  }

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
      await crearAlerta(
        `POA estancado: ${meta.nombre}`,
        `La meta "${meta.nombre}" de ${meta.secretaria.nombre} no registra avances en los últimos ${DIAS_SIN_AVANCE} días (${Math.round(porcentaje * 100)}% completado).`,
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
