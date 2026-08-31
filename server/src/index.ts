import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { config } from './config.js';
import { GeminiLiveSession } from './live/GeminiLiveSession.js';
import { ToolRegistry } from './tools/ToolRegistry.js';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString(), model: config.geminiModel }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Stack-chan Gemini Live Server is running.');
});

const wss = new WebSocketServer({ server, path: '/ws' });
const globalToolRegistry = new ToolRegistry();

// Optional: Register tools for Phase 3 (Function calling / MCP)
// globalToolRegistry.registerTool(
//   {
//     name: 'get_current_time',
//     description: 'Get the current local time.',
//     parameters: { type: 'OBJECT', properties: {} },
//   },
//   async () => {
//     return { currentTime: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) };
//   }
// );

wss.on('connection', (clientWs: WebSocket) => {
  console.log('[Server] Client connected to WebSocket relay.');

  let geminiSession: GeminiLiveSession | null = null;

  const sendToClient = (msg: object) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(msg));
    }
  };

  clientWs.on('message', async (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString('utf-8'));

      switch (msg.type) {
        case 'start_session': {
          console.log('[Server] Client requested session start.');
          if (geminiSession) {
            geminiSession.close();
            geminiSession = null;
          }

          geminiSession = new GeminiLiveSession(
            {
              onAudioData: (base64Pcm) => {
                sendToClient({ type: 'audio_output', data: base64Pcm });
              },
              onTextData: (text) => {
                sendToClient({ type: 'text_output', text });
              },
              onInterrupted: () => {
                sendToClient({ type: 'interrupted' });
              },
              onTurnComplete: () => {
                sendToClient({ type: 'turn_complete' });
              },
              onError: (error) => {
                console.error(`[Server] Gemini error: ${error}`);
                sendToClient({ type: 'error', message: error });
              },
              onClose: (code, reason) => {
                console.log(`[Server] Gemini session closed: code=${code}, reason=${reason}`);
                sendToClient({
                  type: 'session_closed',
                  code,
                  reason: reason || 'Connection closed by remote host',
                });
              },
            },
            globalToolRegistry
          );

          try {
            await geminiSession.connect();
            console.log('[Server] Session ready, notifying client.');
            sendToClient({ type: 'session_started' });
          } catch (err: any) {
            console.error('[Server] Failed to connect to Gemini:', err.message);
            sendToClient({ type: 'error', message: err.message });
          }
          break;
        }

        case 'audio_input': {
          if (geminiSession && msg.data) {
            geminiSession.sendAudioChunk(msg.data);
          }
          break;
        }

        case 'text_input': {
          if (geminiSession && msg.text) {
            geminiSession.sendTextMessage(msg.text);
          }
          break;
        }

        case 'stop_session': {
          console.log('[Server] Client requested session stop.');
          if (geminiSession) {
            geminiSession.close();
            geminiSession = null;
          }
          sendToClient({ type: 'session_closed' });
          break;
        }

        default:
          console.log('[Server] Unknown message type:', msg.type);
      }
    } catch (err: any) {
      console.error('[Server] Error handling client message:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('[Server] Client disconnected.');
    if (geminiSession) {
      geminiSession.close();
      geminiSession = null;
    }
  });

  clientWs.on('error', (err) => {
    console.error('[Server] Client WebSocket error:', err);
  });
});

server.listen(config.port, () => {
  console.log(`\x1b[32m🚀 Server listening on http://localhost:${config.port}\x1b[0m`);
  console.log(`\x1b[36m🔌 WebSocket endpoint: ws://localhost:${config.port}/ws\x1b[0m`);
});
