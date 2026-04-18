import { post, get } from './client';

export interface FeedbackSubmission {
    type: string;
    content: string;
    attachments?: string[];
    metadata?: Record<string, any>;
}

export interface FeedbackResponse {
    success: boolean;
    feedback: any;
}

/**
 * Submit user feedback to the backend
 */
export async function submitFeedback(data: FeedbackSubmission | FormData): Promise<FeedbackResponse> {
    return post<FeedbackResponse>('/api/feedback', data);
}

/**
 * Get feedback submitted by the current user
 */
export async function getMyFeedback(): Promise<{ success: boolean; feedback: any[] }> {
    return get<{ success: boolean; feedback: any[] }>('/api/feedback/my');
}
