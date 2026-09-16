# Cloudflare Workers AI 利用可能モデル・用途別おすすめ・使用上限・開発のコツ (2026年最新ガイド)

Cloudflare Workers AI は、Cloudflare のグローバルエッジネットワーク（GPU ネットワーク）上でオープンソースの機械学習モデル（LLM、埋め込み、画像生成、音声認識など）を低遅延かつサーバーレスで実行できるプラットフォームです。

本書では、特定のベンダー資料やプラットフォーム固有の案内に偏らず、**2026年現在で利用可能なオープンモデルのエコシステム**に基づき、タスクごとの「最高性能」および「圧倒的な省エネ性能（超軽量・超低遅延）」を基準としたモデル選定ガイドをまとめます。

---

## 1. 利用可能オープンモデル一覧 (性能・特性別)

Cloudflare Workers AI では、コミュニティで高い評価を得ているオープンモデルを中心に提供されています。

### 1.1 テキスト生成 / LLM (Text Generation)

- **フラグシップ / 最高性能オープンモデル**
  - **Llama 3.3 70B** (`@cf/meta/llama-3.3-70b-instruct`)
    - オープンモデルの中で最高峰の指示追従能力・言語理解力・論理構築力を備えた大規模モデル。複雑な文書作成や高度なタスク処理に最適。
  - **DeepSeek R1 Distill シリーズ** (`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` など)
    - 推論（Reasoning）プロセスに特化し、複雑な論理的思考、数学的解決、ステップバイステップの推論タスクにおいて最高クラスの性能を発揮。

- **標準・高性能バランスモデル**
  - **Llama 3.1 8B** (`@cf/meta/llama-3.1-8b-instruct`)
    - 精度と推論速度のバランスが極めて優れており、日常的なチャットや一般的なテキスト生成タスクの標準的な選択肢。
  - **Gemma 4 シリーズ** (`@cf/google/gemma-4-9b-it` / `@cf/google/gemma-4-26b-it` など)
    - Googleが開発した最新オープンモデル。優れた言語理解・マルチリンガル性能と高度な指示追従力を備え、中規模パラメータながら上位モデルに迫る高い推論効率を実現。

- **圧倒的省エネ・超軽量モデル (簡易タスク向け)**
  - **Qwen 1.5 0.5B** (`@cf/qwen/qwen1.5-0.5b-chat`)
  - **Phi-2** (`@cf/microsoft/phi-2`)
  - **TinyLlama 1.1B** (`@cf/tinyllama/tinyllama-1.1b-chat-v1.0`)
    - パラメータ数を極限まで抑えた超軽量モデル。圧倒的に少ない計算リソース・電力で動作し、極めて低い遅延（ミリ秒単位）で応答。テキスト分類、意図抽出、データ整形などの小タスクで積極的に採用すべきモデル。

### 1.2 テキスト埋め込み (Text Embeddings)
- **BGE シリーズ** (`@cf/baai/bge-large-en-v1.5`, `@cf/baai/bge-base-en-v1.5`, `@cf/baai/bge-small-en-v1.5`)
  - 高精度なベクトル埋め込みを生成。Vectorize や RAG (検索拡張生成) システムの構築において世界基準の性能を提供。

### 1.3 画像生成 (Text-to-Image / Image-to-Image)
- **Stable Diffusion XL Base 1.0** (`@cf/stabilityai/stable-diffusion-xl-base-1.0`)
- **SDXL Lightning** (`@cf/bytedance/stable-diffusion-xl-lightning`) - 少数ステップで高速かつ高精細な画像生成を実現。

### 1.4 音声認識 (Automatic Speech Recognition)
- **Whisper** (`@cf/openai/whisper`)
  - オープン音声認識の標準モデル。高精度な多言語文字起こしに対応。

---

## 2. 2026年 性能・省エネ基準の用途別モデル選定ガイド

タスクの要求精度およびリソース効率（応答速度・消費パワー）に応じて、最適なオープンモデルを選択します。

| 用途・ユースケース | 推奨モデル | 選定基準（性能・省エネ）と選定理由 |
| :--- | :--- | :--- |
| **高度な論理推論・複雑な文書生成** | `@cf/meta/llama-3.3-70b-instruct` | **【最高性能】** オープンLLMとして最高峰の理解力・言語能力。失敗が許されない複雑な文章作成や高度な指示追従向け。 |
| **数学・推論・ステップバイステップ思考** | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | **【最高性能 (推論)】** Reasoning に強いオープンモデル。論理的検証や複雑なステップ思考が必要なタスク向け。 |
| **一般的な対話・日常的な質問応答** | `@cf/meta/llama-3.1-8b-instruct`<br>`@cf/google/gemma-4-9b-it` | **【標準高性能】** 精度・速度・リソース効率のバランスに優れ、汎用チャットボットや要約処理の標準モデル。Gemma 4 は多言語処理・指示追従に特に優れる。 |
| **【省エネ】意図分類・フィルタリング・ルーティング** | `@cf/qwen/qwen1.5-0.5b-chat`<br>`@cf/microsoft/phi-2` | **【圧倒的省エネ】** リソース消費が極めて小さく超高速応答。入力テキストの事前分類やスパム判定、簡単な意図判定で積極的に活用。 |
| **【省エネ】フォーマット変換・簡単なJSON整形** | `@cf/qwen/qwen1.5-0.5b-chat`<br>`@cf/tinyllama/tinyllama-1.1b-chat-v1.0` | **【圧倒的省エネ】** 複雑な思考を要しない構造化データへの変換やタグ付けを低コスト・超低遅延で実行。 |
| **RAG / 意味検索 (Vectorize連携)** | `@cf/baai/bge-large-en-v1.5` | **【高精度埋め込み】** テキストの文脈を正確にベクトル化し、類似度検索の精度を最大化。 |
| **リアルタイム画像生成** | `@cf/bytedance/stable-diffusion-xl-lightning` | **【高速・高画質】** 少ない計算ステップで高品質な画像を生成。 |
| **音声文字起こし** | `@cf/openai/whisper` | **【高精度文字起こし】** 多言語音声を高精度にテキスト化。 |

---

## 3. 省エネモデル（超軽量LLM）を積極活用するメリットと設計パターン

性能（パラメータ数）を追うだけでなく、**簡単なタスクに超軽量・省エネモデルを割り当てる設計**は、2026年現在のシステム構築における重要なプラクティスです。

### 3.1 省エネモデル採用のメリット
1. **圧倒的なレスポンス速度**:
   - 大型モデルに比べ推論時間が数分の一〜十分の一となり、ユーザー体験（UIレスポンス）を劇的に向上させます。
2. **高いスループットと高いレート制限上限**:
   - 大型モデル（300 RPM）に比べて高いレートリミット上限（1500 RPM 等）が設定されているため、大量のマイクロリクエストを並列処理できます。
3. **グリーンコンピューティングとコスト最適化**:
   - 消費電力およびGPU負荷を著しく低減できるため、環境負荷を抑えつつ運用コストを最小化できます。

### 3.2 実践設計パターン: 2段階パイプライン（スマートルーティング）
リクエストの最初に省エネモデルを配置して前処理・判定を行い、必要な場合のみ大型モデルへ引き継ぐパターンです。

```
[ユーザー入力]
    │
    ▼
[省エネモデル (Qwen 0.5B)] ── (簡単な質問・挨拶など) ──> [即座に高速回答]
    │
    │ (複雑な指示・論理思考が必要な場合)
    ▼
[高性能モデル (Llama 3.3 70B / DeepSeek R1 Distill)] ──> [高精度な回答]
```

---

## 4. 使用上限・レートリミット (Rate Limits)

Workers AI では、モデルの計算負荷（パラメータ数・省エネ度）に応じたレートリミット（リクエスト/分: RPM）が設定されています。

### 4.1 タスク種別ごとの標準レートリミット

| タスク種別 | レートリミット (RPM) | 備考 |
| :--- | :--- | :--- |
| **Text Generation (テキスト生成)** | 300 RPM | モデルのサイズ・省エネ度により緩和あり |
| **Text Embeddings (埋め込み)** | 3000 RPM | `@cf/baai/bge-large-en-v1.5` は 1500 RPM |
| **Text-to-Image (画像生成)** | 720 RPM | |
| **Automatic Speech Recognition (音声認識)** | 720 RPM | Whisper |

### 4.2 省エネモデル vs 標準/大型モデルのレートリミット比較

省エネモデルほど高いリクエスト上限が与えられており、エッジでの頻繁な呼び出しに適しています。

- **超省エネ・軽量モデル**:
  - `@cf/qwen/qwen1.5-0.5b-chat`: **1500 RPM** (高いリクエスト処理能力)
  - `@cf/microsoft/phi-2`: **720 RPM**
  - `@cf/tinyllama/tinyllama-1.1b-chat-v1.0`: **720 RPM**
- **標準・大型モデル**:
  - `@cf/meta/llama-3.1-8b-instruct`: **300 RPM**
  - `@cf/meta/llama-3.3-70b-instruct`: **300 RPM**
  - `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`: **300 RPM**

---

## 5. Gemma 4 に対する考察とエッジ AI における位置づけ

2026年における最新オープンモデルである **Gemma 4**（Google）は、Cloudflare Workers AI のようなサーバーレス・エッジコンピューティング環境において非常に重要な選択肢となっています。

### 5.1 Gemma 4 の技術的特徴と優位性
1. **高いパラメータ効率と指示追従性**:
   - Gemma 4 はアーキテクチャの最適化により、従来の中規模モデル（9B〜26Bクラス）を上回る推論精度と厳格な指示追従能力（Structured Output / JSON 出力など）を発揮します。
2. **優れたマルチリンガル・長文文脈処理能力**:
   - 多言語での表現力・理解力が大幅に向上しており、グローバル展開する Workers アプリケーションや複雑な多言語テキストの処理・要約タスクで力を発揮します。
3. **エッジ推論に適した軽量性とメモリ効率**:
   - 少ないメモリフットプリントで高速動作するため、エッジネットワーク上でのコールドスタート時間短縮や低遅延なレスポンス作成に大きく貢献します。

### 5.2 Workers AI における活用戦略
- **Llama 3.1 8B や Qwen との使い分け**:
  - 英語圏中心の高速処理には Llama 3.1 8B、超低遅延前処理には Qwen 0.5B を利用しつつ、**多言語理解・緻密な命令追従・高品質な文章生成**が要求されるミドル層のタスクには Gemma 4 を採用するのが効果的です。
- **スマートルーティングでの組み込み**:
  - 軽量な省エネモデル（Qwen 0.5B 等）で初期ハンドリングを行った後、高度な多言語回答作成や構造化データ生成ステップとして Gemma 4 を呼び出すパイプライン構成が推奨されます。

---

## 6. Worker から呼び出す際の実践的なコツ

### 6.1 設定とバインディング (`wrangler.jsonc`)
`wrangler.jsonc` に AI バインディングを設定することで、Worker 内から直接 `env.AI` 経由で呼び出せます。

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

### 6.2 省エネモデルによるルーティングとフォールバック処理
最初に軽量モデルで判定し、条件に応じて最適なモデルを呼び出す、あるいはフォールバックを行う実装例です。

```typescript
// src/index.ts
export interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { prompt } = await request.json<{ prompt: string }>();

    // 1. 省エネモデル (Qwen 0.5B) を使って質問の複雑さを超高速判定 (ルーティング)
    const classifyRes = await env.AI.run('@cf/qwen/qwen1.5-0.5b-chat', {
      messages: [
        {
          role: 'system',
          content: 'ユーザーの入力が「単純な挨拶や簡単な質問」なら SIMPLE、「複雑な文章作成や論理的思考が必要な依頼」なら COMPLEX とだけ答えてください。',
        },
        { role: 'user', content: prompt },
      ],
    });

    const isComplex = classifyRes.response?.includes('COMPLEX');

    // 2. 判定結果に応じて適切なオープンモデルを選択
    const selectedModel = isComplex
      ? '@cf/meta/llama-3.3-70b-instruct' // 高精度・最高性能モデル
      : '@cf/meta/llama-3.1-8b-instruct';  // 標準・高速モデル

    // 3. ストリーミングレスポンスで回答を返却
    const stream = await env.AI.run(selectedModel, {
      messages: [
        { role: 'system', content: 'あなたは親切なAIアシスタントです。' },
        { role: 'user', content: prompt },
      ],
      stream: true,
    });

    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream' },
    });
  },
};
```

### 6.3 AI Gateway による可視化・キャッシュ
本番環境では Cloudflare AI Gateway を活用し、プロンプトのキャッシュやログ保存を行うことで、さらに応答速度向上と計算リソースの節約を実現できます。

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

---

## 7. まとめ

2026年現在の AI アプリケーション開発では、単一のモデルに依存するのではなく、**オープンモデルの性能特性と省エネ性能に応じた適切なモデル選定**が重要です。

- **最高性能重視**: 複雑な思考や高品質なテキスト作成には `Llama 3.3 70B` や `DeepSeek R1 Distill` を採用。
- **標準・バランス・多言語**: 一般的な対話処理にはデファクト標準の `Llama 3.1 8B` や、多言語・指示追従に長けた `Gemma 4` を使用。
- **省エネ・超低遅延重視**: 入力分類、タグ付け、ルーティングなどの簡易タスクには `Qwen 1.5 0.5B` や `Phi-2` などの超軽量モデルを積極活用し、システム全体を効率化。
