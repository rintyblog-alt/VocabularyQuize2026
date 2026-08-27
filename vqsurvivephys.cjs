#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivephys.cjs — 当たりの 計算が 正しいか（画面を 使わず 数で 見る）。

   ここで 見ること:
     ① 床の 上に 立てる（沈まない・浮かない）
     ② 壁を すり抜けない
     ③ 箱を 回しても 正しく 当たる
     ④ 坂を 上れる
     ⑤ 筒に 当たる
     ⑥ 格子で 絞っても 総当たりと 同じ 答えに なる
     ⑦ 同じ 入力なら 何度でも 同じ 答え（サーバと 合わせるため）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const 道 = (p) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", p);

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 近い = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-3 : e);

(async () => {
  const P = await import(道("game/physics.js"));
  const { Solid, World, SOLID, testSolid } = P;
  const R = 0.4, HH = 0.36;   /* カプセル: 半径 0.4 / 胴の 半分 0.36（全高 1.52） */

  節("① 床");
  const floor = new Solid({ type: SOLID.BOX, x: 0, y: -0.5, z: 0, hx: 10, hy: 0.5, hz: 10 });
  /* 足元が ちょうど 0 に なる 中心の 高さ = R + HH = 0.76 */
  let hit = testSolid(floor, 0, 0.76, 0, R, HH);
  ok("ちょうど 接している とき 当たらない（か 深さ 0）", !hit || hit.depth < 1e-6, hit && hit.depth);
  hit = testSolid(floor, 0, 0.60, 0, R, HH);
  ok("沈めた ぶんだけ 深さが 出る", hit && 近い(hit.depth, 0.16, 1e-3), hit && hit.depth);
  ok("押し戻す 向きが 真上", hit && 近い(hit.ny, 1, 1e-6) && 近い(hit.nx, 0) && 近い(hit.nz, 0), hit);
  hit = testSolid(floor, 0, 1.2, 0, R, HH);
  ok("浮いている ときは 当たらない", !hit, hit && hit.depth);

  節("② 壁");
  const wall = new Solid({ type: SOLID.BOX, x: 3, y: 1, z: 0, hx: 0.5, hy: 2, hz: 4 });
  hit = testSolid(wall, 2.2, 1, 0, R, HH);
  ok("壁の 手前で 当たる", !!hit, hit);
  ok("押し戻しが 横向き（-X）", hit && 近い(hit.nx, -1, 1e-6) && Math.abs(hit.ny) < 1e-6, hit);
  ok("深さ = 0.4 -(2.5-2.2) = 0.1", hit && 近い(hit.depth, 0.1, 1e-3), hit && hit.depth);
  ok("壁の 向こう側は 当たらない", !testSolid(wall, 5, 1, 0, R, HH));

  節("③ 回した 箱");
  const rot = new Solid({ type: SOLID.BOX, x: 0, y: 1, z: 0, hx: 2, hy: 0.3, hz: 0.3, ry: Math.PI / 2 });
  /* 90 度 回すと 長い 方向が Z に なる */
  ok("回した 先（Z 方向 1.8）で 当たる", !!testSolid(rot, 0, 1, 1.8, R, HH));
  ok("回す前の 長い 方向（X 方向 1.8）では 当たらない", !testSolid(rot, 1.8, 1, 0, R, HH));
  const noRot = new Solid({ type: SOLID.BOX, x: 0, y: 1, z: 0, hx: 2, hy: 0.3, hz: 0.3, ry: 0 });
  ok("回さない 箱は X 方向で 当たる", !!testSolid(noRot, 1.8, 1, 0, R, HH));

  節("④ 坂");
  const ramp = new Solid({ type: SOLID.RAMP, x: 0, y: 1, z: 0, hx: 3, hy: 1, hz: 4 });
  /* z=-4 で 上面 y=0、z=+4 で 上面 y=2 */
  const h0 = testSolid(ramp, 0, 0.76 + 0.0, -3.9, R, HH);
  ok("下の 端で 当たる（足元 0 付近）", !!h0, h0);
  const hMid = testSolid(ramp, 0, 1.0 + R + HH, 0, R, HH);
  ok("真ん中では 上面 y=1 に 乗る", !!hMid && hMid.depth < 0.02, hMid && hMid.depth);
  const hHigh = testSolid(ramp, 0, 3.0, 0, R, HH);
  ok("上に 浮いていれば 当たらない", !hHigh);
  ok("坂の 押し戻しは 斜め（ny<1, nz≠0）",
    hMid && hMid.ny > 0.7 && hMid.ny < 0.999 && Math.abs(hMid.nz) > 0.05, hMid);

  節("⑤ 筒");
  const cyl = new Solid({ type: SOLID.CYL, x: 0, y: 1, z: 0, hx: 1.2, hy: 1.5 });
  ok("横から 当たる", !!testSolid(cyl, 1.5, 1, 0, R, HH));
  ok("斜め 45 度でも 当たる", !!testSolid(cyl, 1.1, 1, 1.1, R, HH));
  ok("離れれば 当たらない", !testSolid(cyl, 2.2, 1, 0, R, HH));
  const top = testSolid(cyl, 0, 2.5 + R + HH - 0.05, 0, R, HH);
  ok("上に 乗れる", !!top && 近い(top.ny, 1, 1e-6), top);

  節("⑥ 格子");
  const w = new World({ cell: 8 });
  for (let i = 0; i < 400; i++) {
    w.add(new Solid({ type: SOLID.BOX, x: (i % 20) * 6 - 60, y: 0, z: Math.floor(i / 20) * 6 - 60, hx: 1, hy: 1, hz: 1 }));
  }
  const out = [];
  w.near(0, 0, 2, out);
  const 総当たり = w.solids.filter((s) => Math.abs(s.x) < 12 && Math.abs(s.z) < 12);
  ok("格子で 絞れている（400 個 → 少数）", out.length > 0 && out.length < 40, out.length);
  /* 絞った 中に、本当に 当たる ものが 全部 入っているか */
  const 当たる総当たり = w.solids.filter((s) => !!testSolid(s, 0, 1.2, 0, 0.4, 0.36));
  const 当たる絞り = out.filter((s) => !!testSolid(s, 0, 1.2, 0, 0.4, 0.36));
  ok("絞っても 取りこぼさない", 当たる総当たり.length === 当たる絞り.length,
    { 総: 当たる総当たり.length, 絞: 当たる絞り.length });

  節("⑦ 何度でも 同じ 答え");
  const 取る = () => {
    const r = [];
    for (let i = 0; i < 60; i++) {
      const hh = testSolid(ramp, (i % 7) - 3, 0.9 + i * 0.03, (i % 9) - 4, R, HH);
      r.push(hh ? [hh.nx.toFixed(6), hh.ny.toFixed(6), hh.nz.toFixed(6), hh.depth.toFixed(6)].join(",") : "-");
    }
    return r.join("|");
  };
  const a1 = 取る(), a2 = 取る(), a3 = 取る();
  ok("3 回 走らせて 完全に 同じ", a1 === a2 && a2 === a3);

  節("⑧ 動く もの");
  const mv = new Solid({ type: SOLID.BOX, x: 0, y: 0, z: 0, hx: 2, hy: 0.4, hz: 2 });
  mv.commit();
  mv.x = 1.5; mv.z = -0.5; mv.commit();
  ok("動いた分を 覚える", 近い(mv.dx, 1.5) && 近い(mv.dz, -0.5), { dx: mv.dx, dz: mv.dz });
  mv.commit();
  ok("次の フレームでは 0 に 戻る", 近い(mv.dx, 0) && 近い(mv.dz, 0), { dx: mv.dx });

  節("⑨ 光線（カメラが 壁に 潜らないため）");
  const w2 = new World({ cell: 8 });
  w2.add(new Solid({ type: SOLID.BOX, x: 0, y: 1, z: 4, hx: 4, hy: 3, hz: 0.5 }));
  const d = w2.ray([0, 1, 0], [0, 0, 1], 10);
  ok("正面の 壁までの 距離が 出る（3.5 前後）", d > 3.0 && d < 4.2, d);
  const d2 = w2.ray([0, 1, 0], [0, 0, -1], 10);
  ok("後ろには 何も ない", d2 < 0, d2);

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
