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

// ---- Water ----

export const DEFAULT_GLASS_ML = 250;
export const DEFAULT_WATER_GOAL_ML = 2000;

export async function getWaterGoalMl() {
  return (await DB.getSetting(SETTINGS_KEYS.NUTRITION_WATER_GOAL)) || DEFAULT_WATER_GOAL_ML;
}

export async function setWaterGoalMl(ml) {
  return DB.setSetting(SETTINGS_KEYS.NUTRITION_WATER_GOAL, Number(ml) || DEFAULT_WATER_GOAL_ML);
}

export async function getWaterLogForDate(date = todayStr()) {
  const rows = await DB.getByIndex('water_log', 'date', date);
  return rows.filter((r) => !r.deletedAt).sort((a, b) => (a.loggedAt || '').localeCompare(b.loggedAt || ''));
}

export async function getTodayWaterMl(date = todayStr()) {
  const rows = await getWaterLogForDate(date);
  return rows.reduce((s, r) => s + (r.amount || 0), 0);
}

export async function logGlass(amount = DEFAULT_GLASS_ML, date = todayStr()) {
  const entry = {
    id: uuid(),
    date,
    amount: Number(amount) || DEFAULT_GLASS_ML,
    loggedAt: new Date().toISOString(),
  };
  await DB.put('water_log', entry);
  return entry;
}

// Undo the most recent glass of the given day.
export async function removeLastGlass(date = todayStr()) {
  const rows = await getWaterLogForDate(date);
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  await DB.delete('water_log', last.id);
  return last;
}

// ---- Fasting ----

export const FASTING_PRESETS = [
  { key: '14_10', label: '14:10', hours: 14 },
  { key: '16_8',  label: '16:8',  hours: 16 },
  { key: '18_6',  label: '18:6',  hours: 18 },
  { key: '20_4',  label: '20:4',  hours: 20 },
];

export async function getActiveFast() {
  const row = await DB.getSetting(SETTINGS_KEYS.NUTRITION_FASTING);
  if (!row?.startedAt) return null;
  return row;
}

export async function startFast({ hours, presetKey }) {
  const fast = {
    startedAt: new Date().toISOString(),
    targetHours: Number(hours) || 16,
    presetKey: presetKey || null,
  };
  await DB.setSetting(SETTINGS_KEYS.NUTRITION_FASTING, fast);
  return fast;
}

export async function endFast() {
  const active = await getActiveFast();
  if (!active) return null;
  const endedAt = new Date().toISOString();
  const durationMinutes = Math.round(
    (new Date(endedAt) - new Date(active.startedAt)) / 60000,
  );
  const history = (await DB.getSetting('nutrition.fastingHistory', [])) || [];
  history.unshift({
    startedAt: active.startedAt,
    endedAt,
    durationMinutes,
    targetHours: active.targetHours,
    presetKey: active.presetKey || null,
  });
  // Cap at 30 so we don't bloat the setting row.
  const trimmed = history.slice(0, 30);
  await DB.setSetting('nutrition.fastingHistory', trimmed);
  await DB.setSetting(SETTINGS_KEYS.NUTRITION_FASTING, null);
  return {
    startedAt: active.startedAt,
    endedAt,
    durationMinutes,
    targetHours: active.targetHours,
    success: durationMinutes / 60 >= active.targetHours,
  };
}

export async function getFastingHistory() {
  return (await DB.getSetting('nutrition.fastingHistory', [])) || [];
}
