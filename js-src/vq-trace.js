/* ══════════════════════════════════════════════════════════════════════════
   vq-trace — 行動の 記録（2026-09-01・訴え）

   訴え:「行動パターンを 記録する ために、いつ 何を 開いて どの 問題まで 行って
         解答変更 何回した か、とか、どの 選択肢を 選んだ か、とか、
         何を プリセットで 作ったり、AI に 投げた か、どの ボタンを 押してた かまで
         記録して ほしい。細かい ところまで。」

   何のため:
     1 時間ごとに Lumi（Live）が これを 読んで、傾向を つかんで 一言 添える。
     苦手を 補う プリセットの 提案も ここから 作る。

   決めた こと（守る）:
     ★ **端末の 中だけ**に 置く。送るのは「まとめ」だけで、生の 行は 送らない。
       （何を 押したかの 列を そのまま 外へ 出す 必要は ない）
     ★ **書いた 中身は 頭だけ**（プロンプトは 120 字まで）。全文は 持たない。
     ★ **パスワード・暗証番号の 欄は 触らない**（type=password は 記録しない）。
     ★ 上限 4,000 行。古い ものから 落ちる。localStorage を 溢れさせない。
     ★ 記録は **人が 切れる**（設定 → データ → 行動の記録）。切ったら 1 行も 取らない。

   1 行の 形:
     { t: いつ(ms), k: 種類, a: 何を, v: 値, n: 数, m: 補足 }
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqTraceInstalled) return;
  window.__vqTraceInstalled = true;

  var doc = document;
  var KEY = "vq.trace.v1";
  var 切KEY = "vq.trace.off.v1";
  var 上限 = 4000;
  var 溜め = [];
  var 書く待ち = 0;

  function 切れてるか() {
    try { return localStorage.getItem(切KEY) === "1"; } catch (e) { return false; }
  }
  function 全部() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function 流す() {
    if (!溜め.length) return;
    var 並 = 全部().concat(溜め);
    溜め = [];
    if (並.length > 上限) 並 = 並.slice(-上限);
    try { localStorage.setItem(KEY, JSON.stringify(並)); } catch (e) {
      /* 溢れたら 半分 捨てて もう一度（黙って 全部 消さない）。 */
      try { localStorage.setItem(KEY, JSON.stringify(並.slice(-Math.floor(上限 / 2)))); } catch (e2) {}
    }
  }
  /* 1 コマに 何度 呼ばれても 書き込みは 1 回（打つたびに 保存しない）。 */
  function 予約() {
    if (書く待ち) return;
    書く待ち = setTimeout(function () { 書く待ち = 0; 流す(); }, 800);
  }

  function 短(s, n) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n || 60); }

  /* ══ 記す（外からも 呼べる）════════════════════════════════════════ */
  function 記す(k, a, o) {
    if (切れてるか()) return;
    o = o || {};
    var r = { t: Date.now(), k: String(k || ""), a: 短(a, 60) };
    if (o.v !== undefined) r.v = 短(o.v, 120);
    if (o.n !== undefined && isFinite(o.n)) r.n = Number(o.n);
    if (o.m !== undefined) r.m = 短(o.m, 80);
    溜め.push(r);
    予約();
    return r;
  }

  /* ══ 自動で 拾う ═══════════════════════════════════════════════════ */
  /* ① どの 画面を 開いたか。body の data-app-tab を 見張る。 */
  var 前のタブ = "";
  function タブを見る() {
    var t = "";
    try { t = doc.body.getAttribute("data-app-tab") || ""; } catch (e) {}
    if (t && t !== 前のタブ) {
      記す("screen", t, { m: 前のタブ ? ("← " + 前のタブ) : "" });
      前のタブ = t;
    }
  }

  /* ② どの ボタンを 押したか。**影の DOM の 中も 拾う**（composed）。
     ★ 押した ものの「名前」は data-* か aria-label か 見えている 文字。
       中身の 文まで は 取らない（長いし 要らない）。 */
  function 押しどころ(e) {
    var path = (e.composedPath && e.composedPath()) || [e.target];
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el || !el.getAttribute) continue;
      var tag = String(el.tagName || "").toLowerCase();
      if (tag === "button" || tag === "a" || el.getAttribute("role") === "button"
        || el.hasAttribute("data-a") || el.hasAttribute("data-click")) return el;
      if (i > 6) break;
    }
    return null;
  }
  function 名前(el) {
    var d = el.dataset || {};
    var 印 = d.a || d.click || d.appTab || d.navTab || d.presetStart || d.presetSelect
      || d.examOpen || d.fn || d.tab || "";
    if (印) return String(印);
    var lab = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    if (lab) return 短(lab, 40);
    return 短(el.textContent, 40);
  }
  function 押した(e) {
    if (切れてるか()) return;
    var el = 押しどころ(e);
    if (!el) return;
    /* パスワードの 近くは 触らない。 */
    try { if (el.closest && el.closest("input[type=password]")) return; } catch (x) {}
    var 名 = 名前(el);
    if (!名) return;
    記す("tap", 名, { m: (doc.body && doc.body.getAttribute("data-app-tab")) || "" });
  }

  /* ③ 何を AI に 投げたか。**頭だけ**。 */
  function AIへ(何, 文, 追) {
    記す("ai", 何, { v: 短(文, 120), m: 追 });
  }

  /* ④ 解いて いる ときの こまかい 記録。
     ・どの 問題まで 行ったか（index）
     ・どの 選択肢を 選んだか
     ・**答えを 変えた 回数** */
  var 解答の変え = Object.create(null);
  function 解いた(o) {
    o = o || {};
    var id = String(o.questionId || "");
    if (id) {
      if (解答の変え[id] === undefined) 解答の変え[id] = 0;
      else 解答の変え[id]++;
    }
    記す("answer", String(o.presetId || ""), {
      v: 短(o.choice, 40),
      n: Number(o.index) || 0,
      m: (o.correct === true ? "○" : o.correct === false ? "×" : "")
        + (id && 解答の変え[id] ? " 直し" + 解答の変え[id] : "")
    });
  }

  /* ══ まとめ（サーバへ 送る のは これだけ）════════════════════════════
     ★ 生の 行は 送らない。**数と 傾向**に して から 送る。 */
  function まとめ(時間) {
    var 幅 = Math.max(1, Number(時間) || 24) * 3600000;
    var 今 = Date.now();
    var 並 = 全部().filter(function (r) { return r && (今 - r.t) <= 幅; });
    var 画面 = {}, 押 = {}, AI = [], 答 = { 数: 0, 正: 0, 誤: 0, 直し: 0 };
    var 時刻 = {};              /* 何時台に 何回 動いたか */
    var プリセット = {};
    並.forEach(function (r) {
      var h = new Date(r.t).getHours();
      時刻[h] = (時刻[h] || 0) + 1;
      if (r.k === "screen") 画面[r.a] = (画面[r.a] || 0) + 1;
      else if (r.k === "tap") 押[r.a] = (押[r.a] || 0) + 1;
      else if (r.k === "ai") { if (AI.length < 12) AI.push({ 何: r.a, 頭: r.v || "" }); }
      else if (r.k === "answer") {
        答.数++;
        if (String(r.m || "").indexOf("○") === 0) 答.正++;
        else if (String(r.m || "").indexOf("×") === 0) 答.誤++;
        if (/直し(\d+)/.test(String(r.m || ""))) 答.直し++;
        if (r.a) プリセット[r.a] = (プリセット[r.a] || 0) + 1;
      }
    });
    var 上位 = function (o, n) {
      return Object.keys(o).map(function (k) { return { 名: k, 回: o[k] }; })
        .sort(function (a, b) { return b.回 - a.回; }).slice(0, n || 8);
    };
    return {
      期間時間: Math.round(幅 / 3600000),
      行数: 並.length,
      画面: 上位(画面, 8),
      よく押す: 上位(押, 12),
      AIに投げた: AI,
      解答: 答,
      よく解くプリセット: 上位(プリセット, 6),
      時間帯: Object.keys(時刻).map(function (h) { return { 時: Number(h), 回: 時刻[h] }; })
        .sort(function (a, b) { return a.時 - b.時; })
    };
  }

  /* ══ 取り付け ═══════════════════════════════════════════════════════ */
  try {
    doc.addEventListener("click", 押した, true);
    /* 画面の 切り替えは body の 印で 分かる。 */
    タブを見る();
    new MutationObserver(タブを見る).observe(doc.body, { attributes: true, attributeFilter: ["data-app-tab"] });
  } catch (e) {}
  /* 閉じる ときに 取りこぼさない。 */
  try {
    window.addEventListener("pagehide", 流す);
    doc.addEventListener("visibilitychange", function () { if (doc.hidden) 流す(); });
  } catch (e) {}

  window.__vqTrace = {
    記す: 記す, AIへ: AIへ, 解いた: 解いた, まとめ: まとめ,
    全部: 全部,
    件数: function () { return 全部().length + 溜め.length; },
    流す: 流す,
    消す: function () { 溜め = []; try { localStorage.removeItem(KEY); } catch (e) {} },
    切る: function (on) {
      try { if (on) localStorage.setItem(切KEY, "1"); else localStorage.removeItem(切KEY); } catch (e) {}
      if (on) { 溜め = []; }
    },
    切れてるか: 切れてるか
  };
})();
