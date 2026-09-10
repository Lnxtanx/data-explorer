export const queryKeys = {
    teams: ['collaboration', 'teams'],
    members: (teamId: string) => ['collaboration', 'members', teamId],
    invites: (teamId: string) => ['collaboration', 'invites', teamId],
    projects: ['collaboration', 'projects'],
    seats: (teamId: string) => ['collaboration', 'seats', teamId],
    teamBilling: (teamId: string) => ['collaboration', 'billing', teamId],
    agentShares: (teamId: string) => ['collaboration', 'agent-shares', teamId],
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SharedConn = {
    id: string;
    name: string;
    database: string;
    source: 'project' | 'agent';
    sharedBy: string | null;
    machineLabel?: string | null;
    isOnline?: boolean;
};

export type LastInvite = {
    link: string;
    emailSent: boolean;
    emailConfigured: boolean;
};

export interface AgentEntry {
    id: string;
    agent_id: string;
    machine_label: string;
    is_online?: boolean;
    is_shared: boolean;
    share_id?: string;
    shared_by_name?: string | null;
    is_own: boolean;
}
