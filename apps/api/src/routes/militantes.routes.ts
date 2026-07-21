import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "@cayena/database";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { otorgarInsigniaBienvenida } from "../lib/gamificacion";

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
  desde: z.string().optional(),
  hasta: z.string().optional(),
  q: z.string().optional(),
});

// RF-14: exportar/listar padrón filtrado por zona o rango de fechas
militantesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { provinciaId, municipioId, desde, hasta, q } = querySchema.parse(req.query);
    const fechaFilter: Record<string, Date> = {};
    if (desde) fechaFilter.gte = new Date(desde);
    if (hasta) fechaFilter.lte = new Date(hasta);

    const militantes = await prisma.militante.findMany({
      where: {
        ...(provinciaId ? { provinciaId } : {}),
        ...(municipioId ? { municipioId } : {}),
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
      },
      include: {
        provincia: { select: { nombre: true } },
        municipio: { select: { nombre: true } },
        capturadoPor: { select: { nombre: true } },
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
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  provinciaId: z.string(),
  municipioId: z.string(),
  distritoMunicipalId: z.string().optional(),
  localidad: z.string().optional(),
  recintoElectoral: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  consentimientoDatos: z.literal(true),
});

// RF-10/RF-11: registrar militante desde el back office (queda trazado el promotor y la fecha)
militantesRouter.post(
  "/",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  asyncRoute(async (req, res) => {
    const data = militanteSchema.parse(req.body);

    const existente = await prisma.militante.findUnique({ where: { cedula: data.cedula } });
    if (existente) throw new HttpError(409, "Ya existe un registro con esta cédula");

    const militante = await prisma.militante.create({
      data: { ...data, capturadoPorId: req.user!.id, origen: "BACKOFFICE" },
    });
    await otorgarInsigniaBienvenida(militante.id);
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
// direccion, provincia, municipio, localidad, recintoElectoral). La provincia y
// el municipio se resuelven por nombre (no hace falta conocer los IDs internos).
militantesRouter.post(
  "/importar",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR"),
  uploadCsv.single("file"),
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No se recibió ningún archivo CSV");

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

      const existente = await prisma.militante.findUnique({ where: { cedula } });
      if (existente) {
        resultados.push({ fila: numeroFila, nombre, estado: "duplicado", mensaje: `Ya existe un registro con cédula ${cedula}` });
        continue;
      }

      try {
        const militante = await prisma.militante.create({
          data: {
            nombre,
            cedula,
            telefono: fila.telefono?.trim() || undefined,
            direccion: fila.direccion?.trim() || undefined,
            provinciaId: provincia.id,
            municipioId: municipio.id,
            localidad: fila.localidad?.trim() || undefined,
            recintoElectoral: fila.recintoelectoral?.trim() || undefined,
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
