'use client'

import { saveSignature } from '../actions'
import { SignaturePad } from '@/components/ui/SignaturePad'

export function SignatureCaptureForm({ sessionId }: { sessionId: string }) {
  const action = saveSignature.bind(null, sessionId)
  return (
    <form action={action} className="form-stack signature-capture-form">
      <div className="field-grid">
        <div className="field-stack">
          <label htmlFor="signature_type" className="label">Signer role / title</label>
          <select id="signature_type" name="signature_type" className="select" defaultValue="Technician Signature">
            <option>Technician Signature</option><option>Customer Signature</option><option>Inspector Signature</option><option>Supervisor Signature</option>
          </select>
        </div>
        <div className="field-stack"><label htmlFor="signer_name" className="label">Signer name</label><input id="signer_name" name="signer_name" className="input" placeholder="Full name" required /></div>
      </div>
      <div className="form-actions"><SignaturePad /><button className="button button-primary touch-target">Save Signature</button></div>
    </form>
  )
}
