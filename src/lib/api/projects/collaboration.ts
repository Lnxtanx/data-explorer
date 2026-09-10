import { get, post, del, patch } from '../client';

export interface Team {
    id: string;
    name: string;
    slug?: string | null;
    owner_id?: string;
    avatar_url?: string | null;
    settings?: Record<string, unknown>;
    role?: 'owner' | 'admin' | 'member';
    is_owner?: boolean;
    created_at: string;
    updated_at: string;
}

export interface TeamListResponse {
    teams: Team[];
}

export interface TeamResponse {
    team: Team;
}

export interface TeamMember {
    user_id: string;
    role: 'owner' | 'admin' | 'member';
    joined_at: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
    is_owner: boolean;
}

export interface TeamMembersResponse {
    members: TeamMember[];
    currentRole: TeamMember['role'];
}

export interface TeamInvitation {
    id: string;
    team_id: string;
    email: string;
    role: 'admin' | 'member';
    status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
    token?: string;
    link?: string;
    invited_by: string;
    expires_at: string;
    accepted_at?: string | null;
    created_at: string;
}

// Invitation Review Info
export interface InvitationInfo {
    id: string;
    type: 'team' | 'project';
    projectId?: string;
    teamId?: string;
    teamName?: string;
    projectName?: string;
    inviterName: string;
    role: string;
    email: string;
    status: string;
    expiresAt: string;
    expired?: boolean;
}

export async function listTeams(): Promise<TeamListResponse> {
    return get<TeamListResponse>('/api/teams');
}

export async function getTeam(id: string): Promise<TeamResponse> {
    return get<TeamResponse>(`/api/teams/${id}`);
}

export async function createTeam(params: {
    name: string;
    slug?: string;
    intent?: 'team_plan_purchase';
}): Promise<TeamResponse> {
    return post<TeamResponse>('/api/teams', params);
}

export async function getTeamMembers(
    teamId: string
): Promise<TeamMembersResponse> {
    return get<TeamMembersResponse>(`/api/teams/${teamId}/members`);
}

export interface InviteTeamMemberResult {
    success: boolean;
    message?: string;
    invitation?: TeamInvitation;
    /** Email delivery status from the backend. */
    email?: { configured: boolean; sent: boolean };
}

export async function inviteTeamMember(
    teamId: string,
    params: { email: string; role: 'admin' | 'member' }
): Promise<InviteTeamMemberResult> {
    return post<InviteTeamMemberResult>(`/api/teams/${teamId}/invites`, params);
}

export async function removeTeamMember(
    teamId: string,
    memberUserId: string
): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/api/teams/${teamId}/members/${memberUserId}`);
}

export async function updateTeamMemberRole(
    teamId: string,
    memberUserId: string,
    role: 'admin' | 'member'
): Promise<{ success: boolean; role: string }> {
    return patch<{ success: boolean; role: string }>(
        `/api/teams/${teamId}/members/${memberUserId}`,
        { role }
    );
}

export async function leaveTeam(teamId: string): Promise<{ success: boolean }> {
    return post<{ success: boolean }>(`/api/teams/${teamId}/leave`);
}

export async function deleteTeam(teamId: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/api/teams/${teamId}`);
}

export async function renameTeam(
    teamId: string,
    name: string
): Promise<{ success: boolean; team: { id: string; name: string } }> {
    return patch<{ success: boolean; team: { id: string; name: string } }>(
        `/api/teams/${teamId}`,
        { name }
    );
}

export interface TeamSeats {
    seats: number;
    occupied: number;
}

// ─── Team billing (per-seat Team plan) ──────────────────────────────────────

export interface TeamBillingSeats extends TeamSeats {
    remaining?: number;
    kind?: 'team' | 'legacy';
    hasTeamSub?: boolean;
}

export interface TeamSubscription {
    id: string;
    status: string;
    planId: string;
    seatCount: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;
    createdAt: string | null;
}

export interface TeamBillingStatus {
    teamId: string;
    status: 'none' | 'active' | 'canceled' | 'expired' | string;
    seats: TeamBillingSeats | null;
    subscription: TeamSubscription | null;
}

export interface TeamOrderResponse {
    order: {
        id: string;
        amount: number;
        currency: string;
        keyId: string;
        planId: string;
        planName: string;
        reused?: boolean;
    };
    paymentRowId: string | null;
    seatCount: number;
    mode: 'purchase' | 'add' | 'renew';
    prorated?: {
        seatDelta: number;
        totalSeats: number;
        periodDays: number;
        remainingDays: number;
        amountPaise: number;
    } | null;
}

export async function getTeamSeats(teamId: string): Promise<TeamSeats> {
    return get<TeamSeats>(`/api/teams/${teamId}/seats`);
}

export async function getTeamBillingStatus(teamId: string): Promise<TeamBillingStatus> {
    return get<TeamBillingStatus>(`/api/teams/${teamId}/billing`);
}

export async function createTeamSeatOrder(
    teamId: string,
    params: { planId?: string; seats: number; mode?: 'purchase' | 'add' | 'renew'; currency?: 'INR' | 'USD' }
): Promise<TeamOrderResponse> {
    return post<TeamOrderResponse>(`/api/teams/${teamId}/billing/orders`, params);
}

export async function getTeamInvitations(
    teamId: string
): Promise<{ invitations: TeamInvitation[] }> {
    return get<{ invitations: TeamInvitation[] }>(`/api/teams/${teamId}/invitations`);
}

export async function revokeTeamInvitation(
    teamId: string,
    inviteId: string
): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/api/teams/${teamId}/invitations/${inviteId}`);
}

export async function acceptTeamInvitation(
    token: string
): Promise<{ success: boolean; teamId: string; role: string }> {
    return post<{ success: boolean; teamId: string; role: string }>('/api/teams/invitations/accept', { token });
}

export async function declineTeamInvitation(
    teamId: string,
    inviteId: string
): Promise<{ success: boolean; message: string }> {
    return post<{ success: boolean; message: string }>(`/api/teams/${teamId}/invitations/${inviteId}/decline`);
}

/**
 * Publicly fetch invitation details for review
 */
export async function getInvitationInfo(token: string, type: 'team' | 'project' = 'team'): Promise<InvitationInfo> {
    const endpoint = type === 'team'
        ? `/api/teams/invitations/info/${token}`
        : `/api/files/projects/invitations/info/${token}`;
    return get<InvitationInfo>(endpoint);
}

// ─── Team Agent Shares (SW-Agent sharing) ──────────────────────────────────

export interface TeamAgentShare {
    id: string;
    team_id: string;
    team_name?: string | null;
    registration_id: string;
    agent_id: string;
    machine_label: string | null;
    shared_by: string;
    shared_by_name: string | null;
    shared_by_email: string | null;
    shared_at?: string;
    created_at?: string;
    owner_user_id?: string;
}

/** List SW-Agents currently shared with a team (any member). */
export async function listTeamAgentShares(teamId: string): Promise<{ success: boolean; agents: TeamAgentShare[] }> {
    return get<{ success: boolean; agents: TeamAgentShare[] }>(`/api/teams/${teamId}/shares/agents`);
}

/**
 * Share one of my SW-Agents (and ALL of its databases) with the team.
 * Owner/admin + paid plan required.
 */
export async function shareAgentWithTeam(
    teamId: string,
    targetId: string
): Promise<{ success: boolean; share?: TeamAgentShare; already_shared?: boolean }> {
    return post<{ success: boolean; share?: TeamAgentShare; already_shared?: boolean }>(
        `/api/teams/${teamId}/shares/agents`,
        { agentId: targetId }
    );
}

/** Remove an agent share from the team. Owner/admin required. */
export async function unshareAgentFromTeam(teamId: string, shareId: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/api/teams/${teamId}/shares/agents/${shareId}`);
}
