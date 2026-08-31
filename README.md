# stackchan-gemini-live

**Gemini Multimodal Live API × Stack-chan の顔 × GCP・MCP 連携プロジェクト**

Google Gemini 2.0 Multimodal Live API による超低遅延なリアルタイム音声・対話機能と、Stack-chan（スタックチャン）の愛らしい顔・アバター表現、さらに MCP (Model Context Protocol) や GCP を介した外部ツール連携を統合するプロジェクトです。

まずは **PC ローカル環境で完全に動作するプロトタイプ** の構築を目指し、段階的に M5Stack 実機やクラウド連携へ拡張します。

---

## 🏗️ システムアーキテクチャ（概要）

```
+-----------------------------------------------------------------------+
|                             ローカル環境                               |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |                  Web UI (Stack-chan Face & Audio)               |  |
|  |  - Canvas/SVG Stack-chan Face (まばたき・視線・リップシンク)    |  |
|  |  - Audio Capture (PCM 16kHz) & Playback (PCM 24kHz)             |  |
|  +--------------------------------+--------------------------------+  |
|                                   | WebSocket (Bidi-stream)           |
|  +--------------------------------v--------------------------------+  |
|  |           Gemini Live / MCP Controller (TypeScript)             |  |
|  |  - Gemini 2.0 Multimodal Live API 接続管理 (Bidi WebSocket)     |  |
|  |  - 音声ストリーム解析 -> 口パク・感情パラメータ抽出              |  |
|  |  - Function Calling <-> MCP Client (ツール呼び出し)              |  |
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

- [`AGENTS.md`](./AGENTS.md): AI エージェント向け開発ガイドライン & ハーネス
- [`reference/`](./reference/): 開発参照用サブモジュール
  - [`reference/StackChan`](./reference/StackChan): 公式 [m5stack/StackChan](https://github.com/m5stack/StackChan) リポジトリ（顔デザイン、アバターロジック、ファームウェア等の参照用）

---

## 🚀 開発ロードマップ

- [x] **Phase 1: 環境セットアップ & AI ハーネス構築**
  - `m5stack/StackChan` の submodule 登録
  - `AGENTS.md` / `README.md` による開発基盤整備
- [ ] **Phase 2: ローカル PoC (Web Face × Gemini Live API)**
  - Web (Canvas/SVG) Stack-chan Face（まばたき、視線、リップシンク、感情表現）
  - マイク・スピーカーでのリアルタイム双方向音声対話
- [ ] **Phase 3: MCP & GCP 連携**
  - MCP ツール実行連携（Tool Calling）
  - GCP サービス（Cloud Functions, Cloud Run, Vertex AI 等）との連携
- [ ] **Phase 4: M5Stack 実機連携**
  - M5Stack (Core2 / CoreS3 等) へのストリーミング中継

---

## 🤖 AI エージェントと開発する皆様へ

本プロジェクトでの開発方針、コーディング標準、セキュリティルールは [`AGENTS.md`](./AGENTS.md) にまとめられています。
開発作業前に必ずご一読ください。
