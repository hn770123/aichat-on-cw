/**
 * Basic 認証ヘッダーの解析と認証情報の検証を行うモジュール。
 *
 * 認証値をログや応答へ含めず、比較時間から値を推測しにくくする。
 */

import type { Env } from "./env";
import { HttpError } from "./http";

/** 認証を要求するときに返す標準ヘッダー。 */
const AUTHENTICATE_HEADER = 'Basic realm="AI Chat", charset="UTF-8"';

/**
 * 2 つの文字列を、長さの違いも含めて最後まで走査して比較する。
 *
 * @param actual リクエストから受け取った値。
 * @param expected Secret に保存された期待値。
 * @returns UTF-8 バイト列が一致する場合は true。
 */
export function timingSafeEqual(actual: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let difference = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Authorization ヘッダーから Basic 認証情報を読み取る。
 *
 * @param authorization Authorization ヘッダー値。
 * @returns ユーザー名とパスワード。形式が不正な場合は null。
 */
export function parseBasicAuthorization(
  authorization: string | null,
): { username: string; password: string } | null {
  if (authorization === null || !/^Basic\s+/i.test(authorization)) {
    return null;
  }

  const encoded = authorization.replace(/^Basic\s+/i, "");
  // atob が一部の不正文字を許容するため、標準 Base64 の構文も先に検査する。
  if (encoded === "" || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    return null;
  }

  try {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return null;
    }
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

/**
 * リクエストの Basic 認証情報を Secret と照合する。
 *
 * @param request 検証対象のリクエスト。
 * @param env 認証用 Secret を含む実行環境。
 * @throws {HttpError} 認証情報がない、または一致しない場合。
 */
export function assertAuthenticated(request: Request, env: Env): void {
  const credentials = parseBasicAuthorization(request.headers.get("Authorization"));
  const username = credentials?.username ?? "";
  const password = credentials?.password ?? "";
  const validUser = timingSafeEqual(username, env.BASIC_AUTH_USER);
  const validPassword = timingSafeEqual(password, env.BASIC_AUTH_PASSWORD);

  if (credentials === null || !validUser || !validPassword) {
    throw new HttpError(401, "unauthorized", "認証が必要です。", {
      "WWW-Authenticate": AUTHENTICATE_HEADER,
    });
  }
}
