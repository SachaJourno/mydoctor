// Format du plan extrait par l'IA, partagé entre la fonction et le schéma JSON.

export type ExtractedMedication = {
  name: string;
  dosage: string;
  form: string;
  quantity_per_intake: number | null;
  unit: string;
  times: string[];
  duration_days: number | null;
  instructions: string;
  uncertain_fields: string[];
};

export type ExtractedTask = {
  kind: "pharmacy" | "appointment" | "exam" | "other";
  title: string;
  details: string;
  due_in_days: number | null;
};

export type ExtractedPlan = {
  title: string;
  medications: ExtractedMedication[];
  tasks: ExtractedTask[];
  advice: string[];
  warnings: string[];
};

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableInteger = { anyOf: [{ type: "integer" }, { type: "null" }] };

export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "medications", "tasks", "advice", "warnings"],
  properties: {
    title: { type: "string", description: "Titre court de la consultation, ex. « Angine »." },
    medications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name", "dosage", "form", "quantity_per_intake", "unit", "times",
          "duration_days", "instructions", "uncertain_fields",
        ],
        properties: {
          name: { type: "string", description: "Nom du médicament tel qu'écrit." },
          dosage: { type: "string", description: "Dosage, ex. « 500 mg ». Vide si absent." },
          form: { type: "string", description: "Forme : comprimé, gélule, sirop, sachet..." },
          quantity_per_intake: { ...nullableNumber, description: "Quantité par prise, ex. 2. null si absent." },
          unit: { type: "string", description: "Unité de la quantité : comprimé, ml, sachet..." },
          times: {
            type: "array",
            items: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
            description: "Heures de prise au format HH:MM. Matin 08:00, midi 12:00, soir 19:00, coucher 22:00.",
          },
          duration_days: { ...nullableInteger, description: "Durée du traitement en jours. null si non précisée." },
          instructions: { type: "string", description: "Consignes : pendant le repas, à jeun, si douleur..." },
          uncertain_fields: {
            type: "array",
            items: { type: "string" },
            description: "Noms des champs incertains ou illisibles que le médecin doit vérifier.",
          },
        },
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "details", "due_in_days"],
        properties: {
          kind: { type: "string", enum: ["pharmacy", "appointment", "exam", "other"] },
          title: { type: "string" },
          details: { type: "string" },
          due_in_days: { ...nullableInteger, description: "Délai en jours, ex. 7 pour « dans une semaine »." },
        },
      },
    },
    advice: { type: "array", items: { type: "string" }, description: "Conseils donnés par le médecin." },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Points que le médecin doit vérifier : écriture illisible, posologie ambiguë, information manquante.",
    },
  },
} as const;
