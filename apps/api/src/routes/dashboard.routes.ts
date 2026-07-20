import { Router } from "express";
import { prisma } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje } from "@cayena/shared";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const dashboardRouter = Router();

async function resumenGeneral() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [militantesTotales, obrasRegistradas, gastosDelMes, metasNacionales, actividadesRecientes] =
    await Promise.all([
      prisma.militante.count(),
      prisma.obra.count(),
      prisma.gasto.aggregate({
        where: { tipo: "GASTO", fecha: { gte: inicioMes } },
        _sum: { monto: true },
      }),
      prisma.metaMilitantes.findMany({ where: { provinciaId: { not: null }, vigenciaHasta: null } }),
      prisma.actividad.findMany({ orderBy: { fecha: "desc" }, take: 5 }),
    ]);

  const metaNacional = metasNacionales.reduce((sum, m) => sum + m.meta, 0);
  const porcentajeNacional = calcularPorcentaje(militantesTotales, metaNacional);

  return {
    militantesTotales,
    metaNacional,
    porcentajeNacional,
    estadoNacional: calcularEstadoAvance(militantesTotales, metaNacional),
    obrasRegistradas,
    gastosDelMes: Number(gastosDelMes._sum.monto ?? 0),
    actividadesRecientes,
  };
}

// RF-22: dashboard ejecutivo (back office)
dashboardRouter.get(
  "/resumen",
  requireAuth,
  asyncRoute(async (_req, res) => {
    res.json(await resumenGeneral());
  }),
);

// RF-30: panel de seguimiento general para dirigencia en la app móvil (solo lectura)
dashboardRouter.get(
  "/panel-dirigencia",
  requireAuth,
  requireRole("DIRIGENCIA", "SUPERADMIN"),
  asyncRoute(async (_req, res) => {
    const resumen = await resumenGeneral();
    const avancePorProvincia = await prisma.provincia.findMany({
      select: { id: true, nombre: true },
    });
    res.json({ ...resumen, provincias: avancePorProvincia });
  }),
);
