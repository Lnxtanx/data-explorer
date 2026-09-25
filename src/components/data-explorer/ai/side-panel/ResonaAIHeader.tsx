// =============================================================================
// Resona AI Side Panel — Header
// Clean top bar with official brand logo, context pill, window controls,
// and Google Gemini style ⋮ dropdown menu for dashboard session history & switching.
// Dedicated exclusively to Dashboard AI.
// =============================================================================

import React, { useState, useMemo } from 'react';
import {
  Maximize2,
  X,
  Plus,
  MoreVertical,
  ExternalLink,
  Check,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionTooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import { type SessionHistoryItem } from './ResonaAISessionHistory';
import { cn } from '@/lib/utils';

interface ResonaAIHeaderProps {
  databaseName?: string;
  onClose: () => void;
  onExpandFullScreen?: () => void;
  onNewChat?: () => void;
  sessions?: SessionHistoryItem[];
  onSelectSession?: (id: string) => void;
  onDeleteSession?: (id: string) => Promise<void> | void;
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-emerald-500',
  running: 'bg-sky-500 animate-pulse',
  failed: 'bg-rose-500',
  cancelled: 'bg-amber-500',
  queued: 'bg-muted-foreground/50',
  pending: 'bg-muted-foreground/50',
};

/** Compact single-line time: "2:09 PM" today, "Sep 22" otherwise. */
function formatShortTime(ts?: number | string | null): string {
  if (!ts) return '';
  try {
    const ms = typeof ts === 'number' ? (ts > 1e11 ? ts : ts * 1000) : new Date(ts).getTime();
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ResonaAIHeader({
  onClose,
  onExpandFullScreen,
  onNewChat,
  sessions = [],
  onSelectSession,
  onDeleteSession,
}: ResonaAIHeaderProps) {
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [pendingDeleteSession, setPendingDeleteSession] = useState<SessionHistoryItem | null>(null);
  const headerTitle = 'Resona Dashboard AI';

  const visibleSessions = useMemo(() => {
    if (!dropdownSearch.trim()) return sessions;
    const q = dropdownSearch.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, dropdownSearch]);


  return (
    <div className="flex items-center justify-between h-10 px-3.5 border-b border-border bg-card shrink-0 select-none">
      {/* Brand Logo & Name */}
      <div className="flex items-center gap-2 min-w-0">
        <img
          src="/resona.png"
          alt={headerTitle}
          className="w-4 h-4 rounded-sm shrink-0 object-contain"
        />
        <span className="text-sm font-semibold text-foreground tracking-tight shrink-0">
          {headerTitle}
        </span>
      </div>

      {/* Actions: New Chat, Maximize, Gemini-style ⋮ Menu, Close */}
      <div className="flex items-center gap-0.5 shrink-0">
        {onNewChat && (
          <ActionTooltip label="New Session" side="bottom">
            <Button
              variant="ghost"
              size="icon"
              onClick={onNewChat}
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
              aria-label="New session"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </ActionTooltip>
        )}

        {onExpandFullScreen && (
          <ActionTooltip label="Full Screen Chat" side="bottom">
            <Button
              variant="ghost"
              size="icon"
              onClick={onExpandFullScreen}
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
              aria-label="Expand to full screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </ActionTooltip>
        )}

        {/* Gemini-style ⋮ Dropdown Menu */}
        <DropdownMenu>
          <ActionTooltip label="Options & History" side="bottom">
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer"
                aria-label="Options and session history"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </ActionTooltip>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="w-72 sm:w-80 p-1.5 rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-xl text-popover-foreground z-50 select-none"
          >
            {/* 1. Pop-out chat */}
            {onExpandFullScreen && (
              <DropdownMenuItem
                onClick={onExpandFullScreen}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal cursor-pointer rounded-lg hover:bg-accent focus:bg-accent text-foreground/90"
              >
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span>Pop-out chat</span>
              </DropdownMenuItem>
            )}

            {onExpandFullScreen && <DropdownMenuSeparator className="my-1 bg-border/60" />}

            {/* 2. Recent Sessions Header */}
            <div className="px-2.5 pt-1.5 pb-1 flex items-center justify-between">
              <span className="text-2xs font-medium text-muted-foreground">Recent Sessions</span>
              {sessions.length > 0 && (
                <span className="text-2xs font-mono text-muted-foreground/70">
                  {sessions.length}
                </span>
              )}
            </div>

            {/* 3. Inline Search filter if there are more than 4 sessions */}
            {sessions.length > 4 && (
              <div
                className="px-2 pb-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 absolute left-2.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter sessions…"
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-full text-2xs pl-7 pr-2 py-1 rounded-md border border-border/70 bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {/* 4. Scrollable Session Items List — single-line rows */}
            {visibleSessions.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-muted-foreground italic">
                {dropdownSearch ? 'No matching sessions' : 'No previous sessions yet'}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 max-h-64 sm:max-h-72 overflow-y-auto pr-0.5">
                {visibleSessions.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => onSelectSession?.(item.id)}
                    title={`${item.title}${item.status ? ` — ${item.status}` : ''}`}
                    className={cn(
                      'group flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-left',
                      item.isActive
                        ? 'bg-accent font-medium text-foreground'
                        : 'hover:bg-accent/60 text-foreground/90'
                    )}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        STATUS_DOT[item.status || ''] || 'bg-muted-foreground/50'
                      )}
                    />
                    <span className="flex-1 min-w-0 truncate text-xs leading-tight">
                      {item.title}
                    </span>
                    <span className="text-2xs text-muted-foreground/70 shrink-0 tabular-nums whitespace-nowrap">
                      {formatShortTime(item.createdAt)}
                    </span>
                    {item.isActive && (
                      <Check className="w-3 h-3 text-primary shrink-0 group-hover:hidden" />
                    )}
                    {onDeleteSession && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setPendingDeleteSession(item);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all shrink-0 cursor-pointer"
                        title="Delete session"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            )}

            <DropdownMenuSeparator className="my-1 bg-border/60" />

            {/* 5. New Session */}
            {onNewChat && (
              <DropdownMenuItem
                onClick={onNewChat}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-primary cursor-pointer rounded-lg hover:bg-primary/10 focus:bg-primary/10"
              >
                <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>New Session</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ActionTooltip label="Close Panel" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
            aria-label="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </ActionTooltip>
      </div>

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
                  onNewChat?.();
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-7 font-medium"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
