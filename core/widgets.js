// Widget bridge. Pushes a flat snapshot object to the native
// WidgetBridge Capacitor plugin, which drops it into the
// `group.com.bovmii.fitmi` App Group UserDefaults and asks WidgetKit
// to reload every timeline.
//
// On the web the push is a polite no-op so the data layer doesn't
// need to branch.

import { isNative } from './native.js';

let Plugin = null;
let loading = null;

async function loadBridge() {
  if (Plugin) return Plugin;
  if (loading) return loading;
  if (!(await isNative())) return null;
  loading = (async () => {
    try {
      const cap = await import('https://esm.sh/@capacitor/core@8.3.1');
      Plugin = cap.registerPlugin('WidgetBridge');
      return Plugin;
    } catch (err) {
      console.warn('[widgets] bridge load failed', err);
      return null;
    }
  })();
  return loading;
}

// Merge a partial payload into the shared store and reload widgets.
// Accepts any JSON-serializable object. Keys we use today:
//   water     { current, target }
//   calories  { consumed, target, burned }
//   habits    [{ id, name, icon, color, done }]
//   shopping  [{ name, done }]
//   budget    { monthlyRemaining, monthlyTotal }
//   nextMeal  { slot, name, kcal }
export async function pushWidgetData(data) {
  const bridge = await loadBridge();
  if (!bridge) return { skipped: true };
  try {
    await bridge.update({ data });
    return { pushed: true };
  } catch (err) {
    console.warn('[widgets] push failed', err);
    return { error: String(err) };
  }
}

// Aggregate every widget-relevant data point and push a single
// snapshot. Called on boot and debounced on every DB mutation via
// initWidgetRefresh().
export async function refreshAllWidgets() {
  if (!(await isNative())) return { skipped: true };

  const payload = {};
  try {
    const { getTodayWaterMl, getWaterGoalMl, getDayTotals, getNutritionTargets, DEFAULT_GLASS_ML } =
      await import('../modules/nutrition/data.js');
    const [waterMl, goalMl, totals, targets] = await Promise.all([
      getTodayWaterMl(), getWaterGoalMl(), getDayTotals(), getNutritionTargets(),
    ]);
    payload.water = {
      current: Math.round(waterMl / DEFAULT_GLASS_ML),
      target: Math.max(1, Math.round(goalMl / DEFAULT_GLASS_ML)),
    };
    payload.calories = {
      consumed: Math.round(totals.kcal),
      target: targets.kcal || 0,
      burned: 0,
    };
  } catch {}

  try {
    const { getTodayHabits, isCompletedToday } = await import('../modules/habits/data.js');
    const todayHabits = await getTodayHabits();
    const items = await Promise.all(todayHabits.slice(0, 6).map(async (h) => ({
      id: h.id,
      name: h.name,
      color: h.color,
      icon: h.icon || 'target',
      done: await isCompletedToday(h.id),
    })));
    payload.habits = items;
  } catch {}

  try {
    const { getMonthSummary } = await import('../modules/budget/data.js');
    const s = await getMonthSummary();
    payload.budget = {
      monthlyRemaining: Math.max(0, Math.round(s.remaining)),
      monthlyTotal: Math.round(s.monthly || 0),
    };
  } catch {}

  try {
    const { getShoppingForWeek } = await import('../modules/meals/data.js');
    const { getWeekKey } = await import('./date.js');
    const items = await getShoppingForWeek(getWeekKey(new Date()));
    payload.shopping = items.slice(0, 5).map((i) => ({ name: i.name, done: !!i.checked }));
  } catch {}

  try {
    const { getMealsForWeek } = await import('../modules/meals/data.js');
    const { getWeekKey, getTodayDayIndex } = await import('./date.js');
    const meals = await getMealsForWeek(getWeekKey(new Date()));
    const todayIdx = getTodayDayIndex();
    const order = ['breakfast', 'lunch', 'dinner'];
    const nowHour = new Date().getHours();
    const slotHintBySlot = { breakfast: nowHour < 11, lunch: nowHour < 15, dinner: true };
    const upcoming = meals
      .filter((m) => m.dayIndex === todayIdx && order.includes(m.slot))
      .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot))
      .find((m) => slotHintBySlot[m.slot]);
    if (upcoming) {
      const labels = { breakfast: 'Petit-déj', lunch: 'Déjeuner', dinner: 'Dîner' };
      payload.nextMeal = { slot: labels[upcoming.slot] || upcoming.slot, name: upcoming.name, kcal: 0 };
    } else {
      payload.nextMeal = { slot: '', name: 'Rien de prévu', kcal: 0 };
    }
  } catch {}

  return pushWidgetData(payload);
}

// Boot-time hook: push once, then refresh whenever a write lands.
// Debounced with requestIdleCallback so rapid writes coalesce into
// one native bridge call.
let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  const fire = () => { scheduled = false; refreshAllWidgets().catch(() => {}); };
  if (typeof window !== 'undefined' && window.requestIdleCallback) {
    window.requestIdleCallback(fire, { timeout: 3000 });
  } else {
    setTimeout(fire, 800);
  }
}

export async function initWidgetRefresh() {
  if (!(await isNative())) return;
  const { Bus } = await import('./bus.js');
  Bus.on('db.put', schedule);
  Bus.on('db.delete', schedule);
  schedule();
}
