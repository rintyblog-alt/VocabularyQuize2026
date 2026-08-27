/* ══════════════════════════════════════════════════════════════════════
   VocabuSpeak 教材ビルド

     speak-content/seed/*.json   （人が書いた英文＝Content Atom のもと）
                 ↓  Variant 展開（1 つの英文から何通りもの出し方を作る）
                 ↓  検証（英文・日本語訳・正答・レベル）
                 ↓  重複検出
                 ↓  索引づくり
     client/content/english/     （画面が取りに行く場所）

   使い方:
     node speak-content/build.mjs            … 作る
     node speak-content/build.mjs --check    … 作らずに検証だけ
     node speak-content/build.mjs --report   … 内訳を詳しく出す

   ・**1 つのレッスンが壊れても、他のレッスンを失わない**。
     壊れたものは外して、理由を報告に残す。
   ・音声話者や選択肢の順だけを変えたものを、別の教材として数えない。
   ══════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SEED_DIR = path.join(HERE, "seed");
const OUT_DIR = path.join(ROOT, "client", "content", "english");
const CHECK_ONLY = process.argv.includes("--check");
const REPORT = process.argv.includes("--report");

/* speak-model.js をそのまま読み込む（検証の決まりを 2 か所に書かない）。 */
const globalScope = globalThis;
globalScope.VQ2 = globalScope.VQ2 || {};
for (const f of ["domain/qtypes.js", "domain/speak-model.js"]) {
  const src = fs.readFileSync(path.join(ROOT, "client", "v2", f), "utf8");
  new Function(src).call(globalScope);
}
const SM = globalScope.VQ2.speakModel;

/* ══════════════════════════════════════════════════════════════════
   カテゴリーの定義（§6）。**画面へ直接書かない**。ここが唯一の正。
   ══════════════════════════════════════════════════════════════════ */
const GROUPS = [
  { id: "daily", name: "日常生活", order: 1 },
  { id: "outing", name: "外出・買い物", order: 2 },
  { id: "travel", name: "旅行", order: 3 },
  { id: "school_work", name: "学校・仕事", order: 4 },
  { id: "medical", name: "医療・緊急", order: 5 },
  { id: "grammar", name: "文法・表現", order: 6 }
];
const CATEGORIES = [
  { id: "greetings", name: "あいさつ", groupId: "daily", description: "出会いと別れのことば" },
  { id: "self_intro", name: "自己紹介", groupId: "daily", description: "名前・出身・好きなこと" },
  { id: "family_friends", name: "家族と友達", groupId: "daily", description: "人を紹介する・関係を話す" },
  { id: "hobby", name: "趣味", groupId: "daily", description: "音楽・ゲーム・スポーツ" },
  { id: "time_date", name: "時間と日付", groupId: "daily", description: "時刻・曜日・予定" },
  { id: "weather", name: "天気", groupId: "daily", description: "天気と気温の言い方" },
  { id: "food", name: "食事", groupId: "daily", description: "食べ物と好み" },

  { id: "cafe", name: "カフェ", groupId: "outing", description: "飲み物を注文する" },
  { id: "restaurant", name: "レストラン", groupId: "outing", description: "席・注文・会計" },
  { id: "shopping", name: "買い物", groupId: "outing", description: "探す・試す・買う" },
  { id: "payment", name: "支払い", groupId: "outing", description: "会計・returns・レシート" },
  { id: "directions", name: "道案内", groupId: "outing", description: "道をたずねる・教える" },
  { id: "transport", name: "電車とバス", groupId: "outing", description: "切符・乗り換え・時刻" },

  { id: "airport", name: "空港", groupId: "travel", description: "チェックイン・搭乗・入国" },
  { id: "hotel", name: "ホテル", groupId: "travel", description: "予約・チェックイン・依頼" },
  { id: "sightseeing", name: "観光", groupId: "travel", description: "見どころ・写真・チケット" },
  { id: "travel_trouble", name: "旅行のトラブル", groupId: "travel", description: "紛失・遅延・変更" },

  { id: "classroom", name: "授業", groupId: "school_work", description: "質問する・答える" },
  { id: "presentation", name: "発表", groupId: "school_work", description: "順序立てて話す" },
  { id: "interview", name: "面接", groupId: "school_work", description: "自分を説明する" },
  { id: "workplace", name: "職場", groupId: "school_work", description: "電話・メール・依頼" },

  { id: "hospital", name: "病院", groupId: "medical", description: "症状を伝える" },
  { id: "emergency", name: "緊急", groupId: "medical", description: "助けを求める" },

  { id: "tense_basic", name: "現在形と過去形", groupId: "grammar", description: "時制の基本" },
  { id: "future", name: "未来表現", groupId: "grammar", description: "will と be going to" },
  { id: "present_perfect", name: "現在完了", groupId: "grammar", description: "経験・完了・継続" },
  { id: "modals", name: "助動詞", groupId: "grammar", description: "can / should / must" },
  { id: "comparison", name: "比較", groupId: "grammar", description: "比較級と最上級" },
  { id: "opinion", name: "意見と理由", groupId: "grammar", description: "考えを述べる" }
];
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/* ══════════════════════════════════════════════════════════════════
   Variant の展開
   1 つの英文から、どの出し方を作れるかは英文の形で決まる。
   **作れないものは作らない**（無理に作ると解けない問題ができる）。
   ══════════════════════════════════════════════════════════════════ */
const STOPWORDS = new Set(["a", "an", "the", "is", "am", "are", "was", "were", "be", "to", "of",
  "in", "on", "at", "for", "and", "or", "but", "it", "i", "you", "he", "she", "we", "they",
  "my", "your", "his", "her", "our", "their", "this", "that", "please", "do", "does", "did",
  "can", "will", "would", "could", "have", "has", "had", "not", "no", "yes", "so", "very"]);

function words(s) { return String(s).trim().split(/\s+/).filter(Boolean); }
function stripPunct(w) { return w.replace(/^[^A-Za-z0-9'’]+|[^A-Za-z0-9'’]+$/g, ""); }

/* 空欄にする語を決める。指定が無ければ、いちばん中身のある語を選ぶ。 */
function pickBlankWord(en, given) {
  if (given) return given;
  const ws = words(en).map(stripPunct).filter(Boolean);
  const cand = ws.filter((w) => !STOPWORDS.has(w.toLowerCase()) && w.length >= 3);
  if (!cand.length) return null;
  return cand.slice().sort((a, b) => b.length - a.length || ws.indexOf(a) - ws.indexOf(b))[0];
}

/* 並べ替えの部品に切る。1 語ずつだと難しすぎるので、意味のかたまりでまとめる。
   同じ部品が 2 つできたら **並べ替えは作らない**（正しい順が 1 通りに決まらない）。 */
const CHUNK_HEADS = new Set(["to", "for", "at", "in", "on", "with", "of", "from", "about", "please", "and", "but"]);
function chunksOf(en) {
  const raw = words(en.replace(/[.?!]$/, ""));
  if (raw.length < 3) return null;
  const out = [];
  let cur = [];
  for (const w of raw) {
    const bare = stripPunct(w).toLowerCase();
    if (cur.length && CHUNK_HEADS.has(bare) && cur.length >= 1) { out.push(cur.join(" ")); cur = [w]; }
    else if (cur.length >= 2) { out.push(cur.join(" ")); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) out.push(cur.join(" "));
  if (out.length < 3) return null;
  if (out.length > 7) return null;
  const seen = new Set(out.map((x) => x.toLowerCase()));
  if (seen.size !== out.length) return null;
  return out;
}

/* まぎらわしい選択肢を作る。

   **聞き取りの問題で紛らわしいのは「英語が似ているもの」**。
   日本語訳どうしを見比べて遠いものを選ぶと、
   「コーヒー」と「お会計」のように、聞かなくても分かる問題になる（実際そうなっていた）。

   だから英語の似ている順に並べ、上から取る。
   ただし **意味まで同じものは外す**（どちらも正解になってしまう）。

   pool … [{ en, ja, categoryId, familyId }]
   同じ family は言い換えなので必ず外す。 */
const JA_SAME_CEIL = 0.7;    /* 日本語がここまで似ていたら、同じ意味とみなして外す */
const EN_MIN = 0.12;         /* 英語がまったく似ていないものは、選択肢として易しすぎる */

function distractors(atom, pool, n) {
  const cand = pool
    .filter((x) => x.en !== atom.english)
    .filter((x) => x.familyId !== atom.familyId)          /* 言い換えは外す */
    .filter((x) => x.ja && SM.normText(x.ja) !== SM.normText(atom.japanese || ""))
    .filter((x) => jaOverlap(x.ja, atom.japanese) < JA_SAME_CEIL)
    .map((x) => ({
      x,
      /* 英語が似ているほど紛らわしい。同じカテゴリーなら場面も近いので少し足す。 */
      score: SM.overlap(x.en, atom.english) + (x.categoryId === atom.categoryId ? 0.15 : 0)
    }))
    .sort((a, b) => b.score - a.score || a.x.en.localeCompare(b.x.en));

  const near = cand.filter((c) => c.score >= EN_MIN);
  /* 似たものが足りなければ、同じカテゴリーのものから補う（それでも足りなければ諦める）。 */
  const rest = cand.filter((c) => c.score < EN_MIN && c.x.categoryId === atom.categoryId);
  return near.concat(rest).slice(0, n).map((c) => c.x);
}

/* 日本語の重なり。語で切れないので文字の 2 文字組で見る。 */
function jaOverlap(a, b) {
  const g = (s) => {
    const t = String(s || "").replace(/[。、，．・！？\s（）「」]/g, "");
    const out = new Set();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    if (!out.size && t) out.add(t);
    return out;
  };
  const x = g(a), y = g(b);
  if (!x.size || !y.size) return 0;
  let hit = 0;
  x.forEach((k) => { if (y.has(k)) hit++; });
  return hit / Math.max(x.size, y.size);
}

function vid(atomId, act) { return atomId + "__" + act; }

function expand(atom, ctx) {
  const out = [];
  const en = atom.english, ja = atom.japanese || "";
  /* 選択肢のもとは **同じレベルの全レッスン**から取る。
     1 レッスン 14 文だと、あいさつとお礼のように話がまるで違うものしか残らず、
     聞かなくても答えが分かってしまう。 */
  const pool = ctx.pool || [];
  const lv = SM.level(atom.level);

  function add(act, content, answer, extra) {
    out.push(SM.normalizeVariant(Object.assign({
      id: vid(atom.id, act),
      contentAtomId: atom.id,
      familyId: atom.familyId,
      activityType: act,
      content: content,
      answerDefinition: answer,
      status: "published",
      ttsConfig: { speed: lv ? lv.speed : 1 }
    }, extra || {})));
  }

  /* ① 音声を聞いて意味を選ぶ */
  if (ja) {
    const wrong = distractors(atom, pool, 3);
    if (wrong.length >= 3) {
      add("listening_choice", {
        script: en,
        choices: [{ id: "c1", text: ja }].concat(wrong.map((x, i) => ({ id: "c" + (i + 2), text: x.ja })))
      }, "c1", { prompt: "音声を聞いて、意味に合うものを選びましょう。",
                 explanationJa: en + "\n" + ja });
    }
  }

  /* ② 書き取り */
  add("dictation", { script: en, acceptedAnswers: atom.alternativeExpressions || [] }, en,
      { prompt: "音声を聞いて、聞こえたとおりに書きましょう。", explanationJa: ja });

  /* ③④ 穴埋め（音つき・文字だけ） */
  const bw = pickBlankWord(en, atom.blankWord);
  if (bw) {
    const marked = en.replace(new RegExp("\\b" + bw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b"), "【　】");
    if (marked !== en) {
      const blanks = [{ id: "b1", answer: bw, acceptedAnswers: [] }];
      /* 日本語を添える。無いと「a cup of 【　】」の答えが tea でも water でも
         通ってしまい、正解が 1 つに決まらない。 */
      add("audio_fill_blank", { script: en, text: marked, blanks: blanks, japanese: ja }, null,
          { prompt: "音声を聞いて、空いているところを埋めましょう。", explanationJa: en + "\n" + ja });
      add("text_fill_blank", { text: marked, blanks: blanks, japanese: ja }, null,
          { prompt: marked, explanationJa: en });
    }
  }

  /* ⑤ 並べ替え */
  const ch = chunksOf(en);
  if (ch && ja) {
    add("sentence_reorder", { items: ch, japanese: ja }, null,
        { prompt: ja, explanationJa: en });
  }

  /* ⑥ 和文英訳 */
  if (ja) {
    add("translation_to_english", {
      japanese: ja,
      acceptedAnswers: [en].concat(atom.alternativeExpressions || [])
    }, en, { prompt: ja, explanationJa: en });
  }

  /* ⑦ 英文和訳 */
  if (ja) {
    add("translation_to_japanese", { english: en, acceptedAnswers: atom.acceptedMeanings || [] }, ja,
        { prompt: en, explanationJa: ja });
  }

  /* ⑧ 誤文訂正（種に「よくある誤り」があるときだけ） */
  if (atom.commonError) {
    const wrongWord = firstDiff(atom.commonError, en);
    if (wrongWord) {
      add("error_correction", {
        text: atom.commonError,
        errors: [{ wrong: wrongWord.wrong, correct: wrongWord.correct, acceptedAnswers: [] }]
      }, null, { prompt: "誤りを見つけて、正しい形に直しましょう。", explanationJa: en + "\n" + ja });
    }
  }

  /* ⑨ 表現選択（場面が書いてあるときだけ）。
     ここも「英語が似ているもの」を並べる。場面に合うかどうかで選ばせたいので、
     まったく別の話題を並べると読まずに当てられてしまう。 */
  if (atom.situationJa) {
    const wrong = distractors(atom, pool, 3);
    if (wrong.length >= 3) {
      add("best_expression", {
        choices: [{ id: "c1", text: en }].concat(wrong.map((x, i) => ({ id: "c" + (i + 2), text: x.en })))
      }, "c1", { prompt: atom.situationJa + "\nこの場面でいちばん自然な言い方はどれですか。",
                 explanationJa: en + "\n" + ja });
    }
  }

  /* ⑩ フラッシュカード */
  if (ja) add("flashcard", { front: ja, back: en }, en, { prompt: ja });

  /* ⑪⑫⑬ 声を出す形式。**まだ最後まで動かないので draft のまま**。
     画面には「ベータ」を出して、できたふりをしない。 */
  ["speaking_repeat", "pronunciation_practice", "shadowing"].forEach((act) => {
    out.push(SM.normalizeVariant({
      id: vid(atom.id, act), contentAtomId: atom.id, familyId: atom.familyId,
      activityType: act, status: "draft",
      content: { target: en, instruction: ja ? ja + "\n英語で言ってみましょう。" : "英語で言ってみましょう。" },
      answerDefinition: en,
      ttsConfig: { speed: lv ? lv.speed : 1 },
      explanationJa: ja
    }));
  });

  return out;
}

/* 「よくある誤り」と正しい英文を突き合わせて、どの語が違うかを出す。 */
function firstDiff(wrong, right) {
  const a = words(wrong), b = words(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || "") !== (b[i] || "")) {
      if (!a[i]) return null;
      return { wrong: stripPunct(a[i]) || a[i], correct: stripPunct(b[i] || "") || (b[i] || "") };
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════
   読み込みと組み立て
   ══════════════════════════════════════════════════════════════════ */
function loadSeeds() {
  if (!fs.existsSync(SEED_DIR)) return [];
  return fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".json")).sort()
    .map((f) => {
      try { return { file: f, data: JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), "utf8")) }; }
      catch (e) { return { file: f, error: String(e.message || e) }; }
    });
}

/* seed → Atom（Variant はまだ作らない）。
   選択肢のもとになる「同じレベルの全英文」が要るので、2 段階に分ける。 */
function buildAtoms(seed, batchId) {
  const d = seed.data;
  const level = String(d.level || "");
  const categoryId = String(d.categoryId || "");
  const lessonId = String(d.lessonId || "");
  const problems = [];
  if (!SM.level(level)) problems.push("レベルが正しくありません: " + level);
  if (!CATEGORY_BY_ID[categoryId]) problems.push("知らないカテゴリーです: " + categoryId);
  if (!lessonId) problems.push("lessonId がありません");
  if (!Array.isArray(d.atoms) || !d.atoms.length) problems.push("英文がありません");
  if (problems.length) return { ok: false, file: seed.file, problems };

  const now = new Date(0).toISOString();   /* 作り直すたびに差分が出ないよう固定 */
  const atoms = [], raws = [], issues = [];
  d.atoms.forEach((raw, i) => {
    const id = lessonId + "-" + String(i + 1).padStart(2, "0");
    const atom = SM.normalizeAtom({
      id, familyId: String(raw.family || id),
      status: "published", level, categoryId,
      unitId: String(d.unitId || ""), lessonId,
      contentType: String(raw.type || "sentence"),
      english: String(raw.en || ""), japanese: String(raw.ja || ""),
      alternativeExpressions: raw.alt || [],
      acceptedMeanings: raw.altJa || [],
      grammarTags: raw.g || [], vocabularyTags: raw.v || [],
      pronunciationTargets: raw.p || [],
      difficulty: raw.d || (SM.levelOrder(level) + 2),
      source: { generator: "seed:" + seed.file, generatedAt: now, generationBatchId: batchId },
      createdAt: now, updatedAt: now
    });
    const av = SM.validateAtom(atom);
    const fatal = av.filter((x) => x.level === "error");
    if (fatal.length) {
      issues.push({ atomId: id, english: atom.english, problems: fatal.map((x) => x.message) });
      return;                       /* この 1 文だけ外す。レッスンごと落とさない。 */
    }
    av.filter((x) => x.level === "warning").forEach((w) =>
      issues.push({ atomId: id, english: atom.english, warning: w.message }));
    atoms.push(atom);
    raws.push({ atom: atom, blank: raw.blank, err: raw.err, situation: raw.situation });
  });

  return {
    ok: atoms.length > 0,
    file: seed.file,
    lesson: {
      id: lessonId, title: String(d.title || lessonId), categoryId, level,
      unitId: String(d.unitId || ""), order: Number(d.order) || 0,
      goals: (d.goals || []).map(String),
      expressions: (d.expressions || []).map(String),
      estimatedMinutes: Number(d.estimatedMinutes) || 7
    },
    atoms, raws, variants: [], issues,
    dialogues: Array.isArray(d.dialogues) ? d.dialogues : []
  };
}

/* Atom がそろってから Variant を作る。選択肢のもとは同じレベルの全英文。 */
function buildVariants(built) {
  const poolByLevel = new Map();
  for (const b of built) {
    const key = b.lesson.level;
    if (!poolByLevel.has(key)) poolByLevel.set(key, []);
    const pool = poolByLevel.get(key);
    for (const a of b.atoms) {
      if (!a.japanese) continue;
      pool.push({ en: a.english, ja: a.japanese, categoryId: a.categoryId, familyId: a.familyId });
    }
  }
  for (const b of built) {
    const pool = poolByLevel.get(b.lesson.level) || [];
    for (const r of b.raws) {
      expand(Object.assign({}, r.atom, {
        blankWord: r.blank, commonError: r.err, situationJa: r.situation
      }), { pool: pool }).forEach((v) => {
        const bad = SM.validateVariant(v, r.atom).filter((x) => x.level === "error");
        if (bad.length) {
          b.issues.push({ variantId: v.id, activity: v.activityType, problems: bad.map((x) => x.message) });
          return;                     /* この出し方だけ作らない */
        }
        b.variants.push(v);
      });
    }
  }
  return built;
}

/* ══════════════════════════════════════════════════════════════════
   書き出し
   ══════════════════════════════════════════════════════════════════ */
function write(file, obj) {
  if (CHECK_ONLY) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
}

function main() {
  const batchId = "seed-" + fs.statSync(SEED_DIR).mtimeMs.toString(36);
  const seeds = loadSeeds();
  if (!seeds.length) {
    console.log("seed が 1 つもありません: " + SEED_DIR);
    process.exit(1);
  }

  const built = [], broken = [];
  for (const s of seeds) {
    if (s.error) { broken.push({ file: s.file, problems: ["読めません: " + s.error] }); continue; }
    const b = buildAtoms(s, batchId);
    if (!b.ok) { broken.push(b); continue; }
    built.push(b);
  }
  buildVariants(built);

  /* 重複の検出（レッスンをまたいで見る） */
  const allAtoms = built.flatMap((b) => b.atoms);
  const dup = SM.findDuplicates(allAtoms, { nearThreshold: 0.85 });
  const removeSet = new Set(dup.shouldRemove);

  /* 完全一致・正規化一致は落とす。**意味が近いだけのものは残す**（言い換えとして役に立つ）。 */
  let removed = 0;
  for (const b of built) {
    const before = b.atoms.length;
    b.atoms = b.atoms.filter((a) => !removeSet.has(a.id));
    const keep = new Set(b.atoms.map((a) => a.id));
    b.variants = b.variants.filter((v) => keep.has(v.contentAtomId));
    removed += before - b.atoms.length;
  }

  /* 索引と本体を書く */
  const index = new Map();        /* "level/cat" → rows */
  const lessons = [];
  const catStats = new Map();

  for (const b of built) {
    const { level, categoryId, id } = b.lesson;
    write(path.join(OUT_DIR, level, categoryId, id + ".json"), {
      lesson: b.lesson, atoms: b.atoms, variants: b.variants, dialogues: b.dialogues
    });
    const key = level + "/" + categoryId;
    if (!index.has(key)) index.set(key, []);
    const rows = index.get(key);
    const byAtom = new Map(b.atoms.map((a) => [a.id, a]));
    for (const v of b.variants) {
      if (v.status !== "published") continue;    /* 未完成の形式は索引へ入れない */
      const a = byAtom.get(v.contentAtomId);
      rows.push([v.id, v.contentAtomId, v.familyId, v.activityType, id, a ? a.difficulty : 3]);
    }
    lessons.push(Object.assign({}, b.lesson, {
      atomCount: b.atoms.length,
      variantCount: b.variants.filter((v) => v.status === "published").length
    }));
    const cs = catStats.get(categoryId) || { levels: new Set(), lessons: 0, atoms: 0, variants: 0 };
    cs.levels.add(level); cs.lessons++; cs.atoms += b.atoms.length;
    cs.variants += b.variants.filter((v) => v.status === "published").length;
    catStats.set(categoryId, cs);
  }

  for (const [key, rows] of index) write(path.join(OUT_DIR, "index", key + ".json"), { rows });

  const categories = CATEGORIES.filter((c) => catStats.has(c.id)).map((c) => {
    const s = catStats.get(c.id);
    return Object.assign({}, c, {
      levels: [...s.levels].sort((a, b) => SM.levelOrder(a) - SM.levelOrder(b)),
      lessonCount: s.lessons, atomCount: s.atoms, variantCount: s.variants
    });
  });
  const totals = {
    lessons: lessons.length,
    atoms: allAtoms.length - removed,
    variants: lessons.reduce((a, l) => a + l.variantCount, 0),
    categories: categories.length,
    levels: [...new Set(lessons.map((l) => l.level))].length
  };
  write(path.join(OUT_DIR, "curriculum.json"), {
    generatedAt: new Date(0).toISOString(),
    groups: GROUPS, categories, lessons, totals
  });

  /* ── 報告 ── */
  console.log("── VocabuSpeak 教材ビルド ──");
  console.log("  レッスン       : " + totals.lessons);
  console.log("  Content Atom   : " + totals.atoms);
  console.log("  Exercise Variant: " + totals.variants
    + "（1 英文あたり " + (totals.atoms ? (totals.variants / totals.atoms).toFixed(1) : 0) + " 通り）");
  console.log("  カテゴリー     : " + totals.categories + " / レベル " + totals.levels);

  const byAct = new Map();
  built.forEach((b) => b.variants.forEach((v) => {
    if (v.status !== "published") return;
    byAct.set(v.activityType, (byAct.get(v.activityType) || 0) + 1);
  }));
  console.log("\n  出し方の内訳:");
  [...byAct.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log("    " + SM.activityLabel(k).padEnd(16, "　") + " " + n));

  const beta = built.reduce((a, b) => a + b.variants.filter((v) => v.status === "draft").length, 0);
  if (beta) console.log("\n  （まだ出さないもの: " + beta + " 件。声を出す形式は未完成のため索引へ入れていません）");

  console.log("\n── 重複 ──");
  console.log("  完全一致       : " + dup.exact.length);
  console.log("  記号などをそろえると一致: " + dup.normalized.length);
  console.log("  意味が近い     : " + dup.near.length + "（消さずに残す）");
  console.log("  取り除いた     : " + removed);
  if (REPORT && dup.near.length) {
    dup.near.slice(0, 10).forEach((x) =>
      console.log("    " + x.similarity + "  " + x.english[0] + "  ／  " + x.english[1]
        + (x.sameFamily ? "" : "  ← family が違います")));
  }
  if (dup.shouldMergeFamily.length)
    console.log("  family をまとめ直したほうがよいもの: " + dup.shouldMergeFamily.length);

  const allIssues = built.flatMap((b) => b.issues);
  const errors = allIssues.filter((x) => x.problems);
  const warns = allIssues.filter((x) => x.warning);
  console.log("\n── 検証 ──");
  console.log("  作れなかったもの: " + errors.length);
  console.log("  気になるところ  : " + warns.length);
  if (errors.length) errors.slice(0, REPORT ? 100 : 8).forEach((x) =>
    console.log("    NG " + (x.atomId || x.variantId) + "  " + (x.problems || []).join(" / ")));
  if (REPORT && warns.length) warns.slice(0, 40).forEach((x) =>
    console.log("    ・" + x.atomId + "  " + x.warning));

  if (broken.length) {
    console.log("\n── 取り込めなかった seed ──");
    broken.forEach((b) => console.log("  " + b.file + ": " + (b.problems || []).join(" / ")));
  }

  if (CHECK_ONLY) console.log("\n（--check のため書き出していません）");
  else console.log("\n書き出し: " + path.relative(ROOT, OUT_DIR));

  /* 作れなかったものがあっても、他が作れていれば成功とする。
     ただし 1 件も作れなければ失敗。 */
  process.exit(totals.atoms > 0 ? 0 : 1);
}

main();
