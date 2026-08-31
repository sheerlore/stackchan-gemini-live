# stackchan-gemini-live

**Gemini Multimodal Live API × Stack-chan の顔 × GCP・MCP 連携プロジェクト**

Google Gemini 2.0 Multimodal Live API による超低遅延なリアルタイム音声対話機能と、Stack-chan（スタックチャン）の愛らしい顔・アバター表現、さらに MCP (Model Context Protocol) や GCP を介した外部ツール連携を統合するプロジェクトです。

まずは **PC ローカル環境で完全に動作する PoC** として、**Vite+ (Frontend)** と **Node.js (Backend)** による双方向リアルタイム音声会話・リップシンク・表情連動を実現しています。

---

## 🏗️ システムアーキテクチャ

```
+-----------------------------------------------------------------------+
|                             ローカル環境                               |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |           Web UI (Client: Vite+ / Canvas Avatar)                |  |
|  |  - Canvas Stack-chan Face (まばたき・視線・リップシンク・感情)  |  |
|  |  - AudioWorklet: 16kHz PCM 送信 (マイク) & 24kHz PCM 再生 (出力) |  |
|  +--------------------------------+--------------------------------+  |
|                                   | WebSocket (ws://localhost:3000/ws) |
|  +--------------------------------v--------------------------------+  |
|  |           Relay Server (Server: Node.js + TypeScript)           |  |
|  |  - Gemini 2.0 Multimodal Live API 接続管理 (Bidi WebSocket)     |  |
|  |  - キャラクタープロンプト・音声設定 (Puck等) 適用               |  |
|  |  - Function Calling <-> ToolRegistry (Phase 3 MCP 準備)         |  |
|  +-------------------+-----------------------------+---------------+  |
|                      |                             |                  |
+----------------------|-----------------------------|------------------+
                       |                             |
              +--------v---------+          +--------v---------+
              | Gemini Live API  |          | MCP / GCP 連携   |
              | (Google GenAI)   |          | (Local / Cloud)  |
              +------------------+          +------------------+
```

---

## 📁 ディレクトリ構成

```text
stackchan-gemini-live/
├── .env.example                # 環境変数テンプレート
├── package.json                # ルート workspace (npm / Vite+)
├── tsconfig.base.json          # 共通 TypeScript 設定
├── AGENTS.md                   # AI エージェント向け開発ガイドライン & ハーネス
├── reference/                  # 外部参照用リポジトリ (Git Submodules)
│   ├── StackChan/              # 公式 m5stack/StackChan
│   └── ganesha-stackchan/      # 参考用 ganesha-stackchan リポジトリ
│
├── client/                     # フロントエンド (Vite+ / TypeScript)
│   ├── index.html              # UI レイアウト & Canvas
│   ├── package.json
│   ├── vite.config.ts          # Vite+ 設定
│   ├── public/
│   │   ├── pcm-recorder-worklet.js # 16kHz PCM マイクキャプチャ Worklet
│   │   └── pcm-player-worklet.js   # 24kHz PCM スピーカー再生 & RMS Worklet
│   └── src/
│       ├── main.ts             # エントリポイント & イベント制御
│       ├── style.css           # スタイリング
│       ├── avatar/             # Stack-chan 顔描画エンジン
│       │   ├── AvatarRenderer.ts
│       │   ├── Eye.ts          # 目・まばたき・視線
│       │   ├── Mouth.ts        # 口・リップシンク開閉
│       │   └── types.ts
│       ├── audio/              # Web Audio / AudioWorklet 管理
│       │   └── AudioController.ts
│       └── connection/         # バックエンド WebSocket 通信
│           └── RelayClient.ts
│
└── server/                     # バックエンド (Node.js + TypeScript)
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts            # HTTP & WebSocket サーバー起動
        ├── config.ts           # 環境変数読み込み
        ├── live/               # Gemini Live API 接続管理
        │   ├── GeminiLiveSession.ts
        │   └── prompts.ts      # Stack-chan キャラクタープロンプト
        └── tools/              # Phase 3 MCP ツールレジストリ
            └── ToolRegistry.ts
```

---

## 🚀 クイックスタート (ローカル起動手順)

### 1. 環境変数の設定
ルートディレクトリに `.env` ファイルを作成し、Gemini API キーを設定します。

```bash
cp .env.example .env
```

`.env` 内の `GEMINI_API_KEY` を設定してください：
```env
GEMINI_API_KEY=your_actual_gemini_api_key
PORT=3000
GEMINI_MODEL=gemini-2.5-flash-native-audio-latest
VOICE_NAME=Puck
```

### 2. 依存関係のインストール & 起動
```bash
# 依存関係のインストール
npm install

# サーバーとクライアントを同時起動
npm run dev
```

- **Frontend (Web UI)**: `http://localhost:5173`
- **Backend (Relay Server)**: `http://localhost:3000` (`ws://localhost:3000/ws`)

### 3. ブラウザで動作確認
1. ブラウザで `http://localhost:5173` を開きます。
2. **「Start Conversation」** ボタンをクリックし、マイクの使用を許可します。
3. マイクに向かって話しかけると、Gemini 2.0 が音声で返答し、Stack-chan の口が音声に合わせてリアルタイムにパクパク動きます（リップシンク）。
4. 「Emotion Test」ボタンで表情（Happy, Angry, Sad, Sleepy など）を手動テストすることも可能です。

---

## 🛠️ 開発用コマンド (Vite+)

Vite+ の統合ツールチェーン（`vp`）を活用できます。

```bash
# 全体ビルド (Client + Server)
npm run build

# フロントエンドのフォーマット・Lint・型チェック (Vite+ / vp check)
npm run check
# または
cd client && vp check --fix
```

---

## 📋 開発ロードマップ

- [x] **Phase 1: 環境セットアップ & AI ハーネス構築**
  - `m5stack/StackChan` の submodule 登録
  - `AGENTS.md` / `README.md` による開発基盤整備
- [x] **Phase 2: ローカル PoC (Web Face × Gemini Live API)**
  - Vite+ による Web Canvas Stack-chan Face（まばたき、視線、リップシンク、感情表現）
  - AudioWorklet による 16kHz/24kHz PCM 超低遅延双方向音声対話
  - Node.js Gemini Live 中継サーバー
- [ ] **Phase 3: MCP (Model Context Protocol) & GCP 連携**
  - ToolRegistry への MCP クライアント統合 (Tool Calling)
  - GCP サービス（Cloud Functions, Cloud Run, Vertex AI 等）との連携
- [ ] **Phase 4: M5Stack 実機ハードウェア連携**
  - M5Stack (Core2 / CoreS3 等) へのストリーミング中継
