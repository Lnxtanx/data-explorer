import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Shield, Trash2, UserPlus, Users, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export function CollaborationSettings() {
    const { user } = useAuth();
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string>('');
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
    
    // Team creation state
    const [isCreatingTeam, setIsCreatingTeam] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [submittingCreate, setSubmittingCreate] = useState(false);

    const [currentRole, setCurrentRole] = useState<TeamMember['role']>('member');
    const [loading, setLoading] = useState(false);
    
    // Invitation state
    const [submittingInvite, setSubmittingInvite] = useState(false);
    const [email, setEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

    const selectedTeam = useMemo(
        () => teams.find(team => team.id === selectedTeamId) || null,
        [teams, selectedTeamId]
    );

    const canManage = currentRole === 'owner' || currentRole === 'admin';

    const loadTeams = useCallback(async () => {
        if (!user) return;
        try {
            const { teams: loadedTeams } = await listTeams();
            setTeams(loadedTeams);
            
            if (loadedTeams.length > 0 && !selectedTeamId) {
                setSelectedTeamId(loadedTeams[0].id);
            }
        } catch (error) {
            console.error('[CollaborationSettings] Failed to load teams:', error);
            toast.error('Failed to load your teams');
        }
    }, [user, selectedTeamId]);

    useEffect(() => {
        loadTeams();
    }, [loadTeams]);

    const loadTeamData = useCallback(async () => {
        if (!selectedTeamId || !user) {
            setMembers([]);
            return;
        }

        setLoading(true);
        try {
            const [membersResponse, invitationsResponse] = await Promise.all([
                getTeamMembers(selectedTeamId),
                canManage ? getTeamInvitations(selectedTeamId) : Promise.resolve({ invitations: [] }),
            ]);
            setMembers(membersResponse.members);
            setInvitations(invitationsResponse?.invitations || []);
            setCurrentRole(membersResponse.currentRole);
        } catch (error) {
            console.error('[CollaborationSettings] Failed to load team collaboration settings:', error);
            toast.error('Failed to load team collaborators');
        } finally {
            setLoading(false);
        }
    }, [selectedTeamId, user, canManage]);

    useEffect(() => {
        loadTeamData();
    }, [loadTeamData]);
    
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
            console.error('[CollaborationSettings] Failed to create team:', error);
            toast.error('Failed to create team');
        } finally {
            setSubmittingCreate(false);
        }
    }

    const handleInvite = async () => {
        if (!selectedTeamId) return;

        setSubmittingInvite(true);
        try {
            const result = await inviteTeamMember(selectedTeamId, {
                email,
                role: inviteRole,
            });

            setEmail('');
            await loadTeamData();

            if (result.success) {
                toast.success(result.message || 'Team member added');
            }
        } catch (error) {
            console.error('[CollaborationSettings] Failed to add member:', error);
            toast.error('Failed to add team member');
        } finally {
            setSubmittingInvite(false);
        }
    };

    const handleRemoveMember = async (member: TeamMember) => {
        if (!selectedTeamId) return;

        try {
            await removeTeamMember(selectedTeamId, member.user_id);
            setMembers(previous => previous.filter(item => item.user_id !== member.user_id));
            toast.success('Member removed');
        } catch (error) {
            console.error('[CollaborationSettings] Failed to remove member:', error);
            toast.error('Failed to remove member. You may verify ownership.');
        }
    };

    const handleRevokeInvite = async (inviteId: string) => {
        if (!selectedTeamId) return;

        try {
            await revokeTeamInvitation(selectedTeamId, inviteId);
            setInvitations(previous => previous.filter(item => item.id !== inviteId));
            toast.success('Invitation revoked');
        } catch (error) {
            console.error('[CollaborationSettings] Failed to revoke invitation:', error);
            toast.error('Failed to revoke invitation');
        }
    };

    if (!user) {
        return (
            <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">Collaboration</h3>
                <Alert>
                    <AlertDescription>Sign in to manage team members.</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="space-y-2 flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Teams & Collaboration</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage your teams, assign roles, and add members. Use these to share database connections.
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIsCreatingTeam(!isCreatingTeam)} className="hover:bg-primary/5">
                    <Plus className="mr-2 h-4 w-4" />
                    New Team
                </Button>
            </div>
            
            {isCreatingTeam && (
                <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-5 space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-300">
                    <h4 className="text-sm font-medium">Create a New Team</h4>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Engineering Team, Startup LLC, etc."
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                            disabled={submittingCreate}
                            className="flex-1"
                        />
                        <Button onClick={handleCreateTeam} disabled={!newTeamName.trim() || submittingCreate} className="shrink-0">
                            {submittingCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Team'}
                        </Button>
                    </div>
                </div>
            )}

            {teams.length === 0 ? (
                <Alert>
                    <AlertDescription>Create a team to enable collaboration across database connections.</AlertDescription>
                </Alert>
            ) : (
                <>
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                        <div className="rounded-xl border bg-card/30 p-5 space-y-4 shadow-sm transition-all hover:shadow-md">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Users className="h-4 w-4" />
                                Active Team
                            </div>
                            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                                <SelectTrigger className="bg-background/50 border-none shadow-inner">
                                    <SelectValue placeholder="Select a team" />
                                </SelectTrigger>
                                <SelectContent>
                                    {teams.map(team => (
                                        <SelectItem key={team.id} value={team.id}>
                                            {team.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedTeam && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary" className="bg-primary/5 text-primary border-none">{selectedTeam.role || 'member'}</Badge>
                                    {selectedTeam.is_owner && <Badge className="bg-amber-500/10 text-amber-600 border-none">Owner</Badge>}
                                </div>
                            )}
                        </div>

                        <div className="rounded-xl border bg-card/30 p-5 space-y-3 shadow-sm transition-all hover:shadow-md">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Shield className="h-4 w-4" />
                                Your access level
                            </div>
                            <div className="text-3xl font-bold tracking-tight capitalize bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">{currentRole}</div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {canManage
                                    ? 'Full management privileges. You can invite and remove team members.'
                                    : 'Read-only access to collaborator list. Only admins can make changes.'}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card/50 p-6 space-y-5 shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <UserPlus className="h-4 w-4 text-primary" />
                            Add Teammate
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="name@company.com"
                                disabled={!canManage || submittingInvite}
                                className="flex-1"
                            />
                            <div className="flex gap-2">
                                <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as 'admin' | 'member')} disabled={!canManage || submittingInvite}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="member">member</SelectItem>
                                        <SelectItem value="admin">admin</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button onClick={handleInvite} disabled={!canManage || !email.trim() || submittingInvite} className="gap-2">
                                    {submittingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                    Invite
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card/30 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 bg-muted/30 border-b">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <Users className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm">Team Members</h4>
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Access Control</p>
                                </div>
                            </div>
                            <Badge variant="secondary" className="px-2.5 py-0.5 rounded-full bg-muted border-none font-bold tabular-nums">
                                {members.length}
                            </Badge>
                        </div>
                        <ScrollArea className="h-[280px]">
                            <div className="p-4 space-y-3">
                                {loading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading collaborators...
                                    </div>
                                ) : members.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No members found for this team.</p>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Confirmed Members */}
                                        <div className="space-y-3">
                                            {members.map(member => {
                                                const isSelf = user?.id === member.user_id;
                                                const canDelete = canManage && !member.is_owner && (!isSelf || currentRole === 'owner');

                                                return (
                                                    <div key={member.user_id} className="group flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-border hover:bg-background/50 transition-all duration-200">
                                                        <div className="flex items-center gap-4 min-0">
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-lg shrink-0 overflow-hidden">
                                                                {member.avatar_url ? (
                                                                    <img src={member.avatar_url} alt={member.full_name || ''} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    (member.full_name || member.email || '?')[0].toUpperCase()
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="font-semibold truncate text-sm flex items-center gap-2">
                                                                    {member.full_name || 'Incognito User'}
                                                                    {isSelf && <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-bold">YOU</Badge>}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground truncate opacity-70">{member.email || 'No email shared'}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-right hidden sm:block">
                                                                {member.is_owner ? (
                                                                    <Badge className="bg-amber-500/10 text-amber-600 border-none font-bold uppercase text-[9px]">Owner</Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="opacity-60 uppercase text-[9px] font-bold font-mono tracking-tighter">{member.role}</Badge>
                                                                )}
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleRemoveMember(member)}
                                                                disabled={!canDelete}
                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Pending Invitations */}
                                        {invitations.filter(i => i.status === 'pending').length > 0 && (
                                            <div className="space-y-3 pt-4 border-t border-dashed">
                                                <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest pl-2">Pending Invitations</h5>
                                                {invitations.filter(i => i.status === 'pending').map(invite => (
                                                    <div key={invite.id} className="group flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-border hover:bg-background/40 transition-all duration-200 opacity-80">
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-lg shrink-0 border border-dashed">
                                                                <Mail className="w-5 h-5 opacity-40" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="font-medium truncate text-sm text-foreground/80">
                                                                    {invite.email}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                                    Invited as <span className="capitalize">{invite.role}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-500 bg-amber-500/5 px-1.5 py-0">PENDING</Badge>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleRevokeInvite(invite.id)}
                                                                disabled={!canManage}
                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </>
            )}
        </div>
    );
}
