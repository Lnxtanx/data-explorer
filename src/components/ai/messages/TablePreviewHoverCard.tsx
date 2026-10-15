/**
 * TablePreviewHoverCard
 *
 * Responsive table-preview card for `@table` mentions. Wraps Radix HoverCard,
 * which is hover/focus-only by design (its trigger excludes touch and calls
 * preventDefault on touchstart), so on touch devices we drive the open state
 * ourselves and toggle it on tap. Mouse behaviour is unchanged.
 */

import { useState, type ReactNode } from 'react';
import { Database } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { TablePreview } from './TablePreview';

interface TablePreviewHoverCardProps {
    tableName: string;
    connectionId?: string | null;
    trigger: ReactNode;
    align?: 'start' | 'center' | 'end';
    side?: 'top' | 'bottom' | 'left' | 'right';
    sideOffset?: number;
    contentClassName?: string;
}

export function TablePreviewHoverCard({
    tableName,
    connectionId,
    trigger,
    align = 'start',
    side = 'top',
    sideOffset = 12,
    contentClassName,
}: TablePreviewHoverCardProps) {
    const [open, setOpen] = useState(false);

    return (
        <HoverCard open={open} onOpenChange={setOpen} openDelay={200} closeDelay={100}>
            <HoverCardTrigger
                asChild
                onPointerDown={(e) => {
                    // Keyboard/ mouse pointers keep the default hover/focus flow;
                    // touch pointers toggle the card since Radix suppresses it.
                    if (e.pointerType !== 'mouse') setOpen((prev) => !prev);
                }}
            >
                {trigger}
            </HoverCardTrigger>
            <HoverCardContent
                className={cn(
                    'w-[min(320px,calc(100vw_-_1rem))] p-4 bg-background/95 backdrop-blur-md border-border/60 shadow-2xl z-[100] rounded-xl text-left',
                    contentClassName,
                )}
                align={align}
                side={side}
                sideOffset={sideOffset}
            >
                {connectionId ? (
                    <TablePreview tableName={tableName} connectionId={connectionId} />
                ) : (
                    <div className="text-xs text-muted-foreground p-2 text-center">
                        <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p>Select a database to see table preview</p>
                    </div>
                )}
            </HoverCardContent>
        </HoverCard>
    );
}
