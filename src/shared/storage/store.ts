// =============================================================================
// Versioned client-side store.
//
// Phase 3. Three modules hand-rolled the same idea — stamp a value with a
// version and a timestamp, parse it defensively on read, expire it, and self-heal
// when the payload is corrupt:
//
//   lib/grid-storage.ts            { v, ts, cols }      + an LRU index
//   lib/explorer-preferences.ts    { v, connectionId, …, ts }  for one key,
//                                  a BARE STRING for another — same file, two
//                                  conventions
//   lib/chatDrafts.ts              { text, updatedAt }  (unversioned, TTL by
//                                  updatedAt)
//
// Because each owned its own envelope, the three had already drifted into three
// incompatible formats, and a corrupt or expired value was handled differently
// in each. This module is the single format.
//
// MIGRATION IS LOSSLESS. Each store keeps its current on-disk version and
// supplies a `migrate` for anything older, so deploying this does NOT reset
// saved column widths, the last-viewed table, or unsent chat drafts.
//
// The `register` side-effect also feeds shared/storage/registry.ts, which is how
// clearAllClientData can wipe by prefix instead of maintaining a hand-written
// allowlist of exact key names.
// =============================================================================

export interface StoreEnvelope<T> {
  /** Envelope version. Bump `version` and add a `migrate` when the shape changes. */
  v: number;
  /** Epoch ms of the write, used for TTL. */
  ts: number;
  data: T;
}

export interface StoreOptions<T> {
  /** Full storage key, including any namespace prefix. */
  key: string;
  /** Envelope version this store writes. */
  version: number;
  /** Value used when nothing valid is stored. May be a factory. */
  fallback: T | (() => T);
  /** Reject a structurally valid but semantically wrong value. */
  validate?: (value: unknown) => value is T;
  /** Max age in ms. Omit for no expiry. */
  ttlMs?: number;
  /** Which Storage to use. Defaults to localStorage. */
  storage?: Storage;
  /**
   * Upgrade a payload written by an older version. Return `undefined` to treat the
   * value as unusable (it is then discarded).
   *
   * Receives the already-parsed raw value and the version it was written with.
   *
   * May return either the bare upgraded value, or `{ data, ts }` to carry the
   * original write time across the migration. The object form matters: a
   * migration that returned only `data` would silently RESET the TTL, turning
   * every long-expired preference and draft back into a fresh one.
   */
  migrate?: (raw: unknown, fromVersion: number) => unknown | MigratedValue<T> | undefined;
  /** Notified whenever a value is written or cleared, for LRU bookkeeping. */
  onWrite?: () => void;
}

export interface Store<T> {
  readonly key: string;
  read(): T;
  write(value: T): void;
  clear(): void;
}

/** What a `migrate` may return to carry the original timestamp across an upgrade. */
export interface MigratedValue<T> {
  data: T;
  /** Epoch ms the legacy value was written. Drives the TTL check. */
  ts: number;
}

/** Normalise whatever `migrate` returned into a value plus its effective age. */
function settleMigration<T>(result: unknown): { value: T; ts: number } {
  if (result !== null && typeof result === 'object' && 'data' in result && 'ts' in result) {
    const m = result as MigratedValue<T>;
    return { value: m.data, ts: typeof m.ts === 'number' ? m.ts : Date.now() };
  }
  // A bare return carries no timestamp, so it is treated as written now.
  return { value: result as T, ts: Date.now() };
}

/** Every store key created in this session, so logout can wipe them by prefix. */
const liveKeys = new Set<string>();

export function registeredStoreKeys(): ReadonlySet<string> {
  return liveKeys;
}

const resolveFallback = <T>(fallback: T | (() => T)): T =>
  typeof fallback === 'function' ? (fallback as () => T)() : fallback;

/**
 * Create a versioned, self-healing store.
 *
 * Read behaviour, in order: missing -> fallback; unparseable -> discard + fallback;
 * wrong version with no/missed migration -> discard + fallback; past TTL ->
 * discard + fallback; failing `validate` -> discard + fallback. In every failure
 * case the bad key is removed, so a poisoned value is repaired rather than
 * re-read on every render.
 */
export function createStore<T>(options: StoreOptions<T>): Store<T> {
  const {
    key, version, validate, ttlMs, migrate, onWrite,
    storage = typeof localStorage !== 'undefined' ? localStorage : undefined,
  } = options;

  const discard = () => {
    try {
      storage?.removeItem(key);
    } catch {
      /* storage unavailable (private mode / quota) */
    }
  };

  const read = (): T => {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(key) ?? null;
    } catch {
      return resolveFallback(options.fallback);
    }
    if (raw === null) return resolveFallback(options.fallback);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      discard();
      return resolveFallback(options.fallback);
    }

    // Envelope detection keys on `data` + `ts`, NOT on `v`.
    //
    // The pre-Phase-3 stores also wrote a `v` field, at the top level
    // (grid-storage's `{ v, ts, cols }`, explorer-preferences' flat record).
    // Detecting on `v` would classify those as current-version envelopes whose
    // `data` is undefined, silently returning the fallback and dropping every
    // user's saved layout. `data` is the field only the envelope has.
    const isEnvelope =
      parsed !== null
      && typeof parsed === 'object'
      && 'data' in parsed
      && 'ts' in parsed;

    if (!isEnvelope) {
      const upgraded = migrate?.(parsed, 0);
      if (upgraded === undefined) {
        discard();
        return resolveFallback(options.fallback);
      }
      const { value, ts } = settleMigration<T>(upgraded);
      if (ttlMs != null && Date.now() - ts > ttlMs) {
        discard();
        return resolveFallback(options.fallback);
      }
      return value;
    }

    const envelope = parsed as Partial<StoreEnvelope<T>>;
    if (envelope.v !== version) {
      const upgraded = migrate?.(parsed, Number(envelope.v));
      if (upgraded === undefined) {
        discard();
        return resolveFallback(options.fallback);
      }
      const { value, ts } = settleMigration<T>(upgraded);
      if (ttlMs != null && Date.now() - ts > ttlMs) {
        discard();
        return resolveFallback(options.fallback);
      }
      return value;
    }

    if (ttlMs != null && typeof envelope.ts === 'number' && Date.now() - envelope.ts > ttlMs) {
      discard();
      return resolveFallback(options.fallback);
    }

    if (validate && !validate(envelope.data)) {
      discard();
      return resolveFallback(options.fallback);
    }

    return (envelope.data ?? resolveFallback(options.fallback)) as T;
  };

  const write = (value: T): void => {
    const envelope: StoreEnvelope<T> = { v: version, ts: Date.now(), data: value };
    try {
      storage?.setItem(key, JSON.stringify(envelope));
      onWrite?.();
    } catch {
      /* quota exceeded or storage disabled: preferences are best-effort */
    }
  };

  const clear = (): void => {
    discard();
    onWrite?.();
  };

  liveKeys.add(key);

  return { key, read, write, clear };
}
