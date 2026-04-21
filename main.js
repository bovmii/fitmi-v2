// Entry point.
//
// Boot order:
//   1. Theme.init — so the UI renders in the right palette immediately.
//   2. DB.open    — so any subsequent put() has a store to land in.
//   3. Migration  — pulls legacy PWA data into fitmi (only on first run).
//   4. Auth.init  — read cached Supabase session (or set a local-only one).
//   5. initSync   — wire online/offline listeners, drain outbox, pull.
//
// Whether Supabase is configured or not, the app remains usable: when
// config.js is empty strings, Auth sets a synthetic local user and sync
// is a no-op.

import { Theme, showToast, confirmModal } from './core/ui.js';
import { DB } from './core/db.js';
import { initFitmiDB, FITMI_DB_NAME, FITMI_DB_VERSION } from './core/schema.js';
import { runMigrationIfNeeded, migrationStatus, markAllDirty } from './core/migration.js';
import { Auth } from './core/auth.js';
import { initSync, syncNow, onSync, isOnline } from './core/sync.js';
import { isConfigured } from './core/supabase.js';

const statusEl = () => document.getElementById('status');
const authEl = () => document.getElementById('auth-slot');
const netEl = () => document.getElementById('net');

function setStatus(line) {
  const el = statusEl();
  if (el) el.textContent = line;
}

function renderNet() {
  const el = netEl();
  if (!el) return;
  el.textContent = isOnline() ? '● en ligne' : '● hors-ligne';
  el.dataset.state = isOnline() ? 'online' : 'offline';
}

function renderAuth() {
  const slot = authEl();
  if (!slot) return;
  if (!isConfigured()) {
    slot.innerHTML = `<span class="muted">Mode local (Supabase non configuré)</span>`;
    return;
  }
  if (!Auth.isAuthenticated()) {
    slot.innerHTML = `<button class="btn-login" id="btn-login">Se connecter avec GitHub</button>`;
    slot.querySelector('#btn-login').onclick = () => Auth.login();
    return;
  }
  const u = Auth.getUser();
  slot.innerHTML = `
    <span class="user-pill">
      ${u.avatar_url ? `<img src="${u.avatar_url}" alt="" class="avatar">` : ''}
      <span>${u.name || u.login}</span>
      <button class="btn-link" id="btn-logout">Se déconnecter</button>
    </span>
  `;
  slot.querySelector('#btn-logout').onclick = () => Auth.logout();
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
  if (!go) {
    setStatus(`Import reporté — ${candidates.join(', ')}`);
    return false;
  }
  setStatus('Migration en cours…');
  const result = await runMigrationIfNeeded({
    onProgress: ({ step }) => {
      const label = {
        dump: 'Lecture des anciennes données…',
        backup: 'Téléchargement du backup JSON…',
        import: 'Copie dans fit.mi…',
        cleanup: 'Nettoyage…',
      }[step] || step;
      setStatus(label);
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

async function main() {
  Theme.init();
  window.addEventListener('online', renderNet);
  window.addEventListener('offline', renderNet);
  renderNet();

  initFitmiDB();

  setStatus('Ouverture de la base fit.mi…');
  try {
    await DB.open();
  } catch (err) {
    console.error('[main] DB open failed', err);
    setStatus('Erreur : impossible d\'ouvrir la base.');
    return;
  }

  await maybeMigrate();

  await Auth.init();
  Auth.onChange(renderAuth);
  renderAuth();

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

  const mode = isConfigured() ? (Auth.isAuthenticated() ? 'connecté' : 'en attente de login') : 'mode local';
  setStatus(`Base ${FITMI_DB_NAME} v${FITMI_DB_VERSION} prête — ${mode}`);
}

main().catch((err) => {
  console.error('[main] fatal', err);
  setStatus('Erreur fatale — voir console');
});
