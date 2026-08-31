/**
 * PCM Recorder Worklet
 * Downsamples input audio from native sampleRate (e.g. 48kHz/44.1kHz) to 16kHz 16-bit Mono PCM
 */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.bufferSize = 512; // 512 samples = 32ms chunks
    this.outputBuffer = new Int16Array(this.bufferSize);
    this.outputIndex = 0;
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono input channel
    const inputSampleRate = sampleRate; // Global AudioWorklet sampleRate
    const resampleRatio = inputSampleRate / this.targetSampleRate;

    // Linear downsampling
    for (let i = 0; i < channelData.length; i += resampleRatio) {
      const idx = Math.floor(i);
      let sample = channelData[idx] || 0;

      // Clamp between -1.0 and 1.0
      sample = Math.max(-1, Math.min(1, sample));

      // Convert Float32 to 16-bit signed integer (Little-Endian)
      const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.outputBuffer[this.outputIndex++] = int16Sample;

      if (this.outputIndex >= this.bufferSize) {
        // Send PCM chunk to main thread
        this.port.postMessage(
          {
            type: "pcm_data",
            buffer: this.outputBuffer.buffer.slice(0),
          },
          [this.outputBuffer.buffer.slice(0)],
        );

        this.outputBuffer = new Int16Array(this.bufferSize);
        this.outputIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-recorder-processor", PcmRecorderProcessor);
