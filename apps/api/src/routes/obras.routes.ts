import { Router } from "express";
import { z } from "zod";
import { CategoriaObra, prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";
import { enviarPushATodos } from "../lib/push";

export const obrasRouter = Router();

// RF-23/RF-24: mapa público de obras — sin auth, usado por la app móvil y el
// catálogo del panel de transparencia (con los mismos filtros que el back office).
obrasRouter.get(
  "/publicas",
  asyncRoute(async (req, res) => {
    const { provinciaId, categoria, anio } = req.query as { provinciaId?: string; categoria?: string; anio?: string };
    const obras = await prisma.obra.findMany({
      where: {
        publicada: true,
        ...(provinciaId ? { provinciaId } : {}),
        ...(categoria ? { categoria: categoria as CategoriaObra } : {}),
        ...filtroAnio(anio),
      },
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

// Un mismo año puede referirse a la fecha de inauguración (si se cargó) o,
// para obras antiguas sin ese dato, al año en que se registró en el sistema
// — así el filtro no deja fuera obras cargadas antes de tener este campo.
function filtroAnio(anio?: string) {
  if (!anio) return {};
  const inicio = new Date(Number(anio), 0, 1);
  const fin = new Date(Number(anio) + 1, 0, 1);
  return {
    OR: [
      { fechaInauguracion: { gte: inicio, lt: fin } },
      { fechaInauguracion: null, createdAt: { gte: inicio, lt: fin } },
    ],
  };
}

obrasRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { provinciaId, categoria, anio } = req.query as { provinciaId?: string; categoria?: string; anio?: string };
    const obras = await prisma.obra.findMany({
      where: {
        ...(provinciaId ? { provinciaId } : {}),
        ...(categoria ? { categoria: categoria as CategoriaObra } : {}),
        ...filtroAnio(anio),
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
  fotosAntes: z.array(z.string()).default([]),
  lat: z.number(),
  lng: z.number(),
  direccion: z.string().optional(),
  fechaInauguracion: z.coerce.date().optional(),
  inversion: z.number().optional(),
  beneficiarios: z.string().optional(),
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
