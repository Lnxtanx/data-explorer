// =============================================================================
// usePayments — React Query hooks for the shared billing backend.
//
// Centralises query keys + invalidation for the plan / subscription / usage /
// history / invoices data used across the app.
// =============================================================================

import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys } from '@/lib/queryClient';
import {
    createOrder,
    getInvoices,
    getPaymentHistory,
    getPlans,
    getSubscription,
    renewSubscription,
    retryActivation,
    verifyPayment,
      type InvoicesResponse,
    type OrderResponse,
    type PaymentHistoryResponse,
    type Plan,
    type RetryResponse,
    type Subscription as SubscriptionShape,
    type UsageResponse,
    type VerifyParams,
    type VerifyResponse,
} from '../api/payments';



// ─── Queries ─────────────────────────────────────────────────────────────────

export function usePlans() {
    return useQuery({
        queryKey: queryKeys.payments.plans,
        queryFn: getPlans,
        staleTime: 60 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
    });
}

export function useSubscription(enabled = true) {
    return useQuery({
        queryKey: queryKeys.payments.subscription,
        queryFn: getSubscription,
        enabled,
        staleTime: 5 * 60 * 1000,
    });
}

export function usePaymentHistory(userId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.payments.history(userId!),
        queryFn: () => getPaymentHistory(userId!),
        enabled: !!userId,
        staleTime: 2 * 60 * 1000,
    });
}

export function useInvoices(enabled = true) {
    return useQuery({
        queryKey: queryKeys.payments.invoices,
        queryFn: getInvoices,
        enabled,
        staleTime: 5 * 60 * 1000,
    });
}

// ─── Mutations ───────────────────────────────────────────────────────────────
//
// Phase 1 removed useUsage, useCancelSubscription, useReactivateSubscription and
// usePaymentStatus: all four had zero consumers. Their API functions (getUsage,
// cancelSubscription, reactivateSubscription, getPaymentStatus) remain in
// lib/api/payments.ts, so they can be re-wired without a transport change.

function invalidateBillingData() {
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.user.profile });
    queryClient.invalidateQueries({ queryKey: queryKeys.legacySubscription });   // legacy consumers
    queryClient.invalidateQueries({ queryKey: queryKeys.aiUsage });       // useAIUsage
}

export function useCreateOrder() {
    return useMutation<OrderResponse, Error, { planId: string; currency?: string }>({
        mutationFn: ({ planId, currency = 'INR' }) => createOrder(planId, currency),
    });
}

export function useRenew() {
    return useMutation<OrderResponse, Error, { currency?: string }>({
        mutationFn: ({ currency = 'INR' }) => renewSubscription(currency),
    });
}

export function useVerifyPayment() {
    return useMutation<VerifyResponse, Error, VerifyParams>({
        mutationFn: verifyPayment,
        onSuccess: () => invalidateBillingData(),
    });
}

export function useRetryActivation() {
    return useMutation<RetryResponse, Error, { paymentRowId: string }>({
        mutationFn: ({ paymentRowId }) => retryActivation(paymentRowId),
        onSuccess: () => invalidateBillingData(),
    });
}

export type {
    Plan,
    SubscriptionShape as Subscription,
    VerifyResponse,
    OrderResponse,
    PaymentHistoryResponse,
    InvoicesResponse,
    UsageResponse,
};







