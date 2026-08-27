/* ══════════════════════════════════════════════════════════════════════
   vqstorer2.cjs — R2 への 引っ越しが 本当に 動くかを 確かめる

   なぜ 要るか:
     R2 は いま 本番で 未有効。有効にした あとに 走らせる手順を、
     **先に 動かして 確かめておく**。有効化してから 初めて動かして
     壊れました、では 遅い。

   どう 作るか:
     ローカルには R2（miniflare の 真似）が 在る。そこで
       ・MEDIA_CAP_R2 = "0" にして **まず D1 へ 入れさせる**
       ・そのあと 引っ越しの口を 叩いて R2 へ 移す
     という 本番と 同じ順番を 作る。

   確かめること:
     ① 管理の鍵が 無いと 断る
     ② 見るだけ（dryRun）では 動かさない
     ③ 移したあと、**中身が 1 バイトも 変わらない**
     ④ 移したあとも 途中から 読める（動画の シーク）
     ⑤ 台帳の 置き場が r2 に 変わる／D1 側の 実体は 消えている
     ⑥ 二度目は 何もしない

   使い方: node vqstorer2.cjs
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn, execSync } = require("child_process");

const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。");
  process.exit(2);
}

const 根 = __dirname;
const TOML = path.join(根, "server", "wrangler.local.toml");
const 控え = TOML + ".vqstorer2-bak";

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

function 管理の鍵() {
  for (const p of ["server/.local-run/echo/.dev.vars", "server/.dev.vars"]) {
    try {
      const m = /^ADMIN_KEY\s*=\s*"?([^"\n\r]+)"?/m.exec(fs.readFileSync(path.join(根, p), "utf8"));
      if (m) return m[1].trim();
    } catch (e) {}
  }
  return "";
}

(async () => {
  const 丸太 = path.join(os.tmpdir(), "vqstorer2-" + process.pid + ".log");
  let 子 = null;
  const 片づけ = () => {
    try { if (子) process.kill(-子.pid, "SIGTERM"); } catch (e) {}
    try { execSync("pkill -f 'wrangler dev' 2>/dev/null || true"); } catch (e) {}
    if (fs.existsSync(控え)) { fs.copyFileSync(控え, TOML); fs.unlinkSync(控え); }
  };
  process.on("exit", 片づけ);
  process.on("SIGINT", () => { 片づけ(); process.exit(130); });

  const 鍵 = 管理の鍵();
  if (!鍵) { console.error("管理の鍵（ADMIN_KEY）が 見つかりません。"); process.exit(1); }

  try {
    /* R2 は 在るが 天井 0 ＝ まず D1 へ 入る。本番の「これから R2 を足す」状態。 */
    fs.copyFileSync(TOML, 控え);
    let s = fs.readFileSync(TOML, "utf8");
    s = s.replace(/^\[vars\]$/m, '[vars]\nMEDIA_CAP_R2 = "0"');
    fs.writeFileSync(TOML, s, "utf8");

    try { execSync("pkill -f 'wrangler dev' 2>/dev/null || true"); } catch (e) {}
    await 待つ(2000);
    子 = spawn("./dev-local.sh", ["echo"], {
      cwd: path.join(根, "server"), detached: true,
      stdio: ["ignore", fs.openSync(丸太, "w"), fs.openSync(丸太, "a")]
    });
    for (let i = 0; i < 240; i++) {
      if (fs.existsSync(丸太) && /Ready on http/.test(fs.readFileSync(丸太, "utf8"))) break;
      await 待つ(500);
    }
    if (!/Ready on http/.test(fs.readFileSync(丸太, "utf8"))) throw new Error("立ち上がりません: " + 丸太);
    ok("R2 が 在る状態で 立ち上がった", /env\.MEDIA_R2/.test(fs.readFileSync(丸太, "utf8")));

    const nick = "r2" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
    const reg = await fetch(BASE + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevStore#2026a",
                             tosAccepted: true, tosVersion: "1" })
    });
    const { token } = await reg.json();

    /* ── まず D1 へ 3 つ 入れる ─────────────────────────────── */
    const 品 = [];
    for (let k = 0; k < 3; k++) {
      const N = 200000 + k * 1000;
      const b = new Uint8Array(N);
      b[0] = 0x25; b[1] = 0x50; b[2] = 0x44; b[3] = 0x46;
      for (let i = 4; i < N; i++) b[i] = (i * 17 + k) % 256;
      const up = await fetch(BASE + "/api/upload/file", {
        method: "POST", body: b,
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/octet-stream",
                   "X-File-Name": "a" + k + ".pdf" }
      });
      const d = await up.json();
      品.push({ key: d.key, backend: d.backend, N, b });
    }
    ok("R2 の天井が 0 なので まず D1 へ 入る", 品.every((x) => x.backend === "d1"), 品.map((x) => x.backend));

    const 引っ越す = async (中身, 見出し) => {
      const r = await fetch(BASE + "/api/storage/migrate-r2", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, 見出し || {}),
        body: JSON.stringify(中身 || {})
      });
      let d = null; try { d = await r.json(); } catch (e) { d = {}; }
      return { status: r.status, d };
    };

    /* ① 鍵が 無いと 断る */
    const 鍵なし = await 引っ越す({ limit: 10 }, null);
    ok("管理の鍵が 無いと 断る", 鍵なし.status === 403, 鍵なし);
    /* ★ 見出し（HTTP ヘッダ）に 日本語は 載らない（latin-1 だけ）。
       ここで 日本語の 鍵を 入れると fetch が その場で 例外を投げて、
       試験そのものが 落ちる。ASCII で 書く。 */
    const 違う鍵 = await 引っ越す({ limit: 10 }, { "x-admin-token": "not-the-real-key-0000" });
    ok("違う鍵でも 断る", 違う鍵.status === 403, 違う鍵.status);

    /* ② 見るだけ */
    const 見る = await 引っ越す({ dryRun: true, limit: 10 }, { "x-admin-token": 鍵 });
    ok("見るだけが 通る", 見る.status === 200, 見る);
    ok("移す予定が 3 件 出る", (見る.d.wouldMove || []).length >= 3, 見る.d.wouldMove);
    const まだD1 = await fetch(BASE + "/api/media/" + 品[0].key);
    ok("見るだけでは 動かしていない", まだD1.status === 200, まだD1.status);

    /* ③ 本番。**終わるまで 何度も 呼ぶ**（1 回で 全部は やらない作り）。
       ★ ローカルの D1 には 前の試験の 残骸が たまっている。
         「読めない古い記録で 止まり続けて 一生 終わらない」という
         本物の不具合を ここで 見つけた。だから **回数を 数えて**、
         きちんと 0 まで 減ることを 確かめる。 */
    let 実行 = null, 回 = 0, 動いた = 0, 失った = 0;
    while (回 < 40) {
      実行 = await 引っ越す({ limit: 50 }, { "x-admin-token": 鍵 });
      if (実行.status !== 200) break;
      動いた += (実行.d.moved || []).length;
      失った += (実行.d.lost || []).length;
      回++;
      if (実行.d.remainingCount === 0) break;
      /* 前へ 進んでいないなら 止める（無限に 回らない） */
      if (!(実行.d.moved || []).length && !(実行.d.lost || []).length) break;
    }
    console.log("     （" + 回 + " 回で 移した " + 動いた + " 件 / 失われていた " + 失った + " 件）");
    ok("引っ越しが 通る", 実行 && 実行.status === 200, 実行 && 実行.status);
    ok("この試験で 入れた 3 件が 移った", 動いた >= 3, 動いた);
    ok("★ 必ず 終わる（残り 0 まで 減る）", 実行 && 実行.d.remainingCount === 0, 実行 && 実行.d.remainingCount);
    ok("読み取り失敗で 止まっていない", !(実行.d.failed || []).length, 実行.d.failed);

    /* ④ 中身が 変わっていないか（1 バイトずつ 見る） */
    for (const x of 品) {
      const r = await fetch(BASE + "/api/media/" + x.key);
      const got = new Uint8Array(await r.arrayBuffer());
      let 合う = got.length === x.N;
      for (let i = 0; i < x.N && 合う; i++) if (got[i] !== x.b[i]) 合う = false;
      ok("移したあとも 中身が 1 バイトも 変わらない（" + x.N.toLocaleString() + "）", 合う,
         { status: r.status, len: got.length, 期待: x.N });
    }

    /* ⑤ 途中から も 読める */
    const x0 = 品[0];
    const pr = await fetch(BASE + "/api/media/" + x0.key, { headers: { Range: "bytes=1000-1099" } });
    const pb = new Uint8Array(await pr.arrayBuffer());
    let 合2 = pb.length === 100;
    for (let i = 0; i < 100 && 合2; i++) if (pb[i] !== x0.b[1000 + i]) 合2 = false;
    ok("移したあとも 途中から 読める", pr.status === 206 && 合2 &&
       pr.headers.get("content-range") === "bytes 1000-1099/" + x0.N,
       { status: pr.status, cr: pr.headers.get("content-range"), 中身: 合2 });

    /* ⑥ 台帳と 使用量が R2 に なっている */
    const u = await fetch(BASE + "/api/storage/usage", { headers: { Authorization: "Bearer " + token } });
    const su = await u.json();
    const r2段 = (su.backends || []).find((y) => y.id === "r2");
    const d1段 = (su.backends || []).find((y) => y.id === "d1");
    ok("使用量が R2 へ 移っている", r2段 && r2段.usedBytes >= 600000, r2段);
    ok("D1 側の 使用量が 0 になる", d1段 && d1段.usedBytes === 0, d1段);

    /* ⑦ 二度目は 何もしない */
    const 二 = await 引っ越す({ limit: 10 }, { "x-admin-token": 鍵 });
    ok("もう一度 呼んでも 何も 移さない", (二.d.moved || []).length === 0 && 二.d.remainingCount === 0,
       { moved: (二.d.moved||[]).length, remaining: 二.d.remainingCount });

  } finally {
    片づけ();
    console.log("\n設定を 元へ 戻しました");
  }

  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (bad.length) { console.log("  落ちたもの:"); bad.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
