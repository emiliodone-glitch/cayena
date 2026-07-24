import { prisma } from "@cayena/database";
import { ultimaActividad } from "./saludSecretaria";

// Compartido entre GET /secretarias/ranking (vista en vivo, con selector de
// período) y el job de reconocimientos (apps/api/src/lib/reconocimientos.ts,
// que otorga el top 3 al cerrarse cada ciclo) — para que ambos midan el
// puntaje exactamente de la misma forma.

const TOPE_INFORMES = 5;
const DIAS_MAX_ACTIVIDAD = 30;

export type FilaRankingSecretaria = {
  id: string;
  nombre: string;
  titular: string | null;
  titularActivo: boolean;
  titularId: string | null;
  avancePromedioObjetivos: number | null;
  informesSubidos: number;
  informesTope: number;
  diasSinActividad: number | null;
  puntaje: number;
};

// `rango` opcional: si se da, "informes subidos" solo cuenta los subidos
// dentro de ese rango de fechas (para el selector de período de la
// pantalla) — el avance de objetivos y los días sin actividad son estados
// VIGENTES (no algo que se pueda reconstruir de forma fiel para una fecha
// pasada, no hay foto histórica de ellos), así que se calculan siempre con
// el dato actual sin importar el período elegido.
export async function calcularRankingSecretarias(rango?: { inicio: Date; fin: Date }): Promise<FilaRankingSecretaria[]> {
  const secretarias = await prisma.secretaria.findMany({
    include: {
      titular: { select: { id: true, nombre: true, active: true } },
      metasPoa: { include: { avances: true } },
      informes: rango
        ? { where: { createdAt: { gte: rango.inicio, lte: rango.fin } }, select: { id: true } }
        : { select: { id: true } },
    },
  });

  const filas = await Promise.all(
    secretarias.map(async (s) => {
      const objetivos = s.metasPoa.map((m) => {
        const totalAvance = m.avances.reduce((sum, a) => sum + a.valor, 0);
        return m.indicadorObjetivo > 0 ? Math.min(1, totalAvance / m.indicadorObjetivo) : 0;
      });
      const avancePromedio =
        objetivos.length > 0 ? Math.round((objetivos.reduce((s2, p) => s2 + p, 0) / objetivos.length) * 100) : null;
      const reciente = await ultimaActividad(s.id);
      const diasSinActividad = reciente ? Math.floor((Date.now() - reciente.getTime()) / (24 * 3600 * 1000)) : null;

      // Puntaje 0-100: 50% avance de objetivos, 25% informes subidos (tope
      // 5, o sea 20 puntos cada uno), 25% actividad reciente — así una
      // secretaría sin objetivos definidos todavía no queda en cero solo
      // por eso.
      //
      // La porción de actividad usa un GRADIENTE (100 puntos con actividad
      // hoy mismo, bajando en línea recta hasta 0 a los 30 días) en vez de
      // un corte binario (100 o 0 antes/después de los 30 días): con el
      // corte, una secretaría a los 29 días y otra a los 31 quedaban con
      // puntajes opuestos por una sola jornada de diferencia, un salto que
      // no reflejaba de verdad qué tan al día estaba cada una.
      const puntajeObjetivos = avancePromedio ?? 0;
      const puntajeInformes = Math.min(TOPE_INFORMES, s.informes.length) * (100 / TOPE_INFORMES);
      const puntajeActividad =
        diasSinActividad == null ? 0 : Math.round(Math.max(0, 1 - diasSinActividad / DIAS_MAX_ACTIVIDAD) * 100);
      const puntaje = Math.round(puntajeObjetivos * 0.5 + puntajeInformes * 0.25 + puntajeActividad * 0.25);

      return {
        id: s.id,
        nombre: s.nombre,
        // El nombre del titular se muestra siempre que esté designado —
        // "inactivo" (todavía no activó su cuenta) no es lo mismo que
        // "vacante" (nadie designado); el frontend distingue ambos casos
        // con titularActivo.
        titular: s.titular?.nombre ?? null,
        titularActivo: s.titular?.active ?? false,
        titularId: s.titular?.id ?? null,
        avancePromedioObjetivos: avancePromedio,
        informesSubidos: s.informes.length,
        informesTope: TOPE_INFORMES,
        diasSinActividad,
        puntaje,
      };
    }),
  );

  filas.sort((a, b) => b.puntaje - a.puntaje);
  return filas;
}
