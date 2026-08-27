/* ══════════════════════════════════════════════════════════════════════
   core/wp/stock.js — 参考資料（自由に 使える 絵）を 探して 取り込む（VQSTOCK）

   ★ 訴え（2026-08-28）
     「生成時に、スライドに 新たに 参考資料（フリーのものを ネットから
       持ってきたり）… これは プレゼンだけじゃないからな？ 他の 3 つも そう」

   ★ 決めごと
     ・探すのも 取り込むのも **サーバを 通す**（/api/stock/find・/api/stock/adopt）。
       画面から 直に 外へ 出ない（CORS で 落ちるし、追跡もされる）。
     ・貼るのは **取り込んだ あとの 住所**（/api/media/…）。
       外の 住所を そのまま 貼ると、消える・遅い・追跡される。
     ・**出どころと 決まり（ライセンス）を 必ず 持ち回る。**
       CC-BY は 作者の 名前を 出すのが 決まり。ここを 落とすと 決まり違反。
       だから 取り込んだ 結果には いつも credit が 付く。
     ・4 つ（Docs / Sheets / Slides / Forms）で **同じ ここ**を 使う。
       画面ごとに 書くと、片方だけ 出どころを 出し忘れる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQSTOCK = root.VQSTOCK || (root.VQSTOCK = {});

  function 台() {
    try {
      if (root.AUTH_API_BASE) return String(root.AUTH_API_BASE).replace(/\/+$/, "");
      if (root.VQ_API_BASE) return String(root.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  }
  function 札() {
    try { return String(root.localStorage.getItem("app.auth.token.v1") || ""); } catch (e) { return ""; }
  }
  function 頼む(道, 中身) {
    var h = { "Content-Type": "application/json" };
    var t = 札();
    if (t) h.Authorization = "Bearer " + t;
    return root.fetch(台() + 道, { method: "POST", headers: h, body: JSON.stringify(中身 || {}) })
      .then(function (r) {
        return r.text().then(function (txt) {
          var d = null;
          try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = null; }
          if (!r.ok) {
            var e2 = new Error((d && d.message) || ("うまくいきませんでした（" + r.status + "）"));
            e2.状態 = r.status; e2.中身 = d;
            throw e2;
          }
          return d || {};
        });
      });
  }

  /* ── 探す ────────────────────────────────────────────────────── */
  function 探す(言葉, o) {
    o = o || {};
    var q = String(言葉 || "").replace(/\s+/g, " ").trim();
    if (!q) return Promise.resolve({ ok: false, なぜ: "探す言葉が ありません", images: [] });
    return 頼む("/api/stock/find", { q: q, limit: Math.max(1, Math.min(24, o.limit || 12)) })
      .then(function (d) {
        return { ok: true, images: d.images || [], 提供元: d.提供元 || [],
                 落ちた: d.落ちた || [], 決まり: d.決まり || "" };
      })
      .catch(function (e) { return { ok: false, なぜ: String(e && e.message || e), images: [] }; });
  }

  /* ── 取り込む（こちらの 置き場へ 写す）────────────────────────── */
  function 取り込む(絵) {
    if (!絵 || !絵.url) return Promise.resolve({ ok: false, なぜ: "選ばれていません" });
    return 頼む("/api/stock/adopt", {
      url: 絵.url, 印: 絵.取り込み印 || "",
      author: 絵.author || "", license: 絵.license || "",
      licenseUrl: 絵.licenseUrl || "", page: 絵.page || "", source: 絵.source || ""
    }).then(function (d) {
      return { ok: true, url: d.url, bytes: d.bytes || 0, credit: d.credit || {},
               contentType: d.contentType || "" };
    }).catch(function (e) { return { ok: false, なぜ: String(e && e.message || e) }; });
  }

  /* ── 出どころの 一行（貼った 絵の 下に 出す）───────────────────
     ★ 「作者 / 決まり / 出どころ」を 短く 1 行に する。
       決まりが 分からないものは **出さない**（探す側で 落としてある）。 */
  function 出どころの文(credit) {
    var c = credit || {};
    var 並 = [];
    if (c.author) 並.push(String(c.author).slice(0, 60));
    if (c.license) 並.push(String(c.license));
    if (c.source) 並.push(String(c.source));
    return 並.join(" / ");
  }
  function 出どころのHTML(credit, esc) {
    var 文 = 出どころの文(credit);
    if (!文) return "";
    var e = esc || function (s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };
    var 頁 = String((credit || {}).page || "");
    var 中 = e(文);
    if (/^https:\/\//.test(頁)) {
      中 = '<a href="' + e(頁) + '" target="_blank" rel="noopener noreferrer nofollow">' + 中 + "</a>";
    }
    return '<div class="wp-credit">出典: ' + 中 + "</div>";
  }

  var CSS = ".wp-credit{font-size:10px;line-height:1.5;color:var(--vq-text-tertiary,#9994A8);"
    + "margin-top:3px;word-break:break-word;}"
    + ".wp-credit a{color:inherit;text-decoration:underline;}"
    /* 印刷でも 消さない。決まりで 出す ものなので、消えたら 決まり違反になる。 */
    + "@media print{.wp-credit{display:block !important;color:#555 !important;}}";

  VQSTOCK.探す = 探す;
  VQSTOCK.取り込む = 取り込む;
  VQSTOCK.出どころの文 = 出どころの文;
  VQSTOCK.出どころのHTML = 出どころのHTML;
  VQSTOCK.CSS = function () { return CSS; };
})(typeof globalThis !== "undefined" ? globalThis : this);
