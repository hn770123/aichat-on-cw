/**
 * Cloudflare Workers ランタイムでテストを実行するための Vitest 設定。
 */
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest 4 では Workers 用設定を Vite プラグインとして登録する。
  plugins: [
    cloudflareTest({
      // 外部アカウントへ接続せず、Miniflare のローカルバインディングを使う。
      remoteBindings: false,
      // テスト専用値で認証経路を確認し、本番 Secret は読み込まない。
      miniflare: {
        bindings: {
          BASIC_AUTH_USER: "test-user",
          BASIC_AUTH_PASSWORD: "test-password",
        },
      },
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
