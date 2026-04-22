// "Repas" sub-view under the Nutrition tab: segmented toggle between
// the weekly Planner and the Recipes library.

import { renderPlanner } from './planner.js';
import { renderRecipes } from './recipes.js';

export async function renderMeals(host, { onChange } = {}) {
  host.innerHTML = `
    <div class="meals-page">
      <div class="settings-segment" data-seg>
        <button data-view="planner" class="active">Planning</button>
        <button data-view="recipes">Recettes</button>
      </div>
      <div data-pane></div>
    </div>
  `;

  const pane = host.querySelector('[data-pane]');
  let current = 'planner';

  async function show(view) {
    current = view;
    host.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'planner') await renderPlanner(pane, { onChange });
    else await renderRecipes(pane, { onChange });
  }

  host.querySelectorAll('[data-view]').forEach((b) => {
    b.onclick = () => show(b.dataset.view);
  });

  await show('planner');
}
