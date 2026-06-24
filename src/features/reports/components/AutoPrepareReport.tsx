"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function AutoPrepareReport({
  action,
  sessionId,
}: {
  action: () => Promise<void>;
  sessionId: string;
}) {
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    action()
      .then(() => {
        router.replace(`/dashboard/sessions/${sessionId}/report`);
        router.refresh();
      })
      .catch((error: unknown) => {
        const redirectDigest =
          typeof error === "object" &&
          error !== null &&
          "digest" in error &&
          typeof error.digest === "string"
            ? error.digest
            : "";

        const isRedirect =
          redirectDigest.startsWith("NEXT_REDIRECT") ||
          (error instanceof Error && error.message === "NEXT_REDIRECT");

        if (isRedirect) {
          router.replace(`/dashboard/sessions/${sessionId}/report`);
          router.refresh();
          return;
        }

        const message =
          error instanceof Error && error.message
            ? error.message
            : "Report could not be generated. Please try again.";
        const params = new URLSearchParams({ error: message });
        router.replace(`/dashboard/sessions/${sessionId}/report?${params}`);
      });
  }, [action, router, sessionId]);

  return null;
}
