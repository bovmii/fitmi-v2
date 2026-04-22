// Subscriptions drawer. Recurring charges that get auto-billed once
// per calendar month via processSubscriptions().

import { icon } from '../../core/icons.js';
import { confirmModal } from '../../core/ui.js';
import {
  getAllSubscriptions, saveSubscription, deleteSubscription,
} from './data.js';
import { CATEGORIES, SUBSCRIPTION_CATEGORIES, categoryByKey, formatEUR } from './categories.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openSubscriptions({ onChange } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-header">
          <h2>Abonnements</h2>
          <button class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
        </div>
        <div class="drawer-body">
          <p class="settings-hint" style="margin-bottom:16px;">Chaque abonnement crée automatiquement une dépense au 1er passage du mois.</p>

          <form class="sub-form" data-add>
            <div class="form-row">
              <input type="text" name="name" placeholder="Netflix, loyer…" required>
              <input type="number" name="amount" step="0.01" min="0" placeholder="0,00 €" required>
            </div>
            <div class="form-row">
              <select name="category">
                ${SUBSCRIPTION_CATEGORIES.map((k) => `<option value="${k}">${k}</option>`).join('')}
              </select>
              <input type="number" name="day" min="1" max="28" value="1" required title="Jour du mois">
            </div>
            <button type="submit" class="auth-submit">Ajouter l'abonnement</button>
          </form>

          <div class="settings-section-title" style="margin-top:20px;">Existants</div>
          <div data-list></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); onChange?.(); resolve(); };
    overlay.querySelector('[data-close]').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const form = overlay.querySelector('[data-add]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      await saveSubscription({
        name: fd.get('name'),
        amount: Number(fd.get('amount')),
        category: fd.get('category'),
        day: Number(fd.get('day')),
      });
      form.reset();
      form.querySelector('input[name="day"]').value = 1;
      await refresh();
    });

    async function refresh() {
      const list = overlay.querySelector('[data-list]');
      const subs = await getAllSubscriptions();
      if (subs.length === 0) {
        list.innerHTML = `<div class="settings-hint" style="text-align:center;padding:16px 0;">Aucun abonnement enregistré.</div>`;
        return;
      }
      list.innerHTML = subs.map((s) => {
        const cat = categoryByKey(s.category);
        return `
          <div class="sub-row" data-id="${s.id}">
            <span class="cat-icon" style="color:${cat.color};">${icon(cat.icon, { size: 18 })}</span>
            <div class="sub-info">
              <div class="sub-name">${escapeHtml(s.name)}</div>
              <div class="sub-meta">${escapeHtml(s.category)} · le ${s.day}</div>
            </div>
            <div class="sub-amount">${formatEUR(s.amount)}</div>
            <button class="icon-btn" data-delete>${icon('trash', { size: 16 })}</button>
          </div>
        `;
      }).join('');

      list.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.onclick = async () => {
          const id = btn.closest('.sub-row').dataset.id;
          const ok = await confirmModal('Supprimer cet abonnement ?', { confirmText: 'Supprimer', danger: true });
          if (!ok) return;
          await deleteSubscription(id);
          await refresh();
        };
      });
    }

    refresh();
  });
}
