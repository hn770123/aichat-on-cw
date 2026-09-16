/**
 * AI チャット Worker のエントリーポイント。
 *
 * この段階ではプロジェクト初期化を検証できる最小応答だけを提供し、認証、
 * ルーティング、各バインディングを使う処理は後続の実装手順で追加する。
 */

/**
 * 初期化済み Worker が起動できることを確認するため、仮の応答を返す。
 *
 * @returns 後続実装前であることを示す HTTP 501 応答。
 */
function createNotImplementedResponse(): Response {
  return new Response("Not implemented", {
    status: 501,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export default {
  /**
   * すべてのリクエストを受け取る暫定 fetch ハンドラー。
   *
   * @returns 初期化段階の固定応答。
   */
  fetch(): Response {
    return createNotImplementedResponse();
  },
} satisfies ExportedHandler;
