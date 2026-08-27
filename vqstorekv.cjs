/* ══════════════════════════════════════════════════════════════════════
   vqstorekv.cjs — 置き場所の 3 段目（KV）を 実際に 動かして 確かめる

   なぜ 分けたか:
     KV は 「D1 が 一杯のときだけ」使う 3 段目。ふつうに 動かしても
     そこへは 落ちない。**わざと 落として** 確かめる必要がある。
     この試験は wrangler.local.toml を 一時的に 書き換えて
       ・R2 を 外す
       ・MEDIA_CAP_D1 = "0"（D1 を 使えなくする）
     という形にしてから 走らせる。終わったら 必ず 元へ戻す。

   確かめること:
     ① D1 が 使えないとき **KV へ 落ちる**
     ② 25MB（KV の 区切り 20MB を またぐ）ものが 壊れずに 出入りする
     ③ 途中から 読める（動画の シーク）。**Content-Range が 嘘をつかない**
        ← ここが 実際に 壊れていた。中身は 合っているのに
          「後ろから N バイト」と 名乗っていて、シークだけが 狂った。
     ④ 1 つぶんの 上限が 置き場ごとに 効く（KV なら 60MB まで）

   使い方: node vqstorekv.cjs
     （中で 設定を 書き換えて server を 立て直すところまで やる）
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
const 控え = TOML + ".vqstorekv-bak";

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};

function 設定を書き換える() {
  fs.copyFileSync(TOML, 控え);
  let s = fs.readFileSync(TOML, "utf8");
  s = s.replace(/^\[\[r2_buckets\]\]$/m, "# [[r2_buckets]]")
       .replace(/^binding = "MEDIA_R2"$/m, '# binding = "MEDIA_R2"')
       .replace(/^bucket_name = "vocabuquiz-media"$/m, '# bucket_name = "vocabuquiz-media"')
       .replace(/^preview_bucket_name = "vocabuquiz-media-preview"$/m, '# preview_bucket_name = "vocabuquiz-media-preview"');
  s = s.replace(/^\[vars\]$/m, '[vars]\nMEDIA_CAP_D1 = "0"');
  fs.writeFileSync(TOML, s, "utf8");
}
function 設定を戻す() {
  if (fs.existsSync(控え)) { fs.copyFileSync(控え, TOML); fs.unlinkSync(控え); }
}

async function 待つ(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function 立ち上がるまで(丸太, 秒) {
  for (let i = 0; i < 秒 * 2; i++) {
    if (fs.existsSync(丸太) && /Ready on http/.test(fs.readFileSync(丸太, "utf8"))) return true;
    await 待つ(500);
  }
  return false;
}

(async () => {
  const 丸太 = path.join(os.tmpdir(), "vqstorekv-" + process.pid + ".log");
  let 子 = null;
  const 片づけ = () => {
    try { if (子) process.kill(-子.pid, "SIGTERM"); } catch (e) {}
    try { execSync("pkill -f 'wrangler dev' 2>/dev/null || true"); } catch (e) {}
    設定を戻す();
  };
  process.on("exit", 片づけ);
  process.on("SIGINT", () => { 片づけ(); process.exit(130); });

  try {
    console.log("設定を 一時的に 書き換えます（R2 を外し、D1 の天井を 0 に）");
    設定を書き換える();
    try { execSync("pkill -f 'wrangler dev' 2>/dev/null || true"); } catch (e) {}
    await 待つ(2000);
    子 = spawn("./dev-local.sh", ["echo"], {
      cwd: path.join(根, "server"), detached: true,
      stdio: ["ignore", fs.openSync(丸太, "w"), fs.openSync(丸太, "a")]
    });
    if (!await 立ち上がるまで(丸太, 120)) throw new Error("立ち上がりませんでした: " + 丸太);
    console.log("立ち上がりました\n");

    const 中身 = fs.readFileSync(丸太, "utf8");
    ok("KV が 繋がっている", /env\.MEDIA_KV/.test(中身));
    ok("R2 は 外れている", !/env\.MEDIA_R2/.test(中身));

    const nick = "kv" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
    const reg = await fetch(BASE + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevStore#2026a",
                             tosAccepted: true, tosVersion: "1" })
    });
    const { token } = await reg.json();
    ok("検証アカウントを 作れた", !!token, nick);

    /* ── 25MB（区切り 20MB を またぐ）─────────────────────────── */
    const CH = 20 * 1024 * 1024;
    const N = CH + 5 * 1024 * 1024;
    const b = new Uint8Array(N);
    b[0] = 0x25; b[1] = 0x50; b[2] = 0x44; b[3] = 0x46;          /* %PDF */
    for (let i = 4; i < N; i++) b[i] = (i * 31 + 7) % 256;

    const up = await fetch(BASE + "/api/upload/file", {
      method: "POST", body: b,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/octet-stream",
                 "X-File-Name": encodeURIComponent("おおきい.pdf") }
    });
    const d = await up.json();
    ok("25MB を あげられる（D1 の 24MB では 断られない）", up.status === 200, { status: up.status, ...d });
    ok("★ D1 が 使えないので KV へ 落ちる", d.backend === "kv", d.backend);
    if (!d.key) throw new Error("鍵が 返りませんでした");

    const 試す = async (名, ヘッダ, 始, 長) => {
      const r = await fetch(BASE + "/api/media/" + d.key, ヘッダ ? { headers: ヘッダ } : undefined);
      const got = new Uint8Array(await r.arrayBuffer());
      const cr = r.headers.get("content-range") || "";
      let 合う = got.length === 長;
      for (let i = 0; i < 長 && 合う; i++) if (got[i] !== b[始 + i]) 合う = false;
      const 見出し = !ヘッダ || cr === ("bytes " + 始 + "-" + (始 + 長 - 1) + "/" + N);
      ok(名, 合う && 見出し, { status: r.status, cr, 中身: 合う, 見出し });
    };
    await 試す("まるごと 出せる（25MB）", null, 0, N);
    await 試す("★ 区切りを またいで 読める", { Range: "bytes=" + (CH - 50) + "-" + (CH + 49) }, CH - 50, 100);
    await 試す("★ 2 つめの 区切りの 中", { Range: "bytes=" + (CH + 1000) + "-" + (CH + 1099) }, CH + 1000, 100);
    await 試す("★ 区切りの ちょうど頭", { Range: "bytes=" + CH + "-" + (CH + 9) }, CH, 10);
    await 試す("先頭 10 バイト", { Range: "bytes=0-9" }, 0, 10);
    await 試す("後ろから 50 バイト", { Range: "bytes=-50" }, N - 50, 50);
    await 試す("末尾まで", { Range: "bytes=" + (N - 1000) + "-" }, N - 1000, 1000);

    /* ── 置き場の 天井が 画面へ 正しく 出るか ───────────────────── */
    const u = await fetch(BASE + "/api/storage/usage", { headers: { Authorization: "Bearer " + token } });
    const s = await u.json();
    const 段 = s.backends || [];
    const kv = 段.find((x) => x.id === "kv");
    const d1 = 段.find((x) => x.id === "d1");
    ok("KV が 置き場として 出る", !!kv, 段.map((x) => x.id));
    ok("KV に 25MB 入っていると 出る", kv && kv.usedBytes >= N, kv);
    ok("設定で 変えた D1 の 天井が 効いている", d1 && d1.capBytes === 0, d1);
    ok("R2 を 入れたら 10GB 増えると 出る", s.r2WouldAddBytes === 10 * 1024 ** 3, s.r2WouldAddBytes);

    /* ── 大きすぎるものは 断る（KV でも 60MB まで）───────────────── */
    const でかい = new Uint8Array(61 * 1024 * 1024);
    でかい[0] = 0x25; でかい[1] = 0x50; でかい[2] = 0x44; でかい[3] = 0x46;
    const r2 = await fetch(BASE + "/api/upload/file", {
      method: "POST", body: でかい,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/octet-stream", "X-File-Name": "x.pdf" }
    });
    const dd = await r2.json();
    ok("61MB は 断る（KV は 60MB まで）", r2.status === 413, { status: r2.status, code: dd.code });
    ok("断る文に 本当の上限が 出る（種類と置き場の 小さいほう）", /60MB/.test(String(dd.message || "")) && dd.maxBytes === 60 * 1024 * 1024, dd);

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
