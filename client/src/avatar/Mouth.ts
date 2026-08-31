import { Emotion, Vector2, AvatarColors } from "./types.js";

export class Mouth {
  private basePos: Vector2 = { x: 0, y: 26 };
  private readonly minSize: Vector2 = { x: 90, y: 6 };
  private readonly maxSize: Vector2 = { x: 60, y: 50 };
  private readonly minRadius: number = 2;
  private readonly maxRadius: number = 18;

  public render(
    ctx: CanvasRenderingContext2D,
    openRatio: number,
    emotion: Emotion,
    colors: AvatarColors,
  ): void {
    ctx.save();

    // Clamp openRatio 0.0 ~ 1.0
    const ratio = Math.max(0, Math.min(1, openRatio));

    // Interpolate size & radius based on openRatio
    const width = this.minSize.x + (this.maxSize.x - this.minSize.x) * ratio;
    const height = this.minSize.y + (this.maxSize.y - this.minSize.y) * ratio;
    const radius = this.minRadius + (this.maxRadius - this.minRadius) * ratio;

    ctx.translate(this.basePos.x, this.basePos.y);

    ctx.fillStyle = colors.primary;

    if (emotion === "happy" && ratio < 0.2) {
      // Smile curve when mouth is closed/small
      ctx.beginPath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = colors.primary;
      ctx.lineCap = "round";
      ctx.arc(0, -10, 35, 0.2 * Math.PI, 0.8 * Math.PI, false);
      ctx.stroke();
    } else {
      // Rounded rectangle for standard/speaking mouth
      const x = -width / 2;
      const y = -height / 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, width, height, radius);
      } else {
        // Fallback for older browsers
        ctx.rect(x, y, width, height);
      }
      ctx.fill();
    }

    ctx.restore();
  }
}
