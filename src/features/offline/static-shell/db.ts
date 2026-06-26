import { OFFLINE_DB_NAME, OFFLINE_DB_VERSION } from './contracts.js';

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string | string[]) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
}

export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!db.objectStoreNames.contains('queuedCaptures')) {
        const store = db.createObjectStore('queuedCaptures', { keyPath: 'localId' });
        ensureIndex(store, 'by-session', 'sessionId');
        ensureIndex(store, 'by-local-session', 'localSessionId');
        ensureIndex(store, 'by-local-session-status', ['localSessionId', 'status']);
        ensureIndex(store, 'by-local-session-order', ['localSessionId', 'metadata.reportOrder']);
        ensureIndex(store, 'by-user', 'userId');
        ensureIndex(store, 'by-status', 'status');
        ensureIndex(store, 'by-created-at', 'createdAt');
      }
      if (!db.objectStoreNames.contains('cachedSessions')) {
        const store = db.createObjectStore('cachedSessions', { keyPath: 'sessionId' });
        ensureIndex(store, 'by-user', 'userId');
        ensureIndex(store, 'by-organization', 'organizationId');
        ensureIndex(store, 'by-cached-at', 'cachedAt');
      }
      if (!db.objectStoreNames.contains('offlineSessions')) {
        const store = db.createObjectStore('offlineSessions', { keyPath: 'localSessionId' });
        ensureIndex(store, 'by-user', 'userId');
        ensureIndex(store, 'by-organization', 'organizationId');
        ensureIndex(store, 'by-organization-user', ['organizationId', 'userId']);
        ensureIndex(store, 'by-status', 'status');
        ensureIndex(store, 'by-updated-at', 'updatedAt');
        ensureIndex(store, 'by-last-opened-at', 'lastOpenedAt');
        ensureIndex(store, 'by-created-at', 'createdAt');
      }
      if (!db.objectStoreNames.contains('syncState')) db.createObjectStore('syncState', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (tx && db.objectStoreNames.contains('queuedCaptures')) {
        const store = tx.objectStore('queuedCaptures');
        ensureIndex(store, 'by-local-session', 'localSessionId');
        ensureIndex(store, 'by-local-session-status', ['localSessionId', 'status']);
        ensureIndex(store, 'by-local-session-order', ['localSessionId', 'metadata.reportOrder']);
      }
      if (tx && db.objectStoreNames.contains('offlineSessions')) {
        const store = tx.objectStore('offlineSessions');
        ensureIndex(store, 'by-organization-user', ['organizationId', 'userId']);
        ensureIndex(store, 'by-updated-at', 'updatedAt');
        ensureIndex(store, 'by-last-opened-at', 'lastOpenedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName: string): Promise<unknown[]> {
  const db = await openOfflineDb();
  return new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function put<T>(storeName: string, value: T): Promise<T> {
  const db = await openOfflineDb();
  return new Promise<T>((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}
export async function remove(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openOfflineDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
