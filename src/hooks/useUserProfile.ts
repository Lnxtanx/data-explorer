// =============================================================================
// User Profile Hook
// Fetches and caches user profile + usage data via React Query
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, type UserProfileResponse } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Fetches user profile (name, email, avatar) and usage (plan, requests).
 * Data is cached for 5 minutes — opens instantly after first load.
 * Only fetches when user is logged in.
 */
export function useUserProfile() {
  const { user } = useAuth();

  const query = useQuery<UserProfileResponse>({
    queryKey: queryKeys.user.profile,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,    // 5 minutes — profile rarely changes
    gcTime: 10 * 60 * 1000,      // Keep in cache for 10 min
    enabled: !!user,              // Only fetch when logged in
    retry: false,                 // Don't retry auth failures
  });

  return {
    profile: query.data?.user ?? null,
    usage: query.data?.usage ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
