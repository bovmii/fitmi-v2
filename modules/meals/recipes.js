// Recipes list view with category filter + FAB to add a new recipe.
// Clicking a recipe opens the edit modal.

import { icon } from '../../core/icons.js';
import { getAllRecipes, RECIPE_CATEGORIES } from './data.js';
import { openRecipeForm } from './recipe-form.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export async function renderRecipes(host, { onChange } = {}) {
  let filter = null;

  host.innerHTML = `
    <div class="recipes">
      <div class="filter-chips" data-filters>
        <button class="chip active" data-filter="">Tous</button>
        ${RECIPE_CATEGORIES.map((c) => `<button class="chip" data-filter="${escapeHtml(c)}">${c}</button>`).join('')}
      </div>
      <button class="fab-cta" data-add>${icon('plus', { size: 18 })}<span>Nouvelle recette</span></button>
      <div data-list></div>
    </div>
  `;

  host.querySelector('[data-add]').onclick = async () => {
    const saved = await openRecipeForm({});
    if (saved) { await refresh(); onChange?.(); }
  };

  host.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => {
      filter = b.dataset.filter || null;
      host.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === b));
      refresh();
    };
  });

  await refresh();

  async function refresh() {
    const all = await getAllRecipes();
    const filtered = filter ? all.filter((r) => r.category === filter) : all;
    const list = host.querySelector('[data-list]');
    if (filtered.length === 0) {
      list.innerHTML = `<div class="settings-hint" style="padding:24px 0;text-align:center;">Aucune recette${filter ? ` dans "${filter}"` : ''} pour l'instant.</div>`;
      return;
    }
    list.innerHTML = filtered.map((r) => `
      <button class="recipe-card" data-id="${r.id}">
        <div class="recipe-card-head">
          <span class="recipe-card-cat">${escapeHtml(r.category)}</span>
          <span class="recipe-card-time">${r.prepTime || 0} min</span>
        </div>
        <div class="recipe-card-name">${escapeHtml(r.name)}</div>
        <div class="recipe-card-meta">
          ${r.servings} portion${r.servings > 1 ? 's' : ''} · ${(r.ingredients || []).length} ingrédient${(r.ingredients || []).length > 1 ? 's' : ''}${r.pricePerServing ? ` · ${r.pricePerServing.toFixed(2)} €/portion` : ''}
        </div>
      </button>
    `).join('');
    list.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = async () => {
        const recipe = (await getAllRecipes()).find((r) => r.id === b.dataset.id);
        if (!recipe) return;
        const result = await openRecipeForm({ recipe });
        if (result) { await refresh(); onChange?.(); }
      };
    });
  }
}
