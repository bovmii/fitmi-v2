// Authentication: Supabase email + password.
//
// Single-user app. The first person who signs up owns the data;
// subsequent signups can be disabled globally in the Supabase dashboard.
// RLS on public.records scopes every query to auth.uid() = user_id so
// even if someone else signed up, they'd see an empty app.
//
// When Supabase is unconfigured the module runs in "local-only" mode:
// getUser() returns a synthetic local user and everything still works.

import { client, isConfigured } from './supabase.js';

const LOCAL_USER = {
  id: 'local',
  email: 'local',
  name: 'Toi (hors-ligne)',
  avatar_url: '',
  local: true,
};

let _session = null;
let _listeners = new Set();

function notify() {
  for (const l of _listeners) {
    try { l(_session); } catch (err) { console.error('[auth] listener', err); }
  }
}

function sessionToUser(session) {
  if (!session?.user) return null;
  const meta = session.user.user_metadata || {};
  return {
    id: session.user.id,
    email: session.user.email,
    name: meta.display_name || meta.full_name || session.user.email?.split('@')[0] || 'Toi',
    avatar_url: meta.avatar_url || '',
    local: false,
  };
}

export const Auth = {
  isConfigured,

  async init() {
    if (!isConfigured()) {
      _session = { user: LOCAL_USER, localOnly: true };
      notify();
      return;
    }
    const sb = await client();
    const { data: { session } } = await sb.auth.getSession();
    _session = session;
    notify();
    sb.auth.onAuthStateChange((_event, next) => {
      _session = next;
      notify();
    });
  },

  isAuthenticated() {
    return Boolean(_session?.user);
  },

  isLocalOnly() {
    return Boolean(_session?.localOnly);
  },

  getUser() {
    if (!_session) return null;
    if (_session.localOnly) return LOCAL_USER;
    return sessionToUser(_session);
  },

  getUserId() {
    if (!_session) return null;
    return _session.localOnly ? 'local' : _session.user.id;
  },

  onChange(listener) {
    _listeners.add(listener);
    listener(_session);
    return () => _listeners.delete(listener);
  },

  async signUp({ email, password, name }) {
    if (!isConfigured()) return { error: new Error('Supabase non configuré') };
    const sb = await client();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name || email.split('@')[0] },
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    return { data, error };
  },

  async signIn({ email, password }) {
    if (!isConfigured()) return { error: new Error('Supabase non configuré') };
    const sb = await client();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return { data, error };
  },

  async requestPasswordReset(email) {
    if (!isConfigured()) return { error: new Error('Supabase non configuré') };
    const sb = await client();
    // redirectTo points at the app root; Supabase appends #access_token=
    // ...&type=recovery itself, and the app detects type=recovery to
    // render the "set new password" form.
    const { data, error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    return { data, error };
  },

  async updatePassword(newPassword) {
    if (!isConfigured()) return { error: new Error('Supabase non configuré') };
    const sb = await client();
    const { data, error } = await sb.auth.updateUser({ password: newPassword });
    return { data, error };
  },

  async updateProfile({ name, email }) {
    if (!isConfigured()) return { error: new Error('Supabase non configuré') };
    const sb = await client();
    const payload = {};
    if (email) payload.email = email;
    if (name) payload.data = { display_name: name };
    const { data, error } = await sb.auth.updateUser(payload);
    return { data, error };
  },

  async logout() {
    if (isConfigured()) {
      const sb = await client();
      await sb.auth.signOut();
    }
    _session = null;
    notify();
    window.location.reload();
  },
};
