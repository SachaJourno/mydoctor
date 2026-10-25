import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Banner, Button, colors, ErrorText } from "../../components/ui";
import { callFunction, supabase } from "../../lib/supabase";
import type { ChatMessage } from "../../lib/types";

const SUGGESTIONS = ["Combien de comprimés je prends ce matin ?", "Je peux le prendre en mangeant ?", "Jusqu'à quand dure mon traitement ?"];

export default function PatientChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => setMessages((data ?? []) as ChatMessage[]));
  }, []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setError("");
    setBusy(true);
    const now = new Date().toISOString();
    setMessages((m) => [...m, { id: `local-${now}`, role: "user", content: message, created_at: now }]);
    try {
      const { reply } = await callFunction<{ reply: string }>("patient-chat", { message });
      setMessages((m) => [...m, { id: `reply-${now}`, role: "assistant", content: reply, created_at: new Date().toISOString() }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <View style={{ padding: 12 }}>
          <Banner tone="info">
            Cet assistant explique le plan de votre médecin. Il ne remplace pas son avis. En cas d'urgence, appelez le 15.
          </Banner>
        </View>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="secondary" label={s} onPress={() => send(s)} />
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                backgroundColor: item.role === "user" ? colors.primary : colors.surface,
                borderRadius: 14,
                padding: 12,
                borderWidth: item.role === "user" ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: item.role === "user" ? "#FFFFFF" : colors.text, fontSize: 16, lineHeight: 22 }}>{item.content}</Text>
            </View>
          )}
          ListFooterComponent={busy ? <Text style={{ color: colors.muted, padding: 4 }}>L'assistant écrit...</Text> : undefined}
        />
        <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Votre question"
              placeholderTextColor={colors.muted}
              multiline
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 16,
                maxHeight: 120,
                color: colors.text,
              }}
            />
            <Button label="Envoyer" onPress={() => send(draft)} loading={busy} disabled={!draft.trim()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
