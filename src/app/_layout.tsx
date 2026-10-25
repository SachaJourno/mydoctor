import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { colors } from "../components/ui";
import { AuthProvider } from "../lib/auth";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerBackTitle: "Retour",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "MyDoctor" }} />
        <Stack.Screen name="doctor/index" options={{ title: "Mes patients" }} />
        <Stack.Screen name="doctor/patient/[id]" options={{ title: "Patient" }} />
        <Stack.Screen name="doctor/plan/[id]" options={{ title: "Consultation" }} />
        <Stack.Screen name="patient/index" options={{ title: "Aujourd'hui" }} />
        <Stack.Screen name="patient/chat" options={{ title: "Questions sur mon traitement" }} />
        <Stack.Screen name="patient/join" options={{ title: "Rejoindre mon médecin" }} />
      </Stack>
    </AuthProvider>
  );
}
