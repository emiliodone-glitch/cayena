import { prisma } from "@cayena/database";
import { calcularEstadoAvance, calcularPorcentaje, type EstadoAvance } from "@cayena/shared";

export type AvanceProvincia = {
  id: string;
  nombre: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: EstadoAvance;
};

// Compartido entre /geo (mapa), /transparencia (público) y /dashboard (KPIs y
// widgets), para no triplicar el cálculo de avance por provincia.
export async function obtenerAvancePorProvincia(): Promise<AvanceProvincia[]> {
  const provincias = await prisma.provincia.findMany({ select: { id: true, nombre: true } });
  const [conteos, metas] = await Promise.all([
    prisma.militante.groupBy({ by: ["provinciaId"], _count: { _all: true } }),
    prisma.metaMilitantes.findMany({ where: { provinciaId: { not: null }, vigenciaHasta: null } }),
  ]);
  const conteoMap = new Map(conteos.map((c) => [c.provinciaId, c._count._all]));
  const metaMap = new Map(metas.filter((m) => m.provinciaId).map((m) => [m.provinciaId as string, m.meta]));

  return provincias.map((p) => {
    const captados = conteoMap.get(p.id) ?? 0;
    const meta = metaMap.get(p.id) ?? 0;
    return {
      id: p.id,
      nombre: p.nombre,
      militantesCaptados: captados,
      meta,
      porcentaje: calcularPorcentaje(captados, meta),
      estado: calcularEstadoAvance(captados, meta),
    };
  });
}
