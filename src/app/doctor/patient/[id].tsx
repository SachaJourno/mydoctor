import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Banner, Body, Button, Card, colors, ErrorText, Heading, Screen, Title } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import type { CarePlan } from "../../../lib/types";

export default function DoctorPatient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [adherence, setAdherence] = useState<{ taken: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      supabase.from("profiles").select("full_name").eq("id", id).single().then(({ data }) => setName(data?.full_name ?? ""));
      supabase
        .from("care_plans")
        .select("*")
        .eq("patient_id", id)
        .order("created_at", { ascending: false })
        .then(({ data, error: e }) => {
          if (e) setError(e.message);
          else setPlans((data ?? []) as CarePlan[]);
        });
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      supabase
        .from("dose_logs")
        .select("status")
        .eq("patient_id", id)
        .gte("scheduled_for", since)
        .then(({ data }) => {
          const rows = data ?? [];
          setAdherence({
            taken: rows.filter((r) => r.status === "taken").length,
            skipped: rows.filter((r) => r.status === "skipped").length,
          });
        });
    }, [id]),
  );

  async function newPlan() {
    if (!profile) return;
    setBusy(true);
    const { data, error: e } = await supabase
      .from("care_plans")
      .insert({ doctor_id: profile.id, patient_id: id })
      .select("id")
      .single();
    setBusy(false);
    if (e || !data) setError(e?.message ?? "Création impossible");
    else router.push({ pathname: "/doctor/plan/[id]", params: { id: data.id } });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: name || "Patient" }} />
      <Title>{name}</Title>
      {adherence ? (
        <Body muted>
          7 derniers jours : {adherence.taken} prise{adherence.taken > 1 ? "s" : ""} cochée{adherence.taken > 1 ? "s" : ""},{" "}
          {adherence.skipped} sautée{adherence.skipped > 1 ? "s" : ""}.
        </Body>
      ) : null}
      <Button label="Nouvelle consultation" onPress={newPlan} loading={busy} />
      <ErrorText>{error}</ErrorText>

      <Heading>Consultations</Heading>
      {plans.length === 0 ? <Banner tone="info">Aucune consultation pour ce patient.</Banner> : null}
      {plans.map((plan) => (
        <Link key={plan.id} href={{ pathname: "/doctor/plan/[id]", params: { id: plan.id } }} asChild>
          <Pressable>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>{plan.title}</Text>
                <Text style={{ color: plan.status === "sent" ? colors.success : colors.warning, fontWeight: "600" }}>
                  {plan.status === "sent" ? "Envoyé" : "Brouillon"}
                </Text>
              </View>
              <Body muted>{new Date(plan.sent_at ?? plan.created_at).toLocaleDateString("fr-FR")}</Body>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
