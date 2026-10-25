import { Redirect } from "expo-router";

import { Loading } from "../components/ui";
import { useAuth } from "../lib/auth";

export default function Index() {
  const { loading, session, profile } = useAuth();
  if (loading) return <Loading />;
  if (!session || !profile) return <Redirect href="/login" />;
  return <Redirect href={profile.role === "doctor" ? "/doctor" : "/patient"} />;
}
