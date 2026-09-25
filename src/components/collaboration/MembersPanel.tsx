import {
    Loader2, Mail, Trash2, UserPlus, Copy, Check, Link2,
    RefreshCw, ChevronDown, Clock,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SectionLabel, RoleBadge, ConfirmAction } from './primitives';
import { queryKeys, type LastInvite } from './types';
import type { Team, TeamMember, TeamInvitation } from './api/collaboration';

interface MembersPanelProps {
    members: TeamMember[];
    membersLoading: boolean;
    currentRole: string | null;
    canManage: boolean;
    isOwner: boolean;
    user: { id: string } | null;
    pendingInvites: TeamInvitation[];
    invitesLoading: boolean;
    seatsFull: boolean;
    selectedTeamId: string | null;
    selectedTeam: Team | null;

    removeMemberMutation: { mutate: (userId: string) => void; isPending: boolean };
    changeRoleMutation: { mutate: (args: { userId: string; role: 'admin' | 'member' }) => void };
    revokeInviteMutation: { mutate: (inviteId: string) => void; isPending: boolean };
    deleteTeamMutation: { mutate: () => void; isPending: boolean };
    renameTeamMutation: { mutate: () => void; isPending: boolean };

    handleInvite: () => void;
    copyInviteLink: (link?: string) => void;

    email: string;
    setEmail: (v: string) => void;
    inviteRole: string;
    setInviteRole: (v: string) => void;
    submittingInvite: boolean;
    copiedLink: boolean;
    lastInvite: LastInvite | null;
    renameValue: string;
    setRenameValue: (v: string) => void;
    deleteConfirmText: string;
    setDeleteConfirmText: (v: string) => void;
    emailValid: boolean;
}

export function MembersPanel({
    members,
    membersLoading,
    currentRole,
    canManage,
    isOwner,
    user,
    pendingInvites,
    invitesLoading,
    seatsFull,
    selectedTeamId,
    selectedTeam,
    removeMemberMutation,
    changeRoleMutation,
    revokeInviteMutation,
    deleteTeamMutation,
    renameTeamMutation,
    handleInvite,
    copyInviteLink,
    email,
    setEmail,
    inviteRole,
    setInviteRole,
    submittingInvite,
    copiedLink,
    lastInvite,
    renameValue,
    setRenameValue,
    deleteConfirmText,
    setDeleteConfirmText,
    emailValid,
}: MembersPanelProps) {
    const queryClient = useQueryClient();
    const canChangeRoles = currentRole === 'owner';

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            {canManage && (
                <div className="rounded-xl border bg-card/50 p-4 space-y-3.5">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <UserPlus className="h-4 w-4 text-primary" />
                            Invite Member
                        </div>
                        <p className="text-xs text-muted-foreground">Send an invite to someone's email to join this team.</p>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="colleague@company.com"
                            className="flex-1 h-9 text-xs bg-background"
                            aria-label="Email address to invite"
                        />
                        <Select value={inviteRole} onValueChange={v => setInviteRole(v as any)}>
                            <SelectTrigger className="w-[110px] h-9 text-xs bg-background" aria-label="Invite as role"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="admin" disabled={!isOwner}>Admin</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={handleInvite} disabled={!emailValid || submittingInvite || seatsFull} className="h-9 px-4 text-xs font-medium" aria-label="Send invitation">
                            {submittingInvite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Invite'}
                        </Button>
                    </div>
                    {email.trim() && !emailValid && (
                        <p className="text-[11px] text-destructive">Enter a valid email address.</p>
                    )}

                    {lastInvite && (
                        <div className="rounded-xl border border-border/80 bg-muted/40 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                    <Link2 className="h-3.5 w-3.5 text-primary" />
                                    <span>Direct Invitation Link</span>
                                </div>
                                <div>
                                    {!lastInvite.emailConfigured ? (
                                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                            Email not configured
                                        </span>
                                    ) : !lastInvite.emailSent ? (
                                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                            Email delivery failed
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                            <Mail className="h-3 w-3" /> Invite email sent
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-background border border-border/80 font-mono text-xs text-foreground/90">
                                <code className="truncate flex-1 select-all">{lastInvite.link}</code>
                                <button
                                    onClick={() => copyInviteLink()}
                                    className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted shrink-0"
                                    title="Copy link"
                                    aria-label="Copy invitation link"
                                >
                                    {copiedLink ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
                                    ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Active members */}
            <div className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                    <SectionLabel>Active Members ({members.length})</SectionLabel>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.members(selectedTeamId!) })}
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                        title="Refresh members list"
                        aria-label="Refresh members list"
                    >
                        <RefreshCw className="h-3 w-3" />
                        <span>Refresh</span>
                    </Button>
                </div>
                <div className="rounded-xl border bg-card/40 overflow-hidden divide-y divide-border/60">
                    {membersLoading ? (
                        Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3.5">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-3 w-32" />
                                    <Skeleton className="h-2.5 w-44" />
                                </div>
                                <Skeleton className="h-5 w-14 rounded-full" />
                            </div>
                        ))
                    ) : (
                        members.map(member => {
                            const isSelf = user && member.user_id === user.id;
                            const removable = canManage && !member.is_owner && !isSelf;
                            const roleEditable = canChangeRoles && !member.is_owner && !isSelf;

                            return (
                                <div key={member.user_id} className="flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors group">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs uppercase shrink-0 overflow-hidden">
                                            {member.avatar_url
                                                ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                                                : (member.full_name || member.email || '?')[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-foreground truncate">{member.full_name || 'Team Member'}</div>
                                            <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {member.is_owner && (
                                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-medium px-2 py-0.5">
                                                OWNER
                                            </Badge>
                                        )}
                                        <RoleBadge role={member.role} />

                                        {roleEditable && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                        aria-label={`Change role for ${member.full_name || member.email}`}
                                                        title="Change role"
                                                    >
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="rounded-xl">
                                                    <DropdownMenuLabel className="text-[11px] text-muted-foreground">Change role</DropdownMenuLabel>
                                                    <DropdownMenuItem
                                                        disabled={member.role === 'admin'}
                                                        onClick={() => changeRoleMutation.mutate({ userId: member.user_id, role: 'admin' })}
                                                    >
                                                        Promote to Admin
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        disabled={member.role === 'member'}
                                                        onClick={() => changeRoleMutation.mutate({ userId: member.user_id, role: 'member' })}
                                                    >
                                                        Demote to Member
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}

                                        {removable && (
                                            <ConfirmAction
                                                title={`Remove ${member.full_name || member.email}?`}
                                                description="They immediately lose access to everything shared with this team. Projects they created are automatically unshared from the team (their ownership is untouched)."
                                                confirmLabel="Remove Member"
                                                processing={removeMemberMutation.isPending}
                                                onConfirm={() => removeMemberMutation.mutate(member.user_id)}
                                                trigger={
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
                                                        aria-label={`Remove ${member.full_name || member.email} from team`}
                                                        title="Remove from team"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                }
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Pending invitations (admin+) */}
            {canManage && (
                <div className="space-y-2">
                    <SectionLabel>Pending Invitations ({pendingInvites.length})</SectionLabel>
                    <div className="rounded-xl border bg-card/30 overflow-hidden divide-y divide-border/60">
                        {invitesLoading ? (
                            <div className="p-3.5 space-y-2">
                                <Skeleton className="h-3 w-48" />
                                <Skeleton className="h-3 w-36" />
                            </div>
                        ) : pendingInvites.length === 0 ? (
                            <div className="p-3.5 text-xs text-muted-foreground">
                                No pending invitations. Everyone invited has joined or their invites were resolved.
                            </div>
                        ) : (
                            pendingInvites.map(invite => {
                                const expiresAt = new Date(invite.expires_at);
                                const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000));
                                const link = invite.link
                                    || (invite.token ? `${window.location.origin}/?teamInvite=${invite.token}` : null);

                                return (
                                    <div key={invite.id} className="flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                                                <Mail className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-foreground truncate">{invite.email}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                    <Clock className="h-3 w-3" />
                                                    Expires in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <RoleBadge role={invite.role} />
                                            {link && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => copyInviteLink(link)}
                                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                    title="Copy invitation link"
                                                    aria-label={`Copy invitation link for ${invite.email}`}
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                            <ConfirmAction
                                                title={`Revoke invitation for ${invite.email}?`}
                                                description="The invitation link and email stop working immediately. You can invite them again anytime."
                                                confirmLabel="Revoke Invite"
                                                processing={revokeInviteMutation.isPending}
                                                onConfirm={() => revokeInviteMutation.mutate(invite.id)}
                                                trigger={
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                        title="Revoke invitation"
                                                        aria-label={`Revoke invitation for ${invite.email}`}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                }
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Team settings (owner only) */}
            {isOwner && selectedTeam && (
                <div className="rounded-xl border bg-card/40 p-4 space-y-3">
                    <SectionLabel>Team Settings</SectionLabel>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="h-8 text-xs bg-background flex-1"
                            placeholder="Team Name"
                            aria-label="New team name"
                        />
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!renameValue.trim() || renameValue.trim() === selectedTeam.name || renameTeamMutation.isPending}
                                onClick={() => renameTeamMutation.mutate()}
                            >
                                {renameTeamMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Name'}
                            </Button>
                            <ConfirmAction
                                title={`Delete ${selectedTeam.name}?`}
                                description="This disbands the team and removes shared access for all members."
                                confirmLabel="Delete Team"
                                processing={deleteTeamMutation.isPending}
                                confirmEnabled={deleteConfirmText === selectedTeam.name}
                                onConfirm={() => deleteTeamMutation.mutate()}
                                extraGuard={
                                    <div className="space-y-1.5 pb-1">
                                        <label htmlFor="delete-team-confirm" className="text-xs text-muted-foreground">
                                            Type <span className="font-mono font-semibold text-foreground">{selectedTeam.name}</span> to confirm
                                        </label>
                                        <Input
                                            id="delete-team-confirm"
                                            value={deleteConfirmText}
                                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                                            className="h-8 text-xs bg-background"
                                            autoComplete="off"
                                        />
                                    </div>
                                }
                                trigger={
                                    <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-border/80">
                                        <Trash2 className="h-3 w-3 mr-1" /> Delete Team
                                    </Button>
                                }
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
