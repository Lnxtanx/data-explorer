import { cn } from '@/lib/utils';

export function PostgresBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <img
      src="/postgresql.svg"
      alt="PostgreSQL"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

export function MysqlBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <img
      src="/mysql.svg"
      alt="MySQL"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

export function MongoBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <img
      src="/mongodb.svg"
      alt="MongoDB"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

export function StripeBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <img
      src="/stripe.svg"
      alt="Stripe"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

export function RazorpayBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <img
      src="/razorpay.svg"
      alt="Razorpay"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}
