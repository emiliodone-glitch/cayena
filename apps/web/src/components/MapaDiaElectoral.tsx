"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, GeoJSON } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import * as L from "leaflet";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { apiFetch, API_URL, getAccessToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Propiedades = {
  id: string | null;
  nombre: string;
  militantesRegistrados: number;
  votosConfirmados: number;
  porcentajePropia: number;
  electores?: number | null;
  porcentajePadron?: number | null;
  provinciaId?: string;
  esCabecera?: boolean;
};

export type DemarcacionElectoral =
  | { tipo: "provincia"; id: string; nombre: string }
  | { tipo: "municipio"; id: string; nombre: string }
  | { tipo: "distrito"; id: string; nombre: string };

const COLOR_SIN_DATO = "#e2e8f0";

// Escala verde institucional (color del partido), de claro a oscuro según el
// porcentaje. "Sin dato" se mantiene gris neutro — nunca verde — para no
// confundirse con "0% ya reportado". Es una gradación continua de 6 pasos
// (no 3 colores discretos como el semáforo rojo/amarillo/verde del mapa de
// militantes), así que aunque comparte familia de color con ese semáforo el
// significado no choca: acá el tono siempre es progresión de participación,
// nunca un estado puntual de "meta cumplida".
function colorParticipacion(p: number | null | undefined): string {
  if (p == null) return COLOR_SIN_DATO;
  if (p >= 80) return "#164f22";
  if (p >= 60) return "#1f7a34";
  if (p >= 40) return "#4cae5c";
  if (p >= 20) return "#6ec488";
  if (p > 0) return "#a8e0b6";
  return "#d6f5dd";
}

function anillosDe(f: Feature): number[][][] {
  const g = f.geometry as Polygon | MultiPolygon;
  if (g.type === "Polygon") return g.coordinates as number[][][];
  return (g.coordinates as number[][][][]).flat();
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

  const mapRef = useRef<LeafletMap | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);

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
  }, [nivel, provinciaSeleccionada?.id, municipioSeleccionado?.id, eventoId, refreshVivo]);

  // Refresco en vivo: mismo canal SSE que el mapa de militantes, evento
  // "cambio-votos" en vez de "cambio-militantes".
  useEffect(() => {
    let cerrado = false;
    let fuente: EventSource | null = null;
    let reintentoTimer: ReturnType<typeof setTimeout> | null = null;
    let intentos = 0;

    function conectar() {
      if (cerrado) return;
      const token = getAccessToken();
      if (!token) return;
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

  function estiloFeature(feature?: Feature) {
    const props = feature?.properties as Propiedades | undefined;
    const valor = modoColor === "padron" ? props?.porcentajePadron : props?.porcentajePropia;
    // Borde gris medio (no blanco): con 0% de participación en casi todo el
    // mapa, el relleno queda casi tan pálido como el fondo — un borde blanco
    // ahí desaparecía por completo y las demarcaciones se veían "pegadas".
    return { fillColor: colorParticipacion(valor), fillOpacity: 0.85, color: "#94a3b8", weight: 1 };
  }

  useEffect(() => {
    geoLayerRef.current?.setStyle(estiloFeature);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoColor]);

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
    layer.on({
      mouseover: (e) => {
        (e.target as L.Path).setStyle({ weight: 3, color: "#123f1c" });
        setPanel(props);
        avisarDemarcacion(props);
      },
      mouseout: (e) => (e.target as L.Path).setStyle({ weight: 1, color: "#94a3b8" }),
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
    setPanel(null);
    if (provinciaSeleccionada) onDemarcacionChange?.({ tipo: "provincia", id: provinciaSeleccionada.id, nombre: provinciaSeleccionada.nombre });
  }

  useEffect(() => {
    if (!geo) return;
    const raf = requestAnimationFrame(() => {
      const map = mapRef.current;
      const layer = geoLayerRef.current;
      if (!map || !layer) return;
      const bounds = layer.getBounds();
      if (!bounds.isValid()) return;
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [4, 4], animate: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [geo]);

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
              <span key={v} className="h-3 w-5" style={{ backgroundColor: colorParticipacion(v) }} />
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
    ctx.fillStyle = colorParticipacion(valor);
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
