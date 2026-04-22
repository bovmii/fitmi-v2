// Add food modal. Two tabs:
//   "Recherche" — filter the local food database, pick an item, enter
//                 quantity in grams, logs with scaled macros.
//   "Manuel"   — free-form name + kcal + macros + quantity (stored as
//                 "per100g" = exactly what the user typed, so later
//                 quantity edits scale consistently).

import { icon } from '../../core/icons.js';
import { FOODS, FOOD_CATEGORIES, searchFoods } from './foods-db.js';
import { logFood } from './data.js';
import { todayStr } from '../../core/date.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openAddFood({ date = todayStr() } = {}) {
  return new Promise((resolve) => {
    const state = { tab: 'search', query: '', categoryFilter: null, selected: null, quantity: 100, manual: { name: '', kcal: '', p: '', c: '', f: '', quantity: 100 } };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = render();
    document.body.appendChild(overlay);
    bind();

    function render() {
      return `
        <div class="drawer">
          <div class="drawer-header">
            <h2>Ajouter un aliment</h2>
            <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
          </div>
          <div class="drawer-body">
            <div class="settings-segment" data-tabs>
              <button type="button" data-tab="search" class="${state.tab === 'search' ? 'active' : ''}">Recherche</button>
              <button type="button" data-tab="manual" class="${state.tab === 'manual' ? 'active' : ''}">Manuel</button>
            </div>

            ${state.tab === 'search' ? renderSearch() : renderManual()}
          </div>
        </div>
      `;
    }

    function renderSearch() {
      const matched = searchFoods(state.query, 60)
        .filter((f) => !state.categoryFilter || f.category === state.categoryFilter);

      if (state.selected) {
        const sel = state.selected;
        const factor = (Number(state.quantity) || 0) / 100;
        return `
          <div class="food-detail">
            <div class="food-detail-head">
              <button type="button" class="btn-link" data-back>← Retour</button>
              <div class="food-name">${escapeHtml(sel.name)}</div>
            </div>
            <div class="food-totals">
              <div><strong>${Math.round(sel.kcal * factor)}</strong><span>kcal</span></div>
              <div><strong>${round1(sel.p * factor)}</strong><span>g prot</span></div>
              <div><strong>${round1(sel.c * factor)}</strong><span>g glucides</span></div>
              <div><strong>${round1(sel.f * factor)}</strong><span>g lipides</span></div>
            </div>
            <label class="auth-field">
              <span>Quantité (g)</span>
              <div class="amount-row">
                <input type="number" min="1" step="1" name="quantity" value="${state.quantity}">
                <span class="amount-currency">g</span>
              </div>
            </label>
            <button type="button" class="auth-submit" data-log>Ajouter au journal</button>
          </div>
        `;
      }

      return `
        <div class="food-search">
          <div class="amount-row">
            <input type="search" placeholder="Rechercher…" name="query" value="${escapeHtml(state.query)}" autofocus>
            <span class="amount-currency">${icon('search', { size: 16 })}</span>
          </div>
          <div class="filter-chips" data-filters>
            <button type="button" class="chip ${state.categoryFilter === null ? 'active' : ''}" data-filter="">Tous</button>
            ${FOOD_CATEGORIES.map((c) => `
              <button type="button" class="chip ${state.categoryFilter === c ? 'active' : ''}" data-filter="${escapeHtml(c)}">${c}</button>
            `).join('')}
          </div>
          <div class="food-list">
            ${matched.length === 0
              ? `<div class="settings-hint" style="padding:24px 0;text-align:center;">Aucun résultat.</div>`
              : matched.map((f) => `
                <button type="button" class="food-row" data-pick="${escapeHtml(f.name)}">
                  <div class="food-row-name">${escapeHtml(f.name)}</div>
                  <div class="food-row-meta">${f.kcal} kcal · P ${f.p} · G ${f.c} · L ${f.f}</div>
                </button>
              `).join('')}
          </div>
        </div>
      `;
    }

    function renderManual() {
      const m = state.manual;
      return `
        <form class="manual-form" data-manual-form>
          <label class="auth-field">
            <span>Nom</span>
            <input type="text" name="name" required value="${escapeHtml(m.name)}" placeholder="Sandwich poulet">
          </label>
          <div class="form-grid-4">
            <label class="auth-field"><span>kcal</span><input type="number" min="0" step="1" name="kcal" required value="${escapeHtml(m.kcal)}"></label>
            <label class="auth-field"><span>Prot (g)</span><input type="number" min="0" step="0.1" name="p" value="${escapeHtml(m.p)}"></label>
            <label class="auth-field"><span>Gluc (g)</span><input type="number" min="0" step="0.1" name="c" value="${escapeHtml(m.c)}"></label>
            <label class="auth-field"><span>Lip (g)</span><input type="number" min="0" step="0.1" name="f" value="${escapeHtml(m.f)}"></label>
          </div>
          <label class="auth-field">
            <span>Quantité consommée (g)</span>
            <div class="amount-row">
              <input type="number" min="1" step="1" name="quantity" value="${m.quantity}">
              <span class="amount-currency">g</span>
            </div>
            <small>Les valeurs nutritionnelles ci-dessus sont pour cette quantité.</small>
          </label>
          <button type="submit" class="auth-submit">Ajouter au journal</button>
        </form>
      `;
    }

    function close(value) {
      overlay.remove();
      resolve(value);
    }

    function refresh() {
      overlay.innerHTML = render();
      bind();
    }

    function bind() {
      overlay.querySelector('[data-close]').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

      overlay.querySelectorAll('[data-tab]').forEach((b) => {
        b.onclick = () => { state.tab = b.dataset.tab; state.selected = null; refresh(); };
      });

      if (state.tab === 'search') {
        if (state.selected) {
          overlay.querySelector('[data-back]').onclick = () => { state.selected = null; refresh(); };
          const qInput = overlay.querySelector('input[name="quantity"]');
          qInput.oninput = (e) => { state.quantity = Number(e.target.value) || 0; refresh(); overlay.querySelector('input[name="quantity"]').focus(); };
          overlay.querySelector('[data-log]').onclick = async () => {
            await logFood({
              name: state.selected.name,
              quantity: state.quantity,
              per100g: state.selected,
              date,
            });
            close({ logged: true });
          };
        } else {
          const queryEl = overlay.querySelector('input[name="query"]');
          queryEl.oninput = (e) => { state.query = e.target.value; refresh(); overlay.querySelector('input[name="query"]').focus(); };
          overlay.querySelectorAll('[data-filter]').forEach((b) => {
            b.onclick = () => { state.categoryFilter = b.dataset.filter || null; refresh(); };
          });
          overlay.querySelectorAll('[data-pick]').forEach((b) => {
            b.onclick = () => {
              const food = FOODS.find((f) => f.name === b.dataset.pick);
              if (food) { state.selected = food; state.quantity = 100; refresh(); }
            };
          });
        }
      } else {
        const form = overlay.querySelector('[data-manual-form]');
        const m = state.manual;
        form.querySelectorAll('input').forEach((inp) => {
          inp.oninput = () => {
            m[inp.name] = inp.value;
          };
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!m.name.trim()) return;
          // Manual input is entered "as eaten", not per 100 g — we store
          // per100g by back-solving so future edits scale correctly.
          const q = Number(m.quantity) || 1;
          const factor = 100 / q;
          await logFood({
            name: m.name,
            quantity: q,
            per100g: {
              kcal: (Number(m.kcal) || 0) * factor,
              p:    (Number(m.p)    || 0) * factor,
              c:    (Number(m.c)    || 0) * factor,
              f:    (Number(m.f)    || 0) * factor,
            },
            date,
          });
          close({ logged: true });
        });
      }
    }
  });
}

function round1(n) { return Math.round(n * 10) / 10; }
