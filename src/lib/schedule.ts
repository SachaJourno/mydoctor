// Calcul des prises à partir des médicaments du plan. Aucune dépendance à React Native,
// pour pouvoir être testé avec `npm test`.

export type SchedulableMedication = {
  id: string;
  name: string;
  dosage: string;
  quantity_per_intake: number | null;
  unit: string;
  times: string[];
  start_date: string | null;
  end_date: string | null;
  instructions: string;
};

export type Dose<M extends SchedulableMedication = SchedulableMedication> = {
  medication: M;
  time: string;
  scheduledFor: Date;
};

/** Date locale au format AAAA-MM-JJ. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isActiveOn(med: SchedulableMedication, day: string): boolean {
  if (med.start_date && day < med.start_date) return false;
  if (med.end_date && day > med.end_date) return false;
  return true;
}

/** Prises prévues un jour donné, triées par heure. */
export function dosesForDay<M extends SchedulableMedication>(meds: M[], date: Date): Dose<M>[] {
  const day = localDay(date);
  const doses: Dose<M>[] = [];
  for (const medication of meds) {
    if (!isActiveOn(medication, day)) continue;
    for (const time of medication.times) {
      const [hours, minutes] = time.split(":").map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) continue;
      const scheduledFor = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
      doses.push({ medication, time, scheduledFor });
    }
  }
  return doses.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

/** Prises à venir sur plusieurs jours, à partir de `from`, limitées à `max`. */
export function upcomingDoses<M extends SchedulableMedication>(meds: M[], from: Date, days: number, max: number): Dose<M>[] {
  const result: Dose<M>[] = [];
  for (let i = 0; i < days && result.length < max; i++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    for (const dose of dosesForDay(meds, date)) {
      if (dose.scheduledFor > from) result.push(dose);
    }
  }
  return result.slice(0, max);
}

/** « 2 comprimés », « 5 ml », ou « » si la quantité n'est pas précisée. */
export function quantityLabel(med: Pick<SchedulableMedication, "quantity_per_intake" | "unit">): string {
  if (med.quantity_per_intake === null) return "";
  const qty = Number.isInteger(med.quantity_per_intake)
    ? String(med.quantity_per_intake)
    : String(med.quantity_per_intake).replace(".", ",");
  const plural = med.quantity_per_intake > 1 && med.unit && !/[sx]$/.test(med.unit) && !/^(ml|mg|g)$/i.test(med.unit);
  return `${qty} ${med.unit}${plural ? "s" : ""}`.trim();
}

/** Texte d'un rappel : « 2 comprimés de Doliprane 500 mg, pendant le repas ». */
export function reminderText(med: SchedulableMedication): string {
  const qty = quantityLabel(med);
  const name = `${med.name} ${med.dosage}`.trim();
  const of = /^[aeiouyhâéèêîôûœ]/i.test(name) ? "d'" : "de ";
  const base = qty ? `${qty} ${of}${name}` : name;
  return med.instructions ? `${base}, ${med.instructions}` : base;
}
