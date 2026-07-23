import { Router } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { busEventos } from "../lib/eventos";

export const eventosRouter = Router();

const INTERVALO_LATIDO_MS = 25_000;

// GET /eventos/stream — refresco en vivo del mapa vía Server-Sent Events.
// EventSource (la API nativa del navegador para SSE) no permite enviar
// encabezados personalizados, así que este endpoint no puede usar el
// middleware requireAuth normal (que exige "Authorization: Bearer ..."): el
// token viaja como query param en su lugar, igual que hacen otros servicios
// con SSE/websockets. No expone datos — solo dispara "algo cambió, refresca"
// para que el cliente vuelva a pedir /geo/... con sus propios permisos.
eventosRouter.get("/stream", (req, res) => {
  const token = (req.query.token as string | undefined) ?? "";
  try {
    verifyAccessToken(token);
  } catch {
    res.status(401).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // por si algún proxy intermedio hace buffering
  });
  res.write("retry: 5000\n\n");

  function onCambio() {
    res.write("event: cambio-militantes\ndata: {}\n\n");
  }
  busEventos.on("cambio-militantes", onCambio);

  function onCambioVotos() {
    res.write("event: cambio-votos\ndata: {}\n\n");
  }
  busEventos.on("cambio-votos", onCambioVotos);

  // Late routers/proxies (incluido el de Railway) suelen cerrar conexiones
  // inactivas — un comentario periódico (ignorado por EventSource) las
  // mantiene vivas sin disparar el listener onmessage del cliente.
  const latido = setInterval(() => res.write(": ping\n\n"), INTERVALO_LATIDO_MS);

  req.on("close", () => {
    clearInterval(latido);
    busEventos.off("cambio-militantes", onCambio);
    busEventos.off("cambio-votos", onCambioVotos);
  });
});
