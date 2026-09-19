// =============================================================================
// Billing / Payments API Client
//
// Thin typed wrapper over the backend payment routes (see
// docs/billing-audit/PAYMENTS_API_CONTRACT.md). Everything here talks to the
// shared Schema Weaver billing backend. The Razorpay checkout flow itself lives
// in lib/razorpay.ts; this module only wires the HTTP calls + types.
//
// Billing model = PAY-FIRST, NO AUTO-DEBIT. A subscription is active only up
// to current_period_end; when it lapses the server expires it to free, and the
// user re-pays via /renew (same plan) or /create-order (a different plan).
// =============================================================================

import { get, post, getCsrfToken, API_BASE_URL, ApiError } from './client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Plan {
    id: string;
    name: string;
    price_inr: number;            // integer paise
    price_usd: number;            // decimal dollars
    billing_interval: 'month' | 'year' | 'lifetime';
    credit_limit_monthly: number;
    credit_limit_daily: number;
    concurrent_limit: number;
    max_tokens_per_run: number;
    max_agent_duration_secs?: number;
    allowed_models: string[];
    allowed_modes?: string[];
    features: string[];
    is_active: boolean;
    is_seat_based?: boolean;
    seat_base_count?: number;
    seat_price_inr?: number;
    seat_price_usd?: number;
}

export interface Subscription {
    plan_id: string;
    status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
    provider?: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end?: boolean;
    canceled_at?: string | null;
    sw_plans: Plan | null;
}

export interface Order {
    id: string;
    amount: number;
    currency: string;
    keyId: string;
    planId: string;
    planName: string;
    paymentRowId?: string;
    reused?: boolean;
}

export interface OrderResponse {
    success: boolean;
    order: Order;
}

export interface VerifyParams {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

export interface VerifyResponse {
    success: boolean;
    message?: string;
    alreadyProcessed?: boolean;
    plan?: {
        id: string;
        name: string;
        credit_limit_monthly: number;
    };
}

export interface PaymentHistoryItem {
    id: string;
    orderId?: string | null;
    paymentId?: string | null;
    planId: string;
    amount: number;              // already /100 (rupees/dollars, not paise)
    currency: string;
    status: 'pending' | 'processing' | 'success' | 'failed' | 'refunded';
    paymentMethod?: string | null;
    createdAt: string;
    metadata?: Record<string, any> | null;
    teamId?: string | null;
}

export interface PaymentHistoryResponse {
    success: boolean;
    payments: PaymentHistoryItem[];
}

export interface Invoice {
    id: string;
    invoice_number: string;
    payment_id: string;
    subscription_id?: string;
    plan_id: string;
    amount_paise: number;
    tax_paise?: number;
    net_paise: number;
    currency: string;
    buyer_name?: string | null;
    buyer_email?: string | null;
    buyer_gstin?: string | null;
    status: 'issued' | 'void' | 'credit_note';
    issued_at: string;
    period_start?: string | null;
    period_end?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface InvoicesResponse {
    success: boolean;
    invoices: Invoice[];
}

export interface UsageQuota {
    [key: string]: unknown;
    credits_used_month?: number;
    credits_used_day?: number;
    credit_limit_monthly?: number;
    credit_limit_daily?: number;
    credits_remaining?: number;
    daily_remaining?: number;
    monthly_pct?: number;
    concurrent_slots?: number;
    concurrent_limit?: number;
    allowed_models?: string[];
    plan_id?: string;
}

export interface UsageResponse {
    success: boolean;
    quota: UsageQuota[];
}

export interface PaymentStatusResponse {
    success: boolean;
    payment: Record<string, unknown> | null;
}

export interface RetryResponse {
    success: boolean;
    message?: string;
}

export interface ActionResponse<T = unknown> {
    success: boolean;
    alreadyCanceled?: boolean;
    alreadyActive?: boolean;
    subscription?: T;
    message?: string;
}

// ─── Public ──────────────────────────────────────────────────────────────────

export function getPlans(): Promise<{ plans: Plan[] }> {
    return get<{ plans: Plan[] }>('/api/payments/plans');
}

export function getSubscription(): Promise<Subscription> {
    return get<Subscription>('/api/payments/subscription');
}

export function createOrder(planId: string, currency = 'INR'): Promise<OrderResponse> {
    return post<OrderResponse>('/api/payments/create-order', { planId, currency });
}

export function renewSubscription(currency = 'INR'): Promise<OrderResponse> {
    return post<OrderResponse>('/api/payments/renew', { currency });
}

export function verifyPayment(params: VerifyParams): Promise<VerifyResponse> {
    return post<VerifyResponse>('/api/payments/verify', params);
}

export function cancelSubscription(): Promise<ActionResponse> {
    return post<ActionResponse>('/api/payments/cancel');
}

export function reactivateSubscription(): Promise<ActionResponse> {
    return post<ActionResponse>('/api/payments/reactivate');
}

export function getPaymentHistory(userId: string): Promise<PaymentHistoryResponse> {
    return get<PaymentHistoryResponse>(`/api/payments/history/${userId}`);
}

export function getInvoices(): Promise<InvoicesResponse> {
    return get<InvoicesResponse>('/api/payments/invoices');
}

/**
 * Fetch the branded HTML for a single invoice (server-rendered, own-only).
 * Returns the HTML string so the caller can open it in a new window using the
 * authenticated fetch (cookies + CSRF) rather than a bare <a href>.
 */
export async function getInvoiceHtml(invoiceId: string): Promise<string> {
    const csrfToken = getCsrfToken();
    const res = await fetch(`${API_BASE_URL}/api/payments/invoices/${invoiceId}/html`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
    });
    if (res.status === 401) window.dispatchEvent(new Event('auth:unauthorized'));
    if (!res.ok) {
        const body = await res.text();
        throw new ApiError(res.status, body || 'Failed to load invoice');
    }
    return res.text();
}

export function getUsage(): Promise<UsageResponse> {
    return get<UsageResponse>('/api/payments/usage');
}

export function getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    return get<PaymentStatusResponse>(`/api/payments/status/${paymentId}`);
}

export function retryActivation(paymentRowId: string): Promise<RetryResponse> {
    return post<RetryResponse>(`/api/payments/attempts/${paymentRowId}/retry`);
}
