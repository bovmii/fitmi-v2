// Slot-assignment modal. Presents recipes as a pick list, plus a
// free-text "Autre" option for quick unplanned entries. Updates the
// existing meal if one was passed, otherwise creates.

import { icon } from '../../core/icons.js';
import { saveMeal, deleteMeal, getAllRecipes, SLOTS } from './data.js';
import { DAYS_FULL } from '../../core/date.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openMealForm({ weekKey, dayIndex, slot, meal = null }) {
  return new Promise(async (resolve) => {
    const recipes = await getAllRecipes();
    const state = {
      recipeId: meal?.recipeId || null,
      freeText: meal?.recipeId ? '' : (meal?.name || ''),
      servings: meal?.servings || 1,
    };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = render();
    document.body.appendChild(overlay);
    bind();

    function render() {
      const slotLabel = SLOTS.find((s) => s.key === slot)?.label || slot;
      const dayLabel = DAYS_FULL[dayIndex] || '';
      const selected = state.recipeId ? recipes.find((r) => r.id === state.recipeId) : null;

      return `
        <form class="drawer habit-form">
          <div class="drawer-header">
            <div>
              <h2>${slotLabel}</h2>
              <div class="page-sub" style="margin-top:2px;">${dayLabel.toLowerCase()}</div>
            </div>
            <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
          </div>
          <div class="drawer-body">

            <div class="auth-field">
              <span>Choisir une recette</span>
              <div class="recipe-pick-list">
                <button type="button" class="recipe-pick ${state.recipeId === null && state.freeText ? 'active' : ''}" data-recipe="">
                  <strong>Autre / libre</strong><span>saisir manuellement</span>
                </button>
                ${recipes.length === 0
                  ? `<div class="settings-hint" style="text-align:center;padding:10px 0;">Aucune recette pour l'instant.</div>`
                  : recipes.map((r) => `
                    <button type="button" class="recipe-pick ${state.recipeId === r.id ? 'active' : ''}" data-recipe="${r.id}">
                      <strong>${escapeHtml(r.name)}</strong>
                      <span>${escapeHtml(r.category)} · ${r.prepTime || 0} min · ${r.servings} portion${r.servings > 1 ? 's' : ''}</span>
                    </button>
                  `).join('')}
              </div>
            </div>

            ${state.recipeId === null ? `
              <label class="auth-field">
                <span>Nom du repas</span>
                <input type="text" name="free" value="${escapeHtml(state.freeText)}" placeholder="Salade de riz">
              </label>
            ` : ''}

            <label class="auth-field">
              <span>Portions</span>
              <input type="number" min="0.5" step="0.5" name="servings" value="${state.servings}">
            </label>

            <div class="form-actions">
              <button type="submit" class="auth-submit">${meal ? 'Enregistrer' : 'Planifier'}</button>
              ${meal ? `<button type="button" class="settings-btn danger" data-remove>${icon('trash', { size: 16 })}<span>Retirer du planning</span></button>` : ''}
            </div>
          </div>
        </form>
      `;
    }

    function refresh() {
      overlay.innerHTML = render();
      bind();
    }

    function close(value) { overlay.remove(); resolve(value); }

    function bind() {
      overlay.querySelector('[data-close]').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

      overlay.querySelectorAll('[data-recipe]').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.recipe;
          state.recipeId = id || null;
          refresh();
        };
      });

      const form = overlay.querySelector('form');
      const freeInput = form.querySelector('input[name="free"]');
      if (freeInput) freeInput.oninput = (e) => { state.freeText = e.target.value; };
      form.querySelector('input[name="servings"]').oninput = (e) => { state.servings = e.target.value; };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const recipe = state.recipeId ? recipes.find((r) => r.id === state.recipeId) : null;
        const name = recipe ? recipe.name : state.freeText;
        if (!name.trim()) return;
        const saved = await saveMeal({
          id: meal?.id,
          weekKey, dayIndex, slot, name,
          recipeId: state.recipeId,
          servings: state.servings,
        });
        close(saved);
      });

      const removeBtn = overlay.querySelector('[data-remove]');
      if (removeBtn) {
        removeBtn.onclick = async () => {
          await deleteMeal(meal.id);
          close({ removed: true });
        };
      }
    }
  });
}
