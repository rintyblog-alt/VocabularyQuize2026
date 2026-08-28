/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveface.cjs — 走る人が **進む向きを 向いて** 走っているか

   ★ 直したもの: 走る人が ずっと 後ろ向きに 走っていた。
     この 作りでは yaw は「カメラの ある 側」を 指し、進む向きは
     **-(sin yaw, cos yaw)**。脚も つま先も そちら側へ 出していたのに、
     顔（目・帯・芽・かぶりもの）だけ 逆の +(sin, cos) 側に 置いていた。
     実測: 進む向きと 顔の向きの 内積が -1（本人も ボットも）。

   ここでは 描く 命令を 横取りして、**目・帯・つま先が どちら側に
   置かれたか**を 数で 見る。絵を 見なくても 分かるように する。

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0;
const ok = (n, c, x) => {
  if (c) { 済++; console.log("  ok   " + n + (x !== undefined ? "  → " + JSON.stringify(x) : "")); }
  else { 落++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
  const 失敗 = [];
  pg.on("pageerror", (e) => 失敗.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });

  /* 描く 命令を 拾う にせ renderer。行列の 12/13/14 が 置き場所。 */
  const 測る = async (yaw) => pg.evaluate(async (yaw) => {
    const m = await import("/assets/vocabu-survive/game/bean.js");
    const v = new m.BeanVisual([1, 0.8, 0.2]);
    v.phase = 0.9;                      /* 脚が 振れている ところ */
    v.armSwing = 1; v.tilt = 0.18; v.squash = 1; v.blink = 0;
    const 積 = [];
    const R = {
      hasMesh: () => true, addMesh: () => {},
      draw: (mesh, mat) => 積.push({ mesh, x: mat[12], y: mat[13], z: mat[14] })
    };
    v.draw(R, 0, 0, 0, yaw, 1);
    const M = m.BEAN_MESHES;
    const 平均 = (id) => {
      const a = 積.filter((q) => q.mesh === id);
      if (!a.length) return null;
      return { x: a.reduce((s, q) => s + q.x, 0) / a.length, z: a.reduce((s, q) => s + q.z, 0) / a.length, n: a.length };
    };
    return { 目: 平均(M.eye), 帯: 平均(M.visor), 足: 平均(M.foot), 頭: 平均(M.head), 数: 積.length };
  }, yaw);

  節("① 顔は 進む向きに ある");
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const r = await 測る(yaw);
    /* 進む向き = -(sin yaw, cos yaw) */
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const 内積 = (p) => p ? +(p.x * fx + p.z * fz).toFixed(3) : null;
    const 名 = "yaw=" + yaw.toFixed(2);
    ok(名 + " 目が 進む向きに ある", 内積(r.目) > 0.2, { 内積: 内積(r.目), 数: r.目 && r.目.n });
    ok(名 + " 帯（バイザー）も 進む向き", 内積(r.帯) > 0.1, 内積(r.帯));
    ok(名 + " つま先も 進む向き", 内積(r.足) > 0, 内積(r.足));
    ok(名 + " 頭は 体の 真上（横に ずれない）",
      r.頭 && Math.abs(r.頭.x) < 1e-6 && Math.abs(r.頭.z) < 1e-6, r.頭);
  }

  節("② 顔と つま先が 同じ 側");
  {
    const r = await 測る(0.7);
    const 目 = Math.hypot(r.目.x, r.目.z) > 0 ? [r.目.x, r.目.z] : null;
    const 足 = [r.足.x, r.足.z];
    const 正 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
    const a = 正(目), c = 正(足);
    const d = +(a[0] * c[0] + a[1] * c[1]).toFixed(3);
    ok("目と つま先の 向きが そろっている（後ずさりでない）", d > 0.3, { 内積: d, 目, 足 });
  }

  節("③ 顔の 向き（faceYaw）は 顔だけ 動かす");
  {
    const r0 = await pg.evaluate(async () => {
      const m = await import("/assets/vocabu-survive/game/bean.js");
      const v = new m.BeanVisual([1, 1, 1]); v.armSwing = 1; v.phase = 0.9;
      const 出 = (fy) => {
        v.faceYaw = fy; const 積 = [];
        v.draw({ hasMesh: () => true, addMesh: () => {}, draw: (mesh, mat) => 積.push({ mesh, x: mat[12], z: mat[14] }) }, 0, 0, 0, 0, 1);
        const e = 積.filter((q) => q.mesh === m.BEAN_MESHES.eye);
        const f = 積.filter((q) => q.mesh === m.BEAN_MESHES.foot);
        return { ex: e.reduce((s, q) => s + q.x, 0) / e.length, fx: f.reduce((s, q) => s + q.x, 0) / f.length };
      };
      return { 真: 出(0), 横: 出(0.6) };
    });
    ok("顔を 振ると 目が 動く", Math.abs(r0.横.ex - r0.真.ex) > 0.05, r0);
    ok("顔を 振っても 足は 動かない", Math.abs(r0.横.fx - r0.真.fx) < 1e-6, r0);
  }

  節("④ 見せる 場面は こちらを 向く");
  {
    /* ロビーの 舞台は カメラが +z 側に いる。走る人は そちらを 向く。 */
    const src = await (await fetch(BASE + "/assets/vocabu-survive/ui/lobbystage.js")).text();
    ok("ロビーの 走る人に 半回転を 足している", /Math\.PI \+ Math\.sin\(this\._t \* 0\.28\)/.test(src));
    ok("ロビーの 仲間にも 足している", /Math\.PI \+ Math\.sin\(this\._t \* 0\.4/.test(src));
    const src2 = await (await fetch(BASE + "/assets/vocabu-survive/boot/loading.js")).text();
    ok("読み込み画面の 走る人にも 足している", /draw\(R, b\.x, bounce, b\.z, Math\.PI \+ yaw/.test(src2));
  }

  節("⑤ 例外");
  ok("画面の 例外 0 件", 失敗.length === 0, 失敗.join(" | "));

  await b.close();
  console.log("\n────────────────────────────────");
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
