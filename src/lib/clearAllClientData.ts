// =============================================================================
// Comprehensive Client-Side Data Cleanup
// Called on logout and session expiry to ensure no sensitive data persists.
// =============================================================================

import { deleteSessionCookie, deleteCookie } from '@/lib/cookies';
import { clearCsrfToken } from '@/lib/api/client';
import { clearAllDrafts } from '@/lib/chatDrafts';
import { logger } from '@/lib/logger';

// Preserved non-sensitive preferences that should survive logout (light/dark theme)
const PRESERVED_LOCAL_STORAGE_KEYS = new Set(['theme']);

/**
 * Sweep ALL application keys from localStorage, leaving zero residual user data,
 * tokens, session IDs, connection references, or cached items.
 */
function clearSwLocalStorage(): void {
  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!PRESERVED_LOCAL_STORAGE_KEYS.has(key)) {
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

    // Sweep any other non-httpOnly client cookies
    if (typeof document !== 'undefined' && document.cookie) {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.slice(0, eqPos).trim() : cookie.trim();
        if (name) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=${window.location.pathname}`;
        }
      }
    }
  } catch (err) {
    logger.warn('[clearAllClientData] Cookie cleanup failed:', err);
  }
}

/**
 * Purge browser CacheStorage (VitePWA / ServiceWorker offline and API caches).
 */
export async function clearSwCacheStorage(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.map(k => window.caches.delete(k)));
      if (cacheKeys.length > 0) {
        logger.info(`[clearAllClientData] Purged ${cacheKeys.length} browser cache(s)`);
      }
    }
  } catch (err) {
    logger.warn('[clearAllClientData] CacheStorage purge failed:', err);
  }
}

/**
 * Nuclear cleanup: wipe ALL client-side application data.
 * Call this from signOut() and from the auth:unauthorized handler.
 */
export async function clearAllClientData(): Promise<void> {
  clearSwLocalStorage();
  clearSwSessionStorage();
  clearSwCookies();
  clearAllDrafts();
  await clearSwCacheStorage();
}

