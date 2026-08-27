#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  return String(process.argv[i + 1] || fallback);
}

function toSafe(v, max = 2000) {
  const s = String(v || "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function normalize(v) {
  return String(v || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]/g, " ")
    .trim();
}

function splitIntoChunks(textInput, minLen = 500, maxLen = 1000) {
  const src = String(textInput || "").replace(/\r/g, "").trim();
  if (!src) return [];
  const blocks = src.split(/\n\s*\n+/).map((x) => x.trim()).filter(Boolean);
  if (!blocks.length) return [];
  const out = [];
  let cur = "";
  for (const block of blocks) {
    if (!cur) {
      cur = block;
      continue;
    }
    if ((cur.length + 2 + block.length) <= maxLen) {
      cur += `\n\n${block}`;
      continue;
    }
    if (cur.length >= minLen) {
      out.push(cur);
      cur = block;
      continue;
    }
    const merged = `${cur}\n\n${block}`;
    out.push(merged.slice(0, maxLen));
    cur = merged.slice(maxLen);
  }
  if (cur) out.push(cur);
  return out;
}

function decodeHtmlEntities(src) {
  return String(src || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function cleanLine(src) {
  const line = decodeHtmlEntities(String(src || "")).replace(/\s+/g, " ").trim();
  if (!line) return "";
  if (line.length < 3 || line.length > 260) return "";
  if (!/[A-Za-z0-9一-龯ぁ-んァ-ヶ]/.test(line)) return "";
  if (/(function\s*\(|=>|const\s+|let\s+|var\s+|<\/|^https?:\/\/\S+$|;)/.test(line)) return "";
  return line;
}

function extractScriptStrings(jsSource, maxItems = 8000) {
  const src = String(jsSource || "");
  const out = [];
  const seen = new Set();
  const re = /"(?:\\.|[^"\\]){3,240}"|'(?:\\.|[^'\\]){3,240}'/g;
  let m;
  while ((m = re.exec(src))) {
    let t = String(m[0] || "");
    t = t.slice(1, -1)
      .replace(/\\n/g, " ")
      .replace(/\\r/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\\"/g, "\"")
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");
    const line = cleanLine(t);
    if (!line) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= maxItems) break;
  }
  return out;
}

function classify(lineInput) {
  const n = normalize(lineInput);
  const defs = [
    { section: "help", heading: "ヘルプ/FAQ", tags: ["help", "faq"], re: /(help|faq|よくある質問|使い方|操作方法|トラブル)/ },
    { section: "settings", heading: "設定", tags: ["settings"], re: /(settings|設定|theme|sound|display|データ管理|admin)/ },
    { section: "terms", heading: "利用規約", tags: ["terms"], re: /(利用規約|terms|プライバシー|privacy|同意)/ },
    { section: "report", heading: "お問い合わせ/Report", tags: ["report"], re: /(report|問い合わせ|お問い合わせ|emailjs|不具合報告)/ },
    { section: "preset", heading: "プリセット管理", tags: ["preset"], re: /(preset|プリセット|my preset|library|共有から追加|共有)/ },
    { section: "insight", heading: "インサイト", tags: ["insight"], re: /(insight|インサイト|推移|分析|正答率|グラフ)/ },
    { section: "modes", heading: "学習モード", tags: ["mode"], re: /(turn mode|rundom mode|exam mode|write mode|モード|制限時間)/ },
    { section: "notification", heading: "通知", tags: ["notification"], re: /(通知|inbox|詳細を見る|既読|未読)/ },
    { section: "account", heading: "アカウント", tags: ["auth"], re: /(ログイン|新規登録|ゲスト|アカウント|nickname|password)/ },
    { section: "chat", heading: "AIチャット", tags: ["chat", "ai"], re: /(chat|vq ai|instant|deep|token|推論|即時|利用制限)/ }
  ];
  for (const d of defs) if (d.re.test(n)) return d;
  if (/vocabuquiz|offline|local save|no ads|共有|通知|設定/.test(n)) {
    return { section: "general", heading: "全体案内", tags: ["general"] };
  }
  return null;
}

function normalizeFact(row, i, sourceId, now) {
  return {
    id: toSafe(row.id || `fact:${i + 1}`, 160),
    set: toSafe(row.set || "", 80),
    no: Number.isFinite(Number(row.no)) ? Math.trunc(Number(row.no)) : null,
    type: toSafe(row.type || "site_fact", 40),
    title: toSafe(row.title || `Fact ${i + 1}`, 220),
    text: toSafe(row.text || "", 5000),
    url: toSafe(row.url || "", 500),
    tags: Array.isArray(row.tags) ? row.tags.slice(0, 20) : [],
    updatedAt: Number(row.updatedAt || now),
    source_id: toSafe(row.source_id || sourceId, 120)
  };
}

function normalizeChunk(row, i, sourceId, now) {
  return {
    id: toSafe(row.id || `chunk:${i + 1}`, 160),
    title: toSafe(row.title || "Untitled", 220),
    heading: toSafe(row.heading || "", 220),
    section: toSafe(row.section || "", 220),
    path: toSafe(row.path || "", 500),
    url: toSafe(row.url || "", 500),
    text: toSafe(row.text || "", 9000),
    tags: Array.isArray(row.tags) ? row.tags.slice(0, 20) : [],
    updatedAt: Number(row.updatedAt || now),
    source_id: toSafe(row.source_id || sourceId, 120)
  };
}

function normalizePack(rawPack, sourceId = "site-crawl") {
  const now = Date.now();
  const raw = rawPack && typeof rawPack === "object" ? rawPack : {};
  return {
    schemaVersion: 1,
    updatedAt: now,
    source_id: sourceId,
    facts: (Array.isArray(raw.facts) ? raw.facts : []).map((r, i) => normalizeFact(r, i, sourceId, now)),
    chunks: (Array.isArray(raw.chunks) ? raw.chunks : []).map((r, i) => normalizeChunk(r, i, sourceId, now)),
    procedures: Array.isArray(raw.procedures) ? raw.procedures : [],
    vocab: Array.isArray(raw.vocab) ? raw.vocab : [],
    insights: Array.isArray(raw.insights) ? raw.insights : []
  };
}

function extractPackPartsFromHtml(html, sourceUrl, sourceId, minLen, maxLen) {
  const now = Date.now();
  const noStyleScript = String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");
  const bodyText = noStyleScript.replace(/<[^>]+>/g, "\n");
  const bodyLines = bodyText.split(/\n+/g).map((x) => cleanLine(x)).filter(Boolean);
  const scriptBodies = Array.from(String(html || "").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)).map((m) => String(m[1] || ""));
  const scriptLines = scriptBodies.flatMap((s) => extractScriptStrings(s, 5000));
  const lines = [];
  const seen = new Set();
  for (const line of bodyLines.concat(scriptLines)) {
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= 12000) break;
  }

  const buckets = new Map();
  for (const line of lines) {
    const cls = classify(line);
    if (!cls) continue;
    if (!buckets.has(cls.section)) {
      buckets.set(cls.section, { section: cls.section, heading: cls.heading, tags: cls.tags.slice(0, 10), lines: [] });
    }
    const b = buckets.get(cls.section);
    if (!b.lines.includes(line)) b.lines.push(line);
  }

  const chunks = [];
  const facts = [];
  for (const b of buckets.values()) {
    const text = b.lines.join("\n");
    const partChunks = splitIntoChunks(text, minLen, maxLen);
    for (let i = 0; i < partChunks.length; i += 1) {
      chunks.push(normalizeChunk({
        id: `chunk:site:${b.section}:${i + 1}`,
        title: `VocabuQuiz ${b.heading}`,
        heading: b.heading,
        section: b.section,
        path: b.section,
        url: sourceUrl,
        text: partChunks[i],
        tags: b.tags,
        updatedAt: now,
        source_id: sourceId
      }, chunks.length, sourceId, now));
    }
    let j = 0;
    for (const line of b.lines) {
      const n = normalize(line);
      if (!/(mode|設定|共有|通知|利用規約|report|inbox|chat|token|制限|exam|write|turn|rundom|offline|local save|no ads|ログイン|ゲスト|インサイト|グラフ)/.test(n)) continue;
      facts.push(normalizeFact({
        id: `fact:site:${b.section}:${j + 1}`,
        type: "site_fact",
        title: `${b.heading} #${j + 1}`,
        text: line,
        section: b.section,
        url: sourceUrl,
        tags: b.tags,
        updatedAt: now,
        source_id: sourceId
      }, facts.length, sourceId, now));
      j += 1;
      if (j >= 200) break;
    }
  }

  return {
    chunks,
    facts,
    stats: {
      lineCount: lines.length,
      sectionCount: buckets.size,
      chunkCount: chunks.length,
      factCount: facts.length
    }
  };
}

async function main() {
  const url = arg("--url", "https://rintyblog-alt.github.io/VocabularyQuize2026/");
  const out = arg("--out", "./site_data_pack.json");
  const base = arg("--base", "");
  const sourceId = arg("--source-id", "site-crawl:manual");
  const minLen = Number(arg("--min", "500")) || 500;
  const maxLen = Number(arg("--max", "1000")) || 1000;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FETCH_FAILED:${res.status}`);
  }
  const html = await res.text();
  const parts = extractPackPartsFromHtml(html, url, sourceId, minLen, maxLen);

  let basePack = {};
  if (base) {
    const abs = path.resolve(process.cwd(), base);
    if (fs.existsSync(abs)) {
      basePack = JSON.parse(fs.readFileSync(abs, "utf8") || "{}");
    }
  }
  const normalizedBase = normalizePack(basePack, sourceId);
  const preservedFacts = (Array.isArray(normalizedBase.facts) ? normalizedBase.facts : []).filter((f) => {
    const t = String(f.type || "");
    return t === "preset_no" || t === "vocab_no";
  });
  const pack = normalizePack({
    ...normalizedBase,
    facts: preservedFacts.concat(parts.facts),
    chunks: parts.chunks,
    updatedAt: Date.now(),
    source_id: sourceId
  }, sourceId);

  const outAbs = path.resolve(process.cwd(), out);
  fs.writeFileSync(outAbs, JSON.stringify(pack, null, 2), "utf8");
  const hash = crypto.createHash("sha256").update(html).digest("hex");
  process.stdout.write(
    `pack generated: ${outAbs}\n` +
    `hash=${hash}\n` +
    `facts=${pack.facts.length}, chunks=${pack.chunks.length}, vocab=${pack.vocab.length}, insights=${pack.insights.length}\n` +
    `extract=${JSON.stringify(parts.stats)}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`generate_site_pack failed: ${String(err?.message || err)}\n`);
  process.exit(1);
});
