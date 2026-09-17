/* ══════════════════════════════════════════════════════════════════════
   tests/export-plan.test.mjs — 書き出しの「純な所」を固める試験（契約書 §8）

   ★ 何をする所か
     export/exporter.js と export/presets.js のうち、DOM も WebCodecs も
     要らない部分（planExport / 字幕 / ファイル名 / WAV の頭 / EDL /
     presets）を node --test で確かめる。

   ★ なぜこの形か
     ・ここが崩れると「書き出す前に画面へ出る数字」が嘘になる。
       解像度の偶数丸め・比率・自動ビットレート・範囲は 目で見て
       気付きにくい所なので、値を直に書いて固定する。
     ・字幕は SRT と VTT で 区切り文字（"," と "."）だけが違う。
       取り違えると 一部の再生機で黙って表示されないので、
       文字列そのものを比べる。
     ・capabilities() は Node では「何も無い」と答えるのが正しい
       （WebCodecs も MediaRecorder も無い）。落ちないことを見る。

   ★ 触るときの注意
     ・node --test studio/tests/export-plan.test.mjs で回る。
     ・DOM を使う書き出し本体（precise / realtime）は Node では試験できない。
       studio/selftest.html の担当（統合）が見る。
   ══════════════════════════════════════════════════════════════════════ */

import test from "node:test";
import assert from "node:assert/strict";

import {
  planExport, autoVideoBitrate, projectDuration, surveyMedia,
  buildFilename, sanitizeName,
  buildSubtitles, exportSubtitles, collectCues,
  buildEDL, exportEDL, encodeWav, capabilities,
  ExportError, CONTAINERS, FPS_MIN, FPS_MAX,
} from "../src/export/exporter.js";

import {
  PRESETS, getPreset, applyPreset, recommendPreset, presetGroups,
} from "../src/export/presets.js";

/* ── 試験用のプロジェクトを組む小道具 ─────────────────────────── */

function clip(o) {
  return Object.assign({
    id: "cl_1", kind: "video", assetId: "as_1",
    start: 0, duration: 4, in: 0, out: 4, speed: 1,
  }, o);
}

function textClip(start, duration, content, extra) {
  return Object.assign(clip({
    id: `cl_t${start}`, kind: "text", assetId: null, start, duration,
    text: { content, style: {}, layout: {}, anim: {} },
  }), extra || {});
}

function proj(over) {
  const o = over || {};
  const base = {
    schema: 3, id: "prj_test", name: "テスト企画",
    settings: {
      width: 1920, height: 1080, fps: 30, ratio: "16:9", sampleRate: 48000,
    },
    assets: [{ id: "as_1", kind: "video", name: "IMG_0001.MOV", duration: 12, hasAudio: true }],
    tracks: [{ id: "tr_1", kind: "video", name: "V1", clips: [clip({})] }],
    markers: [], chapters: [],
  };
  return Object.assign({}, base, o, {
    settings: Object.assign({}, base.settings, o.settings || {}),
  });
}

/** 字幕だけのプロジェクト（overlay トラックに text クリップ） */
function subProj(clips) {
  return proj({ tracks: [{ id: "tr_sub", kind: "overlay", name: "字幕", clips }] });
}

/* ── 1. planExport: 解像度 ────────────────────────────────────── */

test("planExport: 奇数の解像度は偶数へ丸める", () => {
  const p = planExport(proj(), { width: 1281, height: 721 });
  assert.equal(p.width % 2, 0);
  assert.equal(p.height % 2, 0);
  assert.equal(p.width, 1282);
  assert.equal(p.height, 722);
});

test("planExport: 片方だけ指定したら比率を保って もう片方を出す", () => {
  const wide = planExport(proj(), { width: 1280 });
  assert.equal(wide.width, 1280);
  assert.equal(wide.height, 720);

  const tall = planExport(proj({ settings: { width: 1080, height: 1920 } }), { width: 720 });
  assert.equal(tall.width, 720);
  assert.equal(tall.height, 1280);

  // 高さだけ指定（奇数）でも 比率は 16:9 のまま（丸めの誤差 1% 以内）
  const byH = planExport(proj(), { height: 721 });
  assert.equal(byH.height, 722);
  assert.ok(Math.abs(byH.width / byH.height - 16 / 9) < 0.02, `比率がずれた: ${byH.width}x${byH.height}`);
});

test("planExport: 指定が無ければプロジェクトの設定をそのまま使う", () => {
  const p = planExport(proj({ settings: { width: 1080, height: 1350 } }), {});
  assert.equal(p.width, 1080);
  assert.equal(p.height, 1350);
});

test("planExport: 極端な解像度も範囲と偶数に収める", () => {
  const big = planExport(proj(), { width: 99999, height: 99999 });
  assert.ok(big.width <= 7680 && big.height <= 4320);
  assert.equal(big.width % 2, 0);
  assert.equal(big.height % 2, 0);
  assert.ok(big.warnings.some((w) => w.includes("4K")), "4K 超えの注意が無い");

  const tiny = planExport(proj(), { width: 1, height: 1 });
  assert.ok(tiny.width >= 16 && tiny.height >= 16);
});

/* ── 2. planExport: fps ──────────────────────────────────────── */

test("planExport: fps は 10〜60 に収める", () => {
  /* 12fps の軽い書き出しは実用なので、10 は そのまま通す（警告も出さない）。
     10 未満だけを引き上げる。 */
  const keep = planExport(proj(), { fps: 12 });
  assert.equal(keep.fps, 12);
  assert.equal(keep.warnings.length, 0);

  const low = planExport(proj(), { fps: 4 });
  assert.equal(low.fps, FPS_MIN);
  assert.ok(low.warnings.some((w) => w.includes("低すぎる")));

  const high = planExport(proj(), { fps: 120 });
  assert.equal(high.fps, FPS_MAX);
  assert.ok(high.warnings.some((w) => w.includes("高すぎる")));

  const ok = planExport(proj(), { fps: 50 });
  assert.equal(ok.fps, 50);
  assert.equal(ok.warnings.length, 0);
});

test("planExport: 29.97 のような小数 fps は そのまま通す", () => {
  const p = planExport(proj({ settings: { fps: 29.97 } }), {});
  assert.equal(p.fps, 29.97);
});

test("planExport: GIF だけは 24 未満を許す（10/12/15 が常識）", () => {
  const p = planExport(proj(), { container: "gif", fps: 12 });
  assert.equal(p.mode, "gif");
  assert.equal(p.fps, 12);
  assert.equal(p.container, "gif");
});

/* ── 3. planExport: ビットレート ─────────────────────────────── */

test("autoVideoBitrate: 1080p30 が 12Mbps 前後", () => {
  const b = autoVideoBitrate(1920, 1080, 30);
  assert.ok(Math.abs(b - 12000000) < 500000, `1080p30 が ${b}`);
  assert.equal(b % 1000, 0, "1kbps 単位で丸めていない");
});

test("autoVideoBitrate: 解像度と fps で増える（fps は 2 倍まで増えない）", () => {
  const b720 = autoVideoBitrate(1280, 720, 30);
  const b1080 = autoVideoBitrate(1920, 1080, 30);
  const b2160 = autoVideoBitrate(3840, 2160, 30);
  const b1080_60 = autoVideoBitrate(1920, 1080, 60);
  assert.ok(b720 < b1080 && b1080 < b2160);
  assert.ok(b1080_60 > b1080);
  assert.ok(b1080_60 < b1080 * 2, "60fps で 2 倍を超えた");
});

test("autoVideoBitrate: 画質の段で増減する", () => {
  const low = autoVideoBitrate(1920, 1080, 30, "low");
  const normal = autoVideoBitrate(1920, 1080, 30, "normal");
  const max = autoVideoBitrate(1920, 1080, 30, "max");
  assert.ok(low < normal && normal < max);
});

test("planExport: ビットレート指定は kbps でも bps でも受ける", () => {
  const kbps = planExport(proj(), { videoBitrate: 6000 });      // 6000kbps
  const bps = planExport(proj(), { videoBitrate: 6000000 });    // 同じ
  assert.equal(kbps.videoBitrate, 6000000);
  assert.equal(bps.videoBitrate, 6000000);
  const auto = planExport(proj(), {});
  assert.equal(auto.videoBitrate, autoVideoBitrate(1920, 1080, 30));
});

test("planExport: 音声ビットレートは 32k〜512k に収める", () => {
  assert.equal(planExport(proj(), { audioBitrate: 1 }).audioBitrate, 32000);
  assert.equal(planExport(proj(), { audioBitrate: 9999999 }).audioBitrate, 512000);
  assert.equal(planExport(proj(), { audio: "none" }).audioBitrate, 0);
});

/* ── 4. planExport: 範囲とフレーム数 ────────────────────────── */

test("planExport: 範囲はプロジェクトの尺に収める", () => {
  const p = proj({
    tracks: [{ id: "tr_1", kind: "video", clips: [clip({ start: 0, duration: 4 })] }],
  });
  assert.equal(projectDuration(p), 4);

  const all = planExport(p, {});
  assert.deepEqual(all.range, { start: 0, end: 4 });
  assert.equal(all.frames, 120);
  assert.equal(all.duration, 4);

  const over = planExport(p, { range: { start: -5, end: 99 } });
  assert.deepEqual(over.range, { start: 0, end: 4 });

  const part = planExport(p, { range: { start: 1, end: 3 } });
  assert.deepEqual(part.range, { start: 1, end: 3 });
  assert.equal(part.frames, 60);

  const flipped = planExport(p, { range: { start: 3, end: 1 } });
  assert.deepEqual(flipped.range, { start: 1, end: 3 }, "逆さの範囲を入れ替えていない");
});

test("planExport: 空の範囲は明確なエラー", () => {
  const p = proj();
  assert.throws(
    () => planExport(p, { range: { start: 2, end: 2 } }),
    (e) => e instanceof ExportError && e.code === "EMPTY_RANGE" && /範囲が空/.test(e.message),
  );
  // 尺の外だけを指した範囲も 収めた結果が空になるので同じ
  assert.throws(
    () => planExport(p, { range: { start: 10, end: 20 } }),
    (e) => e.code === "EMPTY_RANGE",
  );
});

test("planExport: 中身の無いプロジェクトは EMPTY_PROJECT", () => {
  assert.throws(
    () => planExport(proj({ tracks: [] }), {}),
    (e) => e instanceof ExportError && e.code === "EMPTY_PROJECT",
  );
  assert.throws(() => planExport(null, {}), (e) => e.code === "EMPTY_PROJECT");
});

test("planExport: 1 フレームより短い範囲でも 1 枚は出す", () => {
  const p = planExport(proj(), { range: { start: 0, end: 0.01 } });
  assert.equal(p.frames, 1);
  assert.ok(p.warnings.some((w) => w.includes("1 フレーム")));
});

test("planExport: 推定容量はビットレートと尺から出る", () => {
  const p = planExport(proj(), { range: { start: 0, end: 4 }, videoBitrate: 8000000, audioBitrate: 192000 });
  const expect = (8000000 + 192000) * 4 / 8;
  assert.ok(Math.abs(p.estimatedBytes - expect * 1.02) < expect * 0.05, `推定が変: ${p.estimatedBytes}`);
});

/* ── 5. planExport: 容器とコーデックと mode ─────────────────── */

test("planExport: 既定は mp4 + avc", () => {
  const p = planExport(proj(), {});
  assert.equal(p.container, "mp4");
  assert.equal(p.codec, "avc");
  assert.equal(p.mime, "video/mp4");
  assert.ok(CONTAINERS.includes(p.container));
});

test("planExport: 組み合わせの矛盾は直して warnings に残す", () => {
  const vp9 = planExport(proj(), { codec: "vp9" });
  assert.equal(vp9.container, "webm", "vp9 なら webm へ");

  const bad = planExport(proj(), { container: "mp4", codec: "vp9" });
  assert.equal(bad.container, "webm");
  assert.ok(bad.warnings.some((w) => w.includes("mp4")));

  const bad2 = planExport(proj(), { container: "webm", codec: "avc" });
  assert.equal(bad2.codec, "vp9");
  assert.ok(bad2.warnings.some((w) => w.includes("H.264")));

  assert.throws(
    () => planExport(proj(), { container: "mov" }),
    (e) => e instanceof ExportError && e.code === "BAD_FORMAT",
  );
});

test("planExport: mode は指定を尊重し、auto は precise か realtime", () => {
  assert.equal(planExport(proj(), { mode: "precise" }).mode, "precise");
  assert.equal(planExport(proj(), { mode: "realtime" }).mode, "realtime");
  const auto = planExport(proj(), { mode: "auto" }).mode;
  assert.ok(auto === "precise" || auto === "realtime", `auto が ${auto}`);
});

test("planExport: 音声のみ / 静止画 / GIF は別の mode になる", () => {
  const wav = planExport(proj(), { container: "wav" });
  assert.equal(wav.mode, "audio");
  assert.equal(wav.audio, "only");
  assert.equal(wav.frames, 0);
  assert.equal(wav.width, 0);
  assert.equal(wav.videoBitrate, 0);

  const only = planExport(proj(), { audio: "only" });
  assert.equal(only.mode, "audio");
  assert.equal(only.container, "wav");

  const png = planExport(proj(), { container: "png" });
  assert.equal(png.mode, "still");
  assert.equal(png.frames, 1, "連番でなければ 1 枚");
  assert.equal(png.audio, "none");

  const seq = planExport(proj(), { container: "png", sequence: true });
  assert.ok(seq.frames > 1, "連番なら範囲の枚数");

  const gif = planExport(proj(), { container: "gif" });
  assert.equal(gif.mode, "gif");
  assert.equal(gif.audio, "none");
});

test("planExport: m4a を頼まれても wav で応え、理由を残す", () => {
  const p = planExport(proj(), { container: "m4a" });
  assert.equal(p.container, "wav");
  assert.ok(p.warnings.some((w) => w.includes("wav")));
});

test("planExport: 音の扱いは include / none / only の 3 つに正す", () => {
  assert.equal(planExport(proj(), {}).audio, "include");
  assert.equal(planExport(proj(), { audio: false }).audio, "none");
  assert.equal(planExport(proj(), { audio: "mute" }).audio, "none");
  assert.equal(planExport(proj(), { audio: "なんとか" }).audio, "include");
});

/* ── 6. ファイル名 ───────────────────────────────────────────── */

test("buildFilename: <名前>_<YYYYMMDD-HHmm>_<1080p>.mp4 の形", () => {
  const at = new Date(2026, 8, 17, 9, 5); // 2026-09-17 09:05（現地時刻）
  const name = buildFilename(proj({ name: "夏の思い出" }), {
    container: "mp4", height: 1080, at,
  });
  assert.equal(name, "夏の思い出_20260917-0905_1080p.mp4");
});

test("buildFilename: 禁止文字は消える", () => {
  const at = new Date(2026, 0, 2, 3, 4);
  const name = buildFilename(proj({ name: 'ひどい/名前\\です:*?"<>|' }), {
    container: "mp4", height: 720, at,
  });
  assert.equal(name, "ひどい名前です_20260102-0304_720p.mp4");
  assert.ok(!/[\\/:*?"<>|]/.test(name.slice(0, -4)), "禁止文字が残っている");
});

test("buildFilename: 空白は _、前後の記号は落ちる、空なら既定名", () => {
  const at = new Date(2026, 0, 2, 3, 4);
  assert.equal(
    buildFilename(proj({ name: "  My  Movie  " }), { container: "mp4", height: 1080, at }),
    "My_Movie_20260102-0304_1080p.mp4",
  );
  assert.equal(
    buildFilename(proj({ name: "///" }), { container: "mp4", height: 1080, at }),
    "無題のプロジェクト_20260102-0304_1080p.mp4",
  );
  assert.equal(
    buildFilename(proj({ name: "..dots.." }), { container: "mp4", height: 1080, at }),
    "dots_20260102-0304_1080p.mp4",
  );
});

test("buildFilename: 容器ごとの拡張子と 音だけの label", () => {
  const at = new Date(2026, 0, 2, 3, 4);
  const f = (container, height) => buildFilename(proj({ name: "A" }), { container, height, at });
  assert.ok(f("webm", 1080).endsWith("_1080p.webm"));
  assert.ok(f("jpeg", 1080).endsWith("_1080p.jpg"));
  assert.ok(f("png", 1080).endsWith("_1080p.png"));
  assert.ok(f("gif", 270).endsWith("_270p.gif"));
  assert.equal(f("wav", 0), "A_20260102-0304_audio.wav");
});

test("buildFilename: 改行や制御文字も消える（長い名前は切る）", () => {
  const at = new Date(2026, 0, 2, 3, 4);
  const name = buildFilename(proj({ name: "行1\n行2\tタブ" }), { container: "mp4", height: 1080, at });
  assert.ok(!/[\n\t]/.test(name));
  assert.equal(name, "行1_行2_タブ_20260102-0304_1080p.mp4");
  const long = sanitizeName("あ".repeat(200));
  assert.ok(long.length <= 80);
});

test("planExport の値をそのまま buildFilename に渡せる", () => {
  const plan = planExport(proj({ name: "企画:A" }), { width: 1080, height: 1920 });
  const name = buildFilename(proj({ name: "企画:A" }), {
    container: plan.container, height: plan.height, at: new Date(2026, 0, 2, 3, 4),
  });
  assert.equal(name, "企画A_20260102-0304_1920p.mp4");
});

/* ── 7. 字幕（SRT / VTT） ────────────────────────────────────── */

test("exportSubtitles: SRT は カンマ区切りの時刻と連番", async () => {
  const p = subProj([
    textClip(1.5, 1.5, "こんにちは"),
    textClip(4, 2, "さようなら"),
  ]);
  const text = buildSubtitles(p, { format: "srt" });
  assert.equal(text,
    "1\n00:00:01,500 --> 00:00:03,000\nこんにちは\n\n" +
    "2\n00:00:04,000 --> 00:00:06,000\nさようなら\n");

  const blob = exportSubtitles(p, { format: "srt" });
  assert.ok(blob instanceof Blob);
  assert.match(blob.type, /x-subrip/);
  assert.equal(await blob.text(), text);
});

test("exportSubtitles: VTT は WEBVTT の見出しと ピリオド区切り", async () => {
  const p = subProj([textClip(1.5, 1.5, "こんにちは")]);
  const text = buildSubtitles(p, { format: "vtt" });
  assert.equal(text, "WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000\nこんにちは\n");
  assert.ok(text.includes("00:00:01.500"), "VTT にカンマが混ざっている");
  assert.ok(!text.includes("00:00:01,500"));

  const blob = exportSubtitles(p, { format: "vtt" });
  assert.match(blob.type, /text\/vtt/);
  assert.equal(await blob.text(), text);
});

test("字幕: 1 時間を超える時刻も HH:MM:SS で出る", () => {
  const p = subProj([textClip(3725.25, 1, "長い")]);
  const text = buildSubtitles(p, { format: "srt" });
  assert.ok(text.includes("01:02:05,250 --> 01:02:06,250"), text);
});

test("字幕: 改行は保ち、VTT では < > & を逃がす", () => {
  const p = subProj([textClip(0, 2, "1行目\n2行目 <b>&</b>")]);
  const srt = buildSubtitles(p, { format: "srt" });
  assert.ok(srt.includes("1行目\n2行目 <b>&</b>"), "SRT は素のまま出す");
  const vtt = buildSubtitles(p, { format: "vtt" });
  assert.ok(vtt.includes("1行目\n2行目 &lt;b&gt;&amp;&lt;/b&gt;"), vtt);
});

test("字幕: 重なりは前の終わりを詰める", () => {
  const p = subProj([
    textClip(0, 3, "前"),     // 0..3
    textClip(2, 2, "後"),     // 2..4（1 秒重なる）
  ]);
  const cues = collectCues(p, {});
  assert.equal(cues.length, 2);
  assert.equal(cues[0].end, 2, "前の字幕の終わりが詰まっていない");
  assert.equal(cues[1].start, 2);
  const text = buildSubtitles(p, { format: "srt" });
  assert.equal(text,
    "1\n00:00:00,000 --> 00:00:02,000\n前\n\n" +
    "2\n00:00:02,000 --> 00:00:04,000\n後\n");
});

test("字幕: 同時に始まる 2 つは 1 枚に束ねる（連番は続く）", () => {
  const p = subProj([
    textClip(1, 2, "上の行"),
    textClip(1, 2, "下の行", { id: "cl_t1b" }),
    textClip(4, 1, "次"),
  ]);
  const cues = collectCues(p, {});
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "上の行\n下の行");
  const text = buildSubtitles(p, { format: "srt" });
  assert.ok(text.startsWith("1\n00:00:01,000 --> 00:00:03,000\n上の行\n下の行\n\n2\n"), text);
});

test("字幕: 並びが逆さでも時刻順に直す・空の文字は捨てる", () => {
  const p = subProj([
    textClip(5, 1, "あと"),
    textClip(1, 1, "さき"),
    textClip(3, 1, "   "),
    textClip(7, 1, ""),
  ]);
  const cues = collectCues(p, {});
  assert.deepEqual(cues.map((c) => c.text), ["さき", "あと"]);
});

test("字幕: trackId で 1 本だけ選べる（無い id は明確なエラー）", () => {
  const p = proj({
    tracks: [
      { id: "tr_a", kind: "overlay", clips: [textClip(0, 1, "Aの字幕")] },
      { id: "tr_b", kind: "overlay", clips: [textClip(2, 1, "Bの字幕")] },
    ],
  });
  assert.deepEqual(collectCues(p, { trackId: "tr_b" }).map((c) => c.text), ["Bの字幕"]);
  assert.equal(collectCues(p, {}).length, 2);
  assert.throws(
    () => collectCues(p, { trackId: "tr_zzz" }),
    (e) => e instanceof ExportError && e.code === "BAD_FORMAT",
  );
});

test("字幕: 1 枚も無ければ SRT は空・VTT は見出しだけ", () => {
  const p = proj();
  assert.equal(buildSubtitles(p, { format: "srt" }), "");
  assert.equal(buildSubtitles(p, { format: "vtt" }), "WEBVTT\n\n");
});

test("字幕: 知らない形式は BAD_FORMAT", () => {
  assert.throws(
    () => buildSubtitles(subProj([textClip(0, 1, "あ")]), { format: "ass" }),
    (e) => e instanceof ExportError && e.code === "BAD_FORMAT",
  );
});

test("字幕: 尺 0 のクリップでも end > start になる", () => {
  const p = subProj([textClip(1, 0, "点")]);
  const cues = collectCues(p, {});
  assert.ok(cues[0].end > cues[0].start);
});

/* ── 8. EDL ─────────────────────────────────────────────────── */

test("exportEDL: 編集内容が JSON に入る", async () => {
  const p = proj({
    markers: [{ id: "mk_1", t: 1.5, name: "ここ" }],
    chapters: [{ id: "ch_1", t: 0, title: "第 1 章" }],
    tracks: [
      { id: "tr_1", kind: "video", name: "V1", clips: [clip({ start: 0, duration: 4, speed: 2 })] },
      { id: "tr_2", kind: "overlay", name: "字幕", clips: [textClip(1, 2, "字")] },
    ],
  });
  const edl = buildEDL(p);
  assert.equal(edl.kind, "vq-studio-edl");
  assert.equal(edl.version, 1);
  assert.equal(edl.duration, 4);
  assert.equal(edl.tracks.length, 2);
  assert.equal(edl.tracks[0].clips[0].speed, 2);
  assert.equal(edl.tracks[0].clips[0].asset, "IMG_0001.MOV");
  assert.equal(edl.tracks[1].clips[0].text, "字");
  assert.equal(edl.markers[0].t, 1.5);
  assert.equal(edl.chapters[0].title, "第 1 章");

  const blob = exportEDL(p);
  assert.match(blob.type, /application\/json/);
  const back = JSON.parse(await blob.text());
  assert.equal(back.project.name, "テスト企画");
});

/* ── 9. WAV の頭 ────────────────────────────────────────────── */

/** AudioBuffer の代わり（getChannelData だけ在れば良い） */
function fakeBuffer(sampleRate, channels, length, fill) {
  const data = [];
  for (let c = 0; c < channels; c++) {
    const a = new Float32Array(length);
    for (let i = 0; i < length; i++) a[i] = fill ? fill(i, c) : 0;
    data.push(a);
  }
  return {
    sampleRate, numberOfChannels: channels, length,
    getChannelData: (c) => data[c],
  };
}

test("encodeWav: RIFF/WAVE の頭と data の長さが合う", async () => {
  const buf = fakeBuffer(48000, 2, 100, (i) => (i % 2 ? 1 : -1));
  const blob = encodeWav(buf);
  assert.equal(blob.type, "audio/wav");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ascii = (at, n) => String.fromCharCode(...bytes.slice(at, at + n));
  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(ascii(12, 4), "fmt ");
  assert.equal(ascii(36, 4), "data");
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(20, true), 1, "PCM ではない");
  assert.equal(view.getUint16(22, true), 2, "チャンネル数が違う");
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint16(34, true), 16, "16bit ではない");
  assert.equal(view.getUint32(40, true), 100 * 2 * 2);
  assert.equal(bytes.length, 44 + 100 * 2 * 2);
  // 振り切れが折り返していないこと（+1 → 32767 / -1 → -32768）
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
});

test("encodeWav: 範囲を切り出せる・音が無ければ NO_AUDIO", async () => {
  const buf = fakeBuffer(48000, 1, 1000);
  const blob = encodeWav(buf, { startSample: 100, endSample: 200 });
  assert.equal(blob.size, 44 + 100 * 2);
  assert.throws(() => encodeWav(null), (e) => e instanceof ExportError && e.code === "NO_AUDIO");
});

/* ── 10. presets ────────────────────────────────────────────── */

test("PRESETS: 12 個以上・id は重複しない・形が揃っている", () => {
  assert.ok(PRESETS.length >= 12, `preset が ${PRESETS.length} 個しか無い`);
  const ids = new Set();
  for (const p of PRESETS) {
    assert.ok(p.id && !ids.has(p.id), `id が重複: ${p.id}`);
    ids.add(p.id);
    assert.equal(typeof p.name, "string");
    assert.ok(p.name.length > 0);
    assert.equal(typeof p.icon, "string");
    assert.equal(typeof p.note, "string");
    assert.ok(CONTAINERS.includes(p.container), `知らない容器: ${p.container}`);
    for (const k of ["width", "height", "fps", "videoBitrate", "audioBitrate"]) {
      assert.ok(p[k] === null || typeof p[k] === "number", `${p.id}.${k} が数でも null でもない`);
    }
  }
  // 契約書 §11.8 で名指しされている物が在ること
  for (const id of ["yt-1080p", "yt-4k", "yt-shorts", "tiktok", "ig-reel", "ig-square",
    "ig-feed", "x-post", "line", "light-720p", "hq-60", "audio-wav", "gif", "still-png"]) {
    assert.ok(ids.has(id), `${id} が無い`);
  }
  // ratio は core/schema.js の RATIOS の綴りに合わせる（UI が比較する）
  for (const p of PRESETS) {
    if (p.ratio !== null) assert.ok(/^\d+(\.\d+)?:\d+$/.test(p.ratio), `${p.id} の ratio が変: ${p.ratio}`);
  }
});

test("getPreset / presetGroups", () => {
  assert.equal(getPreset("yt-1080p").width, 1920);
  assert.equal(getPreset("在りません"), null);
  const groups = presetGroups();
  assert.ok(groups.length >= 2);
  const counted = groups.reduce((n, g) => n + g.presets.length, 0);
  assert.equal(counted, PRESETS.length, "どこの組にも入っていない preset が在る");
});

test("applyPreset: exportOpts になる（planExport をそのまま通る）", () => {
  const p = proj();
  const opts = applyPreset(p, "yt-shorts", {});
  assert.equal(opts.width, 1080);
  assert.equal(opts.height, 1920);
  assert.equal(opts.fps, 30);
  assert.equal(opts.container, "mp4");
  assert.equal(opts.codec, "avc");
  assert.equal(opts.preset, "yt-shorts");

  const plan = planExport(p, opts);
  assert.equal(plan.width, 1080);
  assert.equal(plan.height, 1920);
  assert.equal(plan.container, "mp4");
  assert.equal(plan.videoBitrate, 12000000);
});

test("applyPreset: 画面で触った値が preset に勝つ", () => {
  const opts = applyPreset(proj(), "yt-1080p", { width: 1280, height: 720, fps: 24 });
  assert.equal(opts.width, 1280);
  assert.equal(opts.height, 720);
  assert.equal(opts.fps, 24);
  const plan = planExport(proj(), opts);
  assert.equal(plan.width, 1280);
  assert.equal(plan.height, 720);
  assert.equal(plan.fps, 24);
});

test("applyPreset: 道具（onProgress / signal / sources）は素通しする", () => {
  const onProgress = () => {};
  const ac = new AbortController();
  const sources = { seekExact: () => {} };
  const opts = applyPreset(proj(), "yt-1080p", {
    onProgress, signal: ac.signal, sources, range: { start: 1, end: 2 },
  });
  assert.equal(opts.onProgress, onProgress);
  assert.equal(opts.signal, ac.signal);
  assert.equal(opts.sources, sources);
  assert.deepEqual(opts.range, { start: 1, end: 2 });
});

test("applyPreset: 音だけ / 絵だけの preset は音の扱いが決まる", () => {
  assert.equal(applyPreset(proj(), "audio-wav", {}).audio, "only");
  assert.equal(applyPreset(proj(), "audio-opus", {}).audio, "only");
  assert.equal(applyPreset(proj(), "gif", {}).audio, "none");
  assert.equal(applyPreset(proj(), "still-png", {}).audio, "none");
  assert.equal(applyPreset(proj(), "yt-1080p", {}).audio, undefined);

  const wav = planExport(proj(), applyPreset(proj(), "audio-wav", {}));
  assert.equal(wav.mode, "audio");
  assert.equal(wav.container, "wav");

  const opus = planExport(proj(), applyPreset(proj(), "audio-opus", {}));
  assert.equal(opus.mode, "audio");
  assert.equal(opus.container, "webm");
});

test("applyPreset: 「元のまま」はプロジェクトの設定に従う", () => {
  const p = proj({ settings: { width: 1440, height: 1080, fps: 25 } });
  const plan = planExport(p, applyPreset(p, "source", {}));
  assert.equal(plan.width, 1440);
  assert.equal(plan.height, 1080);
  assert.equal(plan.fps, 25);
});

test("applyPreset: 知らない id は BAD_FORMAT", () => {
  assert.throws(
    () => applyPreset(proj(), "そんなの無い", {}),
    (e) => e instanceof ExportError && e.code === "BAD_FORMAT",
  );
});

test("applyPreset: すべての preset が planExport を通る", () => {
  const p = proj();
  for (const preset of PRESETS) {
    const plan = planExport(p, applyPreset(p, preset.id, {}));
    assert.ok(plan.mode, `${preset.id} の mode が無い`);
    assert.ok(plan.estimatedBytes >= 0, `${preset.id} の推定容量が変`);
    if (plan.mode === "precise" || plan.mode === "realtime") {
      assert.equal(plan.width % 2, 0, `${preset.id} の幅が奇数`);
      assert.equal(plan.height % 2, 0, `${preset.id} の高さが奇数`);
      assert.ok(plan.fps >= FPS_MIN && plan.fps <= FPS_MAX, `${preset.id} の fps が範囲外`);
      assert.ok(plan.videoBitrate > 0, `${preset.id} のビットレートが 0`);
    }
  }
});

/* ── 11. recommendPreset ────────────────────────────────────── */

test("recommendPreset: 横長は 1080p、4K は 4K", () => {
  assert.equal(recommendPreset(proj()), "yt-1080p");
  assert.equal(recommendPreset(proj({ settings: { width: 3840, height: 2160 } })), "yt-4k");
  assert.equal(recommendPreset(proj({ settings: { width: 2560, height: 1440 } })), "yt-1440p");
});

test("recommendPreset: 縦長は尺で ショート / リール / TikTok", () => {
  const vertical = (dur) => proj({
    settings: { width: 1080, height: 1920 },
    tracks: [{ id: "tr_1", kind: "video", clips: [clip({ start: 0, duration: dur })] }],
  });
  assert.equal(recommendPreset(vertical(30)), "yt-shorts");
  assert.equal(recommendPreset(vertical(75)), "ig-reel");
  assert.equal(recommendPreset(vertical(300)), "tiktok");
});

test("recommendPreset: 正方形は Instagram、4:5 はフィード", () => {
  assert.equal(recommendPreset(proj({ settings: { width: 1080, height: 1080 } })), "ig-square");
  // 1080x1350（4:5）は縦だが 9:16 の投稿先に入れると切れるので別扱い
  assert.equal(recommendPreset(proj({ settings: { width: 1080, height: 1350 } })), "ig-feed");
});

test("recommendPreset: 60fps は高画質 60fps、長い物と小さい物は軽量", () => {
  assert.equal(recommendPreset(proj({ settings: { fps: 60 } })), "hq-60");
  const long = proj({ tracks: [{ id: "tr_1", kind: "video", clips: [clip({ duration: 900 })] }] });
  assert.equal(recommendPreset(long), "light-720p");
  assert.equal(recommendPreset(proj({ settings: { width: 1280, height: 720 } })), "light-720p");
});

test("recommendPreset: 音だけのプロジェクトは 音声のみ", () => {
  const audioOnly = proj({
    tracks: [{ id: "tr_a", kind: "audio", clips: [clip({ kind: "audio", duration: 60 })] }],
  });
  assert.deepEqual(surveyMedia(audioOnly), { visual: false, audio: true });
  assert.equal(recommendPreset(audioOnly), "audio-wav");
});

test("surveyMedia: 文字だけでも「絵が在る」と見る", () => {
  const textOnly = subProj([textClip(0, 2, "字だけ")]);
  assert.equal(surveyMedia(textOnly).visual, true);
  assert.equal(surveyMedia(textOnly).audio, false);
  assert.equal(recommendPreset(textOnly), "yt-1080p");
});

/* ── 12. capabilities（Node では「何も無い」が正しい） ───────── */

test("capabilities: Node でも落ちず、形が揃う", async () => {
  const caps = await capabilities();
  assert.ok(Array.isArray(caps.webcodecs.video));
  assert.ok(Array.isArray(caps.webcodecs.audio));
  assert.ok(Array.isArray(caps.mediaRecorder));
  assert.ok(Array.isArray(caps.containers));
  assert.ok(Array.isArray(caps.notes));
  assert.equal(typeof caps.preciseAvailable, "boolean");
  assert.equal(caps.preciseAvailable, false, "Node に WebCodecs は無い");
  assert.ok(caps.notes.length > 0, "出来ない理由が書かれていない");
  for (const c of ["wav", "gif", "png", "jpeg"]) {
    assert.ok(caps.containers.includes(c), `${c} が containers に無い`);
  }
});
