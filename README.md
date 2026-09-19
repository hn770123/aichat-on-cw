# AI Chat on Cloudflare Workers

Basic 認証で保護された小規模な AI チャットです。Cloudflare Workers、Workers AI、D1、Static Assets を利用し、会話のモデルとシステムプロンプトを会話単位で保存します。画面は iOS 9 Safari でも基本操作できるよう、ES5 JavaScript と `XMLHttpRequest` で実装しています。

## 必要なもの

- Node.js 20.19 以上
- npm
- Cloudflare アカウント（デプロイする場合）
- Wrangler から Cloudflare へログインできること（デプロイする場合）

## ローカル環境の構築

```sh
git clone <repository-url>
cd aichat-on-cw
npm ci
cp .dev.vars.example .dev.vars
```

`.dev.vars` の `BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` をローカル専用の値へ変更してください。`.dev.vars` は Git の追跡対象外です。実際の認証情報を `.dev.vars.example` やソースコードへ記載しないでください。

ローカル D1 にマイグレーションを適用して Worker を起動します。

```sh
npm run db:migrate:local
npm run dev
```

Wrangler が表示する HTTPS または localhost の URL を開き、`.dev.vars` に設定した Basic 認証情報でログインします。Workers AI バインディングはローカル開発時にもリモートサービスへ接続し、利用量が発生する可能性があります。

## 自動確認

```sh
npm run typecheck
npm run lint
npm test
```

- `typecheck`: Worker の TypeScript 型検査
- `lint`: iOS 9 向けブラウザースクリプトを ES5 として静的解析
- `test`: Miniflare 上の Workers ランタイム、D1、ルーティング、認証、チャット処理のテスト

実機を含む手動確認の項目と記録方法は [`docs/compatibility-test.md`](docs/compatibility-test.md) を参照してください。

## 本番 D1 の作成とマイグレーション

1. Cloudflare にログインします。

   ```sh
   npx wrangler login
   ```

2. D1 データベースを作成します。

   ```sh
   npx wrangler d1 create aichat-on-cw
   ```

3. 出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に設定します。リポジトリ既定のゼロ埋め ID はプレースホルダーであり、そのままでは本番へデプロイできません。環境別設定を共有しない運用では、デプロイ時に適切な設定ファイルを指定してください。

4. 本番 D1 へマイグレーションを適用します。対象データベースを確認してから実行してください。

   ```sh
   npm run db:migrate:remote
   ```

新しいマイグレーションを作る場合は、名前を引数として渡します。

```sh
npm run db:migration:create -- add_example_column
```

適用済みの初期マイグレーションを書き換えず、新しい SQL ファイルを追加してください。

## Secret の登録

本番の認証情報は Wrangler の Secret として個別に登録します。

```sh
npx wrangler secret put BASIC_AUTH_USER
npx wrangler secret put BASIC_AUTH_PASSWORD
```

値は対話入力し、コマンドライン引数、設定ファイル、ログへ残さないでください。十分に長く推測困難なパスワードを使用します。

## デプロイ

型検査・静的解析・テストを通し、D1 マイグレーションと Secret 登録を終えてからデプロイします。

```sh
npm run typecheck
npm run lint
npm test
npm run deploy
```

デプロイ後は HTTPS の URL で、未認証時の拒否、認証、会話作成、メッセージ送信、履歴再表示、削除をスモークテストしてください。Workers のログに認証情報やメッセージ本文が出ていないこと、Workers AI と D1 の使用量も確認します。

## 利用モデルの変更

選択可能なモデルと既定モデルは `src/chat.ts` の `AI_MODELS` と `DEFAULT_MODEL` に集約されています。変更時は次の順で行います。

1. [Workers AI モデルカタログ](https://developers.cloudflare.com/workers-ai/models/) で、現在利用でき、チャットの `messages` 入力に対応するモデル ID と仕様を確認する。
2. `AI_MODELS` にモデル ID と画面表示名を追加または変更する。
3. 必要なら `DEFAULT_MODEL` を、必ず `AI_MODELS` に含まれる ID へ変更する。
4. `npm run typecheck`、`npm run lint`、`npm test` を実行する。
5. 新規会話のモデル一覧と AI 応答をステージング環境で確認する。

モデル設定は会話作成時に保存され、既存会話では自動的に切り替わりません。廃止モデルを使う既存会話は、新しいモデルを選択した会話として作り直してください。任意のモデル ID をクライアントから直接渡せるようにしてはいけません。

## 主な公式資料

運用や依存設定を変更するときは、最新の公式資料を再確認してください。

- [Workers AI バインディング](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [Workers AI モデルカタログ](https://developers.cloudflare.com/workers-ai/models/)
- [D1 の開始手順](https://developers.cloudflare.com/d1/get-started/)
- [D1 マイグレーション](https://developers.cloudflare.com/d1/reference/migrations/)
- [Workers Secret](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
