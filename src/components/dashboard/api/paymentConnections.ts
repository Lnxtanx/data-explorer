// =============================================================================
// Payment Connections API Client
// Handles listing, connecting, and disconnecting Stripe / Razorpay gateways.
// =============================================================================

import { get, del } from '@/lib/api/client';

export type PaymentProvider = 'stripe' | 'razorpay';

export interface PaymentGatewayConnection {
  provider: PaymentProvider;
  accountId: string | null;
  status: 'connected' | 'error' | 'disconnected';
  connectedAt?: string;
  errorMessage?: string | null;
}

export interface PaymentConnectionsResponse {
  success: boolean;
  connections: PaymentGatewayConnection[];
}

export interface AuthorizeResponse {
  success: boolean;
  provider: PaymentProvider;
  authorizeUrl: string;
  state: string;
}

export interface DisconnectResponse {
  success: boolean;
  provider: PaymentProvider;
}

export const paymentKeys = {
  all: ['payment-connections'] as const,
  list: () => ['payment-connections', 'list'] as const,
  metrics: (provider: PaymentProvider, key?: string) => ['payment-connections', 'metrics', provider, key || 'summary'] as const,
};

/**
 * Fetch all connected payment gateways for the current user.
 */
export async function getPaymentConnections(): Promise<PaymentGatewayConnection[]> {
  const res = await get<PaymentConnectionsResponse>('/api/payment-connections');
  return res.connections || [];
}

/**
 * Request an OAuth authorization URL for Stripe or Razorpay.
 */
export async function getAuthorizeUrl(provider: PaymentProvider, redirectUrl?: string): Promise<AuthorizeResponse> {
  const query = redirectUrl ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : '';
  return get<AuthorizeResponse>(`/api/payment-connections/${provider}/authorize${query}`);
}

/**
 * Disconnect a payment gateway (revokes token on gateway and deletes credentials + cached metrics).
 */
export async function disconnectPaymentGateway(provider: PaymentProvider): Promise<DisconnectResponse> {
  return del<DisconnectResponse>(`/api/payment-connections/${provider}`);
}

/**
 * Fetch derived metrics for a connected gateway.
 */
export async function getPaymentMetrics(provider: PaymentProvider, key = 'summary'): Promise<any> {
  return get<any>(`/api/payment-connections/${provider}/metrics?key=${encodeURIComponent(key)}`);
}
