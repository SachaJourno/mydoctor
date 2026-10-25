import { File } from "expo-file-system";
import { Platform } from "react-native";

import { supabase } from "./supabase";

/** Lit un fichier choisi par l'utilisateur (photo ou PDF). */
async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

/** Dépose une ordonnance dans le stockage privé et renvoie son chemin. */
export async function uploadPrescription(
  doctorId: string,
  planId: string,
  uri: string,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const safeName = fileName.replace(/[^\w.-]+/g, "_").slice(-80) || "ordonnance";
  const path = `${doctorId}/${planId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from("prescriptions")
    .upload(path, await readBytes(uri), { contentType: mimeType, upsert: false });
  if (error) throw error;
  return path;
}
