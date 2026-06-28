import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src/features/offline/static-shell/offline-document.ts');
const outputPath = path.join(root, 'public/offline.html');
const source = await fs.readFile(sourcePath, 'utf8');
const match = source.match(/export const OFFLINE_DOCUMENT_HTML = `([\s\S]*?)`;\n/);
if (!match) throw new Error('Unable to find OFFLINE_DOCUMENT_HTML in offline-document.ts');
const html = match[1].replace(/\\`/g, '`').replace(/\\\$/g, '$');
await fs.writeFile(outputPath, html, 'utf8');
console.log('Generated public/offline.html from static offline document source.');
