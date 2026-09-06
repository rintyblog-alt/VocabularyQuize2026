/* ══════════════════════════════════════════════════════════════════════════
   遊んだ ぶんを **本体の 学習の 記録へ 積む**。

   ★ 直す前は、VocabuSurvive で 何十問 答えても
     **ホームにも Insight にも 1 つも 残らなかった**（2026-08-31 に 気づいた）。
     この アプリは 学ぶ ための ものなので、
     「遊んだら 何も 積み上がらない」は 遊びの 側の 損でも ある。

   ★ つなぐ 先は 本体の `VQ2.learning`（学習データの 統合）。
     すでに クイズ・Quick Mock・VocabuSpeak が 通っている 同じ 口。
     ここでは **形を そろえて 渡すだけ**。数え方は 一切 作らない。

   ★ 決めごと:
     ・本体が 無い ときは **何も しない**（この 画面 単体でも 動く ように）
     ・二重に 数えない（id は 試合ごとに 1 つ。渡し直しても 1 本に まとまる）
     ・答えの 中身（選んだ 語）は 送らない。正誤・時間・形式だけ
     ・**「その他」に しない。** 出どころの 名前を 実行時に 登録する
       （本体の 一覧は 参照で 出て いるので、足すだけで 名前が 出る）
   ══════════════════════════════════════════════════════════════════════════ */

const SOURCE = "vocabusurvive";
const LABEL = "VocabuSurvive";
/* ★ 本体の 道具（vq2-app 4.6MB）は **あとから 読まれる**。
   最初に この 画面を 開いた 人は、走り終えた ときに まだ 来て いない ことが ある。
   そのときは いったん ここへ 置いて、次に 来た ときに 流す。
   （消えても 遊びは 壊れない ので、失敗しても 何も 言わない） */
const 待ち行列 = "vq.survive.learnq.v1";
const 上限 = 20;

/** 本体の 学習の 口。無ければ null。 */
function 口() {
  try {
    const L = (typeof window !== "undefined") && window.VQ2 && window.VQ2.learning;
    return (L && typeof L.recordResult === "function") ? L : null;
  } catch (e) { return null; }
}

/** 出どころの 名前を 登録する（1 回だけ）。 */
function 名前を出す(L) {
  try {
    if (L.SOURCES && !L.SOURCES[SOURCE]) L.SOURCES[SOURCE] = LABEL;
  } catch (e) {}
}

/** 遊び方 → 本体の 言い方。無い ものは normal。 */
const MODE = {
  race: "normal", timeattack: "time_attack", survival: "survival",
  quizrush: "practice", team: "normal", cup: "normal"
};

/**
 * 1 試合ぶんを 積む。
 * @param {object} o
 *   id        試合の 通し番号（同じ ものを 2 度 渡しても 1 本に なる）
 *   courseId, courseName, mode
 *   startedAt, finishedAt  ミリ秒
 *   answers   [{ word, ok, ms, choice }]  ※ word は 出題の 見出し
 *   subject   分かって いれば（内蔵の 単語は 英語）
 * @returns {{ok:boolean, why?:string}}
 */
export function 積む(o) {
  const list = (o && o.answers) || [];
  if (!list.length) return { ok: false, why: "答えが ない" };
  const L = 口();
  if (L) 名前を出す(L);

  const sid = "vs_" + String(o.courseId || "c") + "_" + String(o.id || Date.now());
  const items = [];
  const snaps = [];
  list.forEach((a, i) => {
    const qid = sid + "_q" + i;
    items.push({
      questionId: qid,
      type: "choice4",
      answered: true,
      correct: !!a.ok,
      score: a.ok ? 1 : 0,
      maxScore: 1,
      timeMs: Math.max(0, Math.round(a.ms || 0))
    });
    snaps.push({
      id: qid,
      type: "choice4",
      subject: o.subject || null,
      /* ★ 単元は **分からない**。分からない ものを 作らない。 */
      unit: null,
      /* 見出しだけ 残す（答えの 中身は 送らない）。 */
      metadata: { prompt: String(a.word || "").slice(0, 60) }
    });
  });

  const result = {
    id: sid,
    source: SOURCE,
    mode: MODE[String(o.mode || "race")] || "normal",
    title: String(o.courseName || "VocabuSurvive"),
    subject: o.subject || null,
    startedAt: new Date(o.startedAt || (Date.now() - 60000)).toISOString(),
    finishedAt: new Date(o.finishedAt || Date.now()).toISOString(),
    items,
    questionsSnapshot: snaps
  };
  if (!L) {
    /* 本体が まだ 来て いない。置いて おいて、次に 開いた ときに 流す。 */
    置く(result, o.subject);
    return { ok: false, why: "本体が いない（置いた）", 置いた: true };
  }
  const r = 渡す(L, result, o.subject);
  if (!r.ok) 置く(result, o.subject);
  return r;
}

function 渡す(L, result, subject) {
  try {
    const r = L.recordResult(result, { source: SOURCE, subject: subject || undefined });
    return { ok: !!(r && r.ok !== false), why: r && r.error };
  } catch (e) {
    /* ★ ここで 遊びを 止めない。積めなくても 走れる ことの ほうが 大事。 */
    return { ok: false, why: String(e && e.message || e) };
  }
}

/* ── あとで 流す ため の 置き場 ────────────────────────────────────── */
function 読む() {
  try { const v = JSON.parse(localStorage.getItem(待ち行列) || "[]"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function 書く(a) {
  try { localStorage.setItem(待ち行列, JSON.stringify(a.slice(-上限))); } catch (e) {}
}
function 置く(result, subject) {
  const a = 読む();
  /* 同じ 試合は 1 つだけ（二重に 数えない）。 */
  if (a.some((x) => x && x.r && x.r.id === result.id)) return;
  a.push({ r: result, s: subject || null });
  書く(a);
}

/**
 * 置いて あった ぶんを 流す。本体が いなければ 何も しない。
 * 開いた とき と 走り終えた ときに 呼ぶ。
 * @returns {{流した:number, 残り:number}}
 */
export function 流す() {
  const L = 口();
  const a = 読む();
  if (!L || !a.length) return { 流した: 0, 残り: a.length };
  名前を出す(L);
  let n = 0;
  const 残 = [];
  for (const it of a) {
    if (!it || !it.r) continue;
    const r = 渡す(L, it.r, it.s);
    if (r.ok) n++; else 残.push(it);
  }
  書く(残);
  return { 流した: n, 残り: 残.length };
}

/** 置いて ある 数（検査に 使う）。 */
export function 待ちの数() { return 読む().length; }

/** 積める 状態か（検査と 画面の 表示に 使う）。 */
export function 積めるか() { return !!口(); }
export const 出どころ = SOURCE;
