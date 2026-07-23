import type { Feature, Polygon, MultiPolygon } from "geojson";

// Utilidades geométricas compartidas por los mapas de choropleth (militantes
// y Día Electoral) para ubicar correctamente el rótulo con el nombre de cada
// demarcación — Leaflet, por defecto, centra el tooltip con el centroide de
// TODOS los anillos de la geometría (islas incluidas) tratados como un solo
// polígono con huecos, lo que puede dejar el nombre flotando sobre una isla
// separada del territorio principal (Pedernales, La Altagracia) o en el mar
// entre ambas partes. Acá se calcula, en cambio, el punto más "adentro" del
// anillo de mayor área (ver puntoMasInterior/centroideMayorAnillo).

// Canvas reutilizado (nunca se agrega al DOM) solo para medir el ancho en
// píxeles que ocupará un texto con la misma tipografía de .etiqueta-mapa —
// necesario para partir nombres largos en varias líneas y detectar cuánto
// espacio ocupa cada rótulo.
let contextoMedicion: CanvasRenderingContext2D | null | undefined;
export function medirTexto(texto: string): number {
  if (contextoMedicion === undefined) {
    contextoMedicion = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    if (contextoMedicion) contextoMedicion.font = "600 11px system-ui, sans-serif";
  }
  return contextoMedicion?.measureText(texto).width ?? texto.length * 7;
}

// Reparte un nombre en varias líneas cortas cuando no cabe en una sola —
// igual que en los mapas ilustrados de referencia, donde "María Trinidad
// Sánchez" se ve en 3 renglones centrados en vez de desbordar el territorio.
// Greedy: va sumando palabras a la línea actual mientras quepan en el ancho
// disponible; si una sola palabra ya excede ese ancho, se deja igual (no se
// parte a la mitad de una palabra).
export function partirEnLineas(texto: string, anchoMaxPx: number): string[] {
  const palabras = texto.split(" ").filter(Boolean);
  if (palabras.length === 0) return [texto];
  const lineas: string[] = [];
  let actual = palabras[0];
  for (let i = 1; i < palabras.length; i++) {
    const candidata = `${actual} ${palabras[i]}`;
    if (medirTexto(candidata) <= anchoMaxPx) {
      actual = candidata;
    } else {
      lineas.push(actual);
      actual = palabras[i];
    }
  }
  lineas.push(actual);
  return lineas;
}

// Aplana Polygon/MultiPolygon a su lista de anillos (coordenadas [lng, lat]).
export function anillosDe(f: Feature): number[][][] {
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

export function dentroDelAnillo(x: number, y: number, anillo: number[][]): boolean {
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

export function distanciaAlBorde(x: number, y: number, anillo: number[][]): number {
  let min = Infinity;
  for (let i = 0; i < anillo.length - 1; i++) {
    const [x1, y1] = anillo[i];
    const [x2, y2] = anillo[i + 1];
    const d = distanciaPuntoASegmento(x, y, x1, y1, x2, y2);
    if (d < min) min = d;
  }
  return min;
}

// Ancho real del territorio, medido en línea recta horizontal a la altura Y
// del punto dado (ray casting: se buscan los dos cruces del anillo que
// encierran a X). Se usa para decidir cuántas palabras entran por renglón al
// partir el nombre en varias líneas.
export function anchoHorizontalEnPunto(anillo: number[][], x: number, y: number): number {
  const cruces: number[] = [];
  for (let i = 0, j = anillo.length - 2; i < anillo.length - 1; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y) {
      cruces.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
  }
  cruces.sort((a, b) => a - b);
  for (let i = 0; i < cruces.length - 1; i++) {
    if (x >= cruces[i] && x <= cruces[i + 1]) return cruces[i + 1] - cruces[i];
  }
  return Infinity;
}

// El centroide de área de un anillo puede caer fuera del territorio (o en
// una parte angosta/una bahía) cuando la forma es alargada o cóncava — que
// es justo el caso de varias provincias de RD con penínsulas finas. En vez
// de eso, se busca por cuadrícula el punto que está DENTRO del anillo y más
// alejado de cualquier borde (una versión simple de "polo de inaccesibilidad"),
// que es donde de verdad cabe cómodamente el nombre de la demarcación.
function buscarMejorEnCuadricula(
  anillo: number[][],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  pasos: number,
): { punto: [number, number] | null; dist: number } {
  let mejor: [number, number] | null = null;
  let mejorDist = -Infinity;
  for (let i = 0; i <= pasos; i++) {
    const x = minX + ((maxX - minX) * i) / pasos;
    for (let j = 0; j <= pasos; j++) {
      const y = minY + ((maxY - minY) * j) / pasos;
      if (!dentroDelAnillo(x, y, anillo)) continue;
      const d = distanciaAlBorde(x, y, anillo);
      if (d > mejorDist) {
        mejorDist = d;
        mejor = [x, y];
      }
    }
  }
  return { punto: mejor, dist: mejorDist };
}

function buscarPoloDeInaccesibilidad(anillo: number[][]): { punto: [number, number] | null; dist: number } {
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
  // Primera pasada: cuadrícula gruesa sobre toda la forma (rápida).
  const gruesa = buscarMejorEnCuadricula(anillo, minX, maxX, minY, maxY, 28);
  if (!gruesa.punto) return gruesa;
  // Segunda pasada: cuadrícula fina alrededor del mejor punto de la
  // primera, acotada a una celda gruesa de radio — mucho más precisa que
  // agrandar la cuadrícula gruesa entera (que sería O(n²) mucho más cara).
  const [gx, gy] = gruesa.punto;
  const radioX = (maxX - minX) / 28;
  const radioY = (maxY - minY) / 28;
  const fina = buscarMejorEnCuadricula(anillo, gx - radioX, gx + radioX, gy - radioY, gy + radioY, 20);
  return fina.punto && fina.dist >= gruesa.dist ? fina : gruesa;
}

function puntoMasInterior(anillo: number[][]): [number, number] {
  const polo = buscarPoloDeInaccesibilidad(anillo);
  if (!polo.punto) {
    // Respaldo si la cuadrícula no cayó ningún punto adentro (forma muy
    // fina): el centroide de área, aunque no sea perfecto, sigue siendo razonable.
    return centroideAnillo(anillo);
  }
  // El punto más "adentro" del polígono resuelve bien las provincias
  // angostas/cóncavas, pero para la mayoría de provincias de forma
  // razonablemente convexa termina más descentrado a la vista que el simple
  // centroide de área. Por eso se prefiere el centroide siempre que quede
  // adentro del polígono Y esté casi tan lejos del borde como el punto de
  // cuadrícula (≥55% de esa distancia): ahí el centroide es una posición
  // igual de segura pero se ve mejor centrado.
  const centroide = centroideAnillo(anillo);
  if (dentroDelAnillo(centroide[0], centroide[1], anillo)) {
    const centroideDist = distanciaAlBorde(centroide[0], centroide[1], anillo);
    if (centroideDist >= polo.dist * 0.55) return centroide;
  }
  return polo.punto ?? centroide;
}

// Búsqueda en cuadrícula del punto, dentro del polígono, más cercano a un
// objetivo dado (el centroide) que aun así mantenga una distancia mínima al
// borde — un punto "sesgado hacia el centroide pero seguro", intermedio
// entre el centroide puro y el polo de inaccesibilidad.
function puntoSesgadoHaciaCentroide(
  anillo: number[][],
  objetivo: [number, number],
  distMinima: number,
  cotas: { minX: number; maxX: number; minY: number; maxY: number },
  pasos: number,
): [number, number] | null {
  let mejor: [number, number] | null = null;
  let mejorDist = Infinity;
  for (let i = 0; i <= pasos; i++) {
    const x = cotas.minX + ((cotas.maxX - cotas.minX) * i) / pasos;
    for (let j = 0; j <= pasos; j++) {
      const y = cotas.minY + ((cotas.maxY - cotas.minY) * j) / pasos;
      if (!dentroDelAnillo(x, y, anillo)) continue;
      if (distanciaAlBorde(x, y, anillo) < distMinima) continue;
      const d = Math.hypot(x - objetivo[0], y - objetivo[1]);
      if (d < mejorDist) {
        mejorDist = d;
        mejor = [x, y];
      }
    }
  }
  return mejor;
}

// Ajustes puntuales por nombre de demarcación — casos donde la regla general
// de puntoMasInterior no da el resultado deseado a la vista, pero corregir la
// regla general movería el ancla de TODAS las demás demarcaciones. Se
// mantiene esta lista corta y explícita a propósito, para no repetir ese
// efecto colateral.
function anclaAjustadaPorNombre(nombre: string | undefined, anillo: number[][]): [number, number] | null {
  if (nombre === "San Cristóbal") {
    const polo = buscarPoloDeInaccesibilidad(anillo);
    return polo.punto;
  }
  if (nombre === "Elías Piña") {
    const polo = buscarPoloDeInaccesibilidad(anillo);
    if (!polo.punto) return null;
    const centroide = centroideAnillo(anillo);
    const margen = 0.02;
    const cotas = {
      minX: Math.min(centroide[0], polo.punto[0]) - margen,
      maxX: Math.max(centroide[0], polo.punto[0]) + margen,
      minY: Math.min(centroide[1], polo.punto[1]) - margen,
      maxY: Math.max(centroide[1], polo.punto[1]) + margen,
    };
    const intermedio = puntoSesgadoHaciaCentroide(anillo, centroide, polo.dist * 0.6, cotas, 60);
    return intermedio ?? polo.punto;
  }
  return null;
}

// El anillo de mayor área (el territorio principal), descartando islas o
// cayos separados.
export function mayorAnillo(f: Feature): number[][] | null {
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

// Punto [lat, lng] donde debe anclarse el rótulo de una demarcación: el
// punto más "adentro" del anillo de mayor área (nunca el centroide ingenuo
// de todos los anillos, que puede caer sobre una isla o en el mar).
export function centroideMayorAnillo(f: Feature): [number, number] | null {
  const anillo = mayorAnillo(f);
  if (!anillo) return null;
  const nombre = (f.properties as { nombre?: string } | undefined)?.nombre;
  const ajustado = anclaAjustadaPorNombre(nombre, anillo);
  const [lng, lat] = ajustado ?? puntoMasInterior(anillo);
  return [lat, lng];
}
