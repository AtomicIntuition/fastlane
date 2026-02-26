import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checklistPath = resolve(process.cwd(), 'LAUNCH_CHECKLIST.md');
const content = readFileSync(checklistPath, 'utf8');

const unchecked = content
  .split(/\r?\n/)
  .map((line, index) => ({ line, index: index + 1 }))
  .filter(({ line }) => /^\s*-\s*\[\s\]\s+/.test(line));

if (unchecked.length > 0) {
  console.error('Launch checklist has incomplete items:');
  for (const item of unchecked) {
    console.error(`- LAUNCH_CHECKLIST.md:${item.index} ${item.line.trim()}`);
  }
  process.exit(1);
}

console.log('Launch checklist is complete.');
