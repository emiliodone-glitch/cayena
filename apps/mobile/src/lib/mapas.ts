import { Linking, Platform } from "react-native";

// Abre la app de mapas nativa del teléfono con direcciones hacia un punto —
// usado tanto en el detalle de actividades como en el de obras.
export function abrirComoLlegar(lat: number, lng: number, etiqueta: string) {
  const url = Platform.select({
    ios: `maps:0,0?q=${etiqueta}@${lat},${lng}`,
    android: `geo:0,0?q=${lat},${lng}(${etiqueta})`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  });
  Linking.openURL(url!).catch(() => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  });
}
