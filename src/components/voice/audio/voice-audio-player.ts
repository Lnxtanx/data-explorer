// =============================================================================
// VoiceAudioPlayer — 24kHz PCM → Web Audio playback queue (voice-to-voice)
//
// Enqueues raw Base64 24kHz 16-bit PCM chunks received from the Gemini Live
// relay onto the AudioContext timeline with a small jitter buffer (~30ms
// lead-in, growing only after an underrun) to prevent gap clicks.
//
// Gemini Live output spec (architecture doc §2.1):
//   PCM 16-bit LE mono · 24kHz · streamed in serverContent.modelTurn.parts
//
// Full-duplex note: barge-in calls stopAndClear() mid-stream — the context is
// kept (not closed) so the user-gesture resume state survives.
// =============================================================================

const OUTPUT_SAMPLE_RATE = 24000;
const JITTER_LEAD_SECONDS = 0.03;

export class VoiceAudioPlayer {
    private ctx: AudioContext;
    private nextPlayTime = 0;
    private sources = new Set<AudioBufferSourceNode>();
    private analyser: AnalyserNode;
    private gainNode: GainNode;

    constructor() {
        const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        // Do not force 24000Hz on the root AudioContext — Windows WASAPI/hardware DACs
        // require native 44.1kHz or 48kHz. Supplying OUTPUT_SAMPLE_RATE to createBuffer
        // allows the browser's audio engine to cleanly resample to hardware output.
        this.ctx = new AudioCtx();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.4;

        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 1.0;

        this.analyser.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
    }

    /** Resume a suspended AudioContext (must be called from a user gesture). */
    public async resume(): Promise<void> {
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    /** Get normalized output audio level (0.0 - 1.0) for audio-reactive visuals. */
    public getAudioLevel(): number {
        if (this.sources.size === 0) return 0;
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        const avg = sum / data.length;
        return Math.min(1, Math.max(0, (avg / 128) * 1.6));
    }

    /** Enqueue one Base64-encoded 24kHz PCM chunk for gapless playback. */
    public enqueueChunk(base64Pcm24k: string): void {
        if (!base64Pcm24k) return;
        if (this.ctx.state === 'suspended') {
            void this.ctx.resume();
        }

        const bytes = decodeBase64(base64Pcm24k);
        if (bytes.byteLength < 2) return;
        const sampleCount = Math.floor(bytes.byteLength / 2);
        const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const floats = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
            floats[i] = dataView.getInt16(i * 2, true) / 32768;
        }

        const audioBuffer = this.ctx.createBuffer(1, sampleCount, OUTPUT_SAMPLE_RATE);
        audioBuffer.getChannelData(0).set(floats);

        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.analyser);

        // Jitter buffer: never start earlier than the previous chunk's end,
        // never sooner than now + lead-in (re-sync after an underrun).
        const startAt = Math.max(this.nextPlayTime, this.ctx.currentTime + JITTER_LEAD_SECONDS);
        source.start(startAt);
        this.nextPlayTime = startAt + audioBuffer.duration;

        this.sources.add(source);
        source.onended = () => {
            this.sources.delete(source);
            if (this.sources.size === 0) {
                // Fully drained — the next chunk starts fresh at now + lead-in.
                this.nextPlayTime = 0;
            }
        };
    }

    /** Stop playback immediately and reset the timeline (barge-in / session end). */
    public stopAndClear(): void {
        for (const source of this.sources) {
            try {
                source.stop();
            } catch {
                /* already stopped */
            }
            source.disconnect();
        }
        this.sources.clear();
        this.nextPlayTime = 0;
        // The AudioContext is deliberately kept open: closing it would discard
        // the user-gesture resume state and force a new gesture to speak again.
    }

    /** Release the AudioContext (session teardown). */
    public dispose(): void {
        this.stopAndClear();
        void this.ctx.close();
    }
}

function decodeBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
