// =============================================================================
// usePayments — React Query hooks for the shared billing backend.
//
// Centralises query keys + invalidation for the plan / subscription / usage /
// history / invoices data used across the app.
// =============================================================================

import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys } from '@/lib/queryClient';
import {
    cancelSubscription,
    createOrder,
    getInvoices,
    getPaymentHistory,
    getPaymentStatus,
    getPlans,
    getSubscription,
    getUsage,
    reactivateSubscription,
    renewSubscription,
    retryActivation,
    verifyPayment,
    type ActionResponse,
    type InvoicesResponse,
    type OrderResponse,
    type PaymentHistoryResponse,
    type Plan,
    type RetryResponse,
    type Subscription as SubscriptionShape,
    type UsageResponse,
    type VerifyParams,
    type VerifyResponse,
} from '@/lib/api/payments';

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

export function useUsage(enabled = true) {
    return useQuery({
        queryKey: queryKeys.payments.usage,
        queryFn: getUsage,
        enabled,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
    });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function invalidateBillingData() {
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.user.profile });
    queryClient.invalidateQueries({ queryKey: ['subscription'] });   // legacy consumers
    queryClient.invalidateQueries({ queryKey: ['ai-usage'] });       // useAIUsage
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

export function useCancelSubscription() {
    return useMutation<ActionResponse, Error, void>({
        mutationFn: () => cancelSubscription(),
        onSuccess: () => invalidateBillingData(),
    });
}

export function useReactivateSubscription() {
    return useMutation<ActionResponse, Error, void>({
        mutationFn: () => reactivateSubscription(),
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

export function usePaymentStatus(paymentId: string | undefined) {
    return useQuery({
        queryKey: ['payments', 'status', paymentId!],
        queryFn: () => getPaymentStatus(paymentId!),
        enabled: !!paymentId,
        staleTime: 30 * 1000,
    });
}
