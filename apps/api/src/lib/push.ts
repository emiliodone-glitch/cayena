import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { prisma } from "@cayena/database";

const expo = new Expo();

// RF-27: notificaciones push de nuevas obras, actividades y convocatorias.
export async function enviarPushATodos(titulo: string, cuerpo: string, tipo: string) {
  const dispositivos = await prisma.deviceToken.findMany();
  const tokensValidos = dispositivos.map((d) => d.token).filter((t) => Expo.isExpoPushToken(t));

  const mensajes: ExpoPushMessage[] = tokensValidos.map((token) => ({
    to: token,
    title: titulo,
    body: cuerpo,
    sound: "default",
  }));

  const chunks = expo.chunkPushNotifications(mensajes);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error("Error enviando push notifications:", err);
    }
  }

  await prisma.notificacion.create({
    data: { titulo, cuerpo, tipo, destinatarios: tokensValidos.length },
  });
}
