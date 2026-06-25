export type ConnectivityStatus = {
  online: boolean;
  checkedAt: string;
};

type ConnectivityListener = (status: ConnectivityStatus) => void;

const listeners = new Set<ConnectivityListener>();

function now() {
  return new Date().toISOString();
}

export function getCurrentStatus(): ConnectivityStatus {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { online: true, checkedAt: now() };
  }

  return { online: navigator.onLine, checkedAt: now() };
}

function notify() {
  const status = getCurrentStatus();
  listeners.forEach((listener) => listener(status));
}

export function subscribe(listener: ConnectivityListener) {
  listeners.add(listener);

  if (typeof window !== "undefined" && listeners.size === 1) {
    window.addEventListener("online", notify);
    window.addEventListener("offline", notify);
  }

  listener(getCurrentStatus());

  return () => unsubscribe(listener);
}

export function unsubscribe(listener: ConnectivityListener) {
  listeners.delete(listener);

  if (typeof window !== "undefined" && listeners.size === 0) {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  }
}
