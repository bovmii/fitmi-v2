// Full habits list drawer. Opened from the dashboard's "Voir tout"
// button and from the settings page. Shows every non-archived habit
// with its streak, today's completion state, and edit / delete
// affordances. Triggers a re-render on the passed onChange callback
// so the dashboard strip updates when the drawer closes.

import { icon } from '../../core/icons.js';
import { confirmModal } from '../../core/ui.js';
import {
  getAllHabits, isCompletedToday, toggleHabit, getStreak, deleteHabit,
} from './data.js';
import { openHabitForm } from './form.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export async function openAllHabits({ onChange } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `
    <div class="drawer">
      <div class="drawer-header">
        <h2>Toutes mes habitudes</h2>
        <div style="display:flex;gap:4px;">
          <button class="icon-btn" data-add title="Ajouter">${icon('plus', { size: 22 })}</button>
          <button class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
        </div>
      </div>
      <div class="drawer-body" data-list></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    onChange?.();
  };
  overlay.querySelector('[data-close]').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('[data-add]').onclick = async () => {
    const result = await openHabitForm({});
    if (result) await refresh();
  };

  async function refresh() {
    const list = overlay.querySelector('[data-list]');
    const habits = await getAllHabits();
    if (habits.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${icon('target', { size: 36 })}</div>
          <div class="empty-text">Aucune habitude pour l'instant.</div>
          <button class="auth-submit" data-add-first>Créer la première</button>
        </div>
      `;
      list.querySelector('[data-add-first]').onclick = async () => {
        const result = await openHabitForm({});
        if (result) await refresh();
      };
      return;
    }

    const rows = await Promise.all(habits.map(async (h) => {
      const [done, streak] = await Promise.all([isCompletedToday(h.id), getStreak(h.id)]);
      return { h, done, streak };
    }));

    list.innerHTML = rows.map(({ h, done, streak }) => `
      <div class="habit-row ${done ? 'done' : ''}" data-id="${h.id}">
        <button class="habit-check" data-check style="--habit-color:${h.color};">
          <span class="habit-icon" style="color:${h.color};">${icon(h.icon || 'target', { size: 20, stroke: 2 })}</span>
        </button>
        <div class="habit-info">
          <div class="habit-name">${escapeHtml(h.name)}</div>
          <div class="habit-meta">
            <span class="habit-streak">${icon('flame', { size: 12 })}<span>${streak}</span></span>
            <span class="habit-freq">${h.frequency === 'specific' ? formatDays(h.days) : 'tous les jours'}</span>
          </div>
        </div>
        <div class="habit-actions">
          <button class="icon-btn" data-edit>${icon('edit', { size: 16 })}</button>
          <button class="icon-btn" data-delete>${icon('trash', { size: 16 })}</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.habit-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-check]').onclick = async () => {
        await toggleHabit(id);
        await refresh();
      };
      row.querySelector('[data-edit]').onclick = async () => {
        const habit = habits.find((h) => h.id === id);
        const result = await openHabitForm({ habit });
        if (result?.deleted) {
          await askAndDelete(id);
        } else if (result) {
          await refresh();
        }
      };
      row.querySelector('[data-delete]').onclick = () => askAndDelete(id);
    });
  }

  async function askAndDelete(id) {
    const ok = await confirmModal(
      'Supprimer cette habitude et toutes ses complétions ?',
      { confirmText: 'Supprimer', cancelText: 'Annuler', danger: true },
    );
    if (!ok) return;
    await deleteHabit(id);
    await refresh();
  }

  await refresh();
}

function formatDays(days) {
  if (!days || days.length === 0) return '—';
  const LABELS = { 0: 'D', 1: 'L', 2: 'M', 3: 'M', 4: 'J', 5: 'V', 6: 'S' };
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  return ORDER.filter((d) => days.includes(d)).map((d) => LABELS[d]).join(' ');
}
