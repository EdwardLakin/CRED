import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd();
const sourceDir = path.join(root, 'src/features/offline/static-shell');
const outputDir = path.join(root, 'public/offline');
await fs.mkdir(outputDir, { recursive: true });
for (const file of ['contracts.ts', 'db.ts', 'store.ts', 'offline-shell.ts']) {
  const source = await fs.readFile(path.join(sourceDir, file), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, strict: true, removeComments: false } });
  await fs.writeFile(path.join(outputDir, file.replace(/\.ts$/, '.js')), output.outputText, 'utf8');
}
console.log('Generated checked static offline shell browser modules.');
