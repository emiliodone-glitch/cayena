import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "@/api/auth";

function TabIcon({ symbol }: { symbol: string }) {
  return <Text style={{ fontSize: 18 }}>{symbol}</Text>;
}

export default function TabsLayout() {
  const { user } = useAuth();
  const esDirigencia = user?.role === "DIRIGENCIA" || user?.role === "SUPERADMIN";
  // Cualquier rol de staff (no un simple MILITANTE autorregistrado) puede
  // ser coordinador de zona y necesita consultar su territorio desde el
  // teléfono, no solo desde el back office web.
  const esStaff = !!user && user.role !== "MILITANTE";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#1f7a34",
        headerStyle: { backgroundColor: "#1f7a34" },
        headerTintColor: "#fff",
      }}
    >
      <Tabs.Screen
        name="mapa"
        options={{ title: "Mapa", tabBarIcon: () => <TabIcon symbol="🗺" /> }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: "Feed", tabBarIcon: () => <TabIcon symbol="📰" /> }}
      />
      <Tabs.Screen
        name="mapa-militantes"
        options={{
          title: "Mi Zona",
          tabBarIcon: () => <TabIcon symbol="📍" />,
          href: esStaff ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="unirme"
        options={{
          title: "Unirme",
          tabBarIcon: () => <TabIcon symbol="➕" />,
          href: esDirigencia ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="panel"
        options={{
          title: "Panel",
          tabBarIcon: () => <TabIcon symbol="📊" />,
          href: esDirigencia ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: "Perfil", tabBarIcon: () => <TabIcon symbol="👤" /> }}
      />
    </Tabs>
  );
}
