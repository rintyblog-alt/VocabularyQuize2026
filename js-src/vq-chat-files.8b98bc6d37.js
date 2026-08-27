
/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz Quick Chat — 第2段階 Document Engine（添付・抽出・処理イベント）
   ─────────────────────────────────────────────────────────────────────────
   ・window.__vqChatFiles を公開。UI(vqchat.js)はここだけを見る（provider固有処理なし）。
   ・ファイル本体は IndexedDB。localStorage へ Base64 保存は一切しない。
   ・抽出はすべて実処理。タイマーで進捗を偽装しない。
   ・ZIP/DOCX はブラウザ標準 DecompressionStream('deflate-raw') で実展開（外部lib不要）。
   ・PDF はアプリ既存の pdf.js を再利用し、ページ単位で埋め込みテキストを抽出。
     文字が取れないページは ocr-required として明示（OCRは未接続なので"解析済み"とは言わない）。
   ・すべての工程が AbortSignal で中断可能。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__vqChatFilesInstalled) return;
  window.__vqChatFilesInstalled = true;

  /* ══ 1. 共通設定（唯一の定義箇所） ══════════════════════════════ */
  /* 受け入れの上限。Quick Chat / プリセット作成 / Quick Mock はすべてここを見る。
     「ちょっとしたPDFでも弾かれる」ため大幅に引き上げた。
     ただし maxContextChars だけは別物で、これはモデルの文脈長（32k）に縛られる。
     ここを上げても読ませられる量は増えず、かえって生成が壊れるので据え置く。 */
  var LIMITS = {
    /* 種類ごとの上限。1ファイルあたり。 */
    maxBytesByKind: {
      document: 512 * 1024 * 1024,         /* PDF・DOCX・テキスト・コード 512MB（約200万トークンまで） */
      sheet: 50 * 1024 * 1024,             /* CSV・TSV などの表 50MB */
      image: 20 * 1024 * 1024,             /* 画像 20MB */
      archive: 512 * 1024 * 1024           /* ZIP 512MB */
    },
    maxFileBytes: 512 * 1024 * 1024,       /* 種類が分からないときの既定 */
    maxTokensPerFile: 2000000,             /* 1ファイル 200万トークン相当まで */
    maxFiles: 40,                          /* 1メッセージ 40件 */
    maxTotalBytes: 1024 * 1024 * 1024,     /* 1メッセージ合計 1GB */
    maxPdfPages: 2000,
    /* 解析へ渡す画像の長辺。名前は Bridge 側（attachments.json の maxImageEdgePx）に合わせる。
       同じものを別の名前で持つと、片方だけ直したときに黙って食い違う。
       maxImagePixels は昔の名前。外して壊れる場所が無いか確かめるまで別名として残す。 */
    maxImageEdgePx: 2048,
    get maxImagePixels() { return this.maxImageEdgePx; },
    /* スキャンPDF（文字が入っていないページ）を画像として読ませるときの上限。
       1枚あたり千数百トークン使うので、増やしすぎると文脈が足りなくなる。 */
    maxScanPages: 12,
    maxScanBytes: 24 * 1024 * 1024,
    /* 1ファイルから取り込む本文の上限。
       ここが 800 万字だったため、資料をそのまま JSON へ載せると 40MB を超え、
       Bridge が本文を読み切る前に BODY_TOO_LARGE で落ちていた（実測）。
       Bridge 側の maxTextCharsPerAttachment と同じ 40 万字にそろえる。 */
    maxTextChars: 400000,
    maxContextChars: 120000,               /* AIへ渡す合計テキスト上限（モデルの文脈長で決まる） */
    zip: {
      maxEntries: 3000,
      maxTotalUncompressed: 800 * 1024 * 1024,
      maxRatio: 200,                       /* 圧縮率異常(ZIP Bomb)判定 */
      maxNesting: 1,                       /* ネストZIPは展開しない(=1階層のみ) */
      maxEntryBytes: 120 * 1024 * 1024
    }
  };

  var TEXT_EXT = ("txt,md,markdown,csv,tsv,json,html,htm,xml,yaml,yml,toml,ini,cfg,conf,log,sql," +
    "js,mjs,cjs,ts,tsx,jsx,css,scss,sass,less,py,rb,go,rs,java,kt,kts,swift,c,h,cpp,cc,hpp,cs,php," +
    "sh,bash,zsh,bat,ps1,vue,svelte,graphql,gql,env,gitignore,dockerfile,makefile,r,m,pl,lua,dart,scala,ex,exs").split(",");
  var IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif)$/i;
  var BIN_EXT = ("exe,dll,so,dylib,bin,app,msi,dmg,pkg,deb,rpm,jar,war,class,o,a,lib,pyc,pyo," +
    "png,jpg,jpeg,gif,webp,bmp,ico,tiff,mp3,mp4,mov,avi,wav,flac,ogg,webm,zip,gz,tar,bz2,7z,rar,pdf,docx,xlsx,pptx,woff,woff2,ttf,otf,eot").split(",");

  function extOf(name) { var m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ""; }
  function baseName(p) { var s = String(p || ""); var i = s.lastIndexOf("/"); return i >= 0 ? s.slice(i + 1) : s; }
  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b < 1024) return b + "B";
    if (b < 1048576) return (b / 1024).toFixed(1) + "KB";
    return (b / 1048576).toFixed(1) + "MB";
  }
  function uid(p) { return (p || "a") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }

  /* ══ 2. 処理イベント基盤 ═══════════════════════════════════════ */
  /* Activity = {id, conversationId, messageId, attachmentId, type, label, status,
                 current, total, startedAt, completedAt, metadata} */
  var EV = { list: [], seq: 0, subs: [], runStartedAt: 0, autoShown: false };
  var LABELS = {
    "request.queued": "リクエストを準備しています",
    "file.selected": "ファイルを受け取りました",
    "file.validation": "ファイルを検証しています",
    "pdf.inspect": "PDFのページを確認しています",
    "pdf.extract": "PDFから文字情報を抽出しています",
    "pdf.ocr": "画像化されたページを確認しています",
    "image.analyze": "画像を準備しています",
    "document.extract": "文書から本文を抽出しています",
    "zip.inspect": "ZIPの内容を確認しています",
    "zip.extract": "ZIP内のファイルを整理しています",
    "context.prepare": "質問に関連する内容を整理しています",
    "response.generate": "回答を生成しています",
    "request.completed": "処理が完了しました",
    "request.failed": "処理に失敗しました",
    "request.cancelled": "処理を停止しました"
  };
  function emit(type, patch) {
    var e = {
      id: "activity-" + (++EV.seq),
      conversationId: patch && patch.conversationId || "",
      messageId: patch && patch.messageId || "",
      attachmentId: patch && patch.attachmentId || "",
      type: type,
      label: (patch && patch.label) || LABELS[type] || type,
      status: (patch && patch.status) || "running",
      current: patch && patch.current != null ? patch.current : null,
      total: patch && patch.total != null ? patch.total : null,
      detail: (patch && patch.detail) || "",
      group: (patch && patch.group) || "",
      startedAt: Date.now(),
      /* 最後に動いた時刻。見張り（closeStrayRuns）が
         「本当に止まっているもの」だけを閉じるために使う。 */
      touchedAt: Date.now(),
      completedAt: null,
      metadata: (patch && patch.metadata) || {}
    };
    EV.list.push(e);
    if (EV.list.length > 200) EV.list.splice(0, EV.list.length - 200);
    notify();
    return e;
  }
  function update(e, patch) {
    if (!e) return;
    for (var k in patch) e[k] = patch[k];
    e.touchedAt = Date.now();
    if (patch.status && patch.status !== "running" && patch.status !== "pending") e.completedAt = Date.now();
    notify();
  }
  function notify() { for (var i = 0; i < EV.subs.length; i++) { try { EV.subs[i](); } catch (x) {} } }
  function beginRun() { EV.list = []; EV.seq = 0; EV.runStartedAt = Date.now(); EV.autoShown = false; persist(); notify(); }
  function endRun() { persist(); notify(); }
  function currentRunning() {
    for (var i = EV.list.length - 1; i >= 0; i--) if (EV.list[i].status === "running") return EV.list[i];
    return null;
  }
  /* 再読み込み復元用の最小限のスナップショット（偽の継続表示はしない） */
  function persist() {
    try {
      sessionStorage.setItem("vq.chat.run.v1", JSON.stringify({
        startedAt: EV.runStartedAt, autoShown: EV.autoShown,
        events: EV.list.slice(-40)
      }));
    } catch (x) {}
  }
  function restore() {
    try {
      var s = JSON.parse(sessionStorage.getItem("vq.chat.run.v1") || "null");
      if (!s || !Array.isArray(s.events)) return;
      /* 実処理はページ再読み込みで失われるため、running のまま復元せず cancelled に整理する */
      EV.list = s.events.map(function (e) {
        if (e.status === "running" || e.status === "pending") { e.status = "cancelled"; e.completedAt = Date.now(); }
        return e;
      });
      EV.seq = EV.list.length;
      EV.runStartedAt = 0;
      EV.autoShown = !!s.autoShown;
    } catch (x) {}
  }

  /* ══ 3. IndexedDB（ファイル本体） ══════════════════════════════ */
  var DB = null;
  function db() {
    if (DB) return DB;
    DB = new Promise(function (res, rej) {
      var r = indexedDB.open("vq-chat-files", 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs");
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return DB;
  }
  async function idbPut(key, blob) {
    var d = await db();
    return new Promise(function (res, rej) {
      var t = d.transaction("blobs", "readwrite");
      t.objectStore("blobs").put(blob, key);
      t.oncomplete = function () { res(true); };
      t.onerror = function () { rej(t.error); };
    });
  }
  async function idbDel(key) {
    var d = await db();
    return new Promise(function (res) {
      var t = d.transaction("blobs", "readwrite");
      t.objectStore("blobs").delete(key);
      t.oncomplete = function () { res(true); };
      t.onerror = function () { res(false); };
    });
  }
  /* 迷子になった本体を消す。
     一覧（ITEMS）は localStorage、本体は IndexedDB と置き場所が分かれている。
     タブを閉じた・保存に失敗した・別の端末で消した、のいずれでも
     本体だけが残る。100MB の資料が何本も居座るので、起動時に突き合わせて消す。 */
  async function sweepBlobs() {
    try {
      var d = await db();
      var keys = await new Promise(function (res) {
        var t = d.transaction("blobs", "readonly");
        var q = t.objectStore("blobs").getAllKeys();
        q.onsuccess = function () { res(q.result || []); };
        q.onerror = function () { res([]); };
      });
      var live = {};
      ITEMS.forEach(function (x) { live[x.id] = true; });
      var gone = keys.filter(function (k) { return !live[k]; });
      for (var i = 0; i < gone.length; i++) await idbDel(gone[i]);
      return { checked: keys.length, removed: gone.length };
    } catch (x) { return { checked: 0, removed: 0, error: String(x && x.message) }; }
  }

  /* ══ 4. ZIP リーダー（DecompressionStream・セキュリティ検査つき） ══ */
  function u16(v, o) { return v[o] | (v[o + 1] << 8); }
  function u32(v, o) { return (v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24)) >>> 0; }
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") throw new Error("NO_INFLATE");
    var ds = new DecompressionStream("deflate-raw");
    var s = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  /* 中央ディレクトリを読む。戻り値の entries は「検査済み」の一覧（本体は未展開） */
  function readZipDirectory(buf) {
    var v = new Uint8Array(buf), n = v.length, eocd = -1;
    for (var i = n - 22; i >= 0 && i > n - 65558; i--) { if (u32(v, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error("ZIP_BROKEN");
    var count = u16(v, eocd + 10), off = u32(v, eocd + 16);
    var entries = [], p = off;
    for (var k = 0; k < count; k++) {
      if (u32(v, p) !== 0x02014b50) throw new Error("ZIP_BROKEN");
      var flag = u16(v, p + 8), method = u16(v, p + 10);
      var csize = u32(v, p + 20), usize = u32(v, p + 24);
      var nl = u16(v, p + 28), el = u16(v, p + 30), cl = u16(v, p + 32);
      var extAttr = u32(v, p + 38), lho = u32(v, p + 42);
      var name = new TextDecoder(flag & 0x800 ? "utf-8" : "utf-8").decode(v.subarray(p + 46, p + 46 + nl));
      entries.push({
        name: name, method: method, csize: csize, usize: usize, lho: lho,
        encrypted: !!(flag & 0x1), unixMode: (extAttr >>> 16) & 0xffff,
        dir: /\/$/.test(name)
      });
      p += 46 + nl + el + cl;
    }
    return entries;
  }
  async function readZipEntry(buf, e) {
    var v = new Uint8Array(buf);
    if (u32(v, e.lho) !== 0x04034b50) throw new Error("ZIP_BROKEN");
    var nl = u16(v, e.lho + 26), el = u16(v, e.lho + 28);
    var start = e.lho + 30 + nl + el;
    var raw = v.subarray(start, start + e.csize);
    if (e.method === 0) return raw.slice();
    if (e.method === 8) return await inflateRaw(raw);
    throw new Error("ZIP_METHOD_UNSUPPORTED");
  }
  /* セキュリティ判定 */
  function zipEntryVerdict(e) {
    var name = e.name;
    if (e.encrypted) return { skip: true, reason: "パスワード保護", fatal: "ZIP_ENCRYPTED" };
    if (/^([a-zA-Z]:)?[\\/]/.test(name)) return { skip: true, reason: "絶対パス（不正）" };
    if (name.split(/[\\/]/).indexOf("..") >= 0) return { skip: true, reason: "上位パス参照（不正）" };
    if ((e.unixMode & 0xf000) === 0xa000) return { skip: true, reason: "シンボリックリンク" };
    if (/^__MACOSX\//.test(name) || /(^|\/)\.DS_Store$/.test(name)) return { skip: true, reason: "不要項目" };
    if (e.dir) return { skip: true, silent: true };
    if (e.usize > LIMITS.zip.maxEntryBytes) return { skip: true, reason: "サイズ超過（" + fmtBytes(e.usize) + "）" };
    if (e.csize > 0 && e.usize / e.csize > LIMITS.zip.maxRatio) return { skip: true, reason: "圧縮率異常（ZIP Bombの疑い）" };
    var ex = extOf(name);
    if (ex === "zip") return { skip: true, reason: "ネストZIP（展開しません）" };
    if (TEXT_EXT.indexOf(ex) >= 0) return { skip: false, kind: "text" };
    if (BIN_EXT.indexOf(ex) >= 0) return { skip: true, reason: "バイナリ／実行ファイル" };
    return { skip: true, reason: "未対応形式" };
  }

  /* ══ 5. テキスト読み取り（文字コード判定・制御文字除去） ══════════ */
  function decodeText(bytes) {
    var b = bytes;
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
    var t = new TextDecoder("utf-8", { fatal: false }).decode(b);
    /* U+FFFD が多い＝UTF-8ではない → Shift_JIS を試す */
    var bad = (t.match(/�/g) || []).length;
    if (bad > Math.max(4, t.length * 0.01)) {
      try {
        var t2 = new TextDecoder("shift_jis", { fatal: false }).decode(b);
        if ((t2.match(/�/g) || []).length < bad) t = t2;
      } catch (x) {}
    }
    /* 制御文字（タブ・改行以外）を除去 */
    return t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  }
  function clip(text, max) {
    text = String(text || "");
    if (text.length <= max) return { text: text, truncated: false };
    return { text: text.slice(0, max), truncated: true };
  }

  /* ══ 6. 添付モデル ══════════════════════════════════════════════ */
  /* state: selected|queued|extracting|ready|warning|failed|cancelled */
  var ITEMS = [];
  function list() { return ITEMS.slice(); }
  function totalBytes() { return ITEMS.reduce(function (a, x) { return a + (x.size || 0); }, 0); }

  /* 種類ごとに上限が違うので、拡張子と MIME から先に種類を決める */
  var SHEET_EXT = ["csv", "tsv"];
  function kindOfFile(file) {
    var ex = extOf(file.name), mime = String(file.type || "");
    if (IMAGE_MIME.test(mime)) return "image";
    if (ex === "zip") return "archive";
    if (SHEET_EXT.indexOf(ex) >= 0) return "sheet";
    return "document";
  }
  var KIND_JA = { image: "画像", archive: "ZIP", sheet: "表（CSV・TSV）", document: "ドキュメント" };

  function validate(file) {
    var kind0 = kindOfFile(file);
    var cap = LIMITS.maxBytesByKind[kind0] || LIMITS.maxFileBytes;
    if (file.size > cap)
      return "「" + file.name + "」は " + fmtBytes(file.size) + " です。"
        + KIND_JA[kind0] + "は 1ファイル " + fmtBytes(cap) + " まで添付できます。";
    if (ITEMS.length >= LIMITS.maxFiles)
      return "添付できるのは1メッセージにつき " + LIMITS.maxFiles + " 件までです。";
    if (totalBytes() + file.size > LIMITS.maxTotalBytes)
      return "合計サイズが上限（" + fmtBytes(LIMITS.maxTotalBytes) + "）を超えます。";
    var ex = extOf(file.name), mime = String(file.type || "");
    var ok = IMAGE_MIME.test(mime) || ex === "pdf" || ex === "docx" || ex === "zip" || TEXT_EXT.indexOf(ex) >= 0;
    if (!ok) return "「" + file.name + "」は未対応の形式です。画像 / PDF / DOCX / ZIP / テキスト・コードを添付できます。";
    for (var i = 0; i < ITEMS.length; i++)
      if (ITEMS[i].name === file.name && ITEMS[i].size === file.size) return "「" + file.name + "」はすでに添付されています。";
    return "";
  }

  var abortCtl = null;
  function signal() { return abortCtl ? abortCtl.signal : null; }
  function throwIfAborted() { if (abortCtl && abortCtl.signal.aborted) { var e = new Error("ABORTED"); e.name = "AbortError"; throw e; } }

  async function add(files) {
    if (!files || !files.length) return;
    /* FileList をそのまま回さない。途中で await するあいだに呼び出し側が
       input.value = "" などで中身を消すと、残りが黙って失われる。 */
    var picked = Array.prototype.slice.call(files);
    if (!abortCtl || abortCtl.signal.aborted) abortCtl = new AbortController();
    for (var i = 0; i < picked.length; i++) {
      var f = picked[i];
      var err = validate(f);
      if (err) { emit("file.validation", { status: "failed", label: "ファイルを追加できませんでした", detail: err }); notify(); continue; }
      var kind = IMAGE_MIME.test(f.type) ? "image" : extOf(f.name) === "pdf" ? "pdf"
        : extOf(f.name) === "docx" ? "docx" : extOf(f.name) === "zip" ? "zip" : "text";
      var it = {
        id: uid("att"), name: f.name, size: f.size, mimeType: f.type || "", kind: kind,
        status: "queued", statusText: "解析待ち", file: f, thumb: "", error: "",
        pageCount: null, pages: null, pageImages: null, fileCount: null, includedCount: null, excludedCount: null,
        entries: null, text: "", truncated: false, imageDataUrl: "", warnings: [], createdAt: Date.now(),
        scope: "message"   /* message | conversation | project */
      };
      ITEMS.push(it);
      emit("file.selected", { attachmentId: it.id, label: "ファイルを受け取りました", detail: it.name + "・" + fmtBytes(it.size), status: "completed" });
      notify();
      try { await idbPut(it.id, f); } catch (x) {}
      extract(it);            /* 逐次でなく個別に走らせてUIを止めない */
    }
  }

  async function extract(it) {
    it.status = "extracting"; it.statusText = "解析中"; notify();
    var ev = null;
    try {
      throwIfAborted();
      if (it.kind === "text") {
        ev = emit("document.extract", { attachmentId: it.id, label: "テキストを読み取っています", detail: it.name });
        var buf = new Uint8Array(await it.file.arrayBuffer());
        var raw = decodeText(buf);
        var ex = extOf(it.name);
        if (ex === "json") { try { JSON.parse(raw); } catch (e) { it.warnings.push("JSONの構文エラーを検出しました（テキストとして扱います）"); } }
        if (ex === "csv" || ex === "tsv") {
          var lines = raw.split(/\r?\n/).filter(Boolean);
          var sep = ex === "tsv" ? "\t" : ",";
          it.warnings.push(lines.length + "行 / " + ((lines[0] || "").split(sep).length) + "列");
        }
        var c = clip(raw, LIMITS.maxTextChars);
        it.text = c.text; it.truncated = c.truncated;
        it.lineCount = raw.split(/\n/).length;
        update(ev, { status: "completed", label: "テキストを読み取りました", detail: it.lineCount + "行" });
      } else if (it.kind === "image") {
        ev = emit("image.analyze", { attachmentId: it.id, label: "画像を準備しています", detail: it.name });
        var r = await prepImage(it.file);
        it.thumb = r.thumb; it.imageDataUrl = r.dataUrl; it.width = r.w; it.height = r.h;
        update(ev, { status: "completed", label: "画像を準備しました", detail: r.w + "×" + r.h });
      } else if (it.kind === "pdf") {
        await extractPdf(it);
      } else if (it.kind === "docx") {
        ev = emit("document.extract", { attachmentId: it.id, label: "文書から本文を抽出しています", detail: it.name });
        var t = await extractDocx(await it.file.arrayBuffer());
        var cc = clip(t, LIMITS.maxTextChars);
        it.text = cc.text; it.truncated = cc.truncated;
        update(ev, { status: "completed", label: "本文を抽出しました", detail: it.text.length + "文字" });
      } else if (it.kind === "zip") {
        await extractZip(it);
      }
      throwIfAborted();
      it.status = it.warnings.length ? "warning" : "ready";
      it.statusText = it.status === "warning" ? "警告あり" : "使用可能";
    } catch (e) {
      if (e && e.name === "AbortError") { it.status = "cancelled"; it.statusText = "キャンセル済み"; if (ev) update(ev, { status: "cancelled" }); }
      else {
        it.status = "failed"; it.statusText = "失敗";
        it.error = friendly(e);
        if (ev) update(ev, { status: "failed", detail: it.error });
        else emit("file.validation", { attachmentId: it.id, status: "failed", label: "ファイルを処理できませんでした", detail: it.error });
      }
    }
    notify();
  }
  function friendly(e) {
    var m = String(e && e.message || e || "");
    if (m === "ZIP_ENCRYPTED") return "このZIPはパスワードで保護されています。保護を解除したファイルを添付してください。";
    if (m === "ZIP_BROKEN") return "ZIPファイルが破損しているため読み取れませんでした。";
    if (m === "ZIP_METHOD_UNSUPPORTED") return "このZIPの圧縮方式には対応していません。";
    if (m === "NO_INFLATE") return "このブラウザではZIP/DOCXの展開に対応していません。";
    if (m === "PDF_ENCRYPTED") return "このPDFはパスワードで保護されています。保護を解除したファイルを添付してください。";
    if (m === "PDF_BROKEN") return "PDFを読み取れませんでした。ファイルが破損している可能性があります。";
    if (m === "PDF_TOO_MANY_PAGES") return "このPDFは上限を超えています。最大 " + LIMITS.maxPdfPages + " ページまで添付できます。";
    if (m === "PDFJS_LOAD_FAILED") return "PDF処理エンジンを読み込めませんでした。通信環境を確認してください。";
    return m || "不明なエラーが発生しました。";
  }

  /* ── 画像: サムネイル生成＋安全な縮小（EXIFは再エンコードで落とす） ── */
  async function prepImage(file) {
    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (res, rej) {
        var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error("IMAGE_BROKEN")); }; i.src = url;
      });
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, LIMITS.maxImagePixels / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
      var dataUrl = cv.toDataURL("image/jpeg", 0.86);          /* 再エンコード＝EXIF等のメタデータは残らない */
      var tw = Math.max(1, Math.round(cw * Math.min(1, 96 / Math.max(cw, ch))));
      var th = Math.max(1, Math.round(ch * Math.min(1, 96 / Math.max(cw, ch))));
      var tc = document.createElement("canvas"); tc.width = tw; tc.height = th;
      tc.getContext("2d").drawImage(img, 0, 0, tw, th);
      return { dataUrl: dataUrl, thumb: tc.toDataURL("image/jpeg", 0.7), w: w, h: h };
    } finally { URL.revokeObjectURL(url); }
  }

  /* ── PDF: ページ単位で埋め込みテキスト。取れないページは ocr-required ── */
  /* PDF の 1 ページを画像に起こす（長辺を maxImagePixels に収める）。
     スキャンした資料を、画像が読めるモデルへ渡すために使う。 */
  async function renderPdfPage(doc, pageNumber) {
    var page = await doc.getPage(pageNumber);
    var base = page.getViewport({ scale: 1 });
    var long = Math.max(base.width, base.height) || 1;
    var scale = Math.min(LIMITS.maxImagePixels / long, 3);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    var vp = page.getViewport({ scale: scale });
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(vp.width));
    cv.height = Math.max(1, Math.round(vp.height));
    var cx = cv.getContext("2d", { alpha: false });
    /* 背景を白で塗る。透過のまま JPEG にすると黒く潰れる。 */
    cx.fillStyle = "var(--vq-surface, #fff)"; cx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: cx, viewport: vp }).promise;
    /* 文字を読ませる用途なので画質を落としすぎない。
       0.72 だと小さい文字がつぶれて読み違える（ザルカンド→ヴェルカンド等）。 */
    var out = cv.toDataURL("image/jpeg", 0.9);
    cv.width = cv.height = 0;                       /* 早めに解放する */
    return out;
  }

  async function extractPdf(it) {
    var pdfjs;
    try { pdfjs = await loadPdfjs(); } catch (e) { throw new Error("PDFJS_LOAD_FAILED"); }
    var insp = emit("pdf.inspect", { attachmentId: it.id, label: "PDFのページを確認しています", detail: it.name });
    var doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(await it.file.arrayBuffer()) }).promise;
    } catch (e) {
      var m = String(e && (e.name || e.message) || "");
      update(insp, { status: "failed" });
      throw new Error(/password/i.test(m) ? "PDF_ENCRYPTED" : "PDF_BROKEN");
    }
    it.pageCount = doc.numPages;
    update(insp, { status: "completed", label: doc.numPages + "ページを検出しました" });
    if (doc.numPages > LIMITS.maxPdfPages) { throw new Error("PDF_TOO_MANY_PAGES"); }

    var ev = emit("pdf.extract", { attachmentId: it.id, label: "PDFから文字情報を抽出しています", current: 0, total: doc.numPages });
    var pages = [], needOcr = 0;
    for (var p = 1; p <= doc.numPages; p++) {
      throwIfAborted();
      var page = await doc.getPage(p);
      var tc = await page.getTextContent();
      var txt = (tc.items || []).map(function (x) { return x.str; }).join(" ").replace(/\s+/g, " ").trim();
      if (txt) pages.push({ pageNumber: p, text: txt, extractionMethod: "embedded-text", status: "completed" });
      else { needOcr++; pages.push({ pageNumber: p, text: "", extractionMethod: "ocr-required", status: "skipped" }); }
      update(ev, { current: p });
      if (p % 4 === 0) await new Promise(function (r) { setTimeout(r, 0); });   /* UIを止めない */
    }
    it.pages = pages;
    update(ev, { status: "completed", label: "文字情報を抽出しました", current: doc.numPages, total: doc.numPages });

    /* 文字が入っていないページ（スキャン画像）は、ページを画像に起こして
       画像が読めるモデルへ渡す。OCR エンジンは足していない。 */
    if (needOcr) {
      var scanned = pages.filter(function (x) { return !x.text; }).map(function (x) { return x.pageNumber; });
      var take = scanned.slice(0, LIMITS.maxScanPages);
      var sev = emit("pdf.render", {
        attachmentId: it.id, status: "running",
        label: "画像のページを読み取り用に変換しています", current: 0, total: take.length
      });
      var imgs = [], bytes = 0;
      for (var q = 0; q < take.length; q++) {
        throwIfAborted();
        try {
          var du = await renderPdfPage(doc, take[q]);
          if (!du) continue;
          bytes += Math.round(du.length * 0.75);
          if (bytes > LIMITS.maxScanBytes) break;
          imgs.push({ pageNumber: take[q], dataUrl: du });
        } catch (x) { /* 1ページ失敗しても続ける */ }
        update(sev, { current: q + 1 });
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      it.pageImages = imgs;
      update(sev, {
        status: imgs.length ? "completed" : "warning",
        label: imgs.length ? imgs.length + "ページを画像として読み取ります" : "画像のページを変換できませんでした",
        current: imgs.length, total: take.length
      });
      if (imgs.length) {
        var restN = scanned.length - imgs.length;
        /* 読める＝正確に読める、ではない。取り違えが起きることは先に伝える。 */
        it.warnings.push(imgs.length + "ページは文字が無いため画像として読み取ります"
          + (restN > 0 ? "（残り" + restN + "ページは対象外）" : "")
          + "／固有名詞などを読み違えることがあります");
      } else {
        emit("pdf.ocr", {
          attachmentId: it.id, status: "warning",
          label: needOcr + "ページは画像のため文字を取得できませんでした",
          detail: "画像への変換にも失敗したため、これらのページの内容は回答に使われません。"
        });
        it.warnings.push(needOcr + "ページは画像化されており文字を取得できません");
      }
    }
    var joined = pages.filter(function (x) { return x.text; })
      .map(function (x) { return "[p." + x.pageNumber + "] " + x.text; }).join("\n");
    var c = clip(joined, LIMITS.maxTextChars);
    it.text = c.text; it.truncated = c.truncated;
    try { doc.destroy && doc.destroy(); } catch (x) {}
  }
  var _pdfjs = null;
  async function loadPdfjs() {
    if (_pdfjs) return _pdfjs;
    /* アプリが使っているのと同じ CDN の pdf.js を使う（重複読み込みを避けるため URL を流用） */
    var url = window.CHAT_PDFJS_MODULE_URL || "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs";
    var wurl = window.CHAT_PDFJS_WORKER_URL || "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";
    var mod = await import(/* webpackIgnore: true */ url);
    var lib = (mod && mod.default && typeof mod.default === "object") ? mod.default : mod;
    if (!lib || typeof lib.getDocument !== "function") throw new Error("PDFJS_LOAD_FAILED");
    if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = wurl;
    _pdfjs = lib; return lib;
  }

  /* ── DOCX: word/document.xml を展開して段落順に本文抽出（マクロは実行しない） ── */
  async function extractDocx(buf) {
    var entries = readZipDirectory(buf);
    var target = null;
    for (var i = 0; i < entries.length; i++) if (entries[i].name === "word/document.xml") target = entries[i];
    if (!target) throw new Error("DOCX_NO_BODY");
    if (target.encrypted) throw new Error("ZIP_ENCRYPTED");
    var xml = decodeText(await readZipEntry(buf, target));
    var out = [];
    /* 段落単位。<w:tab/> と <w:br/> を保持し、表のセル区切りも維持する */
    var paras = xml.split(/<w:p[ >]/).slice(1);
    for (var k = 0; k < paras.length; k++) {
      var seg = paras[k];
      var isHead = /w:val="Heading(\d)"/.test(seg);
      var txt = (seg.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
        .map(function (m) { return m.replace(/<[^>]+>/g, ""); }).join("");
      txt = txt.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      if (!txt.trim()) continue;
      out.push(isHead ? ("## " + txt) : txt);
    }
    return out.join("\n");
  }

  /* ── ZIP: 検査 → 対象のみ展開 ── */
  async function extractZip(it) {
    var buf = await it.file.arrayBuffer();
    var insp = emit("zip.inspect", { attachmentId: it.id, label: "ZIPの内容を確認しています", detail: it.name });
    var entries;
    try { entries = readZipDirectory(buf); }
    catch (e) { update(insp, { status: "failed" }); throw e; }
    if (entries.some(function (e) { return e.encrypted; })) { update(insp, { status: "failed" }); throw new Error("ZIP_ENCRYPTED"); }
    if (entries.length > LIMITS.zip.maxEntries) {
      update(insp, { status: "warning", detail: entries.length + "件（上限 " + LIMITS.zip.maxEntries + "）" });
      it.warnings.push("ファイル数が上限を超えたため先頭 " + LIMITS.zip.maxEntries + " 件のみ検査しました");
      entries = entries.slice(0, LIMITS.zip.maxEntries);
    }
    var included = [], excluded = [], totalUn = 0;
    for (var i = 0; i < entries.length; i++) {
      var v = zipEntryVerdict(entries[i]);
      if (v.skip) { if (!v.silent) excluded.push({ name: entries[i].name, reason: v.reason }); continue; }
      totalUn += entries[i].usize;
      if (totalUn > LIMITS.zip.maxTotalUncompressed) { excluded.push({ name: entries[i].name, reason: "展開後の合計サイズ上限に到達" }); continue; }
      included.push(entries[i]);
    }
    it.fileCount = entries.filter(function (e) { return !e.dir; }).length;
    it.includedCount = included.length; it.excludedCount = excluded.length;
    it.entries = { included: included.map(function (e) { return e.name; }), excluded: excluded };
    update(insp, { status: "completed", label: it.fileCount + "ファイルを検出しました", detail: "解析対象 " + included.length + " / 除外 " + excluded.length });

    if (!included.length) { it.warnings.push("解析できるファイルが含まれていませんでした"); it.text = ""; return; }
    var ev = emit("zip.extract", { attachmentId: it.id, label: "ZIP内のファイルを整理しています", current: 0, total: included.length });
    var parts = [];
    for (var j = 0; j < included.length; j++) {
      throwIfAborted();
      try {
        var bytes = await readZipEntry(buf, included[j]);
        var t = clip(decodeText(bytes), 40000);
        parts.push("--- " + included[j].name + " ---\n" + t.text);
      } catch (e) { excluded.push({ name: included[j].name, reason: "展開に失敗" }); }
      update(ev, { current: j + 1 });
      if (j % 3 === 0) await new Promise(function (r) { setTimeout(r, 0); });
    }
    var c = clip(parts.join("\n\n"), LIMITS.maxTextChars);
    it.text = c.text; it.truncated = c.truncated;
    update(ev, { status: "completed", label: "ZIPの内容を整理しました", current: included.length, total: included.length });
    if (excluded.length) it.warnings.push(excluded.length + "件は解析対象外（実行ファイル・バイナリ・未対応形式など）");
  }

  /* ══ 7. 操作 ══════════════════════════════════════════════════ */
  function remove(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) { idbDel(id); ITEMS.splice(i, 1); break; }
    notify();
  }
  function clear() { ITEMS.forEach(function (x) { idbDel(x.id); }); ITEMS = []; notify(); }
  function retry(id) { var it = ITEMS.filter(function (x) { return x.id === id; })[0]; if (it && it.file) { it.error = ""; it.warnings = []; extract(it); } }
  function abort() {
    if (abortCtl) abortCtl.abort();
    abortCtl = new AbortController();
    ITEMS.forEach(function (x) { if (x.status === "extracting" || x.status === "queued") { x.status = "cancelled"; x.statusText = "キャンセル済み"; } });
    EV.list.forEach(function (e) { if (e.status === "running") { e.status = "cancelled"; e.completedAt = Date.now(); } });
    emit("request.cancelled", { status: "cancelled" });
    endRun();
  }
  function setScope(id, scope) { var it = ITEMS.filter(function (x) { return x.id === id; })[0]; if (it) { it.scope = scope; notify(); } }

  /* ══ 8. AIへの受け渡し ══════════════════════════════════════════
     ・画像 → 既存エンジンの #appChatFileInput 経路（既存の画像ペイロード生成をそのまま使う）
     ・テキスト系(PDF/DOCX/ZIP/コード) → 抽出済みテキストを構造化ブロックとして本文へ付加 */
  function buildContext() {
    var usable = ITEMS.filter(function (x) { return (x.status === "ready" || x.status === "warning") && x.text; });
    if (!usable.length) return { text: "", sources: [] };
    var budget = LIMITS.maxContextChars, blocks = [], sources = [];
    for (var i = 0; i < usable.length; i++) {
      var it = usable[i];
      var head = "### 添付ファイル: " + it.name + " (" + it.kind + (it.pageCount ? " / " + it.pageCount + "ページ" : "") + ")";
      var body = it.text.slice(0, Math.max(0, budget - head.length - 8));
      if (!body) break;
      budget -= (head.length + body.length + 8);
      blocks.push(head + "\n" + body + (it.truncated || body.length < it.text.length ? "\n…（以降は省略）" : ""));
      sources.push({
        attachmentId: it.id, name: it.name, kind: it.kind,
        pages: it.pages ? it.pages.filter(function (p) { return p.text; }).map(function (p) { return p.pageNumber; }) : null,
        lines: it.lineCount || null
      });
      if (budget <= 0) break;
    }
    return {
      text: "\n\n[添付資料]\n以下は利用者が添付したファイルの内容です。回答に用いた場合はファイル名とページ/行を示してください。\n" +
        blocks.join("\n\n"),
      sources: sources
    };
  }
  function imageFiles() {
    return ITEMS.filter(function (x) { return x.kind === "image" && (x.status === "ready" || x.status === "warning"); })
      .map(function (x) { return x.file; });
  }
  function capabilities() { return { text: true, image: true, pdf: true, docx: true, zip: true, audio: false, ocr: false }; }

  restore();
  /* 一覧を戻したあとで、対応する一覧の無い本体を消す。
     読み込みの邪魔をしないよう、手が空いてから動かす。 */
  if (typeof requestIdleCallback === "function") requestIdleCallback(function () { void sweepBlobs(); });
  else setTimeout(function () { void sweepBlobs(); }, 3000);
  window.__vqChatFiles = {
    LIMITS: LIMITS, capabilities: capabilities,
    add: add, list: list, remove: remove, clear: clear, retry: retry, abort: abort, setScope: setScope,
    sweepBlobs: sweepBlobs,
    buildContext: buildContext, imageFiles: imageFiles,
    events: function () { return EV.list.slice(); },
    currentRunning: currentRunning,
    runStartedAt: function () { return EV.runStartedAt; },
    autoShown: function (v) { if (v != null) { EV.autoShown = !!v; persist(); } return EV.autoShown; },
    beginRun: beginRun, endRun: endRun, emit: emit, update: update,
    subscribe: function (fn) { EV.subs.push(fn); return function () { var i = EV.subs.indexOf(fn); if (i >= 0) EV.subs.splice(i, 1); }; },
    fmtBytes: fmtBytes,
    /* テスト用（実処理の単体確認に使う） */
    _internal: { readZipDirectory: readZipDirectory, zipEntryVerdict: zipEntryVerdict, decodeText: decodeText, extractDocx: extractDocx, validate: validate }
  };
})();

