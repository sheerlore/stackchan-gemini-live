export interface AudioControllerCallbacks {
  onPcmData16k: (base64Data: string) => void;
  onRmsLevel: (rms: number) => void;
}

export class AudioController {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private recorderNode: AudioWorkletNode | null = null;
  private playerNode: AudioWorkletNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private isRecording: boolean = false;
  private callbacks: AudioControllerCallbacks;

  constructor(callbacks: AudioControllerCallbacks) {
    this.callbacks = callbacks;
  }

  public async init(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }
      return;
    }

    // Initialize AudioContext
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioCtx({ sampleRate: 48000 });

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    // Load AudioWorklet modules
    try {
      await this.audioCtx.audioWorklet.addModule("/pcm-recorder-worklet.js");
      await this.audioCtx.audioWorklet.addModule("/pcm-player-worklet.js");
      console.log("[AudioController] AudioWorklets loaded successfully");
    } catch (err) {
      console.error("[AudioController] Failed to load AudioWorklet modules:", err);
      throw err;
    }

    // Create player node
    this.playerNode = new AudioWorkletNode(this.audioCtx, "pcm-player-processor");
    this.playerNode.port.onmessage = (event) => {
      if (event.data.type === "rms") {
        this.callbacks.onRmsLevel(event.data.rms);
      }
    };
    this.playerNode.connect(this.audioCtx.destination);
  }

  public async startMicrophone(): Promise<void> {
    await this.init();
    if (!this.audioCtx) return;

    if (this.isRecording) return;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      this.recorderNode = new AudioWorkletNode(this.audioCtx, "pcm-recorder-processor");

      this.recorderNode.port.onmessage = (event) => {
        if (event.data.type === "pcm_data") {
          const buffer: ArrayBuffer = event.data.buffer;
          const base64 = this.arrayBufferToBase64(buffer);
          this.callbacks.onPcmData16k(base64);
        }
      };

      this.micSource.connect(this.recorderNode);
      this.isRecording = true;
      console.log("[AudioController] Microphone capture started");
    } catch (err) {
      console.error("[AudioController] Microphone permission denied or failed:", err);
      throw err;
    }
  }

  public stopMicrophone(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.recorderNode) {
      this.recorderNode.disconnect();
      this.recorderNode = null;
    }
    this.isRecording = false;
    console.log("[AudioController] Microphone stopped");
  }

  /**
   * Play 24kHz PCM audio chunk received from Gemini
   */
  public playAudioChunk(base64Pcm24k: string): void {
    if (!this.playerNode) return;

    const arrayBuffer = this.base64ToArrayBuffer(base64Pcm24k);
    this.playerNode.port.postMessage({
      type: "pcm_chunk",
      buffer: arrayBuffer,
    });
  }

  /**
   * Clear playback buffer on interruption
   */
  public clearPlayback(): void {
    if (this.playerNode) {
      this.playerNode.port.postMessage({ type: "clear" });
    }
  }

  public close(): void {
    this.stopMicrophone();
    if (this.playerNode) {
      this.playerNode.disconnect();
      this.playerNode = null;
    }
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
