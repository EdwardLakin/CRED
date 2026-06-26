import { OFFLINE_DB_VERSION } from "@/features/offline/db";

const OFFLINE_USER_KEY = "cred-offline-user-id";
const OFFLINE_ORGANIZATION_KEY = "cred-offline-organization-id";
const OFFLINE_PROVISIONED_AT_KEY = "cred-offline-provisioned-at";
const OFFLINE_SCHEMA_VERSION_KEY = "cred-offline-schema-version";
const OFFLINE_CAPTURE_LIMITS_KEY = "cred-offline-capture-limits";
const OFFLINE_WORKSPACE_KEY = "cred-offline-workspace";

export type OfflineIdentity = {
  userId: string;
  organizationId: string;
  provisionedAt: string;
  schemaVersion: number;
  captureLimits: {
    maxCaptureFileSizeBytes: number;
    maxVideoFileSizeBytes: number;
  };
  workspace: {
    workspaceId: string | null;
    tenantId: string;
  };
};

export function saveOfflineIdentity(
  userId: string,
  organizationId: string,
  options: Partial<Pick<OfflineIdentity, "captureLimits" | "workspace">> = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  const identity: OfflineIdentity = {
    userId,
    organizationId,
    provisionedAt: new Date().toISOString(),
    schemaVersion: OFFLINE_DB_VERSION,
    captureLimits: options.captureLimits ?? {
      maxCaptureFileSizeBytes: 25 * 1024 * 1024,
      maxVideoFileSizeBytes: 50 * 1024 * 1024,
    },
    workspace: options.workspace ?? {
      workspaceId: null,
      tenantId: organizationId,
    },
  };

  window.localStorage.setItem(OFFLINE_USER_KEY, identity.userId);
  window.localStorage.setItem(OFFLINE_ORGANIZATION_KEY, identity.organizationId);
  window.localStorage.setItem(OFFLINE_PROVISIONED_AT_KEY, identity.provisionedAt);
  window.localStorage.setItem(OFFLINE_SCHEMA_VERSION_KEY, String(identity.schemaVersion));
  window.localStorage.setItem(OFFLINE_CAPTURE_LIMITS_KEY, JSON.stringify(identity.captureLimits));
  window.localStorage.setItem(OFFLINE_WORKSPACE_KEY, JSON.stringify(identity.workspace));
}

function parseJsonRecord(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function getOfflineIdentity(): OfflineIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }

  const userId = window.localStorage.getItem(OFFLINE_USER_KEY);
  const organizationId = window.localStorage.getItem(OFFLINE_ORGANIZATION_KEY);

  if (!userId || !organizationId) {
    return null;
  }

  const limits = parseJsonRecord(window.localStorage.getItem(OFFLINE_CAPTURE_LIMITS_KEY));
  const workspace = parseJsonRecord(window.localStorage.getItem(OFFLINE_WORKSPACE_KEY));

  return {
    userId,
    organizationId,
    provisionedAt: window.localStorage.getItem(OFFLINE_PROVISIONED_AT_KEY) ?? "",
    schemaVersion: Number(window.localStorage.getItem(OFFLINE_SCHEMA_VERSION_KEY) ?? OFFLINE_DB_VERSION),
    captureLimits: {
      maxCaptureFileSizeBytes: typeof limits?.maxCaptureFileSizeBytes === "number" ? limits.maxCaptureFileSizeBytes : 25 * 1024 * 1024,
      maxVideoFileSizeBytes: typeof limits?.maxVideoFileSizeBytes === "number" ? limits.maxVideoFileSizeBytes : 50 * 1024 * 1024,
    },
    workspace: {
      workspaceId: typeof workspace?.workspaceId === "string" ? workspace.workspaceId : null,
      tenantId: typeof workspace?.tenantId === "string" ? workspace.tenantId : organizationId,
    },
  };
}
