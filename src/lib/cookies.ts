/**
 * Cookie Utility Library
 * Provides secure cookie management with type safety
 */

export interface CookieOptions {
  expires?: Date | number; // Date object or days from now
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number; // seconds
}

const DEFAULT_OPTIONS: CookieOptions = {
  path: '/',
  secure: window.location.protocol === 'https:',
  sameSite: 'lax',
};

/**
 * Set a cookie with the given name, value, and options
 */
export function setCookie(
  name: string,
  value: string | object,
  options: CookieOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Serialize value if it's an object
  const serializedValue = typeof value === 'object' 
    ? encodeURIComponent(JSON.stringify(value))
    : encodeURIComponent(value);

  let cookieString = `${encodeURIComponent(name)}=${serializedValue}`;

  // Handle expiration
  if (opts.expires) {
    let expiresDate: Date;
    if (typeof opts.expires === 'number') {
      // Days from now
      expiresDate = new Date();
      expiresDate.setTime(expiresDate.getTime() + opts.expires * 24 * 60 * 60 * 1000);
    } else {
      expiresDate = opts.expires;
    }
    cookieString += `; expires=${expiresDate.toUTCString()}`;
  }

  if (opts.maxAge !== undefined) {
    cookieString += `; max-age=${opts.maxAge}`;
  }

  if (opts.path) {
    cookieString += `; path=${opts.path}`;
  }

  if (opts.domain) {
    cookieString += `; domain=${opts.domain}`;
  }

  if (opts.secure) {
    cookieString += '; secure';
  }

  if (opts.sameSite) {
    cookieString += `; samesite=${opts.sameSite}`;
  }

  document.cookie = cookieString;
}

/**
 * Get a cookie value by name
 * Returns null if not found, parses JSON if applicable
 */
export function getCookie<T = string>(name: string): T | null {
  const nameEQ = encodeURIComponent(name) + '=';
  const cookies = document.cookie.split(';');

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(nameEQ) === 0) {
      const value = decodeURIComponent(cookie.substring(nameEQ.length));
      
      // Try to parse as JSON
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    }
  }

  return null;
}

/**
 * Delete a cookie by name
 */
export function deleteCookie(name: string, options: Pick<CookieOptions, 'path' | 'domain'> = {}): void {
  const opts = { path: '/', ...options };
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${opts.path}${opts.domain ? `; domain=${opts.domain}` : ''}`;
}

/**
 * Check if a cookie exists
 */
export function hasCookie(name: string): boolean {
  return getCookie(name) !== null;
}

/**
 * Get all cookies as an object
 */
export function getAllCookies(): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  if (!document.cookie) return cookies;

  document.cookie.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[decodeURIComponent(name)] = decodeURIComponent(value);
    }
  });

  return cookies;
}

// =============================================================================
// Application-Specific Cookie Keys
// =============================================================================

export const COOKIE_KEYS = {
  SESSION_TOKEN: 'sw_session',
  RECENT_FILES: 'sw_recent_files',
  USER_PREFERENCES: 'sw_preferences',
  SIDEBAR_STATE: 'sidebar:state',
  AI_SESSION: 'sw_ai_session',
  AI_PREFERENCES: 'sw_ai_preferences',
} as const;

// =============================================================================
// Session Cookie Helpers
// =============================================================================

export interface SessionData {
  userId: string;
  expiresAt: number; // Unix timestamp
}

/**
 * @deprecated Use SessionData instead. Kept for migration from old cookie format.
 */
export interface LegacySessionData {
  userId: string;
  email?: string;
  name?: string;
  avatar?: string;
  expiresAt: number;
  refreshToken?: string;
}

const SESSION_DURATION_DAYS = 7;
const SESSION_REFRESH_THRESHOLD = 24 * 60 * 60 * 1000; // 1 day in ms

/**
 * Set session cookie with minimal data (userId + expiresAt only)
 */
export function setSessionCookie(data: { userId: string; expiresAt?: number } & Record<string, unknown>): void {
  const expiresAt = data.expiresAt || Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
  
  // Only store userId and expiresAt — no PII (email, name, avatar)
  setCookie(COOKIE_KEYS.SESSION_TOKEN, { 
    userId: data.userId,
    expiresAt 
  }, {
    expires: new Date(expiresAt),
    sameSite: 'lax',
    secure: window.location.protocol === 'https:',
  });
}

/**
 * Get session data from cookie
 */
export function getSessionCookie(): SessionData | null {
  const session = getCookie<SessionData>(COOKIE_KEYS.SESSION_TOKEN);
  
  if (!session) return null;
  
  // Check if expired
  if (session.expiresAt < Date.now()) {
    deleteSessionCookie();
    return null;
  }
  
  return session;
}

/**
 * Check if session needs refresh (less than 1 day remaining)
 */
export function sessionNeedsRefresh(): boolean {
  const session = getSessionCookie();
  if (!session) return false;
  
  return session.expiresAt - Date.now() < SESSION_REFRESH_THRESHOLD;
}

/**
 * Refresh session expiration
 */
export function refreshSessionCookie(): void {
  const session = getSessionCookie();
  if (!session) return;
  
  // Update expiration (only userId + expiresAt stored)
  setSessionCookie({
    userId: session.userId,
  });
}

/**
 * Delete session cookie (logout)
 */
export function deleteSessionCookie(): void {
  deleteCookie(COOKIE_KEYS.SESSION_TOKEN);
}

// =============================================================================
// Recent Files Cookie Helpers
// =============================================================================

export interface RecentFile {
  id: string;
  title: string;
  accessedAt: number; // Unix timestamp
}

const MAX_RECENT_FILES = 10;
const RECENT_FILES_EXPIRY_DAYS = 30;

/**
 * Get recent files from cookie
 */
export function getRecentFiles(): RecentFile[] {
  return getCookie<RecentFile[]>(COOKIE_KEYS.RECENT_FILES) || [];
}

/**
 * Add or update a file in recent files
 */
export function addRecentFile(file: { id: string; title: string }): void {
  const recent = getRecentFiles();
  
  // Remove if already exists
  const filtered = recent.filter(f => f.id !== file.id);
  
  // Add to front
  const updated: RecentFile[] = [
    { id: file.id, title: file.title, accessedAt: Date.now() },
    ...filtered,
  ].slice(0, MAX_RECENT_FILES);
  
  setCookie(COOKIE_KEYS.RECENT_FILES, updated, {
    expires: RECENT_FILES_EXPIRY_DAYS,
  });
}

/**
 * Remove a file from recent files
 */
export function removeRecentFile(fileId: string): void {
  const recent = getRecentFiles();
  const filtered = recent.filter(f => f.id !== fileId);
  
  setCookie(COOKIE_KEYS.RECENT_FILES, filtered, {
    expires: RECENT_FILES_EXPIRY_DAYS,
  });
}

/**
 * Clear all recent files
 */
export function clearRecentFiles(): void {
  deleteCookie(COOKIE_KEYS.RECENT_FILES);
}

// =============================================================================
// User Preferences Cookie Helpers
// =============================================================================

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  autosaveEnabled?: boolean;
  sidebarCollapsed?: boolean;
  layoutDirection?: 'LR' | 'TB' | 'RL' | 'BT';
  lastFileId?: string;
  lastProjectId?: string;
  editorShowMinimap?: boolean;
  editorShowLineNumbers?: boolean;
  editorWordWrap?: boolean;
  editorBracketMatching?: boolean;
  editorAutoCloseBrackets?: boolean;
  editorFoldGutter?: boolean;
  editorHighlightActiveLine?: boolean;
}

const PREFERENCES_EXPIRY_DAYS = 365;

/**
 * Get user preferences from cookie
 */
export function getUserPreferences(): UserPreferences {
  return getCookie<UserPreferences>(COOKIE_KEYS.USER_PREFERENCES) || {};
}

/**
 * Update user preferences
 */
export function updateUserPreferences(updates: Partial<UserPreferences>): void {
  const current = getUserPreferences();
  
  setCookie(COOKIE_KEYS.USER_PREFERENCES, { ...current, ...updates }, {
    expires: PREFERENCES_EXPIRY_DAYS,
  });
}

/**
 * Clear user preferences
 */
export function clearUserPreferences(): void {
  deleteCookie(COOKIE_KEYS.USER_PREFERENCES);
}

// =============================================================================
// AI Session Cookie Helpers
// =============================================================================

export interface AISessionState {
  /** Active global AI session ID for resume */
  globalSessionId?: string;
  /** Active table-specific session ID */
  tableSessionId?: string;
  /** Table name for table-specific session */
  tableSessionTarget?: string;
  /** Last accessed timestamp */
  lastAccessedAt: number;
  /** Recent AI session IDs for quick access (max 5) */
  recentSessionIds?: string[];
}

const AI_SESSION_EXPIRY_DAYS = 30;
const MAX_RECENT_AI_SESSIONS = 5;

/**
 * Get AI session state from cookie
 */
export function getAISessionState(): AISessionState | null {
  return getCookie<AISessionState>(COOKIE_KEYS.AI_SESSION);
}

/**
 * Save active AI session to cookie for resume
 */
export function saveAISession(
  sessionId: string, 
  scope: 'global' | 'table',
  tableName?: string
): void {
  const current = getAISessionState() || { lastAccessedAt: Date.now() };
  
  // Update recent sessions list
  const recentIds = current.recentSessionIds || [];
  const updatedRecent = [sessionId, ...recentIds.filter(id => id !== sessionId)]
    .slice(0, MAX_RECENT_AI_SESSIONS);

  const updated: AISessionState = {
    ...current,
    lastAccessedAt: Date.now(),
    recentSessionIds: updatedRecent,
  };

  if (scope === 'global') {
    updated.globalSessionId = sessionId;
  } else {
    updated.tableSessionId = sessionId;
    updated.tableSessionTarget = tableName;
  }

  setCookie(COOKIE_KEYS.AI_SESSION, updated, {
    expires: AI_SESSION_EXPIRY_DAYS,
  });
}

/**
 * Get the active AI session ID for quick resume
 */
export function getActiveAISession(scope: 'global' | 'table'): string | null {
  const state = getAISessionState();
  if (!state) return null;
  
  return scope === 'global' ? state.globalSessionId || null : state.tableSessionId || null;
}

/**
 * Get recent AI session IDs
 */
export function getRecentAISessions(): string[] {
  const state = getAISessionState();
  return state?.recentSessionIds || [];
}

/**
 * Clear AI session state (e.g., on logout)
 */
export function clearAISessionState(): void {
  deleteCookie(COOKIE_KEYS.AI_SESSION);
}

// =============================================================================
// AI Preferences Cookie Helpers
// =============================================================================

export interface AIPreferences {
  /** Auto-apply tool calls without confirmation */
  autoApply?: boolean;
  /** Show SQL preview in chat */
  showSQLPreview?: boolean;
  /** Verbosity level: 'concise' | 'normal' | 'detailed' */
  verbosity?: 'concise' | 'normal' | 'detailed';
  /** Preferred AI panel position */
  panelPosition?: 'left' | 'right' | 'float';
  /** Whether AI panel is expanded */
  panelExpanded?: boolean;
  /** Last used preset/action */
  lastPreset?: string;
}

const AI_PREFERENCES_EXPIRY_DAYS = 365;

/**
 * Get AI preferences from cookie
 */
export function getAIPreferences(): AIPreferences {
  return getCookie<AIPreferences>(COOKIE_KEYS.AI_PREFERENCES) || {
    autoApply: false,
    showSQLPreview: true,
    verbosity: 'normal',
    panelExpanded: true,
  };
}

/**
 * Update AI preferences
 */
export function updateAIPreferences(updates: Partial<AIPreferences>): void {
  const current = getAIPreferences();
  
  setCookie(COOKIE_KEYS.AI_PREFERENCES, { ...current, ...updates }, {
    expires: AI_PREFERENCES_EXPIRY_DAYS,
  });
}

/**
 * Clear AI preferences
 */
export function clearAIPreferences(): void {
  deleteCookie(COOKIE_KEYS.AI_PREFERENCES);
}
