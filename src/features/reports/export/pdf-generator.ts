import { Buffer } from "node:buffer";
import { inflateSync, deflateSync } from "node:zlib";

export type PdfImageAsset = { src: string; alt: string; data: Uint8Array; type: "jpg" | "png"; width: number; height: number };

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function stripHtmlToLines(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(h1|h2|h3|p|li|dt|dd|tr|div|section|article|br)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return Array.from(new Set(text)).slice(0, 700);
}

function getPngSize(data: Uint8Array) {
  if (data.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => data[index] === byte)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readPngChunks(data: Uint8Array) {
  const chunks: Array<{ type: string; bytes: Uint8Array }> = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const view = new DataView(data.buffer, data.byteOffset + offset, 8);
    const length = view.getUint32(0);
    const type = String.fromCharCode(...data.slice(offset + 4, offset + 8));
    chunks.push({ type, bytes: data.slice(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

function paethPredictor(left: number, up: number, upLeft: number) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

function normalizePngForPdf(data: Uint8Array) {
  const size = getPngSize(data);
  if (!size) return null;
  const chunks = readPngChunks(data);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR")?.bytes;
  if (!ihdr) return null;
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) return null;
  const channels = colorType === 6 ? 4 : 3;
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => Buffer.from(chunk.bytes)));
  const inflated = inflateSync(idat);
  const stride = size.width * channels;
  const rgbStride = size.width * 3;
  const raw = Buffer.alloc(size.height * rgbStride);
  let sourceOffset = 0;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  for (let row = 0; row < size.height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    inflated.copy(current, 0, sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? current[index - channels] : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= channels ? previous[index - channels] : 0;
      if (filter === 1) current[index] = (current[index] + left) & 255;
      else if (filter === 2) current[index] = (current[index] + up) & 255;
      else if (filter === 3) current[index] = (current[index] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) current[index] = (current[index] + paethPredictor(left, up, upLeft)) & 255;
      else if (filter !== 0) return null;
    }
    for (let x = 0; x < size.width; x += 1) {
      const source = x * channels;
      const target = row * rgbStride + x * 3;
      raw[target] = current[source];
      raw[target + 1] = current[source + 1];
      raw[target + 2] = current[source + 2];
    }
    current.copy(previous);
  }
  return { ...size, data: new Uint8Array(deflateSync(raw)) };
}

function getJpegSize(data: Uint8Array) {
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    const length = (data[offset + 2] << 8) + data[offset + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (data[offset + 5] << 8) + data[offset + 6], width: (data[offset + 7] << 8) + data[offset + 8] };
    }
    offset += 2 + length;
  }
  return null;
}

export async function collectPdfImages(html: string, baseUrl: string, headers: HeadersInit) {
  const srcs = Array.from(html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)).map((match) => match[1]);
  const uniqueSrcs = Array.from(new Set(srcs)).slice(0, 80);
  const images: PdfImageAsset[] = [];
  for (const src of uniqueSrcs) {
    try {
      const url = new URL(src, baseUrl);
      const response = await fetch(url, { headers, cache: "no-store" });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const png = getPngSize(bytes);
      const jpg = getJpegSize(bytes);
      if (jpg) images.push({ src, alt: "Report image", data: bytes, type: "jpg", ...jpg });
      else if (png) {
        const normalized = normalizePngForPdf(bytes);
        if (normalized) images.push({ src, alt: "Report image", data: normalized.data, type: "png", width: normalized.width, height: normalized.height });
      }
    } catch (error) {
      console.warn("[pdf-image-fetch-failed]", { src, error });
    }
  }
  return images;
}

export function renderReportPdf(params: { html: string; title: string; images: PdfImageAsset[]; generatedAt: Date }) {
  const width = 612;
  const height = 792;
  const margin = 48;
  const objects: Array<string | Uint8Array> = [];
  const pages: number[] = [];
  const imageObjectIds: number[] = [];
  for (const image of params.images) {
    imageObjectIds.push(objects.length + 1);
    const filter = image.type === "jpg" ? "/DCTDecode" : "/FlateDecode";
    const color = image.type === "jpg" ? "/DeviceRGB" : "/DeviceRGB";
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${color} /BitsPerComponent 8 /Filter ${filter} /Length ${image.data.length} >>\nstream\n`);
    objects.push(image.data);
    objects.push("\nendstream");
  }
  const fontObjectId = objects.length + 1;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontObjectId = objects.length + 1;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const lines = stripHtmlToLines(params.html);
  let y = height - margin;
  let content = "";
  const addPage = () => {
    const contentObjectId = objects.length + 1;
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
    const pageObjectId = objects.length + 1;
    const xObjects = imageObjectIds.map((id, index) => `/Im${index + 1} ${id} 0 R`).join(" ");
    objects.push(`<< /Type /Page /Parent PAGES_PLACEHOLDER 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >> /XObject << ${xObjects} >> >> /Contents ${contentObjectId} 0 R >>`);
    pages.push(pageObjectId);
    content = "";
    y = height - margin;
  };
  const writeText = (text: string, size = 10, bold = false) => {
    if (y < margin + 18) addPage();
    const maxChars = Math.max(30, Math.floor((width - margin * 2) / (size * 0.52)));
    const chunks = text.match(new RegExp(`.{1,${maxChars}}(\\s|$)`, "g")) ?? [text];
    for (const chunk of chunks) {
      if (y < margin + 18) addPage();
      content += `BT /${bold ? "F2" : "F1"} ${size} Tf ${margin} ${y} Td (${escapePdfText(chunk.trim())}) Tj ET\n`;
      y -= size + 5;
    }
  };
  writeText(params.title, 18, true);
  writeText(`Generated ${params.generatedAt.toISOString()}`, 9);
  y -= 8;
  for (const line of lines) writeText(line, line.length < 80 && /report|evidence|approval|summary/i.test(line) ? 12 : 9, line.length < 80);
  for (const [index, image] of params.images.entries()) {
    if (y < 240) addPage();
    const maxW = width - margin * 2;
    const drawW = Math.min(maxW, image.width);
    const drawH = Math.min(220, drawW * image.height / image.width);
    content += `q ${drawW} 0 0 ${drawH} ${margin} ${y - drawH} cm /Im${index + 1} Do Q\n`;
    y -= drawH + 18;
  }
  addPage();
  const pagesObjectId = objects.length + 1;
  objects.push(`<< /Type /Pages /Kids [${pages.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  const catalogObjectId = objects.length + 1;
  objects.push(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

  const chunks: Array<string | Uint8Array> = ["%PDF-1.7\n%\xE2\xE3\xCF\xD3\n"];
  const offsets: number[] = [0];
  let byteLength = Buffer.byteLength(chunks[0] as string);
  objects.forEach((object, index) => {
    const objectId = index + 1;
    offsets[objectId] = byteLength;
    const header = `${objectId} 0 obj\n`;
    chunks.push(header);
    byteLength += Buffer.byteLength(header);
    if (typeof object === "string") {
      const resolved = object.replace(/PAGES_PLACEHOLDER/g, String(pagesObjectId));
      chunks.push(resolved);
      byteLength += Buffer.byteLength(resolved);
    } else {
      chunks.push(object);
      byteLength += object.length;
    }
    const footer = "\nendobj\n";
    chunks.push(footer);
    byteLength += Buffer.byteLength(footer);
  });
  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.length; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer << /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(xref);
  return Buffer.concat(chunks.map((chunk) => typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk)));
}
