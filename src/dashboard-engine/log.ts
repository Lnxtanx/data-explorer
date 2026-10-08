// =============================================================================
// src/dashboard-engine/log.ts — engine-local diagnostics
//
// The engine is bundled as a standalone IIFE (scripts/build-dashboard-engine.mjs)
// that the backend serves into generated dashboard HTML. It must not import from
// the host app, so it cannot use @/lib/logger — and it must not depend on
// import.meta.env either, since the bundle is authored as plain JS.
// =============================================================================

export function engineWarn(...args: unknown[]): void {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(...args);
    }
}