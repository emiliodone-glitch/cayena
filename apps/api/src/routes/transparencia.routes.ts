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
    const [militantesTotales, obrasPorCategoria, inversionObras, metasNacionales, gastosPorCategoria, actividadesRealizadas] =
      await Promise.all([
        prisma.militante.count(),
        prisma.obra.groupBy({
          by: ["categoria"],
          where: { publicada: true },
          _count: { _all: true },
        }),
        prisma.obra.aggregate({ where: { publicada: true }, _sum: { inversion: true } }),
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
      inversionTotalObras: Number(inversionObras._sum.inversion ?? 0),
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

// Vitrina pública de secretarías: quién las encabeza y su avance de gestión
// (objetivos POA), sin exponer nada interno (ni el contenido de los
// informes de rendición de cuentas, ni cifras de presupuesto — solo el
// conteo de actividades públicas/objetivos, igual de agregado que el resto
// de este panel).
transparenciaRouter.get(
  "/secretarias",
  asyncRoute(async (_req, res) => {
    const [secretarias, actividadesPorSecretaria] = await Promise.all([
      prisma.secretaria.findMany({
        orderBy: { nombre: "asc" },
        include: {
          titular: { select: { nombre: true, active: true } },
          metasPoa: { include: { avances: true } },
        },
      }),
      prisma.actividad.groupBy({
        by: ["secretariaId"],
        where: { publicadaApp: true },
        _count: { _all: true },
      }),
    ]);
    const actividadesPorId = new Map(actividadesPorSecretaria.map((a) => [a.secretariaId, a._count._all]));

    res.json(
      secretarias.map((s) => {
        const objetivos = s.metasPoa.map((m) => {
          const totalAvance = m.avances.reduce((sum, a) => sum + a.valor, 0);
          return m.indicadorObjetivo > 0 ? Math.min(1, totalAvance / m.indicadorObjetivo) : 0;
        });
        const avancePromedio =
          objetivos.length > 0
            ? Math.round((objetivos.reduce((s2, p) => s2 + p, 0) / objetivos.length) * 1000) / 10
            : null;
        return {
          id: s.id,
          nombre: s.nombre,
          descripcion: s.descripcion,
          titular: s.titular?.active ? s.titular.nombre : null,
          actividadesPublicas: actividadesPorId.get(s.id) ?? 0,
          objetivosTotales: s.metasPoa.length,
          avancePromedioObjetivos: avancePromedio,
        };
      }),
    );
  }),
);
