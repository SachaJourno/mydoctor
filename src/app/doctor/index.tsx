import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text } from "react-native";

import { Banner, Body, Button, Card, colors, ErrorText, Heading, Screen, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

type PatientRow = { patient_id: string; patient: { full_name: string } | null };

export default function DoctorHome() {
  const { profile, signOut } = useAuth();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      supabase
        .from("care_links")
        .select("patient_id, patient:profiles!care_links_patient_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .then(({ data, error: e }) => {
          if (e) setError(e.message);
          else setPatients((data ?? []) as unknown as PatientRow[]);
        });
    }, []),
  );

  async function invite() {
    setBusy(true);
    setError("");
    const { data, error: e } = await supabase.rpc("create_invite");
    setBusy(false);
    if (e) setError(e.message);
    else setCode(data as string);
  }

  return (
    <Screen>
      <Title>Bonjour {profile?.full_name}</Title>
      <Card>
        <Heading>Ajouter un patient</Heading>
        <Body muted>Le patient crée son compte dans MyDoctor, puis saisit ce code. Il est valable 7 jours.</Body>
        {code ? (
          <Text selectable style={{ fontSize: 40, fontWeight: "700", letterSpacing: 8, textAlign: "center", color: colors.primary }}>
            {code}
          </Text>
        ) : null}
        <Button label={code ? "Générer un autre code" : "Générer un code d'invitation"} onPress={invite} loading={busy} />
      </Card>

      <Heading>Mes patients</Heading>
      <ErrorText>{error}</ErrorText>
      {patients.length === 0 ? <Banner tone="info">Aucun patient pour le moment.</Banner> : null}
      {patients.map((p) => (
        <Link key={p.patient_id} href={{ pathname: "/doctor/patient/[id]", params: { id: p.patient_id } }} asChild>
          <Pressable>
            <Card>
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>{p.patient?.full_name || "Patient"}</Text>
            </Card>
          </Pressable>
        </Link>
      ))}

      <Button variant="secondary" label="Se déconnecter" onPress={signOut} />
    </Screen>
  );
}
