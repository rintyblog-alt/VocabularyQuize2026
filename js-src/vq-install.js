/* ══════════════════════════════════════════════════════════════════════════
   vq-install — 「アプリとして 入れる」の 案内（2026-09-01・訴え）

   訴え:「ログイン済み 全ユーザー、これから 新規登録される ユーザー全員に、
         開く ときに チェックボックスを 入れない 限り、Chrome の UI アニメーションを
         再現して、PC 版なら Chrome の 画面で『アプリとして ダウンロードする』を
         押して ダウンロードできる ことを 知らせる ための チュートリアル画面を。
         スマホの 場合は、Safari の ナビゲーションバーから 共有ボタン 押して、
         ホーム画面に 追加する で 追加する の ような アニメーション。
         もう 忠実に Chrome, Safari の レイアウトや UI を 再現して ほしい。
         マウスが あるなら、マウスカーソルで 動かして いる ような アニメーションも。
         開いたら いちばん 最初に 表示されるように。」

   決めた こと（守る）:
     ★ **もう 入って いる 人には 出さない。** standalone で 開いて いるなら 用は 無い。
     ★ **本当に 入れられる ときは 本物の ボタンを 出す**（beforeinstallprompt）。
       絵だけ 見せて「あとは 自分で 探して」は 不親切。
     ★ **チェックを 入れたら 二度と 出さない。** 覚えるのは 端末ごと。
     ★ Safari は **iOS 26 で 共有の 場所が 変わった**（下の 共有ボタン → ⋯ の 中）。
       どちらの 端末でも 迷わない ように **両方 出す**。
       出典: Apple 公式の 手順（MacRumors / Apple サポート）で 確かめた。
     ★ 絵は **こちらで 描く**（外の 画像を 借りない。読み込みも 増やさない）。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqInstallInstalled) return;
  window.__vqInstallInstalled = true;

  var doc = document;
  var KEY = "vq.install.hide.v1";
  var 見たKEY = "vq.install.seen.v1";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function 入っているか() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.navigator && window.navigator.standalone === true) return true;   /* iOS */
    } catch (e) {}
    return false;
  }
  function 出さない設定か() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function iOSか() {
    try {
      var u = navigator.userAgent || "";
      if (/iPad|iPhone|iPod/.test(u)) return true;
      /* iPadOS は Mac を 名乗る。指で 触れるかで 見分ける。 */
      return /Macintosh/.test(u) && navigator.maxTouchPoints > 1;
    } catch (e) { return false; }
  }
  function 指の端末か() {
    try { return iOSか() || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches); }
    catch (e) { return false; }
  }

  /* ── 本物の 入れる 口（Chrome / Edge）───────────────────────────
     ★ これが 取れる ときは **絵では なく 本物の ボタン**を 出す。 */
  var 本物 = null;
  try {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      本物 = e;
      if (st.開) 描く();
    });
    window.addEventListener("appinstalled", function () {
      本物 = null;
      try { localStorage.setItem(KEY, "1"); } catch (x) {}
      閉じる();
    });
  } catch (e) {}

  /* ══ 見た目 ════════════════════════════════════════════════════════ */
  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483300;display:none;",
      "font-family:var(--vq-app-font,Inter,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#2B2836)}",
    ":host([data-open='1']){display:block}",
    "button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}",
    ".bd{position:absolute;inset:0;background:rgba(28,25,48,.62);",
      "-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}",
    ".w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);",
      "width:min(760px,calc(100vw - 24px));max-height:calc(100dvh - 28px);overflow:auto;",
      "background:var(--vq-surface,#fff);border-radius:26px;",
      "border:1px solid var(--vq-border,#E7E4EF);box-shadow:0 30px 90px rgba(16,14,26,.42);",
      "padding:26px 26px calc(20px + var(--vq-sab,0px));",
      "animation:inUp .3s cubic-bezier(.22,1,.36,1) both}",
    "@keyframes inUp{from{opacity:0;transform:translate(-50%,-50%) translateY(16px) scale(.985)}",
      "to{opacity:1;transform:translate(-50%,-50%)}}",
    "@keyframes inSheet{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}",
    /* 見出し */
    ".hd{text-align:center;margin-bottom:18px}",
    ".h1{font-size:23px;font-weight:790;line-height:1.4}",
    ".h2{font-size:13.5px;color:var(--vq-text-secondary,#5A5568);line-height:1.85;margin-top:8px}",
    ".tabs{display:inline-flex;gap:4px;margin-top:14px;padding:4px;border-radius:999px;",
      "background:var(--vq-bg-subtle,#F4F2FB)}",
    ".tab{height:34px;padding:0 16px;border-radius:999px;font-size:13px;font-weight:650;",
      "color:var(--vq-text-secondary,#5A5568)}",
    ".tab.on{background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);",
      "box-shadow:0 1px 3px rgba(30,20,60,.14)}",
    /* 舞台 */
    ".stage{position:relative;border-radius:18px;overflow:hidden;",
      "background:var(--vq-bg-subtle,#F4F2FB);border:1px solid var(--vq-border,#E7E4EF);",
      "aspect-ratio:16/9;display:grid;place-items:center;padding:14px}",
    ".stage.is-ph{aspect-ratio:auto;min-height:400px}",
    /* ── Chrome の 窓 ───────────────────────────────────── */
    ".cr{width:100%;max-width:660px;border-radius:11px;overflow:hidden;background:#DEE1E6;","color:#202124;",
      "box-shadow:0 8px 30px rgba(20,16,40,.22);position:relative}",
    ".cr-tabs{display:flex;align-items:flex-end;gap:0;height:36px;padding:6px 8px 0}",
    ".cr-dots{display:flex;gap:6px;align-items:center;padding:0 8px 6px 2px}",
    ".cr-dot{width:11px;height:11px;border-radius:50%}",
    ".cr-tab{display:flex;align-items:center;gap:7px;height:30px;padding:0 12px;",
      "border-radius:9px 9px 0 0;background:#fff;font-size:11.5px;color:#3C4043;max-width:190px}",
    ".cr-tab i{width:13px;height:13px;border-radius:3px;background:#756DB3;flex:0 0 auto}",
    ".cr-tab span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".cr-bar{display:flex;align-items:center;gap:8px;height:44px;padding:0 10px;background:#fff}",
    ".cr-nav{display:flex;gap:2px;color:#5F6368}",
    ".cr-ic{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#5F6368;",
      "position:relative;flex:0 0 auto}",
    ".cr-ic svg{width:15px;height:15px}",
    ".cr-url{flex:1 1 auto;display:flex;align-items:center;gap:8px;height:28px;padding:0 12px;",
      "border-radius:999px;background:#F1F3F4;color:#202124;font-size:12px;min-width:0}",
    ".cr-url span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".cr-right{display:flex;align-items:center;gap:2px}",
    ".cr-body{height:150px;background:#fff;border-top:1px solid #EAECEF}",
    /* 目印の 赤い 丸 */
    ".ring{position:absolute;border:2.5px solid #E5484D;border-radius:50%;pointer-events:none;",
      "opacity:0;transition:opacity .25s ease}",
    ".ring.on{opacity:1;animation:ringPulse 1.4s ease-in-out infinite}",
    "@keyframes ringPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.09)}}",
    /* マウスの 矢印 */
    ".cur.finger{width:30px;height:30px}",".cur.finger svg{width:30px;height:30px}",".cur.finger.tap::after{left:-4px;top:-4px;width:38px;height:38px}",".cur{position:absolute;width:20px;height:26px;pointer-events:none;z-index:9;",
      "transition:left .85s cubic-bezier(.34,.9,.3,1),top .85s cubic-bezier(.34,.9,.3,1);",
      "filter:drop-shadow(0 2px 3px rgba(0,0,0,.34))}",
    ".cur.tap::after{content:'';position:absolute;left:-9px;top:-9px;width:34px;height:34px;",
      "border-radius:50%;border:2px solid rgba(117,109,179,.85);animation:tapRing .5s ease-out}",
    "@keyframes tapRing{from{transform:scale(.3);opacity:1}to{transform:scale(1.25);opacity:0}}",
    /* Chrome の 入れる 窓 */
    ".cr-dlg{position:absolute;left:50%;top:86px;transform:translateX(-50%);width:min(330px,86%);",
      "background:#2B2B2B;color:#E8EAED;border-radius:9px;box-shadow:0 12px 40px rgba(0,0,0,.5);",
      "padding:16px 18px 12px;opacity:0;transform:translateX(-50%) translateY(-8px);",
      "transition:opacity .28s ease,transform .28s ease;z-index:8;pointer-events:none}",
    ".cr-dlg.on{opacity:1;transform:translateX(-50%) translateY(0)}",
    ".cr-dlg h4{font-size:13.5px;font-weight:600;margin-bottom:13px}",
    ".cr-dlg-row{display:flex;align-items:center;gap:11px;margin-bottom:15px}",
    ".cr-dlg-ic{width:30px;height:30px;border-radius:7px;background:#756DB3;color:#fff;",
      "display:grid;place-items:center;font-size:12px;font-weight:800;flex:0 0 auto}",
    ".cr-dlg-t{display:block;font-size:12.5px;line-height:1.5}",
    ".cr-dlg-u{display:block;font-size:11px;color:#9AA0A6}",
    ".cr-dlg-b{display:flex;justify-content:flex-end;gap:8px}",
    ".cr-btn{height:30px;padding:0 15px;border-radius:999px;font-size:12px;font-weight:600;color:#8AB4F8}",
    ".cr-btn.pri{background:#8AB4F8;color:#202124}",
    /* ── iPhone / Safari ─────────────────────────────────── */
    ".ph{width:min(268px,72%);border-radius:34px;background:#000;padding:8px;position:relative;",
      "box-shadow:0 14px 44px rgba(20,16,40,.34)}",
    ".ph-scr{border-radius:27px;overflow:hidden;background:#fff;position:relative;height:452px;color:#111;",
      "display:flex;flex-direction:column}",
    ".ph-note{position:absolute;left:50%;top:6px;transform:translateX(-50%);width:34%;max-width:74px;height:20px;",
      "border-radius:999px;background:#000;z-index:6}",
    ".ph-st{height:30px;display:flex;align-items:center;justify-content:space-between;",".ph-sig{display:inline-flex;align-items:center;gap:4px}",".ph-sig svg{height:11px;width:auto;display:block}",
      "padding:6px 16px 0;font-size:10.5px;font-weight:650;color:#111;flex:0 0 auto}",
    ".ph-body{flex:1 1 auto;overflow:hidden;background:#FCFBFE;padding:12px;position:relative}",
    ".ph-hero{height:52px;border-radius:12px;background:linear-gradient(135deg,#756DB3,#5F579E)}",
    ".ph-ln{height:9px;border-radius:5px;background:#EDEAF6;margin-top:9px}",
    ".ph-ln.s{width:60%}",
    ".ph-card{height:56px;border-radius:12px;background:#fff;border:1px solid #E7E4EF;margin-top:12px}",
    /* 下の 帯（iOS 17〜18 の 形） */
    ".ph-bar{flex:0 0 auto;background:#F7F7F8;border-top:.5px solid #D8D8DC;padding:7px 10px 9px}",
    ".ph-adr{display:flex;align-items:center;gap:7px;height:32px;padding:0 11px;border-radius:11px;",
      "background:#EDEDF0;color:#111;font-size:11.5px;margin-bottom:6px}",
    ".ph-adr .aA{font-size:10.5px;color:#5B5B60}",
    ".ph-adr span{flex:1 1 auto;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".ph-tools{display:flex;align-items:center;justify-content:space-between;padding:0 8px}",
    ".ph-t{width:34px;height:30px;display:grid;place-items:center;color:#0A84FF;position:relative}",
    ".ph-t.dim{color:#B9B9BE}",
    ".ph-t svg{width:19px;height:19px}",
    /* 共有シート */
    ".sh{position:absolute;left:0;right:0;bottom:0;top:38px;background:#F2F2F7;",
      "border-radius:13px 13px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.2);z-index:7;",
      "transform:translateY(100%);transition:transform .42s cubic-bezier(.22,1,.36,1);",
      "display:flex;flex-direction:column;overflow:hidden}",
    ".sh.on{transform:none}",
    ".sh-grab{width:36px;height:5px;border-radius:3px;background:#C7C7CC;margin:7px auto 0;flex:0 0 auto}",
    ".sh-hd{display:flex;align-items:center;gap:9px;padding:14px 14px 12px;flex:0 0 auto}",
    ".sh-ic{width:34px;height:34px;border-radius:8px;background:#756DB3;color:#fff;",
      "display:grid;place-items:center;font-size:12px;font-weight:800;flex:0 0 auto}",
    ".sh-hd b{font-size:12.5px;display:block}",
    ".sh-hd i{font-size:10.5px;color:#8E8E93;font-style:normal}",
    ".sh-list{flex:0 0 auto;overflow:hidden;margin:0 12px 12px;border-radius:11px;background:#fff}",".sh-apps{display:flex;gap:14px;padding:2px 14px 14px;flex:0 0 auto}",".sh-app{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:8.5px;color:#3C3C43;width:46px}",".sh-app i{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:#fff;font-style:normal}",".sh-app i svg{width:20px;height:20px}",
    ".sh-r{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;",
      "font-size:12.5px;border-bottom:.5px solid #EAEAEC;color:#111}",
    ".sh-r:last-child{border-bottom:0}",
    ".sh-r svg{width:16px;height:16px;color:#111;flex:0 0 auto}",
    ".sh-r.hit{background:#E6F0FF}",
    /* ホーム画面に 追加 の 板 */
    ".add{position:absolute;inset:0;background:#F2F2F7;z-index:8;opacity:0;pointer-events:none;",
      "transition:opacity .3s ease;display:flex;flex-direction:column}",
    ".add.on{opacity:1}",
    ".add-hd{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;",
      "font-size:12.5px;color:#0A84FF;flex:0 0 auto}",
    ".add-hd b{font-size:13px;color:#111;font-weight:650}",
    ".add-box{margin:0 12px;border-radius:11px;background:#fff;display:flex;align-items:center;gap:11px;padding:12px 13px}",
    ".add-ic{width:44px;height:44px;border-radius:10px;background:#756DB3;color:#fff;",
      "display:grid;place-items:center;font-size:14px;font-weight:800;flex:0 0 auto}",
    ".add-nm{flex:1 1 auto;min-width:0}",
    ".add-nm b{display:block;font-size:12.5px}",
    ".add-nm i{display:block;font-size:10.5px;color:#8E8E93;font-style:normal;",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".add-note{margin:12px 14px 0;font-size:10.5px;color:#8E8E93;line-height:1.7}",
    /* ホーム画面 */
    ".home{position:absolute;inset:0;z-index:9;opacity:0;pointer-events:none;transition:opacity .35s ease;",
      "background:linear-gradient(160deg,#5B5290,#2E2A50);padding:26px 20px;display:flex;flex-direction:column;gap:14px}",
    ".home.on{opacity:1}",
    ".home-g{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}",
    ".home-a{aspect-ratio:1;border-radius:13px;background:rgba(255,255,255,.16)}",
    ".home-a.me{background:#756DB3;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800;",
      "animation:pop .5s cubic-bezier(.34,1.56,.64,1) both}",
    "@keyframes pop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}",
    ".home-l{font-size:9px;color:#fff;text-align:center;margin-top:4px;opacity:.9}",
    /* 説明 */
    ".step{margin-top:14px;display:flex;align-items:flex-start;gap:11px}",
    ".step-n{width:26px;height:26px;border-radius:50%;background:var(--vq-accent,#756DB3);color:#fff;",
      "display:grid;place-items:center;font-size:13px;font-weight:750;flex:0 0 auto}",
    ".step-t{font-size:14.5px;line-height:1.8;padding-top:2px}",
    ".step-t b{font-weight:750}",
    ".hint{margin-top:9px;font-size:12px;color:var(--vq-text-tertiary,#9994A8);line-height:1.8;padding-left:37px}",
    /* 足もと */
    ".dots{display:flex;justify-content:center;gap:6px;margin-top:14px}",
    ".dot{width:7px;height:7px;border-radius:50%;background:var(--vq-border,#D7D2E4)}",
    ".dot.on{background:var(--vq-accent,#756DB3);width:18px;border-radius:999px}",
    ".ft{display:flex;align-items:center;gap:9px;margin-top:16px;flex-wrap:wrap;","position:sticky;bottom:calc(-20px - var(--vq-sab,0px));","background:var(--vq-surface,#fff);padding:10px 0 calc(6px + var(--vq-sab,0px));","box-shadow:0 -14px 18px -14px rgba(20,16,40,.28)}",
    ".chk{display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;",
      "color:var(--vq-text-secondary,#5A5568);margin-right:auto;padding:8px 0;min-height:44px}",
    ".chk input{width:17px;height:17px;accent-color:var(--vq-accent,#756DB3);cursor:pointer}",
    ".btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:44px;",
      "padding:0 18px;border-radius:12px;font-size:14px;font-weight:650;",
      "border:1px solid var(--vq-border,#D7D2E4);background:var(--vq-surface,#fff)}",
    ".btn:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".btn.pri{background:var(--vq-accent,#756DB3);color:#fff;border-color:transparent}",
    ".btn.pri:hover{background:var(--vq-accent-hover,#5F579E)}",
    ".btn[disabled]{opacity:.4;cursor:default}",
    /* スマホ */
    "@media (max-width:640px){",
      ".w{left:0;top:auto;bottom:0;transform:none;width:100vw;max-width:100vw;max-height:95dvh;",
        "border-radius:22px 22px 0 0;padding:20px 16px calc(16px + var(--vq-sab,0px));",
        "animation:inSheet .3s cubic-bezier(.22,1,.36,1) both}",
      ".h1{font-size:19px}",
      ".stage{aspect-ratio:auto;min-height:0;padding:10px}",
      ".stage.is-ph{min-height:0}",
      ".ph{width:min(212px,66%)}",
      ".ph-scr{height:340px}",
      ".h2{font-size:12.5px;line-height:1.7}",
      ".hint{font-size:11.5px;margin-top:7px}",
      ".step{margin-top:11px}",
      ".cr{max-width:100%}",
      ".btn{flex:1 1 auto}",
      ".chk{flex:1 1 100%;margin-right:0}",
      ".step-t{font-size:13.5px}",
      ".hint{padding-left:0}",
    "}",
    "@media (max-height:760px){.ph-scr{height:286px}.h1{font-size:17.5px}.stage{padding:8px}",".hd{margin-bottom:12px}.tabs{margin-top:10px}.cr-body{height:74px}.cr-dlg{top:74px}}","@media (max-height:640px){.ph-scr{height:232px}.ph{width:min(180px,58%)}",".h2{display:none}.hint{display:none}",".ph-st{font-size:8.5px;padding:5px 9px 0}.ph-note{max-width:52px;height:16px}",".ph-sig svg{height:9px}.ph-adr{font-size:10px;height:28px;padding:0 8px}}","@media (prefers-reduced-motion:reduce){.w,.cur,.sh,.add,.home,.home-a.me,.ring.on{animation:none;transition:none}}"
  ].join("");

  var P = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    back: '<path ' + P + ' d="M15 5l-7 7 7 7"/>',
    fwd: '<path ' + P + ' d="M9 5l7 7-7 7"/>',
    reload: '<path ' + P + ' d="M4 12a8 8 0 1 1 2.5 5.8"/><path ' + P + ' d="M4 19v-5h5"/>',
    lock: '<rect ' + P + ' x="5" y="10" width="14" height="10" rx="2"/><path ' + P + ' d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    /* Chrome の 「インストール」＝ 画面＋下向き 矢印 */
    install: '<rect ' + P + ' x="3" y="4" width="18" height="13" rx="2"/><path ' + P + ' d="M8 21h8"/>'
      + '<path ' + P + ' d="M12 7v6M9.5 10.5L12 13l2.5-2.5"/>',
    ext: '<path ' + P + ' d="M10 4h4v3a2 2 0 1 0 4 0h2v4h-3a2 2 0 1 0 0 4h3v4H4V4h6z"/>',
    star: '<path ' + P + ' d="m12 4 2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 15.8 7.3 18.3l1.1-5.2L4.5 9.5l5.2-.6z"/>',
    kebab: '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
    /* Safari の 共有（四角＋上向き 矢印） */
    share: '<path ' + P + ' d="M12 3v12"/><path ' + P + ' d="M8.5 6.5 12 3l3.5 3.5"/>'
      + '<path ' + P + ' d="M7 11H5v9h14v-9h-2"/>',
    book: '<path ' + P + ' d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path ' + P + ' d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19"/>',
    tabs: '<rect ' + P + ' x="3.5" y="6.5" width="12" height="12" rx="2"/><path ' + P + ' d="M8 6.5V5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 20 5v9a1.5 1.5 0 0 1-1.5 1.5H17"/>',
    dots3: '<circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    copy: '<rect ' + P + ' x="9" y="9" width="11" height="11" rx="2"/><path ' + P + ' d="M5 15V6a1 1 0 0 1 1-1h9"/>',
    glasses: '<circle ' + P + ' cx="7" cy="14" r="3.2"/><circle ' + P + ' cx="17" cy="14" r="3.2"/><path ' + P + ' d="M10.2 14h3.6M4 11l2-4M20 11l-2-4"/>',
    bookmark: '<path ' + P + ' d="M7 4h10v16l-5-4-5 4z"/>',
    heart: '<path ' + P + ' d="M12 20s-7-4.6-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.4 12 20 12 20z"/>',
    search: '<circle ' + P + ' cx="11" cy="11" r="6.5"/><path ' + P + ' d="m19 19-3.4-3.4"/>',
    plusbox: '<rect ' + P + ' x="4" y="4" width="16" height="16" rx="4"/><path ' + P + ' d="M12 8.5v7M8.5 12h7"/>',
    x: '<path ' + P + ' d="M6 6l12 12M18 6L6 18"/>',
    down: '<path ' + P + ' d="M12 4v13M7 12l5 5 5-5"/><path ' + P + ' d="M5 20h14"/>',
    msg: '<path ' + P + ' d="M20 12c0 3.6-3.6 6.5-8 6.5-.9 0-1.8-.1-2.6-.4L5 19.5l1-3A6.2 6.2 0 0 1 4 12c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5z"/>',
    mail: '<rect ' + P + ' x="3.5" y="6" width="17" height="12" rx="2"/><path ' + P + ' d="m4.5 8 7.5 5 7.5-5"/>',
    note: '<rect ' + P + ' x="5" y="4" width="14" height="16" rx="2"/><path ' + P + ' d="M8 9h8M8 13h8M8 17h5"/>'
  };
  function svg(n, w) {
    return '<svg viewBox="0 0 24 24"' + (w ? ' style="width:' + w + 'px;height:' + w + 'px"' : "")
      + ' aria-hidden="true">' + (ICON[n] || "") + "</svg>";
  }
  /* ★ 時計は **いまの 時刻**（2026-09-01・訴え「時計、リアルタイムにして」）。
     9:41 は Apple の 宣材の 時刻。作りものに 見えるので 本物の 時計に する。
     出しかたは 端末の 設定に 従う（24 時制／12 時制、AM/PM も その まま）。 */
  function 時刻() {
    var d = new Date();
    try {
      var t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      /* iOS の 上の 帯は 頭の 0 を 出さない（09:05 → 9:05）。 */
      return String(t).replace(/^0/, "").replace(/\u200e/g, "");
    } catch (e) {
      return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
    }
  }
  var 時計の輪 = null;
  function 時計を回す() {
    時計を止める();
    if (!root) return;
    時計の輪 = setInterval(function () {
      if (!st.開 || st.面 !== "ph") { 時計を止める(); return; }
      var e = root.querySelector("[data-clock]");
      if (e) e.textContent = 時刻();
    }, 10000);
  }
  function 時計を止める() { if (時計の輪) { clearInterval(時計の輪); 時計の輪 = null; } }

  /* 右上の 電波・Wi-Fi・電池（絵文字だと 端末で 化ける ので 自分で 描く） */
  function 電波() {
    return '<svg viewBox="0 0 17 11" aria-hidden="true">'
      + '<rect x="0" y="7" width="3" height="4" rx="1" fill="#111"/>'
      + '<rect x="4.4" y="5" width="3" height="6" rx="1" fill="#111"/>'
      + '<rect x="8.8" y="2.8" width="3" height="8.2" rx="1" fill="#111"/>'
      + '<rect x="13.2" y="0" width="3" height="11" rx="1" fill="#111"/></svg>'
      + '<svg viewBox="0 0 16 12" aria-hidden="true">'
      + '<path d="M8 10.6 6.1 8.5a2.9 2.9 0 0 1 3.8 0z" fill="#111"/>'
      + '<path d="M3.6 6.1a6.5 6.5 0 0 1 8.8 0" stroke="#111" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      + '<path d="M1.1 3.5a10 10 0 0 1 13.8 0" stroke="#111" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>'
      + '<svg viewBox="0 0 27 12" aria-hidden="true">'
      + '<rect x=".6" y=".6" width="22" height="10.8" rx="3.2" stroke="#111" stroke-opacity=".38" fill="none"/>'
      + '<rect x="2.2" y="2.2" width="16" height="7.6" rx="1.9" fill="#111"/>'
      + '<path d="M24.6 4.2v3.6a2 2 0 0 0 0-3.6z" fill="#111" fill-opacity=".38"/></svg>';
  }
  /* 指先（スマホの 案内では 矢印では なく これ） */
  var FINGER = '<svg viewBox="0 0 30 30" aria-hidden="true">'
    + '<circle cx="15" cy="15" r="11" fill="rgba(40,36,70,.30)" stroke="rgba(255,255,255,.9)" stroke-width="2"/>'
    + '<circle cx="15" cy="15" r="3.4" fill="rgba(255,255,255,.95)"/></svg>';

  /* マウスの 矢印（macOS / Windows の 形） */
  var CURSOR = '<svg viewBox="0 0 20 26" aria-hidden="true">'
    + '<path d="M2 1.5 17.5 13.5 10.5 14 14 22.5 11 24 7.5 15.5 2 20z" fill="#fff" stroke="#222" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  /* ══ 段（PC / スマホ）══════════════════════════════════════════════ */
  var PC段 = [
    { 文: "アドレスバーの 右はしに、**画面に 下向きの 矢印**の 印が あります。",
      補: "この 印は「この サイトは アプリとして 入れられます」という 合図です。出ない ときは ⋮ →「キャストして 保存して 共有」→「ページを アプリとして インストール」。" },
    { 文: "押すと **「アプリの インストール」**の 窓が 出ます。", 補: "名前と アドレスを 確かめる ための 窓です。" },
    { 文: "**「インストール」**を 押すと、アプリとして 入ります。",
      補: "入れると、タブを 探さずに 開けて、起動も 速く なります。ブックマークとは 別ものです。" }
  ];
  var 携段 = [
    { 文: "下の 帯の **共有ボタン**（四角に 上向きの 矢印）を 押します。",
      補: "iOS 26 では 帯に 共有が ありません。アドレスバーの 右の **⋯** → **共有** の 順で 開きます。" },
    { 文: "出て きた 一覧を 下へ すべらせ、**「ホーム画面に 追加」**を 押します。",
      補: "コピー／リーディングリスト／ブックマーク… の 下の ほうに あります。" },
    { 文: "名前を 確かめて、右上の **「追加」**を 押します。", 補: "名前は 好きに 変えられます。" },
    { 文: "ホーム画面に **アイコンが 増えます**。ここから 開けば アプリと 同じです。",
      補: "Safari の 帯が 消えて 画面が 広く 使えます。" }
  ];

  var host = null, root = null;
  var st = { 開: false, 面: "pc", 段: 0, 出さない: false, 前: "" };

  function 建てる() {
    if (host) return;
    host = doc.createElement("div");
    host.id = "vqInstall";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = doc.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var b = doc.createElement("div"); b.setAttribute("data-box", ""); root.appendChild(b);
    doc.body.appendChild(host);
    つなぐ();
  }

  function 段一覧() { return st.面 === "pc" ? PC段 : 携段; }

  function 開く(o) {
    建てる();
    o = o || {};
    st.面 = o.面 || (指の端末か() ? "ph" : "pc");
    st.段 = 0; st.開 = true; st.前 = "";
    st.出さない = false;
    host.setAttribute("data-open", "1");
    描く();
    try { localStorage.setItem(見たKEY, String(Date.now())); } catch (e) {}
    try { if (window.__vqTrace) window.__vqTrace.記す("screen", "install-tour"); } catch (e) {}
  }
  function 閉じる() {
    st.開 = false;
    if (host) host.removeAttribute("data-open");
  }

  function 描く() {
    if (!root) return;
    var box = root.querySelector("[data-box]");
    if (!box) return;
    if (!st.開) { box.innerHTML = ""; st.前 = ""; return; }
    var 印 = st.面 + "/" + st.段;
    var 同 = st.前 === 印;
    box.innerHTML = '<div class="bd" data-a="close"></div>'
      + '<div class="w" role="dialog" aria-modal="true" aria-label="アプリとして 入れる">'
      + 中身() + "</div>";
    st.前 = 印;
    /* 動きは **描いた あと**に 走らせる（1 コマ 置く）。 */
    requestAnimationFrame(function () { requestAnimationFrame(動かす); });
  }

  function 中身() {
    var 並 = 段一覧();
    var s = 並[Math.min(st.段, 並.length - 1)];
    var h = '<div class="hd">'
      + '<div class="h1">アプリとして 入れると 便利です！</div>'
      + '<div class="h2">タブを 探さずに 開けて、起動も 速く なります。'
      + "1 分も かかりません。</div>"
      + '<div class="tabs" role="tablist">'
      + '<button class="tab' + (st.面 === "pc" ? " on" : "") + '" data-a="面" data-v="pc"'
      + ' role="tab" aria-selected="' + (st.面 === "pc") + '">パソコン（Chrome）</button>'
      + '<button class="tab' + (st.面 === "ph" ? " on" : "") + '" data-a="面" data-v="ph"'
      + ' role="tab" aria-selected="' + (st.面 === "ph") + '">スマホ（Safari）</button>'
      + "</div></div>";
    h += '<div class="stage' + (st.面 === "ph" ? " is-ph" : "") + '">'
      + (st.面 === "pc" ? Chrome画面() : Safari画面()) + "</div>";
    h += '<div class="step"><span class="step-n">' + (st.段 + 1) + "</span>"
      + '<span class="step-t">' + 太字(s.文) + "</span></div>";
    if (s.補) h += '<div class="hint">' + 太字(s.補) + "</div>";
    h += '<div class="dots">' + 並.map(function (_, i) {
      return '<span class="dot' + (i === st.段 ? " on" : "") + '"></span>';
    }).join("") + "</div>";
    h += '<div class="ft">'
      + '<label class="chk"><input type="checkbox" data-a="hide"' + (st.出さない ? " checked" : "")
      + '>次から 出さない</label>'
      + '<button class="btn" data-a="prev"' + (st.段 === 0 ? " disabled" : "") + ">前へ</button>"
      + (st.段 < 並.length - 1
          ? '<button class="btn pri" data-a="next">次へ</button>'
          : (本物 && st.面 === "pc"
              ? '<button class="btn pri" data-a="doit">' + svg("down", 17) + "いま 入れる</button>"
              : '<button class="btn pri" data-a="close">わかった</button>'))
      + "</div>";
    return h;
  }
  function 太字(s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"); }

  /* ── Chrome の 窓（忠実に）─────────────────────────────── */
  function Chrome画面() {
    return '<div class="cr" data-cr>'
      + '<div class="cr-tabs">'
      + '<div class="cr-dots"><i class="cr-dot" style="background:#FF5F57"></i>'
      + '<i class="cr-dot" style="background:#FEBC2E"></i><i class="cr-dot" style="background:#28C840"></i></div>'
      + '<div class="cr-tab"><i></i><span>VocabuQuiz</span></div>'
      + "</div>"
      + '<div class="cr-bar">'
      + '<div class="cr-nav"><span class="cr-ic">' + svg("back") + "</span>"
      + '<span class="cr-ic">' + svg("fwd") + "</span>"
      + '<span class="cr-ic">' + svg("reload") + "</span></div>"
      + '<div class="cr-url">' + svg("lock", 13) + "<span>www.vocabuquiz.app</span></div>"
      + '<div class="cr-right">'
      + '<span class="cr-ic" data-install>' + svg("install") + "</span>"
      + '<span class="cr-ic">' + svg("star") + "</span>"
      + '<span class="cr-ic">' + svg("ext") + "</span>"
      + '<span class="cr-ic">' + svg("kebab") + "</span>"
      + "</div></div>"
      + '<div class="cr-body"></div>'
      + '<div class="cr-dlg" data-dlg><h4>アプリのインストール</h4>'
      + '<div class="cr-dlg-row"><span class="cr-dlg-ic">VQ</span>'
      + '<span><span class="cr-dlg-t">VocabuQuiz</span>'
      + '<span class="cr-dlg-u">www.vocabuquiz.app</span></span></div>'
      + '<div class="cr-dlg-b"><span class="cr-btn">キャンセル</span>'
      + '<span class="cr-btn pri" data-dlgok>インストール</span></div></div>'
      + '<span class="ring" data-ring></span>'
      + '<span class="cur" data-cur>' + CURSOR + "</span>"
      + "</div>";
  }

  /* ── iPhone / Safari（忠実に）──────────────────────────── */
  function Safari画面() {
    var 行 = [["copy", "コピー"], ["glasses", "リーディングリストに追加"], ["bookmark", "ブックマークを追加"],
              ["heart", "お気に入りに追加"], ["search", "ページを検索"], ["plusbox", "ホーム画面に追加"]];
    return '<div class="ph" data-ph>'
      + '<div class="ph-scr">'
      + '<div class="ph-note"></div>'
      + '<div class="ph-st"><span data-clock>' + esc(時刻()) + '</span>'
      + '<span class="ph-sig">' + 電波() + "</span></div>"
      + '<div class="ph-body"><div class="ph-hero"></div>'
      + '<div class="ph-ln"></div><div class="ph-ln s"></div>'
      + '<div class="ph-card"></div><div class="ph-card"></div></div>'
      + '<div class="ph-bar">'
      + '<div class="ph-adr"><span class="aA">ぁあ</span><span>vocabuquiz.app</span>'
      + svg("reload", 13) + "</div>"
      + '<div class="ph-tools">'
      + '<span class="ph-t dim">' + svg("back") + "</span>"
      + '<span class="ph-t dim">' + svg("fwd") + "</span>"
      + '<span class="ph-t" data-share>' + svg("share") + "</span>"
      + '<span class="ph-t">' + svg("book") + "</span>"
      + '<span class="ph-t">' + svg("tabs") + "</span>"
      + "</div></div>"
      /* 共有シート */
      + '<div class="sh" data-sh><div class="sh-grab"></div>'
      + '<div class="sh-hd"><span class="sh-ic">VQ</span><span><b>VocabuQuiz</b>'
      + "<i>vocabuquiz.app</i></span></div>"
      + '<div class="sh-apps">'
      + [["AirDrop", "#1E86FF", "share"], ["メッセージ", "#3ED35A", "msg"],
         ["メール", "#2E8BFF", "mail"], ["メモ", "#F2C94C", "note"]].map(function (a) {
          return '<span class="sh-app"><i style="background:' + a[1] + '">' + svg(a[2])
            + "</i>" + a[0] + "</span>";
        }).join("")
      + "</div>"
      + '<div class="sh-list">'
      + 行.map(function (r, i) {
          return '<div class="sh-r"' + (i === 5 ? " data-addrow" : "") + "><span>" + r[1] + "</span>"
            + svg(r[0]) + "</div>";
        }).join("")
      + "</div></div>"
      /* ホーム画面に 追加 */
      + '<div class="add" data-add>'
      + '<div class="add-hd"><span>キャンセル</span><b>ホーム画面に追加</b>'
      + '<span data-addok style="font-weight:650">追加</span></div>'
      + '<div class="add-box"><span class="add-ic">VQ</span>'
      + '<span class="add-nm"><b>VocabuQuiz</b><i>https://www.vocabuquiz.app</i></span></div>'
      + '<div class="add-note">このWebサイトにホーム画面からすばやくアクセスできるようになります。</div>'
      + "</div>"
      /* ホーム画面 */
      + '<div class="home" data-home><div class="home-g">'
      + '<span><span class="home-a"></span></span><span><span class="home-a"></span></span>'
      + '<span><span class="home-a"></span></span><span><span class="home-a"></span></span>'
      + '<span><span class="home-a"></span></span><span><span class="home-a"></span></span>'
      + '<span><span class="home-a me">VQ</span><span class="home-l">VocabuQuiz</span></span>'
      + '<span><span class="home-a"></span></span>'
      + "</div></div>"
      + '<span class="ring" data-ring></span>'
      + '<span class="cur finger" data-cur>' + FINGER + "</span>"
      + "</div></div>";
  }

  /* ══ 動かす（マウス／指を 目あてまで 運ぶ）══════════════════════════
     ★ 位置は **実際に 置かれた 部品の 座標**から 出す。
       決め打ちの px は 端末や 書体で ずれる。 */
  var 時計 = [];
  function 止める() { 時計.forEach(clearTimeout); 時計 = []; }
  function 後で(ms, f) { 時計.push(setTimeout(f, ms)); }

  /* ★ 置き場所は **その 部品の 親（位置の 基準）**から 測る。
     渡された 箱から 測ると、間に 余白の ある 箱が 挟まった とき その ぶん ずれる
     （iPhone の 枠は padding 8px。実測で 11px ずれて いた）。 */
  function 基準(el) {
    var p = el.offsetParent;
    return (p || el.parentNode || el).getBoundingClientRect();
  }
  function 印を当てる(親, 的, 大) {
    var ring = 親.querySelector("[data-ring]");
    if (!ring || !的) return;
    var pr = 基準(ring), tr = 的.getBoundingClientRect();
    var d = 大 || 34;
    ring.style.width = d + "px"; ring.style.height = d + "px";
    ring.style.left = Math.round(tr.left - pr.left + tr.width / 2 - d / 2) + "px";
    ring.style.top = Math.round(tr.top - pr.top + tr.height / 2 - d / 2) + "px";
    ring.classList.add("on");
  }
  function 運ぶ(親, 的, done) {
    var cur = 親.querySelector("[data-cur]");
    if (!cur || !的) { if (done) done(); return; }
    var pr = 基準(cur), tr = 的.getBoundingClientRect();
    cur.style.left = Math.round(tr.left - pr.left + tr.width / 2 - 3) + "px";
    cur.style.top = Math.round(tr.top - pr.top + tr.height / 2 - 3) + "px";
    後で(880, function () {
      cur.classList.add("tap");
      後で(520, function () { cur.classList.remove("tap"); if (done) done(); });
    });
  }
  function 置く(親, x, y) {
    var cur = 親.querySelector("[data-cur]");
    if (cur) { cur.style.left = x + "px"; cur.style.top = y + "px"; }
  }

  function 動かす() {
    止める();
    if (!root || !st.開) return;
    if (st.面 === "pc") { 時計を止める(); PCを動かす(); }
    else { 時計を回す(); 携帯を動かす(); }
  }
  function PCを動かす() {
    var cr = root.querySelector("[data-cr]");
    if (!cr) return;
    var dlg = cr.querySelector("[data-dlg]");
    var 印 = cr.querySelector("[data-install]");
    var ok = cr.querySelector("[data-dlgok]");
    置く(cr, 30, 120);
    if (st.段 === 0) {
      後で(240, function () { 運ぶ(cr, 印); 印を当てる(cr, 印, 32); });
    } else if (st.段 === 1) {
      印を当てる(cr, 印, 32);
      運ぶ(cr, 印, function () { if (dlg) dlg.classList.add("on"); });
    } else {
      if (dlg) dlg.classList.add("on");
      後で(240, function () {
        運ぶ(cr, ok, function () {
          印を当てる(cr, ok, 40);
          後で(420, function () { if (dlg) dlg.classList.remove("on"); });
        });
      });
    }
  }
  function 携帯を動かす() {
    var ph = root.querySelector("[data-ph]");
    if (!ph) return;
    var sh = ph.querySelector("[data-sh]");
    var add = ph.querySelector("[data-add]");
    var home = ph.querySelector("[data-home]");
    var 共 = ph.querySelector("[data-share]");
    var 行 = ph.querySelector("[data-addrow]");
    var ok = ph.querySelector("[data-addok]");
    置く(ph, 40, 120);
    if (st.段 === 0) {
      後で(240, function () { 運ぶ(ph, 共); 印を当てる(ph, 共, 34); });
    } else if (st.段 === 1) {
      sh.classList.add("on");
      後で(560, function () {
        運ぶ(ph, 行, function () { if (行) 行.classList.add("hit"); });
        印を当てる(ph, 行, 30);
      });
    } else if (st.段 === 2) {
      sh.classList.add("on");
      add.classList.add("on");
      後で(420, function () { 運ぶ(ph, ok); 印を当てる(ph, ok, 34); });
    } else {
      add.classList.add("on");
      後で(320, function () {
        add.classList.remove("on");
        home.classList.add("on");
      });
    }
  }

  /* ══ 押したとき ═════════════════════════════════════════════════ */
  function つなぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-a]") : null;
      if (!el) return;
      var a = el.getAttribute("data-a");
      if (a === "hide") return;                     /* チェックは change で 見る */
      e.preventDefault();
      if (a === "close") { 覚えて閉じる(); return; }
      if (a === "面") { st.面 = el.getAttribute("data-v") || "pc"; st.段 = 0; 描く(); return; }
      if (a === "next") { st.段 = Math.min(段一覧().length - 1, st.段 + 1); 描く(); return; }
      if (a === "prev") { st.段 = Math.max(0, st.段 - 1); 描く(); return; }
      if (a === "doit") { 本当に入れる(); return; }
    });
    root.addEventListener("change", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.a === "hide") st.出さない = !!t.checked;
    });
    doc.addEventListener("keydown", function (e) {
      if (!st.開) return;
      if (e.key === "Escape") { e.preventDefault(); 覚えて閉じる(); }
      else if (e.key === "ArrowRight") { st.段 = Math.min(段一覧().length - 1, st.段 + 1); 描く(); }
      else if (e.key === "ArrowLeft") { st.段 = Math.max(0, st.段 - 1); 描く(); }
    }, true);
  }
  function 覚えて閉じる() {
    if (st.出さない) { try { localStorage.setItem(KEY, "1"); } catch (e) {} }
    止める(); 時計を止める();
    閉じる();
  }
  /* ★ 本物の 入れる 口が ある ときは **絵で 終わらせない**。 */
  function 本当に入れる() {
    if (!本物) return;
    try {
      本物.prompt();
      本物.userChoice.then(function (r) {
        try { if (window.__vqTrace) window.__vqTrace.記す("tap", "install-" + ((r && r.outcome) || "?")); } catch (e) {}
        if (r && r.outcome === "accepted") { try { localStorage.setItem(KEY, "1"); } catch (e) {} }
        本物 = null;
        閉じる();
      }).catch(function () {});
    } catch (e) {}
  }

  /* ══ 開いた ときに 1 回だけ ═══════════════════════════════════════ */
  function 出すべきか() {
    if (入っているか()) return false;         /* もう 入って いる */
    if (出さない設定か()) return false;        /* 次から 出さない と 言われた */
    return true;
  }
  /* ★ **ログインする 前から 出す**（2026-09-01・追いの 訴え
     「ログインする 前から 全部の ブラウザで 表示して いいよ」）。

     はじめは ログイン画面に 重ねない ように していたが、
     入れて ほしいのは **これから 登録する 人**こそ なので、待たない。
     重なり順は 認証画面（2147483000）より 上（2147483300）に 置いて ある。
     ブラウザの 種類でも 選り分けない（Chrome / Safari は **人が 選べる**）。
     出さないのは 2 つだけ: もう 入って いる／「次から 出さない」と 言われた。 */
  function 起動時() {
    if (!出すべきか()) return;
    /* 画面が 描かれる のを 待つ だけ（起動の 一瞬に 重ねない）。 */
    setTimeout(function () {
      if (!出すべきか()) return;
      開く();
    }, 1800);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", 起動時);
  else 起動時();

  window.__vqInstall = {
    open: 開く, close: 閉じる,
    出すべきか: 出すべきか,
    入っているか: 入っているか,
    もう出さない: function (on) {
      try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch (e) {}
    },
    状態: function () {
      return { 開: st.開, 面: st.面, 段: st.段, 出さない: st.出さない,
               段数: 段一覧().length, 本物: !!本物 };
    }
  };
})();
