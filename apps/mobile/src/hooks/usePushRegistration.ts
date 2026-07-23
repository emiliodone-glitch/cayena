import { useEffect } from "react";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@/api/client";
import { MI_MILITANTE_ID_KEY } from "@/lib/carnet";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// RF-27: registra el dispositivo para recibir notificaciones de nuevas
// obras, actividades, convocatorias y recordatorios de asistencia
// confirmada. Requiere un projectId de EAS para funcionar fuera de Expo Go
// (ver app.json > extra.eas.projectId tras `eas init`). Se exporta suelta
// (no solo como hook) para poder re-registrar el militanteId justo después
// del auto-registro público (ver unirme.tsx), ya que al abrir la app por
// primera vez ese id todavía no existe en el storage.
export async function registrarDispositivoPush() {
  try {
    const { status: existente } = await Notifications.getPermissionsAsync();
    let status = existente;
    if (status !== "granted") {
      const solicitado = await Notifications.requestPermissionsAsync();
      status = solicitado.status;
    }
    if (status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const militanteId = await AsyncStorage.getItem(MI_MILITANTE_ID_KEY);
    // Sin tercer argumento: si hay sesión iniciada, el token de acceso
    // viaja en el header y el backend liga el dispositivo a ese usuario
    // (para alertas de estancamiento dirigidas a su territorio); si no
    // hay sesión, se registra igual mandando el header vacío.
    await apiFetch("/notificaciones/device-token", {
      method: "POST",
      body: JSON.stringify({ token: tokenData.data, militanteId: militanteId ?? undefined }),
    });
  } catch (err) {
    console.warn("No se pudo registrar el dispositivo para notificaciones push", err);
  }
}

export function usePushRegistration() {
  useEffect(() => {
    registrarDispositivoPush();
  }, []);
}
