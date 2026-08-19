import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isBackendConfigured = Boolean(url && key && !url.includes('SEU-PROJETO'));

export const supabase = isBackendConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Recovery links may be opened on a different device/browser than
        // the one that requested them. The official implicit callback flow
        // lets Supabase restore that session without the renderer or Electron
        // handling tokens.
        flowType: 'implicit',
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.');
  return supabase;
}
