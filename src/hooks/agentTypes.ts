// =============================================================================
// agentTypes.ts — Shared types for the AI agent hook ecosystem.
// =============================================================================

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface AgentToolStep {
    id: string;
    name: string;
    input: Record<string, unknown>;
    result?: { success: boolean; summary: string };
    status: 'calling' | 'done' | 'error';
    type?: 'tool' | 'thinking';
    label?: string;
    /** Epoch ms when the tool call was announced (from backend startedAt) */
    startedAt?: number;
    /** Measured execution time in ms (from backend tool_result latency_ms) */
    latencyMs?: number;
    /** Export file download URL (structured, not scraped from a summary) */
    downloadUrl?: string;
    filename?: string;
}

export interface ColumnStat {
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
}

export interface AnomalyEntry {
    column: string;
    type: string;
    severity: 'high' | 'medium' | 'low';
    count: number;
    explanation: string;
}

export interface QualityIssue {
    column: string;
    issueType: string;
    severity: 'high' | 'medium' | 'low';
    affectedRows: number;
    recommendation: string;
}

export interface JoinPath {
    from: string;
    fromColumn: string;
    to: string;
    toColumn: string;
    joinType: 'foreign_key' | 'heuristic';
    confidence: number;
}

// ─── Chart artifact data shapes ───────────────────────────────────────────────

export interface CorrelationPair {
    col_a: string;
    col_b: string;
    r: number;
    strength: string;
}

export interface FunnelStage {
    stage: string;
    count: number;
    conversionFromPrev: number;
    conversionFromTop?: number;
    dropOff?: number;
}

export interface SeasonalityPeriod {
    lag: number;
    strength: number;
    label: string;
}

// ─── Stat-block artifact data shapes ──────────────────────────────────────────

export type StatBlockKind =
    | 'statistics'
    | 'anomalies'
    | 'quality'
    | 'outliers'
    | 'text'
    | 'cardinality'
    | 'table_diff'
    | 'regression';

export interface ColumnStatistic {
    name: string;
    count: number;
    nullCount: number;
    mean?: number;
    median?: number;
    std?: number;
    min?: number;
    max?: number;
    p25?: number;
    p75?: number;
    p95?: number;
    skewness?: number;
    kurtosis?: number;
}

export interface CardinalityColumn {
    name: string;
    cardinality: number;
    cardinalityRatio: number;
    entropy: number;
    topValues: { value: string; count: number }[];
}

export interface RegressionCoefficient {
    feature: string;
    coefficient: number;
    pValue: number;
    significant: boolean;
}

export interface TableDiffResult {
    onlyInA: string[];
    onlyInB: string[];
    typeChanges: { column: string; typeA: string; typeB: string }[];
    rowCountA: number;
    rowCountB: number;
    statDiffs: { column: string; meanA: number; meanB: number; delta: number }[];
}

export interface TextAnalysis {
    avgLength: number;
    minLength: number;
    maxLength: number;
    uniqueCount: number;
    topWords: { word: string; count: number }[];
    patterns: Record<string, number>;
    lengthDistribution: Record<string, number>;
}

// ─── Report/suggestions artifact shapes ───────────────────────────────────────

export interface ReportSection {
    heading: string;
    text: string;
    data?: Record<string, unknown>;
}

export interface AnalysisSuggestion {
    tool: string;
    intent: string;
    description: string;
    columns: string[];
}

export interface PlanStep {
    id: number;
    goal: string;
    tool: string | null;
    status: 'pending' | 'running' | 'done' | 'error';
}

export interface AgentArtifact {
    type: string;
    sql?: string;
    rows?: Record<string, unknown>[];
    columns?: Array<{ name: string; dataTypeID?: number }>;
    title?: string;
    /** True while rows are still streaming in */
    streaming?: boolean;
    /** Placeholder while tool is executing */
    loading?: boolean;
    /**
     * When true, the artifact has a fixed view — no toggle buttons are shown.
     * The agent sets this for all tool-specific outputs (charts, stat blocks, etc.)
     * to prevent the "show everything" problem.
     */
    locked?: boolean;

    // ─── Chart artifacts (type === 'chart') ───────────────────────────────
    chartType?: 'bar' | 'line' | 'pie' | 'heatmap' | 'funnel' | 'scatter';
    labels?: string[];
    values?: number[];
    rawValues?: number[];
    maValues?: number[];
    historicalLabels?: string[];
    historicalValues?: number[];
    forecastLabels?: string[];
    forecastValues?: number[];
    confidenceLower?: number[];
    confidenceUpper?: number[];
    matrix?: number[][];
    topPairs?: CorrelationPair[];
    cohorts?: string[];
    periods?: string[] | SeasonalityPeriod[];
    stages?: FunnelStage[];
    totalEntered?: number;
    overallConversion?: number;
    cumulativePct?: number[];
    paretoIndex?: number;
    interpretation?: string;
    direction?: 'up' | 'down' | 'flat' | 'volatile';
    changePercent?: number;
    granularity?: string;
    detected?: boolean;
    dominantPeriod?: number;
    dominantLabel?: string;
    seasonalPeriods?: SeasonalityPeriod[];

    // ─── Stat-block artifacts (type === 'stat_block') ─────────────────────
    statBlockKind?: StatBlockKind;
    sampleSize?: number;
    columnStats?: ColumnStatistic[];
    cardinalityColumns?: CardinalityColumn[];
    rSquared?: number;
    adjRSquared?: number;
    intercept?: number;
    coefficients?: RegressionCoefficient[];
    tableDiff?: TableDiffResult;
    textAnalysis?: TextAnalysis;

    // ─── Legacy stat types (kept for backward compat) ─────────────────────
    totalRows?: number;
    stats?: ColumnStat[];
    scannedColumns?: number;
    totalAnomalies?: number;
    anomalies?: AnomalyEntry[];
    score?: number;
    qualityScore?: number;
    summary?: string;
    issues?: QualityIssue[];

    // ─── Joins artifact (type === 'joins') ────────────────────────────────
    paths?: JoinPath[];

    // ─── Metrics artifact (type === 'metrics') ────────────────────────────
    identifiers?: string[];
    dimensions?: string[];
    measures?: string[];
    timestamps?: string[];

    // ─── Diagram artifact (type === 'diagram') ────────────────────────────
    diagramType?: string;
    mermaid?: string;
    tableCount?: number;
    relationshipCount?: number;

    // ─── Report artifact (type === 'report') ──────────────────────────────
    generatedAt?: string;
    insights?: string[];
    sections?: ReportSection[];

    // ─── File artifact (type === 'file') ──────────────────────────────────
    downloadUrl?: string;
    /** S3 object key — lets FileView re-sign an expired pre-signed URL */
    key?: string;
    fileName?: string;
    fileType?: string;
    sizeBytes?: number;
    slideCount?: number;
    /** Backend preview classifier (table / chart / stat_block / file) */
    previewType?: 'table' | 'chart' | 'stat_block' | 'file' | string;
    /** Number of rows in the artifact (file + table artifacts) */
    rowCount?: number;

    // ─── Suggestions artifact (type === 'suggestions') ────────────────────
    suggestions?: AnalysisSuggestion[];
    columnSummary?: Record<string, string[]>;

    // ─── Analysis plan artifact (type === 'analysis_plan') ────────────────
    planStepsData?: PlanStep[];

    // ─── Clarification artifact (type === 'clarification') ──────────────
    question?: string;
    options?: string[];
    /** Recommended option the agent will assume — pre-highlighted, accept with Enter. */
    default?: string;
    /** Short reason the agent recommends `default`. */
    reason?: string;
    /** Whether the user has answered this clarification. */
    answered?: boolean;
    /** The answer chosen or submitted by the user. */
    answer?: string;

    // ─── Slide deck artifact (type === 'slide_deck') ──────────────────────
    /** Raw JSON string content (for slide_deck or html_report from workspace) */
    content?: string;
    /** Name of the workspace file this artifact came from */
    workspaceFileName?: string;
    /** UUID of the workspace file */
    workspaceFileId?: string;
}

// ─── Hook-level types ─────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'done' | 'awaiting_clarification' | 'error' | 'aborted';
export type AgentPhase = 'idle' | 'planning' | 'executing' | 'synthesizing' | 'done';

export interface ContextMeta {
    messages_in_window: number;
    session_id: string;
    has_history: boolean;
    tokens_estimated?: number;
    context_limit?: number;
    context_pct?: number;
    iteration?: number;
    before_tokens?: number;
    after_tokens?: number;
    saved_tokens?: number;
    compacted?: boolean;
}

export interface ContextCompactedEvent {
    before_tokens: number;
    after_tokens: number;
    saved_tokens: number;
    reason?: string;
    context_limit?: number;
}

export interface AgentState {
    status: AgentStatus;
    phase: AgentPhase;
    phaseDetail: string;
    thinkingText: string;
    liveThinking?: string;
    planSteps: PlanStep[];
    toolSteps: AgentToolStep[];
    artifacts: AgentArtifact[];
    streamedText: string;
    chatId: string | null;
    error: string | null;
    tokenCount: number | null;
    creditsUsed: number | null;
    iterations: number;
    model: string | null;
    contextMeta: ContextMeta | null;
    // Durable run (POST /api/ai/runs) — the stable identifier used to
    // reconnect/replay after a network drop or page refresh.
    runId?: string | null;
    isReconnecting?: boolean;
    // Granular token tracking
    granularUsage?: GranularUsage;
    // Non-fatal advisory feedback (loop warnings, budget warnings, timeout):
    // surfaced as dismissible banners instead of being silently dropped.
    warnings?: AgentWarning[];
    // Unified, ordered record of everything that happened this run
    // (tool calls/results, artifacts, thinking, decisions, warnings). The
    // parallel arrays above stay for backward compat; this is the single
    // source of truth for future timeline rendering + reload rebuilds.
    timeline?: TimelineItem[];
}

export interface AgentWarning {
    id: string;
    kind: 'warning' | 'budget_warning' | 'budget_exhausted' | 'timeout' | 'cancelled' | 'oscillation' | 'circuit_breaker';
    message: string;
    code?: string;
    dimension?: string;
    pct?: number;
    at: number;
}

export type TimelineItem =
    | { kind: 'status'; phase: AgentPhase; detail: string; iteration: number; at: number }
    | { kind: 'thinking'; text: string; at: number }
    | { kind: 'plan'; at: number }
    | { kind: 'plan_update'; id: number; status: string; at: number }
    | { kind: 'tool_call'; id: string; name: string; at: number }
    | { kind: 'tool_result'; id: string; name: string; success: boolean; summary: string; latencyMs?: number; at: number }
    | { kind: 'artifact'; type: string; title?: string; at: number }
    | { kind: 'warning'; message: string; code?: string; at: number }
    | { kind: 'budget_warning'; dimension: string; pct: number; message: string; at: number }
    | { kind: 'decision'; iteration: number; tools: string[]; reasoning?: string | null; at: number };

export type TimelineItemInput =
    | { kind: 'status'; phase: AgentPhase; detail: string; iteration: number; at?: number }
    | { kind: 'thinking'; text: string; at?: number }
    | { kind: 'plan'; at?: number }
    | { kind: 'plan_update'; id: number; status: string; at?: number }
    | { kind: 'tool_call'; id: string; name: string; at?: number }
    | { kind: 'tool_result'; id: string; name: string; success: boolean; summary: string; latencyMs?: number; at?: number }
    | { kind: 'artifact'; type: string; title?: string; at?: number }
    | { kind: 'warning'; message: string; code?: string; at?: number }
    | { kind: 'budget_warning'; dimension: string; pct: number; message: string; at?: number }
    | { kind: 'decision'; iteration: number; tools: string[]; reasoning?: string | null; at?: number };

export interface GranularUsage {
    userMessageTokens?: number;
    systemPromptTokens?: number;
    baseSystemPromptTokens?: number;
    connectionContextTokens?: number;
    memoryContextTokens?: number;
    toolDefinitionsTokens?: number;
    conversationHistoryTokens?: number;
    assistantHistoryTokens?: number;
    toolResultsTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    cacheHitRate?: number;
}

export interface AgentRequest {
    connectionId: string;
    message: string;
    chatId?: string;
    sessionId?: string;
    mentionedTables?: string[];
    schemaName?: string;
    databaseName?: string;  // Name of the database from connection
    history?: Array<{ role: string; content: string }>;
    synthesisModel?: string;
    agentMode?: 'flash' | 'deep';
    thinking?: boolean;
    projectId?: string | null;
    fileIds?: string[];
}

export interface DurableRunCreated {
    run_id: string;
    status: string;
    chat_id?: string | null;
}

export interface UseAIAgentResult extends AgentState {
    send: (request: AgentRequest) => Promise<void>;
    abort: () => void;
    reset: () => void;
    /** Id of the clarification-paused run, mirrored in state + session-persisted
     * so a resume survives a reset/remount between the pause and the answer. */
    pausedRunId: string | null;
    /** Answer a paused clarification — resumes the SAME durable run with the
     * answer appended to its conversation (backend rebuilds everything else
     * from request_payload). Requires status === 'awaiting_clarification'. */
    resume: (answer: string) => Promise<boolean>;
}

// ─── SSE payload shapes (internal to stream layer) ────────────────────────────

export interface ThinkingEvent { text: string }
export interface ThinkingChunkEvent { text: string }
export interface ThinkingClearEvent { }
export interface ToolCallEvent { id: string; name: string; input: Record<string, unknown>; startedAt?: number }
export interface ToolResultEvent { id: string; name: string; success: boolean; summary: string; latency_ms?: number; downloadUrl?: string; filename?: string }
export interface WarningEvent { message: string; code?: string; tool?: string }
export interface BudgetWarningEvent { dimension: string; pct: number; message: string }
export interface BudgetExhaustedEvent { reason: string; message: string; usage?: Record<string, unknown> }
export interface CancelledEvent { message?: string }
export interface AgentTimeoutEvent { duration_secs: number; message: string }
export interface DecisionEvent { iteration: number; tools_chosen: string[]; reasoning?: string | null; context_tokens?: number }
export interface ArtifactStartEvent { toolCallId: string; type: string; title: string }
export interface ArtifactEvent { type: string; sql?: string; rows?: Record<string, unknown>[]; columns?: Array<{ name: string }>; title?: string; streaming?: boolean; previewType?: string;[k: string]: unknown }
export interface ArtifactRowsEvent { rows: Record<string, unknown>[]; done: boolean }
export interface DeltaEvent { text: string; chat_id?: string }
export interface DoneEvent {
    usage?: {
        output_tokens?: number;
        outputTokens?: number;
        synthesisModel?: string;
        creditsUsed?: number;
        // Granular token tracking
        cacheCreationTokens?: number;
        cacheReadTokens?: number;
        contextComponents?: {
            userMessageTokens?: number;
            systemPromptTokens?: number;
            baseSystemPromptTokens?: number;
            connectionContextTokens?: number;
            memoryContextTokens?: number;
            toolDefinitionsTokens?: number;
            conversationHistoryTokens?: number;
            assistantHistoryTokens?: number;
            toolResultsTokens?: number;
        };
        [k: string]: unknown
    };
    iterations?: number;
    toolsUsed?: string[];
    chat_id?: string
    // Clarification pause: completionReason === 'clarification' means the run
    // PAUSED (status → awaiting_clarification) instead of completing. The done
    // frame then carries `event_index` — the buffer offset where the next
    // (resumed) leg's frames will start — so answering the question resumes the
    // stream from `since=event_index` and skips this stale done frame entirely.
    completionReason?: string;
    event_index?: number;
    /** Durable run id echoed on the paused done frame (agent.py
     * `_with_event_index`) so a resume survives a reset of live agent state. */
    run_id?: string;
}
export interface ErrorEvent { message: string; code?: string }
export interface ChatIdEvent { chat_id: string }
export interface PlanEvent { steps: Array<{ id: number; goal: string; tool: string | null; status: string }> }
export interface PlanUpdateEvent { id: number; status: string }
export interface StatusEvent { phase: AgentPhase; detail: string; iteration: number }
export interface ContextMetaEvent extends ContextMeta { }
export interface QuotaExceededEvent { reason: string; message: string; credits_used: number }
export interface QuotaUpdateEvent { credits_used: number; credits_remaining: number; daily_remaining: number; monthly_pct: number }
