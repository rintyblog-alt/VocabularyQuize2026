/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/project-file.test.mjs — .vqstudio の読み書き（契約書 §8 / §11-6）

   ★ 何をする所か
     export/project-file.js の
       ①buildContainer / parseContainer の往復（素材 3 個・0 個・大きい 1 個）
       ②先頭の印・u32 の長さ・壊れたファイルの言い分
       ③未知の未来版（容器 / schema）が理由を言って throw する事
       ④packProject / unpackProject の往復（素材を含める・含めない）
       ⑤exportEDLJson / importEDLJson
     を Node だけで確かめる。

   ★ なぜこの形か
     ・プロジェクトファイルが壊れると «その人の作った物» が消える。
       ここは «壊れていない事» ではなく «壊れていたら言う事» を試験する。
     ・読み器を別に書く必要は無い（形が印 + u32 + JSON + 連結だけなので、
       試験側でも同じ素朴さで直に読める）。バイトの位置は手で数えて書く。

   ★ 触るときの注意
     ・`cd /home/user/VocabularyQuize2026 && node --test studio/tests/project-file.test.mjs`
     ・Node 18+ には Blob が在るので packProject は Blob を返す。
   ══════════════════════════════════════════════════════════════════════════ */

import test from "node:test";
import assert from "node:assert/strict";

import packDefault, {
  buildContainer, parseContainer, parseContainerHeader, containerHeaderBytes,
  packProject, unpackProject, importProject, exportProject,
  projectForPack, relinkAssets, isMissingStorage,
  exportEDLJson, importEDLJson,
  utf8Bytes, utf8String,
  MAGIC, CONTAINER_VERSION, PAYLOAD_BASE, HEADER_LENGTH_OFFSET,
  MISSING_KIND, PACK_KIND, FILE_MIME,
} from "../src/export/project-file.js";
import { newProject, newAsset, newTrack, newClip, SCHEMA_VERSION } from "../src/core/schema.js";

/* ── 小道具 ────────────────────────────────────────────────────── */

const asciiOf = (u8, from, len) => String.fromCharCode(...Array.from(u8.subarray(from, from + len)));
const u32at = (b, at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const bytesOf = (...vals) => new Uint8Array(vals);

/** 試験用のプロジェクト（素材 n 個・クリップつき） */
function demoProject(n) {
  const assets = [];
  for (let i = 0; i < n; i++) {
    assets.push(newAsset({
      id: `as_${i}`, kind: "video", name: `素材${i}.mp4`, mime: "video/mp4",
      size: 100 + i, duration: 5, width: 640, height: 360, fps: 30,
      storage: { kind: "idb", key: `blob_${i}` },
    }));
  }
  const clips = assets.map((a, i) => newClip("video", {
    id: `cl_${i}`, assetId: a.id, start: i * 2, duration: 2, in: 0, out: 2,
  }));
  return newProject({
    id: "prj_test", name: "試験用のプロジェクト",
    assets,
    tracks: [newTrack("video", { id: "tr_v1", clips })],
    markers: [{ id: "mk_1", t: 1.5, name: "ここ" }],
  });
}

/** id → 素材の中身（Uint8Array） */
function demoBlobs(n) {
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const b = new Uint8Array(32 + i * 8);
    for (let k = 0; k < b.length; k++) b[k] = (i * 31 + k) & 0xff;
    map.set(`as_${i}`, b);
  }
  return map;
}

async function blobBytes(blob) {
  if (blob instanceof Uint8Array) return blob;
  return new Uint8Array(await blob.arrayBuffer());
}

/* ══ 1. 容器の組み立てと解釈 ══════════════════════════════════════ */

test("buildContainer: 印 + u32 の長さ + JSON + 素材の連結", () => {
  const parts = [bytesOf(1, 2, 3), bytesOf(9)];
  const bytes = buildContainer({ kind: "vqstudio", hello: "こんにちは" }, parts);
  assert.equal(asciiOf(bytes, 0, MAGIC.length), MAGIC, "先頭 9 バイトは VQSTUDIO1");
  const headerLen = u32at(bytes, HEADER_LENGTH_OFFSET);
  assert.equal(bytes.length, PAYLOAD_BASE + headerLen + 4, "全体の長さ = 13 + ヘッダ + 素材 4 バイト");
  const header = JSON.parse(utf8String(bytes.subarray(PAYLOAD_BASE, PAYLOAD_BASE + headerLen)));
  assert.equal(header.version, CONTAINER_VERSION, "version が入る");
  assert.equal(header.hello, "こんにちは", "渡した枝はそのまま");
  assert.deepEqual(header.parts, [{ offset: 0, length: 3 }, { offset: 3, length: 1 }], "位置は中身の先頭からの相対");
  assert.equal(header.payloadLength, 4);
  assert.deepEqual(Array.from(bytes.subarray(PAYLOAD_BASE + headerLen)), [1, 2, 3, 9], "素材はただの連結");
});

test("parseContainer: 素材 3 個の往復", () => {
  const parts = [bytesOf(1, 2, 3), bytesOf(), bytesOf(7, 7, 7, 7, 7)];
  const back = parseContainer(buildContainer({ note: "3 個" }, parts));
  assert.equal(back.header.note, "3 個");
  assert.equal(back.parts.length, 3, "3 個返る");
  assert.deepEqual(Array.from(back.parts[0]), [1, 2, 3]);
  assert.deepEqual(Array.from(back.parts[1]), [], "空の素材も «空» で戻る");
  assert.deepEqual(Array.from(back.parts[2]), [7, 7, 7, 7, 7]);
});

test("parseContainer: 素材 0 個の往復（プロジェクトだけの .vqstudio）", () => {
  const bytes = buildContainer({ project: { schema: SCHEMA_VERSION } }, []);
  const back = parseContainer(bytes);
  assert.deepEqual(back.parts, [], "素材は無し");
  assert.deepEqual(back.header.parts, [], "台帳も空");
  assert.equal(back.header.payloadLength, 0);
  assert.equal(bytes.length, PAYLOAD_BASE + u32at(bytes, HEADER_LENGTH_OFFSET), "中身は 0 バイト");
});

test("parseContainer: 大きい素材 1 個の往復（1.5MB・u32 の上位バイトを使う）", () => {
  const big = new Uint8Array(1500000);
  for (let i = 0; i < big.length; i += 7) big[i] = i & 0xff;
  big[big.length - 1] = 0xab;
  const back = parseContainer(buildContainer({ note: "大きい" }, [big]));
  assert.equal(back.parts.length, 1);
  assert.equal(back.parts[0].length, big.length, "長さが保たれる");
  assert.equal(back.parts[0][0], 0, "先頭");
  assert.equal(back.parts[0][7], 7, "途中");
  assert.equal(back.parts[0][big.length - 1], 0xab, "末尾");
  assert.deepEqual(back.header.parts, [{ offset: 0, length: big.length }]);
});

test("parseContainer: ArrayBuffer でも 数の配列でも読める", () => {
  const bytes = buildContainer({ a: 1 }, [bytesOf(5, 6)]);
  const viaBuffer = parseContainer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.deepEqual(Array.from(viaBuffer.parts[0]), [5, 6], "ArrayBuffer");
  const viaArray = parseContainer(Array.from(bytes));
  assert.deepEqual(Array.from(viaArray.parts[0]), [5, 6], "数の配列");
});

test("parseContainerHeader: 壊れたファイルは «何が変か» を言って throw", () => {
  assert.throws(() => parseContainerHeader(bytesOf(1, 2, 3)), /短すぎます/, "短すぎる");
  const notOurs = new Uint8Array(40);
  notOurs.set(bytesOf(0x50, 0x4b, 0x03, 0x04), 0);   // ZIP（PK\x03\x04）を掴まされた時
  assert.throws(() => parseContainerHeader(notOurs), /\.vqstudio ではありません/, "印が違う");

  const good = buildContainer({ note: "ok" }, [bytesOf(1)]);
  const zeroLen = good.slice();
  zeroLen.set(bytesOf(0, 0, 0, 0), HEADER_LENGTH_OFFSET);
  assert.throws(() => parseContainerHeader(zeroLen), /ヘッダの長さが 0/);

  const huge = good.slice();
  huge.set(bytesOf(0xff, 0xff, 0xff, 0x7f), HEADER_LENGTH_OFFSET);
  assert.throws(() => parseContainerHeader(huge), /上限/, "u32 が壊れていても 4GB 読みに行かない");

  const cutHeader = good.subarray(0, PAYLOAD_BASE + 3);
  assert.throws(() => parseContainerHeader(cutHeader), /途中で切れています/, "ヘッダが足りない");

  const badJson = buildContainer({ note: "ok" }, []);
  const broken = badJson.slice();
  broken[PAYLOAD_BASE] = 0x7b;   // "{" を 2 つにして JSON を壊す
  broken[PAYLOAD_BASE + 1] = 0x7b;
  assert.throws(() => parseContainerHeader(broken), /JSON/, "JSON が壊れている");
});

test("parseContainer: 素材が途中で切れていたら言う", () => {
  const full = buildContainer({ note: "cut" }, [bytesOf(1, 2, 3, 4, 5, 6)]);
  assert.throws(() => parseContainer(full.subarray(0, full.length - 2)), /途中で切れています/);
});

test("parseContainerHeader: 未知の未来版は理由を言って throw（許せば読める）", () => {
  const future = buildContainer({ version: CONTAINER_VERSION + 1, note: "未来" }, []);
  assert.throws(() => parseContainerHeader(future), (e) => {
    assert.match(e.message, /新しい版/, "何が起きたか");
    assert.match(e.message, new RegExp(`v${CONTAINER_VERSION + 1}`), "向こうの版");
    assert.match(e.message, /更新/, "どうすれば良いか");
    return true;
  });
  assert.throws(() => parseContainer(future), /新しい版/, "parseContainer も同じ");
  const ok = parseContainerHeader(future, { allowFutureVersion: true });
  assert.equal(ok.header.note, "未来", "覚悟の上なら読める（読み器の実験用）");
  const zero = buildContainer({ version: 0 }, []);
  assert.throws(() => parseContainerHeader(zero), /version が不正/, "0 以下も弾く");
});

test("containerHeaderBytes: ヘッダだけでも組める（packProject が Blob を繋ぐため）", () => {
  const head = containerHeaderBytes({ kind: "vqstudio" }, [10, 20]);
  const len = u32at(head, HEADER_LENGTH_OFFSET);
  assert.equal(head.length, PAYLOAD_BASE + len, "ヘッダだけの長さ");
  const header = JSON.parse(utf8String(head.subarray(PAYLOAD_BASE)));
  assert.deepEqual(header.parts, [{ offset: 0, length: 10 }, { offset: 10, length: 20 }]);
  assert.equal(header.payloadLength, 30);
});

test("utf8Bytes / utf8String: 日本語と絵文字の往復", () => {
  for (const s of ["", "abc", "無題のプロジェクト", "🎬 書き出し", String.fromCharCode(97, 0, 98)]) {
    assert.equal(utf8String(utf8Bytes(s)), s, `「${s}」の往復`);
  }
});

/* ══ 2. packProject / unpackProject ═══════════════════════════════ */

test("packProject: 素材 3 個を詰めて unpackProject で戻す", async () => {
  const project = demoProject(3);
  const blob = await packProject(project, { assets: demoBlobs(3) });
  assert.equal(blob.type, FILE_MIME, "MIME");
  const bytes = await blobBytes(blob);
  assert.equal(asciiOf(bytes, 0, MAGIC.length), MAGIC, "印");

  const got = await unpackProject(blob);
  assert.equal(got.project.name, "試験用のプロジェクト");
  assert.equal(got.project.schema, SCHEMA_VERSION);
  assert.equal(got.project.assets.length, 3);
  assert.equal(got.project.tracks[0].clips.length, 3, "クリップも戻る");
  assert.equal(got.project.tracks[0].clips[1].assetId, "as_1", "素材との結び付きも戻る");
  assert.equal(got.project.markers.length, 1, "マーカーも戻る");
  assert.equal(got.missing.length, 0, "欠けた素材は無い");
  assert.equal(got.assets.length, 3);

  for (let i = 0; i < 3; i++) {
    const rec = got.assetMap.get(`as_${i}`);
    assert.ok(rec, `as_${i} が在る`);
    assert.equal(rec.mime, "video/mp4", "MIME が戻る");
    assert.equal(rec.name, `素材${i}.mp4`, "名前が戻る");
    const raw = await blobBytes(rec.blob);
    assert.deepEqual(Array.from(raw), Array.from(demoBlobs(3).get(`as_${i}`)), `as_${i} の中身が 1 バイトも違わない`);
  }
});

test("packProject: includeAssets:false は storage を missing にする", async () => {
  const project = demoProject(2);
  const blob = await packProject(project, { assets: demoBlobs(2), includeAssets: false });
  const got = await unpackProject(blob);
  assert.equal(got.missing.length, 2, "2 個とも欠けている");
  for (const a of got.project.assets) {
    assert.equal(a.storage.kind, MISSING_KIND, "storage.kind は missing");
    assert.ok(a.storage.name, "名前が残っている（どの素材を探せば良いか分かる）");
    assert.ok(a.storage.size >= 0, "大きさも残す");
    assert.ok(isMissingStorage(a), "isMissingStorage が true");
  }
  assert.ok(got.warnings.some((w) => /再指定/.test(w)), "「素材を再指定してください」と言う");
  // 素材を入れていないので小さい（ヘッダだけ）
  const bytes = await blobBytes(blob);
  assert.equal(bytes.length, PAYLOAD_BASE + u32at(bytes, HEADER_LENGTH_OFFSET), "中身は 0 バイト");
});

test("packProject: 素材 0 個・素材が見つからない時も落ちない", async () => {
  const empty = await unpackProject(await packProject(demoProject(0), {}));
  assert.equal(empty.project.assets.length, 0);
  assert.equal(empty.warnings.length, 0, "言う事が無ければ黙る");

  // 実体を渡さない（storage も無い）→ 入れられなかったと言う
  const lost = await unpackProject(await packProject(demoProject(2), { assets: new Map() }));
  assert.equal(lost.missing.length, 2);
  assert.ok(lost.warnings.some((w) => /見つからない/.test(w)), "取り出せなかったと言う");
  assert.equal(lost.project.assets[0].storage.kind, MISSING_KIND);
});

test("packProject: 大きい素材 1 個でも往復する（2MB）", async () => {
  const project = demoProject(1);
  const big = new Uint8Array(2 * 1024 * 1024);
  for (let i = 0; i < big.length; i += 1024) big[i] = (i / 1024) & 0xff;
  big[big.length - 1] = 0x5a;
  const blob = await packProject(project, { assets: { as_0: big } });
  const got = await unpackProject(blob);
  const raw = await blobBytes(got.assetMap.get("as_0").blob);
  assert.equal(raw.length, big.length, "長さ");
  assert.equal(raw[1024], 1, "途中");
  assert.equal(raw[raw.length - 1], 0x5a, "末尾");
  assert.equal(got.assetMap.get("as_0").size, big.length, "台帳の size も合う");
});

test("packProject: 素材の渡し方は Map / object / 配列 / 関数 の どれでも良い", async () => {
  const project = demoProject(1);
  const body = bytesOf(4, 5, 6, 7);
  const forms = [
    new Map([["as_0", body]]),
    { as_0: body },
    [{ id: "as_0", blob: body }],
    (a) => (a.id === "as_0" ? body : null),
  ];
  for (const assets of forms) {
    const got = await unpackProject(await packProject(project, { assets }));
    const raw = await blobBytes(got.assetMap.get("as_0").blob);
    assert.deepEqual(Array.from(raw), [4, 5, 6, 7], "中身が同じ");
  }
  // storage から引く道（persist.getAssetBlob 相当）
  const storage = { getAssetBlob: async (key) => (key === "blob_0" ? body : null) };
  const viaStorage = await unpackProject(await packProject(project, { storage }));
  assert.deepEqual(Array.from(await blobBytes(viaStorage.assetMap.get("as_0").blob)), [4, 5, 6, 7], "storage 経由");
});

test("unpackProject: Uint8Array を渡しても読める（Blob が無い環境向け）", async () => {
  const bytes = await blobBytes(await packProject(demoProject(1), { assets: demoBlobs(1) }));
  const got = await unpackProject(bytes);
  assert.equal(got.project.assets.length, 1);
  assert.deepEqual(
    Array.from(await blobBytes(got.assetMap.get("as_0").blob)),
    Array.from(demoBlobs(1).get("as_0")), "中身");
});

test("unpackProject: putAsset を渡すと storage を本物に差し替える", async () => {
  const blob = await packProject(demoProject(2), { assets: demoBlobs(2) });
  const saved = [];
  const got = await unpackProject(blob, {
    putAsset: async (rec) => { saved.push(rec.id); return { kind: "idb", key: `new_${rec.id}` }; },
  });
  assert.deepEqual(saved, ["as_0", "as_1"], "全部 putAsset に渡る");
  assert.deepEqual(got.project.assets.map((a) => a.storage), [
    { kind: "idb", key: "new_as_0" }, { kind: "idb", key: "new_as_1" },
  ], "storage が差し替わる");
  for (const a of got.project.assets) assert.ok(!isMissingStorage(a), "もう欠けていない");

  // putAsset が投げても «読めなかった» で終わらせない
  const failed = await unpackProject(blob, { putAsset: async () => { throw new Error("容量が足りません"); } });
  assert.equal(failed.project.assets[0].storage.kind, PACK_KIND, "保存できなかった印");
  assert.ok(failed.warnings.some((w) => /容量が足りません/.test(w)), "理由をそのまま出す");
});

test("unpackProject: 進捗と中止", async () => {
  const blob = await packProject(demoProject(3), { assets: demoBlobs(3) });
  const seen = [];
  await unpackProject(blob, { onProgress: (p, info) => seen.push([p, info.stage]) });
  assert.ok(seen.length >= 3, "何度か呼ばれる");
  assert.equal(seen[0][0], 0, "0 から");
  assert.equal(seen[seen.length - 1][0], 1, "1 で終わる");
  assert.ok(seen.some((s) => s[1] === "assets"), "素材の段が在る");

  const packed = [];
  await packProject(demoProject(2), { assets: demoBlobs(2), onProgress: (p, i) => packed.push(i.stage) });
  assert.ok(packed.includes("assets") && packed.includes("done"), "書き出しの進捗も出る");

  await assert.rejects(
    () => unpackProject(blob, { signal: { aborted: true } }),
    (e) => e.name === "AbortError", "中止は AbortError");
});

test("unpackProject: 未知の未来版は容器も schema も理由を言って throw", async () => {
  // 容器の版
  const future = buildContainer({ version: 99, project: { schema: SCHEMA_VERSION } }, []);
  await assert.rejects(() => unpackProject(future), /新しい版（v99）/);
  // プロジェクトの保存形式
  const futureSchema = buildContainer({
    version: CONTAINER_VERSION, project: { schema: SCHEMA_VERSION + 5, name: "未来" }, assets: [],
  }, []);
  await assert.rejects(() => unpackProject(futureSchema), (e) => {
    assert.match(e.message, /新しい保存形式/);
    assert.match(e.message, new RegExp(`schema ${SCHEMA_VERSION + 5}`));
    assert.match(e.message, /更新/);
    return true;
  });
  // project が無い
  await assert.rejects(() => unpackProject(buildContainer({ version: 1 }, [])), /プロジェクトが入っていません/);
  await assert.rejects(() => unpackProject(null), /渡されていません/);
});

test("unpackProject: 古い保存形式は migrate を通って開く", async () => {
  // schema 1 の名残（offset/len・transition）を入れた物
  const old = buildContainer({
    version: CONTAINER_VERSION,
    project: {
      schema: 1, id: "prj_old", name: "古いの",
      settings: { width: 1280, height: 720, fps: 30 },
      assets: [{ id: "as_0", kind: "video", name: "a.mp4", duration: 4, storage: { kind: "idb", key: "k0" } }],
      tracks: [{ id: "tr_0", kind: "video", clips: [{ id: "cl_0", assetId: "as_0", offset: 1, len: 2, in: 0, out: 2 }] }],
    },
    assets: [],
  }, []);
  const got = await unpackProject(old);
  assert.equal(got.project.schema, SCHEMA_VERSION, "今の版に上がる");
  assert.equal(got.project.tracks[0].clips[0].start, 1, "offset → start");
  assert.equal(got.project.tracks[0].clips[0].duration, 2, "len → duration");
});

test("projectForPack / relinkAssets: storage の書き換えは純関数", () => {
  const project = demoProject(2);
  const packedMap = new Map([["as_0", 0]]);
  const out = projectForPack(project, packedMap);
  assert.deepEqual(out.assets[0].storage, { kind: PACK_KIND, index: 0 }, "入れた物");
  assert.equal(out.assets[1].storage.kind, MISSING_KIND, "入れなかった物");
  assert.equal(out.assets[1].storage.name, "素材1.mp4");
  assert.deepEqual(project.assets[0].storage, { kind: "idb", key: "blob_0" }, "元は書き換えない");

  const relinked = relinkAssets(out, { as_0: { kind: "idb", key: "K0" }, as_1: "K1" });
  assert.deepEqual(relinked.assets[0].storage, { kind: "idb", key: "K0" });
  assert.deepEqual(relinked.assets[1].storage, { kind: "idb", key: "K1" }, "文字列は key として扱う");
  assert.equal(out.assets[0].storage.kind, PACK_KIND, "こちらも元は書き換えない");
  assert.ok(isMissingStorage({ storage: { kind: "idb", key: null } }), "key が無い物も «欠け»");
  assert.ok(!isMissingStorage({ storage: { kind: "idb", key: "x" } }));
});

test("importProject / exportProject: 契約書 §5 の名前（project だけ返る）", async () => {
  assert.equal(exportProject, packProject, "exportProject は packProject");
  assert.equal(packDefault, packProject, "default も packProject");
  const blob = await packProject(demoProject(1), { assets: demoBlobs(1), includeAssets: false });
  const project = await importProject(blob);
  assert.equal(project.name, "試験用のプロジェクト", "Project そのものが返る");
  assert.ok(Array.isArray(project.meta.import.warnings), "警告は meta.import に載る");
  assert.equal(project.meta.import.missing.length, 1, "欠けた素材も分かる");
});

/* ══ 3. EDL ═══════════════════════════════════════════════════════ */

test("exportEDLJson: 人が読める JSON（素材の実体は入らない）", () => {
  const json = exportEDLJson(demoProject(2));
  assert.ok(json.indexOf("\n  ") > 0, "既定は 2 空白で整える");
  const edl = JSON.parse(json);
  assert.equal(edl.kind, "vq-studio-edl");
  assert.equal(edl.version, 1);
  assert.equal(edl.assets.length, 2);
  assert.equal(edl.tracks[0].clips.length, 2);
  assert.equal(edl.tracks[0].clips[0].asset, "素材0.mp4", "素材の名前で読める");
  assert.equal(JSON.stringify(edl).indexOf("storage"), -1, "実体の在り処は書かない");
  assert.ok(exportEDLJson(demoProject(0), { pretty: false }).indexOf("\n") < 0, "pretty:false は 1 行");
});

test("importEDLJson: 読んで戻す（戻らない物は言う）", () => {
  const src = demoProject(2);
  const { project, warnings, edl } = importEDLJson(exportEDLJson(src));
  assert.equal(edl.kind, "vq-studio-edl");
  assert.equal(project.schema, SCHEMA_VERSION);
  assert.equal(project.name, src.name, "名前");
  assert.equal(project.settings.width, src.settings.width, "寸法");
  assert.equal(project.settings.fps, src.settings.fps, "fps");
  assert.equal(project.assets.length, 2, "素材の台帳は戻る");
  assert.equal(project.assets[0].storage.kind, MISSING_KIND, "実体は無いので missing");
  assert.equal(project.tracks[0].clips.length, 2, "クリップ");
  assert.equal(project.tracks[0].clips[1].start, 2, "位置");
  assert.equal(project.markers.length, 1, "マーカー");
  assert.ok(warnings.some((w) => /効果・キーフレーム/.test(w)), "戻らない物を言う");
  assert.ok(warnings.some((w) => /再指定/.test(w)), "素材を再指定してと言う");
});

test("importEDLJson: 別の物・未来版・壊れた JSON は理由を言って throw", () => {
  assert.throws(() => importEDLJson("{"), /読めません/, "壊れた JSON");
  assert.throws(() => importEDLJson("[]"), /object ではありません/, "配列");
  assert.throws(() => importEDLJson('{"kind":"premiere-edl"}'), /VQ Studio の EDL ではありません/);
  assert.throws(() => importEDLJson('{"kind":"vq-studio-edl","version":9}'), /新しい版（v9）/);
  // object で直に渡しても読める（fetch した物をそのまま）
  const ok = importEDLJson({
    kind: "vq-studio-edl", version: 1,
    settings: { width: 1080, height: 1920, fps: 30, ratio: "9:16" },
  });
  assert.equal(ok.project.settings.width, 1080);
  assert.equal(ok.project.settings.height, 1920);
  assert.equal(ok.project.settings.ratio, "9:16", "比率は EDL に書いてある物を使う");
  assert.equal(ok.project.tracks.length, 0, "tracks が無くても落ちない");
});

test("packProject: 中止は素材 0 個 / includeAssets:false でも効く（契約書 §11-8）", async () => {
  /* 回帰試験。中止の確認が «素材を回す loop の中» にしか無かった頃は、
     素材が 0 個の時と includeAssets:false の時だけ signal が黙殺された。 */
  const ac = new AbortController();
  ac.abort();
  const cases = [
    ["素材 0 個", demoProject(0), {}],
    ["includeAssets:false", demoProject(2), { includeAssets: false }],
    ["素材 2 個", demoProject(2), { assets: demoBlobs(2) }],
  ];
  for (const [label, project, opts] of cases) {
    await assert.rejects(
      () => packProject(project, Object.assign({ signal: ac.signal }, opts)),
      (e) => e.name === "AbortError",
      `${label}: 中止した signal を渡したら AbortError`,
    );
  }
  // 中止していない signal なら普通に通る
  const ok = await packProject(demoProject(0), { signal: new AbortController().signal });
  assert.ok((ok.size ?? ok.length) > 0, "中止していなければ書き出せる");
});

test("packProject: Float32Array の曲線が配列のまま往復する（黙って object にならない）", async () => {
  /* JSON.stringify は TypedArray を {"0":…,"1":…} という object にする。
     解析結果の曲線が そうなると読み戻した側の values.length が undefined に
     なり、«在るのに空» という顔で黙って壊れる。 */
  const project = demoProject(1);
  project.assets[0].analysis = {
    version: 1,
    motion: { hz: 2, values: new Float32Array([0, 0.5, 1]) },
    loudness: { hz: 20, values: [-20, -10] },
    scenes: [], silence: [],
  };
  const packed = await packProject(project, { assets: demoBlobs(1) });
  const { project: back } = await unpackProject(packed);
  const motion = back.assets[0].analysis.motion;
  assert.ok(Array.isArray(motion.values), `values は配列のまま（実際は ${JSON.stringify(motion.values)}）`);
  assert.equal(motion.values.length, 3, "長さが読める");
  assert.equal(motion.values[1], 0.5, "値も合う");
  assert.deepEqual(back.assets[0].analysis.loudness.values, [-20, -10], "普通の配列は素通し");
});

test("packProject: NaN / Infinity / 循環参照でも «保存できない» にならない", async () => {
  const project = demoProject(0);
  project.meta.nan = NaN;
  project.meta.inf = Infinity;
  project.meta.shared = { a: 1 };
  project.meta.also = project.meta.shared;   // 共有（循環ではない）
  project.meta.self = project;               // 循環（素の JSON.stringify は throw する）
  assert.throws(() => JSON.stringify(project), "素の JSON.stringify なら throw する形");

  const packed = await packProject(project, {});
  const { header } = await unpackProject(packed);
  const meta = header.project.meta;
  assert.equal(meta.nan, null, "NaN は null（«無い» と読める形）");
  assert.equal(meta.inf, null, "Infinity も null");
  assert.deepEqual(meta.shared, { a: 1 }, "共有参照は残る");
  assert.deepEqual(meta.also, { a: 1 }, "同じ物を指していた枝も残る");
  assert.equal(meta.self.meta, null, "循環はそこで切れる（保存自体は通る）");
});

test("packProject: id の無い素材は詰めずに理由を言う", async () => {
  /* id が無いと projectForPack が packed に載せられない（id で引くため）ので、
     中身を詰めてもファイルが太るだけで読み込み側から辿れない。 */
  const project = demoProject(1);
  project.assets.push({ name: "id無し.mp4", kind: "video", size: 4, storage: { kind: "idb", key: "x" } });
  const packed = await packProject(project, {
    assets: async (a) => (a.id ? demoBlobs(1).get(a.id) : new Uint8Array(9999)),
  });
  const { header, warnings } = await unpackProject(packed);
  assert.equal(header.parts.length, 1, "詰まったのは id の在る 1 個だけ");
  assert.ok(
    warnings.some((w) => w.includes("id無し.mp4") && w.includes("id が無い")),
    `理由を言う（実際は ${JSON.stringify(warnings)}）`,
  );
  assert.ok((packed.size ?? packed.length) < 9999, "9999 バイトの死んだ中身が入っていない");
});

test("importEDLJson: out が無い手書き EDL でもクリップが 40ms に潰れない", async () => {
  /* 回帰試験。out が無いときに duration をそのまま out として入れていた頃は、
     in の在るクリップで out < in になり、schema の «out > in» を守る所で
     out = in + MIN_CLIP(0.04) へ潰されていた（4 秒のクリップが素材の
     40ms だけを指す形で黙って壊れる）。渡さなければ schema.js が
     out = in + duration * speed を当ててくれる。 */
  const edl = {
    kind: "vq-studio-edl", version: 1,
    project: { id: "prj_x", name: "手書きの EDL" },
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [{ id: "as_0", kind: "video", name: "a.mp4", duration: 30 }],
    tracks: [{ id: "tr_1", kind: "video", clips: [
      { id: "cl_1", kind: "video", assetId: "as_0", start: 0, duration: 4, in: 10 },
      { id: "cl_2", kind: "video", assetId: "as_0", start: 4, duration: 4, in: 2, speed: 2 },
      { id: "cl_3", kind: "video", assetId: "as_0", start: 8, duration: 4, in: 1, out: 5 },
    ] }],
  };
  const { project } = importEDLJson(edl);
  const [c1, c2, c3] = project.tracks[0].clips;
  assert.equal(c1.in, 10, "in はそのまま");
  assert.equal(c1.out, 14, "out が無ければ in + duration * speed");
  assert.equal(c2.out, 10, "速度 2 なら素材側は倍だけ進む（2 + 4*2）");
  assert.equal(c3.out, 5, "out が書いて在ればそちらを使う");
  for (const c of project.tracks[0].clips) {
    assert.ok(c.out - c.in > 0.04 + 1e-9, `${c.id}: 素材の 40ms に潰れていない`);
  }

  // buildEDL が作った EDL（out が必ず入る）は往復しても変わらない
  const round = importEDLJson(exportEDLJson(project)).project;
  assert.deepEqual(
    round.tracks[0].clips.map((c) => [c.in, c.out]),
    project.tracks[0].clips.map((c) => [c.in, c.out]),
    "書き出した EDL は in/out ごと往復する",
  );
});
