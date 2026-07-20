import { Router } from "express";
import { z } from "zod";
import { CategoriaObra, prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { enviarPushATodos } from "../lib/push";

export const obrasRouter = Router();

// RF-23/RF-24: mapa público de obras — sin auth, usado por la app móvil.
obrasRouter.get(
  "/publicas",
  asyncRoute(async (_req, res) => {
    const obras = await prisma.obra.findMany({
      where: { publicada: true },
      include: { provincia: true, municipio: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(obras);
  }),
);

// RF-24: detalle de una obra publicada (foto, título, reseña, categoría)
obrasRouter.get(
  "/publicas/:id",
  asyncRoute(async (req, res) => {
    const obra = await prisma.obra.findFirst({
      where: { id: req.params.id, publicada: true },
      include: { provincia: true, municipio: true },
    });
    if (!obra) return res.status(404).json({ error: "Obra no encontrada" });
    res.json(obra);
  }),
);

obrasRouter.use(requireAuth);

obrasRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { provinciaId, categoria } = req.query as { provinciaId?: string; categoria?: string };
    const obras = await prisma.obra.findMany({
      where: {
        ...(provinciaId ? { provinciaId } : {}),
        ...(categoria ? { categoria: categoria as CategoriaObra } : {}),
      },
      include: { provincia: true, municipio: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(obras);
  }),
);

// RF-07/RF-08: registrar obra asociada a provincia y municipio
const obraSchema = z.object({
  titulo: z.string().min(2),
  resena: z.string().min(1),
  categoria: z.nativeEnum(CategoriaObra),
  fotos: z.array(z.string()).default([]),
  lat: z.number(),
  lng: z.number(),
  provinciaId: z.string(),
  municipioId: z.string(),
  publicada: z.boolean().default(false),
});

// RF-09: toda obra publicada se refleja automáticamente en /obras/publicas (misma tabla, filtro `publicada`).
obrasRouter.post(
  "/",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const data = obraSchema.parse(req.body);
    const obra = await prisma.obra.create({ data: { ...data, creadoPorId: req.user!.id } });
    if (obra.publicada) {
      enviarPushATodos("Nueva obra de gobierno", obra.titulo, "OBRA").catch(() => {});
    }
    res.status(201).json(obra);
  }),
);

obrasRouter.patch(
  "/:id",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const data = obraSchema.partial().parse(req.body);
    const anterior = await prisma.obra.findUniqueOrThrow({ where: { id: req.params.id } });
    const obra = await prisma.obra.update({ where: { id: req.params.id }, data });
    if (!anterior.publicada && obra.publicada) {
      enviarPushATodos("Nueva obra de gobierno", obra.titulo, "OBRA").catch(() => {});
    }
    res.json(obra);
  }),
);

obrasRouter.delete(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    await prisma.obra.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);
