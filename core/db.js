// IndexedDB wrapper. Every mutation (`put`, `delete`) is implicitly
// instrumented for sync:
//   - `put` stamps `updatedAt` (server-ish timestamp, client clock) and
//     enqueues the record into the `_outbox` store.
//   - `delete` performs a soft-delete: it sets `deletedAt` on the record
//     and leaves the row in place so the sync engine can propagate the
//     tombstone to Supabase, which in turn lets other devices remove the
//     row locally. Hard removal happens via `purge` after confirmation
//     from the server.
//
// Call `DB.init({ name, version, upgrade })` before any other method.
// `DB.setSyncEnabled(false)` temporarily suppresses outbox writes — used
// by the legacy importer so the upfront bulk load doesn't generate 500
// outbox rows before we know the user has a Supabase session.

import { uuid } from './ids.js';
import { Bus } from './bus.js';

let syncEnabled = true;
const INTERNAL_STORES = new Set(['_outbox', '_sync']);

function isoNow() {
  return new Date().toISOString();
}

function keyOf(store, id) {
  return `${store}:${id}`;
}

export const DB = {
  _db: null,
  _config: null,

  init({ name, version, upgrade }) {
    this._config = { name, version, upgrade };
    this._db = null;
  },

  setSyncEnabled(value) {
    syncEnabled = Boolean(value);
  },

  isSyncEnabled() {
    return syncEnabled;
  },

  open() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      if (!this._config) return reject(new Error('DB not configured — call DB.init first'));
      const req = indexedDB.open(this._config.name, this._config.version);
      req.onupgradeneeded = (e) => {
        this._config.upgrade(e.target.result, e.oldVersion, e.newVersion, e.target.transaction);
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(store) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getAllActive(store) {
    const rows = await this.getAll(store);
    return rows.filter((r) => !r.deletedAt);
  },

  async get(store, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getByIndex(store, indexName, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const idx = tx.objectStore(store).index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // Main mutation. Assigns an id if missing, stamps `updatedAt`, and
  // enqueues the record for sync unless the store is internal.
  async put(store, record) {
    const db = await this.open();
    const keyPath = store === 'settings' ? 'key' : 'id';
    const toStore = { ...record };
    if (!toStore[keyPath]) {
      if (keyPath === 'id') toStore.id = uuid();
      else throw new Error(`put('${store}') requires a ${keyPath}`);
    }
    toStore.updatedAt = isoNow();
    if (!('deletedAt' in toStore)) toStore.deletedAt = null;

    const isInternal = INTERNAL_STORES.has(store);
    const stores = isInternal || !syncEnabled ? [store] : [store, '_outbox'];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore(store).put(toStore);
      if (stores.includes('_outbox')) {
        const id = toStore[keyPath];
        tx.objectStore('_outbox').put({
          key: keyOf(store, id),
          store,
          id,
          updatedAt: toStore.updatedAt,
        });
      }
      tx.oncomplete = () => {
        if (!isInternal) Bus.emit('db.put', { store, id: toStore[keyPath] });
        resolve(toStore);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  // Soft delete: marks deletedAt and keeps the row so sync can propagate
  // the tombstone. `purge` deletes the row outright.
  async delete(store, key) {
    const db = await this.open();
    const existing = await this.get(store, key);
    if (!existing) return;
    const keyPath = store === 'settings' ? 'key' : 'id';
    const tombstone = { ...existing, deletedAt: isoNow(), updatedAt: isoNow() };

    const isInternal = INTERNAL_STORES.has(store);
    const stores = isInternal || !syncEnabled ? [store] : [store, '_outbox'];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore(store).put(tombstone);
      if (stores.includes('_outbox')) {
        tx.objectStore('_outbox').put({
          key: keyOf(store, tombstone[keyPath]),
          store,
          id: tombstone[keyPath],
          updatedAt: tombstone.updatedAt,
        });
      }
      tx.oncomplete = () => {
        if (!isInternal) Bus.emit('db.delete', { store, id: tombstone[keyPath] });
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  },

  async purge(store, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async clearStore(store) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Settings helpers. Reads and writes through the normal put/get, so
  // preferences are synced like any other row.
  async getSetting(key, fallback = null) {
    const row = await this.get('settings', key);
    if (!row || row.deletedAt) return fallback;
    return row.value;
  },

  async setSetting(key, value) {
    return this.put('settings', { key, value });
  },

  // Raw write bypassing sync stamping. Used by the sync pull path when it
  // receives authoritative rows from Supabase — we don't want to re-stamp
  // updatedAt with the local clock.
  async putRaw(store, record) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
