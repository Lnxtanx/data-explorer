// =============================================================================
// Storage key registry.
//
// Phase 3. clearAllClientData() — the logout / session-expiry sweep — used to
// wipe EVERY localStorage key except a hardcoded `['theme']` allowlist. That is
// all-or-nothing: there was no way for a domain to opt out, and no way to tell
// which module owned a key, because three coexisting naming conventions were in
// use:
//
//   sw_*                     snake, no separator   (sw_draft:chat:…, sw_ds_*)
//   sw-data-explorer:*       colon-namespaced      (connection-id, view-mode)
//   dismissed_notifications  no prefix at all
//
// This registry is populated by createStore() and by registerKey() for the
// stores that are plain flags rather than versioned values. It gives the sweep
// something better than a key allowlist to reason about.
// =============================================================================

const owned = new Map<string, string>();

/** Associate a storage key with the domain that owns it. */
export function registerKey(key: string, owner: string): void {
  owned.set(key, owner);
}

/** Every key the app has registered, with its owning domain. */
export function registeredKeys(): ReadonlyMap<string, string> {
  return owned;
}

/** Keys belonging to one domain, e.g. 'data-explorer'. */
export function keysForOwner(owner: string): string[] {
  const out: string[] = [];
  for (const [key, o] of owned) {
    if (o === owner) out.push(key);
  }
  return out;
}

/**
 * Remove every registered key.
 *
 * `except` takes exact key names, so `['theme']` still works. Prefixes are
 * supported too, for callers that want to spare a whole namespace:
 * `except: ['sw-data-explorer:']`.
 */
export function clearRegistered(except: readonly string[] = []): void {
  const exact = new Set(except);
  const prefixes = except.filter((e) => e.endsWith(':'));
  for (const key of owned.keys()) {
    if (exact.has(key)) continue;
    if (prefixes.some((p) => key.startsWith(p))) continue;
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}
