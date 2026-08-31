import { AvatarRenderer } from "./avatar/AvatarRenderer.js";
import { AudioController } from "./audio/AudioController.js";
import { RelayClient } from "./connection/RelayClient.js";

// DOM Elements
const canvas = document.getElementById("avatarCanvas") as HTMLCanvasElement;
const statusBadge = document.getElementById("statusBadge") as HTMLElement;
const btnConnect = document.getElementById("btnConnect") as HTMLButtonElement;
const btnDisconnect = document.getElementById("btnDisconnect") as HTMLButtonElement;
const mouthMeter = document.getElementById("mouthMeter") as HTMLElement;
const transcriptBox = document.getElementById("transcriptBox") as HTMLElement;
const robotElement = document.getElementById("stackchanRobot") as HTMLElement;
const robotStage = document.getElementById("robotStage") as HTMLElement;

// 1. Initialize Avatar Renderer
const avatar = new AvatarRenderer(canvas);
avatar.start();

// 2. Interactive Gaze Tracking on Mouse Movement (2D Face)
if (robotStage) {
  window.addEventListener("mousemove", (e: MouseEvent) => {
    const rect = robotStage.getBoundingClientRect();
    const stageCenterX = rect.left + rect.width / 2;
    const stageCenterY = rect.top + rect.height / 2;

    // Calculate normalized offset from center (-1.0 to 1.0)
    const deltaX = (e.clientX - stageCenterX) / (window.innerWidth / 2);
    const deltaY = (e.clientY - stageCenterY) / (window.innerHeight / 2);

    const clampedX = Math.max(-1, Math.min(1, deltaX));
    const clampedY = Math.max(-1, Math.min(1, deltaY));

    // Natural Gaze tracking
    avatar.setGaze(clampedX * 0.75, clampedY * 0.75);
  });

  window.addEventListener("mouseleave", () => {
    avatar.setGaze(0, 0);
  });
}

// 3. Initialize Audio Controller & Relay Client
let audioController: AudioController | null = null;
let relayClient: RelayClient | null = null;

function appendTranscript(text: string, sender: "system" | "stackchan" | "user" = "stackchan") {
  const p = document.createElement("p");
  if (sender === "system") {
    p.className = "system-msg";
    p.textContent = text;
  } else if (sender === "stackchan") {
    p.className = "msg-stackchan";
    p.textContent = `🤖 Stack-chan: ${text}`;
  } else {
    p.className = "msg-user";
    p.textContent = `👤 You: ${text}`;
  }
  transcriptBox.appendChild(p);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

function updateStatus(status: "disconnected" | "connecting" | "connected" | "speaking") {
  statusBadge.className = `pixel-badge ${status}`;

  if (robotElement) {
    if (status === "speaking") {
      robotElement.className = "stackchan-robot speaking";
    } else {
      robotElement.className = "stackchan-robot idle";
    }
  }

  switch (status) {
    case "disconnected":
      statusBadge.textContent = "OFFLINE";
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;
      avatar.setListening(false);
      avatar.setSpeaking(false);
      break;
    case "connecting":
      statusBadge.textContent = "CONNECTING...";
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      break;
    case "connected":
      statusBadge.textContent = "READY (LISTEN)";
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      avatar.setListening(true);
      avatar.setSpeaking(false);
      break;
    case "speaking":
      statusBadge.textContent = "TALKING ★";
      avatar.setSpeaking(true);
      break;
  }
}

async function startSession() {
  try {
    updateStatus("connecting");
    appendTranscript("⚡ Gemini Live に せつぞく しています...", "system");

    // 1. Initialize Audio Controller (unlock AudioContext via user interaction)
    if (!audioController) {
      audioController = new AudioController({
        onPcmData16k: (base64) => {
          if (relayClient) {
            relayClient.sendAudioChunk(base64);
          }
        },
        onRmsLevel: (rms) => {
          avatar.setMouthOpenRatio(rms);
          if (mouthMeter) {
            mouthMeter.style.width = `${Math.min(100, rms * 100)}%`;
          }
        },
      });
    }
    await audioController.init();

    // 2. Connect to Relay Client
    relayClient = new RelayClient({
      onSessionStarted: async () => {
        updateStatus("connected");
        appendTranscript("✨ せつぞく かんりょう！マイクを つかえます。", "system");

        // Start microphone after Gemini Live is ready
        try {
          if (audioController) {
            await audioController.startMicrophone();
            appendTranscript("🎙️ マイクON！Stack-chan に はなしかけてね！", "system");
          }
        } catch (micErr: any) {
          appendTranscript(`❌ マイク エラー: ${micErr.message}`, "system");
          stopSession();
        }
      },
      onSessionClosed: (reason) => {
        updateStatus("disconnected");
        appendTranscript(
          `🔌 セッション しゅうりょう: ${reason || "せつぞくが きれました"}`,
          "system",
        );
        if (audioController) {
          audioController.stopMicrophone();
        }
      },
      onAudioOutput: (base64Pcm) => {
        updateStatus("speaking");
        if (audioController) {
          audioController.playAudioChunk(base64Pcm);
        }
      },
      onTextOutput: (text) => {
        appendTranscript(text, "stackchan");
      },
      onInterrupted: () => {
        appendTranscript("(わりこみ)", "system");
        if (audioController) {
          audioController.clearPlayback();
        }
        avatar.setMouthOpenRatio(0);
        if (mouthMeter) {
          mouthMeter.style.width = "0%";
        }
        updateStatus("connected");
      },
      onTurnComplete: () => {
        updateStatus("connected");
      },
      onError: (err) => {
        appendTranscript(`❌ エラー: ${err}`, "system");
        updateStatus("disconnected");
      },
      onStatusChange: (status) => {
        if (status === "disconnected") {
          updateStatus("disconnected");
        }
      },
    });

    relayClient.connect();
  } catch (err: any) {
    console.error("Failed to start session:", err);
    appendTranscript(`❌ せつぞく エラー: ${err.message}`, "system");
    updateStatus("disconnected");
  }
}

function stopSession() {
  if (relayClient) {
    relayClient.disconnect();
    relayClient = null;
  }
  if (audioController) {
    audioController.close();
    audioController = null;
  }
  avatar.setMouthOpenRatio(0);
  if (mouthMeter) {
    mouthMeter.style.width = "0%";
  }
  updateStatus("disconnected");
}

// Event Listeners
btnConnect.addEventListener("click", () => {
  startSession();
});

btnDisconnect.addEventListener("click", () => {
  stopSession();
});
