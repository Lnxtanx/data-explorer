import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface PremiumAvatarProps {
    avatarUrl?: string | null;
    initials?: string;
    planId?: string | null;
    isPremium?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    shape?: 'rounded' | 'circle';
    className?: string;
}

const SIZE_MAP = {
    sm: {
        container: 'h-6 w-6 p-[1.5px]',
        initials: 'text-[9px]',
        outerRounded: 'rounded-md',
        innerRounded: 'rounded-[4px]',
    },
    md: {
        container: 'h-11 w-11 p-[2px]',
        initials: 'text-xs font-semibold',
        outerRounded: 'rounded-xl',
        innerRounded: 'rounded-[10px]',
    },
    lg: {
        container: 'h-14 w-14 p-[2.5px]',
        initials: 'text-sm font-semibold',
        outerRounded: 'rounded-xl',
        innerRounded: 'rounded-[10px]',
    },
    xl: {
        container: 'h-20 w-20 p-[3px]',
        initials: 'text-xl font-bold',
        outerRounded: 'rounded-2xl',
        innerRounded: 'rounded-[14px]',
    },
};

export function PremiumAvatar({
    avatarUrl,
    initials = 'U',
    planId,
    isPremium: explicitPremium,
    size = 'md',
    shape = 'rounded',
    className,
}: PremiumAvatarProps) {
    const isPaidPlan =
        explicitPremium ??
        (planId === 'pro_monthly' || planId === 'team_monthly');

    const cfg = SIZE_MAP[size] || SIZE_MAP.md;
    const outerRounded = shape === 'circle' ? 'rounded-full' : cfg.outerRounded;
    const innerRounded = shape === 'circle' ? 'rounded-full' : cfg.innerRounded;

    if (!isPaidPlan) {
        return (
            <Avatar className={cn(cfg.container, 'p-0', outerRounded, 'border shadow-xs shrink-0', className)}>
                {avatarUrl ? (
                    <AvatarImage src={avatarUrl} className={cn('object-cover', innerRounded)} />
                ) : null}
                <AvatarFallback className={cn('bg-primary/10 text-primary font-semibold', cfg.initials, innerRounded)}>
                    {initials}
                </AvatarFallback>
            </Avatar>
        );
    }

    return (
        <div
            className={cn(
                'relative inline-flex items-center justify-center shrink-0 bg-gradient-to-tr from-amber-500 via-orange-500 to-orange-600 shadow-sm shadow-orange-500/25',
                cfg.container,
                outerRounded,
                className,
            )}
        >
            <Avatar className={cn('h-full w-full bg-background', innerRounded)}>
                {avatarUrl ? (
                    <AvatarImage src={avatarUrl} className={cn('object-cover', innerRounded)} />
                ) : null}
                <AvatarFallback className={cn('bg-primary/10 text-primary font-bold', cfg.initials, innerRounded)}>
                    {initials}
                </AvatarFallback>
            </Avatar>
        </div>
    );
}
