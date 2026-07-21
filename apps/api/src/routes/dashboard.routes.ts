import { Router } from "express";
import { prisma } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje } from "@cayena/shared";
import { requireAuth, requireRole, type AuthUser } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { verificarEstancamientoMetas } from "../lib/alertas";

export const dashboardRouter = Router();

function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual > 0 ? 100 : null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

async function resumenGeneral(user: AuthUser) {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const inicioMesAnterior = new Date(inicioMes);
  inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
  const finMesAnterior = new Date(inicioMes.getTime() - 1);

  const [
    militantesTotales,
    obrasRegistradas,
    gastosDelMesAgg,
    gastosMesAnteriorAgg,
    metasNacionales,
    actividadesRecientes,
    militantesEsteMes,
    militantesMesAnterior,
  ] = await Promise.all([
    prisma.militante.count(),
    prisma.obra.count(),
    prisma.gasto.aggregate({ where: { tipo: "GASTO", fecha: { gte: inicioMes } }, _sum: { monto: true } }),
    prisma.gasto.aggregate({
      where: { tipo: "GASTO", fecha: { gte: inicioMesAnterior, lte: finMesAnterior } },
      _sum: { monto: true },
    }),
    prisma.metaMilitantes.findMany({ where: { provinciaId: { not: null }, vigenciaHasta: null } }),
    prisma.actividad.findMany({ orderBy: { fecha: "desc" }, take: 5 }),
    prisma.militante.count({ where: { createdAt: { gte: inicioMes } } }),
    prisma.militante.count({ where: { createdAt: { gte: inicioMesAnterior, lte: finMesAnterior } } }),
  ]);

  const metaNacional = metasNacionales.reduce((sum, m) => sum + m.meta, 0);
  const porcentajeNacional = calcularPorcentaje(militantesTotales, metaNacional);
  const gastosDelMes = Number(gastosDelMesAgg._sum.monto ?? 0);
  const gastosMesAnterior = Number(gastosMesAnteriorAgg._sum.monto ?? 0);

  const base = {
    militantesTotales,
    metaNacional,
    porcentajeNacional,
    estadoNacional: calcularEstadoAvance(militantesTotales, metaNacional),
    obrasRegistradas,
    gastosDelMes,
    actividadesRecientes,
    tendenciaMilitantes: variacionPorcentual(militantesEsteMes, militantesMesAnterior),
    tendenciaGastos: variacionPorcentual(gastosDelMes, gastosMesAnterior),
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
        where: { secretariaId: user.secretariaId, tipo: "GASTO", fecha: { gte: inicioMes } },
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

// RF-22: dashboard ejecutivo (back office)
dashboardRouter.get(
  "/resumen",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json(await resumenGeneral(req.user!));
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
    const resumen = await resumenGeneral(req.user!);
    const avancePorProvincia = await prisma.provincia.findMany({
      select: { id: true, nombre: true },
    });
    res.json({ ...resumen, provincias: avancePorProvincia });
  }),
);
