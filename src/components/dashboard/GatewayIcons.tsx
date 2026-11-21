import React from 'react';
import { cn } from '@/lib/utils';

export interface BrandIconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  size?: number | string;
}

/**
 * Official Stripe Brand Icon
 * Loads the authentic Stripe vector logo from /stripe.svg
 */
export function StripeBrandIcon({ className = 'w-5 h-5', alt = 'Stripe', ...props }: BrandIconProps) {
  return (
    <img
      src="/stripe.svg"
      alt={alt}
      className={cn('shrink-0 object-contain', className)}
      {...props}
    />
  );
}

/**
 * Official Razorpay Brand Icon
 * Loads the authentic Razorpay vector logo from /razorpay.svg
 */
export function RazorpayBrandIcon({ className = 'w-5 h-5', alt = 'Razorpay', ...props }: BrandIconProps) {
  return (
    <img
      src="/razorpay.svg"
      alt={alt}
      className={cn('shrink-0 object-contain', className)}
      {...props}
    />
  );
}
