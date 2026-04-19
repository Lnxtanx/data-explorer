// =============================================================================
// User Profile Hook
// Fetches and caches user profile + usage data via React Query
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, type UserProfileResponse } from '@/lib/api';
import { get } from '@/lib/api/client';
import { queryKeys } from '@/lib/queryClient';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Fetches user profile (name, email, avatar) and usage (plan, requests).
 * Now also includes real-time subscription status for accurate plan display.
 */
export function useUserProfile() {
  const { user } = useAuth();

  const profileQuery = useQuery<UserProfileResponse>({
    queryKey: queryKeys.user.profile,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
    retry: false,
  });

  const subQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: () => get<any>('/api/payments/subscription'),
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  const planId = subQuery.data?.plan_id || profileQuery.data?.usage?.plan_id || 'free';

  return {
    profile: profileQuery.data?.user ?? null,
    usage: profileQuery.data?.usage ?? null,
    subscription: subQuery.data ?? null,
    planId,
    isLoading: profileQuery.isLoading || subQuery.isLoading,
    error: profileQuery.error || subQuery.error,
    refetch: () => {
      profileQuery.refetch();
      subQuery.refetch();
    },
  };
}
