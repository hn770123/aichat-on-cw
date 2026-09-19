# GitHub Codespaces から Cloudflare へデプロイする手順

## この手順の前提

この文書では、手元の PC にインストールした Visual Studio Code（以下 VS Code）から GitHub Codespaces へリモート接続し、**Codespace 内のターミナル**で Cloudflare Workers へデプロイします。手元の PC へリポジトリを clone して実行する手順ではありません。

あらかじめ次を用意してください。

- このリポジトリを参照でき、Codespaces を作成できる GitHub アカウント
- Workers、Workers AI、D1 を利用できる Cloudflare アカウント
- 手元の PC の VS Code と [GitHub Codespaces 拡張機能](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces)
- Cloudflare 側で対象アカウントへリソースを作成できる権限

> **重要:** VS Code の左下に `Codespaces: ...` と表示されていることを確認してください。以降のコマンドは、VS Code のローカルターミナルではなく Codespace のターミナルで実行します。

## 1. Codespace を作成して VS Code から接続する

1. VS Code に GitHub Codespaces 拡張機能をインストールします。
2. VS Code のアクティビティバーで **リモート エクスプローラー**を開き、上部の選択欄を **GitHub Codespaces** にします。
3. GitHub へのサインインを求められた場合は、デプロイ対象リポジトリへアクセスできるアカウントで認証します。
4. **Create New Codespace** からこのリポジトリとデプロイ対象ブランチを選び、Codespace を作成します。すでにある場合は、その Codespace の **Connect in Visual Studio Code** を選びます。
5. 接続後、VS Code で新しいターミナルを開き、作業場所とブランチを確認します。

   ```sh
   pwd
   git branch --show-current
   git status --short
   ```

未コミットの変更が表示された場合は、意図した変更であることを確認してから先へ進んでください。GitHub の公式接続手順は [Using GitHub Codespaces in Visual Studio Code](https://docs.github.com/en/codespaces/developing-in-a-codespace/using-github-codespaces-in-visual-studio-code) を参照してください。

## 2. 依存関係を準備して品質確認を行う

Node.js のバージョンを確認し、ロックファイルどおりに依存関係をインストールします。

```sh
node --version
npm --version
npm ci
```

Node.js は `20.19.0` 以上が必要です。続いて、デプロイ前の品質確認を行います。

```sh
npm run typecheck
npm run lint
npm test
```

失敗した状態ではデプロイせず、原因を修正して同じコマンドを再実行してください。

## 3. Codespace から Cloudflare にログインする

Codespaces のようなリモート環境では、ブラウザーから Codespace 内の一時的な `localhost` コールバックへ到達できない場合があります。そのため、Cloudflare がリモート環境向けに案内しているデバイス認証を使用します。

```sh
npx wrangler login --device
```

1. ターミナルに表示された Cloudflare の確認 URL を手元のブラウザーで開きます。自動的に開かない場合は URL をコピーしてください。
2. 必要に応じて Cloudflare にサインインします。
3. 画面とターミナルのコードが一致することを確認し、Wrangler からのアクセスを許可します。
4. ターミナルに `Successfully logged in.` と表示されるまで待ちます。コードの有効期限が切れた場合は、コマンドを再実行します。

ブラウザーを自動的に開かず、URL とコードだけを表示する場合は次を使用できます。

```sh
npx wrangler login --device --browser=false
```

ログイン後、対象ユーザーとアクセス可能な Cloudflare アカウントを必ず確認します。

```sh
npx wrangler whoami
```

複数アカウントが表示される場合は、これから D1 と Worker を作成するアカウントが正しいことを確認してください。誤ったユーザーの場合は `npx wrangler logout` の後にログインし直します。詳細は [Wrangler の login コマンド](https://developers.cloudflare.com/workers/wrangler/commands/general/#login) を参照してください。

## 4. 初回だけ本番 D1 を作成する

すでに本番用の `aichat-on-cw` データベースがあり、その `database_id` が分かっている場合、この作成コマンドは実行せず次の節へ進みます。重複した本番データベースを作らないでください。

```sh
npx wrangler d1 create aichat-on-cw
```

出力された `database_id` と対象アカウントを安全な運用記録へ保存します。リポジトリの `wrangler.jsonc` にあるゼロ埋め ID はプレースホルダーです。実 ID を Git へ誤ってコミットしないよう、無視対象のデプロイ専用設定を作ります。

```sh
cp wrangler.jsonc wrangler.deploy.jsonc
```

VS Code で `wrangler.deploy.jsonc` を開き、次の `database_id` **だけ**を作成済み D1 の実 IDへ置き換えます。

```jsonc
"database_id": "00000000-0000-0000-0000-000000000000"
```

設定ファイルが Git の追跡対象外であることと、差分へ実 ID が混入していないことを確認します。

```sh
git status --short --ignored
git diff --check
```

`wrangler.deploy.jsonc` が `!!`（ignored）で表示されれば想定どおりです。D1 の公式手順は [D1 Getting started](https://developers.cloudflare.com/d1/get-started/) を参照してください。

## 5. 本番用 Basic 認証 Secret を登録する

デプロイ専用設定を明示し、ユーザー名とパスワードを 1 件ずつ登録します。

```sh
npx wrangler secret put BASIC_AUTH_USER --config wrangler.deploy.jsonc
npx wrangler secret put BASIC_AUTH_PASSWORD --config wrangler.deploy.jsonc
```

各値はプロンプトへ対話入力します。コマンドライン引数、ファイル、シェル履歴、チャット、画面共有へ値を貼り付けないでください。パスワードには十分に長く推測困難な、このアプリ専用の値を使用します。

Secret の登録・更新は Worker の新しいバージョンを作成して直ちにデプロイする操作です。既存環境で値を変更する場合は影響時間を選んで実施してください。取り扱いの詳細は [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) を参照してください。

## 6. 本番 D1 にマイグレーションを適用する

まず未適用のマイグレーションと対象を確認します。

```sh
npx wrangler d1 migrations list DB --remote --config wrangler.deploy.jsonc
```

対象のアカウント、データベース名、ID が本番用であることを確認してから適用します。

```sh
npm run db:migrate:remote -- --config wrangler.deploy.jsonc
```

確認を求められた場合も、表示された対象が正しい場合だけ続行してください。適用済みの SQL ファイルは書き換えず、スキーマ変更時は新しいマイグレーションを追加します。詳細は [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) を参照してください。

## 7. Worker をデプロイする

作業ツリーと直前のテスト結果をもう一度確認します。

```sh
git status --short
npm run typecheck
npm run lint
npm test
```

問題がなければ本番設定を明示してデプロイします。

```sh
npm run deploy -- --config wrangler.deploy.jsonc
```

出力された `https://...workers.dev` の URL と Version ID を運用記録へ残します。意図しないアカウントや Worker 名が表示された場合は、そこで作業を止めて設定と `npx wrangler whoami` を見直してください。

## 8. デプロイ後に確認する

手元のブラウザーから出力された HTTPS URL を開き、少なくとも次をスモークテストします。

- Basic 認証情報なし、または誤った情報では拒否される
- 登録した Basic 認証情報でログインできる
- 新しい会話を作成し、Workers AI から応答を受け取れる
- ページを再読み込みしても D1 から履歴を再表示できる
- 会話を削除できる
- ブラウザーの開発者ツールに予期しないエラーがない

必要に応じて、確認中だけリアルタイムログを表示します。終了は `Ctrl+C` です。

```sh
npx wrangler tail --config wrangler.deploy.jsonc
```

ログに Basic 認証情報やメッセージ本文が出ていないことを確認します。また、Cloudflare ダッシュボードで Worker の最新デプロイ、エラー、Workers AI と D1 の使用量を確認してください。

## 9. 作業を終了する

デプロイ専用設定には D1 ID が含まれるため、不要になったら Codespace から削除します。削除前に `git status` で、必要なソース変更がコミットまたは push 済みであることを確認してください。

```sh
rm -f wrangler.deploy.jsonc
npx wrangler logout
git status --short
```

共有 Codespace では必ずログアウトしてください。個人専用 Codespace でも、Cloudflare の認証情報は Codespace のホームディレクトリに残り得るため、作業完了後のログアウトを推奨します。最後に VS Code 左下のリモート接続メニューから Codespace を停止するか、GitHub の Codespaces 管理画面から停止します。今後使用しない Codespace は、必要な変更が GitHub に反映済みであることを確認してから削除してください。

## 10. 2 回目以降のデプロイ

D1 の再作成と既存 Secret の再登録は不要です。次の順序で実施します。

1. VS Code から Codespace へ接続し、対象ブランチと差分を確認する。
2. `npm ci` と全品質確認を実行する。
3. `npx wrangler login --device` と `npx wrangler whoami` で Cloudflare アカウントを確認する。
4. `wrangler.deploy.jsonc` を作り、既存 D1 の ID を設定する。
5. 新しいマイグレーションがある場合だけ、対象を確認して本番 D1 へ適用する。
6. `npm run deploy -- --config wrangler.deploy.jsonc` を実行する。
7. スモークテスト、ログ、使用量を確認する。
8. デプロイ専用設定を削除し、Cloudflare からログアウトして Codespace を停止する。

Secret を更新する場合だけ、該当する `wrangler secret put` を再実行してください。

## トラブルシューティング

### Cloudflare の認証後もログインが完了しない

`npx wrangler login` ではなく `npx wrangler login --device --browser=false` を使い、表示された URL を手動で開きます。期限切れの場合は再実行します。`--device` と `--callback-host` / `--callback-port` は併用できません。

### D1 ID またはアカウントが違う

そのままマイグレーションやデプロイを続けないでください。`npx wrangler whoami`、D1 作成時の出力、`wrangler.deploy.jsonc` を照合します。必要なら Cloudflare ダッシュボードで対象 D1 を確認します。

### `database_id` がゼロ埋めだと表示される

コマンドに `--config wrangler.deploy.jsonc` を付け忘れていないか、同ファイルの `database_id` を実 IDへ置き換えたか確認します。

### Node.js のバージョンが古い

Codespace のイメージを更新するか、Node.js バージョン管理ツールで `20.19.0` 以上へ切り替え、`node --version` の確認後に `npm ci` をやり直します。
