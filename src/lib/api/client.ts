// =============================================================================
// API Client Configuration
// Centralized API configuration and utilities
// =============================================================================

function resolveApiBaseUrl(): string {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
        return envUrl.trim().replace(/\/$/, '');
    }
    // In production browser environments, automatically route to the production API backend
    // if running on schemaweaver.dev or any subdomain (e.g. data-explorer.schemaweaver.dev)
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname === 'schemaweaver.dev' || hostname.endsWith('.schemaweaver.dev')) {
            return 'https://api.schemaweaver.dev';
        }
        if (hostname === 'vivekmind.com' || hostname.endsWith('.vivekmind.com')) {
            return 'https://api-node.schemaweaver.vivekmind.com';
        }
    }
    // Local development fallback (uses Vite proxy)
    return '';
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Resolves AI endpoints (/ai-api/ai/...) to the appropriate backend URL.
 * In dev, leaves /ai-api as-is so Vite proxy forwards to local Python backend.
 * In production, maps /ai-api/ai/... -> `${API_BASE_URL}/api/ai/...`
 */
export function resolveAiApiUrl(path: string): string {
    if (import.meta.env.DEV) {
        return path;
    }
    if (path.startsWith('/ai-api/ai/')) {
        return `${API_BASE_URL}/api/ai/${path.slice('/ai-api/ai/'.length)}`;
    }
    if (path.startsWith('/ai-api/')) {
        return `${API_BASE_URL}/api/${path.slice('/ai-api/'.length)}`;
    }
    if (path.startsWith('/')) {
        return `${API_BASE_URL}${path}`;
    }
    return `${API_BASE_URL}/${path}`;
}

// =============================================================================
// =============================================================================
// CSRF Token Helper
// Reads the _csrf cookie set by the backend's double-submit pattern.
// In cross-subdomain deployments, we also store the token in memory
// from the /api/csrf-token JSON response as a reliable fallback.
// =============================================================================

let _csrfTokenInMemory: string | null = null;
let _csrfInitPromise: Promise<string | null> | null = null;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function getCsrfToken(): string | null {
    // Read from cookie first if present to match the Cookie header the browser sends
    if (typeof document !== 'undefined') {
        const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
        if (match) {
            const token = decodeURIComponent(match[1]);
            if (token) {
                _csrfTokenInMemory = token;
                return token;
            }
        }
    }
    // Fallback: in-memory token (always works cross-subdomain)
    return _csrfTokenInMemory;
}

/**
 * Clear the in-memory CSRF token (called on logout / session expiry).
 * The next mutating request will fetch a fresh token via initCsrfToken().
 */
export function clearCsrfToken(): void {
    _csrfTokenInMemory = null;
    _csrfInitPromise = null;
}

/**
 * Fetch a CSRF token from the backend on app startup or on demand.
 * Coalesces concurrent calls into a single in-flight Promise.
 */
export async function initCsrfToken(force = false): Promise<string | null> {
    const existing = getCsrfToken();
    if (!force && existing) {
        return existing;
    }

    if (_csrfInitPromise && !force) {
        return _csrfInitPromise;
    }

    _csrfInitPromise = (async () => {
        try {
            const url = `${API_BASE_URL}/api/csrf-token${force ? '?rotate=true' : ''}`;
            const res = await fetch(url, {
                credentials: 'include',
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.csrfToken) {
                    _csrfTokenInMemory = data.csrfToken;
                    return data.csrfToken;
                }
            }
        } catch (err) {
            console.warn('[CSRF] Non-fatal init error:', err);
        } finally {
            _csrfInitPromise = null;
        }
        return getCsrfToken();
    })();

    return _csrfInitPromise;
}

/**
 * Ensure CSRF token is available before executing a mutating request.
 */
export async function ensureCsrfToken(): Promise<string | null> {
    const token = getCsrfToken();
    if (token) return token;
    return initCsrfToken();
}

/**
 * Inspect 403 response to detect if it was triggered by a CSRF token mismatch or expiry.
 */
async function isCsrfForbidden(response: Response): Promise<boolean> {
    if (response.status !== 403) return false;
    try {
        const clone = response.clone();
        const data = await clone.json();
        const text = `${data?.error || ''} ${data?.message || ''}`.toLowerCase();
        return text.includes('csrf');
    } catch {
        return false;
    }
}

// =============================================================================
// Shared request preamble
//
// Phase 3: 17 call sites used to hand-roll their own `fetch`, each re-deriving
// base URL, `credentials: 'include'`, the CSRF header, the 401 `auth:unauthorized`
// event and ApiError construction. They drifted: some omitted credentials
// entirely, some threw a bare `Error` and so lost `code`/`hint`/the rate-limit
// predicate, and one hit a second, undocumented base path.
//
// Everything that needs a non-JSON body (blobs, HTML, SSE) now goes through
// apiRequestRaw/apiRequestText/apiRequestBlob below, which share this preamble
// with apiRequest. Response parsing is the only thing that differs.
// =============================================================================

/** Endpoints whose 401 must not trigger the global sign-out event. */
const AUTH_ENDPOINTS = [
    '/api/auth/session',
    '/api/auth/google',
    '/api/auth/github',
    '/api/auth/logout',
];

function buildRequestConfig(options: RequestInit = {}): RequestInit {
    const csrfToken = getCsrfToken();
    const isFormData = options.body instanceof FormData;

    return {
        ...options,
        credentials: 'include', // Include cookies for session
        headers: {
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            ...options.headers,
            // Ensure freshest X-CSRF-Token is applied if available
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
    };
}

/**
 * Announce a 401 so AuthProvider can sign the user out.
 * No-op for the auth endpoints themselves, which legitimately 401.
 */
function announceUnauthorized(url: string, status: number): void {
    if (status !== 401) return;
    if (AUTH_ENDPOINTS.some((ep) => url.includes(ep))) return;
    window.dispatchEvent(new Event('auth:unauthorized'));
}

/**
 * Perform a request and return the raw Response with NO status handling.
 *
 * The lowest-level primitive: it applies only the shared preamble (base URL,
 * credentials, CSRF, JSON content type) and leaves `response.ok` /
 * `response.status` entirely to the caller.
 *
 * Use this when the caller needs to map failures onto its own protocol — the
 * AI durable-run endpoints, for example, translate a 429 into a
 * `quota_exceeded` SSE frame rather than throwing. Use `apiRequestRaw` when you
 * just want standard ApiError behaviour on a non-JSON body.
 */
export async function apiRequestFetch(
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const method = (options.method || 'GET').toUpperCase();
    if (MUTATING_METHODS.has(method) && !getCsrfToken()) {
        await ensureCsrfToken();
    }
    return fetch(`${API_BASE_URL}${endpoint}`, buildRequestConfig(options));
}

/**
 * Perform a request and return the raw Response for the caller to consume.
 *
 * Use this for streaming (SSE), blobs and text — anything `apiRequest` would
 * flatten to `{}`. Error handling still matches `apiRequest`: a non-OK response
 * throws `ApiError` carrying the parsed body when the body is JSON, and the 401
 * event still fires.
 */
export async function apiRequestRaw(
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const method = (options.method || 'GET').toUpperCase();
    if (MUTATING_METHODS.has(method) && !getCsrfToken()) {
        await ensureCsrfToken();
    }

    const url = `${API_BASE_URL}${endpoint}`;
    let response = await fetch(url, buildRequestConfig(options));

    // Self-healing CSRF: auto-refresh and retry once on 403 CSRF error
    if (MUTATING_METHODS.has(method) && (await isCsrfForbidden(response))) {
        console.warn('[CSRF] Token mismatch detected in apiRequestRaw. Refreshing and retrying...');
        await initCsrfToken(true);
        response = await fetch(url, buildRequestConfig(options));
    }

    if (!response.ok) {
        announceUnauthorized(url, response.status);

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            let data: unknown;
            try {
                data = await response.json();
            } catch {
                data = undefined;
            }
            const message =
                (data as { message?: string; error?: string } | undefined)?.message ??
                (data as { error?: string } | undefined)?.error ??
                'Request failed';
            throw new ApiError(response.status, message, data);
        }
        throw new ApiError(response.status, await response.text().catch(() => ''));
    }

    return response;
}

/** As `apiRequestRaw`, but resolves the body as text (e.g. invoice HTML). */
export async function apiRequestText(
    endpoint: string,
    options: RequestInit = {}
): Promise<string> {
    return (await apiRequestRaw(endpoint, options)).text();
}

/** As `apiRequestRaw`, but resolves the body as a Blob (e.g. CSV/XLSX export). */
export async function apiRequestBlob(
    endpoint: string,
    options: RequestInit = {}
): Promise<Blob> {
    return (await apiRequestRaw(endpoint, options)).blob();
}

// =============================================================================
// Request Helper with Credentials
// =============================================================================

export async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    if (MUTATING_METHODS.has(method) && !getCsrfToken()) {
        await ensureCsrfToken();
    }

    const url = `${API_BASE_URL}${endpoint}`;
    let response = await fetch(url, buildRequestConfig(options));

    // Self-healing CSRF: auto-refresh and retry once on 403 CSRF error
    if (MUTATING_METHODS.has(method) && (await isCsrfForbidden(response))) {
        console.warn('[CSRF] Token mismatch detected in apiRequest. Refreshing and retrying...');
        await initCsrfToken(true);
        response = await fetch(url, buildRequestConfig(options));
    }

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
        if (!response.ok) {
            announceUnauthorized(url, response.status);
            throw new ApiError(response.status, await response.text());
        }
        // Documented limitation: a successful non-JSON response yields an empty
        // object. Callers that need the body must use apiRequestRaw/Text/Blob.
        return {} as T;
    }

    const data = await response.json();

    if (!response.ok) {
        announceUnauthorized(url, response.status);
        throw new ApiError(response.status, data.message || data.error || 'Request failed', data);
    }

    return data as T;
}

// =============================================================================
// API Error Class
// =============================================================================

export class ApiError extends Error {
    status: number;
    data?: unknown;
    limitReached?: boolean;
    code?: string;
    hint?: string;

    constructor(status: number, message: string, data?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
        this.limitReached = (data as { limitReached?: boolean })?.limitReached;
        const payload = data as { code?: string; error?: string; hint?: string; details?: { hint?: string } } | undefined;
        this.code = payload?.code ?? payload?.error;
        this.hint = payload?.hint ?? payload?.details?.hint;
    }

    get isUnauthorized(): boolean {
        return this.status === 401;
    }

    get isForbidden(): boolean {
        return this.status === 403;
    }

    get isRateLimited(): boolean {
        return this.status === 429;
    }

    get isServerError(): boolean {
        return this.status >= 500;
    }
}

// =============================================================================
// Request Builders
// =============================================================================

export function get<T>(endpoint: string): Promise<T> {
    return apiRequest<T>(endpoint, { method: 'GET' });
}

export function post<T>(endpoint: string, body?: unknown): Promise<T> {
    return apiRequest<T>(endpoint, {
        method: 'POST',
        body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    });
}

export function patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return apiRequest<T>(endpoint, {
        method: 'PATCH',
        body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    });
}

export function del<T>(endpoint: string): Promise<T> {
    return apiRequest<T>(endpoint, { method: 'DELETE' });
}

