import { useEffect } from "react";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { apiFetch } from "@/api/client";

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
// obras, actividades y convocatorias. Requiere un projectId de EAS para
// funcionar fuera de Expo Go (ver app.json > extra.eas.projectId tras `eas init`).
export function usePushRegistration() {
  useEffect(() => {
    (async () => {
      try {
        const { status: existente } = await Notifications.getPermissionsAsync();
        let status = existente;
        if (status !== "granted") {
          const solicitado = await Notifications.requestPermissionsAsync();
          status = solicitado.status;
        }
        if (status !== "granted") return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        // Sin tercer argumento: si hay sesión iniciada, el token de acceso
        // viaja en el header y el backend liga el dispositivo a ese usuario
        // (para alertas de estancamiento dirigidas a su territorio); si no
        // hay sesión, se registra igual mandando el header vacío.
        await apiFetch("/notificaciones/device-token", {
          method: "POST",
          body: JSON.stringify({ token: tokenData.data }),
        });
      } catch (err) {
        console.warn("No se pudo registrar el dispositivo para notificaciones push", err);
      }
    })();
  }, []);
}
