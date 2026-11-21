// =============================================================================
// Payment Connections Hook
// Manages Stripe & Razorpay OAuth connections, disconnects, and OAuth redirect listener.
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getPaymentConnections,
  getAuthorizeUrl,
  disconnectPaymentGateway,
  paymentKeys,
  PaymentProvider,
} from '../api/paymentConnections';

export function usePaymentConnections() {
  const queryClient = useQueryClient();
  const [connectingProvider, setConnectingProvider] = useState<PaymentProvider | null>(null);

  // 1. Fetch connected gateways
  const {
    data: connections = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: paymentKeys.list(),
    queryFn: getPaymentConnections,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  // 2. Listen for OAuth callback return in URL query params (?payment_status=connected&provider=stripe)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const paymentStatus = url.searchParams.get('payment_status');
    const provider = url.searchParams.get('provider') as PaymentProvider | null;
    const errorDesc = url.searchParams.get('error');

    if (paymentStatus) {
      const providerLabel = provider === 'stripe' ? 'Stripe' : provider === 'razorpay' ? 'Razorpay' : 'Gateway';

      if (paymentStatus === 'connected') {
        toast.success(`Successfully connected ${providerLabel}! Financial metrics are now active.`, {
          duration: 5000,
        });
        queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      } else if (paymentStatus === 'error') {
        toast.error(`Failed to connect ${providerLabel}: ${errorDesc || 'Authorization was cancelled or failed'}`);
      }

      // Clean query params from URL without triggering a page reload
      url.searchParams.delete('payment_status');
      url.searchParams.delete('provider');
      url.searchParams.delete('error');
      url.searchParams.delete('payment');
      url.searchParams.delete('status');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [queryClient]);

  // 3. Initiate OAuth connect
  const connectGateway = useCallback(async (provider: PaymentProvider, customRedirectUrl?: string) => {
    setConnectingProvider(provider);
    try {
      const redirectUrl = customRedirectUrl || '/?view=dashboard';
      const res = await getAuthorizeUrl(provider, redirectUrl);

      if (res.authorizeUrl) {
        window.location.href = res.authorizeUrl;
      } else {
        throw new Error('No authorization URL returned');
      }
    } catch (err: any) {
      toast.error(`Unable to initiate ${provider} connection: ${err?.message || 'Server error'}`);
      setConnectingProvider(null);
    }
  }, []);

  // 4. Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: (provider: PaymentProvider) => disconnectPaymentGateway(provider),
    onSuccess: (data) => {
      const providerLabel = data.provider === 'stripe' ? 'Stripe' : 'Razorpay';
      toast.success(`Disconnected ${providerLabel}. Cached metrics have been removed.`);
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    },
    onError: (err: any, provider) => {
      const providerLabel = provider === 'stripe' ? 'Stripe' : 'Razorpay';
      toast.error(`Failed to disconnect ${providerLabel}: ${err?.message || 'Unknown error'}`);
    },
  });

  const stripeConnection = connections.find(
    (c) => c.provider === 'stripe' && c.status === 'connected'
  );
  const razorpayConnection = connections.find(
    (c) => c.provider === 'razorpay' && c.status === 'connected'
  );
  const hasAnyPaymentConnection = Boolean(stripeConnection || razorpayConnection);

  return {
    connections,
    isLoading,
    isError,
    refetch,
    stripeConnection,
    razorpayConnection,
    hasAnyPaymentConnection,
    connectingProvider,
    connectGateway,
    disconnectGateway: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isPending,
  };
}
