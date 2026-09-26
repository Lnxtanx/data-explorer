// =============================================================================
// transcriptMapper.ts — Durable Run Transcript to Side Panel Messages
// Pure mapper that converts raw database/run transcripts into displayable chat bubbles.
// Strips temporal tags, scaffolds, internal tool markers, and raw SQL.
// =============================================================================

import { type SidePanelMessage } from './ResonaAIMessageItem';
import { type DashboardRunState } from '../api/dashboard';
import type { AgentToolStep } from '../../ai/hooks/useAIAgent';
import { sanitizeToolInput, sanitizeToolSummary } from '../../ai/tools/toolSanitize';
import { stripTemporalTag } from '@/lib/utils';

/**
 * Map a durable run's transcript (user/assistant/tool messages) into side-panel
 * bubbles. Assistant content is surfaced; tool/system scaffolding, internal ids
 * and SQL are stripped so history reads like a conversation, not a wire dump.
 */
export function transcriptToMessages(runState: DashboardRunState, _isResuming: boolean): SidePanelMessage[] {
  const msgs: SidePanelMessage[] = [];
  const rawTranscript = (runState.transcript || runState.conversation || []).filter(
    (m) => m && typeof m.role === 'string' && !(m as any)._durable_marker && !(m as any)._pinboard
  );

  // Defensive deduplication: strip duplicate consecutive user turns or legacy dumps
  const transcript: typeof rawTranscript = [];
  for (const m of rawTranscript) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      const content = stripTemporalTag((m.content || '').trim());
      if (!content) continue;
      const lastMsg = transcript[transcript.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        const prevContent = stripTemporalTag((lastMsg.content || '').trim());
        if (prevContent === content) {
          continue; // drop immediate duplicate user turn
        }
      }
    }
    transcript.push(m);
  }

  let currentAssistantMsg: SidePanelMessage | null = null;
  const toolStepMap = new Map<string, AgentToolStep>();
  const seenStepKeys = new Set<string>();

  for (const m of transcript) {
    if (m.role === 'user') {
      const content = stripTemporalTag((m.content || '').trim());
      const timestamp = (m as any).timestamp || (m as any).created_at || runState.created_at;
      if (content) {
        currentAssistantMsg = null;
        const files = Array.isArray((m as any).files)
          ? (m as any).files
          : (typeof (m as any).files === 'string' ? [(m as any).files] : undefined);
        msgs.push({ id: (m as any).id || `u-${msgs.length}-${(m as any).timestamp || (m as any).created_at || msgs.length}`, role: 'user', content, timestamp, files });
      }
    } else if (m.role === 'assistant') {
      const content = (m.content || '').trim();
      const rawToolCalls = (m as any).tool_calls;
      const timestamp = (m as any).timestamp || (m as any).created_at || runState.completed_at || runState.created_at;

      const newToolSteps: AgentToolStep[] = [];
      const thinkingText = typeof (m as any).thinking === 'string' ? (m as any).thinking.trim() : '';
      if (thinkingText) {
        newToolSteps.push({
          id: `thinking-${msgs.length}-${transcript.indexOf(m)}`,
          name: 'thinking',
          type: 'thinking',
          label: 'Thinking…',
          input: {},
          status: 'done',
          result: { success: true, summary: thinkingText },
        });
      }
      if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
        rawToolCalls.forEach((tc: any, idx: number) => {
          let input = tc.args || tc.arguments || tc.function?.arguments || {};
          if (typeof input === 'string') {
            try {
              input = JSON.parse(input);
            } catch {
              // Leave as-is
            }
          }
          const stepId = tc.id || `tc-${msgs.length}-${idx}`;
          const stepKey = tc.id || `${tc.name || tc.function?.name || 'tool'}:${typeof input === 'object' ? JSON.stringify(input) : input}`;
          if (seenStepKeys.has(stepKey)) return;
          seenStepKeys.add(stepKey);

          const toolName = tc.name || tc.function?.name || 'tool';
          const step: AgentToolStep = {
            id: stepId,
            name: toolName,
            input: sanitizeToolInput(
              toolName,
              typeof input === 'object' && input !== null ? input : {}
            ),
            status: 'done',
          };
          newToolSteps.push(step);
          if (tc.id) {
            toolStepMap.set(tc.id, step);
          }
        });
      }

      const rawSteps = (m as any).toolSteps || (m as any).execution_trace?.toolSteps;
      if (newToolSteps.length === 0 && Array.isArray(rawSteps) && rawSteps.length > 0) {
        rawSteps.forEach((s: any, idx: number) => {
          const toolName = s.name || s.tool || 'tool';
          const stepId = s.id || `ts-${msgs.length}-${idx}`;
          newToolSteps.push({
            id: stepId,
            name: toolName,
            input: sanitizeToolInput(toolName, s.input ?? {}),
            status: s.status === 'error' ? 'error' : 'done',
            result: s.result ? { success: s.result.success ?? true, summary: sanitizeToolSummary(s.result.summary || '') } : undefined,
            latencyMs: s.latency_ms ?? s.latencyMs,
          });
        });
      }

      const msgId = (m as any).id || `a-${msgs.length}-${(m as any).timestamp || (m as any).created_at || msgs.length}`;

      if (!currentAssistantMsg) {
        currentAssistantMsg = {
          id: msgId,
          role: 'assistant',
          content: content,
          toolSteps: newToolSteps.length > 0 ? newToolSteps : undefined,
          thinking: (m as any).thinking || undefined,
          isStreaming: false,
          timestamp,
        };
        msgs.push(currentAssistantMsg);
      } else {
        // Coalesce additional tool calls from this turn into the active assistant container
        if (newToolSteps.length > 0) {
          currentAssistantMsg.toolSteps = [
            ...(currentAssistantMsg.toolSteps || []),
            ...newToolSteps,
          ];
        }
        const laterThinking = typeof (m as any).thinking === 'string' ? (m as any).thinking.trim() : '';
        if (laterThinking && !currentAssistantMsg.thinking) {
          currentAssistantMsg.thinking = laterThinking;
        }
        if (content) {
          currentAssistantMsg.content = currentAssistantMsg.content
            ? `${currentAssistantMsg.content}\n\n${content}`
            : content;
        }
        if (timestamp) {
          currentAssistantMsg.timestamp = timestamp;
        }
      }
    } else if (m.role === 'tool') {
      // Enrich the matching tool step with result details (never SQL / ids)
      const callId = (m as any).tool_call_id;
      const step = callId ? toolStepMap.get(callId) : null;
      if (step) {
        if ((m as any).error) {
          step.status = 'error';
          step.result = { success: false, summary: sanitizeToolSummary(String((m as any).error)) };
        } else {
          step.status = 'done';
          step.result = {
            success: true,
            summary:
              typeof m.content === 'string'
                ? sanitizeToolSummary(m.content.slice(0, 300))
                : '',
          };
        }
      }
    }
  }

  // Fallback: If msgs has no user turn at all, surface runState.message or payload prompt
  const hasUserMsg = msgs.some((m) => m.role === 'user');
  if (!hasUserMsg && (runState.message || (runState as any).request_payload?.message)) {
    const userPrompt = stripTemporalTag(runState.message || (runState as any).request_payload?.message);
    if (userPrompt) {
      msgs.unshift({
        id: `u-initial-${runState.id || 'fallback'}`,
        role: 'user',
        content: userPrompt,
        timestamp: runState.created_at,
      });
    }
  }

  // Ensure every user turn has a visible assistant outcome
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg && lastMsg.role === 'user') {
    if (runState.status === 'completed') {
      msgs.push({
        id: `a-${msgs.length}`,
        role: 'assistant',
        content: runState.completion_message || 'Dashboard generated and saved.',
        isStreaming: false,
        timestamp: runState.completed_at || runState.created_at,
      });
    } else if (runState.status === 'running') {
      msgs.push({
        id: `a-${msgs.length}`,
        role: 'assistant',
        content: '',
        isStreaming: true,
        timestamp: runState.created_at,
      });
    } else if (runState.status === 'failed') {
      msgs.push({
        id: `a-${msgs.length}`,
        role: 'assistant',
        content: `⚠️ ${runState.error || runState.completion_message || 'Dashboard generation failed.'}`,
        isStreaming: false,
        timestamp: runState.completed_at || runState.created_at,
      });
    }
  }

  // Ensure every assistant turn has non-empty, meaningful content
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    if (msg.role === 'assistant' && !msg.content.trim()) {
      const isLast = i === msgs.length - 1;
      // 1. If it's the last message and completion_message is present, use it
      if (isLast && runState.completion_message?.trim()) {
        msg.content = sanitizeToolSummary(runState.completion_message.trim());
        continue;
      }
      // 2. If the assistant executed tools, synthesize a clear summary of what happened
      if (msg.toolSteps && msg.toolSteps.length > 0) {
        const querySteps = msg.toolSteps.filter(
          (s) => s.name === 'run_query' || s.name?.toLowerCase().includes('query')
        );
        const mutationStep = msg.toolSteps.find((s) =>
          ['edit_panel', 'add_panel', 'remove_panel', 'save_dashboard'].includes(s.name)
        );

        if (mutationStep) {
          msg.content = `Dashboard updated via ${mutationStep.name}.`;
        } else if (querySteps.length > 0) {
          const summaries = querySteps
            .map((s) => s.result?.summary)
            .filter((s): s is string => Boolean(s && s.trim()));
          if (summaries.length > 0) {
            const firstSummary = summaries[0];
            try {
              const parsed = JSON.parse(firstSummary);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const keys = Object.keys(parsed[0]);
                const vals = Object.values(parsed[0]);
                msg.content = `Queried database: ${keys[0]} is **${vals[0]}**.`;
              } else if (parsed && typeof parsed === 'object' && parsed.rows && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
                const row = parsed.rows[0];
                const vals = Object.entries(row)
                  .map(([k, v]) => `${k}: **${v}**`)
                  .join(', ');
                msg.content = `Query result: ${vals}`;
              } else {
                msg.content = `Query completed: ${firstSummary.slice(0, 150)}`;
              }
            } catch {
              msg.content = firstSummary.length > 150 ? `${firstSummary.slice(0, 150)}...` : firstSummary;
            }
          } else {
            msg.content = 'Queried database to inspect metrics.';
          }
        } else {
          msg.content = 'Action completed.';
        }
      } else if (isLast) {
        if (runState.status === 'completed') {
          msg.content = runState.completion_message || 'Dashboard generated and saved.';
        } else if (runState.status === 'failed') {
          msg.content = `⚠️ ${runState.error || runState.completion_message || 'Dashboard generation failed.'}`;
        }
      } else {
        msg.content = 'Action completed.';
      }
      if (!msg.content.trim()) {
        msg.content = 'Action completed.';
      }
      // Never let synthesized text leak SQL / internal ids.
      msg.content = sanitizeToolSummary(msg.content);
    }
  }

  // Defensive deduplication: coalesce adjacent duplicate assistant messages
  const deduped: SidePanelMessage[] = [];
  for (const m of msgs) {
    const last = deduped[deduped.length - 1];
    if (last && last.role === 'assistant' && m.role === 'assistant') {
      if (last.content.trim() === m.content.trim() || !m.content.trim() || !last.content.trim()) {
        if (!last.content.trim() && m.content.trim()) {
          last.content = m.content;
        }
        if (m.toolSteps && m.toolSteps.length > 0) {
          last.toolSteps = [...(last.toolSteps || []), ...m.toolSteps];
        }
        if (m.thinking && !last.thinking) {
          last.thinking = m.thinking;
        }
        continue;
      }
    }
    deduped.push(m);
  }

  return deduped;
}

