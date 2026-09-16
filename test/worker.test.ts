/**
 * Worker 基盤のルーティングを Workers ランタイム上で確認するテスト。
 */

import { SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import worker from "../src/index";

describe("Worker ルーティング", () => {
  it("GET /health はバインディング情報を含まない死活応答を返す", async () => {
    const response = await SELF.fetch("https://example.com/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("GET 以外の /health は Allow ヘッダー付きの 405 を返す", async () => {
    const response = await SELF.fetch("https://example.com/health", { method: "POST" });

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("存在しない API は JSON の 404 を返す", async () => {
    const response = await SELF.fetch("https://example.com/api/unknown");

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
  });

  it("API 以外は Static Assets バインディングへ委譲する", async () => {
    const assetFetch = vi.fn(async () => new Response("asset response"));
    // このテストで使用しないバインディングは、ルーティング用の最小環境にだけ含める。
    const testEnv = {
      ASSETS: { fetch: assetFetch },
    } as unknown as Env;
    const request = new Request("https://example.com/example.txt");

    const response = await worker.fetch(request, testEnv);

    expect(assetFetch).toHaveBeenCalledOnce();
    expect(await response.text()).toBe("asset response");
  });
});
