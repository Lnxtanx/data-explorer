import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Loader2, Mail, Shield, Trash2, UserPlus, Users, Plus, 
    Database, Settings2, Lock, Globe, CheckSquare, Square, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    listTeams,
    createTeam,
    getTeamMembers,
    inviteTeamMember,
    removeTeamMember,
    Team,
    TeamMember,
    TeamInvitation,
    getTeamInvitations,
    revokeTeamInvitation,
} from '@/lib/api/projects/collaboration';
import { useAuth } from '@/components/auth/AuthProvider';
import { listProjects, updateProject } from '@/lib/api/projects';
import { useConnections } from '@/lib/api/data/connection';

const queryKeys = {
    teams: ['collaboration', 'teams'],
    members: (teamId: string) => ['collaboration', 'members', teamId],
    invites: (teamId: string) => ['collaboration', 'invites', teamId],
    projects: ['collaboration', 'projects'],
};

export function CollaborationSettings() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [selectedTeamId, setSelectedTeamId] = useState<string>('');
    const [isCreatingTeam, setIsCreatingTeam] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [email, setEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

    // ─── Data Fetching (React Query) ─────────────────────────────────────────

    const { data: teams = [] } = useQuery({
        queryKey: queryKeys.teams,
        queryFn: async () => {
            const res = await listTeams();
            if (res.teams.length > 0 && !selectedTeamId) setSelectedTeamId(res.teams[0].id);
            return res.teams;
        },
        enabled: !!user,
    });

    const selectedTeam = useMemo(() => teams.find(t => t.id === selectedTeamId), [teams, selectedTeamId]);

    const { data: memberData, isLoading: membersLoading } = useQuery({
        queryKey: queryKeys.members(selectedTeamId),
        queryFn: () => getTeamMembers(selectedTeamId),
        enabled: !!selectedTeamId,
    });

    const members = memberData?.members || [];
    const currentRole = memberData?.currentRole || 'member';
    const canManage = currentRole === 'owner' || currentRole === 'admin';

    const { data: invitations = [] } = useQuery({
        queryKey: queryKeys.invites(selectedTeamId),
        queryFn: async () => {
            const res = await getTeamInvitations(selectedTeamId);
            return res.invitations;
        },
        enabled: !!selectedTeamId && canManage,
    });

    const { data: allProjects = [], isLoading: projectsLoading } = useQuery({
        queryKey: queryKeys.projects,
        queryFn: async () => {
            const res = await listProjects();
            return res.projects;
        },
        enabled: !!user,
    });

    const { data: connections } = useConnections();

    // ─── Mutations (Optimistic Updates) ──────────────────────────────────────

    const toggleProjectMutation = useMutation({
        mutationFn: ({ id, isLinked }: { id: string, isLinked: boolean }) => 
            updateProject(id, { teamId: isLinked ? null : selectedTeamId } as any),
        onMutate: async ({ id, isLinked }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.projects });
            const previous = queryClient.getQueryData(queryKeys.projects);
            queryClient.setQueryData(queryKeys.projects, (old: any[]) => 
                old.map(p => p.id === id ? { ...p, team_id: isLinked ? null : selectedTeamId } : p)
            );
            return { previous };
        },
        onError: (err, variables, context) => {
            queryClient.setQueryData(queryKeys.projects, context?.previous);
            toast.error('Failed to update project');
        },
        onSuccess: () => toast.success('Project shared updated')
    });

    const inviteMutation = useMutation({
        mutationFn: (data: { email: string, role: any }) => inviteTeamMember(selectedTeamId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.invites(selectedTeamId) });
            setEmail('');
            toast.success('Invitation sent');
        },
        onError: (err: any) => toast.error(err.message || 'Failed to send invite')
    });

    // ... (rest of logic remains but uses mutations for instant feedback)
    
    const handleCreateTeam = async () => {
        if (!newTeamName.trim()) return;
        setSubmittingCreate(true);
        try {
            const { team } = await createTeam({ name: newTeamName });
            setNewTeamName('');
            setIsCreatingTeam(false);
            await loadTeams();
            setSelectedTeamId(team.id);
            toast.success('Team created successfully!');
        } catch (error) {
            toast.error('Failed to create team');
        } finally {
            setSubmittingCreate(false);
        }
    }

    const handleInvite = async () => {
        if (!selectedTeamId) return;
        setSubmittingInvite(true);
        try {
            await inviteTeamMember(selectedTeamId, { email, role: inviteRole });
            setEmail('');
            await loadTeamData();
            toast.success('Invitation sent');
        } catch (error: any) {
            toast.error(error.message || 'Failed to add team member');
        } finally {
            setSubmittingInvite(false);
        }
    };

    const handleToggleProjectTeam = async (projectId: string, isLinked: boolean) => {
        if (!selectedTeamId || !canManage) return;
        try {
            await updateProject(projectId, { teamId: isLinked ? null : selectedTeamId } as any);
            toast.success(isLinked ? 'Project removed from team' : 'Project added to team');
            await loadTeamData();
        } catch (error) {
            toast.error('Failed to update project');
        }
    };

    const sharedConnections = useMemo(() => {
        const teamProjects = allProjects.filter(p => p.team_id === selectedTeamId);
        const uniqueConnIds = new Set(teamProjects.map(p => p.connection_id || p.connectionId).filter(Boolean));
        
        return Array.from(uniqueConnIds).map(id => {
            const conn = connections?.find(c => c.id === id);
            return {
                id,
                name: conn?.name || 'Shared Connection',
                database: conn?.database || 'postgres'
            };
        });
    }, [allProjects, selectedTeamId, connections]);

    if (!user) return <div className="p-6 text-center text-muted-foreground font-medium">Sign in to manage team collaboration.</div>;

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight">Teams & Shared Resources</h3>
                    <p className="text-sm text-muted-foreground">Manage your workspace teams and which projects are shared with them.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsCreatingTeam(!isCreatingTeam)} className="h-8 rounded-lg border-dashed">
                    <Plus className="mr-2 h-3.5 w-3.5" /> New Team
                </Button>
            </div>

            {isCreatingTeam && (
                <div className="rounded-xl border bg-primary/5 p-5 space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-semibold">Create a New Team</h4>
                        <p className="text-xs text-muted-foreground">Teams allow you to share database connections and projects with colleagues.</p>
                    </div>
                    <div className="flex gap-2">
                        <Input placeholder="Engineering, Marketing, etc." value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className="h-9 bg-background" />
                        <Button onClick={handleCreateTeam} disabled={!newTeamName.trim() || submittingCreate} className="h-9">
                            {submittingCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Team'}
                        </Button>
                    </div>
                </div>
            )}

            {teams.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-muted/20 text-center space-y-4">
                    <Users className="h-10 w-10 text-muted-foreground/30" />
                    <div className="space-y-1">
                        <p className="text-sm font-medium">No teams found</p>
                        <p className="text-xs text-muted-foreground max-w-[250px]">Create a team to start sharing your database projects with others.</p>
                    </div>
                    {!isCreatingTeam && (
                        <Button onClick={() => setIsCreatingTeam(true)} size="sm">Create First Team</Button>
                    )}
                </div>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border bg-card/30 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                <Users className="h-3 w-3" /> Active Team
                            </div>
                            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                                <SelectTrigger className="bg-background/50 border-none h-10 font-semibold focus:ring-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="rounded-xl border bg-card/30 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                <Shield className="h-3 w-3" /> Your Permission
                            </div>
                            <div className="flex items-center gap-2 h-10">
                                <span className="font-bold text-lg capitalize">{currentRole}</span>
                                {selectedTeam?.is_owner && <Badge className="bg-amber-500/10 text-amber-600 border-none h-5 px-1.5 text-[9px] font-black">OWNER</Badge>}
                            </div>
                        </div>
                    </div>

                    <Tabs defaultValue="members" className="w-full">
                        <TabsList className="bg-muted/50 p-1 rounded-xl mb-6 w-full sm:w-auto">
                            <TabsTrigger value="members" className="rounded-lg px-6 py-2 text-xs font-semibold">Members</TabsTrigger>
                            <TabsTrigger value="projects" className="rounded-lg px-6 py-2 text-xs font-semibold">Share Projects</TabsTrigger>
                            <TabsTrigger value="connections" className="rounded-lg px-6 py-2 text-xs font-semibold">Shared DBs</TabsTrigger>
                        </TabsList>

                        <TabsContent value="members" className="space-y-6 animate-in fade-in duration-300">
                            {canManage && (
                                <div className="rounded-xl border bg-card/50 p-5 space-y-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 text-sm font-semibold">
                                            <UserPlus className="h-4 w-4 text-primary" /> 
                                            Invite Member
                                        </div>
                                        <p className="text-xs text-muted-foreground">Send an invite to someone's email to join this team.</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" className="flex-1 h-10 bg-background" />
                                        <Select value={inviteRole} onValueChange={v => setInviteRole(v as any)}>
                                            <SelectTrigger className="w-[110px] h-10 bg-background"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="member">Member</SelectItem>
                                                <SelectItem value="admin" disabled={currentRole !== 'owner'}>Admin</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Button onClick={handleInvite} disabled={!email.trim() || submittingInvite} className="h-10 px-6 font-semibold">
                                            {submittingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invite'}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Active Members ({members.length})</h4>
                                <div className="rounded-xl border bg-card/30 overflow-hidden divide-y divide-border/40">
                                    {members.map(member => (
                                        <div key={member.user_id} className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase">
                                                    {(member.full_name || member.email || '?')[0]}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold">{member.full_name || 'Team Member'}</div>
                                                    <div className="text-xs text-muted-foreground">{member.email}</div>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className="text-[10px] font-black uppercase h-5 px-2 bg-muted/50 border-none tracking-tight">
                                                {member.role}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="projects" className="space-y-4 animate-in fade-in duration-300">
                            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex gap-3">
                                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-primary">Manage Team Projects</p>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Linking a project to this team grants all members <b>Editor</b> access. 
                                        Members can view all database connections linked to these projects.
                                    </p>
                                </div>
                            </div>

                            <ScrollArea className="h-[350px] rounded-xl border bg-card/30">
                                <div className="p-4 space-y-3">
                                    {allProjects.length === 0 ? (
                                        <div className="py-20 text-center text-muted-foreground italic text-xs">
                                            No AI projects found.
                                        </div>
                                    ) : (
                                        allProjects.map(project => {
                                            const isLinked = project.team_id === selectedTeamId;
                                            const isOtherTeam = project.team_id && project.team_id !== selectedTeamId;
                                            const conn = connections?.find(c => c.id === (project.connection_id || project.connectionId));

                                            return (
                                                <div key={project.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isLinked ? 'bg-primary/5 border-primary/20 shadow-sm' : 'bg-background hover:bg-muted/10'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-2.5 rounded-lg ${isLinked ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                            <Settings2 className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold flex items-center gap-2">
                                                                {project.title}
                                                                {isLinked && <Badge className="bg-primary/10 text-primary border-none text-[8px] h-4 uppercase font-black">Shared</Badge>}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                                                                    <Database className="w-2.5 h-2.5" />
                                                                    {conn?.name || 'No Database'}
                                                                </div>
                                                                {isOtherTeam && <Badge className="h-4 text-[8px] bg-muted text-muted-foreground border-none">SHARED ELSEWHERE</Badge>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Button 
                                                        variant={isLinked ? "destructive" : "outline"} 
                                                        size="sm" 
                                                        disabled={(isOtherTeam || !canManage) && !selectedTeam?.is_owner}
                                                        onClick={() => handleToggleProjectTeam(project.id, isLinked)}
                                                        className={`h-8 px-4 rounded-lg text-[10px] font-bold ${!isLinked && 'border-primary/20 text-primary hover:bg-primary/5'}`}
                                                    >
                                                        {isLinked ? 'Unshare' : 'Share with Team'}
                                                    </Button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="connections" className="space-y-4 animate-in fade-in duration-300">
                            <div className="rounded-xl border bg-card/30 overflow-hidden shadow-sm">
                                <div className="px-5 py-4 bg-muted/40 border-b flex items-center justify-between">
                                    <div className="flex items-center gap-2 font-bold text-sm">
                                        <Database className="w-4 h-4 text-primary" />
                                        Shared Databases
                                    </div>
                                    <Badge variant="outline" className="font-mono text-[10px]">{sharedConnections.length} Active</Badge>
                                </div>
                                <div className="p-4 bg-background/50">
                                    {sharedConnections.length === 0 ? (
                                        <div className="text-center py-16 opacity-50 space-y-3">
                                            <Database className="w-10 h-10 mx-auto mb-2 opacity-10" />
                                            <p className="text-sm font-medium">No databases shared</p>
                                            <p className="text-[10px] max-w-[250px] mx-auto leading-relaxed">
                                                Databases are shared automatically when you link an AI project that uses them in the <b>Share Projects</b> tab.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {sharedConnections.map(conn => (
                                                <div key={conn.id} className="p-4 rounded-xl border bg-card/50 flex items-center gap-3 group hover:border-primary/20 transition-colors">
                                                    <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                                                        <Database className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-black truncate">{conn.name}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono truncate opacity-70">{conn.database}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </>
            )}
        </div>
    );
}
