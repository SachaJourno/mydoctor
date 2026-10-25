import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";

import { Banner, Body, Button, Card, colors, ErrorText, Field, Heading, Loading, Screen } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { uploadPrescription } from "../../../lib/files";
import { callFunction, supabase } from "../../../lib/supabase";
import { type CarePlan, type Medication, type Task, TASK_LABELS, type TaskKind } from "../../../lib/types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: TaskKind[] = ["pharmacy", "appointment", "exam", "other"];

// Formulaires : les nombres, heures et listes sont édités en texte puis convertis à l'enregistrement.
type MedForm = Omit<Medication, "quantity_per_intake" | "times" | "end_date"> & {
  quantity: string;
  timesText: string;
  endDate: string;
};
type TaskForm = Omit<Task, "due_date"> & { dueDate: string };

let tempId = 0;
const newId = () => `new-${++tempId}`;
const isNew = (id: string) => id.startsWith("new-");

function toMedForm(m: Medication): MedForm {
  return {
    ...m,
    quantity: m.quantity_per_intake === null ? "" : String(m.quantity_per_intake).replace(".", ","),
    timesText: m.times.join(", "),
    endDate: m.end_date ?? "",
  };
}

function toTaskForm(t: Task): TaskForm {
  return { ...t, dueDate: t.due_date ?? "" };
}

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert("Confirmation", message, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      { text: "Confirmer", onPress: () => resolve(true) },
    ]),
  );
}

export default function PlanEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [plan, setPlan] = useState<CarePlan | null>(null);
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [meds, setMeds] = useState<MedForm[]>([]);
  const [tasks, setTasks] = useState<TaskForm[]>([]);
  const [removedMeds, setRemovedMeds] = useState<string[]>([]);
  const [removedTasks, setRemovedTasks] = useState<string[]>([]);
  const [advice, setAdvice] = useState("");
  const [busy, setBusy] = useState<"" | "upload" | "extract" | "save" | "send">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [{ data: p }, { data: m }, { data: t }] = await Promise.all([
      supabase.from("care_plans").select("*").eq("id", id).single(),
      supabase.from("medications").select("*").eq("plan_id", id).order("created_at"),
      supabase.from("tasks").select("*").eq("plan_id", id).order("created_at"),
    ]);
    if (!p) {
      setError("Consultation introuvable");
      return;
    }
    const loaded = p as CarePlan;
    setPlan(loaded);
    setTitle(loaded.title);
    setSourceText(loaded.source_text);
    setFiles(loaded.source_files);
    setAdvice(loaded.advice.join("\n"));
    setMeds(((m ?? []) as Medication[]).map(toMedForm));
    setTasks(((t ?? []) as Task[]).map(toTaskForm));
    setRemovedMeds([]);
    setRemovedTasks([]);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!plan || !profile) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const sent = plan.status === "sent";
  const warnings = plan.extraction?.warnings ?? [];

  async function saveSources(nextFiles = files) {
    const { error: e } = await supabase
      .from("care_plans")
      .update({ title: title.trim() || "Consultation", source_text: sourceText, source_files: nextFiles })
      .eq("id", id);
    if (e) throw e;
  }

  async function addFile(uri: string, mimeType: string, name: string) {
    setBusy("upload");
    setError("");
    try {
      const path = await uploadPrescription(profile!.id, id, uri, mimeType, name);
      const next = [...files, path];
      setFiles(next);
      await saveSources(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi du fichier impossible");
    } finally {
      setBusy("");
    }
  }

  async function takePhoto(fromCamera: boolean) {
    if (fromCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError("L'accès à l'appareil photo est refusé.");
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    await addFile(asset.uri, asset.mimeType ?? "image/jpeg", asset.fileName ?? "ordonnance.jpg");
  }

  async function pickPdf() {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    await addFile(asset.uri, asset.mimeType ?? "application/pdf", asset.name);
  }

  async function extract() {
    setBusy("extract");
    setError("");
    try {
      await saveSources();
      await callFunction("extract-plan", { plan_id: id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse impossible");
    } finally {
      setBusy("");
    }
  }

  function validate(): string | null {
    for (const m of meds) {
      if (!m.name.trim()) return "Chaque médicament doit avoir un nom.";
      const times = m.timesText.split(/[,;\s]+/).filter(Boolean);
      if (times.some((t) => !TIME.test(t))) return `Heures invalides pour ${m.name} : utilisez le format 08:00, 20:00.`;
      if (m.quantity && Number.isNaN(Number(m.quantity.replace(",", ".")))) return `Quantité invalide pour ${m.name}.`;
      if (m.endDate && !DATE.test(m.endDate)) return `Date de fin invalide pour ${m.name} : format AAAA-MM-JJ.`;
    }
    for (const t of tasks) {
      if (!t.title.trim()) return "Chaque tâche doit avoir un titre.";
      if (t.dueDate && !DATE.test(t.dueDate)) return `Date invalide pour « ${t.title} » : format AAAA-MM-JJ.`;
    }
    return null;
  }

  async function saveAll(send: boolean) {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (send && !(await confirm("Envoyer ce plan au patient ? Il recevra ses rappels et ses tâches."))) return;
    setBusy(send ? "send" : "save");
    setError("");
    try {
      await saveSources();
      if (removedMeds.length) await supabase.from("medications").delete().in("id", removedMeds);
      if (removedTasks.length) await supabase.from("tasks").delete().in("id", removedTasks);
      for (const m of meds) {
        const row = {
          plan_id: id,
          name: m.name.trim(),
          dosage: m.dosage.trim(),
          form: m.form.trim(),
          quantity_per_intake: m.quantity ? Number(m.quantity.replace(",", ".")) : null,
          unit: m.unit.trim(),
          times: m.timesText.split(/[,;\s]+/).filter(Boolean).sort(),
          start_date: m.start_date ?? new Date().toISOString().slice(0, 10),
          end_date: m.endDate || null,
          instructions: m.instructions.trim(),
          uncertain_fields: [],
        };
        const { error: e } = isNew(m.id)
          ? await supabase.from("medications").insert(row)
          : await supabase.from("medications").update(row).eq("id", m.id);
        if (e) throw e;
      }
      for (const t of tasks) {
        const row = { plan_id: id, kind: t.kind, title: t.title.trim(), details: t.details.trim(), due_date: t.dueDate || null };
        const { error: e } = isNew(t.id)
          ? await supabase.from("tasks").insert(row)
          : await supabase.from("tasks").update(row).eq("id", t.id);
        if (e) throw e;
      }
      const update: Partial<CarePlan> = { advice: advice.split("\n").map((a) => a.trim()).filter(Boolean) };
      if (send) Object.assign(update, { status: "sent", sent_at: new Date().toISOString() });
      const { error: e } = await supabase.from("care_plans").update(update).eq("id", id);
      if (e) throw e;
      if (send) router.back();
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy("");
    }
  }

  function updateMed(index: number, patch: Partial<MedForm>) {
    setMeds((list) => list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function updateTask(index: number, patch: Partial<TaskForm>) {
    setTasks((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  const flagged = (m: MedForm, field: string) =>
    m.uncertain_fields.includes(field) ? { borderColor: colors.warning, borderWidth: 2 } : undefined;

  return (
    <Screen>
      {sent ? <Banner tone="info">Ce plan a été envoyé au patient. Vos modifications lui seront visibles dès l'enregistrement.</Banner> : null}

      <Card>
        <Heading>1. Instructions</Heading>
        <Field label="Titre" value={title} onChangeText={setTitle} placeholder="Angine, suivi tension..." />
        <Field
          label="Notes ou dictée"
          value={sourceText}
          onChangeText={setSourceText}
          multiline
          placeholder="Tapez ou dictez avec le micro du clavier : « Amoxicilline 1 g, un comprimé matin et soir pendant 7 jours... »"
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {Platform.OS !== "web" ? (
            <View style={{ flexGrow: 1 }}>
              <Button variant="secondary" label="Photographier l'ordonnance" onPress={() => takePhoto(true)} disabled={busy !== ""} />
            </View>
          ) : null}
          <View style={{ flexGrow: 1 }}>
            <Button variant="secondary" label="Importer une image" onPress={() => takePhoto(false)} disabled={busy !== ""} />
          </View>
          <View style={{ flexGrow: 1 }}>
            <Button variant="secondary" label="Importer un PDF" onPress={pickPdf} disabled={busy !== ""} />
          </View>
        </View>
        {busy === "upload" ? <Body muted>Envoi du fichier...</Body> : null}
        {files.map((f) => (
          <Body key={f} muted>📎 {f.split("/").pop()?.replace(/^\d+-/, "")}</Body>
        ))}
        <Button
          label={meds.length || tasks.length ? "Analyser à nouveau avec l'IA" : "Analyser avec l'IA"}
          onPress={extract}
          loading={busy === "extract"}
          disabled={busy !== "" || sent}
        />
        <Body muted>L'IA propose un plan. Rien n'est envoyé au patient avant votre validation.</Body>
      </Card>

      <ErrorText>{error}</ErrorText>

      {warnings.length ? (
        <Banner>
          À vérifier :{"\n"}
          {warnings.map((w) => `• ${w}`).join("\n")}
        </Banner>
      ) : null}

      <Heading>2. Médicaments</Heading>
      {meds.map((m, i) => (
        <Card key={m.id}>
          {m.uncertain_fields.length ? <Banner>Champs incertains surlignés : relisez-les.</Banner> : null}
          <Field label="Médicament" value={m.name} onChangeText={(v) => updateMed(i, { name: v })} style={flagged(m, "name")} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="Dosage" value={m.dosage} onChangeText={(v) => updateMed(i, { dosage: v })} style={flagged(m, "dosage")} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Forme" value={m.form} onChangeText={(v) => updateMed(i, { form: v })} style={flagged(m, "form")} />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Quantité par prise"
                value={m.quantity}
                onChangeText={(v) => updateMed(i, { quantity: v })}
                keyboardType="decimal-pad"
                style={flagged(m, "quantity_per_intake")}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Unité" value={m.unit} onChangeText={(v) => updateMed(i, { unit: v })} placeholder="comprimé" />
            </View>
          </View>
          <Field
            label="Heures de prise (vide = si besoin)"
            value={m.timesText}
            onChangeText={(v) => updateMed(i, { timesText: v })}
            placeholder="08:00, 20:00"
            style={flagged(m, "times")}
          />
          <Field
            label="Dernier jour (AAAA-MM-JJ, vide = sans fin)"
            value={m.endDate}
            onChangeText={(v) => updateMed(i, { endDate: v })}
            style={flagged(m, "duration_days")}
          />
          <Field label="Consignes" value={m.instructions} onChangeText={(v) => updateMed(i, { instructions: v })} placeholder="pendant le repas" />
          <Button
            variant="danger"
            label="Retirer ce médicament"
            onPress={() => {
              if (!isNew(m.id)) setRemovedMeds((r) => [...r, m.id]);
              setMeds((list) => list.filter((_, j) => j !== i));
            }}
          />
        </Card>
      ))}
      <Button
        variant="secondary"
        label="+ Ajouter un médicament"
        onPress={() =>
          setMeds((list) => [
            ...list,
            {
              id: newId(), plan_id: id, name: "", dosage: "", form: "", quantity: "1", unit: "comprimé",
              timesText: "08:00", endDate: "", start_date: null, instructions: "", uncertain_fields: [],
            },
          ])
        }
      />

      <Heading>3. Tâches pour le patient</Heading>
      {tasks.map((t, i) => (
        <Card key={t.id}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {KINDS.map((k) => (
              <Pressable
                key={k}
                onPress={() => updateTask(i, { kind: k })}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: t.kind === k ? colors.primary : colors.primarySoft,
                }}
              >
                <Text style={{ color: t.kind === k ? "#FFFFFF" : colors.primary, fontWeight: "600" }}>{TASK_LABELS[k]}</Text>
              </Pressable>
            ))}
          </View>
          <Field label="Tâche" value={t.title} onChangeText={(v) => updateTask(i, { title: v })} placeholder="Prendre rendez-vous chez le cardiologue" />
          <Field label="Détails" value={t.details} onChangeText={(v) => updateTask(i, { details: v })} />
          <Field label="À faire avant le (AAAA-MM-JJ)" value={t.dueDate} onChangeText={(v) => updateTask(i, { dueDate: v })} />
          <Button
            variant="danger"
            label="Retirer cette tâche"
            onPress={() => {
              if (!isNew(t.id)) setRemovedTasks((r) => [...r, t.id]);
              setTasks((list) => list.filter((_, j) => j !== i));
            }}
          />
        </Card>
      ))}
      <Button
        variant="secondary"
        label="+ Ajouter une tâche"
        onPress={() =>
          setTasks((list) => [
            ...list,
            { id: newId(), plan_id: id, kind: "other", title: "", details: "", dueDate: "", appointment_at: null, done_at: null },
          ])
        }
      />

      <Heading>4. Conseils</Heading>
      <Field label="Un conseil par ligne" value={advice} onChangeText={setAdvice} multiline placeholder="Boire beaucoup d'eau" />

      <Button label="Enregistrer" variant="secondary" onPress={() => saveAll(false)} loading={busy === "save"} disabled={busy !== ""} />
      {!sent ? (
        <Button
          label="Valider et envoyer au patient"
          onPress={() => saveAll(true)}
          loading={busy === "send"}
          disabled={busy !== "" || (meds.length === 0 && tasks.length === 0)}
        />
      ) : null}
    </Screen>
  );
}
