import { Emotion, Vector2, AvatarColors } from "./types.js";

export class Eye {
  private isLeft: boolean;
  private basePos: Vector2;
  private readonly defaultSize: number = 32;
  private readonly maxGazeOffset: number = 16;

  constructor(isLeft: boolean) {
    this.isLeft = isLeft;
    // Base position relative to avatar center (320x240 M5Stack coordinate scale)
    this.basePos = {
      x: isLeft ? -70 : 70,
      y: -16,
    };
  }

  public render(
    ctx: CanvasRenderingContext2D,
    gaze: Vector2,
    blinkRatio: number,
    emotion: Emotion,
    colors: AvatarColors,
  ): void {
    ctx.save();

    // 1. Calculate gaze offset
    const offsetX = gaze.x * this.maxGazeOffset;
    const offsetY = gaze.y * this.maxGazeOffset;
    const posX = this.basePos.x + offsetX;
    const posY = this.basePos.y + offsetY;

    ctx.translate(posX, posY);

    // 2. Emotion specific rotation & weight
    const { rotationDeg, eyeHeightRatio } = this.getEmotionStyle(emotion);
    const rotationRad = (this.isLeft ? rotationDeg : -rotationDeg) * (Math.PI / 180);
    ctx.rotate(rotationRad);

    // 3. Blink scale (1.0 = fully open, 0.0 = fully closed)
    const currentHeightRatio = Math.max(0.05, (1.0 - blinkRatio) * eyeHeightRatio);
    const radius = this.defaultSize / 2;
    const height = this.defaultSize * currentHeightRatio;

    // Draw Eye (Capsule or ellipse)
    ctx.fillStyle = colors.primary;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Happy eye accent (arch curve if happy)
    if (emotion === "happy") {
      ctx.fillStyle = colors.background;
      ctx.beginPath();
      // Cut lower half for happy smile eye
      ctx.ellipse(0, height * 0.3, radius * 1.1, height * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private getEmotionStyle(emotion: Emotion): { rotationDeg: number; eyeHeightRatio: number } {
    switch (emotion) {
      case "happy":
        return { rotationDeg: 15.5, eyeHeightRatio: 0.9 };
      case "angry":
        return { rotationDeg: 4.5, eyeHeightRatio: 0.75 };
      case "sad":
        return { rotationDeg: -4.0, eyeHeightRatio: 0.75 };
      case "doubt":
        return { rotationDeg: this.isLeft ? -5 : 5, eyeHeightRatio: 0.8 };
      case "sleepy":
        return { rotationDeg: -1.0, eyeHeightRatio: 0.35 };
      case "listening":
        return { rotationDeg: 0, eyeHeightRatio: 1.1 };
      case "thinking":
        return { rotationDeg: this.isLeft ? -8 : 8, eyeHeightRatio: 0.9 };
      case "neutral":
      default:
        return { rotationDeg: 0, eyeHeightRatio: 1.0 };
    }
  }
}
