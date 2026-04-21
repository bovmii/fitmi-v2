// Authentication: Supabase Auth with GitHub OAuth.
//
// When Supabase is unconfigured the module runs in "local-only" mode:
// isAuthenticated() returns true, getUser() returns a synthetic local
// user and the rest of the app behaves as if logged in. This lets the
// user keep working on their Mac / phone before the cloud sync is
// wired.
//
// When Supabase is configured the flow is:
//   1. User clicks "Se connecter avec GitHub"
//   2. signInWithOAuth() redirects to GitHub → back to the app
//   3. detectSessionInUrl picks the access_token out of the URL hash
//   4. onAuthStateChange fires with the session
//   5. We check the GitHub login against ALLOWED_GITHUB_LOGINS; if not in
//      the list, we sign them out immediately.

import { client, isConfigured } from './supabase.js';
import { ALLOWED_GITHUB_LOGINS } from '../config.js';

const LOCAL_USER = {
  id: 'local',
  login: 'local',
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
    login: meta.user_name || meta.preferred_username || meta.user_name || 'unknown',
    name: meta.full_name || meta.name || meta.user_name || 'Toi',
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
    await this._applySession(session);
    sb.auth.onAuthStateChange((_event, next) => {
      this._applySession(next);
    });
  },

  async _applySession(session) {
    if (!session) {
      _session = null;
      notify();
      return;
    }
    const login = sessionToUser(session)?.login;
    if (!ALLOWED_GITHUB_LOGINS.includes(login)) {
      const sb = await client();
      await sb.auth.signOut();
      _session = null;
      notify();
      return;
    }
    _session = session;
    notify();
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

  async login() {
    if (!isConfigured()) {
      console.warn('[auth] Supabase not configured — login is a no-op');
      return;
    }
    const sb = await client();
    await sb.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: 'read:user',
      },
    });
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
