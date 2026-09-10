'use client'

import { useState } from 'react'

import { saveSignature } from '../actions'
import { SignaturePad } from '@/components/ui/SignaturePad'

/**
 * Roles the signed-in user plausibly signs under themselves. A customer or a
 * supervisor is a different person, so their name must never be inherited from
 * whoever happens to be logged in — that would attribute a signature on a
 * customer-facing document to someone who did not give it.
 */
const SELF_SIGNED_ROLES = new Set(['Technician Signature', 'Inspector Signature'])

const SIGNER_ROLES = [
  'Technician Signature',
  'Customer Signature',
  'Inspector Signature',
  'Supervisor Signature',
]

export function SignatureCaptureForm({ sessionId, defaultSignerName = '' }: { sessionId: string; defaultSignerName?: string }) {
  const action = saveSignature.bind(null, sessionId)
  const [role, setRole] = useState('Technician Signature')
  const [signerName, setSignerName] = useState(defaultSignerName)
  const [nameEdited, setNameEdited] = useState(false)

  function handleRoleChange(nextRole: string) {
    setRole(nextRole)
    // Leave a name the user typed alone; otherwise follow the role, so
    // switching to a customer or supervisor clears the inspector's name and the
    // required field forces the real signer to be named.
    if (nameEdited) return
    setSignerName(SELF_SIGNED_ROLES.has(nextRole) ? defaultSignerName : '')
  }

  return (
    <form action={action} className="form-stack signature-capture-form">
      <div className="field-grid">
        <div className="field-stack">
          <label htmlFor="signature_type" className="label">Signer role / title</label>
          <select
            id="signature_type"
            name="signature_type"
            className="select"
            value={role}
            onChange={(event) => handleRoleChange(event.target.value)}
          >
            {SIGNER_ROLES.map((signerRole) => (
              <option key={signerRole} value={signerRole}>{signerRole}</option>
            ))}
          </select>
        </div>
        <div className="field-stack">
          <label htmlFor="signer_name" className="label">Signer name</label>
          <input
            id="signer_name"
            name="signer_name"
            className="input"
            placeholder="Full name"
            value={signerName}
            onChange={(event) => {
              setSignerName(event.target.value)
              setNameEdited(true)
            }}
            required
          />
        </div>
      </div>
      <div className="form-actions"><SignaturePad /><button className="button button-primary touch-target">Save Signature</button></div>
    </form>
  )
}
