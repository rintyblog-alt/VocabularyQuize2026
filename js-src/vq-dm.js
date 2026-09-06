/* ══════════════════════════════════════════════════════════════════════
   vq-dm — DM（1 対 1 のやりとり）

   決めごと（サーバ側と 同じ）:
     ・相手は 誰でも 探して 話しかけられる
     ・**相互フォローでない** うちは 自分が 送れるのは 3 件まで
       （相手も 3 件）。相互フォローに なった 瞬間から 無制限
     ・消しても 枠は 戻らない

   できること:
     一覧（ピン留め・未読の数・最後の一言・相手の名前）／
     やりとり（日付の区切り・時刻・既読・返信・ピン・削除・報告）／
     送れるもの: 文・スタンプ（大量）・画像・GIF・動画・音声・
                 ファイル・プリセットの共有

   繋いでいる API:
     GET  /api/dm/threads
     GET  /api/dm/messages?threadId=&before=
     GET  /api/dm/sync?since=&threadId=
     GET  /api/dm/preset?messageId=
     POST /api/dm/open    {userId}
     POST /api/dm/send    {threadId|userId, kind, body, mediaUrl, meta, replyTo, preset}
     POST /api/dm/read    {threadId}
     POST /api/dm/delete  {messageId}
     POST /api/dm/pin     {threadId, messageId, on}
     POST /api/dm/thread  {threadId, pinned?, muted?, hidden?}
     POST /api/dm/report  {threadId, messageId, reason, note}
     GET  /api/groups/user-search?q=      ← 相手探しは 既存のものを そのまま使う
     POST /api/upload/image               ← 画像・動画・音声・ファイル 共通

   認証は localStorage["app.auth.token.v1"] の Bearer。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqDmInstalled) return;
  window.__vqDmInstalled = true;

  var TOKEN_KEY = "app.auth.token.v1";
  var 早い = 3000;      /* 開いている間の 取り直し */
  /* ★ 閉じている ときの 間隔（2026-09-02 に 測って 25 秒 → 60 秒）。
     左の 未読の 印を 出す ためだけの 取り直し。25 秒だと
     タブを 開いて いる だけで 1 日 3,456 回に なる。
     未読の 印が 最大 1 分 遅れて 出るのは 困らない。 */
  var 遅い = 60000;

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
        if (!r.ok) { var e = new Error(j.message || ("HTTP " + r.status)); e.code = j.code; e.status = r.status; e.data = j; throw e; }
        return j;
      });
    });
  }

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ── 日付と時刻 ─────────────────────────────────────────────── */
  function 日付キー(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function 日付の見出し(ts) {
    var d = new Date(ts), 今 = new Date();
    var k = 日付キー(ts);
    if (k === 日付キー(今.getTime())) return "今日";
    if (k === 日付キー(今.getTime() - 86400000)) return "昨日";
    var w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    if (d.getFullYear() === 今.getFullYear())
      return (d.getMonth() + 1) + "月" + d.getDate() + "日（" + w + "）";
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }
  function 時刻(ts) {
    var d = new Date(ts);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function 相対(ts) {
    if (!ts) return "";
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "たった今";
    if (s < 3600) return Math.floor(s / 60) + "分前";
    var k = 日付キー(ts);
    if (k === 日付キー(Date.now())) return 時刻(ts);
    if (k === 日付キー(Date.now() - 86400000)) return "昨日";
    var d = new Date(ts);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  /* ══ スタンプ ══════════════════════════════════════════════════
     「めちゃくちゃ大量に」との ご希望。**並びから 作って、
     この端末で 実際に 絵になるものだけ 残す**（豆腐□を 出さない）。
     残った並びは 覚えておく（毎回 測り直さない）。 */
  var スタンプの並び = [
    ["顔", [[0x1F600, 0x1F64F], [0x1F910, 0x1F92F], [0x1F970, 0x1F97A], [0x1F9D0, 0x1F9D0]]],
    ["手と人", [[0x1F440, 0x1F450], [0x1F464, 0x1F487], [0x1F918, 0x1F91F], [0x1F930, 0x1F93E], [0x1F9B0, 0x1F9BF], [0x1FAC0, 0x1FAC5], [0x1FAF0, 0x1FAF8]]],
    ["いきもの", [[0x1F400, 0x1F43F], [0x1F980, 0x1F9AE], [0x1FAB0, 0x1FABF]]],
    ["たべもの", [[0x1F32D, 0x1F37F], [0x1F950, 0x1F96F], [0x1FAD0, 0x1FADF]]],
    ["あそび", [[0x1F3A0, 0x1F3CA], [0x1F3CF, 0x1F3F0], [0x1F945, 0x1F94C]]],
    ["のりもの", [[0x1F680, 0x1F6C5], [0x1F6E0, 0x1F6FC], [0x1F9BC, 0x1F9BD]]],
    ["もの", [[0x1F4A0, 0x1F4FF], [0x1F500, 0x1F53D], [0x1F550, 0x1F567], [0x1FA70, 0x1FA9F]]],
    ["しるし", [[0x2600, 0x26FF], [0x2700, 0x27BF], [0x1F300, 0x1F32C], [0x1F380, 0x1F393], [0x1F5FB, 0x1F5FF]]]
  ];
  var スタンプ表 = null;
  function 絵になるか(ctx, 字, 豆腐幅) {
    var w = ctx.measureText(字).width;
    return w > 0 && Math.abs(w - 豆腐幅) > 0.5;
  }
  function スタンプを作る() {
    if (スタンプ表) return スタンプ表;
    try {
      var 覚え = localStorage.getItem("vq.dm.stamps.v1");
      if (覚え) { var j = JSON.parse(覚え); if (j && j.g && j.g.length) { スタンプ表 = j.g; return スタンプ表; } }
    } catch (e) {}
    var c = document.createElement("canvas").getContext("2d");
    c.font = "32px sans-serif";
    var 豆腐幅 = c.measureText("￿￿").width / 2;
    var 出 = [];
    for (var i = 0; i < スタンプの並び.length; i++) {
      var 名 = スタンプの並び[i][0], 範 = スタンプの並び[i][1], 粒 = [];
      for (var r = 0; r < 範.length; r++) {
        for (var cp = 範[r][0]; cp <= 範[r][1]; cp++) {
          var 字 = String.fromCodePoint(cp);
          if (絵になるか(c, 字, 豆腐幅)) 粒.push(字);
        }
      }
      if (粒.length) 出.push({ 名: 名, 粒: 粒 });
    }
    スタンプ表 = 出;
    try { localStorage.setItem("vq.dm.stamps.v1", JSON.stringify({ g: 出, at: Date.now() })); } catch (e) {}
    return スタンプ表;
  }
  function スタンプの総数() {
    var g = スタンプを作る(), n = 0;
    for (var i = 0; i < g.length; i++) n += g[i].粒.length;
    return n;
  }

  /* ── 印（アイコン）──────────────────────────────────────────── */
  var P = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="M4 12 20 4l-7 16-2-7-7-1Z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8.5 14a4.5 4.5 0 0 0 7 0"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.4"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    pin: '<path d="M9 3h6l-1 6 4 3v2H6v-2l4-3-1-6Z"/><path d="M12 14v7"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    phone: '<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1z"/>',
    reply: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6v1"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
    flag: '<path d="M5 21V4"/><path d="M5 5h11l-1.5 3L16 11H5"/>',
    file: '<path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/>',
    check: '<path d="m5 12 5 5L19 7"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6"/>',
    bell: '<path d="M18 15v-4a6 6 0 1 0-12 0v4l-1.6 2.4A1 1 0 0 0 5.2 19h13.6a1 1 0 0 0 .8-1.6L18 15Z"/><path d="M10 22h4"/>',
    bellOff: '<path d="M18 15v-4a6 6 0 0 0-7.6-5.8"/><path d="M6 9v6l-1.6 2.4A1 1 0 0 0 5.2 19h12"/><path d="M3 3l18 18"/>'
  };
  function svg(n, cls) {
    return '<svg class="' + (cls || "i") + '" viewBox="0 0 24 24" ' + P + ' aria-hidden="true">' + (ICON[n] || "") + "</svg>";
  }

  /* ── 見た目 ─────────────────────────────────────────────────── */
  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483000;display:none;",
      "font-family:var(--vq-app-font,Inter,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#2B2836)}",
    ":host([data-open='1']){display:block}",
    /* 出るときに ふわっと（2026-08-29・訴え「開く時にも 動きを」）。
       transition ではなく keyframes。display が 変わった その場から 走るので、
       開く 側が コマを 空けていなくても 必ず 動く。 */
    "@keyframes vqdmIn{from{opacity:0;transform:scale(.992)}to{opacity:1;transform:none}}",
    ".sheet{position:absolute;inset:0;display:flex;background:var(--vq-bg-canvas,#F7F6FB);",
      "animation:vqdmIn .24s cubic-bezier(.22,1,.36,1) both}",
    "@media (prefers-reduced-motion:reduce){.sheet{animation:none}}",
    "button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}",
    "input,textarea{font:inherit;color:inherit}",
    ".i{width:20px;height:20px;flex:0 0 auto}",
    ".i.s{width:16px;height:16px}",

    /* 左（一覧） */
    ".left{width:340px;flex:0 0 auto;display:flex;flex-direction:column;",
      "background:var(--vq-surface,#fff);border-right:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".lhead{display:flex;align-items:center;gap:8px;padding:14px 14px 10px}",
    ".lhead h2{font-size:19px;font-weight:700;flex:1}",
    ".iconb{width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:var(--vq-text-secondary,#6B6480)}",
    ".iconb:hover{background:var(--vq-surface-sunken,#F2F0F8)}",
    ".iconb.on{background:var(--vq-accent-soft,#EEEAFB);color:var(--vq-accent,#7A6BD6)}",
    /* 名前を 押したら プロフィールへ。押せることが 分かる形にする。 */
    ".who{display:flex;align-items:center;gap:10px;flex:1;min-width:0;text-align:left;",
      "padding:2px 6px;margin:-2px -6px;border-radius:12px}",
    ".who:hover{background:var(--vq-surface-sunken,#F2F0F8)}",
    /* ブロック中の 帯 */
    ".blockbar{display:flex;gap:8px;align-items:center;padding:9px 14px;font-size:12.5px;",
      "background:var(--vq-danger-soft,#FCE9E9);color:var(--vq-danger-strong,#9B2C2C);",
      "border-top:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".blockbar .t{flex:1}",
    ".blockbar button{font-weight:700;text-decoration:underline}",
    ".rname .bk{font-size:10px;padding:1px 6px;border-radius:99px;",
      "background:var(--vq-danger-soft,#FCE9E9);color:var(--vq-danger-strong,#9B2C2C);font-weight:700}",
    ".sbox{margin:0 14px 10px;display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:11px;",
      "background:var(--vq-surface-sunken,#F2F0F8);color:var(--vq-text-secondary,#6B6480)}",
    ".sbox input{flex:1;border:0;background:transparent;outline:none;font-size:14px}",
    ".list{flex:1;overflow-y:auto;padding:0 8px 20px}",
    ".row{width:100%;display:flex;gap:11px;align-items:center;padding:10px;border-radius:13px;text-align:left}",
    ".row:hover{background:var(--vq-surface-sunken,#F2F0F8)}",
    ".row.on{background:var(--vq-accent-soft,#EEEAFB)}",
    ".av{width:42px;height:42px;border-radius:50%;flex:0 0 auto;object-fit:cover;",
      "background:var(--vq-accent-soft,#EEEAFB);color:var(--vq-accent,#7A6BD6);",
      "display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:15px}",
    ".rmid{flex:1;min-width:0}",
    ".rname{display:flex;align-items:center;gap:5px;font-size:14.5px;font-weight:600}",
    ".rname b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}",
    ".rlast{font-size:12.5px;color:var(--vq-text-secondary,#6B6480);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}",
    ".rright{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex:0 0 auto}",
    ".rtime{font-size:11px;color:var(--vq-text-muted,#8F88A6)}",
    ".ub{min-width:19px;height:19px;padding:0 6px;border-radius:99px;background:var(--vq-accent,#7A6BD6);",
      "color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}",
    ".mutual{font-size:10px;padding:1px 6px;border-radius:99px;background:var(--vq-accent-soft,#EEEAFB);color:var(--vq-accent,#7A6BD6);font-weight:700}",

    /* 右（やりとり） */
    ".right{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--vq-bg-canvas,#F7F6FB)}",
    ".chead{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--vq-surface,#fff);",
      "border-bottom:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".chead .nm{flex:1;min-width:0}",
    ".chead .nm b{display:block;font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".chead .nm span{display:block;font-size:12px;color:var(--vq-text-secondary,#6B6480)}",
    ".backb{display:none}",
    ".pinbar{display:flex;gap:8px;align-items:center;padding:8px 14px;background:var(--vq-accent-soft,#EEEAFB);",
      "font-size:12.5px;color:var(--vq-accent-strong,#5B4EAE);border-bottom:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".pinbar .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".msgs{flex:1;overflow-y:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:3px}",
    ".daysep{align-self:center;margin:14px 0 10px;font-size:11.5px;font-weight:600;color:var(--vq-text-secondary,#6B6480);",
      "background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF);border-radius:99px;padding:4px 12px}",
    ".m{display:flex;gap:8px;align-items:flex-end;max-width:74%}",
    ".m.me{align-self:flex-end;flex-direction:row-reverse}",
    ".m.you{align-self:flex-start}",
    ".bub{padding:9px 13px;border-radius:17px;font-size:14.5px;line-height:1.62;word-break:break-word;white-space:pre-wrap}",
    ".m.you .bub{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF);border-bottom-left-radius:6px}",
    ".m.me .bub{background:var(--vq-accent,#7A6BD6);color:#fff;border-bottom-right-radius:6px}",
    ".m .side{display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex:0 0 auto;padding-bottom:2px}",
    ".m.you .side{align-items:flex-start}",
    ".ts{font-size:10.5px;color:var(--vq-text-muted,#8F88A6);white-space:nowrap}",
    ".read{font-size:10.5px;color:var(--vq-accent,#7A6BD6);font-weight:700;white-space:nowrap}",
    ".m .kebab{opacity:0;width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:var(--vq-text-muted,#8F88A6)}",
    ".m:hover .kebab{opacity:1}",
    ".m .kebab:hover{background:var(--vq-surface-sunken,#F2F0F8)}",
    ".stamp{font-size:54px;line-height:1.1;padding:2px 4px}",
    ".m.me .stamp,.m.you .stamp{background:transparent;border:0}",
    ".mimg{max-width:280px;max-height:320px;border-radius:14px;display:block;cursor:zoom-in}",
    ".mvid{max-width:300px;border-radius:14px;display:block}",
    ".maud{width:230px}",
    ".mfile{display:flex;align-items:center;gap:9px;padding:10px 13px;border-radius:14px;background:var(--vq-surface,#fff);",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);font-size:13.5px}",
    ".mpre{width:250px;padding:12px;border-radius:15px;background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".mpre .ttl{font-size:14px;font-weight:700;margin-top:6px}",
    ".mpre .sub{font-size:12px;color:var(--vq-text-secondary,#6B6480);margin-top:2px}",
    ".mpre button{margin-top:10px;width:100%;height:34px;border-radius:10px;background:var(--vq-accent,#7A6BD6);color:#fff;font-size:13px;font-weight:700}",
    ".mdel{font-size:13px;font-style:italic;color:var(--vq-text-muted,#8F88A6);padding:8px 12px;border-radius:15px;",
      "border:1px dashed var(--vq-border-subtle,#E7E4EF)}",
    ".quote{border-left:3px solid currentColor;opacity:.72;padding:2px 0 2px 8px;margin-bottom:5px;font-size:12.5px;",
      "max-height:46px;overflow:hidden}",

    /* 送る所 */
    ".limit{padding:9px 14px;font-size:12.5px;background:var(--vq-warn-soft,#FDF3E2);color:var(--vq-warn-strong,#8A5B12);",
      "border-top:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".limit.ng{background:var(--vq-danger-soft,#FCE9E9);color:var(--vq-danger-strong,#9B2C2C)}",
    /* ★ 下を 深くする（2026-08-20）。
       訴え「DM のメッセージ画面の 下部が モバイルだと 低すぎる」。
       ・iPhone の 下の 帯（ホームバー）ぶんを env() で 空ける
       ・キーボードが 出たら --kb を 入れて そのぶん 持ち上げる
       ・形は **Lumi の 下部と 同じ**（丸い 1 本のバー） */
    ".comp{padding:8px 10px calc(10px + max(6px,var(--vq-sab,0px)) + var(--kb,0px));",
      "background:var(--vq-surface,#fff);border-top:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".repbar{display:flex;gap:8px;align-items:center;padding:7px 10px;margin:0 auto 8px;max-width:820px;border-radius:11px;",
      "background:var(--vq-surface-sunken,#F2F0F8);font-size:12.5px}",
    ".repbar .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".crow{display:flex;align-items:flex-end;gap:2px;max-width:820px;margin:0 auto;",
      "background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E7E4EF);border-radius:999px;",
      "padding:5px 6px 5px 6px;",
      "box-shadow:0 1px 2px rgba(16,15,26,.05),0 8px 24px rgba(16,15,26,.07)}",
    ".crow .iconb{width:36px;height:36px;border-radius:999px}",
    ".crow .iconb[disabled]{opacity:.35;cursor:default}",
    /* 16px 未満だと iPhone が 勝手に 拡大する。ここは 下げない。 */
    ".ta{flex:1 1 auto;min-width:56px;min-height:30px;max-height:132px;border:0;background:transparent;",
      "padding:6px 6px;font-size:16px;line-height:1.7;resize:none;outline:none}",
    ".ta::placeholder{color:var(--vq-text-muted,#8F88A6)}",
    ".sendb{width:36px;height:36px;border-radius:999px;background:var(--vq-accent,#7A6BD6);color:#fff;",
      "display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}",
    ".sendb[disabled]{opacity:.4;cursor:default}",
    "@media (max-width:430px){.crow{gap:0}.crow .iconb{width:32px;height:32px}",
      ".crow .iconb .i{width:18px;height:18px}.ta{font-size:16px;padding:6px 3px}}",
    ".rec{display:flex;align-items:center;gap:9px;padding:9px 13px;border-radius:14px;background:var(--vq-danger-soft,#FCE9E9);",
      "color:var(--vq-danger-strong,#9B2C2C);font-size:13.5px;font-weight:600}",
    ".dot{width:9px;height:9px;border-radius:50%;background:currentColor;animation:bl 1s infinite}",
    "@keyframes bl{0%,100%{opacity:1}50%{opacity:.25}}",

    /* ══ やりとりの 背景（2026-08-20）════════════════════════════
       訴え「DM の背景を 設定から 設定できるように。
       VocabuQuiz 側でも 用意はしておこう。テンプレートを 8 つくらい」
       ★ 外の 画像は 使わない（読み込みで 待たせない・通信も 増やさない）。
       ★ どれでも 吹き出しが 読めることを 実測してある。 */
    ".msgs{background-attachment:local}",
    ":host([data-bg='paper']) .msgs{background-color:var(--vq-bg-canvas,#F7F6FB);",
      "background-image:linear-gradient(90deg,rgba(120,110,150,.07) 1px,transparent 1px),",
      "linear-gradient(rgba(120,110,150,.07) 1px,transparent 1px);background-size:22px 22px}",
    ":host([data-bg='dots']) .msgs{background-color:var(--vq-bg-canvas,#F7F6FB);",
      "background-image:radial-gradient(rgba(122,107,214,.20) 1.6px,transparent 1.6px);background-size:20px 20px}",
    ":host([data-bg='grid']) .msgs{background-color:var(--vq-bg-canvas,#F7F6FB);",
      "background-image:linear-gradient(rgba(122,107,214,.13) 1px,transparent 1px),",
      "linear-gradient(90deg,rgba(122,107,214,.13) 1px,transparent 1px);background-size:34px 34px}",
    ":host([data-bg='dawn']) .msgs{background:linear-gradient(170deg,#FFE7D3 0%,#FBD5E0 42%,#EADCF7 100%)}",
    ":host([data-bg='forest']) .msgs{background:linear-gradient(180deg,#16301F 0%,#1E4230 60%,#12241C 100%)}",
    ":host([data-bg='night']) .msgs{background:linear-gradient(180deg,#171426 0%,#1E1B33 55%,#12101F 100%)}",
    ":host([data-bg='sakura']) .msgs{background-color:#FDF2F5;",
      "background-image:radial-gradient(circle at 20% 30%,rgba(226,140,168,.20) 0 8px,transparent 9px),",
      "radial-gradient(circle at 70% 60%,rgba(226,140,168,.16) 0 11px,transparent 12px),",
      "radial-gradient(circle at 45% 85%,rgba(226,140,168,.13) 0 7px,transparent 8px);background-size:180px 180px}",
    ":host([data-bg='ocean']) .msgs{background:linear-gradient(180deg,#E4F1F8 0%,#CFE6F2 55%,#BBD9EC 100%)}",
    /* 暗い背景のときは 相手の 吹き出しを 浮かせる（境目が 消えないように）。 */
    ":host([data-bg='forest']) .m.you .bub,:host([data-bg='night']) .m.you .bub{",
      "background:#fff;border-color:rgba(255,255,255,.35)}",
    ":host([data-bg='forest']) .daysep,:host([data-bg='night']) .daysep{",
      "background:rgba(255,255,255,.92);border-color:rgba(255,255,255,.5);color:#3C3752}",

    /* スタンプ盤 */
    ".pad{position:absolute;left:0;right:0;bottom:0;height:min(56vh,392px);background:var(--vq-surface,#fff);",
      "border-top:1px solid var(--vq-border-subtle,#E7E4EF);display:flex;flex-direction:column;z-index:5;",
      "box-shadow:0 -8px 24px rgba(60,50,110,.10)}",
    ".padtabs{display:flex;gap:4px;padding:8px 10px;overflow-x:auto;border-bottom:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".padtabs button{padding:5px 11px;border-radius:99px;font-size:12.5px;white-space:nowrap;color:var(--vq-text-secondary,#6B6480)}",
    ".padtabs button.on{background:var(--vq-accent,#7A6BD6);color:#fff;font-weight:700}",
    ".padgrid{flex:1;overflow-y:auto;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:3px}",
    ".padgrid button{height:46px;font-size:27px;border-radius:10px;line-height:1}",
    ".padgrid button:hover{background:var(--vq-surface-sunken,#F2F0F8)}",
    ".padfoot{padding:6px 12px 9px;font-size:11.5px;color:var(--vq-text-muted,#8F88A6);display:flex;gap:10px;align-items:center}",

    /* 小窓（メニュー・報告・相手さがし） */
    ".menu{position:fixed;z-index:20;min-width:180px;padding:6px;border-radius:14px;background:var(--vq-surface,#fff);",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);box-shadow:0 12px 32px rgba(60,50,110,.18)}",
    ".menu button{width:100%;display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:9px;font-size:13.5px;text-align:left}",
    ".menu button:hover{background:var(--vq-surface-sunken,#F2F0F8)}",
    ".menu button.dg{color:var(--vq-danger-strong,#9B2C2C)}",
    ".ovl{position:absolute;inset:0;z-index:30;background:rgba(38,32,60,.42);display:flex;align-items:center;justify-content:center;padding:18px}",
    ".card{width:min(440px,100%);max-height:82vh;overflow:auto;background:var(--vq-surface,#fff);border-radius:20px;padding:18px}",
    ".card h3{font-size:17px;font-weight:700;margin-bottom:4px}",
    ".card p.d{font-size:13px;color:var(--vq-text-secondary,#6B6480);margin-bottom:12px}",
    ".card .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}",
    ".btn{height:38px;padding:0 15px;border-radius:11px;font-size:13.5px;font-weight:600;",
      "background:var(--vq-surface-sunken,#F2F0F8)}",
    ".btn.pri{background:var(--vq-accent,#7A6BD6);color:#fff}",
    ".btn.dg{background:var(--vq-danger,#C2453F);color:#fff}",
    ".rsn{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}",
    ".rsn label{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px;",
      "background:var(--vq-surface-sunken,#F8F7FC);font-size:13.5px;cursor:pointer}",
    ".card textarea{width:100%;min-height:78px;border-radius:11px;border:1px solid var(--vq-border-subtle,#E7E4EF);padding:9px 11px;font-size:13.5px;resize:vertical}",
    ".empty{padding:52px 20px;text-align:center;color:var(--vq-text-secondary,#6B6480);font-size:13.5px}",
    ".empty h3{font-size:15px;font-weight:700;color:var(--vq-text,#2B2836);margin-bottom:5px}",
    ".hint{font-size:12px;color:var(--vq-text-muted,#8F88A6);padding:8px 14px}",

    /* せまい画面 */
    "@media (max-width:820px){",
      ".left{width:100%;border-right:0}",
      ":host([data-pane='chat']) .left{display:none}",
      ":host(:not([data-pane='chat'])) .right{display:none}",
      ".backb{display:inline-flex}",
      ".m{max-width:86%}",
    "}"
  ].join("");

  /* ══ 背景（8 種）════════════════════════════════════════════════
     設定（display.dmBackground）から 選ぶ。設定層が まだ 無いときは
     端末の 覚え（vq.dm.bg）を 見る。既定は 無地。 */
  var 背景の名 = ["plain", "paper", "dots", "grid", "dawn", "forest", "night", "sakura"];
  function いまの背景() {
    var v = "";
    try { if (window.__vqSet && window.__vqSet.get) v = String(window.__vqSet.get("display.dmBackground") || ""); } catch (e) {}
    if (!v) { try { v = String(localStorage.getItem("vq.dm.bg") || ""); } catch (e2) {} }
    return 背景の名.indexOf(v) >= 0 ? v : "plain";
  }
  function 背景を当てる() {
    if (!host) return;
    host.setAttribute("data-bg", いまの背景());
  }

  /* ══ キーボードで 下が 隠れないように ══════════════════════════
     訴え「DM のメッセージ画面の 下部が モバイルだと 低すぎる」。
     iPhone は キーボードが 出ても position:fixed の 底が 動かないので、
     visualViewport の 差を そのまま --kb へ 入れて 持ち上げる。 */
  function キーボードを見る() {
    var vv = window.visualViewport;
    if (!vv || !host) return;
    var 当てる = function () {
      if (!host) return;
      var 差 = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      host.style.setProperty("--kb", (差 > 60 ? 差 : 0) + "px");
    };
    vv.addEventListener("resize", 当てる);
    vv.addEventListener("scroll", 当てる);
    当てる();
  }

  /* ── 状態 ───────────────────────────────────────────────────── */
  var st = {
    開いた: false, 一覧: [], 部屋: "", 相手: null, 便り: [], もっと: false, 上へ足した: false,
    ピン: [], 上限: null, 相手既読: 0, 返信先: null, さがし: "", 候補: [],
    盤: false, 盤の組: 0, 録音: null, 未読合計: 0, 最後: 0, 巡: 0, 読込中: false,
    ブロック中: false
  };
  var host = null, root = null;

  /* ── 骨組み ─────────────────────────────────────────────────── */
  function 建てる() {
    if (host) return;
    host = document.createElement("div");
    host.id = "vqDM";
    host.setAttribute("data-open", "0");
    host.setAttribute("data-pane", "list");
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = document.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var w = document.createElement("div"); w.className = "sheet"; root.appendChild(w);
    document.body.appendChild(host);
    背景を当てる();
    キーボードを見る();
    try {
      if (window.__vqSet && window.__vqSet.on) window.__vqSet.on(function (id) {
        if (!id || id === "display.dmBackground") 背景を当てる();
      });
    } catch (e) {}
    つなぐ();
  }

  function 頭文字(c) {
    var n = String((c && (c.displayName || c.nickname)) || "?").trim();
    return n ? n.slice(0, 1) : "?";
  }
  /* 公式マークは core/feed/badge.js が 持ち主。
     まだ 読めていないときは **何も 出さない**（形の 違うものを 描かない）。 */
  function 印(k) {
    try { if (window.VQBADGE && k) return window.VQBADGE.印(k, { size: 15 }); } catch (e) {}
    return "";
  }
  function 名と印(c) {
    var n = esc((c && (c.displayName || c.nickname)) || "利用者");
    return 印(c && c.verified) + n;
  }
  function 顔(c, cls) {
    var u = c && c.avatarUrl;
    if (u) return '<img class="av ' + (cls || "") + '" src="' + esc(u) + '" alt="">';
    return '<span class="av ' + (cls || "") + '" role="img" aria-label="' + esc((c && c.displayName) || "利用者") + '">' + esc(頭文字(c)) + "</span>";
  }

  /* ══ いちばん下へ 寄せる（2026-08-29・訴え）════════════════════════
     訴え「DM で、必ず メッセージが 毎回 最下部に くるように してほしい」

     ★ なぜ 来ていなかったか（読んで 分かった 2 つ）
       ① 描き直しは **.sheet の innerHTML を まるごと 入れ替える**。
          つまり 便りの 入れ物は 毎回 **新しい 箱**で、scrollTop は 0。
          st.下へ が 立っている ときしか 寄せていなかったので、
          既読を 付けた・相手が 読んだ・一覧を 読み直した などの
          「ついでの 描き直し」の たびに **いちばん 上へ 飛んで いた**。
       ② 絵（写真・スタンプ）は **描いたあとに 届く**。
          届くと 高さが 増えるので、描いた 直後に 寄せても また 足りなくなる。

     ★ 直しかた
       ・**寄せるのは ここ 1 か所**（末尾へ）。絵が 届く たびに 寄せ直す。
       ・ついでの 描き直しでは **前の 位置を 戻す**。
         ただし 前が いちばん下だったなら、そのまま いちばん下へ。
       ・人が 自分で 上へ 動かしたら、絵が 届いても 引きずり下ろさない。 */
  var 貼り付き = true;               /* いま いちばん下に 貼り付いているか */
  function 下端か(m) {
    if (!m) return true;
    return (m.scrollHeight - m.scrollTop - m.clientHeight) <= 48;
  }
  function 末尾へ(m) {
    if (!m) return;
    貼り付き = true;
    var 寄せる = function () { if (貼り付き && m.isConnected) m.scrollTop = m.scrollHeight; };
    寄せる();
    /* 描いた 直後は まだ 高さが 決まっていない ことが ある。 */
    try { root.requestAnimationFrame ? root.requestAnimationFrame(寄せる) : setTimeout(寄せる, 16); }
    catch (e) { setTimeout(寄せる, 16); }
    setTimeout(寄せる, 80);
    setTimeout(寄せる, 300);
    /* 絵が 届いた ぶんだけ 高さが 増える。届くたび 寄せ直す。 */
    try {
      Array.prototype.forEach.call(m.querySelectorAll("img"), function (im) {
        if (im.complete) return;
        im.addEventListener("load", 寄せる, { once: true });
        im.addEventListener("error", 寄せる, { once: true });
      });
    } catch (e) {}
  }

  /* ── 描く: 全体 ─────────────────────────────────────────────── */
  function 描く() {
    if (!root) return;
    var w = root.querySelector(".sheet");
    if (!w) return;
    /* 入れ替える 前の 位置を 覚えておく（ついでの 描き直しで 飛ばさない ため）。 */
    var 前 = w.querySelector(".msgs");
    var 覚え = 前 ? { top: 前.scrollTop, 高: 前.scrollHeight, 下端: 下端か(前) } : null;

    w.innerHTML = 左を描く() + 右を描く()
      + (st.盤 ? 盤を描く() : "")
      + (st.窓 ? 窓を描く() : "");

    var m = w.querySelector(".msgs");
    if (m) {
      if (st.上へ足した && 覚え) {
        /* 「前のやりとりを読む」で **上に 足した**。
           そのまま 戻すと 増えた ぶん だけ ずれるので、増えた 高さを 足す
           （いま 読んでいた ところが 動かない）。 */
        貼り付き = false;
        m.scrollTop = 覚え.top + Math.max(0, m.scrollHeight - 覚え.高);
      } else if (st.下へ || !覚え || 覚え.下端) {
        末尾へ(m);
      } else {
        /* 人が 上を 読んでいる。そこへ 戻す。 */
        貼り付き = false;
        m.scrollTop = 覚え.top;
      }
      st.下へ = false;
      st.上へ足した = false;
      /* 自分で 上へ 動かしたら 貼り付きを 外す（絵が 届いても 引きずらない）。 */
      m.addEventListener("scroll", function () { 貼り付き = 下端か(m); }, { passive: true });
    }
  }

  function 左を描く() {
    var h = '<div class="left"><div class="lhead">'
      + '<h2>DM</h2>'
      + '<button class="iconb" data-a="new" aria-label="新しく話しかける" title="新しく話しかける">' + svg("plus") + "</button>"
      + '<button class="iconb" data-a="close" aria-label="閉じる" title="閉じる">' + svg("x") + "</button>"
      + "</div>";
    h += '<div class="sbox">' + svg("search", "i s")
      + '<input data-q type="search" placeholder="名前や @ で探す" value="' + esc(st.さがし) + '" autocomplete="off"></div>';
    h += '<div class="list">';
    if (st.さがし.trim()) {
      h += '<div class="hint">探した人</div>';
      if (!st.候補.length) h += '<div class="empty"><h3>見つかりませんでした</h3><p>ほかの言葉でも探せます。</p></div>';
      for (var i = 0; i < st.候補.length; i++) {
        var c = st.候補[i];
        h += '<button class="row" data-a="startdm" data-uid="' + c.userId + '">' + 顔(c)
          + '<span class="rmid"><span class="rname"><b>' + 名と印(c) + "</b>"
          + (c.isFriend ? '<span class="mutual">相互</span>' : "") + "</span>"
          + '<span class="rlast">@' + esc(c.handle) + "</span></span></button>";
      }
      h += "</div></div>";
      return h;
    }
    if (!st.一覧.length) {
      h += '<div class="empty"><h3>まだ やりとりがありません</h3>'
        + "<p>上の ＋ か 検索から 話しかけられます。<br>相互フォローでない相手へは 3 件までです。</p></div>";
    }
    for (var j = 0; j < st.一覧.length; j++) {
      var t = st.一覧[j], o = t.other || {};
      h += '<button class="row' + (t.id === st.部屋 ? " on" : "") + '" data-a="open" data-tid="' + esc(t.id) + '">'
        + 顔(o)
        + '<span class="rmid"><span class="rname">'
        + (t.pinned ? svg("pin", "i s") : "")
        + "<b>" + 名と印(o) + "</b>"
        + (o.isFriend ? '<span class="mutual">相互</span>' : "")
        + (t.blocked ? '<span class="bk">ブロック中</span>' : "") + "</span>"
        + '<span class="rlast">' + (t.last.mine ? "自分: " : "") + esc(t.last.text || "") + "</span></span>"
        + '<span class="rright"><span class="rtime">' + esc(相対(t.last.ts)) + "</span>"
        + (t.unread ? '<span class="ub">' + (t.unread > 99 ? "99+" : t.unread) + "</span>" : "")
        + "</span></button>";
    }
    return h + "</div></div>";
  }

  function 右を描く() {
    if (!st.部屋) {
      return '<div class="right"><div class="empty" style="margin:auto">'
        + "<h3>やりとりを選んでください</h3><p>左の一覧から選ぶか、＋ で新しく話しかけられます。</p></div></div>";
    }
    var o = st.相手 || {};
    /* ★ 訴え「DM から、アイコンをタップして プロフィールに 飛べるように」。
       アイコンだけだと 押す所が 小さいので、名前まで まとめて 押せるようにする。 */
    var h = '<div class="right"><div class="chead">'
      + '<button class="iconb backb" data-a="back" aria-label="一覧へ戻る">' + svg("back") + "</button>"
      + '<button class="who" data-a="prof" data-uid="' + esc(String(o.userId || "")) + '"'
      + ' aria-label="' + esc(o.displayName || "利用者") + ' さんのプロフィールを見る">'
      + 顔(o) + '<span class="nm"><b>' + 名と印(o) + "</b>"
      + "<span>@" + esc(o.handle || "user") + (o.isFriend ? " ・ 相互フォロー" : "") + "</span></span></button>"
      /* ★ 音声通話（2026-08-29）。**出すか どうかは 見た目の 話**で、
         かけて よいかは サーバ（/api/call/invite）が 決める。
         土台（Cloudflare Realtime）が 無い うちは 出さない（押しても 断られる ため）。 */
      + (window.__vqCallUsable
          ? '<button class="iconb" data-a="call" data-uid="' + esc(String(o.userId || "")) + '"'
            + ' aria-label="' + esc(o.displayName || "利用者") + ' さんに 音声通話を かける">' + svg("phone") + "</button>"
          : "")
      + '<button class="iconb" data-a="tmenu" aria-label="この部屋のメニュー">' + svg("more") + "</button>"
      + '<button class="iconb" data-a="close" aria-label="閉じる">' + svg("x") + "</button>"
      + "</div>";

    var 留 = st.便り.filter(function (m) { return st.ピン.indexOf(m.id) >= 0 && !m.deleted; });
    if (留.length) {
      h += '<div class="pinbar">' + svg("pin", "i s")
        + '<span class="t">' + esc(要約(留[留.length - 1])) + "</span>"
        + '<button class="iconb" data-a="unpin" data-id="' + esc(留[留.length - 1].id) + '" aria-label="ピンを外す">' + svg("x", "i s") + "</button></div>";
    }

    h += '<div class="msgs" data-msgs>';
    if (st.もっと) h += '<button class="btn" data-a="more" style="align-self:center;margin-bottom:10px">前のやりとりを読む</button>';
    var 前 = "";
    for (var i = 0; i < st.便り.length; i++) {
      var m = st.便り[i];
      var k = 日付キー(m.ts);
      if (k !== 前) { h += '<div class="daysep">' + esc(日付の見出し(m.ts)) + "</div>"; 前 = k; }
      h += 便りを描く(m, i);
    }
    h += "</div>";

    h += ブロックを描く();
    h += 上限を描く();
    h += 送る所を描く();
    return h + "</div>";
  }

  function 要約(m) {
    if (!m) return "";
    if (m.deleted) return "送信が取り消されました";
    if (m.kind === "text") return m.body;
    if (m.kind === "sticker") return m.body;
    if (m.kind === "preset") return "プリセット「" + ((m.meta && m.meta.name) || "") + "」";
    return { image: "画像", gif: "GIF", video: "動画", audio: "音声", file: "ファイル" }[m.kind] || "";
  }

  function 便りを描く(m, i) {
    var 私 = m.mine;
    var 既読 = 私 && !m.deleted && st.相手既読 >= m.ts;
    var 引用 = "";
    if (m.replyTo) {
      var 元 = st.便り.filter(function (x) { return x.id === m.replyTo; })[0];
      if (元) 引用 = '<span class="quote">' + esc(要約(元)).slice(0, 120) + "</span>";
    }
    var 中 = "";
    if (m.deleted) 中 = '<span class="mdel">送信が取り消されました</span>';
    else if (m.kind === "sticker") 中 = '<span class="stamp">' + esc(m.body) + "</span>";
    else if (m.kind === "image" || m.kind === "gif")
      中 = '<img class="mimg" src="' + esc(m.mediaUrl) + '" alt="送られた画像" data-a="zoom" data-src="' + esc(m.mediaUrl) + '">';
    else if (m.kind === "video")
      中 = '<video class="mvid" src="' + esc(m.mediaUrl) + '" controls playsinline preload="metadata"></video>';
    else if (m.kind === "audio")
      中 = '<audio class="maud" src="' + esc(m.mediaUrl) + '" controls preload="metadata"></audio>';
    else if (m.kind === "file")
      中 = '<a class="mfile" href="' + esc(m.mediaUrl) + '" target="_blank" rel="noopener">' + svg("file")
        + esc((m.meta && m.meta.name) || "ファイル") + "</a>";
    else if (m.kind === "preset")
      中 = '<span class="mpre">' + svg("grid")
        + '<span class="ttl">' + esc((m.meta && m.meta.name) || "プリセット") + "</span>"
        + '<span class="sub">' + Number((m.meta && m.meta.questionCount) || 0) + " 問</span>"
        + '<button data-a="getpreset" data-id="' + esc(m.id) + '">自分のプリセットへ入れる</button></span>';
    else 中 = '<span class="bub">' + 引用 + esc(m.body) + "</span>";

    if (m.kind !== "text" && !m.deleted && 引用) 中 = '<span class="bub">' + 引用 + "</span>" + 中;

    return '<div class="m ' + (私 ? "me" : "you") + '" data-mid="' + esc(m.id) + '">'
      + 中
      + '<span class="side"><span class="ts">' + esc(時刻(m.ts)) + "</span>"
      + (既読 ? '<span class="read">既読</span>' : "") + "</span>"
      + '<button class="kebab" data-a="mmenu" data-id="' + esc(m.id) + '" aria-label="このメッセージのメニュー">' + svg("more", "i s") + "</button>"
      + "</div>";
  }

  function ブロックを描く() {
    if (!st.ブロック中) return "";
    return '<div class="blockbar">' + svg("ban", "i s")
      + '<span class="t">この相手を ブロックしています。送ることも 受け取ることも できません。</span>'
      + '<button data-a="unblock">解除する</button></div>';
  }

  function 上限を描く() {
    var L = st.上限;
    if (st.ブロック中) return "";
    if (!L || L.mutual) return "";
    if (L.left <= 0) {
      return '<div class="limit ng">送れる数（' + L.max + " 件）を使い切りました。"
        + "相手がフォローを返すと、制限がなくなります。</div>";
    }
    return '<div class="limit">相互フォローではないので あと <b>' + L.left + "</b> 件 送れます"
      + "（" + L.max + " 件まで）。相手がフォローを返すと 無制限になります。</div>";
  }

  function 送る所を描く() {
    var L = st.上限;
    var 止 = !!st.ブロック中 || !!(L && !L.mutual && L.left <= 0);
    var h = '<div class="comp">';
    if (st.返信先) {
      var r = st.便り.filter(function (x) { return x.id === st.返信先; })[0];
      h += '<div class="repbar">' + svg("reply", "i s")
        + '<span class="t">' + esc(要約(r)).slice(0, 90) + "</span>"
        + '<button class="iconb" data-a="unreply" aria-label="返信をやめる">' + svg("x", "i s") + "</button></div>";
    }
    if (st.録音) {
      h += '<div class="rec"><span class="dot"></span>録音しています… ' + st.録音.秒 + " 秒"
        + '<button class="btn" data-a="recstop" style="margin-left:auto">止めて送る</button>'
        + '<button class="btn" data-a="reccancel">やめる</button></div></div>';
      return h;
    }
    /* ★ 並びは Lumi の 下部と 同じ。左に 道具、右に 送る。
       写真 → 音声 → プリセット → 絵文字 の 4 つを ここへ 出す。 */
    h += '<div class="crow">'
      + '<button class="iconb" data-a="pick" aria-label="写真・動画・ファイル" title="写真・動画・ファイル"' + (止 ? " disabled" : "") + ">" + svg("image") + "</button>"
      + '<button class="iconb" data-a="rec" aria-label="音声を録る" title="音声を録る"' + (止 ? " disabled" : "") + ">" + svg("mic") + "</button>"
      + '<button class="iconb" data-a="preset" aria-label="プリセットを送る" title="プリセットを送る"' + (止 ? " disabled" : "") + ">" + svg("grid") + "</button>"
      + '<button class="iconb' + (st.盤 ? " on" : "") + '" data-a="pad" aria-label="絵文字・スタンプ" title="絵文字・スタンプ"' + (止 ? " disabled" : "") + ">" + svg("smile") + "</button>"
      + '<textarea class="ta" data-ta rows="1" placeholder="' + (止 ? "いまは送れません" : "メッセージを書く") + '"' + (止 ? " disabled" : "") + "></textarea>"
      + '<button class="sendb" data-a="send" aria-label="送る"' + (止 ? " disabled" : "") + ">" + svg("send") + "</button>"
      + "</div></div>";
    return h;
  }

  function 盤を描く() {
    var g = スタンプを作る();
    var 組 = g[st.盤の組] || { 名: "", 粒: [] };
    var h = '<div class="pad"><div class="padtabs">';
    for (var i = 0; i < g.length; i++)
      h += '<button data-a="padtab" data-i="' + i + '" class="' + (i === st.盤の組 ? "on" : "") + '">' + esc(g[i].名) + "</button>";
    h += '</div><div class="padgrid">';
    for (var j = 0; j < 組.粒.length; j++)
      h += '<button data-a="stamp" data-s="' + esc(組.粒[j]) + '">' + esc(組.粒[j]) + "</button>";
    h += '</div><div class="padfoot">この端末で使える ' + スタンプの総数() + " 種類"
      + '<button class="btn" data-a="pad" style="margin-left:auto;height:30px">閉じる</button></div></div>';
    return h;
  }

  /* ── 小窓 ───────────────────────────────────────────────────── */
  function 窓を描く() {
    var w = st.窓;
    if (w.種 === "報告") {
      var 理由 = [["spam", "スパム・宣伝"], ["harassment", "いやがらせ・攻撃"],
        ["inappropriate", "不適切な内容"], ["fake", "なりすまし"], ["other", "その他"]];
      var h = '<div class="ovl" data-a="ovl"><div class="card"><h3>報告する</h3>'
        + '<p class="d">やりとりの記録とあわせて運営へ送られます。相手には知らされません。</p><div class="rsn">';
      for (var i = 0; i < 理由.length; i++)
        h += '<label><input type="radio" name="rsn" value="' + 理由[i][0] + '"' + (i === 0 ? " checked" : "") + ">" + esc(理由[i][1]) + "</label>";
      h += '</div><textarea data-note placeholder="くわしく（任意）"></textarea>'
        + '<div class="acts"><button class="btn" data-a="winclose">やめる</button>'
        + '<button class="btn dg" data-a="reportgo">報告する</button></div></div></div>';
      return h;
    }
    if (w.種 === "確かめ") {
      return '<div class="ovl" data-a="ovl"><div class="card"><h3>' + esc(w.題) + "</h3>"
        + '<p class="d">' + esc(w.文) + "</p>"
        + '<div class="acts"><button class="btn" data-a="winclose">やめる</button>'
        + '<button class="btn ' + (w.危 ? "dg" : "pri") + '" data-a="okgo">' + esc(w.ok || "はい") + "</button></div></div></div>";
    }
    if (w.種 === "プリセット") {
      var h2 = '<div class="ovl" data-a="ovl"><div class="card"><h3>送るプリセットを選ぶ</h3>'
        + '<p class="d">中身をそのまま相手へ渡します。相手は自分のプリセットとして取り込めます。</p>';
      if (!w.一覧.length) h2 += '<div class="empty"><h3>プリセットがありません</h3><p>先に作ってから お試しください。</p></div>';
      for (var k = 0; k < w.一覧.length; k++) {
        var p = w.一覧[k];
        h2 += '<button class="row" data-a="sendpreset" data-pi="' + k + '">' + svg("grid")
          + '<span class="rmid"><span class="rname"><b>' + esc(p.name || "名前なし") + "</b></span>"
          + '<span class="rlast">' + (Array.isArray(p.questions) ? p.questions.length : 0) + " 問</span></span></button>";
      }
      h2 += '<div class="acts"><button class="btn" data-a="winclose">閉じる</button></div></div></div>';
      return h2;
    }
    return "";
  }

  function メニューを出す(x, y, 品) {
    閉じるメニュー();
    var d = document.createElement("div");
    d.className = "menu";
    d.innerHTML = 品.map(function (it) {
      return '<button data-a="' + it.a + '"' + (it.id ? ' data-id="' + esc(it.id) + '"' : "")
        + (it.dg ? ' class="dg"' : "") + ">" + svg(it.icon, "i s") + esc(it.t) + "</button>";
    }).join("");
    root.appendChild(d);
    var w = 200, h = 品.length * 40 + 12;
    d.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w + 20)) + "px";
    d.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y + 6)) + "px";
    st.メニュー = d;
  }
  function 閉じるメニュー() { if (st.メニュー) { try { st.メニュー.remove(); } catch (e) {} st.メニュー = null; } }

  /* ── 通信 ───────────────────────────────────────────────────── */
  function 一覧を読む() {
    return api("/api/dm/threads").then(function (j) {
      st.一覧 = j.threads || [];
      st.未読合計 = Number(j.totalUnread || 0);
      印を当てる();
      描く();
    }).catch(function () {});
  }

  function 部屋を開く(tid, 下へ) {
    st.部屋 = tid; st.便り = []; st.返信先 = null; st.盤 = false; st.ブロック中 = false;
    host.setAttribute("data-pane", "chat");
    描く();
    return api("/api/dm/messages?threadId=" + encodeURIComponent(tid)).then(function (j) {
      st.便り = j.messages || [];
      st.もっと = !!j.hasMore;
      st.ピン = j.pinned || [];
      st.相手 = j.other || null;
      st.上限 = j.limit || null;
      st.相手既読 = Number(j.otherReadTs || 0);
      st.ブロック中 = !!j.blocked;
      st.最後 = st.便り.length ? st.便り[st.便り.length - 1].ts : Date.now();
      st.下へ = 下へ !== false;
      描く();
      return 既読にする();
    }).catch(function (e) { 知らせ(e.message || "開けませんでした。"); });
  }

  function 既読にする() {
    if (!st.部屋) return Promise.resolve();
    return api("/api/dm/read", { method: "POST", body: { threadId: st.部屋 } }).then(function () {
      for (var i = 0; i < st.一覧.length; i++) if (st.一覧[i].id === st.部屋) st.一覧[i].unread = 0;
      st.未読合計 = st.一覧.reduce(function (a, b) { return a + (b.unread || 0); }, 0);
      印を当てる(); 描く();
    }).catch(function () {});
  }

  function 送る(payload) {
    if (!st.部屋) return Promise.resolve();
    payload.threadId = st.部屋;
    if (st.返信先) payload.replyTo = st.返信先;
    return api("/api/dm/send", { method: "POST", body: payload }).then(function (j) {
      /* ★ **同じ 便りが 2 つ 出る**（2026-08-29 実測）。
         送りの 返事を 待っている あいだに、3 秒おきの 巡回が
         先に 同じ ものを 拾って 並べる ことが ある。
         重複よけは 巡回の 側にしか 無かったので、ここにも 置く。
         （vqdmui.cjs ⑤⑥ が 同じ id の 吹き出しを 2 つ 見つけて 分かった） */
      if (j.message && !st.便り.some(function (x) { return x.id === j.message.id; })) {
        st.便り.push(j.message);
      }
      st.上限 = j.limit || st.上限;
      st.返信先 = null; st.盤 = false;
      st.最後 = j.message ? j.message.ts : st.最後;
      st.下へ = true;
      描く();
      一覧を読む();
    }).catch(function (e) {
      if (e.code === "DM_LIMIT" && e.data && e.data.limit) st.上限 = e.data.limit;
      if (e.code === "DM_BLOCKED") st.ブロック中 = true;
      描く();
      知らせ(e.message || "送れませんでした。");
    });
  }

  /* 裏に 回った タブは **止める**。表に 戻った ときに すぐ 1 回 見る。
     これが 無いと、開いた ままの タブが 一日中 叩き続ける。 */
  var 裏か = function () { try { return !!document.hidden; } catch (e) { return false; } };
  try {
    document.addEventListener("visibilitychange", function () {
      if (!裏か()) { clearTimeout(st.巡); st.巡 = null; 巡回(true); }
    });
  } catch (e) {}

  function 巡回(いますぐ) {
    if (裏か()) {
      /* 裏の あいだは 叩かない。戻った ときに visibilitychange が 起こす。 */
      clearTimeout(st.巡);
      st.巡 = setTimeout(巡回, 遅い * 5);
      return;
    }
    /* ★ 閉じて いる ときの 取り直しは **代表タブだけ**・**手が 止まったら 休む**
       （2026-09-02）。開いて 読んで いる ときは 何も 変えない。 */
    var Q = window.__vqQuiet;
    if (!st.開いた && Q && (!Q.よいか({}) || Q.待たされているか())) {
      clearTimeout(st.巡);
      st.巡 = setTimeout(巡回, 遅い);
      return;
    }
    var 間 = いますぐ === true ? 60 : (st.開いた ? 早い : 遅い);
    clearTimeout(st.巡);
    st.巡 = setTimeout(function () {
      var q = "/api/dm/sync?since=" + (st.最後 || 0) + (st.部屋 && st.開いた ? "&threadId=" + encodeURIComponent(st.部屋) : "");
      api(q).then(function (j) {
        st.未読合計 = Number(j.totalUnread || 0);
        印を当てる();
        var 変 = false;
        if (st.開いた && st.部屋) {
          var 新 = (j.messages || []).filter(function (m) {
            return !st.便り.some(function (x) { return x.id === m.id; });
          });
          if (新.length) { st.便り = st.便り.concat(新); st.下へ = true; 変 = true; 既読にする(); }
          var r = Number(j.otherReadTs || 0);
          if (r > st.相手既読) { st.相手既読 = r; 変 = true; }
          if (新.length) st.最後 = 新[新.length - 1].ts;
        }
        if (st.開いた && (j.threads || []).length) { 一覧を読む(); 変 = false; }
        if (変) 描く();
      }).catch(function () {}).then(巡回);
    }, 間);
  }

  function 印を当てる() {
    /* 左のサイドパネルの DM に 未読の数を 出す（本体の作りに あわせる） */
    try {
      document.querySelectorAll('[data-vq-dm-badge]').forEach(function (el) {
        el.textContent = st.未読合計 > 99 ? "99+" : String(st.未読合計 || "");
        el.style.display = st.未読合計 ? "" : "none";
      });
    } catch (e) {}
    try { window.__vqDmUnread = st.未読合計; } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent("vq-dm-unread", { detail: { n: st.未読合計 } }));
    } catch (e) {}
  }

  function 知らせ(t) {
    try { if (window.VQ2 && window.VQ2.toast) { window.VQ2.toast(String(t)); return; } } catch (e) {}
    try { if (window.uiToast) { window.uiToast(String(t)); return; } } catch (e) {}
    console.warn("[DM]", t);
  }

  /* ── ファイルを あげる ──────────────────────────────────────── */
  function あげる(file) {
    var h = { "x-file-name": encodeURIComponent(file.name || "file") };
    var t = token(); if (t) h.Authorization = "Bearer " + t;
    if (file.type) h["content-type"] = file.type;
    return fetch("/api/upload/image", { method: "POST", headers: h, body: file, credentials: "same-origin" })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.message || ("HTTP " + r.status)); e.code = j.code; throw e; }
          return j;
        });
      });
  }
  function 種を決める(file, j) {
    var ct = String((j && j.contentType) || file.type || "").toLowerCase();
    if (ct === "image/gif") return "gif";
    if (ct.indexOf("image/") === 0) return "image";
    if (ct.indexOf("video/") === 0) return "video";
    if (ct.indexOf("audio/") === 0 || /\.(mp3|m4a|wav|ogg|webm)$/i.test(file.name || "")) return "audio";
    return "file";
  }
  function ファイルを送る(file) {
    知らせ("送っています…");
    return あげる(file).then(function (j) {
      var url = j.url || j.mediaUrl || j.path || "";
      if (!url) throw new Error("置き場所が返りませんでした。");
      return 送る({ kind: 種を決める(file, j), mediaUrl: url,
        meta: { name: String(file.name || ""), bytes: Number(file.size || 0) } });
    }).catch(function (e) { 知らせ(e.message || "送れませんでした。"); });
  }

  function ファイルを選ぶ() {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*,video/*,audio/*,.pdf,.zip,.txt,.csv,.md,.json";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (f) ファイルを送る(f);
    });
    inp.click();
  }

  /* ── 音声を 録る ────────────────────────────────────────────── */
  function 録音を始める() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { 知らせ("この端末では 音声を録れません。"); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var 型 = ["audio/mp4", "audio/webm", "audio/ogg"].filter(function (t) {
        try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; }
      })[0] || "";
      var rec = new MediaRecorder(stream, 型 ? { mimeType: 型 } : undefined);
      var 粒 = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) 粒.push(e.data); };
      rec.onstop = function () {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        var やめた = st.録音 && st.録音.やめた;
        var 秒 = st.録音 ? st.録音.秒 : 0;
        clearInterval(st.録音 && st.録音.時計);
        st.録音 = null; 描く();
        if (やめた || !粒.length) return;
        var b = new Blob(粒, { type: 型 || "audio/webm" });
        var 拡 = 型.indexOf("mp4") >= 0 ? "m4a" : 型.indexOf("ogg") >= 0 ? "ogg" : "webm";
        var f = new File([b], "voice-" + Date.now() + "." + 拡, { type: b.type });
        f.秒 = 秒;
        ファイルを送る(f);
      };
      st.録音 = { rec: rec, 秒: 0, やめた: false, 時計: setInterval(function () {
        if (!st.録音) return;
        st.録音.秒++;
        if (st.録音.秒 >= 180) { st.録音.rec.stop(); return; }
        var el = root.querySelector(".rec");
        if (el) el.childNodes[1].nodeValue = "録音しています… " + st.録音.秒 + " 秒";
      }, 1000) };
      rec.start();
      描く();
    }).catch(function () { 知らせ("マイクを使えませんでした。"); });
  }

  /* ── プリセット ─────────────────────────────────────────────── */
  function 自分のプリセット() {
    var 出 = [];
    try {
      if (window.VQ2 && window.VQ2.presets && typeof window.VQ2.presets.一覧 === "function")
        出 = window.VQ2.presets.一覧() || [];
    } catch (e) {}
    if (!出.length) {
      try {
        var raw = localStorage.getItem("vq_presets_v1") || localStorage.getItem("vq.presets.v1");
        var j = raw ? JSON.parse(raw) : null;
        if (Array.isArray(j)) 出 = j;
        else if (j && Array.isArray(j.list)) 出 = j.list;
        else if (j && typeof j === "object") 出 = Object.keys(j).map(function (k) { return j[k]; });
      } catch (e) {}
    }
    return (出 || []).filter(function (p) { return p && typeof p === "object"; }).slice(0, 60);
  }
  function プリセットを取り込む(mid) {
    api("/api/dm/preset?messageId=" + encodeURIComponent(mid)).then(function (j) {
      var p = j.preset;
      var 入れた = false;
      try {
        if (window.VQ2 && window.VQ2.presets && typeof window.VQ2.presets.取り込む === "function") {
          window.VQ2.presets.取り込む(p); 入れた = true;
        }
      } catch (e) {}
      if (!入れた) {
        try {
          window.__vqPresetSource = p;
          if (window.VQ2 && window.VQ2.presets && typeof window.VQ2.presets.追加 === "function") {
            window.VQ2.presets.追加(p); 入れた = true;
          }
        } catch (e) {}
      }
      知らせ(入れた ? "自分のプリセットへ入れました。" : "取り込み口が見つかりませんでした。プリセット画面から読み込んでください。");
    }).catch(function (e) { 知らせ(e.message || "取り込めませんでした。"); });
  }

  /* ── 操作 ───────────────────────────────────────────────────── */
  function つなぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && el.dataset.a)) el = el.parentNode;
      if (!el || el === root) { 閉じるメニュー(); return; }
      var a = el.dataset.a;
      if (a !== "mmenu" && a !== "tmenu") 閉じるメニュー();

      if (a === "close") { 閉じる(); return; }
      if (a === "back") { st.部屋 = ""; host.setAttribute("data-pane", "list"); 描く(); return; }
      if (a === "open") { 部屋を開く(el.dataset.tid); return; }
      if (a === "new") { var q = root.querySelector("[data-q]"); if (q) q.focus(); return; }
      if (a === "startdm") { 話しかける(Number(el.dataset.uid)); return; }
      if (a === "more") { もっと読む(); return; }
      if (a === "send") { 文を送る(); return; }
      if (a === "pad") { st.盤 = !st.盤; 描く(); return; }
      if (a === "padtab") { st.盤の組 = Number(el.dataset.i) || 0; 描く(); return; }
      if (a === "stamp") { 送る({ kind: "sticker", body: el.dataset.s }); return; }
      if (a === "pick") { ファイルを選ぶ(); return; }
      if (a === "rec") { 録音を始める(); return; }
      if (a === "recstop") { if (st.録音) st.録音.rec.stop(); return; }
      if (a === "reccancel") { if (st.録音) { st.録音.やめた = true; st.録音.rec.stop(); } return; }
      if (a === "unreply") { st.返信先 = null; 描く(); return; }
      if (a === "unpin") { ピン(el.dataset.id, false); return; }
      if (a === "getpreset") { プリセットを取り込む(el.dataset.id); return; }
      if (a === "preset") { st.窓 = { 種: "プリセット", 一覧: 自分のプリセット() }; 描く(); return; }
      if (a === "sendpreset") {
        var p = st.窓 && st.窓.一覧[Number(el.dataset.pi)];
        st.窓 = null;
        if (p) 送る({ kind: "preset", preset: p });
        else 描く();
        return;
      }
      if (a === "winclose" || a === "ovl") {
        if (a === "ovl" && e.target !== el) return;
        st.窓 = null; 描く(); return;
      }
      if (a === "okgo") { var w = st.窓; st.窓 = null; 描く(); if (w && w.して) w.して(); return; }
      if (a === "reportgo") { 報告を送る(); return; }
      if (a === "zoom") { 大きく(el.dataset.src); return; }
      if (a === "mmenu") { 便りのメニュー(el, e); return; }
      if (a === "tmenu") { 部屋のメニュー(el, e); return; }
      if (a === "reply") { st.返信先 = el.dataset.id; 描く(); var t = root.querySelector("[data-ta]"); if (t) t.focus(); return; }
      if (a === "pinon") { ピン(el.dataset.id, true); return; }
      if (a === "pinoff") { ピン(el.dataset.id, false); return; }
      if (a === "copy") { 写す(el.dataset.id); return; }
      if (a === "del") { 消す(el.dataset.id); return; }
      if (a === "report") { st.窓 = { 種: "報告", mid: el.dataset.id || "" }; 描く(); return; }
      if (a === "tpin") { 部屋の状態({ pinned: !現在の部屋().pinned }); return; }
      if (a === "tmute") { 部屋の状態({ muted: !現在の部屋().muted }); return; }
      if (a === "thide") { 部屋の状態({ hidden: true }); st.部屋 = ""; host.setAttribute("data-pane", "list"); return; }
      if (a === "call") { 通話をかける(el.dataset.uid); return; }
      if (a === "prof") { プロフィールへ(el.dataset.uid || el.dataset.id); return; }
      if (a === "tblock") { ブロックする(true); return; }
      if (a === "unblock") { ブロックする(false); return; }
    });

    root.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.q !== undefined) { さがす(String(t.value || "")); return; }
      if (t && t.dataset && t.dataset.ta !== undefined) {
        t.style.height = "auto";
        t.style.height = Math.min(132, t.scrollHeight) + "px";
      }
    });
    root.addEventListener("keydown", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.ta !== undefined && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault(); 文を送る();
      }
    });
    document.addEventListener("keydown", function (e) {
      if (!st.開いた) return;
      if (e.key !== "Escape") return;
      if (st.窓) { st.窓 = null; 描く(); return; }
      if (st.メニュー) { 閉じるメニュー(); return; }
      if (st.盤) { st.盤 = false; 描く(); return; }
      閉じる();
    });
  }

  function 現在の部屋() {
    return st.一覧.filter(function (t) { return t.id === st.部屋; })[0] || {};
  }

  function 文を送る() {
    var t = root.querySelector("[data-ta]");
    if (!t) return;
    var v = String(t.value || "").trim();
    if (!v) return;
    t.value = ""; t.style.height = "auto";
    送る({ kind: "text", body: v });
  }

  var さがしの時計 = 0;
  function さがす(q) {
    st.さがし = q;
    clearTimeout(さがしの時計);
    if (!q.trim()) { st.候補 = []; 描く(); return; }
    さがしの時計 = setTimeout(function () {
      api("/api/groups/user-search?q=" + encodeURIComponent(q) + "&limit=12").then(function (j) {
        st.候補 = j.users || [];
        描く();
        var i = root.querySelector("[data-q]");
        if (i && document.activeElement !== host) { try { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } catch (e) {} }
      }).catch(function () {});
    }, 240);
  }

  function 話しかける(uid) {
    if (!uid) return;
    api("/api/dm/open", { method: "POST", body: { userId: uid } }).then(function (j) {
      st.さがし = ""; st.候補 = [];
      return 一覧を読む().then(function () { return 部屋を開く(j.threadId); });
    }).catch(function (e) { 知らせ(e.message || "開けませんでした。"); });
  }

  function もっと読む() {
    if (!st.便り.length) return;
    var before = st.便り[0].ts;
    api("/api/dm/messages?threadId=" + encodeURIComponent(st.部屋) + "&before=" + before).then(function (j) {
      st.便り = (j.messages || []).concat(st.便り);
      st.もっと = !!j.hasMore;
      /* ★ 上に 足したので、いま 読んでいる ところを 動かさない（下へ 飛ばさない）。 */
      st.上へ足した = true;
      描く();
    }).catch(function () {});
  }

  function 便りのメニュー(el, e) {
    var id = el.dataset.id;
    var m = st.便り.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var 品 = [{ a: "reply", icon: "reply", t: "返信する", id: id }];
    if (st.ピン.indexOf(id) >= 0) 品.push({ a: "pinoff", icon: "pin", t: "ピンを外す", id: id });
    else 品.push({ a: "pinon", icon: "pin", t: "ピン留めする", id: id });
    if (m.kind === "text") 品.push({ a: "copy", icon: "file", t: "文をうつす", id: id });
    if (m.mine && !m.deleted) 品.push({ a: "del", icon: "trash", t: "送信を取り消す", id: id, dg: true });
    if (!m.mine) 品.push({ a: "report", icon: "flag", t: "報告する", id: id, dg: true });
    var r = el.getBoundingClientRect();
    メニューを出す(r.right, r.bottom, 品);
  }

  function 部屋のメニュー(el, e) {
    var t = 現在の部屋();
    var 品 = [
      { a: "prof", icon: "person", t: "プロフィールを見る", id: String((st.相手 && st.相手.userId) || "") },
      { a: "tpin", icon: "pin", t: t.pinned ? "一覧のピンを外す" : "一覧の上に固定" },
      /* ミュート = 知らせだけ 止める。やりとりは 残る。 */
      { a: "tmute", icon: t.muted ? "bellOff" : "bell", t: t.muted ? "知らせを受け取る" : "知らせを止める（ミュート）" },
      /* ブロック = 送受信ごと 止める。相手には 知らせない。 */
      st.ブロック中
        ? { a: "unblock", icon: "ban", t: "ブロックを解除する" }
        : { a: "tblock", icon: "ban", t: "この相手をブロックする", dg: true },
      { a: "report", icon: "flag", t: "この相手を報告する", dg: true },
      { a: "thide", icon: "trash", t: "一覧から消す", dg: true }
    ];
    var r = el.getBoundingClientRect();
    メニューを出す(r.right, r.bottom, 品);
  }

  /* 相手の プロフィールへ。DM は 閉じてから 開く（重ねない）。 */
  function プロフィールへ(uid) {
    var id = String(uid || (st.相手 && st.相手.userId) || "").trim();
    if (!id) { 知らせ("この相手の プロフィールが 分かりませんでした。"); return; }
    閉じる();
    try {
      if (window.__vqOpenProfile) { window.__vqOpenProfile(id); return; }
    } catch (e) {}
    try { location.href = location.pathname + "?u=" + encodeURIComponent(id); } catch (e2) {}
  }

  function ブロックする(on) {
    if (!st.部屋) return;
    if (on) {
      st.窓 = { 種: "確かめ", 題: "この相手を ブロックしますか", ok: "ブロックする", 危: true,
        文: "送ることも 受け取ることも できなくなります。相手には 知らされません。いつでも 解除できます。",
        して: function () { ブロックを送る(true); } };
      描く();
      return;
    }
    ブロックを送る(false);
  }
  function ブロックを送る(on) {
    api("/api/dm/block", { method: "POST", body: { threadId: st.部屋, on: !!on } })
      .then(function (j) {
        st.ブロック中 = !!j.blocked;
        知らせ(st.ブロック中 ? "ブロックしました。" : "ブロックを解除しました。");
        描く();
        一覧を読む();
      })
      .catch(function (e) { 知らせ(e.message || "できませんでした。"); });
  }

  function ピン(id, on) {
    api("/api/dm/pin", { method: "POST", body: { threadId: st.部屋, messageId: id, on: !!on } })
      .then(function (j) { st.ピン = j.pinned || []; 描く(); })
      .catch(function (e) { 知らせ(e.message || "できませんでした。"); });
  }
  function 部屋の状態(o) {
    o.threadId = st.部屋;
    api("/api/dm/thread", { method: "POST", body: o })
      .then(function () { return 一覧を読む(); })
      .catch(function (e) { 知らせ(e.message || "できませんでした。"); });
  }
  function 写す(id) {
    var m = st.便り.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    try { navigator.clipboard.writeText(m.body || ""); 知らせ("うつしました。"); }
    catch (e) { 知らせ("うつせませんでした。"); }
  }
  function 消す(id) {
    st.窓 = { 種: "確かめ", 題: "送信を取り消しますか", ok: "取り消す", 危: true,
      文: "相手の画面からも消えます。取り消しても、送れる数は戻りません。",
      して: function () {
        api("/api/dm/delete", { method: "POST", body: { messageId: id } }).then(function () {
          for (var i = 0; i < st.便り.length; i++)
            if (st.便り[i].id === id) { st.便り[i].deleted = true; st.便り[i].kind = "deleted"; }
          描く(); 一覧を読む();
        }).catch(function (e) { 知らせ(e.message || "消せませんでした。"); });
      } };
    描く();
  }
  function 報告を送る() {
    var r = root.querySelector('input[name="rsn"]:checked');
    var n = root.querySelector("[data-note]");
    var mid = (st.窓 && st.窓.mid) || "";
    api("/api/dm/report", { method: "POST", body: {
      threadId: st.部屋, messageId: mid,
      reason: r ? r.value : "other", note: n ? String(n.value || "") : ""
    } }).then(function () { st.窓 = null; 描く(); 知らせ("報告しました。ありがとうございます。"); })
      .catch(function (e) { 知らせ(e.message || "送れませんでした。"); });
  }
  function 大きく(src) {
    if (!src) return;
    var o = document.createElement("div");
    o.className = "ovl";
    o.innerHTML = '<img src="' + esc(src) + '" style="max-width:94%;max-height:90%;border-radius:14px" alt="">';
    o.addEventListener("click", function () { try { o.remove(); } catch (e) {} });
    root.appendChild(o);
  }

  /* ── 開け閉め ───────────────────────────────────────────────── */
  function 開く(tid) {
    建てる();
    st.開いた = true;
    host.setAttribute("data-open", "1");
    host.setAttribute("data-pane", tid ? "chat" : "list");
    描く();
    一覧を読む().then(function () {
      if (tid) 部屋を開く(tid);
      else if (!st.部屋 && st.一覧.length && window.innerWidth > 820) 部屋を開く(st.一覧[0].id);
    });
    巡回();
  }
  function 閉じる() {
    st.開いた = false;
    if (host) host.setAttribute("data-open", "0");
    閉じるメニュー();
    巡回();
  }

  /* 通話が 使えると 分かったら、開いている 部屋を 描き直して 受話器を 出す。 */
  window.addEventListener("vq-call-ready", function () {
    if (st.開いた && st.部屋) 描く();
  });

  /* 音声通話。vq-call が まだ 来ていなければ 待って 呼ぶ。 */
  function 通話をかける(uid) {
    var id = Number(uid || 0);
    if (!id) return;
    var 呼ぶ = function () {
      if (window.__vqCall && window.__vqCall.かける) { window.__vqCall.かける(id); return true; }
      return false;
    };
    if (呼ぶ()) return;
    var n = 0;
    var t = setInterval(function () {
      if (呼ぶ() || ++n > 20) clearInterval(t);
    }, 250);
  }

  /* ── 外へ出す口 ─────────────────────────────────────────────── */
  window.__vqOpenDM = function (tid) { 開く(tid || ""); };
  window.__vqDM = {
    開く: 開く, 閉じる: 閉じる,
    未読: function () { return st.未読合計; },
    状態: function () { return { 開いた: st.開いた, 部屋: st.部屋, 便り: st.便り.length, 上限: st.上限 }; },
    スタンプ数: スタンプの総数,
    背景の名: function () { return 背景の名.slice(); },
    背景: function (v) {
      if (v === undefined) return いまの背景();
      if (背景の名.indexOf(String(v)) < 0) return いまの背景();
      try { localStorage.setItem("vq.dm.bg", String(v)); } catch (e) {}
      try { if (window.__vqSet && window.__vqSet.set) window.__vqSet.set("display.dmBackground", String(v)); } catch (e2) {}
      背景を当てる();
      return String(v);
    }
  };

  /* 起動: 左の印のためだけに ゆっくり見に行く（開いていなくても 未読は出す） */
  function boot() {
    if (!token()) { setTimeout(boot, 4000); return; }
    api("/api/dm/sync?since=0").then(function (j) {
      st.未読合計 = Number(j.totalUnread || 0); 印を当てる();
    }).catch(function () {});
    巡回();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
