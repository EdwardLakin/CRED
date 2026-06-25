import { getCurrentStatus, subscribe } from "@/features/offline/connectivity";
import { getPendingCaptures } from "@/features/offline/queue";

type SyncEngineListener = (state: OfflineSyncEngineState) => void;

export type OfflineSyncEngineState = {
  running: boolean;
  syncing: boolean;
  pendingCount: number;
  lastError: string | null;
};

export class OfflineSyncEngine {
  private running = false;
  private syncing = false;
  private listeners = new Set<SyncEngineListener>();
  private unsubscribeConnectivity: (() => void) | null = null;
  private pendingCount = 0;
  private lastError: string | null = null;

  start() {
    if (this.running) {
      return;
    }

    this.running = true;

    this.unsubscribeConnectivity = subscribe((status) => {
      if (status.online) {
        void this.syncNow();
      }
    });

    void this.refreshPendingCount();
    this.emit();
  }

  stop() {
    this.running = false;
    this.unsubscribeConnectivity?.();
    this.unsubscribeConnectivity = null;
    this.emit();
  }

  subscribe(listener: SyncEngineListener) {
    this.listeners.add(listener);
    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): OfflineSyncEngineState {
    return {
      running: this.running,
      syncing: this.syncing,
      pendingCount: this.pendingCount,
      lastError: this.lastError,
    };
  }

  async syncNow() {
    if (this.syncing) {
      return this.getState();
    }

    if (!getCurrentStatus().online) {
      return this.getState();
    }

    this.syncing = true;
    this.lastError = null;
    this.emit();

    try {
      await this.processQueue();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Offline sync failed.";
    } finally {
      this.syncing = false;
      await this.refreshPendingCount();
      this.emit();
    }

    return this.getState();
  }

  async processQueue() {
    const pending = await getPendingCaptures();
    this.pendingCount = pending.length;

    return pending;
  }

  private async refreshPendingCount() {
    try {
      this.pendingCount = (await getPendingCaptures()).length;
    } catch {
      this.pendingCount = 0;
    }
  }

  private emit() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}

let offlineSyncEngine: OfflineSyncEngine | null = null;

export function getOfflineSyncEngine() {
  offlineSyncEngine ??= new OfflineSyncEngine();
  return offlineSyncEngine;
}
