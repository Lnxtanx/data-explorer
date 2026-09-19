// =============================================================================
// Chat Draft Persistence (Claude/ChatGPT style)
// Automatically persists unsent chat inputs per conversation with TTL & LRU pruning.
// =============================================================================

const DRAFT_PREFIX = 'sw_draft:';
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_STORED_DRAFTS = 30;

interface StoredDraft {
    text: string;
    updatedAt: number;
}

/**
 * Derives a unique storage key for a chat session or new chat.
 */
export function getDraftKey(chatId?: string | null, connectionId?: string | null): string {
    if (chatId) {
        return `${DRAFT_PREFIX}chat:${chatId}`;
    }
    return `${DRAFT_PREFIX}new:${connectionId || 'default'}`;
}

/**
 * Retrieves the unsent draft for a chat.
 * Automatically discards drafts that exceeded the 7-day TTL.
 */
export function getDraft(chatId?: string | null, connectionId?: string | null): string {
    try {
        const key = getDraftKey(chatId, connectionId);
        const raw = localStorage.getItem(key);
        if (!raw) return '';

        const parsed: StoredDraft = JSON.parse(raw);
        if (!parsed || typeof parsed.text !== 'string') {
            localStorage.removeItem(key);
            return '';
        }

        // Expired draft cleanup
        if (Date.now() - (parsed.updatedAt || 0) > MAX_DRAFT_AGE_MS) {
            localStorage.removeItem(key);
            return '';
        }

        return parsed.text;
    } catch {
        return '';
    }
}

/**
 * Saves or clears an unsent draft for a chat.
 * If text is empty or whitespace-only, the draft key is deleted immediately.
 */
export function saveDraft(chatId?: string | null, connectionId?: string | null, text?: string): void {
    try {
        const key = getDraftKey(chatId, connectionId);
        if (!text || !text.trim()) {
            localStorage.removeItem(key);
            return;
        }

        const draft: StoredDraft = {
            text,
            updatedAt: Date.now(),
        };

        localStorage.setItem(key, JSON.stringify(draft));

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
        const key = getDraftKey(chatId, connectionId);
        localStorage.removeItem(key);
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
                try {
                    const val = localStorage.getItem(k);
                    if (val) {
                        const parsed: StoredDraft = JSON.parse(val);
                        if (now - (parsed.updatedAt || 0) > MAX_DRAFT_AGE_MS) {
                            localStorage.removeItem(k);
                        } else {
                            drafts.push({ key: k, updatedAt: parsed.updatedAt || 0 });
                        }
                    }
                } catch {
                    localStorage.removeItem(k);
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
