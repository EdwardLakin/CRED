export type StorageEstimateResult = {
  supported: boolean;
  quota: number | null;
  usage: number | null;
  available: number | null;
  percentUsed: number | null;
};

export async function estimateStorage(): Promise<StorageEstimateResult> {
  if (
    typeof navigator === "undefined" ||
    !("storage" in navigator) ||
    typeof navigator.storage?.estimate !== "function"
  ) {
    return {
      supported: false,
      quota: null,
      usage: null,
      available: null,
      percentUsed: null,
    };
  }

  const estimate = await navigator.storage.estimate();
  const quota = typeof estimate.quota === "number" ? estimate.quota : null;
  const usage = typeof estimate.usage === "number" ? estimate.usage : null;
  const available = quota !== null && usage !== null ? Math.max(quota - usage, 0) : null;
  const percentUsed = quota && usage !== null ? Math.min((usage / quota) * 100, 100) : null;

  return {
    supported: true,
    quota,
    usage,
    available,
    percentUsed,
  };
}

export async function hasEnoughStorage(requiredBytes: number) {
  const estimate = await estimateStorage();

  if (!estimate.supported || estimate.available === null) {
    return true;
  }

  return estimate.available > requiredBytes;
}

export async function requestPersistentStorage() {
  if (
    typeof navigator === "undefined" ||
    !("storage" in navigator) ||
    typeof navigator.storage?.persist !== "function"
  ) {
    return {
      supported: false,
      persisted: false,
    };
  }

  const alreadyPersisted =
    typeof navigator.storage.persisted === "function"
      ? await navigator.storage.persisted()
      : false;

  if (alreadyPersisted) {
    return {
      supported: true,
      persisted: true,
    };
  }

  const persisted = await navigator.storage.persist();

  return {
    supported: true,
    persisted,
  };
}
