// =============================================================================
// Resona AI Side Panel — Session History Modal Dialog
// Google Gemini style modal dialog for viewing, searching, and switching
// between durable AI conversation sessions and dashboard generation runs.
// =============================================================================

import React, { useState, useMemo } from 'react';
import { History, Search, Plus, Check, Clock, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SessionHistoryItem {
  id: string;
  sessionId?: string;
  title: string;
  status?: string;
  createdAt?: number | string | null;
  turnCount?: number;
  isActive?: boolean;
}

export interface ResonaAISessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SessionHistoryItem[];
  onSelect: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (id: string) => Promise<void> | void;
  title?: string;
  description?: string;
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; badge: string }> = {
  completed: {
    dot: 'bg-emerald-500',
    label: 'Completed',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  running: {
    dot: 'bg-sky-500 animate-pulse',
    label: 'In Progress',
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
  failed: {
    dot: 'bg-rose-500',
    label: 'Failed',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  cancelled: {
    dot: 'bg-amber-500',
    label: 'Cancelled',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  queued: {
    dot: 'bg-muted-foreground/50',
    label: 'Queued',
    badge: 'bg-muted text-muted-foreground border-border',
  },
  pending: {
    dot: 'bg-muted-foreground/50',
    label: 'New chat',
    badge: 'bg-muted text-muted-foreground border-border',
  },
};

export function formatSessionTime(ts?: number | string | null): string {
  if (!ts) return '';
  const ms = typeof ts === 'number' ? (ts > 1e11 ? ts : ts * 1000) : new Date(ts).getTime();
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ResonaAISessionDialog({
  isOpen,
  onClose,
  sessions,
  onSelect,
  onNewSession,
  onDeleteSession,
  title = 'Session History',
  description = 'Switch to a previous conversation or review historical analytics runs.',
}: ResonaAISessionDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeleteSession, setPendingDeleteSession] = useState<SessionHistoryItem | null>(null);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.status && s.status.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden rounded-xl border border-border/80 shadow-2xl bg-card">
        {/* Header */}
        <div className="p-4 pb-3 border-b border-border/70 bg-muted/20">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <span>{title}</span>
              <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Search Bar with proper left padding */}
        <div className="p-3 border-b border-border/50 bg-background/50">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search past sessions by prompt or status…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
        </div>

        {/* Sessions List */}
        <ScrollArea className="max-h-[340px] min-h-[140px] p-3">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {searchQuery ? 'No sessions match your search.' : 'No sessions recorded yet.'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((item) => {
                const conf = item.status ? STATUS_CONFIG[item.status] : undefined;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'group w-full text-left p-2.5 rounded-lg border transition-all flex items-start gap-2.5 select-none relative',
                      item.isActive
                        ? 'border-primary/70 bg-primary/5 shadow-sm'
                        : 'border-border/60 hover:border-border hover:bg-muted/40'
                    )}
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => {
                        onSelect(item.id);
                        onClose();
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-relaxed">
                          {item.title}
                        </p>
                        {item.isActive && (
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" />
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                        {conf && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium',
                              conf.badge
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', conf.dot)} />
                            {conf.label}
                          </span>
                        )}
                        {item.createdAt && (
                          <span className="flex items-center gap-1 text-muted-foreground/80">
                            <Clock className="w-3 h-3" />
                            {formatSessionTime(item.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {onDeleteSession && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteSession(item);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all shrink-0 self-center cursor-pointer"
                        title="Delete session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 px-4 border-t border-border/70 bg-muted/20 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="text-xs h-7 gap-1.5 cursor-pointer text-primary hover:text-primary hover:bg-primary/5 border-primary/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Session</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs h-7 cursor-pointer"
          >
            Close
          </Button>
        </div>
      </DialogContent>

      {/* Delete Session Confirmation Dialog */}
      <AlertDialog
        open={Boolean(pendingDeleteSession)}
        onOpenChange={(open) => !open && setPendingDeleteSession(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">Delete Session</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete this session? It will be removed from your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 mt-2">
            <AlertDialogCancel className="text-xs h-7">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDeleteSession) return;
                const targetId = pendingDeleteSession.id;
                const wasActive = pendingDeleteSession.isActive;
                setPendingDeleteSession(null);
                await onDeleteSession?.(targetId);
                if (wasActive) {
                  onNewSession?.();
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-7 font-medium"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// Backward-compatibility export:
export const ResonaAISessionHistory = ResonaAISessionDialog;