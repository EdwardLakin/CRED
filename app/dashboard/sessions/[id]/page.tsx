import { notFound, redirect } from "next/navigation";

import { requireSessionWorkspace } from "@/features/sessions/data";

export default async function SessionResumePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, profile } = await requireSessionWorkspace();
  const { data: session, error } = await supabase
    .from("documentation_sessions")
    .select("id, status, review_status, archived_at")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !session) notFound();

  if (session.archived_at) {
    redirect("/dashboard/sessions");
  }

  if (
    session.review_status === "ready_for_delivery" ||
    session.status === "finalized"
  ) {
    redirect(`/dashboard/sessions/${session.id}/export`);
  }

  if (
    session.status === "review" ||
    session.review_status === "review_required"
  ) {
    redirect(`/dashboard/sessions/${session.id}/report`);
  }

  redirect(`/dashboard/sessions/${session.id}/capture`);
}
