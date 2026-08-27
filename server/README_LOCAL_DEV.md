# ローカルで新バージョンを自由にテストする（本番 www.vocabuquiz.app は 8/10 まで凍結）

新バージョン（Gmail確認つき新規登録・新Authなど）を **ローカルだけで丸ごと動かして自由にテスト**するための仕組み。
**本番 www.vocabuquiz.app には一切触れません。**

---

## 🔒 大前提：サイトが更新される操作は1つだけ

`www.vocabuquiz.app` の中身が変わるのは **`wrangler deploy`（本番Workerへ反映）を実行したときだけ**。
自動デプロイ経路はゼロ（`wrangler.toml` に routes なし／CI なし／git 管理外）。

> **➡ 8月10日の公開まで `wrangler deploy` を実行しない。これだけで本番は今のまま凍結される。**
> ローカル作業（`wrangler dev` / 下記スクリプト）は本番に触れないので、いくらやってもOK。

---

## ▶ 起動のしかた

```bash
cd server

# echo モード（おすすめ・メール送信なし。コードは端末に出る）
./dev-local.sh echo
#   → ブラウザで  http://127.0.0.1:8791/?vqdev=1  を開く
#   → 登録すると端末ログに  [reg][DEV] ... code=NNNNNN  が出る。それを入力。
#   → Bot対策(Turnstile)も ?vqdev=1 で省略されるので最速で回せる。

# real モード（本番同等：本物のTurnstile＋本物のメール送信）
./dev-local.sh
#   → ブラウザで  http://127.0.0.1:8791/  を開く
#   → Turnstile ウィジェットが出る（localhostでも動く）
#   → 確認コードは 実際の Gmail 受信箱 に届く（送信元 verify@mail.vocabuquiz.app）

# ポート変更
./dev-local.sh echo 9000
```

停止は **Ctrl-C**。

| | echo モード | real モード |
|---|---|---|
| メール送信 | しない（コードは端末表示） | する（実際のGmailに届く） |
| Turnstile | 省略（`?vqdev=1`） | 本物（1クリック） |
| 使うシークレット | ローカル生成のみ | `server/.dev.vars` の実キー |
| 向いてる用途 | 何度も高速に回す | 本番そっくりの最終確認 |

---

## 何が起きているか（安全性）

- **D1 は miniflare のローカルSQLite**。本番D1（`remote=true`）には接続しない。データは `server/.local-run/<mode>/.wrangler/` に隔離保存。
- 設定は `server/wrangler.local.toml`（本番 `wrangler.toml` とは別物）。`assets` を SPA配信にして `/` でアプリが開けるようにし、cron と `[ai]` は無効化。
- real の実シークレットは `server/.dev.vars`（gitignore済）。echo はローカル生成の使い捨て値のみ（本番シークレット不使用）。
- クライアントの `?vqdev=1` は **localhost のときだけ** Turnstile ウィジェットを省略する開発フラグ。本番ドメインでは無視され、かつサーバは常に Turnstile を強制するため安全。

### データをリセットしたいとき
```bash
rm -rf server/.local-run/echo    # echo のローカルDBを初期化（real も同様）
```

### AI機能もローカルで試したいとき
`wrangler.local.toml` の `[ai]` を復活（コメント参照）＋ `wrangler login` 済みにする。認証フローの検証だけなら不要。

---

## 🚀 8月10日の公開手順（このときだけ本番に反映）

```bash
cd server
# 秘密値を本番Workerに登録（初回のみ・値は伏せてOK）
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put OTP_PEPPER                 # 例: openssl rand -base64 48
npx wrangler secret put REGISTRATION_SESSION_SECRET
# 本番デプロイ（コードもクライアントも全部・起動時にD1スキーマ自動適用）
npx wrangler deploy
```

ロールバックは `npx wrangler rollback`。

---

## 追加/変更ファイル
- `server/dev-local.sh` … ローカル起動ランチャー（real/echo）
- `server/wrangler.local.toml` … ローカル専用設定（D1ローカル・SPA配信・cron/ai無効）
- `server/.local-run/` … 実行時に生成（gitignore済・実シークレットのコピー/ローカルDBを含む）
- `client/index.html`（`scratchpad/newauth/runtime.js`→build）… `?vqdev=1` の localhost 限定 Turnstile スキップを追加
