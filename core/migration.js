// One-time migration from the three legacy IndexedDBs ('mealplanner',
// 'habitstack', 'budgetflow') into the unified 'fitmi' database.
//
// Safety model:
//   1. Detect which legacy DBs exist (have object stores).
//   2. Dump everything to an in-memory payload and trigger a JSON download
//      as a manual backup file the user gets to keep.
//   3. Copy rows into the corresponding fitmi stores.
//   4. Mark the migration flag in localStorage so we never re-run.
//   5. Delete the legacy DBs last. If any step before (4) throws, the old
//      DBs stay intact and the user can retry on the next page load.

import { DB } from './db.js';
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

// Emoji → icon slug map used to strip emoji from legacy records while
// keeping the original emoji in a separate field as a fallback.
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
    } catch {
      resolve([]);
    }
  });
}

async function detectLegacy() {
  const found = [];
  for (const name of Object.keys(LEGACY_DBS)) {
    const db = await openLegacyDB(name);
    if (!db) continue;
    const hasStores = db.objectStoreNames.length > 0;
    db.close();
    if (hasStores) {
      found.push(name);
    } else {
      // openLegacyDB() inadvertently creates an empty DB when none exists;
      // tidy up so we don't leave a ghost database behind.
      indexedDB.deleteDatabase(name);
    }
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

function remapHabit(h) {
  return { ...h, icon: EMOJI_TO_ICON[h.emoji] || 'target' };
}

function remapSavings(s) {
  return { ...s, icon: EMOJI_TO_ICON[s.emoji] || 'target' };
}

function remapBudgetSetting(row) {
  const KEY_MAP = {
    monthly_budget: 'budget.monthly',
    category_limits: 'budget.categoryLimits',
    last_sub_run: 'budget.lastSubRun',
  };
  const newKey = KEY_MAP[row.key] || `budget.${row.key}`;
  return { key: newKey, value: row.value };
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

  // fit.mi: all stores keep the same shape.
  const m = dumps.mealplanner;
  if (m) {
    for (const s of ['meals', 'recipes', 'shopping_extra', 'food_log',
                     'custom_foods', 'exercises', 'workouts', 'sets',
                     'templates', 'weight_log', 'water_log', 'favorites']) {
      bump(s, await putBatch(s, m[s]));
    }
    if (m.settings?.length) bump('settings', await putBatch('settings', m.settings));
  }

  // habitstack: add icon slug on habits; completions pass through.
  const h = dumps.habitstack;
  if (h) {
    if (h.habits?.length) bump('habits', await putBatch('habits', h.habits.map(remapHabit)));
    if (h.completions?.length) bump('completions', await putBatch('completions', h.completions));
  }

  // budgetflow: add icon slug on savings; rename known settings keys.
  const b = dumps.budgetflow;
  if (b) {
    if (b.expenses?.length) bump('expenses', await putBatch('expenses', b.expenses));
    if (b.subscriptions?.length) bump('subscriptions', await putBatch('subscriptions', b.subscriptions));
    if (b.savings?.length) bump('savings', await putBatch('savings', b.savings.map(remapSavings)));
    if (b.settings?.length) bump('settings', await putBatch('settings', b.settings.map(remapBudgetSetting)));
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
  for (const name of legacy) {
    dumps[name] = await dumpLegacyDB(name);
  }

  onProgress?.({ step: 'backup', legacy });
  try {
    downloadBackup({
      version: 1,
      createdAt: new Date().toISOString(),
      source: 'fitmi-v2 migration',
      legacy: dumps,
    });
  } catch (err) {
    console.warn('[migration] backup download failed, continuing:', err);
  }

  onProgress?.({ step: 'import', legacy });
  let totals;
  try {
    totals = await importLegacyData(dumps);
  } catch (err) {
    console.error('[migration] import failed — legacy DBs left intact:', err);
    showToast('Migration impossible — anciennes données préservées');
    return { migrated: false, error: String(err) };
  }

  localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());

  onProgress?.({ step: 'cleanup', legacy });
  await deleteLegacy(legacy);

  return { migrated: true, legacy, totals };
}
