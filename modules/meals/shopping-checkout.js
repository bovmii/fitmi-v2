// "J'ai fait les courses" modal: captures the total spent, optional
// store name, date, and whether to tick every shopping item as
// bought. On submit: creates an Alimentation expense with a sensible
// description, and toggles unchecked items.

import { icon } from '../../core/icons.js';
import { showToast } from '../../core/ui.js';
import { todayStr, formatWeekRange } from '../../core/date.js';
import { saveExpense } from '../budget/data.js';
import { getShoppingForWeek, toggleShoppingItem } from './data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openShoppingCheckout({ weekKey }) {
  return new Promise((resolve) => {
    const state = {
      amount: '',
      store: '',
      date: todayStr(),
      markAllBought: true,
    };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <form class="drawer habit-form">
        <div class="drawer-header">
          <h2>J'ai fait les courses</h2>
          <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
        </div>
        <div class="drawer-body">
          <p class="settings-hint" style="margin-bottom:14px;">Une dépense sera ajoutée au Budget dans la catégorie Alimentation.</p>

          <label class="auth-field">
            <span>Montant total</span>
            <div class="amount-row">
              <input type="number" name="amount" inputmode="decimal" step="0.01" min="0" required autofocus placeholder="0,00">
              <span class="amount-currency">€</span>
            </div>
          </label>

          <label class="auth-field">
            <span>Magasin (optionnel)</span>
            <input type="text" name="store" placeholder="Carrefour, Lidl…">
          </label>

          <label class="auth-field">
            <span>Date</span>
            <input type="date" name="date" required value="${state.date}" max="${todayStr()}">
          </label>

          <label class="toggle-line" style="background:var(--bg);border:1px solid var(--border);padding:10px 12px;border-radius:10px;">
            <input type="checkbox" name="markAll" checked>
            <span>Marquer tous les articles comme achetés</span>
          </label>

          <div class="form-actions">
            <button type="submit" class="auth-submit">Enregistrer</button>
          </div>
        </div>
      </form>
    `;
    document.body.appendChild(overlay);

    const close = (v) => { overlay.remove(); resolve(v); };
    overlay.querySelector('[data-close]').onclick = () => close(null);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

    overlay.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const amount = Number(fd.get('amount'));
      if (!amount || amount <= 0) return;
      const store = (fd.get('store') || '').toString().trim();
      const date = fd.get('date').toString();
      const markAll = e.target.querySelector('input[name="markAll"]').checked;

      const description = `Courses — semaine du ${formatWeekRange(weekKey).split('—')[0].trim()}` + (store ? ` · ${store}` : '');

      await saveExpense({
        amount,
        category: 'Alimentation',
        description,
        date,
      });

      if (markAll) {
        const items = await getShoppingForWeek(weekKey);
        for (const it of items) {
          if (!it.checked) await toggleShoppingItem(it.id);
        }
      }

      showToast(`Dépense enregistrée — ${amount.toFixed(2).replace('.', ',')} €`);
      close({ logged: true, amount, markAll });
    });
  });
}
