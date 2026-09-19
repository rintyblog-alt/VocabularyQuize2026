/* ══════════════════════════════════════════════════════════════════════
   ai/planner.js — 「何をどう並べるか」を決める所（Plan を作る）

   ★ 何をする所か
     ・`planEdit(...)` … 注文 → 素材の要約 → LLM に §6 の Plan JSON を出させる
       → 検める → 直す → 駄目なら **端末内の決定論**（planLocal）。
       **どの道を通っても必ず Plan が返る**（契約書 §6 の合格条件）。
     ・`planLocal(intent, assets, template)` … pure・決定論・ネット不要。
     ・`validatePlan(plan, { assets })` … pure。壊れている所を列挙する。
     ・`repairPlan(plan, { assets, intent })` … pure。直せる所を直す。

   ★ なぜこの形か
     ・Plan は「意味」だけを持ち、**秒とフレームは持たない**（契約書 §6）。
       planner は「どの素材を・どのくらいの長さで・どの順で・どんな文字を
       添えて」までを決め、実際の in/out と start は ai/resolve.js が決める。
       混ぜると LLM の思い付きがタイムラインの不変条件を壊す。
     ・LLM の答えは **信じない**。validate → repair → 駄目なら捨てて planLocal
       （「AI が変な JSON を返すと何も出ない」を防ぐ）。
     ・planLocal は決定論（乱数を使わない）。同じ素材・同じ注文なら必ず同じ
       Plan。試験で固定できるし、ユーザーも「やり直し」で驚かない。

   ★ 触るときの注意
     ・`planLocal` に乱数・Date.now・DOM を入れない（試験が壊れる）。
     ・素材の点数は analysis が在れば使い、無ければ 0.5（普通）。解析を待たない。
     ・Plan に鍵を足すときは `PLAN_KEYS` と repairPlan の白名簿も直す
       （でないと repair が黙って落とす）。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, finite } from "../core/util.js";
import { warn } from "../core/log.js";
import { RATIOS } from "../core/schema.js";
import { analysisDuration, meanCurve, summarizeForLLM } from "../analysis/video.js";
import {
  PACING_IDS, STYLE_IDS, TEMPLATE_IDS, LOOK_IDS,
  gradeForLook, shotLengthFor, templateDefaults, getTemplate
} from "./templates.js";
import { parseIntent, parseIntentLocal, quotedParts } from "./intent.js";

const str = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);

/** Plan に書ける鍵（これ以外は repairPlan が落とす。契約書 §6 + id）
    CONTRACT-NOTE: `id` は契約の一覧に無いが、§1 の Clip.source.planId に
    入れる印が要る（どのクリップがどの Plan で出来たかを UI が辿る）。
    そこで id だけ足し、resolve が clip.source.planId へ写す。 */
export const PLAN_KEYS = Object.freeze([
  "id", "title", "ratio", "targetDuration", "pacing", "music", "style",
  "grade", "segments", "captions", "endCard"
]);
/** segment に書ける鍵・値（契約書 §6）。resolve もこの表を信じて動く */
export const SEGMENT_KEYS = Object.freeze(["assetId", "pick", "want", "speed", "reverse", "transition", "text", "fx", "note"]);
export const PICK_MODES = Object.freeze(["auto", "best", "start", "end"]);
export const TRANSITIONS = Object.freeze(["cut", "crossfade", "whipPan", "zoomIn", "glitch", "slide"]);
export const TEXT_ROLES = Object.freeze(["title", "caption", "lower", "end"]);
export const CAPTION_MODES = Object.freeze(["none", "auto", "prompt"]);
/** 1 本の動画に入れる最大クリップ数（iPhone で触れる上限の目安） */
export const MAX_SEGMENTS = 240;
/* ══ §A 素材の見立て（pure）═══════════════════════════════════════ */

/** 素材の尺（analysis が在ればそちらも見る）。静止画は 0 */
export function assetDuration(asset) {
  const a = plain(asset) || {}, d = finite(a.duration, 0);
  return d > 0 ? d : Math.max(0, analysisDuration(a.analysis));
}

/** 映像として使える素材か（video / image） */
function isVisual(asset) {
  const k = str(plain(asset) && plain(asset).kind);
  return k === "video" || k === "image";
}


/** 時系列に並べる鍵（createdAt → 名前 → id。pure で決定論） */
function chronoKey(a, i) {
  const o = plain(a) || {};
  return [finite(o.createdAt, 0), str(o.name), str(o.id), i];
}
/** chronoKey の比較（同じ値なら元の並び順） */
function byChrono(x, y) {
  const a = x.key, b = y.key;
  for (let i = 0; i < 3; i++) {
    if (typeof a[i] === "number" && a[i] !== b[i]) return a[i] - b[i];
    if (typeof a[i] === "string" && a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a[3] - b[3];
}

/**
 * 素材の総合点（pure）。解析が無ければ 0.5（普通）。`avoid` の性質は減点し、
 * `mustInclude` は +0.5（必ず使う物を優先する）。0..1.5。
 * @param {Object} asset @param {{avoid?:string[], mustInclude?:string[]}} [intent]
 * @returns {number}
 */
export function assetScore(asset, intent) {
  const a = plain(asset) || {};
  const A = plain(a.analysis);
  const it = plain(intent) || {};
  const avoid = arr(it.avoid).map(str);
  let s = 0.5;
  if (A) {
    const dur = Math.max(assetDuration(a), 0.001);
    const sharp = meanCurve(A.sharp, 0, dur, null);
    const bright = meanCurve(A.bright, 0, dur, null);
    const motion = meanCurve(A.motion, 0, dur, null);
    const sat = meanCurve(A.sat, 0, dur, null);
    let acc = 0, w = 0;
    const add = (v, weight) => { if (v !== null && v !== undefined) { acc += clamp(finite(v, 0), 0, 1) * weight; w += weight; } };
    const hl = arr(A.highlights);
    add(sharp, 0.34);
    add(bright === null ? null : 1 - Math.abs(bright - 0.5) * 2, 0.24);
    add(motion === null ? null : Math.min(1, finite(motion, 0) / 0.6), 0.22);
    add(sat === null ? null : Math.min(1, finite(sat, 0) / 0.6), 0.1);
    if (hl.length) add(clamp(finite(hl[0].score, 0.5), 0, 1), 0.2);
    s = w > 0 ? acc / w : 0.5;
    const shake = typeof A.shake === "number" ? clamp(finite(A.shake, 0), 0, 1) : null;
    if (avoid.indexOf("shaky") >= 0 && shake !== null && shake > 0.35) s -= 0.3;
    if (avoid.indexOf("dark") >= 0 && bright !== null && bright < 0.25) s -= 0.3;
    if (avoid.indexOf("blurry") >= 0 && sharp !== null && sharp < 0.35) s -= 0.3;
    if (avoid.indexOf("long") >= 0 && assetDuration(a) > 60) s -= 0.1;
  }
  if (arr(it.mustInclude).map(str).indexOf(str(a.id)) >= 0) s += 0.5;   // 必ず入れる物を優先
  return clamp(s, 0, 1.5);
}

/** BGM に向いた音の素材（注文の指定 → 一番長い物。同じ長さなら id 順で決定論） */
export function pickMusicAsset(assets, intent) {
  const it = plain(intent) || {};
  const want = str(plain(it.music) && plain(it.music).assetId);
  const list = arr(assets).filter((a) => str(plain(a) && plain(a).kind) === "audio");
  if (!list.length) return null;
  if (want) { const hit = list.find((a) => str(a.id) === want); if (hit) return hit; }
  let best = list[0];
  for (const a of list) {
    const d = assetDuration(a), bd = assetDuration(best);
    if (d > bd || (d === bd && str(a.id) < str(best.id))) best = a;
  }
  return best;
}


/** 素材から 1 行の説明（テロップの既定文）。カメラの連番名は「場面 N」にする */
function shortLabel(asset, index) {
  const name = str(plain(asset) && plain(asset).name).replace(/\.[A-Za-z0-9]+$/, "").trim();
  if (!name || /^(img|mov|dsc|vid|video|movie|clip|pxl|screen ?record)[\-_ ]?\d+$/i.test(name)) return `場面 ${index + 1}`;
  return name.slice(0, 16);
}

/** 注文の題（「」の中 → 命令の言い方を落とした頭 → 型の名前） */
function titleOf(intent, tpl) {
  const q = quotedParts(str(plain(intent) && plain(intent).goal));
  if (q.length) return q[0].slice(0, 40);
  let s = str(plain(intent) && plain(intent).goal).split(/[。、,\n]/)[0];
  s = s.replace(/^\s*[0-9０-９]+(?:\.[0-9]+)?\s*(?:秒|分)\s*(?:くらい|ほど|程度|前後|以内)?\s*(?:の|で)?\s*/, "");
  s = s.replace(/(にして|に編集して|して(ね|ください|下さい)?|作って(ね|ください|下さい)?|編集して(ね)?|まとめて|つなげて|切って|お願い(します)?)[\s、]*$/g, "");
  s = s.replace(/[、,]\s*$/, "").trim();
  return s.length >= 2 ? s.slice(0, 40) : str(tpl.name);
}
/* ══ §B 端末内の決定論プラン（pure）══════════════════════════════ */

/** Intent の形が半端でも読めるようにする（planLocal は誰から呼ばれても動く） */
function intentLike(intent) {
  const it = plain(intent);
  if (!it) return parseIntentLocal("", null);
  if (typeof it.targetDuration === "number" && it.pacing && it.captions) return it;
  return Object.assign(parseIntentLocal(str(it.goal || it.prompt || ""), null), it);
}

/**
 * ネット無しで Plan を組む（**pure・決定論**・契約書 §6 の規則そのまま）。
 * 点の高い素材を多めに・全素材を少なくとも 1 回・1 ショットは pacing で
 * （fast 1.2 / medium 2.2 / slow 3.5 / beat=拍）・目標尺 ±10% まで足し引き・
 * 並びは時系列で冒頭にフック・遷移は既定 cut（素材が変わる所は crossfade、
 * fast は 2 割を whipPan/zoomIn）・テロップは題 + 場面の頭 + 締め。
 * @param {Object} intent @param {Array} assets @param {string|Object|null} [template]
 * @returns {Object} Plan
 */
export function planLocal(intent, assets, template) {
  const it = intentLike(intent);
  const tpl = templateDefaults(template || it.style);
  const rules = tpl.rules;
  const music = it.music && it.music.wanted === false ? null : pickMusicAsset(assets, it);
  const bpm = music && plain(music.analysis) && plain(plain(music.analysis).beats)
    ? finite(plain(plain(music.analysis).beats).bpm, 0) : 0;
  const pacing = PACING_IDS.indexOf(str(it.pacing)) >= 0 ? str(it.pacing) : tpl.pacing;
  const shot = shotLengthFor(pacing, bpm);
  const target = clamp(finite(it.targetDuration, tpl.targetDuration), 1, 1800);
  const minShot = Math.max(0.3, finite(rules.minShot, 0.6));

  /* ① 素材を時系列に並べ、点を付ける */
  const rows = arr(assets).filter(isVisual).map((a, i) => ({
    asset: a, id: str(a.id), key: chronoKey(a, i),
    dur: assetDuration(a), score: assetScore(a, it), shots: 1
  })).sort(byChrono);
  /* 映像が 1 つも無いときも「締めの文字だけ」の案を返す（呼び手を落とさない） */
  if (!rows.length) return normalizePlanShape({
    id: planId(it, assets, tpl), title: titleOf(it, tpl), ratio: it.ratio, targetDuration: target,
    pacing, style: tpl.style, music: null, grade: gradeForLook(it.colorLook), segments: [],
    captions: it.captions, endCard: endCardOf(it, tpl)
  });

  /* ② 1 素材から取れるショット数の上限（短い素材から何度も取らない）。
     静止画は **1 回だけ**（同じ絵を切って並べても「変わらない画」が続くだけ）。 */
  for (const r of rows) {
    const cap = r.dur > 0 ? Math.floor(r.dur / Math.max(shot, minShot)) : 1;
    r.max = clamp(Math.max(1, cap), 1, finite(rules.maxShotsPerAsset, 3));
    r.want = r.dur > 0 ? Math.min(shot, Math.max(minShot, r.dur)) : shot;
  }

  /* ③ 目標尺に合うショット数を割り振る（点の高い順・上限まで）。
     型の上限（maxShotsPerAsset）で目標に届かないときは、**目標の方を優先**して
     素材の物理的な上限（尺 ÷ 最短ショット）まで緩める（尺は利用者の明確な注文、
     上限は見た目の好みなので、譲るのは後者）。 */
  const ranked = rows.slice().sort((a, b) => (b.score - a.score) || (a.key[3] - b.key[3]));
  const wantShots = clamp(Math.round(target / shot), rows.length, MAX_SEGMENTS);
  let total = rows.reduce((m, r) => m + r.want, 0);
  let guard = MAX_SEGMENTS * 2;
  for (let round = 0; round < 2; round++) {
    if (round === 1) {
      if (total >= target * 0.9 || countShots(rows) >= wantShots) break;
      for (const r of rows) r.max = r.dur > 0 ? clamp(Math.floor(r.dur / Math.max(minShot, shot * 0.6)), 1, 24) : 1;
    }
    while (countShots(rows) < wantShots && total < target * 1.1 && guard-- > 0) {
      const r = nextShotOwner(ranked);
      if (!r) break;
      r.shots++; total += r.want;
    }
  }
  guard = MAX_SEGMENTS * 2;
  while (total > target * 1.1 && guard-- > 0) {
    // 余分なショット（2 本目以降）を点の低い順に削る
    const r = ranked.slice().reverse().find((x) => x.shots > 1);
    if (!r) break;
    r.shots--; total -= r.want;
  }
  /* ④ それでも外れているなら 1 ショットの長さで寄せる（±10% に入れる） */
  if (total > 0 && (total < target * 0.9 || total > target * 1.1)) {
    const k = clamp(target / total, 0.35, 2.5);
    for (const r of rows) {
      const lim = r.dur > 0 ? r.dur : target;
      r.want = clamp(r.want * k, minShot, Math.max(minShot, lim));
    }
    total = rows.reduce((m, r) => m + r.want * r.shots, 0);
  }

  /* ⑤ 時系列に並べる（同じ素材のショットは続けて置く）*/
  const segments = [];
  for (const r of rows) {
    for (let k = 0; k < r.shots; k++) {
      segments.push({
        assetId: r.id,
        pick: r.dur > 0 ? (plain(r.asset.analysis) ? "best" : "auto") : "auto",
        want: round3(r.want),
        speed: it.speed !== null && it.speed !== undefined ? clamp(finite(it.speed, 1), 0.1, 8) : 1,
        reverse: false,
        transition: "cut",
        text: null,
        fx: [],
        note: k === 0 ? "" : `${k + 1} 本目`
      });
    }
  }

  /* ⑥ 冒頭にフック（一番点の高い素材の 1 本目を先頭へ）*/
  if (rules.hook && segments.length > 1) {
    const bestId = ranked[0].id;
    const at = segments.findIndex((s) => s.assetId === bestId);
    if (at > 0) {
      const [hook] = segments.splice(at, 1);
      hook.pick = "best";
      hook.note = "フック";
      segments.unshift(hook);
    }
  }

  /* ⑦ 遷移（既定 cut・素材が変わる所だけ crossfade・fast は 2 割を派手に）*/
  const spicy = arr(tpl.transitions).filter((t) => t === "whipPan" || t === "zoomIn" || t === "glitch");
  const every = finite(rules.spice, 0) > 0 ? Math.max(2, Math.round(1 / finite(rules.spice, 0.2))) : 0;
  for (let i = 1; i < segments.length; i++) {
    const changed = segments[i].assetId !== segments[i - 1].assetId;
    let tr = "cut";
    if (rules.crossfadeAt === "always") tr = "crossfade";
    else if (rules.crossfadeAt === "assetChange" && changed) tr = "crossfade";
    if (every > 0 && spicy.length && i % every === 0) tr = spicy[Math.floor(i / every) % spicy.length];
    segments[i].transition = arr(tpl.transitions).indexOf(tr) >= 0 || tr !== "crossfade" ? tr : "cut";
  }

  /* ⑧ 効果（注文で言われた物だけ。派手な物は 4 本に 1 本へ） */
  const fx = arr(it.effects).map(str);
  for (let i = 0; i < segments.length; i++) {
    const list = [];
    for (const f of fx) {
      if (f === "stabilize" || f === "blurBg" || f === "glow") list.push(f);
      else if ((f === "shake" || f === "glitch") && i % 4 === 0 && i > 0) list.push(f);
      else if (f === "zoom" && rules.zoomStill) list.push("zoomIn");
    }
    if (list.length) segments[i].fx = Array.from(new Set(list)).slice(0, 4);
  }


  /* ⑨ テロップ（冒頭タイトル → 場面の頭 → 締め）*/
  if (it.captions !== "none" && segments.length) {
    const quoted = it.captions === "prompt" ? quotedParts(str(it.goal)) : [];
    segments[0].text = { content: (quoted[0] || titleOf(it, tpl)).slice(0, 60), role: "title", emphasis: 0.9 };
    const capRole = tpl.id === "news" || tpl.id === "interview" ? "lower" : "caption";
    const everyCap = Math.max(0, Math.round(finite(rules.captionEvery, 0)));
    let placed = 0, qi = 1, lastContent = str(segments[0].text && segments[0].text.content);
    const seen = new Set([segments[0].assetId]);
    for (let i = 1; i < segments.length && placed < 16; i++) {
      const fresh = !seen.has(segments[i].assetId);
      const periodic = everyCap > 0 && i % everyCap === 0;
      if (!fresh && !periodic) continue;
      seen.add(segments[i].assetId);
      const idx = rows.findIndex((r) => r.id === segments[i].assetId);
      const content = quoted.length ? str(quoted[qi++ % Math.max(1, quoted.length)]) : shortLabel(rows[idx >= 0 ? idx : 0].asset, idx >= 0 ? idx : i);
      if (!content || content === lastContent) continue;   // 同じ文を続けて出さない
      segments[i].text = { content: content.slice(0, 60), role: capRole, emphasis: 0.4 };
      lastContent = content;
      placed++;
    }
  }

  return normalizePlanShape({
    id: planId(it, assets, tpl),
    title: titleOf(it, tpl),
    ratio: it.ratio,
    targetDuration: target,
    pacing,
    style: tpl.style,
    music: music ? {
      assetId: str(music.id),
      gain: clamp(finite(plain(it.music) && plain(it.music).gain, finite(rules.musicGain, 0.25)), 0, 1),
      duck: rules.duck !== false,
      startAt: "auto"
    } : null,
    grade: gradeForLook(it.colorLook),
    segments: segments.slice(0, MAX_SEGMENTS),
    captions: it.captions,
    endCard: endCardOf(it, tpl)
  });
}

function countShots(rows) { return rows.reduce((m, r) => m + r.shots, 0); }

/** 次の 1 ショットを貰う素材（`shots - score*2` が最小 = 点が高い物を多めに、
    ただし 1 つの素材に偏らせない。同点は時系列の早い方）。@returns {Object|null} */
function nextShotOwner(ranked) {
  let best = null, bestKey = Infinity;
  for (const r of ranked) {
    if (r.shots >= r.max) continue;
    const key = r.shots - r.score * 2;
    if (best === null || key < bestKey - 1e-9) { best = r; bestKey = key; }
  }
  return best;
}
function round3(v) { return Math.round(finite(v, 0) * 1000) / 1000; }

/** 締めの画（注文に在ればそれ、無ければ型の文。テロップ無しの注文なら出さない） */
function endCardOf(intent, tpl) {
  const it = plain(intent) || {}, ec = plain(it.endCard), text = str(tpl.rules.endCardText);
  if (ec) return { text: str(ec.text).slice(0, 60) || text || "ありがとうございました", duration: clamp(finite(ec.duration, 1.6), 0.4, 10) };
  return it.captions === "none" || !text ? null : { text: text.slice(0, 60), duration: 1.6 };
}

/** Plan の id（**決定論**。同じ注文・同じ素材なら必ず同じ id = FNV-1a） */
function planId(intent, assets, tpl) {
  const key = [str(plain(intent) && plain(intent).goal), str(tpl.id), arr(assets).map((a) => str(plain(a) && plain(a).id)).join(",")].join("|");
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return "pl_" + h.toString(36);
}
/* ══ §C 形を均す・検める・直す（pure）════════════════════════════ */

/** Plan の器を契約の形へ（足りない鍵を埋め、余りは落とす） */
function normalizePlanShape(plan) {
  const p = plain(plan) || {};
  const out = {
    id: str(p.id) || "pl_0",
    title: str(p.title).slice(0, 120) || "自動編集",
    ratio: Object.prototype.hasOwnProperty.call(RATIOS, str(p.ratio)) ? str(p.ratio) : "16:9",
    targetDuration: clamp(finite(p.targetDuration, 30), 1, 1800),
    pacing: PACING_IDS.indexOf(str(p.pacing)) >= 0 ? str(p.pacing) : "medium",
    music: null,
    style: STYLE_IDS.indexOf(str(p.style)) >= 0 ? str(p.style) : "vlog",
    grade: plain(p.grade) ? Object.assign({}, p.grade) : null,
    segments: [],
    captions: CAPTION_MODES.indexOf(str(p.captions)) >= 0 ? str(p.captions) : "auto",
    endCard: null
  };
  const m = plain(p.music);
  if (m && str(m.assetId)) {
    out.music = {
      assetId: str(m.assetId), gain: clamp(finite(m.gain, 0.25), 0, 1), duck: m.duck !== false,
      startAt: m.startAt === "auto" || m.startAt == null ? "auto" : clamp(finite(m.startAt, 0), 0, 3600)
    };
  }
  const ec = plain(p.endCard);
  if (ec && str(ec.text)) out.endCard = { text: str(ec.text).slice(0, 60), duration: clamp(finite(ec.duration, 1.6), 0.2, 20) };
  out.segments = arr(p.segments).slice(0, MAX_SEGMENTS).map(normalizeSegment).filter(Boolean);
  return out;
}

/** segment の器を契約の形へ（assetId が無い物は捨てる = null） */
function normalizeSegment(seg) {
  const s = plain(seg);
  if (!s || !str(s.assetId)) return null;
  const pick = plain(s.pick);
  const t = plain(s.text);
  return {
    assetId: str(s.assetId),
    pick: pick && Number.isFinite(Number(pick.in)) && Number.isFinite(Number(pick.out))
      ? { in: Math.max(0, Number(pick.in)), out: Math.max(0, Number(pick.out)) }
      : (PICK_MODES.indexOf(str(s.pick)) >= 0 ? str(s.pick) : "auto"),
    want: clamp(finite(s.want, 2), 0.04, 600),
    speed: clamp(Math.abs(finite(s.speed, 1)) || 1, 0.1, 8),
    reverse: s.reverse === true,
    transition: TRANSITIONS.indexOf(str(s.transition)) >= 0 ? str(s.transition) : "cut",
    text: t && str(t.content) ? {
      content: str(t.content).slice(0, 120),
      role: TEXT_ROLES.indexOf(str(t.role)) >= 0 ? str(t.role) : "caption",
      emphasis: clamp(finite(t.emphasis, 0.5), 0, 1)
    } : null,
    fx: arr(s.fx).map(str).filter(Boolean).slice(0, 6),
    note: str(s.note).slice(0, 120)
  };
}

/**
 * Plan を検める（pure）。errors が 1 つでも在れば resolve に渡してはいけない。
 * @param {Object} plan @param {{assets?:Array}} [ctx]
 * @returns {{ok:boolean, errors:{path:string,msg:string,fix:string}[], warnings:{path:string,msg:string,fix:string}[]}}
 */
export function validatePlan(plan, ctx) {
  const errors = [], warnings = [], c = plain(ctx) || {}, assets = arr(c.assets);
  const E = (path, msg, fix) => errors.push({ path, msg, fix });
  const W = (path, msg, fix) => warnings.push({ path, msg, fix });
  const byId = new Map(assets.map((a) => [str(plain(a) && plain(a).id), a]));

  const p = plain(plan);
  if (!p) { E("", "plan が object ではない", "planLocal で作り直す"); return { ok: false, errors, warnings }; }
  for (const k of Object.keys(p)) if (PLAN_KEYS.indexOf(k) < 0) W(k, `知らない鍵 ${k}`, "repairPlan が落とす");
  if (!Object.prototype.hasOwnProperty.call(RATIOS, str(p.ratio))) E("ratio", `知らない比率 ${str(p.ratio) || "(空)"}`, `${Object.keys(RATIOS).join("/")} のどれかにする`);
  const target = Number(p.targetDuration);
  if (typeof p.targetDuration !== "number" || !Number.isFinite(target) || target <= 0) E("targetDuration", `目標の尺が数値ではない（${JSON.stringify(p.targetDuration)}）`, "30 を入れる");
  else if (target > 1800) W("targetDuration", `目標が ${Math.round(target)} 秒（長すぎる）`, "1800 秒に収める");
  if (PACING_IDS.indexOf(str(p.pacing)) < 0) E("pacing", `知らないテンポ ${str(p.pacing) || "(空)"}`, PACING_IDS.join("/") + " のどれかにする");
  if (STYLE_IDS.indexOf(str(p.style)) < 0) {
    if (TEMPLATE_IDS.indexOf(str(p.style)) >= 0) W("style", `style に型の id（${p.style}）が入っている`, "型 → style へ直す");
    else W("style", `知らない style ${str(p.style) || "(空)"}`, '"vlog" にする');
  }
  if (CAPTION_MODES.indexOf(str(p.captions)) < 0) E("captions", `知らない captions ${str(p.captions) || "(空)"}`, CAPTION_MODES.join("/") + " のどれかにする");
  if (p.grade !== null && p.grade !== undefined && !plain(p.grade)) E("grade", "grade が object でも null でもない", "null にする");
  const ec = p.endCard, m = p.music;
  if (ec !== null && ec !== undefined && !plain(ec)) E("endCard", "endCard が object でも null でもない", "null にする");
  else if (plain(ec) && !str(ec.text)) W("endCard.text", "締めの文字が空", "endCard を null にする");
  if (m !== null && m !== undefined && !plain(m)) E("music", "music が object でも null でもない", "null にする");
  else if (plain(m)) {
    const a = byId.get(str(m.assetId));
    if (!str(m.assetId)) E("music.assetId", "BGM の素材 id が無い", "music を null にする");
    else if (assets.length && !a) E("music.assetId", `BGM の素材 ${m.assetId} が無い`, "music を null にする");
    else if (a && str(plain(a).kind) !== "audio") W("music.assetId", `${m.assetId} は音の素材ではない`, "音の素材を選ぶ");
    if (m.gain !== undefined && !(finite(m.gain, -1) >= 0 && finite(m.gain, -1) <= 1)) W("music.gain", "音量が 0..1 の外", "0.25 にする");
  }

  if (!Array.isArray(p.segments)) E("segments", "segments が配列ではない", "[] から作り直す");
  else {
    let sum = 0;
    if (!p.segments.length) E("segments", "segments が 0 個（動画にならない）", "全素材から作り直す");
    if (p.segments.length > MAX_SEGMENTS) W("segments", `${p.segments.length} 個は多すぎる`, `${MAX_SEGMENTS} 個に切る`);
    p.segments.forEach((seg, i) => {
      const path = `segments[${i}]`;
      const s = plain(seg);
      if (!s) { E(path, "segment が object ではない", "捨てる"); return; }
      for (const k of Object.keys(s)) if (SEGMENT_KEYS.indexOf(k) < 0) W(`${path}.${k}`, `知らない鍵 ${k}`, "repairPlan が落とす");
      const id = str(s.assetId);
      if (!id) E(path + ".assetId", "assetId が無い", "この segment を捨てる");
      else if (assets.length && !byId.has(id)) E(path + ".assetId", `素材 ${id} が無い`, "この segment を捨てる");
      const w = Number(s.want);
      if (!Number.isFinite(w) || w <= 0) W(path + ".want", "want が数値ではない", "1 ショット長を入れる");
      else {
        /* want は **タイムライン上で見せる秒数**（ai/resolve.js が
           `srcWant = want × speed` として素材側の秒に直す）。速度で割ると
           「2 倍速で 30 秒」の注文に「合計が目標から離れすぎ」と嘘の警告が出る。 */
        sum += w;
        const a = byId.get(id);
        const dur = a ? assetDuration(a) : 0;
        if (dur > 0 && w > dur + 1e-3) W(path + ".want", `want ${w.toFixed(2)}s が素材の尺 ${dur.toFixed(2)}s より長い`, "素材の尺に収める");
      }
      const pk = s.pick, sp = Number(s.speed), t = plain(s.text);
      if (plain(pk)) {
        const i0 = Number(plain(pk).in), o0 = Number(plain(pk).out);
        if (!Number.isFinite(i0) || !Number.isFinite(o0) || o0 <= i0) E(path + ".pick", "pick の in/out が不正", '"auto" にする');
      } else if (pk !== undefined && PICK_MODES.indexOf(str(pk)) < 0) W(path + ".pick", `知らない pick ${str(pk)}`, '"auto" にする');
      if (s.transition !== undefined && TRANSITIONS.indexOf(str(s.transition)) < 0) W(path + ".transition", `知らない遷移 ${str(s.transition)}`, '"cut" にする');
      if (s.speed !== undefined && (!Number.isFinite(sp) || sp <= 0)) W(path + ".speed", "speed が不正", "1 にする");
      else if (s.speed !== undefined && (sp < 0.1 || sp > 8)) W(path + ".speed", `speed ${sp} は範囲外`, "0.1〜8 に収める");
      if (s.text !== undefined && s.text !== null && !t) W(path + ".text", "text が object でも null でもない", "null にする");
      if (t && !str(t.content)) W(path + ".text.content", "文字が空", "text を null にする");
      if (t && str(t.role) && TEXT_ROLES.indexOf(str(t.role)) < 0) W(path + ".text.role", `知らない role ${t.role}`, '"caption" にする');
      if (s.fx !== undefined && !Array.isArray(s.fx)) W(path + ".fx", "fx が配列ではない", "[] にする");
    });
    if (Number.isFinite(target) && target > 0 && sum > 0 && (sum < target * 0.5 || sum > target * 2)) {
      W("segments", `合計 ${sum.toFixed(1)}s は目標 ${target.toFixed(1)}s から離れすぎ`, "ショット数か want を直す");
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Plan を直す（pure）。**必ず Plan を返す**。存在しない assetId の segment を
 * 捨て、want を素材の尺に収め、segments が 0 個なら全素材から作り直し、
 * 想定外の鍵を落とす。
 * @param {Object} plan @param {{assets?:Array, intent?:Object, template?:string|Object}} [ctx]
 * @returns {Object} Plan
 */
export function repairPlan(plan, ctx) {
  const c = plain(ctx) || {}, assets = arr(c.assets);
  const byId = new Map(assets.map((a) => [str(plain(a) && plain(a).id), a]));
  const it = plain(c.intent) ? intentLike(c.intent) : null;
  const p = normalizePlanShape(plan);          // 想定外の鍵はここで落ちる

  /* style に型の id が入っていたら本来の style へ直す */
  const raw = plain(plan) || {};
  if (STYLE_IDS.indexOf(str(raw.style)) < 0 && TEMPLATE_IDS.indexOf(str(raw.style)) >= 0) {
    p.style = templateDefaults(str(raw.style)).style;
  }
  if (it && !plain(raw.grade) && it.colorLook) p.grade = gradeForLook(it.colorLook);

  /* 素材が無い segment を捨て、want を尺に収める */
  const kept = [];
  for (const s of p.segments) {
    const a = byId.get(s.assetId);
    if (assets.length && !a) continue;
    const dur = a ? assetDuration(a) : 0;
    if (dur > 0) {
      s.want = clamp(s.want, 0.04, dur);
      if (plain(s.pick)) {
        const i0 = clamp(finite(s.pick.in, 0), 0, Math.max(0, dur - 0.04));
        const o0 = clamp(finite(s.pick.out, i0 + s.want), i0 + 0.04, dur);
        s.pick = { in: round3(i0), out: round3(o0) };
        s.want = clamp((o0 - i0) / Math.max(0.1, s.speed), 0.04, 600);
      }
    }
    kept.push(s);
  }
  p.segments = kept.slice(0, MAX_SEGMENTS);

  /* 1 つも残らなかったら全素材から作り直す（ここが最後の砦）*/
  if (!p.segments.length) {
    const fallback = planLocal(it || parseIntentLocal("", { assets }), assets, c.template || (it && it.style) || null);
    fallback.id = p.id;
    if (plain(plan) && str(plain(plan).title)) fallback.title = str(plain(plan).title).slice(0, 120);
    return fallback;
  }

  /* BGM の素材が無い/音ではないなら外す */
  if (p.music) {
    const a = byId.get(p.music.assetId);
    if ((assets.length && !a) || (a && str(plain(a).kind) !== "audio")) p.music = null;
  }
  /* 締めの文字が空なら外す */
  if (p.endCard && !str(p.endCard.text)) p.endCard = null;
  return p;
}
/* ══ §D LLM に Plan を書かせる ════════════════════════════════════ */

/** 契約書 §6 の Plan の形を そのまま言葉にした指示 */
function planSystemPrompt() {
  return [
    "あなたは動画編集の構成作家です。渡された素材と注文から編集案（JSON）を作ります。",
    "JSON だけを返してください（説明・``` は付けない）。形:",
    '{"title":"題","ratio":"16:9|9:16|1:1|4:5|4:3|2.35:1","targetDuration":秒,'
    + '"pacing":"slow|medium|fast|beat","style":"' + STYLE_IDS.join("|") + '",'
    + '"music":{"assetId":"音素材のid","gain":0.25,"duck":true,"startAt":"auto"}|null,'
    + '"grade":{"contrast":0.1,"saturation":0.1}|null,'
    + '"segments":[{"assetId":"素材id","pick":"auto|best|start|end","want":秒,"speed":1,'
    + '"reverse":false,"transition":"cut|crossfade|whipPan|zoomIn|glitch|slide",'
    + '"text":{"content":"テロップ","role":"title|caption|lower|end","emphasis":0.5}|null,'
    + '"fx":[],"note":""}],'
    + '"captions":"none|auto|prompt","endCard":{"text":"締めの文字","duration":1.6}|null}',
    "決まり: segments は渡された素材の id だけを使う（作らない）。全ての素材を少なくとも 1 回使う。",
    "want は「そのショットを何秒見せたいか」＝ でき上がりの尺。素材の中の何秒目かは書かない（こちらで決める）。",
    "speed を 1 以外にしても want は変えない（速くすると素材を多く使うだけで、見せる秒数は want のまま）。",
    "want の合計が targetDuration の ±10% に収まるようにする。",
    "冒頭には一番良い素材を置く。テロップは冒頭の題と場面の頭だけに付ける。日本語で書く。"
  ].join("\n");
}

/** LLM へ渡す素材の一覧（尺とフレームは summarizeForLLM の一言だけ） */
function assetBrief(assets) {
  return arr(assets).slice(0, 40).map((a) => {
    const o = plain(a) || {};
    const kind = str(o.kind) || "video";
    const sum = plain(o.analysis) ? summarizeForLLM(o.analysis, { maxChars: 160 }) : "未解析";
    const dur = assetDuration(o);
    return `- id=${str(o.id)} 種類=${kind} 名前=${str(o.name).slice(0, 40)} 尺=${dur > 0 ? dur.toFixed(1) + "s" : "静止画"} 特徴=${sum}`;
  }).join("\n");
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) { const e = new Error("中止しました"); e.name = "AbortError"; throw e; }
}

/**
 * 自動編集の頭（契約書 §6）。**必ず Plan を返す**（繋がらなければ local）。
 * @param {{prompt?:string, project?:Object, assets?:Array,
 *   template?:string|Object|null, constraints?:Object, llm?:Object,
 *   onProgress?:Function, signal?:AbortSignal|null, intent?:Object}} opts
 * @returns {Promise<{plan:Object, source:"llm"|"local", notes:string[], intent:Object}>}
 */
export async function planEdit(opts) {
  const o = plain(opts) || {};
  const notes = [];
  const signal = o.signal || null;
  const project = plain(o.project);
  const assets = arr(o.assets).length ? arr(o.assets) : arr(project && project.assets);
  const constraints = plain(o.constraints) || {};
  /** 進捗（呼び手が投げても落ちない） */
  const step = (v, stage) => {
    if (typeof o.onProgress === "function") { try { o.onProgress(clamp(finite(v, 0), 0, 1), { stage }); } catch (_e) { /* 進捗で落ちない */ } }
  };

  throwIfAborted(signal);
  step(0.05, "注文を読む");

  /* ① 注文（Intent）*/
  const intent = plain(o.intent) ? intentLike(o.intent)
    : await parseIntent(str(o.prompt), { assets, llm: o.llm, signal, template: o.template, project });
  /* 呼び手の縛り（UI の比率・尺の指定）は注文より強い */
  if (Object.prototype.hasOwnProperty.call(RATIOS, str(constraints.ratio))) intent.ratio = str(constraints.ratio);
  if (Number.isFinite(Number(constraints.targetDuration))) intent.targetDuration = clamp(Number(constraints.targetDuration), 1, 1800);
  if (PACING_IDS.indexOf(str(constraints.pacing)) >= 0) intent.pacing = str(constraints.pacing);
  if (intent.source === "llm") notes.push("注文は AI が読んだ");
  step(0.25, "素材を見る");
  throwIfAborted(signal);

  /* ② 端末内の案（LLM が駄目でもこれを返す）*/
  const local = planLocal(intent, assets, o.template || intent.style);
  const unanalyzed = assets.filter((a) => isVisual(a) && !plain(plain(a) && plain(a).analysis)).length;
  if (unanalyzed) notes.push(`${unanalyzed} 個の素材は未解析なので「普通」として扱った`);
  if (!local.segments.length) notes.push("使える映像の素材が無いので、締めの文字だけの案になった");

  const llm = plain(o.llm);
  if (!llm || typeof llm.json !== "function" || llm.available === false || !local.segments.length) {
    notes.push(llm && llm.available === false ? "AI に繋がらないので端末内で組んだ" : "端末内の決定論で組んだ");
    step(1, "でき上がり");
    return { plan: local, source: "local", notes, intent };
  }

  /* ③ LLM に Plan を書かせる → 検める → 直す */
  step(0.45, "AI が構成を考える");
  try {
    const user = [
      "注文: " + str(o.prompt || intent.goal).slice(0, 1200),
      "注文票(JSON): " + JSON.stringify({
        targetDuration: intent.targetDuration, ratio: intent.ratio, pacing: intent.pacing,
        style: intent.style, captions: intent.captions, colorLook: intent.colorLook,
        mustInclude: intent.mustInclude, avoid: intent.avoid, mood: intent.mood
      }),
      "素材:\n" + assetBrief(assets),
      "端末内の下書き（これより良くできるなら直して）: "
        + JSON.stringify({ pacing: local.pacing, segments: local.segments.length })
    ].join("\n\n");
    const got = await llm.json(
      [{ role: "system", content: planSystemPrompt() }, { role: "user", content: user }],
      { maxTokens: 2600, signal }
    );
    throwIfAborted(signal);
    step(0.8, "AI の案を検める");

    let plan = normalizePlanShape(Object.assign({ id: local.id, ratio: intent.ratio, targetDuration: intent.targetDuration }, got));
    let v = validatePlan(plan, { assets });
    if (!v.ok) {
      /* 使える素材を 1 つも指せていない案は「直す」意味が無い（repairPlan が
         planLocal で全部作り直すので、中身は端末内の案なのに source:"llm" と
         名乗ることになる）。ここで正直に端末内の案へ落とす。 */
      const known = new Set(assets.map((a) => str(plain(a) && plain(a).id)));
      if (!plan.segments.some((s) => known.has(str(s.assetId)))) {
        notes.push("AI の案が渡した素材を 1 つも指していないので端末内の案を使う");
        step(1, "でき上がり");
        return { plan: local, source: "local", notes, intent };
      }
      plan = repairPlan(plan, { assets, intent, template: o.template });
      const v2 = validatePlan(plan, { assets });
      notes.push(`AI の案を直した（${v.errors.length} 件の不整合）`);
      v = v2;
    }
    if (!v.ok) {
      notes.push("AI の案が直せなかったので端末内の案を使う: " + v.errors.slice(0, 3).map((e) => e.msg).join(" / "));
      step(1, "でき上がり");
      return { plan: local, source: "local", notes, intent };
    }
    for (const w of v.warnings.slice(0, 5)) notes.push(`注意: ${w.path} ${w.msg}`);
    notes.push("AI が構成を作った");
    step(1, "でき上がり");
    return { plan, source: "llm", notes, intent };
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    warn("ai/planner", "LLM の構成に失敗したので端末内で組む", e && e.message ? e.message : e);
    notes.push(`AI に頼れなかったので端末内で組んだ（${str(e && e.message).slice(0, 80)}）`);
    step(1, "でき上がり");
    return { plan: local, source: "local", notes, intent };
  }
}

/** UI が「型を選んだだけ」で使えるように（prompt 無しでも Plan を作る） */
export function planFromTemplate(templateId, assets, partialIntent) {
  const tpl = getTemplate(templateId);
  const it = Object.assign(parseIntentLocal("", { assets }),
    { style: tpl.id, targetDuration: tpl.targetDuration, pacing: tpl.pacing, colorLook: tpl.colorLook }, plain(partialIntent) || {});
  return planLocal(it, assets, tpl.id);
}
