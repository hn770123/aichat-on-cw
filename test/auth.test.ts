/**
 * Basic 認証の解析、一定時間比較、拒否応答を確認する単体テスト。
 */

import { describe, expect, it } from "vitest";
import { assertAuthenticated, parseBasicAuthorization, timingSafeEqual } from "../src/auth";
import type { Env } from "../src/env";

/** テストに必要な認証 Secret だけを持つ環境を作る。 */
function authEnv(): Env {
  return { BASIC_AUTH_USER: "利用者", BASIC_AUTH_PASSWORD: "安全な:パスワード" } as Env;
}

describe("parseBasicAuthorization", () => {
  it("UTF-8 のユーザー名とコロンを含むパスワードを解析する", () => {
    const bytes = new TextEncoder().encode("利用者:安全な:パスワード");
    let binary = "";
    bytes.forEach((value) => { binary += String.fromCharCode(value); });

    expect(parseBasicAuthorization(`Basic ${btoa(binary)}`)).toEqual({
      username: "利用者",
      password: "安全な:パスワード",
    });
  });

  it.each([null, "Bearer token", "Basic !!!=", "Basic dXNlcg=="])("不足、不正方式、不正 Base64、不正形式を拒否する: %s", (value) => {
    expect(parseBasicAuthorization(value)).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("一致だけを true にする", () => {
    expect(timingSafeEqual("秘密", "秘密")).toBe(true);
    expect(timingSafeEqual("秘密", "別値")).toBe(false);
    expect(timingSafeEqual("短い", "より長い値")).toBe(false);
  });
});

describe("assertAuthenticated", () => {
  it("正しい認証情報を許可する", () => {
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode("利用者:安全な:パスワード")));
    const request = new Request("https://example.com", { headers: { Authorization: `Basic ${encoded}` } });
    expect(() => assertAuthenticated(request, authEnv())).not.toThrow();
  });

  it("不一致を WWW-Authenticate 付き 401 として拒否する", () => {
    const request = new Request("https://example.com", { headers: { Authorization: `Basic ${btoa("wrong:wrong")}` } });
    expect(() => assertAuthenticated(request, authEnv())).toThrowError(expect.objectContaining({ status: 401, code: "unauthorized" }));
  });
});
