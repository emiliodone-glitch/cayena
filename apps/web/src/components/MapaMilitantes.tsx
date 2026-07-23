"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, GeoJSON, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from "react-leaflet";
import type { Map as LeafletMap, Layer, HeatLayer } from "leaflet";
import * as L from "leaflet";
// Efecto lateral: agrega L.heatLayer() al namespace de Leaflet — no hay
// componente de react-leaflet para esto, así que la capa de calor se maneja
// a mano contra el mapa (mapRef.current) en un efecto, como cualquier otro
// plugin de Leaflet que no tiene wrapper de React.
import "leaflet.heat";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { COLOR_ESTADO, type EstadoAvance } from "@cayena/shared";
import { apiFetch, API_URL, getAccessToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  medirTexto,
  partirEnLineas,
  anillosDe,
  dentroDelAnillo,
  anchoHorizontalEnPunto,
  mayorAnillo,
  centroideMayorAnillo,
} from "@/lib/mapaEtiquetas";

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

function construirQueryFiltros(f: FiltrosMapa): string {
  const params = new URLSearchParams();
  if (f.periodo) params.set("periodo", f.periodo);
  if (f.origen) params.set("origen", f.origen);
  if (f.capturadoPorId) params.set("capturadoPorId", f.capturadoPorId);
  const s = params.toString();
  return s ? `?${s}` : "";
}

// Misma regla de ruta que usa el efecto principal de geo — se extrae acá
// para que la comparación de períodos pueda pedir el mismo nivel/demarcación
// actual con un `periodo` propio, sin duplicar la lógica de niveles.
function construirRutaGeo(
  nivel: "nacional" | "municipios" | "distritos",
  provinciaId: string | undefined,
  municipioId: string | undefined,
  qs: string,
): string {
  if (nivel === "nacional") return `/geo/provincias${qs}`;
  if (nivel === "municipios") return `/geo/provincias/${provinciaId}/municipios${qs}`;
  return `/geo/municipios/${municipioId}/distritos-municipales${qs}`;
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
  // "clusters" (círculos agrupados, ya existía) vs "calor" (mapa de calor
  // real): en zonas densas como Santo Domingo los círculos se amontonan y
  // es difícil leer la concentración real — el calor se lee mejor ahí.
  const [modoPuntos, setModoPuntos] = useState<"clusters" | "calor">("clusters");
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const heatLayerRef = useRef<HeatLayer | null>(null);
  const [catalogo, setCatalogo] = useState<ItemCatalogo[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [promotores, setPromotores] = useState<{ id: string; nombre: string }[]>([]);
  // Se incrementa cada vez que llega un evento en vivo (SSE) de que alguien
  // registró/importó militantes en cualquier sesión — dispara el mismo
  // refetch que `refreshToken`, pero sin depender de una acción propia.
  const [refreshVivo, setRefreshVivo] = useState(0);
  const [enVivo, setEnVivo] = useState(false);

  // Comparación de dos períodos lado a lado: dos "fotos" del mismo nivel y
  // demarcación actual, cada una con su propio filtro de período — un
  // vistazo directo de antes/después en vez de solo la cifra ▲/▼ del panel.
  const [compararAbierto, setCompararAbierto] = useState(false);
  const [periodoA, setPeriodoA] = useState<FiltrosMapa["periodo"]>(undefined);
  const [periodoB, setPeriodoB] = useState<FiltrosMapa["periodo"]>("mes");
  const [geoA, setGeoA] = useState<FeatureCollection | null>(null);
  const [geoB, setGeoB] = useState<FeatureCollection | null>(null);
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);

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
    const path = construirRutaGeo(nivel, provinciaSeleccionada?.id, municipioSeleccionado?.id, qs);
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

  // Capa de mapa de calor (plugin leaflet.heat, sin wrapper de react-leaflet):
  // se crea/actualiza/destruye a mano contra la instancia real de Leaflet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!verPuntos || modoPuntos !== "calor") {
      heatLayerRef.current?.remove();
      heatLayerRef.current = null;
      return;
    }
    const puntosLatLng: [number, number, number][] = puntos.map((p) => [p.lat, p.lng, 1]);
    if (heatLayerRef.current) {
      heatLayerRef.current.setLatLngs(puntosLatLng);
    } else {
      // Pane propio por encima de overlayPane (donde vive el <GeoJSON>): si
      // no, cuando el mapa vuelve a montar el choropleth (cambio de nivel,
      // refresco en vivo) puede insertarse en el DOM después del canvas del
      // calor y taparlo por completo con su relleno casi opaco.
      if (!map.getPane("heatPane")) {
        const pane = map.createPane("heatPane");
        pane.style.zIndex = "450";
      }
      heatLayerRef.current = L.heatLayer(puntosLatLng, {
        radius: 22,
        blur: 18,
        maxZoom: 17,
        pane: "heatPane",
        // `max` bajo normaliza mejor con pocos puntos superpuestos (una
        // zona con 3-4 militantes ya se ve "caliente" en vez de casi
        // transparente); minOpacity da un piso de visibilidad para que un
        // solo punto aislado no desaparezca contra el fondo del mapa.
        max: 3,
        minOpacity: 0.35,
      } as L.HeatMapOptions).addTo(map);
    }
  }, [verPuntos, modoPuntos, puntos]);

  useEffect(() => {
    return () => {
      heatLayerRef.current?.remove();
      heatLayerRef.current = null;
    };
  }, []);

  // Comparación de períodos: dos fetches independientes del mismo
  // nivel/demarcación que ya se está viendo, cada uno con su propio
  // `periodo` — no toca los filtros del mapa principal.
  useEffect(() => {
    if (!compararAbierto) return;
    let cancelado = false;
    const rutaA = construirRutaGeo(
      nivel,
      provinciaSeleccionada?.id,
      municipioSeleccionado?.id,
      construirQueryFiltros({ ...filtros, periodo: periodoA }),
    );
    const rutaB = construirRutaGeo(
      nivel,
      provinciaSeleccionada?.id,
      municipioSeleccionado?.id,
      construirQueryFiltros({ ...filtros, periodo: periodoB }),
    );
    apiFetch<FeatureCollection>(rutaA).then((d) => !cancelado && setGeoA(d));
    apiFetch<FeatureCollection>(rutaB).then((d) => !cancelado && setGeoB(d));
    return () => {
      cancelado = true;
    };
  }, [compararAbierto, periodoA, periodoB, nivel, provinciaSeleccionada?.id, municipioSeleccionado?.id, filtros, refreshVivo]);

  // Dibuja un choropleth simplificado (mismo cálculo de proyección que el
  // canvas de exportación, sin título/leyenda propios — esos van en el HTML
  // alrededor de cada canvas) en el elemento que se le pase.
  function dibujarComparacion(canvas: HTMLCanvasElement | null, datos: FeatureCollection | null) {
    if (!canvas || !datos) return;
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f0fdf4";
    ctx.fillRect(0, 0, W, H);

    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const f of datos.features) {
      for (const anillo of anillosDe(f)) {
        for (const [lng, lat] of anillo) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
      }
    }
    const M = 10;
    const factorLng = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const escala = Math.min((W - 2 * M) / ((maxLng - minLng) * factorLng), (H - 2 * M) / (maxLat - minLat));
    const offX = M + (W - 2 * M - (maxLng - minLng) * factorLng * escala) / 2;
    const offY = M + (H - 2 * M - (maxLat - minLat) * escala) / 2;
    const px = (lng: number) => offX + (lng - minLng) * factorLng * escala;
    const py = (lat: number) => offY + (maxLat - lat) * escala;

    for (const f of datos.features) {
      const props = f.properties as Propiedades;
      ctx.fillStyle =
        modoColor === "electorado" ? colorPenetracion(props.penetracion) : COLOR_ESTADO[props.estado ?? "rojo"];
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
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
  }

  useEffect(() => {
    dibujarComparacion(canvasARef.current, geoA);
    // compararAbierto en las dependencias: al reabrir el panel, el <canvas>
    // es un nodo del DOM nuevo (vacío) — sin esto no se redibujaría hasta
    // el próximo fetch, aunque geoA no haya cambiado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoA, modoColor, compararAbierto]);

  useEffect(() => {
    dibujarComparacion(canvasBRef.current, geoB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoB, modoColor, compararAbierto]);

  // Cuando hay un período aplicado, el backend manda captadosFiltrados
  // (solo lo registrado en esa ventana) — eso es lo que hay que sumar para
  // comparar "cuánto se captó en cada período", no el total histórico
  // (militantesCaptados), que sería igual en ambos lados.
  function totalCaptados(datos: FeatureCollection | null): number {
    if (!datos) return 0;
    return datos.features.reduce((s, f) => {
      const p = f.properties as Propiedades;
      return s + (p.captadosFiltrados ?? p.militantesCaptados ?? 0);
    }, 0);
  }

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
        const propiedades = path.feature?.properties as Propiedades | undefined;
        const nombreFeature = propiedades?.nombre ?? "";
        // El nombre se toma siempre de la propiedad del feature (nunca del
        // contenido actual del tooltip): como acá se reescribe el tooltip con
        // <br> entre renglones, leerlo de vuelta en la siguiente pasada
        // devolvería el HTML ya partido y rompería el cálculo de líneas.
        const nombreEtiqueta = nombreFeature === "Distrito Nacional" ? "DN" : nombreFeature;
        // El ancla real de la etiqueta (el punto más "adentro" del territorio
        // principal, ver centroideMayorAnillo) puede quedar lejos del centro
        // del bounding box en provincias con islas o penínsulas finas — hay
        // que medir tanto la colisión como el ancho disponible en el punto
        // donde el rótulo realmente se dibuja, no en el centro del bbox.
        const ancla = L.latLng(path.anclaEtiqueta ?? b.getCenter());
        const anilloPrincipal = path.feature ? mayorAnillo(path.feature) : null;
        // Igual que en los mapas de referencia, un nombre largo en un
        // territorio angosto se reparte en varias líneas cortas en vez de
        // desbordar la división — el ancho máximo por renglón es el ancho
        // horizontal real del territorio en la latitud del ancla (no el
        // ancho del bounding box completo, que puede ser mucho mayor que el
        // punto donde realmente cae el nombre).
        let maxLineaPx = ancho * 0.92;
        if (anilloPrincipal) {
          const disponibleGrados = anchoHorizontalEnPunto(anilloPrincipal, ancla.lng, ancla.lat);
          if (Number.isFinite(disponibleGrados)) {
            const bordeIzq = map.latLngToContainerPoint([ancla.lat, ancla.lng - disponibleGrados / 2]);
            const bordeDer = map.latLngToContainerPoint([ancla.lat, ancla.lng + disponibleGrados / 2]);
            maxLineaPx = Math.max(30, Math.abs(bordeDer.x - bordeIzq.x) * 0.9);
          }
        }
        const lineas = partirEnLineas(nombreEtiqueta, maxLineaPx);
        const anchoTexto = Math.max(...lineas.map((l) => medirTexto(l)));
        const altoTexto = 14 + (lineas.length - 1) * 13;
        // El umbral de descarte usa el MENOR entre un mínimo parejo (52px) y
        // el ancho real que pide el renglón más largo: para nombres largos el
        // mínimo parejo sigue mandando (mismo comportamiento de siempre), pero
        // una etiqueta corta como "DN" solo necesita que su territorio
        // alcance para "DN", no para el mínimo pensado para nombres largos —
        // por eso antes Distrito Nacional se descartaba pese a que su
        // abreviatura sí entraba en su territorio.
        if (ancho < Math.min(52, anchoTexto + 12) || altoPx < altoTexto + 2) {
          descartados.push(path);
          return;
        }
        path.setTooltipContent(lineas.join("<br>"));
        const anclaPx = map.latLngToContainerPoint(ancla);
        candidatos.push({
          path,
          ancla,
          area: ancho * altoPx,
          cx: anclaPx.x,
          cy: anclaPx.y,
          ancho: anchoTexto + 8,
          alto: altoTexto,
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
            {verPuntos && (
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5 text-xs">
                <button
                  onClick={() => setModoPuntos("clusters")}
                  className={`rounded-md px-2 py-1 ${modoPuntos === "clusters" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
                  title="Círculos agrupados por zona"
                >
                  Puntos
                </button>
                <button
                  onClick={() => setModoPuntos("calor")}
                  className={`rounded-md px-2 py-1 ${modoPuntos === "calor" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
                  title="Mapa de calor — mejor para leer concentración en zonas densas"
                >
                  Calor
                </button>
              </div>
            )}
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
            <button
              onClick={() => setCompararAbierto((v) => !v)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                compararAbierto
                  ? "border-institucional-600 bg-institucional-600 text-white"
                  : "border-institucional-600 text-institucional-700 hover:bg-institucional-50"
              }`}
              title="Comparar dos períodos lado a lado en esta misma demarcación"
            >
              ⇄ Comparar
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
            {/* Basemap sin etiquetas propias (CartoDB Positron) en vez del OSM
                estándar: el OSM completo trae nombres de lugares, carreteras y
                fronteras de Haití que competían visualmente con las etiquetas
                y el relleno de color de las propias demarcaciones — resultaba
                en ruido, sobre todo en la vista nacional donde el mapa se ve
                chico. Este basemap es deliberadamente pálido y sin texto para
                que el choropleth (el dato real) sea lo único que resalte. */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
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
              modoPuntos === "clusters" &&
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

      {compararAbierto && (
        <div className="mt-3 grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2">
          {(
            [
              { periodo: periodoA, setPeriodo: setPeriodoA, canvasRef: canvasARef, geo: geoA, etiqueta: "Período A" },
              { periodo: periodoB, setPeriodo: setPeriodoB, canvasRef: canvasBRef, geo: geoB, etiqueta: "Período B" },
            ] as const
          ).map((col) => (
            <div key={col.etiqueta}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase text-gray-400">{col.etiqueta}</span>
                <select
                  value={col.periodo ?? ""}
                  onChange={(e) => col.setPeriodo((e.target.value || undefined) as FiltrosMapa["periodo"])}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-institucional-600 focus:outline-none"
                >
                  <option value="">Histórico completo</option>
                  <option value="semana">Última semana</option>
                  <option value="mes">Este mes</option>
                  <option value="trimestre">Este trimestre</option>
                </select>
              </div>
              <canvas
                ref={col.canvasRef}
                width={520}
                height={360}
                className="w-full rounded-lg border border-gray-100"
              />
              <div className="mt-1 text-xs text-gray-500">
                Militantes captados en el período:{" "}
                <span className="font-semibold text-gray-900">{totalCaptados(col.geo).toLocaleString("es-DO")}</span>
              </div>
            </div>
          ))}
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
