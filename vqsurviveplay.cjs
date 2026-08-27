#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveplay.cjs — 走る人の 動きを 数で 確かめる。

   「気持ちいいか」は 目でしか 分からないが、
   **跳べる 高さ・届く 距離・止まるまでの 時間** は 数で 決まる。
   ここが ずれると コースが 越えられなく なる（＝詰み）。
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

(async () => {
  const P = await import(道("game/physics.js"));
  const PL = await import(道("game/player.js"));
  const { Solid, World, SOLID, TOUCH } = P;
  const { Player, TUNE, STEP, FixedStepper } = PL;

  const 平地 = () => {
    const w = new World({ killY: -20 });
    w.add(new Solid({ type: SOLID.BOX, x: 0, y: -1, z: 0, hx: 200, hy: 1, hz: 200 }));
    w.build();
    return w;
  };
  const 進める = (p, w, n, inp) => { for (let i = 0; i < n; i++) p.step(inp || {}, w); };

  節("① 立つ");
  let w = 平地();
  let p = new Player({ isLocal: true });
  p.reset({ x: 0, y: 3, z: 0 });
  進める(p, w, 120);
  ok("落ちて 床に 止まる（y ≈ 0）", Math.abs(p.y) < 0.02, p.y);
  ok("地に 足が ついている", p.grounded === true);
  ok("縦の 速さが 0", Math.abs(p.vy) < 0.01, p.vy);

  節("② 走る");
  p.reset({ x: 0, y: 0.02, z: 0 });
  進める(p, w, 6);
  const 前 = p.z;
  進める(p, w, 120, { mx: 0, mz: -1 });
  const 速さ = p.speed;
  ok("2 秒で 最高速に 届く", 速さ > TUNE.maxSpeed * 0.97, 速さ);
  ok("最高速を 超えない", 速さ <= TUNE.maxSpeed + 0.01, 速さ);
  ok("進んだ 向きが 合っている（-Z）", p.z < 前 - 8, { 前, 後: p.z });
  ok("向きが 進む方を 向く", Math.abs(p.yaw) < 0.05, p.yaw);
  /* 止まるまで */
  let n = 0; while (p.speed > 0.1 && n < 300) { p.step({}, w); n++; }
  ok("手を 離すと 0.4 秒 以内に 止まる", n * STEP < 0.4, (n * STEP).toFixed(3) + "秒");

  節("③ 跳ぶ");
  p.reset({ x: 0, y: 0.02, z: 0 });
  進める(p, w, 4);
  let 最高 = 0;
  p.step({ jump: true, jumpDown: true }, w);
  for (let i = 0; i < 200; i++) { p.step({ jumpDown: true }, w); if (p.y > 最高) 最高 = p.y; if (p.grounded && i > 10) break; }
  ok("押し続けた ときの 高さが 1.4〜2.2m", 最高 > 1.4 && 最高 < 2.2, 最高.toFixed(3));
  /* 短く 押した とき */
  p.reset({ x: 0, y: 0.02, z: 0 }); 進める(p, w, 4);
  let 低 = 0;
  p.step({ jump: true, jumpDown: true }, w);
  for (let i = 0; i < 200; i++) { p.step({ jumpDown: i < 4 }, w); if (p.y > 低) 低 = p.y; if (p.grounded && i > 10) break; }
  ok("短く 押すと 低い", 低 < 最高 - 0.25, { 低: 低.toFixed(3), 高: 最高.toFixed(3) });
  ok("短く 押しても 0.6m 以上は 上がる", 低 > 0.6, 低.toFixed(3));

  節("④ 走り跳びで 届く 距離（コースの 設計値）");
  p.reset({ x: 0, y: 0.02, z: 0 });
  進める(p, w, 140, { mx: 0, mz: -1 });
  const z0 = p.z;
  p.step({ mx: 0, mz: -1, jump: true, jumpDown: true }, w);
  let 落ちるまで = 0;
  for (let i = 0; i < 300; i++) { p.step({ mx: 0, mz: -1, jumpDown: true }, w); 落ちるまで++; if (p.grounded && i > 6) break; }
  const 飛距離 = Math.abs(p.z - z0);
  console.log("     走り跳びの 飛距離: " + 飛距離.toFixed(2) + "m / 滞空 " + (落ちるまで * STEP).toFixed(2) + "秒");
  /* ★ ここは 「こうあってほしい」ではなく **測った 値**を 守る 線。
     コースの 隙間は この 数字から 決める（安全 5.0m / 難所 5.6m）。 */
  ok("走り跳びで 5.4m 以上 飛べる", 飛距離 > 5.4, 飛距離);
  ok("飛びすぎない（8m 未満）", 飛距離 < 8, 飛距離);

  節("⑤ 壁");
  w = 平地();
  w.add(new Solid({ type: SOLID.BOX, x: 0, y: 2, z: -6, hx: 20, hy: 3, hz: 0.5 }));
  w.build();
  p.reset({ x: 0, y: 0.02, z: 0 });
  進める(p, w, 300, { mx: 0, mz: -1 });
  ok("壁を すり抜けない", p.z > -6, p.z);
  ok("壁の 手前で 止まる（-5.5 前後）", p.z > -5.9 && p.z < -5.0, p.z);

  節("⑥ 段差");
  w = 平地();
  w.add(new Solid({ type: SOLID.BOX, x: 0, y: 0.2, z: -6, hx: 6, hy: 0.2, hz: 4 }));  /* 高さ 0.4 の 段 */
  w.build();
  p.reset({ x: 0, y: 0.02, z: 0 });
  /* ★ 300 歩 走ると 41m 進む。段は 8m しか 無いので **通り過ぎる**。
     「乗れたか」は 段の 上に いる 間に 測る。 */
  let 段の上 = 0;
  for (let i = 0; i < 300; i++) { p.step({ mx: 0, mz: -1 }, w); if (p.z < -2.5 && p.z > -9.5) 段の上 = Math.max(段の上, p.y); }
  ok("低い 段（0.4m）に 乗れる", 段の上 > 0.35, 段の上);

  節("⑦ 坂");
  w = 平地();
  /* 坂は **進む 向きへ 上る** ように 置く。ry=π で ローカルの +Z が 世界の -Z。 */
  w.add(new Solid({ type: SOLID.RAMP, x: 0, y: 1, z: -8, hx: 6, hy: 1, hz: 5, ry: Math.PI }));
  w.build();
  p.reset({ x: 0, y: 0.02, z: 0 });
  let 坂の上 = 0, 坂で止まった = false;
  for (let i = 0; i < 400; i++) {
    p.step({ mx: 0, mz: -1 }, w);
    if (p.z < -3 && p.z > -13) 坂の上 = Math.max(坂の上, p.y);
  }
  ok("坂を 上れる（上端 2m 近くまで）", 坂の上 > 1.6, 坂の上);
  ok("坂の 先へ 抜けられる", p.z < -14, p.z);

  節("⑧ 動く 板に 連れて行かれる");
  w = new World({ killY: -20 });
  const 板 = new Solid({ type: SOLID.BOX, x: 0, y: -0.4, z: 0, hx: 3, hy: 0.4, hz: 3 });
  w.add(板, true);
  w.build();
  p.reset({ x: 0, y: 0.02, z: 0 });
  進める(p, w, 30);
  const x0 = p.x;
  for (let i = 0; i < 120; i++) { 板.x += 0.05; 板.commit(); p.step({}, w); }
  ok("板と 一緒に 動く", Math.abs((p.x - x0) - 6) < 0.4, { 動いた: (p.x - x0).toFixed(2), 板: 6 });
  ok("板から 落ちていない", p.grounded === true && p.y > -0.1, { g: p.grounded, y: p.y });

  節("⑨ トランポリン");
  w = 平地();
  w.add(new Solid({ type: SOLID.BOX, x: 0, y: 0.1, z: -3, hx: 2, hy: 0.1, hz: 2, touch: TOUCH.BOUNCE, power: 1 }));
  w.build();
  p.reset({ x: 0, y: 0.02, z: 0 });
  let 跳ねた = 0;
  for (let i = 0; i < 400; i++) { p.step({ mx: 0, mz: -1 }, w); if (p.y > 跳ねた) 跳ねた = p.y; }
  ok("大きく 跳ね上がる（3m 以上）", 跳ねた > 3, 跳ねた.toFixed(2));

  節("⑩ 弾かれる");
  w = 平地();
  w.add(new Solid({ type: SOLID.BOX, x: 0, y: 1, z: -4, hx: 1, hy: 1, hz: 1, touch: TOUCH.PUSH, power: 1 }));
  w.build();
  p.reset({ x: 0, y: 0.02, z: 0 });
  const ev = [];
  for (let i = 0; i < 200; i++) { const e = p.step({ mx: 0, mz: -1 }, w); for (const x of e) ev.push(x.t); if (p.stunned > 0) break; }
  ok("ぶつかると よろける", ev.includes("hit"), ev);
  ok("後ろへ 飛ばされる", p.vz > 1, p.vz);
  ok("よろけ中は 操作が 効かない", (() => {
    const before = p.vz;
    p.step({ mx: 0, mz: -1 }, w);
    return p.vz > before - 1.2;
  })());

  節("⑪ 落ちる");
  w = new World({ killY: -20 });
  w.build();
  p.reset({ x: 0, y: 5, z: 0 });
  let 落ちた = false;
  for (let i = 0; i < 600; i++) { const e = p.step({}, w); if (e.some((x) => x.t === "fell")) { 落ちた = true; break; } }
  ok("床が 無ければ 落ちたと 分かる", 落ちた);

  節("⑫ 決まった 歩幅");
  const fs = new FixedStepper(5);
  ok("1/60 秒 → 1 歩", fs.advance(1 / 60) === 1);
  ok("1/30 秒 → 2 歩", fs.advance(1 / 30) === 2);
  const 大 = fs.advance(1.0);
  ok("1 秒 まとめて 来ても 上限 5 歩で 止める", 大 === 5, 大);
  /* 同じ 入力なら 同じ 結果 */
  const 走らせる = () => {
    const ww = 平地();
    const pp = new Player({});
    pp.reset({ x: 0, y: 2, z: 0 });
    const 手 = [];
    for (let i = 0; i < 600; i++) {
      const inp = { mx: Math.sin(i * 0.07), mz: Math.cos(i * 0.05), jump: i % 47 === 0, jumpDown: (i % 47) < 12, dive: i % 131 === 0 };
      pp.step(inp, ww);
      if (i % 50 === 0) 手.push([pp.x.toFixed(6), pp.y.toFixed(6), pp.z.toFixed(6)].join(","));
    }
    return 手.join("|");
  };
  const a1 = 走らせる(), a2 = 走らせる();
  ok("同じ 入力 → 完全に 同じ 動き", a1 === a2);

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
