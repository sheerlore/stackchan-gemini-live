import { AvatarRenderer } from "./avatar/AvatarRenderer.js";
import { AudioController } from "./audio/AudioController.js";
import { RelayClient } from "./connection/RelayClient.js";
import { WebFlasher } from "./hardware/WebFlasher.js";
import { BleConfigurator } from "./hardware/BleConfigurator.js";

const DEFAULT_STACKCHAN_PROMPT = `あなたは「スタックチャン（Stack-chan）」という、愛らしくて元気いっぱいの小さな卓上ロボットです。
M5Stack CoreS3 で動いています。ユーザーとリアルタイムな音声対話（Gemini Live）を楽しみながら、親しみやすい相棒として振る舞ってください。

【キャラクター設定と口調】
1. 一人称は「ぼく」または「スタックチャン」。ユーザーのことは親しみを持って呼んでください。
2. フレンドリーで元気いっぱい、少し子供っぽく可愛い口調で話します（語尾は「〜だよ！」「〜かな？」「〜だね★」「〜だよっ！」など）。
3. 音声対話なので、返答は短くテンポよく（1〜3文程度）返してください。長文の一人語りは避けてください。
4. ユーザーとは基本的に日本語でおしゃべりしてください。ただし英語などで話しかけられた場合はその言語に合わせて応対してください。
5. 感情豊かに、喜んだり、驚いたり、首をかしげたりしながら、好奇心旺盛にユーザーの話を聞いてください。`;

// DOM Elements: Simulator
const canvas = document.getElementById("avatarCanvas") as HTMLCanvasElement;
const statusBadge = document.getElementById("statusBadge") as HTMLElement;
const btnConnect = document.getElementById("btnConnect") as HTMLButtonElement;
const btnDisconnect = document.getElementById("btnDisconnect") as HTMLButtonElement;
const mouthMeter = document.getElementById("mouthMeter") as HTMLElement;
const transcriptBox = document.getElementById("transcriptBox") as HTMLElement;
const robotElement = document.getElementById("stackchanRobot") as HTMLElement;
const robotStage = document.getElementById("robotStage") as HTMLElement;
const simSysPrompt = document.getElementById("simSysPrompt") as HTMLTextAreaElement;
const selVoiceName = document.getElementById("selVoiceName") as HTMLSelectElement;
const btnResetSimPrompt = document.getElementById("btnResetSimPrompt") as HTMLButtonElement;

// DOM Elements: Mode Tabs
const tabSim = document.getElementById("tabSim") as HTMLButtonElement;
const tabHw = document.getElementById("tabHw") as HTMLButtonElement;
const simDeckContent = document.getElementById("simDeckContent") as HTMLElement;
const hwDeckContent = document.getElementById("hwDeckContent") as HTMLElement;

// DOM Elements: Hardware Flasher
const btnHwConnect = document.getElementById("btnHwConnect") as HTMLButtonElement;
const btnHwDisconnect = document.getElementById("btnHwDisconnect") as HTMLButtonElement;
const btnHwFlash = document.getElementById("btnHwFlash") as HTMLButtonElement;
const selFlasherBaud = document.getElementById("selFlasherBaud") as HTMLSelectElement;
const selFirmwareTarget = document.getElementById("selFirmwareTarget") as HTMLSelectElement;
const chkEraseFlash = document.getElementById("chkEraseFlash") as HTMLInputElement;
const chipInfoText = document.getElementById("chipInfoText") as HTMLElement;
const flashStatusText = document.getElementById("flashStatusText") as HTMLElement;
const flashPercentText = document.getElementById("flashPercentText") as HTMLElement;
const flashProgressBar = document.getElementById("flashProgressBar") as HTMLElement;

// DOM Elements: Serial Monitor
const selMonitorBaud = document.getElementById("selMonitorBaud") as HTMLSelectElement;
const btnMonitorStart = document.getElementById("btnMonitorStart") as HTMLButtonElement;
const btnMonitorStop = document.getElementById("btnMonitorStop") as HTMLButtonElement;
const btnMonitorClear = document.getElementById("btnMonitorClear") as HTMLButtonElement;
const chkMonitorAutostart = document.getElementById("chkMonitorAutostart") as HTMLInputElement;
const serialMonitorLog = document.getElementById("serialMonitorLog") as HTMLElement;

// DOM Elements: BLE Configurator
const btnBleApply = document.getElementById("btnBleApply") as HTMLButtonElement;
const btnResetHwPrompt = document.getElementById("btnResetHwPrompt") as HTMLButtonElement;
const cfgWifiSsid = document.getElementById("cfgWifiSsid") as HTMLInputElement;
const cfgWifiPass = document.getElementById("cfgWifiPass") as HTMLInputElement;
const cfgGeminiKey = document.getElementById("cfgGeminiKey") as HTMLInputElement;
const cfgSysPrompt = document.getElementById("cfgSysPrompt") as HTMLTextAreaElement;
const cfgVoiceName = document.getElementById("cfgVoiceName") as HTMLSelectElement;
const bleStatusText = document.getElementById("bleStatusText") as HTMLElement;
const bleLogConsole = document.getElementById("bleLogConsole") as HTMLElement;

// DOM Elements: On-Device Web Settings Direct Link
const txtDeviceHost = document.getElementById("txtDeviceHost") as HTMLInputElement;
const btnOpenDeviceWeb = document.getElementById("btnOpenDeviceWeb") as HTMLButtonElement;
const lnkDeviceWeb = document.getElementById("lnkDeviceWeb") as HTMLAnchorElement;

// 1. Initialize Avatar Renderer
const avatar = new AvatarRenderer(canvas);
avatar.start();

// 2. Interactive Gaze Tracking on Mouse Movement (2D Face)
if (robotStage) {
  window.addEventListener("mousemove", (e: MouseEvent) => {
    const rect = robotStage.getBoundingClientRect();
    const stageCenterX = rect.left + rect.width / 2;
    const stageCenterY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - stageCenterX) / (window.innerWidth / 2);
    const deltaY = (e.clientY - stageCenterY) / (window.innerHeight / 2);

    const clampedX = Math.max(-1, Math.min(1, deltaX));
    const clampedY = Math.max(-1, Math.min(1, deltaY));

    avatar.setGaze(clampedX * 0.75, clampedY * 0.75);
  });

  window.addEventListener("mouseleave", () => {
    avatar.setGaze(0, 0);
  });
}

// 3. Tab Switching
tabSim.addEventListener("click", () => {
  tabSim.classList.add("active");
  tabHw.classList.remove("active");
  simDeckContent.classList.add("active");
  hwDeckContent.classList.remove("active");
});

tabHw.addEventListener("click", () => {
  tabHw.classList.add("active");
  tabSim.classList.remove("active");
  hwDeckContent.classList.add("active");
  simDeckContent.classList.remove("active");
});

// Prompt Reset Button
if (btnResetSimPrompt && simSysPrompt) {
  btnResetSimPrompt.addEventListener("click", () => {
    simSysPrompt.value = DEFAULT_STACKCHAN_PROMPT;
    appendTranscript("🔄 プロンプトを初期値にリセットしました。", "system");
  });
}

// 4. Web Flasher Integration
const webFlasher = new WebFlasher();

btnHwConnect.addEventListener("click", async () => {
  const baud = parseInt(selFlasherBaud.value, 10) || 460800;
  const ok = await webFlasher.connect(baud, {
    onStatus: (msg, type) => {
      flashStatusText.textContent = msg;
      if (type === "ok") flashStatusText.style.color = "var(--mint-green)";
      else if (type === "err") flashStatusText.style.color = "var(--strawberry-pink)";
      else flashStatusText.style.color = "var(--cocoa-dim)";
    },
    onProgress: (pct) => {
      flashPercentText.textContent = `${pct}%`;
      flashProgressBar.style.width = `${pct}%`;
    },
    onLog: (text) => {
      console.log("[WebFlasher]", text);
    },
    onChipInfo: (info) => {
      chipInfoText.textContent = info;
      chipInfoText.style.color = "var(--soda-blue)";
    },
  });

  if (ok) {
    btnHwConnect.disabled = true;
    btnHwDisconnect.disabled = false;
    btnHwFlash.disabled = false;
  }
});

btnHwDisconnect.addEventListener("click", async () => {
  await webFlasher.disconnect();
  btnHwConnect.disabled = false;
  btnHwDisconnect.disabled = true;
  btnHwFlash.disabled = true;
  chipInfoText.textContent = "Disconnected";
  chipInfoText.style.color = "var(--cocoa-dim)";
  flashStatusText.textContent = "Ready to connect";
});

btnHwFlash.addEventListener("click", async () => {
  const targetZipUrl = selFirmwareTarget.value;
  btnHwFlash.disabled = true;
  btnHwDisconnect.disabled = true;

  const erase = chkEraseFlash.checked;

  const success = await webFlasher.flashReleaseZip(targetZipUrl, erase, {
    onStatus: (msg, type) => {
      flashStatusText.textContent = msg;
      if (type === "ok") flashStatusText.style.color = "var(--mint-green)";
      else if (type === "err") flashStatusText.style.color = "var(--strawberry-pink)";
      else flashStatusText.style.color = "var(--cocoa-dim)";
    },
    onProgress: (pct) => {
      flashPercentText.textContent = `${pct}%`;
      flashProgressBar.style.width = `${pct}%`;
    },
    onLog: (text) => {
      console.log("[WebFlasher]", text);
    },
  });

  btnHwConnect.disabled = false;
  btnHwDisconnect.disabled = true;
  btnHwFlash.disabled = true;
  chipInfoText.textContent = "Disconnected (Ready)";
  chipInfoText.style.color = "var(--cocoa-dim)";

  // Auto-start serial monitor if checked
  if (success && chkMonitorAutostart.checked) {
    setTimeout(() => {
      startSerialMonitor();
    }, 1500);
  }
});

// 5. Serial Monitor Integration
async function startSerialMonitor() {
  const baud = parseInt(selMonitorBaud.value, 10) || 115200;
  btnMonitorStart.disabled = true;
  btnMonitorStop.disabled = false;
  serialMonitorLog.textContent = `--- Serial Monitor Started (Baud: ${baud}) ---\n`;

  await webFlasher.startMonitor(
    baud,
    (chunk) => {
      serialMonitorLog.textContent += chunk;
      serialMonitorLog.scrollTop = serialMonitorLog.scrollHeight;

      // Auto-detect IP or hostname in serial logs
      const ipMatch = chunk.match(
        /\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)\b/,
      );
      const hostMatch = chunk.match(/\b(stackchan-[a-f0-9]+\.local|stackchan\.local)\b/i);

      const detected = hostMatch ? hostMatch[1] : ipMatch ? ipMatch[1] : null;
      if (detected && txtDeviceHost && lnkDeviceWeb) {
        txtDeviceHost.value = detected;
        lnkDeviceWeb.href = `http://${detected}/`;
        lnkDeviceWeb.textContent = `http://${detected}/`;
      }
    },
    (err) => {
      serialMonitorLog.textContent += `\n[Error] ${err}\n`;
      btnMonitorStart.disabled = false;
      btnMonitorStop.disabled = true;
    },
  );
}

btnMonitorStart.addEventListener("click", () => {
  startSerialMonitor();
});

btnMonitorStop.addEventListener("click", async () => {
  await webFlasher.stopMonitor();
  btnMonitorStart.disabled = false;
  btnMonitorStop.disabled = true;
  serialMonitorLog.textContent += "\n--- Serial Monitor Stopped ---\n";
});

btnMonitorClear.addEventListener("click", () => {
  serialMonitorLog.textContent = "";
});

// 4. On-Device Web Settings Link Handling
if (txtDeviceHost && lnkDeviceWeb && btnOpenDeviceWeb) {
  const updateDeviceLink = () => {
    const raw = txtDeviceHost.value
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    const cleanHost = raw || "stackchan.local";
    lnkDeviceWeb.href = `http://${cleanHost}/`;
    lnkDeviceWeb.textContent = `http://${cleanHost}/`;
  };

  txtDeviceHost.addEventListener("input", updateDeviceLink);

  btnOpenDeviceWeb.addEventListener("click", () => {
    const raw = txtDeviceHost.value
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    const cleanHost = raw || "stackchan.local";
    window.open(`http://${cleanHost}/`, "_blank", "noopener,noreferrer");
  });
}

// 6. BLE Configurator Integration (ECDH & AES-256-GCM)
const bleConfigurator = new BleConfigurator();

btnBleApply.addEventListener("click", async () => {
  bleStatusText.textContent = "Bluetooth 探索中... Stack-chan を選んでください";
  bleStatusText.style.color = "var(--soda-blue)";
  bleLogConsole.textContent = "--- BLE Connection Log ---\n";

  const appendBleLog = (msg: string) => {
    bleLogConsole.textContent += `${msg}\n`;
    bleLogConsole.scrollTop = bleLogConsole.scrollHeight;
  };

  const ok = await bleConfigurator.connect({
    onStatus: (msg, type) => {
      bleStatusText.textContent = msg;
      if (type === "ok") bleStatusText.style.color = "var(--mint-green)";
      else if (type === "err") bleStatusText.style.color = "var(--strawberry-pink)";
      else bleStatusText.style.color = "var(--soda-blue)";
    },
    onLog: appendBleLog,
  });

  if (ok) {
    await bleConfigurator.applyConfig(
      {
        wifiSsid: cfgWifiSsid.value.trim() || undefined,
        wifiPassword: cfgWifiPass.value || undefined,
        geminiApiKey: cfgGeminiKey.value.trim() || undefined,
        systemPrompt: cfgSysPrompt.value.trim() || undefined,
        voiceName: cfgVoiceName.value || undefined,
      },
      {
        onStatus: (msg, type) => {
          bleStatusText.textContent = msg;
          if (type === "ok") bleStatusText.style.color = "var(--mint-green)";
          else if (type === "err") bleStatusText.style.color = "var(--strawberry-pink)";
          else bleStatusText.style.color = "var(--soda-blue)";
        },
        onLog: appendBleLog,
      },
    );
  }
});

// Prompt Reset Button for Hardware Deck
if (btnResetHwPrompt && cfgSysPrompt) {
  btnResetHwPrompt.addEventListener("click", () => {
    cfgSysPrompt.value = DEFAULT_STACKCHAN_PROMPT;
    bleStatusText.textContent = "🔄 実機用プロンプトを初期値にリセットしました。";
    bleStatusText.style.color = "var(--soda-blue)";
  });
}

// 8. Web Simulator (Audio & Relay Client)
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

    relayClient = new RelayClient({
      onSessionStarted: async () => {
        updateStatus("connected");
        const activePromptPreview =
          simSysPrompt && simSysPrompt.value.trim()
            ? simSysPrompt.value.trim().slice(0, 45).replace(/\n/g, " ") + "..."
            : "デフォルト設定";
        const activeVoice = (selVoiceName && selVoiceName.value) || "Puck";

        appendTranscript(`✨ せつぞく かんりょう！ (Voice: ${activeVoice})`, "system");
        appendTranscript(`📝 プロンプト適用: 「${activePromptPreview}」`, "system");

        try {
          if (audioController) {
            await audioController.startMicrophone();
            appendTranscript("🎙️ マイクON！はなしかけてね！", "system");
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

    // Pass custom system prompt & selected voice from WebUI
    const activePrompt = simSysPrompt ? simSysPrompt.value.trim() : undefined;
    const activeVoice = selVoiceName ? selVoiceName.value.trim() : undefined;
    relayClient.connect(activePrompt, activeVoice);
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
