import { Plus, LayoutGrid, Library, Trash2, MessageSquare, History, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAIChatList, useDeleteAIChat } from '@/hooks/useAIChats';
import { useProjects } from '@/hooks/useProjects';

interface AIChatSidebarProps {
    onCloseAI: () => void;
    activeView: 'chat' | 'library' | 'projects' | 'artifacts' | 'project_detail';
    onViewChange: (view: 'chat' | 'library' | 'projects' | 'artifacts' | 'project_detail') => void;
    connectionId?: string;
    activeChatId?: string | null;
    onChatSelect?: (chatId: string) => void;
    onNewChat?: () => void;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

const colorTextClass: Record<string, string> = {
    slate: 'text-slate-500',
    blue: 'text-blue-500',
    indigo: 'text-indigo-500',
    violet: 'text-violet-500',
    rose: 'text-rose-500',
    orange: 'text-orange-500',
    emerald: 'text-emerald-500',
};

export function AIChatSidebar({ activeView, onViewChange, connectionId, activeChatId, onChatSelect, onNewChat }: AIChatSidebarProps) {
    const { data, isLoading } = useAIChatList({ limit: 30 });
    const { data: projects } = useProjects();
    const deleteChat = useDeleteAIChat();
    const chats = data?.chats ?? [];

    const handleNewChat = () => { onNewChat?.(); onViewChange('chat'); };

    return (
        <div className="flex-1 flex flex-col h-full bg-muted/10 relative">
            {/* New Chat */}
            <div className="p-3">
                <Button
                    variant="ghost"
                    className={cn(
                        'w-full justify-start gap-2 h-10 text-sm font-semibold px-3 transition-all duration-200',
                        activeView === 'chat' && !activeChatId
                            ? 'bg-muted/50 text-foreground shadow-sm border border-border/60 backdrop-blur-md'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent hover:border-border/40'
                    )}
                    onClick={handleNewChat}
                >
                    <Plus className="w-4 h-4" />
                    New chat
                </Button>
            </div>

            {/* Nav */}
            <div className="px-3 py-1 flex flex-col gap-0.5">
                <Button variant="ghost"
                    className={cn('w-full justify-start h-9 px-2 text-sm font-normal', (activeView === 'projects' || activeView === 'project_detail') ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                    onClick={() => onViewChange('projects')}>
                    <LayoutGrid className="w-4 h-4 mr-2.5 opacity-70" />Projects
                </Button>
                <Button variant="ghost"
                    className={cn('w-full justify-start h-9 px-2 text-sm font-normal', activeView === 'artifacts' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                    onClick={() => onViewChange('artifacts')}>
                    <History className="w-4 h-4 mr-2.5 opacity-70" />Artifacts
                </Button>
            </div>

            {/* Chat history */}
            <div className="flex-1 overflow-y-auto px-3 py-4 mt-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="text-xs font-semibold text-muted-foreground px-2 mb-3">Your chats</div>

                {isLoading ? (
                    <div className="flex flex-col gap-1">
                        {[1, 2, 3].map(i => <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse mx-1" />)}
                    </div>
                ) : chats.length === 0 ? (
                    <div className="text-sm text-muted-foreground italic px-2">No recent chats.</div>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {chats.map(chat => {
                            const project = chat.projectId ? projects?.find(p => p.id === chat.projectId) : null;
                            const Icon = project ? FolderKanban : MessageSquare;
                            const iconClass = project ? (colorTextClass[project.color] || colorTextClass.slate) : 'opacity-60';
                            
                            return (
                                <div key={chat.id}
                                    className={cn(
                                        'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors',
                                        activeChatId === chat.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                    )}
                                    onClick={() => { onChatSelect?.(chat.id); onViewChange('chat'); }}>
                                    <Icon className={cn("w-3.5 h-3.5 shrink-0", iconClass)} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm truncate">{chat.title || 'New chat'}</div>
                                        <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1 truncate">
                                            {timeAgo(chat.updatedAt)}
                                            {project && (
                                                <>
                                                    <span className="opacity-30">•</span>
                                                    <span className="truncate">{project.title}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon"
                                        className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 shrink-0"
                                        onClick={e => {
                                            e.stopPropagation();
                                            deleteChat.mutate(chat.id);
                                            if (activeChatId === chat.id) onNewChat?.();
                                        }}>
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
