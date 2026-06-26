import { NextResponse } from "next/server";

import { requireSessionWorkspace } from "@/features/sessions/data";

export async function GET() {
  try {
    const { profile } = await requireSessionWorkspace();
    return NextResponse.json(
      {
        ok: true,
        status: "ready",
        userId: profile.user_id,
        organizationId: profile.organization_id,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "unauthenticated",
        error: error instanceof Error ? error.message : "Sign-in required.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
