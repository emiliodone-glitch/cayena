import { Router } from "express";
import { z } from "zod";
import { prisma, loadProvinciasGeo, loadMunicipiosGeo, loadDistritosMunicipalesGeo } from "@cayena/database";
import {
  requireAuth,
  requireRole,
  resolverAlcance,
  puedeVerProvincia,
  puedeVerMunicipio,
  puedeVerDistrito,
} from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { emitirCambioVotos } from "../lib/eventos";

// Día Electoral (RF nuevo): participación de los militantes/simpatizantes ya
// registrados en Cayena — NO es un conteo de resultados electorales, el voto
// sigue siendo secreto. Es una herramienta de arrastre/GOTV: cada militante
// puede autoreportar que ya votó desde su carnet, o un fiscal/promotor puede
// marcarlo escaneando su carnet en la mesa. El mapa reusa exactamente el
// mismo motor de choropleth/drill-down/SSE que el mapa de militantes
// (apps/api/src/routes/geo.routes.ts), solo que agregando confirmaciones de
// voto en vez de captación histórica.
export const diaElectoralRouter = Router();

// ---------------------------------------------------------------------------
// Público (sin sesión) — el militante confirma su propio voto desde la app,
// igual que el RSVP de actividades.
// ---------------------------------------------------------------------------

diaElectoralRouter.get(
  "/activo",
  asyncRoute(async (_req, res) => {
    const evento = await prisma.eventoElectoral.findFirst({ where: { activo: true }, orderBy: { fecha: "desc" } });
    res.json(evento);
  }),
);

const confirmarSchema = z.object({ militanteId: z.string() });

diaElectoralRouter.post(
  "/confirmar",
  asyncRoute(async (req, res) => {
    const { militanteId } = confirmarSchema.parse(req.body);
    const evento = await prisma.eventoElectoral.findFirst({ where: { activo: true } });
    if (!evento) throw new HttpError(404, "No hay una jornada electoral activa");
    const militante = await prisma.militante.findUnique({ where: { id: militanteId } });
    if (!militante) throw new HttpError(404, "No se encontró tu registro de militante");

    const confirmacion = await prisma.confirmacionVoto.upsert({
      where: { eventoId_militanteId: { eventoId: evento.id, militanteId } },
      update: {},
      create: { eventoId: evento.id, militanteId, metodo: "AUTOREPORTE" },
    });
    emitirCambioVotos();
    res.json(confirmacion);
  }),
);

diaElectoralRouter.get(
  "/mi-estado/:militanteId",
  asyncRoute(async (req, res) => {
    const evento = await prisma.eventoElectoral.findFirst({ where: { activo: true } });
    if (!evento) return res.json({ confirmado: false });
    const confirmacion = await prisma.confirmacionVoto.findUnique({
      where: { eventoId_militanteId: { eventoId: evento.id, militanteId: req.params.militanteId } },
    });
    res.json({ confirmado: !!confirmacion, confirmadoEn: confirmacion?.createdAt ?? null });
  }),
);

diaElectoralRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Buscador rápido de militante (RF nuevo): para quien está haciendo llamadas
// de seguimiento y solo necesita saber "¿fulano ya votó?" sin navegar el
// mapa — busca por cédula o nombre y devuelve su estado de confirmación
// para la jornada indicada.
// ---------------------------------------------------------------------------

const buscarSchema = z.object({ query: z.string().min(2), eventoId: z.string() });

diaElectoralRouter.get(
  "/buscar",
  asyncRoute(async (req, res) => {
    const { query, eventoId } = buscarSchema.parse(req.query);
    const militantes = await prisma.militante.findMany({
      where: { OR: [{ cedula: { contains: query } }, { nombre: { contains: query, mode: "insensitive" } }] },
      take: 15,
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        cedula: true,
        telefono: true,
        provincia: { select: { nombre: true } },
        municipio: { select: { nombre: true } },
      },
    });
    const confirmaciones = await prisma.confirmacionVoto.findMany({
      where: { eventoId, militanteId: { in: militantes.map((m) => m.id) } },
    });
    const confirmadoMap = new Map(confirmaciones.map((c) => [c.militanteId, c]));

    res.json(
      militantes.map((m) => {
        const confirmacion = confirmadoMap.get(m.id);
        return {
          id: m.id,
          nombre: m.nombre,
          cedula: m.cedula,
          telefono: m.telefono,
          provincia: m.provincia.nombre,
          municipio: m.municipio.nombre,
          confirmado: !!confirmacion,
          metodo: confirmacion?.metodo ?? null,
          confirmadoEn: confirmacion?.createdAt ?? null,
        };
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Gestión del evento electoral (SUPERADMIN) — solo uno puede estar activo.
// ---------------------------------------------------------------------------

const eventoSchema = z.object({
  nombre: z.string().min(3),
  fecha: z.coerce.date(),
});

diaElectoralRouter.get(
  "/eventos",
  asyncRoute(async (_req, res) => {
    const eventos = await prisma.eventoElectoral.findMany({ orderBy: { fecha: "desc" } });
    res.json(eventos);
  }),
);

diaElectoralRouter.post(
  "/eventos",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = eventoSchema.parse(req.body);
    const evento = await prisma.$transaction(async (tx) => {
      await tx.eventoElectoral.updateMany({ where: { activo: true }, data: { activo: false } });
      return tx.eventoElectoral.create({ data: { ...data, activo: true } });
    });
    res.status(201).json(evento);
  }),
);

diaElectoralRouter.patch(
  "/eventos/:id",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = eventoSchema.partial().extend({ activo: z.boolean().optional() }).parse(req.body);
    const evento = await prisma.$transaction(async (tx) => {
      if (data.activo) await tx.eventoElectoral.updateMany({ where: { activo: true }, data: { activo: false } });
      return tx.eventoElectoral.update({ where: { id: req.params.id }, data });
    });
    res.json(evento);
  }),
);

// ---------------------------------------------------------------------------
// Marcado por fiscal de mesa / promotor — mismo esquema que el check-in de
// Actividades: el código escaneado (o pegado a mano) es el id del carnet o
// la cédula del militante.
// ---------------------------------------------------------------------------

const confirmarMesaSchema = z.object({ eventoId: z.string(), codigo: z.string().min(3) });

diaElectoralRouter.post(
  "/confirmar-mesa",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const { eventoId, codigo } = confirmarMesaSchema.parse(req.body);
    const evento = await prisma.eventoElectoral.findUnique({ where: { id: eventoId } });
    if (!evento) throw new HttpError(404, "Evento electoral no encontrado");
    const militante = await prisma.militante.findFirst({ where: { OR: [{ id: codigo }, { cedula: codigo }] } });
    if (!militante) throw new HttpError(404, "Carnet no válido: no existe ningún militante con ese código");

    const confirmacion = await prisma.confirmacionVoto.upsert({
      where: { eventoId_militanteId: { eventoId, militanteId: militante.id } },
      update: {},
      create: { eventoId, militanteId: militante.id, metodo: "FISCAL_MESA", confirmadoPorId: req.user!.id },
    });
    emitirCambioVotos();
    res.json({ ...confirmacion, militante: { nombre: militante.nombre, cedula: militante.cedula } });
  }),
);

// ---------------------------------------------------------------------------
// Agregación geográfica — mismo patrón que geo.routes.ts (statsPorCampo /
// propsDemarcacion), aplicado a confirmaciones de voto en vez de captación.
// Dos métricas por demarcación: % sobre la propia base de militantes
// registrados, y % sobre el padrón electoral general (campo `electores`) —
// esta última es un piso/indicador mínimo de participación confirmada, no
// un conteo real de todos los votantes (solo vemos a nuestros militantes).
// ---------------------------------------------------------------------------

type CampoGeo = "provinciaId" | "municipioId" | "distritoMunicipalId";

async function statsVotos(campo: CampoGeo, eventoId: string, whereMilitanteBase: Record<string, unknown> = {}) {
  const [totales, confirmaciones] = await Promise.all([
    prisma.militante.groupBy({ by: [campo], where: whereMilitanteBase, _count: { _all: true } }),
    prisma.confirmacionVoto.findMany({
      where: { eventoId, militante: whereMilitanteBase },
      select: { militante: { select: { provinciaId: true, municipioId: true, distritoMunicipalId: true } } },
    }),
  ]);
  const registrados = new Map((totales as ({ _count: { _all: number } } & Record<string, unknown>)[]).map((t) => [t[campo] as string | null, t._count._all]));
  const confirmados = new Map<string | null, number>();
  for (const c of confirmaciones) {
    const key = c.militante[campo] as string | null;
    confirmados.set(key, (confirmados.get(key) ?? 0) + 1);
  }
  return { registrados, confirmados };
}

type StatsVotos = Awaited<ReturnType<typeof statsVotos>>;

function propsVotoDemarcacion(
  id: string | null,
  electores: number | null | undefined,
  stats: StatsVotos,
  metaObjetivo?: number | null,
) {
  const registrados = stats.registrados.get(id) ?? 0;
  const confirmados = stats.confirmados.get(id) ?? 0;
  return {
    militantesRegistrados: registrados,
    votosConfirmados: confirmados,
    porcentajePropia: registrados > 0 ? Math.round((confirmados / registrados) * 1000) / 10 : confirmados > 0 ? 100 : 0,
    electores: electores ?? null,
    porcentajePadron: electores && electores > 0 ? Math.round((confirmados / electores) * 1000) / 10 : null,
    metaObjetivo: metaObjetivo ?? null,
  };
}

// ---------------------------------------------------------------------------
// Metas de participación por demarcación (RF nuevo): a diferencia de
// MetaMilitantes (captación histórica, vigente por rango de fechas), acá la
// meta es propia de UNA jornada electoral — "% de militantes propios que
// deberían confirmar su voto" por provincia/municipio/distrito. Se guarda
// como upsert simple (una fila por evento+demarcación) en vez de historial
// versionado: no hace falta, la meta de una jornada ya pasada no cambia.
// ---------------------------------------------------------------------------

const metaNivelSchema = z.enum(["provincia", "municipio", "distrito"]);

function campoDeNivel(nivel: z.infer<typeof metaNivelSchema>): "provinciaId" | "municipioId" | "distritoMunicipalId" {
  if (nivel === "provincia") return "provinciaId";
  if (nivel === "municipio") return "municipioId";
  return "distritoMunicipalId";
}

async function metasPorDemarcacion(eventoId: string, campo: CampoGeo): Promise<Map<string, number>> {
  const metas = await prisma.metaParticipacion.findMany({ where: { eventoId, [campo]: { not: null } } });
  return new Map(metas.map((m) => [(m as unknown as Record<string, string>)[campo], m.porcentajeObjetivo]));
}

diaElectoralRouter.get(
  "/metas",
  asyncRoute(async (req, res) => {
    const { eventoId } = z.object({ eventoId: z.string() }).parse(req.query);
    const metas = await prisma.metaParticipacion.findMany({ where: { eventoId }, orderBy: { createdAt: "desc" } });
    const [provincias, municipios, distritos] = await Promise.all([
      prisma.provincia.findMany({ where: { id: { in: metas.flatMap((m) => (m.provinciaId ? [m.provinciaId] : [])) } } }),
      prisma.municipio.findMany({ where: { id: { in: metas.flatMap((m) => (m.municipioId ? [m.municipioId] : [])) } } }),
      prisma.distritoMunicipal.findMany({
        where: { id: { in: metas.flatMap((m) => (m.distritoMunicipalId ? [m.distritoMunicipalId] : [])) } },
      }),
    ]);
    const nombreDe = new Map<string, string>([
      ...provincias.map((p) => [p.id, p.nombre] as const),
      ...municipios.map((m) => [m.id, m.nombre] as const),
      ...distritos.map((d) => [d.id, d.nombre] as const),
    ]);
    res.json(
      metas.map((m) => {
        const demarcacionId = m.provinciaId ?? m.municipioId ?? m.distritoMunicipalId ?? "";
        const nivel = m.provinciaId ? "provincia" : m.municipioId ? "municipio" : "distrito";
        return { id: m.id, nivel, demarcacionId, nombre: nombreDe.get(demarcacionId) ?? "—", porcentajeObjetivo: m.porcentajeObjetivo };
      }),
    );
  }),
);

const metaSchema = z.object({
  eventoId: z.string(),
  nivel: metaNivelSchema,
  demarcacionId: z.string(),
  porcentajeObjetivo: z.number().int().min(1).max(100),
});

diaElectoralRouter.post(
  "/metas",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (req, res) => {
    const { eventoId, nivel, demarcacionId, porcentajeObjetivo } = metaSchema.parse(req.body);
    const campo = campoDeNivel(nivel);
    const existente = await prisma.metaParticipacion.findFirst({ where: { eventoId, [campo]: demarcacionId } });
    const meta = existente
      ? await prisma.metaParticipacion.update({ where: { id: existente.id }, data: { porcentajeObjetivo } })
      : await prisma.metaParticipacion.create({ data: { eventoId, [campo]: demarcacionId, porcentajeObjetivo } });
    res.status(existente ? 200 : 201).json(meta);
  }),
);

diaElectoralRouter.delete(
  "/metas/:id",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (req, res) => {
    await prisma.metaParticipacion.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// Proyección de participación final (RF nuevo): extrapola linealmente el
// ritmo de confirmaciones visto hasta ahora contra lo que falta de la
// ventana de votación — mismo horario típico de RD (6am-5pm) que ya usa
// verificarBajaParticipacionCierre en lib/alertasVotacion.ts. Solo tiene
// sentido para una jornada de HOY y dentro de esa ventana; fuera de ella
// (jornada pasada, o antes/después de horario) se devuelve null en vez de
// una cifra que no significaría nada.
const HORA_APERTURA_VOTACION = 6;
const HORA_CIERRE_VOTACION_RESUMEN = 17;

function proyeccionParticipacion(fechaEvento: Date, porcentajeActual: number): number | null {
  const ahora = new Date();
  const esHoy =
    fechaEvento.getFullYear() === ahora.getFullYear() &&
    fechaEvento.getMonth() === ahora.getMonth() &&
    fechaEvento.getDate() === ahora.getDate();
  if (!esHoy) return null;

  const horaActual = ahora.getHours() + ahora.getMinutes() / 60;
  if (horaActual <= HORA_APERTURA_VOTACION || horaActual >= HORA_CIERRE_VOTACION_RESUMEN) return null;

  const fraccionTranscurrida = (horaActual - HORA_APERTURA_VOTACION) / (HORA_CIERRE_VOTACION_RESUMEN - HORA_APERTURA_VOTACION);
  const proyeccion = porcentajeActual / fraccionTranscurrida;
  return Math.round(Math.min(100, proyeccion) * 10) / 10;
}

diaElectoralRouter.get(
  "/resumen/:eventoId",
  asyncRoute(async (req, res) => {
    const { eventoId } = req.params;
    const evento = await prisma.eventoElectoral.findUniqueOrThrow({ where: { id: eventoId } });
    const [militantesRegistrados, votosConfirmados, padron] = await Promise.all([
      prisma.militante.count(),
      prisma.confirmacionVoto.count({ where: { eventoId } }),
      prisma.provincia.aggregate({ _sum: { electores: true } }),
    ]);
    const electoresNacional = padron._sum.electores ?? 0;
    const porcentajePropia = militantesRegistrados > 0 ? Math.round((votosConfirmados / militantesRegistrados) * 1000) / 10 : 0;
    res.json({
      evento,
      militantesRegistrados,
      votosConfirmados,
      porcentajePropia,
      electoresNacional,
      porcentajePadron: electoresNacional > 0 ? Math.round((votosConfirmados / electoresNacional) * 1000) / 10 : null,
      proyeccionFinal: proyeccionParticipacion(evento.fecha, porcentajePropia),
    });
  }),
);

diaElectoralRouter.get(
  "/provincias",
  asyncRoute(async (req, res) => {
    const { eventoId } = z.object({ eventoId: z.string() }).parse(req.query);
    const alcanceUsuario = await resolverAlcance(req.user!);
    const geo = loadProvinciasGeo();
    const [stats, provincias, metas] = await Promise.all([
      statsVotos("provinciaId", eventoId),
      prisma.provincia.findMany({ select: { id: true, electores: true } }),
      metasPorDemarcacion(eventoId, "provinciaId"),
    ]);
    const electoresMap = new Map(provincias.map((p) => [p.id, p.electores]));

    const features = geo.features
      .filter((f) => puedeVerProvincia(alcanceUsuario, String(f.properties?.id)))
      .map((f) => {
        const id = String(f.properties?.id);
        return { ...f, properties: { ...f.properties, ...propsVotoDemarcacion(id, electoresMap.get(id), stats, metas.get(id)) } };
      });

    res.json({ type: "FeatureCollection", features });
  }),
);

// GET /dia-electoral/provincias/:provinciaId — resumen puntual de una sola
// provincia (mismo patrón que /geo/provincias/:id): lo usa el panel del mapa
// al volver atrás por el breadcrumb, donde no hay un feature recién clicado
// del que tomar los datos.
diaElectoralRouter.get(
  "/provincias/:provinciaId",
  asyncRoute(async (req, res) => {
    const { provinciaId } = req.params;
    const { eventoId } = z.object({ eventoId: z.string() }).parse(req.query);
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeVerProvincia(alcanceUsuario, provinciaId)) throw new HttpError(403, "No tienes acceso a esta provincia");

    const provincia = await prisma.provincia.findUniqueOrThrow({ where: { id: provinciaId } });
    const [stats, metas] = await Promise.all([
      statsVotos("provinciaId", eventoId, { provinciaId }),
      metasPorDemarcacion(eventoId, "provinciaId"),
    ]);
    res.json({
      id: provincia.id,
      nombre: provincia.nombre,
      ...propsVotoDemarcacion(provinciaId, provincia.electores, stats, metas.get(provinciaId)),
    });
  }),
);

diaElectoralRouter.get(
  "/provincias/:provinciaId/municipios",
  asyncRoute(async (req, res) => {
    const { provinciaId } = req.params;
    const { eventoId } = z.object({ eventoId: z.string() }).parse(req.query);
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeVerProvincia(alcanceUsuario, provinciaId)) throw new HttpError(403, "No tienes acceso a esta provincia");

    const geo = loadMunicipiosGeo();
    let featuresProv = geo.features.filter((f) => f.properties?.provinciaId === provinciaId);
    if (alcanceUsuario && alcanceUsuario.nivel !== "provincia") {
      featuresProv = featuresProv.filter((f) => f.properties?.id === alcanceUsuario.municipioId);
    }

    const [stats, municipios, metas] = await Promise.all([
      statsVotos("municipioId", eventoId, { provinciaId }),
      prisma.municipio.findMany({ where: { provinciaId }, select: { id: true, electores: true } }),
      metasPorDemarcacion(eventoId, "municipioId"),
    ]);
    const electoresMap = new Map(municipios.map((m) => [m.id, m.electores]));

    const features = featuresProv.map((f) => {
      const id = String(f.properties?.id);
      return { ...f, properties: { ...f.properties, ...propsVotoDemarcacion(id, electoresMap.get(id), stats, metas.get(id)) } };
    });

    res.json({ type: "FeatureCollection", features });
  }),
);

function normalizarDM(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function sinArticulo(s: string): string {
  let out = s;
  for (let i = 0; i < 2; i++) out = out.replace(/^(EL|LA|LOS|LAS|DE|DEL)\s+/, "");
  return out;
}

// Mismo criterio que geo.routes.ts: el geojson trae, por municipio, sus
// distritos municipales reales más un polígono "cabecera" que cubre lo no
// repartido — se resuelve/crea contra la tabla real DistritoMunicipal (que ya
// existirá casi siempre, poblada al navegar el mapa de militantes).
diaElectoralRouter.get(
  "/municipios/:municipioId/distritos-municipales",
  asyncRoute(async (req, res) => {
    const { municipioId } = req.params;
    const { eventoId } = z.object({ eventoId: z.string() }).parse(req.query);
    const alcanceUsuario = await resolverAlcance(req.user!);
    const municipioBase = await prisma.municipio.findUniqueOrThrow({
      where: { id: municipioId },
      select: { provinciaId: true, electores: true },
    });
    if (!puedeVerMunicipio(alcanceUsuario, municipioId, municipioBase.provinciaId)) {
      throw new HttpError(403, "No tienes acceso a este municipio");
    }
    const geo = loadDistritosMunicipalesGeo();
    const featuresMuni = geo.features.filter((f) => f.properties?.municipioId === municipioId);

    const existentes = await prisma.distritoMunicipal.findMany({ where: { municipioId } });
    const porNombreExacto = new Map(existentes.map((d) => [normalizarDM(d.nombre), d]));
    const porNombreSinArticulo = new Map<string, (typeof existentes)[number]>();
    for (const d of existentes) {
      const key = sinArticulo(normalizarDM(d.nombre));
      if (!porNombreSinArticulo.has(key)) porNombreSinArticulo.set(key, d);
    }

    let resueltos = await Promise.all(
      featuresMuni.map(async (f) => {
        if (f.properties?.esCabecera) return { feature: f, distrito: null };
        const nombre = String(f.properties?.nombre ?? "");
        const exacto = porNombreExacto.get(normalizarDM(nombre));
        const suelto = porNombreSinArticulo.get(sinArticulo(normalizarDM(nombre)));
        let distrito = exacto ?? suelto;
        if (!distrito) distrito = await prisma.distritoMunicipal.create({ data: { municipioId, nombre } });
        return { feature: f, distrito };
      }),
    );
    if (alcanceUsuario?.nivel === "distrito") {
      resueltos = resueltos.filter((r) => r.distrito?.id === alcanceUsuario.distritoMunicipalId);
    }

    const [stats, metas] = await Promise.all([
      statsVotos("distritoMunicipalId", eventoId, { municipioId }),
      metasPorDemarcacion(eventoId, "distritoMunicipalId"),
    ]);

    const features = resueltos.map(({ feature, distrito }) => {
      if (!distrito) {
        return {
          ...feature,
          properties: { ...feature.properties, id: null, ...propsVotoDemarcacion(null, municipioBase.electores, stats) },
        };
      }
      return {
        ...feature,
        properties: {
          ...feature.properties,
          id: distrito.id,
          nombre: distrito.nombre,
          ...propsVotoDemarcacion(distrito.id, distrito.electores, stats, metas.get(distrito.id)),
        },
      };
    });

    res.json({ type: "FeatureCollection", features });
  }),
);

// ---------------------------------------------------------------------------
// Mesas (recinto + colegio) — filtrar mesa a mesa dentro de un municipio. Los
// recintos/colegios no tienen polígono propio (son un punto/dirección
// puntual, no una demarcación administrativa), así que se listan en vez de
// sombrearse en el mapa.
// ---------------------------------------------------------------------------

diaElectoralRouter.get(
  "/mesas",
  asyncRoute(async (req, res) => {
    const { municipioId, eventoId } = z.object({ municipioId: z.string(), eventoId: z.string() }).parse(req.query);
    const municipio = await prisma.municipio.findUniqueOrThrow({ where: { id: municipioId } });
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeVerMunicipio(alcanceUsuario, municipioId, municipio.provinciaId)) {
      throw new HttpError(403, "No tienes acceso a este municipio");
    }

    const recintos = await prisma.recintoElectoral.findMany({
      where: { localidad: { municipioId } },
      include: { colegios: { include: { responsable: { select: { id: true, nombre: true } } } } },
      orderBy: { nombre: "asc" },
    });

    const colegioIds = recintos.flatMap((r) => r.colegios.map((c) => c.id));
    const [registradosPorColegio, confirmadosPorColegio, incidenciasPorColegio] = await Promise.all([
      prisma.militante.groupBy({ by: ["colegioId"], where: { colegioId: { in: colegioIds } }, _count: { _all: true } }),
      prisma.confirmacionVoto.findMany({
        where: { eventoId, militante: { colegioId: { in: colegioIds } } },
        select: { militante: { select: { colegioId: true } } },
      }),
      prisma.incidenciaMesa.groupBy({
        by: ["colegioId"],
        where: { eventoId, colegioId: { in: colegioIds }, resuelta: false },
        _count: { _all: true },
      }),
    ]);
    const registradosMap = new Map(registradosPorColegio.map((r) => [r.colegioId as string, r._count._all]));
    const confirmadosMap = new Map<string, number>();
    for (const c of confirmadosPorColegio) {
      const id = c.militante.colegioId!;
      confirmadosMap.set(id, (confirmadosMap.get(id) ?? 0) + 1);
    }
    const incidenciasMap = new Map(incidenciasPorColegio.map((i) => [i.colegioId, i._count._all]));

    const resultado = recintos.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      direccion: r.direccion,
      mesas: r.colegios.map((c) => {
        const registrados = registradosMap.get(c.id) ?? 0;
        const confirmados = confirmadosMap.get(c.id) ?? 0;
        return {
          id: c.id,
          numero: c.numero,
          militantesRegistrados: registrados,
          votosConfirmados: confirmados,
          porcentajePropia: registrados > 0 ? Math.round((confirmados / registrados) * 1000) / 10 : confirmados > 0 ? 100 : 0,
          responsableId: c.responsableId,
          responsableNombre: c.responsable?.nombre ?? null,
          incidenciasAbiertas: incidenciasMap.get(c.id) ?? 0,
        };
      }),
    }));

    res.json(resultado);
  }),
);

// Asignar/quitar el fiscal-promotor responsable de una mesa (RF nuevo): si
// esa mesa queda rezagada cerca del cierre, la alerta le llega a esta
// persona puntual en vez de solo al panel general (ver
// lib/alertasVotacion.ts). Mandar responsableId: null para quitar la
// asignación.
const responsableMesaSchema = z.object({ responsableId: z.string().nullable() });

diaElectoralRouter.patch(
  "/mesas/:colegioId/responsable",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const { responsableId } = responsableMesaSchema.parse(req.body);
    const colegio = await prisma.colegio.update({
      where: { id: req.params.colegioId },
      data: { responsableId },
      include: { responsable: { select: { id: true, nombre: true } } },
    });
    res.json({ id: colegio.id, responsableId: colegio.responsableId, responsableNombre: colegio.responsable?.nombre ?? null });
  }),
);

// ---------------------------------------------------------------------------
// Incidencias por mesa (RF nuevo): a diferencia de ConfirmacionVoto (el
// conteo de participación, secreto), esto documenta problemas OPERATIVOS del
// día — padrón incompleto, mesa cerrada antes de hora, etc. — para
// seguimiento/reclamos posteriores. No altera ninguna cifra de participación.
// ---------------------------------------------------------------------------

const incidenciaSchema = z.object({
  eventoId: z.string(),
  colegioId: z.string(),
  tipo: z.enum(["PADRON_INCOMPLETO", "MESA_CERRADA_TEMPRANO", "PROBLEMA_TECNICO", "OTRA"]),
  descripcion: z.string().min(3),
});

diaElectoralRouter.post(
  "/incidencias",
  asyncRoute(async (req, res) => {
    const data = incidenciaSchema.parse(req.body);
    const incidencia = await prisma.incidenciaMesa.create({
      data: { ...data, reportadoPorId: req.user!.id },
      include: { reportadoPor: { select: { nombre: true } }, colegio: { select: { numero: true } } },
    });
    res.status(201).json(incidencia);
  }),
);

diaElectoralRouter.get(
  "/incidencias",
  asyncRoute(async (req, res) => {
    const { eventoId, municipioId } = z.object({ eventoId: z.string(), municipioId: z.string().optional() }).parse(req.query);
    const incidencias = await prisma.incidenciaMesa.findMany({
      where: {
        eventoId,
        ...(municipioId ? { colegio: { recintoElectoral: { localidad: { municipioId } } } } : {}),
      },
      include: {
        reportadoPor: { select: { nombre: true } },
        colegio: { select: { numero: true, recintoElectoral: { select: { nombre: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      incidencias.map((i) => ({
        id: i.id,
        tipo: i.tipo,
        descripcion: i.descripcion,
        resuelta: i.resuelta,
        createdAt: i.createdAt,
        reportadoPor: i.reportadoPor.nombre,
        mesaNumero: i.colegio.numero,
        recintoNombre: i.colegio.recintoElectoral.nombre,
      })),
    );
  }),
);

diaElectoralRouter.patch(
  "/incidencias/:id",
  asyncRoute(async (req, res) => {
    const { resuelta } = z.object({ resuelta: z.boolean() }).parse(req.body);
    const incidencia = await prisma.incidenciaMesa.update({ where: { id: req.params.id }, data: { resuelta } });
    res.json(incidencia);
  }),
);
