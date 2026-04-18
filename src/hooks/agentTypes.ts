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
    fileName?: string;
    fileType?: string;
    sizeBytes?: number;
    slideCount?: number;

    // ─── Suggestions artifact (type === 'suggestions') ────────────────────
    suggestions?: AnalysisSuggestion[];
    columnSummary?: Record<string, string[]>;

    // ─── Analysis plan artifact (type === 'analysis_plan') ────────────────
    planStepsData?: PlanStep[];

    // ─── Slide deck artifact (type === 'slide_deck') ──────────────────────
    /** Raw JSON string content (for slide_deck or html_report from workspace) */
    content?: string;
    /** Name of the workspace file this artifact came from */
    workspaceFileName?: string;
    /** UUID of the workspace file */
    workspaceFileId?: string;
}

// ─── Hook-level types ─────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'done' | 'error' | 'aborted';
export type AgentPhase = 'idle' | 'planning' | 'executing' | 'synthesizing' | 'done';

export interface ContextMeta {
    messages_in_window: number;
    session_id: string;
    has_history: boolean;
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
}

export interface UseAIAgentResult extends AgentState {
    send: (request: AgentRequest) => Promise<void>;
    abort: () => void;
    reset: () => void;
}

// ─── SSE payload shapes (internal to stream layer) ────────────────────────────

export interface ThinkingEvent   { text: string }
export interface ThinkingChunkEvent { text: string }
export interface ThinkingClearEvent {}
export interface ToolCallEvent   { id: string; name: string; input: Record<string, unknown> }
export interface ToolResultEvent { id: string; name: string; success: boolean; summary: string }
export interface ArtifactStartEvent { toolCallId: string; type: string; title: string }
export interface ArtifactEvent   { type: string; sql?: string; rows?: Record<string, unknown>[]; columns?: Array<{ name: string }>; title?: string; streaming?: boolean }
export interface ArtifactRowsEvent { rows: Record<string, unknown>[]; done: boolean }
export interface DeltaEvent      { text: string; chat_id?: string }
export interface DoneEvent       { usage?: { output_tokens?: number; outputTokens?: number; synthesisModel?: string; creditsUsed?: number; [k: string]: unknown }; iterations?: number; toolsUsed?: string[]; chat_id?: string }
export interface ErrorEvent      { message: string; code?: string }
export interface ChatIdEvent     { chat_id: string }
export interface PlanEvent       { steps: Array<{ id: number; goal: string; tool: string | null; status: string }> }
export interface PlanUpdateEvent { id: number; status: string }
export interface StatusEvent     { phase: AgentPhase; detail: string; iteration: number }
export interface ContextMetaEvent extends ContextMeta {}
export interface QuotaExceededEvent { reason: string; message: string; credits_used: number }
export interface QuotaUpdateEvent   { credits_used: number; credits_remaining: number; daily_remaining: number; monthly_pct: number }
