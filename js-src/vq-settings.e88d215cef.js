
/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz — New Settings (中央モーダル・UI Studio調・競合ゼロ)
   ・#vqSettings が中央ポップアップ(Shadow DOM)。左カテゴリ＋右コンテンツ＋×/背景で閉じる。
   ・本物の設定は別オーバーレイ #settingsOverlay(openSettings)に在る。ここは触らず、
     各コントロールを本物へブリッジ(select=値+change / toggle=checked+change / seg=実ボタン.click / action=.click)。
   ・初期値は localStorage(wordPractice400.settings.v2 + app.settings.v1)を直読して鏡写し。
   ・アカウント/危険操作はアプリ側の確認UIを見せるため「モーダルを閉じてからブリッジ」。
   ・OS/拡張アシスタント/OEA/Admin は「詳細設定を開く」で従来オーバーレイへ委譲(機能ロスなし)。
   ・window.__vqOpenSettings() で起動。設定タブへの遷移も監視して自動起動(導線切替)。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__vqSettingsInstalled) return;
  window.__vqSettingsInstalled = true;

  var P = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    paint: '<path d="M4 7a3 3 0 0 1 3-3h9a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H9v3a3 3 0 0 1-3 3 2 2 0 0 1-2-2V7Z"/><circle cx="8" cy="16" r="1.2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6"/>',
    database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    sliders: '<path d="M4 6h11M18 6h2M4 12h5M12 12h8M4 18h11M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    spark: '<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"/><path d="M18.6 16l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>', chev: '<path d="M9 6l6 6-6 6"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 12H3M6 8l-4 4 4 4"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M9 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4"/>',
    login: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M14 12h7M17 8l4 4-4 4"/>', add: '<circle cx="10" cy="8" r="4"/><path d="M2 20c0-3.5 3.4-6 8-6M18 14v6M15 17h6"/>',
    bell: '<path d="M18 15v-4a6 6 0 1 0-12 0v4l-1.6 2.4A1 1 0 0 0 5.2 19h13.6a1 1 0 0 0 .8-1.6L18 15Z"/><path d="M10 22h4"/>',
    eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.9"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.5"/><path d="M12 16.8v.4"/>',
    /* ★ ストレージは これまで 印が 無くて「つまみ」に 落ちていた（2026-08-20）。
       ドラム缶（database）は 中身が 伝わらないので、**使っている割合の 円**にする。 */
    gauge: '<path d="M12 3a9 9 0 1 1-9 9"/><path d="M12 3v9l6.4 6.4"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10.2 8.6l5.4 3.4-5.4 3.4Z"/>',
    box: '<path d="M3 8.2 12 4l9 4.2-9 4.2Z"/><path d="M3 8.2V16l9 4 9-4V8.2"/><path d="M12 12.4V20"/>'
  };
  function svg(n) { return '<svg viewBox="0 0 24 24" ' + P + '>' + (ICON[n] || '') + '</svg>'; }
  function $(id) { return document.getElementById(id); }

  /* 設定値の読み書きは vq-settings-store（window.__vqSet）が持ち主。
     ここで localStorage を二度読みしない（同じ値を二か所で解釈すると必ずずれる）。 */

  /* ── ブリッジ（本物のコントロールへ） ── */
  function bClick(sel) {
    var e = null;
    try { e = /^[A-Za-z][\w-]*$/.test(sel) ? $(sel) : null; } catch (er) {}
    if (!e) { try { e = document.querySelector(sel); } catch (er2) {} }
    if (e) e.click();
  }
  /* 設定同期を強制（本物 openSettings を非表示のまま起動して _settingsSyncControls / account render を走らせる） */
  function forceSync() {
    document.documentElement.classList.add("vqset-suppress");
    var t = document.querySelector('#appSettingsPage [data-settings-shortcut="openSettings"]');
    if (t) { try { t.click(); } catch (e) {} }
  }

  /* ── セクション定義 ────────────────────────────────────────────
     並びも中身も **定義表（vq-settings-store の SPECS / GROUPS）から作る**。
     ここに設定を手書きで並べない。100 個を手で並べると必ずどこかが腐る。 */
  function S() { return window.__vqSet; }
  var SPECIAL = { account: accountHTML, storage: storageHTML, workspace: workspaceHTML, advanced: advancedHTML };
  var GRP_ICON = {
    display: "paint", learn: "target", sound: "sound", notif: "bell", ai: "spark",
    a11y: "eye", account: "user", data: "database", workspace: "spark",
    /* ★ 抜けていた 2 つ。無いと 全部 同じ「つまみ」に なる。 */
    storage: "gauge", player: "play",
    help: "help", about: "info", advanced: "sliders"
  };
  function SECTIONS() {
    var st = S();
    if (!st) return [];
    return st.groups().map(function (g) {
      return {
        id: g.id, label: g.label, icon: GRP_ICON[g.id] || "sliders",
        /* 並びの束。定義側は group を持つ（昔は nav だったので、そちらも見る）。 */
        group: g.group || g.nav || 1, ms: g.ms, sub: g.sub, special: g.special || null
      };
    });
  }

  var CSS =
    "*{box-sizing:border-box;margin:0;padding:0;}" +
    ":host{font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:var(--vq-text,#454151);}" +
    ".backdrop{position:fixed;inset:0;background:rgba(37,33,48,.42);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:grid;place-items:center;padding:24px;animation:fade .16s ease;}" +
    "@keyframes fade{from{opacity:0}to{opacity:1}}@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}" +
    ".modal{width:min(940px,100%);height:min(680px,88vh);background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E7E4EF);border-radius:calc(20px * var(--vq-r-scale,1));box-shadow:0 24px 70px rgba(37,25,70,.28);display:flex;overflow:hidden;animation:pop .18s cubic-bezier(.2,.8,.2,1);}" +
    /* left nav */
    ".side{width:232px;flex:0 0 auto;background:var(--vq-bg-canvas,#F7F6FB);border-right:1px solid var(--vq-border-subtle,#ECEAF4);display:flex;flex-direction:column;padding:16px 12px;gap:3px;}" +
    ".side__ttl{font-size:12.5px;font-weight:750;letter-spacing:.04em;color:var(--vq-text-secondary,#5F5A70);padding:4px 10px 8px;}" +
    ".nav{display:flex;align-items:center;gap:10px;height:42px;padding:0 12px;border:0;background:none;border-radius:calc(11px * var(--vq-r-scale,1));cursor:pointer;font-family:inherit;font-size:14.5px;font-weight:600;color:var(--vq-text-secondary,#4F4A60);text-align:left;transition:background .12s,color .12s;}" +
    ".nav svg{width:17px;height:17px;flex:0 0 auto;}.nav:hover{background:var(--vq-accent-subtle,#F0ECF9);color:var(--vq-text,#2B2836);}.nav.on{background:var(--vq-accent-subtle,#EEE9FA);color:var(--vq-accent-text,#5F579E);font-weight:700;}" +
    ".nav.danger{color:var(--vq-danger-text,#C1445F);}.nav.danger:hover{background:var(--vq-danger-bg,#FBE9EE);}" +
    /* right */
    ".main{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;}" +
    ".head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 24px 14px;border-bottom:1px solid var(--vq-border-subtle,#F1EFF6);}" +
    ".head__t{font-size:17px;font-weight:800;color:var(--vq-text,#2B2836);letter-spacing:-.01em;}" +
    ".xbtn{width:34px;height:34px;border:0;background:var(--vq-surface-active,#F4F2F9);border-radius:calc(10px * var(--vq-r-scale,1));cursor:pointer;display:grid;place-items:center;color:var(--vq-text-secondary,#686477);flex:0 0 auto;}.xbtn:hover{background:var(--vq-accent-subtle-hover,#EAE6F4);color:var(--vq-text,#2B2836);}.xbtn svg{width:18px;height:18px;}" +
    ".body{flex:1 1 auto;overflow-y:auto;padding:22px 24px 30px;}" +
    ".grp{border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(14px * var(--vq-r-scale,1));overflow:hidden;background:var(--vq-surface,#fff);}" +
    ".grp+.grp,.grp+.note,.note+.grp,.grp+.gttl,.note+.gttl{margin-top:18px;}" +
    ".gttl{font-size:12.5px;font-weight:750;letter-spacing:.05em;color:var(--vq-text-secondary,#5F5A70);padding:0 4px 8px;}" +
    ".row{display:flex;align-items:center;gap:14px;padding:13px 16px;border-top:1px solid var(--vq-border-subtle,#F1EFF6);}.row:first-child{border-top:0;}" +
    /* 検索から飛んできた行を、しばらく光らせる（どれのことか分かるように） */
    ".row.is-found{background:var(--vq-accent-subtle,#F1EEFB);box-shadow:inset 3px 0 0 var(--vq-accent,#756DB3);}" +
    ".row__main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;}" +
    /* ★ 見やすさ（2026-08-20）。説明の 文字が 白地に対して 3 前後しか なく、
       目を 近づけないと 読めなかった。大きさと 濃さを 上げる。 */
    ".row__label{font-size:14.5px;font-weight:600;color:var(--vq-text,#2B2836);line-height:1.5;}" +
    ".row__desc{font-size:12.5px;color:var(--vq-text-secondary,#5F5A70);font-weight:500;line-height:1.6;}" +
    ".row.tap{cursor:pointer;width:100%;border:0;background:none;font-family:inherit;text-align:left;border-top:1px solid var(--vq-border-subtle,#F1EFF6);}.row.tap:first-child{border-top:0;}.row.tap:hover{background:var(--vq-surface-hover,#FAF9FD);}" +
    ".row.tap .chev{width:16px;height:16px;color:var(--vq-text-disabled,#C7C2D4);flex:0 0 auto;}.row.danger .row__label{color:var(--vq-danger-text,#C1445F);}" +
    ".rval{font-size:13.5px;font-weight:700;color:var(--vq-accent-text,#5F579E);flex:0 0 auto;}" +
    /* controls */
    "select.sel{appearance:none;-webkit-appearance:none;height:36px;padding:0 34px 0 12px;border:1px solid var(--vq-border,#E1DDEE);border-radius:calc(10px * var(--vq-r-scale,1));background:var(--vq-surface,#fff);font-family:inherit;font-size:13px;font-weight:600;color:var(--vq-text,#2B2836);cursor:pointer;background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238A81C2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\");background-repeat:no-repeat;background-position:right 10px center;min-width:120px;}select.sel:focus{outline:2px solid var(--vq-border-focus,#C9BEEB);outline-offset:1px;}" +
    ".sw{position:relative;width:44px;height:26px;border-radius:999px;background:var(--vq-border,#DAD6E6);border:0;cursor:pointer;flex:0 0 auto;transition:background .15s;padding:0;}.sw::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--vq-surface,#fff);box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s;}.sw.on{background:var(--vq-accent,#756DB3);}.sw.on::after{transform:translateX(18px);}" +
    ".seg{display:inline-flex;background:var(--vq-surface-sunken,#EFEDF6);border-radius:calc(10px * var(--vq-r-scale,1));padding:3px;gap:2px;flex:0 0 auto;}.seg button{height:30px;padding:0 13px;border:0;background:none;border-radius:calc(8px * var(--vq-r-scale,1));cursor:pointer;color:var(--vq-text-secondary,#686477);font-family:inherit;font-size:12.5px;font-weight:650;}.seg button.on{background:var(--vq-surface,#fff);color:var(--vq-accent-text,#5F579E);box-shadow:0 1px 3px rgba(0,0,0,.07);}" +
    ".btn{height:34px;padding:0 15px;border-radius:calc(9px * var(--vq-r-scale,1));border:1px solid var(--vq-border,#E1DDEE);background:var(--vq-surface,#fff);color:var(--vq-accent-text,#5F579E);font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;flex:0 0 auto;}.btn:hover{background:var(--vq-accent-subtle,#F4F1FA);}" +
    ".btn.dgr{border-color:var(--vq-danger-bg,#F0C9D3);color:var(--vq-danger-text,#C1445F);}.btn.dgr:hover{background:var(--vq-danger-bg,#FBE9EE);}" +
    ".btn.pri{background:var(--vq-accent,#756DB3);border-color:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);}.btn.pri:hover{filter:brightness(1.07);}" +
    /* 自由に決める数の入力 */
    ".num{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;}" +
    ".num__b{width:32px;height:32px;border:1px solid var(--vq-border,#E1DDEE);background:var(--vq-surface,#fff);" +
      "border-radius:calc(9px * var(--vq-r-scale,1));cursor:pointer;color:var(--vq-accent-text,#5F579E);" +
      "font-family:inherit;font-size:15px;font-weight:700;line-height:1;display:grid;place-items:center;padding:0;}" +
    ".num__b:hover{background:var(--vq-surface-hover,#F4F1FA);}" +
    ".num__i{width:74px;height:32px;border:1px solid var(--vq-border,#E1DDEE);background:var(--vq-surface,#fff);" +
      "border-radius:calc(9px * var(--vq-r-scale,1));font-family:inherit;font-size:13.5px;font-weight:700;" +
      "color:var(--vq-text,#2B2836);text-align:center;padding:0 4px;-moz-appearance:textfield;}" +
    ".num__i::-webkit-outer-spin-button,.num__i::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}" +
    ".num__i:focus{outline:2px solid var(--vq-border-focus,#C9BEEB);outline-offset:1px;}" +
    ".num__u{font-size:12.5px;font-weight:650;color:var(--vq-text-secondary,#686477);}" +
    ".num__n{font-size:12px;font-weight:650;color:var(--vq-accent-text,#5F579E);}" +
    /* アカウント画面の頭のカード。
       名前とログインIDを 2 行並べるのをやめ、顔と @ 名にした。
       下の 3 つの数は、サーバが返した実際の値だけを出す。 */
    ".whoCard{border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:16px;" +
    "background:linear-gradient(180deg,var(--vq-surface-hover,#FAF9FE),var(--vq-surface,#fff));" +
    "padding:18px 18px 14px;margin-bottom:18px;}" +
    ".whoCard__top{display:flex;align-items:center;gap:14px;}" +
    ".whoCard__av{width:56px;height:56px;border-radius:50%;flex:0 0 auto;display:grid;" +
    "place-items:center;background-size:cover;background-position:center;" +
    "background-color:var(--vq-accent-subtle,#EDEBF8);color:var(--vq-accent-text,#5F579E);" +
    "font-size:22px;font-weight:700;overflow:hidden;" +
    "box-shadow:0 0 0 3px var(--vq-surface,#fff),0 0 0 4px var(--vq-border-subtle,#ECEAF4);}" +
    ".whoCard__b{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;}" +
    ".whoCard__n{font-size:18px;font-weight:750;letter-spacing:-.01em;color:var(--vq-text,#454151);" +
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".whoCard__h{font-size:13px;color:var(--vq-text-tertiary,#9A96AA);" +
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".whoCard__row{display:flex;gap:22px;margin-top:15px;padding-top:13px;" +
    "border-top:1px solid var(--vq-border-subtle,#ECEAF4);}" +
    ".whoCard__st{display:flex;flex-direction:column;gap:1px;}" +
    ".whoCard__st b{font-size:16px;font-weight:700;color:var(--vq-text,#454151);line-height:1.2;}" +
    ".whoCard__st i{font-size:11.5px;font-style:normal;color:var(--vq-text-tertiary,#9A96AA);}" +
    /* いちばん上の「自分」の行（PC の左の列／モバイルの一覧の頭）。
       影の DOM の中なので、この文字列に入れないと届かない。 */
    ".meRow{display:flex;align-items:center;gap:11px;width:100%;padding:12px 12px;margin:0 0 6px;" +
    "border:0;background:none;cursor:pointer;text-align:left;border-radius:12px;" +
    "transition:background .14s ease;}" +
    ".meRow:hover{background:var(--vq-surface-hover,#F5F3FB);}" +
    ".meRow:focus-visible{outline:2px solid var(--vq-accent,#5F579E);outline-offset:2px;}" +
    ".meRow__av{width:42px;height:42px;border-radius:50%;flex:0 0 auto;display:grid;" +
    "place-items:center;background-size:cover;background-position:center;" +
    "background-color:var(--vq-accent-subtle,#EDEBF8);color:var(--vq-accent-text,#5F579E);" +
    "font-size:17px;font-weight:700;overflow:hidden;}" +
    ".meRow__av.is-none{color:var(--vq-text-tertiary,#9A96AA);}" +
    ".meRow__av .ms{font-size:22px;}" +
    ".meRow__b{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;}" +
    ".meRow__n{font-size:14.5px;font-weight:650;color:var(--vq-text,#454151);" +
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".meRow__s{font-size:11.5px;color:var(--vq-text-tertiary,#9A96AA);" +
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".meRow__c{width:15px;height:15px;flex:0 0 auto;color:var(--vq-text-tertiary,#C4C0D2);}" +
    /* ══ モバイル一覧の頭。**下の項目と左端をそろえる**（2026-08-14）══
       実測（390px 幅の端末で実際に開いて測った）:
         束のカード・項目 … 左端 16px ／ アイコン 30px
         プロフィール     … 左端 28px ／ 顔     42px   ← 12px 内側だった
       左右へ 12px の margin を持たせていたぶん、ここだけ右へずれて
       いた。margin を外し、内側の余白を項目（.mrow の 14px）にそろえる。
       これで 枠 16px・顔 30px となり、下のアイコンと縦一直線になる。 */
    ".mscroll > .meRow{margin:6px 0 12px;width:100%;padding:12px 14px;}" +
    ".mscroll > .meRow .meRow__av{width:46px;height:46px;font-size:18px;}" +
    ".mscroll > .meRow .meRow__n{font-size:16px;}" +
    ".mscroll > .meRow .meRow__s{font-size:12.5px;}" +
    /* 束の見出し。PC の左の列とモバイルの一覧で同じ言葉を使う。 */
    ".navttl{font-size:11px;font-weight:750;letter-spacing:.04em;text-transform:none;" +
    "color:var(--vq-text-tertiary,#9A96AA);padding:14px 12px 6px;}" +
    ".nav:first-of-type{margin-top:0;}" +
    ".mgttl{font-size:12px;font-weight:750;letter-spacing:.03em;" +
    "color:var(--vq-text-tertiary,#9A96AA);padding:18px 18px 7px;}" +
    ".mgttl:first-child{padding-top:6px;}" +
    /* ストレージ（帯と内訳）。
       この画面は影の DOM の中なので、**この文字列に入れないと届かない**。
       外側の <style> に書いても効かない（実際に効かず、白いままだった）。 */
    /* ── ストレージの 要約（一目で 分かる 2 枡）───────────────── */
    ".stg2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:4px 0 16px;}" +
    "@media (max-width:520px){.stg2{grid-template-columns:1fr;}}" +
    ".stg2-c{border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(14px * var(--vq-r-scale,1));" +
      "padding:14px 15px;background:var(--vq-surface,#fff);}" +
    ".stg2-t{font-size:12px;font-weight:700;color:var(--vq-text-secondary,#686477);}" +
    ".stg2-n{margin-top:6px;font-size:20px;font-weight:750;color:var(--vq-text,#2B2836);letter-spacing:-.01em;}" +
    ".stg2-s{font-size:12.5px;font-weight:600;color:var(--vq-text-tertiary,#9994A8);}" +
    ".stg2-bar{height:8px;border-radius:999px;background:var(--vq-surface-active,#F1EEF8);overflow:hidden;margin:10px 0 7px;}" +
    ".stg2-bar i{display:block;height:100%;border-radius:inherit;transition:width .3s ease;}" +
    ".stg2-m{font-size:11.5px;font-weight:600;color:var(--vq-text-secondary,#686477);}" +
    ".stg2-h{margin-top:5px;font-size:11px;color:var(--vq-text-tertiary,#9994A8);line-height:1.6;}" +
    /* くわしく（畳んでおく） */
    ".stg-more{margin-top:6px;border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(14px * var(--vq-r-scale,1));background:var(--vq-surface,#fff);}" +
    ".stg-more>summary{list-style:none;cursor:pointer;padding:13px 15px;font-size:13px;font-weight:700;color:var(--vq-text-secondary,#686477);display:flex;align-items:center;justify-content:space-between;}" +
    ".stg-more>summary::-webkit-details-marker{display:none;}" +
    ".stg-more>summary::after{content:\"\\203A\";font-size:18px;transform:rotate(90deg);transition:transform .18s ease;color:var(--vq-text-tertiary,#9994A8);}" +
    ".stg-more[open]>summary::after{transform:rotate(-90deg);}" +
    ".stg-more__b{padding:0 15px 15px;}" +
    ".stg-bar{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:12px 0 10px;" +
    "background:var(--vq-surface-sunken,rgba(127,127,127,.16));}" +
    ".stg-bar i{display:block;height:100%;}" +
    ".stg-bar i + i{box-shadow:inset 1px 0 0 rgba(255,255,255,.55);}" +
    ".stg-leg{display:flex;flex-wrap:wrap;gap:10px 14px;}" +
    ".stg-leg__i{display:inline-flex;align-items:center;gap:6px;font-size:12px;" +
    "color:var(--vq-text-secondary,#6B6880);}" +
    ".stg-leg__i i{width:8px;height:8px;border-radius:50%;display:inline-block;flex:0 0 auto;}" +
    ".stg-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:8px;" +
    "vertical-align:middle;flex:0 0 auto;}" +
    /* account card */
    /* ★ 下の止まり色が **#fff の直書き**だった（2026-08-17・利用者の訴え）。
       ダークにすると ストレージ画面のいちばん上のカードだけが白くなり、
       白い字が乗って **まったく読めなかった**（実測の写真で確認）。
       明暗どちらでも合うように、両端とも 変数にする。 */
    ".acard{border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(14px * var(--vq-r-scale,1));padding:16px;background:linear-gradient(180deg,var(--vq-surface-hover,#FaF9FE),var(--vq-surface,#fff));margin-bottom:18px;}" +
    ".acard__t{font-size:15.5px;font-weight:750;color:var(--vq-text,#2B2836);}" +
    ".acard__m{font-size:13px;color:var(--vq-text-secondary,#5F5A70);font-weight:600;margin-top:4px;}" +
    /* 英語の 名前（localStorage など）は 本文から どけて、小さく 添えるだけ。 */
    ".acard__en{font-size:11px;color:var(--vq-text-tertiary,#8B85A0);font-weight:500;margin-top:2px;letter-spacing:.02em;}" +
    ".note{font-size:12.5px;color:var(--vq-text-secondary,#5F5A70);font-weight:500;line-height:1.75;background:var(--vq-bg-canvas,#F7F6FB);border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(12px * var(--vq-r-scale,1));padding:13px 15px;}" +
    /* ── モバイル一覧（iOS設定風）。PCでは非表示 ── */
    ".mlist{display:none;flex-direction:column;min-height:0;flex:1 1 auto;}" +
    ".back{display:none;width:34px;height:34px;border:0;background:none;border-radius:calc(10px * var(--vq-r-scale,1));cursor:pointer;color:var(--vq-accent-text,#5F579E);place-items:center;flex:0 0 auto;padding:0;}" +
    ".back svg{width:20px;height:20px;transform:rotate(180deg);}" +
    /* ══ モバイル: 全画面の独立した設定画面（一覧 → 詳細のプッシュ遷移） ══ */
    "@media (max-width:879px){" +
      ".backdrop{padding:0;background:var(--vq-bg-canvas,#F2F1F7);backdrop-filter:none;-webkit-backdrop-filter:none;display:block;animation:none;}" +
      ".modal{width:100%;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;flex-direction:column;background:var(--vq-bg-canvas,#F2F1F7);animation:slide .2s cubic-bezier(.22,1,.36,1);}" +
      "@keyframes slide{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}" +
      ".side{display:none;}" +
      ".mlist{display:flex;}" +
      ".main{display:none;}" +
      ".modal.is-detail .mlist{display:none;}" +
      ".modal.is-detail .main{display:flex;animation:push .22s cubic-bezier(.22,1,.36,1);}" +
      "@keyframes push{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}" +
      ".modal.is-detail .back{display:grid;}" +
      /* ヘッダ（一覧・詳細で共通の見え方: 中央タイトル） */
      ".mhead,.head{display:flex;align-items:center;gap:8px;background:var(--vq-bg-canvas,#F2F1F7);border-bottom:0;" +
        "padding:calc(env(safe-area-inset-top,0px) + 12px) 12px 10px;}" +
      ".mhead__t,.head__t{flex:1 1 auto;text-align:center;font-size:17px;font-weight:800;color:var(--vq-text,#1B1922);letter-spacing:-.01em;}" +
      ".mhead .sp,.head .sp{width:34px;flex:0 0 auto;}" +
      /* 下部バー(z9990・高さ約65px)は設定中も出したままなので、その分の余白を確保 */
      ".mscroll,.body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;" +
        "padding:6px 16px calc(env(safe-area-inset-bottom,0px) + 92px);}" +
      /* グループ化されたカード */
      ".mgrp{background:var(--vq-surface,#fff);border-radius:calc(14px * var(--vq-r-scale,1));overflow:hidden;border:0;}" +
      ".mgrp+.mgrp{margin-top:26px;}" +
      ".mrow{display:flex;align-items:center;gap:12px;width:100%;padding:11px 14px;border:0;background:none;" +
        "font-family:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;position:relative;}" +
      ".mrow+.mrow::before{content:'';position:absolute;top:0;left:52px;right:0;height:1px;background:var(--vq-border-subtle,#EDEBF2);}" +
      ".mrow:active{background:var(--vq-surface-active,#F0EEF6);}" +
      /* 囲いなし・黒のアイコン。丸みのある字形にしたいので Material Symbols Rounded を使う */
      ".mico{width:26px;height:26px;flex:0 0 auto;display:grid;place-items:center;color:var(--vq-text,#1B1922);background:none;}" +
      /* ══ ★ この 影の DOM の 中の .ms **すべて**に 書体を 当てる（2026-08-20）══
         訴え「モバイルの アイコンが おかしい。英語が 剥き出しの ままだよ」。
         外の material-symbols.css は **影の 境目を 越えない**ので、
         ここに 書いていない .ms は Arial のまま になる。
         Material Symbols は 合字なので、書体が 当たらないと
         **名前が そのまま 文字で 出る**（実測: 上の プロフィールの person が
         Arial・幅 73px ＝ 文字だった）。
         もとは ".mico .ms" にしか 当てていなかったので、
         .meRow__av（プロフィールの 顔）の 印だけ 取り残されていた。
         **束ごとに 書くのを やめて、.ms 全部に 当てる。** */
      ".ms{font-family:'Material Symbols Rounded';font-weight:400;font-style:normal;line-height:1;" +
        "display:inline-block;letter-spacing:normal;text-transform:none;white-space:nowrap;word-wrap:normal;direction:ltr;" +
        "-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased;" +
        "font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;}" +
      ".mico .ms{font-size:25px;}" +
      ".mrow__c{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;}" +
      ".mrow__l{font-size:16px;font-weight:600;color:var(--vq-text,#1B1922);letter-spacing:-.01em;}" +
      ".mrow__s{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      ".mrow .chv{width:15px;height:15px;flex:0 0 auto;color:var(--vq-text-disabled,#C2BDD0);}" +
      /* 詳細側は既存 .grp/.row を iOS 寄りのサイズへ */
      ".grp{border:0;border-radius:calc(14px * var(--vq-r-scale,1));}" +
      ".grp+.grp,.grp+.note,.note+.grp,.grp+.gttl,.note+.gttl{margin-top:24px;}" +
      ".gttl{padding:0 14px 7px;font-size:11.5px;}" +
      ".row,.row.tap{padding:12px 14px;border-top-color:var(--vq-border-subtle,#EDEBF2);gap:12px;}" +
      ".row__label{font-size:15.5px;}.row__desc{font-size:12px;}" +
      ".note{background:var(--vq-surface,#fff);border:0;}" +
      ".xbtn{background:var(--vq-border-subtle,#E9E7F0);}" +
    "}";

  var root, host, cur = "display", open = false;

  /* ── ビルダー（すべて定義表の 1 行から作る）──────────────────── */
  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function head(sp) {
    return '<span class="row__main"><span class="row__label">' + esc(sp.label) + '</span>' +
      (sp.desc ? '<span class="row__desc">' + esc(sp.desc) + '</span>' : '') + '</span>';
  }
  function rowSelect(sp, v) {
    var opts = sp.opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? " selected" : "") + '>' + esc(o[1]) + '</option>';
    }).join("");
    return '<div class="row">' + head(sp) + '<select class="sel" data-set="' + esc(sp.id) + '">' + opts + '</select></div>';
  }
  function rowToggle(sp, v) {
    return '<div class="row">' + head(sp) +
      '<button class="sw' + (v ? ' on' : '') + '" role="switch" aria-checked="' + (!!v) + '" aria-label="' + esc(sp.label) + '" data-set="' + esc(sp.id) + '"></button></div>';
  }
  function rowSeg(sp, v) {
    var segs = sp.opts.map(function (o) {
      return '<button data-set="' + esc(sp.id) + '" data-val="' + esc(o[0]) + '" class="' + (String(v) === String(o[0]) ? "on" : "") + '">' + esc(o[1]) + '</button>';
    }).join("");
    return '<div class="row">' + head(sp) + '<span class="seg">' + segs + '</span></div>';
  }
  function rowAction(sp) {
    /* doc = 新しい書類の画面（vq-docs）／real = 本体の本物のボタン
       run = この場で動かす（マイクのように **押した指**が要るもの。
             本体のボタンを経由すると、触った扱いが切れて必ず失敗する） */
    var at = sp.run ? ('data-run="' + esc(sp.id) + '"')
      : sp.push ? 'data-push="1"'
      : sp.doc ? ('data-doc="' + esc(sp.doc) + '"')
      : ('data-action="' + esc(sp.real) + '"');
    return '<button class="row tap' + (sp.danger ? " danger" : "") + '" ' + at + (sp.closeFirst ? ' data-close="1"' : '') + '>' +
      head(sp) + '<span class="btn' + (sp.danger ? " dgr" : "") + '">' + esc(sp.value || "実行") + '</span></button>';
  }
  /* 自由に決める数（問題数・制限時間）。押せる −／＋ と直接入力の両方を出す。 */
  function rowNumber(sp, v) {
    var n = Number(v);
    var note = (sp.zeroLabel && n === 0) ? sp.zeroLabel : "";
    return '<div class="row">' + head(sp) +
      '<span class="num">' +
      '<button class="num__b" data-step="' + esc(sp.id) + '" data-dir="-1" aria-label="減らす">−</button>' +
      '<input class="num__i" type="number" inputmode="numeric" data-num="' + esc(sp.id) + '"' +
      ' min="' + sp.min + '" max="' + sp.max + '" step="' + (sp.step || 1) + '" value="' + n + '"' +
      ' aria-label="' + esc(sp.label) + '">' +
      '<button class="num__b" data-step="' + esc(sp.id) + '" data-dir="1" aria-label="増やす">＋</button>' +
      '<span class="num__u">' + esc(sp.unit || "") + '</span>' +
      '<span class="num__n">' + esc(note) + '</span></span></div>';
  }
  function rowInfo(sp) {
    var t = "";
    try { t = sp.read ? String(sp.read()) : ""; } catch (e) { t = "—"; }
    return '<div class="row">' + head(sp) + '<span class="rval">' + esc(t || "—") + '</span></div>';
  }
  function rowOf(sp) {
    var st = S();
    if (sp.type === "action") return rowAction(sp);
    if (sp.type === "info") return rowInfo(sp);
    var v = st.get(sp.id);
    if (sp.type === "select") return rowSelect(sp, v);
    if (sp.type === "seg") return rowSeg(sp, v);
    if (sp.type === "number") return rowNumber(sp, v);
    return rowToggle(sp, v);
  }
  function sectionHTML(sec) {
    if (sec.special && SPECIAL[sec.special]) return SPECIAL[sec.special]();
    var st = S();
    var rows = st.inGroup(sec.id);
    if (!rows.length) return '<div class="note">この束にはまだ設定がありません。</div>';
    /* 設定と「押すと動くもの」は見た目の意味が違うので、束の中で分ける */
    var vals = rows.filter(function (r) { return r.type !== "action" && r.type !== "info"; });
    var acts = rows.filter(function (r) { return r.type === "action"; });
    var infos = rows.filter(function (r) { return r.type === "info"; });
    var html = "";
    if (vals.length) html += '<div class="grp">' + vals.map(rowOf).join("") + '</div>';
    if (infos.length) html += (vals.length ? '<div class="gttl" style="margin-top:18px;">状態</div>' : '') +
      '<div class="grp">' + infos.map(rowOf).join("") + '</div>';
    if (acts.length) html += '<div class="gttl" style="margin-top:18px;">操作</div><div class="grp">' + acts.map(rowOf).join("") + '</div>';
    /* 自前の設定を持つ束だけ、既定値へ戻せるようにする */
    if (vals.some(function (r) { return r.kind === "own"; })) {
      html += '<div class="grp" style="margin-top:18px;">' +
        '<button class="row tap" data-reset="' + esc(sec.id) + '">' +
        '<span class="row__main"><span class="row__label">この束を既定に戻す</span>' +
        '<span class="row__desc">ほかの束と学習データはそのまま</span></span>' +
        '<span class="btn">戻す</span></button></div>';
    }
    return html;
  }
  /* ══════════════════════════════════════════════════════════════════
     アカウントの中身（メールアドレスと、連携しているアカウント）

     ここは表示専用ではなく、外す操作まで持つ。
     ただし「入り口を全部塞ぐ」ことはサーバ側が断るので、
     画面でも先に理由を見せて、押す前に分かるようにしている。
     ══════════════════════════════════════════════════════════════════ */
  function acctApi() {
    try {
      if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/+$/, "");
      if (window.VQ_API_BASE) return String(window.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  }
  function acctToken() {
    try { return String(localStorage.getItem("app.auth.token.v1") || "").trim(); } catch (e) { return ""; }
  }
  var ACCT = { state: "idle", email: "", hasEmail: false, hasPassword: false, links: [], err: "" };
  function acctLoad(force) {
    if (!force && (ACCT.state === "loading" || ACCT.state === "ready")) return;
    var tok = acctToken();
    if (!tok) { ACCT.state = "anon"; return; }
    ACCT.state = "loading"; ACCT.err = "";
    var hd = { Authorization: "Bearer " + tok };
    var g = function (path) {
      return fetch(acctApi() + path, { headers: hd })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    };
    Promise.all([g("/api/auth/me"), g("/api/auth/social/list")]).then(function (r) {
      var me = r[0] || {}, li = r[1] || {};
      var a = me.account || {};
      ACCT.hasEmail = !a.needsEmail;
      ACCT.email = String(a.email || "");
      ACCT.hasPassword = !!li.hasPassword;
      ACCT.links = Array.isArray(li.identities) ? li.identities : [];
      ACCT.state = (r[0] || r[1]) ? "ready" : "error";
      if (ACCT.state === "error") ACCT.err = "いまの状態を読み取れませんでした。";
      if (cur === "account") renderMain();
    });
  }
  function acctUnlink(provider) {
    var tok = acctToken();
    if (!tok) return;
    ACCT.state = "loading"; renderMain();
    fetch(acctApi() + "/api/auth/social/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ provider: provider })
    }).then(function (r) { return r.text().then(function (t) {
      var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
      return { ok: r.ok, data: d || {} };
    }); }).then(function (r) {
      if (!r.ok) { ACCT.state = "ready"; ACCT.err = r.data.message || "外せませんでした。"; renderMain(); return; }
      ACCT.err = "";
      acctLoad(true);
      renderMain();
    }).catch(function () { ACCT.state = "ready"; ACCT.err = "サーバーへつながりませんでした。"; renderMain(); });
  }
  /* 別の画面（メール登録など）で中身が変わったら、次に開くとき読み直す。 */
  try { window.__vqAcctRefresh = function () { ACCT.state = "idle"; acctLoad(true); }; } catch (e) {}
  /* ══════════════════════════════════════════════════════════════════
     ストレージ（使っている容量の内訳）

     帯で割合を、下の一覧で中身を出す。
     数え方（文字数からの見積もりか、実バイトか）は隠さずその場に書く。
     ══════════════════════════════════════════════════════════════════ */
  var STG = { state: "idle", data: null, err: "" };
  function stgLoad(force) {
    if (!force && (STG.state === "loading" || STG.state === "ready")) return;
    var tok = acctToken();
    if (!tok) { STG.state = "anon"; return; }
    STG.state = "loading"; STG.err = "";
    fetch(acctApi() + "/api/storage/usage", { headers: { Authorization: "Bearer " + tok } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) { STG.state = "error"; STG.err = "読み取れませんでした。"; }
        else { STG.data = d; STG.state = "ready"; }
        if (cur === "storage") renderMain();
      })
      .catch(function () { STG.state = "error"; STG.err = "サーバーへつながりませんでした。"; if (cur === "storage") renderMain(); });
  }
  function fmtBytes(n) {
    n = Math.max(0, Number(n) || 0);
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 1) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }
  /* ══ この端末の 容量（2026-08-19）═══════════════════════════════════
     ★ 訴え「ストレージ問題を どうにかしないと。何か 外部でないのかな」。
     ★ これまで この画面は **サーバに 預けているぶん**しか 出していなかった。
       本当に 詰まっていたのは **この端末の localStorage**（上限 4.4MB）。
       見えないから 手の打ちようが なかった。まず 見えるようにする。
     ★ 数は 推し量らない。端末が 答える値（navigator.storage.estimate）と、
       localStorage を 1 件ずつ 数えた値を そのまま 出す。 */
  var DEV = { 手元: null, 中: null, 移し中: false, 済: "" };
  function devLoad() {
    try {
      var I = window.VQIDB;
      if (!I) return;
      DEV.手元 = I.手元の量();
      I.容量().then(function (c) { DEV.中 = c; if (cur === "storage") renderMain(); });
    } catch (e) {}
  }
  function devMove() {
    var I = window.VQIDB;
    if (!I || DEV.移し中) return;
    DEV.移し中 = true; DEV.済 = ""; renderMain();
    I.移す().then(function (r) {
      DEV.移し中 = false;
      DEV.済 = r.移した.length
        ? r.移した.length + " 件を 移しました（" + fmtBytes(r.減ったバイト) + " ぶん 空きました）"
        : "移せるものは ありませんでした";
      devLoad(); renderMain();
    }).catch(function () {
      DEV.移し中 = false; DEV.済 = "移せませんでした。"; renderMain();
    });
  }
  /* ══ Google Drive（2026-08-27）════════════════════════════════════
     ★ 訴え「Google Drive というのは、ユーザーが VocabuQuiz と 連携をして、
       個人個人で プリセットを そこに 保存させる 仕組み。カバー画像も
       あれば それも そこに 一緒に 保存させる。目的は Cloudflare 自体の
       容量を 減らすため」。
     ★ 見えるものは 3 つだけ … つないでいるか／どれだけ 逃がしたか／外す。
     ★ 許しは **drive.file** だけ。これは「この アプリが 作った ファイル」
       しか 見えない 範囲。ここは 画面にも はっきり 書く。 */
  var DRV = { state: "idle", data: null, err: "", busy: false };
  function drvLoad(force) {
    if (!force && (DRV.state === "loading" || DRV.state === "ready")) return;
    var tok = acctToken();
    if (!tok) { DRV.state = "anon"; return; }
    DRV.state = "loading"; DRV.err = "";
    fetch(acctApi() + "/api/drive/status", { headers: { Authorization: "Bearer " + tok } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) { DRV.state = "error"; DRV.err = "状態を読み取れませんでした。"; }
        else { DRV.data = d; DRV.state = "ready"; }
        if (cur === "storage") renderMain();
      })
      .catch(function () {
        DRV.state = "error"; DRV.err = "サーバーへつながりませんでした。";
        if (cur === "storage") renderMain();
      });
  }
  function drvConnect() {
    var tok = acctToken();
    if (!tok || DRV.busy) return;
    DRV.busy = true; DRV.err = ""; renderMain();
    fetch(acctApi() + "/api/drive/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ returnTo: location.origin + location.pathname })
    }).then(function (r) { return r.text().then(function (t) {
      var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
      return { ok: r.ok, data: d || {} };
    }); }).then(function (r) {
      DRV.busy = false;
      if (!r.ok || !r.data.url) {
        DRV.err = r.data.message || "つなげませんでした。";
        renderMain(); return;
      }
      /* ★ **同じ窓で 飛ぶ**。別窓は スマホの Safari で 塞がれる。 */
      location.href = r.data.url;
    }).catch(function () { DRV.busy = false; DRV.err = "サーバーへつながりませんでした。"; renderMain(); });
  }
  /* ── プリセットを Drive へ 預ける ────────────────────────────
     ★ 1 件ずつ 別の ファイルにする。まとめて 1 本にすると、
       Drive の 一覧で 何が 入っているか 分からないし、
       1 件 直すたびに 全部 上げ直すことになる。
     ★ 消したもの（抜け殻）は 送らない。
     ★ 途中で 落ちても、通ったぶんは Drive に 残る（やり直せる）。 */
  var DPRE = { 中: false, 済: "", 数: 0, 全: 0 };
  function 手元のプリセット() {
    var 出 = [];
    ["vq2.presets.v1", "wordPractice400.presets.v1"].forEach(function (k) {
      var v = null;
      try { v = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { v = null; }
      if (!Array.isArray(v)) return;
      v.forEach(function (p) {
        if (!p || typeof p !== "object") return;
        var id = String(p.id || "");
        if (!id) return;
        /* 抜け殻（消したしるし）は 送らない */
        if (p.deletedAt && !p.questions) return;
        出.push({ id: id, name: String(p.title || p.name || id), value: JSON.stringify(p) });
      });
    });
    return 出;
  }
  function drvPushPresets() {
    var tok = acctToken();
    if (!tok || DPRE.中) return;
    var 並 = 手元のプリセット();
    if (!並.length) { DPRE.済 = "手元に プリセットが ありません。"; renderMain(); return; }
    DPRE.中 = true; DPRE.済 = ""; DPRE.数 = 0; DPRE.全 = 並.length; renderMain();
    var だめ = 0;
    並.reduce(function (p, x) {
      return p.then(function () {
        return fetch(acctApi() + "/api/drive/preset", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
          body: JSON.stringify({ id: x.id, name: x.name, value: x.value })
        }).then(function (r) {
          if (r.ok) DPRE.数++; else だめ++;
          if (DPRE.数 % 5 === 0) renderMain();
        }).catch(function () { だめ++; });
      });
    }, Promise.resolve()).then(function () {
      DPRE.中 = false;
      DPRE.済 = DPRE.数 + " 件を Drive へ 置きました"
        + (だめ ? "（" + だめ + " 件は 置けませんでした）" : "") + "。";
      drvLoad(true); renderMain();
    });
  }
  function drvUnlink() {
    var tok = acctToken();
    if (!tok || DRV.busy) return;
    DRV.busy = true; DRV.err = ""; renderMain();
    fetch(acctApi() + "/api/drive/unlink", {
      method: "POST", headers: { Authorization: "Bearer " + tok }
    }).then(function () {
      DRV.busy = false; drvLoad(true); stgLoad(true); renderMain();
    }).catch(function () { DRV.busy = false; DRV.err = "外せませんでした。"; renderMain(); });
  }
  /* 戻ってきたとき（#drive=ok など）に 一言 返す。1 度だけ。 */
  var 戻りの言葉 = "";
  (function () {
    try {
      var m = /[#&]drive=([a-zA-Z]+)/.exec(location.hash || "");
      if (!m) return;
      var 表 = {
        ok: "Google Drive とつながりました。これからの 表紙や 絵は Drive へ 入ります。",
        cancel: "つなぐのを やめました。",
        expired: "時間が 経ちすぎました。もう一度 押してください。",
        bad: "うまく つながりませんでした。もう一度 押してください。",
        notready: "この機能は まだ 使えません（設定待ち）。",
        noRefresh: "Google から 続けて使う ための 札が 返りませんでした。もう一度 押してください。"
      };
      戻りの言葉 = 表[m[1]] || "";
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {}
  })();
  function driveHTML() {
    if (DRV.state === "anon") return "";
    drvLoad();
    var out = '<div class="gttl" style="margin-top:22px;">Google Drive に 逃がす</div>';
    if (DRV.state !== "ready") {
      return out + '<div class="grp"><div class="row"><span class="row__main"><span class="row__label">'
        + (DRV.state === "error" ? esc(DRV.err) : "確認しています…") + "</span></span></div></div>";
    }
    var d = DRV.data || {};
    if (!d.使える) {
      return out + '<div class="grp"><div class="row"><span class="row__main">'
        + '<span class="row__label">まだ 使えません</span>'
        + '<span class="row__desc">この 置き場は 管理者の 設定待ちです。'
        + "設定が 済むと、ここから つなげるようになります。</span></span></div></div>";
    }
    if (戻りの言葉) {
      out += '<div class="grp"><div class="row"><span class="row__main">'
        + '<span class="row__desc">' + esc(戻りの言葉) + "</span></span></div></div>";
    }
    if (!d.つながっている) {
      out += '<div class="acard"><div class="acard__t">まだ つないでいません</div>'
        + '<div class="acard__m">つなぐと、これから 作る 表紙・アイコン・画像・動画は '
        + "<b>あなたの Google Drive</b> へ 入ります。VocabuQuiz 側の 容量は 使いません。</div>"
        + '<div class="note" style="margin-top:8px">許してもらうのは '
        + "<b>この アプリが 作った ファイルだけ</b>（drive.file）です。"
        + "あなたの 既にある 書類や 写真は <b>一切 見えません</b>。"
        + "中身の 出し入れは VocabuQuiz の サーバが 行い、"
        + "Google の 合言葉を 画面へ 渡すことは ありません。</div>"
        + '<div style="margin-top:12px"><button class="btn" data-drv="connect"'
        + (DRV.busy ? " disabled" : "") + ">"
        + (DRV.busy ? "つないでいます…" : "Google Drive とつなぐ") + "</button></div>"
        + (DRV.err ? '<div class="note" style="margin-top:8px">' + esc(DRV.err) + "</div>" : "")
        + "</div>";
      return out;
    }
    var 天 = Math.max(0, Number(d.Driveの天井 || 0));
    var 使 = Math.max(0, Number(d.Driveの使用 || 0));
    var 割 = 天 ? Math.min(100, (使 / 天) * 100) : 0;
    out += '<div class="acard"><div class="acard__t">つながっています</div>'
      + '<div class="acard__en">' + esc(d.メール || "Google アカウント") + "</div>"
      + '<div class="acard__m">VocabuQuiz が 預けたもの: ' + fmtBytes(d.バイト) + "（" + (d.件数 || 0) + " 件）</div>"
      + (天 ? '<div class="stg-bar" role="img" aria-label="Drive で 使っている割合">'
            + '<i style="width:' + Math.max(1.2, 割).toFixed(2) + '%;background:#8fa76b"></i></div>'
            + '<div class="note" style="margin-top:8px">あなたの Drive 全体: '
            + fmtBytes(使) + " / " + fmtBytes(天) + "</div>" : "")
      + (d.最後の困りごと ? '<div class="note" style="margin-top:8px">困りごと: '
          + esc(d.最後の困りごと) + "</div>" : "")
      + '<div style="margin-top:12px"><button class="btn btn--sm" data-drv="presets"'
      + (DPRE.中 ? " disabled" : "") + ">"
      + (DPRE.中 ? "置いています… " + DPRE.数 + " / " + DPRE.全 : "プリセットを Drive へ 置く")
      + '</button> <button class="btn btn--sm" data-drv="unlink"'
      + (DRV.busy ? " disabled" : "") + ">連携を外す</button></div>"
      + (DPRE.済 ? '<div class="note" style="margin-top:8px">' + esc(DPRE.済) + "</div>" : "")
      + '<div class="note" style="margin-top:8px">プリセットは <b>1 件ずつ 別の ファイル</b>で '
      + "入ります（VocabuQuiz という 入れ物の 中）。表紙や 絵は、つないだ あとに 作った ぶんが "
      + "自動で こちらへ 入ります。<b>すでに ある 絵は 動きません</b>（勝手に 動かすと "
      + "貼ってある 場所が 切れるため）。</div>"
      + '<div class="note" style="margin-top:8px">外しても <b>Drive の中身は 消しません</b>。'
      + "あなたの 持ち物なので、消すかどうかは あなたが 決めます。"
      + "ただし 外したあとは、Drive に ある 絵は 画面に 出せなくなります。</div>"
      + (DRV.err ? '<div class="note" style="margin-top:8px">' + esc(DRV.err) + "</div>" : "")
      + "</div>";
    return out;
  }

  function deviceHTML(opts) {
    var I = window.VQIDB;
    if (!I) return "";
    if (!DEV.手元) devLoad();
    var h = DEV.手元 || { 合計: 0, 明細: [], 上限のめやす: 4.4 * 1024 * 1024 };
    var 割 = Math.min(100, (h.合計 / (h.上限のめやす || 1)) * 100);
    var 色 = 割 > 85 ? "#C0392B" : 割 > 65 ? "#B0791F" : "#756DB3";
    var 上位 = h.明細.slice(0, 6);
    /* ★ 上の 要約カードで 同じ 数字を 出している ので、
       「くわしく」の 中では 表だけに する（二度 出さない）。 */
    if (opts && opts.表だけ) {
      var o2 = '<div class="gttl" style="margin-top:6px;">この端末で 大きいもの</div><div class="grp">'
        + (上位.length ? 上位.map(function (x) {
            return '<div class="row" title="' + esc(x.鍵) + '"><span class="row__main"><span class="row__label">'
              + esc(名前をやさしく(x.鍵)) + '</span><span class="row__desc">'
              + esc(何に使うか(x.鍵)) + "</span></span>"
              + '<span class="rval">' + fmtBytes(x.バイト) + "</span></div>";
          }).join("")
          : '<div class="row"><span class="row__main"><span class="row__label">まだ 何も ありません</span></span></div>')
        + "</div>"
        + '<div class="grp" style="margin-top:12px"><div class="row"><span class="row__main">'
        + '<span class="row__label">大きいものを 置き場へ 移す</span>'
        + '<span class="row__desc">AR Board・会話の記録・控えを IndexedDB へ。中身は 消えません</span></span>'
        + '<button class="btn btn--sm" data-dev="move"' + (DEV.移し中 ? " disabled" : "") + ">"
        + (DEV.移し中 ? "移しています…" : "移す") + "</button></div>"
        + (DEV.済 ? '<div class="row"><span class="row__main"><span class="row__desc">'
            + esc(DEV.済) + "</span></span></div>" : "")
        + "</div>";
      return o2;
    }
    var out = '<div class="gttl" style="margin-top:22px;">この端末の中</div>'
      + '<div class="acard"><div class="acard__t">すぐ読む場所</div>'
      + '<div class="acard__en">localStorage</div>'
      + '<div class="acard__m">' + fmtBytes(h.合計) + " / " + fmtBytes(h.上限のめやす)
      + "（" + 割.toFixed(1) + "%）</div>"
      + '<div class="stg-bar" role="img" aria-label="この端末で 使っている割合">'
      + '<i style="width:' + Math.max(1.2, 割).toFixed(2) + "%;background:" + 色 + '"></i></div>'
      + '<div class="note" style="margin-top:8px">ここは <b>上限が 約 4.4MB</b> しかありません'
      + "（実際に 測った値）。いっぱいになると、新しく作ったものを 保存できなくなります。</div>"
      + "</div>";
    if (DEV.中 && DEV.中.分かる) {
      out += '<div class="acard" style="margin-top:10px"><div class="acard__t">大きいものの置き場</div>'
        + '<div class="acard__en">IndexedDB</div>'
        + '<div class="acard__m">' + fmtBytes(DEV.中.使用) + " / " + fmtBytes(DEV.中.上限) + "</div>"
        + '<div class="note" style="margin-top:8px">こちらは 上のところの <b>約 1,700 倍</b> 入ります。'
        + "写真つきの AR Board・会話の記録・控えは ここへ 移せます。外へは 送りません。</div></div>";
    }
    out += '<div class="gttl" style="margin-top:18px;">この端末で 大きいもの</div><div class="grp">'
      + (上位.length ? 上位.map(function (x) {
          /* ★ 英語の 鍵（wordPractice400.presets.v1 など）を そのまま 並べていた。
             読む人には 意味が 無いので、説明は 日本語にして、
             鍵は 指したときだけ 出す（title）。 */
          return '<div class="row" title="' + esc(x.鍵) + '"><span class="row__main"><span class="row__label">'
            + esc(名前をやさしく(x.鍵)) + '</span><span class="row__desc">'
            + esc(何に使うか(x.鍵)) + "</span></span>"
            + '<span class="rval">' + fmtBytes(x.バイト) + "</span></div>";
        }).join("")
        : '<div class="row"><span class="row__main"><span class="row__label">まだ 何も ありません</span></span></div>')
      + "</div>";
    out += '<div class="grp" style="margin-top:12px"><div class="row"><span class="row__main">'
      + '<span class="row__label">大きいものを 置き場へ 移す</span>'
      + '<span class="row__desc">AR Board・会話の記録・控えを IndexedDB へ。中身は 消えません</span></span>'
      + '<button class="btn btn--sm" data-dev="move"' + (DEV.移し中 ? " disabled" : "") + ">"
      + (DEV.移し中 ? "移しています…" : "移す") + "</button></div>"
      + (DEV.済 ? '<div class="row"><span class="row__main"><span class="row__desc">'
          + esc(DEV.済) + "</span></span></div>" : "")
      + "</div>";
    return out;
  }
  /* 何に 使っているかを 日本語で 一言。分からないものは 空（無理に 書かない）。 */
  function 何に使うか(k) {
    if (/presets/.test(k)) return "自分で作った 問題集";
    if (/arboards|arapp/.test(k)) return "AR Board / AR App が 覚えたもの";
    if (/chat/.test(k)) return "Lumi との やりとり";
    if (/backup/.test(k)) return "控え（戻すための 写し）";
    if (/auth|token/.test(k)) return "ログインの 合言葉";
    if (/settings|prefs/.test(k)) return "選んだ 設定";
    if (/insight|result|stat/.test(k)) return "解いた 記録";
    return "アプリが 覚えているもの";
  }
  function 名前をやさしく(k) {
    var 表 = {
      "wordPractice400.presets.v1": "プリセット（自分で作ったもの）",
      "vq2.presets.v1": "プリセット（新しい形）",
      "vq2.arboards.v1": "AR Board（写真・動くもの）",
      "app.chat.history.v1": "会話の記録",
      "app.backup.latest.v1": "控え（バックアップ）",
      "vq2.playerPrefs.v1": "解いている画面の設定",
      "app.auth.token.v1": "ログインの合言葉"
    };
    if (表[k]) return 表[k];
    if (/^vq2\.arapp\./.test(k)) return "AR App が 覚えたもの";
    if (/^app\.chat\./.test(k)) return "会話まわり";
    if (/^vq\./.test(k) || /^vq2\./.test(k)) return "アプリの設定";
    return k;
  }

  function storageHTML() {
    /* ★ この端末のぶんは **ログインしていなくても** 出す
       （詰まっているのは こちらなので、ここで 隠してはいけない）。 */
    if (STG.state === "anon")
      return deviceHTML()
        + '<div class="note" style="margin-top:14px">ログインすると、'
        + "VocabuQuiz に 預けているぶんも 出せます。</div>";
    stgLoad();
    if (STG.state !== "ready") {
      return '<div class="grp"><div class="row"><span class="row__main"><span class="row__label">'
        + (STG.state === "error" ? esc(STG.err) : "数えています…") + "</span></span></div></div>";
    }
    var d = STG.data;
    var used = Math.max(0, Number(d.totalBytes) || 0);
    var items = (d.items || []).filter(function (x) { return x.bytes > 0; });
    var sum = items.reduce(function (n, x) { return n + x.bytes; }, 0) || 1;

    /* 帯。1% 未満のものも見えるように、最小の幅を持たせる。 */
    var bar = '<div class="stg-bar" role="img" aria-label="使っている容量の内訳">'
      + items.map(function (x) {
        var pct = Math.max(1.2, (x.bytes / sum) * 100);
        return '<i style="width:' + pct.toFixed(2) + "%;background:" + esc(x.color) + '"'
          + ' title="' + esc(x.label) + " " + fmtBytes(x.bytes) + '"></i>';
      }).join("") + "</div>";
    var legend = '<div class="stg-leg">' + items.map(function (x) {
      return '<span class="stg-leg__i"><i style="background:' + esc(x.color) + '"></i>'
        + esc(x.label.replace(/（.*/, "")) + "</span>";
    }).join("") + "</div>";

    var q = Math.max(0, Number(d.quotaBytes) || 0);
    var pct = q ? Math.min(100, (used / q) * 100) : 0;
    var head = '<div class="acard"><div class="acard__t">この端末ではなく、VocabuQuiz に預けている分</div>'
      + '<div class="acard__m">' + fmtBytes(used) + (q ? " / " + fmtBytes(q)
        + "（" + (pct < 0.01 && used > 0 ? "0.01 未満" : pct.toFixed(2)) + "%）" : "") + "</div>"
      + bar + legend + "</div>";

    var list = '<div class="gttl" style="margin-top:18px;">内訳</div><div class="grp">'
      + (items.length ? items.map(function (x) {
        return '<div class="row"><span class="row__main">'
          + '<span class="row__label"><i class="stg-dot" style="background:' + esc(x.color) + '"></i>'
          + esc(x.label) + "</span>"
          + '<span class="row__desc">' + esc(x.hint || "")
          + (x.count ? "　" + x.count + " 件" : "") + "</span></span>"
          + '<span class="rval">' + fmtBytes(x.bytes) + (x.exact ? "" : "＊") + "</span></div>";
      }).join("")
        : '<div class="row"><span class="row__main"><span class="row__label">まだ何も預かっていません</span>'
          + '<span class="row__desc">作ったものが増えると、ここに出ます。</span></span></div>')
      + "</div>";

    var note = '<div class="note" style="margin-top:12px">＊印は見積もりです。'
      + esc(d.estimateNote || "") + "</div>";

    /* 1 回ぶんの上限。ここはサーバが実際に断る値なので、そのまま出す。 */
    var L = d.limits || {};
    var lim = '<div class="gttl" style="margin-top:18px;">1 つあたりの上限</div><div class="grp">'
      + [["画像 1 枚", L.imageBytes],
         ["動画 1 本", d.mediaBackend === "d1" ? L.videoBytesNoR2 : L.videoBytes],
         ["読み込む PDF 1 つ", L.pdfBytes],
         ["まとめて同期する分", L.syncBytes],
         ["控え（バックアップ）", L.backupBytes],
         ["設定", L.settingsBytes]].map(function (r) {
        return '<div class="row"><span class="row__main"><span class="row__label">' + r[0]
          + "</span></span><span class=\"rval\">" + fmtBytes(r[1]) + "</span></div>";
      }).join("") + "</div>";

    var quota = '<div class="gttl" style="margin-top:18px;">ひとりあたりの上限</div><div class="grp">'
      + '<div class="row"><span class="row__main"><span class="row__label">あなたが使える容量</span>'
      + '<span class="row__desc">残り ' + fmtBytes(Math.max(0, q - used)) + "</span></span>"
      + '<span class="rval">' + fmtBytes(q) + "</span></div>"
      + '<div class="row"><span class="row__main"><span class="row__label">いまの実際の保管庫</span>'
      + '<span class="row__desc">'
      + (d.mediaBackend === "d1"
        ? "画像と動画は、いま全員で 1 つの保管庫に入っています。その保管庫の上限が "
          + fmtBytes(d.sharedDatabaseLimitBytes) + " なので、<b>1TB まで置けるのは R2 を有効にしてから</b>です。"
        : "画像と動画は R2 に入っています。上限まで使えます。")
      + "</span></span>"
      + '<span class="rval">' + fmtBytes(d.sharedDatabaseLimitBytes) + "</span></div></div>";

    /* ★ 2026-08-29: **一目で 分かる 形**に した。
       前は 6 つの 表が 縦に 並び、どこを 見れば よいか 分からなかった。
       いまは「いま どれだけ 使っているか」を **1 枚**で 出し、
       細かい 数字は「くわしく」を 押した ときだけ。 */
    return 要約カード(used, q) + driveHTML()
      + '<details class="stg-more"><summary>くわしく見る</summary><div class="stg-more__b">'
      + deviceHTML({ 表だけ: true })
      + '<div class="gttl" style="margin-top:18px;">預けているぶんの 内訳</div>'
      + bar + legend + list.replace(/^<div class="gttl"[^>]*>内訳<\/div>/, "") + note + lim + quota
      + "</div></details>";
  }

  /* ── 要約（この端末 と クラウドを 並べて 1 枚で）──────────────── */
  function 要約カード(用, 枠) {
    var I = window.VQIDB;
    var h = (I && DEV.手元) || { 合計: 0, 上限のめやす: 4.4 * 1024 * 1024 };
    if (I && !DEV.手元) devLoad();
    var 端末上限 = (DEV.中 && DEV.中.分かる && DEV.中.上限) ? DEV.中.上限 : (h.上限のめやす || 1);
    var 端末使用 = (DEV.中 && DEV.中.分かる) ? (DEV.中.使用 || 0) : (h.合計 || 0);
    var 端末割 = Math.min(100, (端末使用 / (端末上限 || 1)) * 100);
    var 雲割 = 枠 ? Math.min(100, (用 / 枠) * 100) : 0;
    var 色 = function (p) { return p > 85 ? "var(--vq-danger,#C0392B)" : p > 65 ? "var(--vq-warning-text,#B0791F)" : "var(--vq-accent,#756DB3)"; };
    var 言 = function (p) { return p > 85 ? "もう いっぱいです" : p > 65 ? "そろそろです" : "まだ 余裕が あります"; };
    var 枡 = function (題, 使, 上, 割, 注) {
      return '<div class="stg2-c">'
        + '<div class="stg2-t">' + 題 + "</div>"
        + '<div class="stg2-n">' + fmtBytes(使) + '<span class="stg2-s"> / ' + fmtBytes(上) + "</span></div>"
        + '<div class="stg2-bar"><i style="width:' + Math.max(1.5, 割).toFixed(1) + "%;background:" + 色(割) + '"></i></div>'
        + '<div class="stg2-m">' + (割 < 0.1 && 使 > 0 ? "0.1% 未満" : 割.toFixed(1) + "%") + " ・ " + 言(割) + "</div>"
        + (注 ? '<div class="stg2-h">' + 注 + "</div>" : "")
        + "</div>";
    };
    return '<div class="stg2">'
      + 枡("この端末", 端末使用, 端末上限, 端末割, "作った プリセットや 会話が 入ります")
      + (枠 ? 枡("クラウド", 用, 枠, 雲割, "ほかの 端末とも 同じに なります")
            : '<div class="stg2-c"><div class="stg2-t">クラウド</div>'
              + '<div class="stg2-n">—</div><div class="stg2-h">ログインすると 出ます</div></div>')
      + "</div>";
  }

  function acctHTML() {
    if (ACCT.state === "anon") return "";
    var busy = ACCT.state === "loading" || ACCT.state === "idle";
    var out = '<div class="gttl" style="margin-top:18px;">アカウントを守る</div><div class="grp">';
    /* メールアドレス */
    var eLabel = busy ? "確認中…" : (ACCT.hasEmail ? (ACCT.email || "登録済み") : "未登録");
    var eDesc = ACCT.hasEmail
      ? "パスワードを忘れたとき、ここへ確認コードを送って戻せます。"
      : "登録しておくと、パスワードを忘れても自分で戻せます。";
    out += '<button class="row tap" data-emailsetup="1"><span class="row__main">'
      + '<span class="row__label">メールアドレス</span>'
      + '<span class="row__desc">' + esc(eDesc) + "</span></span>"
      + '<span class="rval" style="margin-right:8px">' + esc(eLabel) + "</span>"
      + '<span class="btn">' + (ACCT.hasEmail ? "変える" : "登録する") + "</span></button>";
    out += "</div>";
    /* 連携しているアカウント */
    out += '<div class="gttl" style="margin-top:18px;">連携しているアカウント</div><div class="grp">';
    if (busy) {
      out += '<div class="row"><span class="row__main"><span class="row__label">確認中…</span></span></div>';
    } else if (!ACCT.links.length) {
      out += '<div class="row"><span class="row__main">'
        + '<span class="row__label">まだありません</span>'
        + '<span class="row__desc">ログイン画面の「Google で続ける」から結び付けられます。</span>'
        + "</span></div>";
    } else {
      ACCT.links.forEach(function (x) {
        /* パスワードが無く、これが最後の 1 つなら外させない（入り口が消えるため）。 */
        var last = !ACCT.hasPassword && ACCT.links.length <= 1;
        var sub = x.email || x.displayName || "";
        out += '<div class="row"><span class="row__main">'
          + '<span class="row__label">' + esc(x.providerLabel || x.provider) + "</span>"
          + '<span class="row__desc">' + esc(sub || "連携中")
          + (last ? " ／ いまの入り口はこれだけです。先にパスワードを決めてください。" : "")
          + "</span></span>"
          + '<button class="btn' + (last ? "" : " dgr") + '" type="button"'
          + (last ? " disabled" : ' data-unlink="' + esc(x.provider) + '"')
          + ">外す</button></div>";
      });
    }
    out += "</div>";
    if (ACCT.err) {
      out += '<div class="note" style="margin-top:10px;color:#B4321F">' + esc(ACCT.err) + "</div>";
    }
    return out;
  }

  function mir(id, fb) { var e = $(id); var t = e ? (e.textContent || "").trim() : ""; return t || fb; }
  function isHidden(id) { var e = $(id); return !e || e.classList.contains("hidden"); }
  /* ══════════════════════════════════════════════════════════════════
     アカウント画面

     作り直した理由:
       ・同じことが 3 回出ていた（カード／状態／ユーザー）
       ・「セッション」という束に暗証番号まで入っていて、名前と中身が合わない
       ・**何が設定できていて、何が空なのかが分からない**のがいちばん困る

     いまの並び（上から、考える順に）:
       1. あなた            … 誰として使っているか（1 回だけ）
       2. 入れなくなったときに戻る道 … ここが空だと本当に戻れない。先に見せる
       3. パスワード
       4. このアカウントをやめる
     ══════════════════════════════════════════════════════════════════ */
  function accountHTML() {
    var loggedIn = !isHidden("settingsAccountLogoutBtn");
    if (!loggedIn) {
      return '<div class="acard"><div class="acard__t">ログインしていません</div>'
        + '<div class="acard__m">ログインすると、作ったものが端末をまたいで残ります。</div></div>'
        + '<div class="grp">'
        + '<button class="row tap" data-action="settingsAccountOpenLoginBtn" data-close="1">'
        + '<span class="row__main"><span class="row__label">ログイン</span></span>'
        + '<span class="btn pri">開く</span></button>'
        + '<button class="row tap" data-action="settingsAccountOpenRegisterBtn" data-close="1">'
        + '<span class="row__main"><span class="row__label">新しくアカウントを作る</span></span>'
        + '<span class="btn">開く</span></button></div>';
    }

    acctLoad();
    meLoad();
    var busy = ACCT.state === "loading" || ACCT.state === "idle";

    /* ── 1. あなた ──
       前は名前とログインIDを並べていたが、中身がほぼ同じで 2 行が無駄だった。
       顔（アイコン）と @ の名前にして、下に数を静かに置く。
       数は本物（サーバが返した値）だけを出す。 */
    var av = ME.avatar
      ? '<span class="whoCard__av" style="background-image:url(' + esc(ME.avatar) + ')"></span>'
      : '<span class="whoCard__av is-txt">' + esc(meInitial(ME.name)) + "</span>";
    var stat = function (n, label) {
      return '<span class="whoCard__st"><b>' + n + "</b><i>" + label + "</i></span>";
    };
    var who = '<div class="whoCard">'
      + '<div class="whoCard__top">' + av
      + '<span class="whoCard__b">'
      + '<span class="whoCard__n">' + esc(ME.name || mir("settingsAccountUserLine", "—")) + "</span>"
      + '<span class="whoCard__h">' + (ME.handle ? "@" + esc(ME.handle) : "&nbsp;") + "</span>"
      + "</span></div>"
      + (ME.state === "ready"
        ? '<div class="whoCard__row">' + stat(ME.followers, "フォロワー")
          + stat(ME.following, "フォロー中") + stat(ME.presets, "公開した問題集") + "</div>"
        : "")
      + "</div>";

    /* ── 2. 戻る道 ──
       いくつ用意できているかを先に数える。0 なら赤く出す。 */
    var hasMail = !busy && ACCT.hasEmail;
    var hasPin = false;
    try { hasPin = !!(window.__vqPin && window.__vqPin.isSet && window.__vqPin.isSet()); } catch (e) {}
    var hasLink = !busy && ACCT.links.length > 0;
    var ways = (hasMail ? 1 : 0) + (hasPin ? 1 : 0) + (hasLink ? 1 : 0);

    var warn = "";
    if (!busy && ways === 0) {
      warn = '<div class="acard" style="border-color:#E9B4A8;background:#FDF3F0">'
        + '<div class="acard__t" style="color:#B4321F">戻る道がありません</div>'
        + '<div class="acard__m">いまパスワードを忘れると、このアカウントへ入れなくなります。'
        + "下のどれか 1 つだけでも用意してください。</div></div>";
    }

    function wayRow(on, label, desc, act, extra) {
      return '<button class="row tap" ' + act + '>'
        + '<span class="row__main"><span class="row__label">' + label + "</span>"
        + '<span class="row__desc">' + esc(desc) + "</span></span>"
        + '<span class="rval" style="margin-right:8px;color:'
        + (on ? "var(--vq-success-text,#2E7D5B)" : "var(--vq-text-tertiary,#9A96AA)") + '">'
        + (busy ? "確認中…" : (on ? "できています" : "まだです")) + "</span>"
        + '<span class="btn">' + (extra || (on ? "変える" : "する")) + "</span></button>";
    }

    var back = '<div class="gttl" style="margin-top:18px;">入れなくなったときに戻る道'
      + (busy ? "" : "（" + ways + " / 3）") + "</div><div class=\"grp\">"
      + wayRow(hasMail, "メールアドレス",
          hasMail ? (ACCT.email || "登録済み") + " へ確認コードを送って戻せます"
                  : "登録しておくと、確認コードで自分で戻せます",
          'data-emailsetup="1"')
      + wayRow(hasPin, "暗証番号",
          hasPin ? "4 桁か 6 桁の数字で戻せます" : "4 桁か 6 桁の数字を決めておくと戻せます",
          'data-pin="1"')
      + wayRow(hasLink, "Google と結ぶ",
          hasLink ? (ACCT.links.map(function (x) { return x.providerLabel || x.provider; }).join("・")
                     + " と結んでいます")
                  : "ログイン画面の「Google で続ける」から結べます",
          'data-nav="account"', hasLink ? "外す" : "—")
      + "</div>";

    /* 連携の中身（外す操作はここに置く。上は状態だけ） */
    var links = "";
    if (!busy && ACCT.links.length) {
      links = '<div class="grp" style="margin-top:8px">' + ACCT.links.map(function (x) {
        var last = !ACCT.hasPassword && ACCT.links.length <= 1;
        return '<div class="row"><span class="row__main">'
          + '<span class="row__label">' + esc(x.providerLabel || x.provider) + "</span>"
          + '<span class="row__desc">' + esc(x.email || x.displayName || "連携中")
          + (last ? " ／ これを外すと入れなくなります" : "") + "</span></span>"
          + '<button class="btn' + (last ? "" : " dgr") + '" type="button"'
          + (last ? " disabled" : ' data-unlink="' + esc(x.provider) + '"') + ">外す</button></div>";
      }).join("") + "</div>";
    }

    /* ── 3. パスワード ── */
    var pw = '<div class="gttl" style="margin-top:18px;">パスワード</div><div class="grp">'
      + '<button class="row tap" data-action="authChangePwSubmitBtn" data-close="1">'
      + '<span class="row__main"><span class="row__label">パスワードを変える</span>'
      + '<span class="row__desc">いまのパスワードを知っている場合に使います</span></span>'
      + '<span class="btn">変える</span></button></div>';

    /* ── 4. やめる ── */
    var quit = '<div class="gttl" style="margin-top:18px;">このアカウントをやめる</div><div class="grp">'
      + '<button class="row tap" data-action="settingsAccountLogoutBtn" data-close="1">'
      + '<span class="row__main"><span class="row__label">ログアウト</span>'
      + '<span class="row__desc">この端末から出るだけ。学習の記録は残ります</span></span>'
      + '<span class="btn">出る</span></button>'
      + '<button class="row tap danger" data-action="settingsAccountDeleteBtn" data-close="1">'
      + '<span class="row__main"><span class="row__label">アカウントを消す</span>'
      + '<span class="row__desc">作ったものも記録も、すべて消えます。戻せません</span></span>'
      + '<span class="btn dgr">消す</span></button></div>';

    var err = ACCT.err ? '<div class="note" style="margin-top:12px;color:#B4321F">' + esc(ACCT.err) + "</div>" : "";
    return who + warn + back + links + pw + quit + err;
  }

  /* ── Learning Workspace（V2）────────────────────────────────────
     左サイドバーの「Learning Workspace」から開く 4 画面の ON/OFF。
     実体は client/v2 側（window.VQ2FLAGS）。ここは表示と切替だけを持つ。 */
  var WS_MAIN = [
    { key: "presetStudioV2", label: "プリセットを作る／編集", desc: "教材から AI が問題を作り、差分を確認してから反映する" },
    { key: "quizPlayerV2", label: "クイズを解く", desc: "集中モード・自動保存・途中から再開" },
    { key: "resultViewV2", label: "結果と分析", desc: "問題別の振り返りと、苦手だけを集めた復習づくり" },
    { key: "quickMockV2", label: "Quick Mock（試験）", desc: "試験の作成・紙面づくり・デジタル受験" }
  ];
  var WS_MOCK = [
    { key: "quickMockPdfEngine", label: "問題冊子・解答用紙をつくる", desc: "印刷して使える紙面（縦書き・ルビ対応）" },
    { key: "quickMockDigitalExam", label: "画面で受験する", desc: "問題冊子と解答欄を並べて解く" },
    { key: "quickMockAiGrading", label: "記述問題を AI が採点する", desc: "採点基準つき。確認が必要なものには印が付く" },
    { key: "quickMockFeedSharing", label: "結果を Feed に共有する", desc: "何を共有するかは毎回選べる。問題文や答案は共有されない" }
  ];
  function wsRow(r, on, blocked) {
    return '<div class="row"' + (blocked ? ' style="opacity:.45"' : '') + '>' +
      '<span class="row__main"><span class="row__label">' + r.label + '</span>' +
      '<span class="row__desc">' + r.desc + '</span></span>' +
      '<button class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (!!on) + '"' +
      (blocked ? ' disabled' : '') + ' aria-label="' + r.label + '" data-vq2flag="' + r.key + '"></button></div>';
  }
  function workspaceHTML() {
    var F = window.VQ2FLAGS;
    if (!F) {
      return '<div class="note">Learning Workspace がこの端末で読み込まれていません。' +
        'ページを再読み込みしても出ない場合は、ビルド（client/v2/build-v2.mjs）が入っているか確認してください。</div>';
    }
    var a = F.all();
    var html = '<div class="note">左サイドバーの「Learning Workspace」から開く画面です。' +
      'OFF にすると入口が消え、これまでの画面のままになります。作ったデータは消えません。</div>';
    html += '<div class="gttl" style="margin-top:18px;">つかう機能</div><div class="grp">' +
      WS_MAIN.map(function (r) { return wsRow(r, a[r.key], false); }).join("") + '</div>';
    html += '<div class="gttl" style="margin-top:18px;">Quick Mock の中身</div><div class="grp">' +
      WS_MOCK.map(function (r) { return wsRow(r, a[r.key], !a.quickMockV2); }).join("") + '</div>' +
      (a.quickMockV2 ? '' : '<div class="note" style="margin-top:10px;">「Quick Mock（試験）」を ON にすると選べます。</div>');
    /* 保存されているデータ（実データのみ。無ければ出さない） */
    try {
      var ST = window.VQ2 && window.VQ2.store;
      if (ST) {
        var n = [
          ["プリセット", ST.listPresets({ includeLegacy: false }).length],
          ["試験", ST.mocks.list().length],
          ["結果", ST.results.list().length]
        ];
        if (n.some(function (x) { return x[1] > 0; })) {
          html += '<div class="gttl" style="margin-top:18px;">つくったもの</div><div class="grp">' +
            n.map(function (x) {
              return '<div class="row"><span class="row__main"><span class="row__label">' + x[0] +
                '</span></span><span class="rval">' + x[1] + '</span></div>';
            }).join("") + '</div>';
        }
      }
    } catch (e) {}
    return html;
  }

  /* 設定そのものは、ぜんぶこの画面に移した。ここに残るのは「設定」ではなく **道具**。
     従来の設定画面をまるごと開く導線は置かない（同じ設定が 2 か所にあると必ずずれる）。 */
  var TOOLS = [
    { nav: "assistants", label: "公式拡張アシスタント", desc: "追加したアシスタントの一覧と更新" },
    { nav: "assistantEditor", label: "OEA エディタ", desc: "自分のアシスタントを作る・直す" },
    { nav: "admin", label: "Admin", desc: "お知らせ・メンテナンス・違反管理（管理者のみ）" }
  ];
  function advancedHTML() {
    return '<div class="note">設定はすべてこの画面にあります。ここにあるのは、設定ではなく道具です。</div>' +
      '<div class="grp" style="margin-top:16px;">' +
      TOOLS.map(function (t) {
        return '<button class="row tap" data-tool="' + esc(t.nav) + '">' +
          '<span class="row__main"><span class="row__label">' + esc(t.label) + '</span>' +
          '<span class="row__desc">' + esc(t.desc) + '</span></span><span class="btn">開く</span></button>';
      }).join("") + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════
     いちばん上の「自分」の行

     PC は左の列の頭、モバイルは一覧の頭。どちらも同じ見た目にする。
     macOS のシステム設定と同じ置き方で、
     「いまどのアカウントで使っているか」を最初に見せる。

     写真が無い人のほうが多いので、そのときは頭文字を丸に入れる。
     読み込む前は名前を空で出さず、ログイン名で埋めておく（がたつかせない）。
     ══════════════════════════════════════════════════════════════════ */
  var ME = { state: "idle", name: "", sub: "", avatar: "", handle: "",
    grade: "", followers: 0, following: 0, presets: 0 };
  function meLoad(force) {
    if (!force && (ME.state === "loading" || ME.state === "ready")) return;
    var tok = acctToken();
    if (!tok) { ME.state = "anon"; return; }
    ME.state = "loading";
    fetch(acctApi() + "/api/profile/me", { headers: { Authorization: "Bearer " + tok } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var pr = d && d.profile;
        if (!pr) { ME.state = "error"; mePaint(); return; }
        ME.name = String(pr.displayName || pr.nickname || "").trim();
        ME.handle = String(pr.handle || "").trim();
        ME.avatar = String(pr.avatarUrl || "").trim();
        ME.grade = String(pr.gradePrefix || "").trim();
        ME.followers = Math.max(0, Number(pr.followers) || 0);
        ME.following = Math.max(0, Number(pr.following) || 0);
        ME.presets = Math.max(0, Number(pr.publicPresetCount) || 0);
        ME.sub = "VocabuQuiz アカウント";
        ME.state = "ready";
        mePaint();
      })
      .catch(function () { ME.state = "error"; mePaint(); });
  }
  /* 読み込めたら、いま出ている行だけ書き換える。
     画面ぜんぶを描き直す関数がこの中に無いのと、
     描き直すと開いている束や入力中の値が飛ぶため。 */
  function mePaint() {
    if (!root) return;
    var rows = root.querySelectorAll(".meRow");
    if (!rows.length) return;
    Array.prototype.forEach.call(rows, function (row) {
      var n = row.querySelector(".meRow__n");
      var sb = row.querySelector(".meRow__s");
      var av = row.querySelector(".meRow__av");
      if (n) n.textContent = ME.state === "anon" ? "ログインしていません"
        : (ME.name || (ME.state === "error" ? "名前を読み取れませんでした" : "読み込み中…"));
      if (sb) sb.textContent = ME.state === "anon" ? "押すとログインできます"
        : (ME.sub || "VocabuQuiz アカウント");
      if (av && ME.state === "ready") {
        if (ME.avatar) {
          av.className = "meRow__av";
          av.textContent = "";
          av.style.backgroundImage = "url(" + ME.avatar + ")";
        } else {
          av.className = "meRow__av is-txt";
          av.style.backgroundImage = "";
          av.textContent = meInitial(ME.name);
        }
      }
    });
  }
  function meInitial(name) {
    var t = String(name || "").trim();
    if (!t) return "?";
    /* 「H2 たろう」のように学年が前に付くので、そこは飛ばして頭文字を取る。 */
    var m = /^[JH]\d\s+(.+)$/.exec(t);
    if (m) t = m[1];
    return t.slice(0, 1).toUpperCase();
  }
  function meRow() {
    meLoad();
    if (ME.state === "anon") {
      return '<button class="meRow" data-me="login" type="button">'
        + '<span class="meRow__av is-none">' + '<span class="ms">person</span></span>'
        + '<span class="meRow__b"><span class="meRow__n">ログインしていません</span>'
        + '<span class="meRow__s">押すとログインできます</span></span></button>';
    }
    var name = ME.name || "読み込み中…";
    var sub = ME.sub || "VocabuQuiz アカウント";
    var av = ME.avatar
      ? '<span class="meRow__av" style="background-image:url(' + esc(ME.avatar) + ')"></span>'
      : '<span class="meRow__av is-txt">' + esc(meInitial(ME.name)) + "</span>";
    return '<button class="meRow" data-me="open" type="button" aria-label="プロフィールを開く">'
      + av
      + '<span class="meRow__b"><span class="meRow__n">' + esc(name) + "</span>"
      + '<span class="meRow__s">' + esc(sub) + "</span></span>"
      + '<svg class="meRow__c" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>'
      + "</button>";
  }

  /* 束の名前。PC の左の列にも、モバイルの一覧にも同じものを出す。 */
  var GROUP_LABEL = { 1: "学ぶ", 2: "見た目と音", 3: "アカウントとデータ", 4: "その他" };

  /* ── モバイル一覧（iOS設定風・グループ分け） ── */
  function renderMList() {
    var groups = {}, order = [];
    SECTIONS().forEach(function (sec) {
      var g = sec.group || 1;
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(sec);
    });
    return meRow() + order.map(function (g) {
      return (GROUP_LABEL[g] ? '<div class="mgttl">' + esc(GROUP_LABEL[g]) + "</div>" : "")
        + '<div class="mgrp">' + groups[g].map(function (sec) {
        return '<button class="mrow" data-nav="' + sec.id + '">' +
          '<span class="mico"><span class="ms" aria-hidden="true">' + sec.ms + '</span></span>' +
          '<span class="mrow__c"><span class="mrow__l">' + sec.label + '</span>' +
            (sec.sub ? '<span class="mrow__s">' + sec.sub + '</span>' : '') + '</span>' +
          '<svg class="chv" viewBox="0 0 24 24" ' + P + '>' + ICON.chev + '</svg></button>';
      }).join("") + '</div>';
    }).join("");
  }
  function isMobile() { return (window.innerWidth || document.documentElement.clientWidth || 0) < 880; }
  /* 可変軸つき Material Symbols Rounded（mobilebar.js と同じ id で冪等） */
  function ensureFont() {
    if (document.getElementById("vqMsRoundedVar")) return;
    var lk = document.createElement("link");
    lk.id = "vqMsRoundedVar"; lk.rel = "stylesheet";
    /* ★ Google から 取るのを やめた（2026-08-19）。届かない端末では
       アイコン名が 文字のまま 出る（44px の枠から あふれて 重なる）。 */
    lk.href = (function(){ /* ★ アイコンの CSS は <head> に すでに 在る。
       名前には 指紋が 入っている（中身が 変わると 名前も 変わる）ので、
       ここへ 書き写すと いつか 404 になる。**在るものを 指す。** */
      var e = document.querySelector('link[href*="/css/material-symbols."]');
      return e ? e.getAttribute("href") : "/css/material-symbols.css";
    })();
    document.head.appendChild(lk);
  }
  function setDetail(on) { var m = root.querySelector(".modal"); if (m) m.classList.toggle("is-detail", !!on); }

  function renderNav() {
    var lastG = null;
    return meRow() + SECTIONS().map(function (sec) {
      var g = sec.group || 1;
      var head = "";
      if (g !== lastG) { lastG = g; head = GROUP_LABEL[g] ? '<div class="navttl">' + esc(GROUP_LABEL[g]) + "</div>" : ""; }
      return head + navBtn(sec);
    }).join("");
  }
  /* アイコンは **元からの SVG（svg(sec.icon)）を使う**。
     Material Symbols の文字（"quiz" など）に変えたところ、
     この影の DOM には字形が届かず、名前がそのまま文字として出て
     ラベルと重なった（実機の画面で確認）。 */
  function navBtn(sec) {
    return '<button class="nav' + (sec.id === cur ? " on" : "") + '" data-nav="' + sec.id + '">'
      + svg(sec.icon) + "<span>" + sec.label + "</span></button>";
  }
  function renderMain() {
    var list = SECTIONS();
    var sec = list.filter(function (x) { return x.id === cur; })[0] || list[0];
    if (!sec) return;
    cur = sec.id;
    root.querySelector(".head__t").textContent = sec.label;
    root.querySelector(".body").innerHTML = sectionHTML(sec);
  }
  /* 変えた直後に、同じ束の中の「状態」行が古いまま残らないようにする。
     Shadow DOM へ CSS を配り直すのも忘れずに（層は後から生える）。 */
  /* 数の欄と、そのそばの「制限なし」などの言い換えを合わせる。 */
  function paintNumber(id, n) {
    var box = root.querySelector('.num__i[data-num="' + id + '"]');
    if (!box) return;
    box.value = String(n);
    var sp = S().spec(id);
    var note = box.parentNode.querySelector(".num__n");
    if (note) note.textContent = (sp && sp.zeroLabel && Number(n) === 0) ? sp.zeroLabel : "";
  }
  function afterSet(id) {
    try { S().paintRoots(); } catch (e) {}
    var sp = S().spec(id);
    if (!sp) return;
    var hasInfo = S().inGroup(sp.group).some(function (r) { return r.type === "info"; });
    if (hasInfo || id === "data.sync") setTimeout(renderMain, 60);
  }
  function selectNav(id) {
    cur = id;
    root.querySelectorAll(".nav").forEach(function (n) { n.classList.toggle("on", n.getAttribute("data-nav") === id); });
    renderMain();
    root.querySelector(".body").scrollTop = 0;
    if (isMobile()) setDetail(true);   /* モバイルは一覧 → 詳細へプッシュ */
  }

  function build() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", build); return; }
    if ($("vqSettings")) return;
    ensureFont();
    var hs = document.createElement("style"); hs.id = "vqSettingsHostStyle";
    /* トップバー(z900)より前面／下部バー(z9990)より背面。
       ＝モバイルでも下部バーは設定中ずっと表示されたままになる（Rinty 指定）。 */
    hs.textContent = "#vqSettings{position:fixed;inset:0;z-index:9980;display:none;}" +
      "body.vqset-open #vqSettings{display:block;}" +
      "html.vqset-suppress #settingsOverlay{display:none !important;}" +
      /* 従来の設定への導線を消す。設定の入口はこの画面ひとつ。
         ・設定タブに並んでいた行（設定を開く / Admin / Report / Help / Terms …）
         ・道具として開いたときの、従来の設定の一覧と「戻る」
         ボタンそのものは残す（この層が中の値を読むために押しているため）。 */
      "#appSettingsPage .app-settings-list{display:none !important;}" +
      "html[data-vq-legacy-tool] #settingsOverlay #settingsPageRoot{display:none !important;}" +
      "html[data-vq-legacy-tool] #settingsOverlay .settings-back-btn{visibility:hidden !important;}";
    document.head.appendChild(hs);

    host = document.createElement("div"); host.id = "vqSettings";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var st = document.createElement("style"); st.textContent = CSS; root.appendChild(st);
    var bd = document.createElement("div"); bd.className = "backdrop";
    bd.innerHTML = '<div class="modal">' +
      '<div class="side"><div class="side__ttl">設定</div>' + renderNav() + '</div>' +
      /* モバイル専用: 一覧（ルート）画面 */
      '<div class="mlist">' +
        '<div class="mhead"><span class="sp"></span><span class="mhead__t">設定</span>' +
          '<button class="xbtn" data-x aria-label="閉じる">' + svg("x") + '</button></div>' +
        '<div class="mscroll">' + renderMList() + '</div>' +
      '</div>' +
      /* 詳細（PCでは常時これが右ペイン） */
      '<div class="main"><div class="head">' +
        '<button class="back" data-back aria-label="設定に戻る">' + svg("chev") + '</button>' +
        '<div class="head__t">外観</div>' +
        '<button class="xbtn" data-x aria-label="閉じる">' + svg("x") + '</button></div>' +
      '<div class="body"></div></div></div>';
    root.appendChild(bd);
    document.body.appendChild(host);

    /* クリック */
    root.addEventListener("click", function (e) {
      var t = e.target;
      /* 背景クリックで閉じる */
      if (t.classList && t.classList.contains("backdrop")) { closeIt(); return; }
      var el = t;
      while (el && el !== root && !(el.dataset && (el.dataset.nav || el.dataset.x != null || el.dataset.back != null || el.dataset.action || el.dataset.doc || el.dataset.tool || el.dataset.pin || el.dataset.push || el.dataset.set || el.dataset.step || el.dataset.reset || el.dataset.vq2flag || el.dataset.me || el.dataset.emailsetup || el.dataset.unlink || el.dataset.run || el.dataset.openLegacy != null || el.dataset.dev || el.dataset.drv || (el.classList && el.classList.contains("sw"))))) el = el.parentNode;
      if (!el || el === root) return;
      var d = el.dataset;
      /* この端末の 容量まわり（2026-08-19） */
      if (d.dev === "move") { devMove(); return; }
      /* Google Drive（2026-08-27） */
      if (d.drv === "connect") { drvConnect(); return; }
      if (d.drv === "unlink") { drvUnlink(); return; }
      if (d.drv === "presets") { drvPushPresets(); return; }
      if (d.x != null) { closeIt(); }
      /* ★ **押した指のまま**動かす（マイクのように、触った扱いが要るもの）。
         ここで閉じたり待ったりすると、その扱いが切れて必ず失敗する。 */
      else if (d.run) {
        var sp0 = null;
        try { sp0 = S().spec ? S().spec(d.run) : null; } catch (e2) {}
        if (sp0 && typeof sp0.run === "function") { try { sp0.run(); } catch (e2) {} }
        return;
      }
      else if (d.back != null) { setDetail(false); }
      else if (d.nav) { selectNav(d.nav); }
      else if (d.vq2flag) {
        /* Learning Workspace のフラグは VQ2FLAGS 側が持ち主。
           親を切ると子も落ちるので、切替後は section ごと描き直す。 */
        if (el.disabled) return;
        var wOn = !el.classList.contains("on");
        try { window.VQ2FLAGS.set(d.vq2flag, wOn); } catch (e2) {}
        renderMain();
      }
      else if (d.set && el.classList.contains("sw")) {
        if (el.disabled) return;
        var on = !el.classList.contains("on");
        if (!S().set(d.set, on)) return;
        el.classList.toggle("on", on); el.setAttribute("aria-checked", on);
        afterSet(d.set);
      }
      else if (d.set && d.val != null) {
        if (!S().set(d.set, d.val)) return;
        var seg = el.parentNode;
        seg.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b === el); });
        afterSet(d.set);
      }
      else if (d.step) {
        var spN = S().spec(d.step);
        var cur = Number(S().get(d.step)) + (Number(d.dir) * (spN.step || 1));
        if (cur < spN.min) cur = spN.min;
        if (cur > spN.max) cur = spN.max;
        if (S().set(d.step, cur)) { paintNumber(d.step, cur); afterSet(d.step); }
      }
      else if (d.reset != null) {
        S().resetGroup(d.reset);
        renderMain();
      }
      else if (d.me) {
        /* プロフィール画面はこれから作る。何も起きないボタンにはしない。 */
        if (d.me === "login") { closeIt(); setTimeout(function () { bClick("settingsAccountOpenLoginBtn"); }, 90); }
        else selectNav("account");
      }
      else if (d.emailsetup) {
        closeIt();
        setTimeout(function () { if (window.__vqEmailSetup) window.__vqEmailSetup(); }, 90);
      }
      else if (d.unlink) {
        var pv = d.unlink;
        var nm = el.closest ? (el.closest(".row") || null) : null;
        var lbl = nm ? (nm.querySelector(".row__label") || {}).textContent || pv : pv;
        if (window.confirm(lbl + " との連携を外します。よろしいですか？")) acctUnlink(pv);
      }
      else if (d.pin) { closeIt(); setTimeout(function () { if (window.__vqPin) window.__vqPin.change(); }, 90); }
      else if (d.push) { closeIt(); setTimeout(function () { if (window.__vqPushSetup) window.__vqPushSetup(); }, 120); }
      else if (d.tool) { openTool(d.tool); }
      else if (d.doc) { closeIt(); setTimeout(function () { if (window.__vqDocs) window.__vqDocs.open(d.doc); }, 90); }
      else if (d.action) { if (d.close != null) { closeIt(); setTimeout(function () { bClick(d.action); }, 90); } else { bClick(d.action); } }
    });
    /* select 変更 */
    root.addEventListener("change", function (e) {
      var t2 = e.target;
      if (t2 && t2.dataset && t2.dataset.set) { S().set(t2.dataset.set, t2.value); afterSet(t2.dataset.set); return; }
      if (t2 && t2.dataset && t2.dataset.num) {
        var idN = t2.dataset.num, spN = S().spec(idN);
        var n = Math.round(Number(t2.value));
        if (!isFinite(n)) n = Number(S().get(idN));
        if (n < spN.min) n = spN.min;
        if (n > spN.max) n = spN.max;
        S().set(idN, n);
        paintNumber(idN, n);      /* 範囲の外を入れられたら、直した値をその場で見せる */
        afterSet(idN);
      }
    });
    /* Esc */
    document.addEventListener("keydown", function (e) { if (open && e.key === "Escape") closeIt(); });

    /* 設定タブへの遷移を監視して自動起動（導線切替：どの経路でも新モーダルに） */
    try {
      /* data-app-tab は **同じ値を書き直しただけでも** この監視が動く。
         本体は設定を 1 つ変えるたびに再描画して同じ値を書き直すので、
         「値が変わったときだけ」に絞らないと、設定をいじるたび画面が閉じてホームへ戻る。 */
      var lastTab = document.body.getAttribute("data-app-tab");
      new MutationObserver(function () {
        var tab = document.body.getAttribute("data-app-tab");
        if (tab === lastTab) return;          /* 書き直しただけ。何もしない */
        lastTab = tab;
        /* 本体が「いま自分はこのタブのつもり」と書き戻すことがある。
           開いたときと同じタブに戻っただけなら、利用者は何も操作していない。 */
        if (open && tab === tabAtOpen) return;
        if (tab === "settings") { if (!open) openIt(true); }
        /* 設定表示中に **本当に** 他の画面へ移ったら閉じる。
           下部バー(z9990)は設定モーダル(z9980)より前面で常に押せるため、
           そこからホーム等へ移動しても設定が残ってしまうのを防ぐ。 */
        else if (open) { closeIt(); }
      }).observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
    } catch (e) {}
  }

  /* 道具（拡張アシスタント / OEA / Admin）だけを開く。
     従来の設定の一覧（settingsPageRoot）は出さない。設定の入口はこの画面ひとつに保つ。 */
  function openTool(nav) {
    closeIt();
    document.documentElement.classList.remove("vqset-suppress");
    document.documentElement.setAttribute("data-vq-legacy-tool", "1");
    setTimeout(function () {
      var tr = document.querySelector('#appSettingsPage [data-settings-shortcut="openSettings"]');
      if (tr) tr.click();
      setTimeout(function () {
        var b = document.querySelector('#settingsOverlay [data-settings-nav="' + nav + '"]');
        if (b) b.click();
      }, 120);
    }, 80);
  }

  var cameFromTab = false, tabAtOpen = null;
  /* ══ 検索から「その設定そのもの」へ飛ぶ（2026-08-15）═══════════════
     設定は 100 行以上ある。名前を知っていても、どの分類にあるかは
     覚えていないのがふつうなので、検索から直接その行まで連れていく。
     引数を渡さなければ、これまでどおり先頭（画面と表示）から開く。 */
  function openIt(fromTab, focusId) {
    cameFromTab = !!fromTab;
    tabAtOpen = document.body.getAttribute("data-app-tab");
    forceSync();                 // 本物コントロール＆アカウント表示を最新化（非表示のまま）
    cur = "display";
    if (focusId) {
      var sp = null;
      try {
        SPECS_OF().some(function (x) { if (x.id === focusId) { sp = x; return true; } return false; });
      } catch (e) {}
      if (sp && sp.group) cur = sp.group;
    }
    root.querySelectorAll(".nav").forEach(function (n) { n.classList.toggle("on", n.getAttribute("data-nav") === cur); });
    renderMain();
    /* モバイルは iOS 設定と同じく「一覧」から開始。PCは常に右ペイン表示。
       ★ ただし検索から「その設定そのもの」を選んで来たときは一覧で止めない
         （2026-08-18・実測）。モバイル幅では .main が display:none なので、
         行まで送っても画面には出ず、色を付けても誰にも見えていなかった。
         ＝ iPhone だけ「飛べない」の正体。名指しで呼ばれた以上、開いて見せる。 */
    setDetail(!isMobile() || !!focusId);
    document.body.classList.add("vqset-open");
    open = true;
    root.querySelector(".body").scrollTop = 0;
    var ms = root.querySelector(".mscroll"); if (ms) ms.scrollTop = 0;
    /* はじめて設定を開いた人には、何が変わったかを 1 度だけ見せる。 */
    try { if (window.__vqTour) window.__vqTour.show("settings"); } catch (e) {}
    if (focusId) focusRow(focusId);
  }
  function SPECS_OF() {
    try { return (window.__vqSet && window.__vqSet.specs) ? window.__vqSet.specs() : []; }
    catch (e) { return []; }
  }
  /* 目当ての行まで送って、しばらく色を付ける（どれのことか分かるように）。
     ★ 見えていない行に色を付けない。付けても 2.6 秒で消えるだけで、
       利用者から見れば「飛べなかった」のと同じになる。
       場所を持っているか（矩形があるか）で見て、無ければ詳細を出して数回待つ。 */
  function focusRow(id) {
    var sel = '[data-set="' + String(id).replace(/["\\]/g, "\\$&") + '"],'
      + '[data-num="' + String(id).replace(/["\\]/g, "\\$&") + '"]';
    var 試す = function (残り) {
      var hit = root.querySelector(sel);
      var row = hit && hit.closest ? hit.closest(".row") : null;
      if (!row || !row.getClientRects().length) {
        if (残り <= 0) return;
        setDetail(true);
        setTimeout(function () { 試す(残り - 1); }, 120);
        return;
      }
      try { row.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { row.scrollIntoView(); }
      row.classList.add("is-found");
      setTimeout(function () { row.classList.remove("is-found"); }, 2600);
    };
    setTimeout(function () { 試す(4); }, 160);
  }
  function closeIt() {
    document.body.classList.remove("vqset-open");
    /* forceSync が本物 openSettings を走らせて .hidden を外しているため、suppress 解除前に確実に閉じる */
    var ov = $("settingsOverlay"); if (ov) ov.classList.add("hidden");
    document.documentElement.removeAttribute("data-vq-legacy-tool");
    document.documentElement.classList.remove("vqset-suppress");
    open = false;
    /* 設定タブ経由で開いていたら、素の設定タブを見せないようホームへ戻す */
    if (cameFromTab && document.body.getAttribute("data-app-tab") === "settings") {
      cameFromTab = false;
      var h = document.querySelector('#appTabBar [data-app-tab="home"]'); if (h) h.click();
    }
  }
  /* focusId を渡すと、その設定の分類を開いて、その行まで連れていく。 */
  window.__vqOpenSettings = function (focusId) { if (!host) return; openIt(false, focusId || ""); };
  /* 検索がこの一覧を読む。ここを持ち主にしておけば、設定を足したときに
     検索へ入れ忘れることが無い（入れ忘れが今回の訴えの元だった）。 */
  window.__vqSettingsIndex = function () {
    var gs = {};
    try {
      ((window.__vqSet && window.__vqSet.groups) ? window.__vqSet.groups() : []).forEach(function (g) {
        gs[g.id || g.key || g] = g.label || g.name || "";
      });
    } catch (e) {}
    return SPECS_OF().map(function (sp) {
      return { id: sp.id, label: sp.label || "", desc: sp.desc || "",
               group: sp.group || "", groupLabel: gs[sp.group] || "" };
    });
  };
  window.__vqCloseSettings = function () { if (open) closeIt(); };
  window.__vqSettingsIsOpen = function () { return open; };

  build();
})();

