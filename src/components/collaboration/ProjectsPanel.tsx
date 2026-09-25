import { useMemo } from 'react';
import { RefreshCw, MessageSquare, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/auth/AuthProvider';
import { SectionLabel } from './primitives';
import { cn } from '@/lib/utils';
import type { QueryClient } from '@tanstack/react-query';
import type { AIProject } from '../ai/api/projects';
import type { Connection } from '../connector/api/useConnections';

interface ProjectsPanelProps {
    allProjects: AIProject[];
    projectsLoading: boolean;
    selectedTeamId: string | null;
    connections: Connection[] | undefined;
    canManage: boolean;
    handleToggleProjectTeam: (projectId: string, isLinked: boolean) => void;
    queryClient: QueryClient;
    queryKeys: {
        projects: readonly unknown[];
    };
}

export function ProjectsPanel({
    allProjects,
    projectsLoading,
    selectedTeamId,
    connections,
    handleToggleProjectTeam,
    queryClient,
    queryKeys,
}: ProjectsPanelProps) {
    const { user } = useAuth();

    const visibleProjects = useMemo(() => {
        if (!selectedTeamId) return [];
        return allProjects.filter(project => {
            if (project.team_id === selectedTeamId) return true;
            const isMyProject = !project.user_id || project.user_id === user?.id;
            if (isMyProject && !project.team_id) return true;
            return false;
        });
    }, [allProjects, selectedTeamId, user?.id]);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
                <SectionLabel>AI Projects ({visibleProjects.length})</SectionLabel>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.projects })}
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                    title="Refresh projects list"
                    aria-label="Refresh projects list"
                >
                    <RefreshCw className="h-3 w-3" />
                    <span>Refresh</span>
                </Button>
            </div>

            <div className="rounded-xl border bg-card/40 overflow-hidden divide-y divide-border/60">
                {projectsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3.5">
                            <Skeleton className="h-8 w-8 rounded-lg" />
                            <div className="space-y-1.5 flex-1">
                                <Skeleton className="h-3 w-28" />
                                <Skeleton className="h-2.5 w-40" />
                            </div>
                        </div>
                    ))
                ) : visibleProjects.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-xs space-y-1">
                        <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="font-medium">No AI projects available for this team</p>
                        <p className="text-[11px] text-muted-foreground/70">Create a chat project to share it with this team.</p>
                    </div>
                ) : (
                    visibleProjects.map(project => {
                        const isLinked = project.team_id === selectedTeamId;
                        const conn = connections?.find(c => c.id === (project.connection_id || project.connectionId));

                        return (
                            <div key={project.id} className="flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                        isLinked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                    )}>
                                        <MessageSquare className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 space-y-0.5">
                                        <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                                            <span className="truncate">{project.title}</span>
                                            {isLinked && (
                                                <Badge className="bg-primary/10 text-primary border-none text-[9.5px] font-medium uppercase px-1.5 py-0 shrink-0">Shared</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {conn ? (
                                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono bg-muted/40 px-1.5 py-0.2 rounded max-w-[200px] truncate">
                                                    <Database className="w-2.5 h-2.5 text-primary shrink-0" />
                                                    <span className="truncate">{conn.name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-muted-foreground/70">General Workspace</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant={isLinked ? "outline" : "default"}
                                    size="sm"
                                    onClick={() => handleToggleProjectTeam(project.id, isLinked)}
                                    className={cn(
                                        "h-7 px-3 rounded-lg text-xs font-medium shrink-0 ml-3",
                                        isLinked && "text-muted-foreground hover:text-destructive hover:border-destructive/30"
                                    )}
                                    aria-label={isLinked ? `Unshare ${project.title}` : `Share ${project.title} with team`}
                                >
                                    {isLinked ? 'Unshare' : 'Share with Team'}
                                </Button>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
