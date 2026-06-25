import Link from "next/link";
import type { ReactNode } from "react";

export default async function SessionWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <div className="session-workspace-back-row">
        <Link
          href={`/dashboard/sessions/${id}`}
          className="secondary-link touch-target"
        >
          ← Back to Session
        </Link>
      </div>
      {children}
    </>
  );
}
