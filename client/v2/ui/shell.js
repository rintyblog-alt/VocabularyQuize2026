/* ══════════════════════════════════════════════════════════════════════
   V2 画面の土台（§6）
   ・Shadow DOM の全画面オーバーレイ。本体の 6.7MB の CSS と一切干渉しない。
   ・デザイントークン（Bloom）はビルド時に注入する。ここでは変数だけを使う。
   ・Button / Dialog / Menu / Tooltip / Toast を 1 か所に集約し、
     4 画面で見た目と操作を揃える。
   ・キーボード操作・フォーカス表示・aria・Reduced Motion を既定で満たす。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var doc = root.document;

  /* ビルド時に tokens.css + 共通 CSS が差し込まれる */
  var SHELL_CSS = "__VQ2_CSS__";

  /* ── 小道具 ─────────────────────────────────────────────────── */
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function el(tag, attrs, html) {
    var e = doc.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function on(target, ev, sel, fn) {
    if (typeof sel === "function") { target.addEventListener(ev, sel); return; }
    target.addEventListener(ev, function (e) {
      var t = e.target && e.target.closest ? e.target.closest(sel) : null;
      if (t && target.contains(t)) fn(e, t);
    });
  }
  function reducedMotion() {
    try { return root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }
  function isMobile() {
    try { return root.matchMedia && root.matchMedia("(max-width: 899px)").matches; }
    catch (e) { return (root.innerWidth || 1200) < 900; }
  }

  /* ── アイコン（本体のアイコンセットに合わせた線画。絵文字は使わない） ── */
  var ICONS = {
    close:    '<path d="M18 6 6 18M6 6l12 12"/>',
    check:    '<path d="M20 6 9 17l-5-5"/>',
    plus:     '<path d="M12 5v14M5 12h14"/>',
    trash:    '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    copy:     '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    undo:     '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>',
    redo:     '<path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/>',
    save:     '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    sparkle:  '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/>',
    warning:  '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    error:    '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
    info:     '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    chevronL: '<path d="m15 18-6-6 6-6"/>',
    chevronR: '<path d="m9 18 6-6-6-6"/>',
    chevronD: '<path d="m6 9 6 6 6-6"/>',
    chevronU: '<path d="m18 15-6-6-6 6"/>',
    drag:     '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    doc:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flag:     '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    stop:     '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    play:     '<path d="m6 4 14 8-14 8z"/>',
    pause:    '<path d="M7 4v16M17 4v16"/>',
    chart:    '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    print:    '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    share:    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    search:   '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    star:     '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    eye:      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    book:     '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    refresh:  '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    /* AI アクティビティ（工程の種類を点で見分けるために足した線画） */
    terminal: '<path d="m5 8 4 4-4 4"/><path d="M13 16h6"/><rect x="2" y="3" width="20" height="18" rx="2"/>',
    user:     '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    shield:   '<path d="M12 3l8 3v5.5c0 4.6-3.2 8.4-8 9.5-4.8-1.1-8-4.9-8-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
    wrench:   '<path d="M15.5 3.5a5 5 0 0 0-6.1 6.6L3 16.5V21h4.5l6.4-6.4a5 5 0 0 0 6.6-6.1L17 11.5 12.5 7z"/>',
    list:     '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    /* 形式レジストリが使う印。無いと全部「情報」の丸になり、見分けが付かない。 */
    image:    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
    audio:    '<path d="M4 10v4h3l4.5 3.5v-11L7 10H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18 6.6a7.5 7.5 0 0 1 0 10.8"/>',
    pencil:   '<path d="M4 20h4l10-10a2.5 2.5 0 1 0-3.5-3.5L4.5 16.5 4 20z"/>',
    blank:    '<path d="M3 12h5M16 12h5"/><rect x="9" y="8.5" width="6" height="7" rx="1.5" stroke-dasharray="2.4 2"/>',
    sort:     '<path d="M7 4v16M7 20l-3-3M7 20l3-3"/><path d="M17 20V4M17 4l-3 3M17 4l3 3"/>',
    link:     '<path d="M10 13.5a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14 10.5a4 4 0 0 0-5.7-.3l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
    upload:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5"/><path d="M12 4v12"/>',
    brain:    '<path d="M9.5 3A3 3 0 0 0 7 7.6 3 3 0 0 0 5.5 13 3 3 0 0 0 8 17.8 2.7 2.7 0 0 0 12 20V4.6A2 2 0 0 0 9.5 3z"/><path d="M14.5 3A3 3 0 0 1 17 7.6 3 3 0 0 1 18.5 13 3 3 0 0 1 16 17.8 2.7 2.7 0 0 1 12 20"/>',
    layers:   '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    wand:     '<path d="M15 4V2M15 10V8M11.5 6h-2M20.5 6h-2M17.5 3.5 16 5M17.5 8.5 16 7M12.5 3.5 14 5"/><path d="m3 21 9-9 2 2-9 9z"/>',
    grid:     '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    send:     '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>'
  };
  function icon(name, cls) {
    var d = ICONS[name] || ICONS.info;
    return '<svg class="vq2-i ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /* ══════════════════════════════════════════════════════════════════
     オーバーレイ（1 画面 = 1 オーバーレイ）
     ══════════════════════════════════════════════════════════════════ */
  var openStack = [];

  /* ══════════════════════════════════════════════════════════════════
     資料の添付

     読み取り（PDF のページ抽出・DOCX・ZIP・テキスト・画像）は既存の
     window.__vqChatFiles にそのまま任せる。V2 で作り直さない。
     ・API は add(files) / list() / remove(id)。addFiles や attachments は無い
       （そこを間違えていて、V2 の添付は長いあいだ 0 件のままだった）。
     ・読み取りは非同期。終わるまで待ってから AI へ渡す。
     ・AI へ渡すのは読めたものだけ。画像は data URL の本体だけを渡す。
     ══════════════════════════════════════════════════════════════════ */
  function filesApi() {
    var F = root.__vqChatFiles;
    return F && typeof F.add === "function" && typeof F.list === "function" ? F : null;
  }
  /* 解析が終わるまで待つ（最大 3 分）。終わらないものはそのまま返して呼び側で弾く。 */
  function waitAttachments(F, timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = Date.now(), limit = timeoutMs || 180000;
      (function poll() {
        var items = F.list();
        var pending = items.filter(function (x) { return x.status === "queued" || x.status === "extracting"; });
        if (!pending.length || Date.now() - t0 > limit) { resolve(items); return; }
        root.setTimeout(poll, 400);
      })();
    });
  }
  /* 1 ページぶんを画像として渡す上限。
     この数字はここに直書きされていた（12）。Bridge 側にも maxScanPages があり、
     同じものを二重に持つと、片方だけ直したときに黙って食い違う。
     出どころは local-ai/config/attachments.json の maxScanPages に一本化し、
     ここでは「取り込めたらそれを使う」ようにする。

     ただし引き上げは無条件ではない。**要求 JSON へ base64 で載せる経路**では、
     200 ページを載せれば本文の上限を突き抜けて 413 になるだけなので、
     運べる量（TRANSPORT_SCAN_CAP）との小さいほうを採る。

     分割アップロード経路（8MiB ずつ送って attachmentId だけを回す）は
     要求 JSON に本体を載せない。つまり「JSON に載る量」の制約が無いので、
     この頭打ちは要らない。呼び側が transport: "upload" と言ってきたときだけ外す。
     **既定は据え置き**（base64 経路の呼び側の挙動を勝手に変えない）。 */
  var SCAN_LIMITS = { maxScanPages: 12, source: "fallback" };
  var TRANSPORT_SCAN_CAP = 12;         /* JSON へ base64 で載せられる現実的な枚数 */
  function byReferenceTransport(o) {
    if (o === true) return true;
    if (!o || typeof o !== "object") return false;
    return o.transport === "upload" || o.byReference === true;
  }
  function scanPageLimit(o) {
    var max = SCAN_LIMITS.maxScanPages || 12;
    return byReferenceTransport(o) ? max : Math.min(max, TRANSPORT_SCAN_CAP);
  }
  /* Bridge が答えられるなら、そちらの値を使う。落ちていても既定で動く。 */
  function refreshScanLimits(baseUrl) {
    try {
      return fetch(String(baseUrl || "").replace(/\/$/, "") + "/attachments/limits")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && j.limits && j.limits.maxScanPages)
            SCAN_LIMITS = { maxScanPages: j.limits.maxScanPages, source: "bridge" };
          return SCAN_LIMITS;
        })
        .catch(function () { return SCAN_LIMITS; });
    } catch (e) { return Promise.resolve(SCAN_LIMITS); }
  }

  /* o.pageImages: true にすると、文字が取れなかったページを **画像として**足す
     （Phase 13 §3）。Quick Chat には元からある経路で、V2 側だけ落ちていた。
     文字層の無いページを黙って無視すると、資料の中身が丸ごと見えないまま
     「体裁だけ」で出題される（実測）。既定は false ＝ 既存画面の挙動は変えない。 */
  function toAiAttachments(items, o) {
    o = o || {};
    var out = [], scans = 0;
    (items || []).filter(function (x) {
      return x.status === "ready" || x.status === "warning";
    }).forEach(function (x) {
      var a = { id: x.id, name: x.name, kind: attachKind(x.kind) };
      if (x.text) a.extractedText = x.text;
      if (x.pageCount) a.pageCount = x.pageCount;
      var withText = x.pages ? x.pages.filter(function (p) { return p.text; }) : null;
      if (withText && withText.length) a.pages = withText.map(function (p) { return p.pageNumber; });
      if (x.lineCount) a.lineCount = x.lineCount;
      if (x.kind === "image" && x.imageDataUrl) {
        var i = x.imageDataUrl.indexOf(",");
        if (i > 0) a.imageBase64 = x.imageDataUrl.slice(i + 1);
      }
      /* ページごとの読み取り結果を分類して残す（§3・§11）。
         text_extracted / image_analyzed / unreadable / skipped */
      var imgs = (o.pageImages && x.pageImages) ? x.pageImages : [];
      a.pageBreakdown = pageBreakdown(x, imgs, o.pageImages ? scanPageLimit() - scans : 0);
      a.textExtractedPages = a.pageBreakdown.filter(function (p) { return p.state === "text_extracted"; }).length;
      a.imageAnalyzedPages = a.pageBreakdown.filter(function (p) { return p.state === "image_analyzed"; }).length;
      a.unreadablePages = a.pageBreakdown.filter(function (p) { return p.state === "unreadable"; }).length;
      a.extractedCharacterCount = String(x.text || "").length;
      a.imageOnlyPageCount = (x.pageImages || []).length;
      a.fileType = a.kind;
      if (a.extractedText || a.imageBase64) out.push(a);

      /* 文字の取れなかったページを画像として足す（親の ID を持たせる） */
      if (!o.pageImages) return;
      imgs.forEach(function (pi) {
        if (scans >= scanPageLimit()) return;
        var b64 = String(pi.dataUrl || "");
        var c = b64.indexOf(",");
        if (c < 0) return;
        out.push({
          id: x.id + "-p" + pi.pageNumber,
          parentAttachmentId: x.id,
          pageNumber: pi.pageNumber,
          name: x.name + "（" + pi.pageNumber + "ページ）",
          kind: "image",
          imageBase64: b64.slice(c + 1),
          extractedCharacterCount: 0,
          fileType: "image"
        });
        scans++;
      });
    });
    return out;
  }
  /* ページごとの状態。pages が無い資料（テキスト等）は 1 件にまとめる。 */
  function pageBreakdown(x, imgs, roomForImages) {
    var byNo = {};
    (x.pages || []).forEach(function (p) {
      byNo[p.pageNumber] = { pageNumber: p.pageNumber, characterCount: String(p.text || "").length };
    });
    var imgNo = {};
    (imgs || []).forEach(function (p, i) { imgNo[p.pageNumber] = i < roomForImages; });
    var total = x.pageCount || Object.keys(byNo).length || ((x.text || "") ? 1 : 0);
    var out = [];
    for (var n = 1; n <= total; n++) {
      var t = byNo[n];
      if (t && t.characterCount > 0) { out.push({ pageNumber: n, state: "text_extracted", characterCount: t.characterCount }); continue; }
      if (imgNo[n] === true) { out.push({ pageNumber: n, state: "image_analyzed", characterCount: 0, lowConfidence: true }); continue; }
      if (imgNo[n] === false) { out.push({ pageNumber: n, state: "skipped", characterCount: 0 }); continue; }
      out.push({ pageNumber: n, state: "unreadable", characterCount: 0 });
    }
    if (!out.length && (x.text || "")) out.push({ pageNumber: null, state: "text_extracted", characterCount: String(x.text).length });
    return out;
  }
  function attachKind(k) {
    return ["pdf", "image", "docx", "text", "code", "zip"].indexOf(k) >= 0 ? k : "unknown";
  }
  /* 読み取った資料の説明（何が取れたかを利用者へ見せる） */
  function attachSummary(a) {
    return a.kind === "image" ? "画像として読みます"
      : a.pageCount ? a.pageCount + " ページ分の文章を読み取りました"
      : a.lineCount ? a.lineCount + " 行の文章を読み取りました"
      : Math.max(1, Math.round((a.extractedText || "").length / 100)) * 100 + " 文字ほど読み取りました";
  }
  /* ファイル選択 → 読み取り待ち → AI 用の形。呼び側は then で受け取るだけでよい。 */
  function pickAttachments(o) {
    o = o || {};
    return new Promise(function (resolve, reject) {
      var F = filesApi();
      if (!F) { reject(new Error("NO_FILE_MODULE")); return; }
      var input = doc.createElement("input");
      input.type = "file"; input.multiple = true;
      input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.docx,.zip";
      input.addEventListener("change", function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) { resolve(null); return; }
        if (o.onStart) o.onStart(files.length);
        Promise.resolve(F.add(files))
          .then(function () { return waitAttachments(F); })
          .then(function (items) {
            resolve({ attachments: toAiAttachments(items, { pageImages: o.pageImages === true }),
                      /* 画面に出すための情報（大きさ・形式・読み取りの状態）。
                         AI へ送る形からは落としてあるので、ここで別に返す。 */
                      display: attachDisplay(items),
                      failed: items.filter(function (x) { return x.status === "failed"; }) });
          })
          .catch(reject);
      });
      input.click();
    });
  }
  function removeAttachment(id) {
    var F = filesApi();
    if (F && typeof F.remove === "function") { try { F.remove(id); } catch (e) {} }
  }
  /* 添付チップに出すぶんだけ取り出す。本文（text / base64）は持たせない。 */
  function attachDisplay(items) {
    return (items || []).map(function (x) {
      return {
        id: x.id, name: x.name, kind: x.kind, mimeType: x.mimeType || "",
        size: x.size || 0, status: x.status || "queued",
        statusText: x.statusText || "", error: x.error || "",
        pageCount: x.pageCount || null,
        characterCount: String(x.text || "").length,
        unreadablePages: x.unreadablePages || 0,
        warnings: (x.warnings || []).slice(0, 3)
      };
    });
  }
  /* いま読み込まれているものを取り直す（解析のやり直し・復元の確認に使う） */
  function currentAttachments(o) {
    o = o || {};
    var F = filesApi();
    if (!F) return { attachments: [], display: [], failed: [] };
    var items = F.list();
    return { attachments: toAiAttachments(items, { pageImages: o.pageImages === true }),
             display: attachDisplay(items),
             failed: items.filter(function (x) { return x.status === "failed"; }) };
  }

  /* いまダークか。本体の指定（html[data-theme-mode]）を優先し、
     auto のときだけ端末の設定を見る。 */
  function isDarkNow() {
    try {
      var m = doc.documentElement.getAttribute("data-theme-mode");
      if (m === "dark") return true;
      if (m === "light") return false;
      return !!(root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) { return false; }
  }
  /* host にテーマを付け、切り替わったら付け直す。戻り値を呼ぶと見張りを止める。 */
  function applyTheme(host) {
    function paint() {
      host.setAttribute("data-theme", isDarkNow() ? "dark" : "light");
      var d = "";
      try { d = doc.documentElement.getAttribute("data-density") || ""; } catch (e) {}
      if (d) host.setAttribute("data-density", d); else host.removeAttribute("data-density");
    }
    paint();
    var mo = null, mq = null, onMq = null;
    try {
      mo = new root.MutationObserver(paint);
      mo.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme-mode", "data-density"] });
    } catch (e) {}
    try {
      mq = root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)");
      onMq = function () { paint(); };
      if (mq && mq.addEventListener) mq.addEventListener("change", onMq);
      else if (mq && mq.addListener) mq.addListener(onMq);
    } catch (e) {}
    return function stop() {
      try { if (mo) mo.disconnect(); } catch (e) {}
      try {
        if (mq && onMq && mq.removeEventListener) mq.removeEventListener("change", onMq);
        else if (mq && onMq && mq.removeListener) mq.removeListener(onMq);
      } catch (e) {}
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     作り直しても、見ていた場所へ戻す

     画面の作り直しは innerHTML の入れ替えでやっている。入れ替えると
     中の入れ物ごと作り直されるので、スクロールの位置は必ず 0 に戻る。
     そのため「更新した」「選んだ」たびに、画面が先頭へ跳ね上がっていた。

     ここでは **中の並びが変わっていないとき（＝同じ画面の描き直し）だけ**
     位置を戻す。別の画面へ移ったときは先頭のままにする（そこは戻すと困る）。

     戻すのはその場だけ。あとから画面側が「先頭へ戻す」と書いていれば、
     そちらが後に走るので、意図した先頭戻しは今までどおり効く。
     ══════════════════════════════════════════════════════════════════ */
  function keepScrollOnRepaint(el0) {
    var d = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (!d || !d.set || !d.get) return;
    function sig(n) {
      var out = [], i;
      for (i = 0; i < n.children.length; i++) {
        var c = n.children[i];
        out.push(c.tagName + "." + (String(c.className || "").split(/\s+/)[0] || ""));
      }
      return out.join(",");
    }
    /* 入れ物を見分ける手がかり。並びの位置で覚えると、
       左の欄を出し入れしただけで別のものを掴んでしまうので、名前で覚える。 */
    function keyOf(n) {
      var r = n.getAttribute && n.getAttribute("data-role");
      if (r) return '[data-role="' + r + '"]';
      var c = String(n.className || "").split(/\s+/)[0];
      return c ? "." + c : "";
    }
    try {
      Object.defineProperty(el0, "innerHTML", {
        configurable: true,
        get: function () { return d.get.call(this); },
        set: function (v) {
          var before = sig(this), saved = [], i;
          if (this.scrollTop || this.scrollLeft) saved.push(["", this.scrollTop, this.scrollLeft]);
          var all = this.querySelectorAll("*");
          for (i = 0; i < all.length; i++) {
            if (all[i].scrollTop || all[i].scrollLeft) {
              var k = keyOf(all[i]);
              if (k) saved.push([k, all[i].scrollTop, all[i].scrollLeft]);
            }
          }
          d.set.call(this, v);
          if (!saved.length || sig(this) !== before) return;
          var self = this;
          saved.forEach(function (s) {
            var n = s[0] ? self.querySelector(s[0]) : self;
            if (!n) return;
            if (s[2]) n.scrollLeft = s[2];
            if (!s[1]) return;
            n.scrollTop = s[1];
            /* 中身の高さがまだ決まっていない間は、戻した位置が切り詰められる
               （紙を並べ直すのは描き終わったあとなので、よく起きる）。
               次の描画のときに、**誰も触っていなければ**もう一度戻す。 */
            var got = n.scrollTop;
            if (got < s[1] && root.requestAnimationFrame) {
              root.requestAnimationFrame(function () {
                if (n.scrollTop === got) n.scrollTop = s[1];
              });
            }
          });
        }
      });
    } catch (e) {}
  }

  function mount(id, opts) {
    opts = opts || {};

    /* V2 の画面はどれも全画面。開いたまま次を開くと、下に前の画面が残り続けて
       積み上がる（クイズ → 結果 → 復習 … と辿るたびに 1 枚ずつ増えていた）。
       画面の受け渡しは「置き換え」であって「重ね」ではないので、
       新しい画面を出す前に、開いている画面はすべて畳む。
       元の画面へ戻る前提のもの（Feed 共有など）だけ stack: true を指定する。 */
    if (!opts.stack) {
      openStack.slice().forEach(function (a) {
        if (a && a.id !== id) { try { a.forceClose("replaced-by:" + id); } catch (e) {} }
      });
    }

    /* 同じ id の画面が既に開いていれば、必ず畳んでから作り直す。
       使い回すと、前回の描画処理と委譲リスナが残ったまま新しい内容を描くことになり、
       クリックのたびに古い内容へ描き戻される（実測で遭遇した不具合）。 */
    var existing = doc.getElementById(id);
    if (existing) {
      if (existing.__vq2) { try { existing.__vq2.forceClose("replaced"); } catch (e) {} }
      try { if (existing.parentNode) existing.parentNode.removeChild(existing); } catch (e) {}
    }

    var host = el("div", { id: id, class: "vq2-host", role: "dialog", "aria-modal": "true",
                           "aria-label": opts.title || "VocabuQuiz" });
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;";
    var shadow = host.attachShadow({ mode: "open" });
    var style = doc.createElement("style");
    style.textContent = SHELL_CSS + (opts.css || "");
    shadow.appendChild(style);

    /* 本体のテーマを、この画面へも映す。
       影の DOM の中へは外の :root が届かないので、host 自身に
       data-theme を付けて中の :host([data-theme="dark"]) を効かせる。
       本体は html[data-theme-mode] に auto / light / dark を書く。 */
    var themeStop = applyTheme(host);

    /* sheet: 全画面ではなく、中央に浮かぶカード（モバイルでは下から出るシート）。
       背景を押すと閉じる。詳細の確認のような、作業を中断させたくない場面で使う。 */
    var backdrop = null;
    if (opts.sheet) {
      backdrop = el("div", { class: "vq2-sheet-bd" });
      shadow.appendChild(backdrop);
    }
    var wrap = el("div", { class: "vq2-root" + (opts.sheet ? " is-sheet" : "")
      + (isMobile() ? " is-mobile" : "") + (reducedMotion() ? " is-reduced" : "") });
    keepScrollOnRepaint(wrap);
    shadow.appendChild(wrap);
    doc.body.appendChild(host);
    if (backdrop) backdrop.addEventListener("click", function () { api.close("backdrop"); });

    /* 背後のスクロールを止める（モバイルで背景が動くのを防ぐ） */
    var prevOverflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";

    var api = {
      id: id, host: host, shadow: shadow, root: wrap,
      opts: opts,
      close: function (reason) {
        if (opts.onBeforeClose) {
          var v = opts.onBeforeClose(reason);
          if (v === false) return false;
        }
        return api.forceClose(reason);
      },
      /* 確認をはさまずに畳む。画面の作り直しと、確認済みの終了で使う。 */
      forceClose: function (reason) {
        try { if (themeStop) themeStop(); } catch (e) {}
        try { if (host.parentNode) host.parentNode.removeChild(host); } catch (e) {}
        doc.body.style.overflow = prevOverflow;
        openStack = openStack.filter(function (x) { return x !== api; });
        root.removeEventListener("resize", onResize);
        if (opts.onClose) { try { opts.onClose(reason); } catch (e) {} }
        return true;
      },
      isMobile: function () { return wrap.classList.contains("is-mobile"); },
      toast: function (msg, kind, ms) { return toast(wrap, msg, kind, ms); },
      confirm: function (o) { return confirmDialog(wrap, o); },
      alert: function (o) { return alertDialog(wrap, o); },
      /* 中身に手を入れたいとき（iframe を差し込むなど）は onOpen を使う */
      dialog: function (o) { return dialog(wrap, o); }
    };
    host.__vq2 = api;
    openStack.push(api);

    function onResize() {
      wrap.classList.toggle("is-mobile", isMobile());
      if (opts.onResize) { try { opts.onResize(isMobile()); } catch (e) {} }
    }
    root.addEventListener("resize", onResize);

    /* Escape で閉じる（ダイアログが開いていればそちらが先に処理する） */
    shadow.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (wrap.querySelector(".vq2-dialog-layer")) return;
      if (opts.onEscape) { if (opts.onEscape() === false) return; }
      else api.close("escape");
    });

    /* フォーカスを内側に閉じ込める */
    trapFocus(wrap);
    return api;
  }

  function trapFocus(container) {
    container.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = focusables(container);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      var active = container.getRootNode().activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    });
  }
  function focusables(c) {
    return Array.prototype.filter.call(
      c.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
      function (e) { return e.offsetParent !== null || e.getClientRects().length > 0; }
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     共通部品（文字列を返す。組み立ては各画面が行う）
     ══════════════════════════════════════════════════════════════════ */
  function button(o) {
    o = o || {};
    var cls = ["vq2-btn"];
    if (o.variant) cls.push("is-" + o.variant);          /* primary / ghost / danger / quiet */
    if (o.size) cls.push("sz-" + o.size);                 /* sm / lg */
    if (o.iconOnly) cls.push("is-icon");
    if (o.full) cls.push("is-full");
    if (o.active) cls.push("is-active");
    if (o.hideOnMobile) cls.push("vq2-hide-mobile");
    if (o.onlyMobile) cls.push("vq2-only-mobile");
    var attrs = 'type="button" class="' + cls.join(" ") + '"';
    if (o.action) attrs += ' data-act="' + esc(o.action) + '"';
    if (o.id) attrs += ' data-id="' + esc(o.id) + '"';
    if (o.disabled) attrs += " disabled";
    if (o.title) attrs += ' title="' + esc(o.title) + '"';
    if (o.iconOnly || !o.label) attrs += ' aria-label="' + esc(o.aria || o.title || o.label || "") + '"';
    if (o.pressed !== undefined) attrs += ' aria-pressed="' + (o.pressed ? "true" : "false") + '"';
    /* 追加の属性（data-* など）。呼び側が組み立てた文字列をそのまま足す。
       中身は呼び側で esc すること（ここでは触らない）。 */
    if (o.attrs) attrs += " " + o.attrs;
    var inner = (o.icon ? icon(o.icon) : "") + (o.label ? '<span>' + esc(o.label) + "</span>" : "");
    return "<button " + attrs + ">" + inner + "</button>";
  }

  function field(o) {
    o = o || {};
    var id = o.id || ("f" + Math.random().toString(36).slice(2, 8));
    var h = '<div class="vq2-field' + (o.inline ? " is-inline" : "") + '">';
    if (o.label) h += '<label class="vq2-label" for="' + esc(id) + '">' + esc(o.label)
      + (o.required ? ' <span class="vq2-req" aria-label="必須">*</span>' : "") + "</label>";
    if (o.hint) h += '<div class="vq2-hint" id="' + esc(id) + '-hint">' + esc(o.hint) + "</div>";
    var common = 'id="' + esc(id) + '" class="vq2-input"'
      + (o.action ? ' data-act="' + esc(o.action) + '"' : "")
      + (o.key ? ' data-key="' + esc(o.key) + '"' : "")
      + (o.hint ? ' aria-describedby="' + esc(id) + '-hint"' : "")
      + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : "")
      + (o.disabled ? " disabled" : "");
    if (o.type === "textarea") {
      h += "<textarea " + common + ' rows="' + (o.rows || 3) + '">' + esc(o.value) + "</textarea>";
    } else if (o.type === "select") {
      h += "<select " + common + ">" + (o.options || []).map(function (op) {
        return '<option value="' + esc(op.value) + '"' + (String(op.value) === String(o.value) ? " selected" : "") + ">"
          + esc(op.label) + "</option>";
      }).join("") + "</select>";
    } else if (o.type === "number") {
      h += '<input type="number" ' + common
        + (o.min !== undefined ? ' min="' + o.min + '"' : "")
        + (o.max !== undefined ? ' max="' + o.max + '"' : "")
        + (o.step !== undefined ? ' step="' + o.step + '"' : "")
        + ' value="' + esc(o.value) + '">';
    } else {
      h += '<input type="' + (o.type || "text") + '" ' + common + ' value="' + esc(o.value) + '">';
    }
    if (o.error) h += '<div class="vq2-err">' + icon("error") + esc(o.error) + "</div>";
    h += "</div>";
    return h;
  }

  function badge(text, kind) {
    return '<span class="vq2-badge' + (kind ? " is-" + kind : "") + '">' + esc(text) + "</span>";
  }

  /* 状態は色だけで伝えない。必ずアイコンと文字を添える（§6）。 */
  function statusChip(kind, text) {
    var m = { error: "error", warning: "warning", success: "check", info: "info", pending: "clock" };
    return '<span class="vq2-chip is-' + esc(kind) + '">' + icon(m[kind] || "info") + esc(text) + "</span>";
  }

  function empty(o) {
    o = o || {};
    return '<div class="vq2-empty">'
      + '<div class="vq2-empty-i">' + icon(o.icon || "doc") + "</div>"
      + '<div class="vq2-empty-t">' + esc(o.title || "") + "</div>"
      + (o.body ? '<div class="vq2-empty-b">' + esc(o.body) + "</div>" : "")
      + (o.action ? '<div class="vq2-empty-a">' + button(o.action) + "</div>" : "")
      + "</div>";
  }

  /* 読み込み中は製品品質の表示にする（回転する円だけにしない） */
  function skeleton(lines) {
    var n = lines || 3, h = '<div class="vq2-skel" aria-busy="true" role="status" aria-label="読み込み中">';
    for (var i = 0; i < n; i++) h += '<div class="vq2-skel-l" style="width:' + (60 + ((i * 37) % 40)) + '%"></div>';
    return h + "</div>";
  }

  function progressBar(value, max, label) {
    var pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return '<div class="vq2-prog" role="progressbar" aria-valuenow="' + value + '" aria-valuemin="0" aria-valuemax="' + max + '"'
      + (label ? ' aria-label="' + esc(label) + '"' : "") + '>'
      + '<div class="vq2-prog-f" style="width:' + pct.toFixed(1) + '%"></div></div>';
  }

  /* ══════════════════════════════════════════════════════════════════
     Toast / Dialog
     ══════════════════════════════════════════════════════════════════ */
  function toastLayer(rootEl) {
    var l = rootEl.querySelector(".vq2-toast-layer");
    if (!l) { l = el("div", { class: "vq2-toast-layer", role: "status", "aria-live": "polite" }); rootEl.appendChild(l); }
    return l;
  }
  function toast(rootEl, msg, kind, ms) {
    var l = toastLayer(rootEl);
    var t = el("div", { class: "vq2-toast is-" + (kind || "info") });
    t.innerHTML = icon(kind === "error" ? "error" : kind === "warning" ? "warning" : kind === "success" ? "check" : "info")
      + "<span>" + esc(msg) + "</span>";
    l.appendChild(t);
    var life = ms || (kind === "error" ? 7000 : 3500);
    setTimeout(function () {
      t.classList.add("is-out");
      setTimeout(function () { try { l.removeChild(t); } catch (e) {} }, 220);
    }, life);
    return t;
  }

  /* 開いている確認ダイアログ。1 つの画面につき 1 つだけ。
     ボタンを続けて押したときに同じ確認が何枚も重なり、
     いちいち閉じないと先へ進めない状態になっていた（実際に起きた）。
     ・同じ内容の要求 → すでに出ているものを前に出して、同じ Promise を返す。
     ・別の内容の要求 → 前のものを畳んでから出す（前のものは決着させない。
       中途半端な false を返すと、呼び側の「破棄して閉じる」側へ落ちてしまう）。 */
  var openDialogs = new WeakMap();
  function dialogSignature(o) {
    return [o.title || "", o.body || "", o.html || "", o.okLabel || "", o.cancelLabel || ""].join(" ");
  }

  function dialog(rootEl, o) {
    o = o || {};
    var sig = dialogSignature(o);
    var cur = openDialogs.get(rootEl);
    if (cur) {
      if (cur.sig === sig) { cur.focus(); return cur.promise; }
      cur.abandon();
    }
    var handle = {};
    var promise = new Promise(function (resolve) {
      var layer = el("div", { class: "vq2-dialog-layer" });
      var card = el("div", { class: "vq2-dialog" + (o.wide ? " is-wide" : ""), role: "dialog",
                             "aria-modal": "true", "aria-label": o.title || "確認" });
      card.innerHTML =
        '<div class="vq2-dialog-h"><h2>' + esc(o.title || "") + "</h2>"
        + button({ icon: "close", iconOnly: true, variant: "quiet", action: "dlg-x", aria: "閉じる" }) + "</div>"
        + '<div class="vq2-dialog-b">' + (o.html || ("<p>" + esc(o.body || "") + "</p>")) + "</div>"
        + '<div class="vq2-dialog-f">'
        + (o.cancelLabel === null ? "" : button({ label: o.cancelLabel || "キャンセル", action: "dlg-c" }))
        + button({ label: o.okLabel || "OK", variant: o.danger ? "danger" : "primary", action: "dlg-o" })
        + "</div>";
      layer.appendChild(card);
      rootEl.appendChild(layer);

      var prevFocus = rootEl.getRootNode().activeElement;
      var okBtn = card.querySelector('[data-act="dlg-o"]');
      if (okBtn) okBtn.focus();

      /* 開いた直後に中身へ触りたい場合（iframe の描画など）。
         例外が出ても、ダイアログ自体は閉じられる状態のままにする。 */
      if (typeof o.onOpen === "function") { try { o.onOpen(card); } catch (e) {} }

      handle.sig = sig;
      handle.focus = function () { if (okBtn) { try { okBtn.focus(); } catch (e) {} } };
      handle.abandon = function () {
        try { rootEl.removeChild(layer); } catch (e) {}
        if (openDialogs.get(rootEl) === handle) openDialogs.delete(rootEl);
      };

      function done(v) {
        try { rootEl.removeChild(layer); } catch (e) {}
        if (openDialogs.get(rootEl) === handle) openDialogs.delete(rootEl);
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
        resolve(v);
      }
      on(layer, "click", '[data-act="dlg-o"]', function () { done(o.collect ? o.collect(card) : true); });
      on(layer, "click", '[data-act="dlg-c"]', function () { done(false); });
      on(layer, "click", '[data-act="dlg-x"]', function () { done(false); });
      layer.addEventListener("click", function (e) { if (e.target === layer && o.dismissible !== false) done(false); });
      layer.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.stopPropagation(); done(false); }
        if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && okBtn) { e.preventDefault(); okBtn.click(); }
      });
      trapFocus(card);
    });
    handle.promise = promise;
    openDialogs.set(rootEl, handle);
    return promise;
  }
  function confirmDialog(rootEl, o) { return dialog(rootEl, o); }
  function alertDialog(rootEl, o) { return dialog(rootEl, Object.assign({ cancelLabel: null }, o)); }

  /* ══════════════════════════════════════════════════════════════════
     メニュー（右クリック相当のポップオーバー）
     ══════════════════════════════════════════════════════════════════ */
  function menu(rootEl, anchor, items) {
    return new Promise(function (resolve) {
      var old = rootEl.querySelector(".vq2-menu-layer");
      if (old) try { rootEl.removeChild(old); } catch (e) {}
      var layer = el("div", { class: "vq2-menu-layer" });
      var m = el("div", { class: "vq2-menu", role: "menu" });
      m.innerHTML = items.map(function (i) {
        if (i.divider) return '<div class="vq2-menu-div" role="separator"></div>';
        return '<button type="button" role="menuitem" class="vq2-menu-i' + (i.danger ? " is-danger" : "") + '"'
          + ' data-v="' + esc(i.value) + '"' + (i.disabled ? " disabled" : "") + ">"
          + (i.icon ? icon(i.icon) : '<span class="vq2-menu-sp"></span>') + "<span>" + esc(i.label) + "</span>"
          + (i.hint ? '<span class="vq2-menu-k">' + esc(i.hint) + "</span>" : "") + "</button>";
      }).join("");
      layer.appendChild(m);
      rootEl.appendChild(layer);

      var r = anchor.getBoundingClientRect();
      var mw = 240, mh = m.offsetHeight || 200;
      var left = Math.min(r.left, (root.innerWidth || 1200) - mw - 12);
      var top = r.bottom + mh > (root.innerHeight || 800) ? Math.max(8, r.top - mh - 6) : r.bottom + 6;
      m.style.left = Math.max(8, left) + "px";
      m.style.top = top + "px";
      var first = m.querySelector(".vq2-menu-i:not([disabled])");
      if (first) first.focus();

      function done(v) { try { rootEl.removeChild(layer); } catch (e) {} resolve(v); }
      on(layer, "click", ".vq2-menu-i", function (e, t) { done(t.getAttribute("data-v")); });
      layer.addEventListener("click", function (e) { if (e.target === layer) done(null); });
      layer.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.stopPropagation(); done(null); return; }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        var list = Array.prototype.slice.call(m.querySelectorAll(".vq2-menu-i:not([disabled])"));
        var i = list.indexOf(rootEl.getRootNode().activeElement);
        var n = e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        if (list[n]) list[n].focus();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     ペインの境界（Desktop のリサイズ可能な仕切り）
     ══════════════════════════════════════════════════════════════════ */
  function makeResizer(handle, target, o) {
    o = o || {};
    var min = o.min || 220, max = o.max || 720, prop = o.prop || "width";
    var dragging = false, startPos = 0, startSize = 0;

    function begin(clientPos) {
      dragging = true; startPos = clientPos;
      startSize = prop === "width" ? target.offsetWidth : target.offsetHeight;
      handle.classList.add("is-dragging");
      doc.body.style.userSelect = "none";
    }
    function move(clientPos) {
      if (!dragging) return;
      var d = (clientPos - startPos) * (o.invert ? -1 : 1);
      var v = Math.max(min, Math.min(max, startSize + d));
      target.style[prop === "width" ? "width" : "height"] = v + "px";
      if (o.onResize) o.onResize(v);
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("is-dragging");
      doc.body.style.userSelect = "";
      if (o.onEnd) o.onEnd(prop === "width" ? target.offsetWidth : target.offsetHeight);
    }

    handle.addEventListener("mousedown", function (e) { e.preventDefault(); begin(prop === "width" ? e.clientX : e.clientY); });
    doc.addEventListener("mousemove", function (e) { move(prop === "width" ? e.clientX : e.clientY); });
    doc.addEventListener("mouseup", end);
    handle.addEventListener("touchstart", function (e) {
      var t = e.touches[0]; begin(prop === "width" ? t.clientX : t.clientY);
    }, { passive: true });
    doc.addEventListener("touchmove", function (e) {
      if (!dragging) return;
      var t = e.touches[0]; move(prop === "width" ? t.clientX : t.clientY);
    }, { passive: true });
    doc.addEventListener("touchend", end);

    /* キーボードでも動かせるようにする */
    handle.setAttribute("tabindex", "0");
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", prop === "width" ? "vertical" : "horizontal");
    handle.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 48 : 16, cur = prop === "width" ? target.offsetWidth : target.offsetHeight, d = 0;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") d = -step;
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") d = step;
      else return;
      e.preventDefault();
      var v = Math.max(min, Math.min(max, cur + d * (o.invert ? -1 : 1)));
      target.style[prop === "width" ? "width" : "height"] = v + "px";
      if (o.onResize) o.onResize(v);
      if (o.onEnd) o.onEnd(v);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     Activity（処理中の表示）
     ・実際に起きたことだけを出す。60 秒を超えたら自動で開く（§33）。
     ══════════════════════════════════════════════════════════════════ */
  function ActivityPanel(container, o) {
    o = o || {};
    this.el = container;
    this.items = [];
    this.open = false;
    this.startedAt = 0;
    this.autoTimer = null;
    this.onCancel = o.onCancel || null;
    this.el.className = "vq2-act";
    this.render();
  }
  ActivityPanel.prototype.start = function () {
    this.items = []; this.startedAt = Date.now(); this.open = false;
    var self = this;
    clearTimeout(this.autoTimer);
    /* 60 秒を超えたら自動で開く */
    this.autoTimer = setTimeout(function () { self.open = true; self.render(); }, 60000);
    this.render();
  };
  ActivityPanel.prototype.set = function (items) { this.items = items || []; this.render(); };
  ActivityPanel.prototype.stop = function () {
    clearTimeout(this.autoTimer); this.startedAt = 0; this.render();
  };
  ActivityPanel.prototype.toggle = function () { this.open = !this.open; this.render(); };
  ActivityPanel.prototype.render = function () {
    var running = this.startedAt > 0;
    var last = null;
    for (var i = this.items.length - 1; i >= 0; i--)
      if (this.items[i].status === "running") { last = this.items[i]; break; }
    if (!last && this.items.length) last = this.items[this.items.length - 1];

    var head = '<button type="button" class="vq2-act-head" data-act="act-toggle" aria-expanded="' + (this.open ? "true" : "false") + '">'
      + (running ? '<span class="vq2-spin" aria-hidden="true"></span>' : icon("check"))
      + '<span class="vq2-act-now">' + esc(last ? last.label : (running ? "準備しています" : "完了しました"))
      + (last && last.total ? "（" + last.current + "/" + last.total + "）" : "") + "</span>"
      + icon(this.open ? "chevronU" : "chevronD") + "</button>";

    var body = "";
    if (this.open) {
      body = '<ol class="vq2-act-list">' + this.items.map(function (a) {
        var st = a.status === "running" ? "run" : a.status === "failed" ? "err"
               : a.status === "warning" ? "warn" : "ok";
        return '<li class="is-' + st + '">'
          + (a.status === "running" ? '<span class="vq2-spin sm" aria-hidden="true"></span>'
             : icon(st === "err" ? "error" : st === "warn" ? "warning" : "check"))
          + "<span>" + esc(a.label) + (a.total ? "（" + a.current + "/" + a.total + "）" : "") + "</span>"
          + (a.detail ? '<span class="vq2-act-d">' + esc(a.detail) + "</span>" : "")
          + "</li>";
      }).join("") + "</ol>";
    }
    var foot = running && this.onCancel
      ? '<div class="vq2-act-foot">' + button({ label: "停止", icon: "stop", size: "sm", action: "act-cancel" }) + "</div>" : "";
    this.el.innerHTML = head + body + foot;
    this.el.classList.toggle("is-open", this.open);
    this.el.classList.toggle("is-running", running);
  };

  /* ══════════════════════════════════════════════════════════════════
     AI との会話パネル（Quick Chat と同じ形）

     Preset Studio と Quick Mock が同じ見た目・同じ動きになるように、
     ここに 1 つだけ置く。両方に書き写すと、片方だけ直した差が必ず出る。

     持っているもの:
     ・上に会話（利用者の発言 / AI の作業ログ）、下に入力欄
     ・作業ログは届いた順に 1 行ずつ出す（まとめて出さない）
     ・動いているあいだは上に帯（いま何をしているか・経過・残り）
     ・まだ何も話していないときは、印と一言（テンプレートを入れ替える）
     ══════════════════════════════════════════════════════════════════ */

  /* VocabuQuiz の印。輪がゆっくり回り、V が引かれる。
     画像は使わない（Shadow DOM の中で外部読み込みを増やさない）。 */
  function markSvg() {
    return '<svg class="vq2-mark" viewBox="0 0 120 120" role="img" aria-label="VocabuQuiz">'
      + "<defs>"
      + '<linearGradient id="vq2mg" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#9a8ce8"/><stop offset="1" stop-color="#6a58cf"/></linearGradient>'
      + '<linearGradient id="vq2mr" x1="0" y1="0" x2="0.3" y2="1">'
      + '<stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>'
      + '<stop offset="1" stop-color="#ffffff" stop-opacity="0.45"/></linearGradient>'
      + "</defs>"
      + '<rect x="4" y="4" width="112" height="112" rx="30" fill="url(#vq2mg)"/>'
      + '<g class="vq2-mark-r" fill="none" stroke="url(#vq2mr)" stroke-width="8">'
      + '<circle cx="60" cy="47" r="24"/><circle cx="46" cy="70" r="24"/><circle cx="74" cy="70" r="24"/>'
      + "</g>"
      + '<path class="vq2-mark-v" d="M44 44 L60 79 L76 44" fill="none" stroke="#ffffff"'
      + ' stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path class="vq2-mark-b" d="M74 74 L90 78 L80 92 Z" fill="#ffffff" opacity="0.92"/>'
      + "</svg>";
  }

  function heroHtml(lines, sub) {
    return '<div class="vq2-hero">'
      + '<div class="vq2-hero-mark">' + markSvg() + "</div>"
      + '<div class="vq2-hero-l" id="aiHeroLine">' + esc((lines || [""])[0]) + "</div>"
      + (sub ? '<div class="vq2-hero-s">' + esc(sub) + "</div>" : "")
      + "</div>";
  }

  /* 会話とログの入れ物。描画は呼び側が行い、ここは状態と DOM 差し替えだけを持つ。 */
  function AiChat(o) {
    o = o || {};
    this.getRoot = o.getRoot;              /* () => shadow の .vq2-root */
    this.onRepaint = o.onRepaint || null;  /* パネルを描き直す必要があるときに呼ぶ */
    this.turns = o.turns || [];
    this.queue = [];
    this.timer = null;
    this.seen = {};
    this.eta = null;
    this.etaTimer = null;
    this.heroTimer = null;
    this.heroAt = 0;
    this.heroLines = o.heroLines || [];
    this.busy = false;
    this.stream = "";
  }
  AiChat.prototype.root = function () { try { return this.getRoot(); } catch (e) { return null; } };
  AiChat.prototype.q = function (sel) { var r = this.root(); return r ? r.querySelector(sel) : null; };

  /* ── 会話 ── */
  AiChat.prototype.begin = function (userText) {
    this.turns.push({ role: "user", text: String(userText || ""), at: Date.now() });
    this.turns.push({ role: "ai", log: [], text: "", error: null, note: null, at: Date.now() });
    this.seen = {};
    this.queue.length = 0;
    this.stream = "";
    this.busy = true;
  };
  AiChat.prototype.current = function () {
    for (var i = this.turns.length - 1; i >= 0; i--) if (this.turns[i].role === "ai") return this.turns[i];
    return null;
  };
  AiChat.prototype.end = function (opts) {
    opts = opts || {};
    this.busy = false;
    this.eta = null;
    clearInterval(this.etaTimer); this.etaTimer = null;
    this.flushAll();
    var t = this.current();
    if (t) { t.note = opts.note || null; t.error = opts.error || null; t.text = ""; }
  };

  /* ── ログ（1 行ずつ出す） ── */
  AiChat.prototype.log = function (kind, text) {
    var t = this.current();
    if (!t) return;
    var e = { kind: kind, text: String(text || ""), at: Date.now() };
    t.log.push(e);
    this.queue.push(e);
    if (this.onLog) { try { this.onLog(e); } catch (x) {} }
    this.pump();
  };
  /* Orchestrator の進行をそのまま流す（同じ状態は 1 回だけ） */
  AiChat.prototype.fromActivity = function (items) {
    var self = this;
    (items || []).forEach(function (it) {
      var key = (it.type || it.label) + "|" + it.status;
      if (self.seen[key]) return;
      self.seen[key] = true;
      if (it.status === "running") self.log("run", it.label);
      else if (it.status === "completed") self.log("done", it.label);
      else if (it.status === "warning") self.log("warn", it.label);
      else if (it.status === "failed") self.log("error", it.label);
    });
  };
  AiChat.prototype.delay = function () {
    if (reducedMotion()) return 0;
    var n = this.queue.length;
    return n > 8 ? 60 : n > 4 ? 140 : 320;
  };
  AiChat.prototype.pump = function () {
    var self = this;
    if (this.timer || !this.queue.length) return;
    var d = this.delay();
    if (!d) { while (this.queue.length) this.append(this.queue.shift()); return; }
    this.timer = setTimeout(function () {
      self.timer = null;
      if (self.queue.length) self.append(self.queue.shift());
      self.pump();
    }, d);
  };
  AiChat.prototype.flushAll = function () {
    clearTimeout(this.timer); this.timer = null;
    while (this.queue.length) this.append(this.queue.shift());
  };
  AiChat.prototype.append = function (e) {
    /* 出し先を差し替えられるようにする（タイムラインへ流す画面がある）。
       ここに来るのは pump が 1 行ずつ取り出したときだけなので、
       差し替えても「まとめて出さない」動きはそのまま保たれる。 */
    if (this.onAppend) {
      try { this.onAppend(e); } catch (x) {}
      e.__shown = true;
      return;
    }
    var host = this.q("#aiLog");
    if (!host) { e.__shown = true; if (this.onRepaint) this.onRepaint(); return; }
    var div = doc.createElement("div");
    div.className = "vq2-logrow is-new k-" + e.kind;
    div.innerHTML = this.rowInner(e);
    host.appendChild(div);
    e.__shown = true;
    this.scrollToEnd();
  };
  AiChat.prototype.rowInner = function (e) {
    var mark = e.kind === "done" ? icon("check")
      : e.kind === "warn" ? icon("warning")
      : e.kind === "error" ? icon("error")
      : e.kind === "note" ? icon("info")
      : '<span class="vq2-logdot"></span>';
    return '<span class="vq2-logi">' + mark + "</span><span>" + esc(e.text) + "</span>";
  };
  AiChat.prototype.scrollToEnd = function () {
    var sc = this.q("#aiScroll");
    if (sc) sc.scrollTop = sc.scrollHeight;
  };
  /* 途中経過の本文だけを書き換える（パネルごと描き直すと入力中の文字が消える） */
  AiChat.prototype.setStream = function (text) {
    this.stream = String(text || "");
    var box = this.q("#aiStream");
    if (!box) { if (this.onRepaint) this.onRepaint(); return; }
    box.hidden = !this.stream;
    box.textContent = this.stream.slice(-900);
    this.scrollToEnd();
  };

  /* ── 経過時間と見込み時間 ──
     見込みは「実際に終わった回の所要時間」からだけ出す。
     まだ 1 回も終わっていないうちは数字を出さない（当てずっぽうを見せない）。 */
  AiChat.prototype.etaStart = function (total, label) {
    var self = this;
    this.eta = { startedAt: Date.now(), total: total || 0, done: 0,
                 durations: [], roundStartedAt: 0, label: label || "",
                 /* 実際に完成した問題数（分かる画面だけが入れる） */
                 made: 0, madeTotal: 0 };
    if (!this.etaTimer) this.etaTimer = setInterval(function () { self.paintEta(); }, 1000);
    this.paintEta();
  };
  AiChat.prototype.etaRound = function (label) {
    if (!this.eta) return;
    this.eta.roundStartedAt = Date.now();
    if (label) this.eta.label = label;
    this.paintEta();
  };
  AiChat.prototype.etaDone = function () {
    if (!this.eta || !this.eta.roundStartedAt) return;
    this.eta.durations.push(Date.now() - this.eta.roundStartedAt);
    this.eta.roundStartedAt = 0;
    this.eta.done++;
    this.paintEta();
  };
  AiChat.prototype.etaTotal = function (n) { if (this.eta) this.eta.total = n; };
  /* 1 巡ぶんの区切り。**終わった数は数え上げず、実数で受け取る。**

     これまでは etaRound（始まり）と etaDone（終わり）を対で呼ぶ前提だったが、
     Quick Mock は生成中 etaRound しか呼んでおらず、etaDone は全部終わってから
     1 回だけ呼ばれていた。そのため durations がずっと空で、
     remainingMs() は null を返し続け、画面は最後まで
     「0 / N・残りを計算しています」のままだった（実測）。

     o.done  … いま何回ぶん終わったか（実数。省略時は 1 つ進める）
     o.total … 全部で何回か（実依頼数。省略時は据え置き）
     o.more  … false なら次の巡は始めない（最後の 1 回ぶんを二重に数えない） */
  AiChat.prototype.etaStep = function (o) {
    if (!this.eta) return;
    o = o || {};
    var e = this.eta, now = Date.now();
    /* 始まりの時刻があるなら、その巡はいま終わった。所要時間として残す。 */
    if (e.roundStartedAt) e.durations.push(now - e.roundStartedAt);
    if (typeof o.total === "number" && o.total > 0) e.total = o.total;
    if (typeof o.done === "number" && o.done >= 0) e.done = o.done;
    else e.done++;
    /* 「何回ぶん終わったか」とは別に、**実際に完成した問題数**も持てる。
       利用者が知りたいのは回数ではなく「いま何問できたか」なので、
       あるならそちらを数えて見せる（無ければ回数のまま）。 */
    if (typeof o.made === "number" && o.made >= 0) e.made = o.made;
    if (typeof o.madeTotal === "number" && o.madeTotal > 0) e.madeTotal = o.madeTotal;
    /* 出せる数より多く出さない（6 / 5 と見せない）。 */
    if (e.total && e.done > e.total) e.done = e.total;
    e.roundStartedAt = o.more === false ? 0 : now;
    if (o.label) e.label = o.label;
    this.paintEta();
  };
  AiChat.prototype.remainingMs = function () {
    var e = this.eta;
    if (!e || !e.durations.length) return null;
    var left = Math.max(0, e.total - e.done);
    if (!left) return 0;
    var s = e.durations.slice().sort(function (a, b) { return a - b; });
    var typical = s[Math.floor(s.length / 2)];
    var inFlight = e.roundStartedAt ? Math.max(0, typical - (Date.now() - e.roundStartedAt)) : 0;
    return typical * Math.max(0, left - (e.roundStartedAt ? 1 : 0)) + inFlight;
  };
  AiChat.prototype.paintEta = function () {
    var box = this.q("#aiEta");
    if (!box) return;
    if (!this.busy || !this.eta) { box.innerHTML = ""; return; }
    var left = this.remainingMs();
    box.innerHTML =
      '<span class="vq2-eta-t">経過 ' + esc(fmtClock(Date.now() - this.eta.startedAt)) + "</span>"
      + '<span class="vq2-eta-s">'
      + (left === null ? "残りを計算しています"
         : left <= 0 ? "まもなく終わります" : "残り およそ " + esc(fmtDuration(left)))
      + "</span>"
      + (this.eta.madeTotal
          ? '<span class="vq2-eta-n">' + this.eta.made + " / " + this.eta.madeTotal + "問</span>"
          : this.eta.total ? '<span class="vq2-eta-n">' + this.eta.done + " / " + this.eta.total + "</span>" : "");
  };

  /* ── 一言の入れ替え（文字だけ差し替える） ── */
  AiChat.prototype.startHero = function () {
    var self = this;
    clearInterval(this.heroTimer); this.heroTimer = null;
    if (!this.q("#aiHeroLine") || reducedMotion() || this.heroLines.length < 2) return;
    this.heroTimer = setInterval(function () {
      var line = self.q("#aiHeroLine");
      if (!line) { clearInterval(self.heroTimer); self.heroTimer = null; return; }
      self.heroAt = (self.heroAt + 1) % self.heroLines.length;
      line.classList.add("is-out");
      setTimeout(function () {
        line.textContent = self.heroLines[self.heroAt];
        line.classList.remove("is-out");
      }, 260);
    }, 5200);
  };
  AiChat.prototype.stop = function () {
    clearInterval(this.etaTimer); this.etaTimer = null;
    clearInterval(this.heroTimer); this.heroTimer = null;
    clearTimeout(this.timer); this.timer = null;
  };

  /* ── 描画（呼び側は runBar + body + composer を好きに組む） ── */
  AiChat.prototype.runBarHtml = function (fallbackLabel) {
    if (!this.busy) return "";
    return '<div class="vq2-runbar">'
      + '<span class="vq2-spin" aria-hidden="true"></span>'
      + '<span class="vq2-runbar-t">' + esc(this.eta && this.eta.label ? this.eta.label : (fallbackLabel || "作っています")) + "</span>"
      + '<span class="vq2-eta" id="aiEta" role="status" aria-live="polite"></span></div>';
  };
  /* 会話の中身。extra(turn, isLast) で差分表示などを差し込める。 */
  AiChat.prototype.bodyHtml = function (o) {
    o = o || {};
    var self = this;
    var h = '<div class="vq2-chat-b" id="aiScroll">';
    if (!this.turns.length) h += heroHtml(this.heroLines, o.heroSub) + (o.intro || "");
    this.turns.forEach(function (t, i) {
      var last = i === self.turns.length - 1;
      if (t.role === "user") {
        h += '<div class="vq2-msg is-me"><div class="vq2-bubble">' + esc(t.text) + "</div></div>";
        return;
      }
      h += '<div class="vq2-msg"><div class="vq2-msg-i">' + icon("sparkle") + '</div><div class="vq2-msg-b">';
      /* まだ出していない行は描かない。出す順番は queue が持っている。 */
      h += '<div class="vq2-logbox"' + (last ? ' id="aiLog"' : "") + ">"
        + t.log.filter(function (e) { return !last || e.__shown; })
            .map(function (e) { e.__shown = true; return '<div class="vq2-logrow k-' + e.kind + '">' + self.rowInner(e) + "</div>"; }).join("")
        + "</div>";
      if (last && self.busy)
        h += '<div class="vq2-stream" id="aiStream"' + (self.stream ? "" : " hidden") + ">"
          + esc(self.stream.slice(-900)) + "</div>"
          + '<div class="vq2-logrow k-run"><span class="vq2-logi"><span class="vq2-spin"></span></span>'
          + "<span>作業中です…</span></div>";
      if (t.note) h += '<div class="vq2-note">' + esc(t.note) + "</div>";
      if (t.error) h += '<div class="vq2-note is-err">' + statusChip("error", "失敗") + " " + esc(t.error) + "</div>";
      if (o.extra) h += o.extra(t, last);
      h += "</div></div>";
    });
    return h + "</div>";
  };

  function fmtDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + " 秒";
    var m = Math.floor(s / 60);
    return m + " 分" + (s % 60 ? " " + (s % 60) + " 秒" : "");
  }
  function fmtClock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }

  VQ2.ui = {
    esc: esc, el: el, on: on, icon: icon, ICONS: ICONS,
    AiChat: AiChat, markSvg: markSvg, heroHtml: heroHtml,
    fmtDuration: fmtDuration, fmtClock: fmtClock,
    mount: mount, isMobile: isMobile, reducedMotion: reducedMotion,
    button: button, field: field, badge: badge, statusChip: statusChip,
    empty: empty, skeleton: skeleton, progressBar: progressBar,
    toast: toast, dialog: dialog, menu: menu,
    makeResizer: makeResizer, ActivityPanel: ActivityPanel,
    focusables: focusables,
    pickAttachments: pickAttachments, removeAttachment: removeAttachment,
    attachDisplay: attachDisplay, currentAttachments: currentAttachments,
    attachSummary: attachSummary, toAiAttachments: toAiAttachments,
    /* 画像として渡すページ数の上限。出どころは Bridge の attachments.json。 */
    scanPageLimit: scanPageLimit, refreshScanLimits: refreshScanLimits,
    openCount: function () { return openStack.length; }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
