import { get, post, del } from '../client';

export interface Team {
    id: string;
    name: string;
    slug?: string;
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
}): Promise<TeamResponse> {
    return post<TeamResponse>('/api/teams', params);
}

export async function getTeamMembers(
    teamId: string
): Promise<TeamMembersResponse> {
    return get<TeamMembersResponse>(`/api/teams/${teamId}/members`);
}

export async function inviteTeamMember(
    teamId: string,
    params: { email: string; role: 'admin' | 'member' }
): Promise<{ success: boolean; message: string }> {
    return post<{ success: boolean; message: string }>(`/api/teams/${teamId}/invites`, params);
}

export async function removeTeamMember(
    teamId: string,
    memberUserId: string
): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/api/teams/${teamId}/members/${memberUserId}`);
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
): Promise<{ success: boolean; membership: any }> {
    return post<{ success: boolean; membership: any }>('/api/teams/invitations/accept', { token });
}

export async function declineTeamInvitation(
    teamId: string,
    inviteId: string
): Promise<{ success: boolean; message: string }> {
    return post(`/api/teams/${teamId}/invitations/${inviteId}/decline`);
}

/**
 * Publicly fetch invitation details for review
 */
export async function getInvitationInfo(token: string, type: 'team' | 'project'): Promise<InvitationInfo> {
    const endpoint = type === 'team'
        ? `/api/teams/invitations/info/${token}`
        : `/api/files/projects/invitations/info/${token}`;
    return get<InvitationInfo>(endpoint);
}
