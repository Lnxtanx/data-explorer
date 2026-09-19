import { Loader2, Users, Shield, Plus, RefreshCw, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { SectionLabel, ConfirmAction } from '../collab/primitives';
import { MembersPanel } from '../collab/MembersPanel';
import { AgentSharesPanel } from '../collab/AgentSharesPanel';
import { ProjectsPanel } from '../collab/ProjectsPanel';
import { ConnectionsPanel } from '../collab/ConnectionsPanel';
import { useTeamData } from '../collab/useTeamData';
import { EMAIL_REGEX, queryKeys } from '../collab/types';

export function CollaborationSettings() {
    const { user, signInWithGoogle, signInWithGithub } = useAuth();
    const data = useTeamData();

    const {
        teams, teamsLoading, selectedTeamId, setSelectedTeamId, selectedTeam,
        isCreatingTeam, setIsCreatingTeam, newTeamName, setNewTeamName,
        handleCreateTeam, submittingCreate,
        currentRole, canManage,
        members, membersLoading, removeMemberMutation, changeRoleMutation,
        email, setEmail, inviteRole, setInviteRole,
        handleInvite, submittingInvite, lastInvite, copiedLink, copyInviteLink,
        pendingInvites, invitesLoading, revokeInviteMutation,
        seatsData, seatsFull,
        leaveTeamMutation,
        allAgentEntries, agentSharesLoading, shareAgentMutation, unshareAgentMutation,
        allProjects, projectsLoading, visibleProjects, handleToggleProjectTeam,
        sharedConnections, connections,
        isRefreshingDbs, handleRefreshSharedDbs,
        isRefreshing, handleRefreshAll,
        renameValue, setRenameValue, renameTeamMutation,
        deleteConfirmText, setDeleteConfirmText, deleteTeamMutation,
        queryClient,
    } = data;

    const isOwner = selectedTeam?.is_owner ?? currentRole === 'owner';
    const canChangeRoles = currentRole === 'owner';
    const emailValid = EMAIL_REGEX.test(email.trim());

    /* ─── Signed-out state ─────────────────────────────────────────────────── */

    if (!user) {
        return (
            <div className="p-8 w-full flex flex-col items-center justify-center text-center space-y-4 py-16">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Users className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-sm">
                    <h3 className="text-base font-semibold tracking-tight">Sign in to manage teams</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Sign in with Google or GitHub to collaborate with your team and share database projects.
                    </p>
                </div>
                <div className="flex flex-col w-full max-w-xs gap-2.5 pt-2">
                    <Button
                        onClick={() => signInWithGoogle()}
                        variant="outline"
                        className="w-full h-9 text-xs rounded-xl font-medium gap-2 shadow-sm"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        Continue with Google
                    </Button>
                    <Button
                        onClick={() => signInWithGithub()}
                        variant="outline"
                        className="w-full h-9 text-xs rounded-xl font-medium gap-2 shadow-sm"
                    >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                        Continue with GitHub
                    </Button>
                </div>
            </div>
        );
    }

    /* ─── Signed-in state ──────────────────────────────────────────────────── */

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">Collaboration</h3>
                    <p className="text-sm text-muted-foreground">Manage teams and shared projects</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshAll}
                        disabled={isRefreshing}
                        className="h-8 rounded-lg text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                        title="Refresh all team data"
                        aria-label="Refresh all team data"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                        <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsCreatingTeam(!isCreatingTeam)} className="h-8 rounded-lg border-dashed text-xs" aria-label="Create a new team">
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> New Team
                    </Button>
                </div>
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

            {teamsLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                </div>
            ) : teams.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-muted/20 text-center space-y-4">
                    <Users className="h-10 w-10 text-muted-foreground/30" />
                    <div className="space-y-1">
                        <p className="text-sm font-medium">No teams found</p>
                        <p className="text-xs text-muted-foreground max-w-[250px]">Create a team to start sharing your database projects with others.</p>
                    </div>
                    {!isCreatingTeam && (
                        <Button onClick={() => setIsCreatingTeam(true)} size="sm" className="rounded-xl font-medium shadow-xs">
                            Create First Team
                        </Button>
                    )}
                </div>
            ) : (
                <>
                    {/* Team switcher + role + seats */}
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border bg-card/40 p-4 space-y-2 sm:col-span-2">
                            <SectionLabel><span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> Active Team</span></SectionLabel>
                            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                                <SelectTrigger className="bg-background/50 border h-9 font-medium">
                                    <SelectValue placeholder="Select a team" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="rounded-xl border bg-card/40 p-4 space-y-2">
                            <SectionLabel><span className="flex items-center gap-1.5"><Shield className="h-3 w-3" /> Your Permission</span></SectionLabel>
                            <div className="flex items-center justify-between h-9">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-semibold text-sm capitalize text-foreground truncate">{currentRole ? currentRole : '—'}</span>
                                    {isOwner && (
                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-medium px-2 py-0.5">
                                            OWNER
                                        </Badge>
                                    )}
                                </div>
                                {!isOwner && selectedTeamId && (
                                    <ConfirmAction
                                        title={`Leave ${selectedTeam?.name || 'this team'}?`}
                                        description="You will immediately lose access to all projects and databases shared with this team. Your own projects are automatically unshared from it."
                                        confirmLabel="Leave Team"
                                        processing={leaveTeamMutation.isPending}
                                        onConfirm={() => leaveTeamMutation.mutate()}
                                        trigger={
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive gap-1"
                                                aria-label="Leave this team"
                                            >
                                                <LogOut className="h-3 w-3" /> Leave
                                            </Button>
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {seatsData && (
                        <div className="flex items-center gap-2 px-1">
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-[10px] font-medium px-2 py-0.5",
                                    seatsFull
                                        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                        : "text-muted-foreground"
                                )}
                                title="Seats used by team members against the owner's plan"
                            >
                                <Users className="h-3 w-3 mr-1" />
                                Seats {seatsData.occupied}/{seatsData.seats}
                            </Badge>
                            {seatsFull && (
                                <span className="text-[11px] text-muted-foreground">
                                    Seat limit reached — the team owner must upgrade to invite more people.
                                </span>
                            )}
                        </div>
                    )}

                    <Tabs defaultValue="members" className="w-full">
                        <TabsList className="bg-muted/50 p-1 rounded-xl mb-4 w-full sm:w-auto">
                            <TabsTrigger value="members" className="rounded-lg px-4 py-1.5 text-xs font-medium">Members</TabsTrigger>
                            <TabsTrigger value="agents" className="rounded-lg px-4 py-1.5 text-xs font-medium">Connectors</TabsTrigger>
                            <TabsTrigger value="projects" className="rounded-lg px-4 py-1.5 text-xs font-medium">Share Projects</TabsTrigger>
                            <TabsTrigger value="connections" className="rounded-lg px-4 py-1.5 text-xs font-medium">Shared DBs</TabsTrigger>
                        </TabsList>

                        <TabsContent value="members" className="space-y-5 animate-in fade-in duration-300">
                            <MembersPanel
                                selectedTeamId={selectedTeamId}
                                canManage={canManage}
                                isOwner={isOwner}
                                currentRole={currentRole}
                                members={members}
                                membersLoading={membersLoading}
                                user={user}
                                email={email}
                                setEmail={setEmail}
                                emailValid={emailValid}
                                inviteRole={inviteRole}
                                setInviteRole={(v) => setInviteRole(v as 'admin' | 'member')}
                                handleInvite={handleInvite}
                                submittingInvite={submittingInvite}
                                seatsFull={seatsFull}
                                lastInvite={lastInvite}
                                copiedLink={copiedLink}
                                copyInviteLink={copyInviteLink}
                                pendingInvites={pendingInvites}
                                invitesLoading={invitesLoading}
                                removeMemberMutation={removeMemberMutation}
                                changeRoleMutation={changeRoleMutation}
                                revokeInviteMutation={revokeInviteMutation}
                                selectedTeam={selectedTeam}
                                renameValue={renameValue}
                                setRenameValue={setRenameValue}
                                renameTeamMutation={renameTeamMutation}
                                deleteConfirmText={deleteConfirmText}
                                setDeleteConfirmText={setDeleteConfirmText}
                                deleteTeamMutation={deleteTeamMutation}
                            />
                        </TabsContent>

                        <TabsContent value="agents" className="space-y-4 animate-in fade-in duration-300">
                            <AgentSharesPanel
                                selectedTeamId={selectedTeamId}
                                canManage={canManage}
                                allAgentEntries={allAgentEntries}
                                agentSharesLoading={agentSharesLoading}
                                shareAgentMutation={shareAgentMutation}
                                unshareAgentMutation={unshareAgentMutation}
                                queryClient={queryClient}
                                queryKeys={queryKeys}
                            />
                        </TabsContent>

                        <TabsContent value="projects" className="space-y-4 animate-in fade-in duration-300">
                            <ProjectsPanel
                                allProjects={allProjects}
                                projectsLoading={projectsLoading}
                                selectedTeamId={selectedTeamId}
                                connections={connections}
                                canManage={canManage}
                                handleToggleProjectTeam={handleToggleProjectTeam}
                                queryClient={queryClient}
                                queryKeys={queryKeys}
                            />
                        </TabsContent>

                        <TabsContent value="connections" className="space-y-4 animate-in fade-in duration-300">
                            <ConnectionsPanel
                                sharedConnections={sharedConnections}
                                isRefreshingDbs={isRefreshingDbs}
                                handleRefreshSharedDbs={handleRefreshSharedDbs}
                            />
                        </TabsContent>
                    </Tabs>
                </>
            )}
        </div>
    );
}
