#!/usr/bin/env node
// Verifies that repository paths referenced from Markdown files exist.
//
// Checks references of the form `docs/...md`, `apps/...md`, `backend/...`, `packages/...`,
// `infrastructure/...` found in Markdown. Illustrative placeholders (containing XXXX, NNNN,
// <...>, or `batch-XX`) are ignored, as are lines containing the marker
// `<!-- docs-check:ignore -->` (used for intentional historical paths, e.g. in reports).
//
// Usage: node scripts/check-doc-links.mjs

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.expo', '.turbo', 'coverage']);
const REFERENCE =
  /(?<![\w/.-])((?:docs|apps|backend|packages|infrastructure|scripts|tests)\/[A-Za-z0-9_./-]+\.(?:md|ts|tsx|js|mjs|json|ya?ml|prisma|Dockerfile))/g;
const PLACEHOLDER = /XXXX|NNNN|batch-XX|<|>|\*/;
const IGNORE_MARKER = '<!-- docs-check:ignore -->';

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* markdownFiles(full);
    else if (entry.endsWith('.md')) yield full;
  }
}

const missing = [];
for (const file of markdownFiles(root)) {
  const text = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.includes(IGNORE_MARKER))
    .join('\n');
  for (const match of text.matchAll(REFERENCE)) {
    const ref = match[1].replace(/[.,;:]+$/, '');
    if (PLACEHOLDER.test(ref)) continue;
    if (!existsSync(join(root, ref))) missing.push(`${relative(root, file)}: ${ref}`);
  }
}

if (missing.length > 0) {
  console.error(`Broken documentation references (${missing.length}):`);
  for (const line of [...new Set(missing)]) console.error(`  ${line}`);
  process.exit(1);
}
console.log('Documentation references OK');
