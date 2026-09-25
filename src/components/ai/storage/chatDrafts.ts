// =============================================================================
// Chat Draft Persistence (Claude/ChatGPT style)
// Automatically persists unsent chat inputs per conversation with TTL & LRU pruning.
//
// Phase 3: the per-draft read/write/TTL logic now goes through
// @/shared/storage/store. The LRU sweep stays here because it is a policy over
// the whole `sw_draft:` namespace rather than a property of one value — and it
// has to understand BOTH formats, because a namespace can legitimately hold
// pre-migration drafts and post-migration envelopes at the same time.
//
// Migration is lossless: the legacy `{ text, updatedAt }` payload is mapped onto
// the envelope, so nobody loses an unsent message by deploying this.
// =============================================================================

import { createStore } from '@/shared/storage/store';
import { registerKey } from '@/shared/storage/registry';

const DRAFT_PREFIX = 'sw_draft:';
const DRAFT_VERSION = 1;
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_STORED_DRAFTS = 30;

/** Stored payload. `text` is the draft; the envelope carries the timestamp. */
export interface StoredDraft {
  text: string;
}

const isStoredDraft = (value: unknown): value is StoredDraft =>
  !!value && typeof (value as StoredDraft).text === 'string';

const draftStore = (key: string) =>
  createStore<StoredDraft>({
    key,
    version: DRAFT_VERSION,
    ttlMs: MAX_DRAFT_AGE_MS,
    fallback: { text: '' },
    validate: isStoredDraft,
    // Legacy: { text, updatedAt } at the top level, no envelope. `updatedAt` is
    // carried across so an old draft does not get a fresh 7-day lease.
    migrate: (raw) => {
      if (typeof raw === 'string') return { data: { text: raw }, ts: Date.now() };
      if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        const ts = typeof r.updatedAt === 'number' ? r.updatedAt : Date.now();
        if (isStoredDraft(r)) return { data: r, ts };
      }
      return undefined;
    },
  });

/**
 * Derives a unique storage key for a chat session or new chat.
 */
export function getDraftKey(chatId?: string | null, connectionId?: string | null): string {
  if (chatId) {
    return `${DRAFT_PREFIX}chat:${chatId}`;
  }
  return `${DRAFT_PREFIX}new:${connectionId || 'default'}`;
}

/** Read the envelope timestamp for a draft key, for LRU ordering. */
function readUpdatedAt(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed?.ts === 'number') return parsed.ts;
    if (typeof parsed?.updatedAt === 'number') return parsed.updatedAt;
  } catch {
    /* corrupt entry: treated as oldest, and removed by the sweep */
  }
  return 0;
}

/**
 * Retrieves the unsent draft for a chat.
 * Automatically discards drafts that exceeded the 7-day TTL.
 */
export function getDraft(chatId?: string | null, connectionId?: string | null): string {
  try {
    return draftStore(getDraftKey(chatId, connectionId)).read().text;
  } catch {
    return '';
  }
}

/**
 * Saves or clears an unsent draft for a chat.
 * If text is empty or whitespace-only, the draft key is deleted immediately.
 */
export function saveDraft(
  chatId?: string | null,
  connectionId?: string | null,
  text?: string,
): void {
  try {
    const key = getDraftKey(chatId, connectionId);
    registerKey(key, 'ai-agent');
    if (!text || !text.trim()) {
      localStorage.removeItem(key);
      return;
    }
    draftStore(key).write({ text });
    // Housekeeping: prune old or excessive drafts
    pruneDrafts();
  } catch {
    // Silently fail if localStorage quota exceeded
  }
}

/**
 * Clears the draft for a specific chat or new chat.
 */
export function clearDraft(chatId?: string | null, connectionId?: string | null): void {
  try {
    localStorage.removeItem(getDraftKey(chatId, connectionId));
  } catch {
    // Ignore
  }
}

/**
 * Completely sweeps all chat drafts (used on logout or cache purge).
 */
export function clearAllDrafts(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore
  }
}

/**
 * Prunes drafts that have exceeded the maximum age (7 days)
 * or caps the total count to MAX_STORED_DRAFTS (30) by evicting oldest.
 */
export function pruneDrafts(): void {
  try {
    const drafts: { key: string; updatedAt: number }[] = [];
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) {
        const updatedAt = readUpdatedAt(k);
        if (!updatedAt) {
          // unparseable, or a legacy draft whose updatedAt was missing
          localStorage.removeItem(k);
          continue;
        }
        if (now - updatedAt > MAX_DRAFT_AGE_MS) {
          localStorage.removeItem(k);
        } else {
          drafts.push({ key: k, updatedAt });
        }
      }
    }

    // If drafts count still exceeds limit, evict the oldest
    if (drafts.length > MAX_STORED_DRAFTS) {
      drafts.sort((a, b) => a.updatedAt - b.updatedAt);
      const toRemove = drafts.slice(0, drafts.length - MAX_STORED_DRAFTS);
      for (const item of toRemove) {
        localStorage.removeItem(item.key);
      }
    }
  } catch {
    // Ignore
  }
}
