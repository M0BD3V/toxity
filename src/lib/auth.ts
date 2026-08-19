import { requireSupabase } from "./supabase";

export const registrationMessage =
  "Se este e-mail puder receber uma nova confirmação, enviaremos um código de seis dígitos.";

export type AuthErrorCode =
  | "invalid_input"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "expired"
  | "network"
  | "unknown";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeNametag(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export function passwordError(password: string) {
  if (password.length < 8) return "Use no mínimo 8 caracteres na senha.";
  if (!/[A-Z]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return "A senha precisa ter pelo menos uma letra maiúscula e um símbolo.";
  return "";
}

export async function checkNametagAvailability(nametag: string) {
  const { data, error } = await requireSupabase().rpc("is_nametag_available", {
    candidate_nametag: normalizeNametag(nametag),
  });
  if (error) throw error;
  return Boolean(data);
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  nametag: string,
) {
  const { data, error } = await requireSupabase().auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      data: {
        display_name: displayName.trim(),
        nametag: normalizeNametag(nametag),
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function verifySignupCode(email: string, token: string) {
  const { data, error } = await requireSupabase().auth.verifyOtp({
    email: normalizeEmail(email),
    token: token.trim(),
    type: "signup",
  });
  if (error) throw error;
  return data;
}

export async function resendSignupCode(email: string) {
  const { error } = await requireSupabase().auth.resend({
    type: "signup",
    email: normalizeEmail(email),
  });
  if (error) throw error;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email: string) {
  const callback = import.meta.env.VITE_TOXITY_AUTH_CALLBACK_URL;
  if (!callback) {
    throw new Error("A recuperação ainda não está configurada para este ambiente.");
  }
  const { error } = await requireSupabase().auth.resetPasswordForEmail(
    normalizeEmail(email),
    {
      redirectTo: callback,
    },
  );
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw error;
}

export function mapAuthError(reason: unknown): { code: AuthErrorCode; message: string } {
  const raw = reason instanceof Error ? reason.message.toLowerCase() : "";
  if (!raw || raw.includes("network") || raw.includes("fetch"))
    return { code: "network", message: "Não foi possível conectar ao serviço. Tente novamente." };
  if (raw.includes("invalid login") || raw.includes("invalid credentials"))
    return { code: "invalid_credentials", message: "E-mail ou senha inválidos." };
  if (raw.includes("not confirmed") || raw.includes("email not confirmed"))
    return { code: "email_not_confirmed", message: "Confirme seu e-mail antes de entrar." };
  if (raw.includes("expired") || raw.includes("invalid or has expired"))
    return { code: "expired", message: "Este link expirou. Solicite uma nova recuperação." };
  if (raw.includes("rate limit") || raw.includes("too many"))
    return { code: "rate_limited", message: "Muitas tentativas. Aguarde alguns instantes." };
  return { code: "unknown", message: "Não foi possível concluir esta operação agora." };
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}
