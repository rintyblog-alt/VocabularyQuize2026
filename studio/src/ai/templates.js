/* ══════════════════════════════════════════════════════════════════════
   ai/templates.js — 自動編集の「型（テンプレート）」の台帳

   ★ 何をする所か
     ・「旅行 Vlog」「商品紹介」「解説」…といった **編集の型**を 1 つの表
       （`TEMPLATES`）に集める。型は「目標尺・1 ショットの長さ・テンポ・
       使う遷移・テロップの見せ方・色・BGM の強さ・細かい規則」の束。
     ・色の見た目（`COLOR_LOOKS`）とテロップの体裁（`TEXT_PRESETS`）も
       ここに置く。planner が型を選び、resolve が **秒と px** に落とす。

   ★ なぜこの形か
     ・型を data（ただの object）にしておくと、planner / resolve / UI が
       同じ表を見るだけで揃う。関数にすると 3 か所で解釈が食い違う。
     ・**秒を決めるのは resolve だけ**（契約書 §6）。だからここに在る数字は
       「目標」と「割合」に留め、px と絶対秒へは resolve が変換する。
       唯一の例外は文字の出入りアニメの長さ（clip の中の見せ方で、
       タイムラインの位置ではない）。
     ・`style` は契約書 §6 の Plan.style（7 種）へ寄せる別の鍵にした。
       型は 16 個在るが、Plan に書けるのは契約の 7 種だけなので、
       型 → style の対応表をここが持つ（planner が迷わない）。

   ★ 触るときの注意
     ・型を足すのは自由だが `style` は §6 の 7 種から選ぶ（増やすと
       validatePlan が warning を出す）。
     ・`textPreset` と `colorLook` は必ずこのファイルに在る id にする
       （無い id は既定へ落ちるが、見た目が黙って変わるので気付きにくい）。
     ・数値は「-1..1 の効き」か「0..1 の割合」か「秒」か を必ず名前で
       分かるようにする（…Rel は割合、…Duration は秒）。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, finite } from "../core/util.js";

/* ══ §A テンポと 1 ショットの長さ ══════════════════════════════════ */

/** Plan.pacing に書ける値（契約書 §6） */
export const PACING_IDS = Object.freeze(["slow", "medium", "fast", "beat"]);

/**
 * テンポ → 1 ショットの長さ（秒）。契約の指定そのまま。
 * "beat" は拍に合わせるので、ここでは「拍が分からなかったときの代わり」。
 */
export const PACING_SHOT = Object.freeze({ slow: 3.5, medium: 2.2, fast: 1.2, beat: 2.0 });

/** 拍に合わせるときの 1 ショット = 何拍（4 拍 = 1 小節） */
export const BEATS_PER_SHOT = 4;

/**
 * テンポから 1 ショットの長さを出す（pure）。
 * beat は bpm が分かれば 1 小節、分からなければ PACING_SHOT.beat。
 * @param {string} pacing @param {number|null} [bpm]
 * @returns {number} 秒
 */
export function shotLengthFor(pacing, bpm) {
  const p = PACING_IDS.indexOf(String(pacing)) >= 0 ? String(pacing) : "medium";
  if (p !== "beat") return PACING_SHOT[p];
  const b = finite(bpm, 0);
  if (!(b >= 40 && b <= 240)) return PACING_SHOT.beat;
  return clamp((60 / b) * BEATS_PER_SHOT, 0.8, 4.5);
}

/* ══ §B 色の見た目（Partial<ColorGrade>）══════════════════════════
   値は core/schema.js の ColorGrade の数値キーと同じ意味（0 = 何もしない）。
   ここに無いキーは触らない = 素材そのまま。 */

/** @type {Record<string, Object|null>} */
export const COLOR_LOOKS = Object.freeze({
  none: null,
  natural:   Object.freeze({ contrast: 0.04, saturation: 0.05 }),
  cinematic: Object.freeze({ contrast: 0.18, saturation: -0.06, shadows: -0.12, highlights: -0.06, temperature: -0.04, vignette: 0.18, fade: 0.06 }),
  vivid:     Object.freeze({ saturation: 0.28, vibrance: 0.18, contrast: 0.12 }),
  punchy:    Object.freeze({ contrast: 0.24, saturation: 0.16, sharpen: 0.18 }),
  warm:      Object.freeze({ temperature: 0.18, tint: 0.04, saturation: 0.08 }),
  cool:      Object.freeze({ temperature: -0.18, tint: -0.03, saturation: 0.04, contrast: 0.06 }),
  mono:      Object.freeze({ saturation: -1, contrast: 0.16 }),
  retro:     Object.freeze({ fade: 0.22, grain: 0.18, saturation: -0.08, temperature: 0.12, contrast: 0.06 }),
  bright:    Object.freeze({ exposure: 0.16, shadows: 0.12, contrast: 0.04 }),
  dark:      Object.freeze({ exposure: -0.14, shadows: -0.16, contrast: 0.14, vignette: 0.22 }),
  soft:      Object.freeze({ contrast: -0.06, highlights: 0.1, fade: 0.12, saturation: 0.04 }),
  clean:     Object.freeze({ contrast: 0.08, whites: 0.06, saturation: 0.06 })
});

/** 見た目の id の一覧（UI の選択肢） */
export const LOOK_IDS = Object.freeze(Object.keys(COLOR_LOOKS));

/** 見た目の日本語名（UI とテロップの説明に使う） */
export const LOOK_NAMES = Object.freeze({
  none: "そのまま", natural: "自然", cinematic: "シネマ", vivid: "鮮やか", punchy: "力強い",
  warm: "暖かい", cool: "涼しい", mono: "モノクロ", retro: "レトロ", bright: "明るい",
  dark: "暗め", soft: "やわらか", clean: "clean"
});

/**
 * 見た目 → Plan.grade（Partial<ColorGrade>）。知らない id は null（何もしない）。
 * **複製して返す**（同じ object を全クリップに配ると 1 つ直した途端に全部動く）。
 * @param {string|null} look @returns {Object|null}
 */
export function gradeForLook(look) {
  const g = COLOR_LOOKS[String(look || "none")];
  return g ? Object.assign({}, g) : null;
}

/* ══ §C テロップの体裁 ════════════════════════════════════════════
   役（role）は契約書 §6 の text.role と同じ 4 つ:
     title   … 冒頭のタイトル
     caption … 場面の頭の短い説明
     lower   … 下三分の一（名前・場所）
     end     … 最後の締め
   数字の意味:
     sizeRel  … 画面の高さに対する文字の大きさの割合（resolve が px にする）
     x, y     … 画面中心を原点にした割合（core/eval.js の transform と同じ）
     maxWidth … 折り返し幅（画面幅に対する割合）
     anim     … clip の中の見せ方（秒。タイムライン上の位置ではない） */

const ANIM_POP = Object.freeze({ in: { type: "popIn", duration: 0.35 }, out: { type: "fade", duration: 0.25 } });
const ANIM_UP = Object.freeze({ in: { type: "fadeUp", duration: 0.45 }, out: { type: "fade", duration: 0.3 } });
const ANIM_SOFT = Object.freeze({ in: { type: "fade", duration: 0.6 }, out: { type: "fade", duration: 0.5 } });
const ANIM_SLIDE = Object.freeze({ in: { type: "slideIn", duration: 0.4 }, out: { type: "slideOut", duration: 0.3 } });

/** 影と縁取りの既定（暗い素材でも明るい素材でも読めるように両方つける） */
const READABLE = Object.freeze({ stroke: { width: 6, color: "#000000" }, shadow: { x: 0, y: 6, blur: 18, color: "#00000099" } });
const PLAIN = Object.freeze({ stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 3, blur: 10, color: "#00000066" } });

/** @type {Record<string, Object>} */
export const TEXT_PRESETS = Object.freeze({
  /* CapCut のような太いゴシック。縦動画・ショート向け */
  impact: Object.freeze({
    id: "impact", name: "インパクト",
    roles: Object.freeze({
      title:   Object.freeze({ sizeRel: 0.095, weight: 900, color: "#ffffff", x: 0, y: -0.06, maxWidth: 0.86, align: "center", vAlign: "middle", bg: null, anim: ANIM_POP, ...READABLE }),
      caption: Object.freeze({ sizeRel: 0.05, weight: 800, color: "#ffffff", x: 0, y: 0.33, maxWidth: 0.86, align: "center", vAlign: "middle", bg: null, anim: ANIM_POP, ...READABLE }),
      lower:   Object.freeze({ sizeRel: 0.042, weight: 700, color: "#ffffff", x: -0.24, y: 0.3, maxWidth: 0.6, align: "left", vAlign: "middle", bg: { color: "#000000aa", pad: 14, radius: 10 }, anim: ANIM_SLIDE, ...PLAIN }),
      end:     Object.freeze({ sizeRel: 0.062, weight: 800, color: "#ffffff", x: 0, y: 0, maxWidth: 0.8, align: "center", vAlign: "middle", bg: null, anim: ANIM_UP, ...READABLE })
    })
  }),
  /* 細くて静かな明朝寄り。シネマ・結婚式向け */
  elegant: Object.freeze({
    id: "elegant", name: "しっとり",
    roles: Object.freeze({
      title:   Object.freeze({ sizeRel: 0.072, weight: 400, color: "#ffffff", x: 0, y: 0, maxWidth: 0.7, align: "center", vAlign: "middle", bg: null, anim: ANIM_SOFT, ...PLAIN }),
      caption: Object.freeze({ sizeRel: 0.038, weight: 400, color: "#ffffff", x: 0, y: 0.36, maxWidth: 0.8, align: "center", vAlign: "middle", bg: null, anim: ANIM_SOFT, ...PLAIN }),
      lower:   Object.freeze({ sizeRel: 0.034, weight: 500, color: "#ffffff", x: -0.26, y: 0.32, maxWidth: 0.56, align: "left", vAlign: "middle", bg: null, anim: ANIM_SOFT, ...PLAIN }),
      end:     Object.freeze({ sizeRel: 0.05, weight: 400, color: "#ffffff", x: 0, y: 0, maxWidth: 0.76, align: "center", vAlign: "middle", bg: null, anim: ANIM_SOFT, ...PLAIN })
    })
  }),
  /* 情報を読ませる型。解説・ニュース向け */
  clean: Object.freeze({
    id: "clean", name: "すっきり",
    roles: Object.freeze({
      title:   Object.freeze({ sizeRel: 0.078, weight: 700, color: "#ffffff", x: 0, y: -0.04, maxWidth: 0.82, align: "center", vAlign: "middle", bg: { color: "#0f172acc", pad: 20, radius: 14 }, anim: ANIM_UP, ...PLAIN }),
      caption: Object.freeze({ sizeRel: 0.042, weight: 600, color: "#ffffff", x: 0, y: 0.34, maxWidth: 0.88, align: "center", vAlign: "middle", bg: { color: "#000000a6", pad: 14, radius: 10 }, anim: ANIM_UP, ...PLAIN }),
      lower:   Object.freeze({ sizeRel: 0.038, weight: 700, color: "#ffffff", x: -0.26, y: 0.3, maxWidth: 0.58, align: "left", vAlign: "middle", bg: { color: "#2563ebcc", pad: 14, radius: 8 }, anim: ANIM_SLIDE, ...PLAIN }),
      end:     Object.freeze({ sizeRel: 0.055, weight: 700, color: "#ffffff", x: 0, y: 0, maxWidth: 0.8, align: "center", vAlign: "middle", bg: null, anim: ANIM_UP, ...PLAIN })
    })
  }),
  /* 賑やかで色つき。料理・ペット・ゲーム向け */
  pop: Object.freeze({
    id: "pop", name: "ポップ",
    roles: Object.freeze({
      title:   Object.freeze({ sizeRel: 0.09, weight: 900, color: "#fff44f", x: 0, y: -0.08, maxWidth: 0.86, align: "center", vAlign: "middle", bg: null, anim: ANIM_POP, stroke: { width: 8, color: "#1a1a1a" }, shadow: { x: 0, y: 8, blur: 0, color: "#1a1a1a" } }),
      caption: Object.freeze({ sizeRel: 0.048, weight: 800, color: "#ffffff", x: 0, y: 0.32, maxWidth: 0.86, align: "center", vAlign: "middle", bg: { color: "#ff4d6dcc", pad: 14, radius: 999 }, anim: ANIM_POP, ...PLAIN }),
      lower:   Object.freeze({ sizeRel: 0.042, weight: 800, color: "#1a1a1a", x: -0.24, y: 0.3, maxWidth: 0.6, align: "left", vAlign: "middle", bg: { color: "#fff44fee", pad: 14, radius: 12 }, anim: ANIM_SLIDE, ...PLAIN }),
      end:     Object.freeze({ sizeRel: 0.06, weight: 900, color: "#ffffff", x: 0, y: 0, maxWidth: 0.8, align: "center", vAlign: "middle", bg: null, anim: ANIM_POP, ...READABLE })
    })
  }),
  /* 報道の下帯。ニュース・スポーツ向け */
  broadcast: Object.freeze({
    id: "broadcast", name: "放送",
    roles: Object.freeze({
      title:   Object.freeze({ sizeRel: 0.07, weight: 800, color: "#ffffff", x: 0, y: 0.26, maxWidth: 0.9, align: "left", vAlign: "middle", bg: { color: "#b91c1ce6", pad: 18, radius: 4 }, anim: ANIM_SLIDE, ...PLAIN }),
      caption: Object.freeze({ sizeRel: 0.04, weight: 700, color: "#ffffff", x: 0, y: 0.38, maxWidth: 0.9, align: "left", vAlign: "middle", bg: { color: "#111827e6", pad: 12, radius: 4 }, anim: ANIM_SLIDE, ...PLAIN }),
      lower:   Object.freeze({ sizeRel: 0.038, weight: 700, color: "#ffffff", x: -0.25, y: 0.31, maxWidth: 0.6, align: "left", vAlign: "middle", bg: { color: "#111827e6", pad: 12, radius: 4 }, anim: ANIM_SLIDE, ...PLAIN }),
      end:     Object.freeze({ sizeRel: 0.05, weight: 700, color: "#ffffff", x: 0, y: 0, maxWidth: 0.8, align: "center", vAlign: "middle", bg: null, anim: ANIM_UP, ...PLAIN })
    })
  })
});

/** テロップの体裁の一覧 */
export const TEXT_PRESET_IDS = Object.freeze(Object.keys(TEXT_PRESETS));
/** 文字の役（契約書 §6 の text.role） */
export const TEXT_ROLES = Object.freeze(["title", "caption", "lower", "end"]);

/**
 * 体裁を引く（知らない id は "impact"）。@param {string} id @returns {Object}
 */
export function textPreset(id) {
  const p = TEXT_PRESETS[String(id || "")];
  return p || TEXT_PRESETS.impact;
}

/**
 * 体裁 × 役 → 見た目の仕様（pure。**複製**を返す）。
 * @param {string} presetId @param {string} role
 * @returns {Object} { sizeRel, weight, color, x, y, maxWidth, align, vAlign, bg, anim, stroke, shadow }
 */
export function roleSpec(presetId, role) {
  const p = textPreset(presetId);
  const r = TEXT_ROLES.indexOf(String(role)) >= 0 ? String(role) : "caption";
  const s = p.roles[r] || p.roles.caption;
  return {
    sizeRel: clamp(finite(s.sizeRel, 0.05), 0.012, 0.3),
    weight: clamp(finite(s.weight, 700), 100, 900),
    color: String(s.color || "#ffffff"),
    x: clamp(finite(s.x, 0), -0.5, 0.5),
    y: clamp(finite(s.y, 0), -0.5, 0.5),
    maxWidth: clamp(finite(s.maxWidth, 0.84), 0.2, 1),
    align: String(s.align || "center"),
    vAlign: String(s.vAlign || "middle"),
    bg: s.bg ? Object.assign({}, s.bg) : null,
    stroke: Object.assign({ width: 0, color: "#000000" }, s.stroke || null),
    shadow: Object.assign({ x: 0, y: 4, blur: 8, color: "#00000088" }, s.shadow || null),
    anim: {
      in: Object.assign({ type: "fade", duration: 0.35 }, (s.anim && s.anim.in) || null),
      out: Object.assign({ type: "fade", duration: 0.25 }, (s.anim && s.anim.out) || null)
    }
  };
}

/* ══ §D 型（テンプレート）の台帳 ══════════════════════════════════
   rules の意味:
     hook            … 冒頭に一番良い素材を持ってくるか
     captionEvery    … 何ショットごとにテロップを出すか（0 = 場面が変わる所だけ）
     endCardText     … 締めの文字（endCard の既定）
     maxShotsPerAsset… 1 素材から取るショット数の上限
     minShot         … これより短いショットは作らない（秒）
     crossfadeAt     … "assetChange"（場面が変わる所だけ）/ "always" / "never"
     spice           … 遷移を whipPan/zoomIn にする割合（0..1。fast の 20% = 0.2）
     musicGain       … BGM の音量（契約 §6 の既定 0.25）
     duck            … 人の声の所で BGM を下げるか
     zoomStill       … 静止画に寄り（Ken Burns）を入れるか */

const RULES = (o) => Object.freeze(Object.assign({
  hook: true, captionEvery: 0, endCardText: "", maxShotsPerAsset: 3, minShot: 0.6,
  crossfadeAt: "assetChange", spice: 0, musicGain: 0.25, duck: true, zoomStill: true
}, o || null));

/** @type {Record<string, Object>} */
export const TEMPLATES = Object.freeze({
  vlog: Object.freeze({
    id: "vlog", name: "日常 Vlog", style: "vlog",
    description: "その日の出来事を時系列で見せる。テンポは中くらい、テロップで一言添える。",
    targetDuration: 60, avgShot: 2.4, pacing: "medium",
    transitions: Object.freeze(["cut", "crossfade"]), textPreset: "impact",
    colorLook: "natural", musicEnergy: "mid",
    rules: RULES({ endCardText: "見てくれてありがとう", captionEvery: 0, spice: 0.05 })
  }),
  travel: Object.freeze({
    id: "travel", name: "旅行", style: "vlog",
    description: "景色を大きく、移動の流れが分かるように。色は少し濃く、遷移は滑らか。",
    targetDuration: 60, avgShot: 2.6, pacing: "medium",
    transitions: Object.freeze(["cut", "crossfade", "whipPan"]), textPreset: "impact",
    colorLook: "vivid", musicEnergy: "mid",
    rules: RULES({ endCardText: "また旅に出ます", maxShotsPerAsset: 4, spice: 0.12 })
  }),
  product: Object.freeze({
    id: "product", name: "商品紹介", style: "product",
    description: "全体 → 細部 → 使う所の順。文字は大きく、要点を言い切る。",
    targetDuration: 45, avgShot: 2, pacing: "medium",
    transitions: Object.freeze(["cut", "zoomIn"]), textPreset: "clean",
    colorLook: "clean", musicEnergy: "mid",
    rules: RULES({ endCardText: "詳しくは概要欄から", captionEvery: 2, spice: 0.15, minShot: 0.8 })
  }),
  explainer: Object.freeze({
    id: "explainer", name: "解説", style: "explainer",
    description: "話が主役。無音を詰め、話の区切りでテロップを入れ替える。",
    targetDuration: 90, avgShot: 3, pacing: "medium",
    transitions: Object.freeze(["cut", "crossfade"]), textPreset: "clean",
    colorLook: "natural", musicEnergy: "low",
    rules: RULES({ endCardText: "最後まで見てくれてありがとう", captionEvery: 1, musicGain: 0.18, hook: false, zoomStill: false })
  }),
  tutorial: Object.freeze({
    id: "tutorial", name: "作り方・手順", style: "explainer",
    description: "手順ごとに区切り、番号のテロップを置く。速さは控えめ。",
    targetDuration: 120, avgShot: 3.2, pacing: "medium",
    transitions: Object.freeze(["cut"]), textPreset: "clean",
    colorLook: "clean", musicEnergy: "low",
    rules: RULES({ endCardText: "やってみてね", captionEvery: 1, crossfadeAt: "never", musicGain: 0.16, hook: false })
  }),
  short: Object.freeze({
    id: "short", name: "ショート（縦）", style: "short",
    description: "最初の 1 秒で掴む。短い切り替えとテロップで最後まで見せる。",
    targetDuration: 30, avgShot: 1.2, pacing: "fast",
    transitions: Object.freeze(["cut", "whipPan", "zoomIn"]), textPreset: "impact",
    colorLook: "punchy", musicEnergy: "high",
    rules: RULES({ endCardText: "フォローしてね", captionEvery: 2, spice: 0.2, minShot: 0.5, maxShotsPerAsset: 5 })
  }),
  digest: Object.freeze({
    id: "digest", name: "ダイジェスト", style: "digest",
    description: "長い素材から良い所だけを拾って並べる。テンポ良く、説明は最小限。",
    targetDuration: 60, avgShot: 1.8, pacing: "fast",
    transitions: Object.freeze(["cut", "crossfade", "whipPan"]), textPreset: "impact",
    colorLook: "natural", musicEnergy: "high",
    rules: RULES({ endCardText: "本編もどうぞ", maxShotsPerAsset: 6, spice: 0.2 })
  }),
  cinematic: Object.freeze({
    id: "cinematic", name: "シネマ", style: "cinematic",
    description: "長めのショットと静かな遷移。色は暗部を締めて横長に。",
    targetDuration: 75, avgShot: 3.8, pacing: "slow",
    transitions: Object.freeze(["crossfade", "cut"]), textPreset: "elegant",
    colorLook: "cinematic", musicEnergy: "low",
    rules: RULES({ endCardText: "fin", crossfadeAt: "always", musicGain: 0.22, maxShotsPerAsset: 2, minShot: 1.2 })
  }),
  news: Object.freeze({
    id: "news", name: "ニュース", style: "news",
    description: "事実を淡々と。下帯のテロップで場所と要点を出す。",
    targetDuration: 60, avgShot: 3, pacing: "medium",
    transitions: Object.freeze(["cut"]), textPreset: "broadcast",
    colorLook: "clean", musicEnergy: "low",
    rules: RULES({ endCardText: "以上、お伝えしました", captionEvery: 1, crossfadeAt: "never", musicGain: 0.14, hook: false })
  }),
  sports: Object.freeze({
    id: "sports", name: "スポーツ", style: "digest",
    description: "動きの大きい所だけ。決まった瞬間は少し長く見せる。",
    targetDuration: 45, avgShot: 1.6, pacing: "fast",
    transitions: Object.freeze(["cut", "whipPan", "zoomIn"]), textPreset: "broadcast",
    colorLook: "punchy", musicEnergy: "high",
    rules: RULES({ endCardText: "次の試合もお楽しみに", spice: 0.25, maxShotsPerAsset: 6, minShot: 0.5 })
  }),
  wedding: Object.freeze({
    id: "wedding", name: "結婚式", style: "cinematic",
    description: "表情と手元を丁寧に。ゆっくり、やわらかい色で。",
    targetDuration: 120, avgShot: 4, pacing: "slow",
    transitions: Object.freeze(["crossfade"]), textPreset: "elegant",
    colorLook: "soft", musicEnergy: "low",
    rules: RULES({ endCardText: "Thank you", crossfadeAt: "always", maxShotsPerAsset: 2, minShot: 1.5, musicGain: 0.3 })
  }),
  food: Object.freeze({
    id: "food", name: "料理・グルメ", style: "product",
    description: "寄りの絵を主役に。音（ジュッ）を活かし、手順をテロップで。",
    targetDuration: 45, avgShot: 1.8, pacing: "fast",
    transitions: Object.freeze(["cut", "zoomIn"]), textPreset: "pop",
    colorLook: "warm", musicEnergy: "mid",
    rules: RULES({ endCardText: "作ってみてね", captionEvery: 2, spice: 0.18 })
  }),
  pet: Object.freeze({
    id: "pet", name: "ペット", style: "vlog",
    description: "可愛い瞬間だけ。短く切って、賑やかなテロップを添える。",
    targetDuration: 30, avgShot: 1.4, pacing: "fast",
    transitions: Object.freeze(["cut", "zoomIn", "whipPan"]), textPreset: "pop",
    colorLook: "bright", musicEnergy: "high",
    rules: RULES({ endCardText: "また明日", captionEvery: 2, spice: 0.2, maxShotsPerAsset: 5, minShot: 0.5 })
  }),
  music: Object.freeze({
    id: "music", name: "音楽・MV", style: "short",
    description: "曲が主役。切り替えを拍に合わせ、素材の音は下げる。",
    targetDuration: 60, avgShot: 1.6, pacing: "beat",
    transitions: Object.freeze(["cut", "whipPan", "glitch"]), textPreset: "impact",
    colorLook: "cool", musicEnergy: "high",
    rules: RULES({ endCardText: "", captionEvery: 0, spice: 0.2, musicGain: 0.6, duck: false, maxShotsPerAsset: 6 })
  }),
  game: Object.freeze({
    id: "game", name: "ゲーム実況", style: "digest",
    description: "見せ場を並べる。テロップは大きく、遷移は派手に。",
    targetDuration: 60, avgShot: 1.8, pacing: "fast",
    transitions: Object.freeze(["cut", "glitch", "zoomIn"]), textPreset: "pop",
    colorLook: "punchy", musicEnergy: "high",
    rules: RULES({ endCardText: "チャンネル登録もよろしく", captionEvery: 2, spice: 0.22, maxShotsPerAsset: 6 })
  }),
  interview: Object.freeze({
    id: "interview", name: "インタビュー", style: "explainer",
    description: "話している所を切らずに。名前は下帯で 1 度だけ出す。",
    targetDuration: 90, avgShot: 4.5, pacing: "slow",
    transitions: Object.freeze(["cut", "crossfade"]), textPreset: "clean",
    colorLook: "natural", musicEnergy: "low",
    rules: RULES({ endCardText: "", captionEvery: 0, musicGain: 0.12, hook: false, maxShotsPerAsset: 2, minShot: 1.5, zoomStill: false })
  })
});

/** 型の id の一覧（UI の並び順もこれ） */
export const TEMPLATE_IDS = Object.freeze(Object.keys(TEMPLATES));
/** Plan.style に書ける値（契約書 §6） */
export const STYLE_IDS = Object.freeze(["vlog", "product", "explainer", "short", "digest", "cinematic", "news"]);

/**
 * 型を引く（object をそのまま渡しても良い。知らない id は fallback）。
 * @param {string|Object|null} idOrObj @param {string} [fallback="vlog"]
 * @returns {Object} テンプレート
 */
export function getTemplate(idOrObj, fallback) {
  if (idOrObj && typeof idOrObj === "object" && !Array.isArray(idOrObj)) {
    const base = TEMPLATES[String(idOrObj.id || "")] || TEMPLATES[String(fallback || "vlog")] || TEMPLATES.vlog;
    // 呼び手が一部だけ差し替えた型（UI の「この型を少し変える」）も受ける
    return Object.assign({}, base, idOrObj, { rules: Object.assign({}, base.rules, idOrObj.rules || null) });
  }
  const id = String(idOrObj || "");
  return TEMPLATES[id] || TEMPLATES[String(fallback || "vlog")] || TEMPLATES.vlog;
}

/**
 * Intent（か style / 型 id）から型を選ぶ（pure）。
 * `intent.style` が型の id ならそれ、Plan.style なら その style の代表を選ぶ。
 * @param {Object|string|null} intent @returns {Object}
 */
export function pickTemplate(intent) {
  if (!intent) return TEMPLATES.vlog;
  if (typeof intent === "string") return pickTemplate({ style: intent });
  const want = String(intent.style || "");
  if (TEMPLATES[want]) return TEMPLATES[want];
  // Plan.style から代表の型へ（最初に見つかった物 = 台帳の並び順が意味を持つ）
  for (const id of TEMPLATE_IDS) if (TEMPLATES[id].style === want) return TEMPLATES[id];
  // 縦なら short、尺が短いなら short、長いなら explainer を既定にする
  const ratio = String(intent.ratio || "");
  if (ratio === "9:16" || ratio === "4:5") return TEMPLATES.short;
  const d = finite(intent.targetDuration, 0);
  if (d > 0 && d <= 20) return TEMPLATES.short;
  if (d >= 100) return TEMPLATES.explainer;
  return TEMPLATES.vlog;
}

/**
 * 型を「planner がそのまま使える既定値の束」に開く（pure）。
 * @param {string|Object|null} template @returns {Object}
 */
export function templateDefaults(template) {
  const t = getTemplate(template);
  return {
    id: t.id, style: STYLE_IDS.indexOf(t.style) >= 0 ? t.style : "vlog",
    name: t.name, description: t.description,
    targetDuration: clamp(finite(t.targetDuration, 60), 1, 3600),
    avgShot: clamp(finite(t.avgShot, 2.2), 0.2, 30),
    pacing: PACING_IDS.indexOf(t.pacing) >= 0 ? t.pacing : "medium",
    transitions: Array.isArray(t.transitions) && t.transitions.length ? t.transitions.slice() : ["cut"],
    textPreset: TEXT_PRESETS[t.textPreset] ? t.textPreset : "impact",
    colorLook: COLOR_LOOKS[t.colorLook] !== undefined ? t.colorLook : "none",
    musicEnergy: ["low", "mid", "high"].indexOf(t.musicEnergy) >= 0 ? t.musicEnergy : "mid",
    rules: Object.assign({}, RULES(null), t.rules || null)
  };
}
