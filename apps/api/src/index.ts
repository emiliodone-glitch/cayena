import "dotenv/config";
import { createApp } from "./app";
import { iniciarVerificacionPeriodica } from "./lib/alertas";
import { iniciarRecordatorioActividades } from "./lib/recordatorios";
import { iniciarVerificacionVotacion } from "./lib/alertasVotacion";
import { iniciarRecordatorioVoto } from "./lib/recordatorioVoto";
import { iniciarVerificacionReconocimientos } from "./lib/reconocimientos";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`Cayena API escuchando en http://localhost:${port}`);
  iniciarVerificacionPeriodica();
  iniciarRecordatorioActividades();
  iniciarVerificacionVotacion();
  iniciarRecordatorioVoto();
  iniciarVerificacionReconocimientos();
});
