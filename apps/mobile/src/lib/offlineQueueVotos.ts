import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@/api/client";

const QUEUE_KEY = "cayena_voto_offline_queue";

export type VotoPendiente = {
  id: string;
  militanteId: string;
  creadoEn: string;
};

export async function obtenerColaVotos(): Promise<VotoPendiente[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Día Electoral offline: en el centro de votación la señal suele ser débil o
// inexistente — "Ya voté" se guarda localmente y se reintenta solo al
// recuperar internet, mismo patrón que el auto-registro de militantes.
export async function encolarVoto(militanteId: string): Promise<void> {
  const queue = await obtenerColaVotos();
  if (queue.some((v) => v.militanteId === militanteId)) return; // ya encolado, no duplicar
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, militanteId, creadoEn: new Date().toISOString() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function contarPendientesVotos(): Promise<number> {
  return (await obtenerColaVotos()).length;
}

export async function sincronizarColaVotos(): Promise<{ enviados: number; pendientes: number }> {
  const queue = await obtenerColaVotos();
  if (queue.length === 0) return { enviados: 0, pendientes: 0 };

  const restantes: VotoPendiente[] = [];
  let enviados = 0;

  for (const item of queue) {
    try {
      // Idempotente en el backend (upsert): reenviar un voto ya confirmado
      // simplemente no hace nada, no hace falta un manejo especial de 409.
      await apiFetch("/dia-electoral/confirmar", { method: "POST", body: JSON.stringify({ militanteId: item.militanteId }) }, false);
      enviados++;
    } catch {
      restantes.push(item);
    }
  }

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(restantes));
  return { enviados, pendientes: restantes.length };
}
