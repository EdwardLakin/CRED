'use client'

import { useEffect, useRef, useState } from 'react'

import { saveSignature } from '../actions'

export function SignatureCaptureForm({ sessionId }: { sessionId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState('')
  const action = saveSignature.bind(null, sessionId)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scale = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * scale)
    canvas.height = Math.floor(180 * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(scale, scale)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#13213a'
  }, [])

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.setPointerCapture(event.pointerId)
    const point = getPoint(event)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    setIsDrawing(true)
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const point = getPoint(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    setSignatureDataUrl(canvasRef.current?.toDataURL('image/png') ?? '')
  }

  function stopDrawing() {
    setIsDrawing(false)
    setSignatureDataUrl(canvasRef.current?.toDataURL('image/png') ?? '')
  }

  function clearSignature() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureDataUrl('')
  }

  return (
    <form action={action} className="form-stack signature-capture-form">
      <div className="field-grid">
        <div className="field-stack">
          <label htmlFor="signature_type" className="label">Signature Type</label>
          <select id="signature_type" name="signature_type" className="select" defaultValue="Technician Signature">
            <option>Technician Signature</option>
            <option>Customer Signature</option>
            <option>Inspector Signature</option>
            <option>Supervisor Signature</option>
          </select>
        </div>
        <div className="field-stack">
          <label htmlFor="signer_name" className="label">Signer Name</label>
          <input id="signer_name" name="signer_name" className="input" placeholder="Full name" required />
        </div>
      </div>
      <div className="signature-pad-wrap">
        <canvas
          ref={canvasRef}
          className="signature-pad"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          aria-label="Signature capture pad supporting mouse, touch, and stylus"
        />
      </div>
      <input type="hidden" name="signature_data_url" value={signatureDataUrl} />
      <div className="form-actions">
        <button type="button" className="button button-secondary touch-target" onClick={clearSignature}>Clear</button>
        <button className="button button-primary touch-target">Save Signature</button>
      </div>
    </form>
  )
}
