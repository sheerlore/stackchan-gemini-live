export interface RelayClientEvents {
  onSessionStarted: () => void;
  onSessionClosed: (reason?: string) => void;
  onAudioOutput: (base64Pcm: string) => void;
  onTextOutput: (text: string) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onError: (error: string) => void;
  onStatusChange: (status: "disconnected" | "connecting" | "connected") => void;
}

export class RelayClient {
  private ws: WebSocket | null = null;
  private events: RelayClientEvents;
  private url: string;

  constructor(events: RelayClientEvents) {
    this.events = events;
    // Determine backend WebSocket URL (always same-origin /ws)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname || "localhost";
    const port = window.location.port;
    this.url = `${protocol}//${hostname}${port ? `:${port}` : ""}/ws`;
    console.log(`[RelayClient] Target WebSocket URL: ${this.url}`);
  }

  public connect(systemInstruction?: string, voiceName?: string): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.events.onStatusChange("connecting");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("[RelayClient] Connected to backend relay WebSocket");
        this.events.onStatusChange("connecting");
        // Request session start to Gemini with custom system instruction and voice
        this.send({ type: "start_session", systemInstruction, voiceName });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error("[RelayClient] Error parsing message:", err);
        }
      };

      this.ws.onerror = (err) => {
        console.error("[RelayClient] WebSocket error:", err);
        this.events.onError(
          `Failed to connect to backend server at ${this.url}. Please ensure the server is running on port 3000.`,
        );
      };

      this.ws.onclose = (ev) => {
        console.log(
          `[RelayClient] Disconnected from backend (code: ${ev.code}, reason: ${ev.reason})`,
        );
        this.events.onStatusChange("disconnected");
        this.events.onSessionClosed(ev.reason || "Server connection closed");
        this.ws = null;
      };
    } catch (err: any) {
      this.events.onStatusChange("disconnected");
      this.events.onError(err.message);
    }
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case "session_started":
        console.log("[RelayClient] Gemini Live session is ready!");
        this.events.onSessionStarted();
        break;
      case "session_closed":
        console.log("[RelayClient] Session closed by backend:", msg.reason);
        this.events.onSessionClosed(msg.reason);
        break;
      case "audio_output":
        if (msg.data) {
          this.events.onAudioOutput(msg.data);
        }
        break;
      case "text_output":
        if (msg.text) {
          this.events.onTextOutput(msg.text);
        }
        break;
      case "interrupted":
        this.events.onInterrupted();
        break;
      case "turn_complete":
        this.events.onTurnComplete();
        break;
      case "error":
        console.error("[RelayClient] Error from backend:", msg.message);
        this.events.onError(msg.message);
        break;
      default:
        console.log("[RelayClient] Unhandled message:", msg);
    }
  }

  public sendAudioChunk(base64Pcm16k: string): void {
    this.send({
      type: "audio_input",
      data: base64Pcm16k,
    });
  }

  public sendTextMessage(text: string): void {
    this.send({
      type: "text_input",
      text,
    });
  }

  public disconnect(): void {
    if (this.ws) {
      this.send({ type: "stop_session" });
      this.ws.close();
      this.ws = null;
    }
  }

  private send(obj: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }
}
