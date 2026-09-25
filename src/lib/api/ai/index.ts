// =============================================================================
// AI API Client
// Typed functions for all AI endpoints on the Node backend.
// =============================================================================

import { apiRequest } from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColumnInfo {
    name: string;
    data_type: string;
    is_nullable?: string;
    is_pk?: boolean;
}

export interface TableContext {
    tableName: string;
    schemaName?: string;
    columns?: ColumnInfo[];
    sampleRows?: Record<string, unknown>[];
    stats?: { total_rows?: number; totalRows?: number };
}

export interface HistoryMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ModelConfig {
    model?: string;
    preferCost?: boolean;
}

export interface ChatRequest {
    connectionId?: string;
    chatId?: string;
    projectId?: string;
    message: string;
    tableContext?: TableContext;
    mentionedTables?: string[];
    modelConfig?: ModelConfig;
    history?: HistoryMessage[];
    fileIds?: string[];
}

export interface AIChat {
    id: string;
    title: string;
    contextTable: string | null;
    connectionId: string | null;
    projectId: string | null;
    messageCount: number;
    updatedAt: string;
    modelUsed: string;
    agentMode?: 'flash' | 'deep';
    thinkingEnabled?: boolean;
    useCase?: string;
}

export interface AIMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    artifacts: SqlArtifact[];
    created_at: string;
    token_count: number | null;
    /** Author of this message (team-shared chats attribute per member). */
    user_id?: string | null;
    /** False when a teammate wrote this message in a shared thread. */
    isMine?: boolean;
    authorName?: string | null;
    authorEmail?: string | null;
    execution_trace?: {
        toolSteps?: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
            status: string;
        }>;
    };
}

export interface SqlArtifact {
    sql?: string;
    confidence?: number;
    type?: string;
    title?: string;
    streaming?: boolean;
    loading?: boolean;
    rows?: Record<string, unknown>[];
    columns?: Array<{ name: string; dataTypeID?: number }>;
    rowCount?: number;
    totalRows?: number;
    stats?: Array<{
        name: string;
        dataType: string;
        nullable: boolean;
        isPrimaryKey: boolean;
        isIndexed: boolean;
        nullPercent: number;
        distinctCount: number;
        min: string | number | null;
        max: string | number | null;
        avg: number | null;
        topValues: (string | number | null)[];
    }>;
    /** Anomalies */
    scannedColumns?: number;
    totalAnomalies?: number;
    anomalies?: Array<{ column: string; type: string; severity: string; count: number; explanation: string }>;
    /** Quality */
    score?: number;
    summary?: string;
    issues?: Array<{ column: string; issueType: string; severity: string; affectedRows: number; recommendation: string }>;
    /** Joins */
    paths?: Array<{ from: string; fromColumn: string; to: string; toColumn: string; joinType: string; confidence: number }>;
    /** Metrics */
    identifiers?: string[];
    dimensions?: string[];
    measures?: string[];
    timestamps?: string[];
    diagramType?: string;
    mermaid?: string;
    tableCount?: number;
    relationshipCount?: number;
}

export interface ChatMessagesResponse {
    chat: {
        id: string;
        title: string | null;
        context_table: string | null;
        connection_id: string | null;
        project_id: string | null;
        created_at: string;
        agent_mode?: 'flash' | 'deep';
        thinking_enabled?: boolean;
        use_case?: string;
        useCase?: string;
    };
    messages: AIMessage[];
    hasMore?: boolean;
    oldestCursor?: string | null;
}

export interface ListChatsResponse {
    chats: AIChat[];
    total: number;
}

export interface QueryRunResult {
    success: boolean;
    rows: Record<string, unknown>[];
    columns: { name: string; dataTypeID: number }[];
    rowCount: number;
    executionMs: number;
    truncated: boolean;
}

export interface SavedQuery {
    id: string;
    title: string;
    sql_query: string;
    schema_name: string;
    tags: string[];
    run_count: number;
    created_at: string;
}

export interface AIHealthResponse {
    available: boolean;
    timestamp: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

/**
 * List the user's AI chats (for the sidebar history).
 */
export async function listChats(params?: {
    connectionId?: string;
    limit?: number;
    offset?: number;
    useCase?: string;
}): Promise<ListChatsResponse> {
    const qs = new URLSearchParams();
    if (params?.connectionId) qs.set('connectionId', params.connectionId);
    if (params?.limit)        qs.set('limit', String(params.limit));
    if (params?.offset)       qs.set('offset', String(params.offset));
    if (params?.useCase)      qs.set('useCase', params.useCase);

    const query = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<ListChatsResponse>(`/api/ai/chats${query}`);
}

/**
 * Fetch messages for a chat with pagination and payload slimming support.
 */
export async function getChatMessages(
    chatId: string,
    params?: { limit?: number; before?: string | null; slim?: boolean }
): Promise<ChatMessagesResponse> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.before) qs.set('before', params.before);
    if (params?.slim !== undefined) qs.set('slim', String(params.slim));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<ChatMessagesResponse>(`/api/ai/chats/${chatId}/messages${query}`);
}

/**
 * Soft-delete a chat.
 */
export async function deleteChat(chatId: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/ai/chats/${chatId}`, {
        method: 'DELETE',
    });
}

export interface UpdateChatParams {
    title?: string;
    projectId?: string | null;
}

export interface UpdateChatResponse {
    success: boolean;
    chat?: AIChat;
}

/**
 * Update chat properties (title, assigned project).
 */
export async function updateChat(chatId: string, updates: UpdateChatParams): Promise<UpdateChatResponse> {
    return apiRequest<UpdateChatResponse>(`/api/ai/chats/${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
    });
}

// ─── Query Execution ─────────────────────────────────────────────────────────

/**
 * Execute an AI-generated SELECT query against a user's database connection.
 */
export async function runQuery(params: {
    connectionId: string;
    sql: string;
    limit?: number;
}): Promise<QueryRunResult> {
    return apiRequest<QueryRunResult>('/api/ai/query/run', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

/**
 * Save an AI-generated query for future reuse.
 */
export async function saveQuery(params: {
    connectionId?: string;
    title: string;
    sql: string;
    schemaName?: string;
    chatMessageId?: string;
    tags?: string[];
}): Promise<{ success: boolean; query: SavedQuery }> {
    return apiRequest<{ success: boolean; query: SavedQuery }>('/api/ai/queries/save', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

// ─── Artifact History ─────────────────────────────────────────────────────

export interface ArtifactHistoryItem {
    id: string;
    messageId: string;
    chatId: string;
    chatTitle: string;
    connectionId: string | null;
    createdAt: string;
    artifact: SqlArtifact;
}

export interface ArtifactHistoryResponse {
    artifacts: ArtifactHistoryItem[];
    total: number;
}

export async function listArtifacts(params?: {
    connectionId?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<ArtifactHistoryResponse> {
    const qs = new URLSearchParams();
    if (params?.connectionId) qs.set('connectionId', params.connectionId);
    if (params?.type) qs.set('type', params.type);
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<ArtifactHistoryResponse>(`/api/ai/artifacts${query}`);
}

// ─── Health ───────────────────────────────────────────────────────────────────

/**
 * Check if the AI backend is available.
 */
export async function checkAIHealth(): Promise<AIHealthResponse> {
    return apiRequest<AIHealthResponse>('/api/ai/health');
}

// ─── File Uploads ─────────────────────────────────────────────────────────────

export interface UploadedFileItem {
    file_id: string;
    filename: string;
    file_type: string;
    size_bytes: number;
    token_estimate: number;
    preview: string;
    metadata: Record<string, unknown>;
    download_url?: string;
    storage_path?: string;
    extracted_components?: Record<string, unknown>;
    text_content?: string;
}

export interface UploadFilesResponse {
    ok: boolean;
    files: UploadedFileItem[];
}

/**
 * Upload one or more user files (PDF, DOCX, XLSX, CSV, PPTX, TXT, Code)
 * to be parsed and prepared for AI chat / agent sessions.
 *
 * @param opts.chatId / opts.sessionId — associates the attachments with a chat
 *        session so they are not stored as "unassigned" (#11).
 */
export async function uploadFilesForAI(
    files: File[],
    opts?: { chatId?: string | null; sessionId?: string | null },
): Promise<UploadFilesResponse> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    const chatId = opts?.chatId || opts?.sessionId;
    if (chatId) {
        formData.append('chatId', chatId);
    }

    return apiRequest<UploadFilesResponse>('/api/ai/files/upload', {
        method: 'POST',
        body: formData,
    });
}
