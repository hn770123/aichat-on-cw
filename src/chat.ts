/**
 * 会話設定、D1 による履歴管理、Workers AI 応答生成を扱うモジュール。
 */

import type { Env } from "./env";
import { assertSameOrigin, HttpError, jsonResponse, readJsonObject } from "./http";

/** 新規会話で選択できるモデル。Workers AI の messages 入力対応モデルに限定する。 */
export const AI_MODELS = [
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Llama 3.3 70B（高品質）" },
  { id: "@cf/meta/llama-3.1-8b-instruct-fast", name: "Llama 3.1 8B（高速）" },
] as const;
/** 新規会話で既定選択するモデル ID。 */
export const DEFAULT_MODEL = AI_MODELS[0].id;
/** システムプロンプトが空欄のときに保存する既定値。 */
export const DEFAULT_SYSTEM_PROMPT = "あなたは親切で正確な日本語のアシスタントです。";
/** システムプロンプトの最大文字数。 */
export const MAX_SYSTEM_PROMPT_LENGTH = 2_000;
/** 利用者メッセージの最大文字数。 */
export const MAX_MESSAGE_LENGTH = 8_000;
/** AI へ渡す保存済みメッセージの最大件数。 */
export const MAX_CONTEXT_MESSAGES = 30;
/** 履歴一覧で返す最大件数。 */
const CONVERSATION_LIMIT = 50;

/** D1 の conversations 行。 */
interface ConversationRow {
  id: string;
  title: string;
  ai_model: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

/** D1 の messages 行。 */
interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

/**
 * データベース行を公開 API 用の会話形式へ変換する。
 *
 * @param row D1 から得た会話行。
 * @param includePrompt システムプロンプトを含めるか。
 * @returns camelCase の会話オブジェクト。
 */
function serializeConversation(row: ConversationRow, includePrompt: boolean): Record<string, string> {
  const conversation: Record<string, string> = {
    id: row.id,
    title: row.title,
    aiModel: row.ai_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includePrompt) conversation.systemPrompt = row.system_prompt;
  return conversation;
}

/**
 * データベース行を公開 API 用のメッセージ形式へ変換する。
 *
 * @param row D1 から得たメッセージ行。
 * @returns camelCase のメッセージオブジェクト。
 */
function serializeMessage(row: MessageRow): Record<string, string> {
  return { id: row.id, conversationId: row.conversation_id, role: row.role, content: row.content, createdAt: row.created_at };
}

/**
 * パスに含まれる会話 ID を安全な UUID として検証する。
 *
 * @param id 検証する ID。
 * @returns 検証済み ID。
 */
function validateId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, "invalid_id", "会話 ID が正しくありません。");
  }
  return id;
}

/**
 * 会話を取得し、存在しなければ 404 にする。
 *
 * @param db D1 バインディング。
 * @param id 会話 ID。
 * @returns 保存済み会話。
 */
async function findConversation(db: D1Database, id: string): Promise<ConversationRow> {
  const row = await db.prepare(
    "SELECT id, title, ai_model, system_prompt, created_at, updated_at FROM conversations WHERE id = ?",
  ).bind(id).first<ConversationRow>();
  if (row === null) throw new HttpError(404, "conversation_not_found", "会話が見つかりません。");
  return row;
}

/**
 * モデル一覧と新規会話用の既定設定を返す。
 *
 * @returns モデル設定の JSON 応答。
 */
export function getModels(): Response {
  return jsonResponse({ models: AI_MODELS, defaultModel: DEFAULT_MODEL, defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT, maxSystemPromptLength: MAX_SYSTEM_PROMPT_LENGTH });
}

/**
 * 更新日時の新しい順に会話履歴を返す。
 *
 * @param env D1 バインディングを含む環境。
 * @returns 会話一覧の JSON 応答。
 */
export async function listConversations(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT id, title, ai_model, system_prompt, created_at, updated_at FROM conversations ORDER BY updated_at DESC, id DESC LIMIT ?",
  ).bind(CONVERSATION_LIMIT).all<ConversationRow>();
  return jsonResponse({ conversations: result.results.map((row) => serializeConversation(row, false)) });
}

/**
 * 検証済み設定を持つ空の会話を作成する。
 *
 * @param request 作成設定を含むリクエスト。
 * @param env D1 バインディングを含む環境。
 * @returns 作成した会話の JSON 応答。
 */
export async function createConversation(request: Request, env: Env): Promise<Response> {
  assertSameOrigin(request);
  const body = await readJsonObject(request);
  if (typeof body.model !== "string" || !AI_MODELS.some((model) => model.id === body.model)) {
    throw new HttpError(400, "invalid_model", "選択できない AI モデルです。");
  }
  if (typeof body.systemPrompt !== "string") {
    throw new HttpError(400, "invalid_system_prompt", "システムプロンプトは文字列で指定してください。");
  }
  const systemPrompt = body.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
  if (systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    throw new HttpError(400, "system_prompt_too_long", `システムプロンプトは ${MAX_SYSTEM_PROMPT_LENGTH} 文字以内にしてください。`);
  }

  const now = new Date().toISOString();
  const row: ConversationRow = { id: crypto.randomUUID(), title: "新しい会話", ai_model: body.model, system_prompt: systemPrompt, created_at: now, updated_at: now };
  await env.DB.prepare(
    "INSERT INTO conversations (id, title, ai_model, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(row.id, row.title, row.ai_model, row.system_prompt, row.created_at, row.updated_at).run();
  return jsonResponse({ conversation: serializeConversation(row, true) }, { status: 201 });
}

/**
 * 会話設定と全メッセージを時系列順で返す。
 *
 * @param env D1 バインディングを含む環境。
 * @param rawId URL から得た会話 ID。
 * @returns 会話詳細の JSON 応答。
 */
export async function getConversation(env: Env, rawId: string): Promise<Response> {
  const id = validateId(rawId);
  const conversation = await findConversation(env.DB, id);
  const result = await env.DB.prepare(
    "SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC",
  ).bind(id).all<MessageRow>();
  return jsonResponse({ conversation: serializeConversation(conversation, true), messages: result.results.map(serializeMessage) });
}

/**
 * 会話に属するメッセージと会話本体を D1 バッチで削除する。
 *
 * @param request 同一オリジンを検証するリクエスト。
 * @param env D1 バインディングを含む環境。
 * @param rawId URL から得た会話 ID。
 * @returns 本文を持たない 204 応答。
 */
export async function deleteConversation(request: Request, env: Env, rawId: string): Promise<Response> {
  assertSameOrigin(request);
  const id = validateId(rawId);
  await findConversation(env.DB, id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(id),
    env.DB.prepare("DELETE FROM conversations WHERE id = ?").bind(id),
  ]);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/**
 * AI 応答オブジェクトから空でない本文を取り出す。
 *
 * @param value Workers AI が返した値。
 * @returns 応答本文。形式が不正なら null。
 */
function extractAiResponse(value: unknown): string | null {
  if (value === null || typeof value !== "object" || !("response" in value)) return null;
  const response = (value as { response?: unknown }).response;
  return typeof response === "string" && response.trim() !== "" ? response.trim() : null;
}

/**
 * 利用者発言を保存し、会話固有の設定と文脈で AI 回答を生成・保存する。
 *
 * @param request メッセージ本文を含むリクエスト。
 * @param env D1 と Workers AI バインディングを含む環境。
 * @param rawId URL から得た会話 ID。
 * @returns 保存した利用者・AI メッセージの JSON 応答。
 */
export async function createMessage(request: Request, env: Env, rawId: string): Promise<Response> {
  assertSameOrigin(request);
  const id = validateId(rawId);
  const body = await readJsonObject(request);
  if (typeof body.content !== "string" || body.content.trim() === "") {
    throw new HttpError(400, "invalid_message", "メッセージを入力してください。");
  }
  const content = body.content.trim();
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError(400, "message_too_long", `メッセージは ${MAX_MESSAGE_LENGTH} 文字以内にしてください。`);
  }

  const conversation = await findConversation(env.DB, id);
  const createdAt = new Date().toISOString();
  const userRow: MessageRow = { id: crypto.randomUUID(), conversation_id: id, role: "user", content, created_at: createdAt };
  const title = content.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, 40) || "新しい会話";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)").bind(userRow.id, id, userRow.role, content, createdAt),
    env.DB.prepare("UPDATE conversations SET title = CASE WHEN title = '新しい会話' THEN ? ELSE title END, updated_at = ? WHERE id = ?").bind(title, createdAt, id),
  ]);

  const history = await env.DB.prepare(
    "SELECT id, conversation_id, role, content, created_at FROM (SELECT rowid AS sequence, id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at ASC, sequence ASC",
  ).bind(id, MAX_CONTEXT_MESSAGES).all<MessageRow>();
  const messages = [{ role: "system" as const, content: conversation.system_prompt }, ...history.results.map((message) => ({ role: message.role, content: message.content }))];

  let answer: string | null;
  try {
    const result = await env.AI.run(conversation.ai_model as keyof AiModels, { messages });
    answer = extractAiResponse(result);
  } catch (error: unknown) {
    // 本文や認証情報は記録せず、障害調査に必要な一般情報だけを残す。
    console.error("Workers AI の呼び出しに失敗しました。", error);
    throw new HttpError(502, "ai_unavailable", "AI の応答を生成できませんでした。新しい会話で別のモデルをお試しください。");
  }
  if (answer === null) {
    throw new HttpError(502, "invalid_ai_response", "AI から有効な応答を受け取れませんでした。");
  }

  const assistantAt = new Date().toISOString();
  const assistantRow: MessageRow = { id: crypto.randomUUID(), conversation_id: id, role: "assistant", content: answer, created_at: assistantAt };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)").bind(assistantRow.id, id, assistantRow.role, answer, assistantAt),
    env.DB.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(assistantAt, id),
  ]);
  return jsonResponse({ userMessage: serializeMessage(userRow), assistantMessage: serializeMessage(assistantRow) }, { status: 201 });
}
