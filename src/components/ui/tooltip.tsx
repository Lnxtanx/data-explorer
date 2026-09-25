import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export interface ActionTooltipProps {
  label: React.ReactNode;
  sublabel?: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  delayDuration?: number;
  disabled?: boolean;
  children: React.ReactNode;
  asChild?: boolean;
}

export function ActionTooltip({
  label,
  sublabel,
  shortcut,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  delayDuration = 150,
  disabled = false,
  children,
  asChild = true,
}: ActionTooltipProps) {
  if (disabled || !label) {
    return <>{children}</>;
  }

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="px-2.5 py-1.5 text-xs bg-popover/95 backdrop-blur-md border border-border shadow-lg rounded-lg max-w-xs z-50 select-none animate-in fade-in-0 zoom-in-95 pointer-events-none"
      >
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <span>{label}</span>
          {shortcut && (
            <kbd className="px-1 py-0.5 text-[10px] font-mono font-medium text-muted-foreground bg-muted border border-border/60 rounded">
              {shortcut}
            </kbd>
          )}
        </div>
        {sublabel && (
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            {sublabel}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
