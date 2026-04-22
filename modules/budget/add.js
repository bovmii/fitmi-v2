// Add / edit expense modal.
// Fields: amount, category (icon grid), description, date, optional
// split-by so the stored amount is pre-divided.

import { icon } from '../../core/icons.js';
import { todayStr } from '../../core/date.js';
import { CATEGORIES } from './categories.js';
import { saveExpense } from './data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openAddExpense({ expense = null } = {}) {
  return new Promise((resolve) => {
    const state = {
      amount: expense?.amount || '',
      category: expense?.category || 'Alimentation',
      description: expense?.description || '',
      date: expense?.date || todayStr(),
      splitBy: 1,
    };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = render();
    document.body.appendChild(overlay);
    bind();

    function render() {
      const preview = state.splitBy > 1 && state.amount
        ? `<div class="split-preview">Ta part : ${(Number(state.amount) / state.splitBy).toFixed(2).replace('.', ',')} €</div>`
        : '';
      return `
        <form class="drawer habit-form">
          <div class="drawer-header">
            <h2>${expense ? 'Modifier la dépense' : 'Nouvelle dépense'}</h2>
            <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
          </div>
          <div class="drawer-body">

            <label class="auth-field">
              <span>Montant</span>
              <div class="amount-row">
                <input type="number" name="amount" inputmode="decimal" step="0.01" min="0" required autofocus value="${escapeHtml(state.amount)}" placeholder="0,00">
                <span class="amount-currency">€</span>
              </div>
            </label>

            <div class="auth-field">
              <span>Catégorie</span>
              <div class="cat-grid" data-grid="category">
                ${CATEGORIES.map((c) => `
                  <button type="button" class="cat-pick ${state.category === c.key ? 'active' : ''}" data-category="${c.key}" style="${state.category === c.key ? `--cat-color:${c.color};` : ''}">
                    <span class="cat-icon" style="color:${c.color};">${icon(c.icon, { size: 18, stroke: 2 })}</span>
                    <span class="cat-label">${c.key}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <label class="auth-field">
              <span>Description</span>
              <input type="text" name="description" value="${escapeHtml(state.description)}" placeholder="Courses, métro…">
            </label>

            <label class="auth-field">
              <span>Date</span>
              <input type="date" name="date" required value="${escapeHtml(state.date)}">
            </label>

            <label class="auth-field">
              <span>Diviser par (optionnel)</span>
              <input type="number" name="splitBy" inputmode="numeric" min="1" step="1" value="${state.splitBy}">
              <small>Partage d'addition : le montant stocké sera ÷ par ce nombre.</small>
            </label>
            ${preview}

            <div class="form-actions">
              <button type="submit" class="auth-submit">${expense ? 'Enregistrer' : 'Ajouter la dépense'}</button>
            </div>
          </div>
        </form>
      `;
    }

    function refresh() {
      overlay.innerHTML = render();
      bind();
      const firstInput = overlay.querySelector('input[name="amount"]');
      firstInput?.focus();
    }

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    function bind() {
      overlay.querySelector('[data-close]').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

      overlay.querySelectorAll('[data-grid="category"] button').forEach((b) => {
        b.onclick = () => { state.category = b.dataset.category; refresh(); };
      });

      const form = overlay.querySelector('form');
      const amountEl = form.querySelector('input[name="amount"]');
      const descEl = form.querySelector('input[name="description"]');
      const dateEl = form.querySelector('input[name="date"]');
      const splitEl = form.querySelector('input[name="splitBy"]');

      amountEl.oninput = (e) => {
        state.amount = e.target.value;
        // Live preview without full re-render, just swap the preview line.
        const existing = overlay.querySelector('.split-preview');
        if (existing) existing.remove();
        if (state.splitBy > 1 && state.amount) {
          const div = document.createElement('div');
          div.className = 'split-preview';
          div.textContent = `Ta part : ${(Number(state.amount) / state.splitBy).toFixed(2).replace('.', ',')} €`;
          splitEl.closest('label').after(div);
        }
      };
      descEl.oninput = (e) => { state.description = e.target.value; };
      dateEl.onchange = (e) => { state.date = e.target.value; };
      splitEl.oninput = (e) => {
        state.splitBy = Math.max(1, Number(e.target.value) || 1);
        amountEl.oninput({ target: amountEl }); // refresh preview
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const raw = Number(state.amount);
        if (!raw || raw <= 0) return;
        const split = Math.max(1, Number(state.splitBy) || 1);
        const per = raw / split;
        const desc = state.description || (split > 1 ? `Partagé (÷${split} de ${raw.toFixed(2)} €)` : '');
        const saved = await saveExpense({
          id: expense?.id,
          amount: per,
          category: state.category,
          description: desc,
          date: state.date,
        });
        close(saved);
      });
    }
  });
}
