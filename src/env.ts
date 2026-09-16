/**
 * Worker に設定する Cloudflare バインディングと Secret の型定義。
 *
 * 実際の値は Wrangler の設定または Secret から注入し、ソースコードには
 * 環境固有値を保存しない。
 */

/** Worker が利用する実行環境のバインディングを表す。 */
export interface Env {
  /** AI チャットの会話と発言を保存する D1 データベース。 */
  DB: D1Database;
  /** 応答生成に使用する Workers AI バインディング。 */
  AI: Ai;
  /** API 以外のリクエストを処理する静的アセットバインディング。 */
  ASSETS: Fetcher;
  /** Basic 認証に使用するユーザー名。 */
  BASIC_AUTH_USER: string;
  /** Basic 認証に使用するパスワード。 */
  BASIC_AUTH_PASSWORD: string;
}
