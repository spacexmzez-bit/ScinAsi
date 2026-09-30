/**
 * db.js
 * Lightweight zero-dependency IndexedDB engine for ScinAsi.
 * Handles local persistence for experiments, gallery items, outbox sync queue, and user settings.
 */

const DB_NAME = "ScinAsi_LocalDB";
const DB_VERSION = 1;

class LocalDatabase {
  constructor() {
    this.db = null;
  }

  /**
   * Initializes and upgrades IndexedDB schema
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store: Experiments
        if (!db.objectStoreNames.contains("experiments")) {
          const expStore = db.createObjectStore("experiments", { keyPath: "id" });
          expStore.createIndex("by_updated", "updated_at");
          expStore.createIndex("by_genre", "genre");
        }

        // Store: Gallery Items
        if (!db.objectStoreNames.contains("gallery")) {
          const galStore = db.createObjectStore("gallery", { keyPath: "id" });
          galStore.createIndex("by_experiment", "experiment_id");
          galStore.createIndex("by_created", "created_at");
        }

        // Store: Sync Outbox (Pending mutations awaiting server confirmation)
        if (!db.objectStoreNames.contains("sync_queue")) {
          db.createObjectStore("sync_queue", { keyPath: "queueId", autoIncrement: true });
        }

        // Store: Key-value app configuration & sync meta
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(new Error(`Failed to open IndexedDB: ${event.target.error?.message}`));
      };
    });
  }

  /**
   * Generic transaction wrapper
   */
  async _tx(storeName, mode, callback) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);

      result = callback(store);
    });
  }

  // --- Experiments CRUD ---

  async getAllExperiments() {
    return this._tx("experiments", "readonly", (store) => {
      return new Promise((res) => {
        const req = store.getAll();
        req.onsuccess = () => {
          // Filter out locally soft-deleted records
          const active = (req.result || []).filter((e) => !e.deleted_at);
          res(active);
        };
      });
    });
  }

  async getExperiment(id) {
    return this._tx("experiments", "readonly", (store) => {
      return new Promise((res) => {
        const req = store.get(id);
        req.onsuccess = () => res(req.result || null);
      });
    });
  }

  async putExperiment(experiment, recordSync = true) {
    await this._tx("experiments", "readwrite", (store) => {
      store.put(experiment);
    });

    if (recordSync) {
      await this.enqueueChange("experiments", experiment);
    }
  }

  async deleteExperiment(id) {
    const experiment = await this.getExperiment(id);
    if (!experiment) return;

    experiment.deleted_at = Date.now();
    experiment.updated_at = Date.now();

    await this._tx("experiments", "readwrite", (store) => {
      store.put(experiment);
    });

    await this.enqueueChange("experiments", { id, deleted: true });
  }

  // --- Gallery Items CRUD ---

  async getAllGalleryItems() {
    return this._tx("gallery", "readonly", (store) => {
      return new Promise((res) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const active = (req.result || []).filter((item) => !item.deleted_at);
          active.sort((a, b) => b.created_at - a.created_at);
          res(active);
        };
      });
    });
  }

  async getGalleryByExperiment(experimentId) {
    const all = await this.getAllGalleryItems();
    return all.filter((item) => item.experiment_id === experimentId);
  }

  async putGalleryItem(item, recordSync = true) {
    await this._tx("gallery", "readwrite", (store) => {
      store.put(item);
    });

    if (recordSync) {
      await this.enqueueChange("gallery", item);
    }
  }

  async deleteGalleryItem(id) {
    const item = await this._tx("gallery", "readonly", (store) => {
      return new Promise((res) => {
        const req = store.get(id);
        req.onsuccess = () => res(req.result || null);
      });
    });

    if (!item) return;

    item.deleted_at = Date.now();
    await this._tx("gallery", "readwrite", (store) => {
      store.put(item);
    });

    await this.enqueueChange("gallery", { id, deleted: true });
  }

  // --- Outbox Sync Queue ---

  async enqueueChange(entityType, payload) {
    const entry = {
      entityType,
      payload,
      timestamp: Date.now(),
    };
    return this._tx("sync_queue", "readwrite", (store) => {
      store.add(entry);
    });
  }

  async getQueuedChanges() {
    return this._tx("sync_queue", "readonly", (store) => {
      return new Promise((res) => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result || []);
      });
    });
  }

  async clearQueueByIds(queueIds) {
    if (!queueIds || queueIds.length === 0) return;
    return this._tx("sync_queue", "readwrite", (store) => {
      queueIds.forEach((id) => store.delete(id));
    });
  }

  // --- App Settings & Sync Metadata ---

  async getSetting(key) {
    return this._tx("settings", "readonly", (store) => {
      return new Promise((res) => {
        const req = store.get(key);
        req.onsuccess = () => res(req.result ? req.result.value : null);
      });
    });
  }

  async setSetting(key, value) {
    return this._tx("settings", "readwrite", (store) => {
      store.put({ key, value });
    });
  }
}

// Global database instance
window.localDB = new LocalDatabase();
