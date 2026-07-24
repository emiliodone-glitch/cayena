import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { Role, prisma } from "@cayena/database";
import { MODULOS } from "@cayena/shared";
import { requireAuth, requireRole, requireModulo, resolverAlcanceSecretaria } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { calcularRango, type Periodo } from "../lib/periodo";

export const usuariosRouter = Router();

// RF-29: directorio de dirigentes por secretaría y territorio — visible en la app sin login.
usuariosRouter.get(
  "/directorio",
  asyncRoute(async (_req, res) => {
    const dirigentes = await prisma.user.findMany({
      where: { role: { in: [Role.JEFE_SECRETARIA, Role.PROMOTOR] }, active: true },
      select: {
        id: true,
        nombre: true,
        telefono: true,
        role: true,
        secretaria: { select: { nombre: true } },
      },
      orderBy: { nombre: "asc" },
    });
    res.json(dirigentes);
  }),
);

usuariosRouter.use(requireAuth);

// Fase 2 — ranking interno de promotores/digitadores: quién ha captado más
// militantes, para generar competencia sana entre el equipo de campo.
const rankingQuerySchema = z.object({
  periodo: z.enum(["semana", "mes", "trimestre", "todo", "custom"]).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

usuariosRouter.get(
  "/ranking-captacion",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "AUDITOR"),
  requireModulo("ranking"),
  asyncRoute(async (req, res) => {
    const scopedSecretariaId = resolverAlcanceSecretaria(req.user!);
    const { periodo, desde, hasta } = rankingQuerySchema.parse(req.query);
    const rangoFecha =
      periodo && periodo !== "todo" ? calcularRango(periodo as Periodo, desde, hasta) : null;

    const whereBase = {
      capturadoPorId: { not: null } as const,
      ...(scopedSecretariaId ? { capturadoPor: { secretariaId: scopedSecretariaId } } : {}),
    };

    // Sin tope (RF nuevo): antes se cortaba en los primeros 20, así que un
    // promotor #21 en adelante nunca podía ver dónde quedó — la cantidad de
    // usuarios es chica (equipo de campo, no militantes), así que traer a
    // todos no cuesta nada y permite resaltar la fila del usuario que mira
    // la pantalla sin importar su posición.
    const conteos = await prisma.militante.groupBy({
      by: ["capturadoPorId"],
      where: { ...whereBase, ...(rangoFecha ? { createdAt: { gte: rangoFecha.inicio, lte: rangoFecha.fin } } : {}) },
      _count: { _all: true },
      orderBy: { _count: { capturadoPorId: "desc" } },
    });

    // Calidad de captación (RF nuevo), no solo cantidad: suma de los puntos
    // de gamificación (Fase 2) que fueron acumulando los militantes que
    // trajo cada promotor — un indicador de si esos militantes de verdad se
    // quedan activos, no solo de que se registraron.
    const puntosPorPromotor = await prisma.militante.groupBy({
      by: ["capturadoPorId"],
      where: { ...whereBase, ...(rangoFecha ? { createdAt: { gte: rangoFecha.inicio, lte: rangoFecha.fin } } : {}) },
      _sum: { puntos: true },
    });
    const puntosMap = new Map(puntosPorPromotor.map((p) => [p.capturadoPorId as string, p._sum.puntos ?? 0]));

    // Tendencia (RF nuevo): posición del mismo promotor en el período
    // anterior de igual duración (ver calcularRango), para mostrar si subió
    // o bajó. Sin sentido para "todo el tiempo" (no hay un "período
    // anterior" acotado con el que comparar).
    let posicionAnteriorMap = new Map<string, number>();
    if (rangoFecha) {
      const conteosAnterior = await prisma.militante.groupBy({
        by: ["capturadoPorId"],
        where: { ...whereBase, createdAt: { gte: rangoFecha.inicioAnterior, lte: rangoFecha.finAnterior } },
        _count: { _all: true },
        orderBy: { _count: { capturadoPorId: "desc" } },
      });
      posicionAnteriorMap = new Map(conteosAnterior.map((c, i) => [c.capturadoPorId as string, i + 1]));
    }

    const usuarios = await prisma.user.findMany({
      where: { id: { in: conteos.map((c) => c.capturadoPorId as string) } },
      select: { id: true, nombre: true, role: true, secretaria: { select: { nombre: true } } },
    });
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));

    res.json(
      conteos
        .map((c, i) => {
          const id = c.capturadoPorId as string;
          const u = usuarioPorId.get(id);
          if (!u) return null;
          return {
            id: u.id,
            nombre: u.nombre,
            role: u.role,
            secretaria: u.secretaria?.nombre ?? null,
            militantesCaptados: c._count._all,
            puntosGenerados: puntosMap.get(id) ?? 0,
            posicionAnterior: posicionAnteriorMap.get(id) ?? null,
            posicionActual: i + 1,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    );
  }),
);

// "Salón de la fama" (RF nuevo): últimos ganadores de cada ciclo ya cerrado
// (ver lib/reconocimientos.ts) — se traen los últimos ~200 registros
// ordenados por fecha y se agrupan en memoria por tipo+periodo, quedándose
// solo con el cicloId más reciente de cada combinación (comparar cicloId
// como texto alcanza porque el formato siempre arranca con el año y tiene
// ancho fijo: "2026-W30" < "2026-W31", "2026-07" < "2026-08", etc.).
usuariosRouter.get(
  "/reconocimientos",
  requireRole("SUPERADMIN", "JEFE_SECRETARIA", "AUDITOR"),
  requireModulo("ranking"),
  asyncRoute(async (_req, res) => {
    const registros = await prisma.reconocimientoRanking.findMany({
      orderBy: { otorgadoAt: "desc" },
      take: 200,
    });

    const porGrupo = new Map<string, typeof registros>();
    for (const r of registros) {
      const clave = `${r.tipo}:${r.periodo}`;
      if (!porGrupo.has(clave)) porGrupo.set(clave, []);
      porGrupo.get(clave)!.push(r);
    }

    const resultado: Record<string, Record<string, typeof registros>> = { PROMOTOR: {}, SECRETARIA: {} };
    for (const [clave, filas] of porGrupo) {
      const [tipo, periodo] = clave.split(":");
      const cicloMasReciente = filas.reduce((max, f) => (f.cicloId > max ? f.cicloId : max), filas[0].cicloId);
      resultado[tipo][periodo] = filas.filter((f) => f.cicloId === cicloMasReciente).sort((a, b) => a.rango - b.rango);
    }
    res.json(resultado);
  }),
);

usuariosRouter.use(requireRole("SUPERADMIN"));
usuariosRouter.use(requireModulo("usuarios"));

// RF-21
usuariosRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const usuarios = await prisma.user.findMany({
      include: {
        secretaria: { select: { nombre: true } },
        provincia: { select: { nombre: true } },
        // Se incluye el padre geográfico (provinciaId) para que el back
        // office pueda preseleccionar en cascada las listas de
        // provincia→municipio→distrito al editar el territorio asignado.
        municipio: { select: { nombre: true, provinciaId: true } },
        distritoMunicipal: {
          select: { nombre: true, municipioId: true, municipio: { select: { provinciaId: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(usuarios.map(({ passwordHash: _ph, ...rest }) => rest));
  }),
);

// Territorio asignado (coordinador de zona): a lo sumo uno de los tres — se
// manda explícitamente en null los otros dos al cambiar de nivel, así que
// alcanza con contar cuántos vienen con un valor real en este request.
function unSoloTerritorio(v: {
  provinciaId?: string | null;
  municipioId?: string | null;
  distritoMunicipalId?: string | null;
}) {
  return [v.provinciaId, v.municipioId, v.distritoMunicipalId].filter((x) => !!x).length <= 1;
}

// Control de accesos por usuario (RF nuevo): vacío = usa los valores por
// defecto de su rol (ver MODULOS_POR_DEFECTO_ROL en @cayena/shared).
const permisosSchema = {
  modulosVisibles: z.array(z.enum(MODULOS)).optional(),
  limitarASecretaria: z.boolean().optional(),
};

const crearUsuarioSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    nombre: z.string().min(2),
    telefono: z.string().optional(),
    role: z.nativeEnum(Role),
    secretariaId: z.string().optional(),
    cargoSecretaria: z.string().optional(),
    provinciaId: z.string().nullable().optional(),
    municipioId: z.string().nullable().optional(),
    distritoMunicipalId: z.string().nullable().optional(),
    ...permisosSchema,
  })
  .refine(unSoloTerritorio, { message: "Solo se puede asignar un nivel de territorio: provincia, municipio o distrito" });

usuariosRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = crearUsuarioSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const usuario = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        nombre: data.nombre,
        telefono: data.telefono,
        role: data.role,
        secretariaId: data.secretariaId,
        cargoSecretaria: data.secretariaId ? data.cargoSecretaria : undefined,
        provinciaId: data.provinciaId,
        municipioId: data.municipioId,
        distritoMunicipalId: data.distritoMunicipalId,
        modulosVisibles: data.modulosVisibles,
        limitarASecretaria: data.limitarASecretaria,
      },
    });
    const { passwordHash: _ph, ...rest } = usuario;
    res.status(201).json(rest);
  }),
);

const actualizarUsuarioSchema = z
  .object({
    nombre: z.string().min(2).optional(),
    telefono: z.string().optional(),
    email: z.string().email().optional(),
    role: z.nativeEnum(Role).optional(),
    secretariaId: z.string().nullable().optional(),
    cargoSecretaria: z.string().nullable().optional(),
    active: z.boolean().optional(),
    password: z.string().min(8).optional(),
    provinciaId: z.string().nullable().optional(),
    municipioId: z.string().nullable().optional(),
    distritoMunicipalId: z.string().nullable().optional(),
    ...permisosSchema,
  })
  .refine(unSoloTerritorio, { message: "Solo se puede asignar un nivel de territorio: provincia, municipio o distrito" });

usuariosRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const { password, ...data } = actualizarUsuarioSchema.parse(req.body);
    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
    const usuario = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
    const { passwordHash: _ph, ...rest } = usuario;
    res.json(rest);
  }),
);

const DIAS_VIGENCIA_INVITACION = 7;

// Invitación de activación de cuenta (self-service): en vez de que el
// SUPERADMIN le teclee correo real y contraseña a cada usuario creado por
// carga masiva (el organigrama de titulares, por ejemplo), genera un link
// de un solo uso — el destinatario entra, confirma su correo real y crea su
// propia contraseña (ver /auth/activar/:token). Se puede volver a llamar
// para reemplazar una invitación anterior (por si se venció o se perdió el link).
usuariosRouter.post(
  "/:id/invitacion",
  asyncRoute(async (req, res) => {
    const usuario = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!usuario) throw new HttpError(404, "Usuario no encontrado");
    if (usuario.active) throw new HttpError(400, "Este usuario ya está activo, no necesita invitación");

    const token = crypto.randomBytes(24).toString("hex");
    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        invitacionToken: token,
        invitacionExpira: new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 24 * 3600 * 1000),
      },
    });
    res.json({ token, expiraEn: DIAS_VIGENCIA_INVITACION });
  }),
);
