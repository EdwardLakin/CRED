"use client";

import { useEffect, useState } from "react";
import { getSyncQueueDebugItems } from "@/features/offline/queue";

export function SyncQueueDetails() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<{ localId: string; status: string; serverCaptureId: string | null; updatedAt: string; lastError: string | null; actionable: boolean }>>([]);
  useEffect(() => { if (open) void getSyncQueueDebugItems().then(setItems).catch(() => setItems([])); }, [open]);
  return <details className="sync-queue-details" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>View sync queue</summary>{items.length === 0 ? <p className="muted">No queued capture records on this device.</p> : <ul>{items.map((item) => <li key={item.localId}><code>{item.localId}</code> · {item.status} · {item.actionable ? 'action needed' : 'completed/recoverable'}{item.lastError ? ` · ${item.lastError}` : ''}</li>)}</ul>}</details>;
}
