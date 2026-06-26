import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const sourceDir = path.join(root, 'src/features/offline/static-shell');
const outputDir = path.join(root, 'public/offline');
await fs.mkdir(outputDir, { recursive: true });
for (const file of ['contracts.ts', 'db.ts', 'store.ts', 'offline-shell.ts']) {
  const source = await fs.readFile(path.join(sourceDir, file), 'utf8');
  await fs.writeFile(path.join(outputDir, file.replace(/\.ts$/, '.js')), source, 'utf8');
}
console.log('Generated static offline shell browser modules.');
