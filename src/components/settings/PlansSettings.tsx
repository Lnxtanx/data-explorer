import { useMemo, useState, type ElementType } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import {
    Activity,
    BadgeCheck,
    CircleAlert,
    CircleDashed,
    Clock3,
    CreditCard,
    ExternalLink,
    Layers3,
    Loader2,
    ReceiptText,
    ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { get } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useCreateOrder, useVerifyPayment } from '@/hooks/usePayments';
import { toast } from 'sonner';

const PRICING_URL = 'https://schemaweaver.vivekmind.com/pricing';

interface PlansSettingsProps {
    user?: User | Partial<User> | null;
}

interface SwPlan {
    id: string;
    name: string;
    price_inr: number;
    price_usd: number;
    billing_interval: 'month' | 'year' | 'lifetime';
    credit_limit_monthly: number;
    credit_limit_daily: number;
    concurrent_limit: number;
    max_tokens_per_run: number;
    max_agent_duration_secs?: number;
    allowed_models: string[];
    features: string[];
    is_active: boolean;
}

interface Subscription {
    id?: string;
    user_id?: string;
    plan_id: string;
    status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
    provider?: string;
    current_period_start: string | null;
    current_period_end: string | null;
    sw_plans: SwPlan | null;
}

interface PaymentHistoryItem {
    id: string;
    paymentId?: string | null;
    orderId?: string | null;
    planId: string;
    amount: number;
    currency: string;
    status: 'pending' | 'success' | 'failed' | 'refunded';
    paymentMethod?: string | null;
    createdAt: string;
}

interface PaymentHistoryResponse {
    success: boolean;
    payments: PaymentHistoryItem[];
}

const PLAN_META: Record<string, { icon: ElementType; tone: string; border: string; bg: string }> = {
    free: { icon: Layers3, tone: 'text-slate-600 dark:text-slate-300', border: 'border-slate-500/15', bg: 'bg-slate-500/5' },
    starter: { icon: CreditCard, tone: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/5' },
    pro_monthly: { icon: ShieldCheck, tone: 'text-primary', border: 'border-primary/20', bg: 'bg-primary/5' },
    power_monthly: { icon: Activity, tone: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
};

function formatMoneyFromPaise(amountPaise: number): string {
    if (amountPaise <= 0) return 'Rs 0';
    return `Rs ${(amountPaise / 100).toLocaleString('en-IN')}`;
}

function formatUSD(amount: number): string {
    if (amount <= 0) return '$0';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAmount(amount: number, currency: string): string {
    if (currency === 'INR') return `Rs ${amount.toLocaleString('en-IN')}`;
    return `${currency} ${amount.toLocaleString('en-IN')}`;
}

function formatCompact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
    return value.toLocaleString('en-IN');
}

function formatDate(value: string | Date | null | undefined): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function intervalLabel(interval: SwPlan['billing_interval']): string {
    if (interval === 'lifetime') return 'lifetime';
    return `per ${interval}`;
}

function statusMeta(status: PaymentHistoryItem['status']) {
    if (status === 'success') {
        return { label: 'Paid', icon: BadgeCheck, className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
    }
    if (status === 'pending') {
        return { label: 'Pending', icon: CircleDashed, className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300' };
    }
    if (status === 'refunded') {
        return { label: 'Refunded', icon: ReceiptText, className: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300' };
    }
    return { label: 'Failed', icon: CircleAlert, className: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300' };
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border/40 bg-background/50 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">{label}</p>
            <p className="mt-0.5 text-base font-medium tracking-tight text-foreground">{value}</p>
        </div>
    );
}

export function PlansSettings({ user }: PlansSettingsProps) {
    const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
    const { mutateAsync: createOrder } = useCreateOrder();
    const { mutateAsync: verifyPayment } = useVerifyPayment();

    const { data: plansData, isLoading: plansLoading, error: plansError } = useQuery({
        queryKey: ['sw_plans'],
        queryFn: () => get<{ plans: SwPlan[] }>('/api/payments/plans'),
        staleTime: 60 * 60 * 1000,
    });

    const { data: subscription, isLoading: subscriptionLoading, error: subscriptionError } = useQuery({
        queryKey: ['subscription'],
        queryFn: () => get<Subscription>('/api/payments/subscription'),
        staleTime: 5 * 60 * 1000,
    });

    const billingUserId = subscription?.user_id ?? user?.id;

    const { data: historyData, isLoading: historyLoading } = useQuery({
        queryKey: ['payment_history', billingUserId],
        queryFn: () => get<PaymentHistoryResponse>(`/api/payments/history/${billingUserId}`),
        enabled: Boolean(billingUserId),
        staleTime: 2 * 60 * 1000,
    });

    const plans = useMemo(
        () => [...(plansData?.plans ?? [])].sort((a, b) => a.price_inr - b.price_inr),
        [plansData],
    );

    const handleUpgrade = async (plan: SwPlan) => {
        if (plan.id === currentPlanId) return;

        setIsUpgrading(plan.id);
        try {
            // 1. Create order on backend
            const { order } = await createOrder({ planId: plan.id });

            // 2. Open Razorpay Checkout
            const options = {
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: 'Schema Weaver',
                description: `Upgrade to ${plan.name}`,
                order_id: order.id,
                prefill: {
                    name: (user as any)?.full_name || '',
                    email: user?.email || '',
                },
                theme: {
                    color: '#0f172a',
                },
                handler: async (response: any) => {
                    try {
                        toast.loading('Verifying payment...', { id: 'payment-verify' });
                        await verifyPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            plan_id: plan.id,
                            email: user?.email,
                            name: (user as any)?.full_name
                        });
                        toast.success(`Successfully upgraded to ${plan.name}!`, { id: 'payment-verify' });
                    } catch (err: any) {
                        toast.error(err.message || 'Verification failed', { id: 'payment-verify' });
                    } finally {
                        setIsUpgrading(null);
                    }
                },
                modal: {
                    ondismiss: () => {
                        setIsUpgrading(null);
                    }
                }
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.on('payment.failed', function (response: any) {
                toast.error(`Payment failed: ${response.error.description}`);
                setIsUpgrading(null);
            });
            rzp.open();
        } catch (err: any) {
            console.error('Upgrade failed:', err);
            toast.error(err.message || 'Failed to initiate upgrade');
            setIsUpgrading(null);
        }
    };

    const currentPlanId = subscription?.plan_id ?? 'free';
    const currentPlan = subscription?.sw_plans ?? plans.find((plan) => plan.id === currentPlanId) ?? null;
    const currentMeta = PLAN_META[currentPlanId] ?? PLAN_META.free;
    const isLoading = plansLoading || subscriptionLoading;
    const hasError = plansError || subscriptionError;
    const payments = historyData?.payments ?? [];

    if (!user) {
        return (
            <div className="p-6">
                <div className="rounded-3xl border border-border/70 bg-card px-6 py-10 text-center">
                    <h3 className="text-xl font-semibold tracking-tight">Plans & Billing</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Sign in to view billing.</p>
                </div>
            </div>
        );
    }

    if (hasError && !plans.length && !subscription) {
        return (
            <div className="p-6">
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-700 dark:text-red-300">
                    Billing data could not be loaded.
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-6">
            <section className="rounded-3xl border border-border/70 bg-card shadow-sm">
                <div className="p-6">
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-4">
                            <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl border bg-background', currentMeta.border, currentMeta.bg)}>
                                <currentMeta.icon className={cn('h-6 w-6', currentMeta.tone)} />
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-xl font-medium tracking-tight text-foreground">Plans & Billing</h3>
                                    <Badge variant="outline" className="rounded-full border-primary/10 bg-primary/5 text-primary/80 font-normal py-0">
                                        {subscription?.status ?? 'active'}
                                    </Badge>
                                </div>
                                <p className="mt-1 text-base font-medium text-foreground/90">{currentPlan?.name ?? currentPlanId}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground/60">
                                    Renews {formatDate(subscription?.current_period_end)}
                                </p>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            className="rounded-xl gap-2"
                            onClick={() => window.open(`${PRICING_URL}?plan=${currentPlanId}`, '_blank', 'noopener')}
                        >
                            Upgrade
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Metric label="Price" value={currentPlan ? formatMoneyFromPaise(currentPlan.price_inr) : 'Rs 0'} />
                        <Metric label="Monthly credits" value={formatCompact(currentPlan?.credit_limit_monthly ?? 0)} />
                        <Metric label="Concurrency" value={`${currentPlan?.concurrent_limit ?? 0} agents`} />
                        <Metric label="Models" value={String(currentPlan?.allowed_models.length ?? 0)} />
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-border/70 bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                    <div>
                        <h4 className="text-base font-semibold tracking-tight text-foreground">Billing history</h4>
                        <p className="mt-1 text-xs text-muted-foreground">Latest payments and subscription charges</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        {payments.length} records
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border/40">
                            <TableHead className="px-6 text-[10px] uppercase tracking-wider font-medium text-muted-foreground/60">Date</TableHead>
                            <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/60">Plan</TableHead>
                            <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/60">Amount</TableHead>
                            <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/60">Method</TableHead>
                            <TableHead className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/60">Reference</TableHead>
                            <TableHead className="px-6 text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground/60">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {historyLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">
                                    Loading history...
                                </TableCell>
                            </TableRow>
                        ) : payments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">
                                    No billing events yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            payments.map((payment) => {
                                const meta = statusMeta(payment.status);
                                const StatusIcon = meta.icon;
                                const reference = payment.paymentId ?? payment.orderId ?? payment.id;

                                return (
                                    <TableRow key={payment.id}>
                                        <TableCell className="px-6 py-4 font-medium text-foreground">{formatDate(payment.createdAt)}</TableCell>
                                        <TableCell className="py-4 text-muted-foreground">
                                            {plans.find((plan) => plan.id === payment.planId)?.name ?? payment.planId}
                                        </TableCell>
                                        <TableCell className="py-4 font-medium text-foreground">
                                            {formatAmount(payment.amount, payment.currency)}
                                        </TableCell>
                                        <TableCell className="py-4 text-muted-foreground">{payment.paymentMethod ?? '-'}</TableCell>
                                        <TableCell className="py-4 font-mono text-xs text-muted-foreground">
                                            {String(reference).slice(0, 18)}
                                        </TableCell>
                                        <TableCell className="px-6 py-4 text-right">
                                            <Badge variant="outline" className={cn('gap-1 rounded-full px-2.5 py-1', meta.className)}>
                                                <StatusIcon className="h-3 w-3" />
                                                {meta.label}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </section>

            <section className="rounded-3xl border border-border/70 bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                    <div>
                        <h4 className="text-base font-semibold tracking-tight text-foreground">Available plans</h4>
                        <p className="mt-1 text-xs text-muted-foreground">Simple plan comparison</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {plansLoading ? 'Loading...' : `${plans.length} plans`}
                    </div>
                </div>

                {isLoading ? (
                    <div className="px-6 py-12 text-center text-sm text-muted-foreground">Loading plans...</div>
                ) : (
                    <div className="grid gap-8 p-6 md:grid-cols-2 max-w-5xl mx-auto">
                        {plans.map((plan) => {
                            const meta = PLAN_META[plan.id] ?? PLAN_META.free;
                            const isCurrent = plan.id === currentPlanId;

                            return (
                                <div
                                    key={plan.id}
                                    className={cn(
                                        'rounded-3xl border bg-background/80 p-5',
                                        isCurrent ? 'border-primary/30 ring-1 ring-primary/10' : 'border-border/60',
                                    )}
                                >
                                    <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl border', meta.border, meta.bg)}>
                                        <meta.icon className={cn('h-4 w-4', meta.tone)} />
                                    </div>
                                    <div className="mt-4 flex items-center justify-between gap-2">
                                        <h5 className="text-lg font-semibold tracking-tight text-foreground">{plan.name}</h5>
                                        {isCurrent && (
                                            <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/10 text-primary">
                                                Current
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                                        {formatUSD(plan.price_usd)}
                                    </p>
                                    <p className="text-sm font-medium text-muted-foreground/80">
                                        ≈ {formatMoneyFromPaise(plan.price_inr)}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">{intervalLabel(plan.billing_interval)}</p>

                                    <div className="mt-5 space-y-3 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Credits</span>
                                            <span className="font-medium text-foreground">{formatCompact(plan.credit_limit_monthly)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Daily</span>
                                            <span className="font-medium text-foreground">{formatCompact(plan.credit_limit_daily)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Agents</span>
                                            <span className="font-medium text-foreground">{plan.concurrent_limit}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Models</span>
                                            <span className="font-medium text-foreground">{plan.allowed_models.length}</span>
                                        </div>
                                    </div>

                                    <div className="mt-5 space-y-2">
                                        {plan.features.slice(0, 3).map((feature) => (
                                            <p key={feature} className="text-sm text-muted-foreground">
                                                {feature}
                                            </p>
                                        ))}
                                    </div>

                                    <Button
                                        className="mt-6 w-full rounded-xl gap-2"
                                        variant={isCurrent ? 'secondary' : 'default'}
                                        disabled={isCurrent || isUpgrading !== null}
                                        onClick={isCurrent ? undefined : () => handleUpgrade(plan)}
                                    >
                                        {isUpgrading === plan.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : isCurrent ? (
                                            'Current plan'
                                        ) : (
                                            `Choose ${plan.name}`
                                        )}
                                        {!isCurrent && !isUpgrading && <CreditCard className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

        </div>
    );
}
