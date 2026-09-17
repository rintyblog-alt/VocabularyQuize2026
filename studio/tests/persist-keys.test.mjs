/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/persist-keys.test.mjs — 保存庫（core/persist.js）の純ロジックの試験

   IndexedDB / OPFS / objectURL は Node に無いので、**純関数だけ**を固定する。
   ここで固定するのは「間違えると黙ってデータを失う」所:
     ① planEviction … 捨てる順（プロキシ→サムネ→古いプロジェクト）・LRU・必要量で止まる
                       ・守る物（今開いているプロジェクト / 一番新しい物 / pinned）
     ② 指紋      … size + name + lastModified。素の Blob は指紋を作らない（取り違え防止）
     ③ キー生成  … blob_ の頭・台帳 key の往復（key に ":" が入っても壊れない）・
                    OPFS のファイル名に落とせること
     ④ 容量の丸め … estimate の要約（usage>quota / quota=0 / 欠け）と必要量の切り上げ
     ⑤ JSON を小さく保つ … splitProject / mergeProject の往復と非破壊
     ⑥ 揮発ストレージ … IndexedDB が無い Node でも保存庫が開き、往復すること
                        （iOS のプライベートモードで落ちる先と同じ道）

   走らせ方:
     cd /home/user/VocabularyQuize2026/studio && npm test
     cd /home/user/VocabularyQuize2026 && node --test studio/tests/persist-keys.test.mjs
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  STORES, STORE_NAMES, EVICTION_ORDER, URL_GRACE_MS, SAFETY_BYTES,
  ANALYSIS_PREFIX, LEDGER_PREFIX, OPFS_MIN_BYTES, LOW_SPACE_RATIO,
  StorageError,
  utf8Size, roughByteSize,
  assetFingerprint, assetKey, newAssetKey, analysisKey, ledgerKey, parseLedgerKey, safeFileName,
  isQuotaError, requiredFreeBytes, summarizeEstimate,
  planEviction, splitProject, mergeProject, projectSummary,
  openStorage
} from "../src/core/persist.js";

/* 台帳の見立て（store と size と updatedAt だけ在れば選定できる） */
const E = (store, key, size, updatedAt) => ({ store, key, size, updatedAt });
/** victims を "store/key" の並びにして見やすくする */
const names = (plan) => plan.victims.map((v) => v.store + "/" + v.key);

/* ── ① 決めごと ─────────────────────────────────────────────── */

test("store の名前は契約書 §3 の 6 つ", () => {
  assert.deepEqual(STORE_NAMES.slice(), ["assets", "projects", "proxies", "thumbs", "peaks", "meta"]);
  assert.equal(STORES.assets, "assets");
  assert.equal(URL_GRACE_MS, 30000);           /* 再生中に消えないための猶予 */
  assert.ok(OPFS_MIN_BYTES > 0 && SAFETY_BYTES > 0);
  assert.ok(LOW_SPACE_RATIO > 0.5 && LOW_SPACE_RATIO < 1);
});

test("捨てる順はプロキシ→サムネ→古いプロジェクト（素材とピークは入らない）", () => {
  assert.deepEqual(EVICTION_ORDER.slice(), ["proxies", "thumbs", "projects"]);
  assert.equal(EVICTION_ORDER.indexOf("assets"), -1);
  assert.equal(EVICTION_ORDER.indexOf("peaks"), -1);
});

/* ── ② planEviction: 選定順と必要量 ─────────────────────────── */

test("planEviction: need が 0 以下なら何も捨てない", () => {
  const entries = [E("proxies", "a", 100, 1), E("thumbs", "b", 100, 1)];
  for (const need of [0, -1, NaN, undefined]) {
    const plan = planEviction(entries, need);
    assert.deepEqual(plan.victims, [], "need=" + String(need));
    assert.equal(plan.freed, 0);
    assert.equal(plan.enough, true);
    assert.equal(plan.need, 0);
  }
});

test("planEviction: 同じ store の中は古い順（LRU）", () => {
  const plan = planEviction([
    E("proxies", "new", 10, 300),
    E("proxies", "old", 10, 100),
    E("proxies", "mid", 10, 200)
  ], 25);
  assert.deepEqual(names(plan), ["proxies/old", "proxies/mid", "proxies/new"]);
  assert.equal(plan.freed, 30);
  assert.equal(plan.enough, true);
});

test("planEviction: 必要量に届いた所で止まる（余分に捨てない）", () => {
  const plan = planEviction([
    E("proxies", "p1", 100, 1), E("proxies", "p2", 100, 2), E("proxies", "p3", 100, 3)
  ], 150);
  assert.deepEqual(names(plan), ["proxies/p1", "proxies/p2"]);
  assert.equal(plan.freed, 200);
  assert.equal(plan.enough, true);
  assert.deepEqual(plan.byStore, { proxies: 2 });
});

test("planEviction: プロキシで足りなければサムネ、その次にやっとプロジェクト", () => {
  const entries = [
    E("projects", "prj_old", 50, 10), E("projects", "prj_mid", 50, 20), E("projects", "prj_new", 50, 30),
    E("thumbs", "t_new", 40, 300), E("thumbs", "t_old", 40, 100),
    E("proxies", "px", 30, 500)
  ];
  /* プロキシ 30 だけで足りるとき */
  assert.deepEqual(names(planEviction(entries, 30)), ["proxies/px"]);
  /* プロキシ + サムネ 1 枚 */
  assert.deepEqual(names(planEviction(entries, 60)), ["proxies/px", "thumbs/t_old"]);
  /* プロキシ + サムネ 2 枚 + 一番古いプロジェクト（新しい物は残る） */
  const plan = planEviction(entries, 150);
  assert.deepEqual(names(plan), ["proxies/px", "thumbs/t_old", "thumbs/t_new", "projects/prj_old"]);
  assert.equal(plan.freed, 160);
  assert.deepEqual(plan.byStore, { proxies: 1, thumbs: 2, projects: 1 });
});

test("planEviction: 一番新しいプロジェクトは既定で残す（今開いている物を消さない）", () => {
  const entries = [
    E("projects", "p_old", 100, 10),
    E("projects", "p_new", 100, 99)
  ];
  const plan = planEviction(entries, 1000);        /* いくら要求しても新しい方は残る */
  assert.deepEqual(names(plan), ["projects/p_old"]);
  assert.equal(plan.enough, false);                /* 足りないことを隠さない */
  assert.equal(plan.freed, 100);
  /* keepNewestProjects: 0 にすれば全部が候補（書き出し前の掃除など） */
  assert.deepEqual(
    names(planEviction(entries, 1000, { keepNewestProjects: 0 })),
    ["projects/p_old", "projects/p_new"]
  );
  /* 1 件しか無いプロジェクトは消えない */
  assert.deepEqual(names(planEviction([E("projects", "only", 100, 1)], 500)), []);
});

test("planEviction: keep と pinned は触らない", () => {
  const entries = [
    E("projects", "keepme", 500, 1), E("projects", "p2", 10, 2), E("projects", "p3", 10, 3),
    Object.assign(E("proxies", "px", 500, 1), { pinned: true })
  ];
  const plan = planEviction(entries, 400, { keep: ["keepme"] });
  assert.equal(names(plan).indexOf("projects/keepme"), -1);
  assert.equal(names(plan).indexOf("proxies/px"), -1);
  assert.equal(plan.enough, false);
});

test("planEviction: 対象外の store と size 0 と重複は候補にしない", () => {
  const plan = planEviction([
    E("assets", "blob_x", 999, 1),          /* 原本は絶対に捨てない */
    E("peaks", "as_1", 999, 1),             /* 作り直しが高いので捨てない */
    E("meta", "analysis:as_1", 999, 1),
    E("proxies", "zero", 0, 1),             /* 消しても空かない */
    E("proxies", "unknown", NaN, 1),
    E("proxies", "dup", 10, 5), E("proxies", "dup", 10, 5),
    { store: "proxies" },                   /* key が無い */
    null, 42
  ], 1000);
  assert.deepEqual(names(plan), ["proxies/dup"]);
  assert.equal(plan.freed, 10);
  assert.equal(plan.enough, false);
});

test("planEviction: id でも key でも受ける・入力を書き換えない", () => {
  const entries = [{ store: "thumbs", id: "as_9", size: 20, updatedAt: 3 }];
  const before = JSON.stringify(entries);
  const plan = planEviction(entries, 10);
  assert.deepEqual(names(plan), ["thumbs/as_9"]);
  assert.equal(JSON.stringify(entries), before, "候補の配列を書き換えてはいけない");
  assert.deepEqual(planEviction(null, 100).victims, []);
  assert.deepEqual(planEviction([], 100).victims, []);
});

test("planEviction: 同時刻は key 順（実機と試験で答えが揺れないこと）", () => {
  const plan = planEviction([
    E("proxies", "b", 10, 100), E("proxies", "a", 10, 100), E("proxies", "c", 10, 100)
  ], 20);
  assert.deepEqual(names(plan), ["proxies/a", "proxies/b"]);
});

/* ── ③ 指紋 ─────────────────────────────────────────────────── */

const FILE = { name: "IMG_0001.MOV", size: 12345678, lastModified: 1700000000000, type: "video/quicktime" };

test("assetFingerprint: 同じ size + name + lastModified なら同じ", () => {
  const a = assetFingerprint(FILE);
  const b = assetFingerprint({ name: FILE.name, size: FILE.size, lastModified: FILE.lastModified });
  assert.equal(typeof a, "string");
  assert.equal(a, b);
  assert.ok(a.indexOf("fp1_") === 0, "版を見分けられる頭を付ける: " + a);
});

test("assetFingerprint: size / name / lastModified のどれかが違えば別物", () => {
  const base = assetFingerprint(FILE);
  assert.notEqual(base, assetFingerprint(Object.assign({}, FILE, { size: FILE.size + 1 })));
  assert.notEqual(base, assetFingerprint(Object.assign({}, FILE, { name: "IMG_0002.MOV" })));
  assert.notEqual(base, assetFingerprint(Object.assign({}, FILE, { lastModified: 1700000000001 })));
  /* 長さが同じで中身だけ違う名前も別物になること（hash だけに頼らない） */
  assert.notEqual(
    assetFingerprint(Object.assign({}, FILE, { name: "aaaa.mov" })),
    assetFingerprint(Object.assign({}, FILE, { name: "aaab.mov" }))
  );
});

test("assetFingerprint: 素の Blob（name / lastModified が無い）は null", () => {
  assert.equal(assetFingerprint({ size: 1024 }), null);
  assert.equal(assetFingerprint({ name: "a.mp4", size: 1024 }), null);         /* lastModified 無し */
  assert.equal(assetFingerprint({ name: "", size: 1024, lastModified: 1 }), null);
  assert.equal(assetFingerprint({ name: "a.mp4", size: NaN, lastModified: 1 }), null);
  assert.equal(assetFingerprint({ name: "a.mp4", size: -1, lastModified: 1 }), null);
  assert.equal(assetFingerprint(null), null);
  assert.equal(assetFingerprint("a.mp4"), null);
});

test("assetFingerprint: 日本語・絵文字の名前でも同じ物は同じ", () => {
  const f = { name: "夏の思い出🌻.mp4", size: 999, lastModified: 42 };
  assert.equal(assetFingerprint(f), assetFingerprint(Object.assign({}, f)));
  assert.notEqual(assetFingerprint(f), assetFingerprint(Object.assign({}, f, { name: "夏の思い出.mp4" })));
});

test("assetFingerprint: lastModified 0 は「無い」ではなく 0 として扱う", () => {
  const fp = assetFingerprint({ name: "a.mp4", size: 10, lastModified: 0 });
  assert.equal(typeof fp, "string");
  assert.notEqual(fp, assetFingerprint({ name: "a.mp4", size: 10, lastModified: 1 }));
});

/* ── ④ キー生成 ─────────────────────────────────────────────── */

test("assetKey: 契約書 §1 の blob_ で始まる・指紋が空なら throw", () => {
  const fp = assetFingerprint(FILE);
  assert.equal(assetKey(fp), "blob_" + fp);
  assert.ok(assetKey(fp).indexOf("blob_") === 0);
  assert.throws(() => assetKey(""), StorageError);
  assert.throws(() => assetKey(null), (e) => e instanceof StorageError && !!e.reason);
});

test("newAssetKey: 毎回違う・blob_ で始まる（指紋が取れない物用）", () => {
  const a = newAssetKey(), b = newAssetKey();
  assert.ok(a.indexOf("blob_") === 0);
  assert.notEqual(a, b);
});

test("analysisKey: 解析結果は analysis: の下に置く", () => {
  assert.equal(analysisKey("as_1"), ANALYSIS_PREFIX + "as_1");
  assert.equal(analysisKey(null), ANALYSIS_PREFIX);
});

test("ledgerKey / parseLedgerKey: 往復する（key に ':' が入っても壊れない）", () => {
  const k = ledgerKey("proxies", "as_1");
  assert.equal(k, LEDGER_PREFIX + "proxies:as_1");
  assert.deepEqual(parseLedgerKey(k), { store: "proxies", key: "as_1" });
  /* 本来の key にコロンが在る場合（analysis:as_1 のような物を台帳に載せても戻せること） */
  const k2 = ledgerKey("meta", "analysis:as_1");
  assert.deepEqual(parseLedgerKey(k2), { store: "meta", key: "analysis:as_1" });
  /* 台帳でない物は null（meta を走査したときに他の record を拾わない） */
  assert.equal(parseLedgerKey("analysis:as_1"), null);
  assert.equal(parseLedgerKey(LEDGER_PREFIX), null);
  assert.equal(parseLedgerKey(LEDGER_PREFIX + ":as_1"), null);
  assert.equal(parseLedgerKey(LEDGER_PREFIX + "proxies:"), null);
  assert.equal(parseLedgerKey(""), null);
  assert.equal(parseLedgerKey(null), null);
});

test("safeFileName: OPFS に置ける名前になる・同じ key なら同じ名前", () => {
  const key = assetKey(assetFingerprint(FILE));
  const n1 = safeFileName(key), n2 = safeFileName(key);
  assert.equal(n1, n2);
  assert.ok(/^[A-Za-z0-9._-]+$/.test(n1), "使えない字が残っている: " + n1);
  assert.ok(n1.length <= 96);
  /* 危ない字は落ちるが、落ちた結果で衝突しない（hash が付く） */
  const a = safeFileName("../../etc/passwd");
  assert.equal(a.indexOf("/"), -1);
  assert.notEqual(safeFileName("a/b"), safeFileName("a_b"));
  assert.notEqual(safeFileName("夏.mp4"), safeFileName("冬.mp4"));
  /* 長い名前でも縛られる */
  assert.ok(safeFileName("x".repeat(500)).length <= 96);
  assert.ok(safeFileName("").length > 0);
});

/* ── ⑤ 容量の丸め ───────────────────────────────────────────── */

test("requiredFreeBytes: 1.25 倍 + 余白に切り上げる", () => {
  assert.equal(requiredFreeBytes(0), SAFETY_BYTES);
  assert.equal(requiredFreeBytes(1000), 1250 + SAFETY_BYTES);
  assert.equal(requiredFreeBytes(3), 4 + SAFETY_BYTES);        /* 3.75 → 4（切り上げ） */
  assert.equal(requiredFreeBytes(-5), SAFETY_BYTES);
  assert.equal(requiredFreeBytes(NaN), SAFETY_BYTES);
  assert.equal(requiredFreeBytes(1.2), Math.ceil(2 * 1.25) + SAFETY_BYTES);
});

test("summarizeEstimate: 使用量・空き・割合・％を丸める", () => {
  const s = summarizeEstimate({ usage: 250.4, quota: 1000.6 });
  assert.equal(s.usage, 250);
  assert.equal(s.quota, 1001);
  assert.equal(s.free, 751);
  assert.equal(s.percent, 25);                    /* 0.1% 刻み */
  assert.ok(Math.abs(s.ratio - 250 / 1001) < 1e-12);
  assert.equal(s.low, true);                      /* 1001 バイトは余白より少ない */

  const t = summarizeEstimate({ usage: 1, quota: 3 });
  assert.equal(t.percent, 33.3);                  /* 33.333… → 33.3 */
});

test("summarizeEstimate: quota=0 / usage>quota / 欠け / 無しを壊れずに扱う", () => {
  const z = summarizeEstimate({ usage: 100, quota: 0 });
  assert.equal(z.ratio, 0);                       /* 0 除算をしない */
  assert.equal(z.percent, 0);
  assert.equal(z.free, 0);
  assert.equal(z.low, false);                     /* quota が分からないのに警告しない */

  const over = summarizeEstimate({ usage: 300, quota: 100 });
  assert.equal(over.ratio, 1);                    /* 1 を超えない */
  assert.equal(over.percent, 100);
  assert.equal(over.free, 0);
  assert.equal(over.low, true);

  assert.equal(summarizeEstimate({ usage: 50 }).quota, 0);
  assert.equal(summarizeEstimate({ quota: 50 }).usage, 0);
  assert.equal(summarizeEstimate(null), null);
  assert.equal(summarizeEstimate({}), null);
  assert.equal(summarizeEstimate({ usage: "たくさん" }), null);
  assert.equal(summarizeEstimate({ usage: -5, quota: 100 }).usage, 0);
});

test("utf8Size / roughByteSize: バイト数の見立て", () => {
  assert.equal(utf8Size(""), 0);
  assert.equal(utf8Size("abc"), 3);
  assert.equal(utf8Size("あ"), 3);
  assert.equal(utf8Size("🌻"), 4);                 /* 代理対で 4 バイト */
  assert.equal(utf8Size("é"), 2);
  assert.equal(roughByteSize("abc"), 3);
  assert.equal(roughByteSize(new ArrayBuffer(16)), 16);
  assert.equal(roughByteSize(new Float32Array(4)), 16);
  assert.equal(roughByteSize({ a: 1 }), utf8Size('{"a":1}'));
  assert.equal(roughByteSize(null), 0);
  assert.equal(roughByteSize(undefined), 0);
});

test("isQuotaError: 溢れの見分け（名前 / code / 文面）", () => {
  assert.equal(isQuotaError({ name: "QuotaExceededError" }), true);
  assert.equal(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true);
  assert.equal(isQuotaError({ code: 22 }), true);
  assert.equal(isQuotaError(new Error("The quota has been exceeded.")), true);
  assert.equal(isQuotaError({ name: "AbortError" }), false);
  assert.equal(isQuotaError(new Error("network")), false);
  assert.equal(isQuotaError(null), false);
});

/* ── ⑥ プロジェクト JSON を小さく保つ ───────────────────────── */

function projectWithAnalysis() {
  return {
    id: "prj_1", name: "試し", schema: 3, createdAt: 1, updatedAt: 2,
    settings: { width: 1920, height: 1080, fps: 30, ratio: "16:9" },
    assets: [
      { id: "as_1", name: "a.mp4", storage: { kind: "idb", key: "blob_1" },
        analysis: { version: 1, motion: { hz: 2, values: [0.1, 0.2, 0.3] } } },
      { id: "as_2", name: "b.mp3", storage: { kind: "idb", key: "blob_2" }, analysis: null },
      { id: "", name: "壊れた素材", analysis: { version: 1 } }
    ],
    tracks: [{ id: "tr1", clips: [{ id: "c1", start: 0, duration: 2 }, { id: "c2", start: 2, duration: 1.5 }] }]
  };
}

test("splitProject: 解析結果を外に出し、元のオブジェクトは書き換えない", () => {
  const p = projectWithAnalysis();
  const before = JSON.stringify(p);
  const { slim, sidecars } = splitProject(p);

  assert.equal(JSON.stringify(p), before, "元のプロジェクトを触ってはいけない");
  assert.equal(slim.assets[0].analysis, null, "重い解析結果は JSON から抜く");
  assert.equal(slim.assets[0].name, "a.mp4", "他の項目はそのまま");
  assert.equal(slim.id, "prj_1");
  assert.deepEqual(sidecars.map((s) => s.key), [ANALYSIS_PREFIX + "as_1"]);
  assert.deepEqual(sidecars[0].data.motion.values, [0.1, 0.2, 0.3]);
  /* id の無い素材は sidecar にできないので触らない（消してしまわない） */
  assert.ok(slim.assets[2].analysis);
  /* 目的（JSON が小さくなる）が達せられているか */
  assert.ok(JSON.stringify(slim).length < JSON.stringify(p).length);
});

test("mergeProject: 解析結果を戻せる（sidecar が無い物は null のまま）", () => {
  const p = projectWithAnalysis();
  const { slim, sidecars } = splitProject(p);
  const map = new Map(sidecars.map((s) => [s.key, s.data]));

  const back = mergeProject(slim, map);
  assert.deepEqual(back.assets[0].analysis, p.assets[0].analysis);
  assert.equal(back.assets[1].analysis, null);
  assert.equal(back.tracks[0].clips.length, 2);
  assert.equal(slim.assets[0].analysis, null, "slim を書き換えない");

  /* sidecar が消えていても（iOS が消した等）落ちない */
  const lost = mergeProject(slim, new Map());
  assert.equal(lost.assets[0].analysis, null);
  /* 素の object でも受ける */
  const obj = {};
  obj[ANALYSIS_PREFIX + "as_1"] = { version: 1 };
  assert.deepEqual(mergeProject(slim, obj).assets[0].analysis, { version: 1 });
  assert.equal(mergeProject(null, {}), null);
});

test("splitProject: 解析結果が無いプロジェクトは素通し", () => {
  const p = { id: "p", assets: [{ id: "a", analysis: null }], tracks: [] };
  const { slim, sidecars } = splitProject(p);
  assert.deepEqual(sidecars, []);
  assert.equal(slim.assets[0], p.assets[0]);
  assert.deepEqual(splitProject(null), { slim: null, sidecars: [] });
  assert.deepEqual(splitProject({ id: "x" }).slim, { id: "x" });
});

test("projectSummary: 一覧に出す要約（尺は末尾のクリップ・ms で丸める）", () => {
  const s = projectSummary(projectWithAnalysis());
  assert.equal(s.id, "prj_1");
  assert.equal(s.name, "試し");
  assert.equal(s.duration, 3.5);
  assert.equal(s.clipCount, 2);
  assert.equal(s.trackCount, 1);
  assert.equal(s.assetCount, 3);
  assert.equal(s.width, 1920);
  assert.equal(s.fps, 30);
  assert.equal(s.ratio, "16:9");

  /* 浮動小数の屑を出さない（0.1+0.2 の類） */
  const odd = projectSummary({ tracks: [{ clips: [{ start: 0.1, duration: 0.2 }] }] });
  assert.equal(odd.duration, 0.3);
  /* 数でない物が混ざっても 0 に落ちる */
  const junk = projectSummary({ tracks: [{ clips: [{ start: "x", duration: null }] }, null] });
  assert.equal(junk.duration, 0);
  assert.equal(projectSummary(null).duration, 0);
});

/* ── ⑦ 揮発ストレージ（IndexedDB が無い環境での往復） ─────────── */

test("openStorage: IndexedDB が無くても開き、揮発と申告して往復する", async () => {
  const st = await openStorage({ memory: true, dbName: "vqstudio-test" });
  try {
    assert.equal(st.volatile, true, "消えることを黙っていてはいけない");
    assert.equal(st.backend, "memory");
    assert.equal(st.opfs, false);

    /* プロジェクトの往復（解析結果も戻ること） */
    const p = projectWithAnalysis();
    const put = await st.putProject(p);
    assert.equal(put.ok, true);
    assert.ok(put.bytes > 0);

    const got = await st.loadProject("prj_1");
    assert.equal(got.id, "prj_1");
    assert.deepEqual(got.assets[0].analysis, p.assets[0].analysis);
    assert.equal(await st.loadProject("prj_none"), null);

    /* 一覧は新しい順 */
    await st.putProject({ id: "prj_2", name: "後の物", updatedAt: 999, tracks: [], assets: [] });
    const list = await st.listProjects();
    assert.deepEqual(list.map((x) => x.id), ["prj_2", "prj_1"]);
    assert.equal(list[1].duration, 3.5, "要約が一覧に乗っていること");

    /* peaks は Float32Array のまま戻る（型が落ちると波形が壊れる） */
    const peaks = new Float32Array([0.5, -0.25, 1, 0]);
    const okp = await st.putPeaks("as_1", peaks);
    assert.equal(okp.ok, true);
    const back = await st.getPeaks("as_1");
    assert.ok(back instanceof Float32Array, "Float32Array で戻らない");
    assert.deepEqual(Array.from(back), [0.5, -0.25, 1, 0]);
    assert.equal(await st.getPeaks("as_none"), null);
    assert.equal((await st.putPeaks("", peaks)).ok, false);
    assert.equal((await st.putPeaks("as_x", null)).ok, false);

    /* 消したら消える（解析結果も道連れ） */
    assert.equal((await st.deleteProject("prj_1")).ok, true);
    assert.equal(await st.loadProject("prj_1"), null);

    /* 容量が分からない環境では null / false（推測で数を作らない） */
    assert.equal(await st.estimate(), null);
    assert.equal(await st.requestPersist(), false);
  } finally {
    st.dispose();
  }
});

test("openStorage: 素材は再エンコードせず保存し、同じ物は二度保存しない", async () => {
  if (typeof Blob === "undefined") return;         /* 古い Node では飛ばす */
  const st = await openStorage({ memory: true });
  try {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const file = new Blob([bytes], { type: "video/mp4" });
    file.name = "movie.mp4";                       /* File の代わり（Node には File が無いことがある） */
    file.lastModified = 1700000000000;

    const a = await st.putAsset(file, { kind: "video" });
    assert.equal(a.ok, true);
    assert.ok(a.key.indexOf("blob_") === 0);
    assert.equal(a.size, 8);
    assert.equal(a.dedup, false);
    assert.equal(a.storage.kind, "idb");

    const again = await st.putAsset(file, { kind: "video" });
    assert.equal(again.key, a.key, "同じ指紋なら同じ key");
    assert.equal(again.dedup, true, "二度書きしない");

    const blob = await st.getAssetBlob(a.key);
    assert.equal(blob.size, 8);
    assert.deepEqual(Array.from(new Uint8Array(await blob.arrayBuffer())), Array.from(bytes));
    assert.equal(await st.getAssetBlob("blob_none"), null);

    /* Blob でない物は黙って失敗しない */
    const bad = await st.putAsset(null, {});
    assert.equal(bad.ok, false);
    assert.ok(bad.reason);

    /* 書き出し用の一括取り出し */
    await st.putProject({
      id: "prj_e", name: "書き出し", updatedAt: 5, tracks: [],
      assets: [
        { id: "as_1", name: "movie.mp4", mime: "video/mp4", storage: { kind: "idb", key: a.key } },
        { id: "as_2", name: "無い物", storage: { kind: "idb", key: "blob_none" } },
        { id: "as_3", name: "key 無し" }
      ]
    });
    const all = await st.getAllForExport("prj_e");
    assert.equal(all.ok, true);
    assert.deepEqual(all.assets.map((x) => x.id), ["as_1"]);
    assert.equal(all.totalBytes, 8);
    assert.deepEqual(all.missing.map((x) => x.id), ["as_2", "as_3"]);
    const none = await st.getAllForExport("prj_none");
    assert.equal(none.ok, false);
    assert.ok(none.reason);
  } finally {
    st.dispose();
  }
});

test("openStorage: objectURL は参照数で貸し、0 でも即 revoke しない", async () => {
  if (typeof Blob === "undefined" || typeof URL.createObjectURL !== "function") return;
  let resolveObjectURL = null;
  try { resolveObjectURL = (await import("node:buffer")).resolveObjectURL; } catch (_e) { /* 無ければ URL の一致だけ見る */ }

  const st = await openStorage({ memory: true });
  const file = new Blob([new Uint8Array([9, 9, 9])], { type: "video/mp4" });
  file.name = "clip.mp4";
  file.lastModified = 1;
  const { key } = await st.putAsset(file, {});
  try {
    const u1 = await st.getAssetURL(key);
    assert.ok(u1, "objectURL を作れていない");
    const u2 = await st.getAssetURL(key);
    assert.equal(u2, u1, "同じ素材には同じ URL を貸す（二重に作らない）");

    st.releaseAssetURL(key);                       /* 参照は 1 残り */
    if (resolveObjectURL) assert.ok(resolveObjectURL(u1), "まだ使われているのに revoke した");
    st.releaseAssetURL(key);                       /* 0 になった */
    if (resolveObjectURL) {
      assert.ok(resolveObjectURL(u1), "0 になった瞬間に revoke してはいけない（再生中に映像が消える）");
    }
    /* 猶予の間に戻ってきたら同じ URL を使い回す */
    assert.equal(await st.getAssetURL(key), u1);

    assert.equal(await st.getAssetURL(""), "");
    assert.equal(await st.getAssetURL("blob_none"), "");
    st.releaseAssetURL("blob_none");               /* 借りていない物を返しても落ちない */

    st.dispose();
    if (resolveObjectURL) assert.equal(resolveObjectURL(u1), undefined, "dispose で全部返すこと");
    assert.equal(await st.getAssetURL(key), "");
  } finally {
    st.dispose();
  }
});

test("openStorage: putProject は黙って失敗せず throw する", async () => {
  const st = await openStorage({ memory: true });
  try {
    await assert.rejects(() => st.putProject(null), StorageError);
    await assert.rejects(() => st.putProject({ name: "id が無い" }), (e) => e instanceof StorageError && !!e.reason);
    /* 循環参照は JSON にできない → 明確に throw（黙って壊れた JSON を残さない） */
    const cyc = { id: "prj_c", assets: [], tracks: [] };
    cyc.self = cyc;
    await assert.rejects(() => st.putProject(cyc), StorageError);
  } finally {
    st.dispose();
  }
});

test("openStorage: dispose の後は書けない・読んでも落ちない", async () => {
  const st = await openStorage({ memory: true });
  st.dispose();
  assert.equal(st.alive, false);
  assert.equal((await st.putAsset({ size: 1 }, {})).ok, false);
  assert.equal(await st.loadProject("prj_1"), null);
  assert.deepEqual(await st.listProjects(), []);
  await assert.rejects(() => st.putProject({ id: "x" }), StorageError);
  st.dispose();                                    /* 二度呼んでも平気 */
});
