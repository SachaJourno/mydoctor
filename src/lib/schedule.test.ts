import assert from "node:assert/strict";
import { test } from "node:test";

import { dosesForDay, quantityLabel, reminderText, upcomingDoses } from "./schedule.ts";

const amox = {
  id: "m1",
  name: "Amoxicilline",
  dosage: "1 g",
  quantity_per_intake: 1,
  unit: "comprimé",
  times: ["20:00", "08:00"],
  start_date: "2026-10-25",
  end_date: "2026-10-31",
  instructions: "pendant le repas",
};
const doliprane = {
  ...amox,
  id: "m2",
  name: "Doliprane",
  dosage: "500 mg",
  quantity_per_intake: 2,
  times: ["12:00"],
  end_date: null,
  instructions: "",
};

test("les prises du jour sont triées par heure", () => {
  const doses = dosesForDay([amox, doliprane], new Date(2026, 9, 26));
  assert.deepEqual(doses.map((d) => `${d.time} ${d.medication.name}`), [
    "08:00 Amoxicilline",
    "12:00 Doliprane",
    "20:00 Amoxicilline",
  ]);
});

test("un médicament terminé ou pas commencé n'apparaît pas", () => {
  assert.equal(dosesForDay([amox], new Date(2026, 10, 1)).length, 0);
  assert.equal(dosesForDay([amox], new Date(2026, 9, 24)).length, 0);
  assert.equal(dosesForDay([amox], new Date(2026, 9, 31)).length, 2);
});

test("les prises à venir ignorent celles déjà passées et respectent le maximum", () => {
  const from = new Date(2026, 9, 25, 10, 0);
  const doses = upcomingDoses([amox, doliprane], from, 3, 4);
  assert.equal(doses.length, 4);
  assert.equal(doses[0].time, "12:00");
  assert.ok(doses.every((d) => d.scheduledFor > from));
});

test("libellés en français", () => {
  assert.equal(quantityLabel(doliprane), "2 comprimés");
  assert.equal(reminderText(doliprane), "2 comprimés de Doliprane 500 mg");
  assert.equal(quantityLabel({ quantity_per_intake: 2.5, unit: "ml" }), "2,5 ml");
  assert.equal(quantityLabel({ quantity_per_intake: null, unit: "" }), "");
  assert.equal(reminderText(amox), "1 comprimé d'Amoxicilline 1 g, pendant le repas");
});
