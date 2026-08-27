import { NextResponse } from "next/server";

import { requireSessionWorkspace } from "@/features/sessions/data";

const CAPTURE_BUCKET = "documentation-captures";

type VerifyRequest = {
  sessionId?: unknown;
  captureItemId?: unknown;
  localId?: unknown;
  clientMutationId?: unknown;
  storagePath?: unknown;
  expectedSize?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  technicianNote?: unknown;
  reportOrder?: unknown;
  clientItemId?: unknown;
  documentationItemId?: unknown;
  attachmentOrder?: unknown;
  sourceKind?: unknown;
  attachmentKind?: unknown;
};

function readString(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeNote(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyRequest;
    const sessionId = readString(body.sessionId, 120);
    const captureItemId = readString(body.captureItemId, 120);
    const clientMutationId = readString(body.clientMutationId, 160);
    const storagePath = readString(body.storagePath, 1000);
    const expectedSize = Number(body.expectedSize);
    const filename = readString(body.filename, 255).toLowerCase();
    const mimeType = readString(body.mimeType, 255).toLowerCase();
    const technicianNote = normalizeNote(body.technicianNote);
    const reportOrder = typeof body.reportOrder === "number" ? body.reportOrder : null;
    const clientItemId = readString(body.clientItemId, 160);
    const documentationItemId = readString(body.documentationItemId, 120);
    const attachmentOrder = typeof body.attachmentOrder === "number" ? body.attachmentOrder : null;
    const sourceKind = readString(body.sourceKind, 40);
    const attachmentKind = readString(body.attachmentKind, 40);

    if (!sessionId || !captureItemId || !storagePath) {
      return NextResponse.json({ ok: false, error: "Missing verification identifiers." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { supabase, profile } = await requireSessionWorkspace();
    const { data: capture, error } = await supabase
      .from("capture_items")
      .select("id, documentation_session_id, organization_id, documentation_item_id, attachment_order, attachment_kind, storage_path, original_filename, file_size_bytes, mime_type, technician_note, report_order, deleted_at")
      .eq("id", captureItemId)
      .eq("documentation_session_id", sessionId)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !capture) {
      return NextResponse.json({ ok: false, verified: false, error: error?.message ?? "Capture record not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const { data: documentationItem, error: documentationItemError } = await supabase
      .from("documentation_items")
      .select("id, client_item_id, item_kind")
      .eq("id", capture.documentation_item_id)
      .eq("documentation_session_id", sessionId)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (documentationItemError || !documentationItem) {
      return NextResponse.json({ ok: false, verified: false, error: documentationItemError?.message ?? "Item record not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const mismatches: string[] = [];
    const mismatchDetails: Array<{ mismatch: string; expected: unknown; actual: unknown }> = [];
    if (capture.storage_path !== storagePath) mismatches.push("storage_path");
    if (clientMutationId && !storagePath.includes(clientMutationId)) mismatches.push("client_mutation_id");
    if (Number.isFinite(expectedSize) && capture.file_size_bytes !== null && capture.file_size_bytes !== expectedSize) mismatches.push("file_size_bytes");
    if (mimeType && capture.mime_type && capture.mime_type.toLowerCase() !== mimeType) mismatches.push("mime_type");
    if (filename && capture.original_filename && capture.original_filename.toLowerCase() !== filename) mismatches.push("original_filename");
    if ((capture.technician_note ?? "") !== (technicianNote || "")) mismatches.push("technician_note");
    if (reportOrder !== null && capture.report_order !== reportOrder) {
      mismatches.push("report_order");
      mismatchDetails.push({ mismatch: "report_order", expected: reportOrder, actual: capture.report_order });
    }
    if (documentationItemId && capture.documentation_item_id !== documentationItemId) mismatches.push("documentation_item_id");
    if (clientItemId && documentationItem.client_item_id !== clientItemId) mismatches.push("client_item_id");
    if (attachmentOrder !== null && capture.attachment_order !== attachmentOrder) {
      mismatches.push("attachment_order");
      mismatchDetails.push({ mismatch: "attachment_order", expected: attachmentOrder, actual: capture.attachment_order });
    }
    if (attachmentKind && capture.attachment_kind !== attachmentKind) mismatches.push("attachment_kind");
    if (sourceKind && documentationItem.item_kind !== sourceKind) mismatches.push("item_kind");

    const { data: storedFile, error: storageError } = await supabase.storage
      .from(CAPTURE_BUCKET)
      .info(storagePath);

    if (storageError || !storedFile) mismatches.push("storage_object");
    const serverObjectSize = storedFile && typeof storedFile.size === "number" ? storedFile.size : null;
    if (storedFile && Number.isFinite(expectedSize) && serverObjectSize !== null && serverObjectSize !== expectedSize) mismatches.push("storage_size");
    if (storedFile && mimeType && storedFile.contentType && storedFile.contentType.toLowerCase() !== mimeType) mismatches.push("storage_content_type");

    if (mismatches.length > 0) {
      const failureStage = serverObjectSize === 0 && Number.isFinite(expectedSize) && expectedSize > 0
        ? "storage_upload_empty"
        : "verify_failed";
      return NextResponse.json({ ok: false, verified: false, mismatches, mismatchDetails, serverObjectSize, failureStage }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ ok: true, verified: true, captureItemId, documentationItemId: documentationItem.id, clientItemId: documentationItem.client_item_id, attachmentOrder: capture.attachment_order, attachmentKind: capture.attachment_kind, sourceKind: documentationItem.item_kind, sessionId, storagePath, serverObjectSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, verified: false, error: error instanceof Error ? error.message : "Unable to verify capture." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
