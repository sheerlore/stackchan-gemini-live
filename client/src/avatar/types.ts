export type Emotion =
  | "neutral"
  | "happy"
  | "angry"
  | "sad"
  | "doubt"
  | "sleepy"
  | "listening"
  | "thinking";

export interface Vector2 {
  x: number;
  y: number;
}

export interface AvatarColors {
  background: string;
  primary: string; // Eyes & mouth color
  secondary: string; // Eyelid & highlight color
}

export interface AvatarState {
  emotion: Emotion;
  gaze: Vector2; // -1.0 to 1.0
  blinkRatio: number; // 0.0 (open) to 1.0 (closed)
  mouthOpenRatio: number; // 0.0 (closed) to 1.0 (fully open)
  speaking: boolean;
  listening: boolean;
}
