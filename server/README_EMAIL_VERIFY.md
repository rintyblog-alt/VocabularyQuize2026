# VocabuQuiz — 新規登録 メールアドレス確認（Gmail 所有確認）+ 同意フロー

新規登録の 2 段階目として **Gmail の所有確認（メールアドレス確認）** を行い、確認後に
**利用規約・プライバシーポリシーへの同意**を経て、はじめて正式アカウントを作成・有効化します。

- UI 名称は「メールアドレス確認」「メール確認コード」「6桁の確認コード」（2要素認証／ログイン時2段階認証とは表示しない）。
- **新規登録のみ**に適用。既存ユーザーのログイン・アカウントは一切変更しません。

---

## 登録フロー

```
[アカウント情報入力]                 client: 新Auth オーバーレイ signup 画面
  Gmail / ログインID / 学年 / パスワード / パスワード確認 / Turnstile
        │  POST /api/auth/register/start
        ▼
[Gmailへ6桁コード送信]  status=PENDING_EMAIL_VERIFICATION（正式ユーザーはまだ作らない）
        │  POST /api/auth/register/verify（コード照合・失敗5回/期限10分/再送30秒×3）
        ▼
[メール確認完了]        status=EMAIL_VERIFIED_PENDING_CONSENT ＋ 署名付き登録セッション発行
        │  POST /api/auth/register/consent（規約/プライバシー両方に同意）
        ▼
[正式アカウント作成・ACTIVE化]  users へ INSERT（email/email_canonical/consented_at/terms/privacy_version）
        │  token 返却 → client が保存してリロード（自動ログイン）
        ▼
[ホーム / 既存の登録完了画面]
```

不変条件：**コード確認完了前も、規約同意完了前も、正式アカウントを ACTIVE にしない。**

---

## 追加/変更ファイル

| ファイル | 内容 |
|---|---|
| `server/src/worker.js` | 登録ブロック（Gmail正規化・OTP・HMAC・Turnstile・Resend・登録セッション署名 + 6ハンドラ）、`ensureDbSchema` へ `registration_challenges` テーブル / `users` 列 / 索引、ルータへ 6 ルート |
| `server/migrations/0006_email_verify.sql` | 正式マイグレーション（テーブル・列・部分ユニーク索引）※通常は Worker 起動時に自動適用 |
| `server/wrangler.toml` | 公開 vars（TURNSTILE_SITE_KEY / EMAIL_FROM_* / TERMS/PRIVACY_VERSION / OTP_*）を追記 |
| `server/.dev.vars.example` | ローカル用シークレット雛形（変数名のみ） |
| `client/index.html` | 新Auth オーバーレイ（`<script id="vq-newauth">`）の signup を Gmail 3 段フローへ改修 |
| `config.public.js` | `turnstile.siteKey`（公開）追加 |

> 認証ロジックの土台（`pbkdf2Hash` / `createSessionToken` / `authRate*` / `users` の PBKDF2）は既存を再利用。パスワードは平文保存しません。

---

## 追加 API

| メソッド / パス | 役割 |
|---|---|
| `POST /api/auth/register/start` | 入力検証・Gmail正規化・重複確認・Turnstile検証・パスワードhash・challenge作成・6桁コード生成・**Resend送信**・maskedEmail/expiresIn/resendsRemaining 返却 |
| `POST /api/auth/register/resend` | 30秒経過・再送上限(3)確認 → 旧コード無効化・新コード生成・期限更新・送信 |
| `POST /api/auth/register/verify` | 期限/失敗回数(5)確認 → digest 照合（定数時間）→ 成功で `EMAIL_VERIFIED_PENDING_CONSENT` ＋ 登録セッション発行 |
| `POST /api/auth/register/consent` | 登録セッション検証・両同意確認 → 正式 users 作成・ACTIVE化・terms/privacy_version/consented_at 記録・token 返却（自動ログイン） |
| `GET  /api/auth/register/status` | challenge の現在状態・残り時間・再送/入力残回数（リロード復帰用） |
| `POST /api/auth/register/cancel` | 登録途中データを CANCELLED 化 |

---

## 環境変数

### 公開（`wrangler.toml [vars]` / `config.public.js`）
| 変数 | 既定 | 用途 |
|---|---|---|
| `TURNSTILE_SITE_KEY` | "" | Turnstile 公開サイトキー（クライアントは `config.public.js` の `turnstile.siteKey` を参照）|
| `EMAIL_FROM_NAME` | VocabuQuiz | 送信者名 |
| `EMAIL_FROM_ADDRESS` | verify@mail.vocabuquiz.app | 送信元アドレス |
| `APP_BASE_URL` | https://vocabuquiz.app | 参照用 |
| `TERMS_VERSION` / `PRIVACY_VERSION` | 2026-08-10 | 同意記録に保存 |
| `OTP_EXPIRES_SECONDS` | 600 | コード有効期限 |
| `OTP_RESEND_COOLDOWN_SECONDS` | 30 | 再送クールダウン |
| `OTP_MAX_RESENDS` | 3 | 再送上限 |
| `OTP_MAX_FAILED_ATTEMPTS` | 5 | 誤入力上限 |

### シークレット（`wrangler secret put` / ローカルは `.dev.vars`）
| 変数 | 用途 | 未設定時の挙動（安全側）|
|---|---|---|
| `RESEND_API_KEY` | 確認メール送信 | メール送信不可（"送信しました"を偽装せず 503）|
| `TURNSTILE_SECRET_KEY` | Turnstile サーバ検証 | 検証スキップ（dev）。設定後に強制 |
| `OTP_PEPPER` | コード digest の HMAC 鍵 | （必須。十分長いランダム）|
| `REGISTRATION_SESSION_SECRET` | 登録セッション署名鍵 | （必須。十分長いランダム）|
| `REG_DEV_ECHO_CODE`（任意・**dev限定**）| =1 かつ RESEND 未設定時、コードを応答に返す | 本番では絶対に設定しない |

**本番シークレット登録（値は表示・コミットしない）:**
```bash
cd server
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put OTP_PEPPER
npx wrangler secret put REGISTRATION_SESSION_SECRET
```

---

## Resend 設定
1. Resend でドメイン `mail.vocabuquiz.app`（または任意）を追加し、DNS(SPF/DKIM)を検証。
2. `EMAIL_FROM_ADDRESS` を検証済みドメインのアドレスに合わせる。
3. API キーを `npx wrangler secret put RESEND_API_KEY` で登録。
4. 送信は Worker サーバ側のみ（フロントからは呼ばない）。idempotency key（`{challengeId}:{通番}`）で重複送信を抑止。

## Turnstile 設定
1. Cloudflare Turnstile でサイトを作成 → **サイトキー**（公開）と**シークレットキー**を取得。
2. サイトキーを `config.public.js` の `turnstile.siteKey` に設定（＋任意で `wrangler.toml` の `TURNSTILE_SITE_KEY`）。
3. シークレットを `npx wrangler secret put TURNSTILE_SECRET_KEY`。
4. サイトキー未設定ならウィジェットを表示せず登録は動作（外部依存なしで UI 表示可）。シークレット設定後はサーバ側で強制検証。

---

## D1 マイグレーション適用
- **通常**: `server` を deploy すると Worker 起動時の `ensureDbSchema()` が冪等に自動適用（本番の既存 users も非破壊）。
- **手動 / 新規DB**: `migrations/0006_email_verify.sql` を参照。
  ```bash
  # ローカル(local D1)
  npx wrangler d1 execute vocabuquiz_auth --local --file=./migrations/0006_email_verify.sql
  # リモート（既存本番は Worker 自動適用済みのため ALTER は "duplicate column" になり得る＝適用済みの証）
  ```
- 既存 users は `email/email_canonical=''`, `email_verified_at/consented_at=0` のまま。`email_canonical` の重複防止は空値を除外する**部分ユニーク索引**。

---

## ローカル起動 & テスト
```bash
cd server
cp .dev.vars.example .dev.vars     # OTP_PEPPER / REGISTRATION_SESSION_SECRET を記入、
                                    # RESEND_API_KEY は空のまま、末尾に REG_DEV_ECHO_CODE=1 を追加（dev echo）
npx wrangler dev --local           # ※ 本番D1に触れないため必ず --local。wrangler.toml の d1 は remote=true なので
                                    #   ローカル検証は別途 --local / preview DB を使うこと（本番 D1 に ensure が走らないよう注意）
```
ローカル e2e（REG_DEV_ECHO_CODE=1 のとき /start と /resend の応答に `devCode` が入る）:
```bash
# 例
curl -s localhost:8787/api/auth/register/start -H 'content-type: application/json' \
  -d '{"email":"test.user@gmail.com","gradePrefix":"H1","nickname":"test_user","password":"Abcd1234","password2":"Abcd1234"}'
# → { ok:true, challengeId, devCode, ... }
curl -s localhost:8787/api/auth/register/verify -d '{"challengeId":"...","code":"<devCode>"}' -H 'content-type: application/json'
curl -s localhost:8787/api/auth/register/consent -d '{"registrationSession":"...","agreeTerms":true,"agreePrivacy":true}' -H 'content-type: application/json'
```

## 本番デプロイ
```bash
cd server
npx wrangler deploy      # メモリ規約に従い server/ から wrangler deploy（netlify 不使用）
```

## ロールバック
- Worker: 直前バージョンへ `npx wrangler rollback`（または `server/backup_before_email_verify/worker.js.bak` へ差し戻して再 deploy）。
- 新ルートを止めるだけなら、client の新規登録導線を旧 `_authV2*` に戻す（overlay フラグで legacy）。
- DB: `registration_challenges` は登録途中データのみ → `DROP TABLE registration_challenges;` で除去可（正式 users に影響なし）。users 追加列は「使わない」運用で無害化（D1 の DROP COLUMN 制約）。

---

## エラーコード（主なもの）
| code | 意味 / 表示 |
|---|---|
| `EMAIL_REQUIRED` / `EMAIL_FORMAT` / `EMAIL_NOT_GMAIL` | Gmail 未入力/形式不正/@gmail.com 以外 |
| `EMAIL_TAKEN` / `EMAIL_PENDING` | 登録済み Gmail / 進行中の登録あり |
| `LOGIN_ID_TAKEN` / `BAD_NICKNAME` | ログインID 重複 / 形式不正 |
| `BAD_PASSWORD` / `PASSWORD_MISMATCH` | パスワード不正 / 確認不一致 |
| `TURNSTILE_FAILED` | Bot 対策検証失敗 |
| `EMAIL_NOT_CONFIGURED`(503) / `EMAIL_SEND_FAILED`(502) | メール未設定 / 送信失敗（"送信しました"は出さない）|
| `CODE_INCORRECT` / `CODE_EXPIRED` / `BAD_CODE` | コード誤り / 期限切れ / 桁数不足 |
| `VERIFY_LIMIT`(RESTART_REQUIRED) | 誤入力5回上限 → 最初からやり直し |
| `RESEND_TOO_SOON` / `RESEND_LIMIT`(RESTART_REQUIRED) | 30秒未満 / 再送3回上限 |
| `CHALLENGE_NOT_FOUND` / `CHALLENGE_INVALID` | チャレンジ不明 / 無効 |
| `SESSION_INVALID` | 登録セッション無効/期限切れ（改ざん含む）|
| `CONSENT_REQUIRED` | 規約/プライバシー同意不足 |
| `RATE_LIMITED`(429) | 試行過多（IP / email 単位）|

セキュリティ上、アカウント存在の有無を過度に露出しない一般化した文言を使用。

---

## セキュリティ対策（実装済み）
- 確認コードは平文保存せず **HMAC-SHA256(OTP_PEPPER, challengeId:code)** の digest。照合は定数時間比較。
- コードは **crypto.getRandomValues**（reject sampling で modulo バイアス回避）。`Math.random` 不使用。
- 有効期限10分・再送30秒/最大3回・誤入力5回はすべて**サーバ側**で判定（クライアント表示は補助）。
- 再送で旧コードを即無効化。Resend idempotency key。
- パスワードは既存 **PBKDF2/iter=100000**。
- 登録セッションは **REGISTRATION_SESSION_SECRET 署名**の短命トークン（body 返却→サーバ検証）。クライアントで `emailVerified=true` と書くだけでは突破不可。
- Turnstile はサーバ側検証。表示成功のみは信用しない。
- レート制限は既存 `auth_rate_limits`（IP + email 単位）。

---

## 既存ユーザーへの影響
- **なし**。Gmail 確認は新規登録のみに適用。既存ユーザーは従来どおりログイン可能。
- `users` 追加列は NULL 相当（空/0）で既存行を壊さない。email を強制設定しない。

## 将来: 既存ユーザーの Gmail 追加（未実装・拡張余地）
- 設定画面から Gmail 追加 → 同じ `/register/verify` 相当の 6 桁確認で `users.email/email_canonical/email_verified_at` を更新。
- パスワード再設定・端末同期保護・重要通知に利用。今回は構造（列・関数）のみ用意。
