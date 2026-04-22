// Entry point.
//
// Boot order:
//   1. Theme.init        — right palette on first paint.
//   2. DB.open           — so subsequent put() has a store to land in.
//   3. maybeMigrate      — pulls legacy PWA data into fitmi (first run).
//   4. Auth.init         — reads cached Supabase session.
//   5. render()          — either the login screen or the placeholder
//                          shell depending on auth state.
//   6. initSync          — wires online/offline listeners, drains outbox.
//
// Whether Supabase is configured or not, the app remains usable: in
// local-only mode Auth sets a synthetic user and sync is a no-op.

import { Theme, showToast, confirmModal } from './core/ui.js';
import { DB } from './core/db.js';
import { initFitmiDB, FITMI_DB_NAME, FITMI_DB_VERSION } from './core/schema.js';
import { runMigrationIfNeeded, migrationStatus, markAllDirty } from './core/migration.js';
import { Auth } from './core/auth.js';
import { initSync, syncNow, onSync, isOnline } from './core/sync.js';
import { isConfigured } from './core/supabase.js';
import { renderLogin } from './modules/auth/login.js';
import { openPasswordChange } from './modules/auth/password-change.js';

const $ = (id) => document.getElementById(id);

function setNet() {
  const el = $('net');
  if (!el) return;
  el.textContent = isOnline() ? '● en ligne' : '● hors-ligne';
  el.dataset.state = isOnline() ? 'online' : 'offline';
}

function isRecoveryRedirect() {
  const hash = window.location.hash || '';
  const query = window.location.search || '';
  return hash.includes('type=recovery') || query.includes('reset=1') || hash === '#reset';
}

async function legacyDetected() {
  const names = ['mealplanner', 'habitstack', 'budgetflow'];
  const found = [];
  for (const name of names) {
    await new Promise((resolve) => {
      const req = indexedDB.open(name);
      req.onsuccess = (e) => {
        const db = e.target.result;
        if (db.objectStoreNames.length > 0) found.push(name);
        db.close();
        resolve();
      };
      req.onerror = () => resolve();
    });
  }
  return found;
}

async function maybeMigrate() {
  if (migrationStatus().done) return false;
  const candidates = await legacyDetected();
  if (candidates.length === 0) return false;

  const go = await confirmModal(
    `Des données d'anciennes apps (${candidates.join(', ')}) ont été détectées. ` +
    `Les importer dans fit.mi v2 ? Un backup JSON sera téléchargé avant l'import.`,
    { confirmText: 'Importer', cancelText: 'Plus tard' },
  );
  if (!go) return false;

  const result = await runMigrationIfNeeded({
    onProgress: ({ step }) => {
      const label = {
        dump: 'Lecture des anciennes données…',
        backup: 'Téléchargement du backup JSON…',
        import: 'Copie dans fit.mi…',
        cleanup: 'Nettoyage…',
      }[step] || step;
      const s = $('status');
      if (s) s.textContent = label;
    },
  });
  if (result.migrated) {
    const total = Object.values(result.totals || {}).reduce((a, b) => a + b, 0);
    showToast(`Migration OK : ${total} entrées importées.`);
    await markAllDirty();
    return true;
  }
  return false;
}

function renderPlaceholder(root) {
  const u = Auth.getUser();
  const mode = isConfigured()
    ? (Auth.isLocalOnly() ? 'local uniquement' : 'sync active')
    : 'local uniquement';
  root.innerHTML = `
    <div class="boot-screen">
      <div class="logo">fit<span class="accent">.mi</span></div>
      <div class="tagline">Body · Mind · Money</div>
      <div class="status" id="status">Base ${FITMI_DB_NAME} v${FITMI_DB_VERSION} — ${mode}</div>
      <div class="auth-slot" id="auth-slot"></div>
      <div class="net" id="net"></div>
    </div>
  `;
  const slot = $('auth-slot');
  if (!isConfigured()) {
    slot.innerHTML = `<span class="muted">Mode local (Supabase non configuré)</span>`;
  } else if (u) {
    slot.innerHTML = `
      <div class="user-pill">
        ${u.avatar_url ? `<img src="${u.avatar_url}" alt="" class="avatar">` : ''}
        <span>${u.name || u.email}</span>
      </div>
      <div class="user-actions">
        <button class="btn-link" id="btn-change-password">Changer mot de passe</button>
        <span class="auth-sep">·</span>
        <button class="btn-link" id="btn-logout">Se déconnecter</button>
      </div>
    `;
    $('btn-logout').onclick = () => Auth.logout();
    $('btn-change-password').onclick = () => openPasswordChange();
  }
  setNet();
}

async function render() {
  const app = $('app');
  if (!app) return;

  if (isConfigured() && !Auth.isAuthenticated()) {
    // Not signed in yet — show the login screen.
    renderLogin(app);
    return;
  }

  renderPlaceholder(app);
}

async function main() {
  Theme.init();
  window.addEventListener('online', setNet);
  window.addEventListener('offline', setNet);

  initFitmiDB();
  try {
    await DB.open();
  } catch (err) {
    console.error('[main] DB open failed', err);
    const app = $('app');
    if (app) app.innerHTML = `<div class="boot-screen"><div class="status">Erreur : impossible d'ouvrir la base.</div></div>`;
    return;
  }

  await maybeMigrate();

  await Auth.init();

  // Auth.onChange fires once immediately with the current session, so
  // the initial render happens from this subscription. It also handles
  // later auth transitions (login, logout, user-updated).
  Auth.onChange(() => {
    if (isRecoveryRedirect()) renderLogin($('app'));
    else render();
  });

  initSync();
  onSync(({ event, payload }) => {
    if (event === 'sync.push.done' || event === 'sync.pull.done') {
      const p = payload?.pushed ?? payload?.pulled ?? 0;
      if (p > 0) showToast(`Sync : ${event === 'sync.push.done' ? 'envoyé' : 'reçu'} ${p}`);
    }
    if (event === 'sync.offline') showToast('Hors-ligne — les écritures seront synchronisées au retour');
    if (event === 'sync.online') showToast('De retour en ligne — sync en cours…');
  });

  if (Auth.isAuthenticated() && !Auth.isLocalOnly()) {
    await syncNow();
  }
}

main().catch((err) => {
  console.error('[main] fatal', err);
  const app = $('app');
  if (app) app.innerHTML = `<div class="boot-screen"><div class="status">Erreur fatale — voir console.</div></div>`;
});
