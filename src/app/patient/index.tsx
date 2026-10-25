import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Banner, Body, Button, Card, Checkbox, colors, ErrorText, Heading, Loading, Screen, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { remindersSupported, syncReminders } from "../../lib/reminders";
import { dosesForDay, isActiveOn, localDay, reminderText } from "../../lib/schedule";
import { supabase } from "../../lib/supabase";
import { type CarePlan, type DoseLog, type Medication, type Task, TASK_LABELS } from "../../lib/types";

type PlanWithItems = CarePlan & { medications: Medication[]; tasks: Task[] };

export default function PatientToday() {
  const { profile, signOut } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [linked, setLinked] = useState(true);
  const [plans, setPlans] = useState<PlanWithItems[]>([]);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [reminders, setReminders] = useState<number | null>(null);
  const [error, setError] = useState("");

  const today = new Date();
  const meds = plans.flatMap((p) => p.medications);
  const tasks = plans.flatMap((p) => p.tasks);
  const doses = dosesForDay(meds, today);
  const asNeeded = meds.filter((m) => m.times.length === 0 && isActiveOn(m, localDay(today)));
  const advice = plans.flatMap((p) => p.advice);

  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 3600 * 1000);
    const [links, planRes, logRes] = await Promise.all([
      supabase.from("care_links").select("doctor_id", { count: "exact", head: true }),
      supabase.from("care_plans").select("*, medications(*), tasks(*)").eq("status", "sent").order("sent_at", { ascending: false }),
      supabase.from("dose_logs").select("*").gte("scheduled_for", start.toISOString()).lt("scheduled_for", end.toISOString()),
    ]);
    if (planRes.error) setError(planRes.error.message);
    const loadedPlans = (planRes.data ?? []) as PlanWithItems[];
    setLinked((links.count ?? 0) > 0);
    setPlans(loadedPlans);
    setLogs((logRes.data ?? []) as DoseLog[]);
    setLoaded(true);
    syncReminders(loadedPlans.flatMap((p) => p.medications)).then(setReminders).catch(() => setReminders(0));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function setDose(medicationId: string, scheduledFor: Date, status: DoseLog["status"] | null) {
    if (!profile) return;
    const key = scheduledFor.toISOString();
    setError("");
    if (status === null) {
      const { error: e } = await supabase.from("dose_logs").delete().eq("medication_id", medicationId).eq("scheduled_for", key);
      if (e) setError(e.message);
    } else {
      const { error: e } = await supabase
        .from("dose_logs")
        .upsert(
          { medication_id: medicationId, patient_id: profile.id, scheduled_for: key, status, logged_at: new Date().toISOString() },
          { onConflict: "medication_id,scheduled_for" },
        );
      if (e) setError(e.message);
    }
    load();
  }

  async function toggleTask(task: Task) {
    const { error: e } = await supabase.rpc("set_task_done", { p_task: task.id, p_done: !task.done_at });
    if (e) setError(e.message);
    load();
  }

  if (!loaded) return <Loading />;

  const openTasks = tasks.filter((t) => !t.done_at);
  const doneTasks = tasks.filter((t) => t.done_at);

  return (
    <Screen>
      <Title>{today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</Title>

      {!linked ? (
        <Card>
          <Heading>Reliez-vous à votre médecin</Heading>
          <Body muted>Demandez-lui le code à 6 chiffres affiché dans son application.</Body>
          <Button label="Saisir le code" onPress={() => router.push("/patient/join")} />
        </Card>
      ) : plans.length === 0 ? (
        <Banner tone="info">Votre médecin ne vous a pas encore envoyé de plan.</Banner>
      ) : null}

      {remindersSupported && reminders === 0 && meds.some((m) => m.times.length) ? (
        <Banner>Les rappels sont désactivés. Autorisez les notifications de MyDoctor dans les réglages du téléphone.</Banner>
      ) : null}
      <ErrorText>{error}</ErrorText>

      {doses.length ? <Heading>Mes prises du jour</Heading> : null}
      {doses.map((dose) => {
        const log = logs.find(
          (l) => l.medication_id === dose.medication.id && new Date(l.scheduled_for).getTime() === dose.scheduledFor.getTime(),
        );
        const late = !log && dose.scheduledFor < today;
        return (
          <Card key={`${dose.medication.id}-${dose.time}`} style={log?.status === "taken" ? { backgroundColor: colors.successSoft } : undefined}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Checkbox
                checked={log?.status === "taken"}
                label={`Prise de ${dose.time} faite`}
                onPress={() => setDose(dose.medication.id, dose.scheduledFor, log?.status === "taken" ? null : "taken")}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: late ? colors.warning : colors.text }}>{dose.time}</Text>
                <Body>{reminderText(dose.medication)}</Body>
                {log?.status === "skipped" ? <Body muted>Non prise</Body> : null}
              </View>
            </View>
            {!log ? (
              <Pressable onPress={() => setDose(dose.medication.id, dose.scheduledFor, "skipped")}>
                <Text style={{ color: colors.muted, textDecorationLine: "underline" }}>Je ne l'ai pas prise</Text>
              </Pressable>
            ) : null}
          </Card>
        );
      })}

      {asNeeded.length ? <Heading>Si besoin</Heading> : null}
      {asNeeded.map((m) => (
        <Card key={m.id}>
          <Body>{reminderText(m)}</Body>
        </Card>
      ))}

      {tasks.length ? <Heading>Mes tâches</Heading> : null}
      {[...openTasks, ...doneTasks].map((task) => (
        <Card key={task.id}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Checkbox checked={!!task.done_at} label={task.title} onPress={() => toggleTask(task)} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>{TASK_LABELS[task.kind]}</Text>
              <Body style={task.done_at ? { textDecorationLine: "line-through", color: colors.muted } : undefined}>{task.title}</Body>
              {task.details ? <Body muted>{task.details}</Body> : null}
              {task.due_date && !task.done_at ? (
                <Body muted>Avant le {new Date(`${task.due_date}T12:00:00`).toLocaleDateString("fr-FR")}</Body>
              ) : null}
            </View>
          </View>
        </Card>
      ))}

      {advice.length ? (
        <>
          <Heading>Conseils de mon médecin</Heading>
          <Card>
            {advice.map((a) => (
              <Body key={a}>• {a}</Body>
            ))}
          </Card>
        </>
      ) : null}

      {plans.length ? (
        <Button label="Poser une question sur mon traitement" onPress={() => router.push("/patient/chat")} />
      ) : null}
      {linked ? (
        <Button variant="secondary" label="Ajouter un autre médecin" onPress={() => router.push("/patient/join")} />
      ) : null}
      <Button variant="secondary" label="Se déconnecter" onPress={signOut} />
    </Screen>
  );
}
