// Transforme les sources d'une consultation (texte, photos, PDF) en plan structuré.
// Le résultat est un brouillon : le médecin le relit et le valide dans l'app.

import type Anthropic from "@anthropic-ai/sdk";
import { adminClient, anthropic, corsHeaders, json, MODEL, userClient } from "../_shared/clients.ts";
import { type ExtractedPlan, planSchema } from "../_shared/plan.ts";

const SYSTEM = `Tu aides un médecin français à transformer ses instructions en plan de soin pour son patient.
Les sources peuvent être une dictée transcrite, une photo d'ordonnance, un PDF ou des notes.

Règles :
- Recopie uniquement ce que le médecin a écrit ou dit. N'ajoute aucun médicament, dose ou conseil.
- Si une information est illisible, ambiguë ou absente, laisse le champ vide (ou null) et cite le nom du champ dans uncertain_fields, puis explique le problème dans warnings.
- Convertis les moments de prise en heures : matin 08:00, midi 12:00, soir 19:00, coucher 22:00. « 3 fois par jour » = 08:00, 12:00, 19:00. « Si besoin » = aucune heure, et précise-le dans instructions.
- Crée une tâche « pharmacy » pour aller chercher les médicaments, et une tâche par rendez-vous, examen ou analyse demandé.
- Écris en français simple.`;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function fileBlock(path: string): Promise<Anthropic.ContentBlockParam> {
  const { data, error } = await adminClient().storage.from("prescriptions").download(path);
  if (error || !data) throw new Error(`Fichier introuvable : ${path}`);
  const base64 = toBase64(new Uint8Array(await data.arrayBuffer()));
  const type = data.type || (path.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  if (type === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  }
  if ((IMAGE_TYPES as readonly string[]).includes(type)) {
    return { type: "image", source: { type: "base64", media_type: type as ImageType, data: base64 } };
  }
  throw new Error(`Format non pris en charge : ${type}`);
}

function addDays(days: number | null): string | null {
  if (days === null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { plan_id } = await req.json();
    if (!plan_id) return json({ error: "plan_id manquant" }, 400);

    // Lecture avec les droits du médecin : RLS garantit que c'est bien son plan.
    const db = userClient(req);
    const { data: plan, error } = await db
      .from("care_plans")
      .select("id, doctor_id, status, source_text, source_files")
      .eq("id", plan_id)
      .single();
    if (error || !plan) return json({ error: "Plan introuvable" }, 404);
    const { data: auth } = await db.auth.getUser();
    if (plan.doctor_id !== auth.user?.id) return json({ error: "Accès refusé" }, 403);
    if (plan.status !== "draft") return json({ error: "Ce plan a déjà été envoyé" }, 409);
    if (!plan.source_text.trim() && plan.source_files.length === 0) {
      return json({ error: "Ajoutez du texte, une photo ou un PDF" }, 400);
    }

    const content: Anthropic.ContentBlockParam[] = [];
    for (const path of plan.source_files as string[]) content.push(await fileBlock(path));
    content.push({
      type: "text",
      text: plan.source_text.trim()
        ? `Notes ou dictée du médecin :\n${plan.source_text}`
        : "Extrais le plan de soin des documents ci-dessus.",
    });

    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "high", format: { type: "json_schema", schema: planSchema } },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "L'IA n'a pas pu traiter ce document. Saisissez le plan à la main." }, 422);
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json({ error: "Réponse vide de l'IA" }, 502);
    const extracted = JSON.parse(text.text) as ExtractedPlan;

    // Remplace le brouillon précédent par la nouvelle extraction.
    await db.from("medications").delete().eq("plan_id", plan_id);
    await db.from("tasks").delete().eq("plan_id", plan_id);

    if (extracted.medications.length) {
      const { error: medError } = await db.from("medications").insert(
        extracted.medications.map((m) => ({
          plan_id,
          name: m.name,
          dosage: m.dosage,
          form: m.form,
          quantity_per_intake: m.quantity_per_intake,
          unit: m.unit,
          times: m.times,
          start_date: new Date().toISOString().slice(0, 10),
          end_date: m.duration_days ? addDays(m.duration_days - 1) : null,
          instructions: m.instructions,
          uncertain_fields: m.uncertain_fields,
        })),
      );
      if (medError) throw medError;
    }
    if (extracted.tasks.length) {
      const { error: taskError } = await db.from("tasks").insert(
        extracted.tasks.map((t) => ({
          plan_id,
          kind: t.kind,
          title: t.title,
          details: t.details,
          due_date: addDays(t.due_in_days),
        })),
      );
      if (taskError) throw taskError;
    }
    await db
      .from("care_plans")
      .update({ title: extracted.title, extraction: extracted, advice: extracted.advice })
      .eq("id", plan_id);

    return json({ plan: extracted });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
