export type Role = "doctor" | "patient";

export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  timezone: string;
};

export type PlanStatus = "draft" | "sent";

export type CarePlan = {
  id: string;
  doctor_id: string;
  patient_id: string;
  title: string;
  status: PlanStatus;
  source_text: string;
  source_files: string[];
  advice: string[];
  extraction: { warnings?: string[] } | null;
  created_at: string;
  sent_at: string | null;
};

export type Medication = {
  id: string;
  plan_id: string;
  name: string;
  dosage: string;
  form: string;
  quantity_per_intake: number | null;
  unit: string;
  times: string[];
  start_date: string | null;
  end_date: string | null;
  instructions: string;
  uncertain_fields: string[];
};

export type TaskKind = "pharmacy" | "appointment" | "exam" | "other";

export type Task = {
  id: string;
  plan_id: string;
  kind: TaskKind;
  title: string;
  details: string;
  due_date: string | null;
  appointment_at: string | null;
  done_at: string | null;
};

export type DoseLog = {
  id: string;
  medication_id: string;
  scheduled_for: string;
  status: "taken" | "skipped";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export const TASK_LABELS: Record<TaskKind, string> = {
  pharmacy: "Pharmacie",
  appointment: "Rendez-vous",
  exam: "Examen",
  other: "À faire",
};
