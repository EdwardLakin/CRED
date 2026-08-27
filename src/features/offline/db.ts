import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  CachedSessionRecord,
  OfflineCaptureRecord,
  OfflineSessionRecord,
  OfflineSettings,
  SyncStateRecord,
} from "@/features/offline/types";

export const OFFLINE_DB_NAME = "cred-offline";
export const OFFLINE_DB_VERSION = 4;

export interface CredOfflineSchema extends DBSchema {
  queuedCaptures: {
    key: string;
    value: OfflineCaptureRecord;
    indexes: {
      "by-session": string;
      "by-local-session": string;
      "by-local-session-status": [string, string];
      "by-local-session-order": [string, number];
      "by-local-session-item-order": [string, string, number];
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
      "by-organization-user": [string, string];
      "by-status": string;
      "by-updated-at": string;
      "by-last-opened-at": string;
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
    upgrade(db, _oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains("queuedCaptures")) {
        const store = db.createObjectStore("queuedCaptures", { keyPath: "localId" });
        store.createIndex("by-session", "sessionId");
        store.createIndex("by-local-session", "localSessionId");
        store.createIndex("by-local-session-status", ["localSessionId", "status"]);
        store.createIndex("by-local-session-order", ["localSessionId", "metadata.reportOrder"]);
        store.createIndex("by-local-session-item-order", ["localSessionId", "metadata.clientItemId", "metadata.attachmentOrder"]);
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
        store.createIndex("by-organization", "organizationId");
        store.createIndex("by-organization-user", ["organizationId", "userId"]);
        store.createIndex("by-status", "status");
        store.createIndex("by-updated-at", "updatedAt");
        store.createIndex("by-last-opened-at", "lastOpenedAt");
        store.createIndex("by-created-at", "createdAt");
      }

      if (!db.objectStoreNames.contains("syncState")) {
        db.createObjectStore("syncState", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      if (db.objectStoreNames.contains("queuedCaptures")) {
        const store = transaction.objectStore("queuedCaptures");
        if (!store.indexNames.contains("by-local-session")) store.createIndex("by-local-session", "localSessionId");
        if (!store.indexNames.contains("by-local-session-status")) store.createIndex("by-local-session-status", ["localSessionId", "status"]);
        if (!store.indexNames.contains("by-local-session-order")) store.createIndex("by-local-session-order", ["localSessionId", "metadata.reportOrder"]);
        if (!store.indexNames.contains("by-local-session-item-order")) store.createIndex("by-local-session-item-order", ["localSessionId", "metadata.clientItemId", "metadata.attachmentOrder"]);
      }

      if (db.objectStoreNames.contains("offlineSessions")) {
        const store = transaction.objectStore("offlineSessions");
        if (!store.indexNames.contains("by-organization-user")) store.createIndex("by-organization-user", ["organizationId", "userId"]);
        if (!store.indexNames.contains("by-updated-at")) store.createIndex("by-updated-at", "updatedAt");
        if (!store.indexNames.contains("by-last-opened-at")) store.createIndex("by-last-opened-at", "lastOpenedAt");
      }
    },
  });

  return offlineDbPromise;
}
