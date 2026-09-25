// =============================================================================
// Voice Recorder — AudioWorklet processor (voice-to-voice capture)
// Loaded via: audioWorklet.addModule('/worklets/voice-recorder-worklet.js')
//
// Captures microphone input, downsamples from the AudioContext's native rate
// to 16kHz Linear PCM (16-bit LE mono), and posts a binary chunk to the main
// thread every 100ms for WebSocket upload to Node → backend-ai → Gemini Live.
//
// Gemini Live input spec (architecture doc §2.1):
//   PCM 16-bit LE mono · 16kHz · chunks every 100ms (1,600 samples / 3,200 bytes)
//
// Downsample: box-average decimation — average the input samples covered by
// one 16kHz output interval (crude anti-alias low-pass), fractional carry
// across process() blocks so arbitrary context rates (44.1k/48k) work.
// =============================================================================

class VoiceRecorderWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.targetSampleRate = 16000;
        // Input samples per output sample (e.g. 48000/16000 = 3, 44100/16000 = 2.75625)
        this.ratio = sampleRate / this.targetSampleRate;
        this.residual = 0;      // fractional input samples carried into the next block
        this.windowSum = 0;     // box-filter accumulator for the current output interval
        this.windowCount = 0;
        this.chunkSamples = Math.round(this.targetSampleRate * 0.1); // 1,600 → 100ms
        this.buffer = new Int16Array(this.chunkSamples);
        this.bufferPos = 0;
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;
        const channel = input[0];

        let pos = this.residual;
        for (let i = 0; i < channel.length; i++) {
            this.windowSum += channel[i];
            this.windowCount += 1;
            pos += 1;
            if (pos >= this.ratio) {
                pos -= this.ratio;
                const avg = this.windowCount > 0 ? this.windowSum / this.windowCount : 0;
                const clamped = Math.max(-1, Math.min(1, avg));
                this.buffer[this.bufferPos++] =
                    clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
                this.windowSum = 0;
                this.windowCount = 0;
                if (this.bufferPos === this.chunkSamples) {
                    const out = this.buffer;
                    this.buffer = new Int16Array(this.chunkSamples);
                    this.bufferPos = 0;
                    // transfer the backing buffer — no copy, no GC churn at 10Hz
                    this.port.postMessage(out.buffer, [out.buffer]);
                }
            }
        }
        this.residual = pos;
        return true;
    }
}

registerProcessor('voice-recorder-worklet', VoiceRecorderWorklet);
