import { prisma } from "@cayena/database";

// Constantes compartidas entre las alertas automáticas (lib/alertas.ts), el
// contador de pendientes del sidebar y el ranking de secretarías — todos
// deben usar exactamente el mismo criterio de "al día" / "pendiente", si no
// terminarían mostrando números distintos para la misma realidad.
export const DIA_LIMITE_INFORME = 10;
// Recordatorio proactivo: unos días antes del límite, en vez de solo avisar
// cuando ya está atrasado.
export const DIAS_ANTICIPACION_INFORME = 5;
export const DIAS_INACTIVIDAD_SECRETARIA = 30;

export function periodoAnterior(fecha: Date = new Date()): string {
  const mesAnterior = new Date(fecha.getFullYear(), fecha.getMonth() - 1, 1);
  return `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`;
}

export async function tieneInformeDelPeriodo(secretariaId: string, periodo: string): Promise<boolean> {
  const informe = await prisma.informeSecretaria.findUnique({
    where: { secretariaId_periodo: { secretariaId, periodo } },
  });
  return !!informe;
}

// Fecha del evento más reciente de cualquier tipo vinculado a una secretaría
// (actividad, gasto, documento, avance de POA o informe) — null si nunca
// tuvo ninguno.
export async function ultimaActividad(secretariaId: string): Promise<Date | null> {
  const [ultimaActividadReg, ultimoGasto, ultimoDocumento, ultimoAvance, ultimoInforme] = await Promise.all([
    prisma.actividad.findFirst({ where: { secretariaId }, orderBy: { createdAt: "desc" } }),
    prisma.gasto.findFirst({ where: { secretariaId }, orderBy: { createdAt: "desc" } }),
    prisma.documentoSecretaria.findFirst({ where: { secretariaId }, orderBy: { createdAt: "desc" } }),
    prisma.avancePOA.findFirst({ where: { metaPoa: { secretariaId } }, orderBy: { fecha: "desc" } }),
    prisma.informeSecretaria.findFirst({ where: { secretariaId }, orderBy: { createdAt: "desc" } }),
  ]);
  const fechas = [
    ultimaActividadReg?.createdAt,
    ultimoGasto?.createdAt,
    ultimoDocumento?.createdAt,
    ultimoAvance?.fecha,
    ultimoInforme?.createdAt,
  ].filter((f): f is Date => !!f);
  return fechas.length > 0 ? new Date(Math.max(...fechas.map((f) => f.getTime()))) : null;
}

export async function estaInactiva(secretariaId: string, createdAt: Date): Promise<boolean> {
  const limite = new Date(Date.now() - DIAS_INACTIVIDAD_SECRETARIA * 24 * 3600 * 1000);
  const reciente = await ultimaActividad(secretariaId);
  if (!reciente && createdAt > limite) return false; // recién creada, todavía sin margen para tener actividad
  return !reciente || reciente < limite;
}
