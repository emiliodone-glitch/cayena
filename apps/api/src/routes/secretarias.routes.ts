import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole, requireModulo } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { estaInactiva, periodoAnterior, tieneInformeDelPeriodo } from "../lib/saludSecretaria";
import { calcularRankingSecretarias } from "../lib/rankingSecretarias";
import { calcularRango, type Periodo } from "../lib/periodo";

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

    // Optimización (RF nuevo): esto lo pide el Sidebar en cada navegación de
    // un SUPERADMIN — recorrer las secretarías una por una, esperando cada
    // consulta antes de pasar a la siguiente, sumaba una espera de red por
    // cada una. Se evalúan todas en paralelo (son independientes entre sí).
    const resultados = await Promise.all(
      secretarias
        // Sin titular activo nadie puede subir el informe ni se le puede
        // avisar a nadie — no cuenta como "pendiente accionable" (mismo gate
        // que usan las alertas automáticas antes de notificar).
        .filter((s) => s.titular?.active)
        .map(async (s) => {
          const informePendiente = pasoElLimite && !(await tieneInformeDelPeriodo(s.id, periodo));
          const inactiva = await estaInactiva(s.id, s.createdAt);
          return informePendiente || inactiva;
        }),
    );
    const pendientes = resultados.filter(Boolean).length;
    res.json({ pendientes });
  }),
);

// Ranking de secretarías: combina avance de objetivos, puntualidad de
// informes y actividad reciente en un solo puntaje — mismo espíritu que el
// ranking de promotores (/usuarios/ranking-captacion), pero a nivel
// institucional en vez de individual. El cálculo en sí vive en
// lib/rankingSecretarias.ts, compartido con el job de reconocimientos.
const rankingSecretariasQuerySchema = z.object({
  periodo: z.enum(["semana", "mes", "trimestre", "todo", "custom"]).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

secretariasRouter.get(
  "/ranking",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "AUDITOR"),
  asyncRoute(async (req, res) => {
    const { periodo, desde, hasta } = rankingSecretariasQuerySchema.parse(req.query);
    const rangoFecha = periodo && periodo !== "todo" ? calcularRango(periodo as Periodo, desde, hasta) : null;

    const filas = await calcularRankingSecretarias(rangoFecha ? { inicio: rangoFecha.inicio, fin: rangoFecha.fin } : undefined);

    // Tendencia (RF nuevo): mismo mecanismo que en el ranking de promotores
    // — se compara contra el período anterior de igual duración. A
    // diferencia de ese, acá solo "informes subidos" queda acotado al rango
    // (avance de objetivos y actividad reciente son un estado VIGENTE, no
    // algo reconstruible para una fecha pasada), así que el movimiento que
    // se ve reflaja sobre todo los informes subidos en cada ventana.
    let posicionAnteriorMap = new Map<string, number>();
    if (rangoFecha) {
      const filasAnterior = await calcularRankingSecretarias({ inicio: rangoFecha.inicioAnterior, fin: rangoFecha.finAnterior });
      posicionAnteriorMap = new Map(filasAnterior.map((f, i) => [f.id, i + 1]));
    }

    res.json(
      filas.map((f, i) => ({
        id: f.id,
        nombre: f.nombre,
        titular: f.titular,
        titularActivo: f.titularActivo,
        avancePromedioObjetivos: f.avancePromedioObjetivos,
        informesSubidos: f.informesSubidos,
        informesTope: f.informesTope,
        diasSinActividad: f.diasSinActividad,
        puntaje: f.puntaje,
        posicionActual: i + 1,
        posicionAnterior: posicionAnteriorMap.get(f.id) ?? null,
      })),
    );
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
