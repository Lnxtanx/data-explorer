// =============================================================================
// Tests for the versioned store primitive.
//
// Phase 3. The point of the primitive is that the self-healing paths behave
// identically everywhere, so those paths are pinned here once rather than
// implicitly in three different modules.
// =============================================================================
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createStore, registeredStoreKeys } from '../store';
import { registerKey, registeredKeys, keysForOwner, clearRegistered } from '../registry';

const KEY = 'test:store';

beforeEach(() => {
  localStorage.clear();
});

describe('createStore', () => {
  it('returns the fallback when nothing is stored', () => {
    const s = createStore({ key: KEY, version: 1, fallback: { a: 1 } });
    expect(s.read()).toEqual({ a: 1 });
  });

  it('round-trips a value', () => {
    const s = createStore<{ a: number }>({ key: KEY, version: 1, fallback: { a: 0 } });
    s.write({ a: 42 });
    expect(s.read()).toEqual({ a: 42 });
  });

  it('accepts a fallback factory so objects are not shared', () => {
    const s = createStore<{ n: number }>({ key: KEY, version: 1, fallback: () => ({ n: 0 }) });
    expect(s.read()).not.toBe(s.read());
  });

  it('stamps the envelope with version and timestamp', () => {
    const s = createStore({ key: KEY, version: 3, fallback: 'x' });
    s.write('hello');
    const raw = JSON.parse(localStorage.getItem(KEY)!);
    expect(raw.v).toBe(3);
    expect(typeof raw.ts).toBe('number');
    expect(raw.data).toBe('hello');
  });

  // ── self-healing: each of these discards the key AND returns the fallback ──

  it('discards and replaces unparseable JSON', () => {
    localStorage.setItem(KEY, '{not json');
    const s = createStore({ key: KEY, version: 1, fallback: 'fb' });
    expect(s.read()).toBe('fb');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('discards a payload written by a different version', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 99, ts: Date.now(), data: 'stale' }));
    const s = createStore({ key: KEY, version: 1, fallback: 'fb' });
    expect(s.read()).toBe('fb');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('discards an expired value', () => {
    const s = createStore({ key: KEY, version: 1, fallback: 'fb', ttlMs: 1000 });
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now() - 5000, data: 'old' }));
    expect(s.read()).toBe('fb');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps a value inside its TTL', () => {
    const s = createStore({ key: KEY, version: 1, fallback: 'fb', ttlMs: 60_000 });
    s.write('fresh');
    expect(s.read()).toBe('fresh');
  });

  it('honours no-TTL by default', () => {
    const s = createStore({ key: KEY, version: 1, fallback: 'fb' });
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: 0, data: 'ancient' }));
    expect(s.read()).toBe('ancient');
  });

  it('discards a value failing validate', () => {
    const isNum = (v: unknown): v is number => typeof v === 'number';
    const s = createStore({ key: KEY, version: 1, fallback: -1, validate: isNum });
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now(), data: 'nope' }));
    expect(s.read()).toBe(-1);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clear removes the key', () => {
    const s = createStore({ key: KEY, version: 1, fallback: 'fb' });
    s.write('v');
    s.clear();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(s.read()).toBe('fb');
  });

  it('never mutates the caller value on read', () => {
    const s = createStore<Record<string, number>>({ key: KEY, version: 1, fallback: {} });
    const before = { a: 1 };
    s.write(before);
    expect(before).toEqual({ a: 1 });
  });

  // ── migration: the reason this is deploy-safe ──

  it('migrates a legacy bare value when the payload is not an envelope', () => {
    // This is the real chatDrafts.ts format: an unversioned {text, updatedAt}.
    localStorage.setItem(KEY, JSON.stringify({ text: 'unsent', updatedAt: Date.now() }));
    const s = createStore<string>({
      key: KEY,
      version: 2,
      fallback: '',
      migrate: (raw) => (raw as { text?: string })?.text,
    });
    expect(s.read()).toBe('unsent');
    // the migrated value is NOT rewritten; the next write upgrades the format
    expect(JSON.parse(localStorage.getItem(KEY)!).v).toBeUndefined();
  });

  it('migrates from an older envelope version', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now(), data: { cols: { a: 1 } } }));
    const s = createStore<{ cols: Record<string, number> }>({
      key: KEY,
      version: 2,
      fallback: { cols: {} },
      migrate: (raw) => (raw as { data: { cols: Record<string, number> } }).data,
    });
    expect(s.read()).toEqual({ cols: { a: 1 } });
  });

  it('discards when migrate returns undefined', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now(), data: 'old' }));
    const s = createStore({
      key: KEY, version: 2, fallback: 'fb',
      migrate: () => undefined,
    });
    expect(s.read()).toBe('fb');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('does not call migrate when the version already matches', () => {
    const migrate = vi.fn();
    const s = createStore({ key: KEY, version: 1, fallback: 'fb', migrate });
    s.write('v');
    s.read();
    expect(migrate).not.toHaveBeenCalled();
  });

  it('fires onWrite but not on read', () => {
    const onWrite = vi.fn();
    const s = createStore({ key: KEY, version: 1, fallback: 'fb', onWrite });
    s.read();
    expect(onWrite).not.toHaveBeenCalled();
    s.write('v');
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('survives storage throwing (private mode / quota)', () => {
    const hostile = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    const s = createStore({ key: KEY, version: 1, fallback: 'fb', storage: hostile });
    expect(s.read()).toBe('fb');
    expect(() => s.write('v')).not.toThrow();
    expect(() => s.clear()).not.toThrow();
  });

  it('registers its key for the logout sweep', () => {
    createStore({ key: 'test:registered', version: 1, fallback: null });
    expect(registeredStoreKeys().has('test:registered')).toBe(true);
  });
});

describe('storage key registry', () => {
  afterEach(() => {
    for (const k of registeredKeys().keys()) localStorage.removeItem(k);
  });

  it('groups keys by owning domain', () => {
    registerKey('sw-data-explorer:connection-id', 'data-explorer');
    registerKey('sw_draft:chat:1', 'ai-agent');
    expect(keysForOwner('data-explorer')).toEqual(['sw-data-explorer:connection-id']);
    expect(keysForOwner('ai-agent')).toEqual(['sw_draft:chat:1']);
  });

  it('clears registered keys except an exact allowlist', () => {
    registerKey('a:1', 'x');
    registerKey('theme', 'x');
    localStorage.setItem('a:1', 'v');
    localStorage.setItem('theme', 'dark');
    clearRegistered(['theme']);
    expect(localStorage.getItem('a:1')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('supports sparing a whole namespace by prefix', () => {
    registerKey('sw-data-explorer:view-mode', 'x');
    registerKey('sw_draft:chat:1', 'x');
    localStorage.setItem('sw-data-explorer:view-mode', 'ai');
    localStorage.setItem('sw_draft:chat:1', 'draft');
    clearRegistered(['sw-data-explorer:']);
    expect(localStorage.getItem('sw-data-explorer:view-mode')).toBe('ai');
    expect(localStorage.getItem('sw_draft:chat:1')).toBeNull();
  });
});
