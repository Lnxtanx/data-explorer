// =============================================================================
// Comprehensive Client-Side Data Cleanup
// Called on logout and session expiry to ensure no sensitive data persists.
// =============================================================================

import { deleteSessionCookie, deleteCookie } from '@/lib/cookies';
import { clearCsrfToken } from '@/lib/api/client';
import { logger } from '@/lib/logger';

// Known localStorage key prefixes used by the app.
// Any key starting with one of these will be removed on logout.
const SW_LOCAL_STORAGE_PREFIXES = [
  'sw-',          // sw-data-explorer-cols-*, sw-explorer-*, sw-grid-cache-index, etc.
  'schema_weaver', // legacy: schema_weaver_user
  'schema-weaver', // schema-weaver:dashboard-panel
  'resona_',       // AI model preference
  'dismissed_',    // notification dismissal state
];

// Individual keys that don't follow the prefix convention
const SW_LOCAL_STORAGE_EXACT_KEYS = [
  'sw_sync_channel',         // cross-tab sync (ephemeral)
  'sw_onboarding_completed', // onboarding flag
];

/**
 * Sweep all application-owned keys from localStorage.
 * Uses prefix matching to catch current AND future keys automatically,
 * plus an explicit list for keys that don't follow the sw-* convention.
 */
function clearSwLocalStorage(): void {
  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const lowerKey = key.toLowerCase();
      if (
        SW_LOCAL_STORAGE_PREFIXES.some(prefix => lowerKey.startsWith(prefix)) ||
        SW_LOCAL_STORAGE_EXACT_KEYS.includes(key)
      ) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }

    logger.info(`[clearAllClientData] Cleared ${keysToRemove.length} localStorage key(s)`);
  } catch (err) {
    logger.warn('[clearAllClientData] localStorage sweep failed:', err);
  }
}

/**
 * Clear all sessionStorage entries.
 * This wipes AI dataset caches (sw_ds_*), pending invites, and any other
 * session-scoped data — none of which should survive a logout.
 */
function clearSwSessionStorage(): void {
  try {
    const count = sessionStorage.length;
    sessionStorage.clear();
    logger.info(`[clearAllClientData] Cleared ${count} sessionStorage key(s)`);
  } catch (err) {
    logger.warn('[clearAllClientData] sessionStorage clear failed:', err);
  }
}

/**
 * Delete all application cookies that the client can control.
 * httpOnly cookies (session_id) are cleared server-side by POST /api/auth/logout.
 */
function clearSwCookies(): void {
  try {
    // Client-accessible session cookie
    deleteSessionCookie();

    // CSRF double-submit cookie (httpOnly: false, so client can delete it)
    deleteCookie('_csrf');

    // Null the in-memory CSRF token held by the API client
    clearCsrfToken();
  } catch (err) {
    logger.warn('[clearAllClientData] Cookie cleanup failed:', err);
  }
}

/**
 * Nuclear cleanup: wipe ALL client-side application data.
 * Call this from signOut() and from the auth:unauthorized handler.
 *
 * Does NOT clear:
 *  - React Query cache (caller handles via queryClient.clear())
 *  - IndexedDB (caller handles via purgeExplorerCacheDb())
 *  - React state (caller handles via setUser(null))
 */
export function clearAllClientData(): void {
  clearSwLocalStorage();
  clearSwSessionStorage();
  clearSwCookies();
}
