import { router } from "expo-router";
import { useState } from "react";

import { Body, Button, Card, ErrorText, Field, Screen, Title } from "../../components/ui";
import { supabase } from "../../lib/supabase";

export default function JoinDoctor() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("redeem_invite", { p_code: code.trim() });
    setBusy(false);
    if (e) setError(e.message);
    else router.back();
  }

  return (
    <Screen>
      <Title>Rejoindre mon médecin</Title>
      <Body muted>Votre médecin vous donne un code à 6 chiffres. Une fois relié, vous recevrez les plans qu'il vous envoie.</Body>
      <Card>
        <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="123456" />
        <ErrorText>{error}</ErrorText>
        <Button label="Valider" onPress={join} loading={busy} disabled={code.trim().length !== 6} />
      </Card>
    </Screen>
  );
}
