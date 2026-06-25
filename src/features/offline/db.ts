import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  CachedSessionRecord,
  OfflineCaptureRecord,
  OfflineSessionRecord,
  OfflineSettings,
  SyncStateRecord,
} from "@/features/offline/types";

export const OFFLINE_DB_NAME = "cred-offline";
export const OFFLINE_DB_VERSION = 2;

export interface CredOfflineSchema extends DBSchema {
  queuedCaptures: {
    key: string;
    value: OfflineCaptureRecord;
    indexes: {
      "by-session": string;
      "by-user": string;
      "by-status": string;
      "by-created-at": string;
    };
  };
  cachedSessions: {
    key: string;
    value: CachedSessionRecord;
    indexes: {
      "by-user": string;
      "by-organization": string;
      "by-cached-at": string;
    };
  };
  offlineSessions: {
    key: string;
    value: OfflineSessionRecord;
    indexes: {
      "by-user": string;
      "by-organization": string;
      "by-status": string;
      "by-created-at": string;
    };
  };
  syncState: {
    key: string;
    value: SyncStateRecord;
  };
  settings: {
    key: string;
    value: OfflineSettings;
  };
}

export type CredOfflineDatabase = IDBPDatabase<CredOfflineSchema>;

let offlineDbPromise: Promise<CredOfflineDatabase> | null = null;

export function isIndexedDbAvailable() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function getOfflineDb() {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }

  offlineDbPromise ??= openDB<CredOfflineSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("queuedCaptures")) {
        const store = db.createObjectStore("queuedCaptures", { keyPath: "localId" });
        store.createIndex("by-session", "sessionId");
        store.createIndex("by-user", "userId");
        store.createIndex("by-status", "status");
        store.createIndex("by-created-at", "createdAt");
      }

      if (!db.objectStoreNames.contains("cachedSessions")) {
        const store = db.createObjectStore("cachedSessions", { keyPath: "sessionId" });
        store.createIndex("by-user", "userId");
        store.createIndex("by-organization", "organizationId");
        store.createIndex("by-cached-at", "cachedAt");
      }

      if (!db.objectStoreNames.contains("offlineSessions")) {
        const store = db.createObjectStore(
          "offlineSessions",
          { keyPath: "localSessionId" },
        );
        store.createIndex("by-user", "userId");
        store.createIndex(
          "by-organization",
          "organizationId",
        );
        store.createIndex("by-status", "status");
        store.createIndex(
          "by-created-at",
          "createdAt",
        );
      }

      if (!db.objectStoreNames.contains("syncState")) {
        db.createObjectStore("syncState", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    },
  });

  return offlineDbPromise;
}
