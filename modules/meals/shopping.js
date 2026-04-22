// "Courses" sub-view. Displays a manual shopping list plus a button
// that imports every ingredient line from the week's planned recipes.
// De-duplication is handled in data.js.

import { icon } from '../../core/icons.js';
import { confirmModal, showToast } from '../../core/ui.js';
import { formatWeekRange, getWeekKey, shiftWeek } from '../../core/date.js';
import {
  getShoppingForWeek, addShoppingItem, toggleShoppingItem,
  deleteShoppingItem, clearCheckedShopping, importWeekIngredients,
} from './data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export async function renderShopping(host, { onChange } = {}) {
  let weekKey = getWeekKey(new Date());

  host.innerHTML = `
    <div class="shopping-page">
      <div class="planner-nav">
        <button class="icon-btn" data-week-prev>${icon('chevronLeft', { size: 20 })}</button>
        <div class="planner-week">
          <div class="planner-week-range" data-range></div>
          <div class="planner-cost" data-count></div>
        </div>
        <button class="icon-btn" data-week-next>${icon('chevronRight', { size: 20 })}</button>
      </div>

      <form class="sub-form" data-add>
        <div class="form-row">
          <input type="text" name="name" placeholder="Ajouter un article…" required>
          <button type="submit" class="icon-btn" title="Ajouter">${icon('plus', { size: 20 })}</button>
        </div>
      </form>

      <div class="shopping-actions">
        <button class="settings-btn" data-import>${icon('download', { size: 14 })}<span>Importer de la semaine</span></button>
        <button class="settings-btn" data-clear>${icon('check', { size: 14 })}<span>Vider les cochés</span></button>
      </div>

      <div data-list></div>
    </div>
  `;

  host.querySelector('[data-week-prev]').onclick = () => { weekKey = shiftWeek(weekKey, -1); refresh(); };
  host.querySelector('[data-week-next]').onclick = () => { weekKey = shiftWeek(weekKey, 1); refresh(); };

  host.querySelector('[data-add]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input[name="name"]');
    if (!input.value.trim()) return;
    await addShoppingItem({ weekKey, name: input.value });
    input.value = '';
    await refresh();
    onChange?.();
  });

  host.querySelector('[data-import]').onclick = async () => {
    const result = await importWeekIngredients(weekKey);
    showToast(result.added > 0
      ? `${result.added} article${result.added > 1 ? 's' : ''} importé${result.added > 1 ? 's' : ''}`
      : 'Rien à importer (pas de recettes planifiées ou déjà importées)');
    await refresh();
  };

  host.querySelector('[data-clear]').onclick = async () => {
    const items = await getShoppingForWeek(weekKey);
    if (items.every((i) => !i.checked)) { showToast('Aucun article coché.'); return; }
    const ok = await confirmModal('Retirer tous les articles cochés de la liste ?', { confirmText: 'Vider', danger: true });
    if (!ok) return;
    await clearCheckedShopping(weekKey);
    await refresh();
  };

  await refresh();

  async function refresh() {
    host.querySelector('[data-range]').textContent = formatWeekRange(weekKey);
    const items = await getShoppingForWeek(weekKey);
    const remaining = items.filter((i) => !i.checked).length;
    host.querySelector('[data-count]').textContent =
      items.length === 0 ? 'Liste vide' :
      `${remaining} à acheter · ${items.length - remaining} coché${items.length - remaining > 1 ? 's' : ''}`;

    const list = host.querySelector('[data-list]');
    if (items.length === 0) {
      list.innerHTML = `<div class="settings-hint" style="padding:24px 0;text-align:center;">Ajoute des articles ou importe depuis le planning.</div>`;
      return;
    }
    list.innerHTML = items.map((it) => `
      <div class="shop-row ${it.checked ? 'checked' : ''}" data-id="${it.id}">
        <button class="shop-check" data-toggle>
          ${it.checked ? icon('check', { size: 16 }) : ''}
        </button>
        <div class="shop-name">${escapeHtml(it.name)}</div>
        <button class="icon-btn" data-delete>${icon('trash', { size: 14 })}</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-toggle]').forEach((b) => {
      b.onclick = async () => {
        const id = b.closest('.shop-row').dataset.id;
        await toggleShoppingItem(id);
        await refresh();
      };
    });
    list.querySelectorAll('[data-delete]').forEach((b) => {
      b.onclick = async () => {
        const id = b.closest('.shop-row').dataset.id;
        await deleteShoppingItem(id);
        await refresh();
      };
    });
  }
}
