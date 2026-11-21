// =============================================================================
// Dashboard Empty State — 4-Step Founder Briefing Onboarding
// Step 1: Product Database -> Step 2: Revenue Gateway -> Step 3: Who You Are -> Step 4: Cash & Runway.
// =============================================================================

import { useState } from 'react';
import {
  Loader2,
  Users,
  WifiOff,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePaymentConnections } from './hooks/usePaymentConnections';
import { StripeBrandIcon, RazorpayBrandIcon } from './GatewayIcons';
import {
  DatabaseEngineIcon,
  resolveDatabaseEngine,
  PostgresIcon,
  MysqlIcon,
  MongoIcon,
} from '@/components/connector/DatabaseEngineIcon';
import type { Connection } from '@/components/connector/api/connectionTypes';
import { StepCashAndRunway, type CashAndRunwayData } from './steps/StepCashAndRunway';

interface DashboardEmptyStateProps {
  displayName: string;
  databaseName?: string;
  connection?: Connection | null;
  databaseEngine?: string;
  onGenerate?: () => void;
  isGenerating?: boolean;
  hasConnection?: boolean;
  isOnline?: boolean;
  quotaError?: string | null;
  onOpenPlans?: () => void;
  onOpenConnectWizard?: () => void;
  onOpenConnector?: (tab?: 'overview' | 'connectors' | 'databases' | 'settings' | 'logs' | 'health' | 'connect') => void;
  /** 'owner' = this user owns the connection; 'team' = shared with them via a team. */
  accessType?: 'owner' | 'team';
}

export function DashboardEmptyState({
  displayName,
  databaseName,
  connection,
  databaseEngine,
  onGenerate,
  isGenerating = false,
  hasConnection = true,
  isOnline = true,
  quotaError = null,
  onOpenPlans,
  onOpenConnectWizard,
  onOpenConnector,
  accessType = 'owner',
}: DashboardEmptyStateProps) {
  // Clean up email/dot suffixes (e.g. "Vivek.ky" -> "Vivek")
  const cleanName = displayName.replace(/\.[a-zA-Z0-9_-]+/g, '').trim() || displayName;
  const dbLabel = databaseName?.trim() || connection?.database || connection?.name || 'database';
  const isTeamMember = accessType === 'team';

  // Resolve authentic database engine (PostgreSQL, MySQL, MongoDB, etc.)
  const resolvedEngine = databaseEngine
    ? (databaseEngine.toLowerCase() as any)
    : resolveDatabaseEngine(connection || { name: dbLabel, database: dbLabel });

  const engineLabel =
    resolvedEngine === 'mysql' || resolvedEngine === 'mariadb'
      ? 'read-only MySQL'
      : resolvedEngine === 'mongodb'
      ? 'read-only MongoDB'
      : 'read-only PostgreSQL';

  // Payment gateways integration hook
  const {
    stripeConnection,
    razorpayConnection,
    hasAnyPaymentConnection,
    connectingProvider,
    connectGateway,
    disconnectGateway,
    isDisconnecting,
  } = usePaymentConnections();

  const [isGatewaySkipped, setIsGatewaySkipped] = useState(false);
  const [_cashAndRunway, setCashAndRunway] = useState<CashAndRunwayData | null>(null);

  const handleAction = () => {
    if (!hasConnection) {
      if (onOpenConnectWizard) onOpenConnectWizard();
      return;
    }
    if (quotaError && onOpenPlans) {
      onOpenPlans();
      return;
    }
    if (!isOnline) {
      if (onOpenConnectWizard) onOpenConnectWizard();
      return;
    }
    if (onGenerate) onGenerate();
  };

  const connectedProviderNames: string[] = [];
  if (stripeConnection) connectedProviderNames.push('Stripe');
  if (razorpayConnection) connectedProviderNames.push('Razorpay');
  const connectedProvidersSummary = connectedProviderNames.join(' + ');

  return (
    <div className="flex flex-1 flex-col h-full overflow-y-auto bg-background">
      <div className="w-full max-w-4xl px-8 sm:px-12 pr-16 sm:pr-28 py-8 sm:py-9">
        {/* Header */}
        {isTeamMember ? (
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Team dashboard for {dbLabel} is on the way
            </h2>
            <p className="text-xs sm:text-[13px] text-muted-foreground mt-1">
              Shared workspace dashboard managed by your team connection owner.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl sm:text-[28px] lg:text-3xl font-semibold tracking-tight text-foreground leading-tight">
              Welcome {cleanName}, Let Me Get to Know Your Business
            </h2>
            <p className="text-sm sm:text-[15px] text-muted-foreground mt-1.5">
              Connect your data sources so I can review your product usage, revenue, and runway.
            </p>
          </div>
        )}

        {/* Team Member View */}
        {isTeamMember ? (
          <div className="mt-7 sm:mt-8 ml-4 pl-9">
            <div className="flex items-start gap-3 text-muted-foreground">
              <Users className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-[13.5px] sm:text-[14px] font-medium leading-relaxed">
                This database is shared with your team. The connection owner generates
                the AI dashboard once, and it is shared with everyone automatically —
                members can view it and refresh it free, without spending AI credits.
              </p>
            </div>
            <p className="text-[12.5px] text-muted-foreground/80 mt-3">
              As soon as the connection owner generates it, it will appear here for your whole team.
            </p>
          </div>
        ) : (
          /* Owner Stepped Onboarding Setup */
          <div className="relative mt-8 ml-4 pl-9 space-y-7 before:absolute before:left-3 before:top-2.5 before:bottom-2.5 before:w-[1.5px] before:bg-border/70">
            {/* ── Step 01: Product Database ── */}
            <div className="relative">
              <div
                className={cn(
                  'absolute -left-[37px] top-0 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-mono font-semibold shadow-sm shrink-0',
                  hasConnection && isOnline
                    ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border/90 bg-card text-foreground/80'
                )}
              >
                {hasConnection && isOnline ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : '01'}
              </div>

              <div>
                <h3 className="text-sm sm:text-[15px] font-semibold text-foreground">
                  Product Database
                </h3>
                <p className="text-xs sm:text-[13px] text-muted-foreground mt-0.5">
                  Pulls user activity, signups, and core tables to track product engagement.
                </p>

                {/* State: Not Connected */}
                {!hasConnection && (
                  <div className="mt-3 p-3 rounded-xl border border-border bg-card/60 flex items-center justify-between max-w-xl">
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <PostgresIcon className="w-4 h-4" />
                        <MysqlIcon className="w-4 h-4" />
                        <MongoIcon className="w-4 h-4" />
                      </div>
                      <span>No database connected. Connect PostgreSQL, MySQL, or MongoDB.</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => (onOpenConnector ? onOpenConnector('connect') : onOpenConnectWizard?.())}
                      className="h-7 text-xs font-medium"
                    >
                      Connect Database
                    </Button>
                  </div>
                )}

                {/* State: Connected but Offline */}
                {hasConnection && !isOnline && (
                  <div className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start justify-between gap-3 max-w-xl">
                    <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                      <WifiOff className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-foreground">Database connector is offline</p>
                        <p className="text-muted-foreground text-[11.5px] mt-0.5">
                          The connector for <strong>{dbLabel}</strong> is not running. Start your local daemon (<code>sw-agent start</code>) to generate dashboards.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => (onOpenConnector ? onOpenConnector('settings') : onOpenConnectWizard?.())}
                      className="h-7 text-xs shrink-0 border-amber-500/30 text-amber-900 dark:text-amber-200"
                    >
                      Connector Settings
                    </Button>
                  </div>
                )}

                {/* State: Connected & Online */}
                {hasConnection && isOnline && (
                  <div className="mt-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between max-w-xl">
                    <div className="flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      <DatabaseEngineIcon engine={resolvedEngine} className="w-4 h-4 shrink-0" />
                      <span>Connected & Online · <strong>{dbLabel}</strong> ({engineLabel} ready)</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => (onOpenConnector ? onOpenConnector('overview') : onOpenConnectWizard?.())}
                      className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2"
                    >
                      View
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Step 02: Revenue Gateway ── */}
            <div className="relative">
              <div
                className={cn(
                  'absolute -left-[37px] top-0 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-mono font-semibold shadow-sm shrink-0',
                  hasAnyPaymentConnection
                    ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : isGatewaySkipped
                    ? 'border-border/90 bg-muted/40 text-muted-foreground'
                    : 'border-border/90 bg-card text-foreground/80'
                )}
              >
                {hasAnyPaymentConnection ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : isGatewaySkipped ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  '02'
                )}
              </div>

              <div>
                <h3 className="text-sm sm:text-[15px] font-semibold text-foreground">
                  Revenue Gateway
                </h3>
                <p className="text-xs sm:text-[13px] text-muted-foreground mt-0.5">
                  Product metrics mean nothing if your bank balance is bleeding. We pull live MRR, silent churn, and failed charges.
                </p>

                {/* Gateway Cards Grid */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                  {/* Stripe Card */}
                  <div
                    className={cn(
                      'p-3.5 rounded-xl border transition-all flex flex-col justify-between',
                      stripeConnection
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-border bg-card/60 hover:border-border/80'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <StripeBrandIcon className="w-6 h-6" />
                          <span className="font-semibold text-xs text-foreground">Stripe Connect</span>
                        </div>
                      </div>
                      <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                        Sync customer charges, subscriptions, and revenue metrics.
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between">
                      {stripeConnection ? (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[170px]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{stripeConnection.accountId || 'Connected'}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => disconnectGateway('stripe')}
                            disabled={isDisconnecting}
                            className="h-6 text-[11px] text-muted-foreground hover:text-destructive px-2"
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => connectGateway('stripe')}
                          disabled={connectingProvider !== null}
                          className="w-full h-7 text-xs font-medium gap-1.5 shadow-sm"
                        >
                          {connectingProvider === 'stripe' ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Redirecting...</span>
                            </>
                          ) : (
                            <>
                              <span>Connect Stripe</span>
                              <ExternalLink className="w-3 h-3 text-muted-foreground" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Razorpay Card */}
                  <div
                    className={cn(
                      'p-3.5 rounded-xl border transition-all flex flex-col justify-between',
                      razorpayConnection
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-border bg-card/60 hover:border-border/80'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <RazorpayBrandIcon className="w-6 h-6" />
                          <span className="font-semibold text-xs text-foreground">Razorpay Connect</span>
                        </div>
                      </div>
                      <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                        Sync customer payments, subscriptions, and revenue metrics.
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between">
                      {razorpayConnection ? (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[170px]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{razorpayConnection.accountId || 'Connected'}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => disconnectGateway('razorpay')}
                            disabled={isDisconnecting}
                            className="h-6 text-[11px] text-muted-foreground hover:text-destructive px-2"
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => connectGateway('razorpay')}
                          disabled={connectingProvider !== null}
                          className="w-full h-7 text-xs font-medium gap-1.5 shadow-sm"
                        >
                          {connectingProvider === 'razorpay' ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Redirecting...</span>
                            </>
                          ) : (
                            <>
                              <span>Connect Razorpay</span>
                              <ExternalLink className="w-3 h-3 text-muted-foreground" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground/80 max-w-2xl">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>Zero raw transactions stored.</span>
                  </div>

                  {!hasAnyPaymentConnection && (
                    <div className="flex items-center gap-1 text-[11.5px]">
                      {isGatewaySkipped ? (
                        <>
                          <span className="text-muted-foreground">Pre-revenue skipped ·</span>
                          <button
                            type="button"
                            onClick={() => setIsGatewaySkipped(false)}
                            className="text-primary hover:underline font-medium cursor-pointer"
                          >
                            Connect instead
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-muted-foreground">Pre-revenue?</span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsGatewaySkipped(true);
                              const nextStep = document.getElementById('step-cash-and-runway');
                              nextStep?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }}
                            className="text-primary hover:underline font-medium cursor-pointer"
                          >
                            Skip
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Step 03: Cash & Runway (The Socratic Intake) ── */}
            <div id="step-cash-and-runway">
              <StepCashAndRunway
                onComplete={(data) => setCashAndRunway(data)}
                onGenerateBriefing={handleAction}
                isGenerating={isGenerating}
                hasConnection={hasConnection}
                isOnline={isOnline}
                quotaError={quotaError}
                dbLabel={dbLabel}
                connectedProvidersSummary={connectedProvidersSummary}
                hasAnyPaymentConnection={hasAnyPaymentConnection}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
