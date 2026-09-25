// =============================================================================
// useProjects
// React Query hooks for AI project CRUD.
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    listProjects,
    createProject,
    updateProject,
    deleteProject,
    getProjectChats,
      type AIProject,
} from '../api/projects';

export type { AIProject };

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const projectQueryKeys = {
    all: ['ai', 'projects'] as const,
    list: () => ['ai', 'projects', 'list'] as const,
    chats: (projectId: string) => ['ai', 'projects', projectId, 'chats'] as const,
};

// =============================================================================
// useProjects — list all projects for the current user
// =============================================================================

export function useProjects() {
    return useQuery({
        queryKey: projectQueryKeys.list(),
        queryFn: listProjects,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        select: (data) => data.projects,
    });
}

// =============================================================================
// useCreateProject
// =============================================================================

export function useCreateProject() {
    const queryClient = useQueryClient();

    return useMutation<
        { project: AIProject },
        Error,
        Parameters<typeof createProject>[0]
    >({
        mutationFn: createProject,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
        },
    });
}

// =============================================================================
// useUpdateProject
// =============================================================================

export function useUpdateProject() {
    const queryClient = useQueryClient();

    return useMutation<
        { project: AIProject },
        Error,
        { projectId: string; data: Parameters<typeof updateProject>[1] }
    >({
        mutationFn: ({ projectId, data }) => updateProject(projectId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
        },
    });
}

// =============================================================================
// useDeleteProject
// =============================================================================

export function useDeleteProject() {
    const queryClient = useQueryClient();

    return useMutation<{ success: boolean }, Error, string>({
        mutationFn: deleteProject,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
        },
    });
}

// =============================================================================
// useProjectChats — fetch chats belonging to a project
// =============================================================================

export function useProjectChats(projectId: string | null) {
    return useQuery({
        queryKey: projectQueryKeys.chats(projectId ?? ''),
        queryFn: () => getProjectChats(projectId!),
        enabled: Boolean(projectId),
        staleTime: 30_000,
        select: (data) => data.chats,
    });
}

// Phase 1 removed useUpdateProject and useAssignChatToProject: both had zero
// consumers. updateProject and assignChatToProject remain in lib/api/projects.


