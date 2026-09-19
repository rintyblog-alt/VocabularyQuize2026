/* ══════════════════════════════════════════════════════════════════════
   studio/tests/schema.test.mjs — core/schema.js の試験

   ★ 何を見ているか（契約書 §1 §2 の不変条件そのもの）
     1. 既定値: default* と new* が §1 の既定値ちょうどを返し、欠けた枝を埋めること
     2. normalizeProject: 並べ替え・最短尺・重なり解消（**前を縮める**）・
        遷移の収まり・keys の昇順と重複除去・副作用なし・**冪等**
     3. validateProject: 壊れた project の誤りを漏れなく出し、直さないこと
     4. getPath / setPath の三形（"transform.scale" / "fx.fx_1.amount" /
        "color.wheels.lift.0"）
     5. projectDuration / clipSourceDuration / clipMaxDuration
     6. migrate: schema 1 → 3, 2 → 3, 未知の未来版は throw
     7. cloneClip / cloneTrack が id と keys の指し先を壊さないこと

   走らせ方: node --test studio/tests/schema.test.mjs
   ══════════════════════════════════════════════════════════════════════ */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION, MIN_CLIP, MAX_TRACKS, BLEND_MODES, RATIOS, KEYABLE_PATHS,
  newProject, newTrack, newClip, newAsset, newMarker, newChapter,
  defaultColorGrade, defaultTextSpec, defaultTextStyle, defaultTransform, defaultShape,
  normalizeProject, validateProject, migrate,
  cloneClip, cloneTrack, clipEnd, trackEnd, projectDuration,
  findClip, assetById, tracksByKind,
  isKeyablePath, getPath, setPath,
  clipSourceDuration, clipMaxDuration
} from "../src/core/schema.js";

/* ── 道具 ─────────────────────────────────────────────────────── */

const J = (v) => JSON.stringify(v);
/** 素材つきの project を組む（clip が灰色に落ちないように） */
function fixture(clips, extra) {
  return Object.assign({
    assets: [
      { id: "as_1", kind: "video", name: "a.mp4", mime: "video/mp4", duration: 30, storage: { kind: "idb", key: "k1" } },
      { id: "as_2", kind: "image", name: "b.png", mime: "image/png", duration: 0, storage: { kind: "idb", key: "k2" } },
      { id: "as_3", kind: "audio", name: "c.m4a", mime: "audio/mp4", duration: 60, storage: { kind: "idb", key: "k3" } }
    ],
    tracks: [{ id: "tr_1", kind: "video", name: "V1", clips }]
  }, extra || {});
}

/* ── 1. 定数と既定値 ──────────────────────────────────────────── */

test("定数が契約どおり", () => {
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(MIN_CLIP, 0.04);
  assert.equal(MAX_TRACKS, 24);
  assert.ok(BLEND_MODES.includes("normal") && BLEND_MODES.includes("softlight"));
  for (const k of ["16:9", "9:16", "1:1", "4:5", "4:3", "2.35:1", "custom"]) {
    assert.ok(RATIOS[k], `RATIOS に ${k} が無い`);
    assert.ok(RATIOS[k].w >= 2 && RATIOS[k].h >= 2);
    assert.equal(RATIOS[k].h % 2, 0, `${k} の高さは偶数であること`);
  }
  assert.deepEqual({ w: RATIOS["16:9"].w, h: RATIOS["16:9"].h }, { w: 1920, h: 1080 });
  assert.deepEqual({ w: RATIOS["9:16"].w, h: RATIOS["9:16"].h }, { w: 1080, h: 1920 });
});

test("default* が §1 の既定値ちょうどを返し、毎回別の object である", () => {
  const t = defaultTransform();
  assert.deepEqual(t, {
    x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0,
    anchorX: 0.5, anchorY: 0.5, flipH: false, flipV: false, crop: { l: 0, t: 0, r: 0, b: 0 }
  });
  assert.notEqual(defaultTransform(), defaultTransform());
  t.crop.l = 0.5;
  assert.equal(defaultTransform().crop.l, 0, "既定値を共有していない");

  const g = defaultColorGrade();
  assert.equal(g.exposure, 0);
  assert.equal(g.saturation, 0);
  assert.deepEqual(g.curves.rgb, [[0, 0], [1, 1]]);
  assert.equal(g.curves.r, null);
  assert.deepEqual(g.wheels, { lift: [0, 0, 0], gamma: [0, 0, 0], gain: [0, 0, 0], offset: [0, 0, 0] });
  assert.equal(g.hsl.length, 1);
  assert.equal(g.lut, null);

  const ts = defaultTextStyle();
  assert.equal(ts.size, 64);
  assert.equal(ts.weight, 700);
  assert.equal(ts.color, "#ffffff");
  const spec = defaultTextSpec();
  assert.equal(spec.content, "テキスト");
  assert.equal(spec.layout.lineHeight, 1.25);
  assert.equal(spec.anim.in.type, "fadeUp");
  assert.equal(spec.anim.unit, "all");
  assert.deepEqual(defaultShape(), { type: "rect", fill: "#fff", stroke: { width: 0, color: "#000" }, radius: 0, w: 0.3, h: 0.2 });
});

test("new* が既定で埋め、partial は深く重なる", () => {
  const p = newProject();
  assert.equal(p.schema, 3);
  assert.equal(p.name, "無題のプロジェクト");
  assert.deepEqual(p.tracks, []);
  assert.deepEqual(p.assets, []);
  assert.equal(p.settings.width, 1920);
  assert.equal(p.settings.fps, 30);
  assert.equal(p.settings.ratio, "16:9");
  assert.equal(p.settings.audio.master, 1);
  assert.equal(p.settings.background.type, "color");
  assert.deepEqual(p.meta.aiHistory, []);
  assert.equal(validateProject(p).ok, true, J(validateProject(p).errors));

  const p2 = newProject({ name: "縦動画", settings: { ratio: "9:16", width: 1080, height: 1920 } });
  assert.equal(p2.name, "縦動画");
  assert.equal(p2.settings.height, 1920);
  assert.equal(p2.settings.fps, 30, "触っていない枝は既定のまま");

  const tr = newTrack("audio");
  assert.equal(tr.kind, "audio");
  assert.equal(tr.name, "A1");
  assert.equal(tr.height, 72);
  assert.deepEqual(tr.clips, []);
  assert.equal(newTrack("そんなの無い").kind, "video", "知らない kind は video に落ちる");

  const cl = newClip("video");
  assert.equal(cl.duration, 4);
  assert.equal(cl.out, 4);
  assert.equal(cl.opacity, 1);
  assert.equal(cl.blend, "normal");
  assert.equal(cl.label, "#4f8cff");
  assert.deepEqual(cl.keys, {});
  assert.deepEqual(cl.transform, defaultTransform());
  assert.equal(cl.text, null);
  assert.equal(cl.shape, null);

  const txt = newClip("text", { text: { content: "こんにちは" } });
  assert.equal(txt.text.content, "こんにちは");
  assert.equal(txt.text.style.size, 64, "style が消えていない（深く重ねる）");
  assert.equal(newClip("shape").shape.type, "rect");
  assert.deepEqual(newClip("compound").compound, { tracks: [] });

  // duration だけ渡したら out が付いて来る（素材側とタイムラインがずれない）
  const sp = newClip("video", { duration: 2, speed: 2 });
  assert.equal(sp.out, 4);

  const as = newAsset({ mime: "image/png" });
  assert.equal(as.kind, "image");
  assert.equal(as.duration, 0, "image の尺は 0（§1）");
  assert.equal(newAsset({ mime: "audio/mpeg" }).kind, "audio");
  assert.equal(newMarker({ t: 3 }).t, 3);
  assert.equal(newMarker().color, "#ffcc00");
  assert.equal(newChapter({ title: "章" }).title, "章");
});

/* ── 2. normalizeProject ─────────────────────────────────────── */

test("normalizeProject: 欠けた枝を既定で埋める", () => {
  const p = normalizeProject({ tracks: [{ kind: "video", clips: [{ kind: "text" }] }] });
  assert.equal(p.schema, 3);
  assert.ok(p.id);
  assert.equal(p.name, "無題のプロジェクト");
  assert.deepEqual(p.settings, newProject().settings);
  assert.deepEqual(p.markers, []);
  assert.deepEqual(p.chapters, []);
  assert.deepEqual(p.subtitleStyle, defaultTextStyle());
  assert.deepEqual(p.meta.aiHistory, []);
  const c = p.tracks[0].clips[0];
  assert.deepEqual(c.transform, defaultTransform());
  assert.deepEqual(c.keys, {});
  assert.equal(c.duration, 4);
  assert.equal(c.opacity, 1);
  assert.equal(c.blend, "normal");
  assert.equal(c.text.content, "テキスト");
  assert.equal(c.label, "#4f8cff");
  assert.ok(c.id && p.tracks[0].id);
  assert.equal(validateProject(p).ok, true, J(validateProject(p).errors));
});

test("normalizeProject: 型を直す", () => {
  const p = normalizeProject(fixture([{
    id: "cl_1", kind: "video", assetId: "as_1", start: "2", duration: "3", in: "1", out: "4",
    opacity: 5, blend: "存在しない", speed: -2, volume: "x", label: "青", locked: 1,
    transform: { scale: "2", crop: { l: 0.9, r: 0.9 } }
  }], { settings: { width: 1921, height: 1081, fps: 1000, ratio: "7:3", previewQuality: "ultra" } }));
  const c = p.tracks[0].clips[0];
  assert.equal(c.start, 2);
  assert.equal(c.duration, 3);
  assert.equal(c.opacity, 1, "0..1 に収める");
  assert.equal(c.blend, "normal", "知らない合成モードは normal");
  assert.equal(c.speed, 2, "速度は絶対値（負にはしない）");
  assert.equal(c.volume, 1);
  assert.equal(c.locked, true);
  assert.equal(c.label, "#4f8cff", "色として読めない label は既定");
  assert.equal(c.transform.scale, 2);
  assert.ok(c.transform.crop.l + c.transform.crop.r <= 0.98 + 1e-9, "切り落としで幅 0 にならない");
  assert.equal(p.settings.width % 2, 0);
  assert.equal(p.settings.height % 2, 0);
  assert.equal(p.settings.fps, 240);
  assert.equal(p.settings.ratio, "custom", "知らない比率は custom");
  assert.equal(p.settings.previewQuality, "auto");
});

test("normalizeProject: clip を start 昇順に並べ、MIN_CLIP 未満を切り上げる", () => {
  const p = normalizeProject(fixture([
    { id: "c3", kind: "video", assetId: "as_1", start: 9, duration: 1, in: 0, out: 1 },
    { id: "c1", kind: "video", assetId: "as_1", start: 0, duration: 0.001, in: 0, out: 1 },
    { id: "c2", kind: "video", assetId: "as_1", start: 4, duration: 2, in: 0, out: 2 }
  ]));
  const cl = p.tracks[0].clips;
  assert.deepEqual(cl.map((c) => c.id), ["c1", "c2", "c3"]);
  assert.equal(cl[0].duration, MIN_CLIP);
  assert.ok(cl[0].start <= cl[1].start && cl[1].start <= cl[2].start);
});

test("normalizeProject: 重なりは **前の clip を縮めて** 解消する（後ろは動かさない）", () => {
  const p = normalizeProject(fixture([
    { id: "a", kind: "video", assetId: "as_1", start: 0, duration: 5, in: 0, out: 5 },
    { id: "b", kind: "video", assetId: "as_1", start: 3, duration: 4, in: 10, out: 14 }
  ]));
  const [a, b] = p.tracks[0].clips;
  assert.equal(b.start, 3, "後ろの clip は置いた場所から動かない");
  assert.equal(b.duration, 4, "後ろの clip の尺も変わらない");
  assert.ok(Math.abs(a.duration - 3) < 1e-9, "前の clip が重なった分だけ縮む");
  assert.ok(Math.abs(a.out - 3) < 1e-9, "素材側の範囲も一緒に詰まる");
  assert.equal(validateProject(p).ok, true, J(validateProject(p).errors));

  // 縮めても最短尺を切る（丸ごと飲み込まれた）ときだけ、仕方なく後ろを退かす
  const q = normalizeProject(fixture([
    { id: "a", kind: "video", assetId: "as_1", start: 1, duration: 5, in: 0, out: 5 },
    { id: "b", kind: "video", assetId: "as_1", start: 1, duration: 2, in: 0, out: 2 }
  ]));
  const cl = q.tracks[0].clips;
  assert.equal(cl.length, 2, "クリップを消さない");
  assert.ok(Math.abs(cl[0].duration - MIN_CLIP) < 1e-9);
  assert.ok(Math.abs(cl[1].start - (1 + MIN_CLIP)) < 1e-9);
  assert.equal(validateProject(q).ok, true, J(validateProject(q).errors));
});

test("normalizeProject: 遷移の長さを隣との余裕に収める", () => {
  const p = normalizeProject(fixture([
    { id: "a", kind: "video", assetId: "as_1", start: 0, duration: 4, in: 0, out: 4, transitionOut: { type: "crossfade", duration: 9 } },
    { id: "b", kind: "video", assetId: "as_1", start: 4, duration: 1, in: 0, out: 1, transitionIn: { type: "whipPan", duration: 3 }, transitionOut: { type: "fade", duration: 0 } }
  ]));
  const [a, b] = p.tracks[0].clips;
  assert.equal(a.transitionOut.duration, 0.5, "min(4,1)/2 = 0.5 に収まる");
  assert.equal(a.transitionOut.type, "crossfade");
  assert.equal(b.transitionIn.duration, 0.5);
  assert.equal(b.transitionOut, null, "長さ 0 の遷移は ただのカット = null");
  assert.ok(b.transitionIn.duration + (b.transitionOut ? b.transitionOut.duration : 0) <= b.duration);
  assert.equal(validateProject(p).ok, true, J(validateProject(p).errors));
});

test("normalizeProject: keys は t 昇順・重複除去。空の path は残さない", () => {
  const p = normalizeProject(fixture([{
    id: "a", kind: "video", assetId: "as_1", start: 0, duration: 4, in: 0, out: 4,
    keys: {
      "opacity": [{ t: 2, v: 1 }, { t: 0, v: 0 }, { t: 2, v: 0.5 }, { t: -3, v: 0.25 }],
      "transform.scale": [{ t: 1, v: "こわれた" }, { t: 0.5, v: 2 }],
      "text.style.color": [{ t: 0, v: "#ff0000" }, { t: 1, v: "#00ff00", ease: "bezier" }],
      "空っぽ": [],
      "壊れたのだけ": [{ t: "あ", v: 1 }]
    }
  }]));
  const k = p.tracks[0].clips[0].keys;
  assert.deepEqual(k.opacity.map((x) => x.t), [0, 2], "t 昇順・重複は 1 つに");
  assert.equal(k.opacity[0].t, 0);
  assert.equal(k.opacity[1].v, 0.5, "同じ t は後から来た方が勝つ");
  assert.equal(k.opacity[0].ease, "linear");
  assert.deepEqual(k["transform.scale"].map((x) => x.t), [0.5], "数でない v は捨てる");
  assert.equal(k["text.style.color"][0].v, "#ff0000", "色は文字のまま");
  assert.deepEqual(k["text.style.color"][1].bez.length, 4, "bezier には bez が付く");
  assert.ok(!("空っぽ" in k));
  assert.ok(!("壊れたのだけ" in k));
});

test("normalizeProject: 素材が無い clip は §1-5 のとおり灰色の図形へ落とす", () => {
  const p = normalizeProject(fixture([
    { id: "a", kind: "video", assetId: "as_消えた", start: 0, duration: 2, in: 0, out: 2 }
  ]));
  const c = p.tracks[0].clips[0];
  assert.equal(c.kind, "shape");
  assert.equal(c.assetId, null);
  assert.ok(c.shape, "図形の枝が入る");
  assert.notEqual(c.shape.fill, "#fff", "灰色（既定の白ではない）");
  assert.equal(c.duration, 2, "尺と位置は残す");
  assert.equal(validateProject(p).ok, true, J(validateProject(p).errors));

  // 素材を **一度も指していない** メディアクリップも同じ扱い（§1-5 の「無ければ」）。
  //   ＝ ops / ai は video/image/audio の clip を必ず assetId 付きで作ること。
  const q = normalizeProject(fixture([{ id: "a", kind: "video", start: 0, duration: 2 }]));
  assert.equal(q.tracks[0].clips[0].kind, "shape");
  assert.equal(validateProject(q).ok, true, J(validateProject(q).errors));

  // 素材が要らない kind（text 等）の迷子の assetId は 落とすだけで clip は残す
  const r = normalizeProject(fixture([{ id: "a", kind: "text", assetId: "as_消えた", start: 0, duration: 2 }]));
  assert.equal(r.tracks[0].clips[0].kind, "text");
  assert.equal(r.tracks[0].clips[0].assetId, null);
  assert.equal(validateProject(r).ok, true, J(validateProject(r).errors));

  // compound は入れ子のタイムラインが素材なので assetId を持たない
  const z = normalizeProject(fixture([{ id: "a", kind: "compound", assetId: "as_1", start: 0, duration: 2, in: 0, out: 2, compound: { tracks: [] } }]));
  assert.equal(z.tracks[0].clips[0].kind, "compound");
  assert.equal(z.tracks[0].clips[0].assetId, null);
});

test("normalizeProject: 整えた結果は必ず validate を通る（乱雑な入力でも）", () => {
  // 冪等と「直せる物は直す」を 1 か所で確かめる（fuzz の縮小版）
  const p = normalizeProject(messy());
  assert.equal(validateProject(p).ok, true, J(validateProject(p).errors));
  for (const bad of [{ tracks: [{ clips: [{}, {}, {}] }] }, { tracks: [{ kind: "audio", clips: [{ kind: "audio" }] }] }]) {
    const n1 = normalizeProject(bad);
    assert.deepEqual(normalizeProject(n1), n1);
    assert.equal(validateProject(n1).ok, true, J(validateProject(n1).errors));
  }
});

test("normalizeProject: トラック上限・id の重複・マーカーの並び", () => {
  const tracks = [];
  for (let i = 0; i < 30; i++) tracks.push({ id: "tr_同じ", kind: "video", clips: [] });
  const p = normalizeProject({
    tracks,
    markers: [{ id: "m2", t: 5 }, { id: "m1", t: 1 }],
    chapters: [{ id: "c2", t: 9, title: "後" }, { id: "c1", t: 2, title: "前" }]
  });
  assert.equal(p.tracks.length, MAX_TRACKS, "上限で切る");
  assert.equal(new Set(p.tracks.map((t) => t.id)).size, MAX_TRACKS, "id が重複しない");
  assert.deepEqual(p.markers.map((m) => m.t), [1, 5]);
  assert.deepEqual(p.chapters.map((c) => c.title), ["前", "後"]);
  assert.equal(validateProject(p).ok, true, J(validateProject(p).errors));
});

/** 散らかった project（冪等・副作用なしの試験で使う） */
function messy() {
  return {
    schema: 3, id: "prj_1", name: "", createdAt: 111, updatedAt: 222,
    settings: { width: 1921, height: 0, fps: "24", ratio: "unknown", sampleRate: 1, background: { type: "変", blur: 999, assetId: "as_無い" }, audio: { master: 9 }, previewQuality: "x" },
    assets: [
      { id: "as_1", kind: "video", mime: "video/mp4", duration: 12, storage: { kind: "idb", key: "k1" }, rotation: 45, size: "10" },
      { id: "as_1", kind: "image", mime: "image/png", duration: 8, storage: { kind: "idb", key: "k2" } },
      { kind: "audio", mime: "audio/mp4", duration: 30, storage: { kind: "idb", key: "k3" } }
    ],
    tracks: [
      {
        id: "tr_1", kind: "video", height: 5, volume: 9, pan: -9, fx: [{ id: "f", type: "bloom" }, { id: "f", type: "glow" }],
        clips: [
          { id: "x", kind: "video", assetId: "as_1", start: 8, duration: 5, in: 0, out: 5, transitionIn: { type: "crossfade", duration: 8 } },
          { id: "x", kind: "video", assetId: "as_1", start: 0, duration: 9, in: 2, out: 99, speed: 0, opacity: -1, blend: "変", keys: { "opacity": [{ t: 3, v: 1 }, { t: 3, v: 0 }, { t: 1, v: 0.5 }], "だめな path": [{ t: 0, v: 1 }] }, color: { exposure: "0.5", hsl: [], curves: { rgb: "x" } }, mask: { type: "変", feather: 9 }, chroma: { similarity: 9 }, fx: [{ type: "glitch", params: { amount: 2, s: "a", arr: [1, "b", {}] } }] },
          { id: "y", kind: "text", start: 3, duration: 0.001, text: { content: "字", style: { size: -5 } }, speedRamp: [{ t: 1, v: 2 }, { t: 0, v: 3 }, { t: 1, v: 4 }] },
          { id: "z", kind: "compound", start: 20, duration: 3, in: 0, out: 3, compound: { tracks: [{ id: "tr_in", kind: "video", clips: [{ id: "w", kind: "image", assetId: "as_1", start: 1, duration: 1 }] }] } }
        ]
      },
      { kind: "audio", clips: [{ id: "s1", kind: "audio", assetId: "as_1", start: 0, duration: 4, in: 0, out: 4, audioFade: { in: -1, curve: "変" } }] }
    ],
    markers: [{ id: "m1", t: 9 }, { t: -2 }],
    chapters: [{ t: 3, title: "章" }],
    subtitleStyle: { size: "40", color: "赤" },
    meta: { aiHistory: [{ prompt: "速く" }], 自作の印: 1 },
    知らない枝: "落ちる"
  };
}

test("normalizeProject: 入力を書き換えない（副作用なし）", () => {
  const p = messy();
  const before = J(p);
  normalizeProject(p);
  assert.equal(J(p), before, "入力が汚れている（store の undo が壊れる）");
});

test("normalizeProject: 冪等（normalize(normalize(p)) が deepEqual）", () => {
  const once = normalizeProject(messy());
  const twice = normalizeProject(once);
  assert.deepEqual(twice, once);
  const thrice = normalizeProject(twice);
  assert.deepEqual(thrice, once);
  // 整えた結果が §1 を満たしていること（直せない物が残っていないこと）
  const res = validateProject(once);
  assert.equal(res.ok, true, J(res.errors));
  assert.ok(!("知らない枝" in once), "契約に無い枝は落とす");
  assert.equal(once.meta.自作の印, 1, "meta の中身は残す");
  assert.deepEqual(once.meta.aiHistory, [{ prompt: "速く" }]);
});

test("normalizeProject: 壊れた入力でも throw しない", () => {
  for (const bad of [undefined, null, 0, "", [], { tracks: 3 }, { tracks: [null, 1] }, { assets: null }]) {
    const p = normalizeProject(bad);
    assert.equal(p.schema, 3);
    assert.ok(Array.isArray(p.tracks));
    assert.equal(validateProject(p).ok, true, J(validateProject(p).errors));
  }
});

/* ── 3. validateProject ─────────────────────────────────────── */

function brokenProject() {
  return {
    schema: 2,
    settings: { width: 1921, height: 0, fps: 0, ratio: "5:4", sampleRate: 100, previewQuality: "ultra" },
    assets: [
      { id: "as_1", kind: "video", duration: 10, storage: { kind: "idb", key: "k" } },
      { id: "as_1", kind: "movie", duration: -1 }
    ],
    tracks: [{
      id: "tr_1", kind: "へん", clips: [
        {
          id: "cl_1", kind: "video", assetId: "as_1", start: 0, duration: 5, in: 0, out: 5,
          opacity: 2, blend: "foo", transitionOut: { type: "crossfade", duration: 9 },
          keys: {
            "opacity": [{ t: 1, v: 0 }, { t: 0.5, v: 1 }],
            "transform.scale": [{ t: 0, v: 1 }, { t: 0, v: 2 }],
            "だめな path": [{ t: 0, v: 1 }],
            "volume": [{ t: 0, v: "赤" }]
          }
        },
        { id: "cl_1", kind: "video", assetId: "as_消えた", start: 2, duration: 0.01, in: -1, out: -2 },
        { id: "cl_3", kind: "そんな種類は無い", start: 1, duration: 1 },
        { id: "cl_4", kind: "video", assetId: "as_1", start: 40, duration: 2, in: 0, out: 99 },
        { id: "cl_5", kind: "text", start: 50, duration: 1 }
      ]
    }],
    markers: [{ id: "mk_1", t: -1 }]
  };
}

test("validateProject: 壊れた project の誤りを漏れなく出す", () => {
  const res = validateProject(brokenProject());
  assert.equal(res.ok, false);
  const paths = res.errors.map((e) => e.path);
  const has = (p) => assert.ok(paths.some((x) => x === p || x.startsWith(p)), `${p} の誤りが出ていない\n出たもの: ${paths.join("\n")}`);
  has("schema");
  has("settings.width");
  has("settings.height");
  has("settings.fps");
  has("assets[1].id");            // id の重複
  has("assets[1].kind");          // 知らない種類
  has("assets[1].duration");      // 負の尺
  has("tracks[0].kind");          // 知らないトラック種類
  has("tracks[0].clips[0].opacity");
  has("tracks[0].clips[0].blend");
  has("tracks[0].clips[0].transitionOut.duration");   // §1-3
  has('tracks[0].clips[0].keys["opacity"][1].t');     // §1-4 昇順
  has('tracks[0].clips[0].keys["transform.scale"][1].t'); // §1-4 重複
  has('tracks[0].clips[0].keys["volume"][0].v');      // 数でも色でもない
  has("tracks[0].clips[1].id");                       // clip id の重複
  has("tracks[0].clips[1].assetId");                  // §1-5 素材が無い
  has("tracks[0].clips[1].duration");                 // MIN_CLIP 未満
  has("tracks[0].clips[1].in");                       // in < 0
  has("tracks[0].clips[1].out");                      // out <= in
  has("tracks[0].clips[1].start");                    // §1-1 重なり
  has("tracks[0].clips[2].kind");
  has("tracks[0].clips[3].out");                      // 素材の尺を超える
  has("tracks[0].clips[4].text");                     // kind text なのに text が無い
  has("markers[0].t");
  // 注意だけの物（動くが意図と違う）
  const wpaths = res.warnings.map((w) => w.path);
  assert.ok(wpaths.some((x) => x === "settings.ratio"));
  assert.ok(wpaths.some((x) => x.includes("だめな path")));
  // どの報告も path/msg/fix が埋まっていること（UI がそのまま出す）
  for (const it of res.errors.concat(res.warnings)) {
    assert.equal(typeof it.path, "string");
    assert.ok(it.msg && typeof it.msg === "string", J(it));
    assert.ok(it.fix && typeof it.fix === "string", J(it));
  }
});

test("validateProject: 直さず報告するだけ", () => {
  const p = brokenProject();
  const before = J(p);
  validateProject(p);
  assert.equal(J(p), before);
});

test("validateProject: 妥当な project は ok、壊れた入力でも throw しない", () => {
  const ok = validateProject(newProject({ name: "良い子" }));
  assert.equal(ok.ok, true, J(ok.errors));
  assert.deepEqual(ok.errors, []);
  for (const bad of [undefined, null, 0, "x", []]) {
    const r = validateProject(bad);
    assert.equal(r.ok, false);
    assert.equal(r.errors.length >= 1, true);
  }
});

test("validateProject: 素材が足りない clip は注意（誤りではない）", () => {
  const p = normalizeProject(fixture([{ id: "a", kind: "video", assetId: "as_1", start: 0, duration: 4, in: 0, out: 1 }]));
  const res = validateProject(p);
  assert.equal(res.ok, true, J(res.errors));
  assert.ok(res.warnings.some((w) => w.path.endsWith(".out")), "素材不足の注意が出る");
});

/* ── 4. getPath / setPath（§2 の三形）───────────────────────── */

test("getPath / setPath: transform.scale / fx.<id>.<param> / color.wheels.lift.0", () => {
  const clip = newClip("video", { fx: [{ id: "fx_1", type: "glitch", enabled: true, params: { amount: 0.5 } }] });

  // 1形: 素直な入れ子
  assert.equal(getPath(clip, "transform.scale"), 1);
  assert.equal(setPath(clip, "transform.scale", 2.5), true);
  assert.equal(clip.transform.scale, 2.5);
  assert.equal(getPath(clip, "transform.scale"), 2.5);

  // 2形: 効果の params（配列を id で引く）
  assert.equal(getPath(clip, "fx.fx_1.amount"), 0.5);
  assert.equal(getPath(clip, "fx.fx_1.type"), "glitch");
  assert.equal(setPath(clip, "fx.fx_1.amount", 0.9), true);
  assert.equal(clip.fx[0].params.amount, 0.9);
  assert.equal(setPath(clip, "fx.fx_1.enabled", false), true);
  assert.equal(clip.fx[0].enabled, false, "instance 自身の枝は params に入れない");
  assert.equal(setPath(clip, "fx.fx_無い.amount", 1), false, "無い効果には書けない（false を返す）");
  assert.equal(getPath(clip, "fx.fx_無い.amount"), undefined);

  // 3形: 配列の添字（色ホイール）。欠けた枝は既定で作る
  assert.equal(getPath(clip, "color.wheels.lift.0"), undefined);
  assert.equal(setPath(clip, "color.wheels.lift.0", 0.25), true);
  assert.equal(clip.color.exposure, 0, "ColorGrade の他の枝も既定で埋まる");
  assert.deepEqual(clip.color.wheels.lift, [0.25, 0, 0]);
  assert.deepEqual(clip.color.curves.rgb, [[0, 0], [1, 1]]);
  assert.equal(getPath(clip, "color.wheels.lift.0"), 0.25);
  assert.equal(setPath(clip, "color.exposure", 0.3), true);
  assert.equal(getPath(clip, "color.exposure"), 0.3);

  // 文字の枝も欠けていれば作る
  const t = newClip("video");
  assert.equal(setPath(t, "text.style.size", 90), true);
  assert.equal(t.text.style.size, 90);
  assert.equal(t.text.content, "テキスト");

  // 壊れた引数
  assert.equal(getPath(clip, ""), undefined);
  assert.equal(getPath(null, "a.b"), undefined);
  assert.equal(getPath(clip, "無い.枝"), undefined);
  assert.equal(setPath(null, "a", 1), false);
  assert.equal(setPath(clip, "", 1), false);
});

test("isKeyablePath / KEYABLE_PATHS が §2 の一覧を持つ", () => {
  for (const p of ["opacity", "volume", "pan", "transform.scale", "transform.rotate",
    "color.exposure", "color.saturation", "color.wheels.lift.0", "color.wheels.gain.2",
    "mask.feather", "chroma.similarity", "text.style.size", "text.style.color"]) {
    assert.ok(KEYABLE_PATHS.includes(p), `${p} が KEYABLE_PATHS に無い`);
    assert.equal(isKeyablePath(p), true);
  }
  assert.equal(isKeyablePath("fx.fx_1.amount"), true);
  assert.equal(isKeyablePath("fx.fx_1"), false);
  assert.equal(isKeyablePath("transform"), false);
  assert.equal(isKeyablePath("そんな path"), false);
  assert.equal(isKeyablePath(null), false);
  assert.equal(isKeyablePath(""), false);
});

/* ── 5. 尺の計算 ──────────────────────────────────────────────── */

test("clipEnd / trackEnd / projectDuration", () => {
  assert.equal(clipEnd({ start: 2, duration: 3 }), 5);
  assert.equal(clipEnd(null), 0);
  assert.equal(trackEnd({ clips: [] }), 0);
  assert.equal(trackEnd(null), 0);
  assert.equal(projectDuration(null), 0);
  assert.equal(projectDuration(newProject()), 0, "空の project は 0");
  const p = normalizeProject(fixture([
    { id: "a", kind: "video", assetId: "as_1", start: 0, duration: 4, in: 0, out: 4 },
    { id: "b", kind: "video", assetId: "as_1", start: 6, duration: 2, in: 0, out: 2 }
  ]));
  assert.equal(trackEnd(p.tracks[0]), 8);
  assert.equal(projectDuration(p), 8, "全トラックの最大 end");
  const q = normalizeProject({
    assets: [{ id: "as_1", kind: "audio", duration: 60, storage: { kind: "idb", key: "k" } }],
    tracks: [
      { id: "t1", kind: "video", clips: [{ id: "a", kind: "shape", start: 0, duration: 2 }] },
      { id: "t2", kind: "audio", clips: [{ id: "b", kind: "audio", assetId: "as_1", start: 1, duration: 12, in: 0, out: 12 }] }
    ]
  });
  assert.equal(projectDuration(q), 13);
});

test("clipSourceDuration / clipMaxDuration", () => {
  const asset = newAsset({ id: "as_1", kind: "video", duration: 10, storage: { key: "k" } });
  const c = newClip("video", { assetId: "as_1", in: 2, out: 6, duration: 4, speed: 1 });
  assert.equal(clipSourceDuration(c, asset), 4, "speed を掛けない素材尺");
  assert.equal(clipMaxDuration(c, asset), 8, "in から素材の終わりまで / speed");

  const fast = newClip("video", { assetId: "as_1", in: 2, out: 6, duration: 2, speed: 2 });
  assert.equal(clipSourceDuration(fast, asset), 4);
  assert.equal(clipMaxDuration(fast, asset), 4);

  const rev = newClip("video", { assetId: "as_1", in: 2, out: 6, duration: 4, speed: 1, reverse: true });
  assert.equal(clipMaxDuration(rev, asset), 6, "逆再生は out 側の素材を使う");

  const ramp = newClip("video", { assetId: "as_1", in: 0, out: 8, duration: 4, speed: 1, speedRamp: [{ t: 0, v: 1 }, { t: 4, v: 3 }] });
  assert.equal(clipMaxDuration(ramp, asset), 5, "平均倍率 2 で 10/2");

  const img = newClip("image", { assetId: "as_2", duration: 3 });
  assert.equal(clipMaxDuration(img, newAsset({ id: "as_2", kind: "image" })), Infinity, "静止画は伸ばし放題");
  assert.equal(clipSourceDuration(img, null), Infinity);

  // 素材が分からないときは今の in/out 分だけ保証する
  assert.equal(clipMaxDuration(newClip("video", { in: 1, out: 3, duration: 2 }), null), 2);
  assert.equal(clipSourceDuration(null, null), 0);
  assert.equal(clipMaxDuration(null, null), 0);
});

/* ── 6. 探す / 複製 ──────────────────────────────────────────── */

test("findClip / assetById / tracksByKind", () => {
  const p = normalizeProject({
    assets: [{ id: "as_1", kind: "video", duration: 9, storage: { kind: "idb", key: "k" } }],
    tracks: [
      { id: "t1", kind: "video", clips: [{ id: "c1", kind: "video", assetId: "as_1", start: 0, duration: 2, in: 0, out: 2 }] },
      { id: "t2", kind: "audio", clips: [{ id: "c2", kind: "audio", assetId: "as_1", start: 0, duration: 2, in: 0, out: 2 }] },
      { id: "t3", kind: "audio", clips: [] }
    ]
  });
  const f = findClip(p, "c2");
  assert.ok(f);
  assert.equal(f.clip.id, "c2");
  assert.equal(f.track.id, "t2");
  assert.equal(f.index, 0);
  assert.equal(findClip(p, "居ない"), null);
  assert.equal(findClip(p, null), null);
  assert.equal(findClip(null, "c1"), null);
  assert.equal(assetById(p, "as_1").kind, "video");
  assert.equal(assetById(p, "as_9"), null);
  assert.equal(tracksByKind(p, "audio").length, 2);
  assert.equal(tracksByKind(p, "video").length, 1);
  assert.deepEqual(tracksByKind(p, "overlay"), []);
});

test("cloneClip: id を振り直し、fx の id と keys の指し先を揃える", () => {
  const src = newClip("video", {
    id: "cl_元", assetId: "as_1", linkedId: "cl_相棒", groupId: "g1",
    fx: [{ id: "fx_1", type: "glitch", enabled: true, params: { amount: 0.5 } }],
    keys: { "fx.fx_1.amount": [{ t: 0, v: 0 }], "opacity": [{ t: 0, v: 1 }] }
  });
  const cp = cloneClip(src);
  assert.notEqual(cp.id, src.id);
  assert.notEqual(cp.fx[0].id, "fx_1");
  assert.ok(cp.keys[`fx.${cp.fx[0].id}.amount`], "keys の fx id が付け替わる");
  assert.ok(!cp.keys["fx.fx_1.amount"]);
  assert.ok(cp.keys.opacity);
  assert.equal(cp.linkedId, null, "相棒は引き継がない");
  assert.equal(cp.groupId, "g1");
  assert.equal(src.fx[0].id, "fx_1", "元は変わらない");
  assert.ok(src.keys["fx.fx_1.amount"]);
  const same = cloneClip(src, { newId: false });
  assert.equal(same.id, "cl_元");
  assert.equal(same.fx[0].id, "fx_1");
  same.transform.scale = 9;
  assert.equal(src.transform.scale, 1, "深い複製である");
});

test("cloneTrack: 中の clip も複製して id を振り直す", () => {
  const tr = newTrack("video", {
    id: "tr_元", fx: [{ id: "fx_t", type: "bloom", params: {} }],
    clips: [newClip("video", { id: "c1" }), newClip("video", { id: "c2" })]
  });
  const cp = cloneTrack(tr);
  assert.notEqual(cp.id, "tr_元");
  assert.equal(cp.clips.length, 2);
  assert.notEqual(cp.clips[0].id, "c1");
  assert.notEqual(cp.clips[1].id, "c2");
  assert.notEqual(cp.fx[0].id, "fx_t");
  assert.equal(tr.clips[0].id, "c1");
  assert.equal(cloneTrack(tr, { newId: false }).id, "tr_元");
});

/* ── 7. migrate ──────────────────────────────────────────────── */

test("migrate: schema 1 → 3", () => {
  const v1 = {
    /* schema を書いていなかった世代 */
    name: "古い作品",
    settings: { width: 1080, height: 1920, fps: 30 },
    assets: [{ id: "as_1", kind: "video", duration: 20, storage: { kind: "idb", key: "k1" } }],
    tracks: [{
      id: "tr_1", kind: "video", clips: [{
        id: "cl_1", kind: "video", assetId: "as_1", offset: 1, len: 3, in: 0, out: 3,
        keyframes: [{ path: "opacity", t: 0, v: 0 }, { path: "opacity", t: 1, v: 1 }],
        transition: { type: "crossfade", duration: 0.5 },
        effect: { id: "fx_1", type: "glitch", params: { amount: 0.3 } }
      }]
    }]
  };
  const before = J(v1);
  const m = migrate(v1);
  assert.equal(J(v1), before, "migrate も入力を汚さない");
  assert.equal(m.schema, 3);
  assert.equal(m.name, "古い作品");
  assert.equal(m.settings.ratio, "9:16", "寸法から比率を当てる");
  const c = m.tracks[0].clips[0];
  assert.equal(c.start, 1, "offset → start");
  assert.equal(c.duration, 3, "len → duration");
  assert.equal(c.offset, undefined);
  assert.equal(c.len, undefined);
  assert.equal(c.keyframes, undefined);
  assert.deepEqual(c.keys.opacity.map((k) => k.t), [0, 1], "keyframes[] → keys{}");
  assert.equal(c.keys.opacity[1].v, 1);
  assert.equal(c.transitionOut.duration, 0.5, "transition → transitionOut");
  assert.equal(c.transition, undefined);
  assert.equal(c.fx.length, 1, "effect → fx[]");
  assert.equal(c.fx[0].type, "glitch");
  assert.equal(c.fx[0].params.amount, 0.3);
  assert.deepEqual(m.markers, []);
  assert.equal(validateProject(m).ok, true, J(validateProject(m).errors));
});

test("migrate: schema 2 → 3", () => {
  const v2 = {
    schema: 2,
    settings: { width: 1920, height: 1080, fps: 30, ratio: "16:9" },
    assets: [{ id: "as_1", kind: "video", duration: 20, storage: { kind: "idb", key: "k1" }, probe: { version: 1, scenes: [] } }],
    tracks: [{
      id: "tr_1", kind: "video", clips: [{
        id: "cl_1", kind: "video", assetId: "as_1", start: 0, duration: 2, in: 0, out: 4,
        speedCurve: [{ t: 0, v: 1 }, { t: 2, v: 3 }],
        filter: { exposure: 0.2, saturation: -0.1 }
      }]
    }]
  };
  const m = migrate(v2);
  assert.equal(m.schema, 3);
  const c = m.tracks[0].clips[0];
  assert.deepEqual(c.speedRamp, [{ t: 0, v: 1 }, { t: 2, v: 3 }], "speedCurve → speedRamp");
  assert.equal(c.speedCurve, undefined);
  assert.equal(c.color.exposure, 0.2, "filter → color");
  assert.equal(c.color.saturation, -0.1);
  assert.deepEqual(c.color.wheels.lift, [0, 0, 0], "足りない枝は既定で埋まる");
  assert.equal(c.filter, undefined);
  assert.deepEqual(m.assets[0].analysis, { version: 1, scenes: [] }, "probe → analysis");
  assert.equal(m.assets[0].probe, undefined);
  assert.equal(validateProject(m).ok, true, J(validateProject(m).errors));
});

test("migrate: 3 はそのまま整えるだけ。未知の未来版は throw", () => {
  const p = newProject({ name: "今の版" });
  const m = migrate(p);
  assert.equal(m.schema, 3);
  assert.equal(m.name, "今の版");
  assert.deepEqual(m, normalizeProject(p));
  assert.throws(() => migrate({ schema: 4 }), /新しい/);
  assert.throws(() => migrate({ schema: 99 }), /新しい/);
  assert.throws(() => migrate(null), /object/);
  assert.throws(() => migrate("x"), /object/);
  assert.throws(() => migrate([]), /object/);
});
