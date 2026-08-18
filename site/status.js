/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz 公式サイト — 稼働状況（段E・2026-08-18）

   ★ 決めごと
     ・状態は **色だけで伝えない**。文字も必ず出す（色が見えない人がいる）。
     ・数は 1 回だけ数え上げる（600ms）。何度も動かさない。
     ・60 秒ごとに取り直す。**画面を開いている間だけ**。
     ・取れなかったら「取得できませんでした」と出す。**黙って隠さない。**
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var 枠 = document.getElementById("status");
  if (!枠) return;

  var 札 = document.getElementById("statusPill");
  var 文 = document.getElementById("statusText");
  var 印 = document.getElementById("statusMark");
  var 時 = document.getElementById("statusUpdated");
  var 稼働 = document.getElementById("statusUptime");
  var 生成 = document.getElementById("statusGen");
  var 応答 = document.getElementById("statusLatency");

  var 動きを減らす = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var 状態の文 = {
    operational: "正常に動作しています",
    degraded: "一部で遅くなっています",
    outage: "障害が発生しています"
  };
  /* ★ 色に頼らないための形。正常＝チェック、低速＝！、障害＝× */
  var 状態の印 = {
    operational: "M5 8.2l2.2 2.2L11 6.6",
    degraded: "M8 5v4M8 11.2v.1",
    outage: "M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
  };

  /* 数え上げ。1 回きり・600ms（指示書） */
  function 数える(箱, 目標, 単位, 小数) {
    if (目標 === null || 目標 === undefined) {
      箱.innerHTML = '<span class="status__none">まだ出せません</span>';
      return;
    }
    var 出す = function (v) {
      箱.innerHTML = '<span class="status__value">'
        + (小数 ? v.toFixed(1) : Math.round(v).toLocaleString("ja-JP"))
        + '</span><span class="status__unit">' + 単位 + "</span>";
    };
    if (動きを減らす) { 出す(目標); return; }
    var 始 = null, 長さ = 600;
    var 進む = function (t) {
      if (始 === null) 始 = t;
      var p = Math.min(1, (t - 始) / 長さ);
      /* ease-out */
      出す(目標 * (1 - Math.pow(1 - p, 3)));
      if (p < 1) window.requestAnimationFrame(進む);
      else 出す(目標);
    };
    window.requestAnimationFrame(進む);
  }

  var 一度数えた = false;

  function 出す(d) {
    var st = d && d.state;
    if (!状態の文[st]) st = "unknown";
    札.setAttribute("data-state", st);
    文.textContent = 状態の文[st] || "状態を確認できません";
    if (印 && 状態の印[st]) 印.setAttribute("d", 状態の印[st]);

    if (d && d.updated_at) {
      var dt = new Date(d.updated_at);
      時.textContent = isNaN(dt.getTime()) ? ""
        : "最終更新 " + dt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    }

    if (!一度数えた) {
      一度数えた = true;
      数える(稼働, d.uptime_24h, "%", true);
      数える(生成, d.generations_today, "件", false);
      数える(応答, d.avg_latency_ms === null ? null : d.avg_latency_ms / 1000, "秒", true);
    } else {
      /* 2 回目以降は数え上げない（動きは 1 回だけ） */
      var 置く = function (箱, v, 単位, 小数) {
        if (v === null || v === undefined) { 箱.innerHTML = '<span class="status__none">まだ出せません</span>'; return; }
        箱.innerHTML = '<span class="status__value">'
          + (小数 ? Number(v).toFixed(1) : Math.round(v).toLocaleString("ja-JP"))
          + '</span><span class="status__unit">' + 単位 + "</span>";
      };
      置く(稼働, d.uptime_24h, "%", true);
      置く(生成, d.generations_today, "件", false);
      置く(応答, d.avg_latency_ms === null ? null : d.avg_latency_ms / 1000, "秒", true);
    }
  }

  function 失敗(理由) {
    /* ★ 握りつぶさない。取れなかったことをそのまま出す。 */
    札.setAttribute("data-state", "unknown");
    文.textContent = "取得できませんでした";
    時.textContent = 理由 ? "（" + 理由 + "）" : "";
    [稼働, 生成, 応答].forEach(function (箱) {
      箱.innerHTML = '<span class="status__none">取得できませんでした</span>';
    });
  }

  function 取りに行く() {
    fetch("/api/status", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(出す)
      .catch(function (e) { 失敗(String(e.message || e).slice(0, 40)); });
  }

  取りに行く();
  /* 60 秒ごと。画面を見ていない間は取りに行かない */
  window.setInterval(function () {
    if (!document.hidden) 取りに行く();
  }, 60000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) 取りに行く();
  });
})();
