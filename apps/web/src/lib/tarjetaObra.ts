import { resolveFileUrl } from "@/lib/api";

type ObraParaTarjeta = {
  titulo: string;
  categoria: string;
  resena: string;
  provincia: { nombre: string };
  municipio: { nombre: string };
  inversion: number | string | null;
  fotos: string[];
};

const ANCHO = 1080;
const ALTO = 1350;
const ALTO_FOTO = 720;

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Envuelve texto en varias líneas dentro de un ancho máximo — el Canvas 2D
// no hace word-wrap solo, hay que medir y cortar a mano.
function envolverTexto(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number, maxLineas: number): string[] {
  const palabras = texto.split(/\s+/);
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxAncho && actual) {
      lineas.push(actual);
      actual = palabra;
      if (lineas.length === maxLineas - 1) break;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length === maxLineas && palabras.join(" ") !== lineas.join(" ")) {
    lineas[lineas.length - 1] = lineas[lineas.length - 1].replace(/\s*\S*$/, "…");
  }
  return lineas;
}

// Genera una tarjeta lista para compartir en redes (foto + título + ubicación
// + inversión) a partir de los datos ya cargados de la obra — todo del lado
// del cliente, sin backend nuevo (mismo patrón que la exportación de PDF de
// informes de secretarías).
export async function generarTarjetaObra(obra: ObraParaTarjeta): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el lienzo");

  // Fondo de la foto (o un verde institucional liso si no hay ninguna)
  if (obra.fotos[0]) {
    try {
      const img = await cargarImagen(resolveFileUrl(obra.fotos[0]));
      const escala = Math.max(ANCHO / img.width, ALTO_FOTO / img.height);
      const w = img.width * escala;
      const h = img.height * escala;
      ctx.drawImage(img, (ANCHO - w) / 2, (ALTO_FOTO - h) / 2, w, h);
    } catch {
      ctx.fillStyle = "#1f7a34";
      ctx.fillRect(0, 0, ANCHO, ALTO_FOTO);
    }
  } else {
    ctx.fillStyle = "#1f7a34";
    ctx.fillRect(0, 0, ANCHO, ALTO_FOTO);
  }

  // Degradado oscuro arriba (legibilidad del wordmark) y abajo de la foto (transición al panel)
  const degradadoArriba = ctx.createLinearGradient(0, 0, 0, 160);
  degradadoArriba.addColorStop(0, "rgba(0,0,0,0.55)");
  degradadoArriba.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = degradadoArriba;
  ctx.fillRect(0, 0, ANCHO, 160);

  const degradadoAbajo = ctx.createLinearGradient(0, ALTO_FOTO - 140, 0, ALTO_FOTO);
  degradadoAbajo.addColorStop(0, "rgba(0,0,0,0)");
  degradadoAbajo.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = degradadoAbajo;
  ctx.fillRect(0, ALTO_FOTO - 140, ANCHO, 140);

  // Wordmark del partido
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText("● Fuerza del Pueblo", 48, 80);

  // Panel inferior
  ctx.fillStyle = "#123f1c";
  ctx.fillRect(0, ALTO_FOTO, ANCHO, ALTO - ALTO_FOTO);

  let y = ALTO_FOTO + 70;

  // Badge de categoría
  const categoriaTexto = obra.categoria.replace("_", " ");
  ctx.font = "700 26px system-ui, sans-serif";
  const badgeAncho = ctx.measureText(categoriaTexto).width + 48;
  ctx.fillStyle = "#2f9e52";
  ctx.beginPath();
  ctx.roundRect(48, y - 40, badgeAncho, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(categoriaTexto, 72, y - 4);
  y += 70;

  // Título (hasta 3 líneas)
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  const lineasTitulo = envolverTexto(ctx, obra.titulo, ANCHO - 96, 3);
  for (const linea of lineasTitulo) {
    ctx.fillText(linea, 48, y);
    y += 64;
  }
  y += 16;

  // Ubicación
  ctx.font = "500 32px system-ui, sans-serif";
  ctx.fillStyle = "#d6f5dd";
  ctx.fillText(`📍 ${obra.municipio.nombre}, ${obra.provincia.nombre}`, 48, y);
  y += 56;

  // Inversión (si se cargó)
  const inversionNum = obra.inversion != null ? Number(obra.inversion) : null;
  if (inversionNum && inversionNum > 0) {
    ctx.font = "700 36px system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`Inversión: ${fmtMoney.format(inversionNum)}`, 48, y);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png");
  });
}

export function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
