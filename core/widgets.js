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
    // Capacitor 8's `registerPlugin('Name')` checks PluginHeaders that
    // are injected at framework startup. Plugins registered later via
    // bridge.registerPluginInstance() (the only option for custom
    // plugins added directly to the App target rather than via SPM)
    // never appear in that list, so the proxy throws "not implemented
    // on ios" before ever reaching native. We go one level lower and
    // call window.Capacitor.nativePromise directly — that's the same
    // path the proxy takes internally for known plugins, but it skips
    // the JS-side existence check.
    const native = window?.Capacitor?.nativePromise;
    if (typeof native !== 'function') return null;
    const callNative = (method, options = {}) => native('WidgetBridge', method, options);
    Plugin = {
      update: (opts) => callNative('update', opts),
      readPending: () => callNative('readPending'),
      clearPending: () => callNative('clearPending'),
    };
    return Plugin;
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

// Drain the "pending" queue the widget AppIntents write to — a tap on
// the widget's +/− or a habit dot updates shared UserDefaults
// optimistically and appends an action here. On foreground we replay
// each action against IndexedDB so the source of truth catches up.
export async function flushPendingWidgetActions() {
  const bridge = await loadBridge();
  if (!bridge) return { skipped: true };
  let pending = [];
  try {
    const res = await bridge.readPending();
    pending = Array.isArray(res?.pending) ? res.pending : [];
  } catch (err) {
    console.warn('[widgets] readPending failed', err);
    return { error: String(err) };
  }
  if (pending.length === 0) return { flushed: 0 };

  let applied = 0;
  for (const action of pending) {
    try {
      if (action.kind === 'water.add') {
        const { logGlass } = await import('../modules/nutrition/data.js');
        await logGlass();
        applied++;
      } else if (action.kind === 'water.remove') {
        const { removeLastGlass } = await import('../modules/nutrition/data.js');
        await removeLastGlass();
        applied++;
      } else if (action.kind === 'habit.toggle' && action.habitId) {
        const { toggleHabit } = await import('../modules/habits/data.js');
        await toggleHabit(action.habitId);
        applied++;
      }
    } catch (err) {
      console.warn('[widgets] replay failed', action, err);
    }
  }

  try { await bridge.clearPending(); } catch {}
  return { flushed: applied };
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

  // Drain anything the widget queued while we were backgrounded,
  // then push a fresh snapshot back up so the widget reflects the
  // post-flush state (not the optimistic state the intent wrote).
  const replayThenPush = async () => {
    try { await flushPendingWidgetActions(); } catch {}
    schedule();
  };
  replayThenPush();

  try {
    const { App } = await import('https://esm.sh/@capacitor/app@8.1.0');
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) replayThenPush();
    });
  } catch {}
}
