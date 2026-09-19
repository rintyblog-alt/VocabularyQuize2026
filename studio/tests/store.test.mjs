/* ══════════════════════════════════════════════════════════════════════
   studio/tests/store.test.mjs — core/store.js の試験

   ★ 何を見ているか（契約書 §3 の Store そのもの）
     1. 契約どおりの API が揃っていること
     2. dispatch → undo → redo で **deepEqual に戻る**こと／失敗時は無変化
     3. batch: 複数を 1 単位・入れ子も 1 単位・throw で全部巻き戻る
     4. 合体（coalesce）の境界: 120ms 以内の同 type は 1 単位、
        clip.split / clip.add は合体しない、相手が違えば合体しない
     5. 再入防止: subscribe の中の dispatch がキューに入って後で流れる
     6. 選択の自動解除（clip / track / keyframe）と undo での選択の復元
     7. 履歴の上限 120 を超えたときの最古破棄
     8. view 更新が履歴に積まれない・通知は kind:"view"・凍結されている
     9. dirty / markClean / snapshot / toJSON / replace

   ★ ops.js は別の担当（まだ無い / 未完成でも通るように）
     試験の中だけで **小さな偽 op** を作り、`createStore(p, { ops })` で渡す。
     module 直置きの `OPS` へ代入する道も 1 件だけ確かめる（registerOps）。

   走らせ方: node --test studio/tests/store.test.mjs
   ══════════════════════════════════════════════════════════════════════ */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createStore, OPS, registerOps, opLabel, opsReady,
  HISTORY_LIMIT, COALESCE_MS, TOOLS, NO_COALESCE_TYPES, StoreError
} from "../src/core/store.js";
import { newProject, MIN_CLIP, findClip } from "../src/core/schema.js";

/* ── 道具 ─────────────────────────────────────────────────────── */

/** 素材 1 つ・映像トラック（cl_1 と cl_2 は離して置く）・音声トラック */
function baseProject() {
  return newProject({
    name: "試験",
    assets: [{
      id: "as_1", kind: "video", name: "a.mp4", mime: "video/mp4",
      duration: 30, width: 1920, height: 1080, storage: { kind: "idb", key: "k1" }
    }],
    tracks: [
      {
        id: "tr_1", kind: "video", name: "V1", clips: [
          { id: "cl_1", kind: "video", assetId: "as_1", start: 0, duration: 2, in: 0, out: 2 },
          { id: "cl_2", kind: "video", assetId: "as_1", start: 5, duration: 2, in: 5, out: 7 }
        ]
      },
      { id: "tr_2", kind: "audio", name: "A1", clips: [] }
    ]
  });
}

const track0 = (p) => p.tracks[0];
const clipIds = (p) => track0(p).clips.map((c) => c.id);

/** 契約書 §4 の op と同じ形（draft を書き換える純関数）だけを並べた偽物 */
const FAKE = {
  "clip.add": (draft, payload) => {
    const id = String(payload.id || "cl_x");
    draft.tracks[0].clips.push({
      id, kind: "shape", assetId: null, name: "",
      start: Number(payload.start || 0), duration: Number(payload.duration || 1),
      in: 0, out: 0, keys: {}, fx: [], transitionIn: null, transitionOut: null
    });
    return { clipId: id, id };
  },
  "clip.remove": (draft, payload) => {
    let n = 0;
    for (const tr of draft.tracks) {
      const i = tr.clips.findIndex((c) => c.id === payload.clipId);
      if (i >= 0) { tr.clips.splice(i, 1); n++; }
    }
    if (!n) throw new Error(`clip "${payload.clipId}" が無い`);
    return { removed: n };
  },
  "clip.move": (draft, payload) => {
    const hit = findClip(draft, payload.clipId);
    if (!hit) throw new Error("移動する clip が無い");
    hit.clip.start = Number(payload.start);
    return { clipId: payload.clipId };
  },
  "clip.update": (draft, payload) => {
    const hit = findClip(draft, payload.clipId);
    if (!hit) throw new Error("clip が無い");
    Object.assign(hit.clip, payload.patch || {});
    return true;
  },
  "clip.split": (draft, payload) => {
    const hit = findClip(draft, payload.clipId);
    if (!hit) throw new Error("分割する clip が無い");
    const a = hit.clip;
    const at = Number(payload.at);
    const b = Object.assign({}, a, { id: a.id + "_b", start: at, duration: a.start + a.duration - at });
    a.duration = at - a.start;
    hit.track.clips.splice(hit.index + 1, 0, b);
    return { ids: [a.id, b.id] };
  },
  "track.remove": (draft, payload) => {
    const i = draft.tracks.findIndex((t) => t.id === payload.trackId);
    if (i < 0) throw new Error("track が無い");
    draft.tracks.splice(i, 1);
    return true;
  },
  "key.add": (draft, payload) => {
    const hit = findClip(draft, payload.clipId);
    if (!hit) throw new Error("clip が無い");
    if (!hit.clip.keys || typeof hit.clip.keys !== "object") hit.clip.keys = {};
    const list = hit.clip.keys[payload.path] || (hit.clip.keys[payload.path] = []);
    list.push({ t: Number(payload.t || 0), v: Number(payload.v || 0), ease: "linear" });
    return { index: list.length - 1 };
  },
  "project.rename": (draft, payload) => { draft.name = String(payload.name); return true; },
  "settings.update": (draft, payload) => { Object.assign(draft.settings, payload.patch || {}); return true; },
  /** わざと失敗する op（巻き戻しの試験用） */
  "boom.fail": () => { throw new Error("わざと失敗"); }
};

/** 偽 op を積んだ store（now を差し替えられる） */
function mk(opts) {
  const o = opts || {};
  return createStore(o.project || baseProject(), Object.assign({ ops: FAKE }, o));
}

/* ── 1. 形（契約書 §3 の API）──────────────────────────────────── */

test("契約書 §3 の API が揃っている", () => {
  const store = mk();
  for (const k of ["subscribe", "dispatch", "batch", "undo", "redo", "canUndo", "canRedo",
    "history", "select", "selectKeyframe", "setView", "snapshot", "replace",
    "toJSON", "markClean", "dispose", "clearHistory"]) {
    assert.equal(typeof store[k], "function", `${k} が無い`);
  }
  assert.equal(typeof store.project, "object");
  assert.deepEqual(Object.keys(store.selection).sort(), ["clipIds", "keyframe", "trackId"]);
  assert.deepEqual(
    Object.keys(store.view).sort(),
    ["followPlayhead", "inPoint", "outPoint", "playhead", "scrollX", "tool", "zoom"]
  );
  assert.equal(store.dirty, false);
  assert.equal(HISTORY_LIMIT, 120);
  assert.equal(COALESCE_MS, 120);
  assert.ok(TOOLS.includes("select") && TOOLS.includes("razor"));
  assert.ok(NO_COALESCE_TYPES.has("clip.split") && NO_COALESCE_TYPES.has("clip.add"));
  assert.equal(opLabel("clip.split"), "分割");
  assert.equal(opLabel("batch"), "まとめて編集", "ops.js が知らない見出しは store が答える");
  assert.equal(opLabel("なにこれ"), "なにこれ");
  assert.ok(opsReady() instanceof Promise);
});

test("selection と view は凍結されている（間違いがその場で分かる）", () => {
  const store = mk();
  assert.throws(() => { store.view.playhead = 3; }, TypeError);
  assert.throws(() => { store.selection.clipIds.push("cl_1"); }, TypeError);
});

test("知らない op は StoreError（何も変わらない）", () => {
  const store = mk();
  const before = store.snapshot();
  assert.throws(() => store.dispatch("no.such.op", {}), (e) => e instanceof StoreError && e.code === "unknown-op");
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.history().length, 0);
  assert.equal(store.dirty, false);
});

/* ── 2. dispatch / undo / redo ─────────────────────────────────── */

test("dispatch → undo → redo で deepEqual に戻る", () => {
  const store = mk();
  const before = store.snapshot();
  const res = store.dispatch("clip.move", { clipId: "cl_1", start: 1.25 });
  assert.deepEqual(res, { clipId: "cl_1" });            // op の返り値がそのまま返る
  const after = store.snapshot();
  assert.equal(findClip(store.project, "cl_1").clip.start, 1.25);
  assert.notDeepEqual(after, before);
  assert.equal(store.canUndo(), true);
  assert.equal(store.canRedo(), false);

  assert.equal(store.undo(), true);
  assert.deepEqual(store.snapshot(), before);           // 元に戻る
  assert.equal(store.canRedo(), true);
  assert.equal(store.redo(), true);
  assert.deepEqual(store.snapshot(), after);            // やり直せる
  assert.equal(store.undo(), true);
  assert.equal(store.undo(), false);                    // もう無い
  assert.deepEqual(store.snapshot(), before);
});

test("op が失敗したら何も変わらない（clone を捨てるだけ）", () => {
  const store = mk();
  store.dispatch("clip.move", { clipId: "cl_1", start: 1 });
  const before = store.snapshot();
  const hist = store.history();
  assert.throws(() => store.dispatch("boom.fail", {}), /わざと失敗/);
  assert.throws(() => store.dispatch("clip.remove", { clipId: "cl_nope" }), /が無い/);
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(store.history(), hist);
});

test("history() は [{label, at, type}]", async () => {
  await opsReady();                 // 表示名の持ち主（ops.js）を先に読み込む
  let t = 1000;
  const store = mk({ now: () => t });
  store.dispatch("clip.add", { id: "cl_a" });
  t += 500;
  store.dispatch("project.rename", { name: "あ" });
  const h = store.history();
  assert.equal(h.length, 2);
  assert.deepEqual(Object.keys(h[0]).sort(), ["at", "label", "type"]);
  assert.deepEqual(h.map((e) => e.type), ["clip.add", "project.rename"]);
  assert.deepEqual(h.map((e) => e.label), [opLabel("clip.add"), opLabel("project.rename")]);
  assert.deepEqual(h.map((e) => e.at), [1000, 1500]);
  // 同じ type を続けて打つと合体するので、時刻を空けて別単位にする
  t += 500;
  store.dispatch("project.rename", { name: "い" }, { label: "自動編集の仕上げ" });
  assert.equal(store.history().length, 3);
  assert.equal(store.history()[2].label, "自動編集の仕上げ", "label は呼び出し側から差し替えられる");
});

test("undo / redo で選択も一緒に戻る", () => {
  const store = mk();
  store.select(["cl_1"]);
  store.dispatch("clip.add", { id: "cl_a" });
  store.select(["cl_a"]);
  assert.deepEqual(store.selection.clipIds, ["cl_a"]);
  store.undo();                                          // clip.add の直前へ
  assert.deepEqual(store.selection.clipIds, ["cl_1"]);   // 選択も当時の物
  store.redo();
  assert.deepEqual(store.selection.clipIds, ["cl_a"]);
});

/* ── 3. batch ─────────────────────────────────────────────────── */

test("batch は複数 dispatch を 1 undo 単位にまとめる", () => {
  const store = mk();
  const before = store.snapshot();
  const out = store.batch("3 つ足す", (d) => {
    d("clip.add", { id: "cl_a", start: 10 });
    d("clip.add", { id: "cl_b", start: 12 });
    return d("clip.add", { id: "cl_c", start: 14 });
  });
  assert.deepEqual(out, { clipId: "cl_c", id: "cl_c" });
  assert.deepEqual(clipIds(store.project), ["cl_1", "cl_2", "cl_a", "cl_b", "cl_c"]);
  assert.equal(store.history().length, 1);
  assert.equal(store.history()[0].label, "3 つ足す", "batch は label をそのまま使う");
  assert.equal(store.undo(), true);
  assert.deepEqual(store.snapshot(), before);
});

test("batch の入れ子も 1 単位（深さを数える）", () => {
  const store = mk();
  store.batch("外", (d) => {
    d("clip.add", { id: "cl_a", start: 10 });
    store.batch("内", (d2) => {
      d2("clip.add", { id: "cl_b", start: 12 });
      store.batch("さらに内", (d3) => d3("clip.add", { id: "cl_c", start: 14 }));
    });
  });
  assert.equal(store.history().length, 1);
  assert.equal(store.history()[0].label, "外");
  assert.deepEqual(clipIds(store.project), ["cl_1", "cl_2", "cl_a", "cl_b", "cl_c"]);
  store.undo();
  assert.deepEqual(clipIds(store.project), ["cl_1", "cl_2"]);
});

test("batch の中で throw したら全部巻き戻る", () => {
  const store = mk();
  const before = store.snapshot();
  let seen = 0;
  const off = store.subscribe(() => { seen++; });
  assert.throws(() => store.batch("途中でやめる", (d) => {
    d("clip.add", { id: "cl_a", start: 10 });
    d("clip.move", { clipId: "cl_1", start: 1 });
    throw new Error("やめた");
  }), /やめた/);
  off();
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.history().length, 0);
  assert.equal(store.dirty, false);
  assert.equal(seen, 0, "巻き戻したなら通知も出さない");
});

test("batch の中の op が失敗したら（fn が握りつぶしても）丸ごと巻き戻る", () => {
  const store = mk();
  const before = store.snapshot();
  assert.throws(() => store.batch("取引", (d) => {
    d("clip.add", { id: "cl_a", start: 10 });
    try { d("boom.fail", {}); } catch (_e) { /* 握りつぶしても巻き戻る */ }
    d("clip.add", { id: "cl_b", start: 12 });
  }), /わざと失敗/);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.history().length, 0);
});

test("batch が何もしなかったら履歴も通知も作らない", () => {
  const store = mk();
  let seen = 0;
  store.subscribe(() => { seen++; });
  const out = store.batch("空", () => 42);
  assert.equal(out, 42);
  assert.equal(store.history().length, 0);
  assert.equal(seen, 0);
  assert.equal(store.dirty, false);
});

test("batch の途中でも store.project は読める（次の op が前の結果を見られる）", () => {
  const store = mk();
  store.batch("続けて足す", (d) => {
    d("clip.add", { id: "cl_a", start: 10, duration: 2 });
    const last = store.project.tracks[0].clips[store.project.tracks[0].clips.length - 1];
    d("clip.add", { id: "cl_b", start: last.start + last.duration, duration: 2 });
  });
  const cl = findClip(store.project, "cl_b");
  assert.equal(cl.clip.start, 12);
});

/* ── 4. 合体（coalesce）の境界 ─────────────────────────────────── */

test("120ms 以内の同 type・同じ相手は 1 単位に合体する", () => {
  let t = 1000;
  const store = mk({ now: () => t });
  const before = store.snapshot();
  store.dispatch("clip.move", { clipId: "cl_1", start: 0.5 });
  t += 119;
  store.dispatch("clip.move", { clipId: "cl_1", start: 1.0 });
  t += 120;                                        // ちょうど 120ms も合体する
  store.dispatch("clip.move", { clipId: "cl_1", start: 1.5 });
  assert.equal(store.history().length, 1, "3 回のドラッグが 1 単位");
  assert.equal(store.history()[0].at, t, "at は最後の操作の時刻");
  store.undo();
  assert.deepEqual(store.snapshot(), before, "1 回の取消で最初まで戻る");

  t += 1000;
  store.redo();
  t += 121;                                        // 121ms 空いたら別の単位
  store.dispatch("clip.move", { clipId: "cl_1", start: 2.0 });
  assert.equal(store.history().length, 2);
});

test("clip.split と clip.add は合体しない", () => {
  let t = 1000;
  const store = mk({ now: () => t });
  store.dispatch("clip.add", { id: "cl_a", start: 10 });
  t += 10;
  store.dispatch("clip.add", { id: "cl_b", start: 12 });
  assert.equal(store.history().length, 2, "clip.add は続けても別単位");
  t += 10;
  store.dispatch("clip.split", { clipId: "cl_1", at: 1 });
  t += 10;
  store.dispatch("clip.split", { clipId: "cl_2", at: 6 });
  assert.equal(store.history().length, 4, "clip.split も別単位");
  // clip.remove のような「1 回で意味が完結する」op も合体しない
  t += 10;
  store.dispatch("clip.remove", { clipId: "cl_a" });
  t += 10;
  store.dispatch("clip.remove", { clipId: "cl_b" });
  assert.equal(store.history().length, 6);
});

test("相手が違えば合体しない / coalesce:false で止められる", () => {
  let t = 1000;
  const store = mk({ now: () => t });
  store.dispatch("clip.move", { clipId: "cl_1", start: 0.5 });
  t += 10;
  store.dispatch("clip.move", { clipId: "cl_2", start: 6 });   // 相手が違う
  assert.equal(store.history().length, 2);
  t += 10;
  store.dispatch("clip.move", { clipId: "cl_2", start: 6.5 }, { coalesce: false });
  assert.equal(store.history().length, 3);
  t += 10;
  store.dispatch("clip.move", { clipId: "cl_2", start: 7 });
  assert.equal(store.history().length, 4, "coalesce:false の 1 件には吸われない");
});

test("batch は前後の dispatch と合体しない", () => {
  let t = 1000;
  const store = mk({ now: () => t });
  store.dispatch("clip.move", { clipId: "cl_1", start: 0.5 });
  t += 10;
  store.batch("まとめ", (d) => d("clip.move", { clipId: "cl_1", start: 1 }));
  t += 10;
  store.dispatch("clip.move", { clipId: "cl_1", start: 1.5 });
  assert.equal(store.history().length, 3);
});

/* ── 5. 再入防止（通知の中の dispatch）───────────────────────── */

test("subscribe の中の dispatch はキューに入って後で流れる", () => {
  const store = mk();
  const seen = [];
  let inner = "まだ";
  const off = store.subscribe((ev) => {
    seen.push(ev.kind + ":" + ev.op);
    if (ev.op === "clip.add") inner = store.dispatch("project.rename", { name: "再入" });
  });
  const res = store.dispatch("clip.add", { id: "cl_a", start: 10 });
  off();
  assert.deepEqual(res, { clipId: "cl_a", id: "cl_a" }, "外側の返り値は普通に返る");
  assert.equal(inner, undefined, "通知中の dispatch は後回し（undefined）");
  assert.equal(store.project.name, "再入", "後で確かに流れている");
  assert.deepEqual(seen, ["project:clip.add", "project:project.rename"]);
  assert.deepEqual(store.history().map((e) => e.type), ["clip.add", "project.rename"],
    "履歴は入れ子にならず 2 件");
});

test("通知の中の setView / select も後で流れる", () => {
  const store = mk();
  let once = false;
  const off = store.subscribe((ev) => {
    if (ev.kind === "project" && !once) {
      once = true;
      store.setView({ playhead: 4 });
      store.select(["cl_1"]);
    }
  });
  store.dispatch("clip.move", { clipId: "cl_1", start: 1 });
  off();
  assert.equal(store.view.playhead, 4);
  assert.deepEqual(store.selection.clipIds, ["cl_1"]);
  assert.equal(store.history().length, 1, "view / select は履歴に積まない");
});

test("購読者が throw しても編集は止まらない", () => {
  const store = mk();
  let after = 0;
  store.subscribe(() => { throw new Error("購読者の事故"); });
  store.subscribe(() => { after++; });
  store.dispatch("clip.move", { clipId: "cl_1", start: 1 });
  assert.equal(after, 1);
  assert.equal(findClip(store.project, "cl_1").clip.start, 1);
});

/* ── 6. 選択 ──────────────────────────────────────────────────── */

test("select の additive / toggle と 無い id の除去", () => {
  const store = mk();
  assert.deepEqual(store.select(["cl_1"]).clipIds, ["cl_1"]);
  assert.deepEqual(store.select(["cl_2"], { additive: true }).clipIds, ["cl_1", "cl_2"]);
  assert.deepEqual(store.select(["cl_1"], { toggle: true }).clipIds, ["cl_2"]);
  assert.deepEqual(store.select(["cl_nope"]).clipIds, [], "project に無い id は落ちる");
  assert.deepEqual(store.select("cl_1").clipIds, ["cl_1"], "文字列 1 つでも良い");
  assert.deepEqual(store.select(null).clipIds, []);
  assert.equal(store.select([], { trackId: "tr_2" }).trackId, "tr_2");
  assert.equal(store.select([], { trackId: "tr_nope" }).trackId, null);
});

test("選択した clip が消えたら自動で選択解除", () => {
  const store = mk();
  store.select(["cl_1", "cl_2"], { trackId: "tr_1" });
  const events = [];
  store.subscribe((ev) => events.push(ev.kind + ":" + ev.op));
  store.dispatch("clip.remove", { clipId: "cl_1" });
  assert.deepEqual(store.selection.clipIds, ["cl_2"]);
  assert.deepEqual(events, ["project:clip.remove", "selection:auto"]);
  store.dispatch("track.remove", { trackId: "tr_1" });
  assert.deepEqual(store.selection.clipIds, [], "トラックごと消えたら中の clip も外れる");
  assert.equal(store.selection.trackId, null);
  store.undo();
  assert.deepEqual(store.selection.clipIds, ["cl_2"], "取消で選択も戻る");
});

test("keyframe の選択も指す先が消えたら外れる", () => {
  const store = mk();
  store.dispatch("key.add", { clipId: "cl_1", path: "opacity", t: 0.5, v: 0.5 });
  store.select(["cl_1"]);
  const sel = store.selectKeyframe({ clipId: "cl_1", path: "opacity", index: 0 });
  assert.deepEqual(sel.keyframe, { clipId: "cl_1", path: "opacity", index: 0 });
  store.dispatch("clip.move", { clipId: "cl_1", start: 1 });
  assert.ok(store.selection.keyframe, "関係ない編集では外れない");
  store.dispatch("clip.remove", { clipId: "cl_1" });
  assert.equal(store.selection.keyframe, null);
  assert.deepEqual(store.selection.clipIds, []);
  // 無い clip は選べない / null で解除
  store.selectKeyframe({ clipId: "cl_nope", path: "opacity", index: 0 });
  assert.equal(store.selection.keyframe, null);
  assert.equal(store.selectKeyframe(null).keyframe, null);
});

/* ── 7. 履歴の上限 ────────────────────────────────────────────── */

test("上限 120 を超えたら最も古い物から捨てる", () => {
  let t = 0;
  const store = mk({ now: () => t });
  const ats = [];
  for (let i = 0; i < 130; i++) {                        // clip.add は合体しない
    t += 1000;
    ats.push(t);
    store.dispatch("clip.add", { id: "cl_" + i, start: 100 + i * 2 });
  }
  assert.equal(store.history().length, 120);
  assert.equal(store.history()[0].at, ats[10], "最古の 10 件が消えている");
  assert.equal(track0(store.project).clips.length, 132);
  let n = 0;
  while (store.undo()) n++;
  assert.equal(n, 120);
  assert.equal(track0(store.project).clips.length, 12, "捨てた 10 件分は戻せない");
  assert.equal(store.canUndo(), false);
  // 上限は差し替えられる（試験と軽い端末のため）
  const small = createStore(baseProject(), { ops: FAKE, historyLimit: 3 });
  for (let i = 0; i < 5; i++) small.dispatch("clip.add", { id: "cl_" + i, start: 100 + i * 2 });
  assert.equal(small.history().length, 3);
});

/* ── 8. view ──────────────────────────────────────────────────── */

test("view の更新は履歴に積まれない・通知は kind:view", () => {
  const store = mk();
  const events = [];
  store.subscribe((ev) => events.push(ev));
  const v = store.setView({ playhead: 2.5, zoom: 40, tool: "razor", followPlayhead: false });
  assert.equal(v.playhead, 2.5);
  assert.equal(v.zoom, 40);
  assert.equal(v.tool, "razor");
  assert.equal(v.followPlayhead, false);
  assert.equal(store.history().length, 0);
  assert.equal(store.canUndo(), false);
  assert.equal(store.dirty, false, "view は保存対象ではない");
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "view");
  assert.equal(events[0].op, "setView");
  assert.deepEqual(events[0].detail, { playhead: 2.5, zoom: 40, followPlayhead: false, tool: "razor" });
  // 同じ値なら通知しない（毎フレームの空振りを減らす）
  store.setView({ playhead: 2.5 });
  assert.equal(events.length, 1);
});

test("view の値は有限化・範囲・道具名を守る", () => {
  const store = mk();
  assert.equal(store.setView({ playhead: -5 }).playhead, 0);
  assert.equal(store.setView({ playhead: NaN }).playhead, 0);
  assert.equal(store.setView({ zoom: 0 }).zoom, 0.001);
  assert.equal(store.setView({ scrollX: -1 }).scrollX, 0);
  assert.equal(store.setView({ tool: "razor" }).tool, "razor");
  assert.equal(store.setView({ tool: "ないよ" }).tool, "razor", "知らない道具は無視");
  const v = store.setView({ inPoint: 8, outPoint: 3 });
  assert.deepEqual([v.inPoint, v.outPoint], [3, 8], "逆さに来たら入れ替える");
  assert.equal(store.setView({ inPoint: null }).inPoint, null);
});

/* ── 9. dirty / snapshot / replace ────────────────────────────── */

test("dirty は project の変更だけで立ち、markClean で下がる", () => {
  const store = mk();
  assert.equal(store.dirty, false);
  store.setView({ playhead: 1 });
  store.select(["cl_1"]);
  assert.equal(store.dirty, false);
  store.dispatch("clip.move", { clipId: "cl_1", start: 1 });
  assert.equal(store.dirty, true);
  store.markClean();
  assert.equal(store.dirty, false);
  store.undo();
  assert.equal(store.dirty, true, "取消も保存が必要な変更");
});

test("snapshot / toJSON は独立した複製", () => {
  const store = mk();
  const snap = store.snapshot();
  snap.tracks[0].clips[0].start = 99;
  snap.name = "書き換えた";
  assert.equal(findClip(store.project, "cl_1").clip.start, 0);
  assert.equal(store.project.name, "試験");
  assert.deepEqual(JSON.parse(JSON.stringify(store)).name, "試験");
  assert.deepEqual(store.toJSON(), store.snapshot());
});

test("replace は 1 取消単位で差し替える", () => {
  const store = mk();
  store.select(["cl_1"]);
  const before = store.snapshot();
  const next = baseProject();
  next.name = "別のやつ";
  const got = store.replace(next, "読み込み");
  assert.equal(got.name, "別のやつ");
  assert.equal(store.project.name, "別のやつ");
  assert.equal(store.history()[0].label, "読み込み");
  assert.equal(store.dirty, true);
  store.markClean();
  store.undo();
  assert.deepEqual(store.snapshot(), before);
});

test("dispose の後は警告して何もしない（古い UI の後始末で落ちない）", () => {
  const store = mk();
  store.dispatch("clip.move", { clipId: "cl_1", start: 1 });
  const before = store.snapshot();
  store.dispose();
  assert.equal(store.disposed, true);
  assert.equal(store.dispatch("clip.move", { clipId: "cl_1", start: 2 }), undefined);
  assert.equal(store.undo(), undefined);
  assert.equal(store.setView({ playhead: 9 }), undefined);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.history().length, 0);
});

/* ── 10. 軽い整合（dispatch の度に走る）──────────────────────── */

test("dispatch の後は clip が start 昇順・最短尺・遷移の尺が収まる", () => {
  const store = mk();
  store.dispatch("clip.move", { clipId: "cl_1", start: 8 });      // cl_2(5) より後ろへ
  assert.deepEqual(clipIds(store.project), ["cl_2", "cl_1"], "start 昇順に並べ替わる");
  store.dispatch("clip.update", { clipId: "cl_1", patch: { duration: 0.001 } });
  assert.equal(findClip(store.project, "cl_1").clip.duration, MIN_CLIP, "MIN_CLIP まで持ち上がる");
  store.dispatch("clip.update", {
    clipId: "cl_1", patch: { duration: 3, transitionIn: { type: "crossfade", duration: 99, params: {} } }
  });
  const cl1 = findClip(store.project, "cl_1").clip;
  assert.ok(cl1.transitionIn.duration <= cl1.duration, "遷移が自分の尺を超えない");
  // 重なったら「前を縮める」（schema.normalizeProject と同じ規則）
  store.dispatch("clip.update", { clipId: "cl_2", patch: { duration: 10 } });
  const a = store.project.tracks[0].clips[0], b = store.project.tracks[0].clips[1];
  assert.equal(a.id, "cl_2");
  assert.ok(a.start + a.duration <= b.start + 1e-6, "重なりが残らない");
  assert.equal(a.duration, 3, "前（cl_2）が 8 まで縮む");
  // keys は t 昇順・重複なし
  store.dispatch("key.add", { clipId: "cl_1", path: "opacity", t: 2, v: 1 });
  store.dispatch("key.add", { clipId: "cl_1", path: "opacity", t: 0.5, v: 0.2 });
  store.dispatch("key.add", { clipId: "cl_1", path: "opacity", t: 2, v: 0.7 });
  const keys = findClip(store.project, "cl_1").clip.keys.opacity;
  assert.deepEqual(keys.map((k) => k.t), [0.5, 2]);
  assert.equal(keys[1].v, 0.7, "同じ t は後の勝ち");
});

test("updatedAt は変更のたびに進む（自動保存の目印）", () => {
  let t = 5000;
  const store = mk({ now: () => t });
  store.dispatch("project.rename", { name: "あ" });
  assert.equal(store.project.updatedAt, 5000);
  t = 7000;
  store.dispatch("project.rename", { name: "い" }, { coalesce: false });
  assert.equal(store.project.updatedAt, 7000);
});

/* ── 11. 性能まわりの約束 ─────────────────────────────────────── */

test("解析結果（asset.analysis）は履歴の複製で共有される", () => {
  const p = baseProject();
  p.assets[0].analysis = { version: 1, motion: { hz: 2, values: new Array(2000).fill(0.5) } };
  const store = mk({ project: p });
  const an = store.project.assets[0].analysis;
  assert.ok(an && an.motion.values.length === 2000, "normalize を通っても残る");
  store.dispatch("clip.move", { clipId: "cl_1", start: 1 });
  assert.equal(store.project.assets[0].analysis, an, "複製しないので同じ参照");
  store.undo();
  assert.equal(store.project.assets[0].analysis, an);
  // 共有を切ることもできる
  const store2 = createStore(p, { ops: FAKE, shareAnalysis: false });
  const an2 = store2.project.assets[0].analysis;
  store2.dispatch("clip.move", { clipId: "cl_1", start: 1 });
  assert.notEqual(store2.project.assets[0].analysis, an2);
  assert.deepEqual(store2.project.assets[0].analysis, an2);
});

test("大きめの project でも 1 dispatch が重すぎない", () => {
  const p = baseProject();
  for (let i = 0; i < 300; i++) {
    p.tracks[0].clips.push({
      id: "cl_p" + i, kind: "video", assetId: "as_1",
      start: 20 + i * 2, duration: 1.5, in: 0, out: 1.5
    });
  }
  const store = mk({ project: p });
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) store.dispatch("clip.move", { clipId: "cl_p10", start: 40 + i * 0.01 });
  const per = (Date.now() - t0) / 60;
  // 60fps の 16.7ms を独り占めしない、という程度の緩い確認（機械差があるので甘め）
  assert.ok(per < 16, `1 dispatch が ${per.toFixed(2)}ms（clip 300 本で重すぎる）`);
});

/* ── 12. OPS 台帳の道（ops.js が未完成でも動く）───────────────── */

test("module 直置きの OPS / registerOps 経由でも dispatch できる", async () => {
  await opsReady();                       // ops.js が在れば束ねられる（無くても解決する）
  const n = registerOps({
    "test.only.bump": (draft, payload) => { draft.name = "bump:" + payload.by; return payload.by; },
    "test.only.bad": 123                  // 関数でない物は警告して数えない
  });
  assert.equal(n, 1);
  assert.equal(typeof OPS["test.only.bump"], "function");
  const store = createStore(baseProject());   // ops を渡さない = OPS を使う
  assert.equal(store.dispatch("test.only.bump", { by: 2 }), 2);
  assert.equal(store.project.name, "bump:2");
  store.undo();
  assert.equal(store.project.name, "試験");
  delete OPS["test.only.bump"];
});
