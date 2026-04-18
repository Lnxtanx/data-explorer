import { useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCreateOrder, usePlans, useVerifyPayment } from '@/hooks/usePayments';
import type { Plan } from '@/lib/api/payments';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    currentPlanId?: string | null;
}

declare global {
    interface Window {
        Razorpay: any;
    }
}

function formatPrice(plan: Plan): string {
    if (plan.price_inr === 0) return 'Free';
    return `Rs ${(plan.price_inr / 100).toLocaleString('en-IN')}`;
}

function formatInterval(plan: Plan): string {
    if (plan.billing_interval === 'lifetime') return 'lifetime';
    return `per ${plan.billing_interval}`;
}

function isFeatured(plan: Plan): boolean {
    return plan.id === 'pro_monthly';
}

function summaryLines(plan: Plan): string[] {
    return [
        `${(plan.credit_limit_monthly / 1000).toLocaleString('en-IN')}K monthly credits`.replace('.0K', 'K'),
        `${plan.concurrent_limit} concurrent agents`,
        `${plan.allowed_models.length} models`,
    ];
}

export function PricingModal({ isOpen, onClose, onSuccess, currentPlanId }: PricingModalProps) {
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const { user } = useAuth();
    const createOrderMutation = useCreateOrder();
    const verifyPaymentMutation = useVerifyPayment();
    const { data: plansData, isLoading: plansLoading } = usePlans();

    const plans = useMemo(
        () => [...(plansData?.plans ?? [])].sort((a, b) => a.price_inr - b.price_inr),
        [plansData],
    );

    const loadRazorpay = (): Promise<boolean> =>
        new Promise((resolve) => {
            if (window.Razorpay) {
                resolve(true);
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });

    const handleSubscribe = async (planId: string) => {
        if (planId === 'free') {
            toast.info('Free is already available without checkout');
            return;
        }

        if (!user) {
            toast.error('Please sign in to continue');
            return;
        }

        setLoadingId(planId);

        try {
            const isLoaded = await loadRazorpay();
            if (!isLoaded) {
                toast.error('Failed to load payment gateway');
                return;
            }

            const orderResponse = await createOrderMutation.mutateAsync({ planId });
            if (!orderResponse.success || !orderResponse.order) {
                throw new Error('Failed to create order');
            }

            const { order } = orderResponse;

            const options = {
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: 'Schema Weaver',
                description: `${order.planName} subscription`,
                order_id: order.id,
                handler: async (response: {
                    razorpay_order_id: string;
                    razorpay_payment_id: string;
                    razorpay_signature: string;
                }) => {
                    try {
                        const verifyResponse = await verifyPaymentMutation.mutateAsync({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            user_id: user.id,
                            plan_id: planId,
                            email: user.email,
                            name: user.user_metadata?.full_name || '',
                        });

                        if (verifyResponse.success) {
                            toast.success('Subscription activated');
                            onSuccess?.();
                            onClose();
                        } else {
                            toast.error('Payment verification failed');
                        }
                    } catch (error) {
                        console.error('[PricingModal] Payment verification error:', error);
                        toast.error('Payment verification failed');
                    }
                },
                prefill: {
                    name: user.user_metadata?.full_name || '',
                    email: user.email || '',
                },
                theme: {
                    color: '#2563eb',
                },
                modal: {
                    ondismiss: () => setLoadingId(null),
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (error) {
            console.error('[PricingModal] Subscribe error:', error);
            toast.error('Something went wrong. Please try again.');
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-semibold tracking-tight">Choose a plan</DialogTitle>
                    <DialogDescription>Plans are loaded live from the billing database.</DialogDescription>
                </DialogHeader>

                {plansLoading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">Loading plans...</div>
                ) : (
                    <div className="grid gap-4 py-4 md:grid-cols-2 xl:grid-cols-4">
                        {plans.map((plan) => {
                            const current = currentPlanId === plan.id;
                            const checkoutDisabled = current || plan.id === 'free' || loadingId === plan.id;
                            const ctaLabel = current ? 'Current plan' : plan.id === 'free' ? 'Included' : `Choose ${plan.name}`;

                            return (
                                <div
                                    key={plan.id}
                                    className={`rounded-3xl border p-5 ${isFeatured(plan) ? 'border-primary/30 bg-primary/[0.03]' : 'border-border/70 bg-card'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
                                        {isFeatured(plan) && !current && (
                                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-primary">
                                                Popular
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-4 text-3xl font-semibold tracking-tight">{formatPrice(plan)}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">{formatInterval(plan)}</p>

                                    <div className="mt-5 space-y-3">
                                        {summaryLines(plan).map((feature) => (
                                            <div key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <Check className="mt-0.5 h-4 w-4 text-primary" />
                                                <span>{feature}</span>
                                            </div>
                                        ))}
                                        {plan.features.slice(0, 2).map((feature) => (
                                            <div key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <Check className="mt-0.5 h-4 w-4 text-primary" />
                                                <span>{feature}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <Button
                                        className="mt-6 w-full rounded-xl"
                                        onClick={() => handleSubscribe(plan.id)}
                                        disabled={checkoutDisabled}
                                        variant={current ? 'secondary' : isFeatured(plan) ? 'default' : 'outline'}
                                    >
                                        {loadingId === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : ctaLabel}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
