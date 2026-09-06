/* ══════════════════════════════════════════════════════════════════════════
   VocabuSurvive の 世界

   訴え（2026-08-31・Rinty さん）「その後 ゲームの 世界観を つける」

   ★ 直す前は **世界が 無かった**。コース 30 本に 名前は あるが、
     なぜ そこを 走るのか・ここは どこなのかが どこにも 書いて いない。
     走る人は 「豆」だが、豆が 何者なのかも 決まって いない。

   ★ 芯に 置いた 話（1 行で 言える ものに する）:

       ── ことばの 種を 運んで、大樹まで 届ける。

     ・走る人は **ことばの 種**。頭の 芽は その 種が 芽を 出した もの。
     ・門は **ことばの 門**。知っている 人しか 開けない。
     ・走った ぶんだけ 種が 育つ。種 → 芽 → 双葉 → 若木 → つぼみ → 花 → 実 → 大樹。
     ・7 つの 地方を 抜けると 大樹に 着く。

   ★ 決めごと:
     ・**遊びの 邪魔を しない**。物語は 1 行ずつ。読まなくても 遊べる。
     ・地方は 既にある 難しさの 段（TIERS）と **1 対 1**。新しい 区切りを 作らない。
     ・育ちは 既にある XP から 引く。**新しい 数え物を 作らない。**
   ══════════════════════════════════════════════════════════════════════════ */

/** 遊びを 一行で。読み込み画面と 誘いの 文に 使う。 */
export const TAGLINE = "ことばの 種を 運んで、大樹まで。";
export const SUBTITLE = "走りながら 答える、8 人までの アスレチック。";

/* ── 7 つの 地方（難しさの 段と 1 対 1）───────────────────────────────
   key は data/courses.js の TIERS.key と 同じに する。ずれたら 出ない。 */
export const REGIONS = [
  {
    key: "tutorial", name: "はじまりの 野", short: "はじまり",
    lore: "種が いちばん 最初に 芽を 出す ところ。風は やさしく、道は 広い。",
    hint: "走る・跳ぶ・門を 通る。ここで 体が 覚える。",
    tint: [0.42, 0.78, 0.52]
  },
  {
    key: "normal", name: "かざみの 丘", short: "かざみ",
    lore: "ことばを 運ぶ 風が いつも 吹いている。押されて 転ぶ 種も いる。",
    hint: "床が 動く・棒が 回る。間合いを 読む。",
    tint: [0.96, 0.78, 0.34]
  },
  {
    key: "technical", name: "うつろいの 回廊", short: "うつろい",
    lore: "足元が 数えるほどの 間しか もたない。急ぐ ほど 消える。",
    hint: "消える 板・崩れる 橋・止まれない 氷。落ち着いて 見る。",
    tint: [0.40, 0.84, 0.94]
  },
  {
    key: "hard", name: "こだまの 谷", short: "こだま",
    lore: "叫ぶと 返って くる。返って きた ものが 前から 来る ことも ある。",
    hint: "同じ 動きが 何度も 来る。周期を 数える。",
    tint: [0.72, 0.52, 0.96]
  },
  {
    key: "veryhard", name: "まよいの 塔", short: "まよい",
    lore: "上へ 行くほど 道が 細く なる。落ちた 種は 下から やり直す。",
    hint: "細い 道・高い 段。一歩ずつ 確かめる。",
    tint: [0.98, 0.52, 0.44]
  },
  {
    key: "extreme", name: "さいはての 橋", short: "さいはて",
    lore: "世界の 端。ここを 渡れた 種だけが 大樹を 見る。",
    hint: "休む ところが 無い。ここまでの 全部を 使う。",
    tint: [1.0, 0.36, 0.42]
  },
  {
    key: "champion", name: "ことばの 大樹", short: "大樹",
    lore: "すべての 種が ここへ 帰る。運んだ ことばが 葉に なる。",
    hint: "最後の 1 本。ここに 着いたら もう 教える ことは 無い。",
    tint: [1.0, 0.84, 0.36]
  }
];

const BY_KEY = Object.create(null);
for (const r of REGIONS) BY_KEY[r.key] = r;

/** 難しさの 段の key から 地方を 引く。無ければ 最初の 地方。 */
export function regionOf(tierKey) { return BY_KEY[tierKey] || REGIONS[0]; }

/** コースの 番号（0 始まり）から 地方を 引く。TIERS と 同じ 区切り。 */
export function regionByIndex(index, TIERS) {
  if (!TIERS) return REGIONS[0];
  for (const t of TIERS) if (index >= t.from && index <= t.to) return regionOf(t.key);
  return REGIONS[0];
}

/* ── 種の 育ち ────────────────────────────────────────────────────────
   ★ **新しい 数え物を 作らない。** 既にある XP を そのまま 使う。
     XP は 1 試合で だいたい 40〜160 くらい 入る（既存の 決め方）。
   ★ 段は 8 つ。上へ 行くほど 遠く なるが、**最初の 3 つは すぐ 来る**
     （何も 起きない まま 数試合 走らせない）。 */
export const GROWTH = [
  { key: "seed",   name: "種",   at: 0,     art: "・", lore: "まだ 眠っている。" },
  { key: "sprout", name: "芽",   at: 120,   art: "ᛉ",  lore: "頭から 小さな 芽が 出た。" },
  { key: "leaf",   name: "双葉", at: 400,   art: "ᛉ",  lore: "葉が 2 枚。風の 向きが 分かる ように なった。" },
  { key: "young",  name: "若木", at: 1000,  art: "ᛉ",  lore: "背が 伸びた。遠くの 門が 見える。" },
  { key: "bud",    name: "つぼみ", at: 2200, art: "ᛉ", lore: "ことばが たまってきた。" },
  { key: "bloom",  name: "花",   at: 4200,  art: "ᛉ",  lore: "咲いた。走った 道が 色に なる。" },
  { key: "fruit",  name: "実",   at: 7600,  art: "ᛉ",  lore: "実が なった。次の 種が 入っている。" },
  { key: "tree",   name: "大樹", at: 13000, art: "ᛉ",  lore: "大樹に なった。ここから また 種が 出る。" }
];

/**
 * XP から 育ちを 引く。
 * @returns {{stage:object, index:number, next:object|null, toNext:number, ratio:number}}
 */
export function growthOf(xp) {
  const v = Math.max(0, Number(xp) || 0);
  let i = 0;
  for (let k = 0; k < GROWTH.length; k++) if (v >= GROWTH[k].at) i = k;
  const stage = GROWTH[i];
  const next = i + 1 < GROWTH.length ? GROWTH[i + 1] : null;
  const toNext = next ? Math.max(0, next.at - v) : 0;
  const ratio = next ? Math.min(1, (v - stage.at) / Math.max(1, next.at - stage.at)) : 1;
  return { stage, index: i, next, toNext, ratio };
}

/* ── 門の 呼び名 ─────────────────────────────────────────────────────
   「クイズの 門」は 作りの 言葉。遊びの 中では こちらを 使う。 */
export const GATE_NAME = "ことばの 門";
export const GATE_OPEN = "門が 開いた";
export const GATE_SHUT = "門が 重い";

/* ── 走る人の 呼び名 ─────────────────────────────────────────────── */
export const RUNNER_NAME = "たね";
export const RUNNER_PLURAL = "たねたち";

/* ── 育ちの 貯め場 ────────────────────────────────────────────────────
   ★ **新しい 決まりを 作らない。** 既に サーバが 数えている XP と 同じ 単位。
     ログインして いない 人でも 育つ ように、端末にも 覚えておく。
     ログインして いれば サーバの ほうが 大きい ので そちらを 使う。 */
const XP_KEY = "vq.survive.xp.v1";

export function localXP() {
  try { return Math.max(0, Number(localStorage.getItem(XP_KEY) || 0) || 0); } catch (e) { return 0; }
}
export function addXP(n) {
  const v = localXP() + Math.max(0, Number(n) || 0);
  try { localStorage.setItem(XP_KEY, String(v)); } catch (e) {}
  return v;
}
/** サーバの ぶんと 端末の ぶんの 大きい ほうを 使う。 */
export function totalXP(serverXP) {
  return Math.max(localXP(), Math.max(0, Number(serverXP) || 0));
}

/* ── ごほうび（かぶりもの）─────────────────────────────────────────────
   ★ 走り続ける 理由が 「順位」しか 無かった（2026-08-31・訴え「あそべる
     ゲームに する」）。順位は 上手い 人しか 嬉しくない。
     **育ちに つれて 手に 入る もの**を 置くと、遅い 人も 前へ 進める。
   ★ 決めごと:
     ・ごほうびは **見た目だけ**。速さにも 当たりにも 一切 効かせない。
       （効かせると 「この 帽子が 強い」に なって 全員 同じ 帽子に なる）
     ・最初から 4 つは 使える。何も 無い ところから 始めない。
     ・鍵は data/../game/bean.js の HATS の key と 同じ。ずれたら 出ない。 */
export const HAT_UNLOCK = {
  none: 0, cap: 0, ribbon: 0, antenna: 0,      /* はじめから（4 つ） */
  horn: 1, cloud: 1,        /* 芽 */
  phones: 2, star: 2,       /* 双葉 */
  party: 3, bolt: 3,        /* 若木 */
  donut: 4, flower: 4,      /* つぼみ */
  leafhat: 5,               /* 花 */
  halo: 6, tophat: 6,       /* 実 */
  crown: 7                  /* 大樹 */
};

/** その かぶりものが 使えるか。 */
export function hatOpen(key, xp) {
  const need = HAT_UNLOCK[key];
  if (need === undefined) return true;          /* 表に 無い ものは 止めない */
  return growthOf(totalXP(xp)).index >= need;
}
/** まだの ときに 出す 一言。 */
export function hatNeed(key) {
  const need = HAT_UNLOCK[key];
  if (!need) return "";
  const g = GROWTH[Math.min(need, GROWTH.length - 1)];
  return "「" + g.name + "」で 手に 入る";
}
/** 次に 手に 入る ものを 1 つ 返す（ロビーの 一言に 使う）。 */
export function nextReward(xp) {
  const now = growthOf(totalXP(xp));
  if (!now.next) return null;
  const i = now.index + 1;
  const keys = Object.keys(HAT_UNLOCK).filter((k) => HAT_UNLOCK[k] === i);
  if (!keys.length) return { stage: now.next, hats: [], toNext: now.toNext };
  return { stage: now.next, hats: keys, toNext: now.toNext };
}

/* ── 記章（コースごとの 目標タイム）───────────────────────────────────
   ★ ひとりで 走る 理由が 「自己ベスト」だけ だった。
     自己ベストは **前の 自分より 速いか**しか 言わないので、
     「この コースを どのくらい 分かって いるか」が 分からない。
   ★ 目標タイムを 3 段 置く。もとに するのは コースが 元から 持って いる
     estimatedDuration（設計の ときに 決めた 目安の 秒数）。
     **新しい 数を 手で 入れない。** 30 本 ぶん 手で 決めると 必ず ずれる。
   ★ 割合は 実測から:
       銅 … 目安 ちょうど（ゴールできれば だいたい 取れる）
       銀 … 目安の 0.86（まっすぐ 走れて 門も 通せる）
       金 … 目安の 0.74（近道と 加速を 使い切る）
   ★ 記章は **見た目だけ**。速さにも 順位にも 効かせない。 */
export const MEDALS = [
  { key: "bronze", name: "銅", ratio: 1.00, color: "#c58a5a" },
  { key: "silver", name: "銀", ratio: 0.86, color: "#b9c0cf" },
  { key: "gold",   name: "金", ratio: 0.74, color: "#e8c05a" }
];

/** そのコースの 目標タイム（秒）。速い順に [金, 銀, 銅]。 */
export function targetsOf(def) {
  const base = Math.max(20, Number(def && def.estimatedDuration) || 60);
  return {
    gold: Math.round(base * MEDALS[2].ratio),
    silver: Math.round(base * MEDALS[1].ratio),
    bronze: Math.round(base * MEDALS[0].ratio)
  };
}

/** タイムから 記章を 引く。取れて いなければ "" 。 */
export function medalOf(def, sec) {
  const t = Number(sec) || 0;
  if (t <= 0) return "";
  const g = targetsOf(def);
  if (t <= g.gold) return "gold";
  if (t <= g.silver) return "silver";
  if (t <= g.bronze) return "bronze";
  return "";
}

/** 次に 狙う 記章と 差（秒）。もう 金なら null。 */
export function nextMedal(def, sec) {
  const t = Number(sec) || 0;
  const g = targetsOf(def);
  if (t > 0 && t <= g.gold) return null;
  if (t > 0 && t <= g.silver) return { key: "gold", name: "金", need: g.gold, diff: Math.max(0, t - g.gold) };
  if (t > 0 && t <= g.bronze) return { key: "silver", name: "銀", need: g.silver, diff: Math.max(0, t - g.silver) };
  return { key: "bronze", name: "銅", need: g.bronze, diff: t > 0 ? Math.max(0, t - g.bronze) : 0 };
}

/** 手元に ある 自己ベスト（秒）。無ければ 0。 */
export function bestOf(courseId) {
  try { return Number(localStorage.getItem("vq.survive.best.v1:" + courseId) || 0) || 0; }
  catch (e) { return 0; }
}

/* ── れんぞく（毎日 走った 日数）───────────────────────────────────────
   ★ 「また 明日も 走ろう」と 思う 理由が 何も なかった。
     記章は いつでも 取れる、育ちは 積み上がる だけ。
     **切れると 惜しい もの**が 1 つ あると、明日 開く 理由に なる。
   ★ 決めごと:
     ・日付は **日本時間**で 数える（今日の コースと 同じ 数え方）。
       UTC で 数えると 朝 9 時に 日が 変わって 「昨日 走ったのに 切れた」に なる。
     ・**XP は いじらない。** 見えない 倍率を 掛けると 数字が 分からなく なる。
       れんぞくは それ 自体が ごほうび（切りたく ない ものを 1 つ 作る）。
     ・1 日 何回 走っても 1 日は 1 日。
     ・切れたら 1 から。**最高は 残す**（積み上げた ものを 消さない）。 */
const STREAK_KEY = "vq.survive.streak.v1";

/** 日本時間の 日付（YYYY-MM-DD）。 */
export function 今日(nowMs) {
  const d = new Date((nowMs === undefined ? Date.now() : nowMs) + 9 * 3600 * 1000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}
function 日付を数に(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return 0;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

/** いまの れんぞく。走らせ ずに 読むだけ。 */
export function streak(nowMs) {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(STREAK_KEY) || "null"); } catch (e) { v = null; }
  const 今 = 今日(nowMs);
  const n = v && v.n > 0 ? (v.n | 0) : 0;
  const best = v && v.best > 0 ? (v.best | 0) : 0;
  const last = v && v.last ? String(v.last) : "";
  const 差 = last ? (日付を数に(今) - 日付を数に(last)) : 999;
  /* 昨日までなら 続いている。2 日 以上 空いたら 切れている。 */
  const 生きている = 差 <= 1;
  return { n: 生きている ? n : 0, best, last, 今日: last === 今, 差 };
}

/**
 * 1 試合 走り終えた。れんぞくを 進める。
 * @returns {{n:number, best:number, 伸びた:boolean, 初日:boolean}}
 */
export function touchStreak(nowMs) {
  const 今 = 今日(nowMs);
  const s = streak(nowMs);
  if (s.今日) return { n: s.n, best: s.best, 伸びた: false, 初日: false };
  const n = s.n > 0 ? s.n + 1 : 1;
  const best = Math.max(n, s.best);
  try { localStorage.setItem(STREAK_KEY, JSON.stringify({ last: 今, n, best })); } catch (e) {}
  return { n, best, 伸びた: true, 初日: n === 1 };
}
