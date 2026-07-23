import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole, requireModulo } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { estaInactiva, periodoAnterior, tieneInformeDelPeriodo, ultimaActividad } from "../lib/saludSecretaria";

export const secretariasRouter = Router();
secretariasRouter.use(requireAuth);
secretariasRouter.use(requireModulo("secretarias"));

const TITULAR_SELECT = { select: { id: true, nombre: true, email: true, active: true } } as const;

// RF-01
secretariasRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const secretarias = await prisma.secretaria.findMany({
      orderBy: { nombre: "asc" },
      include: { titular: TITULAR_SELECT },
    });
    res.json(secretarias);
  }),
);

// Badge del sidebar: cuántas secretarías tienen algo pendiente ahora mismo
// (informe atrasado o sin ninguna actividad reciente) — mismo criterio que
// usan las alertas automáticas, así el número nunca contradice lo que ya se
// le avisó a cada titular. Debe ir ANTES de "/:id" (si no, Express lo
// atraparía como si "pendientes-count" fuera un id).
secretariasRouter.get(
  "/pendientes-count",
  requireRole("SUPERADMIN"),
  asyncRoute(async (_req, res) => {
    const periodo = periodoAnterior();
    const pasoElLimite = new Date().getDate() >= 10;
    const secretarias = await prisma.secretaria.findMany({
      select: { id: true, createdAt: true, titular: { select: { active: true } } },
    });

    let pendientes = 0;
    for (const s of secretarias) {
      // Sin titular activo nadie puede subir el informe ni se le puede
      // avisar a nadie — no cuenta como "pendiente accionable" (mismo gate
      // que usan las alertas automáticas antes de notificar).
      if (!s.titular?.active) continue;
      const informePendiente = pasoElLimite && !(await tieneInformeDelPeriodo(s.id, periodo));
      const inactiva = await estaInactiva(s.id, s.createdAt);
      if (informePendiente || inactiva) pendientes++;
    }
    res.json({ pendientes });
  }),
);

// Ranking de secretarías: combina avance de objetivos, puntualidad de
// informes y actividad reciente en un solo puntaje — mismo espíritu que el
// ranking de promotores (/usuarios/ranking-captacion), pero a nivel
// institucional en vez de individual.
secretariasRouter.get(
  "/ranking",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "AUDITOR"),
  asyncRoute(async (_req, res) => {
    const secretarias = await prisma.secretaria.findMany({
      include: {
        titular: { select: { nombre: true, active: true } },
        metasPoa: { include: { avances: true } },
        informes: { select: { id: true } },
      },
    });

    const filas = await Promise.all(
      secretarias.map(async (s) => {
        const objetivos = s.metasPoa.map((m) => {
          const totalAvance = m.avances.reduce((sum, a) => sum + a.valor, 0);
          return m.indicadorObjetivo > 0 ? Math.min(1, totalAvance / m.indicadorObjetivo) : 0;
        });
        const avancePromedio =
          objetivos.length > 0 ? Math.round((objetivos.reduce((s2, p) => s2 + p, 0) / objetivos.length) * 100) : null;
        const reciente = await ultimaActividad(s.id);
        const diasSinActividad = reciente ? Math.floor((Date.now() - reciente.getTime()) / (24 * 3600 * 1000)) : null;

        // Puntaje 0-100: 50% avance de objetivos, 25% informes subidos
        // (tope 5, o sea 20 puntos cada uno), 25% haber tenido actividad en
        // los últimos 30 días — así una secretaría sin objetivos definidos
        // todavía no queda en cero solo por eso.
        const puntajeObjetivos = avancePromedio ?? 0;
        const puntajeInformes = Math.min(5, s.informes.length) * 20;
        const puntajeActividad = diasSinActividad != null && diasSinActividad <= 30 ? 100 : 0;
        const puntaje = Math.round(puntajeObjetivos * 0.5 + puntajeInformes * 0.25 + puntajeActividad * 0.25);

        return {
          id: s.id,
          nombre: s.nombre,
          // El nombre del titular se muestra siempre que esté designado —
          // "inactivo" (todavía no activó su cuenta) no es lo mismo que
          // "vacante" (nadie designado); el frontend distingue ambos casos
          // con titularActivo.
          titular: s.titular?.nombre ?? null,
          titularActivo: s.titular?.active ?? false,
          avancePromedioObjetivos: avancePromedio,
          informesSubidos: s.informes.length,
          diasSinActividad,
          puntaje,
        };
      }),
    );

    filas.sort((a, b) => b.puntaje - a.puntaje);
    res.json(filas);
  }),
);

const secretariaSchema = z.object({
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  titularId: z.string().nullable().optional(),
  presupuestoAsignado: z.number().nonnegative().nullable().optional(),
});

secretariasRouter.post(
  "/",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const { titularId, ...data } = secretariaSchema.parse(req.body);
    const secretaria = await prisma.secretaria.create({ data });
    if (titularId) {
      await designarTitular(secretaria.id, titularId);
    }
    res.status(201).json(await prisma.secretaria.findUniqueOrThrow({ where: { id: secretaria.id }, include: { titular: TITULAR_SELECT } }));
  }),
);

// Cambiar el titular de una secretaría: cierra la fila abierta del titular
// saliente en el historial, lo baja de "Titular" en el equipo (sigue en el
// equipo si tenía otro motivo para estar ahí), vincula al entrante al
// equipo con cargo "Titular" y abre su fila en el historial.
async function designarTitular(secretariaId: string, nuevoTitularId: string | null) {
  const actual = await prisma.secretaria.findUniqueOrThrow({ where: { id: secretariaId } });
  if (actual.titularId === nuevoTitularId) return;

  await prisma.$transaction(async (tx) => {
    if (actual.titularId) {
      await tx.historialTitularSecretaria.updateMany({
        where: { secretariaId, userId: actual.titularId, hasta: null },
        data: { hasta: new Date() },
      });
      await tx.user.updateMany({
        where: { id: actual.titularId, cargoSecretaria: "Titular" },
        data: { cargoSecretaria: null },
      });
    }
    if (nuevoTitularId) {
      const nuevo = await tx.user.findUniqueOrThrow({ where: { id: nuevoTitularId } });
      await tx.user.update({
        where: { id: nuevoTitularId },
        data: { secretariaId, cargoSecretaria: "Titular" },
      });
      await tx.historialTitularSecretaria.create({
        data: { secretariaId, userId: nuevoTitularId, nombreTitular: nuevo.nombre },
      });
    }
    await tx.secretaria.update({ where: { id: secretariaId }, data: { titularId: nuevoTitularId } });
  });
}

secretariasRouter.patch(
  "/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const { titularId, ...data } = secretariaSchema.partial().parse(req.body);
    if (titularId !== undefined) {
      await designarTitular(req.params.id, titularId);
    }
    if (Object.keys(data).length > 0) {
      await prisma.secretaria.update({ where: { id: req.params.id }, data });
    }
    const secretaria = await prisma.secretaria.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { titular: TITULAR_SELECT },
    });
    res.json(secretaria);
  }),
);

secretariasRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const secretaria = await prisma.secretaria.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { titular: TITULAR_SELECT },
    });
    res.json(secretaria);
  }),
);

function requireGestion(req: Request, secretariaId: string) {
  if (!req.user) throw new HttpError(401, "No autenticado");
  if (req.user.role !== "SUPERADMIN" && req.user.role !== "AUDITOR" && req.user.secretariaId !== secretariaId) {
    throw new HttpError(403, "No autorizado para esta secretaría");
  }
}

// Equipo: todo usuario vinculado a esta secretaría (titular incluido),
// titular primero.
secretariasRouter.get(
  "/:id/equipo",
  asyncRoute(async (req, res) => {
    requireGestion(req, req.params.id);
    const equipo = await prisma.user.findMany({
      where: { secretariaId: req.params.id },
      select: { id: true, nombre: true, email: true, role: true, cargoSecretaria: true, active: true },
      orderBy: [{ cargoSecretaria: "desc" }, { nombre: "asc" }],
    });
    res.json(equipo);
  }),
);

// Historial de titulares: quién ha ocupado el cargo y cuándo.
secretariasRouter.get(
  "/:id/historial-titulares",
  asyncRoute(async (req, res) => {
    requireGestion(req, req.params.id);
    const historial = await prisma.historialTitularSecretaria.findMany({
      where: { secretariaId: req.params.id },
      orderBy: { desde: "desc" },
    });
    res.json(historial);
  }),
);

// Presupuesto asignado vs. ejecutado (suma de Gasto tipo GASTO vinculado).
secretariasRouter.get(
  "/:id/presupuesto",
  asyncRoute(async (req, res) => {
    requireGestion(req, req.params.id);
    const secretaria = await prisma.secretaria.findUniqueOrThrow({ where: { id: req.params.id } });
    const ejecutadoAgg = await prisma.gasto.aggregate({
      where: { secretariaId: req.params.id, tipo: "GASTO" },
      _sum: { monto: true },
    });
    const asignado = Number(secretaria.presupuestoAsignado ?? 0);
    const ejecutado = Number(ejecutadoAgg._sum.monto ?? 0);
    res.json({
      presupuestoAsignado: secretaria.presupuestoAsignado != null ? asignado : null,
      ejecutado,
      disponible: secretaria.presupuestoAsignado != null ? asignado - ejecutado : null,
      porcentaje: secretaria.presupuestoAsignado != null && asignado > 0 ? Math.round((ejecutado / asignado) * 1000) / 10 : null,
    });
  }),
);

// RF-03: historial filtrable por fecha
secretariasRouter.get(
  "/:id/historial",
  asyncRoute(async (req, res) => {
    requireGestion(req, req.params.id);
    const { desde, hasta } = req.query as { desde?: string; hasta?: string };
    const fechaFilter: Record<string, Date> = {};
    if (desde) fechaFilter.gte = new Date(desde);
    if (hasta) fechaFilter.lte = new Date(hasta);

    const [actividades, documentos] = await Promise.all([
      prisma.actividad.findMany({
        where: {
          secretariaId: req.params.id,
          ...(Object.keys(fechaFilter).length ? { fecha: fechaFilter } : {}),
        },
        orderBy: { fecha: "desc" },
      }),
      prisma.documentoSecretaria.findMany({
        where: { secretariaId: req.params.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({ actividades, documentos });
  }),
);

// RF-02: documentos internos
const documentoSchema = z.object({ titulo: z.string().min(1), url: z.string().min(1) });

secretariasRouter.post(
  "/:id/documentos",
  asyncRoute(async (req, res) => {
    requireGestion(req, req.params.id);
    const data = documentoSchema.parse(req.body);
    const doc = await prisma.documentoSecretaria.create({
      data: { ...data, secretariaId: req.params.id, subidoPorId: req.user!.id },
    });
    res.status(201).json(doc);
  }),
);

// Rendición de cuentas: un informe de gestión por período (YYYY-MM).
const informeSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "Formato de período inválido (YYYY-MM)"),
  resumen: z.string().min(10),
  archivoUrl: z.string().optional(),
});

secretariasRouter.get(
  "/:id/informes",
  asyncRoute(async (req, res) => {
    requireGestion(req, req.params.id);
    const informes = await prisma.informeSecretaria.findMany({
      where: { secretariaId: req.params.id },
      include: { subidoPor: { select: { nombre: true } } },
      orderBy: { periodo: "desc" },
    });
    res.json(informes);
  }),
);

secretariasRouter.post(
  "/:id/informes",
  asyncRoute(async (req, res) => {
    requireGestion(req, req.params.id);
    if (req.user!.role === "AUDITOR") throw new HttpError(403, "Auditor es de solo lectura");
    const data = informeSchema.parse(req.body);
    const informe = await prisma.informeSecretaria.create({
      data: { ...data, secretariaId: req.params.id, subidoPorId: req.user!.id },
    });
    res.status(201).json(informe);
  }),
);

secretariasRouter.delete(
  "/:id/informes/:informeId",
  asyncRoute(async (req, res) => {
    requireGestion(req, req.params.id);
    if (req.user!.role === "AUDITOR") throw new HttpError(403, "Auditor es de solo lectura");
    await prisma.informeSecretaria.delete({ where: { id: req.params.informeId } });
    res.status(204).send();
  }),
);
