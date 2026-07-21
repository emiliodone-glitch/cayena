import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje } from "@cayena/shared";
import { requireAuth, requireRole, type AuthUser } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { verificarEstancamientoMetas } from "../lib/alertas";
import { obtenerAvancePorProvincia } from "../lib/geoStats";

export const dashboardRouter = Router();

function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual > 0 ? 100 : null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

type Periodo = "semana" | "mes" | "trimestre" | "custom";

function calcularRango(periodo: Periodo, desdeParam?: string, hastaParam?: string) {
  const ahora = new Date();

  if (periodo === "custom" && desdeParam && hastaParam) {
    const inicio = new Date(desdeParam);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(hastaParam);
    fin.setHours(23, 59, 59, 999);
    const duracionMs = fin.getTime() - inicio.getTime();
    const finAnterior = new Date(inicio.getTime() - 1);
    const inicioAnterior = new Date(finAnterior.getTime() - duracionMs);
    return { inicio, fin, inicioAnterior, finAnterior };
  }

  if (periodo === "semana") {
    const inicio = new Date(ahora);
    inicio.setDate(inicio.getDate() - 6);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(ahora);
    fin.setHours(23, 59, 59, 999);
    const inicioAnterior = new Date(inicio);
    inicioAnterior.setDate(inicioAnterior.getDate() - 7);
    const finAnterior = new Date(inicio.getTime() - 1);
    return { inicio, fin, inicioAnterior, finAnterior };
  }

  if (periodo === "trimestre") {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1);
    const fin = new Date(ahora);
    fin.setHours(23, 59, 59, 999);
    const inicioAnterior = new Date(inicio);
    inicioAnterior.setMonth(inicioAnterior.getMonth() - 3);
    const finAnterior = new Date(inicio.getTime() - 1);
    return { inicio, fin, inicioAnterior, finAnterior };
  }

  // mes (default)
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const fin = new Date(ahora);
  fin.setHours(23, 59, 59, 999);
  const inicioAnterior = new Date(inicio);
  inicioAnterior.setMonth(inicioAnterior.getMonth() - 1);
  const finAnterior = new Date(inicio.getTime() - 1);
  return { inicio, fin, inicioAnterior, finAnterior };
}

function serieCompleta(inicio: Date, fin: Date, filas: { dia: Date; total: bigint }[]) {
  const porDia = new Map(filas.map((f) => [f.dia.toISOString().slice(0, 10), Number(f.total)]));
  const dias: { fecha: string; total: number }[] = [];
  const cursor = new Date(inicio);
  cursor.setHours(0, 0, 0, 0);
  const finDia = new Date(fin);
  finDia.setHours(0, 0, 0, 0);
  // Límite defensivo: nunca más de 120 puntos aunque el rango custom sea largo.
  let iteraciones = 0;
  while (cursor.getTime() <= finDia.getTime() && iteraciones < 120) {
    const clave = cursor.toISOString().slice(0, 10);
    dias.push({ fecha: clave, total: porDia.get(clave) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
    iteraciones++;
  }
  return dias;
}

async function resumenGeneral(
  user: AuthUser,
  periodo: Periodo,
  desdeParam?: string,
  hastaParam?: string,
) {
  const { inicio, fin, inicioAnterior, finAnterior } = calcularRango(periodo, desdeParam, hastaParam);

  const [
    militantesTotales,
    obrasRegistradas,
    gastosPeriodoAgg,
    gastosPeriodoAnteriorAgg,
    metasNacionales,
    actividadesRecientes,
    militantesPeriodo,
    militantesPeriodoAnterior,
    serieDiariaRaw,
    gastosPorCategoriaRaw,
    avancePorProvincia,
  ] = await Promise.all([
    prisma.militante.count(),
    prisma.obra.count(),
    prisma.gasto.aggregate({ where: { tipo: "GASTO", fecha: { gte: inicio, lte: fin } }, _sum: { monto: true } }),
    prisma.gasto.aggregate({
      where: { tipo: "GASTO", fecha: { gte: inicioAnterior, lte: finAnterior } },
      _sum: { monto: true },
    }),
    prisma.metaMilitantes.findMany({ where: { provinciaId: { not: null }, vigenciaHasta: null } }),
    prisma.actividad.findMany({ orderBy: { fecha: "desc" }, take: 5 }),
    prisma.militante.count({ where: { createdAt: { gte: inicio, lte: fin } } }),
    prisma.militante.count({ where: { createdAt: { gte: inicioAnterior, lte: finAnterior } } }),
    prisma.$queryRaw<{ dia: Date; total: bigint }[]>`
      SELECT date_trunc('day', "createdAt") as dia, COUNT(*) as total
      FROM "Militante"
      WHERE "createdAt" >= ${inicio} AND "createdAt" <= ${fin}
      GROUP BY dia
      ORDER BY dia ASC
    `,
    prisma.gasto.groupBy({
      by: ["categoria"],
      where: { tipo: "GASTO", fecha: { gte: inicio, lte: fin } },
      _sum: { monto: true },
    }),
    obtenerAvancePorProvincia(),
  ]);

  const metaNacional = metasNacionales.reduce((sum, m) => sum + m.meta, 0);
  const porcentajeNacional = calcularPorcentaje(militantesTotales, metaNacional);
  const gastosPeriodo = Number(gastosPeriodoAgg._sum.monto ?? 0);
  const gastosPeriodoAnterior = Number(gastosPeriodoAnteriorAgg._sum.monto ?? 0);

  const diasEnPeriodo = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1);
  const ritmoDiario = militantesPeriodo / diasEnPeriodo;
  const ritmoMensual = ritmoDiario * 30;
  const faltantes = metaNacional - militantesTotales;
  const proyeccionMeses =
    faltantes <= 0 ? 0 : ritmoMensual > 0 ? Math.round((faltantes / ritmoMensual) * 10) / 10 : null;

  const provinciasOrdenadas = [...avancePorProvincia]
    .filter((p) => p.meta > 0)
    .sort((a, b) => b.porcentaje - a.porcentaje);

  const conteoEstados = avancePorProvincia.reduce(
    (acc, p) => {
      acc[p.estado]++;
      return acc;
    },
    { rojo: 0, amarillo: 0, verde: 0 },
  );

  const base = {
    militantesTotales,
    metaNacional,
    porcentajeNacional,
    estadoNacional: calcularEstadoAvance(militantesTotales, metaNacional),
    obrasRegistradas,
    gastosPeriodo,
    actividadesRecientes,
    tendenciaMilitantes: variacionPorcentual(militantesPeriodo, militantesPeriodoAnterior),
    tendenciaGastos: variacionPorcentual(gastosPeriodo, gastosPeriodoAnterior),
    proyeccionMeses,
    periodo: { tipo: periodo, desde: inicio.toISOString(), hasta: fin.toISOString() },
    serieDiaria: serieCompleta(inicio, fin, serieDiariaRaw),
    gastosPorCategoria: gastosPorCategoriaRaw.map((g) => ({
      categoria: g.categoria,
      total: Number(g._sum.monto ?? 0),
    })),
    provinciasPorEstado: conteoEstados,
    topProvincias: provinciasOrdenadas.slice(0, 5),
    bottomProvincias: [...provinciasOrdenadas].reverse().slice(0, 5),
  };

  // Fase 2 — dashboard enfocado en su propia secretaría para jefe/promotor.
  if ((user.role === "JEFE_SECRETARIA" || user.role === "PROMOTOR") && user.secretariaId) {
    const [secretaria, actividadesSecretaria, gastosSecretariaAgg, metasPoa, militantesEquipo] = await Promise.all([
      prisma.secretaria.findUnique({ where: { id: user.secretariaId } }),
      prisma.actividad.findMany({
        where: { secretariaId: user.secretariaId },
        orderBy: { fecha: "desc" },
        take: 5,
      }),
      prisma.gasto.aggregate({
        where: { secretariaId: user.secretariaId, tipo: "GASTO", fecha: { gte: inicio, lte: fin } },
        _sum: { monto: true },
      }),
      prisma.metaPOA.findMany({
        where: { secretariaId: user.secretariaId },
        include: { avances: true },
      }),
      prisma.militante.count({ where: { capturadoPor: { secretariaId: user.secretariaId } } }),
    ]);

    const poaResumen = metasPoa.map((m) => {
      const total = m.avances.reduce((s, a) => s + a.valor, 0);
      return {
        nombre: m.nombre,
        porcentaje: m.indicadorObjetivo > 0 ? Math.round((total / m.indicadorObjetivo) * 1000) / 10 : 0,
      };
    });

    return {
      ...base,
      vistaSecretaria: {
        nombre: secretaria?.nombre ?? "",
        actividadesRecientes: actividadesSecretaria,
        gastosDelMes: Number(gastosSecretariaAgg._sum.monto ?? 0),
        poaResumen,
        militantesCaptados: militantesEquipo,
      },
    };
  }

  return { ...base, vistaSecretaria: null };
}

const periodoSchema = z.object({
  periodo: z.enum(["semana", "mes", "trimestre", "custom"]).default("mes"),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

// RF-22: dashboard ejecutivo (back office)
dashboardRouter.get(
  "/resumen",
  requireAuth,
  asyncRoute(async (req, res) => {
    const { periodo, desde, hasta } = periodoSchema.parse(req.query);
    res.json(await resumenGeneral(req.user!, periodo, desde, hasta));
  }),
);

// Fase 2 — alertas de estancamiento de metas: listado para el dashboard.
dashboardRouter.get(
  "/alertas",
  requireAuth,
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (_req, res) => {
    const alertas = await prisma.notificacion.findMany({
      where: { tipo: "ALERTA_META" },
      orderBy: { enviadaAt: "desc" },
      take: 20,
    });
    res.json(alertas);
  }),
);

// Disparo manual (además del chequeo automático diario) por si un superadmin
// quiere forzar la verificación de estancamiento sin esperar al ciclo.
dashboardRouter.post(
  "/alertas/verificar",
  requireAuth,
  requireRole("SUPERADMIN"),
  asyncRoute(async (_req, res) => {
    const generadas = await verificarEstancamientoMetas();
    res.json({ generadas });
  }),
);

// RF-30: panel de seguimiento general para dirigencia en la app móvil (solo lectura)
dashboardRouter.get(
  "/panel-dirigencia",
  requireAuth,
  requireRole("DIRIGENCIA", "SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const resumen = await resumenGeneral(req.user!, "mes");
    const avancePorProvincia = await prisma.provincia.findMany({
      select: { id: true, nombre: true },
    });
    res.json({ ...resumen, provincias: avancePorProvincia });
  }),
);
