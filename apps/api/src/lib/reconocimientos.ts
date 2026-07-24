import { prisma } from "@cayena/database";
import { enviarPushAUsuario } from "./push";
import { calcularRankingSecretarias } from "./rankingSecretarias";

// Reconocimientos automáticos de ranking (RF nuevo, "premiar el trabajo de
// los más rankeados"): al cerrarse cada ciclo de calendario (semana ISO, mes
// o trimestre natural) se guarda el top 3 de promotores por militantes
// captados EN ese ciclo, y el top 3 de secretarías por puntaje al momento
// del cierre — y se le avisa por push a cada premiado. A diferencia de los
// filtros "semana/mes/trimestre" del ranking en vivo (ventanas móviles que
// se recalculan todo el tiempo, sin un cierre discreto), acá el ciclo queda
// fijo apenas termina, así el reconocimiento no cambia después aunque la
// captación de otros siga.

type PeriodoReconocimiento = "semana" | "mes" | "trimestre";
const PERIODOS: PeriodoReconocimiento[] = ["semana", "mes", "trimestre"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Número de semana ISO-8601 (lunes=inicio, la semana 1 es la que contiene
// el primer jueves del año) — mismo criterio usado internacionalmente para
// evitar semanas "partidas" entre fin de año.
function semanaISO(fecha: Date): { anio: number; semana: number } {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7; // lunes=1 ... domingo=7
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
  return { anio: d.getUTCFullYear(), semana };
}

// El último ciclo YA CERRADO de este tipo, visto desde `ahora` — nunca el
// ciclo en curso (todavía no terminó, no hay nada que premiar).
function ultimoCicloCerrado(periodo: PeriodoReconocimiento, ahora: Date): { cicloId: string; inicio: Date; fin: Date } {
  if (periodo === "semana") {
    const diaSemanaActual = ahora.getDay() || 7;
    const inicioSemanaActual = new Date(ahora);
    inicioSemanaActual.setHours(0, 0, 0, 0);
    inicioSemanaActual.setDate(inicioSemanaActual.getDate() - (diaSemanaActual - 1));
    const fin = new Date(inicioSemanaActual.getTime() - 1);
    const inicio = new Date(inicioSemanaActual);
    inicio.setDate(inicio.getDate() - 7);
    const { anio, semana } = semanaISO(inicio);
    return { cicloId: `${anio}-W${pad2(semana)}`, inicio, fin };
  }
  if (periodo === "mes") {
    const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const fin = new Date(inicioMesActual.getTime() - 1);
    const inicio = new Date(fin.getFullYear(), fin.getMonth(), 1);
    return { cicloId: `${inicio.getFullYear()}-${pad2(inicio.getMonth() + 1)}`, inicio, fin };
  }
  // trimestre
  const trimestreActual = Math.floor(ahora.getMonth() / 3);
  const inicioTrimActual = new Date(ahora.getFullYear(), trimestreActual * 3, 1);
  const fin = new Date(inicioTrimActual.getTime() - 1);
  const trimAnterior = Math.floor(fin.getMonth() / 3);
  const inicio = new Date(fin.getFullYear(), trimAnterior * 3, 1);
  return { cicloId: `${inicio.getFullYear()}-Q${trimAnterior + 1}`, inicio, fin };
}

function etiquetaPeriodo(periodo: PeriodoReconocimiento): string {
  if (periodo === "semana") return "la semana";
  if (periodo === "mes") return "el mes";
  return "el trimestre";
}

async function otorgarPromotores(periodo: PeriodoReconocimiento, cicloId: string, inicio: Date, fin: Date) {
  const conteos = await prisma.militante.groupBy({
    by: ["capturadoPorId"],
    where: { capturadoPorId: { not: null }, createdAt: { gte: inicio, lte: fin } },
    _count: { _all: true },
    orderBy: { _count: { capturadoPorId: "desc" } },
    take: 3,
  });
  if (conteos.length === 0) return;

  const usuarios = await prisma.user.findMany({
    where: { id: { in: conteos.map((c) => c.capturadoPorId as string) } },
    select: { id: true, nombre: true },
  });
  const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));

  for (let i = 0; i < conteos.length; i++) {
    const userId = conteos[i].capturadoPorId as string;
    const u = usuarioPorId.get(userId);
    if (!u) continue;
    const rango = i + 1;
    const valor = conteos[i]._count._all;
    await prisma.reconocimientoRanking.create({
      data: { tipo: "PROMOTOR", periodo, cicloId, rango, userId, nombre: u.nombre, valor },
    });
    await enviarPushAUsuario(
      userId,
      `🏆 #${rango} del ranking en ${etiquetaPeriodo(periodo)}`,
      `¡Felicidades, ${u.nombre}! Quedaste #${rango} con ${valor} militantes captados. Sigue así.`,
      "RECONOCIMIENTO_RANKING",
    );
  }
}

async function otorgarSecretarias(periodo: PeriodoReconocimiento, cicloId: string, inicio: Date, fin: Date) {
  const ranking = await calcularRankingSecretarias({ inicio, fin });
  const top3 = ranking.slice(0, 3).filter((s) => s.puntaje > 0);
  for (let i = 0; i < top3.length; i++) {
    const s = top3[i];
    const rango = i + 1;
    await prisma.reconocimientoRanking.create({
      data: { tipo: "SECRETARIA", periodo, cicloId, rango, secretariaId: s.id, nombre: s.nombre, valor: s.puntaje },
    });
    if (s.titularId) {
      await enviarPushAUsuario(
        s.titularId,
        `🏆 Secretaría #${rango} del ranking en ${etiquetaPeriodo(periodo)}`,
        `¡Felicidades! La secretaría de ${s.nombre} quedó #${rango} con un puntaje de ${s.puntaje}/100. Buen trabajo de todo el equipo.`,
        "RECONOCIMIENTO_RANKING",
      );
    }
  }
}

async function verificarCicloPeriodo(periodo: PeriodoReconocimiento) {
  const { cicloId, inicio, fin } = ultimoCicloCerrado(periodo, new Date());
  const yaOtorgado = await prisma.reconocimientoRanking.findFirst({ where: { periodo, cicloId } });
  if (yaOtorgado) return;
  await otorgarPromotores(periodo, cicloId, inicio, fin);
  await otorgarSecretarias(periodo, cicloId, inicio, fin);
}

export async function verificarReconocimientos() {
  for (const periodo of PERIODOS) {
    try {
      await verificarCicloPeriodo(periodo);
    } catch (err) {
      console.error(`Error otorgando reconocimientos de ranking (${periodo}):`, err);
    }
  }
}

export function iniciarVerificacionReconocimientos() {
  const UN_DIA_MS = 24 * 3600 * 1000;
  // Corre una vez al día — como el cierre de cada ciclo (semana/mes/
  // trimestre) puede caer a cualquier hora, revisar diario y guardar contra
  // duplicados por cicloId (constraint única) es más simple y robusto que
  // tratar de disparar exactamente en el instante del corte, y se
  // autocorrige solo si el proceso estuvo caído justo ese día.
  setTimeout(() => {
    verificarReconocimientos().catch((err) => console.error("Error verificando reconocimientos de ranking:", err));
    setInterval(() => {
      verificarReconocimientos().catch((err) => console.error("Error verificando reconocimientos de ranking:", err));
    }, UN_DIA_MS);
  }, 5 * 60 * 1000);
}
