const OFFLINE_USER_KEY = "cred-offline-user-id";
const OFFLINE_ORGANIZATION_KEY = "cred-offline-organization-id";

export function saveOfflineIdentity(
  userId: string,
  organizationId: string,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(OFFLINE_USER_KEY, userId);
  window.localStorage.setItem(
    OFFLINE_ORGANIZATION_KEY,
    organizationId,
  );
}

export function getOfflineIdentity() {
  if (typeof window === "undefined") {
    return null;
  }

  const userId = window.localStorage.getItem(OFFLINE_USER_KEY);
  const organizationId = window.localStorage.getItem(
    OFFLINE_ORGANIZATION_KEY,
  );

  if (!userId || !organizationId) {
    return null;
  }

  return {
    userId,
    organizationId,
  };
}
