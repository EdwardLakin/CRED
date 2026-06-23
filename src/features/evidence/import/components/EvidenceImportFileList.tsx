'use client'

export function EvidenceImportFileList({ files }: { files: File[] }) {
  if (files.length === 0) return <p className="muted">No files selected yet.</p>
  return <ul className="metadata-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><strong>{file.name}</strong> · {file.type || 'unknown type'} · {file.size.toLocaleString()} bytes</li>)}</ul>
}
