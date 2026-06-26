import { NextResponse } from "next/server";

import { requireActiveBillingAccess } from "@/features/billing";
import { requireSessionWorkspace } from "@/features/sessions/data";
import type { Database } from "@/lib/supabase/database.types";

type OfflineSessionRequest = {
  clientSessionId?: unknown;
  title?: unknown;
  sessionType?: unknown;
  createdAt?: unknown;
  idempotencyKey?: unknown;
  organizationId?: unknown;
};

function readString(
  value: unknown,
  maxLength: number,
) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as OfflineSessionRequest;

    const clientSessionId = readString(
      body.clientSessionId,
      160,
    );
    const requestedTitle = readString(body.title, 180);
    const requestedSessionType = readString(
      body.sessionType,
      120,
    );
    const requestedCreatedAt = readString(
      body.createdAt,
      64,
    );
    const requestedIdempotencyKey = readString(
      body.idempotencyKey,
      240,
    );

    const offlineClientId = requestedIdempotencyKey || clientSessionId;

    if (!clientSessionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing offline session identifier.",
        },
        { status: 400 },
      );
    }

    const { supabase, profile } =
      await requireSessionWorkspace();
    const billingAccess =
      requireActiveBillingAccess(profile);

    if (!billingAccess.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: billingAccess.message,
        },
        { status: 403 },
      );
    }

    const { data: existingSession } = await supabase
      .from("documentation_sessions")
      .select("id")
      .eq(
        "organization_id",
        profile.organization_id,
      )
      .eq("offline_client_id", offlineClientId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingSession) {
      return NextResponse.json({
        ok: true,
        sessionId: existingSession.id,
        recovered: true,
      });
    }

    const createdAt =
      requestedCreatedAt &&
      !Number.isNaN(Date.parse(requestedCreatedAt))
        ? new Date(requestedCreatedAt).toISOString()
        : new Date().toISOString();

    const title =
      requestedTitle ||
      `New Offline Session ${new Date(
        createdAt,
      ).toLocaleString()}`;

    const insertPayload = {
      title,
      session_type:
        requestedSessionType ||
        "General Evidence Report",
      session_metadata: {},
      status: "capturing",
      created_by: profile.id,
      organization_id: profile.organization_id,
      workflow_template_id: null,
      offline_client_id: offlineClientId,
      created_at: createdAt,
    } as Database["public"]["Tables"]["documentation_sessions"]["Insert"] & {
      offline_client_id: string;
    };

    const { data: session, error } = await supabase
      .from("documentation_sessions")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error || !session) {
      const { data: recoveredSession } =
        await supabase
          .from("documentation_sessions")
          .select("id")
          .eq(
            "organization_id",
            profile.organization_id,
          )
          .eq("offline_client_id", offlineClientId)
          .is("deleted_at", null)
          .maybeSingle();

      if (recoveredSession) {
        return NextResponse.json({
          ok: true,
          sessionId: recoveredSession.id,
          recovered: true,
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            error?.message ??
            "Unable to create offline session.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      recovered: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to create offline session.",
      },
      { status: 500 },
    );
  }
}
