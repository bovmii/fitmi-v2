// Nutrition data layer: food log CRUD, daily aggregations, TDEE targets.

import { DB } from '../../core/db.js';
import { uuid } from '../../core/ids.js';
import { SETTINGS_KEYS } from '../../core/schema.js';
import { todayStr } from '../../core/date.js';

// ---- Food log ----

export async function getFoodLogForDate(date = todayStr()) {
  const rows = await DB.getByIndex('food_log', 'date', date);
  return rows
    .filter((r) => !r.deletedAt)
    .sort((a, b) => (a.loggedAt || '').localeCompare(b.loggedAt || ''));
}

// Scale macros by quantity in grams. Legacy stored absolute macros per
// entry, which is simpler: whatever amount the user enters, we compute
// the final calories + protein + carbs + fat once and store them.
export async function logFood({ name, quantity, per100g, date, customKey }) {
  const q = Number(quantity) || 0;
  const factor = q / 100;
  const entry = {
    id: uuid(),
    name: String(name || '').trim(),
    date: date || todayStr(),
    quantity: q,
    kcal: round1((per100g?.kcal || 0) * factor),
    p:    round1((per100g?.p    || 0) * factor),
    c:    round1((per100g?.c    || 0) * factor),
    f:    round1((per100g?.f    || 0) * factor),
    per100g: per100g || null,
    loggedAt: new Date().toISOString(),
    customKey: customKey || null,
  };
  await DB.put('food_log', entry);
  return entry;
}

export async function deleteFoodEntry(id) {
  await DB.delete('food_log', id);
}

export async function updateFoodQuantity(id, quantity) {
  const row = await DB.get('food_log', id);
  if (!row || row.deletedAt) return null;
  const q = Number(quantity) || 0;
  const ref = row.per100g;
  const updated = {
    ...row,
    quantity: q,
    kcal: ref ? round1(ref.kcal * q / 100) : row.kcal,
    p:    ref ? round1(ref.p    * q / 100) : row.p,
    c:    ref ? round1(ref.c    * q / 100) : row.c,
    f:    ref ? round1(ref.f    * q / 100) : row.f,
  };
  await DB.put('food_log', updated);
  return updated;
}

export async function getDayTotals(date = todayStr()) {
  const rows = await getFoodLogForDate(date);
  return rows.reduce((acc, r) => ({
    kcal: acc.kcal + (r.kcal || 0),
    p:    acc.p    + (r.p    || 0),
    c:    acc.c    + (r.c    || 0),
    f:    acc.f    + (r.f    || 0),
    count: acc.count + 1,
  }), { kcal: 0, p: 0, c: 0, f: 0, count: 0 });
}

// ---- TDEE targets ----

export async function getNutritionTargets() {
  const [goal, macros, coach] = await Promise.all([
    DB.getSetting(SETTINGS_KEYS.NUTRITION_CALORIE_GOAL, 0),
    DB.getSetting(SETTINGS_KEYS.NUTRITION_MACROS, null),
    DB.getSetting(SETTINGS_KEYS.NUTRITION_COACH_MODE, 'auto'),
  ]);
  return {
    kcal: goal || 0,
    protein: macros?.protein || 0,
    carbs:   macros?.carbs   || 0,
    fat:     macros?.fat     || 0,
    coach,
  };
}

export async function setNutritionTargets({ kcal, protein, carbs, fat, coach }) {
  await DB.setSetting(SETTINGS_KEYS.NUTRITION_CALORIE_GOAL, Number(kcal) || 0);
  await DB.setSetting(SETTINGS_KEYS.NUTRITION_MACROS, {
    protein: Number(protein) || 0,
    carbs:   Number(carbs)   || 0,
    fat:     Number(fat)     || 0,
  });
  if (coach) await DB.setSetting(SETTINGS_KEYS.NUTRITION_COACH_MODE, coach);
}

export async function getTdeeProfile() {
  return (await DB.getSetting(SETTINGS_KEYS.NUTRITION_TDEE)) || null;
}

export async function setTdeeProfile(profile) {
  return DB.setSetting(SETTINGS_KEYS.NUTRITION_TDEE, profile);
}

function round1(n) { return Math.round(n * 10) / 10; }
