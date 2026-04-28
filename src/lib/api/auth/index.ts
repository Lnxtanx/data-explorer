// =============================================================================
// Auth API Client
// Frontend authentication API calls
// =============================================================================

import { post, get } from '../client';

// =============================================================================
// Types
// =============================================================================

export interface User {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string;
    created_at: string;
    updated_at: string;
}

export interface Usage {
    requests_count: number;
    quota_limit: number;
    plan_id: string;
}

export interface AuthResponse {
    user: User;
    sessionExpiresAt: number;
    isNewUser?: boolean;
}

export interface SessionResponse {
    valid: boolean;
    userId?: string;
    email?: string;
    expiresAt?: number;
}

export interface UserProfileResponse {
    user: User;
    usage: Usage;
}

export interface AIQuotaStatus {
    plan_id: string;
    is_lifetime_cap: boolean;
    credit_limit_monthly: number;
    credit_limit_daily: number;
    credits_used_month: number;
    credits_used_day: number;
    credits_used_week: number;
    credits_remaining: number;
    daily_remaining: number;
    credits_balance: number;
    max_tokens_per_run: number;
    max_agent_duration_secs: number;
    concurrent_slots: number;
    concurrent_limit: number;
    allowed_models: string[];
    monthly_pct: number;
    weekly_reset_at: string;
}

export interface AIModelInfo {
    id: string;
    name: string;
    provider: string;
    color: string;
    tier: string;
    multiplier: string;
    creditRate: number;
}

// =============================================================================
// Auth API Functions
// =============================================================================

/**
 * Authenticate with Google OAuth code
 */
export async function loginWithGoogle(code: string, redirectUri?: string): Promise<AuthResponse> {
    return post<AuthResponse>('/api/auth/google', { code, redirect_uri: redirectUri });
}

/**
 * Logout and clear session
 */
export async function logout(): Promise<{ success: boolean }> {
    return post<{ success: boolean }>('/api/auth/logout');
}

/**
 * Validate current session
 */
export async function validateSession(): Promise<SessionResponse> {
    try {
        return await get<SessionResponse>('/api/auth/session');
    } catch {
        return { valid: false };
    }
}

/**
 * Get current user profile and usage info
 */
export async function getCurrentUser(): Promise<UserProfileResponse> {
    return get<UserProfileResponse>('/api/auth/me');
}

/**
 * Get AI credit quota status for the current user
 */
export async function getAIUsage(): Promise<AIQuotaStatus> {
    return get<AIQuotaStatus>('/api/ai/usage');
}

/**
 * Get AI model metadata for the current user's plan
 */
export async function getAIModels(): Promise<{ models: AIModelInfo[] }> {
    return get<{ models: AIModelInfo[] }>('/api/ai/models');
}

/**
 * Refresh session expiry
 */
export async function refreshSession(): Promise<{ success: boolean; expiresAt: number }> {
    return post<{ success: boolean; expiresAt: number }>('/api/auth/refresh');
}

