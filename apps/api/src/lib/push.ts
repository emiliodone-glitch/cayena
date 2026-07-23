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

// Recordatorio de actividades (ver lib/recordatorios.ts): dirigido solo a los
// militantes que confirmaron asistencia (RSVP) desde la app pública, que no
// tiene cuenta de usuario — el device token se liga a su militanteId en vez
// de a un userId (ver POST /notificaciones/device-token).
export async function enviarPushAMilitantes(militanteIds: string[], titulo: string, cuerpo: string, tipo: string) {
  if (militanteIds.length === 0) return;
  const dispositivos = await prisma.deviceToken.findMany({ where: { militanteId: { in: militanteIds } } });
  const destinatarios = await enviarATokens(
    dispositivos.map((d) => d.token),
    titulo,
    cuerpo,
  );
  await prisma.notificacion.create({
    data: { titulo, cuerpo, tipo, destinatarios },
  });
}
