// Habit add/edit modal. Presents name + icon picker + color swatches +
// frequency toggle (daily / specific days) + optional reminder time.
// Resolves with the saved habit, or null if cancelled.

import { icon, iconNames } from '../../core/icons.js';
import { saveHabit } from './data.js';
import { getAllSavings } from '../budget/data.js';

const AUTO_TRIGGERS = [
  { value: '',                     label: 'Manuelle (défaut)' },
  { value: 'water_goal',           label: 'Objectif eau atteint' },
  { value: 'workout',              label: 'Après un entraînement' },
  { value: 'fasting_done',         label: 'Jeûne complété' },
  { value: 'calories_ok',          label: 'Calories dans la cible (±10 %)' },
  { value: 'weight_logged',        label: 'Poids saisi dans la journée' },
  { value: 'expense_under_daily',  label: 'Sous le budget quotidien' },
];

// Curated subset of Lucide icons that map well to habits. The full
// icon library has more — users who want something exotic can pick
// from the extended list below.
const ICON_PICKS = [
  'droplet', 'utensils', 'dumbbell', 'activity', 'heart', 'zap',
  'book', 'moon', 'coffee', 'flame', 'star', 'target', 'bell',
  'refresh', 'edit', 'shoppingCart',
];

const COLORS = [
  '#c4a87a', // brand accent
  '#3b82f6', // blue
  '#10b981', // green
  '#8b5cf6', // violet
  '#ef4444', // red
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
];

const DAYS_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
// JS Date.getDay returns 0 = Sunday ... 6 = Saturday. Our UI shows
// Monday first, so map visual index → JS day value.
const DAY_TO_JS = [1, 2, 3, 4, 5, 6, 0];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openHabitForm({ habit = null } = {}) {
  return new Promise(async (resolve) => {
    const savingsGoals = await getAllSavings();
    const state = {
      name: habit?.name || '',
      icon: habit?.icon || 'target',
      color: habit?.color || COLORS[0],
      frequency: habit?.frequency || 'daily',
      days: new Set((habit?.days || []).map(Number)),
      reminder: habit?.reminder || '',
      autoTrigger: habit?.autoTrigger || '',
      savingsBoost: Boolean(habit?.savingsBoost),
      linkedGoalId: habit?.linkedGoalId || (savingsGoals[0]?.id || ''),
      virtualAmount: habit?.virtualAmount || '',
    };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    const rendered = render();
    overlay.innerHTML = rendered;
    document.body.appendChild(overlay);

    bind();

    function render() {
      return `
        <form class="drawer habit-form">
          <div class="drawer-header">
            <h2>${habit ? 'Modifier l\'habitude' : 'Nouvelle habitude'}</h2>
            <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
          </div>
          <div class="drawer-body">

            <label class="auth-field">
              <span>Nom</span>
              <input type="text" name="name" required autofocus value="${escapeHtml(state.name)}" placeholder="Boire 2 litres d'eau">
            </label>

            <div class="auth-field">
              <span>Icône</span>
              <div class="icon-grid" data-grid="icon">
                ${ICON_PICKS.map((n) => `
                  <button type="button" class="icon-pick ${state.icon === n ? 'active' : ''}" data-icon="${n}" style="${state.icon === n ? `color:${state.color};` : ''}">
                    ${icon(n, { size: 22, stroke: 1.8 })}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="auth-field">
              <span>Couleur</span>
              <div class="color-grid" data-grid="color">
                ${COLORS.map((c) => `
                  <button type="button" class="color-pick ${state.color === c ? 'active' : ''}" data-color="${c}" style="background:${c};"></button>
                `).join('')}
              </div>
            </div>

            <div class="auth-field">
              <span>Fréquence</span>
              <div class="settings-segment" data-segment="frequency">
                <button type="button" data-frequency="daily" class="${state.frequency === 'daily' ? 'active' : ''}">Tous les jours</button>
                <button type="button" data-frequency="specific" class="${state.frequency === 'specific' ? 'active' : ''}">Jours choisis</button>
              </div>
              <div class="days-grid ${state.frequency === 'specific' ? '' : 'hidden'}" data-grid="days">
                ${DAYS_LABELS.map((label, i) => {
                  const js = DAY_TO_JS[i];
                  const on = state.days.has(js);
                  return `<button type="button" class="day-pick ${on ? 'active' : ''}" data-day="${js}">${label}</button>`;
                }).join('')}
              </div>
            </div>

            <label class="auth-field">
              <span>Rappel (optionnel)</span>
              <input type="time" name="reminder" value="${escapeHtml(state.reminder)}">
            </label>

            <label class="auth-field">
              <span>Auto-complétion</span>
              <select name="autoTrigger">
                ${AUTO_TRIGGERS.map((t) => `<option value="${t.value}" ${state.autoTrigger === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
              <small>Se coche toute seule quand la condition est remplie dans la journée.</small>
            </label>

            <div class="auth-field">
              <span>Habitude anti-dépense</span>
              <label class="toggle-line">
                <input type="checkbox" name="savingsBoost" ${state.savingsBoost ? 'checked' : ''}>
                <span>Chaque check ajoute une somme à un objectif d'épargne</span>
              </label>
              ${state.savingsBoost ? `
                ${savingsGoals.length === 0
                  ? `<small class="muted">Crée d'abord un objectif d'épargne dans Budget pour lier cette habitude.</small>`
                  : `
                    <select name="linkedGoalId">
                      ${savingsGoals.map((g) => `<option value="${g.id}" ${state.linkedGoalId === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
                    </select>
                    <div class="amount-row compact" style="margin-top:6px;">
                      <input type="number" name="virtualAmount" min="0" step="0.1" value="${escapeHtml(state.virtualAmount)}" placeholder="Montant virtuel par check">
                      <span class="amount-currency">€</span>
                    </div>
                  `}
              ` : ''}
            </div>

            <div class="form-actions">
              <button type="submit" class="auth-submit">${habit ? 'Enregistrer' : 'Créer l\'habitude'}</button>
              ${habit ? `<button type="button" class="settings-btn danger" data-delete>${icon('trash', { size: 16 })}<span>Supprimer</span></button>` : ''}
            </div>
          </div>
        </form>
      `;
    }

    function refresh() {
      overlay.innerHTML = render();
      bind();
    }

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    function bind() {
      overlay.querySelector('[data-close]').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

      overlay.querySelectorAll('[data-grid="icon"] button').forEach((b) => {
        b.onclick = () => { state.icon = b.dataset.icon; refresh(); };
      });
      overlay.querySelectorAll('[data-grid="color"] button').forEach((b) => {
        b.onclick = () => { state.color = b.dataset.color; refresh(); };
      });
      overlay.querySelectorAll('[data-segment="frequency"] button').forEach((b) => {
        b.onclick = () => { state.frequency = b.dataset.frequency; refresh(); };
      });
      overlay.querySelectorAll('[data-grid="days"] button').forEach((b) => {
        b.onclick = () => {
          const d = Number(b.dataset.day);
          if (state.days.has(d)) state.days.delete(d); else state.days.add(d);
          refresh();
        };
      });

      const form = overlay.querySelector('form');
      form.querySelector('input[name="name"]').oninput = (e) => { state.name = e.target.value; };
      form.querySelector('input[name="reminder"]').onchange = (e) => { state.reminder = e.target.value; };
      form.querySelector('select[name="autoTrigger"]').onchange = (e) => { state.autoTrigger = e.target.value; };
      const boostCheckbox = form.querySelector('input[name="savingsBoost"]');
      boostCheckbox.onchange = (e) => { state.savingsBoost = e.target.checked; refresh(); };
      const goalSelect = form.querySelector('select[name="linkedGoalId"]');
      if (goalSelect) goalSelect.onchange = (e) => { state.linkedGoalId = e.target.value; };
      const amountInput = form.querySelector('input[name="virtualAmount"]');
      if (amountInput) amountInput.oninput = (e) => { state.virtualAmount = e.target.value; };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.name.trim()) return;
        if (state.frequency === 'specific' && state.days.size === 0) {
          // Graceful: fall back to daily rather than blocking the user.
          state.frequency = 'daily';
        }
        const saved = await saveHabit({
          id: habit?.id,
          name: state.name,
          icon: state.icon,
          color: state.color,
          frequency: state.frequency,
          days: [...state.days],
          reminder: state.reminder || null,
          order: habit?.order,
          archived: habit?.archived,
          autoTrigger: state.autoTrigger || null,
          savingsBoost: state.savingsBoost,
          linkedGoalId: state.savingsBoost ? state.linkedGoalId : null,
          virtualAmount: state.savingsBoost ? state.virtualAmount : 0,
        });
        close(saved);
      });

      const deleteBtn = overlay.querySelector('[data-delete]');
      if (deleteBtn) {
        deleteBtn.onclick = () => close({ deleted: true });
      }
    }
  });
}
