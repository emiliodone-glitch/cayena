# Cayena — Plataforma Integral de Gestión Partidaria

Fuerza del Pueblo · Gestión Leonel Fernández

Monorepo con tres productos conectados por una misma API:

- `apps/api` — API REST (Express + TypeScript + Prisma + PostgreSQL).
- `apps/web` — Back office administrativo (Next.js 14, App Router, Tailwind, Leaflet).
- `apps/mobile` — App móvil pública (Expo / React Native, expo-router).
- `packages/database` — Schema Prisma, seed y capas GeoJSON reales de provincias/municipios.
- `packages/shared` — Tipos y lógica compartida (roles, semáforo de metas).

## Mapa geográfico real (RF-13)

Las 32 demarcaciones (31 provincias + Distrito Nacional) y sus 155 municipios
provienen de **geoBoundaries** (geoBoundaries-DOM-ADM1/ADM2, CC-BY 4.0) como
fuente de la geometría — no una cuadrícula esquemática. Los nombres de 126 de
los 155 municipios se corrigieron (acentos y grafía oficial) cruzándolos con
un dataset derivado de ONE (`jeancharlyjs/GEOJSON-RepublicaDominicana`, sin
licencia explícita en el repo, usar con esa salvedad) que también aporta el
código oficial `CODONE_MUN` donde hubo coincidencia. Ver
`packages/database/geo/*.geojson`.

El geoportal oficial **IDE-RD** (`geoportal.iderd.gob.do`), con la cartografía
más reciente (actualizada dic. 2023), no fue alcanzable desde este entorno por
política de red (solo se pudo llegar a hosts de GitHub). Si el partido tiene
acceso directo a esas capas WFS/GeoJSON oficiales, reemplazar los archivos en
`packages/database/geo/` es un cambio aislado (mismo formato de propiedades:
`id`, `nombre`, `codigo`/`provinciaId`).

## Requisitos

- Node.js 18+
- PostgreSQL 14+

## Primeros pasos

```bash
npm install

# 1. Configura variables de entorno
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local

# 2. Base de datos: migra y siembra provincias/municipios reales + datos demo
npm run db:migrate
npm run db:seed

# 3. Levanta todo (API :4000, web :3000, mobile via Expo)
npm run dev
```

Usuario superadmin sembrado por defecto: `admin@fuerzadelpueblo.do` / `Cayena2026!`
(cambiar `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` antes de sembrar en producción).

## Módulos implementados

**MVP:** secretarías, actividades (lista/calendario), obras de gobierno,
militantes con mapa real semáforo (drill-down provincia → municipio), gastos,
POA con gráficas, gestión de usuarios/roles. App móvil: mapa de obras, feed,
registro público con geolocalización, panel de dirigencia, directorio, perfil.

**Fase 2 (ya implementada):**

- **Subida real de fotos** — `POST /uploads` (multer, disco local en
  `apps/api/uploads/`, servido en `/files/*`). Para producción con múltiples
  instancias, reemplazar `apps/api/src/lib/storage.ts` por un adaptador
  S3/Cloudinary/R2 (misma firma de función).
- **Notificaciones push** (RF-27) — Expo push (`expo-server-sdk` en la API,
  `expo-notifications` en la app). Se disparan automáticamente al publicar una
  obra o actividad. Requiere `eas init` para obtener un `projectId` real (ver
  abajo) antes de funcionar fuera de Expo Go.
- **Carnet digital con QR** — el perfil de la app muestra un QR con el ID del
  militante; el back office lo verifica en *Militantes → Verificar carnet*.
- **Gamificación** — puntos e insignia de bienvenida al registrarse, consulta
  de progreso (`/militantes/mi-progreso/:cedula`) y ranking básico
  (`/militantes/ranking`).
- **Encuestas internas** — CRUD en la API, votación pública por cédula (evita
  doble voto) y resultados agregados para el back office.
- **Panel público de transparencia** — `/transparencia` en el back office web,
  sin login, sin datos personales.
- **Alertas de estancamiento de metas** — verificación automática diaria
  (`iniciarVerificacionPeriodica`) que detecta provincias/POA sin avance en 14
  días y las muestra en el dashboard.
- **Modo offline en la app** — el registro público se encola en el dispositivo
  cuando no hay conexión y se sincroniza solo al recuperar internet.

## Publicar en las tiendas (EAS)

`apps/mobile/eas.json` ya tiene perfiles `development` / `preview` /
`production`. Para publicar de verdad falta aportar, del lado del partido:

1. **Cuenta de Expo/EAS** y correr `eas init` dentro de `apps/mobile` — esto
   genera un `projectId` real que hay que pegar en `app.json` (`extra.eas.projectId`)
   y habilita las notificaciones push fuera de Expo Go.
2. **Apple Developer Program** (cuenta de pago, ~US$99/año) para `eas submit`
   a App Store — se necesita el Team ID en `eas.json` (`submit.production.ios.appleTeamId`).
3. **Google Play Console** (pago único, ~US$25) y un *service account* JSON
   con permisos de publicación, referenciado en `eas.json`
   (`submit.production.android.serviceAccountKeyPath`).
4. **Identidad visual real**: el ícono/splash actuales en `apps/mobile/assets/`
   son un placeholder generado (marca verde institucional con el símbolo de
   flor de cayena) — sustituir por el arte final del partido antes de publicar.

Con eso listo: `eas build --profile production --platform all` y luego
`eas submit`.

## Estado

Todo lo listado en el documento de requerimientos (MVP + Fase 2) está
implementado y validado end-to-end contra PostgreSQL real. Lo único que queda
fuera del alcance de este entorno de desarrollo son las cuentas y activos de
marca reales mencionados arriba.
