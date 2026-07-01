"use client";

type ReportStudioSessionSelectorProps = {
  value: string;
  sessions: Array<{
    id: string;
    display_id?: string | null;
    title: string;
    status?: string;
    review_status?: string;
  }>;
  form?: string;
  onChange: (value: string) => void;
};

export function ReportStudioSessionSelector({
  value,
  sessions,
  form,
  onChange,
}: ReportStudioSessionSelectorProps) {
  return (
    <select
      className="input"
      name="review_output_id"
      form={form}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {sessions.map((session) => (
        <option key={session.id} value={session.id}>
          {session.display_id ?? session.id} · {session.title}
          {session.status ? ` · status: ${session.status}` : ""}
          {session.review_status ? ` · review: ${session.review_status}` : ""}
        </option>
      ))}
    </select>
  );
}
