// Savings goals drawer. Create a goal, nudge the saved amount up or
// down, delete. Progress bar fills based on saved / target.

import { icon } from '../../core/icons.js';
import { confirmModal } from '../../core/ui.js';
import {
  getAllSavings, saveSavings, adjustSavings, deleteSavings,
} from './data.js';
import { formatEUR } from './categories.js';

const GOAL_ICONS = ['target', 'star', 'heart', 'zap', 'gift', 'briefcase', 'home', 'car'];
const GOAL_COLORS = ['#c4a87a', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#14b8a6'];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function goalProgress(goal) {
  const pct = goal.target > 0 ? Math.min(100, (goal.saved / goal.target) * 100) : 0;
  return Math.round(pct);
}

export function openSavings({ onChange } = {}) {
  return new Promise((resolve) => {
    let formState = { name: '', target: '', icon: GOAL_ICONS[0], color: GOAL_COLORS[0] };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-header">
          <h2>Objectifs d'épargne</h2>
          <button class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
        </div>
        <div class="drawer-body">
          <div data-form></div>
          <div class="settings-section-title" style="margin-top:20px;">En cours</div>
          <div data-list></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); onChange?.(); resolve(); };
    overlay.querySelector('[data-close]').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    renderForm();
    refresh();

    function renderForm() {
      const host = overlay.querySelector('[data-form]');
      host.innerHTML = `
        <form class="sub-form" data-new-goal>
          <div class="form-row">
            <input type="text" name="name" placeholder="Vacances, iPhone…" required value="${escapeHtml(formState.name)}">
            <input type="number" name="target" step="0.01" min="0" placeholder="Objectif €" required value="${escapeHtml(formState.target)}">
          </div>
          <div class="icon-grid" style="grid-template-columns:repeat(8,1fr);">
            ${GOAL_ICONS.map((n) => `
              <button type="button" class="icon-pick ${formState.icon === n ? 'active' : ''}" data-icon="${n}" style="${formState.icon === n ? `color:${formState.color};` : ''}">
                ${icon(n, { size: 18 })}
              </button>
            `).join('')}
          </div>
          <div class="color-grid" style="margin-top:8px;">
            ${GOAL_COLORS.map((c) => `
              <button type="button" class="color-pick ${formState.color === c ? 'active' : ''}" data-color="${c}" style="background:${c};"></button>
            `).join('')}
          </div>
          <button type="submit" class="auth-submit" style="margin-top:10px;">Créer l'objectif</button>
        </form>
      `;
      const form = host.querySelector('form');
      form.querySelectorAll('[data-icon]').forEach((b) => {
        b.onclick = () => { formState.icon = b.dataset.icon; renderForm(); };
      });
      form.querySelectorAll('[data-color]').forEach((b) => {
        b.onclick = () => { formState.color = b.dataset.color; renderForm(); };
      });
      form.querySelector('input[name="name"]').oninput = (e) => { formState.name = e.target.value; };
      form.querySelector('input[name="target"]').oninput = (e) => { formState.target = e.target.value; };
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!formState.name.trim() || !Number(formState.target)) return;
        await saveSavings({
          name: formState.name,
          target: Number(formState.target),
          saved: 0,
          icon: formState.icon,
          color: formState.color,
        });
        formState = { name: '', target: '', icon: GOAL_ICONS[0], color: GOAL_COLORS[0] };
        renderForm();
        await refresh();
      });
    }

    async function refresh() {
      const list = overlay.querySelector('[data-list]');
      const goals = await getAllSavings();
      if (goals.length === 0) {
        list.innerHTML = `<div class="settings-hint" style="text-align:center;padding:16px 0;">Aucun objectif pour l'instant.</div>`;
        return;
      }
      list.innerHTML = goals.map((g) => {
        const pct = goalProgress(g);
        const done = pct >= 100;
        return `
          <div class="goal-card ${done ? 'done' : ''}" data-id="${g.id}" style="--goal-color:${g.color};">
            <div class="goal-head">
              <span class="goal-icon" style="color:${g.color};">${icon(g.icon || 'target', { size: 20, stroke: 2 })}</span>
              <div class="goal-info">
                <div class="goal-name">${escapeHtml(g.name)}</div>
                <div class="goal-meta">${formatEUR(g.saved)} <span>/ ${formatEUR(g.target)}</span></div>
              </div>
              <button class="icon-btn" data-delete>${icon('trash', { size: 16 })}</button>
            </div>
            <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct}%;background:${g.color};"></div></div>
            <div class="goal-actions">
              <input type="number" step="0.01" min="0" placeholder="Montant €" data-amount>
              <button class="settings-btn" data-op="add">${icon('plus', { size: 14 })}<span>Ajouter</span></button>
              <button class="settings-btn" data-op="sub">${icon('minus', { size: 14 })}<span>Retirer</span></button>
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.goal-card').forEach((card) => {
        const id = card.dataset.id;
        const amountEl = card.querySelector('[data-amount]');
        card.querySelector('[data-op="add"]').onclick = async () => {
          const v = Number(amountEl.value);
          if (!v) return;
          await adjustSavings(id, v);
          await refresh();
        };
        card.querySelector('[data-op="sub"]').onclick = async () => {
          const v = Number(amountEl.value);
          if (!v) return;
          await adjustSavings(id, -v);
          await refresh();
        };
        card.querySelector('[data-delete]').onclick = async () => {
          const ok = await confirmModal('Supprimer cet objectif ?', { confirmText: 'Supprimer', danger: true });
          if (!ok) return;
          await deleteSavings(id);
          await refresh();
        };
      });
    }
  });
}
