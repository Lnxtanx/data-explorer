import { Check, Copy, AtSign, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownText } from '../messages/MarkdownText';
import { InlineSqlBlock } from '../messages/InlineSqlBlock';
import { AgentStatusBar } from '../messages/AgentStatusBar';
import { PlanSteps } from '../messages/PlanSteps';
import { LiveToolSteps } from '../tools/LiveToolSteps';
import { ArtifactView } from '../artifacts/ArtifactView';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Database } from 'lucide-react';
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
    liveModel: string | null;
    isStreaming: boolean;
    copiedId: string | null;
    connectionId?: string;
    datasetCache: DatasetCache;
    availableTables: string[];
    thinkingText?: string;
    liveThinking?: string;
    onCopy: (id: string, text: string) => void;
    onTableClick?: (tableName: string) => void;
    onExpand: (artifact: AgentArtifact) => void;
    onPin: (artifact: AgentArtifact) => void;
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

export function ChatMessage({
    msg, agentMode, agentStatus, phase, phaseDetail, iterations,
    liveModel, isStreaming, copiedId, connectionId, datasetCache,
    availableTables, thinkingText = '', liveThinking, onCopy, onTableClick, onExpand, onPin, onQuickSend,
}: ChatMessageProps) {
    return (
        <div className={cn('flex w-full group', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('relative flex flex-col gap-1.5 min-w-0',
                msg.role === 'user' ? 'items-end max-w-[72%]' : 'items-start w-full')}>

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

                {/* User bubble */}
                {msg.role === 'user' && (
                    <div className="bg-muted/60 text-foreground px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed">
                        {msg.files && msg.files.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {msg.files.map((f, i) => (
                                    <span key={i} className="flex items-center gap-1.5 bg-background/50 border border-border/50 rounded-lg px-2 py-1 text-xs">
                                        <FileText className="w-3 h-3 text-muted-foreground" />{f}
                                    </span>
                                ))}
                            </div>
                        )}
                        <MarkdownText text={msg.content} onTableClick={onTableClick} connectionId={connectionId} availableTables={availableTables} />
                    </div>
                )}

                {/* Assistant response */}
                {msg.role === 'assistant' && (
                    <div className="flex flex-col gap-2 w-full">
                        {/* Agent status bar — live phase display */}
                        {msg.isStreaming && agentMode && (
                            <AgentStatusBar
                                phase={phase === 'idle' || phase === 'done' ? 'planning' : phase}
                                phaseDetail={phaseDetail}
                                toolSteps={msg.toolSteps ?? []}
                                iteration={iterations ?? 0}
                                isLive={agentStatus === 'running'}
                                model={liveModel}
                                liveThinking={liveThinking}
                            />
                        )}

                        {/* Plan steps */}
                        {msg.planSteps && msg.planSteps.length > 0 && (
                            <PlanSteps
                                steps={msg.planSteps}
                                isLive={!!msg.isStreaming && agentStatus === 'running'}
                            />
                        )}

                        {/* Tool steps */}
                        {msg.toolSteps && msg.toolSteps.length > 0 && (
                            <LiveToolSteps
                                steps={msg.toolSteps}
                                isLive={!!msg.isStreaming && agentStatus === 'running'}
                                defaultExpanded={false}
                            />
                        )}

                        {/* Artifacts */}
                        {msg.artifacts && msg.artifacts.map((artifact, idx) => (
                            <ArtifactView
                                key={idx}
                                artifact={artifact}
                                connectionId={connectionId}
                                onExpand={onExpand}
                                onPin={onPin}
                                onQuickSend={onQuickSend}
                                cachedAt={artifact.sql && connectionId ? datasetCache.getCachedAt(artifact.sql, connectionId) : null}
                            />
                        ))}

                        {/* Text content */}
                        {(msg.content || (msg.isStreaming && agentMode)) && (
                            <div className="text-[15px] text-foreground leading-relaxed">
                                {msg.content ? (
                                    <>
                                        <MarkdownText
                                            text={
                                                // Strip markdown pipe-table lines when data artifacts already display the same data
                                                msg.artifacts?.some(a => a.rows && a.rows.length > 0)
                                                    ? msg.content.split('\n').filter(l => !l.trimStart().startsWith('|')).join('\n').trim()
                                                    : msg.content
                                            }
                                            onTableClick={onTableClick}
                                            connectionId={connectionId}
                                            availableTables={availableTables}
                                        />
                                        {msg.isStreaming && <StreamingCursor />}
                                    </>
                                ) : (
                                    msg.isStreaming && <StreamingCursor />
                                )}
                            </div>
                        )}

                        {/* Credits used footer */}
                        {!msg.isStreaming && msg.creditsUsed != null && msg.creditsUsed > 0 && (
                            <div className="mt-1 text-[11px] text-muted-foreground/35 font-mono">
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
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1 py-0.5 rounded"
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
}
