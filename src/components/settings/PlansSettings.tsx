import { useMemo, useState, type ElementType } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import {
    Activity,
    BadgeCheck,
    Building2,
    CalendarClock,
    Check,
    CircleAlert,
    CircleDashed,
    Clock3,
    Download,
    ExternalLink,
    Eye,
    FileText,
    Layers3,
    Loader2,
    Minus,
    Plus,
    ReceiptText,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    Sparkles,
    Users,
    Zap,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PremiumAvatar } from '@/components/ui/PremiumAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    useVerifyPayment,
    type Plan,
} from '@/hooks/usePayments';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { queryKeys } from '@/lib/queryClient';
import {
    listTeams,
    createTeam,
    createTeamSeatOrder,
    getTeamBillingStatus,
} from '@/lib/api/projects/collaboration';
import { queryKeys as collabQueryKeys } from '@/components/collab/types';
import { toast } from 'sonner';
import { getInvoiceHtml } from '@/lib/api/payments';
import { MODE_META, type AgentMode } from '@/lib/modes';

interface PlansSettingsProps {
    user?: User | Partial<User> | null;
    onOpenCollaboration?: () => void;
}

const TEAM_PLAN_ID = 'team_monthly';
const TEAM_SEAT_MIN = 2;
const TEAM_SEAT_MAX = 1000;

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

function formatModes(modes?: string[]): string {
    const list = modes?.length ? modes : ['flash', 'deep'];
    const names = list.map((m) => MODE_META[m as AgentMode]?.name ?? (m ? m[0].toUpperCase() + m.slice(1) : ''));
    return names.filter(Boolean).join(' & ') || 'Flash & Deep';
}

const RETIRED_PLAN_NAMES: Record<string, string> = {
    starter: 'Starter',
    power: 'Power',
    power_monthly: 'Power',
};

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

export function PlansSettings({ user, onOpenCollaboration }: PlansSettingsProps) {
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

    // ─── Team plan state ──────────────────────────────────────────────────
    const queryClient = useQueryClient();
    const { mutateAsync: verifyTeamPayment } = useVerifyPayment();
    const [teamSeatCount, setTeamSeatCount] = useState(TEAM_SEAT_MIN);
    const [teamName, setTeamName] = useState('');
    const [teamBusy, setTeamBusy] = useState<string | null>(null);

    const { data: teamsData } = useQuery({
        queryKey: collabQueryKeys.teams,
        queryFn: async () => (await listTeams()).teams,
        enabled: Boolean(activeUser?.id),
        staleTime: 30_000,
    });

    const ownedTeam = useMemo(
        () => (teamsData ?? []).find((t) => t.is_owner || t.role === 'owner') ?? null,
        [teamsData],
    );

    // A team the user sits on as a member seat (not the owner). Used to show a
    // member-specific Team card instead of purchase controls.
    const memberTeam = useMemo(
        () => (teamsData ?? []).find((t) => !(t.is_owner || t.role === 'owner') && t.id !== ownedTeam?.id) ?? null,
        [teamsData, ownedTeam],
    );

    const activeTeam = ownedTeam ?? memberTeam;
    const isTeamMemberView = !!memberTeam && !ownedTeam;

    const { data: teamBilling } = useQuery({
        queryKey: collabQueryKeys.teamBilling(activeTeam?.id || ''),
        queryFn: () => getTeamBillingStatus(activeTeam?.id as string),
        enabled: !!activeTeam?.id,
        staleTime: 30_000,
    });

    const teamSub = teamBilling?.subscription ?? null;
    const teamSubActive = !!teamSub && ['active', 'trialing'].includes(teamSub.status);
    const teamSeatSeats = teamBilling?.seats?.seats ?? 0;
    const teamSeatOccupied = teamBilling?.seats?.occupied ?? 0;
    const allPlans = useMemo(() => [...(plansData?.plans ?? [])], [plansData]);

    const plans = useMemo(
        () =>
            [...(plansData?.plans ?? [])]
                .filter((p) => !p.is_seat_based)
                .sort((a, b) => a.price_inr - b.price_inr),
        [plansData],
    );

    const teamPlan = allPlans.find((p) => p.id === TEAM_PLAN_ID) ?? null;
    const seatPriceUsd = typeof teamPlan?.seat_price_usd === 'number' ? teamPlan.seat_price_usd : null;
    const teamPricingKnown = seatPriceUsd !== null && seatPriceUsd > 0;
    const teamTotalUsd = teamPricingKnown ? (teamSeatCount || 0) * seatPriceUsd : null;

    const currentPlanId = subscription?.plan_id ?? 'free';
    // Prefer the full plan from the available-plans list (has price/limits/models).
    // Only fall back to the minimal subscription.sw_plans projection ({id, name})
    // if the plan is missing from the list (e.g. newly added plan not yet cached).
    const currentPlan =
        allPlans.find((plan) => plan.id === currentPlanId) ?? subscription?.sw_plans ?? null;
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

    const cleanFirstName = displayName.split(/\s+/)[0]?.trim();
    const defaultTeamName =
        cleanFirstName && cleanFirstName.toLowerCase() !== 'user' && cleanFirstName.length >= 2
            ? `${cleanFirstName}'s Team`
            : 'My Team';

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

    const invalidateTeamPurchase = async (teamId: string) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: collabQueryKeys.teams }),
            queryClient.invalidateQueries({ queryKey: collabQueryKeys.teamBilling(teamId) }),
            queryClient.invalidateQueries({ queryKey: ['subscription'] }),
            queryClient.invalidateQueries({ queryKey: ['ai-usage'] }),
        ]);
    };

    const runTeamCheckout = (orderData: any, teamId: string, teamName: string) =>
        new Promise<void>((resolve, reject) => {
            try {
                openRazorpayCheckout({
                    key: orderData.order.keyId,
                    amount: orderData.order.amount,
                    currency: orderData.order.currency,
                    name: 'Schema Weaver',
                    description: `Team plan — ${orderData.seatCount} seats`,
                    order_id: orderData.order.id,
                    prefill,
                    theme: { color: '#0f172a' },
                    onSuccess: async (response) => {
                        toast.loading('Verifying payment...', { id: 'team-verify' });
                        try {
                            await verifyTeamPayment({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            });
                            await invalidateTeamPurchase(teamId);
                            toast.success(
                                `${teamName} is live with ${orderData.seatCount} seats! Invite teammates from Collaboration → Billing.`,
                                { id: 'team-verify' },
                            );
                            resolve();
                        } catch (verifyErr: any) {
                            toast.error(verifyErr?.message || 'Verification failed', { id: 'team-verify' });
                            reject(verifyErr);
                        }
                    },
                    onFailure: (err) => {
                        toast.error(err?.message || 'Payment failed');
                        reject(err);
                    },
                    onDismiss: () => resolve(),
                });
            } catch (err: any) {
                reject(err);
            }
        });

    const handleBuyTeam = async () => {
        const seats = Number(teamSeatCount);
        if (!Number.isInteger(seats) || seats < TEAM_SEAT_MIN || seats > TEAM_SEAT_MAX) {
            toast.error(`Enter a whole number of seats between ${TEAM_SEAT_MIN} and ${TEAM_SEAT_MAX}.`);
            return;
        }
        setTeamBusy('order');
        try {
            let team = ownedTeam;
            if (!team) {
                const name = (teamName.trim() || defaultTeamName).slice(0, 60);
                setTeamBusy('create');
                const { team: created } = await createTeam({ name, intent: 'team_plan_purchase' });
                team = created;
            }
            const teamId = team!.id;

            setTeamBusy('order');
            const orderData = await createTeamSeatOrder(teamId, {
                planId: TEAM_PLAN_ID,
                seats,
                currency: 'INR',
                mode: 'purchase',
            });

            await runTeamCheckout(orderData, teamId, team!.name);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to initiate Team plan purchase');
        } finally {
            setTeamBusy(null);
        }
    };

    const handleAddTeamSeats = async () => {
        const delta = Number(teamSeatCount);
        const minSeats = teamSubActive ? 1 : TEAM_SEAT_MIN;
        if (!Number.isInteger(delta) || delta < minSeats || delta > TEAM_SEAT_MAX) {
            toast.error(`Enter a whole number of seats between ${minSeats} and ${TEAM_SEAT_MAX}.`);
            return;
        }
        if (!ownedTeam) return;
        setTeamBusy('add');
        try {
            const orderData = await createTeamSeatOrder(ownedTeam.id, {
                planId: TEAM_PLAN_ID,
                seats: delta,
                currency: 'INR',
                mode: 'add',
            });
            await runTeamCheckout(orderData, ownedTeam.id, ownedTeam.name);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to add seats');
        } finally {
            setTeamBusy(null);
        }
    };

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
                    <p className="text-sm text-muted-foreground">Manage subscription, billing history and invoices</p>
                </div>
            </div>

            {/* ── Current Plan Card ── */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3.5">
                        <PremiumAvatar
                            avatarUrl={avatarUrl}
                            initials={initials}
                            planId={currentPlanId}
                            isPremium={isPaid}
                            size="md"
                            shape="rounded"
                        />
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-base font-semibold text-foreground">
                                    {currentPlan?.name ?? 'Free Plan'}
                                </h4>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'text-2xs font-medium px-2 py-0.5 rounded-full',
                                        isPaid && (currentPlanId === 'team_monthly' || currentPlanId === 'pro_monthly')
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold shadow-sm'
                                            : statusBadge.className,
                                    )}
                                >
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
                                    onClick={() => setIsUpgradeModalOpen(true)}
                                >
                                    Change Plan
                                </Button>
                                <Button
                                    size="sm"
                                    variant="default"
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
                        <p className="text-2xs font-medium text-muted-foreground">Price</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                            {currentPlan && currentPlan.price_usd > 0 ? formatUSD(currentPlan.price_usd) : 'Free'}
                            {isPaid && <span className="text-xs font-normal text-muted-foreground">/mo</span>}
                        </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
                        <p className="text-2xs font-medium text-muted-foreground">Credits</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                            {formatCompact(currentPlan?.credit_limit_monthly ?? 0)}
                        </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
                        <p className="text-2xs font-medium text-muted-foreground">Concurrency</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                            {currentPlan?.concurrent_limit ?? 1} {currentPlan?.concurrent_limit === 1 ? 'agent' : 'agents'}
                        </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
                        <p className="text-2xs font-medium text-muted-foreground">Modes</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                            {formatModes(currentPlan?.allowed_modes)}
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
                            <TabsTrigger value="history" className="text-2xs px-2.5 h-6">
                                History ({payments.length})
                            </TabsTrigger>
                            <TabsTrigger value="invoices" className="text-2xs px-2.5 h-6">
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
                                            <TableHead className="h-8 px-4 text-2xs font-medium text-muted-foreground">Date</TableHead>
                                            <TableHead className="h-8 text-2xs font-medium text-muted-foreground">Plan</TableHead>
                                            <TableHead className="h-8 text-2xs font-medium text-muted-foreground">Amount</TableHead>
                                            <TableHead className="h-8 text-2xs font-medium text-muted-foreground">Method</TableHead>
                                            <TableHead className="h-8 text-2xs font-medium text-muted-foreground">Reference</TableHead>
                                            <TableHead className="h-8 px-4 text-right text-2xs font-medium text-muted-foreground">Status</TableHead>
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
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span>{allPlans.find((p) => p.id === payment.planId)?.name ?? RETIRED_PLAN_NAMES[payment.planId] ?? payment.planId}</span>
                                                            {payment.metadata?.team?.seatCount ? (
                                                                <Badge variant="secondary" className="px-1.5 py-0 h-4 text-2xs font-normal">
                                                                    {payment.metadata.team.seatCount} seats
                                                                </Badge>
                                                            ) : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-2.5 font-medium text-foreground">
                                                        {formatAmount(payment.amount, payment.currency)}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-muted-foreground">
                                                        {payment.paymentMethod ?? 'Online'}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 font-mono text-2xs text-muted-foreground">
                                                        {String(reference).slice(0, 14)}…
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Badge variant="outline" className={cn('gap-1 rounded-full px-2 py-0.5 text-2xs', meta.className)}>
                                                                <StatusIcon className="h-3 w-3" />
                                                                {meta.label}
                                                            </Badge>
                                                            {retryable && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="xs"
                                                                    className="text-muted-foreground hover:text-foreground"
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
                                            <TableHead className="h-8 px-4 text-2xs font-medium text-muted-foreground">Invoice #</TableHead>
                                            <TableHead className="h-8 text-2xs font-medium text-muted-foreground">Issued</TableHead>
                                            <TableHead className="h-8 text-2xs font-medium text-muted-foreground">Plan</TableHead>
                                            <TableHead className="h-8 px-4 text-right text-2xs font-medium text-muted-foreground">Amount</TableHead>
                                            <TableHead className="h-8 px-4 text-right text-2xs font-medium text-muted-foreground">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoices.map((inv) => (
                                            <TableRow key={inv.id} className="text-xs">
                                                <TableCell className="px-4 py-2.5 font-mono text-2xs font-medium text-foreground">
                                                    {inv.invoice_number}
                                                </TableCell>
                                                <TableCell className="py-2.5 text-muted-foreground">
                                                    {formatDate(inv.issued_at)}
                                                </TableCell>
                                                <TableCell className="py-2.5 text-muted-foreground">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span>{allPlans.find((p) => p.id === inv.plan_id)?.name ?? inv.plan_id}</span>
                                                        {inv.metadata?.seat_count ? (
                                                            <Badge variant="secondary" className="px-1.5 py-0 h-4 text-2xs font-normal">
                                                                {String(inv.metadata.seat_count)} seats
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-2.5 text-right font-medium text-foreground">
                                                    {formatMoneyFromPaise(inv.net_paise || inv.amount_paise)}
                                                    <Badge variant="outline" className="ml-2 rounded-full px-1.5 py-0 text-2xs capitalize">
                                                        {inv.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="px-4 py-2.5 text-right whitespace-nowrap">
                                                    <Button
                                                        variant="ghost"
                                                        size="xs"
                                                        className="gap-1.5"
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
                                                        size="xs"
                                                        className="gap-1.5"
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
                        <DialogDescription className="text-sm text-muted-foreground">
                            Pick the plan that fits your workflow. You can switch plans anytime from this page.
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
                                const isFeatured = plan.id === 'pro_monthly';
                                const PlanIcon = meta.icon;

                                return (
                                    <div
                                        key={plan.id}
                                        className={cn(
                                            'rounded-xl border bg-card p-5 flex flex-col justify-between transition-colors relative',
                                            isFeatured && 'ring-2 ring-primary/30 border-primary/40',
                                            isCurrent && !isFeatured && 'border-primary/40 ring-1 ring-primary/20 bg-primary/[0.02]',
                                            !isCurrent && !isFeatured && 'border-border hover:border-border/80',
                                        )}
                                    >
                                        {/* Blue corner slash (diagonal ribbon) on the Pro card */}
                                        {isFeatured && (
                                            <div
                                                className="absolute top-0 right-0 w-28 h-28 overflow-hidden pointer-events-none"
                                                aria-hidden="true"
                                            >
                                                <div className="absolute top-[18px] right-[-38px] w-[140px] rotate-45 bg-blue-600 text-center text-2xs font-semibold uppercase tracking-wider text-white py-1 shadow-md">
                                                    Popular
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-3.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn('flex h-7 w-7 items-center justify-center rounded-md border', meta.border, meta.bg)}>
                                                        <PlanIcon className={cn('h-3.5 w-3.5', meta.tone)} />
                                                    </div>
                                                    <h5 className="text-sm font-semibold text-foreground">{plan.name}</h5>
                                                </div>
                                                {isCurrent && (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            'text-2xs font-medium border-primary/30 text-primary bg-primary/5',
                                                            isFeatured && 'mr-12',
                                                        )}
                                                    >
                                                        Current
                                                    </Badge>
                                                )}
                                            </div>

                                            <div>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                                                        {plan.price_usd > 0 ? formatUSD(plan.price_usd) : 'Free'}
                                                    </span>
                                                    {plan.price_usd > 0 && (
                                                        <span className="text-xs text-muted-foreground">
                                                            /{plan.billing_interval === 'lifetime' ? 'lifetime' : 'month'}
                                                        </span>
                                                    )}
                                                </div>
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
                                                    <span>
                                                        <strong className="font-medium text-foreground">{formatModes(plan.allowed_modes)}</strong>{' '}
                                                        {(plan.allowed_modes?.length ?? 2) === 1 ? 'mode' : 'modes'}
                                                    </span>
                                                </div>
                                                {plan.features
                                                    .filter((feat) => {
                                                        const lower = feat.toLowerCase();
                                                        if (lower.includes('credit')) return false;
                                                        if (lower.includes('mode')) return false;
                                                        if (lower.includes('concurrent') || lower.includes('agent')) return false;
                                                        return true;
                                                    })
                                                    .slice(0, 2)
                                                    .map((feat) => (
                                                        <div key={feat} className="flex items-center gap-2 text-muted-foreground">
                                                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                            <span className="truncate">{feat}</span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>

                                        <Button
                                            size="sm"
                                            className="mt-4 w-full"
                                            variant={isCurrent ? 'outline' : 'default'}
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

                            {/* ─── Team / Enterprise card (always last) ─────── */}
                            <div className="sm:col-span-2 rounded-xl border border-border bg-card p-5">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                                            <Users className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h5 className="text-sm font-semibold text-foreground">Team Workspace</h5>
                                                {teamSubActive && (
                                                    <Badge variant="outline" className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-2xs font-medium">
                                                        ACTIVE
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                                                Collaborative workspace with shared project access and dedicated per-seat AI credits.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">{teamPricingKnown ? `$${seatPriceUsd}` : '$—'}</p>
                                        <p className="text-2xs text-muted-foreground">per seat / month</p>
                                    </div>
                                </div>

                                {isTeamMemberView ? (
                                    <div className="mt-4 space-y-2.5">
                                        <div className="flex items-start gap-2">
                                            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                            <div className="space-y-1">
                                                <p className="text-xs text-foreground">
                                                    You&apos;re a <span className="font-semibold">{memberTeam?.role === 'admin' ? 'team admin' : 'member'}</span> seat on{' '}
                                                    <span className="font-semibold">&quot;{memberTeam?.name}&quot;</span>.
                                                </p>
                                                <p className="text-2xs text-muted-foreground">
                                                    {teamSubActive
                                                        ? `${teamSeatOccupied} / ${teamSeatSeats} seats used — the workspace owner pays the seat bill for this team.`
                                                        : 'This workspace has no active team plan — ask the owner to set it up.'}
                                                </p>
                                            </div>
                                        </div>
                                        {onOpenCollaboration && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="gap-1 text-muted-foreground"
                                                onClick={onOpenCollaboration}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                                Manage in Collaboration
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        {/* Seat selector */}
                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                            <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/70 p-0.5">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 rounded-md px-0 cursor-pointer"
                                                    aria-label="Fewer seats"
                                                    disabled={teamSeatCount <= (teamSubActive ? 1 : TEAM_SEAT_MIN) || !!teamBusy}
                                                    onClick={() => setTeamSeatCount((c) => Math.max(teamSubActive ? 1 : TEAM_SEAT_MIN, c - 1))}
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </Button>
                                                <Input
                                                    type="number"
                                                    min={teamSubActive ? 1 : TEAM_SEAT_MIN}
                                                    max={TEAM_SEAT_MAX}
                                                    value={teamSeatCount}
                                                    onChange={(e) => setTeamSeatCount(Math.max(teamSubActive ? 1 : TEAM_SEAT_MIN, Number(e.target.value)))}
                                                    disabled={!!teamBusy}
                                                    className="h-7 w-16 rounded-md text-center text-sm font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                    aria-label="Number of seats"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 rounded-md px-0 cursor-pointer"
                                                    aria-label="More seats"
                                                    disabled={teamSeatCount >= TEAM_SEAT_MAX || !!teamBusy}
                                                    onClick={() => setTeamSeatCount((c) => Math.min(TEAM_SEAT_MAX, c + 1))}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>

                                            {!teamSubActive && (
                                                <>
                                                    <div className="flex flex-wrap gap-1">
                                                        {[2, 5, 10, 25].map((n) => (
                                                            <button
                                                                key={n}
                                                                type="button"
                                                                disabled={!!teamBusy}
                                                                onClick={() => setTeamSeatCount(n)}
                                                                className={cn(
                                                                    'rounded-md px-2 py-1 text-2xs font-medium transition-colors cursor-pointer',
                                                                    teamSeatCount === n
                                                                        ? 'bg-primary/15 text-primary'
                                                                        : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                                                                )}
                                                            >
                                                                {n} seats
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="ml-auto text-right">
                                                        <p className="text-sm font-semibold tracking-tight text-foreground">
                                                            {teamTotalUsd !== null ? `$${teamTotalUsd.toFixed(2)}` : '$—'}
                                                            <span className="text-2xs font-normal text-muted-foreground"> /mo</span>
                                                        </p>
                                                    </div>
                                                </>
                                            )}
                                            {teamSubActive && (
                                                <div className="ml-auto text-right">
                                                    <p className="text-sm font-semibold text-foreground">+{teamSeatCount} seat{teamSeatCount === 1 ? '' : 's'}</p>
                                                    <p className="text-2xs text-muted-foreground">prorated to this period — paid now</p>
                                                </div>
                                            )}
                                        </div>

                                        {!teamSubActive && (
                                            <div className="mt-4 pt-3.5 border-t border-border/50 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                                                {!ownedTeam && (
                                                    <div className="relative flex-1 min-w-[200px]">
                                                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                                                        <Input
                                                            value={teamName}
                                                            onChange={(e) => setTeamName(e.target.value)}
                                                            disabled={!!teamBusy}
                                                            placeholder={defaultTeamName}
                                                            className="h-8 pl-8 text-xs bg-background/80"
                                                            aria-label="Workspace name"
                                                        />
                                                    </div>
                                                )}
                                                <Button
                                                    size="sm"
                                                    className="shrink-0 gap-1.5 cursor-pointer"
                                                    onClick={handleBuyTeam}
                                                    disabled={!!teamBusy || !teamPricingKnown}
                                                >
                                                    {teamBusy === 'create' || teamBusy === 'order' ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Users className="h-3.5 w-3.5" />
                                                    )}
                                                    {teamBusy === 'create'
                                                        ? 'Creating workspace...'
                                                        : teamBusy === 'order'
                                                            ? 'Starting checkout...'
                                                            : ownedTeam
                                                                ? `Buy ${teamSeatCount} seats for ${ownedTeam.name}`
                                                                : `Create workspace & buy ${teamSeatCount} seats`}
                                                </Button>
                                            </div>
                                        )}

                                {teamSubActive && ownedTeam && (
                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <p className="text-xs text-foreground">
                                            <span className="font-semibold">{teamSeatOccupied}</span>
                                            <span className="text-muted-foreground"> / {teamSeatSeats} seats used</span>
                                            {teamSub?.cancelAtPeriodEnd && (
                                                <span className="ml-1.5 text-2xs text-amber-600 dark:text-amber-400">cancels at period end</span>
                                            )}
                                        </p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1"
                                            onClick={handleAddTeamSeats}
                                            disabled={!!teamBusy || !teamPricingKnown}
                                        >
                                            {teamBusy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                            Add {teamSeatCount} seat{teamSeatCount === 1 ? '' : 's'}
                                        </Button>
                                        {onOpenCollaboration && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="gap-1 text-muted-foreground"
                                                onClick={onOpenCollaboration}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                                Manage in Collaboration
                                            </Button>
                                        )}
                                    </div>
                                )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
