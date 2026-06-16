import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { DiagnosticProcedureSourceChunk } from '@/lib/openai/diagnostic-procedure-extractor'

const execFileAsync = promisify(execFile)
const MAX_CHUNK_CHARS = 12_000
const MIN_TEXT_CHARS = 80

export type ProcedureSourceExtraction = {
  chunks: DiagnosticProcedureSourceChunk[]
  warnings: string[]
}

function chunkPageText(text: string): DiagnosticProcedureSourceChunk[] {
  return text
    .split('\f')
    .map((pageText, index) => ({ page: index + 1, text: pageText.replace(/\s+/g, ' ').trim() }))
    .filter((page) => page.text.length > 0)
    .map((page) => ({
      page_start: page.page,
      page_end: page.page,
      text: page.text.slice(0, MAX_CHUNK_CHARS),
      warnings: page.text.length > MAX_CHUNK_CHARS ? ['Page text was truncated before AI structure extraction.'] : [],
    }))
}

async function extractPdfText(buffer: Buffer): Promise<ProcedureSourceExtraction> {
  const dir = await mkdtemp(join(tmpdir(), 'cred-procedure-'))
  const inputPath = join(dir, 'source.pdf')
  const outputPath = join(dir, 'source.txt')

  try {
    await writeFile(inputPath, buffer)
    await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', inputPath, outputPath], { timeout: 20_000, maxBuffer: 10 * 1024 * 1024 })
    const text = await readFile(outputPath, 'utf8')
    const chunks = chunkPageText(text)
    if (chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) < MIN_TEXT_CHARS) {
      return { chunks: [], warnings: ['PDF text extraction found little or no selectable text. OCR fallback is not configured in this environment; image-based extraction may be less reliable and requires technician review.'] }
    }
    return { chunks, warnings: [] }
  } catch {
    return { chunks: [], warnings: ['PDF text extraction could not run. OCR fallback is not configured in this environment; image-based extraction may be less reliable and requires technician review.'] }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function extractDiagnosticProcedureSource(file: File, mimeType: string): Promise<ProcedureSourceExtraction> {
  if (mimeType === 'application/pdf') {
    return extractPdfText(Buffer.from(await file.arrayBuffer()))
  }

  if (mimeType.startsWith('image/')) {
    return { chunks: [], warnings: ['OCR fallback for uploaded images is not configured in this environment. OpenAI image extraction will be used and technician review is required.'] }
  }

  return { chunks: [], warnings: [] }
}
