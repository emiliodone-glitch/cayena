"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, GeoJSON } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import * as L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { apiFetch, API_URL, getAccessToken, refreshAccessToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { partirEnLineas, anillosDe, anchoHorizontalEnPunto, mayorAnillo, centroideMayorAnillo } from "@/lib/mapaEtiquetas";

type Propiedades = {
  id: string | null;
  nombre: string;
  militantesRegistrados: number;
  votosConfirmados: number;
  porcentajePropia: number;
  electores?: number | null;
  porcentajePadron?: number | null;
  metaObjetivo?: number | null;
  provinciaId?: string;
  esCabecera?: boolean;
};

export type DemarcacionElectoral =
  | { tipo: "provincia"; id: string; nombre: string }
  | { tipo: "municipio"; id: string; nombre: string }
  | { tipo: "distrito"; id: string; nombre: string };

const COLOR_SIN_DATO = "#e2e8f0";

// Dos escalas distintas para no confundir a simple vista en qué modo está el
// mapa: verde institucional (color del partido) para "% propia base", azul
// para "% padrón" — mismos 6 pasos y umbrales en ambas, solo cambia la
// familia de color. "Sin dato" se mantiene gris neutro en las dos — nunca se
// confunde con "0% ya reportado".
const ESCALA_VERDE = ["#164f22", "#1f7a34", "#4cae5c", "#6ec488", "#a8e0b6", "#d6f5dd"];
const ESCALA_AZUL = ["#1e3a8a", "#1d4ed8", "#3b82f6", "#60a5fa", "#bfdbfe", "#eff6ff"];

function colorParticipacion(p: number | null | undefined, modoColor: "propia" | "padron"): string {
  if (p == null) return COLOR_SIN_DATO;
  const [c80, c60, c40, c20, cPositivo, cCero] = modoColor === "padron" ? ESCALA_AZUL : ESCALA_VERDE;
  if (p >= 80) return c80;
  if (p >= 60) return c60;
  if (p >= 40) return c40;
  if (p >= 20) return c20;
  if (p > 0) return cPositivo;
  return cCero;
}

function construirRuta(
  nivel: "nacional" | "municipios" | "distritos",
  provinciaId: string | undefined,
  municipioId: string | undefined,
  eventoId: string,
): string {
  const qs = `?eventoId=${eventoId}`;
  if (nivel === "nacional") return `/dia-electoral/provincias${qs}`;
  if (nivel === "municipios") return `/dia-electoral/provincias/${provinciaId}/municipios${qs}`;
  return `/dia-electoral/municipios/${municipioId}/distritos-municipales${qs}`;
}

export function MapaDiaElectoral({
  eventoId,
  aspecto = "aspect-[1000/850]",
  onDemarcacionChange,
}: {
  eventoId: string;
  aspecto?: string;
  onDemarcacionChange?: (sel: DemarcacionElectoral | null) => void;
}) {
  const { user } = useAuth();
  const [nivel, setNivel] = useState<"nacional" | "municipios" | "distritos">("nacional");
  const [provinciaSeleccionada, setProvinciaSeleccionada] = useState<{ id: string; nombre: string } | null>(null);
  const [municipioSeleccionado, setMunicipioSeleccionado] = useState<{ id: string; nombre: string } | null>(null);
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [panel, setPanel] = useState<Propiedades | null>(null);
  const [loading, setLoading] = useState(true);
  const [modoColor, setModoColor] = useState<"propia" | "padron">("propia");
  const [refreshVivo, setRefreshVivo] = useState(0);
  const [enVivo, setEnVivo] = useState(false);
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaInput, setMetaInput] = useState("");
  const [guardandoMeta, setGuardandoMeta] = useState(false);

  const puedeEditarMeta = user?.role === "SUPERADMIN" || user?.role === "JEFE_SECRETARIA";
  const nivelMeta = nivel === "nacional" ? "provincia" : nivel === "municipios" ? "municipio" : "distrito";

  async function guardarMeta() {
    if (!panel?.id) return;
    const porcentajeObjetivo = Number(metaInput);
    if (!Number.isFinite(porcentajeObjetivo) || porcentajeObjetivo < 1 || porcentajeObjetivo > 100) return;
    setGuardandoMeta(true);
    try {
      await apiFetch("/dia-electoral/metas", {
        method: "POST",
        body: JSON.stringify({ eventoId, nivel: nivelMeta, demarcacionId: panel.id, porcentajeObjetivo }),
      });
      setPanel((prev) => (prev ? { ...prev, metaObjetivo: porcentajeObjetivo } : prev));
      setEditandoMeta(false);
    } finally {
      setGuardandoMeta(false);
    }
  }

  const mapRef = useRef<LeafletMap | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  // Mapa de elemento DOM -> layer de Leaflet, reconstruido cada vez que se
  // (re)monta la capa GeoJSON — usado por el hit-testing manual de
  // `mousemove` más abajo (ver por qué en ese efecto).
  const elementLayerRef = useRef(new Map<Element, L.Path>());
  const resaltadoRef = useRef<L.Path | null>(null);
  // Última posición conocida del cursor (RF nuevo) — se necesita para
  // re-evaluar qué demarcación hay debajo justo después de un cambio de
  // vista programático (fitBounds al entrar a un nivel nuevo), ya que ahí
  // no hay un mousemove real que dispare el hit-test.
  const ultimaPosicionRef = useRef<{ x: number; y: number } | null>(null);

  const autoNavegoRef = useRef(false);
  useEffect(() => {
    if (autoNavegoRef.current || !user) return;
    autoNavegoRef.current = true;
    if (!user.alcanceProvinciaId) return;
    setProvinciaSeleccionada({ id: user.alcanceProvinciaId, nombre: user.alcanceProvinciaNombre! });
    setNivel("municipios");
  }, [user]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setGeo(null);
    const ruta = construirRuta(nivel, provinciaSeleccionada?.id, municipioSeleccionado?.id, eventoId);
    apiFetch<FeatureCollection>(ruta)
      .then((data) => {
        if (cancelado) return;
        setGeo(data);
      })
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [nivel, provinciaSeleccionada?.id, municipioSeleccionado?.id, eventoId]);

  // Refresco en vivo (RF nuevo): antes este mismo efecto recargaba con CADA
  // "cambio-votos" del SSE (nacional, no solo de la demarcación visible) sin
  // ningún límite — en un día con muchas confirmaciones seguidas en
  // cualquier parte del país, eso significaba pedirle al backend el
  // choropleth completo (agregados por provincia/municipio) muchas veces
  // por segundo, saturando la API y sintiéndose lento en toda la pantalla
  // de Día Electoral (mapa e incluso el panel de mesas, que comparte
  // backend). Se limita a como mucho un refresco cada 1.5s: si llegan
  // varios "ticks" seguidos, se agrupan en uno solo al final de la espera
  // en vez de disparar una petición por cada uno.
  const ultimoRefrescoVivoRef = useRef(0);
  const timerRefrescoVivoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (refreshVivo === 0) return; // el efecto de arriba ya cubrió la carga inicial
    const INTERVALO_MIN_MS = 1500;

    function refrescar() {
      ultimoRefrescoVivoRef.current = Date.now();
      timerRefrescoVivoRef.current = null;
      const ruta = construirRuta(nivel, provinciaSeleccionada?.id, municipioSeleccionado?.id, eventoId);
      apiFetch<FeatureCollection>(ruta)
        .then(setGeo)
        .catch(() => {});
    }

    const transcurrido = Date.now() - ultimoRefrescoVivoRef.current;
    if (transcurrido >= INTERVALO_MIN_MS) {
      refrescar();
    } else if (!timerRefrescoVivoRef.current) {
      timerRefrescoVivoRef.current = setTimeout(refrescar, INTERVALO_MIN_MS - transcurrido);
    }
    return () => {
      if (timerRefrescoVivoRef.current) {
        clearTimeout(timerRefrescoVivoRef.current);
        timerRefrescoVivoRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshVivo]);

  // Refresco en vivo: mismo canal SSE que el mapa de militantes, evento
  // "cambio-votos" en vez de "cambio-militantes".
  useEffect(() => {
    let cerrado = false;
    let fuente: EventSource | null = null;
    let reintentoTimer: ReturnType<typeof setTimeout> | null = null;
    let intentos = 0;

    async function conectar() {
      if (cerrado) return;
      // Refresca antes de conectar (RF nuevo): esta conexión se queda abierta
      // mientras la pantalla de Día Electoral esté abierta, potencialmente
      // horas — sin refrescar, el access token guardado vence a mitad de
      // jornada y la reconexión entraba en un bucle de 401 con el mismo
      // token vencido, para siempre (ver comentario en refreshAccessToken).
      const token = (await refreshAccessToken()) ?? getAccessToken();
      if (!token || cerrado) return;
      fuente = new EventSource(`${API_URL}/eventos/stream?token=${encodeURIComponent(token)}`);
      fuente.addEventListener("cambio-votos", () => setRefreshVivo((t) => t + 1));
      fuente.onopen = () => {
        intentos = 0;
        setEnVivo(true);
      };
      fuente.onerror = () => {
        setEnVivo(false);
        fuente?.close();
        if (cerrado) return;
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

  // Memoizado (RF nuevo): react-leaflet reaplica `style` a TODAS las
  // demarcaciones del mapa cada vez que la referencia de la función cambia
  // — sin memoizar, `estiloFeature` se recreaba en cada render (incluido
  // cada frame de hover, por el setPanel de más abajo), así que pasar el
  // cursor por el mapa recoloreaba el mapa ENTERO en cada frame en vez de
  // solo resaltar la demarcación bajo el cursor. Con esto, la referencia
  // solo cambia cuando modoColor realmente cambia.
  const estiloFeature = useCallback(
    (feature?: Feature) => {
      const props = feature?.properties as Propiedades | undefined;
      const valor = modoColor === "padron" ? props?.porcentajePadron : props?.porcentajePropia;
      // Borde gris medio (no blanco): con 0% de participación en casi todo el
      // mapa, el relleno queda casi tan pálido como el fondo — un borde blanco
      // ahí desaparecía por completo y las demarcaciones se veían "pegadas".
      return { fillColor: colorParticipacion(valor, modoColor), fillOpacity: 0.85, color: "#94a3b8", weight: 1 };
    },
    [modoColor],
  );

  useEffect(() => {
    geoLayerRef.current?.setStyle(estiloFeature);
  }, [modoColor, estiloFeature]);

  // Cierra el formulario de editar meta al cambiar de demarcación (hover u
  // otra) — sin esto, quedaba abierto mostrando/editando la meta de la
  // demarcación anterior.
  useEffect(() => {
    setEditandoMeta(false);
    setMetaInput("");
  }, [panel?.id]);

  function avisarDemarcacion(props: Propiedades) {
    if (!onDemarcacionChange || !props.id) return;
    if (nivel === "nacional") onDemarcacionChange({ tipo: "provincia", id: props.id, nombre: props.nombre });
    else if (nivel === "municipios") onDemarcacionChange({ tipo: "municipio", id: props.id, nombre: props.nombre });
    else onDemarcacionChange({ tipo: "distrito", id: props.id, nombre: props.nombre });
  }

  function drillDown(props: Propiedades) {
    if (!props.id) return;
    if (nivel === "nacional") {
      setProvinciaSeleccionada({ id: props.id, nombre: props.nombre });
      setNivel("municipios");
    } else if (nivel === "municipios") {
      setMunicipioSeleccionado({ id: props.id, nombre: props.nombre });
      setNivel("distritos");
    }
  }

  function onEachFeature(feature: Feature, layer: L.Layer) {
    const props = feature.properties as Propiedades;
    const textoEtiqueta = props.nombre === "Distrito Nacional" ? "DN" : props.nombre;
    layer.bindTooltip(textoEtiqueta, { permanent: true, direction: "center", className: "etiqueta-mapa", opacity: 1 });
    // Leaflet centra el tooltip con el centroide de TODOS los anillos de la
    // geometría (islas incluidas) — para una provincia con un cayo separado
    // del territorio principal (Pedernales, La Altagracia) eso deja el
    // nombre flotando sobre la isla o en el mar entre ambas. Se recalcula acá
    // con el punto más "adentro" del anillo de mayor área (ver
    // centroideMayorAnillo en @/lib/mapaEtiquetas, misma lógica que ya usa el
    // mapa de militantes). El ancla se guarda en el propio layer porque
    // actualizarEtiquetas() (más abajo) vuelve a abrir el tooltip en cada
    // encuadre y openTooltip() sin argumento recalcula desde el centro
    // ingenuo de Leaflet, pisando esta corrección.
    const centro = centroideMayorAnillo(feature);
    if (centro) {
      layer.getTooltip()?.setLatLng(centro);
      (layer as L.Path & { anclaEtiqueta?: L.LatLngExpression }).anclaEtiqueta = centro;
    }
    // El hover (mouseover/mouseout por-path de Leaflet) no se maneja acá —
    // ver el efecto de mousemove más abajo — porque es susceptible al "hover
    // fantasma" que dispara el navegador cuando el contenido bajo un cursor
    // quieto cambia sin que el mouse se haya movido de verdad (p. ej. justo
    // al hacer clic, o al volver atrás por el breadcrumb): eso podía dejar el
    // panel mostrando una demarcación distinta a la que el cursor señalaba
    // de verdad. El clic, en cambio, siempre es una acción real y deliberada
    // (requiere mousedown+mouseup), así que se queda con su propio listener.
    layer.on({
      click: () => {
        setPanel(props);
        avisarDemarcacion(props);
        drillDown(props);
      },
    });
  }

  function volverANacional() {
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
    // resumen de la provincia (incluye electores del padrón) en vez de
    // limpiar el panel — antes quedaba en blanco hasta que el cursor pasara
    // de nuevo sobre un municipio puntual.
    if (provinciaSeleccionada) {
      const { id, nombre } = provinciaSeleccionada;
      onDemarcacionChange?.({ tipo: "provincia", id, nombre });
      apiFetch<Propiedades>(`/dia-electoral/provincias/${id}?eventoId=${eventoId}`)
        .then((r) => setPanel(r))
        .catch(() => setPanel(null));
    } else {
      setPanel(null);
      onDemarcacionChange?.(null);
    }
  }

  // Hit-test manual compartido: recibe coordenadas de viewport (las mismas
  // que `MouseEvent.clientX/Y`) y resalta + informa la demarcación que haya
  // debajo, si la hay. Se usa tanto en cada `mousemove` real (más abajo)
  // como justo después de un `fitBounds` programático (efecto de `geo` de
  // abajo): al hacer clic para entrar a un nivel nuevo, el mapa se
  // reencuadra bajo un cursor que no se movió, así que sin este segundo
  // disparo el panel y el resaltado quedaban mostrando la demarcación del
  // nivel anterior hasta el siguiente movimiento real del mouse — eso era
  // el "rebote" en el primer clic y el municipio/distrito que no aparecía
  // resaltado al seleccionarlo.
  function evaluarPosicion(x: number, y: number) {
    const el = document.elementFromPoint(x, y);
    const layer = el ? elementLayerRef.current.get(el) : undefined;
    const anterior = resaltadoRef.current;
    if (layer === anterior) return;
    if (anterior) anterior.setStyle({ weight: 1, color: "#94a3b8" });
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

  useEffect(() => {
    if (!geo) return;

    // Reparte el nombre de cada demarcación en varias líneas cortas cuando
    // no cabe en una sola (p. ej. "María Trinidad Sánchez" en 3 renglones)
    // en vez de desbordar el territorio — mismo criterio que el mapa de
    // militantes, pero sin su anti-colisión entre etiquetas vecinas (acá no
    // hace falta: este mapa no tiene tantas demarcaciones chicas y pegadas
    // compitiendo por espacio).
    function actualizarEtiquetas() {
      const map = mapRef.current;
      const layer = geoLayerRef.current;
      if (!map || !layer) return;
      layer.eachLayer((l) => {
        const path = l as L.Path & { feature?: Feature; anclaEtiqueta?: L.LatLngExpression };
        const tooltip = path.getTooltip?.();
        if (!tooltip || !path.feature) return;
        const nombre = (path.feature.properties as Propiedades).nombre;
        const nombreEtiqueta = nombre === "Distrito Nacional" ? "DN" : nombre;
        const ancla = L.latLng(path.anclaEtiqueta ?? tooltip.getLatLng()!);
        const anilloPrincipal = mayorAnillo(path.feature);
        let maxLineaPx = 90;
        if (anilloPrincipal) {
          const disponibleGrados = anchoHorizontalEnPunto(anilloPrincipal, ancla.lng, ancla.lat);
          if (Number.isFinite(disponibleGrados)) {
            const bordeIzq = map.latLngToContainerPoint([ancla.lat, ancla.lng - disponibleGrados / 2]);
            const bordeDer = map.latLngToContainerPoint([ancla.lat, ancla.lng + disponibleGrados / 2]);
            maxLineaPx = Math.max(30, Math.abs(bordeDer.x - bordeIzq.x) * 0.9);
          }
        }
        const lineas = partirEnLineas(nombreEtiqueta, maxLineaPx);
        path.setTooltipContent(lineas.join("<br>"));
        path.openTooltip(ancla);
      });
    }

    const raf = requestAnimationFrame(() => {
      const map = mapRef.current;
      const layer = geoLayerRef.current;
      if (!map || !layer) return;
      const bounds = layer.getBounds();
      if (!bounds.isValid()) return;
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [4, 4], animate: false });
      actualizarEtiquetas();
      // Re-evalúa qué demarcación queda bajo el cursor tras el reencuadre:
      // este `fitBounds` no dispara ningún `mousemove` real, así que sin
      // esto el hit-test manual de abajo no se entera de que la vista
      // cambió (ver comentario de `evaluarPosicion`).
      if (ultimaPosicionRef.current) {
        evaluarPosicion(ultimaPosicionRef.current.x, ultimaPosicionRef.current.y);
      }
    });
    window.addEventListener("resize", actualizarEtiquetas);

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
      window.removeEventListener("resize", actualizarEtiquetas);
    };
  }, [geo]);

  // Detecta la demarcación bajo el cursor a partir de mousemove reales
  // (nunca sintéticos) en vez de los eventos mouseover/mouseout por-path de
  // Leaflet: el navegador dispara un mouseover "fantasma" sobre lo que sea
  // que quede bajo un cursor quieto en cuanto el contenido de abajo cambia
  // sin que el mouse se haya movido de verdad — típicamente justo al hacer
  // clic (mismo mecanismo que usa el mapa de militantes para el mismo
  // problema). Un `mousemove` real, en cambio, solo ocurre cuando el cursor
  // se mueve de verdad, así que basar todo en él elimina esa clase de bug.
  useEffect(() => {
    // El navegador puede disparar mousemove muchas más veces por segundo de
    // las que la pantalla refresca (hasta cientos con mouses de alto
    // polling) — sin limitarlo, cada uno forzaba un hit-test síncrono
    // (`elementFromPoint`, que obliga a recalcular el layout) más un posible
    // setState (React re-renderiza el panel completo). Se agrupa con
    // requestAnimationFrame para procesar como mucho una vez por frame — el
    // último evento manda, no se pierde precisión, pero se evita el trabajo
    // redundante que sentía como demora al mover el cursor por el mapa.
    let frameId: number | null = null;

    function procesarFrame() {
      frameId = null;
      const pos = ultimaPosicionRef.current;
      if (!pos) return;
      evaluarPosicion(pos.x, pos.y);
    }

    function onMouseMove(e: MouseEvent) {
      ultimaPosicionRef.current = { x: e.clientX, y: e.clientY };
      if (frameId == null) frameId = requestAnimationFrame(procesarFrame);
    }

    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, municipioSeleccionado?.id]);

  async function exportarPNG() {
    if (!geo) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    dibujarCanvas(canvas, geo, modoColor);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dia-electoral-${nivel}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const rankingOrdenado = useMemo(() => {
    if (!geo) return [];
    return [...geo.features]
      .map((f) => f.properties as Propiedades)
      .filter((p) => p.id)
      .sort((a, b) => (modoColor === "padron" ? (b.porcentajePadron ?? 0) - (a.porcentajePadron ?? 0) : b.porcentajePropia - a.porcentajePropia));
  }, [geo, modoColor]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-1.5">
          <button onClick={volverANacional} className={`rounded-md px-2 py-1 ${nivel === "nacional" ? "font-semibold text-institucional-800" : "text-gray-500 hover:underline"}`}>
            Nacional
          </button>
          {provinciaSeleccionada && (
            <>
              <span className="text-gray-300">›</span>
              <button onClick={volverAMunicipios} className={`rounded-md px-2 py-1 ${nivel === "municipios" ? "font-semibold text-institucional-800" : "text-gray-500 hover:underline"}`}>
                {provinciaSeleccionada.nombre}
              </button>
            </>
          )}
          {municipioSeleccionado && (
            <>
              <span className="text-gray-300">›</span>
              <span className="font-semibold text-institucional-800">{municipioSeleccionado.nombre}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs ${enVivo ? "text-institucional-600" : "text-gray-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${enVivo ? "bg-institucional-600 animate-pulse" : "bg-gray-300"}`} />
            {enVivo ? "En vivo" : "Reconectando…"}
          </span>
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
            <button onClick={() => setModoColor("propia")} className={`rounded px-2 py-1 ${modoColor === "propia" ? "bg-institucional-700 text-white" : "text-gray-500"}`}>
              % propia base
            </button>
            <button onClick={() => setModoColor("padron")} className={`rounded px-2 py-1 ${modoColor === "padron" ? "bg-institucional-700 text-white" : "text-gray-500"}`}>
              % padrón
            </button>
          </div>
          <button onClick={exportarPNG} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
            Exportar PNG
          </button>
        </div>
      </div>

      <div className={`relative w-full overflow-hidden rounded-xl border border-gray-200 ${aspecto}`}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <span className="text-sm text-gray-400">Cargando…</span>
          </div>
        )}
        <MapContainer
          ref={mapRef}
          center={[18.7357, -70.1627]}
          zoom={8}
          zoomSnap={0.1}
          // El fondo compartido de .leaflet-container es un verde pálido
          // pensado para el mapa de militantes — acá se pisa con un gris muy
          // claro y neutro: con el mapa entero en 0% de participación, el
          // relleno casi blanco terminaba fundiéndose con ese verde y las
          // provincias se veían "sin contorno".
          style={{ height: "100%", width: "100%", background: "#f1f5f9" }}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
        >
          {geo && (
            <GeoJSON
              key={`${nivel}-${provinciaSeleccionada?.id ?? ""}-${municipioSeleccionado?.id ?? ""}`}
              ref={geoLayerRef}
              data={geo}
              style={estiloFeature}
              onEachFeature={onEachFeature}
            />
          )}
        </MapContainer>

        <div className="absolute bottom-2 left-2 z-[1000] rounded-lg bg-white/95 p-2 text-xs shadow">
          <div className="mb-1 font-semibold text-gray-600">{modoColor === "padron" ? "% del padrón electoral" : "% de militantes propios"}</div>
          <div className="flex items-center gap-1">
            {[0, 20, 40, 60, 80].map((v) => (
              <span key={v} className="h-3 w-5" style={{ backgroundColor: colorParticipacion(v, modoColor) }} />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-gray-400">
            <span>0%</span>
            <span>80%+</span>
          </div>
        </div>

        {panel && (
          <div className="absolute right-2 top-2 z-[1000] w-56 rounded-lg bg-white/95 p-3 text-xs shadow">
            <div className="font-semibold text-institucional-900">{panel.nombre}</div>
            <div className="mt-1 text-gray-600">
              {panel.votosConfirmados} de {panel.militantesRegistrados} militantes confirmaron ({panel.porcentajePropia}%)
            </div>
            {panel.porcentajePadron != null && (
              <div className="mt-0.5 text-gray-500">{panel.porcentajePadron}% del padrón electoral ({panel.electores?.toLocaleString("es-DO")} electores)</div>
            )}
            {panel.id && (
            <div className="mt-1.5 border-t border-gray-100 pt-1.5">
              {editandoMeta ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    autoFocus
                    value={metaInput}
                    onChange={(e) => setMetaInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && guardarMeta()}
                    className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                  />
                  <span className="text-gray-400">%</span>
                  <button
                    onClick={guardarMeta}
                    disabled={guardandoMeta}
                    className="rounded bg-institucional-700 px-2 py-0.5 font-semibold text-white disabled:opacity-60"
                  >
                    Guardar
                  </button>
                  <button onClick={() => setEditandoMeta(false)} className="text-gray-400 hover:text-gray-600">
                    ✕
                  </button>
                </div>
              ) : panel.metaObjetivo != null ? (
                <div className="flex items-center justify-between">
                  <span className={panel.porcentajePropia >= panel.metaObjetivo ? "font-semibold text-institucional-700" : "text-amber-600"}>
                    Meta: {panel.metaObjetivo}% {panel.porcentajePropia >= panel.metaObjetivo ? "✓ cumplida" : `(faltan ${Math.round((panel.metaObjetivo - panel.porcentajePropia) * 10) / 10} pts)`}
                  </span>
                  {puedeEditarMeta && (
                    <button
                      onClick={() => {
                        setMetaInput(String(panel.metaObjetivo));
                        setEditandoMeta(true);
                      }}
                      className="ml-1 shrink-0 text-gray-400 hover:text-institucional-700"
                    >
                      editar
                    </button>
                  )}
                </div>
              ) : puedeEditarMeta ? (
                <button
                  onClick={() => {
                    setMetaInput("70");
                    setEditandoMeta(true);
                  }}
                  className="text-institucional-700 hover:underline"
                >
                  + Definir meta
                </button>
              ) : null}
            </div>
            )}
          </div>
        )}
      </div>

      {rankingOrdenado.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-gray-400">Mayor participación</div>
            {rankingOrdenado.slice(0, 5).map((p) => (
              <div key={p.id} className="flex justify-between text-xs text-gray-600">
                <span>{p.nombre}</span>
                <span className="font-semibold">{modoColor === "padron" ? (p.porcentajePadron ?? "—") : p.porcentajePropia}%</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-gray-400">Menor participación</div>
            {rankingOrdenado.slice(-5).reverse().map((p) => (
              <div key={p.id} className="flex justify-between text-xs text-gray-600">
                <span>{p.nombre}</span>
                <span className="font-semibold">{modoColor === "padron" ? (p.porcentajePadron ?? "—") : p.porcentajePropia}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function dibujarCanvas(canvas: HTMLCanvasElement, datos: FeatureCollection, modoColor: "propia" | "padron") {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
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
  const M = 40;
  const factorLng = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const escala = Math.min((W - 2 * M) / ((maxLng - minLng) * factorLng), (H - 2 * M) / (maxLat - minLat));
  const offX = M + (W - 2 * M - (maxLng - minLng) * factorLng * escala) / 2;
  const offY = M + (H - 2 * M - (maxLat - minLat) * escala) / 2;
  const px = (lng: number) => offX + (lng - minLng) * factorLng * escala;
  const py = (lat: number) => offY + (maxLat - lat) * escala;

  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillStyle = "#123f1c";
  ctx.fillText("Día Electoral — Participación", M, 28);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(new Date().toLocaleString("es-DO"), M, 46);

  for (const f of datos.features) {
    const props = f.properties as Propiedades;
    const valor = modoColor === "padron" ? props.porcentajePadron : props.porcentajePropia;
    ctx.fillStyle = colorParticipacion(valor, modoColor);
    ctx.strokeStyle = "#94a3b8";
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
