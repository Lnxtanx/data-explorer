// =============================================================================
// Bundle size baseline check.
//
// Refactor Phase 4/5 moves ~140 files across the tree. A file move can silently
// change the bundle graph — e.g. a lazy import losing its `React.lazy` boundary,
// or a domain that was code-split becoming eagerly bundled. That is invisible in
// review and shows up only as a slower first load.
//
// So the chunk map is recorded as enforceable data, not as a document.
//
//   node scripts/check-bundle-size.mjs            compare dist/ against the baseline
//   node scripts/check-bundle-size.mjs --update   rewrite the baseline from dist/
//
// Run `npm run build` first. The build must stay green (tsc + vite), so a move
// that breaks types is caught before this script even runs.
// =============================================================================

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distAssets = path.join(repoRoot, 'dist', 'assets');
const baselinePath = path.join(repoRoot, 'bundle-baseline.json');

/** Fail if any single chunk grows by more than this fraction. */
const PER_CHUNK_TOLERANCE = 0.25;
/** Fail if the whole JS payload grows by more than this fraction. */
const TOTAL_TOLERANCE = 0.1;

const update = process.argv.includes('--update');

/** strip the vite content hash: `AIChatMain-DwLRnjbg.js` -> `AIChatMain.js` */
const chunkName = (file) => file.replace(/-[A-Za-z0-9_-]{8}\.js$/, '.js');

function readChunks() {
  let files;
  try {
    files = readdirSync(distAssets);
  } catch {
    console.error('dist/assets not found. Run `npm run build` first.');
    process.exit(2);
  }

  const chunks = {};
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const full = path.join(distAssets, file);
    const raw = readFileSync(full);
    chunks[chunkName(file)] = { raw: raw.length, gzip: gzipSync(raw).length };
  }
  return chunks;
}

const current = readChunks();
const sum = (chunks, field) =>
  Object.values(chunks).reduce((n, c) => n + c[field], 0);

const currentTotal = { raw: sum(current, 'raw'), gzip: sum(current, 'gzip') };

if (update) {
  writeFileSync(baselinePath, JSON.stringify({ total: currentTotal, chunks: current }, null, 2) + '\n');
  console.log(`baseline written: ${Object.keys(current).length} chunks, ` +
    `${(currentTotal.gzip / 1024).toFixed(1)} kB gzip`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  console.error('bundle-baseline.json missing. Run: node scripts/check-bundle-size.mjs --update');
  process.exit(2);
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const pct = (from, to) => (from === 0 ? 0 : ((to - from) / from) * 100);

console.log(`\nbundle: ${Object.keys(current).length} chunks  ` +
  `${kb(currentTotal.raw)} raw  ${kb(currentTotal.gzip)} gzip\n`);

let failed = false;

// ── per-chunk regressions ──
const names = [...new Set([...Object.keys(baseline.chunks), ...Object.keys(current)])].sort();
const rows = [];
for (const name of names) {
  const before = baseline.chunks[name];
  const after = current[name];
  if (!before) {
    rows.push({ name, status: 'NEW', delta: 100 });
    continue;
  }
  if (!after) {
    rows.push({ name, status: 'GONE', delta: -100 });
    continue;
  }
  const delta = pct(before.gzip, after.gzip);
  if (delta > PER_CHUNK_TOLERANCE * 100) {
    rows.push({ name, status: 'REGRESSED', delta });
    failed = true;
  }
}

const changed = rows.filter((r) => r.status !== 'REGRESSED' && r.delta !== 0);
for (const r of changed) {
  console.log(`  ${r.status.padEnd(9)} ${r.name.padEnd(34)} ${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}%`);
}
for (const r of rows.filter((r) => r.status === 'REGRESSED')) {
  console.log(`  ${r.status.padEnd(9)} ${r.name.padEnd(34)} +${r.delta.toFixed(1)}%  ` +
    `(tolerance +${PER_CHUNK_TOLERANCE * 100}%)`);
}

// ── total regression ──
const totalDelta = pct(baseline.total.gzip, currentTotal.gzip);
if (totalDelta > TOTAL_TOLERANCE * 100) {
  console.log(`\n  TOTAL GZIP REGRESSION +${totalDelta.toFixed(1)}%  ` +
    `${kb(baseline.total.gzip)} -> ${kb(currentTotal.gzip)}  (tolerance +${TOTAL_TOLERANCE * 100}%)`);
  failed = true;
} else {
  console.log(`\n  total gzip ${totalDelta >= 0 ? '+' : ''}${totalDelta.toFixed(1)}% ` +
    `(tolerance +${TOTAL_TOLERANCE * 100}%)  [${kb(currentTotal.gzip)}]`);
}

// ── informational: the chunks we most want to watch during the refactor ──
// Every entry is a React.lazy boundary. If one of these ever merges into index.js
// its chunk disappears and the "GONE" line above is the only warning, so they are
// listed explicitly to make the transition impossible to miss.
//
// DashboardView/DashboardSidebar were de-*-prefixed until Phase 4 batch 6. They
// are listed under their new names; the rename briefly untracked them, which is
// exactly the failure this list exists to prevent.
const watched = [
  'index.js',
  'AIChatMain.js',
  'ArtifactView.js',
  'SettingsModal.js',
  'ConnectorDialog.js',
  'DashboardView.js',
  'DashboardSidebar.js',
  'vendor-charts.js',
  'vendor-reports.js',
  'vendor-xlsx.js',
];
const missing = watched.filter((n) => !baseline.chunks[n] || !current[n]);
if (missing.length) {
  console.log('\n  WARNING: watched chunk(s) absent from baseline or build: ' + missing.join(', '));
  console.log('  A lazy boundary may have been merged away. Confirm it is intentional.');
}
const present = watched.filter((n) => baseline.chunks[n] && current[n]);
if (present.length) {
  console.log('\n  watched chunks (gzip):');
  for (const n of present) {
    const d = pct(baseline.chunks[n].gzip, current[n].gzip);
    console.log(`    ${n.padEnd(22)} ${kb(baseline.chunks[n].gzip).padStart(10)} -> ` +
      `${kb(current[n].gzip).padStart(10)}  ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);
  }
}

if (failed) {
  console.log('\nBUNDLE REGRESSION — investigate before merging.');
  process.exit(1);
}
console.log('\nbundle within budget.');
