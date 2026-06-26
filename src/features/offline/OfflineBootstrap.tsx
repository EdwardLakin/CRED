"use client";

import { useEffect } from "react";

import { saveOfflineIdentity } from "@/features/offline/offline-identity";
import { requestPersistentStorage } from "@/features/offline/storage";

type OfflineBootstrapProps = {
  userId: string;
  organizationId: string;
};

export function OfflineBootstrap({
  userId,
  organizationId,
}: OfflineBootstrapProps) {
  useEffect(() => {
    saveOfflineIdentity(userId, organizationId);


    void requestPersistentStorage().catch((error: unknown) => {
      console.warn(
        "CRED could not request persistent offline storage",
        error,
      );
    });

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready
        .then((registration) => registration.update())
        .catch((error: unknown) => {
          console.warn(
            "CRED could not update the offline app shell",
            error,
          );
        });
    }
  }, [organizationId, userId]);

  return null;
}
