import Link from "next/link";
import type { ReactNode } from "react";

import { SessionFlowNav } from "@/features/sessions/components/SessionFlowNav";
import { requireSessionWorkspace } from "@/features/sessions/data";

import styles from "./layout.module.css";

export default async function SessionWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, profile } = await requireSessionWorkspace();
  const { data: session } = await supabase
    .from("documentation_sessions")
    .select("status, review_status, archived_at")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  const maxAvailableStep =
    session?.review_status === "ready_for_delivery" ||
    session?.status === "finalized"
      ? 3
      : session?.status === "review" ||
          session?.review_status === "review_required"
        ? 2
        : 0;

  return (
    <>
      <div className={styles.shell}>
        <div className={styles.inner}>
          <div className={styles.utilityRow}>
            <Link href="/dashboard/sessions" className={styles.backLink}>
              ← All sessions
            </Link>
          </div>
          <SessionFlowNav
            maxAvailableStep={maxAvailableStep}
            sessionId={id}
          />
        </div>
      </div>
      {children}
    </>
  );
}
