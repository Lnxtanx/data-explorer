// =============================================================================
// ESLint flat config (ESLint 9)
// =============================================================================
// Replaces the previous `npm run lint` invocation, which referenced an eslint
// config file that did not exist and therefore could not run at all.
//
// Two jobs:
//   1. Correctness  — react-hooks + typescript-eslint recommended rules.
//   2. Architecture — `no-restricted-imports` encodes the layering rules from the
//      refactor plan so a layer inversion cannot be introduced silently.
//
// NOTE ON SEVERITY: the architecture rules are now `error`, not `warn`.
//
// Phase 2 broke all 9 layer inversions. The ratchet is at ZERO, so the rules
// are promoted from `warn` to `error`: a new inversion now fails lint instead of
// scrolling past in a warning count.
//
// BASELINE: 0 `no-restricted-imports` violations (was 11).
//
// What Phase 2 changed, and how each inversion was actually resolved:
//
//   1. lib/api/connector/hooks.ts        -> AuthProvider
//   2. lib/api/data/connection/index.ts  -> AuthProvider
//   3. hooks/useGreeting.ts              -> AuthProvider
//   4. hooks/useUserProfile.ts           -> AuthProvider
//      All four read auth state via useAuth. Rather than inject a userId
//      parameter (which would change four public hook signatures), the React
//      context and its consumer hook moved DOWN to @/lib/auth/context, which the
//      provider now depends on. The 9 component-layer importers keep their
//      existing `@/components/auth/AuthProvider` path, which re-exports useAuth.
//      This also removed a real module cycle:
//      lib/api/connector/hooks -> AuthProvider -> lib/api -> lib/api/client.
//
//   5. lib/voice/types.ts                -> ai/voice/orbs
//   6. hooks/voice/useVoiceSession.ts    -> ai/voice/orbs
//      Both only needed the OrbState union, but `orbs/index.ts` re-exports the
//      449-line WebGL renderer. The pure vocabulary + motion maths moved to
//      @/lib/voice/orb-state; the orbs module re-exports it.
//
//   7. hooks/useAIAgent.ts               -> components/.../tools/toolSanitize
//   8. hooks/de-useDashboard.ts          -> components/.../tools/toolSanitize
//      toolSanitize is a SECURITY primitive (strips connection ids, raw SQL,
//      tokens, UUIDs). It moved to @/lib/ai/toolSanitize with all 7 call sites
//      repointed; no shim needed. Its characterization tests moved with it.
//
//   9. lib/modes.ts                      -> lucide-react
//      The only lib file importing a UI library, for two icon components. The
//      icons (and the equally unread accent/tagline/description/thinkingNote)
//      had no readers, so they were deleted rather than relocated. This also
//      collapsed 4 separate declarations of the AgentMode union into one.
//
// The two `sonner` violations in hooks/useAIChats.ts and hooks/useCheckout.ts
// were NOT layering faults: a mutation hook surfacing a toast is legitimate.
// The rule is now scoped to lib/ only, where it belongs.
//
// ── Phase 4 ────────────────────────────────────────────────────────────────
//
// Batch 0 (cycles): src/lib/api/data/connection/keys.ts now owns connectionKeys.
// The factory used to live in data/connection/index.ts, a barrel that also
// re-exports crud.ts and defines useConnections(), which closed a real 4-module
// cycle against lib/api/connector. Extracting it gives connector/hooks.ts a
// dependency-free leaf to import. Verified: 0 module cycles in src/.
//
// Batch 1 (voice): the voice feature moved from five locations
// (components/data-explorer/ai/voice, ai/MicButton, hooks/voice,
// hooks/useVoiceSession, lib/voice) into src/components/voice/. This is the
// first domain to be co-located, and the new `voice` rule above pins the one
// non-obvious constraint that the move introduced.
//
// ── Phase 4 complete ────────────────────────────────────────────────────────
//
// All 13 feature folders are now co-located: every one reports exactly 1 source
// location (was 5 for voice, 5 for ai, 4 for auth). src/hooks/ is deleted.
// src/lib/ holds shared infrastructure only — no feature API, no feature hooks.
//
// Three things could not follow a feature folder, and the reasons matter:
//
// 1. components/auth/context.ts. AuthProvider wanted it beside the rest of auth,
//    but lib/api/connector and lib/api/data/connection both call useAuth(). A
//    lib/ module may not import from components/, so the context had to stay
//    below lib/ until batch 4 moved those two modules up. Only then could it
//    move. This is the same shape as Phase 2 item 1-4.
//
// 2. shared/lib/queryRoots.ts. lib/persist.ts persists exactly one query
//    namespace and needs that root key by value; the factory that owns it
//    (dataExplorerKeys) belongs to components/data-explorer/api/. Rather than
//    duplicate the literal — which is precisely the bug Phase 3 fixed in this
//    file — the root moved down one layer, below both sides.
//
// 3. lib/modes.ts. AgentMode/MODE_META is read by ai, dashboard AND billing, so
//    filing it under components/ai would have made two unrelated domains depend
//    on the AI feature. Left in lib/ as a cross-domain vocabulary.
//
// The `features/*` rules above are now dead: that layout was never adopted. They
// match no files, so they cost nothing, but they are misleading — the layout in
// this repo is components/<domain>/. The shared/ rule is kept, because shared/
// does exist and that direction is still the correct one.
// =============================================================================


import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const SRC = 'src/**/*.{ts,tsx}';

/** Matches `@/components/x`, `../components/x`, `../../components/x`, ... */
const ANY_COMPONENTS = '**/components/*';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'scripts/**',
      '*.config.ts',
      '*.config.js',
      'tailwind.config.ts',
    ],
  },

  js.configs.recommended,
  {
    files: [SRC],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // `no-undef` is redundant and actively harmful in a TypeScript project:
      // it does not understand type-only symbols, so it false-positives on
      // ambient/type identifiers, and every genuine undefined identifier is
      // already reported by tsc (TS2304) — which IS the gate now.
      'no-undef': 'off',

      // ── Baseline: the compiler is the source of truth for unused code ──
      // `noUnusedLocals` is off in tsconfig (82 pre-existing errors, tracked as
      // Phase 1 dead-code work). Keep the lint rule at warn so newly-introduced
      // dead code is still visible without failing CI.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],

      // `any` is pervasive in this codebase today (Phase 0 recorded 4 errors
      // under noImplicitAny but many explicit `as any`). Track, don't block.
      '@typescript-eslint/no-explicit-any': 'warn',

      // ── react-hooks correctness ──
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── Fast Refresh: only component files should export components ──
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ── Hygiene ──
      'no-empty': ['warn', { allowEmptyCatch: true }],
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
    },
  },

  // ── lib/ and hooks/ are strictly below components/ ──
  // NOTE: this must be ONE config object. ESLint flat config lets a later
  // object override an earlier `no-restricted-imports` for the same files, so
  // splitting "components ban" and "UI-library ban" into two objects silently
  // disables the first one for every file the second one matches.
  {
    files: ['src/lib/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [ANY_COMPONENTS],
            message:
              'Layer violation: lib/ and hooks/ must not import from components/. ' +
              'Flip the dependency — see refactor Phase 2.',
          },
        ],
      }],
    },
  },

  // ── lib/ additionally must not reach for UI libraries ──
  // Deliberately scoped to lib/ only. A React hook is UI-adjacent code, so a
  // mutation hook surfacing a toast is legitimate; a transport module is not.
  // (Phase 2 initially banned `sonner` in both, which flagged useAIChats and
  // useCheckout. Moving toast policy out of mutation hooks is a redesign, not a
  // layering fix, so it is deliberately not encoded as a lint rule.)
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['lucide-react', '@radix-ui/*', 'framer-motion', 'recharts', 'sonner'],
            message:
              'Layer violation: lib/ must not import a UI library. Presentation metadata ' +
              '(icons, accents) belongs next to the component that renders it.',
          },
        ],
      }],
    },
  },

  // ── shared/ (Phase 4) may not depend on features/ or app/ ──
  // Inert until the folder exists; kept so the rule is already in place.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features/*', '@/app/*'],
            message: 'shared/ must not depend on a feature or on app/.',
          },
        ],
      }],
    },
  },

  // ── voice: the transport/hook layer may not reach the orb barrel ──
  //
  // Phase 2 split `orb-state` in two because `lib/voice/types.ts` and
  // `hooks/voice/useVoiceSession.ts` both needed the OrbState union, and the
  // only thing that exported it was `orbs/index.ts` — whose `export *` drags in
  // IridescentFlow, a 449-line WebGL renderer. Naming a type there pulled the
  // renderer into a type position.
  //
  // Phase 4 relocated both halves into one folder (src/components/voice/), so
  // the reason for the split is no longer visible in the directory layout: both
  // `../orbs/orb-state` and `../orbs` are now one hop away and equally easy to
  // type. The rule below keeps the lower modules pointing at orb-state directly.
  //
  // Scoped to the modules that sit below the presentation layer inside the voice
  // feature. Components/ are allowed through the barrel, because VoiceOrbStage
  // genuinely needs IridescentFlow and PulseOrb.
  {
    files: [
      'src/components/voice/hooks/**/*.{ts,tsx}',
      'src/components/voice/audio/**/*.{ts,tsx}',
      'src/components/voice/types.ts',
      'src/components/voice/voice-socket-client.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        // `paths`, not `patterns`: pattern groups are gitignore-style, so a
        // `..` entry matches every `../*` specifier and `../orbs` also matches
        // `../orbs/orb-state`. `paths` compares the specifier exactly, which is
        // what this rule needs - the ban is on the barrel, not the subtree.
        //
        // ESLint requires `name` to be a string, hence one entry per specifier.
        paths: ['../orbs', '../orbs/index', '..', '../index', '@/components/voice'].map((name) => ({
          name,
          message:
            'Layer violation: the voice transport/hook layer must import the orb state from ' +
            "'../orbs/orb-state' directly. The orbs barrel re-exports IridescentFlow " +
            '(a 449-line WebGL renderer), so importing it to name OrbState in a type ' +
            'position pulls the renderer into a non-rendering module. See Phase 2 item 5-6.',
        })),
      }],
    },
  },

  // ── features/<domain>/api/ may not import features/<domain>/components/ ──
  {
    files: ['src/features/*/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features/*/components/*', './components/*', '../components/*'],
            message: 'api/ layer must not import components/. Keep transport and types below UI.',
          },
        ],
      }],
    },
  },

  // ── dashboard-engine is a self-contained sandbox bundle ──
  // It is built by scripts/build-dashboard-engine.mjs into an IIFE that the
  // backend serves, and it must not know about React or the host app.
  //
  // NOTE: `no-restricted-imports` matches the import *specifier string*, not the
  // resolved path, so a single-level `../*` pattern cannot express "stays inside
  // src/dashboard-engine/" — it would also flag the engine's own internal
  // `../format` / `../contract` imports. Only genuine escapes are blocked here:
  // the `@/` alias, framework packages, and `../../`-and-deeper relative hops
  // (which from `renderers/` land outside `src/dashboard-engine/`).
  {
    files: ['src/dashboard-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/*', 'react', 'react-dom'],
            message: 'dashboard-engine is a standalone sandbox bundle: it may only import from itself.',
          },
          {
            group: ['../../*', '../../../*'],
            message: 'dashboard-engine is a standalone sandbox bundle: it may only import from src/dashboard-engine/.',
          },
        ],
      }],
    },
  },

  // ── Test files ──
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

