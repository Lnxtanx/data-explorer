// =============================================================================
// API Client Configuration
// Centralized API configuration and utilities
// =============================================================================

// API Base URL - uses environment variable or defaults to localhost
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// =============================================================================
// CSRF Token Helper
// Reads the _csrf cookie set by the backend's double-submit pattern.
// =============================================================================

export function getCsrfToken(): string | null {
    const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch a CSRF token from the backend on app startup.
 * This ensures the _csrf cookie is set before any POST/PUT/DELETE requests.
 * Should be called once on app mount.
 */
export async function initCsrfToken(): Promise<void> {
    if (getCsrfToken()) return; // Already have a token
    try {
        await fetch(`${API_BASE_URL}/api/csrf-token`, { credentials: 'include' });
    } catch {
        // Non-fatal — CSRF cookie will be set on first backend response
    }
}

// =============================================================================
// Request Helper with Credentials
// =============================================================================

export async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const csrfToken = getCsrfToken();

    const isFormData = options.body instanceof FormData;
    
    const config: RequestInit = {
        ...options,
        credentials: 'include', // Include cookies for session
        headers: {
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            ...options.headers,
        },
    };

    const response = await fetch(url, config);

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
        if (!response.ok) {
            throw new ApiError(response.status, await response.text());
        }
        return {} as T;
    }

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 401) {
            window.dispatchEvent(new Event('auth:unauthorized'));
        }
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
        this.code = (data as { code?: string })?.code;
        this.hint = (data as { details?: { hint?: string } })?.details?.hint;
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

export function put<T>(endpoint: string, body?: unknown): Promise<T> {
    return apiRequest<T>(endpoint, {
        method: 'PUT',
        body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    });
}
