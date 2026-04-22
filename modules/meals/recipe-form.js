// Add / edit recipe modal.

import { icon } from '../../core/icons.js';
import { confirmModal } from '../../core/ui.js';
import { saveRecipe, deleteRecipe, RECIPE_CATEGORIES } from './data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function openRecipeForm({ recipe = null } = {}) {
  return new Promise((resolve) => {
    const state = {
      name:             recipe?.name || '',
      category:         recipe?.category || 'Plat',
      prepTime:         recipe?.prepTime ?? '',
      servings:         recipe?.servings ?? 2,
      ingredientsText:  (recipe?.ingredients || []).join('\n'),
      notes:            recipe?.notes || '',
      pricePerServing:  recipe?.pricePerServing ?? '',
    };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = render();
    document.body.appendChild(overlay);
    bind();

    function render() {
      return `
        <form class="drawer habit-form">
          <div class="drawer-header">
            <h2>${recipe ? 'Modifier la recette' : 'Nouvelle recette'}</h2>
            <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
          </div>
          <div class="drawer-body">
            <label class="auth-field">
              <span>Nom</span>
              <input type="text" name="name" required value="${escapeHtml(state.name)}" placeholder="Poulet citronné">
            </label>

            <div class="auth-field">
              <span>Catégorie</span>
              <div class="filter-chips" style="margin:0;padding:0;">
                ${RECIPE_CATEGORIES.map((c) => `
                  <button type="button" class="chip ${state.category === c ? 'active' : ''}" data-category="${c}">${c}</button>
                `).join('')}
              </div>
            </div>

            <div class="form-grid-3">
              <label class="auth-field">
                <span>Préparation (min)</span>
                <input type="number" min="0" step="5" name="prepTime" value="${state.prepTime}">
              </label>
              <label class="auth-field">
                <span>Portions</span>
                <input type="number" min="1" step="1" name="servings" value="${state.servings}">
              </label>
              <label class="auth-field">
                <span>€ / portion</span>
                <input type="number" min="0" step="0.1" name="pricePerServing" value="${state.pricePerServing}" placeholder="optionnel">
              </label>
            </div>

            <label class="auth-field">
              <span>Ingrédients</span>
              <textarea name="ingredients" rows="6" placeholder="Un ingrédient par ligne&#10;200 g de poulet&#10;2 citrons">${escapeHtml(state.ingredientsText)}</textarea>
              <small>Une ligne par ingrédient.</small>
            </label>

            <label class="auth-field">
              <span>Notes</span>
              <textarea name="notes" rows="3" placeholder="Préparation, astuces…">${escapeHtml(state.notes)}</textarea>
            </label>

            <div class="form-actions">
              <button type="submit" class="auth-submit">${recipe ? 'Enregistrer' : 'Créer la recette'}</button>
              ${recipe ? `<button type="button" class="settings-btn danger" data-delete>${icon('trash', { size: 16 })}<span>Supprimer</span></button>` : ''}
            </div>
          </div>
        </form>
      `;
    }

    function close(value) { overlay.remove(); resolve(value); }

    function bind() {
      overlay.querySelector('[data-close]').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

      overlay.querySelectorAll('[data-category]').forEach((b) => {
        b.onclick = () => {
          state.category = b.dataset.category;
          overlay.querySelectorAll('[data-category]').forEach((x) => x.classList.toggle('active', x === b));
        };
      });

      const form = overlay.querySelector('form');
      form.name.oninput           = (e) => { state.name = e.target.value; };
      form.prepTime.oninput       = (e) => { state.prepTime = e.target.value; };
      form.servings.oninput       = (e) => { state.servings = e.target.value; };
      form.pricePerServing.oninput = (e) => { state.pricePerServing = e.target.value; };
      form.ingredients.oninput    = (e) => { state.ingredientsText = e.target.value; };
      form.notes.oninput          = (e) => { state.notes = e.target.value; };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.name.trim()) return;
        const saved = await saveRecipe({
          id: recipe?.id,
          name: state.name,
          category: state.category,
          prepTime: state.prepTime,
          servings: state.servings,
          ingredients: state.ingredientsText.split('\n'),
          notes: state.notes,
          pricePerServing: state.pricePerServing === '' ? null : state.pricePerServing,
          createdAt: recipe?.createdAt,
        });
        close(saved);
      });

      const deleteBtn = overlay.querySelector('[data-delete]');
      if (deleteBtn) {
        deleteBtn.onclick = async () => {
          const ok = await confirmModal('Supprimer cette recette ?', { confirmText: 'Supprimer', danger: true });
          if (!ok) return;
          await deleteRecipe(recipe.id);
          close({ deleted: true });
        };
      }
    }
  });
}
