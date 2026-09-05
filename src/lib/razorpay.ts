// =============================================================================
// Razorpay Checkout Helper
//
// Opens a Razorpay Checkout modal. The SDK is loaded globally via
//   <script src="https://checkout.razorpay.com/v1/checkout.js">
// in index.html, exposing `window.Razorpay`.
//
// The Data Explorer uses Radix Dialogs, which set `pointer-events: none` on the
// <body> while open — that lock would make the checkout iframe unclickable.
// This module force-resets body pointer-events before opening the checkout and
// on every exit path (success, failure, dismiss) so the settings modal stays
// interactive afterwards.
//
// Posterior: `onSuccess(response)` is invoked with the captured payment ids,
// `onFailure(error)` with a human-readable message, and `onDismiss()` after an
// intentional close or a failure so the caller can reset its busy state.
// =============================================================================

export interface RazorpayCheckoutOptions {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    prefill?: { name?: string; email?: string; contact?: string };
    theme?: { color?: string };
    onSuccess: (response: RazorpayPaymentResponse) => void;
    onFailure?: (error: Error) => void;
    onDismiss?: () => void;
}

export interface RazorpayPaymentResponse {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

type RazorpayInstance = {
    open: () => void;
    close: () => void;
    on: (event: string, handler: (...args: any[]) => void) => void;
};

declare global {
    interface Window {
        Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
    }
}

function unlockPointerEvents(): void {
    document.body.style.pointerEvents = 'auto';
}

/**
 * Open the Razorpay checkout modal. Returning control to the caller once the
 * modal is open — the outcome is reported later through onSuccess /
 * onFailure / onDismiss. Throws if the SDK is not loaded.
 */
export function openRazorpayCheckout(options: RazorpayCheckoutOptions): void {
    const Razorpay = window.Razorpay;
    if (!Razorpay) {
        unlockPointerEvents();
        throw new Error('Payment provider is not loaded. Please refresh and try again.');
    }

    const rzp = new Razorpay({
        key: options.key,
        amount: options.amount,
        currency: options.currency,
        name: options.name,
        description: options.description,
        order_id: options.order_id,
        ...(options.prefill ? { prefill: options.prefill } : {}),
        ...(options.theme ? { theme: options.theme } : {}),
        handler: (response: RazorpayPaymentResponse) => {
            unlockPointerEvents();
            options.onSuccess(response);
        },
        modal: {
            ondismiss: () => {
                unlockPointerEvents();
                options.onDismiss?.();
            },
        },
    });

    rzp.on('payment.failed', (response: { error?: { description?: string } }) => {
        unlockPointerEvents();
        options.onFailure?.(new Error(response?.error?.description || 'Payment failed'));
        options.onDismiss?.();
    });

    unlockPointerEvents();
    rzp.open();
}
