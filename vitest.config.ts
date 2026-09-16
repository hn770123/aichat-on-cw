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
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
