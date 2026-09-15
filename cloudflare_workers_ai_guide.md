# Cloudflare Workers AI 利用可能モデル・用途別おすすめ・使用上限・開発のコツ (2026年最新ガイド)

Cloudflare Workers AI は、Cloudflare のグローバルエッジネットワーク（GPU ネットワーク）上で機械学習モデル（LLM、埋め込み、画像生成、音声認識など）を低遅延かつサーバーレスで実行できるプラットフォームです。

本書では、2026年現在の利用可能モデル、用途別のおすすめモデル、レートリミット（使用上限）、および Worker から呼び出す際の実践的な開発のコツをまとめます。

---

## 1. 利用可能モデル一覧 (代表的カテゴリとモデル)

Cloudflare Workers AI では、多様なタスクに応じたオープンソースおよび最先端（Frontier）モデルが提供されています。

### 1.1 テキスト生成 / LLM (Text Generation)
- **Llama 3 / 3.1 / 3.3 シリーズ** (`@cf/meta/llama-3.1-8b-instruct`, `@cf/meta/llama-3.3-70b-instruct` など)
  - 高い推論能力と汎用性を備えたメタの標準 LLM。
- **DeepSeek シリーズ** (`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` など)
  - 高度な推論・論理的思考タスクに優れたモデル。
- **Qwen シリーズ** (`@cf/qwen/qwen1.5-0.5b-chat`, `@cf/qwen/qwen1.5-14b-chat-awq` など)
  - 超軽量（0.5B）から中規模まで用意され、多言語対応・高速応答に強み。
- **Frontier モデル**
  - `@cf/moonshotai/kimi-k2.6` / `@cf/moonshotai/kimi-k2.7-code` (コーディング・複雑なコンテキスト向け)
  - `@cf/zai-org/glm-5.2`
- **軽量・高速モデル**
  - `@cf/microsoft/phi-2`
  - `@cf/tinyllama/tinyllama-1.1b-chat-v1.0`
  - `@hf/thebloke/mistral-7b-instruct-v0.1-awq`

### 1.2 テキスト埋め込み (Text Embeddings)
- `@cf/baai/bge-small-en-v1.5`
- `@cf/baai/bge-base-en-v1.5`
- `@cf/baai/bge-large-en-v1.5`
- Vectorize (ベクトルデータベース) や RAG (検索拡張生成) との連携に最適。

### 1.3 画像生成 (Text-to-Image / Image-to-Image)
- `@cf/stabilityai/stable-diffusion-xl-base-1.0`
- `@cf/bytedance/stable-diffusion-xl-lightning` (超高速画像生成)
- `@cf/runwayml/stable-diffusion-v1-5-img2img`

### 1.4 音声認識 (Automatic Speech Recognition)
- `@cf/openai/whisper` (多言語音声文字起こし)

### 1.5 翻訳 (Translation) & 要約 (Summarization)
- `@cf/meta/m2m100-1.2b` (多言語翻訳)
- `@cf/facebook/bart-large-cnn` (テキスト要約)

---

## 2. 用途ごとに適したモデルの選定ガイド

| 用途・ユースケース | 推奨モデル | 特徴・選定理由 |
| :--- | :--- | :--- |
| **一般的な対話・チャットボット** | `@cf/meta/llama-3.1-8b-instruct` | 精度と速度のバランスに優れ、日常会話から質疑応答まで広くカバー。 |
| **高度な思考・複雑なデータ処理** | `@cf/meta/llama-3.3-70b-instruct`<br>`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | 複雑な論理構築や詳細な文書作成に最適。 |
| **コード生成・リファクタリング** | `@cf/moonshotai/kimi-k2.7-code` | プログラミングと言語記述に特化した Frontier モデル。 |
| **超低遅延・軽量レスポンス** | `@cf/qwen/qwen1.5-0.5b-chat`<br>`@cf/microsoft/phi-2` | レスポンス速度最優先、エッジでの簡易判定やエージェントの小タスク向け。 |
| **RAG / 意味検索 (Vectorize連携)** | `@cf/baai/bge-base-en-v1.5`<br>`@cf/baai/bge-large-en-v1.5` | 高精度なベクトル埋め込みを生成し、類似度検索を高速化。 |
| **リアルタイム画像生成** | `@cf/bytedance/stable-diffusion-xl-lightning` | 少ステップで高品質な画像を高速生成。 |
| **音声文字起こし (文字起こしAPI)** | `@cf/openai/whisper` | 高精度な音声をテキスト化。議事録作成やボイスメッセージ解析に活用。 |

---

## 3. 使用上限・レートリミット (Rate Limits)

Workers AI は GA (Generally Available) となっており、タスク種別および一部モデルごとにデフォルトのレートリミット（リクエスト/分: RPM）が設定されています。

### 3.1 タスク種別ごとのレートリミット (標準)

| タスク種別 | レートリミット (RPM) | 備考・例外 |
| :--- | :--- | :--- |
| **Text Generation (テキスト生成)** | 300 RPM | 一部モデルで制限が緩和/厳格化あり (下記参照) |
| **Text Embeddings (埋め込み)** | 3000 RPM | `@cf/baai/bge-large-en-v1.5` は 1500 RPM |
| **Text-to-Image (画像生成)** | 720 RPM | `stable-diffusion-v1-5-img2img` は 1500 RPM |
| **Automatic Speech Recognition (音声認識)** | 720 RPM | Whisper など |
| **Summarization (要約)** | 1500 RPM | |
| **Text Classification (分類)** | 2000 RPM | |
| **Translation (翻訳)** | 720 RPM | |
| **Image-to-Text (画像解析)** | 720 RPM | |
| **Image Classification / Object Detection** | 3000 RPM | |

### 3.2 テキスト生成モデル個別のレートリミット

- `@cf/qwen/qwen1.5-0.5b-chat`: **1500 RPM**
- `@cf/microsoft/phi-2`: **720 RPM**
- `@cf/qwen/qwen1.5-1.8b-chat`: **720 RPM**
- `@cf/tinyllama/tinyllama-1.1b-chat-v1.0`: **720 RPM**
- `@hf/thebloke/mistral-7b-instruct-v0.1-awq`: **400 RPM**
- `@cf/qwen/qwen1.5-14b-chat-awq`: **150 RPM**

### 3.3 Frontier モデル制限と AI Gateway 連携

以下の先進的モデルはアカウントごとの上限が低く設定されていますが、**Prepaid AI Gateway credits** をロードし、`Unified billing` を設定することで上限を緩和できます。

| Frontier モデル | 標準制限 | AI Gateway (Unified Billing) |
| :--- | :--- | :--- |
| `@cf/moonshotai/kimi-k2.6` | 20 RPM | 50 RPM |
| `@cf/moonshotai/kimi-k2.7-code` | 20 RPM | 50 RPM |
| `@cf/zai-org/glm-5.2` | 20 RPM | 50 RPM |

> **注意**: Wrangler のローカル開発モード (`wrangler dev`) での推論呼び出しも上記アカウント制限の対象としてカウントされます。

---

## 4. Worker から呼び出す際の実践的なコツ

### 4.1 設定とバインディング (`wrangler.jsonc`)
`wrangler.jsonc` (または `wrangler.toml`) に AI バインディングを設定することで、コード内から API キーなしで `env.AI` 経由で直接モデルを呼び出せます。

```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ai-worker-example",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01",
  "ai": {
    "binding": "AI"
  }
}
```

### 4.2 ストリーミングレスポンス (SSE) の活用
LLM の応答をリアルタイムにクライアントに届けるため、`stream: true` を指定して Server-Sent Events (SSE) 形式でレスポンスを返します。

```typescript
// src/index.ts
export interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const stream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'あなたは親切なAIアシスタントです。' },
        { role: 'user', content: 'Cloudflare Workers AIの利点を教えてください。' },
      ],
      stream: true,
    });

    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream' },
    });
  },
};
```

### 4.3 AI Gateway による可視化・キャッシュ・レートリミット制御
本番環境では Cloudflare AI Gateway 経由で Workers AI を呼び出すことが推奨されます。
- **メリット**: リクエストのログ保存、キャッシュによるコスト削限、リトライ制御、レート制限の拡張。
- Workers 内で AI Gateway を使用する場合、以下のようにヘッダーまたは Gateway ID を指定します。

```typescript
const response = await env.AI.run(
  '@cf/meta/llama-3.1-8b-instruct',
  {
    messages: [{ role: 'user', content: 'Hello!' }],
  },
  {
    gateway: {
      id: 'my-ai-gateway',
      skipCache: false,
      cacheTtl: 3600,
    },
  }
);
```

### 4.4 エラーハンドリングとフォールバック処理
モデルのレートリミット到達（429 Error）や一時的な障害に備え、フォールバックモデルを用意するかリトライロジックを実装します。

```typescript
async function runAiWithFallback(env: Env, prompt: string) {
  try {
    return await env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (error) {
    console.warn('Primary model failed, failing over to 8b model:', error);
    return await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
    });
  }
}
```

### 4.5 Prompt Caching & Function Calling
- **Prompt Caching**: 長いシステムプロンプトや文脈を複数回使用する場合、プロンプトキャッシュを利用して推論速度向上とコスト低減を図ります。
- **Function Calling**: LLM が外部ツールや D1 / KV / API と連携して構造化データを返せるように関数の定義（Schema）を渡します。

---

## 5. まとめ

Cloudflare Workers AI は、グローバルエッジ上で高速かつ低コストに AI 機能を統合できる強力なツールです。
- **モデル選定**: 速度重視なら `qwen1.5-0.5b` や `phi-2`、品質重視なら `llama-3.1-8b` や `llama-3.3-70b` を使い分けます。
- **制限対策**: RPM の上限を考慮し、AI Gateway や適切なフォールバック処理を設計します。
- **開発効率**: `wrangler.jsonc` の AI バインディングとストリーミング処理を活用して、快適なユーザー体験を実現しましょう。
