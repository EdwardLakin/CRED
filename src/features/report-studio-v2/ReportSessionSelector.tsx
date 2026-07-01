 
import type { ReportStudioSession } from "./types";
export function ReportSessionSelector({ sessions, value, onChange }: { sessions: ReportStudioSession[]; value: string | null; onChange: (id: string) => void }) {
  return <label className="rsv2-field rsv2-session"><span>Session</span><select value={value ?? ""} onChange={(e)=>onChange(e.target.value)}>{sessions.map((s)=><option key={s.id} value={s.id}>{s.display_id ?? s.id} · {s.title ?? "Untitled"} · {s.status ?? "status n/a"}</option>)}</select></label>;
}
