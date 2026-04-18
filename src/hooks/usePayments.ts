import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys } from '@/lib/queryClient';
import {
    createOrder,
    getPaymentHistory,
    getPlans,
    getUsage,
    verifyPayment,
    type CreateOrderResponse,
    type PaymentHistoryResponse,
    type Plan,
    type UsageResponse,
    type VerifyPaymentParams,
    type VerifyPaymentResponse,
} from '@/lib/api/payments';

export function usePlans() {
    return useQuery({
        queryKey: queryKeys.payments.plans,
        queryFn: getPlans,
        staleTime: 60 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
    });
}

export function useUsage(userId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.payments.usage(userId!),
        queryFn: () => getUsage(userId!),
        enabled: !!userId,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
    });
}

export function usePaymentHistory(userId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.payments.history(userId!),
        queryFn: () => getPaymentHistory(userId!),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000,
    });
}

export function useCreateOrder() {
    return useMutation<CreateOrderResponse, Error, { planId: string }>({
        mutationFn: ({ planId }) => createOrder(planId),
    });
}

export function useVerifyPayment() {
    return useMutation<VerifyPaymentResponse, Error, VerifyPaymentParams>({
        mutationFn: verifyPayment,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.user.profile });
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
            queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
        },
    });
}

export type { Plan, UsageResponse, PaymentHistoryResponse };

