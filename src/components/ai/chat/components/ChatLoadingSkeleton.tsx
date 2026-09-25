// =============================================================================
// src/components/ai/chat/components/ChatLoadingSkeleton.tsx
// Shimmer skeleton loader displayed while conversation messages are loading
// =============================================================================

export function ChatLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-6 py-4 animate-in fade-in duration-200" aria-label="Loading chat conversation">
            {/* Simulated User Message Skeleton */}
            <div className="flex justify-end">
                <div className="h-10 w-48 sm:w-64 bg-muted/60 rounded-2xl animate-pulse" />
            </div>
            {/* Simulated Assistant Message Skeleton */}
            <div className="flex justify-start">
                <div className="flex flex-col gap-3 w-full max-w-xl">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-muted/70 animate-pulse" />
                        <div className="h-4 w-28 bg-muted/70 rounded-md animate-pulse" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-4 w-full bg-muted/60 rounded-md animate-pulse" />
                        <div className="h-4 w-5/6 bg-muted/50 rounded-md animate-pulse" />
                        <div className="h-4 w-2/3 bg-muted/50 rounded-md animate-pulse" />
                    </div>
                    {/* Simulated Artifact Box Skeleton */}
                    <div className="h-28 w-full bg-card/60 rounded-xl border border-border/40 p-4 flex flex-col gap-2.5 animate-pulse mt-1">
                        <div className="h-4 w-36 bg-muted/60 rounded" />
                        <div className="h-12 w-full bg-muted/30 rounded" />
                    </div>
                </div>
            </div>
        </div>
    );
}
