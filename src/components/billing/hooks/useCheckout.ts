// =============================================================================
// useCheckout — end-to-end Razorpay purchase / renewal flow.
//
// Wraps: create order (or renew) → open Razorpay checkout → verify on success
// → toast + invalidate billing data. Used by the plan cards and the "Renew"
// button so the flow is identical everywhere.
//
// `checkout(output)` resolves with `true` after a verified successful payment,
// `false` when the user cancels the modal, and rejects on hard errors (e.g. the
// order endpoint failed or the provider SDK is unavailable).
// =============================================================================

import { useState } from 'react';
import { toast } from 'sonner';
import { openRazorpayCheckout } from '../api/razorpay';
import {
    useCreateOrder,
    useRenew,
    useVerifyPayment,
} from './usePayments';

export type CheckoutInput = {
    kind: 'upgrade' | 'renew';
    planId?: string;
    planName?: string;
    currency?: string;
    prefill?: { name?: string; email?: string };
};

export function useCheckout(): {
    checkout: (input: CheckoutInput) => Promise<boolean>;
    isBusy: boolean;
    error: string | null;
    resetError: () => void;
} {
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { mutateAsync: createOrder } = useCreateOrder();
    const { mutateAsync: renew } = useRenew();
    const { mutateAsync: verifyPayment } = useVerifyPayment();

    const checkout = async (input: CheckoutInput): Promise<boolean> => {
        setError(null);
        setIsBusy(true);

        let resolveOutcome!: (value: boolean) => void;
        const outcome = new Promise<boolean>((resolve) => { resolveOutcome = resolve; });
        let settled = false;

        const settle = (value: boolean) => {
            if (settled) return;
            settled = true;
            setIsBusy(false);
            resolveOutcome(value);
        };

        try {
            // 1. Create the Razorpay order (or renew the current plan).
            const { order } = input.kind === 'upgrade' && input.planId
                ? await createOrder({ planId: input.planId, currency: input.currency })
                : await renew({ currency: input.currency });

            const description = input.kind === 'upgrade'
                ? `Upgrade to ${input.planName ?? 'your new plan'}`
                : 'Renew your current plan';

            // 2. Open the checkout. The outcome is delivered via callbacks.
            openRazorpayCheckout({
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: 'Schema Weaver',
                description,
                order_id: order.id,
                prefill: input.prefill,
                theme: { color: '#0f172a' },
                onSuccess: async (response) => {
                    toast.loading('Verifying payment...', { id: 'payment-verify' });
                    try {
                        await verifyPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        });
                        toast.success(
                            `Payment successful — ${input.kind === 'renew' ? 'plan renewed' : 'plan activated'}!`,
                            { id: 'payment-verify' },
                        );
                        settle(true);
                    } catch (verifyErr: any) {
                        toast.error(verifyErr?.message || 'Payment verification failed', { id: 'payment-verify' });
                        settle(false);
                    }
                },
                onFailure: (err) => {
                    setError(err?.message || 'Payment failed');
                    toast.error(err?.message || 'Payment failed');
                    settle(false);
                },
                onDismiss: () => settle(false),
            });

            return await outcome;
        } catch (err: any) {
            setIsBusy(false);
            const message = err?.message || 'Could not start the payment.';
            setError(message);
            toast.error(message);
            settle(false);
            return false;
        }
    };

    return { checkout, isBusy, error, resetError: () => setError(null) };
}
