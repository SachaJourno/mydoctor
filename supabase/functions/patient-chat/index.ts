// Chat du patient : répond uniquement à partir des plans validés par son médecin.

import type Anthropic from "@anthropic-ai/sdk";
import { adminClient, anthropic, corsHeaders, json, MODEL, userClient } from "../_shared/clients.ts";

const SYSTEM = `Tu es l'assistant de l'application MyDoctor. Tu aides un patient à comprendre et suivre le plan de soin que son médecin a validé.

Règles strictes :
- Réponds uniquement à partir du plan ci-dessous. Tu peux reformuler, expliquer un mot, rappeler une heure ou une quantité.
- Ne modifie jamais une dose, n'ajoute ni ne retire de médicament, ne pose pas de diagnostic.
- Si la réponse n'est pas dans le plan (oubli de prise, effet indésirable, interaction, autre médicament), dis-le simplement et conseille d'appeler le médecin ou de demander au pharmacien.
- Si le patient décrit un signe grave (douleur dans la poitrine, difficulté à respirer, gonflement du visage, malaise, saignement important, idées suicidaires), dis-lui d'appeler immédiatement le 15 (ou le 112), avant toute autre chose.
- Réponds en français simple, en 1 à 4 phrases, en vouvoyant le patient.`;

type Medication = {
  name: string;
  dosage: string;
  form: string;
  quantity_per_intake: number | null;
  unit: string;
  times: string[];
  start_date: string | null;
  end_date: string | null;
  instructions: string;
};
type Task = { kind: string; title: string; details: string; due_date: string | null; done_at: string | null };
type Plan = { title: string; sent_at: string; advice: string[]; medications: Medication[]; tasks: Task[] };

function describePlans(plans: Plan[]): string {
  if (!plans.length) return "Aucun plan validé pour le moment.";
  return plans
    .map((p) => {
      const meds = p.medications.map((m) => {
        const qty = m.quantity_per_intake ? `${m.quantity_per_intake} ${m.unit}`.trim() : "quantité non précisée";
        const when = m.times.length ? `à ${m.times.join(", ")}` : "si besoin";
        const period = m.end_date ? `jusqu'au ${m.end_date}` : "durée non précisée";
        return `- ${m.name} ${m.dosage} (${m.form}) : ${qty} ${when}, ${period}. ${m.instructions}`.trim();
      });
      const tasks = p.tasks.map((t) => `- [${t.done_at ? "fait" : "à faire"}] ${t.title}${t.due_date ? ` avant le ${t.due_date}` : ""}. ${t.details}`.trim());
      return [
        `## ${p.title} (envoyé le ${p.sent_at.slice(0, 10)})`,
        "Médicaments :",
        ...(meds.length ? meds : ["- aucun"]),
        "Tâches :",
        ...(tasks.length ? tasks : ["- aucune"]),
        ...(p.advice.length ? ["Conseils du médecin :", ...p.advice.map((a) => `- ${a}`)] : []),
      ].join("\n");
    })
    .join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message } = await req.json();
    if (typeof message !== "string" || !message.trim()) return json({ error: "Message vide" }, 400);
    if (message.length > 2000) return json({ error: "Message trop long" }, 400);

    const db = userClient(req);
    const { data: auth } = await db.auth.getUser();
    const patientId = auth.user?.id;
    if (!patientId) return json({ error: "Non connecté" }, 401);

    // RLS : le patient ne lit que ses plans envoyés.
    const { data: plans, error } = await db
      .from("care_plans")
      .select("title, sent_at, advice, medications(*), tasks(*)")
      .eq("patient_id", patientId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(5);
    if (error) throw error;

    const { data: history } = await db
      .from("chat_messages")
      .select("role, content")
      .order("created_at", { ascending: false })
      .limit(20);

    const today = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full" });
    const messages: Anthropic.MessageParam[] = [
      ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: message },
    ];
    // L'API attend un premier message « user ».
    while (messages.length && messages[0].role !== "user") messages.shift();

    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `${SYSTEM}\n\nNous sommes le ${today}.\n\n# Plan de soin du patient\n${describePlans((plans ?? []) as Plan[])}`,
      output_config: { effort: "low" },
      messages,
    });

    const reply = response.stop_reason === "refusal"
      ? "Je ne peux pas répondre à cette question. Pour toute question sur votre traitement, contactez votre médecin ou votre pharmacien."
      : response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();

    const askedAt = new Date();
    const { error: insertError } = await adminClient().from("chat_messages").insert([
      { patient_id: patientId, role: "user", content: message, created_at: askedAt.toISOString() },
      { patient_id: patientId, role: "assistant", content: reply, created_at: new Date(askedAt.getTime() + 1).toISOString() },
    ]);
    if (insertError) throw insertError;

    return json({ reply });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
