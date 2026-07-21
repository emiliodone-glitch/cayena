import { Router } from "express";
import { prisma } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje } from "@cayena/shared";
import { asyncRoute } from "../middleware/errorHandler";
import { obtenerAvancePorProvincia } from "../lib/geoStats";

export const transparenciaRouter = Router();

// Fase 2: panel público de transparencia — sin login, sin datos personales.
transparenciaRouter.get(
  "/resumen",
  asyncRoute(async (_req, res) => {
    const [militantesTotales, obrasPorCategoria, metasNacionales, gastosPorCategoria, actividadesRealizadas] =
      await Promise.all([
        prisma.militante.count(),
        prisma.obra.groupBy({
          by: ["categoria"],
          where: { publicada: true },
          _count: { _all: true },
        }),
        prisma.metaMilitantes.findMany({ where: { provinciaId: { not: null }, vigenciaHasta: null } }),
        prisma.gasto.groupBy({
          by: ["categoria", "tipo"],
          _sum: { monto: true },
        }),
        prisma.actividad.count({ where: { publicadaApp: true } }),
      ]);

    const metaNacional = metasNacionales.reduce((sum, m) => sum + m.meta, 0);

    res.json({
      militantesTotales,
      metaNacional,
      porcentajeNacional: calcularPorcentaje(militantesTotales, metaNacional),
      estadoNacional: calcularEstadoAvance(militantesTotales, metaNacional),
      obrasPorCategoria: obrasPorCategoria.map((o) => ({ categoria: o.categoria, total: o._count._all })),
      actividadesRealizadas,
      finanzas: gastosPorCategoria.map((g) => ({
        categoria: g.categoria,
        tipo: g.tipo,
        total: Number(g._sum.monto ?? 0),
      })),
    });
  }),
);

// Mapa de avance por provincia, igual que el back office pero sin autenticación.
transparenciaRouter.get(
  "/provincias",
  asyncRoute(async (_req, res) => {
    res.json(await obtenerAvancePorProvincia());
  }),
);
