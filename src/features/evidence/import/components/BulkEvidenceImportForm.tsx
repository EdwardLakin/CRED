'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { importBulkEvidence, type BulkEvidenceImportResult } from '../actions'
import { EvidenceImportFileList } from './EvidenceImportFileList'

export function BulkEvidenceImportForm({ sessionId }: { sessionId: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [result, setResult] = useState<BulkEvidenceImportResult | null>(null)
  const [isPending, startTransition] = useTransition()

  return <form ref={formRef} className="card detail-card form-stack" action={(formData) => startTransition(async () => setResult(await importBulkEvidence(sessionId, formData)))}>
    <div><p className="eyebrow">Bulk import</p><h2>Upload multiple evidence files</h2><p className="muted">Files stay in private storage and are tracked in one import batch.</p></div>
    <input className="input" name="files" type="file" multiple onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} />
    <EvidenceImportFileList files={files} />
    <div className="form-actions"><button className="button button-primary" disabled={isPending || files.length === 0}>{isPending ? 'Uploading…' : 'Upload files'}</button><Link className="button button-secondary" href={`/dashboard/sessions/${sessionId}/evidence`}>Back to Evidence Library</Link></div>
    {result ? <div className={result.ok ? 'success' : 'error'}><p>{result.message}</p>{result.batchId ? <Link href={`/dashboard/sessions/${sessionId}/evidence/import/${result.batchId}`}>Review batch</Link> : null}<ul>{result.files.map((file, index) => <li key={`${file.name}-${index}`}>{file.ok ? '✓' : '✕'} {file.name}{file.error ? ` — ${file.error}` : ''}</li>)}</ul></div> : null}
  </form>
}
