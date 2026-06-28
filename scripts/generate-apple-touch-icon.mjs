import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const sourcePath = path.join(root, "public", "icons", "cred-icon.svg");
const outputPaths = [
  path.join(root, "public", "apple-touch-icon.png"),
  path.join(root, "public", "apple-touch-icon-precomposed.png"),
];
const size = 180;

function parseHexColor(value) {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Unsupported color value: ${value}`);
  const integer = Number.parseInt(match[1], 16);
  return [(integer >> 16) & 255, (integer >> 8) & 255, integer & 255, 255];
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
}

function over(bottom, top) {
  const alpha = top[3] / 255;
  const inverse = 1 - alpha;
  return [
    Math.round(top[0] * alpha + bottom[0] * inverse),
    Math.round(top[1] * alpha + bottom[1] * inverse),
    Math.round(top[2] * alpha + bottom[2] * inverse),
    255,
  ];
}

function roundedRectAlpha(x, y, rectX, rectY, rectWidth, rectHeight, radius) {
  const innerX = Math.max(rectX + radius, Math.min(x, rectX + rectWidth - radius));
  const innerY = Math.max(rectY + radius, Math.min(y, rectY + rectHeight - radius));
  const distance = Math.hypot(x - innerX, y - innerY);
  return Math.max(0, Math.min(1, radius + 0.5 - distance));
}

function circleAlpha(x, y, cx, cy, radius) {
  return Math.max(0, Math.min(1, radius + 0.5 - Math.hypot(x - cx, y - cy)));
}

const glyphs = {
  C: ["111", "100", "100", "100", "111"],
  R: ["110", "101", "110", "101", "101"],
  E: ["111", "100", "110", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  P: ["110", "101", "110", "100", "100"],
  O: ["111", "101", "101", "101", "111"],
  F: ["111", "100", "110", "100", "100"],
  I: ["111", "010", "010", "010", "111"],
  X: ["101", "101", "010", "101", "101"],
  Q: ["111", "101", "101", "111", "001"],
};

function drawGlyph(pixels, glyph, startX, startY, scale, color) {
  const rows = glyphs[glyph];
  if (!rows) return;
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < rows[row].length; column += 1) {
      if (rows[row][column] !== "1") continue;
      const x0 = Math.round(startX + column * scale);
      const y0 = Math.round(startY + row * scale);
      for (let y = y0; y < y0 + scale; y += 1) {
        if (y < 0 || y >= size) continue;
        for (let x = x0; x < x0 + scale; x += 1) {
          if (x < 0 || x >= size) continue;
          pixels[(y * size + x) * 4] = color[0];
          pixels[(y * size + x) * 4 + 1] = color[1];
          pixels[(y * size + x) * 4 + 2] = color[2];
          pixels[(y * size + x) * 4 + 3] = 255;
        }
      }
    }
  }
}

function drawText(pixels, text, centerX, topY, scale, color, gap = 1) {
  const glyphWidth = 3 * scale;
  const totalWidth = text.length * glyphWidth + (text.length - 1) * gap * scale;
  let cursor = Math.round(centerX - totalWidth / 2);
  for (const glyph of text) {
    drawGlyph(pixels, glyph, cursor, topY, scale, color);
    cursor += glyphWidth + gap * scale;
  }
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const crc = zlib.crc32 ? zlib.crc32(Buffer.concat([typeBuffer, data])) : crc32(Buffer.concat([typeBuffer, data]));
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc >>> 0, 8 + data.length);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodePng(pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const svg = await fs.readFile(sourcePath, "utf8");
if (!svg.includes("CRED by ProFixIQ app icon") || !svg.includes(">CRED<")) {
  throw new Error("Apple touch icon source must be the CRED app icon SVG.");
}

const colors = [...svg.matchAll(/stop-color="(#[0-9a-f]{6})"/gi)].map((match) => parseHexColor(match[1]));
const primary = parseHexColor("#155dfc");
const backgroundStart = colors[0] ?? primary;
const backgroundEnd = colors[1] ?? parseHexColor("#14213d");
const white = parseHexColor("#ffffff");
const subtitle = parseHexColor("#dbe3ef");
const pixels = Buffer.alloc(size * size * 4);
const scale = size / 512;

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const index = (y * size + x) * 4;
    const color = mixColor(backgroundStart, backgroundEnd, (x + y) / (2 * (size - 1)));
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = 255;
  }
}

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const sourceX = (x + 0.5) / scale;
    const sourceY = (y + 0.5) / scale;
    const index = (y * size + x) * 4;
    let base = [pixels[index], pixels[index + 1], pixels[index + 2], 255];
    const panelAlpha = roundedRectAlpha(sourceX, sourceY, 52, 52, 408, 408, 92) * 0.12;
    if (panelAlpha > 0) base = over(base, [255, 255, 255, Math.round(panelAlpha * 255)]);
    const outerAlpha = circleAlpha(sourceX, sourceY, 256, 246, 146);
    if (outerAlpha > 0) base = over(base, [255, 255, 255, Math.round(outerAlpha * 255)]);
    const innerAlpha = circleAlpha(sourceX, sourceY, 256, 246, 114);
    if (innerAlpha > 0) base = over(base, [primary[0], primary[1], primary[2], Math.round(innerAlpha * 255)]);
    pixels[index] = base[0];
    pixels[index + 1] = base[1];
    pixels[index + 2] = base[2];
    pixels[index + 3] = 255;
  }
}

drawText(pixels, "CRED", 90, 86, 8, white, 1);
drawText(pixels, "PROFIXIQ", 90, 137, 3, subtitle, 1);

const png = encodePng(pixels);
await Promise.all(outputPaths.map((outputPath) => fs.writeFile(outputPath, png)));
console.log(`Generated ${outputPaths.map((outputPath) => path.relative(root, outputPath)).join(" and ")} from ${path.relative(root, sourcePath)} (${size}x${size}).`);
