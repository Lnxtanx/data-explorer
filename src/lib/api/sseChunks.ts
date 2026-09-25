/**
 * sseChunks.ts — reassembly of chunked SSE frames.
 *
 * backend-ai `src/streaming/emitter.py` splits any SSE payload larger than
 * 64 KB into N consecutive frames of the SAME event name, each carrying:
 *
 *   { chunk_index: 0..N-1, total_chunks: N, chunk: "<utf8 slice>" }
 *
 * This exists because nginx/Cloudflare can drop oversized frames. Without
 * reassembly on the client, a naive `JSON.parse` + dispatch turns a chunk
 * wrapper into a *real* event whose payload is only
 * { chunk_index, total_chunks, chunk } — so e.g. a dashboard `done` frame
 * loses its run_id, html and panelData entirely and the dashboard never renders.
 *
 * Frames arrive in order on a single connection, so a single in-flight buffer
 * per event name is sufficient. Interleaving different event names is
 * tolerated because the buffer is keyed by name.
 *
 * Chunks are sliced on BYTE boundaries and each slice is decoded with
 * `errors: 'replace'` server-side, so a multi-byte character can straddle a
 * boundary. Reassembly therefore concatenates the slices and parses once at
 * the end — we never decode individual chunks.
 */

export interface ChunkEnvelope {
    chunk_index: number;
    total_chunks: number;
    chunk: string;
}

/** True when `data` is a chunk envelope rather than a real event payload. */
export function isChunkEnvelope(data: unknown): data is ChunkEnvelope {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
        typeof d.chunk_index === 'number' &&
        typeof d.total_chunks === 'number' &&
        typeof d.chunk === 'string'
    );
}

interface Pending {
    total: number;
    parts: string[];
    /** Indices actually received. Completion is based on this SET, not on a
     *  count of arrivals: a reconnect that replays from index 0 re-delivers
     *  indices we already have, and counting arrivals would complete early on a
     *  half-filled array (producing unparseable JSON). */
    have: Set<number>;
}

/**
 * Accumulates chunk frames per event name and yields the real payload once
 * every chunk has arrived.
 *
 * `push` returns the reassembled value when a message completes, otherwise
 * `undefined`. Non-chunk payloads pass straight through.
 */
export class SseChunkAssembler {
    private readonly pending = new Map<string, Pending>();

    /** Feed one parsed frame. Returns the real payload, or undefined to wait. */
    push(eventName: string, data: unknown): unknown | undefined {
        if (!isChunkEnvelope(data)) return data;

        const { chunk_index: idx, total_chunks: total, chunk } = data;
        if (total <= 0 || idx < 0 || idx >= total) return undefined;

        let entry = this.pending.get(eventName);
        if (!entry || entry.total !== total) {
            // Either the first chunk, or a new message restarted (a reconnect
            // replaying from `since=0` can re-send an already-seen message).
            // Starting fresh is correct: we only complete on a full sequence.
            entry = { total, parts: new Array<string>(total).fill(''), have: new Set() };
            this.pending.set(eventName, entry);
        }

        entry.parts[idx] = chunk;
        entry.have.add(idx);
        if (entry.have.size < total) return undefined;

        this.pending.delete(eventName);
        try {
            return JSON.parse(entry.parts.join(''));
        } catch {
            return undefined;   // corrupt sequence — drop rather than crash
        }
    }

    /** Drop any partially-assembled state (used when a connection ends). */
    reset(): void {
        this.pending.clear();
    }
}
