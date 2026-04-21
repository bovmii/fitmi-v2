// One-time migration from the three legacy IndexedDBs into the unified
// 'fitmi' database.
//
// Every imported record is re-keyed to a fresh UUID (auto-increment
// integers from the old apps would collide across devices once sync is
// enabled), gets sync-metadata fields (updatedAt, deletedAt), and its
// original legacy id is kept under `legacyId` for audit.
//
// Sync is explicitly disabled during the import: we don't want to create
// hundreds of outbox rows before the user has even signed in. The next
// sync push after login will upload the full dataset in one go.

import { DB } from './db.js';
import { uuid } from './ids.js';
import { showToast } from './ui.js';

const MIGRATION_FLAG = 'fitmi.migration_done';

const LEGACY_DBS = {
  mealplanner: {
    stores: [
      'meals', 'recipes', 'shopping_extra', 'food_log', 'custom_foods',
      'exercises', 'workouts', 'sets', 'templates', 'weight_log',
      'water_log', 'favorites', 'settings',
    ],
  },
  habitstack: {
    stores: ['habits', 'completions', 'settings'],
  },
  budgetflow: {
    stores: ['expenses', 'subscriptions', 'savings', 'settings'],
  },
};

const EMOJI_TO_ICON = {
  '🏃': 'activity', '📖': 'book', '💧': 'droplet', '🧘': 'heart',
  '💪': 'dumbbell', '🎯': 'target', '✍️': 'edit', '🎵': 'activity',
  '🥗': 'utensils', '😴': 'moon', '🧹': 'refresh', '💻': 'zap',
  '✈️': 'zap', '🏠': 'home', '💰': 'wallet', '🚗': 'activity',
  '🎮': 'zap', '🏥': 'heart', '📱': 'bell', '📊': 'barChart',
  '🎫': 'calendar', '💾': 'download', '📦': 'archive', '👜': 'shoppingCart',
  '🍕': 'utensils', '🏆': 'star', '🔥': 'flame', '⭐': 'star',
  '🎉': 'star', '✨': 'star', '📋': 'book',
};

function openLegacyDB(name) {
  return new Promise((resolve) => {
    const req = indexedDB.open(name);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function readAll(db, store) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(store)) return resolve([]);
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

async function detectLegacy() {
  const found = [];
  for (const name of Object.keys(LEGACY_DBS)) {
    const db = await openLegacyDB(name);
    if (!db) continue;
    const hasStores = db.objectStoreNames.length > 0;
    db.close();
    if (hasStores) found.push(name);
    else indexedDB.deleteDatabase(name);
  }
  return found;
}

async function dumpLegacyDB(name) {
  const db = await openLegacyDB(name);
  if (!db) return null;
  const data = {};
  for (const s of LEGACY_DBS[name].stores) {
    data[s] = await readAll(db, s);
  }
  db.close();
  return data;
}

function downloadBackup(payload) {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitmi-backup-${date}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const nowIso = () => new Date().toISOString();

function stampRow(row) {
  return { ...row, updatedAt: nowIso(), deletedAt: null };
}

function remapRecord(row, originalKey = 'id') {
  const legacyId = row[originalKey];
  return stampRow({ ...row, id: uuid(), legacyId });
}

function remapHabit(h) {
  return stampRow({
    ...h,
    id: uuid(),
    legacyId: h.id,
    icon: EMOJI_TO_ICON[h.emoji] || 'target',
  });
}

function remapCompletion(c, habitIdMap) {
  return stampRow({
    ...c,
    id: uuid(),
    legacyId: c.id,
    habitId: habitIdMap.get(c.habitId) || c.habitId,
  });
}

function remapSavings(s) {
  return stampRow({
    ...s,
    id: uuid(),
    legacyId: s.id,
    icon: EMOJI_TO_ICON[s.emoji] || 'target',
  });
}

function remapBudgetSettingKey(row) {
  const KEY_MAP = {
    monthly_budget: 'budget.monthly',
    category_limits: 'budget.categoryLimits',
    last_sub_run: 'budget.lastSubRun',
  };
  const newKey = KEY_MAP[row.key] || `budget.${row.key}`;
  return stampRow({ key: newKey, value: row.value });
}

async function putBatch(store, rows) {
  if (!rows || rows.length === 0) return 0;
  const db = await DB.open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const row of rows) os.put(row);
    tx.oncomplete = () => resolve(rows.length);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function importLegacyData(dumps) {
  const totals = {};
  const bump = (k, n) => { totals[k] = (totals[k] || 0) + n; };

  // fit.mi — re-key every store to UUIDs, stamp sync metadata.
  const m = dumps.mealplanner;
  if (m) {
    const REMAP_STORES = [
      'meals', 'recipes', 'shopping_extra', 'food_log', 'custom_foods',
      'exercises', 'workouts', 'sets', 'templates', 'weight_log',
      'water_log', 'favorites',
    ];
    // workouts + sets: keep mapping so sets still reference the right workoutId.
    const workoutMap = new Map();
    const exerciseMap = new Map();

    for (const store of REMAP_STORES) {
      const rows = m[store] || [];
      if (rows.length === 0) continue;
      const mapped = rows.map((row) => {
        const remapped = remapRecord(row);
        if (store === 'workouts') workoutMap.set(row.id, remapped.id);
        if (store === 'exercises') exerciseMap.set(row.id, remapped.id);
        if (store === 'sets') {
          if (row.workoutId && workoutMap.has(row.workoutId)) remapped.workoutId = workoutMap.get(row.workoutId);
          if (row.exerciseId && exerciseMap.has(row.exerciseId)) remapped.exerciseId = exerciseMap.get(row.exerciseId);
        }
        return remapped;
      });
      bump(store, await putBatch(store, mapped));
    }
    if (m.settings?.length) {
      bump('settings', await putBatch('settings', m.settings.map(stampRow)));
    }
  }

  // habitstack — remap habits, preserve habitId mapping for completions.
  const h = dumps.habitstack;
  if (h) {
    const habitIdMap = new Map();
    if (h.habits?.length) {
      const mapped = h.habits.map((habit) => {
        const remapped = remapHabit(habit);
        habitIdMap.set(habit.id, remapped.id);
        return remapped;
      });
      bump('habits', await putBatch('habits', mapped));
    }
    if (h.completions?.length) {
      const mapped = h.completions.map((c) => remapCompletion(c, habitIdMap));
      bump('completions', await putBatch('completions', mapped));
    }
  }

  // budgetflow — expenses + subscriptions + savings (icon remap) + settings rename.
  const b = dumps.budgetflow;
  if (b) {
    if (b.expenses?.length) bump('expenses', await putBatch('expenses', b.expenses.map((r) => remapRecord(r))));
    if (b.subscriptions?.length) bump('subscriptions', await putBatch('subscriptions', b.subscriptions.map((r) => remapRecord(r))));
    if (b.savings?.length) bump('savings', await putBatch('savings', b.savings.map(remapSavings)));
    if (b.settings?.length) bump('settings', await putBatch('settings', b.settings.map(remapBudgetSettingKey)));
  }

  return totals;
}

async function deleteLegacy(names) {
  for (const name of names) {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }
}

export function migrationStatus() {
  return {
    done: Boolean(localStorage.getItem(MIGRATION_FLAG)),
    at: localStorage.getItem(MIGRATION_FLAG) || null,
  };
}

export async function runMigrationIfNeeded({ onProgress } = {}) {
  if (localStorage.getItem(MIGRATION_FLAG)) {
    return { skipped: true };
  }

  const legacy = await detectLegacy();
  if (legacy.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    return { migrated: false, reason: 'no-legacy' };
  }

  onProgress?.({ step: 'dump', legacy });
  const dumps = {};
  for (const name of legacy) dumps[name] = await dumpLegacyDB(name);

  onProgress?.({ step: 'backup', legacy });
  try {
    downloadBackup({
      version: 2,
      createdAt: new Date().toISOString(),
      source: 'fitmi-v2 migration',
      legacy: dumps,
    });
  } catch (err) {
    console.warn('[migration] backup download failed, continuing:', err);
  }

  onProgress?.({ step: 'import', legacy });
  let totals;
  DB.setSyncEnabled(false);
  try {
    totals = await importLegacyData(dumps);
  } catch (err) {
    console.error('[migration] import failed — legacy DBs left intact:', err);
    showToast('Migration impossible — anciennes données préservées');
    return { migrated: false, error: String(err) };
  } finally {
    DB.setSyncEnabled(true);
  }

  localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());

  onProgress?.({ step: 'cleanup', legacy });
  await deleteLegacy(legacy);

  return { migrated: true, legacy, totals };
}

// Called after the first successful sign-in: once local records have
// legacy data, we want to stamp the outbox so the first push uploads
// everything to Supabase. Until sync is implemented end-to-end this is
// idempotent-safe to skip — the regular put pathway takes care of any
// new writes.
export async function markAllDirty() {
  const db = await DB.open();
  const STORES = [
    'food_log', 'custom_foods', 'water_log', 'meals', 'recipes',
    'shopping_extra', 'favorites', 'exercises', 'workouts', 'sets',
    'templates', 'weight_log', 'habits', 'completions', 'expenses',
    'subscriptions', 'savings', 'settings',
  ];
  const stores = [...STORES, '_outbox'];
  const tx = db.transaction(stores, 'readwrite');
  const outbox = tx.objectStore('_outbox');
  for (const store of STORES) {
    const keyPath = store === 'settings' ? 'key' : 'id';
    const os = tx.objectStore(store);
    await new Promise((resolve) => {
      const req = os.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return resolve();
        const record = cursor.value;
        outbox.put({
          key: `${store}:${record[keyPath]}`,
          store,
          id: record[keyPath],
          updatedAt: record.updatedAt || new Date().toISOString(),
        });
        cursor.continue();
      };
      req.onerror = () => resolve();
    });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
