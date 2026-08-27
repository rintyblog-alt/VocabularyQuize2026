/* ══════════════════════════════════════════════════════════════════════════
   vqcheckprod.cjs — 出したあとの 本番を 外から確かめる（読むだけ・書かない）

   見ること:
     ① トップが 200 で返り、切り出したファイルを 指している
     ② 指紋つきのファイルが 200 で、**1 年 溜めてよい**と言っている
     ③ 2 回目は 304 か、溜めから返る（＝送り直していない）
     ④ 主な API が 生きている
     ⑤ 昔の大きな index.html に 戻っていない

   使い方: node vqcheckprod.cjs [https://www.vocabuquiz.app]
   ══════════════════════════════════════════════════════════════════════════ */
const 先 = process.argv[2] || "https://www.vocabuquiz.app";
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + String(x).slice(0, 300) : "")); } };

(async () => {
  console.log("■ " + 先 + "\n");

  const r1 = await fetch(先 + "/", { redirect: "follow" });
  const html = await r1.text();
  const 長 = Buffer.byteLength(html, "utf8");
  ok("トップが 200（" + r1.status + "）", r1.status === 200, r1.status);
  console.log("     index.html: " + 長 + " バイト / Cache-Control: " + (r1.headers.get("cache-control") || "-") +
              " / Last-Modified: " + (r1.headers.get("last-modified") || "-") + " / 版: " + (r1.headers.get("x-vq-build") || "-"));
  ok("index.html が 3MB 未満（切り出しが 効いている）", 長 < 3 * 1024 * 1024, 長);

  const 参照 = [...html.matchAll(/\/(js|css)\/([A-Za-z0-9_-]+\.[0-9a-f]{10}\.(?:js|css))/g)].map((m) => m[0]);
  const 一意 = [...new Set(参照)];
  ok("指紋つきのファイルを 指している（" + 一意.length + " 本）", 一意.length >= 20, 一意.length);

  /* 大きいものから 4 本だけ 実際に取ってみる */
  const 見る = 一意.filter((x) => /vq-core|vq2-app|vq-live|vq-ds/.test(x)).slice(0, 4);
  for (const p of 見る) {
    const r = await fetch(先 + p);
    const cc = r.headers.get("cache-control") || "";
    const len = Number(r.headers.get("content-length") || 0);
    await r.arrayBuffer();
    ok(p + " が 200（" + (len ? Math.round(len / 1024) + "KB" : "?") + "）", r.status === 200, r.status);
    ok(p + " は 1 年 溜めてよい", /immutable/.test(cc) && /max-age=31536000/.test(cc), cc || "(無し)");
  }

  /* トップの 2 回目: Last-Modified を返して 304 になるか */
  const lm = r1.headers.get("last-modified");
  if (lm) {
    const r2 = await fetch(先 + "/", { headers: { "If-Modified-Since": lm } });
    ok("トップの 2 回目は 304（本文を 送り直さない）", r2.status === 304, r2.status);
    if (r2.status !== 304) await r2.arrayBuffer();
  } else {
    console.log("  ⚠ Last-Modified が 無いので 2 回目の確かめは 飛ばす");
  }

  /* API が 生きているか（読むだけ） */
  for (const p of ["/api/public/config", "/api/public/maintenance", "/api/official-presets"]) {
    try {
      const r = await fetch(先 + p);
      await r.text();
      ok("API " + p + " が 生きている（" + r.status + "）", r.status < 500, r.status);
    } catch (e) { ok("API " + p + " が 生きている", false, String(e.message)); }
  }

  console.log("\n" + "═".repeat(58));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(58));
  process.exit(fail ? 1 : 0);
})();
