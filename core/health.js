// HealthKit / Health Connect bridge, on top of the capacitor-health
// plugin. Exposes a tight surface that the rest of the app calls into:
//
//   isAvailable()
//   requestPermissions()
//   readStepsToday()
//   readActiveCaloriesToday()
//   readWorkouts(sinceDays)
//   writeStrengthWorkout({ start, end, calories, steps? })
//
// On the web (and on Android without Health Connect, and on iOS
// simulator without HealthKit entitlements), every method is a polite
// no-op that returns zeros / empty arrays so UI callers can render
// without branching.
//
// The plugin is loaded dynamically from esm.sh so the web build never
// pays the download cost unless something actually calls into it.

import { isNative } from './native.js';

const PERMISSIONS = [
  'READ_STEPS',
  'READ_ACTIVE_CALORIES',
  'READ_WORKOUTS',
  'WRITE_WORKOUTS',
];

let cached = null;
let cachedPromise = null;

async function loadPlugin() {
  if (cached || cached === null && cachedPromise) return cachedPromise || cached;
  if (!(await isNative())) return null;
  cachedPromise = (async () => {
    try {
      const mod = await import('https://esm.sh/capacitor-health@8.1.0');
      cached = mod.Health;
      return cached;
    } catch (err) {
      console.warn('[health] plugin load failed', err);
      return null;
    }
  })();
  return cachedPromise;
}

export async function isAvailable() {
  const plugin = await loadPlugin();
  if (!plugin) return false;
  try {
    const { available } = await plugin.isHealthAvailable();
    return Boolean(available);
  } catch {
    return false;
  }
}

export async function requestPermissions() {
  const plugin = await loadPlugin();
  if (!plugin) return { granted: false };
  try {
    await plugin.requestHealthPermissions({ permissions: PERMISSIONS });
    return { granted: true };
  } catch (err) {
    console.warn('[health] permissions denied', err);
    return { granted: false };
  }
}

function startOfDayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function nowISO() { return new Date().toISOString(); }

async function queryAggregatedToday(dataType) {
  const plugin = await loadPlugin();
  if (!plugin) return 0;
  try {
    const res = await plugin.queryAggregated({
      startDate: startOfDayISO(),
      endDate: nowISO(),
      dataType,
      bucket: 'day',
    });
    const sample = (res.aggregatedData || [])[0];
    return sample ? Number(sample.value) || 0 : 0;
  } catch (err) {
    console.warn(`[health] queryAggregated(${dataType}) failed`, err);
    return 0;
  }
}

export async function readStepsToday() {
  return queryAggregatedToday('steps');
}

export async function readActiveCaloriesToday() {
  return queryAggregatedToday('active-calories');
}

export async function readWorkouts(sinceDays = 7) {
  const plugin = await loadPlugin();
  if (!plugin) return [];
  try {
    const start = new Date();
    start.setDate(start.getDate() - sinceDays);
    start.setHours(0, 0, 0, 0);
    const { workouts } = await plugin.queryWorkouts({
      startDate: start.toISOString(),
      endDate: nowISO(),
      includeHeartRate: false,
      includeRoute: false,
      includeSteps: true,
    });
    return workouts || [];
  } catch (err) {
    console.warn('[health] queryWorkouts failed', err);
    return [];
  }
}

// capacitor-health doesn't currently expose a "write workout" call, so
// this is a placeholder for later when we either update the plugin or
// ship our own custom Swift snippet. No-op for now.
export async function writeStrengthWorkout(_payload) {
  return { written: false, reason: 'plugin does not support write-workout yet' };
}
