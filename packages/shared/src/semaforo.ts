export type EstadoAvance = "rojo" | "amarillo" | "verde";

// Umbrales del semáforo de metas (RF-13): rojo = lejos de la meta,
// amarillo = en curso, verde = meta cumplida.
export const UMBRAL_AMARILLO = 0.5; // 50% de la meta

export function calcularEstadoAvance(captados: number, meta: number): EstadoAvance {
  if (meta <= 0) return captados > 0 ? "verde" : "rojo";
  const ratio = captados / meta;
  if (ratio >= 1) return "verde";
  if (ratio >= UMBRAL_AMARILLO) return "amarillo";
  return "rojo";
}

export function calcularPorcentaje(captados: number, meta: number): number {
  if (meta <= 0) return captados > 0 ? 100 : 0;
  return Math.round((captados / meta) * 1000) / 10;
}

export const COLOR_ESTADO: Record<EstadoAvance, string> = {
  rojo: "#dc2626",
  amarillo: "#f59e0b",
  verde: "#16a34a",
};
