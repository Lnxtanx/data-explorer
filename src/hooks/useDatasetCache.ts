// =============================================================================
// useDatasetCache
// Client-side cache for AI artifact datasets.
// Uses sessionStorage keyed by SHA-256(sql + connectionId) with configurable TTL.
// Prevents redundant re-execution of identical queries within a session.
// =============================================================================

import { useCallback, useRef } from 'react';
import type { AgentArtifact } from './useAIAgent';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CachedDataset {
    artifact: AgentArtifact;
    cachedAt: number;       // epoch ms
    connectionId: string;
    sql: string;
}

interface CacheStats {
    entries: number;
    oldestMs: number | null;
    totalRows: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'sw_ds_';
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 50;
const MAX_ROWS_PER_ENTRY = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hashKey(sql: string, connectionId: string): Promise<string> {
    const data = new TextEncoder().encode(sql.trim() + '::' + connectionId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return CACHE_PREFIX + hashArray.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

function syncHashKey(sql: string, connectionId: string): string {
    // Simple fast hash for synchronous lookups (djb2)
    const input = sql.trim() + '::' + connectionId;
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
    }
    return CACHE_PREFIX + Math.abs(hash).toString(36);
}

function readEntry(key: string): CachedDataset | null {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as CachedDataset;
    } catch {
        return null;
    }
}

function writeEntry(key: string, entry: CachedDataset): void {
    try {
        sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // sessionStorage full — evict oldest entries
        evictOldest(5);
        try {
            sessionStorage.setItem(key, JSON.stringify(entry));
        } catch {
            // give up silently
        }
    }
}

function evictOldest(count: number): void {
    const entries: { key: string; cachedAt: number }[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key?.startsWith(CACHE_PREFIX)) continue;
        const entry = readEntry(key);
        if (entry) entries.push({ key, cachedAt: entry.cachedAt });
    }
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    for (let i = 0; i < Math.min(count, entries.length); i++) {
        sessionStorage.removeItem(entries[i].key);
    }
}

function enforceMaxEntries(): void {
    let count = 0;
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) count++;
    }
    if (count > MAX_ENTRIES) {
        evictOldest(count - MAX_ENTRIES + 5);
    }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDatasetCache(ttlMs: number = DEFAULT_TTL_MS) {
    const keyCache = useRef<Map<string, string>>(new Map());

    /** Get a sync cache key (for lookups during render). */
    const getKey = useCallback((sql: string, connectionId: string): string => {
        const cacheId = sql.trim() + '::' + connectionId;
        const existing = keyCache.current.get(cacheId);
        if (existing) return existing;
        const key = syncHashKey(sql, connectionId);
        keyCache.current.set(cacheId, key);
        return key;
    }, []);

    /** Look up a cached dataset. Returns null if not found or expired. */
    const get = useCallback((sql: string, connectionId: string): AgentArtifact | null => {
        const key = getKey(sql, connectionId);
        const entry = readEntry(key);
        if (!entry) return null;
        if (Date.now() - entry.cachedAt > ttlMs) {
            sessionStorage.removeItem(key);
            return null;
        }
        return entry.artifact;
    }, [getKey, ttlMs]);

    /** Store an artifact in the cache. Only caches table artifacts with SQL. */
    const set = useCallback((artifact: AgentArtifact, connectionId: string): void => {
        if (!artifact.sql) return;
        // Only cache artifacts with data worth caching
        const artType = artifact.type as string;
        if (artType !== 'table' && artType !== 'stats' && artType !== 'anomalies' && artType !== 'quality' && artType !== 'joins' && artType !== 'metrics') {
            if (!artifact.rows || !artifact.columns) return;
        }

        const key = getKey(artifact.sql, connectionId);

        // Trim rows to prevent storage bloat
        const trimmed: AgentArtifact = { ...artifact };
        if (trimmed.rows && trimmed.rows.length > MAX_ROWS_PER_ENTRY) {
            trimmed.rows = trimmed.rows.slice(0, MAX_ROWS_PER_ENTRY);
        }

        const entry: CachedDataset = {
            artifact: trimmed,
            cachedAt: Date.now(),
            connectionId,
            sql: artifact.sql,
        };

        enforceMaxEntries();
        writeEntry(key, entry);
    }, [getKey]);

    /** Check if a dataset is cached (without deserializing fully). */
    const has = useCallback((sql: string, connectionId: string): boolean => {
        const key = getKey(sql, connectionId);
        return sessionStorage.getItem(key) !== null;
    }, [getKey]);

    /** Remove a specific cached dataset. */
    const remove = useCallback((sql: string, connectionId: string): void => {
        const key = getKey(sql, connectionId);
        sessionStorage.removeItem(key);
    }, [getKey]);

    /** Clear all cached datasets. */
    const clearAll = useCallback((): void => {
        const toRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key?.startsWith(CACHE_PREFIX)) toRemove.push(key);
        }
        toRemove.forEach(k => sessionStorage.removeItem(k));
    }, []);

    /** Get cache stats. */
    const stats = useCallback((): CacheStats => {
        let entries = 0;
        let oldestMs: number | null = null;
        let totalRows = 0;
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (!key?.startsWith(CACHE_PREFIX)) continue;
            entries++;
            const entry = readEntry(key);
            if (entry) {
                if (oldestMs === null || entry.cachedAt < oldestMs) oldestMs = entry.cachedAt;
                totalRows += entry.artifact.rows?.length ?? 0;
            }
        }
        return { entries, oldestMs, totalRows };
    }, []);

    /** Get the cache timestamp for an artifact (if cached). */
    const getCachedAt = useCallback((sql: string, connectionId: string): number | null => {
        const key = getKey(sql, connectionId);
        const entry = readEntry(key);
        if (!entry) return null;
        if (Date.now() - entry.cachedAt > ttlMs) {
            sessionStorage.removeItem(key);
            return null;
        }
        return entry.cachedAt;
    }, [getKey, ttlMs]);

    return { get, set, has, remove, clearAll, stats, getCachedAt };
}
