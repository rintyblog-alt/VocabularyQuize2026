/* ══════════════════════════════════════════════════════════════════════
   tests/util.test.mjs — core/util.js の試験（node --test）

   ここで守りたいのは 3 つ。
   1) 数が壊れない（NaN / Infinity が外へ出ない）。動画編集で NaN が
      1 つ漏れると 画面が黒くなるだけで原因が分からない。
   2) イージングが 0→0 / 1→1 で単調（キーフレームが行き過ぎない）。
   3) deepClone が保存形式（Date/Map/Set/バイト列）を壊さない。
      store の undo はこれ 1 本に乗っている。
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  finite, clamp, clamp01, clampInt, lerp, inverseLerp, mapRange,
  uid, deepClone, deepCloneRecursive,
  throttle, debounce, rafThrottle, once, nextFrame, sleep,
  bisect, bisectRight, sortedInsert, groupBy,
  formatBytes, formatDuration, escapeHtml,
  hexToRgb, hexToRgba, rgbToHex, hexLerp,
  EASE, easeFns, easeFor,
  isIOS, isTouch, isSafari, cssVar,
} from "../src/core/util.js";

/* ── 数の有限化 ─────────────────────────────────────────────── */

test("finite: 壊れた値は fallback に落ちる", () => {
  assert.equal(finite(1.5), 1.5);
  assert.equal(finite(NaN), 0);
  assert.equal(finite(Infinity, 7), 7);
  assert.equal(finite(-Infinity, 7), 7);
  assert.equal(finite("2.5"), 2.5);
  assert.equal(finite(undefined, 3), 3);
  assert.equal(finite(NaN, NaN), 0); // fallback も壊れていたら 0
});

test("clamp: NaN は min、±Infinity は端、逆さの範囲も扱う", () => {
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(2, 0, 1), 1);
  assert.equal(clamp(NaN, 0.2, 0.8), 0.2);
  assert.equal(clamp(Infinity, 0, 1), 1);
  assert.equal(clamp(-Infinity, 0, 1), 0);
  assert.equal(clamp(0.5, 1, 0), 0.5);   // min/max が逆でも壊れない
  assert.equal(clamp(5, 1, 0), 1);
  assert.equal(clamp(3, NaN, 10), 3);    // 壊れた min は 0 扱い
  assert.equal(clamp01(2), 1);
  assert.equal(clampInt(2.6, 0, 10), 3);
  // 返り値は常に有限
  for (const v of [NaN, Infinity, -Infinity, "x", null, undefined, {}]) {
    assert.ok(Number.isFinite(clamp(v, -5, 5)), `clamp(${String(v)})`);
  }
});

test("lerp / inverseLerp / mapRange", () => {
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(lerp(0, 10, NaN), 0);
  assert.equal(lerp(0, 10, 2), 20);           // 外挿は許す
  assert.equal(inverseLerp(0, 10, 2.5), 0.25);
  assert.equal(inverseLerp(5, 5, 9), 0);      // 0 除算を作らない
  assert.equal(mapRange(0.5, 0, 1, 0, 100), 50);
  assert.equal(mapRange(2, 0, 1, 0, 100), 200);
  assert.equal(mapRange(2, 0, 1, 0, 100, true), 100);
  // lerp と inverseLerp は互いの逆
  for (const t of [0, 0.1, 0.5, 0.9, 1]) {
    assert.ok(Math.abs(inverseLerp(-3, 7, lerp(-3, 7, t)) - t) < 1e-12);
  }
});

/* ── id ─────────────────────────────────────────────────────── */

test("uid: prefix が付き、大量に作っても衝突しない", () => {
  assert.match(uid("cl"), /^cl_[0-9a-z]+$/);
  assert.match(uid("cl_"), /^cl_[0-9a-z]+$/); // 末尾の _ は重ねない
  assert.match(uid(), /^id_/);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(uid("as"));
  assert.equal(seen.size, 20000);
});

/* ── deepClone ──────────────────────────────────────────────── */

function cloneSuite(name, clone) {
  test(`${name}: Date/Map/Set/ArrayBuffer を壊さない`, () => {
    const buf = new ArrayBuffer(8);
    new Uint8Array(buf).set([1, 2, 3, 4, 5, 6, 7, 8]);
    const src = {
      d: new Date("2026-09-17T12:34:56.789Z"),
      m: new Map([["a", 1], [2, { deep: true }]]),
      s: new Set([1, "2", 3]),
      ab: buf,
      u8: new Uint8Array([9, 8, 7]),
      f32: new Float32Array([0.5, -1.5]),
      dv: new DataView(buf, 2, 4),
      re: /ab+c/gi,
      arr: [1, [2, [3]]],
      nested: { keys: { "transform.scale": [{ t: 0, v: 1 }] } },
      nul: null,
      str: "テキスト",
    };
    const out = clone(src);

    assert.ok(out.d instanceof Date, "Date のまま");
    assert.equal(out.d.getTime(), src.d.getTime());
    assert.notEqual(out.d, src.d);

    assert.ok(out.m instanceof Map, "Map のまま");
    assert.equal(out.m.size, 2);
    assert.equal(out.m.get("a"), 1);
    assert.deepEqual(out.m.get(2), { deep: true });
    assert.notEqual(out.m.get(2), src.m.get(2), "Map の値も複製される");

    assert.ok(out.s instanceof Set, "Set のまま");
    assert.deepEqual([...out.s], [1, "2", 3]);

    assert.ok(out.ab instanceof ArrayBuffer, "ArrayBuffer のまま");
    assert.equal(out.ab.byteLength, 8);
    assert.notEqual(out.ab, src.ab);
    assert.deepEqual([...new Uint8Array(out.ab)], [1, 2, 3, 4, 5, 6, 7, 8]);

    assert.ok(out.u8 instanceof Uint8Array);
    assert.deepEqual([...out.u8], [9, 8, 7]);
    assert.ok(out.f32 instanceof Float32Array);
    assert.deepEqual([...out.f32], [0.5, -1.5]);

    assert.ok(out.dv instanceof DataView, "DataView のまま");
    assert.equal(out.dv.byteLength, 4);
    assert.equal(out.dv.getUint8(0), 3);

    assert.ok(out.re instanceof RegExp);
    assert.equal(out.re.source, "ab+c");
    assert.equal(out.re.flags, "gi");

    assert.deepEqual(out.arr, [1, [2, [3]]]);
    assert.notEqual(out.arr[1], src.arr[1]);
    assert.deepEqual(out.nested, src.nested);
    assert.notEqual(out.nested.keys["transform.scale"][0], src.nested.keys["transform.scale"][0]);
    assert.equal(out.nul, null);
    assert.equal(out.str, "テキスト");

    // 元を触っても複製は動かない（undo の前提）
    src.nested.keys["transform.scale"][0].v = 999;
    assert.equal(out.nested.keys["transform.scale"][0].v, 1);
  });

  test(`${name}: 循環参照でも落ちない`, () => {
    const a = { name: "a" };
    a.self = a;
    a.list = [a, a];
    const out = clone(a);
    assert.equal(out.self, out);
    assert.equal(out.list[0], out);
    assert.equal(out.list[1], out);
    assert.notEqual(out, a);
  });
}

cloneSuite("deepClone", deepClone);
cloneSuite("deepCloneRecursive", deepCloneRecursive);

test("deepClone: 複製できない値が混ざっても再帰版へ落ちて生き残る", () => {
  const src = { fn: () => 1, n: 5, d: new Date(0), m: new Map([["k", 1]]) };
  const out = deepClone(src);
  assert.equal(out.n, 5);
  assert.equal(out.d.getTime(), 0);
  assert.equal(out.m.get("k"), 1);
  assert.equal(typeof out.fn, "function"); // 関数は参照のまま
});

/* ── 並び ───────────────────────────────────────────────────── */

test("bisect: 境界（空・両端・重複・keyFn）", () => {
  assert.equal(bisect([], 5), 0);
  const a = [0, 1, 2, 3];
  assert.equal(bisect(a, -1), 0);
  assert.equal(bisect(a, 0), 0);      // 同じ値の左
  assert.equal(bisect(a, 0.5), 1);
  assert.equal(bisect(a, 3), 3);
  assert.equal(bisect(a, 3.0001), 4);
  assert.equal(bisect(a, 99), 4);
  assert.equal(bisect(a, NaN), 0);    // 壊れた x は 0 扱い
  const dup = [1, 2, 2, 2, 5];
  assert.equal(bisect(dup, 2), 1);
  assert.equal(bisectRight(dup, 2), 4);
  assert.equal(bisectRight([], 2), 0);
  assert.equal(bisectRight(a, -1), 0);
  assert.equal(bisectRight(a, 99), 4);
  // keyFn（Keyframe の配列を t で引く形）
  const keys = [{ t: 0 }, { t: 0.5 }, { t: 2 }];
  const byT = (k) => k.t;
  assert.equal(bisect(keys, 0.5, byT), 1);
  assert.equal(bisect(keys, 0.6, byT), 2);
  assert.equal(bisect(keys, 5, byT), 3);
  // 「その時刻で有効な最後のキー」= bisectRight - 1
  assert.equal(bisectRight(keys, 0.7, byT) - 1, 1);
});

test("sortedInsert: 昇順を保ち、同じキーは後ろへ", () => {
  const arr = [];
  const byT = (k) => k.t;
  sortedInsert(arr, { t: 2, id: "a" }, byT);
  sortedInsert(arr, { t: 0, id: "b" }, byT);
  sortedInsert(arr, { t: 1, id: "c" }, byT);
  const i = sortedInsert(arr, { t: 1, id: "d" }, byT);
  assert.deepEqual(arr.map((k) => k.id), ["b", "c", "d", "a"]);
  assert.equal(i, 2);
  // 素の数値でも使える
  const n = [1, 3, 5];
  assert.equal(sortedInsert(n, 4), 2);
  assert.deepEqual(n, [1, 3, 4, 5]);
});

test("groupBy: Object.groupBy と同じ形（素のオブジェクト）", () => {
  const clips = [
    { kind: "video", id: 1 }, { kind: "audio", id: 2 }, { kind: "video", id: 3 },
  ];
  const g = groupBy(clips, (c) => c.kind);
  assert.deepEqual(Object.keys(g), ["video", "audio"]);
  assert.deepEqual(g.video.map((c) => c.id), [1, 3]);
  assert.deepEqual(g.audio.map((c) => c.id), [2]);
  assert.equal(g.constructor, undefined, "prototype 無し = constructor キーと衝突しない");
  assert.deepEqual(Object.keys(groupBy([], (x) => x)), []);
  assert.deepEqual(Object.keys(groupBy(null, (x) => x)), []);
});

/* ── 関数の間引き ───────────────────────────────────────────── */

test("once: 1 回だけ走る", () => {
  let n = 0;
  const f = once(() => ++n);
  assert.equal(f(), 1);
  assert.equal(f(), 1);
  assert.equal(f(), 1);
  assert.equal(n, 1);
});

test("debounce: 静かになってから 1 回・cancel と flush が効く", async () => {
  let calls = [];
  const f = debounce((v) => calls.push(v), 20);
  f(1); f(2); f(3);
  assert.deepEqual(calls, [], "同期では呼ばない");
  await sleep(60);
  assert.deepEqual(calls, [3], "最後の引数で 1 回");

  calls = [];
  f(4); f.cancel();
  await sleep(60);
  assert.deepEqual(calls, [], "cancel で消える");

  calls = [];
  f(5); f.flush();
  assert.deepEqual(calls, [5], "flush で即時");
});

test("throttle: 先頭は即時、まとめて 2 回目は後から", async () => {
  const calls = [];
  const f = throttle((v) => calls.push(v), 30);
  f(1);
  assert.deepEqual(calls, [1], "先頭は即時");
  f(2); f(3);
  assert.deepEqual(calls, [1], "間は溜める");
  await sleep(80);
  assert.deepEqual(calls, [1, 3], "最後の引数で 1 回だけ追う");
  f.cancel();
});

test("rafThrottle: 1 フレームに 1 回へ間引く（Node では setTimeout 代用）", async () => {
  const calls = [];
  const f = rafThrottle((v) => calls.push(v));
  f("a"); f("b"); f("c");
  assert.deepEqual(calls, []);
  await sleep(60);
  assert.deepEqual(calls, ["c"]);
  f("d"); f.cancel();
  await sleep(60);
  assert.deepEqual(calls, ["c"], "cancel 後は呼ばれない");
});

test("nextFrame / sleep は必ず解決する", async () => {
  await nextFrame();
  const t0 = Date.now();
  await sleep(10);
  assert.ok(Date.now() - t0 >= 5);
});

/* ── 見せ方 ─────────────────────────────────────────────────── */

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(-5), "0 B");
  assert.equal(formatBytes(NaN), "0 B");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(12345678), "11.8 MB");
  assert.equal(formatBytes(1024 ** 4), "1.0 TB");
});

test("formatDuration: 秒 → 1:23", () => {
  assert.equal(formatDuration(83), "1:23");
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(9.4), "0:09");
  assert.equal(formatDuration(59.6), "1:00", "繰り上がりで 0:60 にしない");
  assert.equal(formatDuration(3723), "1:02:03");
  assert.equal(formatDuration(-83), "-1:23");
  assert.equal(formatDuration(NaN), "0:00");
  assert.equal(formatDuration(Infinity), "0:00");
  assert.equal(formatDuration(83.44, { decimals: 1 }), "1:23.4");
  assert.equal(formatDuration(83.456, { decimals: 3 }), "1:23.456");
  assert.equal(formatDuration(83.04, { decimals: 1 }), "1:23.0");
});

test("escapeHtml", () => {
  assert.equal(escapeHtml(`<img src=x onerror="y">&'`), "&lt;img src=x onerror=&quot;y&quot;&gt;&amp;&#39;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(5), "5");
});

/* ── 色 ─────────────────────────────────────────────────────── */

test("hexToRgb / rgbToHex: 3・4・6・8 桁を読み、往復する", () => {
  assert.deepEqual(hexToRgb("#000000"), [0, 0, 0]);
  assert.deepEqual(hexToRgb("#ffffff"), [1, 1, 1]);
  assert.deepEqual(hexToRgb("#fff"), [1, 1, 1]);
  assert.deepEqual(hexToRgb("ff0000"), [1, 0, 0], "# が無くても読む");
  const g = hexToRgb("#808080");
  assert.ok(Math.abs(g[0] - 128 / 255) < 1e-12);
  assert.deepEqual(hexToRgba("#0008"), [0, 0, 0, 0x88 / 255]);
  assert.deepEqual(hexToRgba("#ff000080"), [1, 0, 0, 0x80 / 255]);
  // 読めないものは null（throw しない）
  for (const bad of ["", "#", "#12", "#12345", "xyz", "#gggggg", null, undefined, 123, {}]) {
    assert.equal(hexToRgb(/** @type {any} */ (bad)), null, `hexToRgb(${String(bad)})`);
  }
  assert.equal(rgbToHex([1, 0, 0]), "#ff0000");
  assert.equal(rgbToHex(0, 0, 0), "#000000");
  assert.equal(rgbToHex([2, -1, NaN]), "#ff0000", "範囲外は収める");
  for (const h of ["#000000", "#ffffff", "#4f8cff", "#123456", "#0a0b0c"]) {
    assert.equal(rgbToHex(/** @type {any} */ (hexToRgb(h))), h, `往復 ${h}`);
  }
});

test("hexLerp", () => {
  assert.equal(hexLerp("#000000", "#ffffff", 0), "#000000");
  assert.equal(hexLerp("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(hexLerp("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(hexLerp("#ff0000", "#0000ff", 0.5), "#800080");
  assert.equal(hexLerp("#000000", "#ffffff", -5), "#000000", "t は 0..1 に収める");
  assert.equal(hexLerp("#000000", "#ffffff", 5), "#ffffff");
  assert.equal(hexLerp("#000000", "#ffffff", NaN), "#000000");
  // 片方が壊れていても既定へ落ちる
  assert.equal(hexLerp("bogus", "#ff0000", 0.5), "#ff0000");
  assert.equal(hexLerp("#ff0000", "bogus", 0.5), "#ff0000");
  assert.equal(hexLerp("bogus", "bogus", 0.5), "#000000");
  // 単調（中間は必ず両端の間）
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = hexToRgb(hexLerp("#000000", "#ffffff", i / 20))[0];
    assert.ok(v >= prev, "灰色は明るくなる一方");
    prev = v;
  }
});

/* ── イージング ─────────────────────────────────────────────── */

/** 試験側で独立に計算する 3 次ベジェ（両端 0,1 固定） */
const bez = (u, p1, p2) => {
  const v = 1 - u;
  return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
};

test("EASE: 全て 0→0 / 1→1", () => {
  for (const name of ["linear", "in", "out", "inout", "hold"]) {
    assert.equal(EASE[name](0), 0, `${name}(0)`);
    assert.equal(EASE[name](1), 1, `${name}(1)`);
  }
  assert.equal(easeFns, EASE, "契約書 §3 の easeFns は同じ物");
});

test("EASE: linear/in/out/inout は単調・範囲内", () => {
  for (const name of ["linear", "in", "out", "inout"]) {
    const f = EASE[name];
    let prev = -Infinity;
    for (let i = 0; i <= 500; i++) {
      const y = f(i / 500);
      assert.ok(Number.isFinite(y), `${name} が有限`);
      assert.ok(y >= -1e-12 && y <= 1 + 1e-12, `${name} が 0..1`);
      assert.ok(y >= prev - 1e-12, `${name} が単調`);
      prev = y;
    }
    // 引数が壊れていても範囲内
    assert.equal(f(NaN), 0);
    assert.equal(f(5), 1);
    assert.equal(f(-5), 0);
  }
  assert.ok(EASE.in(0.5) < 0.5, "in は序盤が遅い");
  assert.ok(EASE.out(0.5) > 0.5, "out は序盤が速い");
  assert.ok(Math.abs(EASE.inout(0.5) - 0.5) < 1e-12);
  assert.equal(EASE.linear(0.33), 0.33);
});

test("EASE.hold は階段（次のキーまで値を保つ）", () => {
  assert.equal(EASE.hold(0), 0);
  assert.equal(EASE.hold(0.999), 0);
  assert.equal(EASE.hold(1), 1);
  assert.equal(EASE.hold(2), 1);
});

test("EASE.cubicBezier: 0→0 / 1→1 で単調", () => {
  const sets = [
    [0.25, 0.1, 0.25, 1],   // CSS ease
    [0.42, 0, 0.58, 1],     // ease-in-out
    [0.42, 0, 1, 1],        // ease-in
    [0, 0, 0.58, 1],        // ease-out
    [0.5, 0, 0.5, 1],
    [1, 0, 0, 1],           // 端が寝ている形
    [0, 0.7, 0, 1],         // x の傾きが端で 0 になる形（解きにくい）
  ];
  for (const s of sets) {
    const f = EASE.cubicBezier(...s);
    assert.equal(f(0), 0, `${s} の f(0)`);
    assert.equal(f(1), 1, `${s} の f(1)`);
    let prev = -Infinity;
    for (let i = 0; i <= 1000; i++) {
      const y = f(i / 1000);
      assert.ok(Number.isFinite(y), `${s} が有限`);
      assert.ok(y >= prev - 1e-9, `${s} が単調（i=${i}）`);
      prev = y;
    }
  }
});

test("EASE.cubicBezier: x→t の解が正しい（独立計算と一致）", () => {
  for (const s of [[0.25, 0.1, 0.25, 1], [0.42, 0, 0.58, 1], [0.68, 0.2, 0.27, 0.9]]) {
    const f = EASE.cubicBezier(...s);
    for (let i = 1; i < 200; i++) {
      const u = i / 200;
      const x = bez(u, s[0], s[2]);
      const y = bez(u, s[1], s[3]);
      assert.ok(Math.abs(f(x) - y) < 1e-6, `${s} u=${u}: ${f(x)} vs ${y}`);
    }
  }
  // 中央対称な曲線は f(0.5)=0.5
  assert.ok(Math.abs(EASE.cubicBezier(0.42, 0, 0.58, 1)(0.5) - 0.5) < 1e-6);
  // 直線と同じ制御点は linear そのもの
  assert.equal(EASE.cubicBezier(0, 0, 1, 1), EASE.linear);
  // 壊れた引数でも 0..1 の関数になる
  const bad = EASE.cubicBezier(NaN, NaN, Infinity, "x");
  assert.equal(bad(0), 0);
  assert.equal(bad(1), 1);
  assert.ok(Number.isFinite(bad(0.5)));
});

test("easeFor: Keyframe の ease 名から関数を引く", () => {
  assert.equal(easeFor("linear"), EASE.linear);
  assert.equal(easeFor("hold"), EASE.hold);
  assert.equal(easeFor(undefined), EASE.linear);
  assert.equal(easeFor("しらない名前"), EASE.linear, "知らない名前でも再生を止めない");
  assert.equal(easeFor("cubicBezier"), EASE.linear, "関数そのものは引けない");
  const f = easeFor("bezier", [0.42, 0, 0.58, 1]);
  assert.equal(f(0), 0);
  assert.equal(f(1), 1);
  assert.ok(Math.abs(f(0.5) - 0.5) < 1e-6);
  const g = easeFor("bezier", null); // bez 無しでも CSS ease に落ちる
  assert.equal(g(0), 0);
  assert.equal(g(1), 1);
});

/* ── 環境判定（Node でも落ちない） ──────────────────────────── */

test("環境判定は Node でも throw しない", () => {
  assert.equal(typeof isIOS(), "boolean");
  assert.equal(typeof isTouch(), "boolean");
  assert.equal(typeof isSafari(), "boolean");
  assert.equal(cssVar("--vq-bg"), "");
  assert.equal(cssVar("vq-bg", "#111"), "#111");
});
