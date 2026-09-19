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
  AlignLeft,
  ExternalLink,
  Check,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  type SessionHistoryItem,
  formatSessionTime,
} from './ResonaAISessionHistory';
import { cn } from '@/lib/utils';

interface ResonaAIHeaderProps {
  databaseName?: string;
  onClose: () => void;
  onExpandFullScreen?: () => void;
  onNewChat?: () => void;
  sessions?: SessionHistoryItem[];
  onSelectSession?: (id: string) => void;
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-emerald-500',
  running: 'bg-sky-500 animate-pulse',
  failed: 'bg-rose-500',
  cancelled: 'bg-amber-500',
  queued: 'bg-muted-foreground/50',
};

export function ResonaAIHeader({
  databaseName,
  onClose,
  onExpandFullScreen,
  onNewChat,
  sessions = [],
  onSelectSession,
}: ResonaAIHeaderProps) {
  const [dropdownSearch, setDropdownSearch] = useState('');
  const headerTitle = 'Dashboard AI';
  const contextLabel = `${databaseName || 'Database'} • Dashboard`;

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
          className="w-4 h-4 rounded-xs shrink-0 object-contain"
        />
        <span className="text-xs font-semibold text-foreground tracking-tight shrink-0">
          {headerTitle}
        </span>

        {/* Active Context Chip */}
        {databaseName && (
          <span className="truncate max-w-[150px] text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/80 bg-muted/40 text-muted-foreground">
            {contextLabel}
          </span>
        )}
      </div>

      {/* Actions: New Chat, Maximize, Gemini-style ⋮ Menu, Close */}
      <div className="flex items-center gap-0.5 shrink-0">
        {onNewChat && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
            title="New Session"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        )}

        {onExpandFullScreen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onExpandFullScreen}
            className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
            title="Expand to Full Screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
        )}

        {/* Gemini-style ⋮ Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer"
              title="Options & History"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
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
            <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Recent Sessions</span>
              {sessions.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground">
                  {sessions.length}
                </span>
              )}
            </div>

            {/* 3. Inline Search filter if there are more than 4 sessions */}
            {sessions.length > 4 && (
              <div
                className="px-2 py-1 mb-1"
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
                    className="w-full text-[11px] pl-7 pr-2 py-1 rounded-md border border-border/70 bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {/* 4. Scrollable Session Items List */}
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
                    className={cn(
                      'flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-left',
                      item.isActive
                        ? 'bg-accent font-medium text-foreground'
                        : 'hover:bg-accent/60 text-foreground/90'
                    )}
                  >
                    <AlignLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate leading-snug">{item.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                        {item.status && (
                          <span className="flex items-center gap-1">
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                STATUS_DOT[item.status] || 'bg-muted-foreground/50'
                              )}
                            />
                            <span className="capitalize">{item.status}</span>
                          </span>
                        )}
                        {item.status && item.createdAt && <span>•</span>}
                        {item.createdAt && <span>{formatSessionTime(item.createdAt)}</span>}
                      </div>
                    </div>
                    {item.isActive && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 self-center ml-auto" />
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

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
          title="Close Panel"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
