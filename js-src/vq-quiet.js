/* ══════════════════════════════════════════════════════════════════════════
   vq-quiet — 裏の 定期通信を **要るときだけ** にする 共通の 仕掛け（2026-09-02）

   なぜ 要るのか（実測）:
     2026-09-01 の 夜、本番が 351,226 回で 止まり、翌朝 9 時まで 全員が
     開けなく なった。中身を 追うと、**この 家の 3 台**が その 時間の
     98% を 出して いた。人が 操作して いたのでは なく、
     **開きっぱなしの タブが 叩き続けて いた**。

   3 つ だけ 決める:
     ① 裏の タブは 何も しない（document.hidden）
     ② 同じ 人が 何枚 開いても **叩くのは 1 枚だけ**（代表タブ）
     ③ 手が 15 分 止まったら 休む。触ったら すぐ 起きる

   ①だけでは 足りない。iPhone は タブを 表に したまま 置く ことが 多く、
   パソコンは 何枚も 開く。②と③が 無いと 「開いて いる だけ」で 減らない。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  if (root.__vqQuiet) return;

  var 鍵 = "vq.quiet.leader.v1";
  var 私 = String(Date.now() % 1e7) + "." + Math.random().toString(36).slice(2, 8);
  var 休むまで = 15 * 60 * 1000;     /* 手が 止まってから 休むまで */
  var 名乗る間 = 4000;               /* 代表の 更新 */
  var 見限る = 11000;                /* この 秒 数 返事が 無ければ 代表を 取る */
  var 最後に触った = Date.now();

  function 読む() {
    try { return JSON.parse(root.localStorage.getItem(鍵) || "null"); } catch (e) { return null; }
  }
  function 書く(v) {
    try { root.localStorage.setItem(鍵, JSON.stringify(v)); } catch (e) {}
  }
  /* 代表か どうか。**空いて いれば 名乗る**。 */
  function 代表か() {
    var now = Date.now();
    var v = 読む();
    if (!v || typeof v !== "object") { 書く({ id: 私, t: now }); return true; }
    if (v.id === 私) { 書く({ id: 私, t: now }); return true; }
    if (now - (v.t || 0) > 見限る) { 書く({ id: 私, t: now }); return true; }
    return false;
  }
  /* 代表で いる あいだ、生きて いる ことを 書き続ける */
  setInterval(function () {
    if (root.document && root.document.hidden) return;
    var v = 読む();
    if (v && v.id === 私) 書く({ id: 私, t: Date.now() });
  }, 名乗る間);

  ["pointerdown", "keydown", "touchstart", "wheel"].forEach(function (e) {
    try { root.addEventListener(e, function () { 最後に触った = Date.now(); }, { passive: true }); } catch (x) {}
  });
  try {
    root.document.addEventListener("visibilitychange", function () {
      if (!root.document.hidden) 最後に触った = Date.now();
    });
  } catch (e) {}

  /**
   * 裏の 定期通信を 出して いいか。
   * @param {{代表だけ?:boolean, 休まない?:boolean}} o
   */
  function よいか(o) {
    o = o || {};
    try { if (root.document && root.document.hidden) return false; } catch (e) {}
    if (o.休まない !== true && Date.now() - 最後に触った > 休むまで) return false;
    if (o.代表だけ === false) return true;
    return 代表か();
  }

  /* サーバが 429 と Retry-After を 返したら、その間は 何も 出さない。 */
  var 待て = 0;
  function 待たされているか() { return Date.now() < 待て; }
  function 待たされた(秒) { 待て = Date.now() + Math.max(5, Math.min(900, 秒 || 60)) * 1000; }

  root.__vqQuiet = {
    よいか: よいか,
    代表か: 代表か,
    暇か: function () { return Date.now() - 最後に触った > 休むまで; },
    待たされているか: 待たされているか,
    待たされた: 待たされた,
    /* fetch の 返事を 見て、429 なら 自動で 休む */
    見る: function (r) {
      try {
        if (r && r.status === 429) {
          var a = Number(r.headers && r.headers.get && r.headers.get("Retry-After"));
          待たされた(a || 60);
          return true;
        }
      } catch (e) {}
      return false;
    },
    /* 検査用 */
    __私: 私,
    __触った: function () { 最後に触った = Date.now(); },
    __放置: function () { 最後に触った = 0; }
  };
})(typeof window !== "undefined" ? window : this);
