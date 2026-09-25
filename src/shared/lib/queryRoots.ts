// =============================================================================
// Query-cache namespace roots.
//
// A "root" is the first segment of a TanStack query key. It is the unit that
// invalidation and persistence operate on, so two modules that must agree on it
// cannot both live at the same layer.
//
// WHY THIS FILE EXISTS
//
// lib/persist.ts persists exactly one namespace to IndexedDB and needs to know
// that root by value. The factory that owns it (dataExplorerKeys) belongs to the
// Data Explorer feature and, after Phase 4, lives under components/. A lib/ module
// may not import from components/ - that inversion is an ESLint error, and it is
// the reason Phase 3's persistence scoping had to be written against a literal.
//
// So the root moves down here: shared/ sits below both lib/ and components/, both
// sides import it, and the string exists once. This is the same shape as the
// Phase 2 fix for auth context, where the React context moved down to
// @/lib/auth/context so that lib/api and components/auth could both reach it.
//
// Changing a value here silently changes which queries are persisted, so the
// storage and query-key tests both assert the exact string.
// =============================================================================

/** Root segment for the Data Explorer's persisted query namespace. */
export const DATA_EXPLORER_QUERY_ROOT = 'data-explorer';
