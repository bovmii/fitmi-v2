// Quick weight entry modal.

import { icon } from '../../core/icons.js';
import { todayStr } from '../../core/date.js';
import { logWeight } from './weight-data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openWeightForm({ weight = null } = {}) {
  return new Promise((resolve) => {
    const state = {
      kg: weight?.kg || '',
      date: weight?.date || todayStr(),
      note: weight?.note || '',
    };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <form class="drawer habit-form">
        <div class="drawer-header">
          <h2>${weight ? 'Modifier le poids' : 'Saisir un poids'}</h2>
          <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
        </div>
        <div class="drawer-body">
          <label class="auth-field">
            <span>Poids</span>
            <div class="amount-row">
              <input type="number" name="kg" min="25" max="250" step="0.1" required autofocus value="${escapeHtml(state.kg)}" placeholder="0,0">
              <span class="amount-currency">kg</span>
            </div>
          </label>
          <label class="auth-field">
            <span>Date</span>
            <input type="date" name="date" required value="${escapeHtml(state.date)}" max="${todayStr()}">
          </label>
          <label class="auth-field">
            <span>Note (optionnel)</span>
            <input type="text" name="note" value="${escapeHtml(state.note)}" placeholder="Après entraînement, à jeun…">
          </label>
          <button type="submit" class="auth-submit">Enregistrer</button>
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
      if (!Number(fd.get('kg'))) return;
      const saved = await logWeight({ kg: fd.get('kg'), date: fd.get('date'), note: fd.get('note') });
      close(saved);
    });
  });
}
