// =============================================================================
// Shared types for the ResonaAI dashboard side panel.
//
// Extracted in refactor Phase 1: these lived inside ResonaAISessionHistory.tsx,
// a 295-line dialog whose component and two of its three exports had zero
// callers (ResonaAIHeader re-implements the same UI inline). Only the
// `SessionHistoryItem` shape was still consumed, so the type moved here and the
// component was deleted.
// =============================================================================

/** One row in the session-history dropdown. */
export interface SessionHistoryItem {
  id: string;
  sessionId?: string;
  title: string;
  status?: string;
  createdAt?: number | string | null;
  turnCount?: number;
  isActive?: boolean;
}
