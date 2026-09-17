/* ══════════════════════════════════════════════════════════════════════
   export/presets.js — 書き出しの既製品（契約書 §5 / §11.8 の presets）

   ★ 何をする所か
     「YouTube 1080p」「ショート」「TikTok」…のような **選ぶだけで正しい値が
     入る**組み合わせを持つ。UI は PRESETS を並べ、選ばれた id を
     applyPreset() に渡して exportOpts（= exportVideo の第 2 引数）を得る。
     初めて開いた人のために recommendPreset() が 1 つ推す。

   ★ なぜこの形か
     ・数値（解像度・fps・ビットレート）を UI の各所に散らすと、直す時に
       必ず 1 箇所だけ古いまま残る。ここが唯一の表。
     ・null は「自動」の意味にした（planExport がプロジェクトの設定や
       解像度から計算する）。0 を自動の印にすると「0fps 指定」と
       区別できなくなる。
     ・name は日本語、id は英語（内部 API 名は英語・契約書の作法）。
     ・note は画面に出す短い注意（尺の上限や再生できない端末など）。
       投稿先の制限は「書き出す前」に知りたいので preset に持たせる。
     ・applyPreset は **preset を先に置いて opts で上書き**する。
       利用者が画面で触った値（解像度だけ変えた等）が勝つべきなので。

   ★ 触るときの注意
     ・ここは純関数だけ。DOM も await も持たせない（試験で固める）。
     ・icon の名前は ui/icons.js の一覧に合わせる。まだ無い名前は
       icon() 側で既定の四角が出る前提（落ちないこと）。
     ・id は保存された設定に残るので **勝手に変えない**（増やすのは自由）。
   ══════════════════════════════════════════════════════════════════════ */

import { finite } from "../core/util.js";
import { ExportError, projectDuration, surveyMedia } from "./exporter.js";

/**
 * @typedef {Object} Preset
 * @property {string} id            保存に残る印（変えない）
 * @property {string} name          画面に出す日本語
 * @property {string} icon          ui/icons.js の名前
 * @property {string|null} ratio    "16:9" など。音声のみは null
 * @property {number|null} width    null = プロジェクトの設定に従う
 * @property {number|null} height
 * @property {number|null} fps
 * @property {number|null} videoBitrate  bps。null = 解像度と fps から自動
 * @property {number|null} audioBitrate  bps
 * @property {string} container     mp4|webm|wav|gif|png
 * @property {string} codec         avc|vp9|pcm|opus|gif|png
 * @property {string} note          短い注意
 */

/** 書き出しの既製品（契約書 §11.8）。上から順に画面へ並べる */
export const PRESETS = /** @type {Preset[]} */ ([
  {
    id: "yt-1080p", name: "YouTube 1080p", icon: "youtube", ratio: "16:9",
    width: 1920, height: 1080, fps: 30, videoBitrate: 12000000, audioBitrate: 192000,
    container: "mp4", codec: "avc",
    note: "一番無難。だいたいどこへ出しても そのまま使えます。",
  },
  {
    id: "yt-1440p", name: "YouTube 1440p", icon: "youtube", ratio: "16:9",
    width: 2560, height: 1440, fps: 30, videoBitrate: 24000000, audioBitrate: 224000,
    container: "mp4", codec: "avc",
    note: "1080p より文字がはっきり出ます。書き出しは 2 倍ほど掛かります。",
  },
  {
    id: "yt-4k", name: "YouTube 4K", icon: "youtube", ratio: "16:9",
    width: 3840, height: 2160, fps: 30, videoBitrate: 45000000, audioBitrate: 256000,
    container: "mp4", codec: "avc",
    note: "重いです。端末が対応していないときは自動で録画方式に落ちます。",
  },
  {
    id: "yt-shorts", name: "YouTube ショート", icon: "shorts", ratio: "9:16",
    width: 1080, height: 1920, fps: 30, videoBitrate: 12000000, audioBitrate: 192000,
    container: "mp4", codec: "avc",
    note: "縦長・60 秒まで。",
  },
  {
    id: "tiktok", name: "TikTok", icon: "tiktok", ratio: "9:16",
    width: 1080, height: 1920, fps: 30, videoBitrate: 10000000, audioBitrate: 160000,
    container: "mp4", codec: "avc",
    note: "縦長。上下に操作ボタンが重なるので端に文字を置かないこと。",
  },
  {
    id: "ig-reel", name: "Instagram リール", icon: "instagram", ratio: "9:16",
    width: 1080, height: 1920, fps: 30, videoBitrate: 10000000, audioBitrate: 160000,
    container: "mp4", codec: "avc",
    note: "縦長・90 秒まで。",
  },
  {
    id: "ig-square", name: "Instagram 正方形", icon: "square", ratio: "1:1",
    width: 1080, height: 1080, fps: 30, videoBitrate: 8000000, audioBitrate: 160000,
    container: "mp4", codec: "avc",
    note: "投稿欄で切られにくい形。",
  },
  {
    id: "x-post", name: "X（旧 Twitter）", icon: "x", ratio: "16:9",
    width: 1280, height: 720, fps: 30, videoBitrate: 5000000, audioBitrate: 128000,
    container: "mp4", codec: "avc",
    note: "2 分 20 秒・512MB まで。720p が無難です。",
  },
  {
    id: "line", name: "LINE で送る", icon: "line", ratio: "9:16",
    width: 720, height: 1280, fps: 30, videoBitrate: 2500000, audioBitrate: 96000,
    container: "mp4", codec: "avc",
    note: "5 分・300MB 目安。軽さを優先しています。",
  },
  {
    id: "light-720p", name: "軽量 720p", icon: "feather", ratio: "16:9",
    width: 1280, height: 720, fps: 30, videoBitrate: 3000000, audioBitrate: 128000,
    container: "mp4", codec: "avc",
    note: "通信量と書き出し時間を抑えたいとき。確認用にも。",
  },
  {
    id: "light-480p", name: "下書き 480p", icon: "feather", ratio: "16:9",
    width: 854, height: 480, fps: 30, videoBitrate: 1200000, audioBitrate: 96000,
    container: "mp4", codec: "avc",
    note: "中身の確認だけしたいときの一番速い道。",
  },
  {
    id: "hq-60", name: "高画質 60fps", icon: "sparkles", ratio: "16:9",
    width: 1920, height: 1080, fps: 60, videoBitrate: 20000000, audioBitrate: 256000,
    container: "mp4", codec: "avc",
    note: "動きの速い映像・ゲーム向け。",
  },
  {
    id: "master", name: "保存用マスター", icon: "archive", ratio: "16:9",
    width: 1920, height: 1080, fps: 30, videoBitrate: 40000000, audioBitrate: 320000,
    container: "mp4", codec: "avc",
    note: "作り直す元として残す用。容量は大きくなります。",
  },
  {
    id: "source", name: "元のまま", icon: "sliders", ratio: null,
    width: null, height: null, fps: null, videoBitrate: null, audioBitrate: 192000,
    container: "mp4", codec: "avc",
    note: "プロジェクトの設定そのまま。ビットレートは自動。",
  },
  {
    id: "webm-vp9", name: "WebM（VP9）", icon: "monitor", ratio: "16:9",
    width: 1920, height: 1080, fps: 30, videoBitrate: 10000000, audioBitrate: 160000,
    container: "webm", codec: "vp9",
    note: "iPhone / iPad では再生できません。Web 埋め込み向け。",
  },
  {
    id: "audio-wav", name: "音声のみ（WAV）", icon: "music", ratio: null,
    width: null, height: null, fps: null, videoBitrate: null, audioBitrate: null,
    container: "wav", codec: "pcm",
    note: "無圧縮。ラジオ・文字起こし・他のソフトへ渡すとき。",
  },
  {
    id: "audio-opus", name: "音声のみ（軽い）", icon: "music", ratio: null,
    width: null, height: null, fps: null, videoBitrate: null, audioBitrate: 128000,
    container: "webm", codec: "opus",
    note: "WAV の 1/10 ほど。端末が Opus に対応していないと WAV になります。",
  },
  {
    id: "gif", name: "GIF アニメ", icon: "gif", ratio: "16:9",
    width: 480, height: 270, fps: 12, videoBitrate: null, audioBitrate: null,
    container: "gif", codec: "gif",
    note: "音は入りません。短く・小さくするほど綺麗です。",
  },
  {
    id: "still-png", name: "静止画（PNG）", icon: "image", ratio: "16:9",
    width: 1920, height: 1080, fps: null, videoBitrate: null, audioBitrate: null,
    container: "png", codec: "png",
    note: "今の 1 フレーム。サムネイル作りに。",
  },
]);

const BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/**
 * id から preset を引く（無ければ null）。
 * @param {string} presetId @returns {Preset|null}
 */
export function getPreset(presetId) {
  return BY_ID.get(String(presetId || "")) || null;
}

/** opts から そのまま持って行く鍵（利用者が画面で触った値・呼び出し側の道具） */
const PASS_THROUGH = [
  "range", "mode", "audio", "quality", "sequence", "type", "maxStills",
  "width", "height", "fps", "videoBitrate", "audioBitrate", "sampleRate",
  "container", "codec", "strict", "filenameLabel", "at",
  "onProgress", "signal", "canvas", "compositor", "sources", "storage", "audioEngine",
];

/**
 * preset を exportVideo / planExport に渡せる形へ開く。
 * preset を先に置き、opts で上書きする（画面で触った値が勝つ）。
 * @param {any} project 今は値を読まないが、将来「元のまま」の解決に使う
 * @param {string} presetId
 * @param {Object} [opts] 上書きと呼び出し側の道具
 * @returns {Object} exportOpts
 */
export function applyPreset(project, presetId, opts) {
  const p = getPreset(presetId);
  if (!p) {
    throw new ExportError(`知らない書き出し設定です: ${presetId}`, "BAD_FORMAT");
  }
  const o = opts || {};
  /** @type {any} */
  const out = { preset: p.id, container: p.container, codec: p.codec };
  if (p.width) out.width = p.width;
  if (p.height) out.height = p.height;
  if (p.fps) out.fps = p.fps;
  if (p.videoBitrate) out.videoBitrate = p.videoBitrate;
  if (p.audioBitrate) out.audioBitrate = p.audioBitrate;
  // 音だけの preset（codec が pcm / opus）は「音声のみ」、絵だけの物は「無音」
  if (p.codec === "pcm" || p.codec === "opus") out.audio = "only";
  else if (p.container === "gif" || p.container === "png" || p.container === "jpeg") out.audio = "none";
  for (const k of PASS_THROUGH) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

/**
 * このプロジェクトに合う preset を 1 つ推す（迷わせないため）。
 * 縦長ならショート系、正方形なら Instagram、4K なら 4K、長いものは軽量。
 * 映像が無く音だけなら「音声のみ」。
 * @param {any} project @returns {string} presetId
 */
export function recommendPreset(project) {
  const s = (project && project.settings) || {};
  const w = finite(s.width, 1920);
  const h = finite(s.height, 1080);
  const fps = finite(s.fps, 30);
  const dur = projectDuration(project);
  const media = surveyMedia(project);

  if (!media.visual) return media.audio ? "audio-wav" : "yt-1080p";
  if (h > w * 1.05) {
    if (dur <= 60) return "yt-shorts";
    if (dur <= 90) return "ig-reel";
    return "tiktok";
  }
  if (Math.abs(w - h) <= w * 0.05) return "ig-square";
  if (h >= 2000) return "yt-4k";
  if (h >= 1300) return "yt-1440p";
  if (fps >= 48) return "hq-60";
  if (dur >= 600) return "light-720p";
  if (h <= 800) return "light-720p";
  return "yt-1080p";
}

/**
 * 画面の並びを作るための組分け（UI が段組みに使う）。
 * @returns {{title:string, presets:Preset[]}[]}
 */
export function presetGroups() {
  const pickIds = (ids) => ids.map((id) => BY_ID.get(id)).filter(Boolean);
  return [
    { title: "投稿する", presets: pickIds(["yt-1080p", "yt-1440p", "yt-4k", "yt-shorts", "tiktok", "ig-reel", "ig-square", "x-post", "line"]) },
    { title: "手元に置く", presets: pickIds(["light-720p", "light-480p", "hq-60", "master", "source", "webm-vp9"]) },
    { title: "動画以外", presets: pickIds(["audio-wav", "audio-opus", "gif", "still-png"]) },
  ];
}
