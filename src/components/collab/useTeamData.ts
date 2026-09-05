import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    listTeams, createTeam, getTeamMembers, inviteTeamMember,
    removeTeamMember, updateTeamMemberRole, leaveTeam, deleteTeam,
    renameTeam, getTeamSeats, getTeamInvitations, revokeTeamInvitation,
    listTeamAgentShares, shareAgentWithTeam, unshareAgentFromTeam,
} from '@/lib/api/projects/collaboration';
import { useAuth } from '@/components/auth/AuthProvider';
import { listProjects, updateProject } from '@/lib/api/projects';
import { useConnections } from '@/lib/api/data/connection';
import { useConnectors, connectorKeys } from '@/lib/api/connector';
import { queryKeys, EMAIL_REGEX } from './types';
import type { LastInvite, SharedConn, AgentEntry } from './types';

export function useTeamData() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [isCreatingTeam, setIsCreatingTeam] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [email, setEmail] = useState('');
    const [lastInvite, setLastInvite] = useState<LastInvite | null>(null);
    const [copiedLink, setCopiedLink] = useState(false);
    const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
    const [submittingInvite, setSubmittingInvite] = useState(false);
    const [submittingCreate, setSubmittingCreate] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRefreshingDbs, setIsRefreshingDbs] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    // ─── Queries ──────────────────────────────────────────────────────────

    const { data: teams = [], isLoading: teamsLoading } = useQuery({
        queryKey: queryKeys.teams,
        queryFn: async () => {
            const res = await listTeams();
            if (res.teams.length > 0 && !selectedTeamId) setSelectedTeamId(res.teams[0].id);
            return res.teams;
        },
        enabled: !!user,
        refetchOnWindowFocus: true,
    });

    const selectedTeam = useMemo(() => teams.find(t => t.id === selectedTeamId), [teams, selectedTeamId]);

    const { data: memberData, isLoading: membersLoading } = useQuery({
        queryKey: queryKeys.members(selectedTeamId),
        queryFn: () => getTeamMembers(selectedTeamId),
        enabled: !!selectedTeamId,
        refetchOnWindowFocus: true,
    });

    const members = memberData?.members || [];
    const currentRole = memberData?.currentRole || null;
    const canManage = currentRole === 'owner' || currentRole === 'admin';

    const { data: invitations = [], isLoading: invitesLoading } = useQuery({
        queryKey: queryKeys.invites(selectedTeamId),
        queryFn: async () => {
            const res = await getTeamInvitations(selectedTeamId);
            return res.invitations;
        },
        enabled: !!selectedTeamId && canManage,
        refetchOnWindowFocus: true,
    });

    const pendingInvites = useMemo(
        () => invitations.filter(i => i.status === 'pending'),
        [invitations]
    );

    const { data: seatsData } = useQuery({
        queryKey: queryKeys.seats(selectedTeamId),
        queryFn: () => getTeamSeats(selectedTeamId),
        enabled: !!selectedTeamId,
    });
    const seatsFull = !!seatsData && seatsData.occupied >= seatsData.seats;

    const { data: allProjects = [], isLoading: projectsLoading } = useQuery({
        queryKey: queryKeys.projects,
        queryFn: async () => {
            const res = await listProjects();
            return res.projects;
        },
        enabled: !!user,
    });

    const visibleProjects = useMemo(() => {
        if (!selectedTeamId) return [];
        return allProjects.filter(project => {
            if (project.team_id === selectedTeamId) return true;
            const isMyProject = !project.user_id || project.user_id === user?.id;
            if (isMyProject && !project.team_id) return true;
            return false;
        });
    }, [allProjects, selectedTeamId, user?.id]);

    const { data: connections } = useConnections();
    const { data: connectors = [] } = useConnectors();

    const myAgents = useMemo(() => {
        const seen = new Set<string>();
        return connectors.filter((a) => {
            if (a.status === 'revoked' || a.access_type === 'team') return false;
            if (seen.has(a.agent_id)) return false;
            seen.add(a.agent_id);
            return true;
        });
    }, [connectors]);

    const { data: agentSharesData, isLoading: agentSharesLoading } = useQuery({
        queryKey: queryKeys.agentShares(selectedTeamId),
        queryFn: () => listTeamAgentShares(selectedTeamId),
        enabled: !!selectedTeamId,
    });
    const agentShares = agentSharesData?.agents || [];
    const sharedAgentIds = useMemo(
        () => new Set(agentShares.map((s) => s.agent_id)),
        [agentShares]
    );

    const allAgentEntries = useMemo(() => {
        const list: AgentEntry[] = [];
        const addedAgentIds = new Set<string>();

        for (const a of myAgents) {
            const share = agentShares.find(s => s.agent_id === a.agent_id);
            list.push({
                id: a.id, agent_id: a.agent_id, machine_label: a.machine_label,
                is_online: a.is_online, is_shared: Boolean(share),
                share_id: share?.id, shared_by_name: share?.shared_by_name ?? null, is_own: true,
            });
            addedAgentIds.add(a.agent_id);
        }
        for (const s of agentShares) {
            if (!addedAgentIds.has(s.agent_id)) {
                const conn = connectors.find(c => c.agent_id === s.agent_id);
                list.push({
                    id: s.id, agent_id: s.agent_id,
                    machine_label: s.machine_label || 'SW-Agent',
                    is_online: conn?.is_online, is_shared: true,
                    share_id: s.id, shared_by_name: s.shared_by_name ?? null, is_own: false,
                });
                addedAgentIds.add(s.agent_id);
            }
        }
        return list;
    }, [myAgents, agentShares, connectors]);

    const sharedConnections = useMemo(() => {
        const teamProjects = allProjects.filter(p => p.team_id === selectedTeamId);
        const uniqueConnIds = new Set(
            teamProjects.map(p => p.connection_id || (p as any).connectionId).filter(Boolean)
        );
        const out: SharedConn[] = Array.from(uniqueConnIds).map(id => {
            const conn = connections?.find(c => c.id === id);
            return {
                id, name: conn?.name || 'Shared Connection',
                database: conn?.database || 'postgres', source: 'project' as const,
                sharedBy: null, machineLabel: conn?.machine_label || null, isOnline: conn?.is_online,
            };
        });
        for (const conn of connections || []) {
            const isFromSharedAgent = Boolean(conn.agent_id && sharedAgentIds.has(conn.agent_id));
            const isTeamConnForThisTeam = Boolean(
                conn.access_type === 'team' &&
                (!conn.team_name || (selectedTeam && conn.team_name === selectedTeam.name))
            );
            if ((isFromSharedAgent || isTeamConnForThisTeam) && !out.some(o => o.id === conn.id)) {
                out.push({
                    id: conn.id, name: conn.name, database: conn.database,
                    source: 'agent', sharedBy: (conn as any).shared_by_name || null,
                    machineLabel: conn.machine_label || null, isOnline: conn.is_online,
                });
            }
        }
        return out;
    }, [allProjects, selectedTeamId, selectedTeam, connections, sharedAgentIds]);

    // ─── Reset on team switch ─────────────────────────────────────────────

    useEffect(() => {
        setLastInvite(null);
        setCopiedLink(false);
        setRenameValue(selectedTeam?.name ?? '');
        setDeleteConfirmText('');
    }, [selectedTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Refresh handlers ─────────────────────────────────────────────────

    const handleRefreshAll = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const queries = [
                queryClient.invalidateQueries({ queryKey: queryKeys.teams }),
                queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
                queryClient.invalidateQueries({ queryKey: ['ai', 'projects'] }),
                queryClient.invalidateQueries({ queryKey: connectorKeys.list }),
                queryClient.invalidateQueries({ queryKey: ['connections'] }),
            ];
            if (selectedTeamId) {
                queries.push(
                    queryClient.invalidateQueries({ queryKey: queryKeys.members(selectedTeamId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.invites(selectedTeamId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.seats(selectedTeamId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.agentShares(selectedTeamId) })
                );
            }
            await Promise.all(queries);
            toast.success('Collaboration data updated');
        } catch {
            toast.error('Failed to refresh collaboration data');
        } finally {
            setIsRefreshing(false);
        }
    }, [queryClient, selectedTeamId]);

    const handleRefreshSharedDbs = useCallback(async () => {
        setIsRefreshingDbs(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.agentShares(selectedTeamId) }),
                queryClient.invalidateQueries({ queryKey: connectorKeys.list }),
                queryClient.invalidateQueries({ queryKey: ['connections'] }),
            ]);
            toast.success('Shared databases refreshed');
        } catch {
            toast.error('Failed to refresh shared databases');
        } finally {
            setIsRefreshingDbs(false);
        }
    }, [queryClient, selectedTeamId]);

    // ─── Mutations ────────────────────────────────────────────────────────

    const shareAgentMutation = useMutation({
        mutationFn: (agentId: string) => shareAgentWithTeam(selectedTeamId, agentId),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.agentShares(selectedTeamId) });
            queryClient.invalidateQueries({ queryKey: connectorKeys.list });
            toast.success(res.already_shared ? 'Agent was already shared' : 'Agent shared with team');
        },
        onError: (err: any) => toast.error(err.message || 'Failed to share agent'),
    });

    const unshareAgentMutation = useMutation({
        mutationFn: (shareId: string) => unshareAgentFromTeam(selectedTeamId, shareId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.agentShares(selectedTeamId) });
            queryClient.invalidateQueries({ queryKey: connectorKeys.list });
            toast.success('Agent unshared');
        },
        onError: (err: any) => toast.error(err.message || 'Failed to unshare agent'),
    });

    const removeMemberMutation = useMutation({
        mutationFn: (memberUserId: string) => removeTeamMember(selectedTeamId, memberUserId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.members(selectedTeamId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.projects });
            queryClient.invalidateQueries({ queryKey: queryKeys.seats(selectedTeamId) });
            toast.success('Member removed');
        },
        onError: (err: any) => toast.error(err.message || 'Failed to remove member'),
    });

    const changeRoleMutation = useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'member' }) =>
            updateTeamMemberRole(selectedTeamId, userId, role),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.members(selectedTeamId) });
            toast.success(`Role updated to ${res.role}`);
        },
        onError: (err: any) => toast.error(err.message || 'Failed to change role'),
    });

    const revokeInviteMutation = useMutation({
        mutationFn: (inviteId: string) => revokeTeamInvitation(selectedTeamId, inviteId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.invites(selectedTeamId) });
            toast.success('Invitation revoked');
        },
        onError: (err: any) => toast.error(err.message || 'Failed to revoke invitation'),
    });

    const leaveTeamMutation = useMutation({
        mutationFn: () => leaveTeam(selectedTeamId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.teams });
            queryClient.invalidateQueries({ queryKey: queryKeys.projects });
            setSelectedTeamId('');
            toast.success(`You left ${selectedTeam?.name || 'the team'}`);
        },
        onError: (err: any) => toast.error(err.message || 'Failed to leave team'),
    });

    const deleteTeamMutation = useMutation({
        mutationFn: () => deleteTeam(selectedTeamId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.teams });
            queryClient.invalidateQueries({ queryKey: queryKeys.projects });
            queryClient.invalidateQueries({ queryKey: connectorKeys.list });
            setSelectedTeamId('');
            toast.success('Team deleted');
        },
        onError: (err: any) => toast.error(err.message || 'Failed to delete team'),
    });

    const renameTeamMutation = useMutation({
        mutationFn: () => renameTeam(selectedTeamId, renameValue.trim()),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.teams });
            toast.success('Team renamed');
        },
        onError: (err: any) => toast.error(err.message || 'Failed to rename team'),
    });

    // ─── Action handlers ──────────────────────────────────────────────────

    const handleCreateTeam = async () => {
        if (!newTeamName.trim()) return;
        setSubmittingCreate(true);
        try {
            const { team } = await createTeam({ name: newTeamName });
            setNewTeamName('');
            setIsCreatingTeam(false);
            await queryClient.invalidateQueries({ queryKey: queryKeys.teams });
            setSelectedTeamId(team.id);
            toast.success('Team created successfully!');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to create team');
        } finally {
            setSubmittingCreate(false);
        }
    };

    const handleInvite = async () => {
        if (!selectedTeamId) return;
        const trimmed = email.trim();
        if (!EMAIL_REGEX.test(trimmed)) {
            toast.error('Enter a valid email address');
            return;
        }
        setSubmittingInvite(true);
        try {
            const res = await inviteTeamMember(selectedTeamId, { email: trimmed, role: inviteRole });
            setEmail('');
            await queryClient.invalidateQueries({ queryKey: queryKeys.members(selectedTeamId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.invites(selectedTeamId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.seats(selectedTeamId) });

            const token = res?.invitation?.token;
            const emailStatus = res?.email ?? { configured: true, sent: true };
            const rawLink = res?.invitation?.link || (token ? `/?teamInvite=${token}` : '');
            const fullLink = rawLink
                ? (rawLink.startsWith('http') ? rawLink : `${window.location.origin}${rawLink.startsWith('/') ? '' : '/'}${rawLink}`)
                : (token ? `${window.location.origin}/?teamInvite=${token}` : '');

            setLastInvite(fullLink
                ? { link: fullLink, emailSent: !!emailStatus.sent, emailConfigured: !!emailStatus.configured }
                : null);

            if (!emailStatus.configured) {
                toast.warning('Invite created — email not configured. Share the link below.');
            } else if (!emailStatus.sent) {
                toast.warning('Invite created — email failed to send. Share the link below.');
            } else {
                toast.success('Invitation sent');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to add team member');
        } finally {
            setSubmittingInvite(false);
        }
    };

    const copyInviteLink = async (link?: string) => {
        const target = link || lastInvite?.link;
        if (!target) return;
        try {
            await navigator.clipboard.writeText(target);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2000);
            toast.success('Invite link copied');
        } catch {
            toast.error('Could not copy link');
        }
    };

    const handleToggleProjectTeam = async (projectId: string, isLinked: boolean) => {
        if (!selectedTeamId) return;
        try {
            await updateProject(projectId, { teamId: isLinked ? null : selectedTeamId });
            toast.success(isLinked ? 'Project removed from team' : 'Project added to team');
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
                queryClient.invalidateQueries({ queryKey: ['ai', 'projects'] }),
            ]);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update project');
        }
    };

    return {
        user, queryClient, selectedTeamId, setSelectedTeamId,
        isCreatingTeam, setIsCreatingTeam, newTeamName, setNewTeamName,
        email, setEmail, lastInvite, setLastInvite,
        copiedLink, inviteRole, setInviteRole,
        submittingInvite, submittingCreate,
        isRefreshing, isRefreshingDbs,
        renameValue, setRenameValue, deleteConfirmText, setDeleteConfirmText,
        // Queries
        teams, teamsLoading, selectedTeam, members, membersLoading,
        currentRole, canManage, invitations, invitesLoading,
        pendingInvites, seatsData, seatsFull,
        allProjects, projectsLoading, visibleProjects,
        connections, connectors, myAgents,
        agentShares, agentSharesLoading, sharedAgentIds, allAgentEntries,
        sharedConnections,
        // Refresh
        handleRefreshAll, handleRefreshSharedDbs,
        // Mutations
        shareAgentMutation, unshareAgentMutation,
        removeMemberMutation, changeRoleMutation, revokeInviteMutation,
        leaveTeamMutation, deleteTeamMutation, renameTeamMutation,
        // Handlers
        handleCreateTeam, handleInvite, copyInviteLink, handleToggleProjectTeam,
    };
}
