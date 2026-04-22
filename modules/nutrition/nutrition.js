// Nutrition tab — sub-tab router.
//   Log     — calorie ring, macros, water, fasting, food journal
//   Repas   — weekly meal planner + recipes library
//   Courses — shopping list for the current week

import { renderNutritionLog } from './log.js';
import { renderMeals } from '../meals/meals.js';
import { renderShopping } from '../meals/shopping.js';

const SUBTABS = [
  { key: 'log',     label: 'Log' },
  { key: 'repas',   label: 'Repas' },
  { key: 'courses', label: 'Courses' },
];
const STORAGE_KEY = 'fitmi.nutritionTab';

export async function mount(root) {
  const initial = (SUBTABS.find((t) => t.key === localStorage.getItem(STORAGE_KEY)) || SUBTABS[0]).key;

  root.innerHTML = `
    <div class="nutrition-page">
      <div class="page-header">
        <h1 class="page-title">Nutrition</h1>
      </div>
      <div class="settings-segment" data-seg>
        ${SUBTABS.map((t) => `<button data-sub="${t.key}" class="${t.key === initial ? 'active' : ''}">${t.label}</button>`).join('')}
      </div>
      <div data-subhost></div>
    </div>
  `;

  const host = root.querySelector('[data-subhost]');
  let currentRef = null;

  async function show(key) {
    localStorage.setItem(STORAGE_KEY, key);
    root.querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === key));
    if (currentRef?.stop) currentRef.stop();
    currentRef = null;
    host.innerHTML = '';
    if (key === 'log')     currentRef = await renderNutritionLog(host);
    else if (key === 'repas') await renderMeals(host);
    else if (key === 'courses') await renderShopping(host);
  }

  root.querySelectorAll('[data-sub]').forEach((b) => {
    b.onclick = () => show(b.dataset.sub);
  });

  await show(initial);
}
