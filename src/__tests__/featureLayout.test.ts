// =============================================================================
// Architecture guard: the Phase 4 folder layout.
//
// WHY THIS FILE EXISTS
//
// Phase 4 relocated ~168 files into components/<domain>/ and deleted src/hooks/.
// Four properties of that layout are cheap to state and easy to break by accident,
// so they are asserted here rather than left to discipline:
//
//   1. src/hooks/ does not come back. It was the single biggest source of
//      scattering: 15 domain hooks sat there while their components, API clients
//      and types lived in three other folders. Re-creating it is the first step
//      of undoing the whole migration, and nothing else would notice.
//
//   2. src/lib/ holds shared infrastructure and nothing else. A feature module
//      dropped back in there is invisible: it compiles, it works, and it is
//      scattered again. The allowlist below is the contract.
//
//   3. Every local import specifier resolves. This is the failure mode the
//      migration actually hit, repeatedly: a moved file whose relative import
//      pointed at something left behind. tsc catches most of it, but not a
//      vi.mock() string or a dynamic import built from a template literal, and
//      those fail at runtime instead.
//
//   4. The Data Explorer query root is single-sourced. Phase 4 had to break a
//      lib/ -> components/ import inversion for lib/persist.ts, by moving the
//      root key down to shared/lib/queryRoots.ts. That fix is only safe while
//      both sides actually read it; if someone inlines the literal again,
//      persistence dies silently - no error, no failing test, just a permanently
//      cold cache. This is the same hazard Phase 3 found and fixed once already.
//
// Failures name file:line or the offending path, so a failure is actionable
// without opening the file first.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { DATA_EXPLORER_QUERY_ROOT } from '@/shared/lib/queryRoots';
import { dataExplorerKeys } from '@/components/data-explorer/api/hooks';

const REPO = path.resolve(__dirname, '../..');
const SRC = path.join(REPO, 'src');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Every .ts/.tsx under src, excluding the standalone engine bundle and tests. */
function sourceFiles(dir = SRC, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dashboard-engine') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, '/');

/**
 * Strip comments so a path quoted in prose is not mistaken for an import.
 * String literals are deliberately left alone: the import regexes below require
 * `from` / `import(` / `vi.mock(` immediately before the quote, which prose in a
 * line comment cannot produce once comments are gone.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

/** Resolve a local specifier the way both tsc and Vite do. */
function resolvesLocal(fromFile: string, spec: string): boolean {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return true; // bare package specifier - not our problem here
  const attempts = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  return attempts.some((c) => existsSync(c));
}

// ── 1. src/hooks/ must stay deleted ──────────────────────────────────────────

describe('folder layout: no orphan hooks bucket', () => {
  it('src/hooks/ does not exist', () => {
    expect(
      existsSync(path.join(SRC, 'hooks')),
      'src/hooks/ is back. Domain hooks belong inside their feature folder, e.g. ' +
        'src/components/ai/hooks/. If a hook genuinely has no owning feature yet, ' +
        'that is a signal the feature boundary is wrong, not that the bucket should return.',
    ).toBe(false);
  });
});

// ── 2. src/lib/ is shared infrastructure only ────────────────────────────────

describe('folder layout: src/lib/ is shared infrastructure only', () => {
  // The contract. Anything not listed here is a feature module that wandered in.
  const SHARED_INFRA = new Set([
    'lib/api/client.ts',      // HTTP transport primitives
    'lib/api/deltaBuffer.ts', // SSE reassembly
    'lib/api/feedback.ts',    // cross-cutting feedback endpoint
    'lib/api/index.ts',       // shared transport barrel
    'lib/api/sseChunks.ts',   // SSE chunk parser
    'lib/logger.ts',
    'lib/modes.ts',           // AgentMode vocabulary: read by ai, dashboard AND billing
    'lib/persist.ts',         // query-cache persistence
    'lib/queryClient.ts',
    'lib/utils.ts',
    'lib/view-mode.ts',       // app-level navigation state
  ]);

  it('contains only allowlisted shared modules', () => {
    const actual = sourceFiles(path.join(SRC, 'lib')).map(rel).sort();
    const unexpected = actual.filter((f) => !SHARED_INFRA.has(f));
    expect(
      unexpected,
      `These files are in src/lib/ but are not shared infrastructure:\n  ${unexpected.join('\n  ')}\n\n` +
        'Feature modules belong in src/components/<domain>/. If one of these really is ' +
        'shared, add it to the allowlist in src/__tests__/featureLayout.test.ts with a reason.',
    ).toEqual([]);
  });
});

// ── 3. every local import resolves ───────────────────────────────────────────

describe('folder layout: no dead local imports', () => {
  it('every relative and aliased specifier points at a file that exists', () => {
    const dead: string[] = [];
    for (const file of sourceFiles()) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(
          /(?:from\s+|import\s*\(\s*|vi\.mock\s*\(\s*|vi\.doMock\s*\(\s*)(['"])([^'"]+)\1/g,
        )) {
          const spec = m[2];
          if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
          if (!resolvesLocal(file, spec)) dead.push(`${rel(file)}:${i + 1}  '${spec}'`);
        }
      });
    }
    expect(
      dead,
      `Dead local imports:\n  ${dead.join('\n  ')}\n\n` +
        'A move that leaves a specifier pointing nowhere. tsc catches the static ones; ' +
        'vi.mock() strings and dynamic imports fail only at runtime.',
    ).toEqual([]);
  });
});

// ── 4. the persisted query root is single-sourced ────────────────────────────

describe('folder layout: the Data Explorer query root is single-sourced', () => {
  it('the key factory reads the shared constant', () => {
    expect(dataExplorerKeys.all[0]).toBe(DATA_EXPLORER_QUERY_ROOT);
  });

  it('nothing outside shared/ hardcodes the root as a literal', () => {
    // Phase 3 fixed this bug once (persistence silently dying on a rename) and
    // Phase 4 nearly reintroduced it while breaking the lib/ -> components/
    // inversion. Together with the assertion above this pins both ends: the
    // factory reads the constant, and no module may bypass it - which is what
    // forces lib/persist.ts to read it too.
    //
    // SCOPE: the query root only. `registerKey(key, 'data-explorer')` in the two
    // storage modules passes the same word as a *storage registry owner label* -
    // a different string with a different blast radius (it names which localStorage
    // keys a domain owns, not a query cache prefix), and it is already covered by
    // storageMigration.test.ts. Conflating the two would make this test fail for a
    // correct file.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const r = rel(file);
      if (r.startsWith('shared/')) continue;
      const stripped = stripComments(readFileSync(file, 'utf8'));
      stripped.split('\n').forEach((line, i) => {
        if (!/['"]data-explorer['"]/.test(line)) return;
        if (/registerKey\s*\(/.test(line)) return; // storage owner label, not a query key
        offenders.push(`${r}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `The literal 'data-explorer' is hardcoded here:\n  ${offenders.join('\n  ')}\n\n` +
        'Import DATA_EXPLORER_QUERY_ROOT from @/shared/lib/queryRoots instead. A rename ' +
        'that misses one site disables query persistence for the whole app with no error.',
    ).toEqual([]);
  });
});
