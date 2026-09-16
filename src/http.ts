/**
 * Worker の HTTP 応答、入力検証、公開可能なエラーを扱う共通処理。
 *
 * API 応答の形式とセキュリティヘッダーをこのモジュールに集約し、各 API が
 * 内部例外やキャッシュ可能な応答を誤って返すことを防ぐ。
 */

/** API の JSON 応答へ必ず付与する共通ヘッダー。 */
const API_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

/** JSON オブジェクトとして扱える値の型。 */
export type JsonObject = Record<string, unknown>;

/**
 * クライアントへ安全に公開できる HTTP エラー。
 */
export class HttpError extends Error {
  /** HTTP ステータスコード。 */
  readonly status: number;
  /** クライアントがエラー種別を判定するための安定した識別子。 */
  readonly code: string;
  /** 応答へ追加する HTTP ヘッダー。 */
  readonly headers: HeadersInit | undefined;

  /**
   * 公開可能な HTTP エラーを生成する。
   *
   * @param status 返却する HTTP ステータスコード。
   * @param code エラー種別を表す識別子。
   * @param message 利用者へ公開できる日本語メッセージ。
   * @param headers 応答へ追加する任意のヘッダー。
   */
  constructor(status: number, code: string, message: string, headers?: HeadersInit) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

/**
 * 値を JSON に直列化し、API 共通ヘッダー付きの応答を生成する。
 *
 * @param value JSON として返す値。
 * @param init ステータスや追加ヘッダーを指定する応答設定。
 * @returns JSON 本文とセキュリティヘッダーを持つ応答。
 */
export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  Object.entries(API_HEADERS).forEach(([headerName, headerValue]) => {
    // 呼び出し側の指定にかかわらず、API の必須ヘッダーは一定に保つ。
    headers.set(headerName, headerValue);
  });

  return new Response(JSON.stringify(value), { ...init, headers });
}

/**
 * リクエスト本文を JSON オブジェクトとして読み取る。
 *
 * @param request 検証する HTTP リクエスト。
 * @returns 解析済みの JSON オブジェクト。
 * @throws {HttpError} Content-Type、JSON 構文、値の型が不正な場合。
 */
export async function readJsonObject(request: Request): Promise<JsonObject> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new HttpError(415, "unsupported_media_type", "Content-Type は application/json を指定してください。");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "JSON の形式が正しくありません。");
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_json", "JSON オブジェクトを指定してください。");
  }

  return value as JsonObject;
}

/**
 * Origin ヘッダーがリクエスト URL と同一オリジンであることを検証する。
 *
 * ブラウザーが送る状態変更リクエストで別オリジンを拒否する。Origin がない
 * 非ブラウザークライアントは Basic 認証を利用できるよう許可する。
 *
 * @param request 検証する HTTP リクエスト。
 * @throws {HttpError} Origin が不正または異なる場合。
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin === null) {
    return;
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new HttpError(400, "invalid_request", "リクエスト URL が正しくありません。");
  }

  if (origin !== requestOrigin) {
    throw new HttpError(403, "cross_origin_request", "異なるオリジンからのリクエストは許可されていません。");
  }
}

/**
 * 例外を内部情報を含まない JSON エラー応答へ変換する。
 *
 * @param error 変換対象の例外。
 * @returns 公開可能なメッセージだけを含む API 応答。
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: error.headers },
    );
  }

  // 予期しない例外の詳細はクライアントへ公開しない。
  console.error("予期しない Worker エラーが発生しました。", error);
  return jsonResponse(
    { error: { code: "internal_error", message: "サーバー内部でエラーが発生しました。" } },
    { status: 500 },
  );
}
