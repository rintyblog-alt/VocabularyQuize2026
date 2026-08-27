#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);
const VERSION = 'v26';
const MIN_DOCS = 600;
const MAX_DOCS = 1200;

const CATEGORY_ORDER = [
  'overview',
  'learn_modes',
  'presets',
  'sharing',
  'insights',
  'notifications',
  'settings',
  'chat_ai',
  'auth',
  'admin',
  'troubleshooting',
  'storage',
  'api'
];

function readIfExists(rel) {
  const abs = path.resolve(ROOT, rel);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf8');
}

function asLines(text) {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function lineOfIndex(text, index) {
  if (index <= 0) return 1;
  return text.slice(0, index).split(/\r?\n/).length;
}

function normSpace(v) {
  return String(v || '').replace(/[\t\u3000 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanText(v) {
  return normSpace(String(v || '').replace(/<[^>]+>/g, ' '));
}

function splitByLength(text, minLen = 200, maxLen = 760) {
  const src = normSpace(text);
  if (!src) return [];
  if (src.length <= maxLen) return [src];
  const chunks = [];
  let cursor = 0;
  while (cursor < src.length) {
    let end = Math.min(src.length, cursor + maxLen);
    if (end < src.length) {
      const window = src.slice(cursor, end + 80);
      const m = window.match(/[。\n.!?：;]\s/g);
      if (m) {
        const pos = window.lastIndexOf(m[m.length - 1]);
        if (pos > minLen * 0.6) {
          end = cursor + pos + m[m.length - 1].length;
        }
      }
    }
    const chunk = normSpace(src.slice(cursor, end));
    if (chunk.length >= Math.max(80, minLen * 0.45)) chunks.push(chunk);
    if (end <= cursor) break;
    cursor = end;
  }
  return chunks.length ? chunks : [src.slice(0, maxLen)];
}

function sha1(input) {
  return crypto.createHash('sha1').update(String(input || ''), 'utf8').digest('hex');
}

function guessCategory(title, tags, source) {
  const t = `${title} ${tags.join(' ')} ${source}`.toLowerCase();
  if (/\/api\//.test(t) || /route|endpoint|http|post|get|delete/.test(t)) return 'api';
  if (/auth|login|register|session|token|bearer|unauthorized/.test(t)) return 'auth';
  if (/admin|maintenance|manage|権限|運営/.test(t)) return 'admin';
  if (/chat|ai|quota|max_tokens|rag|intent|workers ai|model/.test(t)) return 'chat_ai';
  if (/share|qr|code|ttl|\/s\//.test(t)) return 'sharing';
  if (/insight|trend|accuracy|graph|stats|session/.test(t)) return 'insights';
  if (/notification|inbox|publishedat/.test(t)) return 'notifications';
  if (/preset|subject|tag|library|word|meaning|math|latex|diagram/.test(t)) return 'presets';
  if (/turn mode|rundom mode|exam mode|write mode|learning|quiz|judge|timer|choice|hand/.test(t)) return 'learn_modes';
  if (/settings|theme|sound|display|backup|restore|data/.test(t)) return 'settings';
  if (/localstorage|key|storage|d1|kv|r2|schema|table|column/.test(t)) return 'storage';
  if (/error|failed|not found|permission|cors|500|401|429|trouble|faq/.test(t)) return 'troubleshooting';
  return 'overview';
}

const files = {
  rootIndex: readIfExists('index.html'),
  clientIndex: readIfExists('client/index.html'),
  worker: readIfExists('server/src/worker.js'),
  schema: readIfExists('server/schema.sql'),
  wrangler: readIfExists('server/wrangler.toml'),
  readmeRoot: readIfExists('README.md'),
  readmeServer: readIfExists('server/README_SERVER.txt')
};

const docs = [];
const seen = new Set();
const categoryMap = Object.fromEntries(CATEGORY_ORDER.map((k) => [k, []]));

function addDoc({ title, tags = [], text, source, category }) {
  const t = normSpace(title).slice(0, 180);
  const src = normSpace(source).slice(0, 300);
  if (!t || !src) return;
  const chunks = splitByLength(text, 200, 760);
  for (let i = 0; i < chunks.length; i += 1) {
    const body = normSpace(chunks[i]);
    if (!body || body.length < 90) continue;
    const cat = CATEGORY_ORDER.includes(category) ? category : guessCategory(t, tags, src);
    const dedupeKey = sha1(`${t}|${body}|${src}`);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const base = `${cat}-${sha1(`${t}-${src}-${i}`).slice(0, 16)}`;
    const id = docs.some((d) => d.id === base) ? `${base}-${i + 1}` : base;
    const row = {
      id,
      title: i === 0 ? t : `${t} (${i + 1})`,
      tags: Array.from(new Set([`cat:${cat}`, ...tags.map((x) => normSpace(x)).filter(Boolean)])).slice(0, 18),
      text: body,
      source: src,
      updatedAt: TODAY,
      version: VERSION
    };
    docs.push(row);
    categoryMap[cat].push(row.id);
  }
}

function addManualSeeds() {
  const seedRows = [
    {
      title: 'VocabuQuiz 全体概要',
      category: 'overview',
      tags: ['overview', 'app'],
      text: 'VocabuQuiz は学習モード（TURN MODE / RUNDOM MODE / EXAM MODE / WRITE MODE）、プリセット管理、共有、通知、インサイト、チャットAI、設定、管理機能を単一HTML中心で提供する学習アプリです。',
      source: 'index.html#L1'
    },
    {
      title: 'チャットAIの通常/推論モード',
      category: 'chat_ai',
      tags: ['chat', 'ai', 'quota'],
      text: 'チャットは通常と推論モードを持ち、サーバ側でトークン上限と日次クォータを制御します。クライアント改造で制限値を変更できないよう、Workers側で強制する実装です。',
      source: 'server/src/worker.js#handleAiChat'
    },
    {
      title: '共有機能の基本仕様',
      category: 'sharing',
      tags: ['share', 'qr', 'code'],
      text: '共有は6桁コードとQRを利用します。送信側は作成API、受信側は取得APIを使用し、期限切れ・バージョン不一致・未発見の各エラーをJSONコードで返します。',
      source: 'server/src/worker.js#handleShareCreate'
    }
  ];
  seedRows.forEach(addDoc);
}

function extractApiRoutes(workerText) {
  const re = /if \(request\.method === "(GET|POST|DELETE)" && path === "(\/api\/[^"]+)"\) \{/g;
  let m;
  while ((m = re.exec(workerText))) {
    const method = m[1];
    const route = m[2];
    const line = lineOfIndex(workerText, m.index);
    const around = workerText.slice(m.index, Math.min(workerText.length, m.index + 420));
    addDoc({
      title: `API ${method} ${route}`,
      category: route.includes('/auth/') ? 'auth' : 'api',
      tags: ['api', method.toLowerCase(), route.replace(/\//g, '_')],
      text: `Workersルータに ${method} ${route} が定義されています。該当分岐はハンドラへ委譲され、成功・失敗ともJSON応答で返す構成です。周辺コード断片: ${normSpace(around)}`,
      source: `server/src/worker.js#L${line}`
    });
  }
}

function extractFunctions(text, fileLabel) {
  const re = /\n\s*(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    const args = normSpace(m[2]);
    const line = lineOfIndex(text, m.index);
    const start = m.index;
    const end = Math.min(text.length, start + 1200);
    const snippet = normSpace(text.slice(start, end));
    const tags = ['function', name.toLowerCase()];
    if (/auth|token|session|login|register|bearer/i.test(name)) tags.push('auth');
    if (/chat|ai|intent|quota|memory|rag|pack/i.test(name)) tags.push('chat');
    if (/share|qr|code/i.test(name)) tags.push('share');
    if (/insight|stats|trend|graph/i.test(name)) tags.push('insights');
    addDoc({
      title: `関数仕様: ${name}`,
      category: guessCategory(name, tags, fileLabel),
      tags,
      text: `関数 ${name}(${args}) の実装断片です。処理の主語は関数名から推定でき、呼び出し元は同ファイル内イベントやルータ分岐に接続されています。コード抜粋: ${snippet}`,
      source: `${fileLabel}#L${line}`
    });
  }
}

function extractStorageKeys(text, fileLabel) {
  const re = /const\s+([A-Z0-9_]+)\s*=\s*"([^"]+)"\s*;/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    const value = m[2];
    if (!/(KEY|CACHE|TOKEN|MODE|PROFILE|HISTORY|AUTH|SHARE|CHAT|NOTIF|BACKUP|MEMO|INSIGHT|PRESET)/.test(name)) continue;
    const line = lineOfIndex(text, m.index);
    addDoc({
      title: `保存キー: ${value}`,
      category: 'storage',
      tags: ['storage', 'localStorage', name.toLowerCase()],
      text: `${name} は保存キー定数として定義されています。主に window.localStorage 経由で読み書きされ、設定値・履歴・状態の復元に使われます。キー値: ${value}`,
      source: `${fileLabel}#L${line}`
    });
  }

  const opRe = /window\.localStorage\.(getItem|setItem|removeItem)\(([^)]+)\)/g;
  let op;
  while ((op = opRe.exec(text))) {
    const method = op[1];
    const expr = normSpace(op[2]).slice(0, 180);
    const line = lineOfIndex(text, op.index);
    addDoc({
      title: `Storage操作 ${method}`,
      category: 'storage',
      tags: ['storage-op', method],
      text: `window.localStorage.${method} を実行している箇所です。対象式: ${expr}。この処理は状態保持や復元の根拠になります。`,
      source: `${fileLabel}#L${line}`
    });
  }
}

function extractHeadingsAndFaq(text, fileLabel) {
  const headingRe = /<(h1|h2|h3|h4|summary|label|button)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = headingRe.exec(text))) {
    const tag = m[1].toLowerCase();
    const raw = cleanText(m[2]);
    if (!raw || raw.length < 2) continue;
    if (raw.length > 120) continue;
    const line = lineOfIndex(text, m.index);
    const title = tag === 'summary' ? `FAQ/summary: ${raw}` : `UI文言: ${raw}`;
    const isTrouble = /(エラー|失敗|できない|見つからない|permission|unauthorized|期限|not found|429|401|500|失敗)/i.test(raw);
    const category = isTrouble ? 'troubleshooting' : guessCategory(raw, [tag], fileLabel);
    addDoc({
      title,
      category,
      tags: [tag, isTrouble ? 'trouble' : 'ui'],
      text: `画面要素 <${tag}> に定義された文言です。ユーザー導線・FAQ・操作ヒントとして表示され、実装仕様の根拠になります。文言: ${raw}`,
      source: `${fileLabel}#L${line}`
    });
  }
}

function extractErrorCodes(text, fileLabel) {
  const re = /code:\s*"([A-Z0-9_]+)"|message:\s*"([^"]{4,160})"/g;
  let m;
  while ((m = re.exec(text))) {
    const code = m[1] ? String(m[1]) : '';
    const msg = m[2] ? cleanText(m[2]) : '';
    if (!code && !msg) continue;
    const line = lineOfIndex(text, m.index);
    const title = code ? `エラーコード: ${code}` : `エラーメッセージ: ${msg.slice(0, 42)}`;
    const body = code
      ? `サーバ/クライアント処理内で ${code} を返す分岐が存在します。UI側のエラーハンドリングや運用時の切り分けで利用する識別子です。`
      : `実装内に定義されたエラーメッセージです。障害時のユーザー表示またはログ出力に使われます。メッセージ: ${msg}`;
    addDoc({
      title,
      category: 'troubleshooting',
      tags: ['error', code || 'message'],
      text: body,
      source: `${fileLabel}#L${line}`
    });
  }
}

function extractWranglerAndSchema(text, fileLabel) {
  const lines = asLines(text);
  for (let i = 0; i < lines.length; i += 1) {
    const line = normSpace(lines[i]);
    if (!line) continue;
    if (/^name\s*=|^main\s*=|^compatibility_date\s*=|^workers_dev\s*=/.test(line)) {
      addDoc({
        title: `Workers基本設定: ${line}`,
        category: 'api',
        tags: ['workers', 'config'],
        text: `wrangler設定項目として ${line} が定義されています。デプロイ対象・互換日付・公開方式の根拠となります。`,
        source: `${fileLabel}#L${i + 1}`
      });
    }
    if (/^\[ai\]|^binding\s*=\s*"AI"|AI_MODEL_|MODEL_/.test(line)) {
      addDoc({
        title: `AI設定: ${line}`,
        category: 'chat_ai',
        tags: ['ai', 'workers-ai', 'config'],
        text: `Workers AI / モデル関連の設定値です。AIモデル選択やフォールバック挙動を決める根拠になります。`,
        source: `${fileLabel}#L${i + 1}`
      });
    }
    if (/^\[\[d1_databases\]\]|database_name|database_id|binding\s*=\s*"DB"/.test(line)) {
      addDoc({
        title: `D1設定: ${line}`,
        category: 'storage',
        tags: ['d1', 'config'],
        text: `D1データベース接続設定です。認証・履歴・クォータ・検索テーブルの保存先を示します。`,
        source: `${fileLabel}#L${i + 1}`
      });
    }
    if (/CREATE TABLE|CREATE INDEX|CREATE VIRTUAL TABLE|ALTER TABLE/.test(line)) {
      addDoc({
        title: `スキーマ定義: ${line.replace(/\s+/g, ' ').slice(0, 100)}`,
        category: 'storage',
        tags: ['schema', 'd1'],
        text: `SQLスキーマの定義行です。テーブル/インデックス構造の根拠として利用できます。`,
        source: `${fileLabel}#L${i + 1}`
      });
    }
  }
}

function extractReadmeBullets(text, fileLabel) {
  const lines = asLines(text);
  for (let i = 0; i < lines.length; i += 1) {
    const line = normSpace(lines[i]);
    if (!line) continue;
    if (/^-\s+/.test(line) || /^\d+\)\s+/.test(line) || /`\/api\//.test(line)) {
      const clean = line.replace(/^-\s+/, '').replace(/^\d+\)\s+/, '').trim();
      if (clean.length < 3) continue;
      addDoc({
        title: `運用手順: ${clean.slice(0, 70)}`,
        category: guessCategory(clean, ['readme'], fileLabel),
        tags: ['readme', 'ops'],
        text: `READMEに記載された手順/仕様です。運用・デプロイ・トラブルシュート時の確認根拠になります。内容: ${clean}`,
        source: `${fileLabel}#L${i + 1}`
      });
    }
  }
}

function extractCodeWindowChunks(text, fileLabel, categoryHint) {
  const lines = asLines(text);
  const step = 12;
  const windowSize = 16;
  for (let i = 0; i < lines.length; i += step) {
    const part = lines.slice(i, i + windowSize).map((l) => l.trim()).filter(Boolean).join(' ');
    const clean = normSpace(part);
    if (!clean || clean.length < 220) continue;
    if (/^[{}();,.\s]+$/.test(clean)) continue;
    const category = CATEGORY_ORDER.includes(categoryHint) ? categoryHint : guessCategory(clean, ['code-window'], fileLabel);
    addDoc({
      title: `コード断片 ${path.basename(fileLabel)}:${i + 1}-${Math.min(lines.length, i + windowSize)}`,
      category,
      tags: ['code-window', path.basename(fileLabel)],
      text: clean.slice(0, 820),
      source: `${fileLabel}#L${i + 1}`
    });
  }
}

function build() {
  addManualSeeds();

  if (files.rootIndex) {
    extractHeadingsAndFaq(files.rootIndex, 'index.html');
    extractFunctions(files.rootIndex, 'index.html');
    extractStorageKeys(files.rootIndex, 'index.html');
    extractErrorCodes(files.rootIndex, 'index.html');
    extractCodeWindowChunks(files.rootIndex, 'index.html', 'overview');
  }

  if (files.clientIndex) {
    extractHeadingsAndFaq(files.clientIndex, 'client/index.html');
    extractFunctions(files.clientIndex, 'client/index.html');
    extractStorageKeys(files.clientIndex, 'client/index.html');
    extractErrorCodes(files.clientIndex, 'client/index.html');
    extractCodeWindowChunks(files.clientIndex, 'client/index.html', 'overview');
  }

  if (files.worker) {
    extractApiRoutes(files.worker);
    extractFunctions(files.worker, 'server/src/worker.js');
    extractErrorCodes(files.worker, 'server/src/worker.js');
    extractCodeWindowChunks(files.worker, 'server/src/worker.js', 'api');
  }

  if (files.schema) {
    extractWranglerAndSchema(files.schema, 'server/schema.sql');
    extractCodeWindowChunks(files.schema, 'server/schema.sql', 'storage');
  }

  if (files.wrangler) {
    extractWranglerAndSchema(files.wrangler, 'server/wrangler.toml');
  }

  if (files.readmeRoot) {
    extractReadmeBullets(files.readmeRoot, 'README.md');
  }
  if (files.readmeServer) {
    extractReadmeBullets(files.readmeServer, 'server/README_SERVER.txt');
  }

  // 最低件数不足時は細分化チャンクを追加
  if (docs.length < MIN_DOCS) {
    const fallbackSources = [
      ['index.html', files.rootIndex || ''],
      ['client/index.html', files.clientIndex || ''],
      ['server/src/worker.js', files.worker || '']
    ];
    for (const [name, text] of fallbackSources) {
      if (!text) continue;
      const lines = asLines(text);
      for (let i = 0; i < lines.length; i += 8) {
        if (docs.length >= MIN_DOCS + 120) break;
        const fragment = normSpace(lines.slice(i, i + 10).join(' '));
        if (fragment.length < 180) continue;
        addDoc({
          title: `補助断片 ${name}:${i + 1}`,
          category: guessCategory(fragment, ['fallback'], name),
          tags: ['fallback', path.basename(name)],
          text: fragment.slice(0, 820),
          source: `${name}#L${i + 1}`
        });
      }
    }
  }

  // 同カテゴリ偏りを抑えつつ上限調整
  const byCategory = new Map();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
  for (const d of docs) {
    const catTag = d.tags.find((t) => /^cat:/.test(t));
    const cat = catTag ? catTag.replace(/^cat:/, '') : 'overview';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(d);
  }

  let ordered = [];
  for (const cat of CATEGORY_ORDER) {
    const rows = byCategory.get(cat) || [];
    rows.sort((a, b) => a.id.localeCompare(b.id));
    ordered = ordered.concat(rows);
  }

  if (ordered.length > MAX_DOCS) {
    const perCatCap = Math.max(30, Math.floor(MAX_DOCS / CATEGORY_ORDER.length) + 10);
    const trimmed = [];
    for (const cat of CATEGORY_ORDER) {
      const rows = byCategory.get(cat) || [];
      trimmed.push(...rows.slice(0, perCatCap));
    }
    if (trimmed.length > MAX_DOCS) {
      ordered = trimmed.slice(0, MAX_DOCS);
    } else {
      ordered = trimmed;
    }
  }

  if (ordered.length < MIN_DOCS) {
    throw new Error(`generated documents too few: ${ordered.length}`);
  }

  const outDir = path.resolve(ROOT, 'pack');
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'pack.jsonl'), ordered.map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf8');

  const idx = {
    generatedAt: new Date().toISOString(),
    version: VERSION,
    total: ordered.length,
    categories: {},
    files: [
      'index.html',
      'client/index.html',
      'server/src/worker.js',
      'server/schema.sql',
      'server/wrangler.toml',
      'README.md',
      'server/README_SERVER.txt'
    ]
  };
  for (const cat of CATEGORY_ORDER) {
    idx.categories[cat] = ordered.filter((d) => d.tags.includes(`cat:${cat}`)).map((d) => d.id);
  }
  fs.writeFileSync(path.join(outDir, 'pack_index.json'), JSON.stringify(idx, null, 2), 'utf8');

  const readme = [
    '# VocabuQuiz Data Pack',
    '',
    'このディレクトリは VocabuQuiz の client/server 実装から抽出した RAG 向けデータパックです。',
    '',
    '## 生成物',
    '- `pack/pack.jsonl` : 1行1ドキュメント（検索向けチャンク）',
    '- `pack/pack_index.json` : カテゴリ別インデックス',
    '- `pack/README_PACK.md` : この運用手順',
    '',
    '## JSONLスキーマ',
    '```json',
    '{',
    '  "id": "string(一意)",',
    '  "title": "string",',
    '  "tags": ["string"],',
    '  "text": "string",',
    '  "source": "string(根拠: file#line)",',
    '  "updatedAt": "YYYY-MM-DD",',
    '  "version": "v26"',
    '}',
    '```',
    '',
    '## 再生成コマンド',
    '```bash',
    'node server/scripts/generate_pack_jsonl.js',
    '```',
    '',
    '## PACK_SOURCE_URL 設定例',
    '- `https://rintyblog-alt.github.io/VocabularyQuize2026/pack/pack.jsonl`',
    '- Workerが `PACK_SOURCE_URL` から取得する場合はJSONLまたは変換済み `data_pack.json` を配置',
    '',
    '## 更新運用',
    '1. client/index.html や server/src/worker.js を更新',
    '2. 生成スクリプトを再実行',
    '3. `pack/pack.jsonl` と `pack/pack_index.json` をコミット',
    '4. Workers側の pack 同期API（`/api/admin/refresh_pack` など）で再読込',
    '',
    '## 失敗時チェック',
    '- CORS: WorkerのOPTIONS 204 / Access-Control-Allow-Origin',
    '- 404: PACK_SOURCE_URL の配置パス誤り',
    '- JSONL: 1行1JSONで壊れていないか（改行途中の壊れ）',
    '- 検索0件: クエリ正規化（全角半角・大小文字）とタグ一致を確認'
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'README_PACK.md'), readme, 'utf8');

  console.log(`[pack] generated ${ordered.length} docs`);
  for (const cat of CATEGORY_ORDER) {
    console.log(`- ${cat}: ${idx.categories[cat].length}`);
  }
}

build();
