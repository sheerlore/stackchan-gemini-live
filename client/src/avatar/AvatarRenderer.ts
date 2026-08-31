import { Eye } from "./Eye.js";
import { Mouth } from "./Mouth.js";
import { AvatarColors, AvatarState, Emotion, Vector2 } from "./types.js";

export class AvatarRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private leftEye: Eye;
  private rightEye: Eye;
  private mouth: Mouth;

  // Base virtual resolution (matches M5Stack Core2 320x240 aspect ratio)
  public readonly virtualWidth = 320;
  public readonly virtualHeight = 240;

  // Current Avatar State
  private state: AvatarState = {
    emotion: "neutral",
    gaze: { x: 0, y: 0 },
    blinkRatio: 0,
    mouthOpenRatio: 0,
    speaking: false,
    listening: false,
  };

  // Color theme (Stack-chan signature colors)
  private colors: AvatarColors = {
    background: "#1a1a1a", // Dark matte body/screen
    primary: "#ffffff", // White eyes and mouth
    secondary: "#333333",
  };

  // Blink animation variables
  private nextBlinkTime: number = 0;
  private isBlinking: boolean = false;
  private blinkStartTime: number = 0;
  private readonly blinkDuration: number = 180; // ms

  // Gaze animation variables
  private nextGazeTime: number = 0;
  private targetGaze: Vector2 = { x: 0, y: 0 };
  private currentGaze: Vector2 = { x: 0, y: 0 };

  // Target mouth ratio (for smoothing)
  private targetMouthRatio: number = 0;

  private animationFrameId: number | null = null;
  private lastTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context not available");
    }
    this.ctx = context;

    this.leftEye = new Eye(true);
    this.rightEye = new Eye(false);
    this.mouth = new Mouth();

    this.scheduleNextBlink(performance.now());
    this.scheduleNextGaze(performance.now());
  }

  public start(): void {
    if (this.animationFrameId !== null) return;
    this.lastTime = performance.now();
    const loop = (time: number) => {
      this.update(time);
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public setEmotion(emotion: Emotion): void {
    this.state.emotion = emotion;
  }

  public setMouthOpenRatio(ratio: number): void {
    this.targetMouthRatio = Math.max(0, Math.min(1, ratio));
  }

  public setListening(listening: boolean): void {
    this.state.listening = listening;
    if (listening && this.state.emotion === "neutral") {
      this.state.emotion = "listening";
    } else if (!listening && this.state.emotion === "listening") {
      this.state.emotion = "neutral";
    }
  }

  public setSpeaking(speaking: boolean): void {
    this.state.speaking = speaking;
  }

  public setGaze(x: number, y: number): void {
    this.targetGaze = {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    };
  }

  private scheduleNextBlink(now: number): void {
    // Blink every 2.5 to 5.5 seconds
    this.nextBlinkTime = now + 2500 + Math.random() * 3000;
  }

  private scheduleNextGaze(now: number): void {
    // Change gaze direction every 1.5 to 4 seconds
    this.nextGazeTime = now + 1500 + Math.random() * 2500;
    // 70% chance to look forward, 30% to look around slightly
    if (Math.random() < 0.7) {
      this.targetGaze = { x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.2 };
    } else {
      this.targetGaze = { x: 0, y: 0 };
    }
  }

  private update(now: number): void {
    this.lastTime = now;

    // 1. Blink Update
    if (!this.isBlinking && now >= this.nextBlinkTime && this.state.emotion !== "sleepy") {
      this.isBlinking = true;
      this.blinkStartTime = now;
    }

    if (this.isBlinking) {
      const elapsed = now - this.blinkStartTime;
      if (elapsed >= this.blinkDuration) {
        this.isBlinking = false;
        this.state.blinkRatio = 0;
        this.scheduleNextBlink(now);
      } else {
        // Sine wave for smooth eyelid closing and opening
        const progress = elapsed / this.blinkDuration;
        this.state.blinkRatio = Math.sin(progress * Math.PI);
      }
    }

    // 2. Gaze Update
    if (now >= this.nextGazeTime) {
      this.scheduleNextGaze(now);
    }
    // Smooth interpolation to target gaze
    const gazeLerp = 0.08;
    this.currentGaze.x += (this.targetGaze.x - this.currentGaze.x) * gazeLerp;
    this.currentGaze.y += (this.targetGaze.y - this.currentGaze.y) * gazeLerp;
    this.state.gaze = this.currentGaze;

    // 3. Mouth open ratio smoothing (fast open, smooth close)
    const lerpSpeed = this.targetMouthRatio > this.state.mouthOpenRatio ? 0.4 : 0.25;
    this.state.mouthOpenRatio += (this.targetMouthRatio - this.state.mouthOpenRatio) * lerpSpeed;
    if (this.state.mouthOpenRatio < 0.01) {
      this.state.mouthOpenRatio = 0;
    }
  }

  public render(): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Fill background
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    // Calculate scale and center to fit virtual 320x240 coordinate system
    const scale = Math.min(width / this.virtualWidth, height / this.virtualHeight);
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);

    // Draw Decorator/Emotions (Cheeks if happy/listening)
    if (this.state.emotion === "happy" || this.state.emotion === "listening") {
      ctx.fillStyle = "rgba(255, 105, 180, 0.45)"; // Soft pink blush
      ctx.beginPath();
      ctx.ellipse(-95, 10, 16, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(95, 10, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Eyes
    this.leftEye.render(
      ctx,
      this.state.gaze,
      this.state.blinkRatio,
      this.state.emotion,
      this.colors,
    );
    this.rightEye.render(
      ctx,
      this.state.gaze,
      this.state.blinkRatio,
      this.state.emotion,
      this.colors,
    );

    // Draw Mouth
    this.mouth.render(ctx, this.state.mouthOpenRatio, this.state.emotion, this.colors);

    ctx.restore();
  }
}
