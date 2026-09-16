/**
 * 会話履歴 API とチャット API をローカル D1、差し替えた AI で確認する統合テスト。
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import migration from "../migrations/0001_initial.sql?raw";
import { AI_MODELS, createConversation, createMessage, deleteConversation, getConversation, listConversations, MAX_MESSAGE_LENGTH } from "../src/chat";
import type { Env } from "../src/env";

/** Wrangler 設定から注入されたテスト用 D1 バインディング。 */
const testDb = (env as unknown as Env).DB;

/** JSON の状態変更リクエストを同一オリジンで作る。 */
function jsonRequest(path: string, method: string, body: unknown): Request {
  return new Request(`https://example.com${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "https://example.com" },
    body: JSON.stringify(body),
  });
}

/** ローカル D1 と任意の AI モックを持つ環境を作る。 */
function testEnv(run?: ReturnType<typeof vi.fn>): Env {
  return {
    DB: testDb,
    AI: { run: run ?? vi.fn(async () => ({ response: "AI の回答" })) } as unknown as Ai,
  } as Env;
}

/** 会話を作り、作成された会話を返す。 */
async function seedConversation(environment: Env, systemPrompt = "簡潔に回答してください。") {
  const response = await createConversation(jsonRequest("/api/conversations", "POST", {
    model: AI_MODELS[1].id,
    systemPrompt,
  }), environment);
  return (await response.json() as { conversation: { id: string; aiModel: string; systemPrompt: string } }).conversation;
}

beforeEach(async () => {
  await testDb.exec("DROP TABLE IF EXISTS messages; DROP TABLE IF EXISTS conversations;");
  // マイグレーションをコメント除去後に文単位で実行し、本番と同じスキーマを作る。
  const statements = migration.replace(/^--.*$/gm, "").split(";").map((sql) => sql.trim()).filter(Boolean);
  await testDb.batch(statements.map((sql) => testDb.prepare(sql)));
});

describe("会話履歴 API", () => {
  it("許可モデルと既定プロンプトで会話を作り、詳細と一覧へ保存設定を返す", async () => {
    const environment = testEnv();
    const response = await createConversation(jsonRequest("/api/conversations", "POST", {
      model: AI_MODELS[0].id,
      systemPrompt: "   ",
    }), environment);
    const created = await response.json() as { conversation: { id: string; aiModel: string; systemPrompt: string } };

    expect(response.status).toBe(201);
    expect(created.conversation.aiModel).toBe(AI_MODELS[0].id);
    expect(created.conversation.systemPrompt.length).toBeGreaterThan(0);
    const detail = await getConversation(environment, created.conversation.id);
    await expect(detail.json()).resolves.toMatchObject({ conversation: { aiModel: AI_MODELS[0].id }, messages: [] });
    const list = await listConversations(environment);
    await expect(list.json()).resolves.toMatchObject({ conversations: [{ id: created.conversation.id }] });
  });

  it("許可されないモデルと長すぎるプロンプトを拒否する", async () => {
    const environment = testEnv();
    await expect(createConversation(jsonRequest("/api/conversations", "POST", { model: "任意モデル", systemPrompt: "test" }), environment)).rejects.toMatchObject({ status: 400, code: "invalid_model" });
    await expect(createConversation(jsonRequest("/api/conversations", "POST", { model: AI_MODELS[0].id, systemPrompt: "あ".repeat(2_001) }), environment)).rejects.toMatchObject({ status: 400, code: "system_prompt_too_long" });
  });

  it("会話と関連メッセージを削除する", async () => {
    const environment = testEnv();
    const conversation = await seedConversation(environment);
    await testDb.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', '本文', ?)").bind(crypto.randomUUID(), conversation.id, new Date().toISOString()).run();

    const response = await deleteConversation(new Request(`https://example.com/api/conversations/${conversation.id}`, { method: "DELETE", headers: { Origin: "https://example.com" } }), environment, conversation.id);
    expect(response.status).toBe(204);
    expect(await testDb.prepare("SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?").bind(conversation.id).first<number>("count")).toBe(0);
    await expect(getConversation(environment, conversation.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("チャット API", () => {
  it("保存したモデル、システムプロンプト、時系列の文脈で AI を呼び回答を保存する", async () => {
    const run = vi.fn(async () => ({ response: " 保存された回答 " }));
    const environment = testEnv(run);
    const conversation = await seedConversation(environment, "保存済み指示");

    const response = await createMessage(jsonRequest(`/api/conversations/${conversation.id}/messages`, "POST", { content: "こんにちは" }), environment, conversation.id);
    expect(response.status).toBe(201);
    expect(run).toHaveBeenCalledWith(AI_MODELS[1].id, {
      messages: [{ role: "system", content: "保存済み指示" }, { role: "user", content: "こんにちは" }],
    });
    const detail = await getConversation(environment, conversation.id);
    const data = await detail.json() as { conversation: { title: string }; messages: Array<{ role: string; content: string }> };
    expect(data.conversation.title).toBe("こんにちは");
    expect(data.messages).toEqual([
      expect.objectContaining({ role: "user", content: "こんにちは" }),
      expect.objectContaining({ role: "assistant", content: "保存された回答" }),
    ]);
  });

  it("AI 失敗時も利用者メッセージを残し、入力上限と空応答を拒否する", async () => {
    const failedEnvironment = testEnv(vi.fn(async () => { throw new Error("外部詳細"); }));
    const conversation = await seedConversation(failedEnvironment);
    await expect(createMessage(jsonRequest("/api/test", "POST", { content: "残す本文" }), failedEnvironment, conversation.id)).rejects.toMatchObject({ status: 502, code: "ai_unavailable" });
    expect(await testDb.prepare("SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND role = 'user'").bind(conversation.id).first<number>("count")).toBe(1);

    await expect(createMessage(jsonRequest("/api/test", "POST", { content: "あ".repeat(MAX_MESSAGE_LENGTH + 1) }), failedEnvironment, conversation.id)).rejects.toMatchObject({ status: 400, code: "message_too_long" });
    const emptyEnvironment = testEnv(vi.fn(async () => ({ response: "  " })));
    await expect(createMessage(jsonRequest("/api/test", "POST", { content: "空応答確認" }), emptyEnvironment, conversation.id)).rejects.toMatchObject({ status: 502, code: "invalid_ai_response" });
  });
});
