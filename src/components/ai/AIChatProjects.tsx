import { useState } from 'react';
import { Plus, FolderKanban, Activity, Trash2, MessageSquare, X, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/shared/lib/format';
import { useProjects, useCreateProject, useDeleteProject } from './hooks/useProjects';
import type { AIProject } from './api/projects';

// ─── Color helpers ────────────────────────────────────────────────────────────

const COLOR_OPTIONS: AIProject['color'][] = ['orange', 'purple', 'blue', 'green'];

const colorClass: Record<AIProject['color'], string> = {
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    blue:   'bg-blue-100   dark:bg-blue-900/30   text-blue-600   dark:text-blue-400',
    green:  'bg-green-100  dark:bg-green-900/30  text-green-600  dark:text-green-400',
};

const dotClass: Record<AIProject['color'], string> = {
    orange: 'bg-orange-400',
    purple: 'bg-purple-400',
    blue:   'bg-blue-400',
    green:  'bg-green-400',
};


// ─── Create Project Form ──────────────────────────────────────────────────────

function CreateProjectForm({ onClose }: { onClose: () => void }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState<AIProject['color']>('blue');
    const createProject = useCreateProject();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        createProject.mutate(
            { title: title.trim(), description: description.trim() || undefined, color },
            { onSuccess: onClose }
        );
    };

    return (
        <div className="border border-border bg-card rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-foreground">New Project</h3>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <Input
                    placeholder="Project name"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="h-9 text-sm"
                    autoFocus
                />
                <Textarea
                    placeholder="Description (optional)"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="text-sm resize-none h-20"
                />

                {/* Color picker */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Color:</span>
                    {COLOR_OPTIONS.map(c => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className={cn(
                                'w-5 h-5 rounded-full border-2 transition-all',
                                dotClass[c],
                                color === c ? 'border-foreground scale-110' : 'border-transparent'
                            )}
                        />
                    ))}
                </div>

                <div className="flex gap-2 justify-end mt-1">
                    <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={!title.trim() || createProject.isPending}>
                        {createProject.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                    </Button>
                </div>
            </form>
        </div>
    );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
    project,
    onOpen,
}: {
    project: AIProject;
    onOpen: (id: string) => void;
}) {
    const deleteProject = useDeleteProject();
    const isTeamProject = Boolean(project.team_id || project.teamId);
    const teamLabel = project.team_name || project.teamName || 'Team Shared';
    const isOwner = project.is_mine ?? true;

    return (
        <div
            className={cn(
                "group relative border rounded-2xl p-6 flex flex-col min-h-[220px] transition-all duration-300 cursor-pointer overflow-hidden",
                "bg-card/40 backdrop-blur-sm hover:shadow-2xl hover:shadow-primary/5",
                project.color === 'orange' ? 'border-orange-500/20 hover:border-orange-500/50' :
                project.color === 'purple' ? 'border-purple-500/20 hover:border-purple-500/50' :
                project.color === 'green'  ? 'border-green-500/20 hover:border-green-500/50'  :
                                             'border-blue-500/20 hover:border-blue-500/50' // default blue
            )}
            onClick={() => onOpen(project.id)}
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colorClass[project.color])}>
                        <FolderKanban className="w-5 h-5" />
                    </div>
                    {isTeamProject && (
                        <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-tight border border-primary/20">
                            <Users className="w-3 h-3" />
                            <span className="truncate max-w-[110px]">{teamLabel}</span>
                        </div>
                    )}
                </div>
                {isOwner && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                        onClick={e => {
                            e.stopPropagation();
                            deleteProject.mutate(project.id);
                        }}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            <h3 className="font-semibold text-foreground text-base mb-1.5 truncate">{project.title}</h3>
            {project.description && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{project.description}</p>
            )}

            <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground pt-2">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        <span>{formatTimeAgo(project.updatedAt || project.updated_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{project.chatCount ?? project.chat_count ?? 0} chat{(project.chatCount ?? project.chat_count) !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                {!isOwner && (project.owner_name || project.owner_email) && (
                    <span className="text-[11px] text-muted-foreground/70 truncate max-w-[100px]" title={project.owner_name || project.owner_email || ''}>
                        by {project.owner_name || project.owner_email}
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AIChatProjectsProps {
    onOpenProject?: (projectId: string) => void;
}

export function AIChatProjects({ onOpenProject }: AIChatProjectsProps) {
    const [showCreate, setShowCreate] = useState(false);
    const { data: projects, isLoading } = useProjects();

    return (
        <main className="flex-1 flex flex-col h-full bg-background overflow-hidden">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-6 shrink-0 border-b border-border/40">
                <h2 className="text-sm font-semibold text-foreground">Projects</h2>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-5xl mx-auto flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">Your Projects</h2>
                        <p className="text-muted-foreground text-sm">
                            Organize your chats and analysis into shared workspaces.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-2">
                        {/* Create card or inline form */}
                        {showCreate ? (
                            <CreateProjectForm onClose={() => setShowCreate(false)} />
                        ) : (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="group relative border border-dashed border-border/80 hover:border-primary/50 bg-muted/5 hover:bg-muted/10 rounded-2xl flex flex-col items-center justify-center min-h-[220px] transition-all duration-300 cursor-pointer gap-4 text-muted-foreground hover:text-foreground overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="w-14 h-14 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center group-hover:scale-110 group-hover:border-border/80 transition-all">
                                    <Plus className="w-6 h-6 text-foreground/70 group-hover:text-foreground transition-colors" />
                                </div>
                                <span className="font-semibold text-sm tracking-tight">Create New Project</span>
                            </button>
                        )}

                        {/* Loading skeletons */}
                        {isLoading && [1, 2].map(i => (
                            <div key={i} className="border border-border/60 rounded-2xl p-5 min-h-[200px] animate-pulse bg-muted/20" />
                        ))}

                        {/* Real project cards */}
                        {projects?.map(project => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                onOpen={(id) => onOpenProject?.(id)}
                            />
                        ))}
                    </div>

                    {!isLoading && projects?.length === 0 && !showCreate && (
                        <p className="text-sm text-muted-foreground px-1 mt-2">
                            No projects yet. Create one to start organising your work.
                        </p>
                    )}
                </div>
            </div>
        </main>
    );
}

