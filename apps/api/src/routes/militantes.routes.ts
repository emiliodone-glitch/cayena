import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "@cayena/database";
import {
  requireAuth,
  requireRole,
  requireModulo,
  resolverAlcance,
  whereMilitanteAlcance,
  puedeGestionarMilitante,
} from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { otorgarInsigniaBienvenida } from "../lib/gamificacion";
import { calcularRango, type Periodo } from "../lib/periodo";
import { emitirCambioMilitantes } from "../lib/eventos";

function normalizarNombre(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export const militantesRouter = Router();

const registroPublicoSchema = z.object({
  nombre: z.string().min(2),
  cedula: z.string().min(5),
  telefono: z.string().min(6),
  lat: z.number().optional(),
  lng: z.number().optional(),
  provinciaId: z.string(),
  municipioId: z.string(),
  consentimientoDatos: z.literal(true),
});

// RF-26: cualquier persona puede registrarse como simpatizante/militante desde la app.
militantesRouter.post(
  "/registro-publico",
  asyncRoute(async (req, res) => {
    const data = registroPublicoSchema.parse(req.body);

    const existente = await prisma.militante.findUnique({ where: { cedula: data.cedula } });
    if (existente) throw new HttpError(409, "Ya existe un registro con esta cédula");

    const militante = await prisma.militante.create({
      data: { ...data, origen: "APP_PUBLICA" },
    });
    await otorgarInsigniaBienvenida(militante.id);
    emitirCambioMilitantes();
    res.status(201).json(militante);
  }),
);

// Fase 2 — gamificación: el propio militante consulta su progreso con su cédula
// (no hay cuenta de usuario para el auto-registro público, RF-26).
militantesRouter.get(
  "/mi-progreso/:cedula",
  asyncRoute(async (req, res) => {
    const militante = await prisma.militante.findUnique({
      where: { cedula: req.params.cedula },
      select: {
        id: true,
        nombre: true,
        puntos: true,
        insignias: {
          select: { otorgadaAt: true, insignia: { select: { codigo: true, nombre: true, descripcion: true, puntos: true } } },
        },
      },
    });
    if (!militante) throw new HttpError(404, "No se encontró un registro con esa cédula");
    res.json(militante);
  }),
);

// Fase 2 — ranking básico de gamificación (nombre parcial, sin datos sensibles).
militantesRouter.get(
  "/ranking",
  asyncRoute(async (_req, res) => {
    const top = await prisma.militante.findMany({
      where: { puntos: { gt: 0 } },
      orderBy: { puntos: "desc" },
      take: 20,
      select: { nombre: true, puntos: true, provincia: { select: { nombre: true } } },
    });
    res.json(
      top.map((m) => {
        const partes = m.nombre.trim().split(/\s+/);
        const nombreParcial =
          partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1].charAt(0)}.` : partes[0];
        return { nombre: nombreParcial, puntos: m.puntos, provincia: m.provincia.nombre };
      }),
    );
  }),
);

militantesRouter.use(requireAuth);
militantesRouter.use(requireModulo("militantes"));

// Fase 2 — carnet digital con QR: el QR codifica el id interno del militante;
// el back office lo verifica escaneándolo/pegándolo aquí (RF de "Carnet digital con código QR").
militantesRouter.get(
  "/carnet/:id",
  asyncRoute(async (req, res) => {
    const militante = await prisma.militante.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        nombre: true,
        cedula: true,
        provincia: { select: { nombre: true } },
        municipio: { select: { nombre: true } },
        createdAt: true,
      },
    });
    if (!militante) throw new HttpError(404, "Carnet no válido: no existe ningún militante con ese código");
    res.json({ ...militante, estado: "activo" });
  }),
);

const querySchema = z.object({
  provinciaId: z.string().optional(),
  municipioId: z.string().optional(),
  distritoMunicipalId: z.string().optional(),
  // Filtra militantes de la "cabecera" de un municipio (sin distrito municipal
  // asignado) cuando se pasa junto con municipioId — ver nivel "distritos" del mapa.
  sinDistritoMunicipal: z.enum(["true"]).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  // Mismo vocabulario de período que el mapa/dashboard (lib/periodo), para que
  // el padrón filtrado por el mapa muestre exactamente los mismos militantes
  // que el mapa está contando.
  periodo: z.enum(["semana", "mes", "trimestre", "custom"]).optional(),
  origen: z.enum(["BACKOFFICE", "APP_PUBLICA"]).optional(),
  capturadoPorId: z.string().optional(),
  q: z.string().optional(),
});

// RF-14: exportar/listar padrón filtrado por zona o rango de fechas
militantesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { provinciaId, municipioId, distritoMunicipalId, sinDistritoMunicipal, desde, hasta, periodo, origen, capturadoPorId, q } =
      querySchema.parse(req.query);
    const alcanceUsuario = await resolverAlcance(req.user!);
    const fechaFilter: Record<string, Date> = {};
    if (periodo) {
      const rango = calcularRango(periodo as Periodo, desde, hasta);
      fechaFilter.gte = rango.inicio;
      fechaFilter.lte = rango.fin;
    } else {
      if (desde) fechaFilter.gte = new Date(desde);
      if (hasta) fechaFilter.lte = new Date(hasta);
    }

    const militantes = await prisma.militante.findMany({
      where: {
        ...(provinciaId ? { provinciaId } : {}),
        ...(municipioId ? { municipioId } : {}),
        ...(distritoMunicipalId ? { distritoMunicipalId } : {}),
        ...(sinDistritoMunicipal === "true" ? { distritoMunicipalId: null } : {}),
        ...(origen ? { origen } : {}),
        ...(capturadoPorId ? { capturadoPorId } : {}),
        ...(Object.keys(fechaFilter).length ? { createdAt: fechaFilter } : {}),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { cedula: { contains: q } },
                { telefono: { contains: q } },
              ],
            }
          : {}),
        // Un coordinador con territorio asignado solo ve el padrón de su
        // propia zona, sin importar qué filtros haya pasado — igual que en
        // los endpoints del mapa (ver whereMilitanteAlcance).
        ...whereMilitanteAlcance(alcanceUsuario),
      },
      include: {
        provincia: { select: { nombre: true } },
        municipio: { select: { nombre: true } },
        localidad: { select: { nombre: true } },
        recintoElectoral: { select: { nombre: true } },
        colegio: { select: { numero: true } },
        capturadoPor: { select: { nombre: true } },
        _count: { select: { insignias: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    res.json(militantes);
  }),
);

const militanteSchema = z.object({
  nombre: z.string().min(2),
  cedula: z.string().min(5),
  telefono: z.string().nullable().optional(),
  direccion: z.string().nullable().optional(),
  provinciaId: z.string(),
  municipioId: z.string(),
  distritoMunicipalId: z.string().nullable().optional(),
  localidadId: z.string().nullable().optional(),
  recintoElectoralId: z.string().nullable().optional(),
  colegioId: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  consentimientoDatos: z.literal(true),
});

// RF-10/RF-11: registrar militante desde el back office (queda trazado el promotor y la fecha)
militantesRouter.post(
  "/",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const data = militanteSchema.parse(req.body);
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (
      !puedeGestionarMilitante(alcanceUsuario, {
        provinciaId: data.provinciaId,
        municipioId: data.municipioId,
        distritoMunicipalId: data.distritoMunicipalId ?? null,
      })
    ) {
      throw new HttpError(403, "No puedes registrar militantes fuera de tu territorio asignado");
    }

    const existente = await prisma.militante.findUnique({ where: { cedula: data.cedula } });
    if (existente) throw new HttpError(409, "Ya existe un registro con esta cédula");

    const militante = await prisma.militante.create({
      data: { ...data, capturadoPorId: req.user!.id, origen: "BACKOFFICE" },
    });
    await otorgarInsigniaBienvenida(militante.id);
    emitirCambioMilitantes();
    res.status(201).json(militante);
  }),
);

const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

type FilaImportacion = {
  fila: number;
  nombre?: string;
  estado: "creado" | "duplicado" | "error";
  mensaje?: string;
};

// Importación masiva de militantes vía CSV (columnas: nombre, cedula, telefono,
// direccion, provincia, municipio, localidad, recintoElectoral, colegio). La
// provincia y el municipio se resuelven por nombre (no hace falta conocer los
// IDs internos).
militantesRouter.post(
  "/importar",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  uploadCsv.single("file"),
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No se recibió ningún archivo CSV");
    const alcanceUsuario = await resolverAlcance(req.user!);
    // El CSV no soporta distrito municipal (solo provincia/municipio) — un
    // coordinador con territorio a nivel distrito no puede producir filas
    // que cumplan su alcance exacto, así que se le pide registrar uno por
    // uno en vez de dejar que la importación cree militantes fuera de su
    // distrito sin que se note.
    if (alcanceUsuario?.nivel === "distrito") {
      throw new HttpError(
        400,
        "Tu territorio asignado es un distrito municipal específico y la importación por CSV no distingue ese nivel — registra los militantes uno por uno desde el formulario.",
      );
    }

    let filas: Record<string, string>[];
    try {
      filas = parse(req.file.buffer.toString("utf-8"), {
        columns: (header: string[]) => header.map((h) => normalizarNombre(h)),
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new HttpError(400, "No se pudo leer el CSV. Verifica el formato y los encabezados.");
    }

    const [provincias, municipios] = await Promise.all([
      prisma.provincia.findMany(),
      prisma.municipio.findMany(),
    ]);
    const provinciaPorNombre = new Map(provincias.map((p) => [normalizarNombre(p.nombre), p]));
    const municipioPorNombreYProvincia = new Map(
      municipios.map((m) => [`${m.provinciaId}::${normalizarNombre(m.nombre)}`, m]),
    );

    const resultados: FilaImportacion[] = [];
    let creados = 0;

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const numeroFila = i + 2; // +2: encabezado + índice base 1
      const nombre = fila.nombre?.trim();
      const cedula = fila.cedula?.trim();
      const provinciaNombre = fila.provincia?.trim();
      const municipioNombre = fila.municipio?.trim();

      if (!nombre || !cedula || !provinciaNombre || !municipioNombre) {
        resultados.push({ fila: numeroFila, nombre, estado: "error", mensaje: "Faltan campos obligatorios (nombre, cedula, provincia, municipio)" });
        continue;
      }

      const provincia = provinciaPorNombre.get(normalizarNombre(provinciaNombre));
      if (!provincia) {
        resultados.push({ fila: numeroFila, nombre, estado: "error", mensaje: `Provincia "${provinciaNombre}" no encontrada` });
        continue;
      }
      const municipio = municipioPorNombreYProvincia.get(`${provincia.id}::${normalizarNombre(municipioNombre)}`);
      if (!municipio) {
        resultados.push({ fila: numeroFila, nombre, estado: "error", mensaje: `Municipio "${municipioNombre}" no encontrado en ${provincia.nombre}` });
        continue;
      }
      if (!puedeGestionarMilitante(alcanceUsuario, { provinciaId: provincia.id, municipioId: municipio.id })) {
        resultados.push({
          fila: numeroFila,
          nombre,
          estado: "error",
          mensaje: `"${municipioNombre}, ${provincia.nombre}" está fuera de tu territorio asignado`,
        });
        continue;
      }

      const existente = await prisma.militante.findUnique({ where: { cedula } });
      if (existente) {
        resultados.push({ fila: numeroFila, nombre, estado: "duplicado", mensaje: `Ya existe un registro con cédula ${cedula}` });
        continue;
      }

      try {
        const nombreLocalidad = fila.localidad?.trim();
        const nombreRecinto = fila.recintoelectoral?.trim();
        const numeroColegio = fila.colegio?.trim();
        let localidadId: string | undefined;
        let recintoElectoralId: string | undefined;
        let colegioId: string | undefined;

        if (nombreLocalidad) {
          const localidad = await prisma.localidad.upsert({
            where: { municipioId_nombre: { municipioId: municipio.id, nombre: nombreLocalidad } },
            update: {},
            create: { municipioId: municipio.id, nombre: nombreLocalidad },
          });
          localidadId = localidad.id;

          if (nombreRecinto) {
            const recinto = await prisma.recintoElectoral.upsert({
              where: { localidadId_nombre: { localidadId: localidad.id, nombre: nombreRecinto } },
              update: {},
              create: { localidadId: localidad.id, nombre: nombreRecinto },
            });
            recintoElectoralId = recinto.id;

            if (numeroColegio) {
              const colegio = await prisma.colegio.upsert({
                where: { recintoElectoralId_numero: { recintoElectoralId: recinto.id, numero: numeroColegio } },
                update: {},
                create: { recintoElectoralId: recinto.id, numero: numeroColegio },
              });
              colegioId = colegio.id;
            }
          }
        }

        const militante = await prisma.militante.create({
          data: {
            nombre,
            cedula,
            telefono: fila.telefono?.trim() || undefined,
            direccion: fila.direccion?.trim() || undefined,
            provinciaId: provincia.id,
            municipioId: municipio.id,
            localidadId,
            recintoElectoralId,
            colegioId,
            consentimientoDatos: true,
            capturadoPorId: req.user!.id,
            origen: "IMPORTACION_CSV",
          },
        });
        await otorgarInsigniaBienvenida(militante.id);
        creados++;
        resultados.push({ fila: numeroFila, nombre, estado: "creado" });
      } catch {
        resultados.push({ fila: numeroFila, nombre, estado: "error", mensaje: "Error inesperado al crear el registro" });
      }
    }

    if (creados > 0) emitirCambioMilitantes();
    res.status(201).json({
      total: filas.length,
      creados,
      duplicados: resultados.filter((r) => r.estado === "duplicado").length,
      errores: resultados.filter((r) => r.estado === "error").length,
      detalle: resultados,
    });
  }),
);

// RF-15: detectar posibles duplicados por cédula o teléfono
militantesRouter.get(
  "/duplicados",
  asyncRoute(async (req, res) => {
    const { cedula, telefono } = req.query as { cedula?: string; telefono?: string };
    if (!cedula && !telefono) return res.json([]);
    const posibles = await prisma.militante.findMany({
      where: {
        OR: [...(cedula ? [{ cedula }] : []), ...(telefono ? [{ telefono }] : [])],
      },
      take: 10,
    });
    res.json(posibles);
  }),
);

// Editar un militante ya registrado (RF nuevo): antes no había forma de
// corregir un typo, un teléfono mal digitado o una demarcación equivocada
// una vez creado el registro — quedaba así para siempre.
const militanteUpdateSchema = militanteSchema.omit({ consentimientoDatos: true }).partial();

militantesRouter.patch(
  "/:id",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const data = militanteUpdateSchema.parse(req.body);
    const militante = await prisma.militante.findUniqueOrThrow({ where: { id: req.params.id } });
    const alcanceUsuario = await resolverAlcance(req.user!);

    // Se valida tanto la demarcación actual como la resultante tras el cambio
    // (por si se está moviendo el militante a otra zona): ninguna puede caer
    // fuera del territorio asignado al usuario.
    const demarcacionResultante = {
      provinciaId: data.provinciaId ?? militante.provinciaId,
      municipioId: data.municipioId ?? militante.municipioId,
      distritoMunicipalId: data.distritoMunicipalId !== undefined ? data.distritoMunicipalId : militante.distritoMunicipalId,
    };
    if (!puedeGestionarMilitante(alcanceUsuario, militante) || !puedeGestionarMilitante(alcanceUsuario, demarcacionResultante)) {
      throw new HttpError(403, "No puedes editar militantes fuera de tu territorio asignado");
    }

    if (data.cedula && data.cedula !== militante.cedula) {
      const existente = await prisma.militante.findUnique({ where: { cedula: data.cedula } });
      if (existente) throw new HttpError(409, "Ya existe otro registro con esa cédula");
    }

    const actualizado = await prisma.militante.update({ where: { id: req.params.id }, data });
    emitirCambioMilitantes();
    res.json(actualizado);
  }),
);

// Eliminar un militante (RF nuevo) — restringido a SUPERADMIN/JEFE_SECRETARIA
// (más sensible que crear/editar) y solo dentro del territorio asignado.
militantesRouter.delete(
  "/:id",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (req, res) => {
    const militante = await prisma.militante.findUniqueOrThrow({ where: { id: req.params.id } });
    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeGestionarMilitante(alcanceUsuario, militante)) {
      throw new HttpError(403, "No puedes eliminar militantes fuera de tu territorio asignado");
    }
    await prisma.militante.delete({ where: { id: req.params.id } });
    emitirCambioMilitantes();
    res.status(204).send();
  }),
);

const fusionarSchema = z.object({ canonicoId: z.string(), duplicadoId: z.string() });

// Fusionar un duplicado (RF nuevo): la detección de duplicados al crear (arriba)
// solo avisa — para los que ya se colaron en el padrón, esto mueve todo su
// historial (asistencias, confirmaciones de voto, insignias, device tokens y
// puntos) al militante que se marca como el correcto, y borra el duplicado.
// Donde hay un choque de restricción única (ej. ya confirmó la misma
// actividad/jornada en ambos registros) se conserva la fila del canónico y la
// del duplicado simplemente desaparece en cascada al eliminarlo.
militantesRouter.post(
  "/fusionar",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA"),
  asyncRoute(async (req, res) => {
    const { canonicoId, duplicadoId } = fusionarSchema.parse(req.body);
    if (canonicoId === duplicadoId) throw new HttpError(400, "Selecciona dos militantes distintos para fusionar");

    const [canonico, duplicado] = await Promise.all([
      prisma.militante.findUniqueOrThrow({ where: { id: canonicoId } }),
      prisma.militante.findUniqueOrThrow({ where: { id: duplicadoId } }),
    ]);

    const alcanceUsuario = await resolverAlcance(req.user!);
    if (!puedeGestionarMilitante(alcanceUsuario, canonico) || !puedeGestionarMilitante(alcanceUsuario, duplicado)) {
      throw new HttpError(403, "No puedes fusionar militantes fuera de tu territorio asignado");
    }

    await prisma.$transaction(async (tx) => {
      const asistenciasDuplicado = await tx.asistenciaActividad.findMany({ where: { militanteId: duplicadoId } });
      for (const a of asistenciasDuplicado) {
        const yaExiste = await tx.asistenciaActividad.findUnique({
          where: { actividadId_militanteId: { actividadId: a.actividadId, militanteId: canonicoId } },
        });
        if (!yaExiste) await tx.asistenciaActividad.update({ where: { id: a.id }, data: { militanteId: canonicoId } });
      }

      const confirmacionesDuplicado = await tx.confirmacionVoto.findMany({ where: { militanteId: duplicadoId } });
      for (const c of confirmacionesDuplicado) {
        const yaExiste = await tx.confirmacionVoto.findUnique({
          where: { eventoId_militanteId: { eventoId: c.eventoId, militanteId: canonicoId } },
        });
        if (!yaExiste) await tx.confirmacionVoto.update({ where: { id: c.id }, data: { militanteId: canonicoId } });
      }

      const insigniasDuplicado = await tx.militanteInsignia.findMany({ where: { militanteId: duplicadoId } });
      for (const i of insigniasDuplicado) {
        const yaExiste = await tx.militanteInsignia.findUnique({
          where: { militanteId_insigniaId: { militanteId: canonicoId, insigniaId: i.insigniaId } },
        });
        if (!yaExiste) await tx.militanteInsignia.update({ where: { id: i.id }, data: { militanteId: canonicoId } });
      }

      await tx.deviceToken.updateMany({ where: { militanteId: duplicadoId }, data: { militanteId: canonicoId } });

      await tx.militante.update({
        where: { id: canonicoId },
        data: { puntos: { increment: duplicado.puntos } },
      });

      await tx.militante.delete({ where: { id: duplicadoId } });
    });

    emitirCambioMilitantes();
    res.json({ ok: true, canonicoId });
  }),
);

// RF-12: definir meta de militantes por provincia, municipio o distrito municipal
const metaSchema = z
  .object({
    provinciaId: z.string().optional(),
    municipioId: z.string().optional(),
    distritoMunicipalId: z.string().optional(),
    meta: z.number().int().nonnegative(),
  })
  .refine((v) => [v.provinciaId, v.municipioId, v.distritoMunicipalId].filter(Boolean).length === 1, {
    message: "Debe especificar exactamente uno de provinciaId, municipioId o distritoMunicipalId",
  });

militantesRouter.post(
  "/metas",
  requireRole("SUPERADMIN"),
  asyncRoute(async (req, res) => {
    const data = metaSchema.parse(req.body);
    // Cierra la vigencia de la meta anterior y crea la nueva (histórico, RF-12: editable/modificable).
    await prisma.metaMilitantes.updateMany({
      where: {
        provinciaId: data.provinciaId ?? null,
        municipioId: data.municipioId ?? null,
        distritoMunicipalId: data.distritoMunicipalId ?? null,
        vigenciaHasta: null,
      },
      data: { vigenciaHasta: new Date() },
    });
    const meta = await prisma.metaMilitantes.create({ data });
    res.status(201).json(meta);
  }),
);
