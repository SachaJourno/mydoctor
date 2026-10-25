import { Redirect } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Banner, Body, Button, Card, colors, ErrorText, Field, Screen, Title } from "../components/ui";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/types";

export default function Login() {
  const { session, profile, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<Role>("patient");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  if (session && profile) return <Redirect href="/" />;

  async function submit() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        if (!fullName.trim()) throw new Error("Indiquez votre nom");
        await signUp(email.trim(), password, fullName.trim(), role);
        setInfo("Compte créé. Si un e-mail de confirmation vous a été envoyé, validez-le puis connectez-vous.");
        setMode("signin");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>{mode === "signin" ? "Connexion" : "Créer un compte"}</Title>
      <Body muted>
        MyDoctor transforme les instructions de votre médecin en un plan simple à suivre, avec des rappels.
      </Body>
      {info ? <Banner tone="info">{info}</Banner> : null}
      <Card>
        {mode === "signup" ? (
          <>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted }}>Je suis</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["patient", "doctor"] as Role[]).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: role === r ? colors.primary : colors.border,
                    backgroundColor: role === r ? colors.primarySoft : colors.surface,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: colors.text }}>{r === "patient" ? "Patient" : "Médecin"}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Nom complet" value={fullName} onChangeText={setFullName} autoComplete="name" />
          </>
        ) : null}
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        <ErrorText>{error}</ErrorText>
        <Button label={mode === "signin" ? "Se connecter" : "Créer mon compte"} onPress={submit} loading={busy} />
      </Card>
      <Button
        variant="secondary"
        label={mode === "signin" ? "Pas encore de compte ? S'inscrire" : "J'ai déjà un compte"}
        onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
      />
    </Screen>
  );
}
