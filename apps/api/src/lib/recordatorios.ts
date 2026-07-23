import { prisma } from "@cayena/database";
import { enviarPushAMilitantes } from "./push";

const VENTANA_HORAS_ANTES = 24;
const MARGEN_HORAS = 1; // tolerancia para que el intervalo de chequeo no se salte actividades

// Recordatorio de actividades: a los militantes que confirmaron asistencia
// (RSVP) a una actividad publicada cuya fecha cae dentro de las próximas
// ~24h, se les manda un push. `recordatorioEnviado` evita reenviarlo cada
// vez que corre el chequeo periódico.
export async function verificarRecordatorioActividades(): Promise<number> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() + (VENTANA_HORAS_ANTES - MARGEN_HORAS) * 3600 * 1000);
  const hasta = new Date(ahora.getTime() + (VENTANA_HORAS_ANTES + MARGEN_HORAS) * 3600 * 1000);

  const actividades = await prisma.actividad.findMany({
    where: {
      publicadaApp: true,
      recordatorioEnviado: false,
      fecha: { gte: desde, lte: hasta },
    },
    select: {
      id: true,
      titulo: true,
      ubicacion: true,
      asistencias: { where: { confirmado: true }, select: { militanteId: true } },
    },
  });

  let enviados = 0;
  for (const actividad of actividades) {
    const militanteIds = actividad.asistencias.map((a) => a.militanteId);
    if (militanteIds.length > 0) {
      const cuerpo = actividad.ubicacion
        ? `Mañana: ${actividad.titulo} — ${actividad.ubicacion}`
        : `Mañana: ${actividad.titulo}`;
      await enviarPushAMilitantes(militanteIds, "Recordatorio de actividad", cuerpo, "ACTIVIDAD");
      enviados++;
    }
    await prisma.actividad.update({ where: { id: actividad.id }, data: { recordatorioEnviado: true } });
  }
  return enviados;
}

export function iniciarRecordatorioActividades() {
  const UNA_HORA_MS = 3600 * 1000;
  setTimeout(() => {
    verificarRecordatorioActividades().catch((err) => console.error("Error verificando recordatorio de actividades:", err));
    setInterval(() => {
      verificarRecordatorioActividades().catch((err) => console.error("Error verificando recordatorio de actividades:", err));
    }, UNA_HORA_MS);
  }, 5 * 60 * 1000);
}
