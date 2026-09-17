/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/ai-resolve.test.mjs — Plan → タイムライン（ai/resolve.js）の試験

   ★ 何を固定するか
     ① **pure・決定論**: 同じ入力なら必ず同じ ops（乱数・時刻を使っていない）。
     ② ops が **core/ops.js の不変条件を破らない**: 実際に core へ流して
        `validateProject().ok` になること（start 昇順・重なり無し・
        `out <= asset.duration`・`duration >= MIN_CLIP`・keys は t 昇順）。
     ③ 秒とフレーム: クリップは端がぴったり隣り合う（隙間 0 = 遷移が出る条件）。
        尺はフレームに乗る。素材の端を越えない。
     ④ 拍への吸着（pacing:"beat"）と、拍が無いときの素直な等間隔。
     ⑤ テロップ: 最短 1.2 秒・近すぎる物は出さない・締めは最後。
     ⑥ BGM: 最初の downbeat から・音量・ダッキングのキーが昇順で尺の中。
     ⑦ 壊れた Plan（無い素材・空・音の素材を映像に）でも落ちず warnings に残る。

   ★ core が読めないときは その試験だけ skip する（理由を出す）。
   ★ 走らせ方: cd studio && npm test（単体は node --test tests/ai-resolve.test.mjs）
   ══════════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";

/* ai/resolve.js は core/schema.js と core/time.js を直に import するので、
   core が壊れていると読み込み自体が失敗する。**試験ごとに skip** できるよう
   動的 import で受け止め、理由を文字で持つ（契約の「理由を書いて skip」）。 */
let R = null, PL = null, IN = null, loadError = "";
try {
  R = await import("../src/ai/resolve.js");
  PL = await import("../src/ai/planner.js");
  IN = await import("../src/ai/intent.js");
} catch (e) {
  loadError = `ai/* を読めない（core が未完成）: ${(e && e.message) || e}`;
}
let core = null, coreError = "";
try {
  core = {
    ops: await import("../src/core/ops.js"),
    schema: await import("../src/core/schema.js"),
    store: await import("../src/core/store.js")
  };
  await core.store.opsReady();
} catch (e) {
  coreError = `core/* を読めない: ${(e && e.message) || e}`;
}
const needAi = loadError || false;
const needCore = loadError || coreError || false;

/* ── 足場 ─────────────────────────────────────────────────────── */

const FPS = 30;
const FRAME = 1 / FPS;

function mkAsset(id, kind, duration, extra) {
  return Object.assign({
    id, kind, name: `${id}.${kind === "image" ? "png" : kind === "audio" ? "m4a" : "mp4"}`,
    mime: kind === "image" ? "image/png" : kind === "audio" ? "audio/mp4" : "video/mp4",
    size: 1024, duration, width: 1920, height: 1080, fps: 30,
    hasAudio: kind !== "image", rotation: 0, createdAt: 0,
    storage: { kind: "idb", key: `blob_${id}` }, analysis: null
  }, extra || null);
}

const curve = (hz, sec, f) => ({ hz, values: Array.from({ length: Math.max(1, Math.round(hz * sec)) }, (_, i) => f(i / hz)) });

function mkAnalysis(dur, opts = {}) {
  return {
    version: 1, duration: dur,
    scenes: [{ start: 0, end: dur / 2, score: 0.5 }, { start: dur / 2, end: dur, score: 0.6 }],
    motion: curve(2, dur, (t) => 0.3 + 0.25 * Math.sin(t)),
    sharp: curve(2, dur, (t) => 0.5 + 0.3 * Math.cos(t / 3)),
    bright: curve(2, dur, () => 0.5), sat: curve(2, dur, () => 0.4),
    faces: null, loudness: null, silence: opts.silence || [], speech: null,
    beats: opts.beats || null, highlights: [], shake: 0.1, warnings: []
  };
}

const mkBeats = (bpm, n) => ({
  bpm, offset: 0.25,
  times: Array.from({ length: n }, (_, i) => 0.25 + i * (60 / bpm)),
  downbeats: Array.from({ length: Math.ceil(n / 4) }, (_, i) => 0.25 + i * (240 / bpm)),
  conf: 0.9
});

function mkAssets() {
  return [
    mkAsset("as_a", "video", 12, { createdAt: 100, analysis: mkAnalysis(12, { silence: [{ start: 0, end: 2 }] }) }),
    mkAsset("as_b", "video", 30, { createdAt: 200, analysis: mkAnalysis(30) }),
    mkAsset("as_c", "image", 0, { createdAt: 300, name: "photo.png" }),
    mkAsset("as_m", "audio", 90, { createdAt: 50, name: "bgm.m4a", analysis: mkAnalysis(90, { beats: mkBeats(120, 180) }) })
  ];
}

/** 空のプロジェクト（core が在れば newProject、無ければ最低限の形） */
function mkProject(assets, over) {
  if (core) return core.schema.newProject(Object.assign({ assets }, over || null));
  return Object.assign({
    schema: 3, id: "prj_t", name: "試験", createdAt: 0, updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: FPS, ratio: "16:9", sampleRate: 48000 },
    assets, tracks: [], markers: [], chapters: [], meta: { aiHistory: [] }
  }, over || null);
}

/** Plan を手で作る（resolve だけを見たいとき） */
function mkPlan(over) {
  return Object.assign({
    id: "pl_test", title: "試験", ratio: "16:9", targetDuration: 12, pacing: "medium",
    music: null, style: "vlog", grade: null, segments: [], captions: "auto", endCard: null
  }, over || null);
}

const seg = (assetId, want, over) => Object.assign({
  assetId, pick: "auto", want, speed: 1, reverse: false, transition: "cut", text: null, fx: [], note: ""
}, over || null);

/** ops を実際の project へ当てる（core が在るときだけ呼ぶ） */
function applyAll(project, ops) {
  const failures = [];
  for (const op of ops) {
    try { core.ops.applyOp(project, op.type, op.payload); }
    catch (e) { failures.push(`${op.type}: ${(e && e.message) || e}`); }
  }
  return failures;
}

const clipsOf = (project, kind) => {
  const tr = project.tracks.filter((t) => t.kind === kind);
  return tr.length ? tr[tr.length - 1].clips : [];
};
const onFrame = (t) => Math.abs(t / FRAME - Math.round(t / FRAME)) < 1e-4;

/* ══ ① 形と決定論 ═════════════════════════════════════════════════ */

test("resolvePlan: ops は {type,payload} の配列で、JSON にできる", { skip: needAi }, () => {
  const assets = mkAssets();
  const plan = mkPlan({ segments: [seg("as_a", 3), seg("as_b", 3, { transition: "crossfade" })] });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, beats: null, fps: FPS });
  assert.ok(Array.isArray(out.ops) && out.ops.length >= 2);
  for (const op of out.ops) {
    assert.equal(typeof op.type, "string");
    assert.ok(op.payload && typeof op.payload === "object");
    assert.ok(["settings.update", "track.add", "clip.add", "clip.remove"].indexOf(op.type) >= 0, `知らない op ${op.type}`);
    assert.equal(JSON.parse(JSON.stringify(op.payload)) === null, false);
  }
  assert.equal(typeof out.summary, "string");
  assert.ok(Array.isArray(out.warnings));
  // トラックを作る op は clip.add より先
  const firstClip = out.ops.findIndex((o) => o.type === "clip.add");
  const lastTrack = out.ops.map((o) => o.type).lastIndexOf("track.add");
  assert.ok(lastTrack < firstClip, "track.add が clip.add より後に来ている");
});

test("resolvePlan: 決定論（同じ入力なら完全に同じ ops）", { skip: needAi }, () => {
  const assets = mkAssets();
  const beats = mkBeats(120, 180);
  const plan = PL.planLocal(IN.parseIntentLocal("30秒のテンポいい旅行Vlog、テロップ、音ハメ", { assets }), assets, null);
  const a = R.resolvePlan(plan, { project: mkProject(assets), assets, beats, fps: FPS });
  const b = R.resolvePlan(plan, { project: mkProject(assets), assets, beats, fps: FPS });
  assert.deepEqual(a.ops, b.ops);
  assert.equal(a.summary, b.summary);
  assert.deepEqual(a.warnings, b.warnings);
});

test("resolvePlan: summary は日本語で中身を言う", { skip: needAi }, () => {
  const assets = mkAssets();
  const beats = mkBeats(120, 180);
  const plan = PL.planLocal(IN.parseIntentLocal("30秒、テロップ、音ハメ", { assets }), assets, null);
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, beats, fps: FPS });
  assert.match(out.summary, /^\d+ クリップ \/ [\d.]+ 秒 \/ .+ \/ テロップ \d+ 枚 \/ BGM (あり|なし)$/, out.summary);
  assert.ok(out.summary.indexOf("ビート同期") >= 0, out.summary);
});

/* ══ ② 秒とフレーム ══════════════════════════════════════════════ */

test("resolvePlan: クリップは端がぴったり隣り合い、フレームに乗る", { skip: needAi }, () => {
  const assets = mkAssets();
  const plan = mkPlan({
    targetDuration: 20,
    segments: [seg("as_a", 2.37), seg("as_b", 3.01, { transition: "crossfade" }), seg("as_c", 2.5), seg("as_b", 1.9)]
  });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, beats: null, fps: FPS });
  const adds = out.ops.filter((o) => o.type === "clip.add" && o.payload.clip.kind !== "text" && o.payload.clip.kind !== "audio");
  assert.equal(adds.length, 4);
  let cursor = 0;
  for (const op of adds) {
    const c = op.payload.clip;
    assert.equal(c.start, op.payload.at, "at と clip.start が食い違う");
    assert.ok(Math.abs(c.start - cursor) < 1e-6, `隙間/重なりがある（${c.start} ≠ ${cursor}）`);
    assert.ok(onFrame(c.start) && onFrame(c.duration), `フレームに乗っていない（${c.start} / ${c.duration}）`);
    assert.ok(c.duration >= 1 / FPS - 1e-9);
    cursor += c.duration;
  }
});

test("resolvePlan: 素材の端を越えない / speed を織り込む", { skip: needAi }, () => {
  const assets = [mkAsset("as_s", "video", 3, { analysis: mkAnalysis(3) })];
  const plan = mkPlan({ segments: [seg("as_s", 10), seg("as_s", 2, { speed: 2 })] });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, beats: null, fps: FPS });
  const adds = out.ops.filter((o) => o.type === "clip.add");
  for (const op of adds) {
    const c = op.payload.clip;
    assert.ok(c.in >= 0 && c.out <= 3 + 1e-6, `素材の端を越えた（in ${c.in} / out ${c.out}）`);
    assert.ok(c.out > c.in);
    assert.ok(Math.abs((c.out - c.in) - c.duration * c.speed) < 2e-2, `out-in と duration×speed が合わない（${c.out - c.in} / ${c.duration * c.speed}）`);
  }
  // 10 秒欲しくても 3 秒の素材からは 3 秒までしか取らない
  assert.ok(adds[0].payload.clip.duration <= 3 + 1e-6);
});

test("resolvePlan: 静止画は in/out を持たず、欲しい尺のまま置く", { skip: needAi }, () => {
  const assets = [mkAsset("as_p", "image", 0)];
  const out = R.resolvePlan(mkPlan({ segments: [seg("as_p", 4)] }), { project: mkProject(assets), assets, fps: FPS });
  const c = out.ops.find((o) => o.type === "clip.add").payload.clip;
  assert.equal(c.kind, "image");
  assert.equal(c.in, undefined);
  assert.ok(Math.abs(c.duration - 4) < 1e-6);
});

test("resolvePlan: 比率が違えば settings.update を 1 つだけ出す", { skip: needAi }, () => {
  const assets = mkAssets();
  const project = mkProject(assets);
  const out = R.resolvePlan(mkPlan({ ratio: "9:16", segments: [seg("as_a", 2)] }), { project, assets, fps: FPS });
  const su = out.ops.filter((o) => o.type === "settings.update");
  assert.equal(su.length, 1);
  assert.equal(su[0].payload.patch.ratio, "9:16");
  assert.equal(su[0].payload.patch.width, 1080);
  assert.equal(su[0].payload.patch.height, 1920);
  // 同じ比率なら出さない
  const same = R.resolvePlan(mkPlan({ ratio: "16:9", segments: [seg("as_a", 2)] }), { project, assets, fps: FPS });
  assert.equal(same.ops.filter((o) => o.type === "settings.update").length, 0);
});

/* ══ ③ 遷移 ══════════════════════════════════════════════════════ */

test("resolvePlan: 遷移は入口だけ・隣の半分まで・cut は付けない", { skip: needAi }, () => {
  const assets = mkAssets();
  const plan = mkPlan({
    segments: [seg("as_a", 3), seg("as_b", 0.4, { transition: "crossfade" }), seg("as_c", 3, { transition: "whipPan" }), seg("as_b", 3)]
  });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, fps: FPS });
  const clips = out.ops.filter((o) => o.type === "clip.add").map((o) => o.payload.clip);
  assert.equal(clips[0].transitionIn, undefined, "1 本目に遷移を付けている");
  assert.equal(clips[3].transitionIn, undefined, "cut なのに遷移が付いている");
  assert.equal(clips[1].transitionIn.type, "crossfade");
  // 0.4 秒のクリップに 0.3 秒の crossfade は入らない → 半分（0.2）までに収める
  assert.ok(clips[1].transitionIn.duration <= Math.min(clips[0].duration, clips[1].duration) / 2 + 1e-6,
    `遷移が長すぎる（${clips[1].transitionIn.duration}）`);
  assert.equal(clips[2].transitionIn.type, "whipPan");
  for (const c of clips) assert.equal(c.transitionOut, undefined, "出口側にも付けると 2 重に掛かる");
});

/* ══ ④ 拍への吸着 ════════════════════════════════════════════════ */

test("resolvePlan: pacing:beat は切り替え点を拍に寄せる", { skip: needAi }, () => {
  const assets = mkAssets();
  const beats = mkBeats(120, 120);              // 0.5 秒ごと
  const plan = mkPlan({
    pacing: "beat", targetDuration: 12,
    segments: [seg("as_a", 2.3), seg("as_b", 2.2), seg("as_b", 1.8), seg("as_a", 2.4)]
  });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, beats, fps: FPS });
  const clips = out.ops.filter((o) => o.type === "clip.add" && o.payload.clip.kind !== "audio").map((o) => o.payload.clip);
  const grid = beats.times;                      // BGM が無いので時刻はそのまま
  for (let i = 1; i < clips.length; i++) {
    const t = clips[i].start;
    const near = Math.min(...grid.map((b) => Math.abs(b - t)));
    assert.ok(near <= FRAME / 2 + 1e-6, `${i} 本目の切り替え ${t} が拍から ${near.toFixed(3)} 秒ずれている`);
  }
});

test("resolvePlan: 拍が無ければ warning を出して等間隔で切る", { skip: needAi }, () => {
  const assets = mkAssets();
  const plan = mkPlan({ pacing: "beat", segments: [seg("as_a", 2), seg("as_b", 2)] });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, beats: null, fps: FPS });
  assert.ok(out.warnings.some((w) => w.indexOf("拍") >= 0), JSON.stringify(out.warnings));
  const clips = out.ops.filter((o) => o.type === "clip.add").map((o) => o.payload.clip);
  assert.ok(Math.abs(clips[0].duration - 2) < 1e-6);
});

test("nearestBeat / normalizeBeats / mergeWindows / audibleWindows は pure", { skip: needAi }, () => {
  assert.equal(R.nearestBeat([0, 0.5, 1, 1.5], 0.6, 0.2), 0.5);
  assert.equal(R.nearestBeat([0, 0.5, 1], 0.75, 0.2), null);
  assert.equal(R.nearestBeat([], 1, 1), null);
  const b = R.normalizeBeats({ bpm: 120, times: [1, 0.5, 0.5, 2], downbeats: [0.5] });
  assert.deepEqual(b.times, [0.5, 0.5, 1, 2]);
  assert.equal(b.period, 0.5);
  assert.equal(R.normalizeBeats(null), null);
  assert.deepEqual(R.mergeWindows([[0, 1], [1.1, 2], [5, 6]], 0.25), [[0, 2], [5, 6]]);
  assert.deepEqual(R.mergeWindows([[1, 0]], 0), []);
  // 無音の所は「鳴っていない」
  const item = { kind: "video", start: 10, duration: 4, in: 0, out: 4, speed: 1, reverse: false };
  const asset = mkAsset("as_x", "video", 4, { analysis: mkAnalysis(4, { silence: [{ start: 0, end: 1 }] }) });
  assert.deepEqual(R.audibleWindows(item, asset), [[11, 14]]);
  assert.deepEqual(R.audibleWindows(item, mkAsset("as_y", "video", 4)), [[10, 14]]);
});

test("sourceRangeFor: pick ごとの範囲（同じ素材の 2 本目は別の所）", { skip: needAi }, () => {
  const a = mkAsset("as_a", "video", 12, { analysis: mkAnalysis(12) });
  assert.deepEqual(R.sourceRangeFor(a, "start", 3, 0, 1), { in: 0, out: 3, why: "頭から" });
  const end = R.sourceRangeFor(a, "end", 3, 0, 1);
  assert.equal(end.out, 12);
  assert.equal(end.in, 9);
  const fixed = R.sourceRangeFor(a, { in: 2, out: 5 }, 3, 0, 1);
  assert.deepEqual([fixed.in, fixed.out], [2, 5]);
  // 壊れた pick は素材の中に収める
  const clamped = R.sourceRangeFor(a, { in: -4, out: 99 }, 3, 0, 1);
  assert.ok(clamped.in >= 0 && clamped.out <= 12);
  // 3 本使うなら 3 本とも別の窓（時系列に進む）
  const r0 = R.sourceRangeFor(a, "best", 2, 0, 3);
  const r1 = R.sourceRangeFor(a, "best", 2, 1, 3);
  const r2 = R.sourceRangeFor(a, "best", 2, 2, 3);
  assert.ok(r0.in < r1.in && r1.in < r2.in, `窓が進んでいない（${r0.in} / ${r1.in} / ${r2.in}）`);
  for (const r of [r0, r1, r2]) assert.ok(r.in >= 0 && r.out <= 12 + 1e-6);
  // 静止画は 0..0（尺はクリップ側）
  assert.deepEqual(R.sourceRangeFor(mkAsset("as_p", "image", 0), "auto", 3, 0, 1).in, 0);
  // 同じ引数なら必ず同じ答え
  assert.deepEqual(R.sourceRangeFor(a, "best", 2, 1, 3), r1);
});

/* ══ ⑤ テロップ ══════════════════════════════════════════════════ */

test("resolvePlan: テロップは最短 1.2 秒・近すぎる物は出さない・締めは最後", { skip: needAi }, () => {
  const assets = mkAssets();
  const plan = mkPlan({
    targetDuration: 12,
    segments: [
      seg("as_a", 3, { text: { content: "はじまり", role: "title", emphasis: 1 } }),
      seg("as_b", 3, { text: { content: "つぎ", role: "caption", emphasis: 0.4 } }),
      seg("as_b", 0.3, { text: { content: "みっつめ", role: "caption", emphasis: 0.4 } }),
      seg("as_c", 3, { text: { content: "よっつめ", role: "caption", emphasis: 0.4 } })
    ],
    endCard: { text: "おわり", duration: 1.5 }
  });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, fps: FPS });
  const texts = out.ops.filter((o) => o.type === "clip.add" && o.payload.clip.kind === "text").map((o) => o.payload.clip);
  assert.ok(texts.length >= 2);
  assert.equal(texts[0].text.content, "はじまり");
  assert.equal(texts[texts.length - 1].text.content, "おわり");
  for (const t of texts) {
    assert.ok(t.duration >= R.DROP_TEXT, `${t.text.content} が短すぎる（${t.duration}）`);
    assert.ok(t.text.style.size > 0 && t.text.style.size < 4000);
    assert.ok(t.text.anim.in.duration + t.text.anim.out.duration <= t.duration * 0.81 + 1e-6, "出入りのアニメが尺を食い過ぎる");
    assert.ok(t.transform && Math.abs(t.transform.y) <= 0.5);
  }
  // 0.3 秒しか間が無い「後の方」は出さず、理由を warnings に残す
  assert.ok(texts.some((t) => t.text.content === "みっつめ"), "先に出たテロップを落としている");
  assert.ok(!texts.some((t) => t.text.content === "よっつめ"), "近すぎるテロップを出している");
  assert.ok(out.warnings.some((w) => w.indexOf("よっつめ") >= 0), JSON.stringify(out.warnings));
  // 締めは映像の終わりから
  const videoEnd = out.ops.filter((o) => o.type === "clip.add" && ["video", "image"].indexOf(o.payload.clip.kind) >= 0)
    .reduce((m, o) => Math.max(m, o.payload.clip.start + o.payload.clip.duration), 0);
  assert.ok(Math.abs(texts[texts.length - 1].start - videoEnd) < 1e-6);
  // テロップは 1 本の overlay に重ならず並ぶ
  for (let i = 1; i < texts.length; i++) {
    assert.ok(texts[i].start >= texts[i - 1].start + texts[i - 1].duration - 1e-6, "テロップが重なっている");
  }
});

test("resolvePlan: captions:none ならテロップを作らない（締めの指定は残す）", { skip: needAi }, () => {
  const assets = mkAssets();
  const plan = mkPlan({
    captions: "none", segments: [seg("as_a", 3, { text: { content: "出ない", role: "title", emphasis: 1 } })],
    endCard: { text: "締め", duration: 1.2 }
  });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, fps: FPS });
  const texts = out.ops.filter((o) => o.type === "clip.add" && o.payload.clip.kind === "text").map((o) => o.payload.clip);
  assert.equal(texts.length, 1);
  assert.equal(texts[0].text.content, "締め");
});

/* ══ ⑥ BGM とダッキング ══════════════════════════════════════════ */

test("resolvePlan: BGM は最初の downbeat から・音量とフェード付き", { skip: needAi }, () => {
  const assets = mkAssets();
  const beats = mkBeats(120, 180);
  const plan = mkPlan({
    targetDuration: 8, music: { assetId: "as_m", gain: 0.3, duck: false, startAt: "auto" },
    segments: [seg("as_a", 4), seg("as_b", 4)]
  });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, beats, fps: FPS });
  const music = out.ops.filter((o) => o.type === "clip.add" && o.payload.clip.kind === "audio").map((o) => o.payload.clip);
  assert.equal(music.length, 1);
  const m = music[0];
  assert.equal(m.start, 0);
  assert.ok(Math.abs(m.in - beats.downbeats[0]) <= FRAME, `BGM の頭が downbeat ではない（${m.in}）`);
  assert.equal(m.volume, 0.3);
  assert.ok(m.audioFade.in > 0 && m.audioFade.out > 0);
  assert.ok(Math.abs(m.duration - 8) < 1e-6, `BGM の尺が動画と合わない（${m.duration}）`);
  assert.equal(m.keys, undefined, "duck:false なのにキーを打っている");
  // startAt が数ならそこから
  const at = R.resolvePlan(mkPlan({ music: { assetId: "as_m", gain: 0.25, duck: false, startAt: 12 }, segments: [seg("as_a", 3)] }),
    { project: mkProject(assets), assets, beats, fps: FPS });
  assert.equal(at.ops.filter((o) => o.payload.clip && o.payload.clip.kind === "audio")[0].payload.clip.in, 12);
});

test("resolvePlan: ダッキングのキーは昇順で尺の中・声の所だけ下がる", { skip: needAi }, () => {
  const assets = mkAssets();
  const plan = mkPlan({
    targetDuration: 12, music: { assetId: "as_m", gain: 0.4, duck: true, startAt: "auto" },
    segments: [seg("as_c", 4), seg("as_a", 4), seg("as_c", 4)]   // 真ん中だけ音を持つ素材
  });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, beats: null, fps: FPS });
  const m = out.ops.filter((o) => o.type === "clip.add" && o.payload.clip.kind === "audio")[0].payload.clip;
  assert.ok(m.keys && Array.isArray(m.keys.volume) && m.keys.volume.length >= 4, JSON.stringify(m.keys));
  const keys = m.keys.volume;
  for (let i = 1; i < keys.length; i++) assert.ok(keys[i].t > keys[i - 1].t, "キーの t が昇順でない");
  for (const k of keys) {
    assert.ok(k.t >= 0 && k.t <= m.duration + 1e-6, `キーが尺の外（${k.t} / ${m.duration}）`);
    assert.ok(k.v >= 0 && k.v <= 0.4 + 1e-9);
  }
  assert.ok(keys.some((k) => k.v < 0.4 - 1e-9), "下がっているキーが無い");
  assert.ok(keys[0].v > 0.1, "頭から下がっている（静止画の所は下げない）");
  // 素材が短いと足りない分を warning で言う
  const short = [mkAsset("as_v", "video", 30, { analysis: mkAnalysis(30) }), mkAsset("as_m2", "audio", 5)];
  const w = R.resolvePlan(mkPlan({ targetDuration: 20, music: { assetId: "as_m2", gain: 0.25, duck: true, startAt: "auto" }, segments: [seg("as_v", 20)] }),
    { project: mkProject(short), assets: short, fps: FPS });
  assert.ok(w.warnings.some((x) => x.indexOf("足りない") >= 0), JSON.stringify(w.warnings));
});

test("resolvePlan: BGM の素材が無ければ warning を出して音無しで進む", { skip: needAi }, () => {
  const assets = mkAssets();
  const out = R.resolvePlan(mkPlan({ music: { assetId: "as_none", gain: 0.25, duck: true, startAt: "auto" }, segments: [seg("as_a", 3)] }),
    { project: mkProject(assets), assets, fps: FPS });
  assert.equal(out.ops.filter((o) => o.payload.clip && o.payload.clip.kind === "audio").length, 0);
  assert.ok(out.warnings.some((w) => w.indexOf("BGM") >= 0));
  assert.ok(out.summary.indexOf("BGM なし") >= 0);
});

/* ══ ⑦ 壊れた入力 ════════════════════════════════════════════════ */

test("resolvePlan: 壊れた Plan でも落ちず warnings に理由が残る", { skip: needAi }, () => {
  const assets = mkAssets();
  const plan = mkPlan({
    segments: [
      seg("as_none", 3),             // 無い素材
      null,                          // 読めない segment
      seg("as_m", 3),                // 音の素材を映像に並べようとした
      seg("as_a", 3)                 // これだけ通る
    ]
  });
  const out = R.resolvePlan(plan, { project: mkProject(assets), assets, fps: FPS });
  const clips = out.ops.filter((o) => o.type === "clip.add").map((o) => o.payload.clip);
  assert.equal(clips.length, 1);
  assert.equal(clips[0].assetId, "as_a");
  assert.equal(out.warnings.length >= 3, true, JSON.stringify(out.warnings));
  // 空の Plan / null でも投げない
  assert.deepEqual(R.resolvePlan(mkPlan({ segments: [] }), { project: mkProject(assets), assets, fps: FPS }).ops.filter((o) => o.type === "clip.add"), []);
  const nothing = R.resolvePlan(null, { project: mkProject(assets), assets, fps: FPS });
  assert.ok(Array.isArray(nothing.ops));
  assert.ok(nothing.warnings.length >= 1);
});

test("resolvePlan: 空いているトラックは使い回し、埋まっていれば足す", { skip: needCore }, () => {
  const assets = mkAssets();
  /* 空の V1 が在れば そこへ入れる（track.add を出さない） */
  const empty = mkProject(assets);
  core.ops.applyOp(empty, "track.add", { kind: "video" });
  const reuse = R.resolvePlan(mkPlan({ segments: [seg("as_a", 2)] }), { project: empty, assets, fps: FPS });
  assert.equal(reuse.ops.filter((o) => o.type === "track.add").length, 0);
  assert.equal(reuse.ops.find((o) => o.type === "clip.add").payload.trackId, empty.tracks[0].id);

  /* 既にクリップが在るトラックは触らず、新しいトラックを足す */
  const busy = mkProject(assets);
  const trackId = core.ops.applyOp(busy, "track.add", { kind: "video" }).trackId;
  core.ops.applyOp(busy, "clip.add", { trackId, clip: { kind: "video", assetId: "as_b", start: 0, duration: 2 }, at: 0 });
  const added = R.resolvePlan(mkPlan({ segments: [seg("as_a", 2)] }), { project: busy, assets, fps: FPS });
  const adds = added.ops.filter((o) => o.type === "track.add");
  assert.equal(adds.length, 1);
  assert.notEqual(adds[0].payload.id, trackId);
  assert.equal(added.ops.find((o) => o.type === "clip.add").payload.trackId, adds[0].payload.id);
  // replace:true なら先に今のクリップを消してから使い回す
  const replaced = R.resolvePlan(mkPlan({ segments: [seg("as_a", 2)] }), { project: busy, assets, fps: FPS, replace: true });
  assert.equal(replaced.ops[0].type, "clip.remove");
  assert.equal(replaced.ops.filter((o) => o.type === "track.add").length, 0);
});

/* ══ ⑧ core に実際に流す（不変条件）════════════════════════════════ */

test("resolvePlan: ops を core へ流すと validateProject が通る", { skip: needCore }, () => {
  const assets = mkAssets();
  const beats = mkBeats(120, 240);
  for (const prompt of [
    "30秒のテンポいい旅行Vlog、テロップ入れて、BGMのビートで切って",
    "縦で15秒のショート、サクサク、テロップ",
    "2分のしっとりシネマ、テロップなし",
    "45秒の解説、字幕",
    "1分のダイジェスト、音ハメ、映画風"
  ]) {
    const project = mkProject(assets);
    const plan = PL.planLocal(IN.parseIntentLocal(prompt, { assets }), assets, null);
    const out = R.resolvePlan(plan, { project, assets, beats, fps: project.settings.fps });
    const failures = applyAll(project, out.ops);
    assert.deepEqual(failures, [], `「${prompt}」で op が失敗した`);
    const v = core.schema.validateProject(project);
    assert.equal(v.ok, true, `「${prompt}」→ ${JSON.stringify(v.errors)}`);

    /* 不変条件をこちらでも見る（validate の見落としを防ぐ） */
    for (const tr of project.tracks) {
      let prevEnd = -1;
      for (const c of tr.clips) {
        assert.ok(c.start >= prevEnd - 1e-6, `${tr.name}: start が昇順でない`);
        assert.ok(c.duration >= core.schema.MIN_CLIP - 1e-9, `${tr.name}: MIN_CLIP より短い`);
        prevEnd = c.start + c.duration;
        const asset = core.schema.assetById(project, c.assetId);
        if (asset && (c.kind === "video" || c.kind === "audio")) {
          assert.ok(c.out <= asset.duration + 1e-3, `${tr.name}: out が素材を越えた（${c.out} > ${asset.duration}）`);
          assert.ok(c.out > c.in);
        }
        for (const path of Object.keys(c.keys || {})) {
          const list = c.keys[path];
          for (let i = 1; i < list.length; i++) assert.ok(list[i].t > list[i - 1].t, `${path} のキーが昇順でない`);
        }
        if (c.source) assert.equal(c.source.by, "ai");
      }
    }
    /* 映像は隙間なく並ぶ（= 遷移が出る条件。core/eval.js の contiguous） */
    const vclips = clipsOf(project, "video");
    for (let i = 1; i < vclips.length; i++) {
      const gap = vclips[i].start - (vclips[i - 1].start + vclips[i - 1].duration);
      assert.ok(Math.abs(gap) <= 1e-3, `隙間 ${gap} 秒（遷移が出なくなる）`);
    }
  }
});

test("resolvePlan: store.batch で 1 取消単位として当てられる", { skip: needCore }, () => {
  const assets = mkAssets();
  const project = mkProject(assets);
  const store = core.store.createStore(project);
  const plan = PL.planLocal(IN.parseIntentLocal("20秒、テロップ、BGM", { assets }), assets, null);
  const out = R.resolvePlan(plan, { project: store.project, assets, beats: mkBeats(120, 120), fps: 30 });
  store.batch("AI 自動編集", (d) => { for (const op of out.ops) d(op.type, op.payload); });
  const clips = store.project.tracks.reduce((m, t) => m + t.clips.length, 0);
  assert.ok(clips >= 3, "クリップが作られていない");
  assert.equal(core.schema.validateProject(store.project).ok, true);
  assert.equal(store.canUndo(), true);
  store.undo();
  assert.equal(store.project.tracks.reduce((m, t) => m + t.clips.length, 0), 0, "取消 1 回で元に戻らない");
});

test("resolvePlan: LLM 由来の Plan（repair 済み）も core を通る", { skip: needCore }, () => {
  const assets = mkAssets();
  const llmPlan = PL.repairPlan({
    title: "AI", ratio: "9:16", targetDuration: 18, pacing: "fast", style: "short", captions: "auto",
    music: { assetId: "as_m", gain: 0.35, duck: true, startAt: "auto" },
    grade: { contrast: 0.2, saturation: 0.1 },
    endCard: { text: "またね", duration: 1.4 },
    segments: [
      { assetId: "as_a", pick: "best", want: 6, speed: 1, transition: "cut", text: { content: "タイトル", role: "title", emphasis: 1 }, fx: ["shake"] },
      { assetId: "as_b", pick: { in: 4, out: 10 }, want: 6, speed: 2, transition: "crossfade" },
      { assetId: "as_c", pick: "auto", want: 6, speed: 1, transition: "zoomIn", text: { content: "しゃしん", role: "caption", emphasis: 0.5 } }
    ]
  }, { assets, intent: IN.parseIntentLocal("縦で18秒", { assets }) });
  assert.equal(PL.validatePlan(llmPlan, { assets }).ok, true);
  const project = mkProject(assets);
  const out = R.resolvePlan(llmPlan, { project, assets, beats: mkBeats(120, 180), fps: 30 });
  assert.deepEqual(applyAll(project, out.ops), []);
  assert.equal(core.schema.validateProject(project).ok, true);
  assert.equal(project.settings.ratio, "9:16");
  // 色は全ての映像クリップに乗る / 効果も付く
  const vclips = clipsOf(project, "video");
  for (const c of vclips) assert.ok(c.color && Math.abs(c.color.contrast - 0.2) < 1e-6, "grade が乗っていない");
  assert.ok(vclips.some((c) => c.fx.length && c.fx[0].type === "shake" && c.fx[0].id));
  // speed 2 のクリップは素材を 2 倍の範囲使う
  const fast = vclips.find((c) => c.speed === 2);
  assert.ok(fast && Math.abs((fast.out - fast.in) - fast.duration * 2) < 2e-2);
});

test("resolvePlan: トラックが上限でも op は失敗しない（重ねて warning）", { skip: needCore }, () => {
  const assets = mkAssets();
  const project = mkProject(assets);
  /* 上限まで video トラックを埋める（全部に 1 本ずつクリップを置いて「空き」を消す） */
  for (let i = 0; i < core.schema.MAX_TRACKS; i++) {
    const trackId = core.ops.applyOp(project, "track.add", { kind: "video" }).trackId;
    core.ops.applyOp(project, "clip.add", { trackId, clip: { kind: "video", assetId: "as_b", start: 0, duration: 1 }, at: 0 });
  }
  const out = R.resolvePlan(mkPlan({ segments: [seg("as_a", 2)] }), { project, assets, fps: FPS });
  assert.equal(out.ops.filter((o) => o.type === "track.add").length, 0);
  assert.ok(out.warnings.some((w) => w.indexOf("上限") >= 0), JSON.stringify(out.warnings));
  assert.deepEqual(applyAll(project, out.ops), [], "上限に当たって op が投げた");
  assert.equal(core.schema.validateProject(project).ok, true);
});

test("resolvePlan: 拍が無い beat で「ビート同期」と言わない", { skip: needAi }, () => {
  const assets = mkAssets();
  const out = R.resolvePlan(mkPlan({ pacing: "beat", segments: [seg("as_a", 2)] }), { project: mkProject(assets), assets, beats: null, fps: FPS });
  assert.ok(out.summary.indexOf("ビート同期") < 0, out.summary);
  assert.ok(out.summary.indexOf("拍が不明") >= 0, out.summary);
});

test("resolvePlan: fps が違っても丸めが崩れない", { skip: needCore }, () => {
  const assets = mkAssets();
  for (const fps of [24, 25, 30, 50, 60]) {
    const project = mkProject(assets, { settings: Object.assign(core.schema.defaultSettings(), { fps }) });
    const plan = PL.planLocal(IN.parseIntentLocal("20秒、テロップ", { assets }), assets, null);
    const out = R.resolvePlan(plan, { project, assets, beats: mkBeats(128, 200), fps });
    assert.deepEqual(applyAll(project, out.ops), [], `fps ${fps} で op が失敗`);
    assert.equal(core.schema.validateProject(project).ok, true, `fps ${fps} で不整合`);
    for (const c of clipsOf(project, "video")) {
      const f = 1 / fps;
      assert.ok(Math.abs(c.duration / f - Math.round(c.duration / f)) < 1e-3, `fps ${fps}: 尺がフレームに乗らない（${c.duration}）`);
    }
  }
});
