# AGENTS.md - AI Agent Development Guidelines & Harness

このリポジトリは **「Gemini Live × Stack-chan の顔 × GCP・MCP 連携」** を実現するためのプロジェクトです。
本ドキュメントは、本プロジェクトで作業するすべての AI エージェント（Antigravity, Cursor, Claude Code, Codex 等）が共通して遵守すべき開発方針、アーキテクチャ、ルール、およびコンテキストを定義します。

---

## 1. プロジェクトのビジョン & ロードマップ

### 🎯 最終ゴール
Gemini 2.0 Multimodal Live API による超低遅延な双方向音声・視覚対話と、Stack-chan の豊かな表情・アバターアニメーション、そして GCP や MCP (Model Context Protocol) を介した外部ツール・データ連携を融合した次世代 AI アバターシステムを構築すること。

### 段階的マイルストーン
1. **Phase 1: 環境整備 & AIハーネス構築 (現在)**
   - `reference/StackChan` の submodule 配置
   - AIハーネス (`AGENTS.md`) と プロジェクトドキュメント (`README.md`) の整備
2. **Phase 2: ローカル PoC (Web Face × Gemini Live API)**
   - Web (Canvas/SVG) 上で Stack-chan の顔（まばたき・視線・リップシンク・感情変化）をレンダリング
   - PC マイク & スピーカーによる Gemini Multimodal Live API (WebSocket / Bidi-stream) との双方向リアルタイム対話
   - 受信音声ストリームに応じた口パク（RMS/ボリューム解析）と感情メタデータによる表情同期
3. **Phase 3: MCP (Model Context Protocol) & GCP 連携**
   - Gemini Live セッションから MCP クライアント経由で各種 MCP ツールを呼び出す (Tool Calling)
   - GCP サービス（Cloud Functions, Cloud Run, BigQuery, Firestore, Vertex AI 等）との連携
4. **Phase 4: M5Stack 実機ハードウェア連携**
   - M5Stack (Core2 / CoreS3 等) への表情パラメータ・サーボモーター角度・音声ストリームの中継
   - ローカルPC / クラウド と実機のハイブリッド運用

---

## 2. ディレクトリ構造 & リファレンス方針

```
stackchan-gemini-live/
├── reference/                # 外部参照用リポジトリ (Git Submodules)
│   ├── StackChan/            # 公式 m5stack/StackChan (顔デザイン、プロトコル、ファームウェア等の参照用)
│   └── ganesha-stackchan/    # 参考用 ganesha-stackchan リポジトリ
├── client/                   # フロントエンド (Vite+ / TypeScript / Canvas Face / Web Audio)
├── server/                   # バックエンド (Node.js / TypeScript / @google/genai Live API)
├── AGENTS.md                 # AI エージェント向け開発ガイドライン (本ファイル)
├── README.md                 # プロジェクト概要 & 利用ガイド
├── .env.example              # 環境変数テンプレート
└── package.json              # ルート workspace
```

### ⚠️ リファレンス (`reference/`) の取り扱いルール
- `reference/` 配下のファイルは **「参照・仕様確認用」** であり、直接編集や破壊的な変更を行わないこと。
- Stack-chan の目の形状、まばたきのロジック、感情プリセット（NORMAL, HAPPY, SAD, ANGRY, DOUBTFUL, SLEEPY など）の実装方針は `reference/StackChan` のコードを参考にすること。

---

## 3. AI エージェントの行動規範 & 開発ルール

### 3.1 人間とのコラボレーション & コミットルール
- **コミットは人間が行う**: AI は原則として勝手に `git commit` や `git push` を実行しないこと。作業完了後はワーキングツリーの変更状態にとどめ、人間にレビューとコミットを依頼すること。
- **指示を鵜呑みにしない (Proactive Suggestions)**: より優れた設計、シンプルな代替案、パフォーマンス・セキュリティ・保守性の改善点がある場合は、積極的に理由を添えて提案し、人間の確認をとること。
- **破壊的変更の禁止**: 既存の動作するコードを大幅に書き換える際は、事前に影響範囲を説明し合意を得ること。

### 3.2 セキュリティ & 認証情報の管理
- API キー（`GEMINI_API_KEY`, GCP サービスアカウントキー等）は **絶対にコード内にハードコードしない**。
- 環境変数（`.env` / `.env.local`）を利用し、`.gitignore` に `.env*` を含めること。

### 3.3 技術スタック & コーディング標準
- **フロントエンド / UI**: TypeScript, Vite, HTML5 Canvas / SVG, Web Audio API
- **Gemini Live 接続**: Gemini Multimodal Live API (WebSocket Bidi-streaming, PCM 16kHz/24kHz, `@google/genai` またはネイティブ WebSocket)
- **MCP 連携**: `@modelcontextprotocol/sdk` (TypeScript)
- **型安全性**: TypeScript の strict mode を維持し、`any` の多用を避けること。
- **モジュール分割**: 顔描画 (Avatar/Face)、音声入出力 (Audio I/O)、Gemini セッション (Live Session)、MCP ツール処理 (MCP Manager) を疎結合に設計すること。

---

## 4. 主要な技術仕様メモ (Gemini Live × Stack-chan Face)

### 4.1 Stack-chan Face の表現要件
- **標準パーツ**: 左右の目（カプセル型/丸角長方形）、口（閉じた状態〜開いた状態の線/楕円）、必要に応じて眉・汗・頬紅
- **アニメーション要素**:
  - まばたき (Blink): ランダム間隔 (2〜5秒ごと) に自然に閉じて開く
  - 視線移動 (Gaze): ランダムまたは指定方向に目を動かす
  - リップシンク (Lip-sync): Gemini から受信した PCM 音声データの振幅（RMS）に連動して口を開閉
  - 感情表現 (Emotions): `NORMAL`, `HAPPY`, `SLEEPY`, `ANGRY`, `SAD`, `SURPRISED`, `DOUBTFUL`

### 4.2 Gemini Multimodal Live API の通信仕様
- **SDK**: `@google/genai` (`ai.live.connect`)
- **利用モデル**: `gemini-2.5-flash-native-audio-latest`
- **音声入力 (Client -> Server -> Gemini)**: PCM 16kHz / 16-bit / Mono (Little-Endian)
- **音声出力 (Gemini -> Server -> Client)**: PCM 24kHz / 16-bit / Mono (Little-Endian)
- **Tool Calling (MCP)**: `toolCall` メッセージを受信し、ローカル/リモートの MCP ツールを実行して `toolResponse` を返送する。
