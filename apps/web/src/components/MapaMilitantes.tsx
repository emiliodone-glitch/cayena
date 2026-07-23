"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, GeoJSON, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from "react-leaflet";
import type { Map as LeafletMap, Layer } from "leaflet";
import * as L from "leaflet";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { COLOR_ESTADO, type EstadoAvance } from "@cayena/shared";
import { apiFetch, API_URL, getAccessToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Propiedades = {
  id: string;
  nombre: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: EstadoAvance;
  estancada?: boolean;
  electores?: number | null;
  penetracion?: number | null;
  captadosFiltrados?: number;
  captadosPrevio?: number;
  provinciaId?: string;
  municipioId?: string;
  esCabecera?: boolean;
};

type PanelInfo = Propiedades | null;

export type DemarcacionSeleccionada =
  | { tipo: "provincia"; id: string; nombre: string }
  | { tipo: "municipio"; id: string; nombre: string }
  | { tipo: "distrito"; id: string; nombre: string }
  // Área central de un municipio sin distrito municipal propio (la "cabecera"
  // del mapa de distritos): se filtra por municipioId + sin distrito asignado.
  | { tipo: "municipio-sin-distrito"; id: string; nombre: string };

// Filtros que afectan qué militantes cuenta el mapa (y, propagados a la
// página, qué filas muestra el padrón de abajo).
export type FiltrosMapa = {
  periodo?: "semana" | "mes" | "trimestre";
  origen?: "BACKOFFICE" | "APP_PUBLICA";
  capturadoPorId?: string;
};

type ItemCatalogo = {
  tipo: "provincia" | "municipio" | "distrito";
  id: string;
  nombre: string;
  ruta: string;
  provinciaId?: string;
  provinciaNombre?: string;
  municipioId?: string;
  municipioNombre?: string;
};

type Punto = { lat: number; lng: number };
type Cluster = { lat: number; lng: number; count: number };

type ResumenDemarcacion = {
  id: string;
  nombre: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: EstadoAvance;
  electores?: number | null;
  penetracion?: number | null;
};

const COLOR_SIN_DATO = "#d1d5db";

// Escala de verdes para el modo "penetración electoral" (captados/electores):
// más oscuro = mayor porcentaje del electorado captado.
function colorPenetracion(p: number | null | undefined): string {
  if (p == null) return COLOR_SIN_DATO;
  if (p >= 10) return "#14532d";
  if (p >= 5) return "#166534";
  if (p >= 2) return "#16a34a";
  if (p >= 1) return "#4ade80";
  if (p > 0) return "#86efac";
  // 0% pero con dato de electores: verde casi blanco, distinguible del gris
  // "sin dato" — significa "medible, aún sin captación relevante".
  return "#dcfce7";
}

// Canvas reutilizado (nunca se agrega al DOM) solo para medir el ancho en
// píxeles que ocupará un texto con la misma tipografía de .etiqueta-mapa —
// necesario para detectar colisiones entre etiquetas del mapa.
let contextoMedicion: CanvasRenderingContext2D | null | undefined;
function medirTexto(texto: string): number {
  if (contextoMedicion === undefined) {
    contextoMedicion = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    if (contextoMedicion) contextoMedicion.font = "600 11px system-ui, sans-serif";
  }
  return contextoMedicion?.measureText(texto).width ?? texto.length * 7;
}

// Aplana Polygon/MultiPolygon a su lista de anillos (coordenadas [lng, lat]).
function anillosDe(f: Feature): number[][][] {
  const g = f.geometry as Polygon | MultiPolygon;
  if (g.type === "Polygon") return g.coordinates as number[][][];
  return (g.coordinates as number[][][][]).flat();
}

// Área con signo (fórmula del shoelace) — solo se usa el valor absoluto para
// comparar tamaños, así que no importa el sentido de giro del anillo.
function areaAnillo(anillo: number[][]): number {
  let area = 0;
  for (let i = 0; i < anillo.length - 1; i++) {
    const [x0, y0] = anillo[i];
    const [x1, y1] = anillo[i + 1];
    area += x0 * y1 - x1 * y0;
  }
  return area / 2;
}

function centroideAnillo(anillo: number[][]): [number, number] {
  let area = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < anillo.length - 1; i++) {
    const [x0, y0] = anillo[i];
    const [x1, y1] = anillo[i + 1];
    const cruce = x0 * y1 - x1 * y0;
    area += cruce;
    cx += (x0 + x1) * cruce;
    cy += (y0 + y1) * cruce;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Anillo degenerado (área ~0): promedio simple como respaldo.
    const n = Math.max(1, anillo.length - 1);
    const sx = anillo.slice(0, -1).reduce((s, p) => s + p[0], 0) / n;
    const sy = anillo.slice(0, -1).reduce((s, p) => s + p[1], 0) / n;
    return [sx, sy];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

function dentroDelAnillo(x: number, y: number, anillo: number[][]): boolean {
  // Ray casting estándar: cuenta cruces de una semirrecta horizontal desde el punto.
  let dentro = false;
  for (let i = 0, j = anillo.length - 2; i < anillo.length - 1; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function distanciaPuntoASegmento(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const largo2 = dx * dx + dy * dy;
  let t = largo2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / largo2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * dx;
  const ey = y1 + t * dy;
  return Math.hypot(px - ex, py - ey);
}

function distanciaAlBorde(x: number, y: number, anillo: number[][]): number {
  let min = Infinity;
  for (let i = 0; i < anillo.length - 1; i++) {
    const [x1, y1] = anillo[i];
    const [x2, y2] = anillo[i + 1];
    const d = distanciaPuntoASegmento(x, y, x1, y1, x2, y2);
    if (d < min) min = d;
  }
  return min;
}

// El centroide de área de un anillo puede caer fuera del territorio (o en
// una parte angosta/una bahía) cuando la forma es alargada o cóncava — que
// es justo el caso de varias provincias de RD con penínsulas finas. En vez
// de eso, se busca por cuadrícula el punto que está DENTRO del anillo y más
// alejado de cualquier borde (una versión simple de "polo de inaccesibilidad"),
// que es donde de verdad cabe cómodamente el nombre de la demarcación.
function puntoMasInterior(anillo: number[][]): [number, number] {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of anillo) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const PASOS = 28;
  let mejor: [number, number] | null = null;
  let mejorDist = -Infinity;
  for (let i = 0; i <= PASOS; i++) {
    const x = minX + ((maxX - minX) * i) / PASOS;
    for (let j = 0; j <= PASOS; j++) {
      const y = minY + ((maxY - minY) * j) / PASOS;
      if (!dentroDelAnillo(x, y, anillo)) continue;
      const d = distanciaAlBorde(x, y, anillo);
      if (d > mejorDist) {
        mejorDist = d;
        mejor = [x, y];
      }
    }
  }
  // Respaldo si la cuadrícula no cayó ningún punto adentro (forma muy fina):
  // el centroide de área, aunque no sea perfecto, sigue siendo razonable.
  return mejor ?? centroideAnillo(anillo);
}

// Leaflet centra el tooltip "direction: center" con el centroide de TODOS
// los anillos de la geometría tratados como un solo polígono con huecos —
// para una provincia con una isla separada del territorio principal (un
// cayo lejos de la costa), eso puede ubicar la etiqueta sobre la isla o en
// el mar entre ambas partes. Acá primero se descarta la isla quedándose con
// el anillo de mayor área (el territorio principal) y luego se ubica el
// punto más "adentro" de esa forma (ver puntoMasInterior), no solo su
// centro de masa — importante porque varias provincias tienen penínsulas
// finas donde el centro de masa cae en agua o en la parte angosta.
function mayorAnillo(f: Feature): number[][] | null {
  const anillos = anillosDe(f);
  if (anillos.length === 0) return null;
  let mejor = anillos[0];
  let mejorArea = Math.abs(areaAnillo(mejor));
  for (const anillo of anillos.slice(1)) {
    const area = Math.abs(areaAnillo(anillo));
    if (area > mejorArea) {
      mejor = anillo;
      mejorArea = area;
    }
  }
  return mejor;
}

function centroideMayorAnillo(f: Feature): [number, number] | null {
  const anillo = mayorAnillo(f);
  if (!anillo) return null;
  const [lng, lat] = puntoMasInterior(anillo);
  return [lat, lng];
}

function construirQueryFiltros(f: FiltrosMapa): string {
  const params = new URLSearchParams();
  if (f.periodo) params.set("periodo", f.periodo);
  if (f.origen) params.set("origen", f.origen);
  if (f.capturadoPorId) params.set("capturadoPorId", f.capturadoPorId);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function MapaMilitantes({
  compacto = false,
  alto,
  aspecto,
  onDemarcacionChange,
  onFiltrosChange,
  refreshToken = 0,
  herramientas = false,
}: {
  compacto?: boolean;
  /** Clase Tailwind de altura fija (ej. "h-[520px]"). Ignorada si se pasa `aspecto`. */
  alto?: string;
  /** Clase Tailwind de aspect-ratio (ej. "aspect-[1000/850]") para que el mapa escale
   * de forma responsiva con el ancho del contenedor en vez de usar una altura fija. */
  aspecto?: string;
  /** Se dispara al pasar el cursor o hacer clic sobre una demarcación (o al
   * volver atrás, con `null`), para que el padrón de militantes debajo del
   * mapa se filtre. */
  onDemarcacionChange?: (sel: DemarcacionSeleccionada | null) => void;
  /** Se dispara cuando cambian los filtros de la barra de herramientas del
   * mapa, para que el padrón de abajo aplique los mismos filtros. */
  onFiltrosChange?: (filtros: FiltrosMapa) => void;
  /** Incrementar este valor fuerza un refetch de la capa actual (mismo nivel
   * y demarcación seleccionada) sin resetear el drill-down — úsalo tras
   * registrar/importar militantes para que el mapa refleje el cambio. */
  refreshToken?: number;
  /** Muestra la barra de herramientas completa (búsqueda, filtros, modo de
   * color, puntos, exportar) y el ranking del nivel actual. */
  herramientas?: boolean;
}) {
  const { user } = useAuth();
  const [nivel, setNivel] = useState<"nacional" | "municipios" | "distritos">("nacional");
  const [provinciaSeleccionada, setProvinciaSeleccionada] = useState<{ id: string; nombre: string } | null>(
    null,
  );
  const [municipioSeleccionado, setMunicipioSeleccionado] = useState<{ id: string; nombre: string } | null>(
    null,
  );
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [panel, setPanel] = useState<PanelInfo>(null);
  // Un coordinador de zona (usuario con territorio asignado) entra
  // directo a su propia demarcación en vez de al mapa nacional completo —
  // el backend igual filtraría ese nivel a solo su territorio, así que
  // partir ahí de una vez ahorra un clic redundante. Se hace una sola vez
  // (autoNavegoRef), cuando el usuario ya cargó desde /auth/me.
  const autoNavegoRef = useRef(false);
  useEffect(() => {
    if (autoNavegoRef.current || !user) return;
    autoNavegoRef.current = true;
    if (!user.alcanceProvinciaId) return;
    setProvinciaSeleccionada({ id: user.alcanceProvinciaId, nombre: user.alcanceProvinciaNombre! });
    if (user.alcanceDistritoId && user.alcanceMunicipioId) {
      setMunicipioSeleccionado({ id: user.alcanceMunicipioId, nombre: user.alcanceMunicipioNombre! });
      setNivel("distritos");
    } else {
      setNivel("municipios");
    }
  }, [user]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosMapa>({});
  const [modoColor, setModoColor] = useState<"meta" | "electorado">("meta");
  const [verPuntos, setVerPuntos] = useState(false);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [catalogo, setCatalogo] = useState<ItemCatalogo[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [promotores, setPromotores] = useState<{ id: string; nombre: string }[]>([]);
  // Se incrementa cada vez que llega un evento en vivo (SSE) de que alguien
  // registró/importó militantes en cualquier sesión — dispara el mismo
  // refetch que `refreshToken`, pero sin depender de una acción propia.
  const [refreshVivo, setRefreshVivo] = useState(0);
  const [enVivo, setEnVivo] = useState(false);

  const mapRef = useRef<LeafletMap | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  // Mapa de elemento DOM -> layer de Leaflet, reconstruido cada vez que se
  // (re)monta la capa GeoJSON. Ver el efecto de más abajo que hace el
  // hit-testing manual sobre `mousemove` para saber por qué hace falta.
  const elementLayerRef = useRef(new Map<Element, L.Path>());
  const resaltadoRef = useRef<L.Path | null>(null);
  // Doble-tap en pantallas táctiles: el primer tap selecciona, el segundo entra.
  const ultimoTapRef = useRef<string | null>(null);

  const esTactil = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  const modoColorRef = useRef(modoColor);
  modoColorRef.current = modoColor;

  // Cambiar el modo de color re-estiliza la capa existente en vez de
  // remontarla: un remonte destruiría los <path> del DOM y dejaría el índice
  // de hover (elementLayerRef) apuntando a elementos muertos.
  useEffect(() => {
    geoLayerRef.current?.setStyle(estiloFeature);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoColor]);

  useEffect(() => {
    // Si este efecto se re-dispara (cambia de nivel/demarcación) antes de que
    // el fetch anterior resuelva — p.ej. el auto-ingreso al territorio de un
    // coordinador de zona cambia `nivel` en cuanto carga /auth/me, disparando
    // este efecto dos veces casi seguidas — el fetch viejo podía resolver
    // DESPUÉS del nuevo y pisar el geo correcto con uno de un nivel anterior.
    // `cancelado` descarta cualquier respuesta que llegue tras haber pasado a
    // un efecto más nuevo (limpieza estándar de React para efectos con fetch).
    let cancelado = false;
    setLoading(true);
    // Importante: el layer de <GeoJSON> de react-leaflet es inmutable una vez
    // creado — cambiar solo el prop `data` no redibuja la geometría, hace
    // falta que cambie el `key`. Limpiamos `geo` aquí para que el layer viejo
    // se desmonte de inmediato y el nuevo se monte fresco cuando llegue el fetch.
    setGeo(null);
    // El layer viejo se desmonta ya — soltar la referencia ahora mismo evita
    // que un mousemove en el hueco entre niveles intente llamar setStyle()
    // sobre un layer de Leaflet ya destruido.
    resaltadoRef.current = null;
    ultimoTapRef.current = null;
    const qs = construirQueryFiltros(filtros);
    const path =
      nivel === "nacional"
        ? `/geo/provincias${qs}`
        : nivel === "municipios"
          ? `/geo/provincias/${provinciaSeleccionada?.id}/municipios${qs}`
          : `/geo/municipios/${municipioSeleccionado?.id}/distritos-municipales${qs}`;
    apiFetch<FeatureCollection>(path)
      .then((data) => {
        if (cancelado) return;
        setGeo(data);
        // No reseteamos el panel a null aquí: si ya había una demarcación
        // seleccionada (por clic, no solo hover) se mantiene visible al
        // entrar a un nivel más profundo, y si esto es un refresco (mismo
        // nivel, nuevo refreshToken tras registrar/importar militantes) se
        // actualizan sus números con los datos frescos en vez de perderla.
        setPanel((prev) => {
          if (!prev) return prev;
          const encontrada = data.features.find((f) => {
            const p = f.properties as Propiedades;
            return prev.id ? p.id === prev.id : !p.id && p.nombre === prev.nombre;
          });
          return encontrada ? (encontrada.properties as Propiedades) : prev;
        });
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, provinciaSeleccionada?.id, municipioSeleccionado?.id, refreshToken, refreshVivo, filtros]);

  // Capa opcional de puntos: ubicación GPS real de los militantes del alcance visible.
  useEffect(() => {
    if (!verPuntos) {
      setPuntos([]);
      return;
    }
    const params = new URLSearchParams(construirQueryFiltros(filtros).replace(/^\?/, ""));
    if (nivel === "municipios" && provinciaSeleccionada) params.set("provinciaId", provinciaSeleccionada.id);
    if (nivel === "distritos" && municipioSeleccionado) params.set("municipioId", municipioSeleccionado.id);
    apiFetch<Punto[]>(`/geo/militantes-puntos?${params.toString()}`)
      .then(setPuntos)
      .catch(() => setPuntos([]));
  }, [verPuntos, nivel, provinciaSeleccionada, municipioSeleccionado, filtros, refreshToken]);

  // Catálogo para el buscador (una sola vez) y promotores para el filtro.
  useEffect(() => {
    if (!herramientas) return;
    apiFetch<ItemCatalogo[]>("/geo/lista/demarcaciones").then(setCatalogo).catch(() => setCatalogo([]));
    apiFetch<{ id: string; nombre: string; role: string }[]>("/usuarios")
      .then((us) => setPromotores(us.filter((u) => u.role === "PROMOTOR" || u.role === "DIGITADOR")))
      .catch(() => setPromotores([]));
  }, [herramientas]);

  useEffect(() => {
    onFiltrosChange?.(filtros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  // Refresco en vivo: cuando alguien registra o importa militantes en
  // cualquier otra sesión (otra pestaña, otro promotor en su celular), este
  // mapa se entera por Server-Sent Events y se refresca solo, sin recargar
  // la página. Se reconecta con backoff si la conexión se cae, releyendo el
  // token cada vez (por si venció y se renovó entretanto).
  useEffect(() => {
    let cerrado = false;
    let fuente: EventSource | null = null;
    let reintentoTimer: ReturnType<typeof setTimeout> | null = null;
    let intentos = 0;

    function conectar() {
      if (cerrado) return;
      const token = getAccessToken();
      if (!token) return; // sin sesión (no debería pasar dentro del back office)

      fuente = new EventSource(`${API_URL}/eventos/stream?token=${encodeURIComponent(token)}`);
      fuente.addEventListener("cambio-militantes", () => setRefreshVivo((t) => t + 1));
      fuente.onopen = () => {
        intentos = 0;
        setEnVivo(true);
      };
      fuente.onerror = () => {
        setEnVivo(false);
        fuente?.close();
        if (cerrado) return;
        // Backoff simple: 2s, 4s, 8s… hasta un tope de 30s.
        const espera = Math.min(2000 * 2 ** intentos, 30000);
        intentos++;
        reintentoTimer = setTimeout(conectar, espera);
      };
    }

    conectar();
    return () => {
      cerrado = true;
      if (reintentoTimer) clearTimeout(reintentoTimer);
      fuente?.close();
    };
  }, []);

  useEffect(() => {
    if (!geo) return;

    function encuadrar() {
      const map = mapRef.current;
      const layer = geoLayerRef.current;
      if (!map || !layer) return;
      const bounds = layer.getBounds();
      if (!bounds.isValid()) return;
      map.invalidateSize();
      // zoomSnap fino (ver prop del MapContainer) permite que fitBounds
      // elija un zoom fraccional ajustado al contenedor sin nunca recortar
      // el territorio: fitBounds siempre calcula el zoom máximo que
      // garantiza que los límites quepan enteros dentro del padding.
      map.fitBounds(bounds, { padding: [2, 2], animate: false });
      actualizarEtiquetas();
    }

    // Solo caben tantas etiquetas como espacio haya: mostrar el nombre de un
    // polígono minúsculo solo mancha el mapa. Tras cada encuadre se mide el
    // ancho en píxeles de cada demarcación y se muestran únicamente las
    // etiquetas que caben razonablemente en su territorio — y, entre las que
    // caben, se evita que se amontonen unas sobre otras (típico en el
    // sureste, con varias provincias chicas y pegadas): se prioriza la
    // demarcación de mayor área y se oculta la etiqueta de cualquier vecina
    // más chica cuyo rótulo se solaparía con uno ya colocado.
    function actualizarEtiquetas() {
      const map = mapRef.current;
      const layer = geoLayerRef.current;
      if (!map || !layer) return;

      type Candidato = {
        path: L.Path;
        ancla: L.LatLngExpression;
        area: number;
        cx: number;
        cy: number;
        ancho: number;
        alto: number;
      };
      const candidatos: Candidato[] = [];
      const descartados: L.Path[] = [];

      layer.eachLayer((l) => {
        const path = l as L.Path & {
          getBounds?: () => L.LatLngBounds;
          feature?: Feature;
          anclaEtiqueta?: L.LatLngExpression;
        };
        if (!path.getBounds) return;
        const b = path.getBounds();
        const p1 = map.latLngToContainerPoint(b.getNorthWest());
        const p2 = map.latLngToContainerPoint(b.getSouthEast());
        const ancho = Math.abs(p2.x - p1.x);
        const altoPx = Math.abs(p2.y - p1.y);
        const tooltip = path.getTooltip();
        const texto = tooltip?.getContent();
        const nombreFeature = (path.feature?.properties as Propiedades | undefined)?.nombre ?? "";
        const anchoTexto = medirTexto(typeof texto === "string" ? texto : nombreFeature);
        // El umbral de descarte usa el MENOR entre un mínimo parejo (52px) y
        // el ancho real que pide el texto: para nombres largos el mínimo
        // parejo sigue mandando (mismo comportamiento de siempre), pero una
        // etiqueta corta como "DN" solo necesita que su territorio alcance
        // para "DN", no para el mínimo pensado para nombres largos — por
        // eso antes Distrito Nacional se descartaba pese a que su
        // abreviatura sí entraba en su territorio.
        if (ancho < Math.min(52, anchoTexto + 12) || altoPx < 18) {
          descartados.push(path);
          return;
        }
        // El ancla real de la etiqueta (el punto más "adentro" del territorio
        // principal, ver centroideMayorAnillo) puede quedar lejos del centro
        // del bounding box en provincias con islas o penínsulas finas — hay
        // que medir la colisión en el punto donde el rótulo realmente se
        // dibuja, no en el centro del bbox.
        const ancla = path.anclaEtiqueta ?? b.getCenter();
        const anclaPx = map.latLngToContainerPoint(ancla);
        candidatos.push({
          path,
          ancla,
          area: ancho * altoPx,
          cx: anclaPx.x,
          cy: anclaPx.y,
          ancho: anchoTexto + 8,
          alto: 16,
        });
      });

      // Las demarcaciones más grandes "ganan" el espacio cuando dos rótulos compiten.
      candidatos.sort((a, b) => b.area - a.area);
      const colocados: { x1: number; y1: number; x2: number; y2: number }[] = [];
      const MARGEN = 1;
      // Antes de descartar un rótulo por choque, se prueba a desplazarlo
      // verticalmente unos pocos pasos (arriba y abajo del ancla original) —
      // dos provincias vecinas chocan sobre todo cuando ambos rótulos caen a
      // la misma altura, y un pequeño corrimiento vertical suele bastar para
      // que quepan los dos sin perder ninguno. Cada desplazamiento se valida
      // contra el propio polígono (dentroDelAnillo) para no dejar el nombre
      // flotando sobre un vecino o el mar.
      const DESPLAZAMIENTOS = [0, -18, 18, -34, 34];

      for (const c of candidatos) {
        const feature = (c.path as unknown as { feature?: Feature }).feature;
        const anillo = feature ? mayorAnillo(feature) : null;
        let colocado = false;
        for (const dy of DESPLAZAMIENTOS) {
          const cy = c.cy + dy;
          const rect = { x1: c.cx - c.ancho / 2, y1: cy - c.alto / 2, x2: c.cx + c.ancho / 2, y2: cy + c.alto / 2 };
          const chocaConAlguno = colocados.some(
            (r) =>
              rect.x1 - MARGEN < r.x2 && rect.x2 + MARGEN > r.x1 && rect.y1 - MARGEN < r.y2 && rect.y2 + MARGEN > r.y1,
          );
          if (chocaConAlguno) continue;
          let ancla = c.ancla;
          if (dy !== 0) {
            const latlng = map.containerPointToLatLng([c.cx, cy]);
            if (anillo && !dentroDelAnillo(latlng.lng, latlng.lat, anillo)) continue;
            ancla = latlng;
          }
          colocados.push(rect);
          // Pasar el ancla explícitamente es obligatorio: openTooltip() sin
          // argumento recalcula la posición desde el centro ingenuo de
          // Leaflet, pisando la corrección de centroideMayorAnillo.
          c.path.openTooltip(ancla);
          colocado = true;
          break;
        }
        if (!colocado) {
          c.path.closeTooltip();
        }
      }
      for (const path of descartados) path.closeTooltip();
    }

    // Encuadrar dentro del evento "add" de la capa (el enfoque anterior)
    // aplica fitBounds contra un estado interno de Leaflet (origen de
    // píxeles) que en un mapa montado dinámicamente (ssr:false) todavía no
    // se ha asentado: el zoom calculado resulta correcto pero el renderer
    // SVG queda con una transformación desincronizada y el territorio se ve
    // recortado. Esperar un frame via requestAnimationFrame, ya con la capa
    // montada (ref del <GeoJSON>), evita el problema de raíz.
    const raf = requestAnimationFrame(encuadrar);
    // Con `aspecto` el contenedor escala de forma responsiva con el ancho
    // de la pantalla: aunque la proporción se mantenga, el zoom "ajustado"
    // depende del tamaño absoluto en píxeles, así que hay que recalcularlo
    // en cada resize (si no, un contenedor más chico podría recortar el
    // territorio en vez de solo dejar menos margen).
    window.addEventListener("resize", encuadrar);

    // Reconstruye el mapa elemento-DOM -> layer para el hit-testing manual de
    // más abajo (los <path> son nuevos cada vez que cambia `geo`).
    elementLayerRef.current = new Map();
    geoLayerRef.current?.eachLayer((layer) => {
      const path = layer as L.Path;
      const el = path.getElement?.();
      if (el) elementLayerRef.current.set(el, path);
    });
    resaltadoRef.current = null;

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", encuadrar);
    };
  }, [geo]);

  // Detecta la demarcación bajo el cursor a partir de mousemove reales
  // (nunca sintéticos) en vez de los eventos mouseover/mouseout por-path de
  // Leaflet: el navegador dispara un mouseover "fantasma" sobre lo que sea
  // que quede bajo un cursor quieto en cuanto el contenido de abajo cambia
  // sin que el mouse se haya movido de verdad — al entrar a un nivel más
  // profundo (remonta el GeoJSON), al refrescar tras registrar/importar
  // militantes (mismo remonte) o al cerrarse el drawer de registro (revela
  // el mapa que quedaba debajo) — y ese eco pisaba la demarcación recién
  // seleccionada. Un `mousemove` real, en cambio, solo ocurre cuando el
  // cursor se mueve de verdad, así que basar todo en él elimina la clase
  // entera de "hover fantasma" sin depender de heurísticas de tiempo/posición.
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const layer = el ? elementLayerRef.current.get(el) : undefined;
      const anterior = resaltadoRef.current;
      if (layer === anterior) return;
      if (anterior) anterior.setStyle({ weight: 1.2, color: "#ffffff" });
      if (layer) {
        layer.setStyle({ weight: 3, color: "#123f1c" });
        const props = (layer as unknown as { feature?: Feature }).feature?.properties as Propiedades | undefined;
        if (props) {
          setPanel(props);
          avisarDemarcacion(props);
        }
      }
      resaltadoRef.current = layer ?? null;
    }
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, municipioSeleccionado?.id, onDemarcacionChange]);

  function estiloFeature(feature?: Feature) {
    const props = feature?.properties as Propiedades | undefined;
    const fill =
      modoColorRef.current === "electorado"
        ? colorPenetracion(props?.penetracion)
        : COLOR_ESTADO[props?.estado ?? "rojo"];
    return {
      fillColor: fill,
      fillOpacity: 0.75,
      // Antes las demarcaciones "estancadas" (sin registros nuevos en 14
      // días y meta sin cumplir) llevaban un borde punteado rojo oscuro,
      // pero como en la práctica suele estar casi todo el mapa en ese
      // estado, el punteado terminaba pareciendo textura/ruido sobre el
      // relleno en vez de una señal útil. El borde queda siempre sólido
      // blanco; el dato de "estancada" se sigue mostrando en el badge del
      // panel al pasar el cursor o hacer clic.
      color: "#ffffff",
      weight: 1.2,
    };
  }

  function avisarDemarcacion(props: Propiedades) {
    if (!onDemarcacionChange) return;
    if (nivel === "nacional") {
      onDemarcacionChange({ tipo: "provincia", id: props.id, nombre: props.nombre });
    } else if (nivel === "municipios") {
      onDemarcacionChange({ tipo: "municipio", id: props.id, nombre: props.nombre });
    } else if (props.id) {
      onDemarcacionChange({ tipo: "distrito", id: props.id, nombre: props.nombre });
    } else if (municipioSeleccionado) {
      onDemarcacionChange({ tipo: "municipio-sin-distrito", id: municipioSeleccionado.id, nombre: props.nombre });
    }
  }

  function drillDown(props: Propiedades) {
    if (nivel === "nacional") {
      setProvinciaSeleccionada({ id: props.id, nombre: props.nombre });
      setNivel("municipios");
    } else if (nivel === "municipios") {
      setMunicipioSeleccionado({ id: props.id, nombre: props.nombre });
      setNivel("distritos");
    }
  }

  function onEachFeature(feature: Feature, layer: Layer) {
    const props = feature.properties as Propiedades;
    // Etiqueta permanente con el nombre — cuál se muestra u oculta lo decide
    // actualizarEtiquetas() según el tamaño en píxeles de cada polígono.
    // Distrito Nacional es, por lejos, el territorio más chico del mapa
    // (queda envuelto por Santo Domingo): su nombre completo nunca cabe, así
    // que en el mapa se abrevia "DN" — el resto de la app sigue mostrando el
    // nombre completo (panel, buscador, breadcrumb, etc.).
    const textoEtiqueta = props.nombre === "Distrito Nacional" ? "DN" : props.nombre;
    layer.bindTooltip(textoEtiqueta, {
      permanent: true,
      direction: "center",
      className: "etiqueta-mapa",
      opacity: 1,
    });
    // Leaflet centra el tooltip usando el centroide de TODOS los anillos de
    // la geometría (islas incluidas) como si fueran un solo polígono con
    // huecos — para una provincia con una isla lejos de la costa (Pedernales,
    // La Altagracia) eso puede dejar la etiqueta flotando sobre la isla o en
    // el mar entre ambas. Se recalcula acá con el punto más "adentro" del
    // anillo de mayor área (ver centroideMayorAnillo/puntoMasInterior).
    //
    // OJO: layer.openTooltip() SIN argumento recalcula la posición desde
    // this.getCenter() de Leaflet (el mismo cálculo ingenuo que queremos
    // evitar) — pasar el punto una sola vez acá con setLatLng() no alcanza,
    // porque actualizarEtiquetas() vuelve a llamar openTooltip() en cada
    // encuadre. Por eso el ancla se guarda en el propio layer para poder
    // pasársela explícitamente cada vez que se reabre el tooltip.
    const centro = centroideMayorAnillo(feature);
    if (centro) {
      layer.getTooltip()?.setLatLng(centro);
      (layer as L.Path & { anclaEtiqueta?: L.LatLngExpression }).anclaEtiqueta = centro;
    }
    // El hover (mouseover/mouseout por-path de Leaflet) no se maneja acá
    // — ver el efecto de mousemove más arriba — porque es susceptible al
    // "hover fantasma" que dispara el navegador cuando el contenido bajo un
    // cursor quieto cambia sin que el mouse se haya movido de verdad. El
    // clic, en cambio, siempre es una acción real y deliberada del usuario
    // (requiere mousedown+mouseup), así que se queda con su propio listener.
    layer.on({
      click: () => {
        // Fijar panel + demarcación de inmediato con los datos ya disponibles
        // del feature clicado — así, al entrar a un nivel más profundo, el
        // total/lista de la demarcación recién seleccionada queda visible.
        setPanel(props);
        avisarDemarcacion(props);
        // En pantallas táctiles no existe hover: el primer tap solo
        // selecciona (muestra panel + filtra padrón) y un segundo tap sobre
        // la misma demarcación es el que entra al nivel siguiente.
        if (esTactil) {
          const clave = props.id ?? props.nombre;
          if (ultimoTapRef.current !== clave) {
            ultimoTapRef.current = clave;
            return;
          }
          ultimoTapRef.current = null;
        }
        drillDown(props);
      },
    });
  }

  function volverANacional() {
    // Un coordinador con territorio asignado no tiene una vista "nacional"
    // útil — el backend la filtraría de todos modos a su única provincia —
    // así que "Nacional" para él vuelve al tope de su propio territorio.
    if (user?.alcanceProvinciaId) {
      setNivel("municipios");
      setProvinciaSeleccionada({ id: user.alcanceProvinciaId, nombre: user.alcanceProvinciaNombre! });
      setMunicipioSeleccionado(null);
      setPanel(null);
      onDemarcacionChange?.(null);
      return;
    }
    setNivel("nacional");
    setProvinciaSeleccionada(null);
    setMunicipioSeleccionado(null);
    setPanel(null);
    onDemarcacionChange?.(null);
  }

  function volverAMunicipios() {
    setNivel("municipios");
    setMunicipioSeleccionado(null);
    // Al volver desde un distrito a la vista de municipios, re-cargar el
    // resumen de la provincia (incluye electores JCE) en vez de limpiar el
    // panel — antes se perdía la comparación que ya se había visto al
    // entrar a esa provincia, y solo volvía a aparecer si se pasaba el
    // mouse de nuevo sobre un municipio puntual.
    if (provinciaSeleccionada) {
      const { id, nombre } = provinciaSeleccionada;
      onDemarcacionChange?.({ tipo: "provincia", id, nombre });
      apiFetch<ResumenDemarcacion>(`/geo/provincias/${id}`)
        .then((r) => setPanel(r as Propiedades))
        .catch(() => setPanel(null));
    } else {
      setPanel(null);
      onDemarcacionChange?.(null);
    }
  }

  // Salto directo desde el buscador (o el ranking): navega al nivel correcto
  // y llena el panel con el resumen de la demarcación elegida.
  function seleccionarDemarcacion(item: ItemCatalogo) {
    setBusqueda("");
    setBusquedaAbierta(false);
    if (item.tipo === "provincia") {
      setProvinciaSeleccionada({ id: item.id, nombre: item.nombre });
      setMunicipioSeleccionado(null);
      setNivel("municipios");
      onDemarcacionChange?.({ tipo: "provincia", id: item.id, nombre: item.nombre });
      apiFetch<ResumenDemarcacion>(`/geo/provincias/${item.id}`)
        .then((r) => setPanel(r as Propiedades))
        .catch(() => setPanel(null));
    } else if (item.tipo === "municipio") {
      setProvinciaSeleccionada({ id: item.provinciaId!, nombre: item.provinciaNombre! });
      setMunicipioSeleccionado({ id: item.id, nombre: item.nombre });
      setNivel("distritos");
      onDemarcacionChange?.({ tipo: "municipio", id: item.id, nombre: item.nombre });
      apiFetch<ResumenDemarcacion>(`/geo/resumen/municipio/${item.id}`)
        .then((r) => setPanel(r as Propiedades))
        .catch(() => setPanel(null));
    } else {
      setProvinciaSeleccionada({ id: item.provinciaId!, nombre: item.provinciaNombre! });
      setMunicipioSeleccionado({ id: item.municipioId!, nombre: item.municipioNombre! });
      setNivel("distritos");
      onDemarcacionChange?.({ tipo: "distrito", id: item.id, nombre: item.nombre });
      apiFetch<ResumenDemarcacion>(`/geo/resumen/distrito-municipal/${item.id}`)
        .then((r) => setPanel(r as Propiedades))
        .catch(() => setPanel(null));
    }
  }

  const sugerencias = useMemo(() => {
    if (!catalogo || busqueda.trim().length < 2) return [];
    const q = busqueda
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    return catalogo
      .filter((c) =>
        c.nombre
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8);
  }, [catalogo, busqueda]);

  const conteosLeyenda = useMemo(() => {
    const c = { rojo: 0, amarillo: 0, verde: 0, estancadas: 0 };
    for (const f of geo?.features ?? []) {
      const p = f.properties as Propiedades;
      c[p.estado ?? "rojo"]++;
      if (p.estancada) c.estancadas++;
    }
    return c;
  }, [geo]);

  // Ranking del nivel visible: mejores y peores demarcaciones por avance.
  const ranking = useMemo(() => {
    const feats = (geo?.features ?? []).map((f) => f.properties as Propiedades);
    if (feats.length < 3) return null;
    const orden = [...feats].sort(
      (a, b) => b.porcentaje - a.porcentaje || b.militantesCaptados - a.militantesCaptados,
    );
    return { top: orden.slice(0, 5), bottom: orden.slice(-5).reverse() };
  }, [geo]);

  function clickRanking(props: Propiedades) {
    setPanel(props);
    avisarDemarcacion(props);
    if (nivel === "nacional") {
      seleccionarDemarcacion({ tipo: "provincia", id: props.id, nombre: props.nombre, ruta: "" });
    } else if (nivel === "municipios" && provinciaSeleccionada) {
      seleccionarDemarcacion({
        tipo: "municipio",
        id: props.id,
        nombre: props.nombre,
        ruta: "",
        provinciaId: provinciaSeleccionada.id,
        provinciaNombre: provinciaSeleccionada.nombre,
      });
    }
    // En el nivel de distritos no hay nivel más profundo: solo selecciona.
  }

  // Agrupa los puntos GPS en clusters por celda para no dibujar miles de
  // marcadores individuales (sin dependencias externas de clustering).
  const clusters = useMemo<Cluster[]>(() => {
    if (puntos.length === 0) return [];
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const p of puntos) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const celdas = 30;
    const dLat = Math.max((maxLat - minLat) / celdas, 0.0001);
    const dLng = Math.max((maxLng - minLng) / celdas, 0.0001);
    const grupos = new Map<string, { sumLat: number; sumLng: number; count: number }>();
    for (const p of puntos) {
      const clave = `${Math.floor((p.lat - minLat) / dLat)}:${Math.floor((p.lng - minLng) / dLng)}`;
      const g = grupos.get(clave) ?? { sumLat: 0, sumLng: 0, count: 0 };
      g.sumLat += p.lat;
      g.sumLng += p.lng;
      g.count++;
      grupos.set(clave, g);
    }
    return [...grupos.values()].map((g) => ({
      lat: g.sumLat / g.count,
      lng: g.sumLng / g.count,
      count: g.count,
    }));
  }, [puntos]);

  // Dibuja el mapa actual (polígonos + título + leyenda) en un canvas propio
  // a partir del geojson, independiente de Leaflet y de los tiles externos
  // (así no hay problemas de CORS ni dependencias) — lo reutilizan tanto la
  // exportación a PNG como la del reporte PDF.
  function construirCanvasMapa(): HTMLCanvasElement | null {
    if (!geo) return null;
    const W = 1400;
    const H = 1000;
    const M = 40;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#f0fdf4";
    ctx.fillRect(0, 0, W, H);

    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const f of geo.features) {
      for (const anillo of anillosDe(f)) {
        for (const [lng, lat] of anillo) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
      }
    }
    const areaW = W - 2 * M;
    const areaH = H - 2 * M - 60;
    // Corrige la distorsión este-oeste: un grado de longitud mide menos km
    // mientras más lejos del ecuador (RD ~18-20°N).
    const factorLng = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const escala = Math.min(areaW / ((maxLng - minLng) * factorLng), areaH / (maxLat - minLat));
    const offX = M + (areaW - (maxLng - minLng) * factorLng * escala) / 2;
    const offY = M + 60 + (areaH - (maxLat - minLat) * escala) / 2;
    const px = (lng: number) => offX + (lng - minLng) * factorLng * escala;
    const py = (lat: number) => offY + (maxLat - lat) * escala;

    for (const f of geo.features) {
      const props = f.properties as Propiedades;
      const fill =
        modoColor === "electorado" ? colorPenetracion(props.penetracion) : COLOR_ESTADO[props.estado ?? "rojo"];
      ctx.fillStyle = fill;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      for (const anillo of anillosDe(f)) {
        ctx.beginPath();
        anillo.forEach(([lng, lat], i) => {
          if (i === 0) ctx.moveTo(px(lng), py(lat));
          else ctx.lineTo(px(lng), py(lat));
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    const titulo =
      nivel === "nacional"
        ? "República Dominicana — militantes por provincia"
        : nivel === "municipios"
          ? `Municipios de ${provinciaSeleccionada?.nombre}`
          : `Distritos municipales de ${municipioSeleccionado?.nombre}`;
    ctx.fillStyle = "#14532d";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText(titulo, M, M + 8);
    ctx.fillStyle = "#6b7280";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(
      `Cayena · ${new Date().toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}`,
      M,
      M + 34,
    );

    const leyenda =
      modoColor === "electorado"
        ? [
            ["#14532d", "≥10% del electorado"],
            ["#16a34a", "2-10%"],
            ["#86efac", "<2%"],
            [COLOR_SIN_DATO, "Sin dato de electores"],
          ]
        : [
            [COLOR_ESTADO.rojo, "Lejos de meta"],
            [COLOR_ESTADO.amarillo, "En curso"],
            [COLOR_ESTADO.verde, "Meta cumplida"],
          ];
    let lx = M;
    const ly = H - 28;
    ctx.font = "15px system-ui, sans-serif";
    for (const [color, texto] of leyenda) {
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - 12, 14, 14);
      ctx.fillStyle = "#374151";
      ctx.fillText(texto, lx + 20, ly);
      lx += ctx.measureText(texto).width + 56;
    }

    return canvas;
  }

  function nombreArchivoMapa(): string {
    return nivel === "nacional" ? "nacional" : nivel === "municipios" ? (provinciaSeleccionada?.id ?? "mapa") : (municipioSeleccionado?.id ?? "mapa");
  }

  function exportarPNG() {
    const canvas = construirCanvasMapa();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mapa-${nombreArchivoMapa()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  }

  // Reporte PDF (mapa + tabla de métricas): reutiliza el mismo canvas del
  // PNG como imagen de portada y agrega abajo una tabla con los números de
  // cada demarcación visible en el nivel actual — el PNG solo es la imagen,
  // esto sirve para presentar/imprimir con los datos concretos al lado.
  async function exportarPDF() {
    const canvas = construirCanvasMapa();
    if (!canvas || !geo) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const imgW = pageW - 40;
    const imgH = (imgW * canvas.height) / canvas.width;
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 20, 20, imgW, Math.min(imgH, pageH - 40));

    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(20, 83, 45);
    const titulo =
      nivel === "nacional"
        ? "República Dominicana — militantes por provincia"
        : nivel === "municipios"
          ? `Municipios de ${provinciaSeleccionada?.nombre}`
          : `Distritos municipales de ${municipioSeleccionado?.nombre}`;
    doc.text(titulo, 20, 30);
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(
      `Cayena · ${new Date().toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}`,
      20,
      44,
    );

    const filas = geo.features
      .map((f) => f.properties as Propiedades)
      .sort((a, b) => b.porcentaje - a.porcentaje);

    const colX = { nombre: 20, captados: 320, meta: 420, avance: 520, electores: 620, estado: 740 };
    let y = 70;
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("DEMARCACIÓN", colX.nombre, y);
    doc.text("CAPTADOS", colX.captados, y);
    doc.text("META", colX.meta, y);
    doc.text("AVANCE", colX.avance, y);
    doc.text("ELECTORES JCE", colX.electores, y);
    doc.text("ESTADO", colX.estado, y);
    y += 6;
    doc.setDrawColor(229, 231, 235);
    doc.line(20, y, pageW - 20, y);
    y += 16;

    doc.setFontSize(10);
    for (const p of filas) {
      if (y > pageH - 30) {
        doc.addPage();
        y = 40;
      }
      doc.setTextColor(31, 41, 55);
      doc.text(p.nombre, colX.nombre, y);
      doc.text(p.militantesCaptados.toLocaleString("es-DO"), colX.captados, y);
      doc.text(p.meta.toLocaleString("es-DO"), colX.meta, y);
      doc.text(`${p.porcentaje}%`, colX.avance, y);
      doc.text(p.electores != null ? p.electores.toLocaleString("es-DO") : "—", colX.electores, y);
      const colorEstado =
        p.estado === "verde" ? [22, 163, 74] : p.estado === "amarillo" ? [217, 119, 6] : [220, 38, 38];
      doc.setTextColor(colorEstado[0], colorEstado[1], colorEstado[2]);
      doc.text(p.estado === "verde" ? "Meta cumplida" : p.estado === "amarillo" ? "En curso" : "Lejos de meta", colX.estado, y);
      y += 18;
    }

    doc.save(`reporte-mapa-${nombreArchivoMapa()}.pdf`);
  }

  const tendencia =
    panel?.captadosFiltrados !== undefined && panel?.captadosPrevio !== undefined
      ? panel.captadosFiltrados - panel.captadosPrevio
      : null;

  // Mini-tendencia (sparkline) de los últimos 14 días de la demarcación
  // seleccionada — complementa al ▲/▼ (que solo compara dos períodos) con
  // la forma real de la curva día a día.
  const [serieDiaria, setSerieDiaria] = useState<{ fecha: string; total: number }[] | null>(null);

  useEffect(() => {
    if (!panel) {
      setSerieDiaria(null);
      return;
    }
    const params = new URLSearchParams({ dias: "14" });
    // Ojo con nivel === "distritos": normalmente el panel ahí es una
    // demarcación de distrito real, pero el buscador puede saltar
    // directo a un MUNICIPIO (deja nivel en "distritos" para mostrar su
    // desglose) sin que el usuario haya tocado un distrito todavía — en
    // ese caso panel.id es el id del municipio, igual a
    // municipioSeleccionado.id, no el de un distrito.
    const panelEsElPropioMunicipio = nivel === "distritos" && panel.id === municipioSeleccionado?.id;
    if (nivel === "nacional") params.set("provinciaId", panel.id);
    else if (nivel === "municipios" || panelEsElPropioMunicipio) params.set("municipioId", panel.id);
    else if (panel.id) params.set("distritoMunicipalId", panel.id);
    else if (municipioSeleccionado) {
      params.set("municipioId", municipioSeleccionado.id);
      params.set("sinDistritoMunicipal", "true");
    } else {
      setSerieDiaria(null);
      return;
    }
    apiFetch<{ fecha: string; total: number }[]>(`/geo/serie-diaria?${params.toString()}`)
      .then(setSerieDiaria)
      .catch(() => setSerieDiaria(null));
  }, [panel?.id, panel?.nombre, nivel, municipioSeleccionado?.id, refreshToken, refreshVivo]);

  // Proyección de cumplimiento de meta (mismo cálculo que el Dashboard,
  // pero por demarcación): ritmo mensual estimado a partir del propio
  // sparkline de 14 días, ya cargado para el panel — no hace falta otro
  // fetch. null = sin ritmo con el que proyectar (0 registros recientes).
  const proyeccionMeses = useMemo(() => {
    if (!panel || !serieDiaria) return null;
    const faltantes = panel.meta - panel.militantesCaptados;
    if (faltantes <= 0) return 0;
    const dias = serieDiaria.length || 14;
    const ritmoMensual = (serieDiaria.reduce((s, d) => s + d.total, 0) / dias) * 30;
    return ritmoMensual > 0 ? Math.round((faltantes / ritmoMensual) * 10) / 10 : null;
  }, [panel?.meta, panel?.militantesCaptados, serieDiaria]);

  return (
    <div>
      {herramientas && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Buscador con salto directo */}
          <div className="relative">
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setBusquedaAbierta(true);
              }}
              onFocus={() => setBusquedaAbierta(true)}
              onBlur={() => setTimeout(() => setBusquedaAbierta(false), 200)}
              placeholder="Buscar demarcación…"
              className="w-52 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
            />
            {busquedaAbierta && sugerencias.length > 0 && (
              <div className="absolute left-0 top-full z-[1100] mt-1 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                {sugerencias.map((s) => (
                  <button
                    key={`${s.tipo}-${s.id}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      seleccionarDemarcacion(s);
                    }}
                    className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-institucional-50"
                  >
                    <span className="font-medium text-gray-800">{s.nombre}</span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {s.tipo === "provincia" ? "Provincia" : s.tipo === "municipio" ? s.ruta : `DM · ${s.ruta}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={filtros.periodo ?? ""}
            onChange={(e) =>
              setFiltros((f) => ({ ...f, periodo: (e.target.value || undefined) as FiltrosMapa["periodo"] }))
            }
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
          >
            <option value="">Histórico completo</option>
            <option value="semana">Última semana</option>
            <option value="mes">Este mes</option>
            <option value="trimestre">Este trimestre</option>
          </select>

          <select
            value={filtros.origen ?? ""}
            onChange={(e) =>
              setFiltros((f) => ({ ...f, origen: (e.target.value || undefined) as FiltrosMapa["origen"] }))
            }
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
          >
            <option value="">Todo origen</option>
            <option value="BACKOFFICE">Back office</option>
            <option value="APP_PUBLICA">App pública</option>
          </select>

          {promotores.length > 0 && (
            <select
              value={filtros.capturadoPorId ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, capturadoPorId: e.target.value || undefined }))}
              className="max-w-[180px] rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
            >
              <option value="">Todos los promotores</option>
              {promotores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-xs text-gray-400"
              title={
                enVivo
                  ? "Conectado en vivo: si alguien registra militantes en otra sesión, este mapa se refresca solo"
                  : "Reconectando el refresco en vivo…"
              }
            >
              <span className={`h-1.5 w-1.5 rounded-full ${enVivo ? "bg-green-500" : "bg-gray-300"}`} />
              {enVivo ? "En vivo" : "Reconectando…"}
            </span>
            <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
              <button
                onClick={() => setModoColor("meta")}
                className={`rounded-md px-2 py-1 ${modoColor === "meta" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
                title="Colorear por avance hacia la meta"
              >
                Meta
              </button>
              <button
                onClick={() => setModoColor("electorado")}
                className={`rounded-md px-2 py-1 ${modoColor === "electorado" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
                title="Colorear por % del electorado captado (requiere datos de electores JCE)"
              >
                % Electorado
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={verPuntos}
                onChange={(e) => setVerPuntos(e.target.checked)}
                className="h-3.5 w-3.5 accent-institucional-600"
              />
              Ubicaciones
            </label>
            <button
              onClick={exportarPNG}
              className="rounded-lg border border-institucional-600 px-2.5 py-1 text-xs font-medium text-institucional-700 hover:bg-institucional-50"
              title="Descargar el mapa actual como imagen PNG"
            >
              ⤓ PNG
            </button>
            <button
              onClick={exportarPDF}
              className="rounded-lg border border-institucional-600 px-2.5 py-1 text-xs font-medium text-institucional-700 hover:bg-institucional-50"
              title="Descargar un reporte PDF con el mapa y la tabla de métricas de cada demarcación"
            >
              ⤓ PDF
            </button>
          </div>
        </div>
      )}

      {/* Breadcrumb clicable: salta directo a cualquier nivel superior. */}
      <div className="mb-3 flex items-center justify-between">
        <nav aria-label="Ruta del mapa" className="flex items-center gap-1 text-sm text-gray-500">
          <button
            onClick={volverANacional}
            disabled={user?.alcanceProvinciaId ? nivel === "municipios" && !municipioSeleccionado : nivel === "nacional"}
            className={
              (user?.alcanceProvinciaId ? nivel === "municipios" && !municipioSeleccionado : nivel === "nacional")
                ? "font-semibold text-institucional-900"
                : "hover:text-institucional-700 hover:underline"
            }
          >
            {/* Un coordinador de zona no tiene una vista nacional real (ver
            volverANacional): la raíz de su ruta es directamente su propia
            provincia asignada. */}
            {user?.alcanceProvinciaId ? user.alcanceProvinciaNombre : "Nacional"}
          </button>
          {provinciaSeleccionada && !user?.alcanceProvinciaId && (
            <>
              <span className="text-gray-300">›</span>
              <button
                onClick={volverAMunicipios}
                disabled={nivel === "municipios"}
                className={nivel === "municipios" ? "font-semibold text-institucional-900" : "hover:text-institucional-700 hover:underline"}
              >
                {provinciaSeleccionada.nombre}
              </button>
            </>
          )}
          {municipioSeleccionado && nivel === "distritos" && (
            <>
              <span className="text-gray-300">›</span>
              <span className="font-semibold text-institucional-900">{municipioSeleccionado.nombre}</span>
            </>
          )}
        </nav>
        {esTactil && nivel !== "distritos" && (
          <span className="text-xs text-gray-400">Toca para seleccionar · toca otra vez para entrar</span>
        )}
      </div>

      {nivel === "distritos" && geo && geo.features.length === 0 ? (
        <div
          className={`${aspecto ? `w-full ${aspecto}` : alto ?? (compacto ? "h-[380px]" : "h-[520px]")} flex items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400`}
        >
          {municipioSeleccionado?.nombre} no tiene distritos municipales registrados — es un municipio sin
          subdivisiones adicionales.
        </div>
      ) : (
        <div
          className={`${aspecto ? `w-full ${aspecto}` : alto ?? (compacto ? "h-[380px]" : "h-[520px]")} overflow-hidden rounded-xl border border-gray-200`}
        >
          <MapContainer
            center={[18.89, -70.16]}
            zoom={8}
            zoomSnap={0.001}
            zoomDelta={0.25}
            ref={mapRef}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={!compacto}
            dragging={!compacto}
            doubleClickZoom={false}
            touchZoom={!compacto}
            boxZoom={!compacto}
            keyboard={!compacto}
            zoomControl={!compacto}
            attributionControl={!compacto}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {geo && (
              <GeoJSON
                key={
                  nivel +
                  (provinciaSeleccionada?.id ?? "") +
                  (municipioSeleccionado?.id ?? "") +
                  refreshToken +
                  refreshVivo +
                  JSON.stringify(filtros)
                }
                ref={geoLayerRef}
                data={geo}
                style={estiloFeature}
                onEachFeature={onEachFeature}
              />
            )}
            {verPuntos &&
              clusters.map((c, i) => (
                <CircleMarker
                  key={i}
                  center={[c.lat, c.lng]}
                  radius={Math.min(4 + Math.sqrt(c.count) * 2.5, 22)}
                  pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.65, weight: 1 }}
                >
                  <LeafletTooltip direction="top">
                    {c.count.toLocaleString("es-DO")} militante{c.count === 1 ? "" : "s"}
                  </LeafletTooltip>
                </CircleMarker>
              ))}
          </MapContainer>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        {modoColor === "meta" ? (
          <>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.rojo }} /> Lejos de meta
              <span className="font-semibold text-gray-700">{conteosLeyenda.rojo}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.amarillo }} /> En curso
              <span className="font-semibold text-gray-700">{conteosLeyenda.amarillo}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.verde }} /> Meta cumplida
              <span className="font-semibold text-gray-700">{conteosLeyenda.verde}</span>
            </span>
            {conteosLeyenda.estancadas > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-red-600">⚠</span> Estancadas
                <span className="font-semibold text-red-700">{conteosLeyenda.estancadas}</span>
              </span>
            )}
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#14532d" }} /> ≥10% del electorado
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#16a34a" }} /> 2-10%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#86efac" }} /> &lt;2%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_SIN_DATO }} /> Sin dato de electores
            </span>
          </>
        )}
        {loading && <span className="ml-auto animate-pulse">Cargando…</span>}
      </div>

      {/* Panel fijo debajo del mapa (RF-13.3): no es un tooltip flotante. */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {panel ? (
          <div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-xs uppercase text-gray-400">Demarcación</div>
                <div className="flex items-center gap-2 text-base font-semibold text-institucional-900">
                  {panel.nombre}
                  {panel.estancada && (
                    <span
                      className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700"
                      title="Sin militantes nuevos en los últimos 14 días y meta sin cumplir"
                    >
                      Estancada
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-gray-400">Militantes captados</div>
                <div className="text-base font-semibold">{panel.militantesCaptados.toLocaleString("es-DO")}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-gray-400">Meta</div>
                <div className="text-base font-semibold">{panel.meta.toLocaleString("es-DO")}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-gray-400">Avance</div>
                <div className="text-base font-semibold" style={{ color: COLOR_ESTADO[panel.estado] }}>
                  {panel.porcentaje}%
                </div>
                {proyeccionMeses !== null && (
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {proyeccionMeses === 0 ? "¡Meta ya cumplida!" : `~${proyeccionMeses} meses al ritmo actual`}
                  </div>
                )}
              </div>
            </div>
            {(panel.captadosFiltrados !== undefined || panel.electores != null) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-gray-100 pt-3 text-sm">
                {panel.captadosFiltrados !== undefined && (
                  <span className="text-gray-600">
                    En el período seleccionado:{" "}
                    <span className="font-semibold text-gray-900">
                      {panel.captadosFiltrados.toLocaleString("es-DO")}
                    </span>
                    {tendencia !== null && (
                      <span
                        className={`ml-1.5 font-semibold ${tendencia > 0 ? "text-green-600" : tendencia < 0 ? "text-red-600" : "text-gray-400"}`}
                        title="Comparado con el período anterior equivalente"
                      >
                        {tendencia > 0 ? `▲ +${tendencia}` : tendencia < 0 ? `▼ ${tendencia}` : "— igual"}
                      </span>
                    )}
                  </span>
                )}
                {panel.electores != null && (
                  <span className="text-gray-600">
                    Electores JCE:{" "}
                    <span className="font-semibold text-gray-900">{panel.electores.toLocaleString("es-DO")}</span>
                    {panel.penetracion != null && (
                      <span className="ml-1.5 font-semibold text-institucional-700">
                        · {panel.penetracion}% captado
                      </span>
                    )}
                  </span>
                )}
                {serieDiaria && serieDiaria.some((d) => d.total > 0) && (
                  <span className="flex items-center gap-2 text-gray-500">
                    Últimos 14 días:
                    <Sparkline datos={serieDiaria} />
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            {esTactil
              ? "Toca una demarcación del mapa para ver su detalle aquí."
              : "Pasa el cursor sobre una demarcación del mapa para ver su detalle aquí."}
          </p>
        )}
      </div>

      {/* Ranking del nivel visible: mejores y peores demarcaciones. */}
      {herramientas && ranking && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Mayor avance en este nivel
            </h3>
            <ul className="divide-y divide-gray-50">
              {ranking.top.map((p) => (
                <li key={p.id ?? p.nombre}>
                  <button
                    onClick={() => clickRanking(p)}
                    className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-sm hover:text-institucional-700"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_ESTADO[p.estado] }} />
                      {p.nombre}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {p.militantesCaptados.toLocaleString("es-DO")} · {p.porcentaje}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Menor avance en este nivel
            </h3>
            <ul className="divide-y divide-gray-50">
              {ranking.bottom.map((p) => (
                <li key={p.id ?? p.nombre}>
                  <button
                    onClick={() => clickRanking(p)}
                    className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-sm hover:text-institucional-700"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_ESTADO[p.estado] }} />
                      {p.nombre}
                      {p.estancada && <span className="text-[10px] font-bold uppercase text-red-600">⚠</span>}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {p.militantesCaptados.toLocaleString("es-DO")} · {p.porcentaje}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// Mini-gráfica de línea sin dependencias (sin recharts): un SVG chico con el
// total diario de los últimos N días, para ver la forma de la curva de
// captación de un vistazo junto al ▲/▼ del panel.
function Sparkline({ datos }: { datos: { fecha: string; total: number }[] }) {
  const W = 100;
  const H = 24;
  const max = Math.max(1, ...datos.map((d) => d.total));
  const paso = datos.length > 1 ? W / (datos.length - 1) : W;
  const puntos = datos.map((d, i) => `${i * paso},${H - (d.total / max) * (H - 2) - 1}`).join(" ");
  const area = `0,${H} ${puntos} ${W},${H}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polygon points={area} fill="#1f7a34" fillOpacity={0.12} />
      <polyline points={puntos} fill="none" stroke="#1f7a34" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
