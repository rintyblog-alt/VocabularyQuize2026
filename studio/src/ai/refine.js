/* ══════════════════════════════════════════════════════════════════════
   ai/refine.js — 「もっとテンポ速く」等の追い注文を ops に変える所

   ★ 何をする所か
     ・`refineLocal(prompt, { project, selection })` … **pure・決定論・ネット不要**。
       日本語の規則表（§B の RULES・40 通り以上）で注文を読み、
       `core/ops.js` の op に落とす。倍率（1.5倍）・秒（5秒）・割合（20%）も拾う。
     ・`refine({ prompt, project, selection, llm })` … まず refineLocal を試し、
       **読めなかった時だけ** LLM に「規則表の言い方へ言い換えて」と頼み、
       返ってきた言い換えをもう一度 refineLocal に通す。
       ＝ LLM に op を作らせない（作らせると不変条件を壊す JSON が来る）。
     ・`explain(project)` … 今の編集内容を日本語で説明する（画面にも、
       LLM への文脈にも使う）。

   ★ なぜこの形か
     ・追い注文は「速く」「大きく」「短く」の 3 語で 8 割が済む。だから
       **規則表で足りる**。LLM は「言い方が想定外だった時の翻訳機」に留める。
     ・返す ops は tools.js と同じ `{ ops, summary, warnings }`。当て方は
       `store.batch(summary, (d) => { for (const o of ops) d(o.type, o.payload); })`。
     ・**例外を投げる op を作らない**のが規則表の責任。分割は MIN_CLIP を見て、
       キーの削除は「そのキーが在るクリップ」だけに出す（1 つでも throw すると
       batch が丸ごと巻き戻り、全部当たらない）。

   ★ 触るときの注意
     ・規則は `group` ごとに **最初に当たった 1 つだけ**が効く（「音楽を小さく」が
       BGM 規則と音量規則の両方で効いて二重に下がる、を防ぐ）。
     ・相手（対象）は「選択が在れば選択・無ければ全部」。文に「全部 / 全体」が
       在れば選択を無視して全部（人の言葉の方を信じる）。
     ・`refineLocal` に乱数・Date・DOM を入れない（試験が壊れる）。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, finite } from "../core/util.js";
import { MIN_CLIP, RATIOS, clipEnd, assetById, projectDuration } from "../core/schema.js";
import { normalizeJa } from "./intent.js";

const str = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const s1 = (n) => (Math.round(finite(n, 0) * 10) / 10).toFixed(1);

/** @typedef {{type:string, payload:Object}} Op */

/* ══ §A 数を拾う（pure）══════════════════════════════════════════ */

/** 「1.5倍」「2倍速」「半分」「倍」→ 倍率。無ければ null */
export function parseMultiplier(text) {
  const t = normalizeJa(text);
  const m = /(\d+(?:\.\d+)?)\s*(?:倍|ばい)/.exec(t);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v > 0) return clamp(v, 0.1, 8);
  }
  if (/半分|はんぶん|半減/.test(t)) return 0.5;
  if (/倍に|倍速|2つ分/.test(t)) return 2;
  return null;
}
/** 「20%」「２割」→ 割合（0.2）。無ければ null */
export function parsePercent(text) {
  const t = normalizeJa(text);
  let m = /(\d+(?:\.\d+)?)\s*(?:%|％|パーセント)/.exec(t);
  if (m) { const v = Number(m[1]); if (Number.isFinite(v)) return clamp(v / 100, 0, 4); }
  m = /(\d+(?:\.\d+)?)\s*割/.exec(t);
  if (m) { const v = Number(m[1]); if (Number.isFinite(v)) return clamp(v / 10, 0, 1); }
  return null;
}
/** 「5秒」「1分30秒」「1分半」→ 秒。無ければ null */
export function parseSeconds(text) {
  const t = normalizeJa(text);
  let m = /(\d+(?:\.\d+)?)\s*分\s*(\d+(?:\.\d+)?)\s*秒/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /(\d+(?:\.\d+)?)\s*分\s*半/.exec(t);
  if (m) return Number(m[1]) * 60 + 30;
  m = /(\d+(?:\.\d+)?)\s*秒/.exec(t);
  if (m) return Number(m[1]);
  m = /(\d+(?:\.\d+)?)\s*分/.exec(t);
  if (m) return Number(m[1]) * 60;
  return null;
}
/** 上げ方向の倍率（既定 1.25）。「20%」「1.5倍」を織り込む */
function upFactor(c, def = 1.25) {
  if (c.mul !== null) return c.mul >= 1 ? c.mul : 1 / c.mul;
  if (c.pct !== null) return clamp(1 + c.pct, 1.02, 4);
  return def;
}
/** 下げ方向の倍率（既定 0.8） */
function downFactor(c, def = 0.8) {
  if (c.mul !== null) return c.mul <= 1 ? c.mul : 1 / c.mul;
  if (c.pct !== null) return clamp(1 - c.pct, 0.05, 0.98);
  return def;
}
/** 色などの「足す量」（既定 0.15）。20% と言われたら 0.2 */
function amount(c, def = 0.15) {
  if (c.pct !== null) return clamp(c.pct, 0.02, 1);
  if (c.mul !== null) return clamp(Math.abs(c.mul - 1), 0.02, 1);
  return def;
}

/* ══ §B 文脈（相手を決める）══════════════════════════════════════ */

/** 選択（store.selection / 配列 / {clipIds}）を id の配列にする */
function selectionIds(selection) {
  if (Array.isArray(selection)) return selection.map(str).filter(Boolean);
  const s = plain(selection);
  if (!s) return [];
  if (Array.isArray(s.clipIds)) return s.clipIds.map(str).filter(Boolean);
  if (str(s.clipId)) return [str(s.clipId)];
  return [];
}

/** 文脈を 1 つ作る（規則表はこれだけを見る） */
function buildContext(prompt, ctx) {
  const c = plain(ctx) || {};
  const project = plain(c.project) || { tracks: [], assets: [], settings: {} };
  const raw = str(prompt);
  const text = normalizeJa(raw);
  const ids = selectionIds(c.selection !== undefined ? c.selection : c.selectionIds);
  const wantAll = /全部|全体|すべて|すべ て|ぜんぶ|全ての|みんな|通し/.test(text);
  /** @type {{track:Object, clip:Object}[]} */
  const all = [];
  for (const track of arr(project.tracks)) {
    if (!track || track.locked) continue;
    for (const clip of arr(track.clips).slice().sort((a, b) => finite(a.start, 0) - finite(b.start, 0))) {
      if (clip && !clip.locked) all.push({ track, clip });
    }
  }
  const selected = ids.length ? all.filter((x) => ids.indexOf(str(x.clip.id)) >= 0) : [];
  return {
    project, raw, text,
    mul: parseMultiplier(text), pct: parsePercent(text), sec: parseSeconds(text),
    ids, wantAll, all, selected,
    used: new Set(),
    /** 触る相手（kinds で絞る）*/
    pick(kinds) {
      const base = !this.wantAll && this.selected.length ? this.selected : this.all;
      const set = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
      return set ? base.filter((x) => set.has(str(x.clip.kind))) : base;
    }
  };
}

const op = (type, payload) => ({ type, payload });

/** 映像トラックの中で一番クリップが多い物（「最後」「最初」の基準） */
function mainTrack(c) {
  const tracks = new Map();
  for (const x of c.all) {
    if (!tracks.has(x.track.id)) tracks.set(x.track.id, []);
    tracks.get(x.track.id).push(x.clip);
  }
  let best = null;
  for (const [id, clips] of tracks) {
    const kind = str((c.all.find((x) => str(x.track.id) === id) || {}).track.kind);
    const score = clips.length + (kind === "video" ? 100 : 0);
    if (!best || score > best.score) best = { id, clips, score };
  }
  return best ? best.clips : [];
}
/** BGM らしいトラック */
function musicTrackOf(project) {
  const audio = arr(project && project.tracks).filter((t) => t && str(t.kind) === "audio" && arr(t.clips).length);
  if (!audio.length) return null;
  const named = audio.find((t) => /bgm|music|音楽|曲/i.test(str(t.name)));
  if (named) return named;
  const total = (t) => arr(t.clips).reduce((a, x) => a + Math.max(0, finite(x.duration, 0)), 0);
  return audio.slice().sort((a, b) => total(b) - total(a))[0];
}
/** 今の値に掛け算して patch を作る（相対の注文はこれで足りる） */
function scaleColor(c, key, delta, label) {
  const list = c.pick(["video", "image", "adjust"]);
  if (!list.length) return null;
  const ops = list.map((x) => {
    const cur = finite(x.clip.color && x.clip.color[key], 0);
    const color = {};
    color[key] = Math.round(clamp(cur + delta, -1, 1) * 1000) / 1000;
    return op("clip.setColor", { clipId: str(x.clip.id), color });
  });
  return { ops, summary: `${list.length} 個のクリップを${label}` };
}

/* ══ §C 規則表（40 通り以上。`say` は LLM に見せる言い換えの見本）══ */

/**
 * @type {{id:string, group:string, say:string, test:RegExp,
 *         build:(c:Object)=>{ops:Op[],summary:string}|null}[]}
 */
export const RULES = [
  /* ── 速度 ─────────────────────────────────────────────── */
  {
    id: "speed.exact", group: "speed", say: "1.5倍速にして",
    test: /(\d+(?:\.\d+)?)\s*(?:倍|ばい)\s*(?:速|に|で|の速さ)?/,
    build(c) {
      if (c.mul === null) return null;
      const slow = /(ゆっくり|遅く|スロー)/.test(c.text);
      const sp = slow && c.mul > 1 ? 1 / c.mul : c.mul;
      const list = c.pick(["video", "audio"]);
      if (!list.length) return null;
      return {
        ops: list.map((x) => op("clip.setSpeed", { clipId: str(x.clip.id), speed: clamp(finite(x.clip.speed, 1) === 1 ? sp : sp, 0.1, 8), ripple: true })),
        summary: `${list.length} 個のクリップを ${s1(sp)} 倍速にしました`
      };
    }
  },
  {
    id: "speed.up", group: "speed", say: "テンポを速くして",
    test: /(テンポ|速度|スピード|再生)[^。]{0,6}(速く|早く|はやく|上げ|アップ)|もっと(速く|早く|はやく)|(速く|早く)して|サクサク|きびきび/,
    build(c) {
      const f = upFactor(c, 1.25);
      const list = c.pick(["video", "audio"]);
      if (!list.length) return null;
      return {
        ops: list.map((x) => op("clip.setSpeed", { clipId: str(x.clip.id), speed: clamp(finite(x.clip.speed, 1) * f, 0.1, 8), ripple: true })),
        summary: `テンポを ${Math.round((f - 1) * 100)}% 速くしました`
      };
    }
  },
  {
    id: "speed.down", group: "speed", say: "ゆっくりにして",
    test: /(ゆっくり|遅く|おそく|スロー|スローモー)|(テンポ|速度|スピード)[^。]{0,6}(下げ|落と|遅)/,
    build(c) {
      const f = downFactor(c, 0.8);
      const list = c.pick(["video", "audio"]);
      if (!list.length) return null;
      return {
        ops: list.map((x) => op("clip.setSpeed", { clipId: str(x.clip.id), speed: clamp(finite(x.clip.speed, 1) * f, 0.1, 8), ripple: true })),
        summary: `${list.length} 個のクリップを ${s1(f)} 倍の速さにしました`
      };
    }
  },
  /* ── 尺 ───────────────────────────────────────────────── */
  {
    id: "dur.end.short", group: "dur", say: "最後を5秒短くして",
    test: /(最後|終わり|ラスト|末尾|後ろ)[^。]{0,10}(短く|詰め|削|カット|切|減ら)/,
    build(c) {
      const clips = mainTrack(c);
      if (!clips.length) return null;
      const last = clips[clips.length - 1];
      const sec = c.sec !== null ? c.sec : Math.min(2, Math.max(MIN_CLIP, finite(last.duration, 0) * 0.2));
      const delta = Math.min(sec, Math.max(0, finite(last.duration, 0) - MIN_CLIP));
      if (!(delta > 1e-3)) return null;
      return { ops: [op("clip.trim", { clipId: str(last.id), edge: "end", delta, ripple: true })], summary: `最後を ${s1(delta)} 秒短くしました` };
    }
  },
  {
    id: "dur.end.long", group: "dur", say: "最後を5秒長くして",
    test: /(最後|終わり|ラスト|末尾)[^。]{0,10}(長く|伸ば|延ば|足し|増や)/,
    build(c) {
      const clips = mainTrack(c);
      if (!clips.length) return null;
      const last = clips[clips.length - 1];
      const sec = c.sec !== null ? c.sec : 2;
      return { ops: [op("clip.trim", { clipId: str(last.id), edge: "end", delta: -sec, ripple: true })], summary: `最後を ${s1(sec)} 秒伸ばしました（素材の端で止まります）` };
    }
  },
  {
    id: "dur.start.short", group: "dur", say: "最初を3秒短くして",
    test: /(最初|冒頭|頭|先頭|出だし)[^。]{0,10}(短く|詰め|削|カット|切|減ら)/,
    build(c) {
      const clips = mainTrack(c);
      if (!clips.length) return null;
      const first = clips[0];
      const sec = c.sec !== null ? c.sec : Math.min(2, Math.max(MIN_CLIP, finite(first.duration, 0) * 0.2));
      const delta = Math.min(sec, Math.max(0, finite(first.duration, 0) - MIN_CLIP));
      if (!(delta > 1e-3)) return null;
      return { ops: [op("clip.trim", { clipId: str(first.id), edge: "start", delta, ripple: true })], summary: `最初を ${s1(delta)} 秒短くしました` };
    }
  },
  {
    id: "dur.total", group: "dur", say: "全体を30秒にして",
    test: /(全体|全部|通し|尺|長さ)[^。]{0,8}\d+(?:\.\d+)?\s*(?:秒|分)[^。]{0,4}(に|へ|で|まで|以内)/,
    build(c) {
      if (c.sec === null || !(c.sec > 0)) return null;
      const clips = mainTrack(c);
      if (!clips.length) return null;
      const total = clips.reduce((a, x) => Math.max(a, clipEnd(x)), 0);
      let over = total - c.sec;
      if (Math.abs(over) < 0.05) return null;
      const ops = [];
      if (over > 0) {
        for (let i = clips.length - 1; i >= 0 && over > 1e-3; i--) {
          const room = Math.max(0, finite(clips[i].duration, 0) - MIN_CLIP);
          const cut = Math.min(room, over);
          if (cut > 1e-3) { ops.push(op("clip.trim", { clipId: str(clips[i].id), edge: "end", delta: cut, ripple: true })); over -= cut; }
        }
      } else {
        ops.push(op("clip.trim", { clipId: str(clips[clips.length - 1].id), edge: "end", delta: over, ripple: true }));
      }
      if (!ops.length) return null;
      return { ops, summary: `全体を ${s1(c.sec)} 秒に合わせました` };
    }
  },
  {
    id: "dur.even", group: "even", say: "長さをそろえて",
    test: /(長さ|尺)[^。]{0,8}(そろえ|揃え|統一|同じ|均等)/,
    build(c) {
      const list = c.pick(["video", "image", "audio", "text", "shape"]);
      if (list.length < 2) return null;
      const durs = list.map((x) => Math.max(MIN_CLIP, finite(x.clip.duration, MIN_CLIP)));
      const want = c.sec !== null && c.sec > 0 ? c.sec : durs.reduce((a, b) => a + b, 0) / durs.length;
      const ops = [];
      for (const x of list) {
        const delta = Math.max(MIN_CLIP, finite(x.clip.duration, MIN_CLIP)) - want;
        if (Math.abs(delta) > 1e-3) ops.push(op("clip.trim", { clipId: str(x.clip.id), edge: "end", delta, ripple: true }));
      }
      if (!ops.length) return null;
      return { ops, summary: `${ops.length} 個のクリップを ${s1(want)} 秒にそろえました` };
    }
  },
  /* ── テロップ ─────────────────────────────────────────── */
  {
    id: "telop.size.up", group: "telopSize", say: "テロップを大きくして",
    test: /(テロップ|字幕|文字|テキスト|タイトル)[^。]{0,8}(大き|でか|拡大|太く)/,
    build(c) {
      const list = c.pick(["text"]);
      if (!list.length) return null;
      const f = upFactor(c, 1.25);
      return {
        ops: list.map((x) => {
          const cur = finite(x.clip.text && x.clip.text.style && x.clip.text.style.size, 64);
          return op("clip.setText", { clipId: str(x.clip.id), patch: { style: { size: Math.round(clamp(cur * f, 8, 400)) } } });
        }),
        summary: `テロップを ${Math.round((f - 1) * 100)}% 大きくしました`
      };
    }
  },
  {
    id: "telop.size.down", group: "telopSize", say: "テロップを小さくして",
    test: /(テロップ|字幕|文字|テキスト|タイトル)[^。]{0,8}(小さ|縮小|細く)/,
    build(c) {
      const list = c.pick(["text"]);
      if (!list.length) return null;
      const f = downFactor(c, 0.8);
      return {
        ops: list.map((x) => {
          const cur = finite(x.clip.text && x.clip.text.style && x.clip.text.style.size, 64);
          return op("clip.setText", { clipId: str(x.clip.id), patch: { style: { size: Math.round(clamp(cur * f, 8, 400)) } } });
        }),
        summary: `テロップを ${Math.round((1 - f) * 100)}% 小さくしました`
      };
    }
  },
  {
    id: "telop.color", group: "telopColor", say: "テロップを白くして",
    test: /(テロップ|字幕|文字|テキスト|タイトル)[^。]{0,8}(白|黒|赤|青|黄|緑|桃|ピンク|橙|オレンジ|紫)/,
    build(c) {
      const list = c.pick(["text"]);
      if (!list.length) return null;
      const table = [[/白/, "#ffffff", "白"], [/黒/, "#111111", "黒"], [/赤/, "#ff4d4d", "赤"],
        [/青/, "#4d8cff", "青"], [/黄/, "#ffd84d", "黄"], [/緑/, "#4ddb7a", "緑"],
        [/桃|ピンク/, "#ff7ab8", "ピンク"], [/橙|オレンジ/, "#ff9a3c", "オレンジ"], [/紫/, "#b47aff", "紫"]];
      const hit = table.find((t) => t[0].test(c.text));
      if (!hit) return null;
      return {
        ops: list.map((x) => op("clip.setText", { clipId: str(x.clip.id), patch: { style: { color: hit[1] } } })),
        summary: `テロップを${hit[2]}にしました`
      };
    }
  },
  {
    id: "telop.pos", group: "telopPos", say: "テロップを下に寄せて",
    test: /(テロップ|字幕|文字|テキスト)[^。]{0,8}(下|上|中央|真ん中|まんなか)[^。]{0,4}(に|へ|寄せ|表示)/,
    build(c) {
      const list = c.pick(["text"]);
      if (!list.length) return null;
      const v = /真ん中|まんなか|中央/.test(c.text) ? "middle" : (/上/.test(c.text) ? "top" : "bottom");
      const label = v === "middle" ? "中央" : (v === "top" ? "上" : "下");
      return {
        ops: list.map((x) => op("clip.setText", { clipId: str(x.clip.id), patch: { layout: { vAlign: v } } })),
        summary: `テロップを${label}に寄せました`
      };
    }
  },
  /* ── 色 ───────────────────────────────────────────────── */
  {
    id: "color.mono", group: "sat", say: "白黒にして",
    test: /白黒|モノクロ|グレースケール|色を抜/,
    build(c) {
      const list = c.pick(["video", "image", "adjust"]);
      if (!list.length) return null;
      return { ops: list.map((x) => op("clip.setColor", { clipId: str(x.clip.id), color: { saturation: -1 } })), summary: "白黒にしました" };
    }
  },
  { id: "color.bright.up", group: "exposure", say: "明るくして", test: /明るく|明るめ|明度[^。]{0,4}(上げ|高く)|暗いので/, build: (c) => scaleColor(c, "exposure", amount(c, 0.15), "明るくしました") },
  { id: "color.bright.down", group: "exposure", say: "暗くして", test: /暗く|暗め|明度[^。]{0,4}(下げ|低く)|明るすぎ/, build: (c) => scaleColor(c, "exposure", -amount(c, 0.15), "暗くしました") },
  { id: "color.sat.up", group: "sat", say: "鮮やかにして", test: /鮮やか|彩度[^。]{0,6}(上げ|高く|強く)|色[^。]{0,4}(濃く|強く)|ビビッド/, build: (c) => scaleColor(c, "saturation", amount(c, 0.18), "鮮やかにしました") },
  { id: "color.sat.down", group: "sat", say: "彩度を下げて", test: /彩度[^。]{0,6}(下げ|低く|弱く)|色[^。]{0,4}(薄く|抑え)|淡く|落ち着いた色/, build: (c) => scaleColor(c, "saturation", -amount(c, 0.18), "彩度を下げました") },
  { id: "color.contrast.up", group: "contrast", say: "コントラストを上げて", test: /コントラスト[^。]{0,6}(上げ|高く|強く)|メリハリ|はっきり/, build: (c) => scaleColor(c, "contrast", amount(c, 0.15), "コントラストを上げました") },
  { id: "color.contrast.down", group: "contrast", say: "コントラストを下げて", test: /コントラスト[^。]{0,6}(下げ|低く|弱く)|眠く|やわらか/, build: (c) => scaleColor(c, "contrast", -amount(c, 0.12), "コントラストを下げました") },
  { id: "color.warm", group: "temp", say: "暖かい色にして", test: /暖色|暖かく|温かく|あたたかく|オレンジ寄り|黄色寄り/, build: (c) => scaleColor(c, "temperature", amount(c, 0.18), "暖かい色にしました") },
  { id: "color.cool", group: "temp", say: "冷たい色にして", test: /寒色|冷たく|つめたく|青寄り|クールな色|涼しげ/, build: (c) => scaleColor(c, "temperature", -amount(c, 0.18), "冷たい色にしました") },
