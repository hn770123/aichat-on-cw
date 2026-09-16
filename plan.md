# AI チャットサイト実装計画

## 1. 目的と完了条件

`draft.md` に記載された要件を、Cloudflare Workers 上で動作する小規模な AI チャットサイトとして実装する。

実装完了は、次の状態をすべて満たすこととする。

- HTTPS 上の Basic 認証を通過した利用者だけが画面と API を利用できる。
- 利用者がメッセージを送信すると、過去の会話を文脈として Workers AI が回答する。
- 会話と各メッセージが D1 に保存され、履歴一覧から会話を再表示・削除できる。
- 画面側の HTML/CSS/JavaScript が iOS 9 の Safari で基本操作できる。
- ローカルテスト、型検査、主要 API の自動テストが通る。
- Secrets やデータベース ID などの機密値・環境固有値がリポジトリに含まれない。

## 2. 実装前に確定・確認する事項

実装開始時に Cloudflare 公式ドキュメントを再確認し、API や設定形式が変更されていないことを確認する。特に、既存資料に記載されたモデル ID は存在を前提にせず、Workers AI のモデルカタログで当日に利用可能な会話向けモデルを選ぶ。

確認先:

- Workers AI バインディング: <https://developers.cloudflare.com/workers-ai/configuration/bindings/>
- Workers AI モデルカタログ: <https://developers.cloudflare.com/workers-ai/models/>
- D1 Workers Binding API: <https://developers.cloudflare.com/d1/worker-api/>
- D1 マイグレーション: <https://developers.cloudflare.com/d1/reference/migrations/>
- Workers Static Assets: <https://developers.cloudflare.com/workers/static-assets/>
- Workers Secrets: <https://developers.cloudflare.com/workers/configuration/secrets/>
- Workers Vitest integration: <https://developers.cloudflare.com/workers/testing/vitest-integration/>

次の仕様を初期値とし、要件追加がなければこのまま実装する。

- 認証ユーザーは 1 組とし、`BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` を Worker Secret に保存する。
- 会話は認証ユーザー間で共有される。複数ユーザー対応やユーザー別履歴は対象外とする。
- AI の回答はストリーミングせず、生成完了後に JSON で返す。iOS 9 にない Fetch API やストリーム API への依存を避けるためである。
- 履歴は更新日時の降順とし、初期表示件数は 50 件とする。
- 会話削除は物理削除とし、関連メッセージも同一トランザクション相当の D1 バッチで削除する。
- AI モデル ID、システムプロンプト、最大入力長、文脈に含める最大メッセージ数は定数に集約する。

## 3. 採用構成

### 3.1 Worker とフロントエンド

- TypeScript の Module Worker を 1 エントリーポイントとして作る。
- `/api/*` は Worker のルーターで処理し、それ以外は Static Assets バインディングへ渡す。
- フロントエンドはビルド必須のフレームワークを使わず、`public/index.html`、`public/styles.css`、`public/app.js` の静的ファイルで構成する。
- `app.js` は ES5 構文、`XMLHttpRequest`、通常の DOM API のみを基本とし、`fetch`、`async/await`、Promise、アロー関数、テンプレートリテラル、ES Modules に依存しない。
- CSS は Flexbox の基本機能に留め、CSS Grid、CSS カスタムプロパティ、`gap` など iOS 9 で利用できない機能を避ける。必要に応じて `-webkit-` 接頭辞とマージンによる間隔指定を併記する。

### 3.2 Cloudflare バインディング

`wrangler.jsonc` に次を定義する。

- `DB`: D1 データベースバインディング。
- `AI`: Workers AI バインディング。
- `ASSETS`: Static Assets バインディング。
- 本番と開発で安全に差し替えられる互換日付と環境設定。

ローカル専用 Secret は `.dev.vars` に置き、`.gitignore` で除外する。リポジトリには値を含まない `.dev.vars.example` のみを追加する。本番値は `wrangler secret put BASIC_AUTH_USER` と `wrangler secret put BASIC_AUTH_PASSWORD` で登録する。

## 4. データ設計

最初のマイグレーション `migrations/0001_initial.sql` で次のテーブルを作る。

### `conversations`

| 列 | 型・制約 | 用途 |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | Worker で生成する UUID |
| `title` | TEXT NOT NULL | 最初の利用者メッセージから作る短い題名 |
| `created_at` | TEXT NOT NULL | UTC の ISO 8601 日時 |
| `updated_at` | TEXT NOT NULL | 並び替えに使う UTC の ISO 8601 日時 |

### `messages`

| 列 | 型・制約 | 用途 |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | Worker で生成する UUID |
| `conversation_id` | TEXT NOT NULL | 所属会話 ID |
| `role` | TEXT NOT NULL CHECK | `user` または `assistant` |
| `content` | TEXT NOT NULL | メッセージ本文 |
| `created_at` | TEXT NOT NULL | UTC の ISO 8601 日時 |

さらに、`messages.conversation_id` と `conversations.updated_at` にインデックスを追加する。SQLite/D1 の外部キー動作だけに削除を依存せず、削除 API 内でメッセージ、会話の順に明示的に削除する。

## 5. HTTP と API の設計

### 5.1 共通処理

全リクエストの冒頭で以下を行う。

1. `Authorization` ヘッダーを解析する。
2. `Basic` 方式でない、Base64 が不正、ユーザー名またはパスワードが一致しない場合は、`WWW-Authenticate: Basic realm="AI Chat", charset="UTF-8"` を付けて `401` を返す。
3. 認証値はログに出さない。比較処理は文字列長の違いを含めて可能な範囲で一定時間になるヘルパーへ集約する。
4. API レスポンスには `Content-Type: application/json; charset=utf-8`、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff` を付ける。
5. 状態変更 API は `Content-Type: application/json` と同一オリジンを検証し、ブラウザー経由の CSRF を抑止する。

### 5.2 エンドポイント

| メソッド・パス | 処理 | 主な応答 |
| --- | --- | --- |
| `GET /api/conversations` | 会話一覧を更新日時の降順で取得 | `{ conversations: [...] }` |
| `POST /api/conversations` | 空の新規会話を作成 | `201` と `{ conversation }` |
| `GET /api/conversations/:id` | 会話と全メッセージを取得 | `{ conversation, messages }` |
| `POST /api/conversations/:id/messages` | 利用者発言を保存し AI 回答を生成・保存 | `201` と `{ userMessage, assistantMessage }` |
| `DELETE /api/conversations/:id` | メッセージと会話を削除 | `204` |
| `GET /health` | バインディング情報を漏らさない死活応答 | `{ ok: true }` |

存在しない ID は `404`、不正な JSON・空文字・上限超過は `400`、不正なメソッドは `405` と `Allow`、AI の失敗は内容を露出しない `502` とする。SQL には必ず D1 の prepared statement とバインド変数を使う。

## 6. AI 応答処理

メッセージ送信は次の順序で実装する。

1. リクエスト本文を検証し、前後の空白を除いた本文が 1 文字以上かつ設定した上限以下であることを確認する。
2. 対象会話の存在を確認する。
3. 利用者メッセージを D1 に保存する。最初のメッセージなら、制御文字と改行を除いた先頭部分から題名を設定する。
4. D1 から直近のメッセージを上限件数だけ取得し、時系列順の `messages` 配列に戻す。
5. 固定の system メッセージを先頭に置き、`env.AI.run(選定モデル, { messages })` を 1 回呼び出す。
6. 応答形式をランタイムで検証して本文を取り出す。空の応答や想定外形式はエラーとして扱う。
7. assistant メッセージを保存し、会話の `updated_at` を更新して返す。

AI 呼び出し失敗時も利用者メッセージは履歴に残し、再送を可能にする。エラー詳細はサーバーログにのみ記録し、クライアントには追跡用リクエスト ID と一般化した文言だけを返す。意図しないコスト増加を避けるため、自動リトライは実装しない。

## 7. 画面と操作

単一ページに以下を配置する。

- ヘッダーと「新しい会話」ボタン。
- 履歴を開閉するボタンと、会話題名・更新日時を表示する履歴領域。
- 利用者と AI を視覚的に区別したメッセージ領域。
- 複数行入力欄、送信ボタン、処理中表示、スクリーンリーダー向けの状態通知。
- 選択中の会話を確認してから消す削除ボタン。

初期表示で履歴を読み込み、最新会話または新規会話を表示する。送信中は二重送信を防ぎ、成功時はメッセージと履歴を再描画し、失敗時は入力内容を保持して日本語のエラーを表示する。本文は `innerHTML` に渡さず `textContent` で描画し、AI 応答を介した XSS を防止する。

iOS 9 対応のため、日時はサーバーの ISO 文字列を安全に解析できない場合にも表示できるフォールバックを設ける。タッチ対象は十分な大きさを確保し、ソフトウェアキーボード表示時でも入力欄と送信ボタンへ到達できるレイアウトにする。

## 8. 実装手順

1. **プロジェクトを初期化する**
   - `package.json`、TypeScript、Wrangler、Vitest、Workers 用型定義を追加する。
   - `wrangler.jsonc`、`tsconfig.json`、テスト設定、`.gitignore`、`.dev.vars.example` を追加する。
   - `typecheck`、`test`、`dev`、`deploy`、D1 マイグレーション用 npm scripts を定義する。
2. **D1 スキーマを作る**
   - 初期マイグレーションとインデックスを追加する。
   - ローカル D1 に適用し、作成・取得・削除に必要な SQL を確認する。
3. **Worker の基盤を作る**
   - `Env` 型、ルーティング、JSON 応答、入力検証、エラー変換、セキュリティヘッダーを実装する。
   - AGENTS.md に従い、各モジュールと関数に目的・引数・戻り値が分かる日本語コメントを付ける。
4. **認証を実装する**
   - Basic 認証の解析・比較・拒否応答を独立したモジュールにする。
   - 正常、不足、不正方式、不正 Base64、不一致を単体テストする。
5. **履歴 API を実装する**
   - 一覧、作成、詳細、削除の各処理を prepared statement で実装する。
   - ID、件数、並び順、存在しない会話、関連メッセージ削除をテストする。
6. **チャット API を実装する**
   - 入力検証、文脈取得、Workers AI 呼び出し、回答保存を実装する。
   - AI バインディングをテスト用に差し替え、成功、AI エラー、空応答、入力上限をテストする。
7. **iOS 9 対応 UI を実装する**
   - セマンティック HTML、互換 CSS、ES5 JavaScript で画面と API クライアントを作る。
   - ローディング、空表示、エラー、削除確認、二重送信防止を実装する。
8. **統合確認と文書化を行う**
   - Workers ランタイム上の統合テスト、型検査、静的解析を実行する。
   - `README.md` に環境構築、Secret 登録、D1 作成・マイグレーション、ローカル起動、テスト、デプロイ、モデル変更方法を記載する。
   - 実機または iOS 9 相当の BrowserStack/Safari 環境で主要操作を確認し、結果を記録する。

## 9. テスト計画

### 自動テスト

- 認証なしでは静的ファイルを含む全パスが `401` になる。
- 正しい認証では画面を取得でき、誤った認証では拒否される。
- API が正常系のステータスと JSON を返し、認証情報や内部例外を返さない。
- 会話作成後、利用者発言と AI 発言が順番どおり保存される。
- AI に渡す文脈が設定件数以内かつ時系列順になる。
- 一覧が更新日時の降順になり、削除後は会話とメッセージが取得できない。
- 不正 JSON、空文字、長すぎる本文、不正 ID、存在しない ID、AI 失敗を期待どおり処理する。
- API 以外のルートが Static Assets にフォールバックする。

### 手動・互換性テスト

- iOS 9 Safari でログイン、履歴一覧、新規会話、送信、再表示、削除を操作する。
- 長文、日本語、絵文字、改行、HTML 文字列を送信し、表示崩れやスクリプト実行がないことを確認する。
- 低速回線、AI エラー、オフラインで処理中表示が解除され、再送可能になることを確認する。
- PC の現行 Chrome/Safari/Firefox でもレイアウトと基本操作を確認する。

## 10. デプロイ手順

1. `wrangler d1 create` で本番 D1 を作り、生成された ID を `wrangler.jsonc` の本番設定へ反映する。
2. `wrangler secret put` で認証ユーザー名と十分に長いパスワードを登録する。
3. `wrangler d1 migrations apply DB --remote` で本番マイグレーションを適用する。
4. 型検査と全自動テストを再実行する。
5. `wrangler deploy` でデプロイする。
6. HTTPS の本番 URL で未認証拒否、認証、送信、履歴再表示、削除をスモークテストする。
7. Workers のログと Workers AI/D1 の使用量を確認し、秘密値やメッセージ本文を不要にログ出力していないことを確認する。

## 11. 対象外と将来拡張

初回実装では、ユーザー登録、複数ユーザー、OAuth、ファイル添付、Markdown/HTML 描画、回答ストリーミング、会話検索、ページネーション、会話共有は対象外とする。必要になった場合は、Basic 認証から Cloudflare Access 等への移行、ユーザー ID を含むスキーマ移行、カーソルベースのページネーションの順で拡張する。
