/**
 * HTTP 共通処理の JSON 応答、入力検証、エラー変換を確認するテスト。
 */

import { describe, expect, it } from "vitest";
import { assertSameOrigin, errorResponse, HttpError, jsonResponse, readJsonObject } from "../src/http";

describe("jsonResponse", () => {
  it("JSON と共通セキュリティヘッダーを返す", async () => {
    const response = jsonResponse({ ok: true });

    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

describe("readJsonObject", () => {
  it("JSON オブジェクトを読み取る", async () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ message: "こんにちは" }),
    });

    await expect(readJsonObject(request)).resolves.toEqual({ message: "こんにちは" });
  });

  it("不正な JSON を公開可能な 400 エラーにする", async () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    await expect(readJsonObject(request)).rejects.toMatchObject({ status: 400, code: "invalid_json" });
  });
});

describe("assertSameOrigin", () => {
  it("同一オリジンを許可し、異なるオリジンを拒否する", () => {
    const sameOrigin = new Request("https://example.com/api/test", {
      headers: { Origin: "https://example.com" },
    });
    const crossOrigin = new Request("https://example.com/api/test", {
      headers: { Origin: "https://attacker.example" },
    });

    expect(() => assertSameOrigin(sameOrigin)).not.toThrow();
    expect(() => assertSameOrigin(crossOrigin)).toThrowError(HttpError);
  });
});

describe("errorResponse", () => {
  it("HTTP エラーのステータス、識別子、追加ヘッダーを維持する", async () => {
    const response = errorResponse(new HttpError(405, "method_not_allowed", "使用できません。", { Allow: "GET" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    await expect(response.json()).resolves.toEqual({
      error: { code: "method_not_allowed", message: "使用できません。" },
    });
  });
});
