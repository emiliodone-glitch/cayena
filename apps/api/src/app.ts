import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.routes";
import { secretariasRouter } from "./routes/secretarias.routes";
import { actividadesRouter } from "./routes/actividades.routes";
import { obrasRouter } from "./routes/obras.routes";
import { militantesRouter } from "./routes/militantes.routes";
import { geoRouter } from "./routes/geo.routes";
import { gastosRouter } from "./routes/gastos.routes";
import { poaRouter } from "./routes/poa.routes";
import { usuariosRouter } from "./routes/usuarios.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { uploadsRouter } from "./routes/uploads.routes";
import { notificacionesRouter } from "./routes/notificaciones.routes";
import { encuestasRouter } from "./routes/encuestas.routes";
import { transparenciaRouter } from "./routes/transparencia.routes";
import { distritosRouter } from "./routes/distritos.routes";
import { localidadesRouter } from "./routes/localidades.routes";
import { recintosRouter } from "./routes/recintos.routes";
import { colegiosRouter } from "./routes/colegios.routes";
import { eventosRouter } from "./routes/eventos.routes";
import { diaElectoralRouter } from "./routes/diaElectoral.routes";
import { UPLOADS_DIR } from "./lib/storage";
import { errorHandler } from "./middleware/errorHandler";

function resolveCorsOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw === "*") return "*";
  return raw.split(",").map((o) => o.trim());
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: resolveCorsOrigin() }));
  app.use(express.json({ limit: "10mb" }));
  app.use("/files", express.static(UPLOADS_DIR));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/secretarias", secretariasRouter);
  app.use("/actividades", actividadesRouter);
  app.use("/obras", obrasRouter);
  app.use("/militantes", militantesRouter);
  app.use("/geo", geoRouter);
  app.use("/gastos", gastosRouter);
  app.use("/poa", poaRouter);
  app.use("/usuarios", usuariosRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/uploads", uploadsRouter);
  app.use("/notificaciones", notificacionesRouter);
  app.use("/encuestas", encuestasRouter);
  app.use("/transparencia", transparenciaRouter);
  app.use("/distritos", distritosRouter);
  app.use("/localidades", localidadesRouter);
  app.use("/recintos", recintosRouter);
  app.use("/colegios", colegiosRouter);
  app.use("/eventos", eventosRouter);
  app.use("/dia-electoral", diaElectoralRouter);

  app.use(errorHandler);

  return app;
}
