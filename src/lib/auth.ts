import { requireSupabase } from './supabase';

export async function signUp(email: string, password: string, displayName: string, nametag: string) {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, nametag: nametag.toLowerCase() } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email: string) {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: 'toxity://reset-password',
  });
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
