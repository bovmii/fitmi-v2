// Bi-directional sync between IndexedDB and Supabase.
//
// Push: drain the `_outbox` store. For each entry read the current row
// from its IndexedDB store and upsert into Supabase's `records` table.
// On success, remove the outbox entry. On failure, leave it in place so
// the next sync attempt retries.
//
// Pull: fetch all records updated since `_sync.lastPullAt` and merge
// them into IndexedDB. A local row wins over a remote row only if it
// has a strictly greater `updatedAt`.
//
// Realtime: while online, subscribe to postgres_changes on the records
// table filtered by user_id. Incoming events run through the same merge
// logic as pull, so the user sees another device's edits within ~1s.
//
// Online detection: push + pull on `online` event, pull on app focus,
// push whenever `DB.put` emits a 'sync.dirty' bus event.

import { DB } from './db.js';
import { client, isConfigured } from './supabase.js';
import { Auth } from './auth.js';
import { SYNCED_STORES } from './schema.js';
import { Bus } from './bus.js';

const SYNC_CURSOR = 'lastPullAt';
const SYNC_USER_KEY = 'signedInAs';

let running = false;
let pending = false;
let realtimeChannel = null;
let listeners = new Set();

function emit(event, payload) {
  Bus.emit(event, payload);
  for (const l of listeners) { try { l({ event, payload }); } catch {} }
}

export function onSync(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isOnline() {
  return typeof navigator !== 'undefined' && navigator.onLine !== false;
}

function storeKeyPath(store) {
  return store === 'settings' ? 'key' : 'id';
}

async function readOutbox() {
  return DB.getAll('_outbox');
}

async function clearOutboxKeys(keys) {
  const db = await DB.open();
  const tx = db.transaction('_outbox', 'readwrite');
  const os = tx.objectStore('_outbox');
  for (const k of keys) os.delete(k);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getSyncCursor() {
  const row = await DB.get('_sync', SYNC_CURSOR);
  return row?.value || null;
}

async function setSyncCursor(value) {
  return DB.put('_sync', { key: SYNC_CURSOR, value });
}

async function getSignedInAs() {
  const row = await DB.get('_sync', SYNC_USER_KEY);
  return row?.value || null;
}

async function setSignedInAs(userId) {
  return DB.put('_sync', { key: SYNC_USER_KEY, value: userId });
}

// Serialize an IndexedDB row into the Supabase `records` row shape.
function toRemote(store, record, userId) {
  const keyPath = storeKeyPath(store);
  const id = record[keyPath];
  // Strip IndexedDB-only and sync-metadata fields from the data payload.
  const data = { ...record };
  delete data.updatedAt;
  delete data.deletedAt;
  return {
    id,
    user_id: userId,
    store,
    data,
    updated_at: record.updatedAt || new Date().toISOString(),
    deleted_at: record.deletedAt || null,
  };
}

// Deserialize a Supabase row into the shape we store in IndexedDB.
function toLocal(row) {
  const keyPath = storeKeyPath(row.store);
  return {
    ...row.data,
    [keyPath]: row.id,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

async function mergeIncoming(row) {
  const local = await DB.get(row.store, row.id);
  if (local) {
    const localAt = local.updatedAt || '';
    const remoteAt = row.updated_at || '';
    if (localAt > remoteAt) return 'skipped-local-newer';
  }
  await DB.putRaw(row.store, toLocal(row));
  // Drop any pending outbox entry for this record: the remote we just
  // merged is strictly newer, so our queued push would overwrite a
  // version other devices have already seen. The next local edit will
  // re-enqueue the record.
  const db = await DB.open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('_outbox', 'readwrite');
    tx.objectStore('_outbox').delete(`${row.store}:${row.id}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return 'merged';
}

async function push() {
  const sb = await client();
  if (!sb || !Auth.isAuthenticated() || Auth.isLocalOnly()) return { pushed: 0 };

  const userId = Auth.getUserId();
  const outbox = await readOutbox();
  if (outbox.length === 0) return { pushed: 0 };

  emit('sync.push.start', { count: outbox.length });

  const byStore = new Map();
  for (const entry of outbox) {
    if (!byStore.has(entry.store)) byStore.set(entry.store, []);
    byStore.get(entry.store).push(entry);
  }

  let pushed = 0;
  const sentKeys = [];

  for (const [store, entries] of byStore) {
    const payload = [];
    for (const entry of entries) {
      const record = await DB.get(store, entry.id);
      if (!record) continue;
      payload.push(toRemote(store, record, userId));
    }
    if (payload.length === 0) continue;
    const { error } = await sb.from('records').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('[sync] push failed', store, error);
      emit('sync.push.error', { store, error });
      continue;
    }
    pushed += payload.length;
    for (const entry of entries) sentKeys.push(entry.key);
  }

  if (sentKeys.length > 0) await clearOutboxKeys(sentKeys);
  emit('sync.push.done', { pushed });
  return { pushed };
}

async function pull() {
  const sb = await client();
  if (!sb || !Auth.isAuthenticated() || Auth.isLocalOnly()) return { pulled: 0 };

  const userId = Auth.getUserId();
  const cursor = await getSyncCursor();

  emit('sync.pull.start', { cursor });

  let query = sb
    .from('records')
    .select('id, store, data, updated_at, deleted_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (cursor) query = query.gt('updated_at', cursor);

  const { data, error } = await query;
  if (error) {
    console.error('[sync] pull failed', error);
    emit('sync.pull.error', { error });
    return { pulled: 0 };
  }

  let newest = cursor;
  let merged = 0;
  for (const row of data || []) {
    if (!SYNCED_STORES.includes(row.store)) continue;
    const res = await mergeIncoming(row);
    if (res === 'merged') merged++;
    if (!newest || row.updated_at > newest) newest = row.updated_at;
  }
  if (newest && newest !== cursor) await setSyncCursor(newest);

  emit('sync.pull.done', { pulled: merged, cursor: newest });
  return { pulled: merged };
}

export async function syncNow() {
  if (!isConfigured()) return { skipped: 'not-configured' };
  if (!Auth.isAuthenticated()) return { skipped: 'not-authenticated' };
  if (Auth.isLocalOnly()) return { skipped: 'local-only' };
  if (!isOnline()) return { skipped: 'offline' };

  if (running) { pending = true; return { skipped: 'already-running' }; }
  running = true;
  try {
    // If this is the first sync after login, reset the pull cursor when
    // the account changes so we hydrate the new user from scratch.
    const userId = Auth.getUserId();
    const lastUser = await getSignedInAs();
    if (lastUser && lastUser !== userId) {
      await setSyncCursor(null);
    }
    await setSignedInAs(userId);

    const pushRes = await push();
    const pullRes = await pull();
    return { pushed: pushRes.pushed, pulled: pullRes.pulled };
  } finally {
    running = false;
    if (pending) { pending = false; syncNow().catch(console.error); }
  }
}

async function attachRealtime() {
  const sb = await client();
  if (!sb || !Auth.isAuthenticated() || Auth.isLocalOnly()) return;

  if (realtimeChannel) await sb.removeChannel(realtimeChannel);

  const userId = Auth.getUserId();
  realtimeChannel = sb
    .channel('records-' + userId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` },
      async (payload) => {
        const row = payload.new || payload.old;
        if (!row || !SYNCED_STORES.includes(row.store)) return;
        await mergeIncoming(row);
        emit('sync.realtime', { store: row.store, id: row.id });
      },
    )
    .subscribe();
}

export function initSync() {
  if (!isConfigured()) return;

  Auth.onChange((session) => {
    if (session && !Auth.isLocalOnly()) {
      syncNow().catch(console.error);
      attachRealtime().catch(console.error);
    }
  });

  window.addEventListener('online', () => {
    emit('sync.online');
    syncNow().catch(console.error);
  });
  window.addEventListener('offline', () => {
    emit('sync.offline');
  });
  window.addEventListener('focus', () => {
    if (isOnline()) syncNow().catch(console.error);
  });

  // Push as soon as anything lands in the outbox (best-effort debounce
  // via requestIdleCallback when available).
  const schedule = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => setTimeout(fn, 500);

  Bus.on('db.put', () => schedule(() => syncNow().catch(console.error)));
  Bus.on('db.delete', () => schedule(() => syncNow().catch(console.error)));
}
