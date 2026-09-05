import { apiRequest } from '../client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIProject {
    id: string;
    userId?: string | null;
    user_id?: string | null;
    title: string;
    description: string | null;
    connectionId: string | null;
    connection_id?: string | null;
    teamId?: string | null;
    team_id?: string | null;
    teamName?: string | null;
    team_name?: string | null;
    ownerName?: string | null;
    owner_name?: string | null;
    ownerEmail?: string | null;
    owner_email?: string | null;
    isMine?: boolean;
    is_mine?: boolean;
    context: string | null;
    color: 'orange' | 'purple' | 'blue' | 'green';
    fileCount: number;
    file_count?: number;
    chatCount: number;
    chat_count?: number;
    createdAt: string;
    created_at?: string;
    updatedAt: string;
    updated_at?: string;
}

export interface ProjectChat {
    id: string;
    title: string | null;
    messageCount: number;
    modelUsed: string | null;
    updatedAt: string;
    contextTable: string | null;
    userId: string | null;
    authorName?: string | null;
    authorEmail?: string | null;
    authorAvatarUrl?: string | null;
    isMine: boolean;
}

export interface ListProjectsResponse { projects: AIProject[] }
export interface ProjectChatsResponse { chats: ProjectChat[] }

// ─── API functions ─────────────────────────────────────────────────────────────

export async function listProjects(): Promise<ListProjectsResponse> {
    return apiRequest('/api/ai/projects');
}

export async function createProject(data: {
    title: string;
    description?: string;
    connectionId?: string;
    context?: string;
    color?: string;
    teamId?: string | null;
}): Promise<{ project: AIProject }> {
    return apiRequest('/api/ai/projects', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateProject(
    projectId: string,
    data: Partial<Pick<AIProject, 'title' | 'description' | 'context' | 'color'> & { teamId: string | null }>
): Promise<{ project: AIProject }> {
    return apiRequest(`/api/ai/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteProject(projectId: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/ai/projects/${projectId}`, { method: 'DELETE' });
}

export async function getProjectChats(projectId: string): Promise<ProjectChatsResponse> {
    return apiRequest(`/api/ai/projects/${projectId}/chats`);
}

export async function assignChatToProject(projectId: string, chatId: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/ai/projects/${projectId}/chats/${chatId}`, { method: 'POST' });
}
