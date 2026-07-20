import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, ApiError } from "@/api/client";

const QUEUE_KEY = "cayena_registro_offline_queue";

export type RegistroPendiente = {
  id: string;
  payload: Record<string, unknown>;
  creadoEn: string;
};

export async function obtenerCola(): Promise<RegistroPendiente[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Fase 2 — modo offline: si no hay conexión al momento de "Unirme a FP" (RF-26),
// el registro se guarda localmente y se reintenta automáticamente al recuperar internet.
export async function encolarRegistro(payload: Record<string, unknown>): Promise<void> {
  const queue = await obtenerCola();
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, payload, creadoEn: new Date().toISOString() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function contarPendientes(): Promise<number> {
  return (await obtenerCola()).length;
}

export async function sincronizarCola(): Promise<{ enviados: number; pendientes: number }> {
  const queue = await obtenerCola();
  if (queue.length === 0) return { enviados: 0, pendientes: 0 };

  const restantes: RegistroPendiente[] = [];
  let enviados = 0;

  for (const item of queue) {
    try {
      await apiFetch("/militantes/registro-publico", { method: "POST", body: JSON.stringify(item.payload) }, false);
      enviados++;
    } catch (err) {
      // 409 = ya existe (probablemente ya se había sincronizado antes): se descarta, no se reintenta.
      if (err instanceof ApiError && err.status === 409) {
        continue;
      }
      restantes.push(item);
    }
  }

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(restantes));
  return { enviados, pendientes: restantes.length };
}
