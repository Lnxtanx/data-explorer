/**
 * File State Persistence
 * Saves and restores editor state (cursor, scroll, etc.) per file
 */

export interface FileEditorState {
  fileId: string;
  cursorPosition?: { line: number; column: number };
  scrollTop?: number;
  scrollLeft?: number;
  lastEditedAt: number;
  selectionStart?: number;
  selectionEnd?: number;
}

const FILE_STATE_KEY = 'sw_file_states';
const MAX_FILE_STATES = 50; // Keep state for last 50 files

/**
 * Get all saved file states
 */
export function getAllFileStates(): Record<string, FileEditorState> {
  try {
    const stored = localStorage.getItem(FILE_STATE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Get state for a specific file
 */
export function getFileState(fileId: string): FileEditorState | null {
  const states = getAllFileStates();
  return states[fileId] || null;
}

/**
 * Save state for a file
 */
export function saveFileState(state: FileEditorState): void {
  const states = getAllFileStates();
  states[state.fileId] = { ...state, lastEditedAt: Date.now() };
  
  // Prune old states if over limit
  const entries = Object.entries(states);
  if (entries.length > MAX_FILE_STATES) {
    // Sort by lastEditedAt and keep only recent ones
    const sorted = entries.sort((a, b) => b[1].lastEditedAt - a[1].lastEditedAt);
    const pruned = Object.fromEntries(sorted.slice(0, MAX_FILE_STATES));
    localStorage.setItem(FILE_STATE_KEY, JSON.stringify(pruned));
  } else {
    localStorage.setItem(FILE_STATE_KEY, JSON.stringify(states));
  }
}

/**
 * Delete state for a file
 */
export function deleteFileState(fileId: string): void {
  const states = getAllFileStates();
  delete states[fileId];
  localStorage.setItem(FILE_STATE_KEY, JSON.stringify(states));
}

/**
 * Clear all file states
 */
export function clearAllFileStates(): void {
  localStorage.removeItem(FILE_STATE_KEY);
}

// =============================================================================
// Offline Queue Management
// =============================================================================

export interface QueuedOperation {
  id: string;
  type: 'save' | 'create' | 'delete' | 'rename';
  fileId?: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

const OFFLINE_QUEUE_KEY = 'sw_offline_queue';
const MAX_RETRIES = 3;

/**
 * Get all queued operations
 */
export function getOfflineQueue(): QueuedOperation[] {
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Add operation to offline queue
 */
export function queueOperation(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>): void {
  const queue = getOfflineQueue();
  
  // Check for duplicate operations on same file
  const existingIndex = queue.findIndex(
    op => op.type === operation.type && op.fileId === operation.fileId
  );
  
  const newOp: QueuedOperation = {
    ...operation,
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    retryCount: 0,
  };
  
  if (existingIndex >= 0) {
    // Replace existing operation with newer one
    queue[existingIndex] = newOp;
  } else {
    queue.push(newOp);
  }
  
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Remove operation from queue
 */
export function dequeueOperation(operationId: string): void {
  const queue = getOfflineQueue();
  const filtered = queue.filter(op => op.id !== operationId);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
}

/**
 * Increment retry count for an operation
 */
export function incrementRetryCount(operationId: string): boolean {
  const queue = getOfflineQueue();
  const opIndex = queue.findIndex(op => op.id === operationId);
  
  if (opIndex < 0) return false;
  
  queue[opIndex].retryCount++;
  
  // Remove if max retries exceeded
  if (queue[opIndex].retryCount >= MAX_RETRIES) {
    queue.splice(opIndex, 1);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return false; // Operation failed permanently
  }
  
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  return true; // Can still retry
}

/**
 * Clear entire offline queue
 */
export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

/**
 * Check if there are pending operations
 */
export function hasPendingOperations(): boolean {
  return getOfflineQueue().length > 0;
}

// =============================================================================
// Cross-Tab Synchronization
// =============================================================================

export interface SyncMessage {
  type: 'file_changed' | 'file_switched' | 'file_deleted' | 'session_changed' | 'logout';
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
  
  // Use localStorage as a broadcast channel
  localStorage.setItem(SYNC_CHANNEL_KEY, JSON.stringify(fullMessage));
  
  // Clean up immediately (the storage event will have fired)
  setTimeout(() => {
    localStorage.removeItem(SYNC_CHANNEL_KEY);
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

let isOnline = navigator.onLine;
const onlineListeners: Set<(online: boolean) => void> = new Set();

// Update status on network change
window.addEventListener('online', () => {
  isOnline = true;
  onlineListeners.forEach(listener => listener(true));
});

window.addEventListener('offline', () => {
  isOnline = false;
  onlineListeners.forEach(listener => listener(false));
});

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
