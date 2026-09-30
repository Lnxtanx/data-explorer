import { useState, useRef, useEffect, useMemo } from 'react';
import { formatTimeAgo } from '@/shared/lib/format';
import {
    Plus,
    Trash2,
    MessageSquare,
    History,
    FolderKanban,
    MoreHorizontal,
    Pencil,
    Download,
    ChevronDown,
    ChevronRight,
    FolderMinus,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
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
import { useQueryClient } from '@tanstack/react-query';
import { cn, stripTemporalTag } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { useAIChatList, useDeleteAIChat, useUpdateAIChat, aiQueryKeys } from './hooks/useAIChats';
import { useProjects, useDeleteProject, useCreateProject } from './hooks/useProjects';
import type { AIProject } from './api/projects';
import { getChatMessages, type AIMessage } from './api/index';
import { VoiceWaveformIcon } from '@/components/voice';

interface AIChatSidebarProps {
    onCloseAI: () => void;
    activeView: 'chat' | 'library' | 'projects' | 'artifacts' | 'project_detail';
    onViewChange: (view: 'chat' | 'library' | 'projects' | 'artifacts' | 'project_detail') => void;
    connectionId?: string;
    activeChatId?: string | null;
    onChatSelect?: (chatId: string, projectId?: string | null) => void;
    onNewChat?: () => void;
    onNewProjectChat?: (projectId: string) => void;
    onOpenProject?: (projectId: string) => void;
}


const colorTextClass: Record<string, string> = {
    slate: 'text-slate-500',
    blue: 'text-blue-500',
    indigo: 'text-indigo-500',
    violet: 'text-violet-500',
    rose: 'text-rose-500',
    orange: 'text-orange-500',
    emerald: 'text-emerald-500',
    green: 'text-emerald-500',
    purple: 'text-purple-500',
};

async function downloadChatAsMarkdown(chatId: string, chatTitle: string) {
    try {
        const response = await getChatMessages(chatId);
        const messages: AIMessage[] = response.messages || [];
        let md = `# ${chatTitle}\n\n*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
        for (const msg of messages) {
            const author = msg.role === 'user' ? (msg.authorName ? `**${msg.authorName}** (You)` : '**You**') : '**Resona AI**';
            const userContent = msg.role === 'user' ? stripTemporalTag(msg.content || '') : (msg.content || '');
            md += `### ${author}\n\n${userContent}\n\n`;
            if (msg.artifacts && msg.artifacts.length > 0) {
                for (const art of msg.artifacts) {
                    if (art.sql) {
                        md += `\`\`\`sql\n${art.sql}\n\`\`\`\n\n`;
                    }
                }
            }
            md += `---\n\n`;
        }
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(chatTitle || 'chat').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        logger.error('Failed to export chat:', err);
    }
}

export function AIChatSidebar({
    activeView,
    onViewChange,
    activeChatId,
    onChatSelect,
    onNewChat,
    onNewProjectChat,
    onOpenProject,
}: AIChatSidebarProps) {
    const queryClient = useQueryClient();
    const { data, isLoading } = useAIChatList({ limit: 50 });
    const { data: projects } = useProjects();
    const deleteChat = useDeleteAIChat();
    const updateChat = useUpdateAIChat();
    const deleteProject = useDeleteProject();

    const handlePrefetchChat = (chatId: string) => {
        queryClient.prefetchQuery({
            queryKey: aiQueryKeys.messages(chatId),
            queryFn: () => getChatMessages(chatId),
            staleTime: 60_000,
        });
    };

    // Section-level collapse state (default expanded for quick access)
    const [isProjectsSectionExpanded, setIsProjectsSectionExpanded] = useState<boolean>(true);
    const [isYourChatsSectionExpanded, setIsYourChatsSectionExpanded] = useState<boolean>(true);
    const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

    // Individual project folder collapse state
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

    const [editingChatId, setEditingChatId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const editInputRef = useRef<HTMLInputElement | null>(null);
    const [pendingDeleteChat, setPendingDeleteChat] = useState<{ id: string; title: string } | null>(null);

    const chats = data?.chats ?? [];

    // Defensively isolate chats: Dashboard AI and SQL Editor sessions must NEVER render here
    const explorerChats = useMemo(() => {
        return chats.filter(c => c.useCase !== 'dashboard' && c.useCase !== 'sql_editor');
    }, [chats]);

    useEffect(() => {
        if (activeChatId && explorerChats.length > 0) {
            const activeChat = explorerChats.find(c => c.id === activeChatId);
            if (activeChat?.projectId) {
                setExpandedProjects(prev => new Set([...prev, activeChat.projectId!]));
                setIsProjectsSectionExpanded(true);
            }
        }
    }, [activeChatId, explorerChats]);

    useEffect(() => {
        if (editingChatId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingChatId]);

    const toggleProject = (projectId: string) => {
        setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(projectId)) {
                next.delete(projectId);
            } else {
                next.add(projectId);
            }
            return next;
        });
    };

    const handleNewChat = () => {
        onNewChat?.();
        onViewChange('chat');
    };

    const handleStartProjectChat = (projectId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        onNewProjectChat?.(projectId);
        setExpandedProjects(prev => new Set([...prev, projectId]));
        setIsProjectsSectionExpanded(true);
    };

    const startRename = (chatId: string, currentTitle: string) => {
        setEditingChatId(chatId);
        setEditTitle(currentTitle || 'New chat');
    };

    const saveRename = (chatId: string) => {
        const trimmed = editTitle.trim();
        if (trimmed && trimmed !== (chats.find(c => c.id === chatId)?.title || '')) {
            updateChat.mutate({ chatId, updates: { title: trimmed } });
        }
        setEditingChatId(null);
    };

    const cancelRename = () => {
        setEditingChatId(null);
        setEditTitle('');
    };

    // Separate chats into project chats and standalone chats
    const standaloneChats = useMemo(() => {
        return explorerChats.filter(c => !c.projectId);
    }, [explorerChats]);

    return (
        <div className="flex-1 flex flex-col h-full bg-muted/10 relative overflow-hidden select-none">
            {/* Action buttons */}
            <div className="p-3 pb-2 flex flex-col gap-1">
                <Button
                    variant="ghost"
                    className={cn(
                        'w-full justify-start gap-2 h-9 text-[13px] font-normal px-2.5 transition-all duration-200 cursor-pointer',
                        activeView === 'chat' && !activeChatId
                            ? 'bg-muted/70 text-foreground border border-border/60'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent'
                    )}
                    onClick={handleNewChat}
                >
                    <Plus className="w-4 h-4 text-foreground/70" />
                    New chat
                </Button>

                <Button
                    variant="ghost"
                    className={cn(
                        'w-full justify-start h-8 px-2.5 text-[13px] font-normal cursor-pointer',
                        activeView === 'projects' || activeView === 'project_detail'
                            ? 'bg-muted/70 text-foreground font-normal'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}
                    onClick={() => onViewChange('projects')}
                >
                    <FolderKanban className="w-3.5 h-3.5 mr-2 opacity-60" />
                    Projects
                </Button>

                <Button
                    variant="ghost"
                    className={cn(
                        'w-full justify-start h-8 px-2.5 text-[13px] font-normal cursor-pointer',
                        activeView === 'artifacts'
                            ? 'bg-muted/70 text-foreground font-normal'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}
                    onClick={() => onViewChange('artifacts')}
                >
                    <History className="w-3.5 h-3.5 mr-2 opacity-60" />
                    Artifacts
                </Button>
            </div>

            {/* Scrollable Tree: Projects & Chats (ChatGPT Style) */}
            <div className="flex-1 overflow-y-auto px-3 py-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full flex flex-col gap-4">

                {/* ── PROJECTS SECTION (COLLAPSIBLE SECTION) ────────────────────── */}
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between px-1 mb-1">
                        <button
                            onClick={() => setIsProjectsSectionExpanded(prev => !prev)}
                            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground tracking-wider uppercase cursor-pointer"
                        >
                            {isProjectsSectionExpanded ? (
                                <ChevronDown className="w-3 h-3 opacity-75" />
                            ) : (
                                <ChevronRight className="w-3 h-3 opacity-75" />
                            )}
                            <span>Projects</span>
                        </button>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIsCreateProjectOpen(true)}
                                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                title="Create new project"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => onViewChange('projects')}
                                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-normal"
                                title="Open Projects overview"
                            >
                                View all
                            </button>
                        </div>
                    </div>

                    {isProjectsSectionExpanded && (
                        projects && projects.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                                {projects.map((project) => {
                                    const isExpanded = expandedProjects.has(project.id);
                                    const projectChats = explorerChats.filter(c => c.projectId === project.id);
                                    const colorClass = colorTextClass[project.color] || colorTextClass.blue;

                                    return (
                                        <div key={project.id} className="flex flex-col">
                                            {/* Project Folder Header */}
                                            <div
                                                className="group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors text-foreground/90"
                                                onClick={() => toggleProject(project.id)}
                                            >
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                    <button
                                                        type="button"
                                                        className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleProject(project.id);
                                                        }}
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                                                        ) : (
                                                            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                                                        )}
                                                    </button>
                                                    <FolderKanban className={cn('w-3.5 h-3.5 shrink-0', colorClass)} />
                                                    <span className="text-[13px] font-normal text-foreground/90 truncate">{project.title}</span>
                                                </div>

                                                <div className="flex items-center gap-0.5 shrink-0">
                                                    {/* Quick start chat in project button */}
                                                    <button
                                                        onClick={(e) => handleStartProjectChat(project.id, e)}
                                                        className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-background text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                                                        title={`New chat in ${project.title}`}
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                    </button>

                                                    {/* Project Options Menu */}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <button
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-background text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                                                            >
                                                                <MoreHorizontal className="w-3.5 h-3.5" />
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-44 text-xs">
                                                            <DropdownMenuItem
                                                                onClick={() => onOpenProject?.(project.id)}
                                                                className="gap-2 cursor-pointer"
                                                            >
                                                                <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                                                                Open Project
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleStartProjectChat(project.id)}
                                                                className="gap-2 cursor-pointer"
                                                            >
                                                                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                                                                New Chat in Project
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => deleteProject.mutate(project.id)}
                                                                className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Delete Project
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>

                                            {/* Nested Project Chats (ChatGPT Style Tree) */}
                                            {isExpanded && (
                                                <div className="ml-5 pl-2 border-l border-border/40 flex flex-col gap-0.5 my-0.5">
                                                    {projectChats.length === 0 ? (
                                                        <button
                                                            onClick={() => handleStartProjectChat(project.id)}
                                                            className="text-left px-2 py-1.5 rounded text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors flex items-center gap-1.5 cursor-pointer italic font-normal"
                                                        >
                                                            <Plus className="w-3 h-3 opacity-60" />
                                                            Start a chat in this project
                                                        </button>
                                                    ) : (
                                                        projectChats.map((chat) => {
                                                            const isEditing = editingChatId === chat.id;
                                                            const isActive = activeChatId === chat.id;
                                                            const isVoiceChat = Boolean(
                                                                chat.isVoice ||
                                                                chat.modelUsed?.includes('live') ||
                                                                chat.title?.toLowerCase().includes('voice conversation') ||
                                                                chat.title?.toLowerCase().startsWith('voice:')
                                                            );

                                                            return (
                                                                <div
                                                                    key={chat.id}
                                                                    className={cn(
                                                                        'group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors text-[13px]',
                                                                        isActive
                                                                            ? 'bg-muted text-foreground font-normal'
                                                                            : 'text-foreground/90 hover:text-foreground hover:bg-muted/50 font-normal'
                                                                    )}
                                                                    onMouseEnter={() => handlePrefetchChat(chat.id)}
                                                                    onClick={() => {
                                                                        if (!isEditing) {
                                                                            onChatSelect?.(chat.id, project.id);
                                                                            onViewChange('chat');
                                                                        }
                                                                    }}
                                                                    onDoubleClick={(e) => {
                                                                        e.stopPropagation();
                                                                        startRename(chat.id, chat.title || 'New chat');
                                                                    }}
                                                                >
                                                                    <div className="flex-1 min-w-0 mr-1">
                                                                        {isEditing ? (
                                                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                                <input
                                                                                    ref={editInputRef}
                                                                                    type="text"
                                                                                    value={editTitle}
                                                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') saveRename(chat.id);
                                                                                        if (e.key === 'Escape') cancelRename();
                                                                                    }}
                                                                                    onBlur={() => saveRename(chat.id)}
                                                                                    className="w-full text-[13px] bg-background border border-primary/60 rounded px-1.5 py-0.5 text-foreground outline-none font-normal"
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                {isVoiceChat && <VoiceWaveformIcon className="w-3 h-3 shrink-0 text-primary" />}
                                                                                <span className="truncate block font-normal">{chat.title || 'New chat'}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {!isEditing && (
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <button
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-background text-muted-foreground hover:text-foreground transition-all shrink-0 cursor-pointer"
                                                                                >
                                                                                <MoreHorizontal className="w-3 h-3" />
                                                                            </button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end" className="w-44 text-xs">
                                                                            <DropdownMenuItem
                                                                                onClick={() => startRename(chat.id, chat.title || 'New chat')}
                                                                                className="gap-2 cursor-pointer font-normal"
                                                                            >
                                                                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                                                                Rename
                                                                            </DropdownMenuItem>

                                                                            <DropdownMenuItem
                                                                                onClick={() => updateChat.mutate({ chatId: chat.id, updates: { projectId: null } })}
                                                                                className="gap-2 cursor-pointer font-normal"
                                                                            >
                                                                                <FolderMinus className="w-3.5 h-3.5 text-muted-foreground" />
                                                                                Remove from Project
                                                                            </DropdownMenuItem>

                                                                            {projects && projects.length > 1 && (
                                                                                <DropdownMenuSub>
                                                                                    <DropdownMenuSubTrigger className="gap-2 cursor-pointer font-normal">
                                                                                        <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                                                                                        Move to Another
                                                                                    </DropdownMenuSubTrigger>
                                                                                    <DropdownMenuSubContent className="w-44 text-xs">
                                                                                        {projects.filter(p => p.id !== project.id).map((otherProj) => (
                                                                                            <DropdownMenuItem
                                                                                                key={otherProj.id}
                                                                                                onClick={() => updateChat.mutate({ chatId: chat.id, updates: { projectId: otherProj.id } })}
                                                                                                className="gap-2 cursor-pointer font-normal"
                                                                                            >
                                                                                                <FolderKanban className={cn('w-3 h-3', colorTextClass[otherProj.color] || colorTextClass.slate)} />
                                                                                                <span className="truncate">{otherProj.title}</span>
                                                                                            </DropdownMenuItem>
                                                                                        ))}
                                                                                    </DropdownMenuSubContent>
                                                                                </DropdownMenuSub>
                                                                            )}

                                                                            <DropdownMenuItem
                                                                                onClick={() => downloadChatAsMarkdown(chat.id, chat.title || 'chat')}
                                                                                className="gap-2 cursor-pointer font-normal"
                                                                            >
                                                                                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                                                                                Export as Markdown
                                                                            </DropdownMenuItem>

                                                                            <DropdownMenuSeparator />

                                                                            <DropdownMenuItem
                                                                                onClick={() => {
                                                                                    setPendingDeleteChat({ id: chat.id, title: chat.title || 'this conversation' });
                                                                                }}
                                                                                className="gap-2 text-destructive focus:text-destructive cursor-pointer font-normal"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                                Delete
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/20 border border-dashed border-border/60 mx-1 my-0.5">
                            <span className="text-xs text-muted-foreground italic">No projects yet</span>
                            <button
                                onClick={() => setIsCreateProjectOpen(true)}
                                className="text-xs text-primary hover:underline font-medium cursor-pointer"
                            >
                                + New Project
                            </button>
                        </div>
                    ))}
                </div>

                {/* ── YOUR CHATS SECTION (STANDALONE CHATS) ───────────────────────── */}
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between px-1 mb-1">
                        <button
                            onClick={() => setIsYourChatsSectionExpanded(prev => !prev)}
                            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground tracking-wider uppercase cursor-pointer"
                        >
                            {isYourChatsSectionExpanded ? (
                                <ChevronDown className="w-3 h-3 opacity-75" />
                            ) : (
                                <ChevronRight className="w-3 h-3 opacity-75" />
                            )}
                            <span>Your chats</span>
                        </button>
                    </div>

                    {isYourChatsSectionExpanded && (
                        <>
                            {isLoading ? (
                                <div className="flex flex-col gap-1">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse mx-1" />
                                    ))}
                                </div>
                            ) : standaloneChats.length === 0 ? (
                                <div className="text-xs text-muted-foreground italic px-2 py-1 font-normal">
                                    No standalone chats.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-0.5">
                                    {standaloneChats.map((chat) => {
                                        const isEditing = editingChatId === chat.id;
                                        const isActive = activeChatId === chat.id;
                                        const isVoiceChat = Boolean(
                                            chat.isVoice ||
                                            chat.modelUsed?.includes('live') ||
                                            chat.title?.toLowerCase().includes('voice conversation') ||
                                            chat.title?.toLowerCase().startsWith('voice:')
                                        );

                                        return (
                                            <div
                                                key={chat.id}
                                                className={cn(
                                                    'group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-[13px]',
                                                    isActive
                                                        ? 'bg-muted text-foreground font-normal'
                                                        : 'text-foreground/90 hover:text-foreground hover:bg-muted/50 font-normal'
                                                )}
                                                onMouseEnter={() => handlePrefetchChat(chat.id)}
                                                onClick={() => {
                                                    if (!isEditing) {
                                                        onChatSelect?.(chat.id, null);
                                                        onViewChange('chat');
                                                    }
                                                }}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    startRename(chat.id, chat.title || 'New chat');
                                                }}
                                            >
                                                {isVoiceChat ? (
                                                    <VoiceWaveformIcon className="w-3.5 h-3.5 shrink-0 text-primary" />
                                                ) : (
                                                    <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground/80 group-hover:text-foreground transition-colors" />
                                                )}

                                                <div className="flex-1 min-w-0">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                ref={editInputRef}
                                                                type="text"
                                                                value={editTitle}
                                                                onChange={(e) => setEditTitle(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') saveRename(chat.id);
                                                                    if (e.key === 'Escape') cancelRename();
                                                                }}
                                                                onBlur={() => saveRename(chat.id)}
                                                                className="w-full text-[13px] bg-background border border-primary/60 rounded px-1.5 py-0.5 text-foreground outline-none font-normal"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="text-[13px] truncate font-normal">{chat.title || 'New chat'}</div>
                                                            <div className="text-[10px] text-muted-foreground/75 flex items-center gap-1 truncate font-normal">
                                                                {formatTimeAgo(chat.updatedAt)}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {!isEditing && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0 p-0 cursor-pointer"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <MoreHorizontal className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-44 text-xs">
                                                            <DropdownMenuItem
                                                                onClick={() => startRename(chat.id, chat.title || 'New chat')}
                                                                className="gap-2 cursor-pointer font-normal"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                                                Rename
                                                            </DropdownMenuItem>

                                                            {projects && projects.length > 0 && (
                                                                <DropdownMenuSub>
                                                                    <DropdownMenuSubTrigger className="gap-2 cursor-pointer font-normal">
                                                                        <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                                                                        Move to Project
                                                                    </DropdownMenuSubTrigger>
                                                                    <DropdownMenuSubContent className="w-44 text-xs">
                                                                        {projects.map((proj) => (
                                                                            <DropdownMenuItem
                                                                                key={proj.id}
                                                                                onClick={() => updateChat.mutate({ chatId: chat.id, updates: { projectId: proj.id } })}
                                                                                className="gap-2 cursor-pointer font-normal"
                                                                            >
                                                                                <FolderKanban className={cn('w-3 h-3', colorTextClass[proj.color] || colorTextClass.slate)} />
                                                                                <span className="truncate">{proj.title}</span>
                                                                            </DropdownMenuItem>
                                                                        ))}
                                                                    </DropdownMenuSubContent>
                                                                </DropdownMenuSub>
                                                            )}

                                                            <DropdownMenuItem
                                                                onClick={() => downloadChatAsMarkdown(chat.id, chat.title || 'chat')}
                                                                className="gap-2 cursor-pointer font-normal"
                                                            >
                                                                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                                                                Export as Markdown
                                                            </DropdownMenuItem>

                                                            <DropdownMenuSeparator />

                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    setPendingDeleteChat({ id: chat.id, title: chat.title || 'this conversation' });
                                                                }}
                                                                className="gap-2 text-destructive focus:text-destructive cursor-pointer font-normal"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <CreateProjectSidebarDialog
                open={isCreateProjectOpen}
                onOpenChange={setIsCreateProjectOpen}
                onCreated={(newProjId) => {
                    setExpandedProjects(prev => new Set([...prev, newProjId]));
                    setIsProjectsSectionExpanded(true);
                    if (onOpenProject) {
                        onOpenProject(newProjId);
                    } else {
                        onViewChange('projects');
                    }
                }}
            />

            {/* Delete Chat Confirmation Dialog */}
            <AlertDialog
                open={Boolean(pendingDeleteChat)}
                onOpenChange={(open) => !open && setPendingDeleteChat(null)}
            >
                <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-sm font-semibold">Delete Conversation</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-muted-foreground">
                            Are you sure you want to delete this conversation? It will be removed from your history.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-0 mt-2">
                        <AlertDialogCancel className="text-xs h-7">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (!pendingDeleteChat) return;
                                const targetId = pendingDeleteChat.id;
                                setPendingDeleteChat(null);
                                deleteChat.mutate(targetId);
                                if (activeChatId === targetId) onNewChat?.();
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

// ─── Create Project Dialog for Sidebar ────────────────────────────────────────

const PROJECT_COLOR_OPTIONS: AIProject['color'][] = ['blue', 'purple', 'green', 'orange'];

const projectDotClass: Record<AIProject['color'], string> = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-emerald-500',
    orange: 'bg-orange-500',
};

function CreateProjectSidebarDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: (projectId: string) => void;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState<AIProject['color']>('blue');
    const createProject = useCreateProject();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        createProject.mutate(
            {
                title: title.trim(),
                description: description.trim() || undefined,
                color,
            },
            {
                onSuccess: (res) => {
                    toast.success('Project created');
                    setTitle('');
                    setDescription('');
                    setColor('blue');
                    onOpenChange(false);
                    if (res?.project?.id && onCreated) {
                        onCreated(res.project.id);
                    }
                },
                onError: (err) => {
                    toast.error('Failed to create project: ' + err.message);
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Create New Project</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Project Name</label>
                        <Input
                            placeholder="e.g. Sales Analytics, Migration..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-9 text-sm"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Description (optional)</label>
                        <Textarea
                            placeholder="Brief purpose or context for this project..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="text-sm resize-none h-20"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Color Tag</label>
                        <div className="flex items-center gap-2 pt-0.5">
                            {PROJECT_COLOR_OPTIONS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        'w-6 h-6 rounded-full border-2 transition-all cursor-pointer',
                                        projectDotClass[c],
                                        color === c ? 'ring-2 ring-primary ring-offset-2 border-transparent scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                                    )}
                                    title={c.charAt(0).toUpperCase() + c.slice(1)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50 mt-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={!title.trim() || createProject.isPending}
                        >
                            {createProject.isPending ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                    Creating...
                                </>
                            ) : (
                                'Create Project'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

