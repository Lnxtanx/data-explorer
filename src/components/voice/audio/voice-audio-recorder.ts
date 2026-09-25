// =============================================================================
// src/components/voice/audio/voice-audio-recorder.ts — 16kHz PCM Web Audio Microphone Capture
// =============================================================================

export class VoiceAudioRecorder {
    private stream: MediaStream | null = null;
    private audioCtx: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private analyserNode: AnalyserNode | null = null;
    private analyserData: Uint8Array<ArrayBuffer> | null = null;
    private isMuted = false;

    /**
     * Initialize microphone stream and AudioWorklet downsampler.
     * @param onChunk Callback invoked whenever the worklet produces a 16kHz PCM chunk (~100ms).
     */
    public async start(onChunk: (buffer: ArrayBuffer) => void): Promise<void> {
        this.dispose();

        // 1. Acquire microphone stream with echo cancellation and noise suppression
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
        this.stream = stream;

        // Apply initial mute state to audio tracks
        stream.getAudioTracks().forEach((track) => {
            track.enabled = !this.isMuted;
        });

        // 2. Initialize AudioContext and AudioWorkletNode
        const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        this.audioCtx = ctx;

        await ctx.audioWorklet.addModule('/worklets/voice-recorder-worklet.js');

        const source = ctx.createMediaStreamSource(stream);
        this.sourceNode = source;

        // 3. Setup AnalyserNode for audio visualization
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        this.analyserNode = analyser;
        this.analyserData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

        // 4. Setup Worklet and listen for PCM chunks
        const worklet = new AudioWorkletNode(ctx, 'voice-recorder-worklet');
        this.workletNode = worklet;
        source.connect(worklet);

        worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (this.isMuted) return;
            onChunk(event.data);
        };
    }

    /**
     * Set microphone mute status. When muted, audio tracks are disabled and chunks are dropped.
     */
    public setMuted(muted: boolean): void {
        this.isMuted = muted;
        if (this.stream) {
            this.stream.getAudioTracks().forEach((track) => {
                track.enabled = !muted;
            });
        }
    }

    /**
     * Read the current normalized audio volume (0.0 to 1.0) from the AnalyserNode.
     */
    public getAudioLevel(): number {
        if (!this.analyserNode || !this.analyserData || this.isMuted) return 0;
        this.analyserNode.getByteFrequencyData(this.analyserData);
        let sum = 0;
        for (let i = 0; i < this.analyserData.length; i++) {
            sum += this.analyserData[i];
        }
        const avg = sum / this.analyserData.length;
        return Math.min(1, Math.max(0, avg / 128));
    }

    /**
     * Stop and tear down all hardware tracks, audio nodes, and AudioContext.
     */
    public dispose(): void {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        if (this.analyserNode) {
            this.analyserNode.disconnect();
            this.analyserNode = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
        if (this.audioCtx) {
            void this.audioCtx.close();
            this.audioCtx = null;
        }
        this.analyserData = null;
    }
}
