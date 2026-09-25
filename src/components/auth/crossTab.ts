/**
 * Cross-Tab Synchronization
 * Provides real-time cross-tab state syncing via localStorage events.
 *
 * Phase 1: the network-status half of this module (getNetworkStatus,
 * subscribeToNetworkStatus, getTabId) had zero consumers, and its two
 * module-level online/offline listeners fired for nothing on every import.
 * Removed. Phase 4 splits the remainder into shared/storage/crossTab.ts.
 */

// =============================================================================
// Cross-Tab Synchronization
// =============================================================================

export interface SyncMessage {
  type: 'session_changed' | 'logout';
  payload?: any;
  timestamp: number;
  tabId: string;
}

const SYNC_CHANNEL_KEY = 'sw_sync_channel';
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Broadcast a sync message to other tabs
 */
export function broadcastSync(message: Omit<SyncMessage, 'timestamp' | 'tabId'>): void {
  const fullMessage: SyncMessage = {
    ...message,
    timestamp: Date.now(),
    tabId: TAB_ID,
  };

  // Use localStorage as a broadcast channel across same-origin tabs
  localStorage.setItem(SYNC_CHANNEL_KEY, JSON.stringify(fullMessage));

  // Clean up immediately (the storage event will have already fired in other tabs)
  setTimeout(() => {
    try {
      localStorage.removeItem(SYNC_CHANNEL_KEY);
    } catch {}
  }, 100);
}

/**
 * Subscribe to sync messages from other tabs
 */
export function subscribeToSync(callback: (message: SyncMessage) => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key !== SYNC_CHANNEL_KEY || !event.newValue) return;

    try {
      const message: SyncMessage = JSON.parse(event.newValue);

      // Ignore messages from this tab
      if (message.tabId === TAB_ID) return;

      callback(message);
    } catch {
      // Invalid message, ignore
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

