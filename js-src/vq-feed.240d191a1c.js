
/* ══════════════════════════════════════════════════════════════════════
   vq-feed — Feed を「X の作り」＋「Studio の見た目」で置き換える

   画面の作り（導線）は X に合わせる:
     ・上部にタブ、その下に投稿欄（触ると開いて公開範囲が出る）
     ・タイムラインは 1 件ずつのカード。長文は「もっと見る」で畳む
     ・操作行は 返信 / リポスト / いいね / 保存 / 共有 を横に並べる
     ・投稿を押すと**詳細ページ**へ入る（戻る矢印＋見出し）
     ・詳細では本文が大きく、時刻の行があり、下に返信欄とスレッドが続く
     ・返信は縦線でつながって見える
     ・右カラムは 検索 / お知らせ / 保存

   見た目は Studio（UI Studio）から。色・角丸・余白・部品はすべて --vq-* トークン。
   X の配色（黒地に青）は持ち込まない。

   数字を作らない: 表示回数（Views）は API に無いので出さない。

   繋いでいる API（すべて実測済み）:
     GET  /api/posts/feed?scope=all|following&limit=
     POST /api/posts/create        {body}
     POST /api/posts/action        {postId, action:like|repost|bookmark, on}
     GET  /api/posts/replies?postId=
     POST /api/posts/replies       {postId, body}
   認証は localStorage["app.auth.token.v1"] の Bearer。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqFeedInstalled) return;
  window.__vqFeedInstalled = true;

  var TOKEN_KEY = "app.auth.token.v1";
  var LIMIT = 40;
  var FOLD_CHARS = 280;      /* これを超える本文は畳む */
  var FOLD_LINES = 8;

  function token() {
    try { return String(localStorage.getItem(TOKEN_KEY) || "").trim(); } catch (e) { return ""; }
  }
  function api(path, opts) {
    opts = opts || {};
    var h = { "Content-Type": "application/json" };
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    return fetch(path, {
      method: opts.method || "GET", headers: h,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin"
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ("HTTP " + r.status)); e.code = j.code; e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* ── 見た目（Studio の部品）───────────────────────────────── */
  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0;}",
    ":host{display:block;font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;",
      "color:var(--vq-text,#2B2836);}",
    "button{font:inherit;color:inherit;}",

    /* 2 カラム。X と同じく本文が主、右が補助。 */
    ".wrap{max-width:calc(1100px * var(--vq-width-scale,1));margin:0 auto;padding:0 20px 96px;",
      "display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px;align-items:start;}",
    "@media (max-width:1023px){.wrap{grid-template-columns:minmax(0,1fr);padding:0 0 96px;}.aside{display:none;}}",

    /* 中央のカラムは 1 本の帯。カードを浮かせず、境界線で区切る（X と同じ密度感）。 */
    ".col{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));overflow:hidden;}",
    "@media (max-width:1023px){.col{border-radius:0;border-left:0;border-right:0;}}",

    /* 上のタブ */
    ".tabs{display:flex;position:sticky;top:0;z-index:3;",
      "background:color-mix(in srgb,var(--vq-surface,#fff) 88%,transparent);",
      "backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".tab{flex:1;position:relative;border:0;background:transparent;cursor:pointer;padding:15px 8px;",
      "font-size:14px;font-weight:600;color:var(--vq-text-secondary,#6B6480);transition:background .14s ease;}",
    ".tab:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".tab[aria-selected=\"true\"]{color:var(--vq-text,#2B2836);font-weight:700;}",
    /* 下線は X と同じく短い棒 */
    ".tab[aria-selected=\"true\"]::after{content:\"\";position:absolute;left:50%;bottom:0;translate:-50% 0;",
      "width:56px;height:4px;border-radius:calc(4px * var(--vq-r-scale,1)) calc(4px * var(--vq-r-scale,1)) 0 0;background:var(--vq-accent,#8A81C2);}",

    /* 投稿欄 */
    ".comp{display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".comp-main{flex:1;min-width:0;}",
    ".comp textarea{width:100%;border:0;outline:0;resize:none;background:transparent;font:inherit;",
      "font-size:17px;line-height:1.6;color:var(--vq-text,#2B2836);min-height:30px;max-height:260px;padding:5px 0;}",
    ".comp textarea::placeholder{color:var(--vq-text-tertiary,#9994A8);}",
    /* 触るまでは 1 行だけ。触ると公開範囲と区切りが出る（X と同じ） */
    ".comp-aud{display:none;padding:2px 0 10px;}",
    ".comp.is-open .comp-aud{display:block;}",
    ".comp-aud b{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;",
      "color:var(--vq-accent-text,#5F5691);padding:4px 11px;border-radius:999px;white-space:nowrap;",
      "background:var(--vq-accent-subtle,#EAE8F7);}",
    /* アイコンに大きさを与えないと原寸で入り、文字が折り返して塊になる */
    ".comp-aud b svg{width:14px;height:14px;flex:0 0 auto;}",
    ".comp-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;",
      "padding-top:10px;margin-top:2px;}",
    ".comp.is-open .comp-foot{border-top:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".count{font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);font-variant-numeric:tabular-nums;}",
    ".count.is-over{color:var(--vq-danger-text,#B4564F);font-weight:700;}",

    /* ボタン（Studio Button） */
    ".btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;",
      "height:38px;padding:0 18px;border-radius:999px;border:1px solid transparent;white-space:nowrap;",
      "font-size:14px;font-weight:700;transition:background .15s ease,border-color .15s ease,opacity .15s ease;}",
    ".btn svg{width:16px;height:16px;flex:0 0 auto;}",
    ".btn--primary{background:var(--vq-accent,#8A81C2);color:var(--vq-accent-contrast,#fff);}",
    ".btn--primary:hover{background:var(--vq-accent-hover,#7C73B5);}",
    ".btn--primary:disabled{opacity:.45;cursor:default;}",
    ".btn--secondary{background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);",
      "border-color:var(--vq-border-subtle,#E7E4EF);}",
    ".btn--secondary:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".btn--sm{height:32px;padding:0 14px;font-size:13px;}",

    /* 投稿 1 件 */
    ".post{display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);",
      "cursor:pointer;transition:background .12s ease;}",
    ".post:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".post:last-child{border-bottom:0;}",
    ".post--flat{cursor:default;padding:16px;}",
    ".post--flat:hover{background:transparent;}",
    ".body{flex:1;min-width:0;}",
    ".ava{width:40px;height:40px;flex:none;border-radius:50%;overflow:hidden;display:grid;place-items:center;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);",
      "font-weight:700;font-size:14px;line-height:1;}",
    ".ava img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".ava--sm{width:32px;height:32px;font-size:12px;}",
    ".ava--lg{width:46px;height:46px;font-size:16px;}",
    ".who{display:flex;align-items:center;gap:5px;min-width:0;}",
    ".name{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%;}",
    ".at{font-size:14px;color:var(--vq-text-tertiary,#9994A8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".dot{color:var(--vq-text-tertiary,#9994A8);}",
    ".badge{flex:none;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:700;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);}",
    ".txt{margin-top:3px;font-size:15px;line-height:1.75;white-space:pre-wrap;word-break:break-word;}",
    /* 公式マークは 名前の 左。文字と 同じ行に そろえる。 */
    ".name .vqbadge,.pf-name h1 .vqbadge,.head h1 .vqbadge{margin-right:4px}",
    ".pf-name h1{display:flex;align-items:center;gap:2px}",
    ".txt--lg{font-size:17px;line-height:1.8;margin-top:10px;}",
    ".txt.is-fold{display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden;}",
    ".more{border:0;background:none;cursor:pointer;padding:2px 0;font-size:14.5px;font-weight:600;",
      "color:var(--vq-accent-text,#5F5691);}",
    ".more:hover{text-decoration:underline;}",
    ".title{margin-top:4px;font-size:15.5px;font-weight:700;line-height:1.6;}",
    /* 詳細の時刻行 */
    ".stamp{margin-top:14px;padding-bottom:12px;font-size:13.5px;color:var(--vq-text-tertiary,#9994A8);",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",

    /* 操作行。X と同じく横に広げる。 */
    ".acts{display:flex;align-items:center;justify-content:space-between;max-width:440px;margin-top:8px;}",
    ".acts--lg{max-width:none;padding:6px 0;border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".act{display:inline-flex;align-items:center;gap:7px;cursor:pointer;border:0;background:transparent;",
      "height:34px;padding:0 9px;border-radius:999px;font-size:13px;font-weight:600;",
      "color:var(--vq-text-tertiary,#9994A8);transition:background .14s ease,color .14s ease;}",
    ".act:hover{background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);}",
    ".act svg{width:18px;height:18px;flex:none;}",
    /* 押した状態は色だけでなく塗りつぶしでも示す */
    ".act[aria-pressed=\"true\"]{color:var(--vq-accent-text,#5F5691);}",
    ".act[aria-pressed=\"true\"] svg{fill:currentColor;}",
    /* 押したときに、そのボタンだけがぴょんと跳ねる。
       画面を作り直さないので、見ていた位置も画像もそのまま。 */
    ".act.is-pop svg{animation:vqfPop .34s cubic-bezier(.3,1.5,.5,1);}",
    "@keyframes vqfPop{0%{transform:scale(1)}35%{transform:scale(1.38)}60%{transform:scale(.92)}100%{transform:scale(1)}}",
    "@media (prefers-reduced-motion:reduce){.act.is-pop svg{animation:none;}}",
    ".act .n{font-variant-numeric:tabular-nums;}",
    ".act:disabled{opacity:.5;cursor:default;}",

    /* 詳細ページの見出し */
    ".head{display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:3;padding:10px 14px;",
      "background:color-mix(in srgb,var(--vq-surface,#fff) 88%,transparent);",
      "backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".head h1{font-size:17px;font-weight:700;}",
    ".back{width:36px;height:36px;flex:none;border:0;background:transparent;border-radius:50%;cursor:pointer;",
      "display:grid;place-items:center;color:var(--vq-text,#2B2836);}",
    ".back:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".back svg{width:20px;height:20px;}",

    /* 返信 */
    ".sortbar{padding:10px 16px;font-size:13.5px;font-weight:600;color:var(--vq-text-secondary,#6B6480);",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".rform{display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);",
      "align-items:flex-start;}",
    ".rform textarea{flex:1;min-width:0;border:0;outline:0;resize:none;background:transparent;font:inherit;",
      "font-size:15px;line-height:1.7;color:var(--vq-text,#2B2836);min-height:34px;max-height:180px;padding:6px 0;}",
    ".rform textarea::placeholder{color:var(--vq-text-tertiary,#9994A8);}",
    /* 返信どうしを縦線でつなぐ（X と同じ見え方） */
    ".rep{display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".rep-l{width:40px;flex:none;display:flex;flex-direction:column;align-items:center;}",
    ".rep-line{flex:1;width:2px;margin-top:6px;border-radius:2px;background:var(--vq-border-subtle,#E7E4EF);}",
    ".rep:last-child .rep-line{display:none;}",

    /* 状態 */
    ".empty{padding:52px 24px;text-align:center;}",
    ".empty h3{font-size:16px;font-weight:700;margin-bottom:7px;}",
    ".empty p{font-size:13.5px;color:var(--vq-text-secondary,#6B6480);line-height:1.85;}",
    ".empty .btn{margin-top:16px;}",
    ".err{margin:14px 16px;padding:13px 15px;border-radius:calc(12px * var(--vq-r-scale,1));font-size:13.5px;line-height:1.8;",
      "background:var(--vq-danger-bg,#FBEEEC);color:var(--vq-danger-text,#8E3B34);border:1px solid var(--vq-danger-bg,#F3D9D5);}",
    ".hint{padding:16px;font-size:13px;color:var(--vq-text-tertiary,#9994A8);line-height:1.8;}",
    ".sk{height:104px;border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);",
      "background:linear-gradient(90deg,var(--vq-surface-sunken,#F4F2FB) 25%,var(--vq-border-subtle,#EAE7F6) 37%,var(--vq-surface-sunken,#F4F2FB) 63%);",
      "background-size:400% 100%;animation:vqfSk 1.3s ease infinite;}",
    "@keyframes vqfSk{0%{background-position:100% 50%}100%{background-position:0 50%}}",

    /* 右カラム */
    ".aside{display:flex;flex-direction:column;gap:14px;position:sticky;top:14px;padding-top:14px;}",
    ".acard{background:var(--vq-surface-sunken,#F4F2FB);border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));padding:16px 18px;}",
    ".acard h2{font-size:15px;font-weight:700;margin-bottom:12px;}",
    ".srch{display:flex;align-items:center;gap:9px;padding:10px 14px;border-radius:999px;",
      "background:var(--vq-surface-sunken,#F4F2FB);border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "cursor:pointer;color:var(--vq-text-tertiary,#9994A8);font-size:14px;}",
    ".srch:hover{border-color:var(--vq-accent,#8A81C2);}",
    ".srch svg{width:17px;height:17px;flex:none;}",
    ".nrow{display:block;width:100%;text-align:left;border:0;background:transparent;cursor:pointer;",
      "padding:10px 0;border-top:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".nrow:first-of-type{border-top:0;padding-top:0;}",
    ".nrow:hover .t{text-decoration:underline;}",
    ".nrow .k{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);}",
    ".nrow .t{display:block;font-size:13.5px;font-weight:700;line-height:1.6;margin-top:2px;}",

    /* 添付カード（プリセット / 試験 / 学習結果）。Studio の Card をそのまま。 */
    /* お知らせに 添える 絵。角を 丸めて 本文の 下に 敷く。 */
    ".news-art{margin-top:12px;border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));",
      "overflow:hidden;border:1px solid var(--vq-border-subtle,#ECEAF4);line-height:0;}",
    ".news-art svg{display:block;width:100%;height:auto;aspect-ratio:800/240;}",
    /* マークダウンの 本文は 折り返しを ふつうに（pre-wrap だと 段落が 崩れる）。 */
    ".txt.vqmd{white-space:normal;}",
    ".txt.vqmd > :first-child{margin-top:0;}",
    ".att{display:flex;align-items:center;gap:12px;margin-top:11px;padding:12px 14px;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));",
      "background:var(--vq-surface-sunken,#F4F2FB);text-align:left;width:100%;cursor:pointer;",
      "transition:border-color .14s ease;}",
    ".att:hover{border-color:var(--vq-accent,#8A81C2);}",
    ".att-ico{width:40px;height:40px;flex:none;border-radius:var(--vq-r-md,calc(10px * var(--vq-r-scale,1)));display:grid;place-items:center;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);}",
    ".att-ico svg{width:19px;height:19px;}",
    ".att-b{flex:1;min-width:0;}",
    /* span のままでは overflow も ellipsis も効かない（inline には適用されない）。
       block にして、はじめて縮む。 */
    ".att-k{display:block;font-size:11.5px;font-weight:700;letter-spacing:.03em;",
      "color:var(--vq-accent-text,#5F5691);}",
    ".att-t{display:block;font-size:14px;font-weight:700;line-height:1.5;margin-top:2px;",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".att-s{display:block;font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);margin-top:2px;",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;}",
    ".att-x{width:30px;height:30px;flex:none;border:0;background:transparent;border-radius:50%;cursor:pointer;",
      "display:grid;place-items:center;color:var(--vq-text-tertiary,#9994A8);font-size:17px;line-height:1;}",
    ".att-x:hover{background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);}",
    /* 添付を選ぶ列 */
    ".attbar{display:flex;gap:6px;align-items:center;}",
    ".attbtn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:999px;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);background:transparent;cursor:pointer;",
      "font-size:12.5px;font-weight:600;color:var(--vq-text-secondary,#6B6480);}",
    ".attbtn:hover{background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);",
      "border-color:var(--vq-accent,#8A81C2);}",
    ".attbtn svg{width:15px;height:15px;}",
    ".attbtn:disabled{opacity:.45;cursor:default;}",
    /* 選ぶシート */
    /* ══ かぶせる 窓の **出るとき**（2026-08-29・訴え「開くときにも 動きを」）══
       これまで 出るときは いきなり 現れて、閉じるときだけ すっと 消えていた。
       出入りの 向きを そろえる。幕は うすく、札は 少し 下から。
       動きを 減らす 設定の 人には 出さない。 */
    "@keyframes vqfBd{from{opacity:0}to{opacity:1}}",
    "@keyframes vqfCard{from{opacity:0;transform:translateY(12px) scale(.975)}",
      "to{opacity:1;transform:none}}",
    "@keyframes vqfMenu{from{opacity:0;transform:translateY(-6px) scale(.97)}",
      "to{opacity:1;transform:none}}",
    ".pick{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:20px;",
      "background:rgba(35,32,64,.34);animation:vqfBd .16s ease both;}",
    ".pick-c{width:min(460px,100%);max-height:72vh;display:flex;flex-direction:column;overflow:hidden;",
      "background:var(--vq-surface,#fff);border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));",
      "box-shadow:0 18px 48px rgba(35,32,64,.22);",
      "animation:vqfCard .22s cubic-bezier(.22,1,.36,1) both;}",
    ".pick-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px;",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);font-size:15px;font-weight:700;}",
    ".pick-l{overflow:auto;padding:6px;}",
    ".pick-i{display:flex;align-items:center;gap:12px;width:100%;text-align:left;cursor:pointer;",
      "border:0;background:transparent;padding:11px 12px;border-radius:calc(10px * var(--vq-r-scale,1));}",
    ".pick-i:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    /* 投稿に添えた画像。X と同じく角丸で並べる。 */
    ".imgs{display:grid;gap:4px;margin-top:11px;border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));overflow:hidden;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".imgs[data-n=\"1\"]{grid-template-columns:1fr;}",
    ".imgs[data-n=\"2\"]{grid-template-columns:1fr 1fr;}",
    ".imgs[data-n=\"3\"],.imgs[data-n=\"4\"]{grid-template-columns:1fr 1fr;}",
    ".imgs img{width:100%;height:100%;max-height:420px;object-fit:cover;display:block;background:var(--vq-surface-sunken,#F4F2FB);}",
    ".imgs[data-n=\"1\"] img{max-height:520px;object-fit:contain;}",
    /* 投稿前の下書き側 */
    ".dimgs{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;}",
    ".dimg{position:relative;width:92px;height:92px;border-radius:calc(12px * var(--vq-r-scale,1));overflow:hidden;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".dimg img,.dimg video{width:100%;height:100%;object-fit:cover;display:block;background:#17161D;}",
    ".dimg button{position:absolute;top:4px;right:4px;width:24px;height:24px;border:0;cursor:pointer;",
      "border-radius:50%;background:rgba(35,32,64,.62);color:#fff;font-size:14px;line-height:1;",
      "display:grid;place-items:center;}",
    ".upbusy{font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);margin-top:8px;}",
    /* 押して大きく見る */
    ".lb{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:24px;",
      "background:rgba(24,22,34,.92);animation:vqfBd .18s ease both;}",
    ".lb img{animation:vqfCard .26s cubic-bezier(.22,1,.36,1) both;}",
    ".lb img{max-width:100%;max-height:calc(100dvh - 120px);object-fit:contain;border-radius:calc(8px * var(--vq-r-scale,1));display:block;}",
    ".lb-x{position:absolute;top:16px;right:16px;width:40px;height:40px;border:0;cursor:pointer;",
      "border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:20px;line-height:1;",
      "display:grid;place-items:center;}",
    ".lb-x:hover{background:rgba(255,255,255,.24);}",
    ".lb-nav{position:absolute;top:50%;translate:0 -50%;width:44px;height:44px;border:0;cursor:pointer;",
      "border-radius:50%;background:rgba(255,255,255,.14);color:#fff;display:grid;place-items:center;}",
    ".lb-nav:hover{background:rgba(255,255,255,.24);}",
    ".lb-nav svg{width:22px;height:22px;}",
    ".lb-prev{left:16px;} .lb-next{right:16px;}",
    ".lb-n{position:absolute;bottom:20px;left:50%;translate:-50% 0;color:rgba(255,255,255,.8);",
      "font-size:13px;font-variant-numeric:tabular-nums;}",

    /* ★ 動画の 再生バーの 見た目は **core/feed/video.js（VQVID）**が 持つ
       （2026-08-20・訴え「News の 表示でも Feed と 同じものを 使いたい」）。
       ここに 書き写すと、片方だけ 直る／片方だけ 壊れる。 */

    /* 返信の操作行は小さめ */
    /* ── ⋯ メニュー（削除・編集・報告）2026-08-19 ────────────────
       ★ 訴え「FEED の投稿は 必ず 削除、再度編集、報告が できるように」。
       ★ 置き場は 名前の行の 右端。X と同じ場所なので 迷わない。 */
    ".dots{margin-left:auto;flex:0 0 auto;width:30px;height:30px;border:0;background:none;",
    "color:var(--vq-text-tertiary,#9994A8);border-radius:999px;cursor:pointer;",
    "display:inline-flex;align-items:center;justify-content:center;}",
    ".dots:hover{background:var(--vq-surface-hover,#F7F5FC);color:var(--vq-text,#2B2836);}",
    ".dots svg{width:17px;height:17px;}",
    ".menu-bd{position:fixed;inset:0;z-index:60;background:rgba(24,22,38,.28);",
      "animation:vqfBd .14s ease both;}",
    ".menu{position:fixed;z-index:61;min-width:210px;max-width:calc(100vw - 24px);",
    "background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E7E4EF);",
    "border-radius:16px;box-shadow:0 12px 40px rgba(15,23,42,.18);padding:6px;overflow:hidden;",
    "animation:vqfMenu .16s cubic-bezier(.22,1,.36,1) both;transform-origin:top center;}",
    ".menu button{display:flex;align-items:center;gap:10px;width:100%;height:42px;padding:0 12px;",
    "border:0;background:none;font:inherit;font-size:14px;color:var(--vq-text,#2B2836);",
    "border-radius:11px;cursor:pointer;text-align:left;}",
    ".menu button:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    ".menu button.dn{color:#C0392B;}",
    ".menu button svg{width:17px;height:17px;flex:0 0 auto;}",
    ".menu .sep{height:1px;margin:5px 8px;background:var(--vq-border-subtle,#EFEDF5);}",
    /* 編集の窓 */
    ".ped{position:fixed;inset:0;z-index:62;display:flex;align-items:center;justify-content:center;padding:16px;}",
    ".ped-bd{position:absolute;inset:0;background:rgba(24,22,38,.42);",
      "animation:vqfBd .16s ease both;}",
    ".ped-w{position:relative;width:min(560px,100%);background:var(--vq-surface,#fff);",
    "border-radius:20px;border:1px solid var(--vq-border,#E7E4EF);padding:18px;",
    "box-shadow:0 18px 60px rgba(15,23,42,.24);max-height:86vh;overflow:auto;",
    "animation:vqfCard .24s cubic-bezier(.22,1,.36,1) both;}",
    ".ped-w h2{margin:0 0 12px;font-size:16px;font-weight:750;}",
    ".ped-w input,.ped-w textarea{width:100%;box-sizing:border-box;font:inherit;font-size:14px;",
    "padding:10px 12px;border:1px solid var(--vq-border,#E7E4EF);border-radius:12px;",
    "background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);margin:0 0 10px;}",
    ".ped-w textarea{min-height:130px;line-height:1.8;resize:vertical;}",
    /* ★ 理由が 8 つ 並ぶと 窓が 縦に 伸びて、
       「送る」が 画面の 外へ 出る（実測 1180×940 で 隠れた）。
       中は 巻けるので、押すところだけ 下に 貼り付ける。 */
    ".ped-f{display:flex;gap:8px;justify-content:flex-end;margin-top:4px;",
      "position:sticky;bottom:-18px;padding:12px 0 0;",
      "background:linear-gradient(180deg,rgba(255,255,255,0),var(--vq-surface,#fff) 34%);}",
    /* ── 報告の 窓（2026-08-29・訴え「システムの モーダルを やめたい」）── */
    ".rp-s{margin:0 0 10px;font-size:12.5px;line-height:1.7;color:var(--vq-text-secondary,#686477);}",
    ".rp-t{margin:14px 0 8px;font-size:13px;font-weight:750;color:var(--vq-text,#2B2836);}",
    ".rp-t .req{margin-left:6px;font-size:11px;font-weight:700;color:var(--vq-accent-text,#5F579E);}",
    ".rp-prev{margin:0 0 12px;padding:10px 12px;border-radius:12px;",
    "background:var(--vq-surface-sunken,#F7F6FB);border:1px solid var(--vq-border-subtle,#EFEDF5);",
    "font-size:12.5px;line-height:1.7;color:var(--vq-text-secondary,#686477);",
    "max-height:88px;overflow:hidden;}",
    ".rp-prev b{display:block;color:var(--vq-text,#2B2836);font-weight:700;margin-bottom:2px;}",
    ".rp-l{display:grid;gap:6px;}",
    ".rp-o{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;",
    "padding:11px 12px;border-radius:12px;border:1px solid var(--vq-border,#E7E4EF);",
    "background:var(--vq-surface,#fff);color:inherit;font:inherit;font-size:13.5px;cursor:pointer;}",
    ".rp-o:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    ".rp-o[aria-pressed='true']{border-color:var(--vq-accent,#756DB3);",
    "background:var(--vq-accent-subtle,#EFEBFA);}",
    ".rp-ck{flex:0 0 auto;width:18px;height:18px;margin-top:1px;border-radius:50%;",
    "border:2px solid var(--vq-border-strong,#D7D2E4);display:grid;place-items:center;}",
    ".rp-o[aria-pressed='true'] .rp-ck{border-color:var(--vq-accent,#756DB3);",
    "background:var(--vq-accent,#756DB3);}",
    ".rp-ck i{width:8px;height:8px;border-radius:50%;background:#fff;opacity:0;}",
    ".rp-o[aria-pressed='true'] .rp-ck i{opacity:1;}",
    ".rp-o .rp-n{font-weight:700;}",
    ".rp-o .rp-d{display:block;margin-top:2px;font-size:11.5px;font-weight:500;",
    "color:var(--vq-text-secondary,#686477);}",
    ".rp-err{margin:8px 0 0;font-size:12.5px;color:var(--vq-danger-text,#B4321F);}",
    ".acts--sm{max-width:320px;margin-top:6px;}",
    ".acts--sm .act{height:30px;padding:0 8px;font-size:12px;}",
    ".acts--sm .act svg{width:15px;height:15px;}",
    ".morerep{display:block;width:100%;border:0;background:transparent;cursor:pointer;padding:14px;",
      "font-size:13.5px;font-weight:600;color:var(--vq-accent-text,#5F5691);",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".morerep:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    /* ── スマホ ───────────────────────────────────────────
       ・投稿欄の下の列が右へはみ出していた（添付ボタンと投稿ボタンが 1 行に入らない）
       ・添付カードの題名が縮まず、外へ出ていた
       ・下のナビと重なって、最後の投稿が読めなかった */
    "@media (max-width:640px){",
      /* 投稿欄の下は 2 段にする。添付を上、文字数と投稿を下。 */
      ".comp-foot{flex-wrap:wrap;gap:8px;}",
      ".comp-foot > .attbar:first-child{order:1;flex:1 1 100%;}",
      ".comp-foot > .attbar:last-child{order:2;flex:1 1 100%;justify-content:flex-end;gap:10px;}",
      ".attbar{flex-wrap:wrap;}",
      ".attbtn{height:34px;}",
      /* 添付カードの題名を縮ませる（親に min-width:0 が無いと縮まない） */
      ".att{gap:10px;padding:11px 12px;}",
      ".att-b{min-width:0;overflow:hidden;}",
      ".att-t,.att-s,.att-k{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      /* 本文まわりを少し詰める */
      /* 上を詰める。タブが画面のすぐ上に来るようにする。 */
      ".wrap{padding-top:0;}",
      ".tabs{top:0;}",
      /* 旧ページ側が持っている上下の余白も、この画面では要らない */
      ":host{margin-top:-6px;}",
      ".comp{padding:12px 14px;gap:10px;}",
      ".comp textarea{font-size:16px;}",       /* 16px 未満だと iOS が勝手に拡大する */
      ".post{padding:13px 14px;gap:10px;}",
      ".post--flat{padding:14px;}",
      ".ava{width:36px;height:36px;font-size:13px;}",
      ".ava--lg{width:42px;height:42px;}",
      ".name{font-size:14px;max-width:42%;}",
      ".at{font-size:13px;}",
      ".txt{font-size:14.5px;}",
      ".txt--lg{font-size:16px;}",
      /* タブは 4 つ入るように少し詰める */
      ".tab{padding:13px 4px;font-size:13px;}",
      ".tab[aria-selected=\"true\"]::after{width:44px;}",
      /* 操作行は端まで広げて、指で押せる幅を確保 */
      ".acts{max-width:none;}",
      ".act{padding:0 6px;gap:5px;}",
      /* 下のナビと + ボタンに隠れないように、下へ余白を足す */
      ".wrap{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px));}",
      /* 返信欄 */
      ".rform{padding:12px 14px;gap:10px;}",
      ".rform textarea{font-size:16px;}",
      ".rep{padding:12px 14px;gap:10px;}",
      ".rep-l{width:32px;}",
      /* 動画の バーの 大きさも VQVID が 持つ。 */
      /* 拡大表示のボタンも指の大きさに */
      ".lb{padding:12px;}",
      ".lb-nav{width:40px;height:40px;}",
      ".lb-prev{left:8px;} .lb-next{right:8px;}",
      ".lb-x{top:10px;right:10px;}",
      /* 選ぶシートは下から出す */
      ".pick{padding:0;place-items:end center;}",
      ".pick-c{width:100%;max-height:80vh;border-radius:calc(16px * var(--vq-r-scale,1)) calc(16px * var(--vq-r-scale,1)) 0 0;}",
    "}",
    /* 指で触る端末は、幅に関係なく当たり判定を厚くする
       （横向きにすると 640px を超えるが、指の大きさは変わらない） */
    "@media (pointer:coarse){",
      ".act{height:34px;}",
    "}",
    /* さらに狭い端末 */
    "@media (max-width:370px){",
      ".tab{font-size:12px;padding:12px 2px;}",
      ".attbtn{font-size:12px;padding:0 9px;}",
      ".act{padding:0 4px;}",
    "}",
    /* 複数のメディアは横に流して行き来する。指でも矢印でも同じところへ止まる。 */
    ".mrail{position:relative;margin-top:11px;border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));overflow:hidden;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);background:var(--vq-surface-sunken,#F4F2FB);}",
    ".mrail-t{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;",
      "scroll-behavior:smooth;scrollbar-width:none;-webkit-overflow-scrolling:touch;}",
    ".mrail-t::-webkit-scrollbar{display:none;}",
    ".mrail-i{flex:0 0 100%;scroll-snap-align:center;min-width:0;display:flex;align-items:center;",
      "justify-content:center;background:#17161D;}",
    ".mrail-i img{width:100%;max-height:460px;object-fit:contain;display:block;}",
    /* 並びの中の動画は、枠と角丸を親へ任せる */
    ".mrail-i .vid{margin-top:0;border:0;border-radius:0;width:100%;}",
    ".mrail-d{position:absolute;left:0;right:0;bottom:8px;display:flex;justify-content:center;gap:5px;",
      "pointer-events:none;}",
    ".mrail-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.45);",
      "transition:background .16s ease,width .16s ease;}",
    ".mrail-dot.is-on{background:var(--vq-surface,#fff);width:16px;border-radius:99px;}",
    ".mrail-nav{position:absolute;top:50%;translate:0 -50%;width:34px;height:34px;border:0;cursor:pointer;",
      "border-radius:50%;background:rgba(24,22,34,.5);color:#fff;display:grid;place-items:center;",
      "opacity:0;transition:opacity .16s ease;}",
    ".mrail:hover .mrail-nav{opacity:1;}",
    ".mrail-nav:hover{background:rgba(24,22,34,.72);}",
    ".mrail-nav svg{width:18px;height:18px;}",
    ".mrail-prev{left:8px;} .mrail-next{right:8px;}",
    /* 指の端末では矢印を出さない（流せばよい） */
    "@media (pointer:coarse){.mrail-nav{display:none;}}",
    /* ── プロフィール（Studio の ProfileScreen）────────────────
       表紙 → 顔 → 名前と @handle → 紹介文 → 数 → 中身のタブ、の順。 */
    ".pf-cover{height:150px;background:linear-gradient(135deg,var(--vq-border-focus,#9A8CE0),var(--vq-border-focus,#C2BBEF) 55%,var(--vq-accent-subtle,#EAE8F7));}",
    /* ★ 表紙に かぶってよいのは **顔だけ**（2026-08-27・訴え）。
       もとは 行ごと margin-top で 引き上げ、中の 文字は align-items:flex-end で
       下そろえにしていた。これだと 行の 高さ = max(顔, 文字) なので、
       **名前が 長くて 2 行になるほど 文字の 上端が 上がり**、表紙に 食い込む
       （実測 2026-08-27: 320px で 34px、390px で 19px はみ出していた）。
       行は 表紙の 下から 始め、**顔だけ** 自分の margin で 持ち上げる。
       こうすると 文字の 上端は 名前の 長さに関わらず 必ず 表紙より 下。 */
    ".pf-head{display:flex;align-items:flex-end;gap:16px;padding:12px 20px 0;margin-top:0;flex-wrap:wrap;}",
    ".pf-ava{width:92px;height:92px;flex:none;border-radius:50%;overflow:hidden;display:grid;place-items:center;",
      "align-self:flex-start;margin-top:-54px;margin-bottom:-10px;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);",
      "font-weight:700;font-size:32px;line-height:1;border:4px solid var(--vq-surface,#fff);",
      "box-shadow:0 2px 10px rgba(84,72,140,.16);}",
    ".pf-ava img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".pf-id{flex:1;min-width:180px;padding-bottom:6px;}",
    ".pf-name{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}",
    ".pf-name h1{font-size:21px;font-weight:700;letter-spacing:-.01em;}",
    ".pf-at{font-size:13.5px;color:var(--vq-text-tertiary,#9994A8);margin-top:3px;}",
    ".pf-btns{display:flex;gap:8px;padding-bottom:6px;flex-wrap:wrap;}",
    ".pf-body{padding:16px 20px 0;}",
    ".pf-bio{font-size:14.5px;line-height:1.85;white-space:pre-wrap;word-break:break-word;max-width:600px;}",
    ".pf-msg{margin-top:8px;font-size:13px;color:var(--vq-text-secondary,#6B6480);}",
    ".pf-stats{display:flex;gap:20px;flex-wrap:wrap;margin-top:16px;}",
    ".pf-stat{border:0;background:transparent;cursor:pointer;padding:0;display:inline-flex;",
      "align-items:baseline;gap:5px;font-size:13.5px;color:var(--vq-text-tertiary,#9994A8);}",
    ".pf-stat b{font-size:16px;font-weight:700;color:var(--vq-text,#2B2836);font-variant-numeric:tabular-nums;}",
    ".pf-stat:hover b{text-decoration:underline;}",
    ".pf-stat[disabled]{cursor:default;}",
    ".pf-badges{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px;}",
    ".pf-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;",
      "font-size:11.5px;font-weight:700;border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "color:var(--vq-text-secondary,#6B6480);}",
    ".pf-badge svg{width:12px;height:12px;}",
    ".pf-tabs{display:flex;overflow-x:auto;margin-top:18px;scrollbar-width:none;",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".pf-tabs::-webkit-scrollbar{display:none;}",
    ".pf-tab{flex:1 0 auto;min-width:76px;position:relative;border:0;background:transparent;cursor:pointer;",
      "padding:13px 12px;font-size:13.5px;font-weight:600;color:var(--vq-text-secondary,#6B6480);",
      "white-space:nowrap;}",
    ".pf-tab:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".pf-tab[aria-selected=\"true\"]{color:var(--vq-text,#2B2836);font-weight:700;}",
    ".pf-tab[aria-selected=\"true\"]::after{content:\"\";position:absolute;left:50%;bottom:0;translate:-50% 0;",
      "width:44px;height:4px;border-radius:calc(4px * var(--vq-r-scale,1)) calc(4px * var(--vq-r-scale,1)) 0 0;background:var(--vq-accent,#8A81C2);}",
    ".pf-tab .c{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);margin-left:5px;",
      "font-variant-numeric:tabular-nums;}",
    /* フォロー一覧 */
    ".fl-row{display:flex;align-items:center;gap:12px;padding:13px 20px;",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".fl-row .body{flex:1;min-width:0;}",
    /* 表紙の写真。CSS の url() へ入れると割り込まれる余地が残るので、
       素直に <img> で敷いて object-fit で切る。 */
    ".pf-cover img,.ed-cover img{width:100%;height:100%;object-fit:cover;display:block;}",
    /* プロフィールに貼ったリンク */
    /* 学習の記録のカード。数を並べて読ませる。 */
    ".scard{margin-top:12px;border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));background:var(--vq-surface,#fff);overflow:hidden;}",
    ".scard-h{display:flex;gap:11px;align-items:flex-start;padding:14px 15px 12px;}",
    ".scard-ico{width:36px;height:36px;flex:none;border-radius:calc(10px * var(--vq-r-scale,1));display:grid;place-items:center;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);}",
    ".scard-ico svg{width:18px;height:18px;}",
    ".scard-b{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}",
    ".scard-k{font-size:11px;font-weight:700;color:var(--vq-accent-text,#5F5691);",
      "letter-spacing:.02em;}",
    ".scard-t{font-size:14.5px;font-weight:700;line-height:1.5;word-break:break-word;}",
    ".scard-s{font-size:12px;color:var(--vq-text-tertiary,#9994A8);",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;}",
    ".scard-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:1px;",
      "background:var(--vq-border-subtle,#E7E4EF);border-top:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".scard-i{display:flex;flex-direction:column;gap:2px;padding:11px 12px;",
      "background:var(--vq-surface,#fff);}",
    ".scard-i b{font-size:18px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums;}",
    ".scard-i > span{font-size:11px;color:var(--vq-text-secondary,#6B6480);}",
    ".scard-i i{font-size:10.5px;font-style:normal;color:var(--vq-text-tertiary,#9994A8);}",
    ".scard-n{padding:11px 15px 13px;font-size:13px;line-height:1.8;",
      "color:var(--vq-text-secondary,#6B6480);border-top:1px solid var(--vq-border-subtle,#E7E4EF);",
      "word-break:break-word;}",
    ".pf-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px;}",
    ".pf-link{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:5px 12px;",
      "border-radius:999px;border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "background:var(--vq-surface,#fff);font-size:13px;font-weight:600;",
      "color:var(--vq-accent-text,#5F5691);text-decoration:none;}",
    ".pf-link:hover{background:var(--vq-accent-subtle,#EAE8F7);}",
    ".pf-link svg{width:13px;height:13px;flex:0 0 auto;}",
    /* span は inline のままだと縮まない（overflow が効かない）ので block にする */
    ".pf-link span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",

    /* ── かぶせる画面（編集 / 共有）────────────────────────────
       Feed の中に置くと左パネルの下へ潜るので、大きく見るときと同じく
       body 直下の入れ物へ出す。 */
    ".ovl{position:fixed;inset:0;background:rgba(24,22,34,.55);",
      "-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);",
      "display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;",
      "animation:vqfFade .18s ease both;}",
    "@keyframes vqfFade{from{opacity:0}to{opacity:1}}",
    ".sheet{width:min(620px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;",
      "background:var(--vq-surface,#fff);border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));overflow:hidden;",
      "box-shadow:0 18px 60px rgba(24,22,34,.34);animation:vqfUp .24s cubic-bezier(.22,1,.36,1) both;}",
    "@keyframes vqfUp{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}",
    ".sh-h{display:flex;align-items:center;gap:10px;padding:11px 14px;flex:none;",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".sh-h h2{flex:1;font-size:17px;font-weight:700;}",
    ".sh-x{width:34px;height:34px;flex:none;border:0;border-radius:50%;background:transparent;",
      "cursor:pointer;display:grid;place-items:center;color:var(--vq-text-secondary,#6B6480);}",
    ".sh-x:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".sh-x svg{width:18px;height:18px;}",
    ".sh-b{flex:1;min-height:0;overflow:auto;}",
    ".sh-f{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;",
      "padding:11px 14px;border-top:1px solid var(--vq-border-subtle,#E7E4EF);}",

    /* 編集の中身 */
    ".ed-cover{position:relative;height:150px;",
      "background:linear-gradient(135deg,var(--vq-border-focus,#9A8CE0),var(--vq-border-focus,#C2BBEF) 55%,var(--vq-accent-subtle,#EAE8F7));}",
    ".ed-ava{position:absolute;left:20px;bottom:-34px;width:88px;height:88px;border-radius:50%;",
      "border:4px solid var(--vq-surface,#fff);overflow:hidden;display:grid;place-items:center;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);",
      "font-size:30px;font-weight:700;line-height:1;}",
    ".ed-ava img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".ed-cam{position:absolute;width:38px;height:38px;border:0;border-radius:50%;cursor:pointer;",
      "background:rgba(24,22,34,.55);color:#fff;display:grid;place-items:center;",
      "transition:background .15s ease;}",
    ".ed-cam:hover{background:rgba(24,22,34,.74);}",
    ".ed-cam:disabled{opacity:.5;cursor:default;}",
    ".ed-cam svg{width:17px;height:17px;}",
    ".ed-cam--bn{right:12px;top:12px;}",
    ".ed-cam--bnx{right:58px;top:12px;}",
    ".ed-cam--av{left:74px;bottom:-42px;width:32px;height:32px;}",
    ".ed-cam--av svg{width:14px;height:14px;}",
    ".ed-fields{padding:52px 20px 20px;display:grid;gap:15px;}",
    ".fld{display:grid;gap:6px;}",
    ".fld>label,.fld>.lg{font-size:12.5px;font-weight:700;color:var(--vq-text-secondary,#6B6480);}",
    ".fld input,.fld textarea{width:100%;font:inherit;font-size:14.5px;color:var(--vq-text,#2B2836);",
      "background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "border-radius:calc(10px * var(--vq-r-scale,1));padding:9px 12px;outline:0;transition:border-color .14s ease,box-shadow .14s ease;}",
    ".fld textarea{resize:vertical;min-height:86px;line-height:1.75;}",
    ".fld input:focus,.fld textarea:focus{border-color:var(--vq-accent,#8A81C2);",
      "box-shadow:0 0 0 3px color-mix(in srgb,var(--vq-accent,#8A81C2) 22%,transparent);}",
    ".fld input:disabled,.fld textarea:disabled{background:var(--vq-surface-sunken,#F4F2FB);",
      "color:var(--vq-text-tertiary,#9994A8);cursor:not-allowed;}",
    ".fld .note{font-size:11.5px;line-height:1.6;color:var(--vq-text-tertiary,#9994A8);}",
    ".fld .note.warn{color:var(--vq-warning-text,#8A6A20);}",
    ".lnk-row{display:flex;gap:8px;align-items:center;}",
    ".lnk-row input{min-width:0;}",
    ".lnk-row .l1{flex:0 0 34%;}",
    ".lnk-row .l2{flex:1;}",
    ".lnk-del{width:36px;height:36px;flex:none;cursor:pointer;display:grid;place-items:center;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);border-radius:calc(10px * var(--vq-r-scale,1));background:transparent;",
      "color:var(--vq-text-tertiary,#9994A8);}",
    ".lnk-del:hover{background:var(--vq-surface-sunken,#F4F2FB);color:var(--vq-danger-text,#B4564F);}",
    ".lnk-del svg{width:15px;height:15px;}",
    ".lnk-add{justify-self:start;display:inline-flex;align-items:center;gap:6px;cursor:pointer;",
      "border:1px dashed var(--vq-border-subtle,#E7E4EF);background:transparent;border-radius:calc(10px * var(--vq-r-scale,1));",
      "padding:7px 13px;font-size:13px;font-weight:700;color:var(--vq-accent-text,#5F5691);}",
    ".lnk-add:hover{background:var(--vq-accent-subtle,#EAE8F7);}",
    ".lnk-add:disabled{opacity:.45;cursor:default;}",
    ".lnk-add svg{width:14px;height:14px;}",
    /* 公開範囲は 2 択。押した方が残る。 */
    ".seg{display:flex;gap:6px;flex-wrap:wrap;}",
    ".seg button{flex:1;min-width:120px;cursor:pointer;padding:9px 12px;border-radius:calc(10px * var(--vq-r-scale,1));",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);background:var(--vq-surface,#fff);",
      "font-size:13.5px;font-weight:600;color:var(--vq-text-secondary,#6B6480);}",
    ".seg button:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".seg button[aria-pressed=\"true\"]{background:var(--vq-accent-subtle,#EAE8F7);",
      "border-color:var(--vq-accent,#8A81C2);color:var(--vq-accent-text,#5F5691);font-weight:700;}",
    ".ed-err{margin:0 20px 4px;padding:10px 12px;border-radius:calc(10px * var(--vq-r-scale,1));background:var(--vq-danger-bg,#FDF1F0);",
      "color:var(--vq-danger-text,#8E3A34);font-size:13px;border:1px solid var(--vq-danger-bg,#F3D6D3);}",
    ".ed-up{font-size:12px;color:var(--vq-text-tertiary,#9994A8);margin-right:auto;}",

    /* 共有 */
    ".shr{display:grid;gap:8px;padding:14px;}",
    ".shr-u{display:flex;gap:8px;align-items:center;padding:10px 12px;border-radius:calc(10px * var(--vq-r-scale,1));",
      "background:var(--vq-surface-sunken,#F4F2FB);font-size:12.5px;",
      "color:var(--vq-text-secondary,#6B6480);overflow:hidden;}",
    ".shr-u span{display:block;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".shr-o{display:flex;align-items:center;gap:11px;width:100%;padding:13px 14px;cursor:pointer;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);border-radius:calc(11px * var(--vq-r-scale,1));text-align:left;",
      "background:var(--vq-surface,#fff);font-size:14.5px;font-weight:600;color:var(--vq-text,#2B2836);}",
    ".shr-o:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".shr-o svg{width:18px;height:18px;flex:0 0 auto;color:var(--vq-accent,#8A81C2);}",

    /* 済んだことを伝える帯 */
    ".toast{position:fixed;left:50%;bottom:28px;translate:-50% 0;pointer-events:none;",
      "display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:999px;",
      /* ★ 背景に var(--vq-text) を使うと、ダークでは白地に白文字になる。
         トーストは明暗どちらでも黒地・白文字で固定する（2026-08-15）。 */
      "background:#1B1922;color:#FFFFFF;border:1px solid rgba(255,255,255,.16);",
      "font-size:13.5px;font-weight:600;",
      "box-shadow:0 8px 26px rgba(24,22,34,.3);animation:vqfToast .22s cubic-bezier(.22,1,.36,1) both;}",
    ".toast svg{width:15px;height:15px;}",
    "@keyframes vqfToast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}",
    "@media (max-width:640px){",
      ".pf-cover{height:112px;}",
      ".pf-head{padding:10px 14px 0;margin-top:0;gap:12px;}",
      ".pf-ava{width:74px;height:74px;font-size:26px;border-width:3px;",
        "margin-top:-44px;margin-bottom:-8px;}",
      ".pf-name h1{font-size:19px;}",
      ".pf-body{padding:14px 14px 0;}",
      ".pf-btns{width:100%;padding-bottom:0;}",
      ".pf-btns .btn{flex:1;}",
      ".fl-row{padding:12px 14px;}",
      ".ovl{padding:0;align-items:flex-end;}",
      ".sheet{width:100%;max-height:92vh;border-radius:calc(16px * var(--vq-r-scale,1)) calc(16px * var(--vq-r-scale,1)) 0 0;}",
      ".ed-cover{height:118px;}",
      ".ed-ava{left:14px;width:74px;height:74px;bottom:-30px;font-size:26px;border-width:3px;}",
      ".ed-cam--av{left:60px;bottom:-36px;}",
      ".ed-fields{padding:48px 14px 18px;}",
      ".ed-err{margin:0 14px 4px;}",
      ".lnk-row{flex-wrap:wrap;}",
      ".lnk-row .l1{flex:1 1 100%;}",
      ".lnk-row .l2{flex:1 1 auto;}",
    "}",
    ".fadein{animation:vqfIn .28s cubic-bezier(.22,1,.36,1) both;}",
    "@keyframes vqfIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    "@media (prefers-reduced-motion:reduce){.fadein,.sk{animation:none !important;}}",
    "@media (prefers-reduced-motion:reduce){",
      ".pick,.pick-c,.lb,.lb img,.menu-bd,.menu,.ped-bd,.ped-w,.ovl,.sheet{animation:none !important;}}",
  ].join("");

  var ICON = {
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.7 1.1-1a5.5 5.5 0 0 0 0-7.7z"/>',
    reply: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>',
    /* ★ 2026-08-19: 投稿と返信を **消す・直す・知らせる** ための絵。 */
    dots: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22V3"/>',
    repost: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    save: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/>',
    back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    preset: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    mock: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    play: '<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    shrink: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M16 3v3a2 2 0 0 0 2 2h3"/><path d="M8 21v-3a2 2 0 0 0-2-2H3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
    pause: '<rect x="7" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="13" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    chevL: '<path d="M15 18l-6-6 6-6"/>',
    chevR: '<path d="M9 18l6-6-6-6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    trophy: '<path d="M6 9a6 6 0 0 0 12 0V3H6z"/><path d="M6 5H3v2a3 3 0 0 0 3 3"/><path d="M18 5h3v2a3 3 0 0 1-3 3"/><path d="M9 21h6"/><path d="M12 15v6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    camera: '<path d="M3 8a2 2 0 0 1 2-2h2.5l1.2-2h6.6l1.2 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
    x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    check: '<path d="M4 12.5l5.2 5.2L20 7"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    bell: '<path d="M18 15v-4a6 6 0 1 0-12 0v4l-1.6 2.4A1 1 0 0 0 5.2 19h13.6a1 1 0 0 0 .8-1.6L18 15Z"/><path d="M10 22h4"/>'
  };
  function svg(k) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + "</svg>";
  }
  /* 再生位置のつまみ。VocabuQuiz のマーク（3 本のリボンと V）をそのまま小さくしたもの。 */
  function knobSvg() {
    return '<svg class="vid-k" viewBox="0 0 200 200" aria-hidden="true">'
      + '<circle cx="100" cy="100" r="96" fill="var(--vq-accent,#8175CC)"/>'
      + '<g fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" opacity=".95">'
      + '<circle cx="100" cy="77" r="50"/><circle cx="80" cy="113" r="50"/><circle cx="120" cy="113" r="50"/>'
      + "</g>"
      + '<path d="M69 74 L100 141 L131 74" fill="none" stroke="#fff" stroke-width="26" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ago(ms) {
    var d = Date.now() - Number(ms || 0);
    if (!isFinite(d) || d < 0) return "";
    var m = Math.floor(d / 60000);
    if (m < 1) return "たった今";
    if (m < 60) return m + "分";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "時間";
    var dd = Math.floor(h / 24);
    if (dd < 30) return dd + "日";
    var t = new Date(Number(ms));
    return (t.getMonth() + 1) + "月" + t.getDate() + "日";
  }
  function stamp(ms) {
    var t = new Date(Number(ms || 0));
    if (!isFinite(t.getTime())) return "";
    var hh = String(t.getHours()).padStart(2, "0"), mm = String(t.getMinutes()).padStart(2, "0");
    return hh + ":" + mm + " · " + t.getFullYear() + "年" + (t.getMonth() + 1) + "月" + t.getDate() + "日";
  }
  function initial(a) {
    var n = (a && (a.displayName || a.nickname || a.handle)) || "";
    return n ? String(n).trim().charAt(0).toUpperCase() : "?";
  }
  function avatarHtml(a, size) {
    var cls = "ava" + (size ? " ava--" + size : "");
    var url = a && a.avatarUrl ? String(a.avatarUrl) : "";
    if (url && /^https?:\/\//i.test(url))
      return '<span class="' + cls + '"><img src="' + esc(url) + '" alt=""></span>';
    return '<span class="' + cls + '" role="img" aria-label="' + esc((a && (a.displayName || a.nickname)) || "利用者")
      + '">' + esc(initial(a)) + "</span>";
  }
  function isLong(t) {
    var s = String(t || "");
    return s.length > FOLD_CHARS || s.split("\n").length > FOLD_LINES;
  }

  /* ── 状態 ─────────────────────────────────────────────────── */
  var host = null, root = null, mounted = false;
  var st = {
    view: "list", detailId: "", tab: "all",
    posts: [], loading: false, error: "",
    replies: {}, expand: {}, busy: {}, news: [], compOpen: false,
    draftCard: null,   /* 投稿へ添えるカード（送るまで手元に置く） */
    draftImgs: [],     /* 投稿へ添える画像の URL（あげ終わったものだけ入る） */
    uploading: 0,      /* いまあげている枚数 */
    lb: null,          /* 押して大きく見ているとき {list, i} */
    repMore: {},       /* 返信の続きがあるか {postId: nextAfter} */
    profile: null,     /* 見ているプロフィール */
    pfTab: "posts",    /* 投稿 / 画像 / 動画 / リンク / いいね / 保存 */
    pfCounts: null,
    pfBusy: false,
    follows: null,     /* フォロー一覧を見ているとき {kind, list} */
    pick: "",          /* "preset" | "mock" のとき選択シートを出す */
    edit: null,        /* プロフィールを編集しているとき */
    share: null,       /* 共有シートを出しているとき {url, title, kind} */
    /* ★ 2026-08-19: 投稿・返信の ⋯ メニューと、編集の窓。
       どちらも **かぶせる画面**なので modalOpen() にも 入れてある。 */
    menu: null,        /* ⋯ を押しているとき {kind,id,pid,編集できる,削除できる,x,y} */
    pedit: null,       /* 投稿・返信を編集しているとき {kind,id,pid,title,body,busy} */
    toast: ""          /* 済んだことを短く伝える帯 */
  };
  var TABS = [
    { id: "all", label: "おすすめ", scope: "all" },
    { id: "following", label: "フォロー中", scope: "following" },
    { id: "quiz", label: "クイズ共有", scope: "all", card: "quiz" },
    { id: "score", label: "スコア", scope: "all", card: "score" }
  ];
  function curTab() { for (var i = 0; i < TABS.length; i++) if (TABS[i].id === st.tab) return TABS[i]; return TABS[0]; }
  function findPost(id) { for (var i = 0; i < st.posts.length; i++) if (st.posts[i].id === id) return st.posts[i]; return null; }

  /* ── 組み立て ─────────────────────────────────────────────── */
  function mount() {
    var page = document.getElementById("appInboxPage");
    if (!page || document.getElementById("vqFeed")) return;
    for (var i = 0; i < page.children.length; i++) {
      var ch = page.children[i];
      if (ch.id === "vqFeed") continue;
      ch.setAttribute("data-vqfeed-hidden", "1");
      ch.style.setProperty("display", "none", "important");
    }
    /* 旧画面は自分で `style.display = ""` に戻すことがある
       （インラインの !important ごと消える）。CSS 側でも押さえておく。 */
    if (!document.getElementById("vqHideFeedLegacy")) {
      var g = document.createElement("style");
      g.id = "vqHideFeedLegacy";
      g.textContent = "#appInboxPage > [data-vqfeed-hidden]{display:none !important;}";
      document.head.appendChild(g);
    }
    host = document.createElement("div");
    host.id = "vqFeed";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    /* ★ 影の DOM には 外の <style> が 届かない。
       お知らせを マークダウンで 描くので、その CSS も ここへ 入れる。 */
    var mdcss = "";
    try { if (window.VQMD && window.VQMD.CSS) mdcss = String(window.VQMD.CSS() || ""); } catch (e) { mdcss = ""; }
    /* ★ 動画の 再生バーの 見た目も ここへ（VQVID・2026-08-20）。 */
    var vidcss = "";
    try { if (window.VQVID && window.VQVID.CSS) vidcss = String(window.VQVID.CSS || ""); } catch (e) { vidcss = ""; }
    var s = document.createElement("style"); s.textContent = CSS + mdcss + vidcss; root.appendChild(s);
    var b = document.createElement("div"); b.className = "wrap"; root.appendChild(b);
    page.appendChild(host);
    mounted = true;
    wire();
    render();
    load();
    loadNews();
  }

  function render() {
    if (!mounted) return;
    root.querySelector(".wrap").innerHTML =
      '<div class="col">'
      + (st.view === "detail" ? detailHtml()
         : st.view === "profile" ? profileHtml()
         : listHtml()) + "</div>"
      + asideHtml() + pickHtml();
    syncEdit();                 /* 編集シートの書きかけを消さない */
    paintOverlay();
  }

  /* ── 一覧 ─────────────────────────────────────────────────── */
  function listHtml() {
    var h = '<div class="tabs" role="tablist" aria-label="フィードの種類">';
    TABS.forEach(function (t) {
      h += '<button class="tab" role="tab" data-tab="' + t.id + '" aria-selected="'
        + (t.id === st.tab) + '">' + esc(t.label) + "</button>";
    });
    h += "</div>";

    /* 投稿欄。触るまでは 1 行、触ると公開範囲が出る。 */
    h += '<div class="comp' + (st.compOpen ? " is-open" : "") + '">' + avatarHtml(window.__vqFeedMe || null)
      + '<div class="comp-main">'
      + '<textarea data-composer rows="1" placeholder="いまどうしてる？" aria-label="投稿する内容"></textarea>'
      + '<div class="comp-aud"><b>' + svg("globe") + "だれでも返信できます</b></div>"
      + draftImgsHtml()
      + draftCardHtml()
      + '<div class="comp-foot">'
      + '<span class="attbar">'
      + '<button class="attbtn" data-a="pick-img"'
        + (st.draftImgs.length >= 5 ? " disabled" : "") + ">" + svg("image") + "画像・動画</button>"
      + '<button class="attbtn" data-a="pick" data-kind="preset"' + (st.draftCard ? " disabled" : "")
        + ">" + svg("preset") + "プリセット</button>"
      + '<button class="attbtn" data-a="pick" data-kind="mock"' + (st.draftCard ? " disabled" : "")
        + ">" + svg("mock") + "試験</button>"
      + "</span>"
      + '<span class="attbar"><span class="count" data-count>0 / 1000</span>'
      + '<button class="btn btn--primary" data-act="post"'
      + (st.draftCard || st.draftImgs.length ? "" : " disabled") + ">投稿する</button></span></div>"
      + "</div></div>";

    if (st.error) h += '<div class="err" role="alert">' + esc(st.error) + "</div>";
    if (st.loading && !st.posts.length) h += '<div class="sk"></div><div class="sk"></div><div class="sk"></div>';

    var list = visible();
    if (!st.loading && !list.length && !st.error) {
      h += '<div class="empty"><h3>まだ投稿がありません</h3><p>'
        + (st.tab === "following"
          ? "フォローしている人の投稿がここに並びます。"
          : "最初の 1 件を書いてみてください。学習の記録やクイズの共有に使えます。")
        + '</p><button class="btn btn--primary" data-act="focus-composer">'
        + svg("pencil") + "投稿する</button></div>";
    }
    list.forEach(function (p) { h += postHtml(p, false); });
    return h;
  }

  function visible() {
    var t = curTab();
    if (!t.card) return st.posts;
    return st.posts.filter(function (p) {
      var c = String(p.cardType || "");
      return t.card === "quiz" ? (c === "quiz" || c === "preset") : (c === "score" || c === "result");
    });
  }

  /* 投稿に添えられた画像。出すのは自分のところの /api/media/ だけ。
     外から来た URL をそのまま <img> にしない（別の場所を読みに行かせない）。 */
  function safeImg(u) {
    var t = String(u || "");
    return /^\/api\/media\/img\/[A-Za-z0-9]+\.(jpg|png|webp|gif)$/.test(t) ? t : "";
  }
  function safeVid(u) {
    var t = String(u || "");
    return /^\/api\/media\/vid\/[A-Za-z0-9]+\.(mp4|webm)$/.test(t) ? t : "";
  }
  /* 表紙と顔の写真。自分のところへ上げたものと、前から入っている
     http(s) と data: を通す。それ以外は出さない。 */
  function safeProfileImg(u) {
    var t = String(u || "").trim();
    if (!t) return "";
    if (safeImg(t)) return t;
    if (/^https?:\/\//i.test(t)) return t;
    if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(t)) return t;
    return "";
  }
  /* 動画 1 件ぶんの markup（並びの中でも単体でも使う） */
  /* ★ 中身は **core/feed/video.js（VQVID）**。News でも 同じものを 使う。
     まだ 読めていない ときだけ、素の <video> で しのぐ（何も 出ないよりは よい）。 */
  function vidHtml(u) {
    try { if (window.VQVID && window.VQVID.html) return window.VQVID.html(u); } catch (e) {}
    return '<div class="vid" data-vid><video src="' + esc(u) + '" controls playsinline data-v></video></div>';
  }

  /* 投稿に添えられたもの（動画と画像）をまとめて出す。
     2 つ以上あるときは、横に流して行き来できるようにする（指でも輪でも）。 */
  function imagesHtml(p) {
    var all = Array.isArray(p && p.images) ? p.images : [];
    var media = [];
    all.forEach(function (u) {
      var v = safeVid(u), i = safeImg(u);
      if (v) media.push({ k: "v", u: v });
      else if (i) media.push({ k: "i", u: i });
    });
    media = media.slice(0, 4);
    if (!media.length) return "";

    var imgOnly = media.filter(function (m) { return m.k === "i"; });
    var idxOf = function (u) { for (var j = 0; j < imgOnly.length; j++) if (imgOnly[j].u === u) return j; return 0; };

    if (media.length === 1) {
      return media[0].k === "v" ? vidHtml(media[0].u)
        : '<div class="imgs" data-n="1"><img src="' + esc(media[0].u) + '" alt="" loading="lazy"'
          + ' data-a="zoom" data-post="' + esc(p.id) + '" data-i="0"></div>';
    }

    var h = '<div class="mrail" data-mrail data-post="' + esc(p.id) + '">'
      + '<div class="mrail-t" data-mtrack>';
    media.forEach(function (m) {
      h += '<div class="mrail-i">'
        + (m.k === "v" ? vidHtml(m.u)
           : '<img src="' + esc(m.u) + '" alt="" loading="lazy" data-a="zoom" data-post="'
             + esc(p.id) + '" data-i="' + idxOf(m.u) + '">')
        + "</div>";
    });
    h += "</div>";
    /* いま何枚目か。指で流しても、矢印で送っても、ここが追いかける。 */
    h += '<div class="mrail-d" data-mdots>';
    media.forEach(function (m, i) {
      h += '<span class="mrail-dot' + (i === 0 ? " is-on" : "") + '"></span>';
    });
    h += "</div>"
      + '<button class="mrail-nav mrail-prev" data-a="m-prev" aria-label="前へ">' + svg("chevL") + "</button>"
      + '<button class="mrail-nav mrail-next" data-a="m-next" aria-label="次へ">' + svg("chevR") + "</button>";
    return h + "</div>";
  }

  /* 押して大きく見るときは、Feed の中ではなく **画面の一番上** へ出す。
     Feed は #appInboxPage の中にあるので、そこに置くと
     左パネル（#appTabBar の中の新シェル）や上のバーが上に残ってしまう。
     body 直下へ別の入れ物を作り、閉じたら片付ける。 */
  var lbHost = null, lbRoot = null, lbPrevOverflow = "", lbLocked = false;
  /* ★ ⋯ メニューと 投稿の編集も **かぶせる画面**として 扱う（2026-08-19）。
     ここに入れ忘れると、出したのに 前面へ来ない／後ろが 押せてしまう。 */
  function modalOpen() { return !!(st.lb || st.edit || st.share || st.menu || st.pedit || st.report); }
  function bodyLock() {
    if (lbLocked) return;
    lbPrevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";     /* 後ろを動かさない */
    lbLocked = true;
  }
  function bodyUnlock() {
    if (!lbLocked) return;
    document.body.style.overflow = lbPrevOverflow;
    lbLocked = false;
  }
  /* 作り直すだけ。控えるかどうかは呼ぶ側が決める
     （足した / 消した直後にここで読み返すと、その操作ごと打ち消してしまう）。 */
  function paintOverlay() {
    if (!modalOpen() && !st.toast) {
      if (lbHost) {
        try { document.body.removeChild(lbHost); } catch (e) {}
        lbHost = null; lbRoot = null;
      }
      bodyUnlock();
      return;
    }
    if (!lbHost) {
      lbHost = document.createElement("div");
      lbHost.id = "vqFeedLightbox";
      lbRoot = lbHost.attachShadow ? lbHost.attachShadow({ mode: "open" }) : lbHost;
      var stl = document.createElement("style"); stl.textContent = CSS; lbRoot.appendChild(stl);
      var box = document.createElement("div"); box.setAttribute("data-lbbox", ""); lbRoot.appendChild(box);
      document.body.appendChild(lbHost);
      lbRoot.addEventListener("click", onLbClick);
      /* ★ 打っている 最中に「送る」が 生き返るように（2026-08-29 実測）。
         描き直すと 打ちかけの 場所が 飛ぶので、**描き直さずに**
         控え と ボタンの 生き死にだけ 直す。 */
      lbRoot.addEventListener("input", onLbInput);
    }
    /* 左パネル(#vqShell)・上のバー(#vqTopbar z900) より上、
       初回案内(999999)や認証より下に置く。
       帯だけ出しているときは後ろを押せるように素通りさせる。 */
    lbHost.style.cssText = "position:fixed;inset:0;z-index:999000;pointer-events:"
      + (modalOpen() ? "auto" : "none") + ";";
    if (modalOpen()) bodyLock(); else bodyUnlock();
    /* ══ 描き直しても、見ていた場所と打っていた場所を保つ ══════════════
       ここは中身を丸ごと入れ替える。そのままだと、
       ボタンを 1 つ押すたびに **いちばん上へ跳ぶ**（実測 2026-08-15：
       リンクを足す・見せる相手を変える・写真を選ぶ、のどれでも起きた）。
       入れ替える前に位置と入力欄の状態を控え、入れ替えたあとに戻す。 */
    var box = lbRoot.querySelector("[data-lbbox]");
    var keep = { top: 0, id: "", s: null, e: null };
    try {
      var sb = box.querySelector(".sh-b");
      if (sb) keep.top = sb.scrollTop;
      var ae = lbRoot.activeElement;
      if (ae && ae.id) {
        keep.id = ae.id;
        if (typeof ae.selectionStart === "number") { keep.s = ae.selectionStart; keep.e = ae.selectionEnd; }
      }
    } catch (x) {}
    /* ★ 打った 中身を 先に 控える（描き直しで 消さない）。 */
    try { 報告を控える(); } catch (x) {}
    box.innerHTML = lbHtml() + menuHtml() + postEditHtml() + 報告の窓()
      + editHtml() + shrHtml() + toastHtml();
    try {
      var sb2 = box.querySelector(".sh-b");
      if (sb2 && keep.top) sb2.scrollTop = keep.top;
      if (keep.id) {
        var back = box.querySelector("#" + keep.id);
        if (back && typeof back.focus === "function") {
          back.focus({ preventScroll: true });
          if (keep.s !== null && typeof back.setSelectionRange === "function") {
            try { back.setSelectionRange(keep.s, keep.e); } catch (x2) {}
          }
        }
      }
    } catch (x) {}
  }
  var toastT = 0;
  function toast(m) {
    syncEdit();                 /* 書きかけを消さない */
    st.toast = String(m || "");
    clearTimeout(toastT);
    toastT = setTimeout(function () { st.toast = ""; paintOverlay(); }, 2400);
    paintOverlay();
  }
  function toastHtml() {
    if (!st.toast) return "";
    return '<div class="toast" role="status">' + svg("check") + esc(st.toast) + "</div>";
  }
  /* 打っている あいだの 直し。**描き直さない**（打ちかけを 守るため）。 */
  function onLbInput(e) {
    var t = e && e.target;
    if (!t || !t.dataset || !st.report) return;
    var k = t.dataset.rp;
    if (k !== "other" && k !== "detail") return;
    if (k === "other") st.report.その他 = String(t.value || "");
    else st.report.詳細 = String(t.value || "");
    var r = st.report;
    var 送れる = !!r.理由 && (r.理由 !== "other" || String(r.その他 || "").trim());
    var b = lbRoot && lbRoot.querySelector('[data-a="rp-send"]');
    if (b) b.disabled = !!r.busy || !送れる;
  }
  function onLbClick(e) {
    var el = e.target;
    while (el && el !== lbRoot && !(el.dataset && el.dataset.a)) el = el.parentNode;
    if (!el || el === lbRoot) return;
    var a = el.dataset.a;
    if (a === "lb-img" || a === "sheet") return;
    if (a === "lb-close" || a === "lb-bd") { st.lb = null; render(); return; }
    if (a === "lb-prev" && st.lb) { st.lb.i = (st.lb.i - 1 + st.lb.list.length) % st.lb.list.length; render(); return; }
    if (a === "lb-next" && st.lb) { st.lb.i = (st.lb.i + 1) % st.lb.list.length; render(); return; }
    /* ── 編集 ── */
    if (a === "ed-bd" || a === "ed-close") { closeEdit(); return; }
    if (a === "ed-save") { saveProfile(); return; }
    if (a === "ed-pick") { pickProfileImage(el.dataset.kind); return; }
    if (a === "ed-drop") {
      syncEdit();
      if (st.edit) st.edit[el.dataset.kind === "banner" ? "banner" : "avatar"] = "";
      paintOverlay(); return;
    }
    if (a === "ed-lnk-add") {
      syncEdit();
      if (st.edit && st.edit.links.length < ED_LINK_MAX) st.edit.links.push({ label: "", url: "" });
      paintOverlay(); return;
    }
    if (a === "ed-lnk-del") {
      syncEdit();
      if (st.edit) st.edit.links.splice(Number(el.dataset.i) || 0, 1);
      paintOverlay(); return;
    }
    if (a === "ed-vis") { syncEdit(); if (st.edit) st.edit.vis = el.dataset.v; paintOverlay(); return; }
    if (a === "ed-fvis") { syncEdit(); if (st.edit) st.edit.fvis = el.dataset.v; paintOverlay(); return; }
    /* ── 共有 ── */
    /* ── ⋯ メニュー / 投稿の編集（2026-08-19）── */
    if (a === "mn-bd") { st.menu = null; paintOverlay(); return; }
    if (a === "mn-edit") { メニューから("edit"); return; }
    if (a === "mn-del") { メニューから("del"); return; }
    if (a === "mn-report") { メニューから("report"); return; }
    if (a === "mn-share") { メニューから("share"); return; }
    if (a === "pe-bd" || a === "pe-cancel") { st.pedit = null; paintOverlay(); return; }
    /* 報告の 窓（2026-08-29） */
    if (a === "rp-bd" || a === "rp-cancel") { st.report = null; paintOverlay(); return; }
    if (a === "rp-pick") {
      if (st.report) {
        報告を控える();
        st.report.理由 = el && el.dataset ? String(el.dataset.v || "") : "";
        st.report.err = "";
        paintOverlay();
      }
      return;
    }
    if (a === "rp-send") { 報告を送る(); return; }
    if (a === "quick-edit") { 一覧から編集(el); return; }
    if (a === "pe-save") { 編集を保存(); return; }

    if (a === "sh-bd" || a === "sh-close") { st.share = null; paintOverlay(); return; }
    if (a === "sh-copy" && st.share) { copyText(st.share.url, "リンクをコピーしました"); return; }
    if (a === "sh-os" && st.share) { osShare(); return; }
    if (a === "sh-mail" && st.share) {
      var href = "mailto:?subject=" + encodeURIComponent(st.share.title || "VocabuQuiz")
        + "&body=" + encodeURIComponent(st.share.url);
      try { window.open(href, "_blank", "noopener"); } catch (x) { location.href = href; }
      return;
    }
  }

  /* ── プロフィールの編集 ───────────────────────────────────
     表紙・アイコン・表示名・@・自己紹介・ひとこと・リンク・公開範囲。
     表示名と @ は変えられる間隔が決まっているので、待ちのあいだは
     触れないようにして、いつから変えられるかを出す。 */
  var ED_LINK_MAX = 5;
  function dateJa(ms) {
    var t = new Date(Number(ms) || 0);
    if (!isFinite(t.getTime())) return "";
    return t.getFullYear() + "年" + (t.getMonth() + 1) + "月" + t.getDate() + "日";
  }
  function edLinksOf(p) {
    return (Array.isArray(p && p.links) ? p.links : []).map(function (l) {
      return { label: String((l && l.label) || ""), url: String((l && l.url) || "") };
    });
  }
  function openEdit() {
    var p = st.profile;
    if (!p || !p.isSelf) return;
    st.edit = {
      banner: safeProfileImg(p.bannerUrl), avatar: safeProfileImg(p.avatarUrl),
      displayName: String(p.displayName || ""), handle: String(p.handle || ""),
      bio: String(p.bio || ""), message: String(p.message || ""),
      links: edLinksOf(p),
      vis: p.visibility === "private" ? "private" : "public",
      fvis: p.followVisibility === "private" ? "private" : "public",
      nameLock: Math.max(0, Number(p.nextDisplayNameChangeAt) || 0),
      handleLock: Math.max(0, Number(p.nextHandleChangeAt) || 0),
      busy: false, up: "", err: ""
    };
    paintOverlay();
  }
  /* 画面に打たれている中身を控える。作り直しの前に必ず通す。 */
  function syncEdit() {
    var e = st.edit;
    if (!e || !lbRoot) return;
    if (!lbRoot.querySelector('[data-e="name"]')) return;   /* まだ出ていない */
    var q = function (sel) { var x = lbRoot.querySelector(sel); return x ? x.value : null; };
    var v;
    v = q('[data-e="name"]');   if (v !== null) e.displayName = v;
    v = q('[data-e="handle"]'); if (v !== null) e.handle = v;
    v = q('[data-e="bio"]');    if (v !== null) e.bio = v;
    v = q('[data-e="msg"]');    if (v !== null) e.message = v;
    var rows = lbRoot.querySelectorAll("[data-lnk]"), out = [];
    for (var i = 0; i < rows.length; i++) {
      var la = rows[i].querySelector("[data-lnk-l]"), ua = rows[i].querySelector("[data-lnk-u]");
      out.push({ label: la ? la.value : "", url: ua ? ua.value : "" });
    }
    e.links = out;
  }
  function edDirty() {
    var e = st.edit, p = st.profile;
    if (!e || !p) return false;
    if (e.displayName !== String(p.displayName || "")) return true;
    if (e.handle !== String(p.handle || "")) return true;
    if (e.bio !== String(p.bio || "")) return true;
    if (e.message !== String(p.message || "")) return true;
    if (e.banner !== safeProfileImg(p.bannerUrl)) return true;
    if (e.avatar !== safeProfileImg(p.avatarUrl)) return true;
    if (e.vis !== (p.visibility === "private" ? "private" : "public")) return true;
    if (e.fvis !== (p.followVisibility === "private" ? "private" : "public")) return true;
    var key = function (l) { return (l.label || "") + "\u0000" + (l.url || ""); };
    return e.links.map(key).join("\u0001") !== edLinksOf(p).map(key).join("\u0001");
  }
  function closeEdit() {
    syncEdit();
    /* 書きかけがあるときだけ止める（何も触っていなければそのまま閉じる） */
    if (edDirty() && !window.confirm("編集をやめますか？ 書きかけの内容は消えます。")) return;
    st.edit = null;
    paintOverlay();
  }
  function editHtml() {
    var e = st.edit;
    if (!e) return "";
    var h = '<div class="ovl" data-a="ed-bd"><div class="sheet" data-a="sheet" role="dialog"'
      + ' aria-modal="true" aria-label="プロフィールを編集">'
      + '<div class="sh-h"><button class="sh-x" data-a="ed-close" aria-label="閉じる">' + svg("x")
      + "</button><h2>プロフィールを編集</h2></div>";

    h += '<div class="sh-b">';
    h += '<div class="ed-cover">' + (e.banner ? '<img src="' + esc(e.banner) + '" alt="">' : "")
      + '<button class="ed-cam ed-cam--bn" data-a="ed-pick" data-kind="banner"'
      + (e.up ? " disabled" : "") + ' aria-label="表紙の写真を選ぶ">' + svg("camera") + "</button>"
      + (e.banner ? '<button class="ed-cam ed-cam--bnx" data-a="ed-drop" data-kind="banner"'
          + ' aria-label="表紙の写真を外す">' + svg("trash") + "</button>" : "")
      + '<span class="ed-ava">'
      + (e.avatar ? '<img src="' + esc(e.avatar) + '" alt="">' : esc(initial(st.profile))) + "</span>"
      + '<button class="ed-cam ed-cam--av" data-a="ed-pick" data-kind="avatar"'
      + (e.up ? " disabled" : "") + ' aria-label="アイコンの写真を選ぶ">' + svg("camera") + "</button>"
      + "</div>";

    h += '<div class="ed-fields">';
    h += '<div class="fld"><label for="vqEdName">表示名</label>'
      + '<input id="vqEdName" data-e="name" type="text" maxlength="40" value="' + esc(e.displayName) + '"'
      + (e.nameLock ? " disabled" : "") + ' placeholder="画面に出る名前">'
      + (e.nameLock
         ? '<span class="note warn">表示名は 7 日に 1 回まで。次に変えられるのは '
           + esc(dateJa(e.nameLock)) + " です。</span>"
         : '<span class="note">40 文字まで。変えると、次は 7 日後まで変えられません。</span>')
      + "</div>";
    h += '<div class="fld"><label for="vqEdHandle">ユーザー名（@）</label>'
      + '<input id="vqEdHandle" data-e="handle" type="text" maxlength="15" value="' + esc(e.handle) + '"'
      + (e.handleLock ? " disabled" : "")
      + ' placeholder="eigo_taro" autocapitalize="off" autocorrect="off" spellcheck="false">'
      + (e.handleLock
         ? '<span class="note warn">@ は 30 日に 1 回まで。次に変えられるのは '
           + esc(dateJa(e.handleLock)) + " です。</span>"
         : '<span class="note">英小文字・数字・_ のみ、3〜15 文字。変えると、次は 30 日後まで変えられません。</span>')
      + "</div>";
    h += '<div class="fld"><label for="vqEdBio">自己紹介</label>'
      + '<textarea id="vqEdBio" data-e="bio" maxlength="400"'
      + ' placeholder="どんな勉強をしているか、何を目指しているか。">' + esc(e.bio) + "</textarea>"
      + '<span class="note">400 文字まで。改行もそのまま出ます。</span></div>';
    h += '<div class="fld"><label for="vqEdMsg">ひとこと</label>'
      + '<input id="vqEdMsg" data-e="msg" type="text" maxlength="120" value="' + esc(e.message) + '"'
      + ' placeholder="いま取り組んでいること">'
      + '<span class="note">自己紹介の下に小さく出ます。</span></div>';

    h += '<div class="fld"><span class="lg">リンク</span>';
    e.links.forEach(function (l, i) {
      h += '<div class="lnk-row" data-lnk>'
        + '<input class="l1" data-lnk-l type="text" maxlength="30" value="' + esc(l.label) + '"'
        + ' placeholder="見せる名前" aria-label="リンクの名前">'
        + '<input class="l2" data-lnk-u type="url" maxlength="300" value="' + esc(l.url) + '"'
        + ' placeholder="https://" aria-label="リンクの住所" autocapitalize="off" spellcheck="false">'
        + '<button class="lnk-del" data-a="ed-lnk-del" data-i="' + i + '"'
        + ' aria-label="このリンクを消す">' + svg("trash") + "</button></div>";
    });
    h += '<button class="lnk-add" data-a="ed-lnk-add"'
      + (e.links.length >= ED_LINK_MAX ? " disabled" : "") + ">" + svg("plus") + "リンクを足す</button>"
      + '<span class="note">' + ED_LINK_MAX + " 件まで。http:// か https:// で始まるものだけ入ります。"
      + "見せる名前を空にすると、住所（ドメイン）がそのまま出ます。</span></div>";

    h += '<div class="fld"><span class="lg">プロフィールを見せる相手</span><div class="seg">'
      + '<button data-a="ed-vis" data-v="public" aria-pressed="' + (e.vis === "public") + '">だれでも</button>'
      + '<button data-a="ed-vis" data-v="private" aria-pressed="' + (e.vis === "private")
      + '">フォロワーだけ</button></div>'
      + '<span class="note">フォロワーだけにすると、自己紹介・ひとこと・リンクは'
      + "フォローしていない人には出ません。</span></div>";
    h += '<div class="fld"><span class="lg">フォローの一覧</span><div class="seg">'
      + '<button data-a="ed-fvis" data-v="public" aria-pressed="' + (e.fvis === "public") + '">見せる</button>'
      + '<button data-a="ed-fvis" data-v="private" aria-pressed="' + (e.fvis === "private")
      + '">自分だけ</button></div></div>';
    h += "</div>";
    if (e.err) h += '<div class="ed-err" role="alert">' + esc(e.err) + "</div>";
    h += "</div>";

    h += '<div class="sh-f">'
      + (e.up ? '<span class="ed-up">' + (e.up === "banner" ? "表紙" : "アイコン")
                + "の写真をあげています…</span>" : "")
      + '<button class="btn btn--secondary" data-a="ed-close">やめる</button>'
      + '<button class="btn btn--primary" data-a="ed-save"' + (e.busy || e.up ? " disabled" : "") + ">"
      + (e.busy ? "保存中…" : "保存する") + "</button></div>";
    return h + "</div></div>";
  }
  function pickProfileImage(kind) {
    syncEdit();
    var e = st.edit;
    if (!e || e.up) return;
    var k = kind === "banner" ? "banner" : "avatar";
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/png,image/jpeg,image/webp,image/gif";
    inp.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var f = (inp.files || [])[0];
      try { document.body.removeChild(inp); } catch (x) {}
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { e.err = "写真は 1 枚 5MB までです。"; paintOverlay(); return; }
      e.up = k; e.err = ""; paintOverlay();
      var hd = { "Content-Type": f.type || "application/octet-stream" };
      var t = token(); if (t) hd.Authorization = "Bearer " + t;
      fetch("/api/upload/image", { method: "POST", headers: hd, body: f, credentials: "same-origin" })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) { var x = new Error(j.message || "失敗"); x.status = r.status; throw x; }
            return j;
          });
        })
        .then(function (j) {
          if (j.url && j.kind === "image") e[k] = j.url;
          else e.err = "画像として受け取れませんでした。";
        })
        .catch(function (x) {
          e.err = x.status === 401 ? "写真をあげるにはログインが必要です。"
            : (x.message || "写真をあげられませんでした。");
        })
        .then(function () { syncEdit(); e.up = ""; paintOverlay(); });
    });
    inp.click();
  }
  function saveProfile() {
    syncEdit();
    var e = st.edit;
    if (!e || e.busy || e.up) return;
    /* ここで分かる間違いは、送る前に伝える（往復させない） */
    var bad = "";
    for (var i = 0; i < e.links.length; i++) {
      var u = String(e.links[i].url || "").trim();
      if (u && !/^https?:\/\//i.test(u)) { bad = "リンクは http:// か https:// で始めてください。"; break; }
    }
    var hd = String(e.handle || "").trim().replace(/^@+/, "");
    if (!bad && !e.handleLock && hd && !/^[a-z0-9_]{3,15}$/.test(hd))
      bad = "ユーザー名は英小文字・数字・_ のみ、3〜15 文字です。";
    if (bad) { e.err = bad; paintOverlay(); return; }

    e.busy = true; e.err = ""; paintOverlay();
    var body = {
      bio: e.bio,
      message: e.message,
      avatarUrl: e.avatar,
      bannerUrl: e.banner,
      links: e.links
        .filter(function (l) { return String(l.url || "").trim(); })
        .map(function (l) {
          return { label: String(l.label || "").trim(), url: String(l.url).trim() };
        }),
      visibility: e.vis,
      followVisibility: e.fvis
    };
    /* 表示名と @ は、**変えたときだけ**送る。
       欄には（まだ決めていない人向けに）学年＋ニックネームが入っているので、
       そのまま送ると「触っていないのに変えた」ことになり、
       7 日 / 30 日の待ちが始まってしまう。 */
    var p0 = st.profile || {};
    if (e.displayName !== String(p0.displayName || "")) body.displayName = e.displayName;
    if (!e.handleLock && hd !== String(p0.handle || "")) body.handle = hd;
    api("/api/profile/me", { method: "PUT", body: body })
      .then(function (j) {
        if (j && j.profile) st.profile = j.profile;
        st.edit = null;
        toast("プロフィールを保存しました");
        render();
      })
      .catch(function (err) {
        e.busy = false;
        e.err = err.message || "保存できませんでした。";
        paintOverlay();
      });
  }

  /* ── 共有 ─────────────────────────────────────────────────
     押した瞬間に黙ってコピーするのではなく、何が起きたかを見せる。
     出す住所は、開き直したときに同じ画面へ戻れるものにする。 */
  function shareUrl(kind, id) {
    var base = location.origin + location.pathname;
    return base + (kind === "profile" ? "?u=" : "?post=") + encodeURIComponent(String(id || ""));
  }
  function openShare(kind, id, title) {
    if (!id) return;
    st.share = {
      url: shareUrl(kind, id),
      title: title || (kind === "profile" ? "プロフィールを共有" : "投稿を共有")
    };
    paintOverlay();
  }
  function shrHtml() {
    var sh = st.share;
    if (!sh) return "";
    var h = '<div class="ovl" data-a="sh-bd"><div class="sheet" style="max-width:440px" data-a="sheet"'
      + ' role="dialog" aria-modal="true" aria-label="共有">'
      + '<div class="sh-h"><button class="sh-x" data-a="sh-close" aria-label="閉じる">' + svg("x")
      + "</button><h2>" + esc(sh.title) + "</h2></div>"
      + '<div class="shr"><div class="shr-u">' + svg("link") + "<span>" + esc(sh.url) + "</span></div>"
      + '<button class="shr-o" data-a="sh-copy">' + svg("copy") + "リンクをコピー</button>";
    if (navigator.share) h += '<button class="shr-o" data-a="sh-os">' + svg("share")
      + "ほかのアプリへ送る</button>";
    h += '<button class="shr-o" data-a="sh-mail">' + svg("mail") + "メールで送る</button>";
    return h + "</div></div></div>";
  }
  function copyText(t, msg) {
    var done = function () { toast(msg); };
    var back = function () {
      try {
        var ta = document.createElement("textarea");
        ta.value = String(t || "");
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;top:0;";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) done(); else toast("コピーできませんでした");
      } catch (x) { toast("コピーできませんでした"); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(String(t || "")).then(done, back);
      else back();
    } catch (e) { back(); }
  }
  function osShare() {
    var sh = st.share;
    if (!sh) return;
    try {
      var r = navigator.share({ title: sh.title, url: sh.url });
      if (r && r.then) r.then(function () { st.share = null; paintOverlay(); }, function () {});
    } catch (e) {}
  }

  function lbHtml() {
    if (!st.lb) return "";
    var l = st.lb, u = safeImg(l.list[l.i] || "");
    if (!u) return "";
    var h = '<div class="lb" data-a="lb-bd">'
      + '<button class="lb-x" data-a="lb-close" aria-label="閉じる">×</button>';
    if (l.list.length > 1) {
      h += '<button class="lb-nav lb-prev" data-a="lb-prev" aria-label="前の画像">' + svg("chevL") + "</button>"
        + '<button class="lb-nav lb-next" data-a="lb-next" aria-label="次の画像">' + svg("chevR") + "</button>"
        + '<span class="lb-n">' + (l.i + 1) + " / " + l.list.length + "</span>";
    }
    return h + '<img src="' + esc(u) + '" alt="" data-a="lb-img"></div>';
  }
  function draftImgsHtml() {
    var h = "";
    if (st.draftImgs.length) {
      h += '<div class="dimgs">';
      st.draftImgs.forEach(function (u, i) {
        var v = safeVid(u);
        h += '<div class="dimg">'
          + (v ? '<video src="' + esc(v) + '" muted preload="metadata"></video>'
               : '<img src="' + esc(safeImg(u)) + '" alt="">')
          + '<button data-a="drop-img" data-i="' + i + '" aria-label="この添付をやめる">×</button></div>';
      });
      h += "</div>";
    }
    if (st.uploading) h += '<p class="upbusy">画像をあげています…（' + st.uploading + " 枚）</p>";
    return h;
  }

  /* 投稿に添えられたカード。プリセット / 試験 / 学習結果の 3 種。
     サーバが知らない型を捨てるので、ここへ来るのは検証済みのものだけ。 */
  function おしらせか(p) {
    return !!(p && String(p.cardType || "") === "news" && p.card && p.card.markdown);
  }

  function cardHtml(p) {
    var c = p && p.card;
    if (!c || !c.type) return "";
    /* ══ お知らせ（2026-08-20）════════════════════════════════════
       訴え「あらかじめ SVG を 用意しておいて、それと一緒に feed に
       投稿できるようにしよう。メッセージ本文の 下に その SVG を 表示させる」
       ★ 絵は **鍵だけ** が サーバから 来る。実物は core/feed/art.js。 */
    if (c.type === "news") {
      var 絵 = "";
      try {
        if (window.VQART && window.VQART.作る) 絵 = window.VQART.作る(String(c.art || ""), String(c.newsId || ""));
      } catch (e) { 絵 = ""; }
      return '<div class="news-art">' + 絵 + "</div>"
        + '<button class="att" data-a="news" data-id="' + esc(String(c.newsId || "")) + '">'
        + '<span class="att-ico">' + svg("bell") + "</span>"
        + '<span class="att-b"><span class="att-k">' + esc(c.categoryLabel || "お知らせ") + "</span>"
        + '<span class="att-t">お知らせを ぜんぶ 読む</span></span></button>';
    }
    if (c.type === "preset") {
      var sub = [];
      if (c.subjectLabel) sub.push(esc(c.subjectLabel));
      if (c.itemCount) sub.push(c.itemCount + " 問");
      if (c.isPublic) sub.push("公開");
      return '<button class="att" data-a="open-preset" data-pid="' + esc(c.presetId) + '">'
        + '<span class="att-ico">' + svg("preset") + "</span>"
        + '<span class="att-b"><span class="att-k">プリセット</span>'
        + '<span class="att-t">' + esc(c.name) + "</span>"
        + (sub.length ? '<span class="att-s">' + sub.join(" · ") + "</span>" : "")
        + "</span></button>";
    }
    if (c.type === "mock") {
      var m = [];
      if (c.subjectLabel) m.push(esc(c.subjectLabel));
      if (c.questionCount) m.push(c.questionCount + " 問");
      if (c.totalPoints) m.push(c.totalPoints + " 点");
      if (c.durationMinutes) m.push(c.durationMinutes + " 分");
      return '<button class="att" data-a="open-mock" data-mid="' + esc(c.mockId) + '">'
        + '<span class="att-ico">' + svg("mock") + "</span>"
        + '<span class="att-b"><span class="att-k">試験</span>'
        + '<span class="att-t">' + esc(c.title) + "</span>"
        + (m.length ? '<span class="att-s">' + m.join(" · ") + "</span>" : "")
        + "</span></button>";
    }
    if (c.type === "study_result") {
      /* 学習の記録は **数が主役**。1 行に詰めず、並べて読めるようにする。
         同じ数を 2 回出さない（正答率が本体と metrics の両方に来ることがある）。 */
      /* 言い方が違うだけの同じ数を 2 回出さない
         （本体の totalMinutes と metrics の「時間」など）。 */
      var ALIAS = {
        "正答率": "acc", "正解率": "acc",
        "時間": "min", "所要時間": "min", "学習時間": "min", "かかった時間": "min",
        "連続": "streak", "続けた日数": "streak", "連続日数": "streak"
      };
      var seen = {}, stats = [];
      var add = function (label, value, sub) {
        var raw = String(label).replace(/\s/g, "");
        var k = ALIAS[raw] || raw;
        if (!value || seen[k]) return;
        seen[k] = 1;
        stats.push({ l: label, v: String(value), s: sub || "" });
      };
      if (c.accuracy) add("正答率", c.accuracy + "%");
      if (c.totalMinutes) add("学習時間", c.totalMinutes + " 分");
      if (c.streakDays) add("続けた日数", c.streakDays + " 日");
      (c.metrics || []).forEach(function (x) { add(String(x.label || ""), x.value, x.sub); });
      stats = stats.slice(0, 4);

      var h = '<div class="scard">'
        + '<div class="scard-h"><span class="scard-ico">' + svg("trophy") + "</span>"
        + '<span class="scard-b"><span class="scard-k">学習の記録'
        + (c.rangeLabel ? " · " + esc(c.rangeLabel) : "") + "</span>"
        + '<span class="scard-t">' + esc(c.headline || "テストの結果") + "</span>"
        + (function () {
            /* 見出しと同じ名前を下にもう一度出さない */
            var sub = [];
            if (c.subjectLabel) sub.push(c.subjectLabel);
            if (c.presetName && c.presetName !== c.headline) sub.push(c.presetName);
            return sub.length ? '<span class="scard-s">' + sub.map(esc).join(" · ") + "</span>" : "";
          })()
        + "</span></div>";
      if (stats.length) {
        h += '<div class="scard-g">';
        stats.forEach(function (x) {
          h += '<span class="scard-i"><b>' + esc(x.v) + "</b><span>" + esc(x.l) + "</span>"
            + (x.s ? '<i>' + esc(x.s) + "</i>" : "") + "</span>";
        });
        h += "</div>";
      }
      if (c.note) h += '<p class="scard-n">' + esc(c.note) + "</p>";
      return h + "</div>";
    }
    return "";
  }

  /* いま添付しようとしているもの（投稿するまで手元に置く） */
  function draftCardHtml() {
    var c = st.draftCard;
    if (!c) return "";
    var k = c.type === "preset" ? "プリセット" : c.type === "mock" ? "試験" : "学習の記録";
    var t = c.name || c.title || c.headline || "";
    return '<div class="att" style="cursor:default">'
      + '<span class="att-ico">' + svg(c.type === "mock" ? "mock" : c.type === "preset" ? "preset" : "trophy") + "</span>"
      + '<span class="att-b"><span class="att-k">' + k + "</span>"
      + '<span class="att-t">' + esc(t) + "</span></span>"
      + '<button class="att-x" data-a="drop-card" aria-label="添付をやめる">×</button></div>';
  }

  /* 手元のプリセット / 試験を選ぶ */
  function pickHtml() {
    if (!st.pick) return "";
    var kind = st.pick, list = [];
    try {
      var ST = window.VQ2 && window.VQ2.store;
      if (kind === "preset" && ST && ST.listPresets) list = ST.listPresets() || [];
      if (kind === "mock" && ST && ST.mocks && ST.mocks.list) list = ST.mocks.list() || [];
    } catch (e) { list = []; }
    var h = '<div class="pick" data-a="pick-bd"><div class="pick-c" role="dialog" aria-modal="true">'
      + '<div class="pick-h">' + (kind === "preset" ? "プリセットを選ぶ" : "試験を選ぶ")
      + '<button class="att-x" data-a="pick-close" aria-label="閉じる">×</button></div><div class="pick-l">';
    if (!list.length) {
      h += '<p class="hint">' + (kind === "preset" ? "作ったプリセットがまだありません。" : "作った試験がまだありません。")
        + "</p>";
    } else {
      list.slice(0, 60).forEach(function (x) {
        var sp = x.spec || x;
        var id = String(x.id || sp.id || "");
        var t = kind === "preset" ? String(x.name || x.title || "名前なし")
                                  : String(sp.title || x.title || "名前なし");
        var qn = ((x.questions || x.items || x.words || []) || []).length;
        var s2 = kind === "preset"
          ? [qn ? qn + " 問" : "",
             String((x.subjects && x.subjects[0] && (x.subjects[0].label || x.subjects[0].name)) || x.subject || "")]
          : [String(sp.subject || ""), (sp.sections || []).length ? (sp.sections || []).length + " 大問" : "",
             sp.totalPoints ? sp.totalPoints + " 点" : ""];
        h += '<button class="pick-i" data-a="pick-one" data-id="' + esc(id) + '">'
          + '<span class="att-ico">' + svg(kind === "preset" ? "preset" : "mock") + "</span>"
          + '<span class="att-b"><span class="att-t">' + esc(t) + "</span>"
          + '<span class="att-s">' + esc(s2.filter(Boolean).join(" · ")) + "</span></span></button>";
      });
    }
    return h + "</div></div></div>";
  }

  /* ══ ⋯ メニュー（削除・編集・報告）2026-08-19 ═══════════════════════
     ★ 訴え「FEED の投稿は 必ず 削除、再度編集、報告が できるように」。
     ★ 出す中身は **相手によって 変える**。
       ・自分のもの … 編集 / 削除
       ・人のもの   … 報告（＋ 自分の投稿への 返信なら 削除も）
       できないことは 並べない（押しても 動かない飾りを 置かない）。 */
  /* ★ 一覧から そのまま 編集する（2026-08-29・訴え
     「投稿画面の 一覧から そのまま 編集できるように できる？」）。
     ⋯ の 中には 前から あったが、札を 押すと 詳細が 開く 作りなので
     ⋯ を 正確に 押さないと たどり着けなかった。**自分の 投稿だけ**
     鉛筆を 並べて、1 回で 編集の 窓へ 行けるように する。 */
  function editBtn(kind, id, pid, style) {
    return '<button class="dots" type="button" data-a="quick-edit" data-kind="' + kind
      + '" data-mid="' + esc(String(id)) + '"' + (pid ? ' data-pid="' + esc(String(pid)) + '"' : "")
      + (style ? ' style="' + style + '"' : "")
      + ' aria-label="この' + (kind === "reply" ? "返信" : "投稿") + 'を編集">'
      + svg("pencil") + "</button>";
  }
  function dotsBtn(kind, id, style, pid) {
    return '<button class="dots" type="button" data-a="menu" data-kind="' + kind
      + '" data-mid="' + esc(String(id)) + '"' + (pid ? ' data-pid="' + esc(String(pid)) + '"' : "")
      + (style ? ' style="' + style + '"' : "")
      + ' aria-label="この' + (kind === "reply" ? "返信" : "投稿") + 'の操作" aria-haspopup="menu">'
      + svg("dots") + "</button>";
  }
  function 自分か(userId) {
    var me = window.__vqFeedMe;
    var mine = me && Number(me.userId || 0);
    return !!mine && Number(userId || 0) === mine;
  }
  function menuHtml() {
    var m = st.menu;
    if (!m) return "";
    var 行 = [];
    if (m.編集できる) 行.push('<button type="button" data-a="mn-edit">' + svg("pencil") + "編集する</button>");
    if (m.削除できる) 行.push('<button class="dn" type="button" data-a="mn-del">' + svg("trash") + "削除する</button>");
    if (行.length) 行.push('<div class="sep"></div>');
    行.push('<button type="button" data-a="mn-report">' + svg("flag") + "報告する</button>");
    行.push('<button type="button" data-a="mn-share">' + svg("share") + "共有する</button>");
    var st2 = "left:" + Math.round(m.x) + "px;top:" + Math.round(m.y) + "px;";
    return '<div class="menu-bd" data-a="mn-bd"></div>'
      + '<div class="menu" role="menu" style="' + st2 + '">' + 行.join("") + "</div>";
  }
  /* 編集の窓。投稿は 題と 本文、返信は 本文だけ。
     ★ 名前を postEditHtml にした。editHtml は **プロフィールの編集**で
       すでに 使われている（同じ名前にすると、あとから読んだほうが 勝って
       プロフィール編集が 開かなくなる）。 */
  function postEditHtml() {
    var e = st.pedit;
    if (!e) return "";
    return '<div class="ped"><div class="ped-bd" data-a="pe-bd"></div><div class="ped-w">'
      + "<h2>" + (e.kind === "reply" ? "返信を編集" : "投稿を編集") + "</h2>"
      + (e.kind === "post"
          ? '<input data-pe="title" placeholder="タイトル（なくてもよい）" value="' + esc(e.title || "") + '">'
          : "")
      + '<textarea data-pe="body" placeholder="本文">' + esc(e.body || "") + "</textarea>"
      + '<div class="ped-f">'
      + '<button class="btn btn--secondary btn--sm" data-a="pe-cancel">やめる</button>'
      + '<button class="btn btn--primary btn--sm" data-a="pe-save"'
      + (e.busy ? " disabled" : "") + ">" + (e.busy ? "保存中…" : "保存する") + "</button>"
      + "</div></div></div>";
  }

  /* ══ 公式マーク（2026-08-20）════════════════════════════════════
     訴え「名前の 左に つけて、金と青が 重なった チェックマーク」。
     絵は core/feed/badge.js が 持ち主。ここでは 呼ぶだけ。
     まだ 読めていないときは 何も 出さない（形の 違うものを 描かない）。 */
  function 印(k, px) {
    try { if (window.VQBADGE && k) return window.VQBADGE.印(k, { size: px || 16 }); } catch (e) {}
    return "";
  }
  function 名(a, px) {
    var n = esc((a && (a.displayName || a.nickname)) || "名前未設定");
    return 印(a && a.verified, px) + n;
  }

  /* flat=true は詳細ページの大きい表示 */
  function postHtml(p, flat) {
    var a = p.author || {}, id = esc(p.id);
    var h = '<article class="post' + (flat ? " post--flat" : "") + ' fadein" data-post="' + id + '"'
      + (flat ? "" : ' data-open="' + id + '" role="link" tabindex="0"') + ">";

    if (flat) {
      /* 詳細: 名前を 2 段にして大きく見せる */
      h += avatarHtml(a, "lg") + '<div class="body">'
        + '<div class="who" style="flex-direction:column;align-items:flex-start;gap:1px">'
        + '<span class="who"><span class="name" style="max-width:none">'
        + 名(a, 18) + "</span>"
        + (a.isFollowing ? '<span class="badge">フォロー中</span>' : "") + "</span>"
        + '<span class="at">@' + esc(a.handle || a.nickname || "user") + "</span></div>"
        + (自分か(a.userId)
            ? editBtn("post", p.id, "", "position:absolute;top:14px;right:52px;margin:0") : "")
        + dotsBtn("post", p.id, "position:absolute;top:14px;right:14px;margin:0");
    } else {
      h += '<span data-a="pf-open" data-uid="' + esc(String(a.userId || "")) + '" style="cursor:pointer">'
        + avatarHtml(a) + "</span>"
        + '<div class="body"><div class="who">'
        + '<span class="name" data-a="pf-open" data-uid="' + esc(String(a.userId || ""))
        + '" style="cursor:pointer">' + 名(a) + "</span>"
        + (a.isFollowing ? '<span class="badge">フォロー中</span>' : "")
        + '<span class="at">@' + esc(a.handle || a.nickname || "user") + "</span>"
        + '<span class="dot">·</span><span class="at">' + esc(ago(p.createdAt)) + "</span>"
        + (自分か(a.userId) ? editBtn("post", p.id, "", "margin-left:auto") : "")
        + dotsBtn("post", p.id, 自分か(a.userId) ? "margin-left:0" : "") + "</div>";
    }

    if (p.title) h += '<p class="title">' + esc(p.title) + "</p>";
    if (p.body) {
      var fold = !flat && isLong(p.body) && !st.expand[p.id];
      /* ★ お知らせ（VocabuQuiz 公式）だけ **マークダウンとして** 描く。
         ふつうの投稿は 素のまま（人の書いた記号を 勝手に 飾らない）。
         VQMD が まだ 読めていないときは 素のまま出す（崩さない）。 */
      if (おしらせか(p) && window.VQMD && window.VQMD.render) {
        h += '<div class="txt vqmd' + (flat ? " txt--lg" : "") + (fold ? " is-fold" : "") + '">'
          + window.VQMD.render(p.body) + "</div>";
      } else {
        h += '<p class="txt' + (flat ? " txt--lg" : "") + (fold ? " is-fold" : "") + '">' + esc(p.body) + "</p>";
      }
      if (fold) h += '<button class="more" data-a="more" data-id="' + id + '">もっと見る</button>';
    }
    h += imagesHtml(p);
    h += cardHtml(p);
    if (flat) h += '<div class="stamp">' + esc(stamp(p.createdAt)) + "</div>";

    h += '<div class="acts' + (flat ? " acts--lg" : "") + '">'
      + '<button class="act" data-a="open" data-id="' + id + '" aria-label="返信">'
        + svg("reply") + '<span class="n">' + (Number(p.replyCount) || 0) + "</span></button>"
      + '<button class="act" data-a="repost" data-id="' + id + '" aria-pressed="' + (!!p.reposted)
        + '" aria-label="リポスト">' + svg("repost") + '<span class="n">' + (Number(p.repostCount) || 0) + "</span></button>"
      + '<button class="act" data-a="like" data-id="' + id + '" aria-pressed="' + (!!p.liked)
        + '" aria-label="いいね">' + svg("heart") + '<span class="n">' + (Number(p.likeCount) || 0) + "</span></button>"
      + '<button class="act" data-a="bookmark" data-id="' + id + '" aria-pressed="' + (!!p.bookmarked)
        + '" aria-label="保存">' + svg("save") + '<span class="n">' + (Number(p.bookmarkCount) || 0) + "</span></button>"
      + '<button class="act" data-a="share" data-id="' + id + '" aria-label="共有">' + svg("share") + "</button>"
      + "</div>";
    return h + "</div></article>";
  }

  /* ── 詳細 ─────────────────────────────────────────────────── */
  function detailHtml() {
    var p = findPost(st.detailId);
    var h = '<div class="head"><button class="back" data-a="back" aria-label="戻る">' + svg("back")
      + '</button><h1>ポスト</h1></div>';
    if (!p) return h + '<div class="hint">この投稿は表示できません。</div>';

    h += postHtml(p, true);
    h += '<div class="sortbar">返信</div>';
    h += '<div class="rform">' + avatarHtml(window.__vqFeedMe || null)
      + '<textarea data-reply-input="' + esc(p.id) + '" rows="1" placeholder="返信をポスト" aria-label="返信"></textarea>'
      + '<button class="btn btn--primary btn--sm" data-a="reply" data-id="' + esc(p.id) + '">返信</button></div>';

    /* 返信は別の入れ物にしておく。あとから届いたときに、
       投稿そのもの（画像を含む）を作り直さずに、ここだけ差し替えられる。 */
    h += '<div class="reps" data-reps="' + esc(p.id) + '">' + repsHtml(p) + "</div>";
    return h;
  }
  function repsHtml(p) {
    var h = "";
    var rs = st.replies[p.id];
    if (rs === undefined) h += '<div class="sk"></div><div class="sk"></div>';
    else if (!rs.length) h += '<div class="hint">まだ返信はありません。最初の返信を書いてみてください。</div>';
    else rs.forEach(function (r) {
      var ra = r.author || {}, rid = esc(r.id);
      h += '<div class="rep fadein"><div class="rep-l">' + avatarHtml(ra, "sm")
        + '<span class="rep-line"></span></div><div class="body"><div class="who">'
        + '<span class="name">' + 名(ra, 14) + "</span>"
        + '<span class="at">@' + esc(ra.handle || ra.nickname || "user") + "</span>"
        + '<span class="dot">·</span><span class="at">' + esc(ago(r.createdAt)) + "</span>"
        + dotsBtn("reply", r.id, "", p.id) + "</div>"
        + '<p class="txt">' + esc(r.body) + "</p>"
        /* ★ 返信にも **投稿と同じ 5 つ**（2026-08-19・利用者の指示）。
           返信・リポスト・いいね・保存・共有。 */
        + '<div class="acts acts--sm">'
        + '<button class="act" data-a="r-reply" data-rid="' + rid + '" data-pid="' + esc(p.id)
          + '" aria-label="この返信に返信">' + svg("reply") + "</button>"
        + '<button class="act" data-a="r-repost" data-rid="' + rid + '" data-pid="' + esc(p.id)
          + '" aria-pressed="' + (!!r.reposted) + '" aria-label="リポスト">'
          + svg("repost") + '<span class="n">' + (Number(r.repostCount) || 0) + "</span></button>"
        + '<button class="act" data-a="r-like" data-rid="' + rid + '" data-pid="' + esc(p.id)
          + '" aria-pressed="' + (!!r.liked) + '" aria-label="いいね">'
          + svg("heart") + '<span class="n">' + (Number(r.likeCount) || 0) + "</span></button>"
        + '<button class="act" data-a="r-bookmark" data-rid="' + rid + '" data-pid="' + esc(p.id)
          + '" aria-pressed="' + (!!r.bookmarked) + '" aria-label="保存">'
          + svg("save") + '<span class="n">' + (Number(r.bookmarkCount) || 0) + "</span></button>"
        + '<button class="act" data-a="r-share" data-rid="' + rid + '" data-pid="' + esc(p.id)
          + '" aria-label="共有">' + svg("share") + "</button>"
        + "</div></div></div>";
    });
    /* 何件でも読めるように、続きがあるあいだは押せるようにする */
    if (st.repMore[p.id]) h += '<button class="morerep" data-a="more-replies" data-id="'
      + esc(p.id) + '">返信をもっと読む</button>';
    return h;
  }

  /* ── プロフィール ─────────────────────────────────────────
     Studio の ProfileScreen をそのまま。数はすべて API の実測値で、
     取れないものは出さない（「友達 26」のような作り話は置かない）。 */
  var PF_TABS = [
    { id: "posts", label: "投稿" }, { id: "images", label: "画像" },
    { id: "videos", label: "動画" }, { id: "links", label: "リンク" },
    { id: "likes", label: "いいね" }, { id: "bookmarks", label: "保存" }
  ];
  function profileHtml() {
    var p = st.profile;
    var h = '<div class="head"><button class="back" data-a="back" aria-label="戻る">' + svg("back")
      + '</button><h1>' + (p ? (印(p.verified, 17) + esc(p.displayName || p.nickname || "プロフィール")) : "プロフィール") + "</h1></div>";
    if (!p) return h + (st.pfBusy ? '<div class="sk"></div><div class="sk"></div>'
      : '<div class="hint">プロフィールを読み込めませんでした。</div>');

    /* フォロー一覧を見ているとき */
    if (st.follows) {
      h = '<div class="head"><button class="back" data-a="fl-back" aria-label="戻る">' + svg("back")
        + '</button><h1>' + (st.follows.kind === "followers" ? "フォロワー" : "フォロー中") + "</h1></div>";
      var l = st.follows.list;
      if (l === null) return h + '<div class="sk"></div><div class="sk"></div>';
      if (st.follows.hidden) return h + '<div class="hint">この人は一覧を公開していません。</div>';
      if (!l.length) return h + '<div class="hint">まだいません。</div>';
      l.forEach(function (u) {
        h += '<div class="fl-row fadein">' + avatarHtml(u)
          + '<div class="body"><div class="who"><span class="name">'
          + 名(u) + '</span></div>'
          + '<div class="at">@' + esc(u.handle || u.nickname || "user") + "</div></div>"
          + '<button class="btn btn--secondary btn--sm" data-a="pf-open" data-uid="'
          + esc(String(u.userId)) + '">見る</button></div>';
      });
      return h;
    }

    var cov = safeProfileImg(p.bannerUrl);
    var avu = safeProfileImg(p.avatarUrl);
    h += '<div class="pf-cover">'
      + (cov ? '<img src="' + esc(cov) + '" alt="">' : "") + "</div>"
      + '<div class="pf-head">'
      + '<span class="pf-ava">'
      + (avu ? '<img src="' + esc(avu) + '" alt="">' : esc(initial(p))) + "</span>"
      + '<div class="pf-id"><div class="pf-name"><h1>'
      + 印(p.verified, 22) + esc(p.displayName || p.nickname || "名前未設定") + "</h1>"
      + (p.publicPresetCount > 0 ? '<span class="badge">公開 ' + p.publicPresetCount + " 件</span>" : "")
      + "</div>"
      + '<div class="pf-at">@' + esc(p.handle || p.nickname || "user")
      + (p.gradePrefix ? " · " + esc(p.gradePrefix) : "") + "</div></div>"
      + '<div class="pf-btns">';
    if (p.isSelf) {
      h += '<button class="btn btn--secondary" data-a="pf-edit">' + svg("pencil") + "編集</button>";
    } else {
      h += '<button class="btn ' + (p.isFollowing ? "btn--secondary" : "btn--primary")
        + '" data-a="pf-follow" data-uid="' + esc(String(p.userId)) + '">'
        + (p.isFollowing ? "フォロー中" : "フォローする") + "</button>";
    }
    h += '<button class="btn btn--secondary" data-a="pf-share" data-uid="' + esc(String(p.userId))
      + '">' + svg("share") + "共有</button></div></div>";

    h += '<div class="pf-body">';
    if (p.bio) h += '<p class="pf-bio">' + esc(p.bio) + "</p>";
    if (p.message) h += '<p class="pf-msg">' + esc(p.message) + "</p>";
    h += '<div class="pf-stats">'
      + '<button class="pf-stat" data-a="pf-follows" data-kind="following"><b>'
      + (Number(p.following) || 0) + "</b>フォロー中</button>"
      + '<button class="pf-stat" data-a="pf-follows" data-kind="followers"><b>'
      + (Number(p.followers) || 0) + "</b>フォロワー</button>"
      + '<span class="pf-stat" disabled><b>' + (Number(p.publicPresetCount) || 0)
      + "</b>公開プリセット</span></div>";
    /* 本人が貼ったリンク。別タブで開き、こちらの素性は渡さない。 */
    var lnks = Array.isArray(p.links) ? p.links : [];
    if (lnks.length) {
      h += '<div class="pf-links">';
      lnks.forEach(function (l) {
        var u = String(l && l.url || "");
        if (!/^https?:\/\//i.test(u)) return;
        h += '<a class="pf-link" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow">'
          + svg("link") + "<span>" + esc(l.label || u.replace(/^https?:\/\//i, "")) + "</span></a>";
      });
      h += "</div>";
    }
    h += "</div>";

    h += '<div class="pf-tabs" role="tablist" aria-label="プロフィールの中身">';
    PF_TABS.forEach(function (t) {
      var n = st.pfCounts ? Number(st.pfCounts[t.id] || 0) : null;
      h += '<button class="pf-tab" role="tab" data-a="pf-tab" data-tab="' + t.id
        + '" aria-selected="' + (t.id === st.pfTab) + '">' + esc(t.label)
        + (n !== null ? '<span class="c">' + n + "</span>" : "") + "</button>";
    });
    h += "</div>";

    if (st.pfBusy) return h + '<div class="sk"></div><div class="sk"></div>';
    if (!st.posts.length) return h + '<div class="empty"><h3>まだありません</h3><p>'
      + esc(PF_TABS.filter(function (t) { return t.id === st.pfTab; })[0].label)
      + "はまだありません。</p></div>";
    st.posts.forEach(function (x) { h += postHtml(x, false); });
    return h;
  }

  /* ── 右カラム ─────────────────────────────────────────────── */
  function asideHtml() {
    var h = '<aside class="aside">';
    h += '<button class="srch" data-a="search">' + svg("search") + "検索</button>";
    h += '<div class="acard"><h2>お知らせ</h2>';
    if (!st.news.length) h += '<p class="hint" style="padding:0">新しいお知らせはありません。</p>';
    else st.news.slice(0, 4).forEach(function (n) {
      h += '<button class="nrow" data-a="news" data-id="' + esc(n.id) + '">'
        + '<span class="k">' + esc(n.cat || "お知らせ") + " · " + esc(n.date || "") + "</span>"
        + '<span class="t">' + esc(n.title) + "</span></button>";
    });
    h += "</div>";
    h += '<div class="acard"><h2>この画面でできること</h2>'
      + '<p class="hint" style="padding:0">投稿・返信・いいね・リポスト・保存が使えます。'
      + "投稿を押すと、返信のやりとりをまとめて読めます。</p></div>";
    return h + "</aside>";
  }

  /* ── 読み込み ─────────────────────────────────────────────── */
  function load() {
    if (!mounted) return;
    st.loading = true; st.error = ""; render();
    api("/api/posts/feed?scope=" + encodeURIComponent(curTab().scope) + "&limit=" + LIMIT)
      .then(function (j) { st.posts = Array.isArray(j.posts) ? j.posts : []; st.loading = false; render(); })
      .catch(function (e) {
        st.loading = false;
        st.error = e.status === 401 ? "投稿を見るにはログインが必要です。"
          : ("投稿を読み込めませんでした。" + (e.message ? "（" + e.message + "）" : ""));
        render();
      });
  }
  function loadNews() {
    api("/api/news/list?limit=4").then(function (j) {
      st.news = (j.items || []).map(function (a) { return { id: a.id, title: a.title, date: a.date, cat: a.categoryLabel }; });
      if (mounted) render();
    }).catch(function () {});
  }
  function loadReplies(pid, after) {
    var url = "/api/posts/replies?postId=" + encodeURIComponent(pid) + "&limit=80"
      + (after ? "&after=" + encodeURIComponent(after) : "");
    api(url)
      .then(function (j) {
        var got = j.replies || [];
        if (after && st.replies[pid]) st.replies[pid] = st.replies[pid].concat(got);
        else st.replies[pid] = got;
        /* 続きがあるときだけ「もっと読む」を出す */
        if (j.hasMore && j.nextAfter) st.repMore[pid] = j.nextAfter;
        else delete st.repMore[pid];
        paintReps(pid);
      })
      .catch(function () { if (!st.replies[pid]) st.replies[pid] = []; paintReps(pid); });
  }
  /* 返信の欄だけを描き替える。ここで render() を呼ぶと投稿の画像まで読み直され、
     「開いただけなのに読み込みが入った」ように見える。 */
  function paintReps(pid) {
    if (!mounted) return;
    var box = root.querySelector('.reps[data-reps="' + cssq(pid) + '"]');
    var p = findPost(pid);
    if (!box || !p) { render(); return; }
    box.innerHTML = repsHtml(p);
  }
  /* 属性セレクタに入れる文字を安全にする */
  function cssq(v) { return String(v == null ? "" : v).replace(/["\\]/g, "\\$&"); }
  function findReply(pid, rid) {
    var l = st.replies[pid] || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === rid) return l[i];
    return null;
  }
  /* 返信のいいね / 保存。投稿と同じく、押した瞬間に画面を変えて、失敗したら戻す。 */
  /* ★ 返信にも リポストを 足した（2026-08-19）。投稿と 同じ 5 つにするため。 */
  var R_KEY = { "r-like": ["like", "liked", "likeCount"],
                "r-bookmark": ["bookmark", "bookmarked", "bookmarkCount"],
                "r-repost": ["repost", "reposted", "repostCount"] };
  function toggleReplyAction(pid, rid, a) {
    var m = R_KEY[a], r = findReply(pid, rid);
    if (!m || !r || st.busy[rid + a]) return;
    var kind = m[0], key = m[1], cnt = m[2], next = !r[key];
    r[key] = next;
    r[cnt] = Math.max(0, (Number(r[cnt]) || 0) + (next ? 1 : -1));
    st.busy[rid + a] = 1;
    var paint = function (on, n) {
      var list = root.querySelectorAll('.act[data-a="' + a + '"]');
      for (var i = 0; i < list.length; i++) {
        if (list[i].dataset.rid !== rid) continue;
        list[i].setAttribute("aria-pressed", String(!!on));
        var s2 = list[i].querySelector(".n");
        if (s2) s2.textContent = String(Number(n) || 0);
        if (on) pop(list[i]);
      }
    };
    paint(next, r[cnt]);
    api("/api/posts/reply-action", { method: "POST", body: { replyId: rid, action: kind, on: next } })
      .then(function (j) {
        if (typeof j.count === "number") r[cnt] = j.count;
        if (typeof j.enabled === "boolean") r[key] = j.enabled;
        paint(r[key], r[cnt]);
      })
      .catch(function (e) {
        r[key] = !next;
        r[cnt] = Math.max(0, (Number(r[cnt]) || 0) + (next ? -1 : 1));
        st.error = e.status === 401 ? "ログインが必要です。" : "反映できませんでした。";
        render();
      })
      .then(function () { delete st.busy[rid + a]; });
  }

  /* ══ ⋯ の中身（削除・編集・報告・共有）2026-08-19 ═══════════════════
     ★ 訴え「FEED の投稿は 必ず 削除、再度編集、報告が できるように」。
     ★ できることだけ 並べる。人の投稿に「編集」は 出さない。
     ★ 自分の投稿の 下に付いた 返信は、**投稿の持ち主も 消せる**
       （荒らしを 自分で 片づけられるように。サーバ側も 同じ決まり）。 */
  /* 返信 1 つを 引く。**探し方を 二重に 持たない**（findReply が 本体）。
     id が 数と 文字で 混ざることがあるので、そこだけ 揃える。 */
  function 返信を探す(pid, rid) {
    var r = findReply(pid, rid);
    if (r) return r;
    var rs = st.replies[pid] || [];
    for (var i = 0; i < rs.length; i++) if (String(rs[i].id) === String(rid)) return rs[i];
    return null;
  }
  function メニューを開く(el) {
    var kind = el.dataset.kind || "post";
    var id = el.dataset.mid || "";
    var pid = el.dataset.pid || "";
    if (!id) return;
    var 編集, 削除;
    if (kind === "post") {
      var p = findPost(id);
      var 自分 = !!p && 自分か((p.author || {}).userId);
      編集 = 自分; 削除 = 自分;
    } else {
      var r = 返信を探す(pid, id);
      var 自分2 = !!r && 自分か((r.author || {}).userId);
      var 親 = findPost(pid);
      var 親が自分 = !!親 && 自分か((親.author || {}).userId);
      編集 = 自分2; 削除 = 自分2 || 親が自分;
    }
    /* ボタンの すぐ下に 出す。画面から はみ出さないように 寄せる。 */
    var b = el.getBoundingClientRect();
    var w = 214, x = Math.min(Math.max(8, b.right - w), (window.innerWidth || 360) - w - 8);
    var y = Math.min(b.bottom + 6, (window.innerHeight || 640) - 220);
    st.menu = { kind: kind, id: id, pid: pid, 編集できる: 編集, 削除できる: 削除,
                x: x, y: Math.max(8, y) };
    paintOverlay();
  }
  /* 一覧からの 編集（⋯ を 通さない 近道）。
     ★ **中身は ⋯ の 編集と 同じ 口**（メニューから("edit")）を 通す。
       別に 書くと、片方だけ 直って もう片方が 古いまま 残る。 */
  function 一覧から編集(el) {
    var d = (el && el.dataset) || {};
    var k = String(d.kind || "post");
    var mid = String(d.mid || "");
    if (!mid) return;
    st.menu = { kind: k, id: mid, pid: String(d.pid || ""),
                編集できる: true, 削除できる: false, x: 0, y: 0 };
    メニューから("edit");
  }
  function メニューから(何) {
    var m = st.menu;
    if (!m) return;
    st.menu = null;
    if (何 === "share") {
      paintOverlay();
      openShare(m.kind === "reply" ? "reply" : "post", m.id,
                m.kind === "reply" ? "返信を共有" : "投稿を共有");
      return;
    }
    if (何 === "report") { 報告を開く(m.kind, m.id, m.pid); return; }
    if (何 === "edit") {
      if (m.kind === "post") {
        var p = findPost(m.id);
        if (!p) { paintOverlay(); return; }
        st.pedit = { kind: "post", id: m.id, title: p.title || "", body: p.body || "" };
      } else {
        var r = 返信を探す(m.pid, m.id);
        if (!r) { paintOverlay(); return; }
        st.pedit = { kind: "reply", id: m.id, pid: m.pid, body: r.body || "" };
      }
      paintOverlay();
      return;
    }
    if (何 === "del") { paintOverlay(); 削除する(m.kind, m.id, m.pid); return; }
    paintOverlay();
  }
  function 削除する(kind, id, pid) {
    var 文 = kind === "reply" ? "この返信を削除しますか？" : "この投稿を削除しますか？";
    if (!window.confirm(文 + "\n元には戻せません。")) return;
    var 道 = kind === "reply" ? "/api/posts/reply-delete" : "/api/posts/delete";
    var 荷 = kind === "reply" ? { replyId: id } : { postId: id };
    api(道, { method: "POST", body: 荷 })
      .then(function (j) {
        if (kind === "reply") {
          var rs = st.replies[pid];
          if (rs) st.replies[pid] = rs.filter(function (x) { return String(x.id) !== String(id); });
          var 親 = findPost(pid);
          if (親 && typeof j.replyCount === "number") 親.replyCount = j.replyCount;
          paintReps(pid);
          render();
        } else {
          st.posts = st.posts.filter(function (x) { return String(x.id) !== String(id); });
          /* 詳細を 開いていたなら 一覧へ戻る（消したものを 見せ続けない）。 */
          if (st.view === "detail" && String(st.detailId) === String(id)) {
            st.view = "list"; st.detailId = "";
          }
          render();
        }
        toast(kind === "reply" ? "返信を削除しました" : "投稿を削除しました");
      })
      .catch(function (e) {
        st.error = e.status === 401 ? "ログインが必要です。"
          : e.status === 403 ? "これは削除できません。" : "削除できませんでした。";
        render();
      });
  }
  function 編集を保存() {
    var e = st.pedit;
    if (!e || e.busy) return;
    var w = lbRoot && lbRoot.querySelector('[data-pe="body"]');
    var t = lbRoot && lbRoot.querySelector('[data-pe="title"]');
    var 本文 = w ? String(w.value || "").trim() : "";
    var 題 = t ? String(t.value || "").trim() : "";
    if (!本文 && !題) { st.error = "本文を入力してください。"; render(); return; }
    e.busy = true; paintOverlay();
    var 道 = e.kind === "reply" ? "/api/posts/reply-update" : "/api/posts/update";
    var 荷 = e.kind === "reply" ? { replyId: e.id, body: 本文 }
                                : { postId: e.id, title: 題, body: 本文 };
    api(道, { method: "POST", body: 荷 })
      .then(function () {
        if (e.kind === "reply") {
          var r = 返信を探す(e.pid, e.id);
          if (r) { r.body = 本文; r.updatedAt = Date.now(); }
          paintReps(e.pid);
        } else {
          var p = findPost(e.id);
          if (p) { p.title = 題; p.body = 本文; p.updatedAt = Date.now(); }
        }
        st.pedit = null;
        render();
        toast("編集を保存しました");
      })
      .catch(function (er) {
        e.busy = false;
        st.error = er.status === 401 ? "ログインが必要です。"
          : er.status === 403 ? "これは編集できません。" : "保存できませんでした。";
        render();
      });
  }
  /* ══ 報告の 窓（2026-08-29・訴え）════════════════════════════════
     訴え「いまは システムの モーダル（window.prompt）だから、
           アプリの モーダルに したい。理由を 選ぶ 形に して、
           選んだら その 理由を 書く ところまで。
           その他の ときは、その他が 何なのかを 書いて、
           そのあと その 理由も 書けるように」

     ★ 決めごと
       ・**選ばないと 送れない。**（何を 報告されたのか 分からない 報せは
         受け取っても 動きようが ない）
       ・その他の ときは「どんなことか」も 要る。
       ・くわしい 説明は **任意**（急いで 送りたい ことが ある）。
       ・送り先は これまでと 同じ お問い合わせの 口。**画面の 中で
         受け付けた ふりを しない。** */
  var 報告の理由 = [
    { id: "spam", 名: "スパム・宣伝", 説: "同じ 書き込みの 繰り返し、勧誘、広告" },
    { id: "harassment", 名: "嫌がらせ・攻撃", 説: "特定の 人を 傷つける 書き方" },
    { id: "inappropriate", 名: "不適切な 表現", 説: "性的・暴力的・過激な 中身" },
    { id: "copyright", 名: "著作権・無断転載", 説: "人の 作った ものを 断りなく 使っている" },
    { id: "impersonation", 名: "なりすまし", 説: "別人の ふりを している" },
    { id: "misinfo", 名: "まちがった 情報", 説: "事実と ちがう・誤解を 招く" },
    { id: "privacy", 名: "個人情報が ある", 説: "本名・住所・学校・連絡先 など" },
    { id: "other", 名: "その他", 説: "上に 当てはまらない" }
  ];
  function 理由の名(id) {
    for (var i = 0; i < 報告の理由.length; i++) if (報告の理由[i].id === id) return 報告の理由[i].名;
    return "";
  }
  function 報告を開く(kind, id, pid) {
    var 中身 = kind === "reply" ? (返信を探す(pid, id) || {}) : (findPost(id) || {});
    var 作者 = 中身.author || {};
    st.report = {
      kind: kind, id: id, pid: pid || "",
      理由: "", その他: "", 詳細: "", busy: false, err: "",
      見本: String(中身.title || 中身.body || "").slice(0, 120),
      作者: String(作者.displayName || 作者.nickname || "")
    };
    paintOverlay();
  }
  function 報告の窓() {
    var r = st.report;
    if (!r) return "";
    var 何 = r.kind === "reply" ? "返信" : "投稿";
    var 送れる = !!r.理由 && (r.理由 !== "other" || String(r.その他 || "").trim());
    var h = '<div class="ped"><div class="ped-bd" data-a="rp-bd"></div><div class="ped-w">'
      + "<h2>この" + 何 + "を 報告する</h2>"
      + '<p class="rp-s">見つけた ことを 教えてください。'
      + "中身を 確かめて、必要なら 手を 打ちます。"
      + "**送ったことは 相手に 伝わりません。**".replace(/\*\*/g, "") + "</p>";
    if (r.見本) {
      h += '<div class="rp-prev">'
        + (r.作者 ? "<b>" + esc(r.作者) + "</b>" : "")
        + esc(r.見本) + "</div>";
    }
    h += '<div class="rp-t">どうして 報告しますか？<span class="req">えらぶ</span></div><div class="rp-l">';
    報告の理由.forEach(function (x) {
      var on = r.理由 === x.id;
      h += '<button type="button" class="rp-o" data-a="rp-pick" data-v="' + x.id + '"'
        + ' aria-pressed="' + (on ? "true" : "false") + '">'
        + '<span class="rp-ck"><i></i></span>'
        + '<span><span class="rp-n">' + esc(x.名) + "</span>"
        + '<span class="rp-d">' + esc(x.説) + "</span></span></button>";
    });
    h += "</div>";
    if (r.理由 === "other") {
      h += '<div class="rp-t">どんなことですか？<span class="req">かく</span></div>'
        + '<input data-rp="other" maxlength="60" placeholder="ひとことで（例: 待ち合わせの 約束を 破られた）" value="'
        + esc(r.その他 || "") + '">';
    }
    if (r.理由) {
      h += '<div class="rp-t">くわしく 教えてください<span class="req" style="color:var(--vq-text-tertiary,#9994A8)">なくてもよい</span></div>'
        + '<textarea data-rp="detail" maxlength="1200" placeholder="どこが 気になったか、いつ 見つけたか など">'
        + esc(r.詳細 || "") + "</textarea>";
    }
    if (r.err) h += '<p class="rp-err">' + esc(r.err) + "</p>";
    h += '<div class="ped-f">'
      + '<button class="btn btn--secondary btn--sm" data-a="rp-cancel">やめる</button>'
      + '<button class="btn btn--primary btn--sm" data-a="rp-send"'
      + (r.busy || !送れる ? " disabled" : "") + ">"
      + (r.busy ? "送っています…" : "送る") + "</button></div>";
    return h + "</div></div>";
  }
  /* 打った 中身を 控える（描き直しで 消えないように）。 */
  function 報告を控える() {
    var r = st.report;
    if (!r || !lbRoot) return;
    var o = lbRoot.querySelector('[data-rp="other"]');
    var d = lbRoot.querySelector('[data-rp="detail"]');
    if (o) r.その他 = String(o.value || "");
    if (d) r.詳細 = String(d.value || "");
  }
  function 報告を送る() {
    var r = st.report;
    if (!r || r.busy) return;
    報告を控える();
    if (!r.理由) { r.err = "理由を 選んでください。"; paintOverlay(); return; }
    if (r.理由 === "other" && !String(r.その他 || "").trim()) {
      r.err = "どんなことか、ひとことで 書いてください。"; paintOverlay(); return;
    }
    var 何 = r.kind === "reply" ? "返信" : "投稿";
    var 名 = r.理由 === "other" ? ("その他：" + String(r.その他).trim()) : 理由の名(r.理由);
    var 本文 = [
      "【理由】" + 名,
      "【くわしく】" + (String(r.詳細 || "").trim() || "（記入なし）")
    ].join("\n");
    r.busy = true; r.err = ""; paintOverlay();
    api("/api/support/submit", { method: "POST", body: {
      kind: "report",
      subject: 何 + "の報告：" + 名,
      body: 本文.slice(0, 2000),
      targetType: "post",
      targetId: String(r.id),
      metadata: {
        selectedReason: r.理由,
        selectedReasonLabel: 名,
        otherReason: r.理由 === "other" ? String(r.その他 || "").slice(0, 60) : "",
        targetKind: r.kind,
        parentPostId: String(r.pid || ""),
        targetAuthorHandle: r.作者,
        targetSummary: r.見本
      }
    } })
      .then(function () {
        st.report = null;
        paintOverlay();
        toast("報告しました。確認します。");
      })
      .catch(function (e) {
        r.busy = false;
        r.err = e.status === 401 ? "ログインが 必要です。" : "送れませんでした。少し あとで もう一度 お試しください。";
        paintOverlay();
      });
  }

  /* ★ ここに あった window.prompt の 報告は **外した**（2026-08-29・訴え
     「システムの モーダルを やめて、アプリの モーダルに」）。
     入口は 報告を開く → 報告の窓 → 報告を送る の 1 本だけ。
     2 本 置くと、片方だけ 直って もう片方が 古いまま 残る。 */
  /* 返信への返信。いまの作りは 1 段（投稿の下に 並ぶ）なので、
     **相手の @ を 入れて** 返信欄へ 連れていく。誰への返事かは 残る。 */
  function 返信に返信(pid, rid) {
    var r = 返信を探す(pid, rid);
    if (!r) return;
    var a = r.author || {};
    var 名 = "@" + String(a.handle || a.nickname || "user") + " ";
    if (st.view !== "detail" || String(st.detailId) !== String(pid)) {
      openDetail(pid);
      setTimeout(function () { 返信欄へ(pid, 名); }, 500);
      return;
    }
    返信欄へ(pid, 名);
  }
  function 返信欄へ(pid, 前置き) {
    var ri = root.querySelector('[data-reply-input="' + pid + '"]');
    if (!ri) return;
    if (String(ri.value || "").indexOf(前置き) !== 0) ri.value = 前置き + String(ri.value || "");
    try { ri.focus(); ri.setSelectionRange(ri.value.length, ri.value.length); } catch (e) {}
    try { ri.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
  }

  /* ── 操作 ─────────────────────────────────────────────────── */
  var ACT_KEY = { like: ["liked", "likeCount"], bookmark: ["bookmarked", "bookmarkCount"], repost: ["reposted", "repostCount"] };
  /* ── 押したところだけを塗り替える ──────────────────────────
     ここで render() を呼ぶと一覧を丸ごと作り直すので、画像が読み直され
     「読み込みが入った」ように見えるうえ、見ていた位置も飛ぶ。
     いいね・保存・リポストは **そのボタンだけ** を書き換えて、ぴょんと跳ねさせる。 */
  function eachAct(sel, id, fn) {
    var list = root.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      if (list[i].dataset[id.k] === id.v) fn(list[i]);
    }
  }
  function paintAct(el, on, n) {
    el.setAttribute("aria-pressed", String(!!on));
    var s2 = el.querySelector(".n");
    if (s2) s2.textContent = String(Number(n) || 0);
  }
  function pop(el) {
    el.classList.remove("is-pop");
    /* 続けて押しても毎回跳ねるように、いちど外してから付け直す */
    void el.offsetWidth;
    el.classList.add("is-pop");
  }
  function toggleAction(id, kind) {
    var p = findPost(id), map = ACT_KEY[kind];
    if (!p || !map || st.busy[id + kind]) return;
    var key = map[0], cnt = map[1], next = !p[key];
    p[key] = next;
    p[cnt] = Math.max(0, (Number(p[cnt]) || 0) + (next ? 1 : -1));
    st.busy[id + kind] = 1;
    eachAct('.act[data-a="' + kind + '"]', { k: "id", v: id }, function (el) {
      paintAct(el, next, p[cnt]);
      if (next) pop(el);
    });
    api("/api/posts/action", { method: "POST", body: { postId: id, action: kind, on: next } })
      .then(function (j) {
        if (typeof j.count === "number") p[cnt] = j.count;
        if (typeof j.enabled === "boolean") p[key] = j.enabled;
        eachAct('.act[data-a="' + kind + '"]', { k: "id", v: id }, function (el) { paintAct(el, p[key], p[cnt]); });
      })
      .catch(function (e) {
        p[key] = !next;
        p[cnt] = Math.max(0, (Number(p[cnt]) || 0) + (next ? -1 : 1));
        eachAct('.act[data-a="' + kind + '"]', { k: "id", v: id }, function (el) { paintAct(el, p[key], p[cnt]); });
        /* 失敗したときだけは、理由を出すために描き直す */
        st.error = e.status === 401 ? "ログインが必要です。" : "反映できませんでした。";
        render();
      })
      .then(function () { delete st.busy[id + kind]; });
  }
  function createPost(text) {
    var t = String(text || "").trim();
    /* 本文が空でも、カードが付いていれば投稿できる（サーバ側もそう決めてある） */
    if ((!t && !st.draftCard && !st.draftImgs.length) || st.busy.post) return;
    var card = st.draftCard;
    st.busy.post = 1; st.error = ""; st.compOpen = false; st.draftCard = null; render();
    var imgs = st.draftImgs.slice();
    st.draftImgs = [];
    var payload = { body: t };
    if (card) payload.card = card;
    if (imgs.length) payload.images = imgs;
    api("/api/posts/create", { method: "POST", body: payload })
      .then(function (j) {
        if (j.post) {
          if (!j.post.author) j.post.author = window.__vqFeedMe || { nickname: "あなた", displayName: "あなた" };
          st.posts.unshift(j.post);
        }
        /* 返ってきた投稿はもう手元にある。ここで load() すると
           一覧を丸ごと取り直して、書いた直後に画面が作り直される。 */
        delete st.busy.post; render();
      })
      .catch(function (e) {
        delete st.busy.post;
        st.draftCard = card;      /* 失敗したら添付も戻す（作り直させない） */
        st.draftImgs = imgs;
        st.error = e.status === 401 ? "投稿するにはログインが必要です。"
          : ("投稿できませんでした。" + (e.message ? "（" + e.message + "）" : ""));
        render();
      });
  }
  function createReply(pid, text) {
    var t = String(text || "").trim();
    if (!t || st.busy["r" + pid]) return;
    st.busy["r" + pid] = 1;
    api("/api/posts/replies", { method: "POST", body: { postId: pid, body: t } })
      .then(function (j) {
        if (!st.replies[pid]) st.replies[pid] = [];
        if (j.reply) st.replies[pid].push(j.reply);
        var p = findPost(pid);
        if (p) p.replyCount = (Number(p.replyCount) || 0) + 1;
      })
      .catch(function (e) {
        st.error = e.status === 401 ? "返信するにはログインが必要です。" : "返信できませんでした。";
        st.repFailed = 1;
      })
      .then(function () {
        delete st.busy["r" + pid];
        /* 返信の欄と、返信の数だけを直す。投稿そのものは作り直さない。 */
        if (st.repFailed) { delete st.repFailed; render(); return; }
        paintReps(pid);
        var pp = findPost(pid);
        if (pp) {
          var list = root.querySelectorAll('.act[data-a="open"]');
          for (var i = 0; i < list.length; i++) {
            if (list[i].dataset.id !== pid) continue;
            var n = list[i].querySelector(".n");
            if (n) n.textContent = String(Number(pp.replyCount) || 0);
          }
        }
      });
  }
  /* 画像を選んであげる。あげ終わった URL だけを下書きへ持つ
     （投稿の時点で確実に見られる状態にしておく）。 */
  function chooseImages() {
    var inp = document.createElement("input");
    inp.type = "file";
    /* 動画も選べるようにする（ここが画像だけだったので、選択画面に動画が出なかった） */
    inp.accept = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm";
    inp.multiple = true;
    inp.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var files = Array.prototype.slice.call(inp.files || []).slice(0, 4);
      document.body.removeChild(inp);
      if (!files.length) return;
      st.compOpen = true;
      files.forEach(uploadOne);
    });
    inp.click();
  }
  function isVideoFile(f) { return /^video\//.test(String((f && f.type) || "")); }
  function uploadOne(file) {
    var vid = isVideoFile(file);
    /* 動画は 1 本まで（並べて見せる作りにしていない）。画像は 4 枚まで。 */
    if (vid && st.draftImgs.some(function (u) { return safeVid(u); })) {
      st.error = "動画は 1 本までです。"; render(); return;
    }
    if (!vid && st.draftImgs.filter(function (u) { return safeImg(u); }).length >= 4) return;
    var max = vid ? 64 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > max) {
      st.error = vid ? "動画は 64MB までです。" : "画像は 1 枚 5MB までです。";
      render(); return;
    }
    st.uploading++; st.error = ""; render();
    var h = {};
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    h["Content-Type"] = file.type || "application/octet-stream";
    fetch("/api/upload/image", { method: "POST", headers: h, body: file, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return {}; })
        .then(function (j) { if (!r.ok) { var e = new Error(j.message || "失敗"); e.status = r.status; throw e; } return j; }); })
      .then(function (j) { if (j.url && st.draftImgs.length < 5) st.draftImgs.push(j.url); })
      .catch(function (e) {
        st.error = e.status === 401 ? "画像をあげるにはログインが必要です。"
          : (e.message || "画像をあげられませんでした。");
      })
      .then(function () { st.uploading = Math.max(0, st.uploading - 1); render(); });
  }

  /* 選んだプリセット / 試験を、サーバが受け取る形のカードにする。
     持たせるのは ID と一覧に出す見出しだけ。中身（語や設問）は載せない。 */
  function attachPicked(kind, id) {
    var ST = window.VQ2 && window.VQ2.store;
    st.pick = "";
    try {
      if (kind === "preset" && ST && ST.getPreset) {
        var x = ST.getPreset(id);
        if (x) st.draftCard = {
          type: "preset", presetId: String(x.id || id),
          name: String(x.name || x.title || "名前なし"),
          /* 教科は subjects[] か subjectId のどちらかに入っている */
          subjectLabel: String((x.subjects && x.subjects[0] && (x.subjects[0].label || x.subjects[0].name))
                               || x.subject || ""),
          /* 語数の実体は questions[]（items/words は古い形） */
          itemCount: ((x.questions || x.items || x.words || []) || []).length,
          isPublic: x.visibility === "public" || x.isPublic === true
        };
      } else if (kind === "mock" && ST && ST.mocks && ST.mocks.get) {
        var m = ST.mocks.get(id), sp = (m && (m.spec || m)) || null;
        if (sp) st.draftCard = {
          type: "mock", mockId: String(m.id || id),
          title: String(sp.title || "名前なし"),
          subjectLabel: String(sp.subject || ""),
          gradeLabel: String(sp.grade || ""),
          questionCount: (sp.sections || []).reduce(function (a, sec) {
            return a + ((sec && sec.questions) || []).length; }, 0),
          sectionCount: (sp.sections || []).length,
          totalPoints: Number(sp.totalPoints) || 0,
          durationMinutes: Number(sp.durationMinutes) || 0
        };
      }
    } catch (e) { st.error = "選んだものを添付できませんでした。"; }
    st.compOpen = true;
    render();
  }

  /* ── プロフィールの読み込みと操作 ───────────────────────── */
  function openProfile(uid) {
    st.view = "profile"; st.follows = null; st.pfTab = "posts";
    st.profile = null; st.posts = []; st.pfCounts = null; st.pfBusy = true;
    render();
    var q = uid ? ("/api/profile?userId=" + encodeURIComponent(uid)) : "/api/profile/me";
    api(q)
      .then(function (j) { st.profile = j.profile || null; render(); })
      .catch(function (e) {
        st.pfBusy = false;
        st.error = e.status === 401 ? "ログインが必要です。" : "プロフィールを読み込めませんでした。";
        render();
      });
    loadProfileTimeline(uid, "posts");
  }
  function loadProfileTimeline(uid, tab) {
    st.pfBusy = true; st.posts = []; render();
    var q = "/api/profile/timeline?tab=" + encodeURIComponent(tab) + "&limit=40"
      + (uid ? "&userId=" + encodeURIComponent(uid) : "");
    api(q)
      .then(function (j) {
        st.posts = Array.isArray(j.posts) ? j.posts : [];
        if (j.tabCounts) st.pfCounts = j.tabCounts;
        if (j.profile && !st.profile) st.profile = j.profile;
        st.pfBusy = false; render();
      })
      .catch(function () { st.pfBusy = false; render(); });
  }
  function loadFollows(kind) {
    var uid = st.profile && st.profile.userId;
    st.follows = { kind: kind, list: null, hidden: false };
    render();
    api("/api/profile/follows?kind=" + encodeURIComponent(kind)
        + (uid ? "&userId=" + encodeURIComponent(uid) : "") + "&limit=60")
      .then(function (j) {
        st.follows = { kind: kind, list: j.list || [], hidden: !!j.hidden };
        render();
      })
      .catch(function () { st.follows = { kind: kind, list: [], hidden: false }; render(); });
  }
  function toggleFollow(uid) {
    var p = st.profile;
    if (!p || st.busy["f" + uid]) return;
    var next = !p.isFollowing;
    p.isFollowing = next;
    p.followers = Math.max(0, (Number(p.followers) || 0) + (next ? 1 : -1));
    st.busy["f" + uid] = 1;
    render();
    api("/api/follow/toggle", { method: "POST", body: { targetUserId: Number(uid), on: next } })
      .then(function (j) {
        if (typeof j.following === "boolean") p.isFollowing = j.following;
        if (typeof j.followers === "number") p.followers = j.followers;
      })
      .catch(function (e) {
        p.isFollowing = !next;
        p.followers = Math.max(0, (Number(p.followers) || 0) + (next ? -1 : 1));
        st.error = e.status === 401 ? "ログインが必要です。" : "反映できませんでした。";
      })
      .then(function () { delete st.busy["f" + uid]; render(); });
  }

  /* 一覧に無い投稿（共有リンクで来たとき）は 1 件だけ取りに行く */
  function fetchPost(id) {
    api("/api/posts/item?postId=" + encodeURIComponent(id))
      .then(function (j) {
        if (j && j.post && !findPost(j.post.id)) { st.posts = st.posts.concat([j.post]); render(); }
      })
      .catch(function (e) {
        if (st.view === "detail" && st.detailId === id)
          st.error = e.status === 401 ? "この投稿を見るにはログインが必要です。"
            : (e.message || "この投稿は表示できません。");
        render();
      });
  }
  function openDetail(id) {
    st.view = "detail"; st.detailId = id;
    if (st.replies[id] === undefined) loadReplies(id);
    if (!findPost(id)) fetchPost(id);
    render();
    try { root.querySelector(".wrap").scrollIntoView({ block: "start" }); } catch (e) {}
  }

  function wire() {
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && (el.dataset.a || el.dataset.tab || el.dataset.act || el.dataset.open))) el = el.parentNode;
      if (!el || el === root) return;

      /* Feed 上部のタブ。プロフィールのタブも data-tab を持つので、
         そちらは data-a で見分けて先に外す（横取りしない）。 */
      if (el.dataset.tab && !el.dataset.a) {
        if (st.tab === el.dataset.tab) return;
        st.tab = el.dataset.tab; st.posts = []; load(); return;
      }
      if (el.dataset.act === "focus-composer") {
        var ta = root.querySelector("[data-composer]");
        if (ta) { st.compOpen = true; render(); root.querySelector("[data-composer]").focus(); }
        return;
      }
      if (el.dataset.act === "post") {
        var t = root.querySelector("[data-composer]");
        createPost(t ? t.value : "");
        if (t) t.value = "";
        return;
      }
      var a = el.dataset.a, id = el.dataset.id;
      if (a === "back") { st.view = "list"; st.posts = []; load(); return; }
      if (a === "pf-open") { openProfile(el.dataset.uid); return; }
      if (a === "pf-tab") {
        if (st.pfTab === el.dataset.tab) return;
        st.pfTab = el.dataset.tab;
        loadProfileTimeline(st.profile && st.profile.isSelf ? "" : (st.profile && st.profile.userId), st.pfTab);
        return;
      }
      if (a === "pf-follows") { loadFollows(el.dataset.kind); return; }
      if (a === "fl-back") { st.follows = null; render(); return; }
      if (a === "pf-follow") { toggleFollow(el.dataset.uid); return; }
      if (a === "pf-edit") { openEdit(); return; }
      if (a === "pf-share") {
        var pp2 = st.profile;
        openShare("profile", el.dataset.uid,
          pp2 ? ((pp2.displayName || pp2.nickname || "この人") + " を共有") : "プロフィールを共有");
        return;
      }
      if (a === "more") {
        /* 畳んだ本文を開くだけ。ここで描き直すと画像まで読み直される。 */
        st.expand[id] = true;
        var box = el.parentNode ? el.parentNode.querySelector(".txt.is-fold") : null;
        if (box) { box.classList.remove("is-fold"); el.parentNode.removeChild(el); return; }
        render(); return;
      }
      if (a === "open") { openDetail(id); return; }
      if (a === "like" || a === "bookmark" || a === "repost") { toggleAction(id, a); return; }
      if (a === "reply") {
        var ri = root.querySelector('[data-reply-input="' + id + '"]');
        createReply(id, ri ? ri.value : "");
        if (ri) ri.value = "";
        return;
      }
      if (a === "share") { openShare("post", id, "投稿を共有"); return; }
      /* ── ⋯ を押した（2026-08-19）── */
      if (a === "menu") { メニューを開く(el); return; }
      /* ★ 一覧から そのまま 編集（2026-08-29・訴え）。
         札は **本体の 側**に あるので、ここで 受ける
         （窓の 側の 受け口だけでは 届かない）。 */
      if (a === "quick-edit") { 一覧から編集(el); return; }
      /* ── 返信の 5 つ（投稿と同じ扱い）── */
      if (a === "r-like" || a === "r-bookmark" || a === "r-repost") {
        toggleReplyAction(el.dataset.pid, el.dataset.rid, a);
        return;
      }
      if (a === "r-reply") { 返信に返信(el.dataset.pid, el.dataset.rid); return; }
      if (a === "r-share") { openShare("reply", el.dataset.rid, "返信を共有"); return; }
      if (a === "search") {
        if (window.__vqCmdk) window.__vqCmdk.open();
        else if (window.__vqPresetSearch) window.__vqPresetSearch("");
        return;
      }
      if (a === "news") { try { document.body.setAttribute("data-app-tab", "news"); } catch (err) {} return; }
      /* ── 押して大きく見る ── */
      if (a === "zoom") {
        var pp = findPost(el.dataset.post);
        var lst = pp ? (pp.images || []).map(safeImg).filter(Boolean) : [];
        if (lst.length) { st.lb = { list: lst, i: Number(el.dataset.i) || 0 }; render(); }
        return;
      }
      if (a === "lb-close" || a === "lb-bd") { st.lb = null; render(); return; }
      if (a === "lb-img") return;                       /* 画像そのものは閉じない */
      if (a === "lb-prev" && st.lb) {
        st.lb.i = (st.lb.i - 1 + st.lb.list.length) % st.lb.list.length; render(); return;
      }
      if (a === "lb-next" && st.lb) {
        st.lb.i = (st.lb.i + 1) % st.lb.list.length; render(); return;
      }
      /* ── 動画（自前の再生バー）── */
      if (a === "m-prev" || a === "m-next") {
        var rail = el.closest("[data-mrail]");
        var tr = rail && rail.querySelector("[data-mtrack]");
        if (tr) tr.scrollLeft += (a === "m-next" ? 1 : -1) * tr.clientWidth;
        return;
      }
      /* ★ 動画（v-play / v-rate / v-full）は **VQVID が 受ける**。
         ここに 同じ枝を 残すと 二重に 効く（押すたび 2 回 動く）。 */
      /* ── 返信 ──
         ★ いいね / 保存 / リポストは **上の 1 か所**で受ける（2026-08-19）。
           ここに 同じ枝を 残すと、上で 処理されて ここは 二度と 通らず、
           直すときに どちらを直せばよいか 分からなくなる。 */
      if (a === "more-replies") { loadReplies(id, st.repMore[id]); return; }

      if (a === "pick-img") { chooseImages(); return; }
      if (a === "drop-img") {
        st.draftImgs.splice(Number(el.dataset.i) || 0, 1); st.compOpen = true; render(); return;
      }
      if (a === "pick") { st.pick = el.dataset.kind || ""; render(); return; }
      if (a === "pick-close" || a === "pick-bd") { st.pick = ""; render(); return; }
      if (a === "pick-one") { attachPicked(st.pick, id); return; }
      if (a === "drop-card") { st.draftCard = null; render(); return; }
      if (a === "open-preset") {
        /* プリセットを開く。導線は本体側が持っているので、そこへ渡す。 */
        var pid = el.dataset.pid;
        if (window.__vqOpenPreset) window.__vqOpenPreset(pid);
        else if (window.VQ2 && window.VQ2.presetDetail && window.VQ2.presetDetail.open)
          window.VQ2.presetDetail.open({ presetId: pid });
        else document.body.setAttribute("data-app-tab", "library");
        return;
      }
      if (a === "open-mock") {
        var mid = el.dataset.mid;
        if (window.VQ2 && window.VQ2.quickMock && window.VQ2.quickMock.open)
          window.VQ2.quickMock.open({ mockId: mid });
        return;
      }
      /* 操作以外の場所を押したら詳細へ（X と同じ） */
      if (el.dataset.open) { openDetail(el.dataset.open); return; }
    });

    /* ★ 動画の 動かしかた（進み具合・引っ込め・掴んで動かす）は
       **core/feed/video.js（VQVID）**が 持つ（2026-08-20）。
       News でも 同じものを 使うため、ここには 置かない。 */
    try { if (window.VQVID && window.VQVID.結線) window.VQVID.結線(root); } catch (e) {}


    /* 指で流したときに、いま何枚目かの点を合わせる */
    root.addEventListener("scroll", function (e) {
      var tr = e.target;
      if (!tr || !tr.dataset || tr.dataset.mtrack === undefined) return;
      var rail = tr.closest("[data-mrail]");
      var dots = rail && rail.querySelectorAll(".mrail-dot");
      if (!dots || !dots.length || !tr.clientWidth) return;
      var i = Math.round(tr.scrollLeft / tr.clientWidth);
      for (var k = 0; k < dots.length; k++) dots[k].classList.toggle("is-on", k === i);
    }, true);

    /* 全画面の 出入りも VQVID が 見る。 */

    root.addEventListener("keydown", function (e) {
      /* 大きく見ているとき: Esc で閉じる、← → で送る */
      if (st.lb) {
        if (e.key === "Escape") { st.lb = null; render(); e.preventDefault(); return; }
        if (e.key === "ArrowLeft") { st.lb.i = (st.lb.i - 1 + st.lb.list.length) % st.lb.list.length; render(); e.preventDefault(); return; }
        if (e.key === "ArrowRight") { st.lb.i = (st.lb.i + 1) % st.lb.list.length; render(); e.preventDefault(); return; }
      }
      /* 再生位置の バーの キーボード操作も VQVID が 見る。 */
      if (e.target && e.target.closest && e.target.closest('[data-a="v-seek"]')) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      var el = e.target;
      if (el && el.dataset && el.dataset.open) { e.preventDefault(); openDetail(el.dataset.open); }
    });

    root.addEventListener("focusin", function (e) {
      if (e.target && e.target.dataset && e.target.dataset.composer !== undefined && !st.compOpen) {
        st.compOpen = true;
        var v = e.target.value;
        render();
        var ta = root.querySelector("[data-composer]");
        if (ta) { ta.value = v; ta.focus(); }
      }
    });

    root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || t.tagName !== "TEXTAREA") return;
      t.style.height = "auto";
      t.style.height = Math.min(t.scrollHeight, 260) + "px";
      if (t.dataset.composer !== undefined) {
        var n = t.value.length, c = root.querySelector("[data-count]");
        var btn = root.querySelector('[data-act="post"]');
        if (c) { c.textContent = n + " / 1000"; c.classList.toggle("is-over", n > 1000); }
        if (btn) btn.disabled = (!t.value.trim() && !st.draftCard && !st.draftImgs.length)
          || n > 1000 || !!st.busy.post;
      }
    });
  }

  /* 大きく見ているときは、画面のどこで Esc を押しても閉じられるようにする
     （Shadow の中に焦点が無いことがあるため）。 */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (st.lb) { st.lb = null; render(); return; }
    if (st.share) { st.share = null; paintOverlay(); return; }
    if (st.edit) { closeEdit(); return; }
  });

  function loadMe() {
    api("/api/auth/me").then(function (j) {
      if (j && j.user) {
        window.__vqFeedMe = { nickname: j.user.nickname, displayName: j.user.nickname,
                              handle: j.user.nickname, userId: j.user.id };
        if (mounted) render();
      }
    }).catch(function () {});
  }
  /* 本体のメニュー（プロフィール）からも開けるようにする。
     旧プロフィール画面は #appInboxPage の中にあり、こちらが隠しているので、
     この入口を用意しないとどこからも見られなくなる。 */
  /* 結果画面など、外から「これを添えて投稿したい」と渡してくる入口。
     旧エディタは #appInboxPage の中にあり、こちらが隠しているので、
     ここが無いと共有の行き先が無くなる。 */
  window.__vqFeedCompose = function (o) {
    o = o || {};
    document.body.setAttribute("data-app-tab", "inbox");
    setTimeout(function () {
      mount();
      st.view = "list";
      st.compOpen = true;
      if (o.card && o.card.type) st.draftCard = o.card;
      render();
      /* 投稿欄は state と結びついていないので、描き直しが挟まると
         入れた文字が消える。少しあとにもう一度入れ直して確かめる。 */
      var put = function () {
        var ta = root.querySelector("[data-composer]");
        if (!ta) return false;
        if (ta.value !== String(o.body || "")) {
          ta.value = String(o.body || "");
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return true;
      };
      put();
      setTimeout(put, 120);
      setTimeout(function () {
        put();
        var ta = root.querySelector("[data-composer]");
        if (ta) { try { ta.focus(); } catch (e) {} }
      }, 320);
      try { root.querySelector(".wrap").scrollIntoView({ block: "start" }); } catch (e) {}
    }, 0);
  };
  window.__vqOpenProfile = function (uid) {
    document.body.setAttribute("data-app-tab", "inbox");
    setTimeout(function () { mount(); openProfile(uid || ""); }, 0);
  };
  function syncTab() {
    if (document.body.getAttribute("data-app-tab") === "inbox") mount();
  }
  /* 共有された住所（?u= / ?post=）で来たら、その画面をそのまま開く。
     一度使った印は消す（読み直すたびに飛ばされないように）。 */
  function routeFromUrl() {
    var q;
    try { q = new URLSearchParams(location.search || ""); } catch (e) { return false; }
    var uid = q.get("u"), pid = q.get("post");
    if (!uid && !pid) return false;
    try {
      q.delete("u"); q.delete("post");
      var qs = q.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch (e) {}
    try { document.body.setAttribute("data-app-tab", "inbox"); } catch (e) {}
    setTimeout(function () {
      mount();
      if (uid && /^[0-9]+$/.test(uid)) openProfile(uid);
      else if (pid) openDetail(pid);
    }, 0);
    return true;
  }
  function boot() {
    loadMe(); syncTab(); routeFromUrl();
    new MutationObserver(syncTab)
      .observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

