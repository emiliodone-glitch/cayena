import { prisma } from "@cayena/database";

// Fase 2 — gamificación: otorga puntos e insignia de bienvenida a todo
// militante nuevo, sin bloquear el registro si algo falla aquí.
export async function otorgarInsigniaBienvenida(militanteId: string) {
  try {
    const insignia = await prisma.insigniaDefinicion.findUnique({ where: { codigo: "BIENVENIDA" } });
    if (!insignia) return;
    await prisma.$transaction([
      prisma.militanteInsignia.create({ data: { militanteId, insigniaId: insignia.id } }),
      prisma.militante.update({
        where: { id: militanteId },
        data: { puntos: { increment: insignia.puntos } },
      }),
    ]);
  } catch (err) {
    console.error("No se pudo otorgar la insignia de bienvenida:", err);
  }
}
