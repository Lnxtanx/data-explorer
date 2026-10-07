/**
 * Cookie Utility Library
 * Provides secure cookie management and session lifecycle utilities.
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
  secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : false,
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

// =============================================================================
// Application-Specific Cookie Keys
// =============================================================================

export const COOKIE_KEYS = {
  SESSION_TOKEN: 'sw_session',
} as const;

// =============================================================================
// Session Cookie Helpers
// =============================================================================

export interface SessionData {
  userId: string;
  expiresAt: number; // Unix timestamp
}

const SESSION_DURATION_DAYS = 7;
const SESSION_REFRESH_THRESHOLD = 24 * 60 * 60 * 1000; // 1 day in ms

function getDomainOption(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = window.location.hostname;
  if (host === 'schemaweaver.dev' || host.endsWith('.schemaweaver.dev')) {
    return '.schemaweaver.dev';
  }
  if (host === 'vivekmind.com' || host.endsWith('.vivekmind.com')) {
    return '.vivekmind.com';
  }
  return undefined;
}

/**
 * Set session cookie with minimal data (userId + expiresAt only)
 */
export function setSessionCookie(data: { userId: string; expiresAt?: number } & Record<string, unknown>): void {
  const expiresAt = data.expiresAt || Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
  const domain = getDomainOption();
  
  // Only store userId and expiresAt — no PII (email, name, avatar)
  setCookie(COOKIE_KEYS.SESSION_TOKEN, { 
    userId: data.userId,
    expiresAt 
  }, {
    expires: new Date(expiresAt),
    sameSite: 'lax',
    secure: window.location.protocol === 'https:',
    ...(domain ? { domain } : {}),
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
  const domain = getDomainOption();
  deleteCookie(COOKIE_KEYS.SESSION_TOKEN);
  if (domain) {
    deleteCookie(COOKIE_KEYS.SESSION_TOKEN, { domain });
  }
}
