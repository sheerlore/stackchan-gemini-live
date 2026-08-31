/**
 * PCM Player Worklet
 * Buffers and plays 24kHz 16-bit Mono PCM audio, calculating live RMS for lip-sync
 */
class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceSampleRate = 24000;
    this.queue = [];
    this.currentChunk = null;
    this.currentChunkOffset = 0;
    this.rmsUpdateInterval = 3; // Update RMS every 3 frames (~384 samples = ~8ms)
    this.frameCount = 0;

    this.port.onmessage = (event) => {
      const { type, buffer } = event.data;
      if (type === "pcm_chunk" && buffer) {
        // buffer is ArrayBuffer of Int16 samples
        const int16Array = new Int16Array(buffer);
        // Convert to Float32 [-1.0, 1.0]
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }
        this.queue.push(float32Array);
      } else if (type === "clear") {
        // Interrupted - clear buffer immediately
        this.queue = [];
        this.currentChunk = null;
        this.currentChunkOffset = 0;
        this.port.postMessage({ type: "rms", rms: 0 });
      }
    };
  }

  process(_inputs, outputs, _parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const outputChannel = output[0]; // Output Float32 buffer (128 samples)
    const outSampleRate = sampleRate; // e.g. 48000
    const step = this.sourceSampleRate / outSampleRate; // e.g. 24000 / 48000 = 0.5

    let sumSquares = 0;
    let samplesRead = 0;

    for (let i = 0; i < outputChannel.length; i++) {
      if (!this.currentChunk || this.currentChunkOffset >= this.currentChunk.length) {
        if (this.queue.length > 0) {
          this.currentChunk = this.queue.shift();
          this.currentChunkOffset = 0;
        } else {
          this.currentChunk = null;
        }
      }

      if (this.currentChunk) {
        const sample = this.currentChunk[Math.floor(this.currentChunkOffset)] || 0;
        outputChannel[i] = sample;
        this.currentChunkOffset += step;
        sumSquares += sample * sample;
        samplesRead++;
      } else {
        outputChannel[i] = 0;
      }
    }

    this.frameCount++;
    if (this.frameCount >= this.rmsUpdateInterval) {
      this.frameCount = 0;
      const rms = samplesRead > 0 ? Math.sqrt(sumSquares / samplesRead) : 0;
      this.port.postMessage({ type: "rms", rms: Math.min(1.0, rms * 3.5) }); // Scaled RMS for responsive lip opening
    }

    return true;
  }
}

registerProcessor("pcm-player-processor", PcmPlayerProcessor);
