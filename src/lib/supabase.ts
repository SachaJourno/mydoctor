import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans le fichier .env");
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Sur le web, supabase-js utilise localStorage par défaut.
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Appelle une Edge Function et renvoie son JSON, ou lève une erreur lisible. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const details = await (error as { context?: Response }).context?.json();
      if (details?.error) message = details.error;
    } catch {
      // réponse sans JSON : on garde le message d'origine
    }
    throw new Error(message);
  }
  return data as T;
}
