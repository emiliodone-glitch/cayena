import { prisma } from "@cayena/database";
import { enviarPushAUsuario } from "./push";

// Alertas de Día Electoral: baja participación cerca del cierre de mesas,
// dirigidas al responsable de territorio de esa provincia (mismo patrón que
// lib/alertas.ts, pero con ventana de tiempo horaria en vez de días —
// durante la jornada electoral las cosas cambian rápido, no tiene sentido
// esperar 24h para volver a chequear).
const UMBRAL_PARTICIPACION_BAJA = 30; // % sobre la propia base de militantes
const HORAS_ANTES_CIERRE = 2;
const HORA_CIERRE_VOTACION = 17; // 5pm, cierre típico de mesas en RD
const HORAS_ANTI_SPAM = 3;

async function yaAlertadoRecientemente(titulo: string): Promise<boolean> {
  const desde = new Date(Date.now() - HORAS_ANTI_SPAM * 3600 * 1000);
  const existente = await prisma.notificacion.findFirst({
    where: { tipo: "ALERTA_VOTACION", titulo, enviadaAt: { gte: desde } },
  });
  return !!existente;
}

async function crearAlertaVotacion(titulo: string, cuerpo: string, responsableId: string | null) {
  if (await yaAlertadoRecientemente(titulo)) return;
  if (responsableId) {
    await enviarPushAUsuario(responsableId, titulo, cuerpo, "ALERTA_VOTACION");
  } else {
    await prisma.notificacion.create({ data: { titulo, cuerpo, tipo: "ALERTA_VOTACION", destinatarios: 0 } });
  }
}

export async function verificarBajaParticipacionCierre(): Promise<number> {
  const evento = await prisma.eventoElectoral.findFirst({ where: { activo: true } });
  if (!evento) return 0; // sin jornada electoral activa, no hay nada que verificar

  const ahora = new Date();
  const horaActual = ahora.getHours() + ahora.getMinutes() / 60;
  const faltaParaCierre = HORA_CIERRE_VOTACION - horaActual;
  if (faltaParaCierre > HORAS_ANTES_CIERRE || faltaParaCierre < 0) return 0;

  let generadas = 0;
  const provincias = await prisma.provincia.findMany({ select: { id: true, nombre: true } });
  for (const p of provincias) {
    const [registrados, confirmados] = await Promise.all([
      prisma.militante.count({ where: { provinciaId: p.id } }),
      prisma.confirmacionVoto.count({ where: { eventoId: evento.id, militante: { provinciaId: p.id } } }),
    ]);
    if (registrados === 0) continue;
    const porcentaje = (confirmados / registrados) * 100;
    if (porcentaje >= UMBRAL_PARTICIPACION_BAJA) continue;

    const responsable = await prisma.user.findFirst({ where: { provinciaId: p.id, active: true } });
    await crearAlertaVotacion(
      `Baja participación: ${p.nombre}`,
      `${p.nombre} lleva ${Math.round(porcentaje)}% de sus militantes confirmados a ${Math.max(1, Math.ceil(faltaParaCierre))}h del cierre. Conviene reforzar el arrastre.`,
      responsable?.id ?? null,
    );
    generadas++;
  }
  return generadas;
}

export function iniciarVerificacionVotacion() {
  const QUINCE_MIN_MS = 15 * 60 * 1000;
  setInterval(() => {
    verificarBajaParticipacionCierre().catch((err) => console.error("Error verificando baja participación electoral:", err));
  }, QUINCE_MIN_MS);
}
