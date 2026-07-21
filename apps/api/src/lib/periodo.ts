export type Periodo = "semana" | "mes" | "trimestre" | "custom";

// Compartido entre /dashboard (KPIs y gráficas) y /usuarios/ranking-captacion,
// para que ambos entiendan el mismo período de la misma forma.
export function calcularRango(periodo: Periodo, desdeParam?: string, hastaParam?: string) {
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
