import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/api/auth";
import { apiFetch } from "@/api/client";

type Panel = {
  militantesTotales: number;
  porcentajeNacional: number;
  obrasRegistradas: number;
  actividadesRecientes: { id: string; titulo: string; ubicacion: string | null }[];
};

export default function PanelDirigenciaScreen() {
  const { user } = useAuth();
  const [panel, setPanel] = useState<Panel | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch<Panel>("/dashboard/panel-dirigencia").then(setPanel);
  }, [user]);

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.mensaje}>Inicia sesión desde la pestaña Perfil para ver el panel de dirigencia.</Text>
      </View>
    );
  }

  if (!panel) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#f9fafb" }} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.header}>Panel Dirigencia</Text>

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValor}>{panel.militantesTotales.toLocaleString("es-DO")}</Text>
          <Text style={styles.kpiLabel}>militantes totales</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValor}>{panel.porcentajeNacional}%</Text>
          <Text style={styles.kpiLabel}>avance meta nacional</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValor}>{panel.obrasRegistradas}</Text>
          <Text style={styles.kpiLabel}>obras registradas</Text>
        </View>
      </View>

      <Text style={styles.seccion}>Actividad reciente</Text>
      {panel.actividadesRecientes.map((a) => (
        <View key={a.id} style={styles.actividadRow}>
          <Text style={styles.actividadTitulo}>{a.titulo}</Text>
          {a.ubicacion && <Text style={styles.actividadMeta}>{a.ubicacion}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  mensaje: { textAlign: "center", color: "#6b7280" },
  header: { fontSize: 20, fontWeight: "700", color: "#123f1c", marginBottom: 16 },
  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: { flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, alignItems: "center" },
  kpiValor: { fontSize: 18, fontWeight: "700", color: "#123f1c" },
  kpiLabel: { fontSize: 11, color: "#6b7280", marginTop: 4, textAlign: "center" },
  seccion: { marginTop: 24, marginBottom: 8, fontSize: 13, fontWeight: "700", color: "#374151", textTransform: "uppercase" },
  actividadRow: { backgroundColor: "white", borderRadius: 10, padding: 12, marginBottom: 8 },
  actividadTitulo: { fontSize: 14, fontWeight: "600", color: "#123f1c" },
  actividadMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
});
