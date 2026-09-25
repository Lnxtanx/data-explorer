import { useState } from 'react';
import { FolderKanban, ArrowLeft, MessageSquare, Plus, Activity, Loader2, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/shared/lib/format';
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
import { useProjects, useProjectChats } from './hooks/useProjects';
import { useDeleteAIChat } from './hooks/useAIChats';
import type { AIProject } from './api/projects';

interface ProjectDetailViewProps {
    projectId: string;
    onClose: () => void;
    onOpenChat: (chatId: string) => void;
    onNewChat: () => void;
}

const colorClass: Record<AIProject['color'], string> = {
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    blue:   'bg-blue-100   dark:bg-blue-900/30   text-blue-600   dark:text-blue-400',
    green:  'bg-green-100  dark:bg-green-900/30  text-green-600  dark:text-green-400',
};


export function ProjectDetailView({ projectId, onClose, onOpenChat, onNewChat }: ProjectDetailViewProps) {
    const { data: projects } = useProjects();
    const { data: chats, isLoading: chatsLoading } = useProjectChats(projectId);
    const deleteChat = useDeleteAIChat();
    const [pendingDeleteChatId, setPendingDeleteChatId] = useState<string | null>(null);

    const project = projects?.find(p => p.id === projectId);

    if (!project) {
        return (
            <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading project...
            </div>
        );
    }

    const isTeamProject = Boolean(project.team_id || project.teamId);
    const teamLabel = project.team_name || project.teamName || 'Team Shared';
    const isOwner = project.is_mine ?? true;

    return (
        <main className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
            {/* Header / Nav */}
            <div className="h-14 flex items-center gap-4 px-6 shrink-0 border-b border-border/40 bg-background/95 backdrop-blur z-10 sticky top-0">
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', colorClass[project.color])}>
                    <FolderKanban className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-foreground truncate">{project.title}</h2>
                    {isTeamProject && (
                        <span className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-tight border border-primary/20 shrink-0">
                            <Users className="w-3 h-3" />
                            <span>{teamLabel}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-4xl mx-auto flex flex-col gap-8">
                    {/* Project Hero */}
                    <div className="flex flex-col gap-4 pb-6 border-b border-border/30">
                        <div className="flex items-start justify-between gap-6">
                            <div className="flex flex-col gap-2 flex-1">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{project.title}</h1>
                                    {isTeamProject && (
                                        <span className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-tight border border-primary/20">
                                            <Users className="w-3.5 h-3.5" />
                                            <span>{teamLabel}</span>
                                        </span>
                                    )}
                                </div>
                                {!isOwner && (project.owner_name || project.owner_email) && (
                                    <p className="text-xs text-muted-foreground">
                                        Shared by <span className="font-medium text-foreground">{project.owner_name || project.owner_email}</span>
                                    </p>
                                )}
                                {project.description && (
                                    <p className="text-muted-foreground text-[15px] leading-relaxed mt-1">
                                        {project.description}
                                    </p>
                                )}
                            </div>
                            <Button onClick={onNewChat} className="shrink-0 gap-2 h-10 px-4">
                                <Plus className="w-4 h-4" />
                                New Chat
                            </Button>
                        </div>
                    </div>

                    {/* Chats List */}
                    <div className="flex flex-col gap-4">
                        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                            Recent Chats
                            <span className="bg-muted px-2 py-0.5 rounded-full text-xs text-muted-foreground">
                                {chats?.length || 0}
                            </span>
                        </h3>

                        {chatsLoading ? (
                            <div className="flex flex-col gap-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse border border-border/40" />
                                ))}
                            </div>
                        ) : chats?.length === 0 ? (
                            <div className="border border-dashed border-border/60 rounded-2xl flex flex-col items-center justify-center min-h-[200px] text-center gap-3 bg-muted/10">
                                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                                    <MessageSquare className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">No chats yet</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">Start a new chat to begin working in this project.</p>
                                </div>
                                <Button variant="secondary" size="sm" onClick={onNewChat} className="mt-2">
                                    Start Chat
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {chats?.map(chat => (
                                    <div
                                        key={chat.id}
                                        onClick={() => onOpenChat(chat.id)}
                                        className="group border border-border/60 bg-card hover:border-border hover:shadow-sm rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-all"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center shrink-0">
                                            <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                            <div className="flex flex-col min-w-0 flex-1 gap-1">
                                                <span className="font-medium text-[15px] text-foreground truncate">
                                                    {chat.title || 'New chat'}
                                                    {!chat.isMine && (
                                                        <span className="ml-2 text-[9px] uppercase font-black tracking-wide text-primary bg-primary/10 rounded px-1.5 py-0.5 align-middle">
                                                            Team
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1.5">
                                                        <Activity className="w-3.5 h-3.5" />
                                                        {formatTimeAgo(chat.updatedAt)}
                                                    </span>
                                                    {chat.messageCount > 0 && (
                                                        <span>{chat.messageCount} messages</span>
                                                    )}
                                                    {!chat.isMine && (chat.authorName || chat.authorEmail) && (
                                                        <span className="truncate">
                                                            by {chat.authorName || chat.authorEmail}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {chat.isMine && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingDeleteChatId(chat.id);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 h-8 w-8"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete Chat Confirmation Dialog */}
            <AlertDialog
                open={Boolean(pendingDeleteChatId)}
                onOpenChange={(open) => !open && setPendingDeleteChatId(null)}
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
                                if (!pendingDeleteChatId) return;
                                const targetId = pendingDeleteChatId;
                                setPendingDeleteChatId(null);
                                deleteChat.mutate(targetId);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-7 font-medium"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}

