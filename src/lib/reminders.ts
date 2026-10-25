// Rappels de prise programmés sur le téléphone : ils sonnent même sans réseau.
// iOS limite à 64 notifications en attente, on programme donc les prochains jours
// et on reprogramme à chaque ouverture de l'app.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { reminderText, type SchedulableMedication, upcomingDoses } from "./schedule";

const DAYS_AHEAD = 7;
const MAX_REMINDERS = 60;
const CHANNEL_ID = "prises";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const remindersSupported = Platform.OS !== "web";

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Prises de médicaments",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Remplace tous les rappels programmés par ceux des médicaments actuels. Renvoie le nombre de rappels. */
export async function syncReminders(meds: SchedulableMedication[]): Promise<number> {
  if (!remindersSupported) return 0;
  if (!(await ensurePermission())) return 0;

  await Notifications.cancelAllScheduledNotificationsAsync();
  const doses = upcomingDoses(meds, new Date(), DAYS_AHEAD, MAX_REMINDERS);
  for (const dose of doses) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Prise de ${dose.time}`,
        body: reminderText(dose.medication),
        data: { medicationId: dose.medication.id, scheduledFor: dose.scheduledFor.toISOString() },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dose.scheduledFor,
        channelId: CHANNEL_ID,
      },
    });
  }
  return doses.length;
}
