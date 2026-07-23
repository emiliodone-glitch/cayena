import { EventEmitter } from "events";

// Bus de eventos en proceso para el refresco en vivo del mapa: cuando se
// registra o importa un militante en cualquier sesión, cualquier navegador
// con el mapa abierto (viendo /geo/militantes-puntos, /geo/provincias, etc.)
// recibe un aviso por Server-Sent Events y refresca sus datos solo, sin
// necesidad de recargar la página ni de un polling agresivo.
//
// Supuesto de una sola instancia: este emisor vive en la memoria del proceso
// Node, igual que el job periódico de lib/alertas.ts — si la API llegara a
// correr en más de una instancia (escalado horizontal), un cliente conectado
// a la instancia B no se enteraría de un cambio ocurrido en la instancia A.
// Aceptable mientras la API corra en una sola instancia (como hoy en
// Railway); si eso cambia, este bus tendría que moverse a algo compartido
// (Redis pub/sub, por ejemplo).
export const busEventos = new EventEmitter();
busEventos.setMaxListeners(0); // muchas pestañas de mapa abiertas a la vez son normales

export function emitirCambioMilitantes() {
  busEventos.emit("cambio-militantes");
}

// Mismo bus/canal SSE, evento distinto: Día Electoral refresca su propio
// mapa de participación sin abrir una conexión nueva.
export function emitirCambioVotos() {
  busEventos.emit("cambio-votos");
}
