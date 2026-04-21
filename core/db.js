// Generic IndexedDB wrapper. The schema is declared by the caller via
// DB.init({ name, version, upgrade }). The upgrade callback receives the
// raw IDBDatabase instance and is responsible for createObjectStore /
// createIndex calls. Phase 2 wires the fit.mi v2 schema on top of this.

export const DB = {
  _db: null,
  _config: null,

  init({ name, version, upgrade }) {
    this._config = { name, version, upgrade };
    this._db = null;
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

  async put(store, data) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(data);
      req.onsuccess = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  },

  async add(store, data) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).add(data);
      req.onsuccess = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  },

  async delete(store, key) {
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

  // Read-through settings helper. `settings` store must have keyPath 'key'.
  async getSetting(key, fallback = null) {
    const row = await this.get('settings', key);
    return row ? row.value : fallback;
  },

  async setSetting(key, value) {
    return this.put('settings', { key, value });
  },
};

// Stable id generator for stores that don't use autoIncrement (habits,
// completions). Same algorithm as habitstack: base-36 timestamp + random.
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
