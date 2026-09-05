import { useMemo, useState, type ElementType } from 'react';
import type { User } from '@supabase/supabase-js';
import {
    Activity,
    BadgeCheck,
    CalendarClock,
    Check,
    CircleAlert,
    CircleDashed,
    Clock3,
    Download,
    Eye,
    FileText,
    Layers3,
    Loader2,
    ReceiptText,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    Zap,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useCheckout } from '@/hooks/useCheckout';
import {
    useInvoices,
    usePaymentHistory,
    usePlans,
    useRetryActivation,
    useSubscription,
    type Plan,
} from '@/hooks/usePayments';
import { toast } from 'sonner';
import { getInvoiceHtml } from '@/lib/api/payments';

interface PlansSettingsProps {
    user?: User | Partial<User> | null;
}

const PLAN_META: Record<string, { icon: ElementType; tone: string; border: string; bg: string }> = {
    free:          { icon: Layers3,     tone: 'text-slate-600 dark:text-slate-400', border: 'border-slate-500/20', bg: 'bg-slate-500/10' },
    starter:       { icon: Zap,         tone: 'text-blue-600 dark:text-blue-400',   border: 'border-blue-500/20',  bg: 'bg-blue-500/10' },
    pro_monthly:   { icon: ShieldCheck, tone: 'text-primary',                       border: 'border-primary/20',   bg: 'bg-primary/10' },
    power_monthly: { icon: Activity,    tone: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/10' },
};

function formatMoneyFromPaise(amountPaise: number): string {
    if (amountPaise <= 0) return '₹0';
    return `₹${(amountPaise / 100).toLocaleString('en-IN')}`;
}

function formatUSD(amount: number): string {
    if (amount <= 0) return '$0';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatAmount(amount: number, currency: string): string {
    if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
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
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusMeta(status: string) {
    switch (status) {
        case 'success':
            return { label: 'Paid', icon: BadgeCheck, className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
        case 'pending':
            return { label: 'Pending', icon: CircleDashed, className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300' };
        case 'processing':
            return { label: 'Processing', icon: Loader2, className: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300' };
        case 'refunded':
            return { label: 'Refunded', icon: ReceiptText, className: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300' };
        default:
            return { label: 'Failed', icon: CircleAlert, className: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300' };
    }
}

export function PlansSettings({ user }: PlansSettingsProps) {
    const { user: authUser } = useAuth();
    const { profile } = useUserProfile();
    const activeUser = authUser ?? user;
    const { data: plansData, isLoading: plansLoading } = usePlans();
    const { data: subscription } = useSubscription(Boolean(activeUser?.id));

    const { data: historyData, isLoading: historyLoading } = usePaymentHistory(activeUser?.id);
    const { data: invoicesData, isLoading: invoicesLoading } = useInvoices(Boolean(activeUser?.id));
    const { mutateAsync: retry } = useRetryActivation();
    const { checkout } = useCheckout();
    const [retryingId, setRetryingId] = useState<string | null>(null);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [invoiceLoadingId, setInvoiceLoadingId] = useState<string | null>(null);

    const plans = useMemo(
        () => [...(plansData?.plans ?? [])].sort((a, b) => a.price_inr - b.price_inr),
        [plansData],
    );

    const currentPlanId = subscription?.plan_id ?? 'free';
    // Prefer the full plan from the available-plans list (has price/limits/models).
    // Only fall back to the minimal subscription.sw_plans projection ({id, name})
    // if the plan is missing from the list (e.g. newly added plan not yet cached).
    const currentPlan =
        plans.find((plan) => plan.id === currentPlanId) ?? subscription?.sw_plans ?? null;
    const isPaid = currentPlanId !== 'free';
    const cancelScheduled = Boolean(subscription?.cancel_at_period_end);
    const subStatus = subscription?.status ?? 'active';
    const payments = historyData?.payments ?? [];
    const invoices = invoicesData?.invoices ?? [];

    // Open a branded invoice (HTML-first). Fetch with the authenticated session,
    // then render into a new window so the user can view it and print-to-PDF.
    const openInvoice = async (invoiceId: string) => {
        setInvoiceLoadingId(invoiceId);
        try {
            const html = await getInvoiceHtml(invoiceId);
            const win = window.open('', '_blank');
            if (!win) {
                toast.error('Pop-up blocked. Please allow pop-ups to view your invoice.');
                return;
            }
            win.document.write(html);
            win.document.close();
        } catch (err) {
            console.error('[Billing] failed to load invoice:', err);
            toast.error('Failed to load invoice');
        } finally {
            setInvoiceLoadingId(null);
        }
    };

    const rawDisplayName =
        profile?.full_name ||
        (activeUser as any)?.full_name ||
        activeUser?.user_metadata?.full_name ||
        profile?.email ||
        activeUser?.email?.split('@')[0] ||
        'User';

    const displayName = rawDisplayName
        .replace(/[^\w\s\-\.\u00C0-\u017F]/gu, '')
        .trim() || 'User';

    const avatarUrl =
        profile?.avatar_url ||
        (activeUser as any)?.avatar_url ||
        activeUser?.user_metadata?.avatar_url ||
        '';

    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U';

    if (!activeUser) {
        return (
            <div className="p-6">
                <div className="rounded-xl border bg-card p-8 text-center">
                    <h3 className="text-base font-semibold tracking-tight text-foreground">Plans &amp; Billing</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">Sign in to manage your plan and view billing history.</p>
                </div>
            </div>
        );
    }

    const prefill = {
        name: (activeUser as any)?.full_name || activeUser?.user_metadata?.full_name || '',
        email: activeUser?.email || '',
    };

    const handleUpgrade = async (plan: Plan) => {
        setIsUpgradeModalOpen(false);

        // Plan-change lock (non-refundable, full lock): while on a paid plan,
        // the plan is held until the billing period ends. No mid-cycle switches,
        // downgrades, or cancellation — including moving to Free early.
        if (isPaid && plan.id !== currentPlanId) {
            const until = subscription?.current_period_end
                ? formatDate(subscription.current_period_end)
                : 'the end of your current period';
            toast.info(
                `Your current plan is active until ${until} and is non-refundable. Plan changes and cancellation are only available after this period ends — no partial refunds.`,
            );
            return;
        }

        checkout({ kind: 'upgrade', planId: plan.id, planName: plan.name, prefill });
    };

    const handleRenew = async () => checkout({ kind: 'renew', prefill });

    const handleRetry = async (paymentRowId: string) => {
        setRetryingId(paymentRowId);
        try {
            await retry({ paymentRowId });
            toast.success('Activation retried successfully.');
        } catch (err: any) {
            toast.error(err?.message || 'Retry failed');
        } finally {
            setRetryingId(null);
        }
    };

    const statusBadge = !isPaid
        ? { label: 'Active', className: 'border-border text-muted-foreground bg-muted/50' }
        : cancelScheduled
            ? { label: 'Cancels Soon', className: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400' }
            : subStatus === 'past_due'
                ? { label: 'Past Due', className: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400' }
                : { label: 'Active', className: 'border-primary/20 bg-primary/10 text-primary' };

    return (
        <div className="p-6 space-y-6">
            {/* ── Page Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">Plans &amp; Billing</h3>
                    <p className="text-sm text-muted-foreground">Manage your subscription, plan limits, and billing history</p>
                </div>
            </div>

            {/* ── Current Plan Card ── */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3.5">
                        <Avatar className="h-10 w-10 shrink-0 rounded-lg border shadow-xs">
                            <AvatarImage src={avatarUrl} className="object-cover rounded-lg" />
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs rounded-lg">
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-base font-semibold text-foreground">
                                    {currentPlan?.name ?? 'Free Plan'}
                                </h4>
                                <Badge variant="outline" className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', statusBadge.className)}>
                                    {statusBadge.label}
                                </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                {isPaid && subscription?.current_period_end
                                    ? cancelScheduled
                                        ? `Active until ${formatDate(subscription.current_period_end)}`
                                        : `Renews on ${formatDate(subscription.current_period_end)}`
                                    : 'No active subscription'}
                            </p>
                        </div>
                    </div>

                    {/* Action buttons — paid plans are non-refundable and locked
                        until the billing period ends: no cancel, no reactivate. */}
                    <div className="flex items-center gap-2">
                        {isPaid ? (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    onClick={() => setIsUpgradeModalOpen(true)}
                                >
                                    Change Plan
                                </Button>
                                <Button
                                    size="sm"
                                    variant="default"
                                    className="h-8 text-xs"
                                    onClick={handleRenew}
                                >
                                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                    Renew
                                </Button>
                            </>
                        ) : (
                            <Button
                                size="sm"
                                variant="default"
                                className="h-8 text-xs"
                                onClick={() => setIsUpgradeModalOpen(true)}
                            >
                                Upgrade Plan
                            </Button>
                        )}
                    </div>
                </div>

                {/* Plan Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Price</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                            {currentPlan && currentPlan.price_inr > 0 ? formatMoneyFromPaise(currentPlan.price_inr) : 'Free'}
                            {isPaid && <span className="text-xs font-normal text-muted-foreground">/mo</span>}
                        </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Credits</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                            {formatCompact(currentPlan?.credit_limit_monthly ?? 0)}
                        </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Concurrency</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                            {currentPlan?.concurrent_limit ?? 1} {currentPlan?.concurrent_limit === 1 ? 'agent' : 'agents'}
                        </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Models</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                            {currentPlan?.allowed_models?.length ?? 1} supported
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Billing History & Invoices ── */}
            <div className="space-y-3">
                <Tabs defaultValue="history" className="w-full">
                    <div className="flex items-center justify-between px-1 mb-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Billing Records
                        </h4>
                        <TabsList className="h-7 p-0.5 bg-muted/60">
                            <TabsTrigger value="history" className="text-[11px] px-2.5 h-6">
                                History ({payments.length})
                            </TabsTrigger>
                            <TabsTrigger value="invoices" className="text-[11px] px-2.5 h-6">
                                Invoices ({invoices.length})
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Payment History Tab */}
                    <TabsContent value="history" className="mt-0">
                        <div className="rounded-xl border bg-card overflow-hidden">
                            {historyLoading ? (
                                <div className="p-8 text-center text-xs text-muted-foreground">
                                    <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1.5 text-muted-foreground/60" />
                                    Loading history…
                                </div>
                            ) : payments.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                                    <Clock3 className="h-4 w-4 text-muted-foreground/40" />
                                    <span>No payment history yet.</span>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent border-border/40">
                                            <TableHead className="h-8 px-4 text-[11px] font-medium text-muted-foreground">Date</TableHead>
                                            <TableHead className="h-8 text-[11px] font-medium text-muted-foreground">Plan</TableHead>
                                            <TableHead className="h-8 text-[11px] font-medium text-muted-foreground">Amount</TableHead>
                                            <TableHead className="h-8 text-[11px] font-medium text-muted-foreground">Method</TableHead>
                                            <TableHead className="h-8 text-[11px] font-medium text-muted-foreground">Reference</TableHead>
                                            <TableHead className="h-8 px-4 text-right text-[11px] font-medium text-muted-foreground">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {payments.map((payment) => {
                                            const meta = statusMeta(payment.status);
                                            const StatusIcon = meta.icon;
                                            const reference = payment.paymentId ?? payment.orderId ?? payment.id;
                                            const retryable = payment.status === 'failed' || payment.status === 'processing';

                                            return (
                                                <TableRow key={payment.id} className="text-xs">
                                                    <TableCell className="px-4 py-2.5 font-medium text-foreground">
                                                        {formatDate(payment.createdAt)}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-muted-foreground">
                                                        {plans.find((p) => p.id === payment.planId)?.name ?? payment.planId}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 font-medium text-foreground">
                                                        {formatAmount(payment.amount, payment.currency)}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-muted-foreground">
                                                        {payment.paymentMethod ?? 'Online'}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 font-mono text-[11px] text-muted-foreground">
                                                        {String(reference).slice(0, 14)}…
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Badge variant="outline" className={cn('gap-1 rounded-full px-2 py-0.5 text-[10px]', meta.className)}>
                                                                <StatusIcon className="h-3 w-3" />
                                                                {meta.label}
                                                            </Badge>
                                                            {retryable && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                                                    onClick={() => handleRetry(payment.id)}
                                                                    disabled={retryingId === payment.id}
                                                                >
                                                                    {retryingId === payment.id ? (
                                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                                    ) : (
                                                                        <RotateCcw className="h-3 w-3 mr-1" />
                                                                    )}
                                                                    Retry
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </TabsContent>

                    {/* Invoices Tab */}
                    <TabsContent value="invoices" className="mt-0">
                        <div className="rounded-xl border bg-card overflow-hidden">
                            {invoicesLoading ? (
                                <div className="p-8 text-center text-xs text-muted-foreground">
                                    <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1.5 text-muted-foreground/60" />
                                    Loading invoices…
                                </div>
                            ) : invoices.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                                    <FileText className="h-4 w-4 text-muted-foreground/40" />
                                    <span>No invoices yet.</span>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent border-border/40">
                                            <TableHead className="h-8 px-4 text-[11px] font-medium text-muted-foreground">Invoice #</TableHead>
                                            <TableHead className="h-8 text-[11px] font-medium text-muted-foreground">Issued</TableHead>
                                            <TableHead className="h-8 text-[11px] font-medium text-muted-foreground">Plan</TableHead>
                                            <TableHead className="h-8 px-4 text-right text-[11px] font-medium text-muted-foreground">Amount</TableHead>
                                            <TableHead className="h-8 px-4 text-right text-[11px] font-medium text-muted-foreground">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoices.map((inv) => (
                                            <TableRow key={inv.id} className="text-xs">
                                                <TableCell className="px-4 py-2.5 font-mono text-[11px] font-medium text-foreground">
                                                    {inv.invoice_number}
                                                </TableCell>
                                                <TableCell className="py-2.5 text-muted-foreground">
                                                    {formatDate(inv.issued_at)}
                                                </TableCell>
                                                <TableCell className="py-2.5 text-muted-foreground">
                                                    {plans.find((p) => p.id === inv.plan_id)?.name ?? inv.plan_id}
                                                </TableCell>
                                                <TableCell className="px-4 py-2.5 text-right font-medium text-foreground">
                                                    {formatMoneyFromPaise(inv.net_paise || inv.amount_paise)}
                                                    <Badge variant="outline" className="ml-2 rounded-full px-1.5 py-0 text-[10px] capitalize">
                                                        {inv.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="px-4 py-2.5 text-right whitespace-nowrap">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2.5 text-[11px] gap-1.5"
                                                        onClick={() => openInvoice(inv.id)}
                                                        disabled={invoiceLoadingId === inv.id}
                                                    >
                                                        {invoiceLoadingId === inv.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <Eye className="h-3 w-3" />
                                                        )}
                                                        View
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2.5 text-[11px] gap-1.5"
                                                        disabled={invoiceLoadingId === inv.id}
                                                        onClick={() => openInvoice(inv.id)}
                                                    >
                                                        <Download className="h-3 w-3" />
                                                        PDF
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* ── Upgrade / Select Plan Modal ── */}
            <Dialog open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-6">
                    <DialogHeader>
                        <DialogTitle>Choose a Plan</DialogTitle>
                        <DialogDescription>
                            {isPaid
                                ? `Your current plan is active and non-refundable until the billing period ends. Plan changes are only available after this period ends.`
                                : 'Select the plan that best fits your workflow. Paid plans are non-refundable and locked until the period ends.'}
                        </DialogDescription>
                    </DialogHeader>

                    {plansLoading ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 text-muted-foreground/60" />
                            Loading plans…
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                            {plans.map((plan) => {
                                const meta = PLAN_META[plan.id] ?? PLAN_META.free;
                                const isCurrent = plan.id === currentPlanId;
                                const PlanIcon = meta.icon;

                                return (
                                    <div
                                        key={plan.id}
                                        className={cn(
                                            'rounded-xl border bg-card p-5 flex flex-col justify-between transition-colors',
                                            isCurrent ? 'border-primary/40 ring-1 ring-primary/20 bg-primary/[0.02]' : 'border-border hover:border-border/80',
                                        )}
                                    >
                                        <div className="space-y-3.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn('flex h-7 w-7 items-center justify-center rounded-md border', meta.border, meta.bg)}>
                                                        <PlanIcon className={cn('h-3.5 w-3.5', meta.tone)} />
                                                    </div>
                                                    <h5 className="text-sm font-semibold text-foreground">{plan.name}</h5>
                                                </div>
                                                {isCurrent && (
                                                    <Badge variant="outline" className="text-[10px] font-medium border-primary/30 text-primary bg-primary/5">
                                                        Current
                                                    </Badge>
                                                )}
                                            </div>

                                            <div>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-xl font-bold tracking-tight text-foreground">
                                                        {formatMoneyFromPaise(plan.price_inr)}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        /{plan.billing_interval === 'lifetime' ? 'lifetime' : 'month'}
                                                    </span>
                                                </div>
                                                {plan.price_usd > 0 && (
                                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                                        ≈ {formatUSD(plan.price_usd)} / month
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-1.5 text-xs border-t border-border/50 pt-3">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                    <span><strong className="font-medium text-foreground">{formatCompact(plan.credit_limit_monthly)}</strong> credits</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                    <span><strong className="font-medium text-foreground">{plan.concurrent_limit}</strong> concurrent agent{plan.concurrent_limit > 1 ? 's' : ''}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                    <span><strong className="font-medium text-foreground">{plan.allowed_models.length}</strong> AI models</span>
                                                </div>
                                                {plan.features.slice(0, 2).map((feat) => (
                                                    <div key={feat} className="flex items-center gap-2 text-muted-foreground">
                                                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        <span className="truncate">{feat}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <Button
                                            size="sm"
                                            className="mt-4 w-full h-8 text-xs"
                                            variant={isCurrent ? 'secondary' : 'default'}
                                            disabled={isCurrent}
                                            onClick={isCurrent ? undefined : () => handleUpgrade(plan)}
                                        >
                                            {isCurrent
                                                ? 'Current Plan'
                                                : isPaid
                                                    ? 'Locked until period end'
                                                    : `Choose ${plan.name}`}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
