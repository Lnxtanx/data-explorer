// =============================================================================
// Connection query-key factory - dependency-free leaf.
//
// WHY THIS FILE EXISTS
//
// The four edges below are quoted as they stood BEFORE Phase 4, when this factory
// lived at lib/api/data/connection/keys.ts and the connector API at
// lib/api/connector/. Reproduced verbatim because the cycle is the reason the
// file exists and the paths no longer resolve:
//
//   lib/api/connector/hooks.ts        ->  lib/api/data/connection/index.ts
//   lib/api/data/connection/crud.ts   ->  lib/api/connector/index.ts
//   lib/api/connector/index.ts        ->  lib/api/connector/hooks.ts
//   lib/api/data/connection/index.ts  ->  lib/api/data/connection/crud.ts
//
// lib/api/connector/hooks.ts only needs these three key tuples, but reaching them
// through the barrel dragged in useAuth() and react-query for what is a pure
// constant. Extracting the factory gave it a leaf to import, which closed the
// loop: connector/hooks.ts -> data/connection/keys.ts, with no outgoing edge.
//
// Phase 4 then lifted the whole domain into components/connector/api/, so this
// leaf and its only consumer now sit in the same folder as ./hooks.ts. The
// re-export from ./useConnections is kept so reaching the factory through that
// module still works. It remains a separate file because ./hooks needs the keys
// without dragging in useAuth and react-query.
// =============================================================================

export const connectionKeys = {
  all: ['connections'] as const,
  /** Prefix covering every user's connection list, for bulk invalidation. */
  listRoot: ['connections', 'list'] as const,
  list: (userId?: string) => ['connections', 'list', userId || 'anonymous'] as const,
};
