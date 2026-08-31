import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { config } from '../config.js';
import { STACKCHAN_SYSTEM_INSTRUCTION } from './prompts.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';

export interface GeminiSessionCallbacks {
  onAudioData: (base64Pcm: string) => void;
  onTextData: (text: string) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onError: (error: string) => void;
  onClose: (code?: number, reason?: string) => void;
}

export class GeminiLiveSession {
  private session: any = null;
  private toolRegistry: ToolRegistry;
  private callbacks: GeminiSessionCallbacks;
  private isConnected: boolean = false;

  constructor(callbacks: GeminiSessionCallbacks, toolRegistry: ToolRegistry) {
    this.callbacks = callbacks;
    this.toolRegistry = toolRegistry;
  }

  public async connect(): Promise<void> {
    if (!config.geminiApiKey) {
      const err = 'GEMINI_API_KEY is not configured in .env';
      this.callbacks.onError(err);
      throw new Error(err);
    }

    const ai = new GoogleGenAI({
      apiKey: config.geminiApiKey,
      apiVersion: 'v1alpha',
    });

    // Model name format for SDK (strip 'models/' prefix if present)
    const model = config.geminiModel.replace(/^models\//, '');

    console.log(`[GeminiLive] Initializing Gemini Live session via official SDK (@google/genai)...`);
    console.log(`[GeminiLive] Model: ${model}, Voice: ${config.voiceName}`);

    const liveConfig: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: config.voiceName,
          },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: STACKCHAN_SYSTEM_INSTRUCTION,
          },
        ],
      },
    };

    const tools = this.toolRegistry.getToolDefinitions();
    if (tools.length > 0) {
      liveConfig.tools = tools;
    }

    return new Promise(async (resolve, reject) => {
      let resolved = false;

      try {
        this.session = await ai.live.connect({
          model,
          config: liveConfig,
          callbacks: {
            onopen: () => {
              console.log('✅ [GeminiLive] Connected to Gemini Live API via official SDK!');
              this.isConnected = true;
              if (!resolved) {
                resolved = true;
                resolve();
              }
            },
            onmessage: async (msg: LiveServerMessage) => {
              await this.handleMessage(msg);
            },
            onerror: (err: any) => {
              console.error('[GeminiLive] SDK Live Error:', err);
              const errMsg = err?.message || err?.toString() || 'Gemini Live error';
              this.callbacks.onError(errMsg);
              if (!resolved) {
                resolved = true;
                reject(new Error(errMsg));
              }
            },
            onclose: (ev: any) => {
              console.log(`[GeminiLive] Live session closed. Code: ${ev?.code}, Reason: "${ev?.reason || ''}"`);
              this.isConnected = false;
              this.callbacks.onClose(ev?.code, ev?.reason);
              if (!resolved) {
                resolved = true;
                reject(new Error(`Connection closed (${ev?.code}): ${ev?.reason || 'Unknown'}`));
              }
            },
          },
        });
      } catch (err: any) {
        console.error('[GeminiLive] Failed to connect live session:', err);
        this.callbacks.onError(err.message);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      }
    });
  }

  private async handleMessage(msg: LiveServerMessage): Promise<void> {
    if (msg.serverContent) {
      const { modelTurn, turnComplete, interrupted } = msg.serverContent;

      if (interrupted) {
        console.log('[GeminiLive] Model output interrupted by user');
        this.callbacks.onInterrupted();
      }

      if (modelTurn?.parts) {
        for (const part of modelTurn.parts) {
          if (part.inlineData && part.inlineData.data) {
            this.callbacks.onAudioData(part.inlineData.data);
          }
          if (part.text) {
            this.callbacks.onTextData(part.text);
          }
        }
      }

      if (turnComplete) {
        this.callbacks.onTurnComplete();
      }
    }

    if (msg.toolCall) {
      console.log('[GeminiLive] Received Tool Call:', msg.toolCall);
      const functionCalls = msg.toolCall.functionCalls;
      if (Array.isArray(functionCalls)) {
        const functionResponses = [];
        for (const call of functionCalls) {
          try {
            const toolName = call.name || '';
            const result = await this.toolRegistry.executeTool(toolName, (call.args as any) || {});
            functionResponses.push({
              id: call.id,
              name: toolName,
              response: { output: result },
            });
          } catch (err: any) {
            functionResponses.push({
              id: call.id,
              name: call.name,
              response: { error: err.message },
            });
          }
        }

        if (this.session && this.isConnected) {
          try {
            this.session.sendToolResponse({ functionResponses });
          } catch (err: any) {
            console.error('[GeminiLive] Error sending tool response:', err);
          }
        }
      }
    }
  }

  public sendAudioChunk(base64Pcm16k: string): void {
    if (!this.session || !this.isConnected) return;
    try {
      this.session.sendRealtimeInput({
        media: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Pcm16k,
        },
      });
    } catch (err: any) {
      console.error('[GeminiLive] Error sending audio chunk:', err.message);
    }
  }

  public sendTextMessage(text: string): void {
    if (!this.session || !this.isConnected) return;
    try {
      this.session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      });
    } catch (err: any) {
      console.error('[GeminiLive] Error sending text message:', err.message);
    }
  }

  public close(): void {
    if (this.session) {
      try {
        this.session.close();
      } catch (err) {
        // ignore
      }
      this.session = null;
      this.isConnected = false;
    }
  }
}
