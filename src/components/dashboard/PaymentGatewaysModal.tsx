// =============================================================================
// Payment Gateways Management Modal
// Allows founders to view, connect, and disconnect Stripe / Razorpay gateways.
// =============================================================================

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePaymentConnections } from './hooks/usePaymentConnections';
import { StripeBrandIcon, RazorpayBrandIcon } from './GatewayIcons';

interface PaymentGatewaysModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentGatewaysModal({ open, onOpenChange }: PaymentGatewaysModalProps) {
  const {
    stripeConnection,
    razorpayConnection,
    connectingProvider,
    connectGateway,
    disconnectGateway,
    isDisconnecting,
  } = usePaymentConnections();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Payment Gateways
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Connect your gateway for live MRR, churn, ARR, and cash flow.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Stripe Card */}
          <div
            className={cn(
              'p-3 rounded-xl border transition-all flex flex-col justify-between',
              stripeConnection
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-border bg-card/60'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <StripeBrandIcon className="w-6 h-6" />
                <div>
                  <span className="font-semibold text-xs text-foreground block">Stripe Connect</span>
                  <span className="text-[11px] text-muted-foreground">Sync customer charges, subscriptions & revenue</span>
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between">
              {stripeConnection ? (
                <>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[200px]">
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
              'p-3 rounded-xl border transition-all flex flex-col justify-between',
              razorpayConnection
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-border bg-card/60'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <RazorpayBrandIcon className="w-6 h-6" />
                <div>
                  <span className="font-semibold text-xs text-foreground block">Razorpay Connect</span>
                  <span className="text-[11px] text-muted-foreground">Sync customer payments, subscriptions & revenue</span>
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between">
              {razorpayConnection ? (
                <>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[200px]">
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

          <div className="pt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground/80">
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>Zero raw transactions stored.</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
