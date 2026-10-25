import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const colors = {
  background: "#F5F7FA",
  surface: "#FFFFFF",
  text: "#14213D",
  muted: "#5C6B80",
  border: "#DCE3EC",
  primary: "#1F6FEB",
  primarySoft: "#E7F0FE",
  success: "#1A7F4B",
  successSoft: "#E3F5EA",
  warning: "#9A6200",
  warningSoft: "#FFF4DB",
  danger: "#C62828",
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.column, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[styles.body, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Banner({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "info" }) {
  const background = tone === "warning" ? colors.warningSoft : colors.primarySoft;
  const color = tone === "warning" ? colors.warning : colors.primary;
  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      <Text style={{ color, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = "primary", loading, disabled }: ButtonProps) {
  const primary = variant === "primary";
  const color = primary ? "#FFFFFF" : variant === "danger" ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.buttonLabel, { color }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 120, textAlignVertical: "top" }, props.style]} />
    </View>
  );
}

export function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={[styles.checkbox, checked && { backgroundColor: colors.success, borderColor: colors.success }]}
    >
      {checked ? <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>✓</Text> : null}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={{ color: colors.danger, fontSize: 14 }}>{children}</Text>;
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  column: { width: "100%", maxWidth: 720, alignSelf: "center", gap: 16 },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  heading: { fontSize: 18, fontWeight: "600", color: colors.text, marginTop: 8 },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  banner: { borderRadius: 10, padding: 12 },
  button: { minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonLabel: { fontSize: 16, fontWeight: "600" },
  label: { fontSize: 14, fontWeight: "600", color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
