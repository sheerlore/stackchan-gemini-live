import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from root or server directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export interface ServerConfig {
  port: number;
  geminiApiKey: string;
  geminiModel: string;
  voiceName: string;
}

let rawModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-native-audio-latest';
if (rawModel.includes('gemini-2.0-flash-exp')) {
  rawModel = 'gemini-2.5-flash-native-audio-latest';
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: rawModel,
  voiceName: process.env.VOICE_NAME || 'Puck',
};

if (!config.geminiApiKey) {
  console.warn(
    '\x1b[33m⚠️ WARNING: GEMINI_API_KEY is not set. Please set it in .env file to enable Gemini Live API.\x1b[0m'
  );
}
