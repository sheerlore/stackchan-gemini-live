# stackchan-gemini-live

**Gemini Multimodal Live API × Stack-chan の顔 × GCP・MCP 連携プロジェクト**

Google Gemini 2.0 / 2.5 Multimodal Live API による超低遅延なリアルタイム音声対話機能と、Stack-chan（スタックチャン）の愛らしい顔・アバター表現、さらに MCP (Model Context Protocol) や実機ハードウェア連携を統合するプロジェクトです。

---

## 🏗️ システムアーキテクチャ

```
+-----------------------------------------------------------------------------------------+
|                  WebUI (Vite+ / Chrome / Edge: Web Serial & Web Bluetooth)              |
|                                                                                         |
|  [ 💬 WEB CHAT SIM ]                     [ 🛠️ HARDWARE FLASH & CONFIG ]                 |
|  - Web Canvas Stack-chan Face            - Web Serial API (esptool-js) によるUSB書込    |
|  - AudioWorklet 双方向リアルタイム音声   - Gemini Live ファーム / 公式出荷時ファーム復旧 |
|  - リップシンク & 呼吸・発話アニメ       - BLE / Wi-Fi 設定注入 (SSID, API Key, Prompt) |
+----------------------------+--------------------------------------------+---------------+
                             | (ws://localhost:3000/ws)                   | (USB / BLE)
                             v                                            v
+----------------------------+-------------+    +-------------------------+---------------+
|     Relay Server (Node.js / TypeScript)  |    | M5Stack CoreS3 (Stack-chan 実機スタンドアロン)|
|  - @google/genai 公式 Live API 接続      |    |  - ESP-IDF 5.5 / C++                        |
|  - キャラクタープロンプト・音声管理      |    |  - Wi-Fi 経由で Gemini Live API へ直接接続  |
|  - ToolRegistry (Phase 3 MCP 準備)       |    |  - 液晶 Avatar + リップシンク + サーボ首振  |
+----------------------------+-------------+    +-----------------------------------------+
                             |                                            |
                             +--------------------+-----------------------+
                                                  |
                                       +----------v-----------+
                                       | Google Gemini Live   |
                                       | (Multimodal Live API)|
                                       +----------------------+
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
│   ├── StackChan/              # 公式 m5stack/StackChan (ファームウェア・アプリ)
│   ├── ganesha-stackchan/      # 参考用 ganesha-stackchan リポジトリ
│   └── stackchan-idf/          # ESP-IDF 版 Stack-chan 実機ファームウェア
│
├── client/                     # フロントエンド (Vite+ / TypeScript)
│   ├── index.html              # UI レイアウト (Web Sim & Hardware Deck)
│   ├── package.json
│   ├── vite.config.ts          # Vite+ 設定
│   ├── public/
│   │   ├── firmware/           # Web Flasher 用マニフェスト
│   │   ├── pcm-recorder-worklet.js # 16kHz PCM マイクキャプチャ Worklet
│   │   └── pcm-player-worklet.js   # 24kHz PCM スピーカー再生 & RMS Worklet
│   └── src/
│       ├── main.ts             # エントリポイント & ライフサイクル制御
│       ├── style.css           # お菓子パッケージ風ポップデザイン & 2D CoreS3
│       ├── avatar/             # Stack-chan 顔描画エンジン
│       ├── audio/              # Web Audio / AudioWorklet 管理
│       ├── connection/         # バックエンド WebSocket 通信
│       └── hardware/           # 実機連携 (WebFlasher / BleConfigurator)
│
└── server/                     # バックエンド (Node.js / TypeScript)
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts            # HTTP & WebSocket サーバー起動
        ├── config.ts           # 環境変数読み込み
        ├── live/               # Gemini Live API 接続管理
        │   ├── GeminiLiveSession.ts
        │   └── prompts.ts      # キャラクタープロンプト
        └── tools/              # MCP ツールレジストリ
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
2. **「💬 WEB CHAT SIM」**:
   - 「START TALK」ボタンを押して、PC ブラウザ上で Stack-chan とリアルタイム音声会話・リップシンクが楽しめます。
3. **「🛠️ HARDWARE FLASH & CONFIG」**:
   - 実機 Stack-chan を USB 接続し、ブラウザからワンクリックでファームウェア書き込みや BLE 設定注入を行えます。

---

## 🛡️ 出荷時ファームウェアへの復旧方法（安全策）

本プロジェクトで実機にファームウェアを書き込んでも、**Flash メモリのアプリ領域を書き換えているだけなので、いつでも 100% 確実に工場出荷時の状態に戻せます。**

### 復旧方法 1: WebUI からのワンクリック復旧（推奨・ブラウザ完結 ⭐）
1. WebUI（`http://localhost:5173`）の **「🛠️ HARDWARE FLASH & CONFIG」** タブを開きます。
2. 「ファームウェアの選択」で **「2. 工場出荷前の状態に戻す (Factory Default v1.4.1)」** を選択します。
3. 必要に応じて **「[x] Erase flash before write」** にチェックを入れます（完全初期化）。
4. **「CONNECT USB」** ➔ **「⚡ BURN FIRMWARE」** をクリックするだけで、M5Stack 公式出荷時ファームウェア（16MB フル Flash イメージ）が自動的に書き込まれ、初期状態に完全復旧します。

### 復旧方法 2: M5 公式ツール「M5Burner」で復旧する（GUI ツール）
1. M5Stack 公式サイトから [M5Burner](https://docs.m5stack.com/en/download) をダウンロードして起動します。
2. 検索欄に `StackChan` と入力します。
3. 公式出荷ファームウェア **`StackChan-UserDemo`** を選択し、**「Download」➔「Burn」** を実行します。
4. ※Wi-Fi 情報等も含めて完全初期化したい場合は、先に **「Erase」** を実行してから Burn してください。

### 復旧方法 3: ソースコードからビルドして復旧する
[`reference/StackChan/firmware`](file:///Users/sheerlore/develop/stackchan-gemini-live/reference/StackChan/firmware) に公式ファームウェアのソースコードが含まれています。
詳しいビルド・書き込み手順は [Zenn記事: M5Stack版StackChan 出荷時ファームウェアのビルド・書き込み手順](https://zenn.dev/pinelibg/articles/stackchan-firmware-build) を参照してください。
```bash
cd reference/StackChan/firmware
python3 ./fetch_repos.py
idf.py set-target esp32s3
idf.py build
idf.py flash
```

---

## 🛠️ 開発用コマンド (Vite+)

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
- [x] **Phase 2: ローカル PoC (Web Face × Gemini Live API)**
- [ ] **Phase 3: MCP (Model Context Protocol) & GCP 連携**
- [x] **Phase 4: M5Stack 実機ハードウェア連携 & Web Flasher**
  - ESP-IDF スタンドアロン Gemini Live 接続
  - Web Serial API によるブラウザ書き込み (Web Flasher)
  - Web Bluetooth API による Wi-Fi / API キー設定注入
  - 出荷時ファームウェア復旧（Restore Factory）対応
