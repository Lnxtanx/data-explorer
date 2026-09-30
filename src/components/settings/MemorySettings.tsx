/**
 * MemorySettings.tsx
 *
 * AI Memory: persistent markdown knowledge injected into agent context.
 *   - Database scope (MEMORY.md) — per database connection
 *   - Profile scope  (USER_PROFILE.md) — per user account
 *
 * One surface, no view switch: the document is always rendered as markdown and
 * becomes a plain markdown editor in place on click. Click away to finish.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Database,
    Save,
    Copy,
    Check,
    RefreshCw,
    RotateCcw,
    UserRound,
    NotebookPen,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/components/auth/context';
import { useConnections } from '@/components/connector/api/useConnections';
import { MarkdownText } from '@/components/ai/messages/MarkdownText';
import { apiRequestFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type MemoryScope = 'database' | 'global_user';

/** Same key DataExplorerPage persists the active connection under. */
const ACTIVE_CONNECTION_KEY = 'sw-data-explorer:connection-id';

interface MemoryDocumentData {
    id: string;
    scope: MemoryScope;
    title: string;
    connector_id: string | null;
    database_name: string | null;
    connection_id: string | null;
    markdown_content: string;
    version: number;
    last_modified_by: string;
    updated_at: string;
}

function docKey(scope: MemoryScope, connectionId: string): string {
    return `${scope}:${scope === 'database' ? connectionId : 'account'}`;
}

/**
 * Last-known documents, kept across modal open/close.
 *
 * The panel is re-mounted every time Settings is opened, so without this the
 * text is a blank spinner until the network answers. Painting the cached copy
 * first turns reopening instant; the request still runs, just quietly.
 */
const docCache = new Map<string, MemoryDocumentData>();

/** In-flight GETs by key, so a re-render never queues a duplicate request. */
const inflight = new Map<string, Promise<MemoryDocumentData | null>>();

/**
 * Single request to the Node relay. There is deliberately no second "fallback"
 * host: an unusable one can only add a full extra round trip to every load.
 */
function loadDocument(
    scope: MemoryScope,
    connectionId: string
): Promise<MemoryDocumentData | null> {
    const key = docKey(scope, connectionId);

    const existing = inflight.get(key);
    if (existing) return existing;

    const request = (async () => {
        const params = new URLSearchParams({ scope });
        if (scope === 'database' && connectionId) {
            params.set('connection_id', connectionId);
        }

        const res = await apiRequestFetch(`/api/ai/memory/document?${params.toString()}`, {
            method: 'GET',
        });
        if (!res.ok) throw new Error(`memory document request failed (${res.status})`);

        const data = await res.json();
        return (data?.document as MemoryDocumentData) ?? null;
    })().finally(() => inflight.delete(key));

    inflight.set(key, request);
    return request;
}

/**
 * Renders markdown and edits in place — no editor/preview toggle, no mode state
 * for the user to manage, and no frame around the document. The panel scrolls,
 * so the text simply flows like a page.
 */
function MemorySurface({
    value,
    onChange,
    isLoading,
}: {
    value: string;
    onChange: (next: string) => void;
    isLoading: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const areaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!isEditing) return;
        const el = areaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, [isEditing]);

    if (isLoading) {
        return (
            <div className="w-full flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-2xs">Loading memory…</span>
            </div>
        );
    }

    return (
        <div
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsEditing(false);
            }}
        >
            {isEditing ? (
                <Textarea
                    ref={areaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsEditing(false);
                    }}
                    placeholder={'# Write markdown rules, verified metric definitions, and domain caveats…'}
                    className="w-full min-h-[300px] resize-y rounded-none border-0 bg-transparent p-0 font-mono text-xs leading-relaxed text-foreground shadow-none focus-visible:ring-0 focus-visible:outline-none"
                    spellCheck={false}
                />
            ) : (
                <div
                    onClick={() => setIsEditing(true)}
                    className="cursor-text"
                    title="Click to edit"
                >
                    {value.trim() ? (
                        <MarkdownText text={value} />
                    ) : (
                        <p className="text-xs italic text-muted-foreground py-2">
                            Click to write memory in markdown.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export function MemorySettings() {
    const { user } = useAuth();
    const { data: connections = [], isLoading: isLoadingConnections } = useConnections();

    const [scope, setScope] = useState<MemoryScope>('database');
    /**
     * Seed from the connection the explorer is already on.
     *
     * `useConnections` polls every 4-8s, so on a cold cache its first answer is
     * the slowest thing in the room. Waiting for it would serialise the document
     * request behind it. The id the page already uses is enough to start.
     */
    const [selectedConnectionId, setSelectedConnectionId] = useState<string>(
        () => localStorage.getItem(ACTIVE_CONNECTION_KEY) || ''
    );

    const [doc, setDoc] = useState<MemoryDocumentData | null>(null);
    const [markdownText, setMarkdownText] = useState<string>('');
    const [originalMarkdown, setOriginalMarkdown] = useState<string>('');
    const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [isRecompiling, setIsRecompiling] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);

    useEffect(() => {
        if (selectedConnectionId) return;
        if (connections.length === 0) return;
        const fallback = connections.find((c) => c.is_online) || connections[0];
        if (fallback) setSelectedConnectionId(fallback.id);
    }, [connections, selectedConnectionId]);

    const activeConnection = useMemo(
        () => connections.find((c) => c.id === selectedConnectionId) || null,
        [connections, selectedConnectionId]
    );

    const activeConnectionLabel = useMemo(
        () =>
            activeConnection
                ? `${activeConnection.database || activeConnection.db_alias || activeConnection.name}${
                      activeConnection.agent_id ? ` · ${activeConnection.agent_id}` : ''
                  }`
                : null,
        [activeConnection]
    );

    const isDirty = markdownText !== originalMarkdown;
    // Read inside the fetch effect without making typing a dependency of it.
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;

    useEffect(() => {
        if (!user?.id) return;
        // Nothing to ask for until a database scope has a connection to bind to.
        if (scope === 'database' && !selectedConnectionId) return;

        const key = docKey(scope, selectedConnectionId);
        let cancelled = false;

        const applyDocument = (next: MemoryDocumentData) => {
            if (cancelled) return;
            setDoc(next);
            setMarkdownText(next.markdown_content || '');
            setOriginalMarkdown(next.markdown_content || '');
        };

        // Paint the last-known copy first so reopening the panel is instant.
        const cached = docCache.get(key);
        if (cached) {
            applyDocument(cached);
            setIsLoadingDoc(false);
        } else {
            setIsLoadingDoc(true);
        }

        // Then revalidate quietly in the background. Re-openings skip this work
        // entirely while the document is still being edited, so an unsaved
        // buffer is never clobbered by a response that is already stale.
        loadDocument(scope, selectedConnectionId)
            .then((next) => {
                if (!next) return;
                docCache.set(key, next);
                if (cancelled) return;
                if (isDirtyRef.current) return;
                if (
                    cached &&
                    cached.version === next.version &&
                    cached.markdown_content === next.markdown_content
                ) {
                    return;
                }
                applyDocument(next);
            })
            .catch((err: unknown) => {
                console.error('[MemorySettings] Failed to fetch document:', err);
                if (!cancelled && !cached) toast.error('Could not load memory document');
            })
            .finally(() => {
                if (!cancelled) setIsLoadingDoc(false);
            });

        return () => {
            cancelled = true;
        };
        // isDirty is read through a ref so typing never re-fires this effect.
    }, [scope, selectedConnectionId, user?.id]);

    const tokenEstimate = useMemo(() => Math.ceil(markdownText.length / 4), [markdownText]);

    const handleSave = async () => {
        if (!user?.id || !doc) return;
        setIsSaving(true);
        try {
            const payload = {
                scope,
                connection_id: scope === 'database' ? selectedConnectionId : null,
                connector_id: doc.connector_id,
                database_name: doc.database_name,
                markdown_content: markdownText,
                title: doc.title,
                user_id: user.id,
            };

            const res = await apiRequestFetch('/api/ai/memory/document', {
                method: 'PUT',
                body: JSON.stringify(payload),
            });

            if (res && res.ok) {
                const data = await res.json();
                if (data.document) {
                    docCache.set(docKey(scope, selectedConnectionId), data.document);
                    setDoc(data.document);
                    setOriginalMarkdown(data.document.markdown_content);
                    toast.success(`Saved memory v${data.document.version}`, {
                        description: 'Live for Data Explorer, Dashboard AI, and Voice Agent.',
                    });
                }
            } else {
                toast.error('Failed to save memory updates');
            }
        } catch (err: any) {
            console.error('[MemorySettings] Save error:', err);
            toast.error('Failed to save memory changes');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRecompile = async () => {
        if (!user?.id || scope !== 'database' || !selectedConnectionId) return;
        if (!confirm('Recompile memory from live database schema and dashboard? This will refresh metric formulas and table definitions.')) {
            return;
        }

        setIsRecompiling(true);
        try {
            const payload = {
                scope: 'database',
                connection_id: selectedConnectionId,
                user_id: user.id,
            };

            const res = await apiRequestFetch('/api/ai/memory/document/recompile', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (res && res.ok) {
                const data = await res.json();
                if (data.document) {
                    docCache.set(docKey(scope, selectedConnectionId), data.document);
                    setDoc(data.document);
                    setMarkdownText(data.document.markdown_content);
                    setOriginalMarkdown(data.document.markdown_content);
                    toast.success(
                        data.changed
                            ? 'Memory recompiled from live schema'
                            : 'Memory already up to date'
                    );
                }
            } else if (res?.status === 409) {
                toast.error('Memory was changed elsewhere — reload and retry');
            } else {
                toast.error('Failed to recompile memory');
            }
        } catch (err: any) {
            console.error('[MemorySettings] Recompile error:', err);
            toast.error('Failed to recompile memory');
        } finally {
            setIsRecompiling(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(markdownText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDiscard = () => setMarkdownText(originalMarkdown);

    return (
        <div className="p-6 w-full space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                    <NotebookPen className="w-[18px] h-[18px] text-muted-foreground shrink-0" />
                    <h3 className="text-base font-semibold tracking-tight text-foreground leading-tight">
                        AI Memory
                    </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {isDirty && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleDiscard}
                            disabled={isSaving}
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                            title="Discard changes"
                        >
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!isDirty || isSaving || isLoadingDoc}
                        className="h-8 px-3 text-2xs font-medium rounded-lg gap-1.5"
                    >
                        {isSaving ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Save className="w-3.5 h-3.5" />
                        )}
                        Save
                    </Button>
                </div>
            </div>

            {/* Scope + target */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
                    <button
                        type="button"
                        onClick={() => setScope('database')}
                        className={cn(
                            'inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors',
                            scope === 'database'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <Database className="w-3.5 h-3.5" />
                        Database
                    </button>
                    <button
                        type="button"
                        onClick={() => setScope('global_user')}
                        className={cn(
                            'inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors',
                            scope === 'global_user'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <UserRound className="w-3.5 h-3.5" />
                        Profile
                    </button>
                </div>

                {scope === 'database' &&
                    (connections.length > 0 ? (
                        <Select value={selectedConnectionId} onValueChange={setSelectedConnectionId}>
                            <SelectTrigger
                                className="h-8 w-[200px] shrink-0 gap-1.5 border-border bg-background px-2.5 text-xs"
                                title={activeConnectionLabel ?? undefined}
                            >
                                <SelectValue placeholder="Select connection…">
                                    {activeConnectionLabel}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent position="item-aligned" className="min-w-[200px]">
                                {connections.map((c) => (
                                    <SelectItem key={c.id} value={c.id} className="text-xs">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span
                                                className={cn(
                                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                                    c.is_online ? 'bg-emerald-500' : 'bg-muted-foreground'
                                                )}
                                            />
                                            <span className="truncate font-medium text-foreground">
                                                {c.database || c.db_alias || c.name}
                                            </span>
                                            <span className="truncate text-2xs text-muted-foreground">
                                                {c.agent_id || c.name || 'postgresql'}
                                            </span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="text-2xs text-muted-foreground">
                            {isLoadingConnections ? 'Loading connections…' : 'No databases connected yet'}
                        </span>
                    ))}
            </div>

            {/* Document meta + actions */}
            <div className="flex items-center justify-between gap-3">
                <p className="text-2xs text-muted-foreground truncate">
                    <span className="font-mono text-foreground/80">
                        {scope === 'database' ? 'MEMORY.md' : 'USER_PROFILE.md'}
                    </span>
                    {` · ~${tokenEstimate.toLocaleString()} tokens`}
                    {doc ? ` · v${doc.version}` : ''}
                    {isDirty ? ' · unsaved' : ' · click to edit'}
                </p>

                <div className="flex items-center gap-1 shrink-0">
                    {scope === 'database' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRecompile}
                            disabled={isRecompiling || isLoadingDoc}
                            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                            title="Recompile from live schema"
                        >
                            <RotateCcw className={cn('w-3.5 h-3.5', isRecompiling && 'animate-spin')} />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleCopy}
                        className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                        title="Copy markdown"
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                </div>
            </div>

            {/* Document */}
            <MemorySurface value={markdownText} onChange={setMarkdownText} isLoading={isLoadingDoc} />
        </div>
    );
}
