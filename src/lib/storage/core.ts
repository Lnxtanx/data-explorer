/**
 * Cross-Tab Synchronization & Network Status Utilities
 * Provides real-time cross-tab state syncing via localStorage events and network listeners.
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

/**
 * Get current tab ID
 */
export function getTabId(): string {
  return TAB_ID;
}

// =============================================================================
// Network Status Utilities
// =============================================================================

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
const onlineListeners: Set<(online: boolean) => void> = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    onlineListeners.forEach(listener => listener(true));
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    onlineListeners.forEach(listener => listener(false));
  });
}

/**
 * Check if currently online
 */
export function getNetworkStatus(): boolean {
  return isOnline;
}

/**
 * Subscribe to network status changes
 */
export function subscribeToNetworkStatus(callback: (online: boolean) => void): () => void {
  onlineListeners.add(callback);
  return () => onlineListeners.delete(callback);
}
