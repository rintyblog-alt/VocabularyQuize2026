#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return fallback;
  return String(process.argv[idx + 1] || fallback);
}

function readJson(filePath, fallback = []) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return fallback;
  const raw = fs.readFileSync(abs, 'utf8');
  if (!raw.trim()) return fallback;
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.docs)) return parsed.docs;
    if (Array.isArray(parsed.vocab)) return parsed.vocab;
    if (Array.isArray(parsed.insights)) return parsed.insights;
    if (Array.isArray(parsed.items)) return parsed.items;
  }
  return fallback;
}

function toSafe(v, max = 2000) {
  const s = String(v || '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function normSet(v) {
  return toSafe(v, 80).toLowerCase().replace(/[\s\u3000]+/g, '_');
}

function toMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
    const p = Date.parse(v);
    if (Number.isFinite(p)) return Math.trunc(p);
  }
  return Date.now();
}

function splitChunks(text, minLen = 500, maxLen = 1000) {
  const src = String(text || '').replace(/\r/g, '').trim();
  if (!src) return [];
  const out = [];
  const parts = src.split(/\n\s*\n+/).map((x) => x.trim()).filter(Boolean);
  let cur = '';
  for (const p of parts) {
    if (!cur) {
      cur = p;
      continue;
    }
    if ((cur.length + 2 + p.length) <= maxLen) {
      cur += `\n\n${p}`;
    } else {
      if (cur.length >= minLen) {
        out.push(cur);
        cur = p;
      } else {
        out.push((cur + `\n\n${p}`).slice(0, maxLen));
        cur = '';
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

function defaultProcedures(now, sourceId) {
  return [
    {
      id: 'proc-weak-top-review',
      title: '苦手TOPを優先して復習する',
      trigger: '苦手語が増えている/正答率が不安定',
      suggestions: ['苦手TOP10を先にEXAMで確認', '続けてWRITEで固定', '最後に通常範囲へ戻る'],
      steps: ['苦手語を10件抽出', 'EXAMで意味確認', 'WRITEで3回連続正解', '翌日に再確認'],
      cautions: ['短期変動だけで断定しない', '回答数も同時に見る'],
      alternatives: ['苦手TOP5に絞る', '意味曖昧語だけ再抽出'],
      requiredData: ['wrongIds', 'sessions', 'mode'],
      tags: ['study', 'review', 'weak'],
      updatedAt: now,
      source_id: sourceId
    },
    {
      id: 'proc-insight-weekly',
      title: 'インサイト週次レビュー',
      trigger: '週次の推移を見て改善したい',
      suggestions: ['直近7日と前7日を比較', '最多モードを確認', '次週の施策を2つに絞る'],
      steps: ['回答数/正答率/セッション数を確認', '差分が大きい指標を1つ選ぶ', '施策を実行', '翌週に再評価'],
      cautions: ['データ不足時は結論を保留', '単発値で判断しない'],
      alternatives: ['30日比較を追加', 'モード別に分解'],
      requiredData: ['insights', 'sessions'],
      tags: ['insight', 'analysis'],
      updatedAt: now,
      source_id: sourceId
    }
  ];
}

function buildPack({ docs, vocab, insights, sourceId }) {
  const now = Date.now();
  const pack = {
    schemaVersion: 1,
    updatedAt: now,
    source_id: sourceId,
    facts: [],
    chunks: [],
    procedures: defaultProcedures(now, sourceId),
    vocab: [],
    insights: []
  };

  for (let i = 0; i < (Array.isArray(vocab) ? vocab.length : 0); i += 1) {
    const row = vocab[i] || {};
    const set = normSet(row.set || row.preset || row.group || 'default');
    const no = Number(row.no ?? row.id);
    const term = toSafe(row.term || row.word || row.title || '', 220);
    const meaning = toSafe(row.meaning || row.definition || '', 3000);
    const reading = toSafe(row.reading || '', 220);
    const examples = Array.isArray(row.examples) ? row.examples.map((x) => toSafe(x, 400)).filter(Boolean).slice(0, 10) : [];
    const updatedAt = toMs(row.updatedAt || row.ts || row.timestamp || now);
    const id = toSafe(row.id || (Number.isFinite(no) ? `vocab:${set}:${Math.trunc(no)}` : `vocab:${i + 1}`), 140);
    pack.vocab.push({ id, set, no: Number.isFinite(no) ? Math.trunc(no) : null, term, reading, meaning, examples, tags: Array.isArray(row.tags) ? row.tags : [], updatedAt, source_id: sourceId });
    if (Number.isFinite(no)) {
      pack.facts.push({
        id: `fact:${set}:${Math.trunc(no)}`,
        set,
        no: Math.trunc(no),
        type: 'preset_no',
        title: `${set} No.${Math.trunc(no)}`,
        text: [term, reading, meaning].filter(Boolean).join(' / '),
        tags: Array.isArray(row.tags) ? row.tags : [],
        updatedAt,
        source_id: sourceId
      });
    }
  }

  const has223 = pack.vocab.some((v) => v.set === 'standard_all' && Number(v.no) === 223);
  if (!has223) {
    pack.vocab.push({
      id: 'vocab:standard_all:223',
      set: 'standard_all',
      no: 223,
      term: 'demand',
      reading: '',
      meaning: '需要、要求',
      examples: ['There is growing demand for clean energy.'],
      tags: ['seed', 'required-test'],
      updatedAt: now,
      source_id: sourceId
    });
    pack.facts.push({
      id: 'fact:standard_all:223',
      set: 'standard_all',
      no: 223,
      type: 'preset_no',
      title: 'standard_all No.223',
      text: 'demand / 需要、要求',
      tags: ['seed', 'required-test'],
      updatedAt: now,
      source_id: sourceId
    });
  }

  for (let i = 0; i < (Array.isArray(docs) ? docs.length : 0); i += 1) {
    const row = docs[i] || {};
    const title = toSafe(row.title || row.page || `Doc ${i + 1}`, 220);
    const rawText = toSafe(row.text || row.content || row.body || row.description || '', 60000);
    const chunks = splitChunks(rawText, 500, 1000);
    const baseId = toSafe(row.id || `doc:${i + 1}`, 120);
    for (let ci = 0; ci < chunks.length; ci += 1) {
      pack.chunks.push({
        id: `${baseId}#${ci + 1}`,
        title,
        heading: toSafe(row.heading || '', 200),
        section: toSafe(row.section || '', 200),
        path: toSafe(row.path || '', 300),
        url: toSafe(row.url || row.link || '', 500),
        text: chunks[ci],
        tags: Array.isArray(row.tags) ? row.tags : [],
        updatedAt: toMs(row.updatedAt || now),
        source_id: sourceId
      });
    }
  }

  for (let i = 0; i < (Array.isArray(insights) ? insights.length : 0); i += 1) {
    const row = insights[i] || {};
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    pack.insights.push({
      id: toSafe(row.id || `insight:${i + 1}`, 140),
      title: toSafe(row.title || row.name || `Insight ${i + 1}`, 220),
      url: toSafe(row.url || payload.url || '', 500),
      text: toSafe(row.text || payload.text || payload.summary || '', 6000),
      metrics: payload.metrics && typeof payload.metrics === 'object' ? payload.metrics : (row.metrics && typeof row.metrics === 'object' ? row.metrics : {}),
      tags: Array.isArray(row.tags) ? row.tags : [],
      updatedAt: toMs(row.updatedAt || row.ts || row.timestamp || now),
      source_id: sourceId
    });
  }

  return pack;
}

function main() {
  const docsPath = arg('--docs', 'docs.json');
  const vocabPath = arg('--vocab', 'vocab.json');
  const insightsPath = arg('--insights', 'insights.json');
  const outPath = arg('--out', 'data_pack.json');
  const sourceId = arg('--source-id', 'local-build');

  const docs = readJson(docsPath, []);
  const vocab = readJson(vocabPath, []);
  const insights = readJson(insightsPath, []);

  const pack = buildPack({ docs, vocab, insights, sourceId });
  const outAbs = path.resolve(process.cwd(), outPath);
  fs.writeFileSync(outAbs, JSON.stringify(pack, null, 2), 'utf8');

  process.stdout.write(
    `data_pack generated: ${outAbs}\n` +
    `facts=${pack.facts.length}, chunks=${pack.chunks.length}, procedures=${pack.procedures.length}, vocab=${pack.vocab.length}, insights=${pack.insights.length}\n`
  );
}

main();
