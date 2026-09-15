# Cloudflare Workers GitHub デプロイ＆開発ベストプラクティス (2026年版)

Cloudflare Workers を使用したアプリケーション開発において、GitHub を起点とした CI/CD パイプライン構築および運用における2026年現在のベストプラクティスをまとめたドキュメントです。

---

## 1. プロジェクト構成と設定管理

### 1.1 設定ファイル形式 (`wrangler.jsonc`)
- **JSONC形式の採用**: 従来の `wrangler.toml` に代わり、型チェックやコメント記述が容易な `wrangler.jsonc` (または TypeScript 形式の設定ファイル) が標準となっています。
- **環境設定の分離 (`env`)**: `production` と `staging` (あるいは PR ごとのプレビュー環境) を明確に区別し、データベースバインディングや変数を分離します。

```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-worker-app",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "prod-db",
      "database_id": "YOUR_PROD_DB_ID"
    }
  ],
  "env": {
    "staging": {
      "name": "my-worker-app-staging",
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "staging-db",
          "database_id": "YOUR_STAGING_DB_ID"
        }
      ]
    }
  }
}
```

---

## 2. GitHub Actions による CI/CD パイプライン

### 2.1 セキュアな認証設定
- **API Token の使用**: Cloudflare Dash 画面より「Edit Cloudflare Workers」テンプレートから最小権限の API トークンを発行し、GitHub リポジトリの Secret (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) に登録します。

### 2.2 ワークフロー設定 (`.github/workflows/deploy.yml`)
- `cloudflare/wrangler-action` を利用し、リポジトリへの Push / PR 契機で自動テスト・マイグレーション・デプロイを実行します。

```yaml
name: Deploy Cloudflare Worker

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  test:
    name: Run Tests & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm run typecheck

      - name: Run Vitest
        run: pnpm test

  deploy-staging:
    name: Deploy to Staging / PR Preview
    needs: test
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Apply D1 Migrations (Staging)
        run: pnpm wrangler d1 migrations apply DB --remote --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Deploy to Staging
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          environment: 'staging'

  deploy-production:
    name: Deploy to Production
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Apply D1 Migrations (Production)
        run: pnpm wrangler d1 migrations apply DB --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Deploy to Production
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

## 3. データベース（D1）・KV・AIバインディングの運用

### 3.1 D1 データベースのマイグレーション管理
- マイグレーションファイルは `migrations/0000_init.sql` のようにリポジトリ内でバージョン管理します。
- CI/CD パイプライン内で `wrangler d1 migrations apply <BINDING_NAME> --remote` を実行し、デプロイ前に安全にスキーマ変更を適用します。

### 3.2 Cloudflare Workers AI および Secrets の管理
- 環境変数やAPIキー、パスワードなどの機密情報はコードや `wrangler.jsonc` にハードコードせず、`wrangler secret put <KEY>` または GitHub Actions / Cloudflare Dashboard 経由で設定します。
- Cloudflare Workers AI (`AI` バインディング) を利用する場合は、`wrangler.jsonc` に `"ai": { "binding": "AI" }` を定義し、コード内から `env.AI` 経由で型安全に利用します。

---

## 4. テスト自動化 (`@cloudflare/vitest-pool-workers`)

### 4.1 Vitest による本番に近いローカル・CIテスト
- `@cloudflare/vitest-pool-workers` を使用することで、実際の Miniflare / Workers ランタイム上で高速かつ精度高くテストを実行できます。

```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
```

---

## 5. モニタリング・セキュリティ・運用ベストプラクティス

1. **Observability (Tail Logs / Workers Logs)**
   - 本番運用では `observability.enabled = true` を設定し、Cloudflare Dashboard または Logpush を活用してリアルタイムログを取得・監視します。
2. **Dependabot による依存関係アップデート**
   - `@cloudflare/workers-types` や `wrangler` のアップデートを自動監視し、互換性を維持します。
3. **レジリエンスとシークレット回転**
   - トークンの定期更新と、最小権限原則（Workers / D1 のみに限定した API Token）を徹底します。
