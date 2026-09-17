/* ══════════════════════════════════════════════════════════════════════
   ai/intent.js — ユーザーの言葉を「編集の注文（Intent）」に読み替える所

   ★ 何をする所か
     ・`parseIntent(prompt, { assets, llm, signal })` … LLM が使えるなら
       LLM に読ませ、使えなければ **日本語の規則だけで**必ず埋める。
     ・`parseIntentLocal(prompt, ctx)` … ネット不要・pure・決定論。
       「30秒」「縦」「テンポよく」「テロップ」「映画風」… を拾う本体。
       **こちらが基準**で、LLM の答えは上から重ねるだけ（LLM が壊れた値を
       返しても Intent が壊れない）。

   ★ なぜこの形か
     ・契約書 §6 の合格条件は「繋がらなくても必ず動く」。規則を「LLM が
       落ちたときの予備」に置くと予備の質が落ちるので、**規則を本線**に
       して LLM を上乗せにした。
     ・日本語は「テロップは入れないで」のように**否定が後ろに来る**。
       だから鍵語の有無だけでは判定できない。文を「、。」で区切り、
       節ごとに否定の印を見てから決める（`clauses()`）。
     ・全角数字・半角カナ・全角引用符が混ざるので、判定は必ず
       `NFKC` 正規化 + 小文字化した文に対して行う（元の文は goal に残す）。

   ★ 触るときの注意
     ・**規則を足すときは試験も足す**（tests/ai-planner.test.mjs に日本語の
       例が並んでいる。増やすならそこへ）。
     ・Intent の鍵は契約書 §6 の一覧に揃える。増やしたいときは
       CONTRACT-NOTE を書く（下の `speed` がその例）。
     ・秒やフレームは **決めない**。ここが決めるのは「目標の尺」まで。
       実際の切り所は ai/resolve.js だけが決める（契約書 §6）。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, finite } from "../core/util.js";
import { warn } from "../core/log.js";
import { RATIOS } from "../core/schema.js";
import { PACING_IDS, TEMPLATES, TEMPLATE_IDS, LOOK_IDS, templateDefaults } from "./templates.js";

const str = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const uniq = (list) => Array.from(new Set(list.filter((s) => !!s)));

/** 目標尺の上限・下限（秒）。長すぎる注文は現実に書き出せない */
export const MIN_TARGET = 3;
export const MAX_TARGET = 1800;
/** captions に書ける値（契約書 §6） */
export const CAPTION_MODES = Object.freeze(["none", "auto", "prompt"]);
/** 気分（UI の選択肢と揃える） */
export const MOODS = Object.freeze(["neutral", "upbeat", "emotional", "cool", "calm", "fun", "serious", "intense"]);
/** 避けたい物の印（planner/resolve が素材選びで見る） */
export const AVOID_TOKENS = Object.freeze(["shaky", "dark", "blurry", "silence", "faces", "long"]);

/**
 * 判定用に文を均す（全角→半角・小文字・空白を 1 つに）。
 * 元の文は触らない（goal には生のまま残す）。
 * @param {string} s @returns {string}
 */
export function normalizeJa(s) {
  let t = str(s);
  try { t = t.normalize("NFKC"); } catch (_e) { /* 古い環境。元のままで進む */ }
  return t.toLowerCase().replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/** 「、。,.！!？?改行」で節に割る（否定がどこに掛かるかを見るため） */
export function clauses(s) {
  return normalizeJa(s).split(/[、。,.!?！？\n・]+/).map((x) => x.trim()).filter(Boolean);
}

/** その節が否定・除外を言っているか */
const NEG_RE = /(使わ(ない|ず)|避け|除(い|く|け)|抜(い|く|け)|カット|いらな|要らな|不要|無し|なし|ない|禁止|ngだ|やめ|控え)/;
export function isNegative(clause) { return NEG_RE.test(normalizeJa(clause)); }

/* ══ §A 鍵語の表（最初に当たった物を採る）════════════════════════ */

/** 比率。縦の言い方が一番多いので先に置く */
const RATIO_RULES = [
  [/9\s*:\s*16|縦(動画|向き|長|画面)?|たて(動画|向き)|ショート|shorts?|tiktok|ティックトック|reels?|リール|スマホ(で|向け)?|インスタ(の)?ストーリー/, "9:16"],
  [/4\s*:\s*5|sns縦|インスタ(の)?(投稿|フィード)/, "4:5"],
  [/1\s*:\s*1|正方(形)?|スクエア/, "1:1"],
  [/2\.35|シネスコ|シネマスコープ|横長(の)?映画/, "2.35:1"],
  [/4\s*:\s*3|昔のテレビ/, "4:3"],
  [/16\s*:\s*9|横(動画|向き|長)?|よこ(動画|向き)|youtube|ユーチューブ|テレビ(用|向け)/, "16:9"]
];

/** テンポ。ビート合わせを一番先に見る（「テンポよく音ハメ」は beat） */
const PACING_RULES = [
  [/ビート|音ハメ|音はめ|拍(に|で)|リズム(に|で|良く|よく)?合わせ|曲(に|で)合わせ|beat|bpm/, "beat"],
  [/テンポ(が)?(よ|良|い|上げ|速|早)|さくさく|サクサク|ぱっぱ|パッパ|速(く|い|め)|早(く|い|め)|はやく|ハイテンポ|勢い|ポンポン|小気味|ぽんぽん|畳み掛け|たたみかけ|疾走/, "fast"],
  [/しっとり|ゆっくり|ゆったり|落ち着(い|か)|穏やか|静か|じっくり|スロー|slow|余韻|間(を|は)?(取|とっ)/, "slow"],
  [/テンポ(は)?(普通|ふつう|標準)|中くらい/, "medium"]
];

/** 色の見た目 */
const LOOK_RULES = [
  [/レトロ|vhs|昭和|古い(感じ|フィルム)|ノスタル|フィルム(調|風|っぽ)/, "retro"],
  [/シネマ|映画(風|的|みたい|っぽい)|シネマティック|cinematic/, "cinematic"],
  [/モノクロ|白黒|グレースケール|monochrome/, "mono"],
  [/ビビッド|鮮やか|あざやか|色(を)?(濃く|鮮やか)|彩度(を)?(上|高)|vivid/, "vivid"],
  [/パキッ|バキッ|力強|コントラスト(を)?(強|上)|くっきり/, "punchy"],
  [/暖色|暖か(い|く)|あたたか|オレンジ(っぽく|寄り)|夕(焼け|暮れ)(風|っぽく)/, "warm"],
  [/寒色|クール(な|に)?(色|トーン)|青(っぽく|寄り|系)|涼し|冷た/, "cool"],
  [/やわらか|柔らか|ソフト|淡(い|く)|ふんわり|soft/, "soft"],
  [/明るく|明るめ|明るい(感じ|画|色)|ぱっと明る/, "bright"],
  [/暗く|暗め|暗い(感じ|画|色)|ダーク|重厚|シリアスな色/, "dark"],
  [/クリーン|すっきり(した)?(色|画)|清潔/, "clean"],
  [/ナチュラル|自然な色|そのままの色|加工(は)?(しない|なし)/, "natural"]
];

/** 型（テンプレート）。より狭い言い方を先に置く */
const STYLE_RULES = [
  [/旅行|旅(の|に|行)|観光|トリップ|travel/, "travel"],
  [/結婚(式)?|ウェディング|披露宴|前撮り|wedding/, "wedding"],
  [/料理|グルメ|レシピ|飯|メシ|カフェ|スイーツ|food|作り方(の)?(料理)?/, "food"],
  [/ペット|犬|猫|ねこ|いぬ|うちの子|ハムスター|インコ/, "pet"],
  [/ニュース|報道|速報|お知らせ番組/, "news"],
  [/スポーツ|試合|サッカー|野球|バスケ|マラソン|大会/, "sports"],
  [/インタビュー|対談|取材|質問(に)?答え/, "interview"],
  [/ゲーム|実況|プレイ動画|gameplay/, "game"],
  [/mv|ミュージックビデオ|音楽(動画|pv)|ライブ(映像)?|演奏|弾いて/, "music"],
  [/商品|物撮り|レビュー|開封|紹介動画|pr動画|広告|cm|宣伝|販促/, "product"],
  [/チュートリアル|手順|使い方|やり方|how ?to|ハウツー|説明書/, "tutorial"],
  [/解説|説明(して|動画)|講義|授業|まとめて(説明|話)/, "explainer"],
  [/ダイジェスト|総集編|ハイライト|いいとこ(ろ)?だけ|抜粋|まとめ動画/, "digest"],
  [/シネマティック|映画(風|っぽい)(に|の)?(編集|仕上)/, "cinematic"],
  [/ショート|shorts?|tiktok|reels?|リール(動画)?/, "short"],
  [/vlog|ブイログ|日常|日記|何気ない|暮らし/, "vlog"]
];

/** 気分 */
const MOOD_RULES = [
  [/感動|泣ける|エモ|しみる|じんわり|涙/, "emotional"],
  [/かっこよ|格好良|クール|おしゃれ|スタイリッシュ/, "cool"],
  [/楽し|明る|元気|ハッピー|わくわく|ポップ/, "upbeat"],
  [/落ち着|穏やか|癒し|リラック|安らか|しっとり|ゆったり/, "calm"],
  [/面白|笑え|コミカル|ネタ|ふざけ/, "fun"],
  [/真面目|丁寧|きちんと|ビジネス|硬め|フォーマル/, "serious"],
  [/迫力|激し|緊張|熱い|盛り上が|アツい/, "intense"]
];

/** 効果（contract の segment.fx に入る印） */
const FX_RULES = [
  [/手ぶれ補正|手振れ補正|スタビ|ぶれ(を)?(直|補正)/, "stabilize"],
  [/揺れ|シェイク|shake|ブルブル/, "shake"],
  [/グリッチ|glitch|ノイズ(の)?(演出|効果)/, "glitch"],
  [/ズーム|寄り(で|を)|ken ?burns|寄って/, "zoom"],
  [/背景(を)?ぼか|ぼかし背景|blur/, "blurBg"],
  [/モザイク|ぼかし(を)?(入れ|かけ)/, "mosaic"],
  [/緩急|速度(の)?(変化|ランプ)|スローモーション|スロー再生/, "speedRamp"],
  [/光|フレア|きらきら|グロー/, "glow"]
];

/** 避けたい物（節が否定のときだけ見る） */
const AVOID_RULES = [
  [/手ぶれ|手振れ|ぶれ|ブレ|揺れ/, "shaky"],
  [/暗い|暗め|露出(が)?(低|不足)/, "dark"],
  [/ぼけ|ボケ|ピンぼけ|ピンボケ|ピントが?(合|甘)/, "blurry"],
  [/無音|沈黙|喋って(い)?ない|話して(い)?ない|静かな所/, "silence"],
  [/顔|人(が)?(写|映)/, "faces"],
  [/長い|長回し|だらだら|冗長/, "long"]
];

/** 言語 */
const LANG_RULES = [[/英語|english/, "en"], [/中国語|chinese|中文/, "zh"], [/韓国語|korean|한국/, "ko"], [/日本語|japanese/, "ja"]];

/** 表を順に見て最初に当たった値（無ければ null） */
function firstHit(rules, text) {
  for (const [re, v] of rules) if (re.test(text)) return v;
  return null;
}

/* ══ §B 数の読み取り（pure）═══════════════════════════════════════ */

/**
 * 目標の尺（秒）を読む。読めなければ null。
 * 「1分30秒」「90秒」「2分」「1分半」「30〜40秒」「30から40秒」「尺は1:30」
 * 「1分30秒にまとめて」に対応。
 * @param {string} text NFKC 済みの文
 * @returns {number|null}
 */
export function parseTargetDuration(text) {
  const t = str(text);
  let m = null;
  /* 「10分にまとめて」のように **仕上がりの長さ**だと分かる言い方を最優先に見る。
     こうしないと「1時間の講義を10分にまとめて」で素材の長さ（1時間）を拾う。
     頭の `(\d+)分` は任意（「1分30秒にまとめて」で 分 を落とさないため。
     これが無いと「1分」の所で に/で が来ず、後ろの「30秒」だけを拾ってしまう）。 */
  if ((m = /(?:(\d+(?:\.\d+)?)\s*分\s*)?(\d+(?:\.\d+)?)\s*(時間|分|秒)\s*(?:くらい|ほど|程度|前後)?\s*(?:に|へ|で)\s*(?:まとめ|して|収め|抑え|編集|作|仕上|縮め|短く)/.exec(t))) {
    const n = Number(m[2]);
    const mul = m[3] === "時間" ? 3600 : m[3] === "分" ? 60 : 1;
    /* 頭の 分 が拾えているのは「X分Y秒」の形のときだけ（「X分Y分」は無い） */
    const head = m[1] !== undefined && m[3] === "秒" ? Number(m[1]) * 60 : 0;
    if (Number.isFinite(n) && n > 0 && Number.isFinite(head)) return clamp(head + n * mul, MIN_TARGET, MAX_TARGET);
  }
  if ((m = /(\d+(?:\.\d+)?)\s*時間\s*(\d+(?:\.\d+)?)?\s*分?/.exec(t))) {
    const h = Number(m[1]) * 3600 + (m[2] ? Number(m[2]) * 60 : 0);
    return clamp(h, MIN_TARGET, MAX_TARGET);
  }
  if ((m = /(\d+(?:\.\d+)?)\s*分\s*(\d+(?:\.\d+)?)\s*秒/.exec(t))) return clamp(Number(m[1]) * 60 + Number(m[2]), MIN_TARGET, MAX_TARGET);
  if ((m = /(\d+(?:\.\d+)?)\s*分\s*半/.exec(t))) return clamp(Number(m[1]) * 60 + 30, MIN_TARGET, MAX_TARGET);
  /* 範囲の区切りは 1 文字ではない物（「から」）も在る。文字の集合に「か」「ら」を
     入れるだけでは「30から40秒」が拾えないので、まとまりとして書く。 */
  if ((m = /(\d+)\s*(?:[〜~～\-–ー]|から)\s*(\d+)\s*秒/.exec(t))) return clamp((Number(m[1]) + Number(m[2])) / 2, MIN_TARGET, MAX_TARGET);
  if ((m = /(\d+)\s*(?:[〜~～\-–ー]|から)\s*(\d+)\s*分/.exec(t))) return clamp(((Number(m[1]) + Number(m[2])) / 2) * 60, MIN_TARGET, MAX_TARGET);
  if ((m = /(?:尺|長さ|時間)\s*は?\s*(\d{1,2})\s*:\s*([0-5]\d)/.exec(t))) return clamp(Number(m[1]) * 60 + Number(m[2]), MIN_TARGET, MAX_TARGET);
  if ((m = /(\d+(?:\.\d+)?)\s*(?:秒|びょう|sec|s)(?![a-z])/.exec(t))) return clamp(Number(m[1]), MIN_TARGET, MAX_TARGET);
  if ((m = /(\d+(?:\.\d+)?)\s*(?:分|ぷん|min)/.exec(t))) return clamp(Number(m[1]) * 60, MIN_TARGET, MAX_TARGET);
  return null;
}

/** 「N 倍」の直前に来ていたら **速さの話ではない**言葉（音量・明るさ…） */
const NOT_SPEED_BEFORE = /(音量|ボリューム|音|明るさ|明度|大きさ|サイズ|文字|解像度|画質|値段|価格|人数|枚数|量|幅|高さ)[をはがにもの]?$/;

/**
 * 「2倍速」「0.5倍」「1.5倍速で」を読む。無ければ null。
 * 「音量を2倍にして」のような **速さ以外**の「N 倍」は拾わない
 * （拾うと動画全体が 2 倍速になってしまう）。
 * @param {string} text @returns {number|null}
 */
export function parseSpeed(text) {
  const t = str(text);
  const re = /(\d+(?:\.\d+)?)\s*倍(速|に|で)?/g;
  let m = null;
  while ((m = re.exec(t))) {
    const v = Number(m[1]);
    if (!Number.isFinite(v) || v <= 0) continue;
    /* 「倍速」と書いてあれば速さで確定。そうでなければ直前の言葉を見る */
    if (m[2] !== "速" && NOT_SPEED_BEFORE.test(t.slice(Math.max(0, m.index - 8), m.index))) continue;
    return clamp(v, 0.1, 8);
  }
  return null;
}

/** BGM の音量の言い方（小さめ/大きめ）→ 0..1 */
function parseGain(text) {
  if (/bgm[^。]{0,6}(小さ|抑え|控え|薄め|下げ)|音楽[^。]{0,6}(小さ|抑え|控え|下げ)/.test(text)) return 0.15;
  if (/bgm[^。]{0,6}(大き|強め|上げ|しっかり)|音楽[^。]{0,6}(大き|強め|上げ)/.test(text)) return 0.4;
  return 0.25;
}

/* ══ §C 規則だけで Intent を作る（pure・決定論）══════════════════ */

/** ctx.assets から「名前が文に出てくる素材」を拾う（mustInclude の素） */
function matchAssets(text, assets) {
  const out = [];
  for (const a of arr(assets)) {
    const o = plain(a);
    if (!o) continue;
    const id = str(o.id);
    if (id && text.indexOf(normalizeJa(id)) >= 0) { out.push(id); continue; }
    const name = normalizeJa(str(o.name).replace(/\.[a-z0-9]+$/i, ""));
    if (name.length >= 2 && text.indexOf(name) >= 0) out.push(id || name);
  }
  return uniq(out);
}

/** 「」『』"" の中身（テロップやタイトルの指定） */
export function quotedParts(s) {
  const out = [];
  const re = /[「『"”][^「『"”]{1,60}[」』"”]/g;
  let m = null;
  const t = str(s);
  while ((m = re.exec(t))) out.push(m[0].slice(1, -1).trim());
  return out.filter(Boolean);
}

/**
 * プロンプトから Intent を作る（**pure・決定論・ネット不要**）。
 * @param {string} prompt ユーザーの文
 * @param {{assets?:Array, template?:string|Object, project?:Object}} [ctx]
 * @returns {Object} Intent
 */
export function parseIntentLocal(prompt, ctx) {
  const c = plain(ctx) || {};
  const raw = str(prompt);
  const t = normalizeJa(raw);
  const notes = [];
  const parts = clauses(raw);

  /* ① 型 → 既定値の土台。型が読めないときは尺と比率から推す（下で） */
  const styleId = firstHit(STYLE_RULES, t);
  const tpl = templateDefaults(styleId || c.template || null);

  /* ② 比率 */
  let ratio = firstHit(RATIO_RULES, t);
  if (!ratio) {
    ratio = styleId === "short" || styleId === "music" ? "9:16" : "16:9";
    notes.push(`比率の指定が無いので ${ratio} にした`);
  }
  if (!Object.prototype.hasOwnProperty.call(RATIOS, ratio)) ratio = "16:9";

  /* ③ 目標の尺 */
  let target = parseTargetDuration(t);
  if (target === null) {
    target = ratio === "9:16" && !styleId ? 30 : tpl.targetDuration;
    notes.push(`尺の指定が無いので ${Math.round(target)} 秒を目標にした`);
  }

  /* ④ テンポ */
  let pacing = firstHit(PACING_RULES, t);
  if (!pacing) { pacing = tpl.pacing; notes.push(`テンポの指定が無いので ${pacing} にした`); }

  /* ⑤ テロップ（否定が後ろに来るので節で見る）*/
  let captions = null;
  for (const cl of parts) {
    if (!/テロップ|字幕|キャプション|文字|subtitle|caption/.test(cl)) continue;
    if (isNegative(cl)) { captions = "none"; break; }
    captions = /(この|次の|指定|下記|以下)(の)?(文|言葉|テロップ|字幕)/.test(cl) && quotedParts(raw).length ? "prompt" : "auto";
  }
  if (captions === null) { captions = "auto"; notes.push("テロップの指定が無いので自動で入れる"); }

  /* ⑥ 色 */
  let colorLook = firstHit(LOOK_RULES, t);
  if (!colorLook) colorLook = tpl.colorLook;
  if (LOOK_IDS.indexOf(colorLook) < 0) colorLook = "none";

  /* ⑦ BGM */
  let musicWanted = null;
  for (const cl of parts) {
    if (/無音(で|に|の)|音(楽)?(は)?(いらな|要らな|なし|無し)/.test(cl)) { musicWanted = false; break; }
    if (/bgm|音楽|曲(を|で|は)?|bg ?m/.test(cl)) { musicWanted = !isNegative(cl); break; }
  }
  if (musicWanted === null) { musicWanted = true; notes.push("BGM の指定が無いので音の素材が在れば敷く"); }
  const energy = /激し|アップテンポ|盛り上が|ノリ|ハイテンポ/.test(t) ? "high"
    : /静か|落ち着|穏やか|しっとり/.test(t) ? "low"
      : pacing === "fast" || pacing === "beat" ? "high" : pacing === "slow" ? "low" : tpl.musicEnergy;

  /* ⑧ 避けたい物（否定の節だけ見る）*/
  const avoid = [];
  for (const cl of parts) {
    if (!isNegative(cl)) continue;
    for (const [re, token] of AVOID_RULES) if (re.test(cl) && avoid.indexOf(token) < 0) avoid.push(token);
  }

  /* ⑨ 締めの画 */
  let endCard = null;
  const q = quotedParts(raw);
  if (/エンドカード|end ?card|締め|最後に(文字|テロップ|一言)|チャンネル登録|フォローして|概要欄|高評価/.test(t)) {
    const text = /チャンネル登録/.test(t) ? "チャンネル登録をお願いします"
      : /フォローして/.test(t) ? "フォローしてね"
        : /概要欄/.test(t) ? "詳しくは概要欄から"
          : q.length ? q[q.length - 1] : str(tpl.rules.endCardText) || "ありがとうございました";
    endCard = { text: text.slice(0, 40), duration: 1.6 };
  }

  const intent = {
    goal: raw.trim().slice(0, 400),
    targetDuration: clamp(target, MIN_TARGET, MAX_TARGET),
    ratio,
    pacing,
    style: styleId || tpl.id,
    mood: firstHit(MOOD_RULES, t) || "neutral",
    music: { wanted: musicWanted, assetId: null, energy, gain: parseGain(t) },
    captions,
    mustInclude: matchAssets(t, c.assets),
    avoid,
    language: firstHit(LANG_RULES, t) || "ja",
    effects: uniq(FX_RULES.filter(([re]) => re.test(t)).map(([, v]) => v)),
    colorLook,
    endCard,
    /* CONTRACT-NOTE: 「〜倍速」を拾えという指示だが Intent の鍵一覧に速度が
       無い。落とすと指示を満たせないので `speed`（null か倍率）を足した。
       planner は segment.speed へ写すだけ（Plan の形は契約どおり）。 */
    speed: parseSpeed(t),
    notes,
    source: "local"
  };
  if (!raw.trim()) intent.notes.unshift("注文が空なので既定の型で組んだ");
  if (intent.speed !== null) intent.notes.push(`${intent.speed} 倍速で再生する`);
  if (q.length && captions === "prompt") intent.notes.push(`テロップは指定の ${q.length} 文を使う`);
  return intent;
}

/* ══ §D LLM の答えを Intent の形へ均す ═══════════════════════════ */

/**
 * どこから来た object でも Intent の形に収める（pure）。
 * 分からない値は base（規則で作った Intent）の値を使う。
 * @param {Object} obj @param {Object} base @returns {Object} Intent
 */
export function normalizeIntent(obj, base) {
  const o = plain(obj) || {};
  const b = plain(base) || parseIntentLocal("", null);
  const pick = (v, list, d) => (list.indexOf(str(v)) >= 0 ? str(v) : d);
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : d);
  const mus = plain(o.music);
  const ec = plain(o.endCard);
  const must = uniq(arr(o.mustInclude).map(str)).slice(0, 40);
  const avoids = uniq(arr(o.avoid).map(str).filter((s) => AVOID_TOKENS.indexOf(s) >= 0));
  const styleOk = TEMPLATE_IDS.indexOf(str(o.style)) >= 0 || !!TEMPLATES[str(o.style)];
  return {
    goal: str(o.goal).slice(0, 400) || b.goal,
    targetDuration: num(o.targetDuration, b.targetDuration, MIN_TARGET, MAX_TARGET),
    ratio: Object.prototype.hasOwnProperty.call(RATIOS, str(o.ratio)) ? str(o.ratio) : b.ratio,
    pacing: pick(o.pacing, PACING_IDS, b.pacing),
    style: styleOk ? str(o.style) : b.style,
    mood: pick(o.mood, MOODS, b.mood),
    music: {
      /* `music:null` / `music:false` は「BGM は敷かない」の意（契約書 §6 の
         Plan.music が null で無音を表すのと同じ読み方）。鍵ごと無い（undefined）
         ときだけ規則で読んだ値を使う。 */
      wanted: typeof (mus && mus.wanted) === "boolean" ? mus.wanted
        : (o.music === false || o.music === null ? false : b.music.wanted),
      assetId: str(mus && mus.assetId) || b.music.assetId || null,
      energy: pick(mus && mus.energy, ["low", "mid", "high"], b.music.energy),
      gain: num(mus && mus.gain, b.music.gain, 0, 1)
    },
    captions: pick(o.captions, CAPTION_MODES, b.captions),
    mustInclude: must.length ? must : b.mustInclude,
    avoid: avoids.length ? avoids : b.avoid,
    language: str(o.language).slice(0, 8) || b.language,
    effects: uniq(arr(o.effects).map(str)).slice(0, 12),
    colorLook: LOOK_IDS.indexOf(str(o.colorLook)) >= 0 ? str(o.colorLook) : b.colorLook,
    endCard: ec ? { text: str(ec.text).slice(0, 60) || "ありがとうございました", duration: num(ec.duration, 1.6, 0.4, 10) } : b.endCard,
    speed: Number.isFinite(Number(o.speed)) && Number(o.speed) > 0 ? clamp(Number(o.speed), 0.1, 8) : b.speed,
    notes: uniq(arr(o.notes).map((s) => str(s).slice(0, 200))).concat(b.notes).slice(0, 12),
    source: "llm"
  };
}

/** LLM へ渡す説明（Intent の形。素材の尺やフレームは書かせない）*/
function intentSystemPrompt() {
  return [
    "あなたは動画編集の助手です。ユーザーの日本語の注文を JSON の「注文票」に直します。",
    "JSON だけを返してください（説明・``` は付けない）。",
    "形:",
    '{"targetDuration":秒(数値),"ratio":"16:9"|"9:16"|"1:1"|"4:5"|"4:3"|"2.35:1",',
    '"pacing":"slow"|"medium"|"fast"|"beat","style":"' + TEMPLATE_IDS.slice(0, 8).join('"|"') + '"|…,',
    '"mood":"' + MOODS.join('"|"') + '","captions":"none"|"auto"|"prompt",',
    '"colorLook":"' + LOOK_IDS.join('"|"') + '","music":{"wanted":true,"energy":"low"|"mid"|"high","gain":0.25},',
    '"mustInclude":[素材id],"avoid":["shaky"|"dark"|"blurry"|"silence"|"faces"|"long"],',
    '"effects":[効果名],"endCard":{"text":"文字","duration":1.6}|null,"speed":倍率|null,"notes":["理由"]}',
    "分からない鍵は書かないこと（勝手に作らない）。秒数やフレームの細かい位置は決めないこと。"
  ].join("\n");
}

/* ══ §E 入口 ══════════════════════════════════════════════════════ */

/** signal が立っていたら中止として投げる（analysis と同じ作法） */
function throwIfAborted(signal) {
  if (signal && signal.aborted) { const e = new Error("中止しました"); e.name = "AbortError"; throw e; }
}

/**
 * 注文を読む（契約書 §6）。LLM が使えなければ規則だけで必ず埋める。
 * @param {string} prompt
 * @param {{assets?:Array, llm?:Object, signal?:AbortSignal|null,
 *   template?:string|Object, project?:Object}} [opts]
 * @returns {Promise<Object>} Intent
 */
export async function parseIntent(prompt, opts) {
  const o = plain(opts) || {};
  throwIfAborted(o.signal);
  const local = parseIntentLocal(prompt, { assets: o.assets, template: o.template, project: o.project });
  const llm = plain(o.llm);
  if (!llm || typeof llm.json !== "function" || llm.available === false) return local;

  const assetLines = arr(o.assets).slice(0, 24).map((a) => {
    const x = plain(a) || {};
    return `- ${str(x.id)} / ${str(x.kind) || "video"} / ${str(x.name).slice(0, 48)}`;
  }).join("\n");
  const user = [
    "注文: " + str(prompt).slice(0, 1200),
    assetLines ? "使える素材:\n" + assetLines : "素材はまだ無い",
    "規則で読んだ下書き（足りない所だけ直して）: " + JSON.stringify({
      targetDuration: local.targetDuration, ratio: local.ratio, pacing: local.pacing,
      style: local.style, captions: local.captions, colorLook: local.colorLook
    })
  ].join("\n\n");

  try {
    const got = await llm.json(
      [{ role: "system", content: intentSystemPrompt() }, { role: "user", content: user }],
      { maxTokens: 700, signal: o.signal || null }
    );
    throwIfAborted(o.signal);
    const merged = normalizeIntent(got, local);
    merged.notes = uniq(["AI が注文票を読んだ"].concat(merged.notes));
    return merged;
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    warn("ai/intent", "LLM で注文を読めなかったので規則だけで進む", e && e.message ? e.message : e);
    local.notes = uniq([`AI に繋がらないので端末内の規則で読んだ（${str(e && e.message).slice(0, 60)}）`].concat(local.notes));
    return local;
  }
}
