// Supabase client singleton. Loaded from esm.sh so we stay build-less.
// When config is empty (SUPABASE_URL / SUPABASE_ANON_KEY), `client()`
// returns null and callers fall back to local-only mode.

import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabaseConfig } from '../config.js';

let _client = null;
let _loading = null;

async function load() {
  if (!hasSupabaseConfig()) return null;
  if (_client) return _client;
  if (_loading) return _loading;
  _loading = (async () => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: 'fitmi.auth',
      },
      realtime: { params: { eventsPerSecond: 5 } },
    });
    return _client;
  })();
  return _loading;
}

export async function client() {
  return load();
}

export function isConfigured() {
  return hasSupabaseConfig();
}
