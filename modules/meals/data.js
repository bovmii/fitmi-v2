// Meal planner + recipes + shopping list data layer.
//
// Data model:
//   meals            { id, weekKey, dayIndex 0..6 (Mon..Sun), slot
//                      'breakfast'|'lunch'|'dinner', name, recipeId?, servings? }
//   recipes          { id, name, category, prepTime, servings,
//                      ingredients: string[], notes, pricePerServing? }
//   shopping_extra   { id, weekKey, name, checked, fromRecipeId? }
// All rows participate in sync through the normal DB.put/DB.delete path.

import { DB } from '../../core/db.js';
import { uuid } from '../../core/ids.js';
import { getWeekKey } from '../../core/date.js';

export const SLOTS = [
  { key: 'breakfast', label: 'Petit-déj' },
  { key: 'lunch',     label: 'Déjeuner' },
  { key: 'dinner',    label: 'Dîner' },
];

export const RECIPE_CATEGORIES = [
  'Petit-déj', 'Plat', 'Salade', 'Soupe', 'Dessert', 'Snack', 'Boisson', 'Autre',
];

// ---- Meals (weekly slots) ----

export async function getMealsForWeek(weekKey) {
  const rows = await DB.getByIndex('meals', 'weekKey', weekKey);
  return rows.filter((m) => !m.deletedAt);
}

export async function saveMeal({ id, weekKey, dayIndex, slot, name, recipeId, servings }) {
  const meal = {
    id: id || uuid(),
    weekKey,
    dayIndex: Number(dayIndex),
    slot,
    name: (name || '').trim(),
    recipeId: recipeId || null,
    servings: Number(servings) || 1,
  };
  await DB.put('meals', meal);
  return meal;
}

export async function deleteMeal(id) {
  await DB.delete('meals', id);
}

// Convenience: look up a single slot for (weekKey, dayIndex, slot).
export async function findSlot(weekKey, dayIndex, slot) {
  const meals = await getMealsForWeek(weekKey);
  return meals.find((m) => m.dayIndex === dayIndex && m.slot === slot) || null;
}

// ---- Recipes ----

export async function getAllRecipes() {
  const rows = await DB.getAllActive('recipes');
  return rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
}

export async function getRecipe(id) {
  const row = await DB.get('recipes', id);
  return row && !row.deletedAt ? row : null;
}

export async function saveRecipe(data) {
  const recipe = {
    id: data.id || uuid(),
    name: (data.name || '').trim(),
    category: data.category || 'Plat',
    prepTime: Number(data.prepTime) || 0,
    servings: Math.max(1, Number(data.servings) || 1),
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter((i) => i && i.trim()) : [],
    notes: (data.notes || '').trim(),
    pricePerServing: data.pricePerServing ? Number(data.pricePerServing) : null,
    createdAt: data.createdAt || new Date().toISOString(),
  };
  await DB.put('recipes', recipe);
  return recipe;
}

export async function deleteRecipe(id) {
  await DB.delete('recipes', id);
}

// ---- Shopping list (per week) ----

export async function getShoppingForWeek(weekKey) {
  const rows = await DB.getByIndex('shopping_extra', 'weekKey', weekKey);
  return rows
    .filter((s) => !s.deletedAt)
    .sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
}

export async function addShoppingItem({ weekKey, name, fromRecipeId = null }) {
  const item = {
    id: uuid(),
    weekKey,
    name: (name || '').trim(),
    checked: false,
    fromRecipeId,
    createdAt: new Date().toISOString(),
  };
  await DB.put('shopping_extra', item);
  return item;
}

export async function toggleShoppingItem(id) {
  const item = await DB.get('shopping_extra', id);
  if (!item || item.deletedAt) return;
  await DB.put('shopping_extra', { ...item, checked: !item.checked });
}

export async function deleteShoppingItem(id) {
  await DB.delete('shopping_extra', id);
}

export async function clearCheckedShopping(weekKey) {
  const items = await getShoppingForWeek(weekKey);
  for (const it of items) {
    if (it.checked) await DB.delete('shopping_extra', it.id);
  }
}

// Pull all ingredient lines from every planned meal in the week and push
// them into the shopping list as un-checked items. De-duplicates against
// existing items (case-insensitive) so re-importing doesn't pile up.
export async function importWeekIngredients(weekKey) {
  const [meals, existing] = await Promise.all([
    getMealsForWeek(weekKey),
    getShoppingForWeek(weekKey),
  ]);
  const existingNames = new Set(existing.map((e) => normalize(e.name)));

  let added = 0;
  for (const meal of meals) {
    if (!meal.recipeId) continue;
    const recipe = await getRecipe(meal.recipeId);
    if (!recipe) continue;
    for (const line of recipe.ingredients || []) {
      const n = normalize(line);
      if (!n || existingNames.has(n)) continue;
      await addShoppingItem({ weekKey, name: line, fromRecipeId: recipe.id });
      existingNames.add(n);
      added++;
    }
  }
  return { added };
}

// ---- Aggregations ----

// Sum of every planned meal's pricePerServing × servings. Missing prices
// skipped. Returns { total, coveredCount, totalCount } for UI hints.
export async function getWeekCostEstimate(weekKey) {
  const meals = await getMealsForWeek(weekKey);
  const recipesById = new Map();
  for (const m of meals) {
    if (m.recipeId && !recipesById.has(m.recipeId)) {
      const r = await getRecipe(m.recipeId);
      if (r) recipesById.set(m.recipeId, r);
    }
  }
  let total = 0;
  let covered = 0;
  for (const m of meals) {
    const r = m.recipeId ? recipesById.get(m.recipeId) : null;
    if (r && typeof r.pricePerServing === 'number') {
      total += r.pricePerServing * (m.servings || 1);
      covered++;
    }
  }
  return { total, coveredCount: covered, totalCount: meals.length };
}

export { getWeekKey };

function normalize(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
