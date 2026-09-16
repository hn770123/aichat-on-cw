/**
 * AI チャット Worker のエントリーポイントと基盤ルーティング。
 *
 * API と死活監視は Worker 内で処理し、それ以外のパスは Static Assets
 * バインディングへ委譲する。すべての経路を Basic 認証で保護する。
 */

import type { Env } from "./env";
import { assertAuthenticated } from "./auth";
import { createConversation, createMessage, deleteConversation, getConversation, getModels, listConversations } from "./chat";
import { errorResponse, HttpError, jsonResponse } from "./http";

/**
 * 許可されていない HTTP メソッドを表すエラーを生成する。
 *
 * @param allowedMethods 対象ルートで許可するメソッド一覧。
 * @returns Allow ヘッダーを持つ HTTP 405 エラー。
 */
function methodNotAllowed(allowedMethods: readonly string[]): HttpError {
  return new HttpError(405, "method_not_allowed", "この HTTP メソッドは使用できません。", {
    Allow: allowedMethods.join(", "),
  });
}

/**
 * バインディング情報を公開せずに Worker の稼働状態を返す。
 *
 * @param request 死活監視への HTTP リクエスト。
 * @returns 正常稼働を示す JSON 応答。
 * @throws {HttpError} GET 以外のメソッドが指定された場合。
 */
function handleHealth(request: Request): Response {
  if (request.method !== "GET") {
    throw methodNotAllowed(["GET"]);
  }

  return jsonResponse({ ok: true });
}

/**
 * API 名前空間のリクエストを処理する。
 *
 * @returns 未実装または存在しない API を示す JSON 404 応答。
 * @throws {HttpError} 一致する API ルートが存在しない場合。
 */
async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === "/api/models") {
    if (request.method !== "GET") throw methodNotAllowed(["GET"]);
    return getModels();
  }
  if (pathname === "/api/conversations") {
    if (request.method === "GET") return listConversations(env);
    if (request.method === "POST") return createConversation(request, env);
    throw methodNotAllowed(["GET", "POST"]);
  }

  const messageMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (messageMatch) {
    if (request.method !== "POST") throw methodNotAllowed(["POST"]);
    return createMessage(request, env, decodeURIComponent(messageMatch[1]));
  }
  const conversationMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (conversationMatch) {
    const id = decodeURIComponent(conversationMatch[1]);
    if (request.method === "GET") return getConversation(env, id);
    if (request.method === "DELETE") return deleteConversation(request, env, id);
    throw methodNotAllowed(["GET", "DELETE"]);
  }
  throw new HttpError(404, "not_found", "API が見つかりません。");
}

/**
 * URL のパスに応じて Worker 内処理または静的アセットへ振り分ける。
 *
 * @param request 受信した HTTP リクエスト。
 * @param env Cloudflare から注入されたバインディング。
 * @returns ルートに対応する HTTP 応答。
 */
async function routeRequest(request: Request, env: Env): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  assertAuthenticated(request, env);

  if (pathname === "/health") {
    return handleHealth(request);
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return handleApi(request, env, pathname);
  }

  return env.ASSETS.fetch(request);
}

export default {
  /**
   * すべてのリクエストをルーターへ渡し、例外を安全な応答へ変換する。
   *
   * @param request 受信した HTTP リクエスト。
   * @param env Cloudflare から注入されたバインディング。
   * @returns ルーティング結果または安全なエラー応答。
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await routeRequest(request, env);
    } catch (error: unknown) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
