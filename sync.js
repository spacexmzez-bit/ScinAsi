/**
 * sync.js
 * Orchestrates offline-first delta-syncing between local IndexedDB and the Cloudflare Worker.
 * Communicates with: POST /api/sync
 */

class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncListeners = [];
  }

  /**
   * Register callbacks for sync status updates (e.g., UI indicators)
   * @param {Function} callback ({ status: 'syncing' | 'synced' | 'error', message?: string })
   */
  onSyncStatusChange(callback) {
    this.syncListeners.push(callback);
  }

  _notify(status, message = "") {
    this.syncListeners.forEach((cb) => cb({ status, message }));
  }

  /**
   * Executes bidirectional delta sync
   */
  async runSync() {
    if (this.isSyncing) return;

    const workerUrl = await window.localDB.getSetting("worker_url");
    const authToken = await window.localDB.getSetting("auth_token");

    if (!workerUrl || !authToken) {
      this._notify("error", "Missing Worker URL or Auth Token in Settings.");
      return;
    }

    this.isSyncing = true;
    this._notify("syncing");

    try {
      // 1. Gather pending mutations from outbox queue
      const queuedEntries = await window.localDB.getQueuedChanges();
      const lastSyncTimestamp = (await window.localDB.getSetting("last_sync_timestamp")) || 0;

      const changesPayload = {
        experiments: [],
        gallery: [],
      };

      queuedEntries.forEach((entry) => {
        if (entry.entityType === "experiments") {
          changesPayload.experiments.push(entry.payload);
        } else if (entry.entityType === "gallery") {
          changesPayload.gallery.push(entry.payload);
        }
      });

      // 2. Transmit delta changes to Cloudflare Worker
      const endpoint = `${workerUrl.replace(/\/+$/, "")}/api/sync`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          lastSync: lastSyncTimestamp,
          changes: changesPayload,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      const syncData = await response.json();

      // 3. Clear flushed outbox items
      const processedQueueIds = queuedEntries.map((e) => e.queueId);
      await window.localDB.clearQueueByIds(processedQueueIds);

      // 4. Ingest server updates into local IndexedDB without re-queueing to outbox
      if (syncData.serverUpdates) {
        // Sync experiments
        if (Array.isArray(syncData.serverUpdates.experiments)) {
          for (const serverExp of syncData.serverUpdates.experiments) {
            if (serverExp.deleted_at) {
              await window.localDB.putExperiment({ ...serverExp, deleted_at: serverExp.deleted_at }, false);
            } else {
              await window.localDB.putExperiment(serverExp, false);
            }
          }
        }

        // Sync gallery items
        if (Array.isArray(syncData.serverUpdates.gallery)) {
          for (const serverItem of syncData.serverUpdates.gallery) {
            if (serverItem.deleted_at) {
              await window.localDB.putGalleryItem({ ...serverItem, deleted_at: serverItem.deleted_at }, false);
            } else {
              await window.localDB.putGalleryItem(serverItem, false);
            }
          }
        }
      }

      // 5. Update local sync timestamp
      await window.localDB.setSetting("last_sync_timestamp", syncData.syncTimestamp || Date.now());

      this._notify("synced", "All changes synced.");
    } catch (err) {
      console.error("[SyncManager] Error:", err);
      this._notify("error", err.message || "Failed to sync with worker.");
    } finally {
      this.isSyncing = false;
    }
  }
}

// Global sync manager instance
window.syncManager = new SyncManager();
