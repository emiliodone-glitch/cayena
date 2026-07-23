import { prisma } from "@cayena/database";
import { enviarPushAMilitantes } from "./push";

// Recordatorio de arrastre/GOTV (RF nuevo): a ciertas horas fijas del día de
// la jornada activa, se le manda un push a los militantes que TODAVÍA no
// confirmaron su voto (ni autoreporte ni fiscal de mesa) — el empujón que le
// falta a la herramienta de "solo medir" para ayudar a mover el resultado.
// Mismo criterio horario que verificarBajaParticipacionCierre (lib/alertasVotacion.ts).
const HORARIOS_RECORDATORIO = ["11:00", "14:00", "16:00"];
const MARGEN_MINUTOS = 7; // tolerancia para que el intervalo de chequeo no se salte el horario

function esHoy(fecha: Date): boolean {
  const hoy = new Date();
  return (
    fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth() && fecha.getDate() === hoy.getDate()
  );
}

function horarioActualCercaDe(horario: string): boolean {
  const [h, m] = horario.split(":").map(Number);
  const ahora = new Date();
  const minutosObjetivo = h * 60 + m;
  const minutosActuales = ahora.getHours() * 60 + ahora.getMinutes();
  return Math.abs(minutosActuales - minutosObjetivo) <= MARGEN_MINUTOS;
}

export async function verificarRecordatorioVoto(): Promise<number> {
  const evento = await prisma.eventoElectoral.findFirst({ where: { activo: true } });
  if (!evento || !esHoy(evento.fecha)) return 0;

  const horario = HORARIOS_RECORDATORIO.find(horarioActualCercaDe);
  if (!horario) return 0;

  // @@unique([eventoId, hora]) evita el duplicado si el chequeo periódico
  // vuelve a caer dentro de la misma ventana de margen.
  const yaEnviado = await prisma.recordatorioVoto.findUnique({
    where: { eventoId_hora: { eventoId: evento.id, hora: horario } },
  });
  if (yaEnviado) return 0;

  const pendientes = await prisma.militante.findMany({
    where: { confirmacionesVoto: { none: { eventoId: evento.id } } },
    select: { id: true },
  });
  const militanteIds = pendientes.map((m) => m.id);

  if (militanteIds.length > 0) {
    await enviarPushAMilitantes(
      militanteIds,
      "¿Ya votaste?",
      "Todavía no nos confirman tu voto en la jornada de hoy — recuerda marcarlo desde tu carnet en cuanto votes.",
      "RECORDATORIO_VOTO",
    );
  }
  await prisma.recordatorioVoto.create({ data: { eventoId: evento.id, hora: horario, enviados: militanteIds.length } });
  return militanteIds.length;
}

export function iniciarRecordatorioVoto() {
  const CINCO_MIN_MS = 5 * 60 * 1000;
  setInterval(() => {
    verificarRecordatorioVoto().catch((err) => console.error("Error verificando recordatorio de voto:", err));
  }, CINCO_MIN_MS);
}
