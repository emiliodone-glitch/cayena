import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { prisma } from "@cayena/database";

const expo = new Expo();

async function enviarATokens(tokens: string[], titulo: string, cuerpo: string): Promise<number> {
  const tokensValidos = tokens.filter((t) => Expo.isExpoPushToken(t));
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
  return tokensValidos.length;
}

// RF-27: notificaciones push de nuevas obras, actividades y convocatorias.
export async function enviarPushATodos(titulo: string, cuerpo: string, tipo: string) {
  const dispositivos = await prisma.deviceToken.findMany();
  const destinatarios = await enviarATokens(
    dispositivos.map((d) => d.token),
    titulo,
    cuerpo,
  );
  await prisma.notificacion.create({
    data: { titulo, cuerpo, tipo, destinatarios },
  });
}

// Alertas dirigidas a un responsable de territorio específico (ver
// lib/alertas.ts): además del push a sus dispositivos con sesión iniciada
// (si tiene la app instalada), se guarda un registro de Notificacion con
// destinatarioUserId para que le aparezca en la campanita del back office.
export async function enviarPushAUsuario(userId: string, titulo: string, cuerpo: string, tipo: string) {
  const dispositivos = await prisma.deviceToken.findMany({ where: { userId } });
  const destinatarios = await enviarATokens(
    dispositivos.map((d) => d.token),
    titulo,
    cuerpo,
  );
  await prisma.notificacion.create({
    data: { titulo, cuerpo, tipo, destinatarios, destinatarioUserId: userId },
  });
}
