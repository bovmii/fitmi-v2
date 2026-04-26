// Settings drawer. Opens from the gear icon in the header. Contains:
//   - Profile: display name, email (read-only for now)
//   - Theme: auto / dark / light
//   - Data: export / import / reset local cache
//   - Sync: current status + force sync
//   - Session: change password, sign out
//
// Module-scoped mounting function; renders a full-screen overlay that
// mimics a bottom sheet on mobile.

import { Theme } from '../../core/ui.js';
import { Auth } from '../../core/auth.js';
import { DB } from '../../core/db.js';
import { icon } from '../../core/icons.js';
import { showToast, confirmModal } from '../../core/ui.js';
import { syncNow } from '../../core/sync.js';
import { openPasswordChange } from '../auth/password-change.js';
import { isConfigured } from '../../core/supabase.js';
import { openTdeeModal } from '../nutrition/tdee.js';
import { getTdeeProfile, getNutritionTargets } from '../nutrition/data.js';

export async function openSettings() {
  const existing = document.getElementById('settings-drawer');
  if (existing) existing.remove();

  const u = Auth.getUser();
  const [tdeeProfile, targets] = await Promise.all([getTdeeProfile(), getNutritionTargets()]);
  const tdeeSummary = (tdeeProfile && targets.kcal > 0)
    ? `<div class="settings-row"><span class="settings-label">Objectif</span><span class="settings-value">${targets.kcal} kcal · ${targets.protein}P / ${targets.carbs}G / ${targets.fat}L</span></div>`
    : `<div class="settings-row"><span class="settings-label">Objectif</span><span class="settings-value" style="color:var(--text-muted)">Non configuré</span></div>`;
  const overlay = document.createElement('div');
  overlay.id = 'settings-drawer';
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `
    <div class="drawer">
      <div class="drawer-header">
        <h2>Réglages</h2>
        <button class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
      </div>
      <div class="drawer-body">

        <section class="settings-section">
          <div class="settings-section-title">Profil</div>
          <div class="settings-row">
            <span class="settings-label">Nom</span>
            <span class="settings-value">${u?.name || '—'}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Email</span>
            <span class="settings-value">${u?.email || '—'}</span>
          </div>
          ${tdeeSummary}
          <button class="settings-btn" id="btn-open-tdee">
            ${icon('settings', { size: 16 })}<span>Configurer mes besoins</span>
          </button>
        </section>

        <section class="settings-section">
          <div class="settings-section-title">Thème</div>
          <div class="settings-segment" data-segment="theme">
            ${['auto', 'dark', 'light'].map((m) => `
              <button data-theme="${m}" class="${Theme.get() === m ? 'active' : ''}">${({ auto: 'Système', dark: 'Sombre', light: 'Clair' })[m]}</button>
            `).join('')}
          </div>
        </section>

        ${isConfigured() ? `
          <section class="settings-section">
            <div class="settings-section-title">Synchronisation</div>
            <div class="settings-row">
              <span class="settings-label">État</span>
              <span class="settings-value" id="sync-status">${navigator.onLine ? 'en ligne' : 'hors-ligne'}</span>
            </div>
            <button class="settings-btn" id="btn-sync-now">
              ${icon('refresh', { size: 16 })}<span>Synchroniser maintenant</span>
            </button>
          </section>
        ` : ''}

        <section class="settings-section">
          <div class="settings-section-title">Données</div>
          <button class="settings-btn" id="btn-export">
            ${icon('download', { size: 16 })}<span>Exporter en JSON</span>
          </button>
          <button class="settings-btn danger" id="btn-reset-local">
            ${icon('trash', { size: 16 })}<span>Vider la base locale</span>
          </button>
          ${isConfigured() ? `<small class="settings-hint">Les données dans Supabase restent intactes — elles reviendront à la prochaine sync.</small>` : ''}
        </section>

        <section class="settings-section">
          <div class="settings-section-title">Session</div>
          ${isConfigured() ? `
            <button class="settings-btn" id="btn-change-pw">
              ${icon('edit', { size: 16 })}<span>Changer le mot de passe</span>
            </button>
          ` : ''}
          <button class="settings-btn" id="btn-logout">
            ${icon('logout', { size: 16 })}<span>Se déconnecter</span>
          </button>
        </section>

        <section class="settings-section">
          <div class="settings-section-title">À propos</div>
          <div class="settings-row">
            <span class="settings-label">Version</span>
            <span class="settings-value">fit.mi v2 · phase 3</span>
          </div>
        </section>

      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);

  overlay.querySelector('#btn-open-tdee').addEventListener('click', () => {
    close();
    openTdeeModal();
  });

  overlay.querySelector('[data-segment="theme"]').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-theme]');
    if (!btn) return;
    Theme.set(btn.dataset.theme);
    overlay.querySelectorAll('[data-segment="theme"] button').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
  });

  overlay.querySelector('#btn-sync-now')?.addEventListener('click', async () => {
    const res = await syncNow();
    showToast(`Sync : ${res.pushed || 0} envoyés · ${res.pulled || 0} reçus`);
  });

  overlay.querySelector('#btn-export')?.addEventListener('click', exportJson);
  overlay.querySelector('#btn-reset-local')?.addEventListener('click', async () => {
    const ok = await confirmModal(
      'Vider la base locale ? La sync recopiera tout depuis Supabase au prochain démarrage.',
      { confirmText: 'Vider', cancelText: 'Annuler', danger: true },
    );
    if (!ok) return;
    await resetLocal();
    showToast('Base locale vidée — rechargement…');
    setTimeout(() => window.location.reload(), 700);
  });
  overlay.querySelector('#btn-change-pw')?.addEventListener('click', () => {
    close();
    openPasswordChange();
  });
  overlay.querySelector('#btn-logout')?.addEventListener('click', () => Auth.logout());
}

async function exportJson() {
  const STORES = [
    'food_log', 'custom_foods', 'water_log', 'meals', 'recipes',
    'shopping_extra', 'favorites', 'exercises', 'workouts', 'sets',
    'templates', 'weight_log', 'habits', 'completions', 'expenses',
    'subscriptions', 'savings', 'settings',
  ];
  const out = { version: 2, createdAt: new Date().toISOString(), data: {} };
  for (const s of STORES) out.data[s] = await DB.getAll(s);
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitmi-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function resetLocal() {
  const db = await DB.open();
  const stores = Array.from(db.objectStoreNames);
  for (const s of stores) {
    await DB.clearStore(s);
  }
  // Also reset sync cursors and migration flag so the next boot rebuilds from scratch.
  localStorage.removeItem('fitmi.migration_done');
}
