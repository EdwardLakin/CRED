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
