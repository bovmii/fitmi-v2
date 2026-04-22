// Budget settings drawer: monthly budget + per-category limits.

import { icon } from '../../core/icons.js';
import {
  getMonthlyBudget, setMonthlyBudget, getCategoryLimits, setCategoryLimit,
} from './data.js';
import { CATEGORIES, categoryByKey, formatEUR } from './categories.js';

export function openBudgetSettings({ onChange } = {}) {
  return new Promise(async (resolve) => {
    const monthly = await getMonthlyBudget();
    const limits = await getCategoryLimits();

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-header">
          <h2>Budget & plafonds</h2>
          <button class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
        </div>
        <div class="drawer-body">
          <section class="settings-section">
            <div class="settings-section-title">Budget mensuel global</div>
            <label class="auth-field">
              <span>Montant</span>
              <div class="amount-row">
                <input type="number" step="0.01" min="0" id="monthly-input" value="${monthly || ''}" placeholder="0,00">
                <span class="amount-currency">€</span>
              </div>
            </label>
          </section>

          <section class="settings-section">
            <div class="settings-section-title">Plafonds par catégorie</div>
            <p class="settings-hint" style="margin-bottom:10px;">Laisse vide pour ne pas définir de plafond.</p>
            ${CATEGORIES.map((c) => `
              <div class="cat-limit-row">
                <span class="cat-icon" style="color:${c.color};">${icon(c.icon, { size: 16 })}</span>
                <span class="cat-limit-name">${c.key}</span>
                <div class="amount-row compact">
                  <input type="number" step="0.01" min="0" data-limit="${c.key}" value="${limits[c.key] || ''}" placeholder="—">
                  <span class="amount-currency">€</span>
                </div>
              </div>
            `).join('')}
          </section>

          <button class="auth-submit" data-save>Enregistrer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); onChange?.(); resolve(); };
    overlay.querySelector('[data-close]').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('[data-save]').onclick = async () => {
      const newMonthly = Number(overlay.querySelector('#monthly-input').value) || 0;
      await setMonthlyBudget(newMonthly);
      for (const c of CATEGORIES) {
        const el = overlay.querySelector(`[data-limit="${c.key}"]`);
        await setCategoryLimit(c.key, el.value);
      }
      close();
    };
  });
}
