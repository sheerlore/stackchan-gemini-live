import { AvatarRenderer } from "./avatar/AvatarRenderer.js";
import { Emotion } from "./avatar/types.js";
import { AudioController } from "./audio/AudioController.js";
import { RelayClient } from "./connection/RelayClient.js";

// DOM Elements
const canvas = document.getElementById("avatarCanvas") as HTMLCanvasElement;
const statusBadge = document.getElementById("statusBadge") as HTMLElement;
const btnConnect = document.getElementById("btnConnect") as HTMLButtonElement;
const btnDisconnect = document.getElementById("btnDisconnect") as HTMLButtonElement;
const mouthMeter = document.getElementById("mouthMeter") as HTMLElement;
const transcriptBox = document.getElementById("transcriptBox") as HTMLElement;
const emotionButtons = document.querySelectorAll(".btn-emotion");

// 1. Initialize Avatar Renderer
const avatar = new AvatarRenderer(canvas);
avatar.start();

// 2. Initialize Audio Controller & Relay Client
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
    p.textContent = `👤 You: ${text}`;
  }
  transcriptBox.appendChild(p);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

function updateStatus(status: "disconnected" | "connecting" | "connected" | "speaking") {
  statusBadge.className = `badge ${status}`;
  switch (status) {
    case "disconnected":
      statusBadge.textContent = "Disconnected";
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;
      avatar.setListening(false);
      avatar.setSpeaking(false);
      break;
    case "connecting":
      statusBadge.textContent = "Connecting...";
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      break;
    case "connected":
      statusBadge.textContent = "Ready (Listening)";
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      avatar.setListening(true);
      avatar.setSpeaking(false);
      break;
    case "speaking":
      statusBadge.textContent = "Speaking...";
      avatar.setSpeaking(true);
      break;
  }
}

async function startSession() {
  try {
    updateStatus("connecting");
    appendTranscript("Connecting to Backend & Gemini Live API...", "system");

    // 1. Initialize Audio Controller (ensure AudioContext is unlocked by user gesture)
    if (!audioController) {
      audioController = new AudioController({
        onPcmData16k: (base64) => {
          if (relayClient) {
            relayClient.sendAudioChunk(base64);
          }
        },
        onRmsLevel: (rms) => {
          avatar.setMouthOpenRatio(rms);
          mouthMeter.style.width = `${Math.min(100, rms * 100)}%`;
        },
      });
    }
    await audioController.init();

    // 2. Connect to Relay Client
    relayClient = new RelayClient({
      onSessionStarted: async () => {
        updateStatus("connected");
        appendTranscript("✅ Connected to Gemini Live! Starting microphone...", "system");

        // Only start microphone AFTER Gemini Live setup is complete
        try {
          if (audioController) {
            await audioController.startMicrophone();
            appendTranscript("🎙️ Microphone active. Say something to Stack-chan!", "system");
          }
        } catch (micErr: any) {
          appendTranscript(`❌ Microphone Error: ${micErr.message}`, "system");
          stopSession();
        }
      },
      onSessionClosed: (reason) => {
        updateStatus("disconnected");
        appendTranscript(`Session closed: ${reason || "Connection ended"}`, "system");
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
        appendTranscript("(Interrupted)", "system");
        if (audioController) {
          audioController.clearPlayback();
        }
        avatar.setMouthOpenRatio(0);
        mouthMeter.style.width = "0%";
        updateStatus("connected");
      },
      onTurnComplete: () => {
        updateStatus("connected");
      },
      onError: (err) => {
        appendTranscript(`❌ Error: ${err}`, "system");
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
    appendTranscript(`❌ Error starting session: ${err.message}`, "system");
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
  mouthMeter.style.width = "0%";
  updateStatus("disconnected");
}

// Event Listeners
btnConnect.addEventListener("click", () => {
  startSession();
});

btnDisconnect.addEventListener("click", () => {
  stopSession();
});

// Emotion Buttons
emotionButtons.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    emotionButtons.forEach((b) => b.classList.remove("active"));
    const target = e.currentTarget as HTMLButtonElement;
    target.classList.add("active");
    const emotion = target.getAttribute("data-emotion") as Emotion;
    if (emotion) {
      avatar.setEmotion(emotion);
    }
  });
});
