import { requireSupabase } from "./supabase";

export const registrationMessage =
  "Se este e-mail puder receber uma nova confirmação, enviaremos um código de seis dígitos.";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeNametag(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export function passwordError(password: string) {
  if (password.length < 10) return "Use no mínimo 10 caracteres na senha.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return "A senha precisa ter pelo menos uma letra e um número.";
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
  const { error } = await requireSupabase().auth.resetPasswordForEmail(
    normalizeEmail(email),
    {
      redirectTo: "toxity://reset-password",
    },
  );
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}
