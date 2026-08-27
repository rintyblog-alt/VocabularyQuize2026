/* ══════════════════════════════════════════════════════════════════════
   AI アクティビティ（AI と一緒に作っている様子を見せる層）

   これまで「処理ログ」は 1 行ずつの平らな並びだった。
   何が起きたかは読めても、どれが 1 つの工程で、どこで時間を使い、
   何を見て決めたのかが分からない。ここではそれを作り直す。

   ・タイムライン（縦線 ＋ 点 ＋ カード）で工程のつながりを見せる
   ・種類ごとに点の色とアイコンを変える（13 種）
   ・裏で走った処理は Bash カードにして IN / OUT を畳んで持たせる
   ・普段は「タイトル ＋ 一言」だけ。詳しくは開いたときだけ出す
   ・下に追加指示欄を常設し、送った指示は timeline にも並ぶ

   出す文章は日本語の自然文にする。内部コード（issue code / stage 名）は
   詳細の中だけに置く。表に出すのは「AI が説明している言葉」だけ。

   公開: VQ2.activity
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui;
  var esc = U.esc, icon = U.icon, btn = U.button;
  var doc = root.document;

  var seq = 0;
  function nextId() { seq++; return "tl" + seq; }

  /* ══════════════════════════════════════════════════════════════════
     種類（13 種）
     tone は点とカードの色味。label は種類そのものの呼び名（読み上げ用）。
     ══════════════════════════════════════════════════════════════════ */
  var KINDS = {
    info:            { icon: "info",     tone: "neutral", label: "お知らせ" },
    success:         { icon: "check",    tone: "success", label: "完了" },
    warning:         { icon: "warning",  tone: "warning", label: "注意" },
    error:           { icon: "error",    tone: "danger",  label: "失敗" },
    thinking:        { icon: "brain",    tone: "accent",  label: "考えています" },
    bash:            { icon: "terminal", tone: "mono",    label: "処理" },
    "user-followup": { icon: "user",     tone: "accent",  label: "あなたの指示" },
    validation:      { icon: "shield",   tone: "info",    label: "検証" },
    repair:          { icon: "wrench",   tone: "warning", label: "修復" },
    generation:      { icon: "sparkle",  tone: "accent",  label: "作成" },
    planning:        { icon: "list",     tone: "info",    label: "構成" },
    document:        { icon: "doc",      tone: "info",    label: "資料" },
    upload:          { icon: "upload",   tone: "info",    label: "取り込み" }
  };
  function kindMeta(k) { return KINDS[k] || KINDS.info; }

  /* ══════════════════════════════════════════════════════════════════
     サーバ／クライアントの工程名 → 見せ方

     bash を持つものは Bash カードにする（仕様 J「Bash ログ化すべきもの」）。
     hide は表に出さない（つなぎ込みや後始末。見えても何もできない）。
     fallback は label が空で届いたときだけ使う。
     ══════════════════════════════════════════════════════════════════ */
  var MAP = {
    /* 待ち・つなぎ込み */
    "queue.wait":           { kind: "info", fallback: "順番を待っています" },
    "local.bridge.connect": { kind: "info", hide: true },
    "model.check":          { kind: "info", fallback: "AI の準備を確認しています" },
    "model.load":           { kind: "info", fallback: "AI を読み込んでいます" },
    "model.ready":          { kind: "info", fallback: "AI の準備ができました" },
    "model.release":        { kind: "info", hide: true },
    "local.model.check":    { kind: "info", fallback: "AI の準備を確認しています" },
    "local.model.load":     { kind: "info", fallback: "AI を読み込んでいます" },
    "local.model.ready":    { kind: "info", fallback: "AI の準備ができました" },

    /* 考える */
    "orchestrator.route":   { kind: "thinking", fallback: "依頼の内容を読み取っています" },
    "orchestrator.budget":  { kind: "thinking", hide: true },

    /* 資料 */
    "context.prepare":       { kind: "document", bash: "資料を読み取り", fallback: "資料を読み取っています" },
    "local.context.prepare": { kind: "document", bash: "資料を読み取り", fallback: "資料を読み取っています" },
    "context.retrieve":      { kind: "document", bash: "資料を検索",    fallback: "資料から出題できる箇所を探しています" },
    "context.rerank":        { kind: "document", bash: "資料を絞り込み", fallback: "使う箇所を絞り込んでいます" },
    "worker.document":       { kind: "document", bash: "資料を確認",    fallback: "資料を確認しています" },
    "worker.vision":         { kind: "document", bash: "画像を読み取り", fallback: "画像を読み取っています" },
    /* 資料の読み取り状況そのもの。行としては出さず、添付カードの表示に使う。 */
    "attachment.analysis":   { kind: "document", hide: true },
    "local.image.encode":    { kind: "document", bash: "画像を読み取り", fallback: "画像を読み取っています" },
    "worker.digest":         { kind: "document", bash: "資料を要約",    fallback: "資料の要点をまとめています" },
    "worker.code":           { kind: "bash",     bash: "計算",         fallback: "計算しています" },

    /* 組み立て */
    "plan.create":         { kind: "planning",   bash: "出題条件を整理", fallback: "出題条件を整理しています" },
    "draft.create":        { kind: "generation", fallback: "問題を作っています" },
    "draft.revise":        { kind: "generation", fallback: "問題を直しています" },
    "local.response.generate": { kind: "generation", fallback: "問題を作っています" },
    "answer.synthesize":   { kind: "generation", fallback: "解答をまとめています" },
    "answer.bind":         { kind: "generation", fallback: "解答を問題に結びつけています" },
    "answer.format":       { kind: "generation", fallback: "体裁を整えています" },

    /* 確かめる */
    "schema.validate":        { kind: "validation", bash: "形を検証",   fallback: "形式を検証しています" },
    "evidence.verify":        { kind: "validation", bash: "根拠を照合", fallback: "正解の根拠を確認しています" },
    "local.response.verify":  { kind: "validation", bash: "根拠を照合", fallback: "内容を確認しています" },
    "critic.review":          { kind: "validation", fallback: "できあがりを見直しています" },
    "patch.metric":           { kind: "repair", hide: true },
    "request.completed":      { kind: "success", fallback: "できあがりました" },

    /* 画面側で足す工程（ui. で始める。サーバの語彙とぶつけない） */
    "ui.request":     { kind: "user-followup", fallback: "依頼を受け取りました" },
    "ui.followup":    { kind: "user-followup", fallback: "追加の指示を受け取りました" },
    "ui.upload":      { kind: "upload",     bash: "資料を取り込み", fallback: "資料を取り込みました" },
    "ui.plan":        { kind: "planning",   fallback: "構成案を作っています" },
    "ui.section":     { kind: "generation", fallback: "大問を作っています" },
    "ui.validate":    { kind: "validation", bash: "検証",             fallback: "できあがりを検証しています" },
    "ui.repair.scan": { kind: "repair",     bash: "修復対象を抽出",   fallback: "直せるところを探しています" },
    "ui.repair":      { kind: "repair",     fallback: "修復案を作っています" },
    "ui.repair.apply":{ kind: "repair",     fallback: "修復案を反映しました" },
    "ui.backfill":    { kind: "repair",     bash: "不足問題を補充",   fallback: "足りないぶんを作っています" },
    "ui.layout":      { kind: "document",   bash: "レイアウトを解析", fallback: "紙面の割り付けを計算しています" },
    "ui.paper":       { kind: "document",   fallback: "紙面を組み立てています" },
    "ui.artifact":    { kind: "document",   fallback: "成果物を書き出しています" },
    "ui.save":        { kind: "success",    fallback: "保存しました" },
    "ui.stop":        { kind: "warning",    fallback: "生成を停止しました" }
  };

  /* 前方一致でも拾う（worker.xxx / workspace.xxx のような枝分かれ） */
  function mapOf(type) {
    var t = String(type || "");
    if (MAP[t]) return MAP[t];
    var head = t.split(".")[0];
    if (head === "worker") return { kind: "bash", bash: "処理" };
    if (head === "workspace") return { kind: "thinking" };
    if (head === "context") return { kind: "document", bash: "資料を確認" };
    if (head === "answer") return { kind: "generation" };
    if (head === "draft") return { kind: "generation" };
    if (head === "model" || head === "local") return { kind: "info" };
    return { kind: "info" };
  }

  function statusOf(s) {
    return s === "running" ? "running"
      : s === "failed" ? "error"
      : s === "warning" ? "warn"
      : "done";
  }

  /* ══════════════════════════════════════════════════════════════════
     detail 文字列 → OUT の行

     サーバは "理由=length / 使用=2048 / 上限=4096" のような形で送ってくる。
     これを機械的に k / v へ割る。割れないものは 1 行そのまま出す。
     ══════════════════════════════════════════════════════════════════ */
  function parseDetail(detail) {
    var s = String(detail || "").trim();
    if (!s) return [];
    var parts = s.split(/\s*\/\s*/);
    var out = [], plain = [];
    parts.forEach(function (p) {
      var m = /^([^=:]{1,24})\s*[=:]\s*(.+)$/.exec(p.trim());
      if (m) out.push({ k: m[1].trim(), v: m[2].trim() });
      else if (p.trim()) plain.push(p.trim());
    });
    if (!out.length) return [{ k: "", v: s }];
    if (plain.length) out.push({ k: "", v: plain.join(" / ") });
    return out;
  }

  function fmtMs(ms) {
    var n = Number(ms) || 0;
    if (n < 1000) return n + "ms";
    if (n < 60000) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + "秒";
    return Math.floor(n / 60000) + "分" + Math.round((n % 60000) / 1000) + "秒";
  }
  function fmtClock(at) {
    var d = new Date(at || Date.now());
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2)
      + ":" + ("0" + d.getSeconds()).slice(-2);
  }

  /* ══════════════════════════════════════════════════════════════════
     資料の解析結果（metrics.sourcePlan.files）→ Bash カード

     仕様 E-5 の例そのもの。IN にファイル名、OUT に数を並べる。
     ══════════════════════════════════════════════════════════════════ */
  function bashFromFiles(files, audit) {
    var list = (files || []).filter(function (f) { return f && f.included !== false; });
    if (!list.length) return null;
    var pages = 0, chars = 0, ev = 0;
    var inLines = list.map(function (f) {
      pages += Number(f.pageCount) || 0;
      chars += Number(f.extractedCharacterCount) || 0;
      ev += Number(f.evidenceCount) || 0;
      return String(f.fileName || "（名前なし）");
    });
    var out = [
      { k: "pageCount", v: String(pages) },
      { k: "extractedCharacterCount", v: String(chars) },
      { k: "evidenceCount", v: String(ev || (audit && audit.evidenceCount) || 0) }
    ];
    if (audit && audit.contentCharacters != null)
      out.push({ k: "contentCharacters", v: String(audit.contentCharacters) });
    var summary = pages + "ページ / 抽出文字数 " + chars + " / evidence "
      + (ev || (audit && audit.evidenceCount) || 0) + "件";
    return { name: "資料を確認", in: inLines, out: out, summary: summary };
  }

  /* ══════════════════════════════════════════════════════════════════
     Bash カード
     ══════════════════════════════════════════════════════════════════ */
  function bashHtml(b, id, open) {
    if (!b) return "";
    /* まだ何も返ってきていないうちは、開いても空なので畳んだ見た目にしない。
       中身ができてから開ける形にする（空の引き出しを見せない）。 */
    var hasBody = !!((b.in || []).length || (b.out || []).length);
    var lines = (b.out || []).map(function (r) {
      return r.k
        ? '<div class="vq2-bash-r"><span class="vq2-bash-k2">' + esc(r.k) + "</span>"
          + '<span class="vq2-bash-v">' + esc(r.v) + "</span></div>"
        : '<div class="vq2-bash-r"><span class="vq2-bash-v">' + esc(r.v) + "</span></div>";
    }).join("");
    var ins = (b.in || []).map(function (r) {
      return '<div class="vq2-bash-r"><span class="vq2-bash-v">' + esc(r) + "</span></div>";
    }).join("");
    var isOpen = open && hasBody;
    return '<div class="vq2-bash' + (isOpen ? " is-open" : "") + (hasBody ? "" : " is-empty") + '">'
      + '<button type="button" class="vq2-bash-h" data-tlbash="' + esc(id) + '"'
      + ' aria-expanded="' + (isOpen ? "true" : "false") + '"'
      + (hasBody ? "" : " disabled") + ">"
      + '<span class="vq2-bash-tag">Bash</span>'
      + '<span class="vq2-bash-n">' + esc(b.name || "処理") + "</span>"
      + (b.summary ? '<span class="vq2-bash-s">' + esc(b.summary) + "</span>"
                   : '<span class="vq2-bash-s">' + (hasBody ? "" : "実行中…") + "</span>")
      + (hasBody ? '<span class="vq2-bash-c">' + icon(isOpen ? "chevronU" : "chevronD") + "</span>" : "")
      + "</button>"
      + '<div class="vq2-bash-b"' + (isOpen ? "" : " hidden") + ">"
      + (ins ? '<div class="vq2-bash-sec"><div class="vq2-bash-l">IN</div>' + ins + "</div>" : "")
      + (lines ? '<div class="vq2-bash-sec"><div class="vq2-bash-l">OUT</div>' + lines + "</div>" : "")
      + "</div></div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     1 件のカード
     ══════════════════════════════════════════════════════════════════ */
  function itemHtml(e) {
    var m = kindMeta(e.kind);
    var cls = "vq2-tl-i k-" + e.kind + " t-" + m.tone + " is-" + e.status;
    var h = '<li class="' + cls + '" data-tlid="' + esc(e.id) + '">';

    /* 左：縦線と点 */
    /* 左の印。動いている間だけ回るしるし、終わったら小さな丸。
       種類ごとのアイコンは見出しの前へ小さく置く（点が大きいと行が太る）。 */
    h += '<div class="vq2-tl-rail" aria-hidden="true"><span class="vq2-tl-node">'
      + (e.status === "running" ? '<span class="vq2-spin sm"></span>' : '<span class="vq2-tl-dot"></span>')
      + "</span></div>";

    /* 右：カード */
    h += '<div class="vq2-tl-card">';
    h += '<div class="vq2-tl-h">'
      + '<span class="vq2-tl-ic" aria-hidden="true">' + icon(m.icon) + "</span>"
      + '<span class="vq2-tl-t">' + esc(e.title || m.label) + "</span>";
    if (e.badge && e.badge.text)
      h += '<span class="vq2-tl-badge tone-' + esc(e.badge.tone || "neutral") + '">' + esc(e.badge.text) + "</span>";
    h += '<span class="vq2-tl-time">' + esc(e.duration ? fmtMs(e.duration) : fmtClock(e.at)) + "</span>";
    h += "</div>";

    /* 結果の行。Claude Code と同じく、上の見出しへぶら下げる形にする。
       印（⎿）は飾りなので読み上げからは外す。 */
    if (e.short)
      h += '<div class="vq2-tl-s"><span class="vq2-tl-lead" aria-hidden="true">⎿</span>'
        + "<span>" + esc(e.short) + "</span></div>";

    if (e.tags && e.tags.length)
      h += '<div class="vq2-tl-tags">' + e.tags.map(function (t) {
        return '<span class="vq2-tl-tag">' + esc(t) + "</span>";
      }).join("") + "</div>";

    if (e.bash) h += bashHtml(e.bash, e.id, !!e.bashOpen);

    var det = e.details || [];
    if (e.long || det.length) {
      h += '<button type="button" class="vq2-tl-more" data-tlmore="' + esc(e.id) + '"'
        + ' aria-expanded="' + (e.open ? "true" : "false") + '">'
        + (e.open ? "詳細を閉じる" : "詳細を見る") + icon(e.open ? "chevronU" : "chevronD") + "</button>";
      h += '<div class="vq2-tl-d"' + (e.open ? "" : " hidden") + ">";
      if (e.long) h += '<p class="vq2-tl-long">' + esc(e.long) + "</p>";
      if (det.length) h += '<dl class="vq2-tl-dl">' + det.map(function (d) {
        return "<dt>" + esc(d.k) + "</dt><dd>" + esc(d.v) + "</dd>";
      }).join("") + "</dl>";
      h += "</div>";
    }

    if (e.actions && e.actions.length)
      h += '<div class="vq2-tl-a">' + e.actions.map(function (a) {
        return btn({ label: a.label, icon: a.icon || null, size: "sm",
                     variant: a.variant || "quiet", action: "tlact",
                     attrs: 'data-tlaction="' + esc(a.id) + '" data-tlid="' + esc(e.id) + '"' });
      }).join("") + "</div>";

    h += "</div></li>";
    return h;
  }

  /* ══════════════════════════════════════════════════════════════════
     タイムライン
     ══════════════════════════════════════════════════════════════════ */
  function Timeline(o) {
    o = o || {};
    this.events = [];
    this.byId = {};
    this.aiIndex = {};          /* onActivity の添字 → イベント id */
    this.onAction = o.onAction || null;
    this.emptyText = o.emptyText || "ここに AI の作業が並びます。";
    this.emptySub = o.emptySub || "";
    this.host = null;           /* 実 DOM（あとで bind する） */
    this.follow = true;         /* 最新へ自動追従 */
  }

  Timeline.prototype.bind = function (host) {
    this.host = host || null;
    if (this.host) { this.host.className = "vq2-tl"; this.paint(); this.hook(); }
  };
  Timeline.prototype.hook = function () {
    var self = this, h = this.host;
    if (!h || h.__tlHooked) return;
    h.__tlHooked = true;
    h.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-tlbash],[data-tlmore],[data-tlaction]") : null;
      if (!b || !h.contains(b)) return;
      if (b.hasAttribute("data-tlbash")) {
        var e1 = self.byId[b.getAttribute("data-tlbash")];
        if (e1) { e1.bashOpen = !e1.bashOpen; self.repaintOne(e1); }
        return;
      }
      if (b.hasAttribute("data-tlmore")) {
        var e2 = self.byId[b.getAttribute("data-tlmore")];
        if (e2) { e2.open = !e2.open; self.repaintOne(e2); }
        return;
      }
      var id = b.getAttribute("data-tlaction");
      var e3 = self.byId[b.getAttribute("data-tlid")];
      if (id && self.onAction) { try { self.onAction(id, e3 || null); } catch (x) {} }
    });
    /* 手で上へスクロールしたら追従をやめる（読んでいる途中で飛ばさない） */
    h.addEventListener("scroll", function () {
      self.follow = h.scrollHeight - h.scrollTop - h.clientHeight < 40;
    });
  };

  /* 1 件足す。返り値は id。 */
  Timeline.prototype.push = function (e) {
    var ev = {
      id: e.id || nextId(),
      kind: e.kind || "info",
      title: e.title || "",
      short: e.short || "",
      long: e.long || "",
      at: e.at || Date.now(),
      startedAt: e.at || Date.now(),
      duration: e.duration || 0,
      tags: e.tags || null,
      status: e.status || "done",
      badge: e.badge || null,
      bash: e.bash || null,
      bashOpen: !!e.bashOpen,
      details: e.details || null,
      actions: e.actions || null,
      open: !!e.open,
      raw: e.raw || null
    };
    this.events.push(ev);
    this.byId[ev.id] = ev;
    this.appendOne(ev);
    return ev.id;
  };

  Timeline.prototype.update = function (id, patch) {
    var e = this.byId[id];
    if (!e) return;
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) e[k] = patch[k];
    if (patch.status && patch.status !== "running" && !e.duration && e.startedAt)
      e.duration = Date.now() - e.startedAt;
    this.repaintOne(e);
  };

  Timeline.prototype.clear = function () {
    this.events.length = 0; this.byId = {}; this.aiIndex = {}; this.follow = true;
    this.paint();
  };
  /* 次の生成に移るときに呼ぶ。並んだ出来事は消さず、
     「AI 層から来る配列の添字」との対応だけを切る（前の回の行を書き換えないため）。 */
  Timeline.prototype.resetRun = function () { this.aiIndex = {}; this.follow = true; };

  /* ── AI 層からの進行をそのまま流す ──
     ai.js は同じ配列を毎回渡してくる（要素は書き換えられる）。
     添字で対応づければ、running → completed で行が増えない。 */
  Timeline.prototype.fromActivity = function (items) {
    var self = this;
    (items || []).forEach(function (it, i) {
      var m = mapOf(it.type);
      if (m.hide) return;
      var label = String(it.label || m.fallback || "");
      if (!label) return;
      var st = statusOf(it.status);
      var badge = (it.total ? { text: (it.current || 0) + " / " + it.total, tone: "accent" } : null);
      var det = parseDetail(it.detail);
      var id = self.aiIndex[i];

      if (!id) {
        var bash = m.bash ? { name: m.bash, in: [], out: det, summary: det.length === 1 && !det[0].k ? det[0].v : "" } : null;
        id = self.push({
          kind: m.kind, title: label, status: st, badge: badge,
          short: (!bash && det.length === 1 && !det[0].k) ? det[0].v : "",
          bash: bash,
          details: (!bash && det.length && det[0].k) ? det : null,
          raw: it
        });
        self.aiIndex[i] = id;
        return;
      }
      var e = self.byId[id];
      if (!e) return;
      var patch = { title: label, status: st, badge: badge, raw: it };
      if (det.length) {
        if (e.bash) { e.bash.out = det; e.bash.summary = det.length === 1 && !det[0].k ? det[0].v : e.bash.summary; }
        else if (det.length === 1 && !det[0].k) patch.short = det[0].v;
        else patch.details = det;
      }
      self.update(id, patch);
      /* 終わった工程の Bash カードには、必ず結果を入れておく。
         中身が空のまま「Bash」とだけ出ていると、開いても何も分からない。
         入れるのは実際に測れたものだけ（所要時間・結果・進んだ数）。 */
      if (e.bash && st !== "running" && !(e.bash.out || []).length) {
        var rows = [];
        if (e.duration) rows.push({ k: "elapsed", v: fmtMs(e.duration) });
        rows.push({ k: "status", v: it.status || "completed" });
        if (it.total != null) rows.push({ k: "progress", v: (it.current || 0) + " / " + it.total });
        e.bash.out = rows;
        e.bash.summary = e.bash.summary
          || (e.duration ? fmtMs(e.duration) + "で完了" : "完了");
        self.repaintOne(e);
      }
    });
  };

  /* metrics が届いたあとで、資料の Bash カードを実データで置き換える */
  Timeline.prototype.attachSourceBash = function (metrics) {
    if (!metrics) return;
    var b = bashFromFiles(metrics.sourcePlan && metrics.sourcePlan.files, metrics.evidenceAudit);
    if (!b) return;
    for (var i = this.events.length - 1; i >= 0; i--) {
      var e = this.events[i];
      if (e.kind === "document" && e.bash) {
        e.bash = b;
        this.repaintOne(e);
        return;
      }
    }
    this.push({ kind: "document", title: "資料を確認しました", status: "done", bash: b });
  };

  /* ── 描画 ── */
  Timeline.prototype.listEl = function () {
    return this.host ? this.host.querySelector(".vq2-tl-list") : null;
  };
  Timeline.prototype.paint = function () {
    if (!this.host) return;
    if (!this.events.length) {
      this.host.innerHTML = '<div class="vq2-tl-empty">'
        + '<span class="vq2-tl-empty-i">' + icon("sparkle") + "</span>"
        + '<p class="vq2-tl-empty-t">' + esc(this.emptyText) + "</p>"
        + (this.emptySub ? '<p class="vq2-tl-empty-s">' + esc(this.emptySub) + "</p>" : "")
        + "</div>";
      return;
    }
    this.host.innerHTML = '<ol class="vq2-tl-list">'
      + this.events.map(itemHtml).join("") + "</ol>";
    this.toEnd();
  };
  Timeline.prototype.appendOne = function (e) {
    var list = this.listEl();
    if (!list) { this.paint(); return; }
    var tmp = doc.createElement("div");
    tmp.innerHTML = "<ol>" + itemHtml(e) + "</ol>";
    var li = tmp.firstChild.firstChild;
    li.classList.add("is-new");
    list.appendChild(li);
    this.toEnd();
  };
  Timeline.prototype.repaintOne = function (e) {
    var list = this.listEl();
    if (!list) { this.paint(); return; }
    var old = list.querySelector('[data-tlid="' + e.id + '"]');
    if (!old) { this.appendOne(e); return; }
    var tmp = doc.createElement("div");
    tmp.innerHTML = "<ol>" + itemHtml(e) + "</ol>";
    var li = tmp.firstChild.firstChild;
    old.parentNode.replaceChild(li, old);
  };
  Timeline.prototype.toEnd = function () {
    if (!this.host || !this.follow) return;
    var h = this.host;
    if (root.requestAnimationFrame) root.requestAnimationFrame(function () { h.scrollTop = h.scrollHeight; });
    else h.scrollTop = h.scrollHeight;
  };

  /* ══════════════════════════════════════════════════════════════════
     追加指示（送信欄 ＋ 送った指示の状態一覧）
     ══════════════════════════════════════════════════════════════════ */
  var FU_LABEL = {
    pending: "受付済み", queued: "受付済み", sending: "反映中", applying: "反映中",
    applied: "反映済み", done: "反映済み", failed: "反映失敗", cancelled: "取り消し"
  };
  var FU_TONE = {
    pending: "neutral", queued: "neutral", sending: "accent", applying: "accent",
    applied: "success", done: "success", failed: "danger", cancelled: "neutral"
  };

  function followupsHtml(list) {
    var items = (list || []).slice(-6);
    if (!items.length) return "";
    return '<div class="vq2-fus">' + items.map(function (f) {
      var s = String(f.state || f.status || "pending");
      return '<div class="vq2-fu-row">'
        + '<span class="vq2-fu-badge tone-' + esc(FU_TONE[s] || "neutral") + '">'
        + esc(FU_LABEL[s] || s) + "</span>"
        + '<span class="vq2-fu-txt">' + esc(f.text || "") + "</span></div>";
    }).join("") + "</div>";
  }

  var DEFAULT_CHIPS = ["正誤問題を多めに", "選択肢を6個に", "難易度を少し上げて", "解説を詳しくして"];

  /* ══════════════════════════════════════════════════════════════════
     入力欄の 3 つの状態

     欄は 1 つだけ。何ができるかは、いまの状況で変わる。
     状態ごとに別の欄を作らない（どこへ書けばいいのか分からなくなる）。
     ══════════════════════════════════════════════════════════════════ */
  var STATES = {
    before:  { placeholder: "作りたい問題を指示してください",
               aria: "作りたい問題の指示", send: "作る", icon: "sparkle",
               chips: ["4択で20問", "記述も入れて", "難易度は標準", "解説つきで"] },
    running: { placeholder: "追加の指示を送る",
               aria: "追加の指示", send: "送る", icon: "chevronR",
               chips: ["正誤問題を多めに", "選択肢を5個に", "難易度を少し上げて", "解説を詳しくして"] },
    after:   { placeholder: "問題の修正を指示する",
               aria: "問題の修正の指示", send: "直す", icon: "wand",
               chips: ["もう少し難しく", "選択肢を紛らわしく", "問題文を短く", "似た問題を減らして"] }
  };
  function stateOf(s) { return STATES[s] || STATES.before; }

  /* ── 添付チップ ──
     ファイル名だけでは「読めたのか」が分からない。
     形式・大きさ・読み取りの状態を必ず添える。 */
  var ATTACH_STATE = {
    uploading:  { label: "アップロード中", tone: "accent", spin: true },
    paused:     { label: "止めています",   tone: "neutral", icon: "pause" },
    uploaded:   { label: "送信済み",       tone: "neutral", icon: "check" },
    queued:     { label: "解析待ち",       tone: "neutral", spin: true },
    /* 読み取っている最中。これが無かったせいで、解析中もずっと
       「解析待ち」と出たままだった（読み取りが終わっても変わらなかった）。 */
    analyzing:  { label: "読み取り中",     tone: "accent", spin: true },
    partially_ready: { label: "一部読み取り", tone: "warning", icon: "warning" },
    extracting: { label: "読み取り中",     tone: "accent", spin: true },
    /* 「OCR 成功」とは書かない。文字を起こしたことと、読めたことは別。 */
    ready:      { label: "文字起こし済み", tone: "success", icon: "check" },
    truncated:  { label: "一部のみ読み取り", tone: "warning", icon: "warning" },
    warning:    { label: "一部のみ読み取り", tone: "warning", icon: "warning" },
    unreadable: { label: "読み取れません", tone: "danger", icon: "error" },
    failed:     { label: "解析失敗",       tone: "danger", icon: "error" },
    expired:    { label: "期限切れ",       tone: "danger", icon: "clock" },
    cancelled:  { label: "取り消し",       tone: "neutral", icon: "close" }
  };

  /* ページ 1 枚ごとの読み取り結果。4 つを別物として見せる。
     「読み取れた」と「たしかに読めた」を同じ色にしない。 */
  var PAGE_STATE = {
    ok:               { label: "読み取り",   tone: "success" },
    low_confidence:   { label: "要確認",     tone: "warning" },
    /* 出力の上限で止まったページ。読めた扱いにしない。 */
    truncated:        { label: "一部のみ",   tone: "warning" },
    /* 出力の上限で止まったページ。読めた扱いにしない。 */
    truncated:        { label: "一部のみ",   tone: "warning" },
    no_text_detected: { label: "文字なし",   tone: "neutral" },
    failed:           { label: "失敗",       tone: "danger" },
    excluded:         { label: "除外",       tone: "neutral" },
    pending:          { label: "待機",       tone: "neutral" }
  };
  /* 部分成功のときに出す 4 つの手。ここで文言を決め、画面ごとに言い換えない。 */
  var PAGE_ACTION = {
    use_readable:  { label: "読めたページだけで進める", icon: "check", variant: "primary" },
    retry_failed:  { label: "読めなかったページを読み直す", icon: "refresh" },
    exclude_pages: { label: "読めないページを外す", icon: "close" },
    cancel:        { label: "この資料の取り込みをやめる", icon: "stop" }
  };
  function attachState(a) {
    var s = String(a.status || "");
    if (ATTACH_STATE[s]) return s;
    if (s === "error") return "failed";
    return "queued";
  }
  function fmtBytes(n) {
    var b = Number(n) || 0;
    if (!b) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
    return (b / 1024 / 1024).toFixed(1) + " MB";
  }
  var KIND_JA = { image: "画像", pdf: "PDF", docx: "文書", zip: "ZIP", text: "テキスト", code: "コード" };
  function kindIcon(k) { return k === "image" ? "eye" : k === "zip" ? "layers" : "doc"; }

  /* 送っている途中の帯。何 % かではなく「12 個中 7 個目」を主にする。
     止めて再開したときに、どこまで進んだかが分かるのはこちらのほう。 */
  function uploadBarHtml(a) {
    var up = a.upload;
    if (!up) return "";
    var showing = a.status === "uploading" || a.status === "paused"
      || (a.status === "failed" && up.totalParts > 1);
    if (!showing) return "";
    var pct = Math.max(0, Math.min(100, Number(up.percent) || 0));
    return '<div class="vq2-att-up">'
      + '<div class="vq2-att-bar" role="progressbar" aria-valuenow="' + pct + '"'
      + ' aria-valuemin="0" aria-valuemax="100" aria-label="送信の進み具合">'
      + '<span style="width:' + pct + '%"></span></div>'
      + '<span class="vq2-att-upn">' + esc(up.label || "") + "</span>"
      + "</div>";
  }
  /* 送信中に押せる手。止める・続ける・落ちた分だけ送り直す。 */
  function uploadCtlHtml(a) {
    var st = a.status;
    var up = a.upload || {};
    var b = [];
    if (st === "uploading")
      b.push(['data-attpause="' + esc(String(a.id)) + '"', "pause", "送信を止める"]);
    if (st === "paused")
      b.push(['data-attresume="' + esc(String(a.id)) + '"', "play", "続きから送る"]);
    if (st === "failed" && (up.failedParts || []).length)
      b.push(['data-attretrypart="' + esc(String(a.id)) + '"', "refresh",
              "送れなかった " + up.failedParts.length + " 個を送り直す"]);
    return b.map(function (x) {
      return '<button type="button" class="vq2-att-b" ' + x[0]
        + ' aria-label="' + esc(x[2]) + '" title="' + esc(x[2]) + '">' + icon(x[1]) + "</button>";
    }).join("");
  }

  /* ページごとの読み取り結果。数が多いので、点の並びと数え上げで見せる。 */
  function pagesHtml(a) {
    var pg = a.pages || [];
    if (!pg.length) return "";
    var count = {};
    pg.forEach(function (p) { count[p.status] = (count[p.status] || 0) + 1; });
    var sum = Object.keys(PAGE_STATE).filter(function (k) { return count[k]; })
      .map(function (k) {
        return '<span class="vq2-att-pc tone-' + PAGE_STATE[k].tone + '">'
          + esc(PAGE_STATE[k].label) + " " + count[k] + "</span>";
      }).join("");
    var dots = pg.slice(0, 60).map(function (p) {
      var m = PAGE_STATE[p.status] || PAGE_STATE.pending;
      return '<span class="vq2-att-pd tone-' + m.tone + '" title="'
        + esc(p.pageNumber + " ページ：" + m.label
              + (p.confidence != null ? "（確かさ " + p.confidence + "）" : "")) + '"></span>';
    }).join("");
    return '<div class="vq2-att-pg">'
      + '<div class="vq2-att-pcs">' + sum
      + (pg.length > 60 ? '<span class="vq2-att-pc">ほか ' + (pg.length - 60) + " ページ</span>" : "")
      + "</div>"
      + '<div class="vq2-att-pds">' + dots + "</div>"
      + (a.pageSummary ? '<div class="vq2-att-psum">' + esc(a.pageSummary) + "</div>" : "")
      + "</div>";
  }
  /* 部分成功のときの 4 つの手 */
  function pageActionsHtml(a) {
    var acts = a.pageActions || [];
    if (!acts.length) return "";
    return '<div class="vq2-att-acts">' + acts.map(function (x) {
      var m = PAGE_ACTION[x.id] || { label: x.label || x.id, icon: "info" };
      return '<button type="button" class="vq2-att-act' + (m.variant === "primary" ? " is-primary" : "") + '"'
        + ' data-attact="' + esc(x.id) + '" data-attactid="' + esc(String(a.id)) + '">'
        + icon(m.icon) + "<span>" + esc(m.label) + (x.pages ? "（" + x.pages + "）" : "") + "</span></button>";
    }).join("") + "</div>";
  }

  function attachChipHtml(a) {
    var st = attachState(a);
    var m = ATTACH_STATE[st];
    var meta = [KIND_JA[a.kind] || a.kind || "ファイル", fmtBytes(a.size)].filter(Boolean).join(" ・ ");
    var bad = st === "failed" || st === "unreadable" || st === "expired";
    var extra = uploadBarHtml(a) + pagesHtml(a) + pageActionsHtml(a);
    return '<div class="vq2-att' + (bad ? " is-bad" : "") + (extra ? " has-more" : "") + '"'
      + ' data-attid="' + esc(String(a.id)) + '">'
      + '<div class="vq2-att-r">'
      + '<span class="vq2-att-i">' + icon(kindIcon(a.kind)) + "</span>"
      + '<span class="vq2-att-m">'
      + '<span class="vq2-att-n" title="' + esc(a.name || "") + '">' + esc(a.name || "（名前なし）") + "</span>"
      + '<span class="vq2-att-s">' + esc(meta) + "</span></span>"
      + '<span class="vq2-att-st tone-' + esc(m.tone) + '">'
      + (m.spin ? '<span class="vq2-spin sm"></span>' : icon(m.icon))
      + "<span>" + esc(m.label) + "</span></span>"
      + uploadCtlHtml(a)
      + (bad && st !== "expired"
          ? '<button type="button" class="vq2-att-b" data-attretry="' + esc(String(a.id)) + '"'
            + ' aria-label="もう一度読み取る">' + icon("refresh") + "</button>"
          : "")
      + '<button type="button" class="vq2-att-b" data-attdel="' + esc(String(a.id)) + '"'
      + ' aria-label="' + esc((a.name || "この資料") + " を外す") + '">' + icon("close") + "</button>"
      + "</div>"
      + (a.statusText ? '<div class="vq2-att-note">' + esc(a.statusText) + "</div>" : "")
      + extra
      + "</div>";
  }
  function attachListHtml(list) {
    var items = list || [];
    if (!items.length) return "";
    /* 100MB まで運べるのはローカル Bridge 経路だけ。
       ここを書いておかないと、公開側でも同じだと思われる。 */
    var big = items.some(function (a) { return (Number(a.size) || 0) > 20 * 1024 * 1024; });
    return '<div class="vq2-atts">' + items.map(attachChipHtml).join("")
      + (big ? '<div class="vq2-att-route">大きな資料はこの端末のローカル AI 経路でのみ扱えます'
               + "（1 ファイル 100MB まで）。</div>" : "")
      + "</div>";
  }

  function composerHtml(o) {
    o = o || {};
    var s = stateOf(o.state);
    var chips = o.chips || s.chips;
    var ph = o.placeholder || s.placeholder;
    return '<div class="vq2-tlc">'
      + '<div class="vq2-tlc-fu" data-tlfu>' + followupsHtml(o.followups) + "</div>"
      + '<div class="vq2-tlc-att" data-tlatt>' + attachListHtml(o.attachments) + "</div>"
      + '<div class="vq2-tlc-opt" data-tlopt>' + (o.options || "") + "</div>"
      + (chips.length
          ? '<div class="vq2-tlc-chips" data-tlchips>' + chips.map(function (c) {
              return '<button type="button" class="vq2-chip" data-tlchip="' + esc(c) + '">' + esc(c) + "</button>";
            }).join("") + "</div>"
          : "")
      + '<div class="vq2-tlc-box">'
      + '<button type="button" class="vq2-tlc-att-b" data-tlattach aria-label="資料を添付する">'
      + icon("plus") + "</button>"
      + '<textarea class="vq2-tlc-in" data-tlinput rows="1" placeholder="' + esc(ph) + '"'
      + ' aria-label="' + esc(s.aria) + '"></textarea>'
      + '<button type="button" class="vq2-tlc-send" data-tlsend aria-label="' + esc(s.send) + '">'
      + icon(s.icon) + "</button>"
      + "</div></div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     パネル（見出し ＋ タイムライン ＋ 追加指示欄）
     右ペインの中身はこれ 1 つで完結する。
     ══════════════════════════════════════════════════════════════════ */
  function Panel(o) {
    o = o || {};
    this.title = o.title || "AI アクティビティ";
    this.timeline = new Timeline({ onAction: o.onAction, emptyText: o.emptyText, emptySub: o.emptySub });
    this.onFollowup = o.onFollowup || null;
    this.onCancel = o.onCancel || null;
    this.onToggle = o.onToggle || null;
    this.chips = o.chips || DEFAULT_CHIPS;
    this.placeholder = o.placeholder || null;
    this.showComposer = o.composer !== false;
    /* 見出しへ差し込む HTML。呼び側が経過時間などを置く口。 */
    this.headExtra = o.headExtra || "";
    /* 入力欄の状態（作成前 / 生成中 / 生成後）と、いま付いている資料 */
    this.state = o.state || "before";
    this.attachments = [];
    this.optionsHtml = "";
    this.onAttach = o.onAttach || null;
    this.onAttachRemove = o.onAttachRemove || null;
    this.onAttachRetry = o.onAttachRetry || null;
    /* 送信の操作（pause / resume / retryParts）と、部分成功のときの 4 つの手 */
    this.onAttachUpload = o.onAttachUpload || null;
    this.onAttachPageAction = o.onAttachPageAction || null;
    this.followups = [];
    this.busy = false;
    this.nowLabel = "";
    this.draft = "";              /* 書きかけの追加指示（描き直しで消さない） */
    this.el = null;
  }

  Panel.prototype.html = function () {
    return '<div class="vq2-aiact">'
      + '<div class="vq2-aiact-h">'
      /* β の印。**部品の側で必ず付ける**。
         呼び出し側（プリセット作成・Quick Mock など）が title を
         それぞれ渡しているので、あちらで付けると付け忘れが出る。
         ここに置けば、どこから開いても必ず付く。 */
      + '<span class="vq2-aiact-t">' + esc(this.title)
      + '<span class="vq2-beta" title="この機能は開発中です">β</span></span>' 
      + '<span class="vq2-aiact-st" data-tlnow></span>'
      + this.headExtra
      + '<span class="vq2-aiact-x">'
      + btn({ icon: "stop", iconOnly: true, size: "sm", variant: "quiet",
              aria: "生成を停止する", attrs: "data-tlstop hidden" })
      + "</span></div>"
      + '<div class="vq2-aiact-b" data-tllist></div>'
      + (this.showComposer
          ? composerHtml({ state: this.state, chips: this.chips, placeholder: this.placeholder,
                           attachments: this.attachments, options: this.optionsHtml })
          : "")
      + "</div>";
  };

  /* container（空の div）に実体を作る */
  Panel.prototype.mount = function (container) {
    if (!container) return;
    this.el = container;
    container.innerHTML = this.html();
    this.timeline.bind(container.querySelector("[data-tllist]"));
    this.wire();
    this.paintHead();
    this.paintFollowups();
    /* 書きかけを戻す（画面を描き直すたびに消えると、打ち直しになる） */
    var box = container.querySelector("[data-tlinput]");
    if (box && this.draft) { box.value = this.draft; this.grow(box); }
    if (this.optionsHtml) this.setOptions(this.optionsHtml);
  };

  Panel.prototype.wire = function () {
    var self = this, el = this.el;
    if (!el || el.__aiactHooked) return;
    el.__aiactHooked = true;

    el.addEventListener("click", function (ev) {
      var t = ev.target;
      var chip = t.closest ? t.closest("[data-tlchip]") : null;
      if (chip && el.contains(chip)) {
        var box = el.querySelector("[data-tlinput]");
        if (box) {
          var v = chip.getAttribute("data-tlchip");
          box.value = box.value ? box.value.replace(/\s*$/, "") + "、" + v : v;
          box.focus();
          self.grow(box);
        }
        return;
      }
      if (t.closest && t.closest("[data-tlsend]") && el.contains(t.closest("[data-tlsend]"))) {
        self.send(); return;
      }
      var add = t.closest ? t.closest("[data-tlattach]") : null;
      if (add && el.contains(add) && self.onAttach) { try { self.onAttach(); } catch (x) {} return; }
      var del = t.closest ? t.closest("[data-attdel]") : null;
      if (del && el.contains(del) && self.onAttachRemove) {
        try { self.onAttachRemove(del.getAttribute("data-attdel")); } catch (x) {}
        return;
      }
      var re = t.closest ? t.closest("[data-attretry]") : null;
      if (re && el.contains(re) && self.onAttachRetry) {
        try { self.onAttachRetry(re.getAttribute("data-attretry")); } catch (x) {}
        return;
      }
      /* 送信の操作（止める・続ける・落ちた分だけ送り直す）。
         どれも同じ入り口へ渡し、呼び側で 1 か所にまとめて扱えるようにする。 */
      var ups = [["data-attpause", "pause"], ["data-attresume", "resume"],
                 ["data-attretrypart", "retryParts"]];
      for (var ui = 0; ui < ups.length; ui++) {
        var b = t.closest ? t.closest("[" + ups[ui][0] + "]") : null;
        if (b && el.contains(b) && self.onAttachUpload) {
          try { self.onAttachUpload(ups[ui][1], b.getAttribute(ups[ui][0])); } catch (x) {}
          return;
        }
      }
      /* 部分成功のときの 4 つの手 */
      var pa = t.closest ? t.closest("[data-attact]") : null;
      if (pa && el.contains(pa) && self.onAttachPageAction) {
        try {
          self.onAttachPageAction(pa.getAttribute("data-attact"), pa.getAttribute("data-attactid"));
        } catch (x) {}
        return;
      }
      var stop = t.closest ? t.closest("[data-tlstop]") : null;
      if (stop && el.contains(stop) && self.onCancel) { try { self.onCancel(); } catch (x) {} }
    });

    el.addEventListener("keydown", function (ev) {
      var box = ev.target;
      if (!box.hasAttribute || !box.hasAttribute("data-tlinput")) return;
      if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); self.send(); }
    });
    el.addEventListener("input", function (ev) {
      if (ev.target.hasAttribute && ev.target.hasAttribute("data-tlinput")) {
        self.draft = ev.target.value; self.grow(ev.target);
      }
    });
  };

  /* 入力欄を中身の高さに合わせる（最大 5 行） */
  Panel.prototype.grow = function (box) {
    box.style.height = "auto";
    box.style.height = Math.min(box.scrollHeight, 132) + "px";
  };

  Panel.prototype.send = function () {
    var box = this.el && this.el.querySelector("[data-tlinput]");
    if (!box) return;
    var text = String(box.value || "").trim();
    if (!text) { box.focus(); return; }
    if (!this.onFollowup) return;
    var ok = null;
    try { ok = this.onFollowup(text); } catch (x) { ok = false; }
    if (ok === false) return;
    box.value = "";
    this.draft = "";
    box.style.height = "";
    box.focus();
  };

  /* 送ったあとに失敗したとき、打った文を入力欄へ戻す。
     Enter で送って失敗し、書いた指示が消えるのがいちばん困る。 */
  Panel.prototype.restore = function (text) {
    var box = this.el && this.el.querySelector("[data-tlinput]");
    var t = String(text || "");
    if (!t) return;
    this.draft = t;
    if (!box) return;
    if (String(box.value || "").trim()) return;   /* すでに次を打っているなら上書きしない */
    box.value = t;
    this.grow(box);
  };

  /* 追加指示の一覧（受付済み／反映中／反映済み／反映失敗／取り消し） */
  Panel.prototype.setFollowups = function (list) {
    this.followups = list || [];
    this.paintFollowups();
  };
  Panel.prototype.paintFollowups = function () {
    var box = this.el && this.el.querySelector("[data-tlfu]");
    if (box) box.innerHTML = followupsHtml(this.followups);
  };

  /* 入力欄の状態を切り替える。欄そのものは作り直さない（書きかけを消さない）。 */
  Panel.prototype.setState = function (state) {
    if (this.state === state) return;
    this.state = state;
    if (!this.el) return;
    var s = stateOf(state);
    var box = this.el.querySelector("[data-tlinput]");
    if (box) { box.setAttribute("placeholder", s.placeholder); box.setAttribute("aria-label", s.aria); }
    var send = this.el.querySelector("[data-tlsend]");
    if (send) { send.setAttribute("aria-label", s.send); send.innerHTML = icon(s.icon); }
    var chips = this.el.querySelector("[data-tlchips]");
    if (chips) chips.innerHTML = (this.chips || s.chips).map(function (c) {
      return '<button type="button" class="vq2-chip" data-tlchip="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
  };
  /* 入力欄のすぐ上に置く小さな設定（例: 資料だけを根拠にする）。
     呼び側が HTML を作る。ここは置き場所だけを持つ。 */
  Panel.prototype.setOptions = function (html) {
    this.optionsHtml = html || "";
    var box = this.el && this.el.querySelector("[data-tlopt]");
    if (box) box.innerHTML = this.optionsHtml;
  };
  Panel.prototype.setAttachments = function (list) {
    this.attachments = list || [];
    var box = this.el && this.el.querySelector("[data-tlatt]");
    if (box) box.innerHTML = attachListHtml(this.attachments);
  };

  Panel.prototype.setBusy = function (busy, label) {
    this.busy = !!busy;
    this.nowLabel = label || "";
    this.paintHead();
  };
  Panel.prototype.paintHead = function () {
    if (!this.el) return;
    var now = this.el.querySelector("[data-tlnow]");
    if (now) {
      now.innerHTML = this.busy
        ? '<span class="vq2-spin sm"></span><span>' + esc(this.nowLabel || "作業中です") + "</span>"
        : (this.nowLabel ? "<span>" + esc(this.nowLabel) + "</span>" : "");
      now.classList.toggle("is-busy", this.busy);
    }
    var stop = this.el.querySelector("[data-tlstop]");
    if (stop) stop.hidden = !(this.busy && this.onCancel);
    this.el.classList.toggle("is-busy", this.busy);
  };

  /* 使いやすいように素通しを用意する */
  Panel.prototype.push = function (e) { return this.timeline.push(e); };
  Panel.prototype.update = function (id, p) { return this.timeline.update(id, p); };
  Panel.prototype.fromActivity = function (items) { return this.timeline.fromActivity(items); };
  Panel.prototype.attachSourceBash = function (m) { return this.timeline.attachSourceBash(m); };
  Panel.prototype.clear = function () { return this.timeline.clear(); };
  Panel.prototype.resetRun = function () { return this.timeline.resetRun(); };

  VQ2.activity = {
    KINDS: KINDS,
    MAP: MAP,
    mapOf: mapOf,
    statusOf: statusOf,
    parseDetail: parseDetail,
    bashFromFiles: bashFromFiles,
    bashHtml: bashHtml,
    itemHtml: itemHtml,
    followupsHtml: followupsHtml,
    composerHtml: composerHtml,
    Timeline: Timeline,
    Panel: Panel,
    STATES: STATES,
    ATTACH_STATE: ATTACH_STATE,
    PAGE_STATE: PAGE_STATE,
    PAGE_ACTION: PAGE_ACTION,
    attachListHtml: attachListHtml,
    attachChipHtml: attachChipHtml,
    fmtBytes: fmtBytes,
    createTimeline: function (o) { return new Timeline(o); },
    createPanel: function (o) { return new Panel(o); },
    fmtMs: fmtMs
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
