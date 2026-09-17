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
     ・規則を足したら `say`（見本）も足す。試験が「見本は自分の規則に当たる」
       ことを見ているので、見本と test がずれると落ちる（＝ LLM の翻訳先が
       死んでいることに気付ける）。

   CONTRACT-NOTE: 共通前提は「1 ファイル 700 行で分割」だが、分割先
     （ai/refine/*.js）は担当外なので作れない。規則表（§C）が長さの大半なので、
     統合担当が分けるときは §C だけを `ai/refine-rules.js` に出し、
     `RULES` を import する形にすれば §D 以降はそのまま動く。
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
    test: /(\d+(?:\.\d+)?)\s*(?:倍|ばい)\s*(?:速|に|で|の速さ)?|半分の(?:速さ|スピード)|半速/,
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
  { id: "color.warm", group: "temp", say: "暖かい色にして", test: /暖色|暖か(く|い|め)|温か(く|い)|あたたか(く|い)|オレンジ寄り|黄色寄り/, build: (c) => scaleColor(c, "temperature", amount(c, 0.18), "暖かい色にしました") },
  { id: "color.cool", group: "temp", say: "冷たい色にして", test: /寒色|冷た(く|い|め)|つめた(く|い)|青寄り|クールな色|涼しげ/, build: (c) => scaleColor(c, "temperature", -amount(c, 0.18), "冷たい色にしました") },
  /* ── 音 ───────────────────────────────────────────────── */
  {
    id: "audio.bgm.down", group: "audio", say: "BGMを小さくして",
    test: /(bgm|ｂｇｍ|音楽|曲)[^。]{0,8}(小さ|下げ|抑え|絞|控え|薄く)/,
    build(c) {
      const tr = musicTrackOf(c.project);
      if (!tr) return null;
      const f = downFactor(c, 0.6);
      const vol = Math.round(clamp(finite(tr.volume, 1) * f, 0, 4) * 1000) / 1000;
      return { ops: [op("track.update", { trackId: str(tr.id), patch: { volume: vol } })], summary: `BGM を ${Math.round((1 - f) * 100)}% 小さくしました` };
    }
  },
  {
    id: "audio.bgm.up", group: "audio", say: "BGMを大きくして",
    test: /(bgm|ｂｇｍ|音楽|曲)[^。]{0,8}(大き|上げ|強め|しっかり)/,
    build(c) {
      const tr = musicTrackOf(c.project);
      if (!tr) return null;
      const f = upFactor(c, 1.3);
      const vol = Math.round(clamp(finite(tr.volume, 1) * f, 0, 4) * 1000) / 1000;
      return { ops: [op("track.update", { trackId: str(tr.id), patch: { volume: vol } })], summary: `BGM を ${Math.round((f - 1) * 100)}% 大きくしました` };
    }
  },
  {
    id: "audio.mute", group: "audio", say: "音を消して",
    test: /(音|音声|声)[^。]{0,6}(消|ミュート|切っ|無音|黙)/,
    build(c) {
      const list = c.pick(["video", "audio"]);
      if (!list.length) return null;
      return { ops: list.map((x) => op("clip.update", { clipId: str(x.clip.id), patch: { muteAudio: true } })), summary: `${list.length} 個のクリップの音を消しました` };
    }
  },
  {
    id: "audio.vol.down", group: "audio", say: "音量を下げて",
    test: /(音|音量|ボリューム|声)[^。]{0,8}(小さ|下げ|絞|抑え)/,
    build(c) {
      const list = c.pick(["video", "audio"]);
      if (!list.length) return null;
      const f = downFactor(c, 0.7);
      return {
        ops: list.map((x) => op("clip.update", { clipId: str(x.clip.id), patch: { volume: Math.round(clamp(finite(x.clip.volume, 1) * f, 0, 4) * 1000) / 1000 } })),
        summary: `音量を ${Math.round((1 - f) * 100)}% 下げました`
      };
    }
  },
  {
    id: "audio.vol.up", group: "audio", say: "音量を上げて",
    test: /(音|音量|ボリューム|声)[^。]{0,8}(大き|上げ|強め)/,
    build(c) {
      const list = c.pick(["video", "audio"]);
      if (!list.length) return null;
      const f = upFactor(c, 1.3);
      return {
        ops: list.map((x) => op("clip.update", { clipId: str(x.clip.id), patch: { volume: Math.round(clamp(finite(x.clip.volume, 1) * f, 0, 4) * 1000) / 1000 } })),
        summary: `音量を ${Math.round((f - 1) * 100)}% 上げました`
      };
    }
  },
  {
    id: "audio.fade", group: "fade", say: "フェードを付けて",
    test: /フェード|だんだん[^。]{0,4}(大きく|小さく)|余韻|じわっと|ゆっくり(消え|現れ)/,
    build(c) {
      const list = c.pick(["video", "audio", "image", "text"]);
      if (!list.length) return null;
      const sec = c.sec !== null ? clamp(c.sec, 0.1, 5) : 0.5;
      const ops = [];
      for (const x of list) {
        const D = Math.max(MIN_CLIP, finite(x.clip.duration, MIN_CLIP));
        const len = Math.min(sec, D * 0.45);
        const kind = str(x.clip.kind);
        if (kind === "video" || kind === "audio") {
          ops.push(op("clip.update", { clipId: str(x.clip.id), patch: { audioFade: { in: len, out: len } } }));
        } else {
          const base = clamp(finite(x.clip.opacity, 1), 0, 1) || 1;
          ops.push(op("key.add", { clipId: str(x.clip.id), path: "opacity", t: 0, v: 0, ease: "out" }));
          ops.push(op("key.add", { clipId: str(x.clip.id), path: "opacity", t: len, v: base, ease: "linear" }));
          ops.push(op("key.add", { clipId: str(x.clip.id), path: "opacity", t: Math.max(len + MIN_CLIP, D - len), v: base, ease: "in" }));
          ops.push(op("key.add", { clipId: str(x.clip.id), path: "opacity", t: D, v: 0, ease: "linear" }));
        }
      }
      if (!ops.length) return null;
      return { ops, summary: `${list.length} 個のクリップに ${s1(sec)} 秒のフェードを付けました` };
    }
  },
  /* ── つなぎ・カット ───────────────────────────────────── */
  {
    id: "trans.less", group: "trans", say: "トランジションを減らして",
    test: /(トランジション|切り替え|遷移|つなぎ|エフェクト)[^。]{0,8}(減ら|少なく|無く|なくし|やめ|消|いらな|要らな)|カットだけ|素のカット/,
    build(c) {
      const list = c.pick(null).filter((x) => x.clip.transitionIn || x.clip.transitionOut);
      if (!list.length) return null;
      return { ops: list.map((x) => op("clip.removeTransition", { clipId: str(x.clip.id) })), summary: `${list.length} か所のトランジションを外しました` };
    }
  },
  {
    id: "trans.more", group: "trans", say: "トランジションを増やして",
    test: /(トランジション|切り替え|遷移|つなぎ)[^。]{0,8}(増や|多く|足し|付け|入れ|滑らか|なめらか)/,
    build(c) {
      const clips = mainTrack(c);
      if (clips.length < 2) return null;
      const punchy = /激し|派手|強め|ぱっと|パンチ/.test(c.text);
      const type = punchy ? "zoomIn" : "crossfade";
      const ops = [];
      for (let i = 1; i < clips.length; i++) {
        if (Math.abs(finite(clips[i].start, 0) - clipEnd(clips[i - 1])) > 1e-3) continue;
        if (clips[i].transitionIn) continue;
        const room = Math.min(finite(clips[i - 1].duration, 0), finite(clips[i].duration, 0)) * 0.5;
        const dur = Math.min(punchy ? 0.2 : 0.4, room);
        if (dur < 0.08) continue;
        ops.push(op("clip.setTransition", { clipId: str(clips[i].id), edge: "in", type, duration: dur }));
      }
      if (!ops.length) return null;
      return { ops, summary: `${ops.length} か所にトランジションを入れました` };
    }
  },
  {
    id: "cut.more", group: "cut", say: "カットを増やして",
    test: /(カット|割り|刻み|クリップ)[^。]{0,8}(増や|細かく|多く)|細かく(割|切)|ぶつ切り/,
    build(c) {
      const list = c.pick(["video", "audio", "image"]).filter((x) => finite(x.clip.duration, 0) > MIN_CLIP * 4);
      if (!list.length) return null;
      return {
        ops: list.map((x) => op("clip.split", { clipId: str(x.clip.id), t: finite(x.clip.start, 0) + finite(x.clip.duration, 0) / 2 })),
        summary: `${list.length} 個のクリップを半分に割りました`
      };
    }
  },
  {
    id: "cut.less", group: "delete", say: "短いクリップを削除して",
    test: /(短い|細かい)(クリップ|カット)[^。]{0,8}(消|削|まとめ|減ら)|(カット|クリップ)[^。]{0,8}(減ら|少なく)/,
    build(c) {
      const list = c.pick(null);
      if (list.length < 2) return null;
      const thr = c.sec !== null ? c.sec : 0.8;
      const short = list.filter((x) => finite(x.clip.duration, 0) < thr);
      if (!short.length) return null;
      return { ops: [op("clip.rippleDelete", { clipIds: short.map((x) => str(x.clip.id)) })], summary: `${thr} 秒未満のクリップ ${short.length} 個を詰めて削除しました` };
    }
  },
  {
    id: "clip.delete", group: "delete", say: "この部分を削除して",
    test: /(削除|消して|消す|削って|抜いて|要らない|いらない|不要)/,
    build(c) {
      const list = !c.wantAll && c.selected.length ? c.selected : (/(この|これ|ここ|その)/.test(c.text) ? c.selected : []);
      if (!list.length) return null;
      return { ops: [op("clip.rippleDelete", { clipIds: list.map((x) => str(x.clip.id)) })], summary: `${list.length} 個のクリップを詰めて削除しました` };
    }
  },
  {
    id: "gap.close", group: "gaps", say: "隙間を詰めて",
    test: /(隙間|すきま|空白|間|スキマ|余白)[^。]{0,8}(詰め|消|無く|埋め|なくし)/,
    build(c) {
      const tracks = [];
      for (const x of c.all) if (tracks.indexOf(x.track) < 0) tracks.push(x.track);
      if (!tracks.length) return null;
      return { ops: tracks.map((t) => op("timeline.magneticClose", { trackId: str(t.id) })), summary: "隙間を詰めました" };
    }
  },
  {
    id: "order.reverse", group: "order", say: "順番を逆にして",
    test: /(順番|並び|順序|並べ方)[^。]{0,8}(逆|反転|入れ替え|逆さ)/,
    build(c) {
      const byTrack = new Map();
      for (const x of c.all) {
        if (!byTrack.has(x.track.id)) byTrack.set(x.track.id, []);
        byTrack.get(x.track.id).push(str(x.clip.id));
      }
      const ops = [];
      for (const [trackId, ids] of byTrack) {
        if (ids.length < 2) continue;
        ops.push(op("clip.reorder", { trackId, order: ids.slice().reverse() }));
      }
      if (!ops.length) return null;
      return { ops, summary: "クリップの順番を逆にしました" };
    }
  },
  /* ── 動き・変形 ───────────────────────────────────────── */
  {
    id: "zoom.off", group: "zoom", say: "ズームをやめて",
    test: /(ズーム|寄り|拡大)[^。]{0,8}(やめ|止め|消|無く|外|要らな|いらな|なくし)/,
    build(c) {
      const list = c.pick(null).filter((x) => plain(x.clip.keys) && arr(x.clip.keys["transform.scale"]).length);
      if (!list.length) return null;
      return {
        ops: list.map((x) => op("key.remove", { clipId: str(x.clip.id), path: "transform.scale", all: true })),
        summary: `${list.length} 個のクリップのズームを外しました`
      };
    }
  },
  {
    id: "zoom.on", group: "zoom", say: "ズームを入れて",
    test: /(ズーム|寄り|寄って|拡大|パンチ)[^。]{0,8}(入れ|付け|足し|追加|して)|動き[^。]{0,4}(付け|足)|ケンバーンズ/,
    build(c) {
      const list = c.pick(["video", "image"]);
      if (!list.length) return null;
      const add = amount(c, 0.1);
      const ops = [];
      for (const x of list) {
        const D = Math.max(MIN_CLIP, finite(x.clip.duration, MIN_CLIP));
        const base = Math.max(0.05, finite(x.clip.transform && x.clip.transform.scale, 1));
        ops.push(op("key.add", { clipId: str(x.clip.id), path: "transform.scale", t: 0, v: base, ease: "inout" }));
        ops.push(op("key.add", { clipId: str(x.clip.id), path: "transform.scale", t: D, v: Math.round(base * (1 + add) * 1000) / 1000, ease: "inout" }));
      }
      return { ops, summary: `${list.length} 個のクリップに +${Math.round(add * 100)}% のズームを入れました` };
    }
  },
  {
    id: "transform.rotate", group: "transform", say: "90度回転して",
    test: /(回転|傾け|傾き|向きを変え)|(\d+)\s*度/,
    build(c) {
      const list = c.pick(["video", "image", "text", "shape"]);
      if (!list.length) return null;
      const m = /(-?\d+(?:\.\d+)?)\s*度/.exec(c.text);
      const deg = m ? Number(m[1]) : (/左|反時計/.test(c.text) ? -90 : 90);
      if (!Number.isFinite(deg) || Math.abs(deg) < 0.5) return null;
      return {
        ops: list.map((x) => op("clip.setTransform", { clipId: str(x.clip.id), transform: { rotate: finite(x.clip.transform && x.clip.transform.rotate, 0) + deg } })),
        summary: `${list.length} 個のクリップを ${deg} 度回しました`
      };
    }
  },
  {
    id: "transform.center", group: "transform", say: "中央に寄せて",
    test: /(中央|真ん中|まんなか)[^。]{0,6}(寄せ|置|戻|合わせ)|位置[^。]{0,6}(戻|リセット)/,
    build(c) {
      const list = c.pick(["video", "image", "text", "shape"]);
      if (!list.length) return null;
      return {
        ops: list.map((x) => op("clip.setTransform", { clipId: str(x.clip.id), transform: { x: 0, y: 0 } })),
        summary: `${list.length} 個のクリップを中央に寄せました`
      };
    }
  },
  {
    id: "stabilize", group: "stab", say: "手ブレを直して",
    test: /手ブレ|手ぶれ|てぶれ|(ブレ|揺れ|ゆれ)[^。]{0,6}(直|補正|抑え|止め)/,
    build(c) {
      const list = c.pick(["video"]);
      if (!list.length) return null;
      const amt = c.pct !== null ? clamp(c.pct, 0.1, 1) : 0.6;
      return {
        ops: list.map((x) => op("clip.update", { clipId: str(x.clip.id), patch: { stabilize: { amount: amt, baked: false } } })),
        summary: `${list.length} 個のクリップに手ブレ補正（${Math.round(amt * 100)}%）を入れました`
      };
    }
  },
  {
    id: "play.reverse", group: "rev", say: "逆再生にして",
    test: /逆再生|逆回転|巻き戻|逆から|バックで/,
    build(c) {
      const list = c.pick(["video", "audio"]);
      if (!list.length) return null;
      return { ops: list.map((x) => op("clip.update", { clipId: str(x.clip.id), patch: { reverse: !x.clip.reverse } })), summary: `${list.length} 個のクリップを逆再生にしました` };
    }
  },
  {
    id: "play.freeze", group: "freeze", say: "静止させて",
    test: /静止|フリーズ|止め絵|一瞬止め/,
    build(c) {
      const list = c.pick(["video", "audio"]);
      if (!list.length) return null;
      const dur = c.sec !== null ? clamp(c.sec, 0.2, 10) : 2;
      const x = list[0];
      return {
        ops: [op("clip.freeze", { clipId: str(x.clip.id), t: finite(x.clip.start, 0) + finite(x.clip.duration, 0) / 2, duration: dur })],
        summary: `${s1(dur)} 秒の静止を入れました`
      };
    }
  },
  /* ── 画面の比率 ───────────────────────────────────────── */
  {
    id: "ratio.vertical", group: "ratio", say: "縦（9:16）にして",
    test: /9\s*:\s*16|縦(に|向き|長|動画|画面)|たて(に|向き)|ショート(に|向け|用)|tiktok|ティックトック|リール|reels?/,
    build(c) {
      if (str(c.project.settings && c.project.settings.ratio) === "9:16") return null;
      if (!Object.prototype.hasOwnProperty.call(RATIOS, "9:16")) return null;
      return { ops: [op("settings.update", { patch: { ratio: "9:16" } })], summary: "画面を縦（9:16）にしました" };
    }
  },
  {
    id: "ratio.horizontal", group: "ratio", say: "横（16:9）にして",
    test: /16\s*:\s*9|横(に|向き|長|動画|画面)|よこ(に|向き)|youtube|ユーチューブ|テレビ(用|向け)/,
    build(c) {
      if (str(c.project.settings && c.project.settings.ratio) === "16:9") return null;
      return { ops: [op("settings.update", { patch: { ratio: "16:9" } })], summary: "画面を横（16:9）にしました" };
    }
  },
  {
    id: "ratio.square", group: "ratio", say: "正方形（1:1）にして",
    test: /1\s*:\s*1|正方形|スクエア/,
    build(c) {
      if (str(c.project.settings && c.project.settings.ratio) === "1:1") return null;
      return { ops: [op("settings.update", { patch: { ratio: "1:1" } })], summary: "画面を正方形（1:1）にしました" };
    }
  },
  /* ── 印・章 ───────────────────────────────────────────── */
  {
    id: "chapter.add", group: "chapter", say: "チャプターを打って",
    test: /(チャプター|章|目次)[^。]{0,8}(打|付け|入れ|作)/,
    build(c) {
      const clips = mainTrack(c);
      if (!clips.length) return null;
      const minGap = c.sec !== null ? Math.max(1, c.sec) : 8;
      const have = arr(c.project.chapters).map((x) => finite(x.t, 0));
      const ops = [];
      let last = -Infinity, n = 0;
      for (const cl of clips) {
        const t = finite(cl.start, 0);
        if (t - last < minGap) continue;
        last = t;
        if (have.some((x) => Math.abs(x - t) < 0.5)) continue;
        n++;
        ops.push(op("chapter.add", { t, title: `チャプター ${n}` }));
      }
      if (!ops.length) return null;
      return { ops, summary: `チャプターを ${ops.length} 個打ちました` };
    }
  }
];

/** 規則の id 一覧（試験と画面のヘルプに使う） */
export const RULE_IDS = Object.freeze(RULES.map((r) => r.id));
/** LLM に見せる「言い換えの見本」（この言い方に直して返してもらう） */
export const RULE_PHRASES = Object.freeze(RULES.map((r) => r.say));

/* ══ §D 規則だけで ops を作る（pure・決定論）══════════════════════ */

/**
 * 追い注文 → ops（**pure・ネット不要**）。
 * 同じ `group` の規則は **最初に当たった 1 つだけ**が効く。
 * @param {string} prompt 「もっとテンポ速く」等
 * @param {{project?:Object, selection?:Object|string[]}} [ctx]
 * @returns {{ops:Op[], summary:string, matched:string[], warnings:string[]}}
 */
export function refineLocal(prompt, ctx) {
  const c = buildContext(prompt, ctx);
  const ops = [], notes = [], matched = [], warnings = [];
  if (!c.text) return { ops, summary: "注文が空です", matched, warnings };
  for (const rule of RULES) {
    if (c.used.has(rule.group)) continue;
    if (!rule.test.test(c.text)) continue;
    let r = null;
    try { r = rule.build(c); }
    catch (e) { warnings.push(`「${rule.say}」を当てられませんでした（${str(e && e.message)}）`); continue; }
    if (!r || !arr(r.ops).length) continue;
    for (const o of r.ops) ops.push(o);
    notes.push(str(r.summary));
    matched.push(rule.id);
    c.used.add(rule.group);
  }
  if (!ops.length) {
    return {
      ops, matched, warnings,
      summary: c.all.length ? "どうしたいのか読み取れませんでした（例: もっとテンポ速く / テロップを大きく / 最後を5秒短く）" : "先に素材をタイムラインへ置いてください"
    };
  }
  return { ops, summary: notes.join(" / "), matched, warnings };
}

/* ══ §E LLM を足す（読めなかった時だけ）══════════════════════════ */

const SYSTEM = [
  "あなたは動画編集ソフトの「注文の翻訳係」です。",
  "利用者の日本語の注文を、決められた言い方の並びへ言い換えます。",
  "編集そのものはしません。JSON だけを返してください。"
].join("");

/** LLM への頼み方（規則表の言い方だけを選ばせる） */
function askMessages(prompt, project) {
  const list = RULE_PHRASES.map((p, i) => `${i + 1}. ${p}`).join("\n");
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user", content: [
        `今の編集: ${explain(project)}`,
        `利用者の注文: ${str(prompt)}`,
        "次の言い方の中から、注文に当たる物だけを選んで並べてください（数や秒はそのまま書き換えて良い）:",
        list,
        'JSON: { "phrases": ["テロップを大きくして", "最後を5秒短くして"] }'
      ].join("\n")
    }
  ];
}

/**
 * 追い注文を ops にする（契約書 §6）。
 * 規則で読めれば通信しない。読めなかった時だけ LLM に言い換えてもらい、
 * **その言い換えをもう一度規則表に通す**（LLM に op を作らせない）。
 * @param {{prompt:string, project:Object, selection?:Object|string[],
 *          llm?:Object, signal?:AbortSignal}} args
 * @returns {Promise<{ops:Op[], summary:string, warnings:string[], source:"local"|"llm"|"none"}>}
 */
export async function refine(args) {
  const a = plain(args) || {};
  const prompt = str(a.prompt);
  const project = plain(a.project) || { tracks: [], assets: [], settings: {} };
  const local = refineLocal(prompt, { project, selection: a.selection });
  if (local.ops.length) return { ops: local.ops, summary: local.summary, warnings: local.warnings, source: "local" };

  const llm = plain(a.llm);
  const warnings = local.warnings.slice();
  if (!llm || llm.available === false || typeof llm.json !== "function") {
    return { ops: [], summary: local.summary, warnings, source: "none" };
  }
  try {
    const data = await llm.json(askMessages(prompt, project), '{ "phrases": ["..."] }', { signal: a.signal, maxTokens: 400 });
    const phrases = arr(plain(data) && plain(data).phrases).map(str).filter(Boolean).slice(0, 8);
    if (!phrases.length) return { ops: [], summary: local.summary, warnings, source: "none" };
    const again = refineLocal(phrases.join("。"), { project, selection: a.selection });
    if (!again.ops.length) {
      warnings.push("AI の言い換えでも読み取れませんでした");
      return { ops: [], summary: local.summary, warnings, source: "none" };
    }
    warnings.push(`AI が「${phrases.join(" / ")}」と読み替えました`);
    return { ops: again.ops, summary: again.summary, warnings: warnings.concat(again.warnings), source: "llm" };
  } catch (e) {
    if (e && (e.name === "AbortError" || /中止/.test(str(e.message)))) throw e;
    warnings.push(str(e && e.message) || "AI へ繋がりませんでした（端末内の規則だけで判断しました）");
    return { ops: [], summary: local.summary, warnings, source: "none" };
  }
}

/* ══ §F 今の編集内容を日本語で説明する ═══════════════════════════ */

/**
 * 今の編集内容を日本語 1 段落で説明する（画面にも LLM への文脈にも使う）。
 * @param {Object} project @returns {string}
 */
export function explain(project) {
  const p = plain(project);
  if (!p) return "まだ何も編集していません。";
  const s = plain(p.settings) || {};
  const parts = [];
  const name = str(p.name) || "無題のプロジェクト";
  const ratio = str(s.ratio) || "16:9";
  const fps = finite(s.fps, 30);
  const dur = (() => { try { return projectDuration(p); } catch (_e) { return 0; } })();
  parts.push(`「${name}」は ${ratio}・${Math.round(finite(s.width, 1920))}x${Math.round(finite(s.height, 1080))}・${fps}fps で、長さは ${s1(dur)} 秒`);

  const tracks = arr(p.tracks);
  const clips = [];
  for (const t of tracks) for (const cl of arr(t.clips)) clips.push({ track: t, clip: cl });
  if (!clips.length) return `${parts[0]}。まだクリップは置かれていません。`;

  const byKind = {};
  for (const x of clips) { const k = str(x.clip.kind); byKind[k] = (byKind[k] || 0) + 1; }
  const kindName = { video: "映像", image: "画像", audio: "音", text: "テロップ", shape: "図形", adjust: "調整", compound: "複合" };
  parts.push(`トラック ${tracks.length} 本・クリップ ${clips.length} 個（${Object.keys(byKind).map((k) => `${kindName[k] || k} ${byKind[k]}`).join("・")}）`);

  const texts = clips.filter((x) => str(x.clip.kind) === "text")
    .map((x) => str(x.clip.text && x.clip.text.content).split("\n")[0].trim()).filter(Boolean);
  if (texts.length) parts.push(`テロップは「${texts.slice(0, 3).join("」「")}」${texts.length > 3 ? ` ほか ${texts.length - 3} 件` : ""}`);

  const sped = clips.filter((x) => Math.abs(finite(x.clip.speed, 1) - 1) > 0.01 || x.clip.speedRamp);
  if (sped.length) parts.push(`速度を変えたクリップ ${sped.length} 個`);
  const reversed = clips.filter((x) => x.clip.reverse);
  if (reversed.length) parts.push(`逆再生 ${reversed.length} 個`);
  const graded = clips.filter((x) => plain(x.clip.color));
  if (graded.length) parts.push(`色を触ったクリップ ${graded.length} 個`);
  const trans = clips.filter((x) => x.clip.transitionIn || x.clip.transitionOut);
  if (trans.length) parts.push(`トランジション ${trans.length} か所`);
  let keys = 0;
  for (const x of clips) for (const k of Object.keys(plain(x.clip.keys) || {})) keys += arr(x.clip.keys[k]).length;
  if (keys) parts.push(`キーフレーム ${keys} 個`);

  const music = musicTrackOf(p);
  if (music) {
    const first = arr(music.clips)[0];
    const asset = first ? assetById(p, str(first.assetId)) : null;
    const label = asset && str(asset.name) ? str(asset.name) : str(music.name) || "BGM";
    parts.push(`BGM は「${label}」（音量 ${s1(finite(music.volume, 1) * 100)}%${music.muted ? "・消音中" : ""}）`);
  }
  const silent = clips.filter((x) => x.clip.muteAudio).length;
  if (silent) parts.push(`音を消したクリップ ${silent} 個`);
  if (arr(p.markers).length) parts.push(`印 ${arr(p.markers).length} 個`);
  if (arr(p.chapters).length) parts.push(`チャプター ${arr(p.chapters).length} 個`);
  const analysed = arr(p.assets).filter((a) => plain(a && a.analysis)).length;
  parts.push(`素材 ${arr(p.assets).length} 個（解析済み ${analysed} 個）`);
  return `${parts.join("。")}。`;
}
