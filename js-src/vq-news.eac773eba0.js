
/* ══════════════════════════════════════════════════════════════════════
   vq-news — NEWS を Studio の見た目で建て直す

   旧 #appNewsPage の中身は **消さずに隠し**、この層を上に置く（vq-feed と同じ）。

   できること（すべて実際の API に繋いである）:
     ・一覧（表紙・カテゴリ・日付・要約・未読の印）
     ・カテゴリで絞る / 言葉で探す / 未読だけ見る
     ・押すと本文へ。開いた時点で既読にする
     ・「すべて既読にする」。ナビの赤い印もその場で合わせる
     ・管理者のときだけ、書く / 直す / 消す（下書きも見える）

   繋いでいる API:
     GET  /api/news/list           （?drafts=1 は管理者のみ）
     GET  /api/news/item?id=
     POST /api/news/read           {id} または {} で全件
     POST /api/admin/news/save     {adminKey, ...}
     POST /api/admin/news/delete   {adminKey, id}

   本文は **HTML として出さない**。段落と改行だけを組み立てる。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqNewsInstalled) return;
  window.__vqNewsInstalled = true;

  var TOKEN_KEY = "app.auth.token.v1";
  var ADMIN_KEY_STORE = "vq_admin_key";

  function token() {
    try { return String(localStorage.getItem(TOKEN_KEY) || "").trim(); } catch (e) { return ""; }
  }
  function adminKey() {
    try { return String(localStorage.getItem(ADMIN_KEY_STORE) || "").trim(); } catch (e) { return ""; }
  }
  function askAdminKey() {
    var k = adminKey();
    if (k) return k;
    var v = window.prompt("管理キーを入力してください（この端末に保存します）");
    var s = String(v || "").trim();
    if (s) { try { localStorage.setItem(ADMIN_KEY_STORE, s); } catch (e) {} }
    return s;
  }
  function isAdmin() { return !!window.__vqIsAdmin || !!adminKey(); }

  function api(path, opts) {
    opts = opts || {};
    var h = { "Content-Type": "application/json" };
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    if (opts.admin) h["x-admin-key"] = opts.admin;
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
    ".wrap{max-width:calc(1100px * var(--vq-width-scale,1));margin:0 auto;padding:0 20px 96px;}",
    "@media (max-width:1023px){.wrap{padding:0 14px 96px;}}",

    /* 見出しの帯 */
    ".head{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;padding:22px 0 16px;}",
    ".head .t{flex:1;min-width:220px;}",
    ".head h1{font-size:26px;font-weight:700;letter-spacing:-.01em;}",
    ".head p{margin-top:5px;font-size:13.5px;color:var(--vq-text-secondary,#6B6480);}",
    ".head .acts{display:flex;gap:8px;flex-wrap:wrap;}",

    ".btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;",
      "height:38px;padding:0 16px;border-radius:999px;border:1px solid transparent;white-space:nowrap;",
      "font-size:13.5px;font-weight:700;transition:background .15s ease,border-color .15s ease,opacity .15s ease;}",
    ".btn svg{width:15px;height:15px;flex:0 0 auto;}",
    ".btn--primary{background:var(--vq-accent,#8A81C2);color:var(--vq-accent-contrast,#fff);}",
    ".btn--primary:hover{background:var(--vq-accent-hover,#7C73B5);}",
    ".btn--secondary{background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);",
      "border-color:var(--vq-border-subtle,#E7E4EF);}",
    ".btn--secondary:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".btn:disabled{opacity:.45;cursor:default;}",
    ".btn--sm{height:32px;padding:0 13px;font-size:12.5px;}",

    /* 探す・絞る */
    ".tools{display:flex;flex-direction:column;gap:12px;padding-bottom:18px;}",
    ".srch{position:relative;max-width:420px;}",
    ".srch svg{position:absolute;left:13px;top:50%;translate:0 -50%;width:16px;height:16px;",
      "color:var(--vq-text-tertiary,#9994A8);pointer-events:none;}",
    ".srch input{width:100%;font:inherit;font-size:14.5px;color:var(--vq-text,#2B2836);",
      "background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "border-radius:999px;padding:9px 14px 9px 38px;outline:0;",
      "transition:border-color .14s ease,box-shadow .14s ease;}",
    ".srch input:focus{border-color:var(--vq-accent,#8A81C2);",
      "box-shadow:0 0 0 3px color-mix(in srgb,var(--vq-accent,#8A81C2) 22%,transparent);}",
    ".chips{display:flex;gap:7px;flex-wrap:wrap;}",
    ".chip{display:inline-flex;align-items:center;gap:6px;cursor:pointer;padding:6px 13px;",
      "border-radius:999px;border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "background:var(--vq-surface,#fff);font-size:12.5px;font-weight:600;",
      "color:var(--vq-text-secondary,#6B6480);white-space:nowrap;}",
    ".chip:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".chip[aria-selected=\"true\"]{background:var(--vq-accent-subtle,#EAE8F7);",
      "border-color:var(--vq-accent,#8A81C2);color:var(--vq-accent-text,#5F5691);font-weight:700;}",
    ".chip .c{font-variant-numeric:tabular-nums;opacity:.7;}",
    ".chip svg{width:13px;height:13px;}",

    /* 一覧 */
    ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}",
    "@media (max-width:640px){.grid{grid-template-columns:minmax(0,1fr);gap:12px;}}",
    ".card{display:flex;flex-direction:column;text-align:left;cursor:pointer;overflow:hidden;",
      "background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease;}",
    ".card:hover{border-color:var(--vq-accent,#8A81C2);transform:translateY(-2px);",
      "box-shadow:0 8px 22px rgba(84,72,140,.10);}",
    ".card .cover{height:140px;background:var(--vq-surface-sunken,#F4F2FB);flex:none;}",
    ".card .cover img{width:100%;height:100%;object-fit:cover;display:block;}",
    /* 表紙の画像が無いお知らせにも、種類が分かる絵を置く。
       色で意味を増やさないよう、絵は 1 色。見分けるのは かたち。 */
    ".cover--art{position:relative;display:grid;place-items:center;overflow:hidden;",
      "background:linear-gradient(135deg,var(--vq-accent-subtle,#EAE8F7),var(--vq-surface-sunken,#F4F2FB));}",
    ".cover--art::after{content:\"\";position:absolute;inset:0;pointer-events:none;",
      "background-image:repeating-linear-gradient(135deg,rgba(138,129,194,.10) 0 1px,transparent 1px 12px);}",
    ".cover--art svg{position:relative;width:46px;height:46px;",
      "color:var(--vq-accent,#8A81C2);opacity:.52;}",
    /* 本文の上。実物の写真は大きく、代わりの絵は控えめに。 */
    ".art .cover--art{height:150px;}",
    ".art .cover--art svg{width:56px;height:56px;}",
    "@media (max-width:640px){.art .cover--art{height:118px;}.art .cover--art svg{width:44px;height:44px;}}",
    ".card .cb{padding:14px 16px 16px;display:flex;flex-direction:column;gap:7px;flex:1;min-width:0;}",
    ".meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;",
      "color:var(--vq-text-tertiary,#9994A8);}",
    ".kind{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;",
      "font-size:11px;font-weight:700;background:var(--vq-surface-sunken,#F4F2FB);",
      "color:var(--vq-text-secondary,#6B6480);border:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".kind svg{width:11px;height:11px;}",
    ".kind--important{background:var(--vq-warning-bg,#FDF3E6);border-color:var(--vq-warning-bg,#F0DCBE);color:var(--vq-warning-text,#8A6A20);}",
    ".kind--draft{background:var(--vq-surface-sunken,#F4F2FB);border-color:var(--vq-border,#DDD8EE);color:var(--vq-accent-text,#5F5691);}",
    ".new{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;",
      "color:var(--vq-accent-text,#5F5691);}",
    ".new i{width:7px;height:7px;border-radius:50%;background:var(--vq-accent,#8A81C2);display:block;}",
    ".card h3{font-size:15.5px;font-weight:700;line-height:1.55;",
      "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}",
    ".card p{font-size:13px;line-height:1.75;color:var(--vq-text-secondary,#6B6480);",
      "display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}",
    ".card .adm{display:flex;gap:6px;margin-top:auto;padding-top:10px;}",

    /* 本文 */
    ".dhead{display:flex;align-items:center;gap:10px;padding:14px 0;position:sticky;top:0;z-index:2;",
      "background:color-mix(in srgb,var(--vq-bg,#FBFAFE) 88%,transparent);",
      "-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}",
    ".back{width:36px;height:36px;flex:none;border:0;border-radius:50%;background:transparent;",
      "cursor:pointer;display:grid;place-items:center;color:var(--vq-text,#2B2836);}",
    ".back:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".back svg{width:18px;height:18px;}",
    ".dhead h2{font-size:16px;font-weight:700;}",
    ".art{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));overflow:hidden;}",
    ".art .cover{height:220px;background:var(--vq-surface-sunken,#F4F2FB);}",
    ".art .cover img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".art .in{padding:22px 24px 26px;}",
    "@media (max-width:640px){.art .in{padding:18px 16px 22px;}.art .cover{height:160px;}}",
    ".art h1{margin-top:10px;font-size:22px;font-weight:700;line-height:1.5;letter-spacing:-.01em;}",
    ".art .sum{margin-top:9px;font-size:14px;line-height:1.85;color:var(--vq-text-secondary,#6B6480);}",
    ".body{margin-top:18px;padding-top:18px;border-top:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".body p{font-size:14.5px;line-height:2;word-break:break-word;}",
    ".body p + p{margin-top:15px;}",
    ".body .none{color:var(--vq-text-tertiary,#9994A8);font-size:13.5px;}",
    /* 添えもの（画像・動画）。動画の 見た目は VQVID が 持つ（2026-08-20）。 */
    ".media{margin-top:16px;display:flex;flex-direction:column;gap:12px;}",
    ".media-i{width:100%;display:block;border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".media .vid{margin-top:0;}",
    ".art .lnk{margin-top:20px;}",
    ".art .lnk a{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 18px;",
      "border-radius:999px;background:var(--vq-accent,#8A81C2);color:var(--vq-accent-contrast,#fff);text-decoration:none;",
      "font-size:14px;font-weight:700;}",
    ".art .lnk a:hover{background:var(--vq-accent-hover,#7C73B5);}",
    ".art .lnk svg{width:15px;height:15px;}",

    /* 空・待ち・失敗 */
    ".empty{text-align:center;padding:64px 20px;}",
    ".empty .ico{width:64px;height:64px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;",
      "background:var(--vq-surface-sunken,#F4F2FB);color:var(--vq-text-tertiary,#9994A8);}",
    ".empty .ico svg{width:26px;height:26px;}",
    ".empty h3{font-size:16px;font-weight:700;}",
    ".empty p{margin-top:7px;font-size:13.5px;color:var(--vq-text-secondary,#6B6480);}",
    ".err{margin-bottom:14px;padding:11px 14px;border-radius:calc(10px * var(--vq-r-scale,1));background:var(--vq-danger-bg,#FDF1F0);color:var(--vq-danger-text,#8E3A34);",
      "font-size:13px;border:1px solid var(--vq-danger-bg,#F3D6D3);}",
    ".sk{height:190px;border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));background:var(--vq-surface-sunken,#F4F2FB);",
      "animation:vqnPulse 1.25s ease-in-out infinite;}",
    "@keyframes vqnPulse{0%,100%{opacity:1}50%{opacity:.55}}",

    /* かぶせる画面（管理の編集） */
    ".ovl{position:fixed;inset:0;background:rgba(24,22,34,.55);",
      "-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);",
      "display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;",
      "animation:vqnFade .18s ease both;}",
    "@keyframes vqnFade{from{opacity:0}to{opacity:1}}",
    ".sheet{width:min(640px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;",
      "background:var(--vq-surface,#fff);border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));overflow:hidden;",
      "box-shadow:0 18px 60px rgba(24,22,34,.34);animation:vqnUp .24s cubic-bezier(.22,1,.36,1) both;}",
    "@keyframes vqnUp{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}",
    ".sh-h{display:flex;align-items:center;gap:10px;padding:11px 14px;flex:none;",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".sh-h h2{flex:1;font-size:17px;font-weight:700;}",
    ".sh-x{width:34px;height:34px;flex:none;border:0;border-radius:50%;background:transparent;",
      "cursor:pointer;display:grid;place-items:center;color:var(--vq-text-secondary,#6B6480);}",
    ".sh-x:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".sh-x svg{width:18px;height:18px;}",
    ".sh-b{flex:1;min-height:0;overflow:auto;padding:18px 20px;display:grid;gap:15px;}",
    ".sh-f{flex:none;display:flex;align-items:center;gap:8px;padding:11px 14px;",
      "border-top:1px solid var(--vq-border-subtle,#E7E4EF);}",
    ".sh-f .sp{flex:1;}",
    ".fld{display:grid;gap:6px;}",
    ".fld>label,.fld>.lg{font-size:12.5px;font-weight:700;color:var(--vq-text-secondary,#6B6480);}",
    ".fld input[type=\"text\"],.fld input[type=\"url\"],.fld input[type=\"date\"],.fld textarea{",
      "width:100%;font:inherit;font-size:14.5px;color:var(--vq-text,#2B2836);",
      "background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF);",
      "border-radius:calc(10px * var(--vq-r-scale,1));padding:9px 12px;outline:0;}",
    ".fld textarea{resize:vertical;min-height:180px;line-height:1.9;}",
    ".fld input:focus,.fld textarea:focus{border-color:var(--vq-accent,#8A81C2);",
      "box-shadow:0 0 0 3px color-mix(in srgb,var(--vq-accent,#8A81C2) 22%,transparent);}",
    ".fld .note{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);line-height:1.6;}",
    ".sw{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:14px;font-weight:600;}",
    ".sw input{width:18px;height:18px;accent-color:var(--vq-accent,#8A81C2);cursor:pointer;}",
    ".seg{display:flex;gap:6px;flex-wrap:wrap;}",
    ".seg button{flex:1;min-width:110px;cursor:pointer;padding:9px 12px;border-radius:calc(10px * var(--vq-r-scale,1));",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);background:var(--vq-surface,#fff);",
      "font-size:13.5px;font-weight:600;color:var(--vq-text-secondary,#6B6480);}",
    ".seg button:hover{background:var(--vq-surface-sunken,#F4F2FB);}",
    ".seg button[aria-pressed=\"true\"]{background:var(--vq-accent-subtle,#EAE8F7);",
      "border-color:var(--vq-accent,#8A81C2);color:var(--vq-accent-text,#5F5691);font-weight:700;}",
    ".btn--danger{background:var(--vq-surface,#fff);border-color:var(--vq-danger-bg,#F0D3D0);color:var(--vq-danger-text,#B4564F);}",
    ".btn--danger:hover{background:var(--vq-danger-bg,#FDF1F0);}",
    ".ed-err{margin:0 20px 4px;padding:10px 12px;border-radius:calc(10px * var(--vq-r-scale,1));background:var(--vq-danger-bg,#FDF1F0);",
      "color:var(--vq-danger-text,#8E3A34);font-size:13px;border:1px solid var(--vq-danger-bg,#F3D6D3);}",

    ".toast{position:fixed;left:50%;bottom:28px;translate:-50% 0;pointer-events:none;",
      "display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:999px;",
      /* ★ 背景に var(--vq-text) を使うと、ダークでは白地に白文字になる。
         トーストは明暗どちらでも黒地・白文字で固定する（2026-08-15）。 */
      "background:#1B1922;color:#FFFFFF;border:1px solid rgba(255,255,255,.16);",
      "font-size:13.5px;font-weight:600;",
      "box-shadow:0 8px 26px rgba(24,22,34,.3);animation:vqnToast .22s cubic-bezier(.22,1,.36,1) both;}",
    ".toast svg{width:15px;height:15px;}",
    "@keyframes vqnToast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}",
    "@media (max-width:640px){.ovl{padding:0;align-items:flex-end;}",
      ".sheet{width:100%;max-height:92vh;border-radius:calc(16px * var(--vq-r-scale,1)) calc(16px * var(--vq-r-scale,1)) 0 0;}",
      ".sh-b{padding:16px 14px;}.ed-err{margin:0 14px 4px;}}",
    "@media (max-width:640px){.head{padding:8px 0 12px;}.head h1{font-size:23px;}",
      ".head .acts{width:100%;}.head .acts .btn{flex:1;}.srch{max-width:none;}}",
    ".fadein{animation:vqnIn .28s cubic-bezier(.22,1,.36,1) both;}",
    "@keyframes vqnIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    "@media (prefers-reduced-motion:reduce){.fadein,.sk,.card{animation:none !important;transition:none !important;}}"
  ].join("");

  var ICON = {
    back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    check: '<path d="M4 12.5l5.2 5.2L20 7"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    warn: '<path d="M12 3l9.5 16.5H2.5z"/><path d="M12 10v4"/><path d="M12 17.6v.01"/>',
    ext: '<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    draft: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    gift: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18"/><path d="M12 9v12"/><path d="M12 9S9.5 4 7.5 4a2.5 2.5 0 0 0 0 5z"/><path d="M12 9s2.5-5 4.5-5a2.5 2.5 0 0 1 0 5z"/>'
  };
  function svg(k) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + "</svg>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* 表紙は http(s) のときだけ使う。CSS へ差し込まず <img> で敷く。 */
  function safeCover(u) {
    var v = String(u || "").trim();
    return /^https?:\/\//i.test(v) ? v : "";
  }
  /* 表紙の画像が無いお知らせ用の絵。種類ごとに かたち を変える。
     画像を作り話で用意しない（あるように見せない）。 */
  var CAT_ART = {
    update: "refresh", feature: "spark", maintenance: "wrench",
    incident: "warn", campaign: "gift", notice: "bell"
  };
  function coverHtml(x) {
    var u = safeCover(x && x.coverUrl);
    if (u) return '<div class="cover"><img src="' + esc(u) + '" alt="" loading="lazy"></div>';
    var k = CAT_ART[String((x && x.category) || "").toLowerCase()] || "bell";
    return '<div class="cover cover--art" role="img" aria-label="'
      + esc(catLabel(x && x.category)) + 'のお知らせ">' + svg(k) + "</div>";
  }
  function dateJa(ms) {
    var t = new Date(Number(ms) || 0);
    if (!isFinite(t.getTime()) || !ms) return "";
    return t.getFullYear() + "年" + (t.getMonth() + 1) + "月" + t.getDate() + "日";
  }
  function dateInput(ms) {
    var t = new Date(Number(ms) || Date.now());
    if (!isFinite(t.getTime())) t = new Date();
    var p = function (x) { return String(x).padStart(2, "0"); };
    return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
  }
  /* ══ 添えもの（画像・動画）（2026-08-20・訴え）══════════════════
     「画像や 動画は アップできないの？　動画の 再生バーとかは
       News の 表示でも Feed と 同じものを 使いたい」
     ★ 置き場は **自分のところだけ**（/api/media/...）。外の URL は 出さない。
     ★ 動画は VQVID（Feed と 同じ 再生バー）。読めていない ときは 素の <video>。 */
  function 添えものHtml(x) {
    var a = (x && Array.isArray(x.media)) ? x.media : [];
    var 出 = a.filter(function (m) {
      return m && /^\/api\/media\/(img|vid)\/[A-Za-z0-9._-]+$/.test(String(m.url || ""));
    }).slice(0, 8);
    if (!出.length) return "";
    var h = '<div class="media">';
    出.forEach(function (m) {
      if (m.kind === "video") {
        try {
          if (window.VQVID && window.VQVID.html) { h += window.VQVID.html(m.url); return; }
        } catch (e) {}
        h += '<div class="vid" data-vid><video src="' + esc(m.url) + '" controls playsinline data-v></video></div>';
      } else {
        h += '<img class="media-i" src="' + esc(m.url) + '" alt="" loading="lazy">';
      }
    });
    return h + "</div>";
  }

  /* 本文は素の文字として組む。空行で段落、単の改行は <br>。 */
  function bodyHtml(text) {
    var t = String(text == null ? "" : text);
    if (!t.trim()) return '<p class="none">本文はまだありません。</p>';
    return t.split(/\n{2,}/).map(function (p) {
      return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  var CATS = [
    { id: "update", label: "アップデート" },
    { id: "feature", label: "新機能" },
    { id: "maintenance", label: "メンテナンス" },
    { id: "incident", label: "障害情報" },
    { id: "campaign", label: "キャンペーン" },
    { id: "notice", label: "お知らせ" }
  ];
  function catLabel(c) {
    var k = String(c || "").toLowerCase();
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === k) return CATS[i].label;
    return "お知らせ";
  }

  /* ── 状態 ─────────────────────────────────────────────────── */
  var host = null, root = null, mounted = false;
  var st = {
    view: "list", id: "",
    items: null, unread: 0, loading: false, error: "",
    cat: "", q: "", unreadOnly: false,
    item: null, itemBusy: false,
    edit: null, toast: "", busy: false
  };

  function mount() {
    var page = document.getElementById("appNewsPage");
    if (!page || document.getElementById("vqNews")) return;
    for (var i = 0; i < page.children.length; i++) {
      var ch = page.children[i];
      if (ch.id === "vqNews") continue;
      ch.setAttribute("data-vqnews-hidden", "1");
      ch.style.setProperty("display", "none", "important");
    }
    /* 旧画面は自分で `style.display = ""` に戻すことがある
       （インラインの !important ごと消える）。CSS 側でも押さえておく。 */
    if (!document.getElementById("vqHideNewsLegacy")) {
      var g = document.createElement("style");
      g.id = "vqHideNewsLegacy";
      g.textContent = "#appNewsPage > [data-vqnews-hidden]{display:none !important;}";
      document.head.appendChild(g);
    }
    host = document.createElement("div");
    host.id = "vqNews";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    /* ★ 動画の 再生バーは **Feed と 同じもの**（core/feed/video.js・2026-08-20）。
       影の DOM には 外の CSS が 届かないので、ここへ 入れる。 */
    var vidcss = "";
    try { if (window.VQVID && window.VQVID.CSS) vidcss = String(window.VQVID.CSS || ""); } catch (e) { vidcss = ""; }
    var s = document.createElement("style"); s.textContent = CSS + vidcss; root.appendChild(s);
    var b = document.createElement("div"); b.className = "wrap"; root.appendChild(b);
    page.appendChild(host);
    mounted = true;
    try { if (window.VQVID && window.VQVID.結線) window.VQVID.結線(root); } catch (e) {}
    wire();
    render();
    load();
  }

  function render() {
    if (!mounted) return;
    root.querySelector(".wrap").innerHTML = st.view === "detail" ? detailHtml() : listHtml();
    paintOverlay();
  }

  /* ── 一覧 ─────────────────────────────────────────────────── */
  function visible() {
    var l = Array.isArray(st.items) ? st.items : [];
    var q = st.q.trim().toLowerCase();
    return l.filter(function (x) {
      if (st.cat && String(x.category || "") !== st.cat) return false;
      if (st.unreadOnly && x.read) return false;
      if (!q) return true;
      return (String(x.title || "") + " " + String(x.summary || "")).toLowerCase().indexOf(q) >= 0;
    });
  }
  function countBy(cat) {
    var l = Array.isArray(st.items) ? st.items : [];
    return l.filter(function (x) { return String(x.category || "") === cat; }).length;
  }

  function listHtml() {
    var h = '<div class="head"><div class="t"><h1>NEWS</h1>'
      + "<p>" + (st.unread > 0
          ? "まだ読んでいないお知らせが " + st.unread + " 件あります。"
          : "アップデートや障害の情報をここにまとめています。") + "</p></div>"
      + '<div class="acts">';
    if (st.unread > 0)
      h += '<button class="btn btn--secondary" data-a="read-all"' + (st.busy ? " disabled" : "") + ">"
        + svg("check") + "すべて既読にする</button>";
    if (isAdmin())
      h += '<button class="btn btn--primary" data-a="new">' + svg("plus") + "記事を書く</button>";
    h += "</div></div>";

    h += '<div class="tools"><div class="srch">' + svg("search")
      + '<input type="search" data-q value="' + esc(st.q) + '" placeholder="お知らせを探す" aria-label="お知らせを探す"></div>'
      + '<div class="chips" role="group" aria-label="絞り込み">'
      + '<button class="chip" data-a="cat" data-cat="" aria-selected="' + (!st.cat) + '">すべて'
      + '<span class="c">' + (Array.isArray(st.items) ? st.items.length : 0) + "</span></button>";
    CATS.forEach(function (c) {
      var n = countBy(c.id);
      if (!n) return;   /* 中身の無い分けは出さない */
      h += '<button class="chip" data-a="cat" data-cat="' + c.id + '" aria-selected="'
        + (st.cat === c.id) + '">' + esc(c.label) + '<span class="c">' + n + "</span></button>";
    });
    h += '<button class="chip" data-a="unread" aria-selected="' + st.unreadOnly + '">'
      + svg("bell") + "未読だけ</button>";
    h += "</div></div>";

    if (st.error) h += '<div class="err" role="alert">' + esc(st.error) + "</div>";
    if (st.loading && !st.items)
      return h + '<div class="grid"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>';

    var list = visible();
    if (!list.length) {
      return h + '<div class="empty"><span class="ico">' + svg("bell") + "</span>"
        + "<h3>" + (st.q || st.cat || st.unreadOnly ? "見つかりませんでした" : "まだお知らせはありません") + "</h3>"
        + "<p>" + (st.q || st.cat || st.unreadOnly
            ? "絞り込みを外すと、ほかのお知らせが出ます。"
            : "新しいお知らせが出たら、ここに並びます。") + "</p></div>";
    }

    h += '<div class="grid">';
    list.forEach(function (x) { h += cardHtml(x); });
    return h + "</div>";
  }

  function cardHtml(x) {
    /* カード全体が入口。管理のボタンは中に置くが、押した先を先に見るので取り違えない。 */
    /* 管理のときはカードの中に「直す・消す」ボタンが入る。
       ボタンの中にボタンを置くと読み上げが壊れるので、
       そのときはカード自体を押しどころ（role=button）にしない。 */
    var adm = isAdmin();
    var h = '<article class="card fadein" data-a="open" data-id="' + esc(x.id) + '"'
      + (adm ? "" : ' role="button" tabindex="0"') + ">";
    h += coverHtml(x);
    h += '<div class="cb"><div class="meta">'
      + '<span class="kind">' + esc(catLabel(x.category)) + "</span>"
      + (x.important ? '<span class="kind kind--important">' + svg("warn") + "重要</span>" : "")
      + (x.status === "draft" ? '<span class="kind kind--draft">' + svg("draft") + "下書き</span>" : "")
      + "<time>" + esc(dateJa(x.publishedAt)) + "</time>"
      + (x.read ? "" : '<span class="new"><i></i>未読</span>')
      + "</div>"
      + "<h3>" + esc(x.title) + "</h3>"
      + (x.summary ? "<p>" + esc(x.summary) + "</p>" : "");
    if (adm) {
      h += '<div class="adm">'
        + '<button class="btn btn--secondary btn--sm" data-a="edit" data-id="' + esc(x.id) + '">'
        + svg("pencil") + "直す</button>"
        + '<button class="btn btn--danger btn--sm" data-a="del" data-id="' + esc(x.id) + '">'
        + svg("trash") + "消す</button></div>";
    }
    return h + "</div></article>";
  }

  /* ── 本文 ─────────────────────────────────────────────────── */
  function detailHtml() {
    var h = '<div class="dhead"><button class="back" data-a="back" aria-label="一覧へ戻る">'
      + svg("back") + "</button><h2>お知らせ</h2></div>";
    if (st.itemBusy && !st.item) return h + '<div class="sk" style="height:320px"></div>';
    var x = st.item;
    if (!x) return h + '<div class="empty"><span class="ico">' + svg("bell") + "</span>"
      + "<h3>このお知らせは開けません</h3><p>"
      + esc(st.error || "消されたか、まだ公開されていません。") + "</p></div>";

    h += '<div class="art fadein">';
    h += coverHtml(x);
    h += '<div class="in"><div class="meta">'
      + '<span class="kind">' + esc(catLabel(x.category)) + "</span>"
      + (x.important ? '<span class="kind kind--important">' + svg("warn") + "重要</span>" : "")
      + "<time>" + esc(dateJa(x.publishedAt)) + "</time></div>"
      + "<h1>" + esc(x.title) + "</h1>"
      + (x.summary ? '<p class="sum">' + esc(x.summary) + "</p>" : "")
      + '<div class="body">' + bodyHtml(x.body) + "</div>"
      + 添えものHtml(x);
    var lu = safeCover(x.linkUrl);
    if (lu) h += '<div class="lnk"><a href="' + esc(lu) + '" target="_blank" rel="noopener noreferrer">'
      + esc(x.linkLabel || "くわしく見る") + svg("ext") + "</a></div>";
    return h + "</div></div>";
  }

  /* ── 読み込み ─────────────────────────────────────────────── */
  function load() {
    if (!mounted) return;
    st.loading = true; st.error = ""; render();
    /* 管理キーを持っているときだけ下書きも頼む。合っているかはサーバが見る。 */
    var ak = adminKey();
    api("/api/news/list" + (ak ? "?drafts=1" : ""), ak ? { admin: ak } : undefined)
      .then(function (j) {
        st.items = Array.isArray(j.items) ? j.items : [];
        st.unread = Math.max(0, Number(j.unread) || 0);
        st.loading = false;
        paintBadge();
        render();
      })
      .catch(function (e) {
        st.loading = false;
        st.items = st.items || [];
        st.error = "お知らせを読み込めませんでした。" + (e.message ? "（" + e.message + "）" : "");
        render();
      });
  }
  /* ナビの赤い印。数はサーバが数えたものだけを出す。 */
  function paintBadge() {
    var n = Math.max(0, Number(st.unread) || 0);
    try {
      document.querySelectorAll("[data-news-badge]").forEach(function (el) {
        el.textContent = n > 99 ? "99+" : String(n);
        el.classList.toggle("hidden", n <= 0);
      });
    } catch (e) {}
  }
  function openItem(id) {
    st.view = "detail"; st.id = id; st.item = null; st.itemBusy = true; st.error = "";
    render();
    api("/api/news/item?id=" + encodeURIComponent(id))
      .then(function (j) {
        st.item = j.item || null;
        st.itemBusy = false;
        render();
        markRead(id);
      })
      .catch(function (e) {
        st.itemBusy = false;
        st.error = e.status === 404 ? "消されたか、まだ公開されていません。"
          : (e.message || "このお知らせは開けません。");
        render();
      });
  }
  /* 開いた時点で既読にする。ログインしていなければ何もしない。 */
  function markRead(id) {
    if (!token()) return;
    var it = null, l = st.items || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) it = l[i];
    if (it && it.read) return;
    api("/api/news/read", { method: "POST", body: { id: id } })
      .then(function (j) {
        if (it) it.read = true;
        if (typeof j.unread === "number") st.unread = Math.max(0, j.unread);
        paintBadge();
        render();
      })
      .catch(function () {});
  }
  function readAll() {
    if (!token()) { st.error = "既読にするにはログインが必要です。"; render(); return; }
    if (st.busy) return;
    st.busy = true; render();
    api("/api/news/read", { method: "POST", body: {} })
      .then(function (j) {
        (st.items || []).forEach(function (x) { x.read = true; });
        st.unread = Math.max(0, Number(j.unread) || 0);
        paintBadge();
        toast("すべて既読にしました");
      })
      .catch(function (e) { st.error = e.message || "既読にできませんでした。"; })
      .then(function () { st.busy = false; render(); });
  }

  /* ── 管理（書く / 直す / 消す）───────────────────────────── */
  function openEditor(id) {
    var src = null, l = st.items || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) src = l[i];
    st.edit = {
      id: src ? String(src.id) : "",
      title: src ? String(src.title || "") : "",
      summary: src ? String(src.summary || "") : "",
      cat: src ? String(src.category || "notice") : "notice",
      cover: src ? String(src.coverUrl || "") : "",
      linkUrl: src ? String(src.linkUrl || "") : "",
      linkLabel: src ? String(src.linkLabel || "") : "",
      date: dateInput(src ? src.publishedAt : Date.now()),
      important: !!(src && src.important),
      status: src && src.status === "draft" ? "draft" : "published",
      body: src ? String(src.body || "") : "",
      busy: false, err: ""
    };
    /* 一覧には本文が入っていないことがあるので、直すときは取り直す */
    if (id) {
      var ak = adminKey();
      api("/api/news/item?id=" + encodeURIComponent(id), ak ? { admin: ak } : undefined)
        .then(function (j) {
          if (!st.edit || st.edit.id !== id) return;
          syncEdit();
          if (j.item && typeof j.item.body === "string" && !st.edit.body) st.edit.body = j.item.body;
          paintOverlay();
        })
        .catch(function () {});
    }
    paintOverlay();
  }
  function syncEdit() {
    var e = st.edit;
    if (!e || !ovRoot) return;
    if (!ovRoot.querySelector('[data-e="title"]')) return;
    var q = function (s) { var x = ovRoot.querySelector(s); return x ? x.value : null; };
    var v;
    v = q('[data-e="title"]');   if (v !== null) e.title = v;
    v = q('[data-e="summary"]'); if (v !== null) e.summary = v;
    v = q('[data-e="cover"]');   if (v !== null) e.cover = v;
    v = q('[data-e="linkUrl"]'); if (v !== null) e.linkUrl = v;
    v = q('[data-e="linkLabel"]'); if (v !== null) e.linkLabel = v;
    v = q('[data-e="date"]');    if (v !== null) e.date = v;
    v = q('[data-e="body"]');    if (v !== null) e.body = v;
    var im = ovRoot.querySelector('[data-e="important"]');
    if (im) e.important = !!im.checked;
  }
  function editorHtml() {
    var e = st.edit;
    if (!e) return "";
    var h = '<div class="ovl" data-a="ed-bd"><div class="sheet" data-a="sheet" role="dialog"'
      + ' aria-modal="true" aria-label="お知らせを書く">'
      + '<div class="sh-h"><button class="sh-x" data-a="ed-close" aria-label="閉じる">' + svg("x")
      + "</button><h2>" + (e.id ? "お知らせを直す" : "お知らせを書く") + "</h2></div>";
    h += '<div class="sh-b">';
    h += '<div class="fld"><label for="vqNTitle">タイトル</label>'
      + '<input id="vqNTitle" data-e="title" type="text" maxlength="200" value="' + esc(e.title) + '"'
      + ' placeholder="何が起きたのかを一行で"></div>';
    h += '<div class="fld"><span class="lg">カテゴリ</span><div class="chips">';
    CATS.forEach(function (c) {
      h += '<button class="chip" data-a="ed-cat" data-cat="' + c.id + '" aria-selected="'
        + (e.cat === c.id) + '">' + esc(c.label) + "</button>";
    });
    h += "</div></div>";
    h += '<div class="fld"><label for="vqNDate">公開日</label>'
      + '<input id="vqNDate" data-e="date" type="date" value="' + esc(e.date) + '"></div>';
    h += '<div class="fld"><label for="vqNSum">要約</label>'
      + '<textarea id="vqNSum" data-e="summary" maxlength="500" style="min-height:70px"'
      + ' placeholder="一覧に出る短い説明">' + esc(e.summary) + "</textarea></div>";
    h += '<div class="fld"><label for="vqNBody">本文</label>'
      + '<textarea id="vqNBody" data-e="body" maxlength="20000"'
      + ' placeholder="空行で段落が分かれます。">' + esc(e.body) + "</textarea>"
      + '<span class="note">文字としてそのまま保存します。HTML は書けません（書いても文字として出ます）。</span></div>';
    h += '<div class="fld"><label for="vqNCover">表紙の画像（URL）</label>'
      + '<input id="vqNCover" data-e="cover" type="url" value="' + esc(e.cover) + '"'
      + ' placeholder="https://"></div>';
    h += '<div class="fld"><label for="vqNLink">くわしく見る先（URL）</label>'
      + '<input id="vqNLink" data-e="linkUrl" type="url" value="' + esc(e.linkUrl) + '"'
      + ' placeholder="https://">'
      + '<input data-e="linkLabel" type="text" maxlength="40" value="' + esc(e.linkLabel) + '"'
      + ' placeholder="ボタンに出す言葉（省くと「くわしく見る」）"></div>';
    h += '<div class="fld"><label class="sw"><input type="checkbox" data-e="important"'
      + (e.important ? " checked" : "") + ">重要なお知らせとして目立たせる</label></div>";
    h += '<div class="fld"><span class="lg">状態</span><div class="seg">'
      + '<button data-a="ed-st" data-v="published" aria-pressed="' + (e.status === "published")
      + '">公開する</button>'
      + '<button data-a="ed-st" data-v="draft" aria-pressed="' + (e.status === "draft")
      + '">下書き</button></div>'
      + '<span class="note">下書きは、管理キーを持っている人にしか出ません。</span></div>';
    h += "</div>";
    if (e.err) h += '<div class="ed-err" role="alert">' + esc(e.err) + "</div>";
    h += '<div class="sh-f">';
    if (e.id) h += '<button class="btn btn--danger" data-a="ed-del">' + svg("trash") + "消す</button>";
    h += '<span class="sp"></span>'
      + '<button class="btn btn--secondary" data-a="ed-close">やめる</button>'
      + '<button class="btn btn--primary" data-a="ed-save"' + (e.busy ? " disabled" : "") + ">"
      + (e.busy ? "保存中…" : "保存する") + "</button></div>";
    return h + "</div></div>";
  }
  function saveArticle() {
    syncEdit();
    var e = st.edit;
    if (!e || e.busy) return;
    if (!e.title.trim()) { e.err = "タイトルを入れてください。"; paintOverlay(); return; }
    var ak = askAdminKey();
    if (!ak) { e.err = "管理キーが要ります。"; paintOverlay(); return; }
    var pub = Date.parse(e.date + "T00:00:00");
    if (!isFinite(pub)) pub = Date.now();
    e.busy = true; e.err = ""; paintOverlay();
    api("/api/admin/news/save", {
      method: "POST", admin: ak,
      body: {
        adminKey: ak, id: e.id || undefined,
        title: e.title.trim(), summary: e.summary.trim(), category: e.cat,
        body: e.body,
        coverUrl: /^https?:\/\//i.test(e.cover.trim()) ? e.cover.trim() : "",
        linkUrl: /^https?:\/\//i.test(e.linkUrl.trim()) ? e.linkUrl.trim() : "",
        linkLabel: e.linkLabel.trim(),
        important: !!e.important, publishedAt: pub, status: e.status
      }
    })
      .then(function () {
        st.edit = null;
        toast(e.id ? "お知らせを直しました" : "お知らせを出しました");
        st.items = null;
        load();
      })
      .catch(function (x) {
        e.busy = false;
        if (x.status === 403) {
          try { localStorage.removeItem(ADMIN_KEY_STORE); } catch (y) {}
          e.err = "管理キーが違います。もう一度お試しください。";
        } else e.err = x.message || "保存できませんでした。";
        paintOverlay();
      });
  }
  function deleteArticle(id) {
    if (!id) return;
    if (!window.confirm("このお知らせを消しますか？ 元には戻せません。")) return;
    var ak = askAdminKey();
    if (!ak) { st.error = "管理キーが要ります。"; render(); return; }
    api("/api/admin/news/delete", { method: "POST", admin: ak, body: { adminKey: ak, id: id } })
      .then(function () {
        st.edit = null;
        toast("お知らせを消しました");
        if (st.view === "detail") st.view = "list";
        st.items = null;
        load();
      })
      .catch(function (x) {
        if (x.status === 403) { try { localStorage.removeItem(ADMIN_KEY_STORE); } catch (y) {} }
        st.error = x.status === 403 ? "管理キーが違います。" : (x.message || "消せませんでした。");
        render();
      });
  }

  /* ── かぶせる画面（左パネルより上へ出す）─────────────────── */
  var ovHost = null, ovRoot = null, ovPrev = "", ovLocked = false;
  function modalOpen() { return !!st.edit; }
  function paintOverlay() {
    if (!modalOpen() && !st.toast) {
      if (ovHost) {
        try { document.body.removeChild(ovHost); } catch (e) {}
        ovHost = null; ovRoot = null;
      }
      if (ovLocked) { document.body.style.overflow = ovPrev; ovLocked = false; }
      return;
    }
    if (!ovHost) {
      ovHost = document.createElement("div");
      ovHost.id = "vqNewsOverlay";
      ovRoot = ovHost.attachShadow ? ovHost.attachShadow({ mode: "open" }) : ovHost;
      var stl = document.createElement("style"); stl.textContent = CSS; ovRoot.appendChild(stl);
      var box = document.createElement("div"); box.setAttribute("data-ovbox", ""); ovRoot.appendChild(box);
      document.body.appendChild(ovHost);
      ovRoot.addEventListener("click", onOvClick);
    }
    ovHost.style.cssText = "position:fixed;inset:0;z-index:999000;pointer-events:"
      + (modalOpen() ? "auto" : "none") + ";";
    if (modalOpen() && !ovLocked) {
      ovPrev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      ovLocked = true;
    } else if (!modalOpen() && ovLocked) {
      document.body.style.overflow = ovPrev; ovLocked = false;
    }
    ovRoot.querySelector("[data-ovbox]").innerHTML = editorHtml() + toastHtml();
  }
  var toastT = 0;
  function toast(m) {
    syncEdit();
    st.toast = String(m || "");
    clearTimeout(toastT);
    toastT = setTimeout(function () { st.toast = ""; paintOverlay(); }, 2400);
    paintOverlay();
  }
  function toastHtml() {
    if (!st.toast) return "";
    return '<div class="toast" role="status">' + svg("check") + esc(st.toast) + "</div>";
  }
  function onOvClick(e) {
    var el = e.target;
    while (el && el !== ovRoot && !(el.dataset && el.dataset.a)) el = el.parentNode;
    if (!el || el === ovRoot) return;
    var a = el.dataset.a;
    if (a === "sheet") return;
    if (a === "ed-bd" || a === "ed-close") { st.edit = null; paintOverlay(); return; }
    if (a === "ed-save") { saveArticle(); return; }
    if (a === "ed-del") { deleteArticle(st.edit && st.edit.id); return; }
    if (a === "ed-cat") { syncEdit(); if (st.edit) st.edit.cat = el.dataset.cat; paintOverlay(); return; }
    if (a === "ed-st") { syncEdit(); if (st.edit) st.edit.status = el.dataset.v; paintOverlay(); return; }
  }

  /* ── 操作 ─────────────────────────────────────────────────── */
  function wire() {
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && el.dataset.a)) el = el.parentNode;
      if (!el || el === root) return;
      var a = el.dataset.a;
      if (a === "back") { st.view = "list"; st.item = null; render(); return; }
      if (a === "open") { openItem(el.dataset.id); return; }
      if (a === "cat") { st.cat = el.dataset.cat || ""; render(); return; }
      if (a === "unread") { st.unreadOnly = !st.unreadOnly; render(); return; }
      if (a === "read-all") { readAll(); return; }
      if (a === "new") { openEditor(""); return; }
      if (a === "edit") { openEditor(el.dataset.id); return; }
      if (a === "del") { deleteArticle(el.dataset.id); return; }
    });
    /* 探すときに作り直すと打ち込みが途切れるので、一覧だけを差し替える */
    root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || t.dataset.q === undefined) return;
      st.q = String(t.value || "");
      var g = root.querySelector(".grid"), em = root.querySelector(".empty");
      var list = visible();
      var html = list.length
        ? '<div class="grid">' + list.map(cardHtml).join("") + "</div>"
        : '<div class="empty"><span class="ico">' + svg("bell") + "</span>"
          + "<h3>見つかりませんでした</h3><p>ほかの言葉でも探せます。</p></div>";
      var old = g || em;
      if (old) {
        var tmp = document.createElement("div");
        tmp.innerHTML = html;
        old.replaceWith(tmp.firstElementChild);
      }
    });
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var el = e.target;
      if (el && el.dataset && el.dataset.a === "open") { e.preventDefault(); openItem(el.dataset.id); }
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !st.edit) return;
    st.edit = null; paintOverlay();
  });

  function syncTab() {
    if (document.body.getAttribute("data-app-tab") === "news") mount();
  }
  window.__vqOpenNews = function (id) {
    document.body.setAttribute("data-app-tab", "news");
    setTimeout(function () { mount(); if (id) openItem(id); }, 0);
  };
  function boot() {
    syncTab();
    new MutationObserver(syncTab)
      .observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
