import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/api/auth";
import { OfflineProvider } from "@/lib/offlineContext";
import { usePushRegistration } from "@/hooks/usePushRegistration";

export default function RootLayout() {
  usePushRegistration();

  return (
    <AuthProvider>
      <OfflineProvider>
        <StatusBar style="light" backgroundColor="#1f7a34" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: "#1f7a34" }, headerTintColor: "#fff" }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="obra/[id]" options={{ title: "Detalle de obra" }} />
          <Stack.Screen name="actividad/[id]" options={{ title: "Detalle de actividad" }} />
        </Stack>
      </OfflineProvider>
    </AuthProvider>
  );
}
