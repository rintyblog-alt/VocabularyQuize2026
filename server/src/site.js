/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz 公式サイト — 経路（段A・2026-08-18）

   ★ いまは /site の下に置いている（★ここが唯一の入口）。ドメインが取れたら
     vocabuquiz.jp を丸ごとここへ向けるだけで移せるように、
     入口の判定を 1 か所（siteRoute）にまとめてある。
   ★ 既存アプリの経路には触れない。/site 以外は素通りする。
   ★ **アセットを取りに行くときに元のリクエストを引き継がない。**
     引き継ぐと Sec-Fetch-Mode: navigate も渡り、アセット側の
     single-page-application フォールバックが効いて
     アプリ本体（12MB の index.html）が返る（/admin で実際に踏んだ）。
   ══════════════════════════════════════════════════════════════════════════ */

/* /site 配下かどうか。ホストで分けるようになったらここだけ直す。
   サイトが使う読み取り専用の口（/api/site/*）もここで引き受ける。 */
export function isSitePath(path) {
  return path === "/site" || path.startsWith("/site/")
    || path.startsWith("/api/site/") || path === "/api/status" || path === "/sitemap.xml";
}

function S(v) { return v === undefined || v === null ? "" : String(v); }
function N(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

/* ★ 記事の URL は **永続**にする（指示書 段F）。
   id は変わらないので、id を slug として使う。
   /site/news/YYYY/MM/<id> の形は、あとから作り直さない。 */
function 記事のURL(id, publishedAtMs) {
  const d = new Date(N(publishedAtMs, Date.now()) + 9 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return "/site/news/" + y + "/" + m + "/" + encodeURIComponent(S(id));
}

/* サイトが読む最新のお知らせ。
   ★ **管理画面（announcements）が書き出した news_articles をそのまま読む。**
     サイト用に別の表を作らない（二重管理をしない）。
   ★ 公開済み・公開日時が来ているものだけ。下書きは出さない。 */
async function 最新のお知らせ(env, 何件) {
  if (!env?.DB) return [];
  try {
    const r = await env.DB.prepare(
      `SELECT id, category, title, summary, published_at
         FROM news_articles
        WHERE status = 'published' AND published_at <= ?1
        ORDER BY published_at DESC LIMIT ?2`
    ).bind(Date.now(), Math.max(1, Math.min(20, N(何件, 1)))).all();
    return ((r && r.results) || []).map((x) => ({
      id: S(x.id),
      category: S(x.category) || "release",
      title: S(x.title),
      summary: S(x.summary).slice(0, 160),
      publishedAt: N(x.published_at),
      url: 記事のURL(x.id, x.published_at)
    }));
  } catch (e) { return []; }
}

/* 段Aで用意した固定ファイル。ここに無いものは 404 を返す
   （SPA フォールバックへ落として本体を返してしまわないため）。 */
const 置いてあるもの = {
  "/site/status.js": "/site/status.js",
  "/site": "/site/index.html",
  "/site/": "/site/index.html",
  "/site/index.html": "/site/index.html",
  "/site/site.css": "/site/site.css",
  "/site/site.js": "/site/site.js",
  "/site/hero.js": "/site/hero.js"
};

const 型 = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8"
};

function 拡張子の型(p) {
  const i = p.lastIndexOf(".");
  return i < 0 ? "application/octet-stream" : (型[p.slice(i)] || "application/octet-stream");
}

/* ══ 稼働状況（段E）════════════════════════════════════════════════════
   ★ **絶対に出さないもの**
     ・提供元の名前と残枠 … 「いつ止まるか」を攻撃者に教えることになる
     ・利用者数の生値・エラーの詳細・個別の利用者・生成物の中身
   ★ 出してよいもの
     ・状態（正常 / 低速 / 障害）・直近 24 時間の稼働率
     ・今日の生成件数（**100 件単位に丸める**）・平均応答時間・最終更新
   ════════════════════════════════════════════════════════════════════════ */
function 丸める(n, 単位) {
  const v = Math.max(0, N(n));
  return Math.round(v / 単位) * 単位;
}
function jstIso(ms) {
  const d = new Date(N(ms, Date.now()) + 9 * 3600 * 1000);
  return d.toISOString().replace("Z", "+09:00");
}
async function 稼働状況(env) {
  const 既定 = {
    state: "operational", uptime_24h: null, generations_today: null,
    avg_latency_ms: null, updated_at: jstIso(Date.now())
  };
  if (!env?.DB) return 既定;
  try {
    const 今 = Date.now();
    const 一日前 = 今 - 24 * 3600 * 1000;
    const 今日 = new Date(今 + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const 今日の始まり = new Date(今日 + "T00:00:00+09:00").getTime();

    /* ai_jobs から直に数える。**提供元ごとの内訳は出さない**（合計だけ）。 */
    const r = await env.DB.prepare(
      `SELECT
         COUNT(*) AS 全部,
         SUM(CASE WHEN status='done' AND error_code='' THEN 1 ELSE 0 END) AS 成功,
         SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS 今日,
         AVG(CASE WHEN completed_at > started_at AND started_at > 0
                  THEN completed_at - started_at END) AS 平均
       FROM ai_jobs WHERE created_at >= ?1`
    ).bind(一日前, 今日の始まり).first();

    const 全部 = N(r?.全部), 成功 = N(r?.成功);
    /* ★ 数が少なすぎるときに「稼働率 66%」と出すのは嘘に近い。
       10 本に満たない日は稼働率を出さない（null で「まだ言えない」）。 */
    const 稼働率 = 全部 >= 10 ? Math.round((成功 / 全部) * 1000) / 10 : null;
    const 平均 = r?.平均 === null || r?.平均 === undefined ? null : Math.round(N(r.平均));

    let 状態 = "operational";
    if (稼働率 !== null && 稼働率 < 90) 状態 = "outage";
    else if ((稼働率 !== null && 稼働率 < 98) || (平均 !== null && 平均 > 20000)) 状態 = "degraded";

    return {
      state: 状態,
      uptime_24h: 稼働率,
      /* ★ 100 件単位に丸める（指示書） */
      generations_today: 丸める(N(r?.今日), 100),
      avg_latency_ms: 平均,
      updated_at: jstIso(今)
    };
  } catch (e) {
    return 既定;
  }
}

export async function handleSiteRequest(request, env) {
  const url = new URL(request.url);
  const path = (url.pathname || "/").replace(/\/{2,}/g, "/");
  if (!isSitePath(path)) return null;

  /* ── サイトが読む口（読み取りだけ。書き込む口は作らない）────────── */
  if (path === "/api/status") {
    return new Response(JSON.stringify(await 稼働状況(env)), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        /* 60 秒の持ち回し（指示書 段E） */
        "Cache-Control": "public, max-age=60"
      }
    });
  }

  if (path === "/api/site/news/latest") {
    const 件 = await 最新のお知らせ(env, N(url.searchParams.get("limit"), 1));
    return new Response(JSON.stringify({ ok: true, items: 件 }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        /* 60 秒の持ち回し。押すたびに D1 を叩かない */
        "Cache-Control": "public, max-age=60"
      }
    });
  }

  const 正 = path.length > 6 && path.endsWith("/") ? path.slice(0, -1) : path;

  /* ── 組み立てて返すページ（段F・段G）────────────────────────────── */
  const html = (body, status) => new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" }
  });

  if (正 === "/site/news") return html(await 一覧ページ(env, url));
  if (正 === "/site/news/feed.xml") {
    return new Response(await rss(env, url), { status: 200, headers: {
      "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  if (正 === "/sitemap.xml" || 正 === "/site/sitemap.xml") {
    return new Response(await sitemap(env, url), { status: 200, headers: {
      "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  const 記事 = /^\/site\/news\/(\d{4})\/(\d{2})\/(.+)$/.exec(正);
  if (記事) {
    const p2 = await 記事ページ(env, url, decodeURIComponent(記事[3]));
    if (p2) return html(p2);
    /* 記事が無いときは 404。**一覧へ黙って飛ばさない**（URL が嘘になる） */
    return html(骨({
      title: "記事が見つかりません — VocabuQuiz",
      description: "指定された記事は見つかりませんでした。",
      url: url.origin + 正, image: url.origin + "/site/og/default.png",
      body: '<section class="section container"><p class="section__label">404</p>'
        + "<h1>記事が見つかりません</h1>"
        + '<p class="section__lead">削除されたか、URL が違っている可能性があります。</p>'
        + '<p style="margin-top:24px"><a class="btn btn--ghost" href="/site/news">お知らせ一覧へ</a></p></section>'
    }), 404);
  }
  const og = /^\/site\/og\/(.+)\.png$/.exec(正);
  if (og) {
    let 種 = 0;
    for (const c of og[1]) 種 = (種 * 31 + c.charCodeAt(0)) >>> 0;
    const png = await ogpPng(種 % 1000);
    return new Response(png, { status: 200, headers: {
      "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
  }
  if (正 === "/site/roadmap") return html(ロードマップページ(url));
  if (正 === "/site/safety")  return html(安全ページ(url));
  if (正 === "/site/about") return html(簡単ページ(url, "運営者情報",
    "このサイトとアプリを運営している者の情報です。",
    "<ul><li>名称: VocabuQuiz</li>"
    + "<li>運営: 個人開発（高校生）</li>"
    + '<li>連絡先: <a href="/site/contact">お問い合わせ</a></li></ul>'
    + "<p>本サービスは個人が開発・運営しています。"
    + "学校や企業との提携関係はありません。</p>"));
  if (正 === "/site/contact") return html(簡単ページ(url, "お問い合わせ",
    "ご質問・不具合のご連絡・データの開示や削除のご請求はこちらへ。",
    '<p>アプリ内の「設定 → お問い合わせ」からご連絡ください。'
    + "サイトからの送信フォームは用意していません"
    + "（迷惑送信を防ぐため、アプリの認証を通した窓口に一本化しています）。</p>"
    + '<p><a class="btn btn--primary" href="/">アプリを開く</a></p>'));
  if (正 === "/site/terms") return html(簡単ページ(url, "利用規約",
    "本サービスをご利用いただく際の条件です。",
    "<p>利用規約はアプリ内でご確認いただけます。"
    + "登録時に同意いただいた版が、そのまま適用されます。</p>"
    + '<p><a class="btn btn--ghost" href="/">アプリで確認する</a></p>'));
  if (正 === "/site/privacy") return html(簡単ページ(url, "プライバシーポリシー",
    "個人情報の取り扱いについて。",
    '<p>取り扱いの考え方は<a href="/site/safety">安全とプライバシー</a>にまとめています。'
    + "正式なプライバシーポリシーの全文はアプリ内でご確認いただけます。</p>"
    + '<p><a class="btn btn--ghost" href="/site/safety">安全とプライバシーを読む</a></p>'));

  const 実体 = 置いてあるもの[正] || 置いてあるもの[path];

  if (!実体) {
    /* ★ まだ作っていない道は **404 とはっきり言う**。
       ここで本体へ落とすと「サイトを開いたのにアプリが出る」になる。
       段F 以降で /site/news などを足したら、上の表に載せる。 */
    return new Response(
      '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>まだありません — VocabuQuiz</title>'
      + '<link rel="stylesheet" href="/site/site.css"></head>'
      + '<body><div class="page"><main id="main" class="section container">'
      + '<p class="section__label">404</p>'
      + '<h1>このページはまだありません</h1>'
      + '<p class="section__lead">段B以降で用意します。</p>'
      + '<p style="margin-top:24px"><a class="btn btn--ghost" href="/site">トップへ戻る</a></p>'
      + '</main></div></body></html>',
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const res = await env.ASSETS.fetch(
    new Request(new URL(実体, url.origin).toString(), { method: "GET" }));
  const h = new Headers(res.headers);
  h.set("Content-Type", 拡張子の型(実体));
  /* 作りかけの間は持ち回しを短くしておく（直したのに古いものが出るのを防ぐ） */
  h.set("Cache-Control", "public, max-age=60");
  h.set("X-Content-Type-Options", "nosniff");
  return new Response(res.body, { status: res.status, headers: h });
}

/* ══════════════════════════════════════════════════════════════════════════
   段F — ニュース（2026-08-18）

   ★ **管理画面が書き出した news_articles をそのまま読む。**
     サイトに編集の口は作らない。二重管理をしない。
   ★ 記事の URL は永続（/site/news/YYYY/MM/<id>）。あとから変えない。
   ★ OGP・JSON-LD・RSS・サイトマップは **サーバで組む**。
     画面側で組むと、SNS のクローラは JavaScript を動かさないので届かない。
   ══════════════════════════════════════════════════════════════════════════ */

const カテゴリ名 = {
  release: "リリース", feature: "新機能",
  maintenance: "メンテナンス", incident: "障害", update: "お知らせ"
};

function esc(v) {
  return S(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function 日付(ms) {
  const d = new Date(N(ms) + 9 * 3600 * 1000);
  return d.getUTCFullYear() + "年" + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日";
}
function 日付ISO(ms) {
  return new Date(N(ms)).toISOString();
}

/* ── ごく小さな Markdown（見出し・段落・箇条書き・強調・リンク・コード）──
   ★ 外の部品を足さない。**受け取った HTML はそのまま出さない**（必ず逃がす）。 */
function md(src) {
  const 行 = S(src).replace(/\r\n?/g, "\n").split("\n");
  const 出 = [];
  let 箇条 = false, コード = false;
  const 飾り = (t) => esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2">$1</a>');
  const 閉じる = () => { if (箇条) { 出.push("</ul>"); 箇条 = false; } };
  for (const l of 行) {
    if (/^```/.test(l)) {
      閉じる();
      出.push(コード ? "</code></pre>" : '<pre class="md-pre"><code>');
      コード = !コード; continue;
    }
    if (コード) { 出.push(esc(l)); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { 閉じる(); const n = Math.min(4, h[1].length + 1); 出.push("<h" + n + ">" + 飾り(h[2]) + "</h" + n + ">"); continue; }
    const li = /^[-*]\s+(.*)$/.exec(l);
    if (li) { if (!箇条) { 出.push("<ul>"); 箇条 = true; } 出.push("<li>" + 飾り(li[1]) + "</li>"); continue; }
    if (!l.trim()) { 閉じる(); continue; }
    閉じる();
    出.push("<p>" + 飾り(l) + "</p>");
  }
  閉じる();
  if (コード) 出.push("</code></pre>");
  return 出.join("\n");
}

async function 記事を取る(env, id) {
  try {
    const r = await env.DB.prepare(
      `SELECT id, category, title, summary, body, cover_url, published_at, updated_at
         FROM news_articles WHERE id = ?1 AND status = 'published' AND published_at <= ?2`
    ).bind(S(id), Date.now()).first();
    return r || null;
  } catch (e) { return null; }
}
async function 記事ら(env, o) {
  o = o || {};
  const w = ["status = 'published'", "published_at <= ?1"];
  const b = [Date.now()];
  if (o.category) { b.push(S(o.category)); w.push("category = ?" + b.length); }
  const 件 = Math.max(1, Math.min(50, N(o.per, 12)));
  const 頁 = Math.max(1, N(o.page, 1));
  try {
    const r = await env.DB.prepare(
      `SELECT id, category, title, summary, cover_url, published_at
         FROM news_articles WHERE ${w.join(" AND ")}
        ORDER BY published_at DESC LIMIT ?${b.length + 1} OFFSET ?${b.length + 2}`
    ).bind(...b, 件, (頁 - 1) * 件).all();
    const c = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM news_articles WHERE ${w.join(" AND ")}`).bind(...b).first();
    return { items: (r && r.results) || [], total: N(c?.n), page: 頁, per: 件 };
  } catch (e) { return { items: [], total: 0, page: 1, per: 件 }; }
}

/* ── ページの外枠。段A の CSS をそのまま使う ────────────────────────── */
function 骨(o) {
  const 説明 = S(o.description).slice(0, 160);
  const url = S(o.url);
  return '<!doctype html>\n<html lang="ja" data-theme="dark">\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + '<meta name="color-scheme" content="dark">\n<meta name="theme-color" content="#0a0612">\n'
    + "<title>" + esc(o.title) + "</title>\n"
    + '<meta name="description" content="' + esc(説明) + '">\n'
    + (url ? '<link rel="canonical" href="' + esc(url) + '">\n' : "")
    /* ── OGP（無いと SNS で広がらない）── */
    + '<meta property="og:type" content="' + esc(o.ogType || "website") + '">\n'
    + '<meta property="og:title" content="' + esc(o.title) + '">\n'
    + '<meta property="og:description" content="' + esc(説明) + '">\n'
    + '<meta property="og:site_name" content="VocabuQuiz">\n'
    + '<meta property="og:locale" content="ja_JP">\n'
    + (url ? '<meta property="og:url" content="' + esc(url) + '">\n' : "")
    + '<meta property="og:image" content="' + esc(o.image) + '">\n'
    + '<meta property="og:image:width" content="1200">\n'
    + '<meta property="og:image:height" content="630">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n'
    + '<meta name="twitter:title" content="' + esc(o.title) + '">\n'
    + '<meta name="twitter:description" content="' + esc(説明) + '">\n'
    + '<meta name="twitter:image" content="' + esc(o.image) + '">\n'
    + '<link rel="alternate" type="application/rss+xml" title="VocabuQuiz ニュース" href="/site/news/feed.xml">\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">\n'
    + '<link rel="stylesheet" href="/site/site.css">\n'
    + (o.jsonld ? '<script type="application/ld+json">' + JSON.stringify(o.jsonld) + "</script>\n" : "")
    + "</head>\n<body>\n"
    + '<a class="skip" href="#main">本文へ移動</a>\n'
    + ヘッダー()
    + '<div class="page"><main id="main">' + o.body + "</main>" + フッター() + "</div>\n"
    + '<script src="/site/site.js" defer></script>\n</body>\n</html>';
}

function ヘッダー() {
  return '<header class="header"><div class="container header__inner">'
    + '<a class="brand" href="/site"><svg class="brand__mark" viewBox="0 0 32 32" preserveAspectRatio="xMidYMid meet"'
    + ' xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
    + '<circle cx="16" cy="16" r="7" fill="#8b5cf6"/>'
    + '<circle cx="16" cy="16" r="11.5" fill="none" stroke="#8b5cf6" stroke-opacity=".55" stroke-width="1.2"/>'
    + '</svg><span>VocabuQuiz</span></a>'
    + '<nav class="nav" aria-label="メインナビゲーション">'
    + '<a class="nav__link" href="/site#lumi">Lumiとは</a>'
    + '<a class="nav__link" href="/site#features">できること</a>'
    + '<a class="nav__link" href="/site/news" data-path="/site/news">ニュース</a>'
    + '<a class="nav__link" href="/site/roadmap" data-path="/site/roadmap">ロードマップ</a>'
    + '<a class="nav__link" href="/site/safety" data-path="/site/safety">安全とプライバシー</a>'
    + '<a class="btn btn--primary" href="/" style="margin-left:8px">アプリを開く</a></nav>'
    + '<button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="menu" aria-label="メニューを開く">'
    + '<span class="burger__bar"></span></button>'
    + "</div></header>"
    + '<div class="menu" id="menu" data-open="false" role="dialog" aria-modal="true" aria-label="メニュー">'
    + '<div class="menu__head"><span class="brand" aria-hidden="true"><span>VocabuQuiz</span></span>'
    + '<button class="menu__close" id="menuClose" type="button" aria-label="メニューを閉じる">'
    + '<svg viewBox="0 0 24 24" width="20" height="20" preserveAspectRatio="xMidYMid meet" fill="none"'
    + ' stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    + "</button></div>"
    + '<ul class="menu__list">'
    + '<li><a class="menu__link" href="/site#lumi">Lumiとは</a></li>'
    + '<li><a class="menu__link" href="/site#features">できること</a></li>'
    + '<li><a class="menu__link" href="/site/news">ニュース</a></li>'
    + '<li><a class="menu__link" href="/site/roadmap">ロードマップ</a></li>'
    + '<li><a class="menu__link" href="/site/safety">安全とプライバシー</a></li></ul>'
    + '<div class="menu__foot"><a class="btn btn--primary" href="/">アプリを開く</a>'
    + '<a class="btn btn--ghost" href="/site/contact">お問い合わせ</a></div></div>';
}

function フッター() {
  return '<footer class="footer"><div class="container">'
    + '<div class="footer__grid">'
    + '<div><p class="footer__title">VocabuQuiz</p>'
    + '<p class="footer__note">話すと、試験になる。AI が作り、機械が確かめる学習ツールです。</p></div>'
    + '<div><p class="footer__title">サイト</p><ul class="footer__list">'
    + '<li><a class="footer__link" href="/site/news">ニュース</a></li>'
    + '<li><a class="footer__link" href="/site/roadmap">ロードマップ</a></li>'
    + '<li><a class="footer__link" href="/site/safety">安全とプライバシー</a></li>'
    + '<li><a class="footer__link" href="/site/news/feed.xml">RSS</a></li></ul></div>'
    + '<div><p class="footer__title">運営</p><ul class="footer__list">'
    + '<li><a class="footer__link" href="/site/about">運営者情報</a></li>'
    + '<li><a class="footer__link" href="/site/contact">お問い合わせ</a></li>'
    + '<li><a class="footer__link" href="/site/terms">利用規約</a></li>'
    + '<li><a class="footer__link" href="/site/privacy">プライバシーポリシー</a></li></ul></div></div>'
    + '<div class="footer__legal"><span>&copy; 2026 VocabuQuiz</span>'
    + "<span>Workplace はβ版です。生成結果は必ずご確認ください。</span></div>"
    + "</div></footer>";
}

/* ── OGP 画像（無いときは紫のグラデーションを返す）──────────────────
   ★ 文字は描いていない。**Worker には字形が無い**ので、
     文字を描くには字形データを持ち込む必要がある。いまは背景だけ。
   ★ SVG では X などが読まないので、**PNG を組み立てて返す**。 */
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}
function chunk(kind, data) {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length);
  const k = new TextEncoder().encode(kind);
  const body = new Uint8Array(k.length + data.length);
  body.set(k); body.set(data, k.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(body));
  const out = new Uint8Array(len.length + body.length + crc.length);
  out.set(len); out.set(body, 4); out.set(crc, 4 + body.length);
  return out;
}
async function ogpPng(seed) {
  const W = 1200, H = 630;
  const raw = new Uint8Array((W * 3 + 1) * H);
  /* 紫の光を 2 つ置いた、暗い紫の背景。中心は seed でずらす。 */
  const cx1 = 300 + (seed % 200), cy1 = 180 + (seed % 120);
  const cx2 = 950 - (seed % 160), cy2 = 470 - (seed % 90);
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0;                       /* filter = none */
    for (let x = 0; x < W; x++) {
      const d1 = Math.hypot(x - cx1, y - cy1) / 520;
      const d2 = Math.hypot(x - cx2, y - cy2) / 460;
      const g1 = Math.max(0, 1 - d1) ** 2;
      const g2 = Math.max(0, 1 - d2) ** 2;
      raw[p++] = Math.min(255, 10 + 128 * g1 + 92 * g2);
      raw[p++] = Math.min(255, 6 + 84 * g1 + 74 * g2);
      raw[p++] = Math.min(255, 18 + 220 * g1 + 200 * g2);
    }
  }
  const cs = new CompressionStream("deflate");
  const w = cs.writable.getWriter();
  w.write(raw); w.close();
  const z = new Uint8Array(await new Response(cs.readable).arrayBuffer());

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", new Uint8Array(0))];
  const 全長 = parts.reduce((a, b) => a + b.length, 0);
  const png = new Uint8Array(全長);
  let o = 0;
  for (const x of parts) { png.set(x, o); o += x.length; }
  return png;
}

/* ── 一覧 ──────────────────────────────────────────────────────────── */
function カード(x, i) {
  return '<a class="news-card reveal" data-delay="' + (i * 60) + '" href="' + esc(記事のURL(x.id, x.published_at)) + '">'
    + '<span class="news-card__cat">' + esc(カテゴリ名[S(x.category)] || "お知らせ") + "</span>"
    + '<span class="news-card__title">' + esc(x.title) + "</span>"
    + '<span class="news-card__date">' + esc(日付(x.published_at)) + "</span>"
    + (S(x.summary) ? '<span class="news-card__sum">' + esc(S(x.summary).slice(0, 90)) + "</span>" : "")
    + "</a>";
}
async function 一覧ページ(env, url) {
  const cat = S(url.searchParams.get("category"));
  const 頁 = N(url.searchParams.get("page"), 1);
  const r = await 記事ら(env, { category: cat, page: 頁, per: 12 });
  const 最後 = Math.max(1, Math.ceil(r.total / r.per));
  const 帯 = ["", "release", "feature", "maintenance", "incident"].map((c) =>
    '<a class="chip' + (c === cat ? " is-on" : "") + '" href="/site/news'
    + (c ? "?category=" + c : "") + '"'
    + (c === cat ? ' aria-current="true"' : "") + ">"
    + (c ? esc(カテゴリ名[c]) : "すべて") + "</a>").join("");

  const 本文 = '<section class="section container">'
    + '<p class="section__label">ニュース</p>'
    + "<h1>お知らせ</h1>"
    + '<p class="section__lead">リリース・新機能・メンテナンス・障害のお知らせです。</p>'
    + '<div class="chips" role="group" aria-label="カテゴリで絞り込む">' + 帯 + "</div>"
    + (r.items.length
      ? '<div class="news-grid">' + r.items.map(カード).join("") + "</div>"
      : '<p class="empty">まだお知らせはありません。</p>')
    + (最後 > 1 ? '<nav class="pager" aria-label="ページ送り">'
        + Array.from({ length: 最後 }, (_, i) => i + 1).map((n) =>
          '<a class="pager__n' + (n === r.page ? " is-on" : "") + '" href="/site/news?'
          + (cat ? "category=" + cat + "&" : "") + "page=" + n + '"'
          + (n === r.page ? ' aria-current="page"' : "") + ">" + n + "</a>").join("")
        + "</nav>" : "")
    + "</section>";

  return 骨({
    title: "お知らせ — VocabuQuiz",
    description: "VocabuQuiz のリリース・新機能・メンテナンス・障害のお知らせ。",
    url: url.origin + "/site/news",
    image: url.origin + "/site/og/default.png",
    body: 本文
  });
}

/* ── 記事 ──────────────────────────────────────────────────────────── */
async function 記事ページ(env, url, id) {
  const a = await 記事を取る(env, id);
  if (!a) return null;
  const 関連 = await 記事ら(env, { per: 4 });
  const ほか = 関連.items.filter((x) => S(x.id) !== S(a.id)).slice(0, 3);
  const 自分 = url.origin + 記事のURL(a.id, a.published_at);
  const 画 = S(a.cover_url) || (url.origin + "/site/og/" + encodeURIComponent(S(a.id)) + ".png");

  const 本文 = '<article class="section container article">'
    + '<p class="section__label">' + esc(カテゴリ名[S(a.category)] || "お知らせ") + "</p>"
    + "<h1>" + esc(a.title) + "</h1>"
    + '<p class="article__date"><time datetime="' + esc(日付ISO(a.published_at)) + '">'
    + esc(日付(a.published_at)) + "</time></p>"
    + (S(a.summary) ? '<p class="section__lead">' + esc(a.summary) + "</p>" : "")
    + '<div class="share" role="group" aria-label="この記事を共有する">'
    + '<a class="btn btn--ghost" rel="noopener" target="_blank" href="https://x.com/intent/post?text='
    + encodeURIComponent(S(a.title)) + "&url=" + encodeURIComponent(自分) + '">Xで共有</a>'
    + '<a class="btn btn--ghost" rel="noopener" target="_blank" href="https://social-plugins.line.me/lineit/share?url='
    + encodeURIComponent(自分) + '">LINEで共有</a>'
    + '<a class="btn btn--ghost" href="mailto:?subject=' + encodeURIComponent(S(a.title))
    + "&body=" + encodeURIComponent(自分) + '">メールで送る</a>'
    + '<button class="btn btn--ghost" type="button" data-copy="' + esc(自分) + '">URLをコピー</button>'
    + "</div>"
    + '<div class="article__body">' + md(a.body) + "</div>"
    + (ほか.length ? '<section class="article__more"><h2>ほかのお知らせ</h2>'
        + '<div class="news-grid">' + ほか.map(カード).join("") + "</div></section>" : "")
    + "</article>";

  return 骨({
    title: S(a.title) + " — VocabuQuiz",
    description: S(a.summary) || S(a.body).replace(/[#*`\[\]]/g, "").slice(0, 120),
    url: 自分,
    image: 画,
    ogType: "article",
    jsonld: {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: S(a.title),
      description: S(a.summary),
      datePublished: 日付ISO(a.published_at),
      dateModified: 日付ISO(a.updated_at || a.published_at),
      image: [画],
      mainEntityOfPage: { "@type": "WebPage", "@id": 自分 },
      publisher: { "@type": "Organization", name: "VocabuQuiz" },
      author: { "@type": "Organization", name: "VocabuQuiz" }
    },
    body: 本文
  });
}

/* ── RSS ───────────────────────────────────────────────────────────── */
async function rss(env, url) {
  const r = await 記事ら(env, { per: 30 });
  const 品 = r.items.map((x) =>
    "<item>"
    + "<title>" + esc(x.title) + "</title>"
    + "<link>" + esc(url.origin + 記事のURL(x.id, x.published_at)) + "</link>"
    + '<guid isPermaLink="true">' + esc(url.origin + 記事のURL(x.id, x.published_at)) + "</guid>"
    + "<category>" + esc(カテゴリ名[S(x.category)] || "お知らせ") + "</category>"
    + "<pubDate>" + new Date(N(x.published_at)).toUTCString() + "</pubDate>"
    + "<description>" + esc(x.summary) + "</description>"
    + "</item>").join("");
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
    + "<title>VocabuQuiz ニュース</title>"
    + "<link>" + esc(url.origin + "/site/news") + "</link>"
    + "<description>VocabuQuiz のお知らせ</description>"
    + "<language>ja</language>"
    + '<atom:link href="' + esc(url.origin + "/site/news/feed.xml") + '" rel="self" type="application/rss+xml"/>'
    + 品 + "</channel></rss>";
}

/* ── サイトマップ ─────────────────────────────────────────────────── */
async function sitemap(env, url) {
  const r = await 記事ら(env, { per: 50 });
  const 固定 = ["/site", "/site/news", "/site/roadmap", "/site/safety"];
  const u = 固定.map((p) => "<url><loc>" + esc(url.origin + p) + "</loc></url>").join("")
    + r.items.map((x) => "<url><loc>" + esc(url.origin + 記事のURL(x.id, x.published_at)) + "</loc>"
      + "<lastmod>" + 日付ISO(x.published_at).slice(0, 10) + "</lastmod></url>").join("");
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + u + "</urlset>";
}

/* ══════════════════════════════════════════════════════════════════════════
   段G — ロードマップ / 安全とプライバシー / 運営まわり（2026-08-18）

   ★ ロードマップに **日付も時期も書かない。**
     書いて実現しなかったときのほうが、書かなかったときより印象が悪い。
   ★ 安全のページは、先生がこれを使うかどうかを決めるページ。
     華やかさより正確さ。**都合の悪いことを省かない。**
   ══════════════════════════════════════════════════════════════════════════ */
const ロードマップの中身 = [
  ["リリース済み", "実装され、検証済みのもの", [
    "話しかけて試験を作る（Quick Mock）",
    "作った紙面を機械が検査して、直してから出す",
    "1 か所だけ直しても、ほかが変わらない編集",
    "プリセットでの出題と、結果の記録",
    "英語のスピーキング（VocabuSpeak）",
    "数式・図形・表の描画（150 種類以上の図）",
    "音声での会話（Lumi Live）",
    "資料（PDF・画像）を読み込んでの作問"
  ]],
  ["開発中", "着手しており、動作を確認しているもの", [
    "文書・表計算・スライド（Workplace／β版）",
    "Lumi が自分で画面を操作して作る",
    "学習データをまとめて見るインサイト",
    "公式サイトとお知らせの配信"
  ]],
  ["検討中", "構想段階のもの", [
    "複数人で同時に使うときの待ち行列の改善",
    "音素まで見るスピーキング評価",
    "他の学習ツールとのデータのやりとり"
  ]]
];

function ロードマップページ(url) {
  const 本文 = '<section class="section container">'
    + '<p class="section__label">ロードマップ</p>'
    + "<h1>いま何ができて、次に何が来るか。</h1>"
    + '<p class="section__lead">'
    + "日付は書きません。書いた時期に間に合わなかったとき、"
    + "はじめから書かなかった場合より信用を損なうからです。"
    + "代わりに「どこまで進んでいるか」を 3 段階で公開します。</p>"
    + ロードマップの中身.map(([名, 説明, ら], i) =>
      '<section class="road reveal" data-delay="' + (i * 60) + '">'
      + '<h2 class="road__h"><span class="road__dot" data-n="' + i + '" aria-hidden="true"></span>'
      + esc(名) + "</h2>"
      + '<p class="road__desc">' + esc(説明) + "</p>"
      + '<ul class="road__list">' + ら.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>"
      + "</section>").join("")
    + "</section>";
  return 骨({
    title: "ロードマップ — VocabuQuiz",
    description: "VocabuQuiz のリリース済み・開発中・検討中の一覧。日付は公開していません。",
    url: url.origin + "/site/roadmap",
    image: url.origin + "/site/og/default.png",
    body: 本文
  });
}

function 安全ページ(url) {
  const 節 = (見出し, 中身) =>
    '<section class="safety reveal"><h2>' + esc(見出し) + "</h2>" + 中身 + "</section>";
  const 本文 = '<section class="section container">'
    + '<p class="section__label">安全とプライバシー</p>'
    + "<h1>あなたが作ったものを、私たちは読みません。</h1>"
    + '<p class="section__lead">'
    + "生徒の氏名や成績、試験問題を扱う道具です。"
    + "都合の悪いことも含めて、そのまま書きます。</p>"

    + 節("生成した問題や書類を、誰が見られるか", "<ul>"
      + "<li><strong>運営（管理者）は、生成物の中身を閲覧しません。</strong>"
      + "管理画面には問題文・書類の内容・氏名・金額を表示しない作りになっています。"
      + "管理者が見られるのは、件数・エラーの種類・容量といった数だけです。</li>"
      + "<li>通報などで内容を確認する必要が生じた場合のみ、確認画面を挟んだうえで閲覧し、"
      + "<strong>誰がいつ何を見たかを記録に残します</strong>。記録は編集も削除もできません。</li>"
      + "<li>公開設定にしたプリセットは、ほかの利用者から見えます。"
      + "公開するかどうかはご自身で選べます。</li></ul>")

    + 節("データの保存場所と保存期間", "<ul>"
      + "<li>データは Cloudflare の日本を含む拠点に保存されます。</li>"
      + "<li>作った問題・書類・学習の記録は、退会するまで保存されます。</li>"
      + "<li>音声での会話の内容は保存しません。次回へ引き継ぐための<strong>要約だけ</strong>を残します。</li>"
      + "<li>操作の記録（いつ・どの機能を使ったか）は、不具合の調査のために一定期間残します。</li></ul>")

    + 節("AI の提供元にデータが渡ること", "<ul>"
      + "<li>問題を作るとき、入力した内容と添付した資料は<strong>外部の AI 提供元へ送られます</strong>。"
      + "これは生成のために必要な処理です。</li>"
      + "<li><strong>無料の枠を使っている間、送った内容が提供元の製品改善に利用される可能性があります。</strong>"
      + "これは提供元の無料枠の条件であり、私たちの側では止められません。"
      + "個人が特定される情報や、外に出せない資料は入力しないでください。</li>"
      + "<li>ご自身の API キーを設定した場合（BYOK）は、そのキーの契約条件が適用されます。"
      + "<strong>設定されたキーの中身を、運営が読むことはありません。</strong>設定の有無だけが分かります。</li></ul>")

    + 節("退会したとき", "<ul>"
      + "<li>退会するとアカウントは利用できなくなり、30 日後にデータを消します。</li>"
      + "<li>30 日以内であれば復元できます。誤って退会した場合はお問い合わせください。</li>"
      + "<li>すでに外部の AI 提供元へ送られた内容は、提供元の方針に従います。"
      + "こちらから取り消すことはできません。</li></ul>")

    + 節("Workplace について", '<div class="notice-beta">'
      + "<strong>Workplace はβ版です。生成結果は必ずご確認ください。</strong>"
      + "文書・表計算・スライドの生成は、まだ思ったとおりにならないことがあります。"
      + "そのまま配布せず、内容を確かめてからお使いください。</div>")

    + 節("お問い合わせ", "<p>ご不明な点は"
      + '<a href="/site/contact">お問い合わせ</a>からご連絡ください。'
      + "個人情報の開示・訂正・削除のご請求も同じ窓口で受け付けます。</p>")
    + "</section>";

  return 骨({
    title: "安全とプライバシー — VocabuQuiz",
    description: "生成物を誰が見られるか、データの保存、AI 提供元への送信、退会時の削除について。",
    url: url.origin + "/site/safety",
    image: url.origin + "/site/og/default.png",
    body: 本文
  });
}

function 簡単ページ(url, 題, 導入, 中身) {
  return 骨({
    title: 題 + " — VocabuQuiz",
    description: 導入,
    url: url.origin + url.pathname,
    image: url.origin + "/site/og/default.png",
    body: '<section class="section container"><p class="section__label">' + esc(題) + "</p>"
      + "<h1>" + esc(題) + "</h1>"
      + '<p class="section__lead">' + esc(導入) + "</p>"
      + '<div class="article__body">' + 中身 + "</div></section>"
  });
}
