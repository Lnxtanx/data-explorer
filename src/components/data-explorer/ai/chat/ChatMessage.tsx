import React, { useState } from 'react';
import { Check, Copy, AtSign, FileText, Download, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownText } from '../messages/MarkdownText';
import { AgentStatusBar } from '../messages/AgentStatusBar';
import { PlanSteps } from '../messages/PlanSteps';
import { LiveToolSteps } from '../tools/LiveToolSteps';
import { ArtifactView } from '../artifacts/ArtifactView';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { TablePreview } from '../messages/TablePreview';
import type { AgentPhase, AgentStatus } from '@/hooks/useAIAgent';
import type { LocalMessage } from './types';
import type { AgentArtifact } from '@/hooks/useAIAgent';

interface DatasetCache {
    getCachedAt: (sql: string, connectionId: string) => number | null;
}

interface ChatMessageProps {
    msg: LocalMessage;
    agentMode: boolean;
    agentStatus: AgentStatus;
    phase: AgentPhase;
    phaseDetail: string;
    iterations: number;
    isStreaming: boolean;
    copiedId: string | null;
    connectionId?: string;
    datasetCache: DatasetCache;
    availableTables: string[];
    liveThinking?: string;
    expandedArtifact?: AgentArtifact | null;
    onCopy: (id: string, text: string) => void;
    onTableClick?: (tableName: string) => void;
    onExpand: (artifact: AgentArtifact) => void;
    onPin: (artifact: AgentArtifact) => void;
    isPinnedArtifact?: (artifact: AgentArtifact) => boolean;
    onQuickSend?: (message: string) => void;
}

function StreamingCursor() {
    return (
        <span className="inline-flex items-center gap-0.5 ml-1 align-text-bottom">
            <span className="w-1.5 h-1.5 bg-foreground/40 rounded-[1px] animate-pulse" style={{ animationDuration: '0.8s' }} />
            <span className="w-1.5 h-1.5 bg-foreground/40 rounded-[1px] animate-pulse" style={{ animationDuration: '0.8s', animationDelay: '200ms' }} />
        </span>
    );
}

export const ChatMessage = React.memo(function ChatMessage({
    msg, agentMode, agentStatus, phase, phaseDetail, iterations,
    isStreaming, copiedId, connectionId, datasetCache,
    availableTables, liveThinking, expandedArtifact, onCopy, onTableClick, onExpand, onPin, isPinnedArtifact, onQuickSend,
}: ChatMessageProps) {
    const isUser = msg.role === 'user';
    const [isUserExpanded, setIsUserExpanded] = useState(false);
    const userLineCount = isUser ? (msg.content || '').split('\n').length : 0;
    const isUserLong = isUser && ((msg.content || '').length > 240 || userLineCount > 4);

    return (
        <div 
            id={isUser ? `turn-${msg.id}` : undefined}
            data-turn-id={isUser ? msg.id : undefined}
            className={cn('flex w-full group scroll-mt-14', isUser ? 'justify-end' : 'justify-start')}
        >
            <div className={cn('relative flex flex-col gap-1.5 min-w-0',
                isUser ? 'items-end max-w-[85%] sm:max-w-[75%] lg:max-w-[68%]' : 'items-start w-full')}>

                {/* @table pill */}
                {msg.role === 'user' && msg.mentionedTable && (
                    availableTables?.includes(msg.mentionedTable) ? (
                        <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                                <button className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5 hover:text-foreground transition-colors">
                                    <AtSign className="w-2.5 h-2.5" />{msg.mentionedTable}
                                </button>
                            </HoverCardTrigger>
                            <HoverCardContent 
                                className="w-[320px] p-4 bg-background/95 backdrop-blur-md border-border/60 shadow-2xl z-[100] rounded-xl text-left"
                                align="end"
                                side="bottom"
                                sideOffset={8}
                            >
                                {connectionId ? (
                                    <TablePreview tableName={msg.mentionedTable} connectionId={connectionId} />
                                ) : (
                                    <div className="text-xs text-muted-foreground p-2 text-center">
                                        <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p>Select a database to see table preview</p>
                                    </div>
                                )}
                            </HoverCardContent>
                        </HoverCard>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
                            <AtSign className="w-2.5 h-2.5" />{msg.mentionedTable}
                        </span>
                    )
                )}

                {/* Teammate author label in shared threads */}
                {msg.role === 'user' && msg.isMine === false && (msg.authorName || msg.authorEmail) && (
                    <span className="text-[11px] text-muted-foreground mb-0.5">
                        by {msg.authorName || msg.authorEmail}
                    </span>
                )}

                {/* User bubble */}
                {msg.role === 'user' && (
                    <div className="flex flex-col items-end w-full">
                        <div
                            className={cn(
                                "bg-muted/60 text-foreground px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed break-words [overflow-wrap:anywhere] relative w-full transition-all duration-200",
                                !isUserExpanded && isUserLong && "max-h-28 overflow-hidden select-none cursor-pointer hover:bg-muted/70"
                            )}
                            onClick={() => {
                                if (!isUserExpanded && isUserLong) setIsUserExpanded(true);
                            }}
                            title={!isUserExpanded && isUserLong ? "Click to expand message" : undefined}
                        >
                            {/* Attachments (from artifacts or local files list) */}
                            {((msg.artifacts?.filter(a => (a as any).type === 'attachment') ?? []).length > 0 || (msg.files && msg.files.length > 0)) && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {msg.artifacts?.filter(a => (a as any).type === 'attachment').map((att: any, i: number) => (
                                        <div key={i} className="flex items-center gap-2 bg-background/80 border border-border/60 rounded-lg px-2.5 py-1.5 text-xs shadow-xs">
                                            <FileText className="w-3.5 h-3.5 text-primary" />
                                            <div className="flex flex-col text-left">
                                                <span className="font-medium text-foreground truncate max-w-[140px]">{att.filename || 'Attachment'}</span>
                                                {att.size_bytes && <span className="text-[10px] text-muted-foreground">{(att.size_bytes / 1024).toFixed(0)} KB</span>}
                                            </div>
                                            {att.download_url && (
                                                <a
                                                    href={att.download_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    download={att.filename}
                                                    className="ml-1 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                                    title="Download file"
                                                >
                                                    <Download className="w-3 h-3" />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                    {!msg.artifacts?.some(a => (a as any).type === 'attachment') && msg.files?.map((f, i) => (
                                        <span key={i} className="flex items-center gap-1.5 bg-background/50 border border-border/50 rounded-lg px-2 py-1 text-xs">
                                            <FileText className="w-3 h-3 text-muted-foreground" />{f}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className={cn(isUserExpanded && isUserLong && "max-h-[380px] overflow-y-auto pr-1")}>
                                <MarkdownText text={msg.content} onTableClick={onTableClick} connectionId={connectionId} availableTables={availableTables} />
                            </div>

                            {/* Fade gradient when collapsed */}
                            {!isUserExpanded && isUserLong && (
                                <div className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-muted/90 via-muted/60 to-transparent rounded-b-2xl" />
                            )}
                        </div>

                        {/* Expand / Collapse toggle button */}
                        {isUserLong && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsUserExpanded((prev) => !prev);
                                }}
                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors px-1 py-0.5 rounded cursor-pointer"
                            >
                                {isUserExpanded ? (
                                    <>
                                        <ChevronUp className="w-3 h-3" />
                                        <span>Show less</span>
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown className="w-3 h-3" />
                                        <span>Show more ({userLineCount > 1 ? `${userLineCount} lines` : `${msg.content.length} chars`})</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}

                {/* Assistant response */}
                {msg.role === 'assistant' && (
                    <div className="flex flex-col gap-2 w-full">
                        {/* Agent status bar — live phase display */}
                        {msg.isStreaming && isStreaming && agentMode && (
                            <AgentStatusBar
                                phase={phase === 'idle' || phase === 'done' ? 'planning' : phase}
                                phaseDetail={phaseDetail}
                                toolSteps={msg.toolSteps ?? []}
                                iteration={iterations ?? 0}
                                isLive={agentStatus === 'running'}
                                liveThinking={liveThinking}
                            />
                        )}

                        {/* Plan steps */}
                        {msg.planSteps && msg.planSteps.length > 0 && (
                            <PlanSteps
                                steps={msg.planSteps}
                                isLive={!!msg.isStreaming && isStreaming && agentStatus === 'running'}
                            />
                        )}

                        {/* Tool steps */}
                        {msg.toolSteps && msg.toolSteps.length > 0 && (
                            <LiveToolSteps
                                steps={msg.toolSteps}
                                isLive={!!msg.isStreaming && isStreaming && agentStatus === 'running'}
                                defaultExpanded={false}
                            />
                        )}

                        {/* Text content */}
                        {(msg.content || (msg.isStreaming && isStreaming && agentMode)) && (
                            <div className="text-[15px] text-foreground leading-relaxed">
                                {msg.content ? (
                                    <>
                                        <MarkdownText
                                            text={msg.content}
                                            onTableClick={onTableClick}
                                            connectionId={connectionId}
                                            availableTables={availableTables}
                                        />
                                        {msg.isStreaming && isStreaming && <StreamingCursor />}
                                    </>
                                ) : (
                                    msg.isStreaming && isStreaming && <StreamingCursor />
                                )}
                            </div>
                        )}

                        {/* Artifacts (rendered after the narrative explanation) */}
                        {msg.artifacts && msg.artifacts.map((artifact, idx) => {
                            const isArtExpanded = Boolean(
                                expandedArtifact && (
                                    expandedArtifact === artifact ||
                                    (artifact.key && expandedArtifact.key === artifact.key) ||
                                    (artifact.downloadUrl && expandedArtifact.downloadUrl === artifact.downloadUrl) ||
                                    (artifact.id && expandedArtifact.id === artifact.id) ||
                                    (artifact.fileName && expandedArtifact.fileName === artifact.fileName)
                                )
                            );
                            return (
                                <ArtifactView
                                    key={idx}
                                    artifact={artifact}
                                    connectionId={connectionId}
                                    onExpand={onExpand}
                                    onPin={onPin}
                                    isPinned={isPinnedArtifact?.(artifact)}
                                    onQuickSend={onQuickSend}
                                    cachedAt={artifact.sql && connectionId ? datasetCache.getCachedAt(artifact.sql, connectionId) : null}
                                    isExpanded={isArtExpanded}
                                />
                            );
                        })}

                        {/* Credits used footer */}
                        {!msg.isStreaming && msg.creditsUsed != null && msg.creditsUsed > 0 && (
                            <div className="mt-1 text-[11px] text-muted-foreground/75 font-mono">
                                {msg.creditsUsed} credit{msg.creditsUsed !== 1 ? 's' : ''} used
                            </div>
                        )}
                    </div>
                )}

                {/* Copy button */}
                {!msg.isStreaming && msg.content && (
                    <div className={cn('flex opacity-0 group-hover:opacity-100 transition-opacity mt-0.5',
                        msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <button
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/75 hover:text-foreground transition-colors px-1 py-0.5 rounded cursor-pointer"
                            onClick={() => onCopy(msg.id, msg.content)}>
                            {copiedId === msg.id
                                ? <Check className="h-3 w-3 text-green-500" />
                                : <Copy className="h-3 w-3" />}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});
