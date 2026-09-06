/* ══════════════════════════════════════════════════════════════════════════
   vq-examdetail — 試験の 詳細（2026-09-01・訴え）

   訴え:「試験を 公開できる ように して。今のままだと、試験を クリックすると、
         詳細が でない。プリセットと 同じように 試験も 詳細モードを 表示させて。
         そこから 公開が できるように。」

   直す前の 作り:
     一覧の 試験の カードは **押した 瞬間に CBT（受験）へ 飛んで いた**
     （vq-screens の data-exam-open → 受験へ）。
     ・何問 あるのか・どんな 大問なのかを 見る 手立てが 無い
     ・公開の 口が どこにも 無い（プリセットには ある）
     ・間違えて 押すと いきなり 試験が 始まる

   ここで やること:
     ・表紙の 見本・満点・時間・大問と 問題の 内訳を 出す
     ・**受験する / 紙面を 出す / 公開する / 複製 / 消す** を 1 か所に
     ・公開は プリセットと **同じ 口**（POST /api/preset/publish）。
       ★ 試験は 器が preset なので（store.getExamPreset）、
         公開の 仕組みは そのまま 使える。新しい 口を 作らない。

   ★ vq2-app（91,400 行）には 足さない。自分の ファイル・自分の 指紋。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqExamDetailInstalled) return;
  window.__vqExamDetailInstalled = true;

  var doc = document;
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function apiBase() {
    try { if (window.VQ2 && window.VQ2.apiBase) return window.VQ2.apiBase(); } catch (e) {}
    try { var h = location.hostname; if (h === "127.0.0.1" || h === "localhost") return location.origin; } catch (e) {}
    return "https://www.vocabuquiz.app";
  }
  function token() { try { return localStorage.getItem("app.auth.token.v1") || ""; } catch (e) { return ""; } }
  function ST() { try { return (window.VQ2 && window.VQ2.store) || null; } catch (e) { return null; } }

  var P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    x: '<path ' + P + ' d="M6 6l12 12M18 6L6 18"/>',
    play: '<path ' + P + ' d="M8 5l11 7-11 7z"/>',
    paper: '<path ' + P + ' d="M6 3h12v18H6z"/><path ' + P + ' d="M9 8h6M9 12h6M9 16h3"/>',
    globe: '<circle ' + P + ' cx="12" cy="12" r="9"/><path ' + P + ' d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/>',
    lock: '<rect ' + P + ' x="5" y="10" width="14" height="10" rx="2"/><path ' + P + ' d="M8 10V7a4 4 0 018 0v3"/>',
    copy: '<path ' + P + ' d="M9 9h11v11H9z"/><path ' + P + ' d="M5 15V4h11"/>',
    trash: '<path ' + P + ' d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    link: '<path ' + P + ' d="M10 13a4 4 0 006 .5l2-2a4 4 0 10-5.7-5.7L11 7"/><path ' + P + ' d="M14 11a4 4 0 00-6-.5l-2 2A4 4 0 0011.7 18L13 17"/>',
    back: '<path ' + P + ' d="M15 5l-7 7 7 7"/>',
    help: '<circle ' + P + ' cx="12" cy="12" r="9"/><path ' + P + ' d="M9.6 9.2a2.5 2.5 0 114 2.3c-.9.6-1.6 1-1.6 2M12 17h.01"/>'
  };
  function svg(n, cls) {
    return '<svg viewBox="0 0 24 24" class="' + (cls || "i") + '" aria-hidden="true">' + (ICON[n] || "") + "</svg>";
  }

  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483103;display:none;",
      "font-family:var(--vq-app-font,Inter,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#2B2836)}",
    ":host([data-open='1']){display:block}",
    "button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}",
    "input{font:inherit;color:inherit}",
    ".i{width:18px;height:18px;flex:0 0 auto}",
    ".bd{position:absolute;inset:0;background:rgba(38,34,68,.44);",
      "-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:edBd .18s ease both}",
    "@keyframes edBd{from{opacity:0}to{opacity:1}}",
    /* ══ ★★ 動きの 終わりで **中央寄せを 打ち消さない**（2026-09-01・訴え
       「試験の 詳細モーダルが 中央に して ほしい」）════════════════════
       .w は left:50% top:50% に 置いて、transform:translate(-50%,-50%) で
       中央へ 戻して いる。ところが この 動きの 終わりが `transform:none` で、
       fill-mode:both の ため **終わった あとも none が 残る**。
       つまり **左上の 角が 画面の 真ん中**に 来て、右下へ はみ出して いた
       （実測 1440px で 左余白 720・右余白 0・下は 45px はみ出し）。
       動きの 中でも **中央寄せを 必ず 書く。** */
    "@keyframes edUp{from{opacity:0;transform:translate(-50%,-50%) translateY(14px) scale(.98)}",
      "to{opacity:1;transform:translate(-50%,-50%)}}",
    ".w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);",
      "width:min(720px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;",
      "background:var(--vq-surface,#fff);border-radius:24px;border:1px solid var(--vq-border,#E7E4EF);",
      "box-shadow:0 24px 70px rgba(16,14,26,.30);padding:0 0 calc(18px + var(--vq-sab,0px));",
      "animation:edUp .24s cubic-bezier(.22,1,.36,1) both}",
    ".w.keep{animation:none}",
    /* 表紙 */
    ".cv{position:relative;padding:26px 22px 20px;border-radius:24px 24px 0 0;",
      "background:linear-gradient(140deg,var(--vq-primary,#756DB3),var(--vq-primary-strong,#5F579E));color:#fff}",
    ".cv-k{font-size:11px;font-weight:700;letter-spacing:.10em;opacity:.86}",
    ".cv-t{font-size:22px;font-weight:750;line-height:1.4;margin-top:6px;word-break:break-word}",
    ".cv-s{font-size:13px;opacity:.9;margin-top:6px}",
    ".cv-x{position:absolute;right:14px;top:14px;width:36px;height:36px;border-radius:999px;",
      "display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.18);color:#fff}",
    ".cv-x:hover{background:rgba(255,255,255,.3)}",
    ".cv-h{right:58px}",
    ".pub{display:inline-flex;align-items:center;gap:6px;margin-top:12px;height:26px;padding:0 10px;",
      "border-radius:999px;font-size:11.5px;font-weight:700;background:rgba(255,255,255,.2)}",
    /* 数 */
    ".nums{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--vq-border,#E7E4EF)}",
    ".num{background:var(--vq-surface,#fff);padding:14px 8px;text-align:center}",
    ".num b{display:block;font-size:19px;font-weight:750}",
    ".num span{display:block;font-size:11px;color:var(--vq-text-muted,#7A7589);margin-top:2px}",
    ".bd2{padding:18px 22px 0}",
    ".h2{font-size:12px;font-weight:700;color:var(--vq-text-muted,#7A7589);letter-spacing:.06em;margin:16px 0 8px}",
    ".secs{display:grid;gap:8px}",
    ".sec{border:1px solid var(--vq-border,#E7E4EF);border-radius:12px;padding:10px 12px}",
    ".sec-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}",
    ".sec-h b{font-size:13.5px;font-weight:700}",
    ".sec-h span{font-size:11.5px;color:var(--vq-text-muted,#7A7589);margin-left:auto}",
    ".sec-q{font-size:12px;color:var(--vq-text-muted,#7A7589);margin-top:4px;line-height:1.7;",
      "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
    ".note{font-size:12.5px;color:var(--vq-text-muted,#7A7589);line-height:1.8}",
    ".err{margin:12px 0 0;padding:10px 12px;border-radius:10px;font-size:12.5px;line-height:1.7;",
      "background:var(--vq-danger-subtle,#FDECEC);color:var(--vq-danger,#B3261E)}",
    ".ok{margin:12px 0 0;padding:10px 12px;border-radius:10px;font-size:12.5px;line-height:1.7;",
      "background:var(--vq-success-subtle,#E8F5EC);color:var(--vq-success,#1E7B3C)}",
    /* 公開のつまみ */
    ".pf{margin-top:10px;border:1px solid var(--vq-border,#E7E4EF);border-radius:14px;padding:14px}",
    ".row{margin-bottom:12px}",
    ".row:last-child{margin-bottom:0}",
    ".row label{display:block;font-size:12px;font-weight:650;margin-bottom:5px}",
    ".row input{width:100%;height:40px;padding:0 12px;border-radius:10px;",
      "border:1px solid var(--vq-border,#D7D2E4);background:var(--vq-surface,#fff)}",
    ".row input:focus{outline:2px solid var(--vq-primary,#756DB3);outline-offset:1px}",
    ".hint{font-size:11.5px;color:var(--vq-text-muted,#7A7589);margin-top:5px;line-height:1.7}",
    ".lnk{display:flex;align-items:center;gap:7px;margin-top:8px;font-size:12px;",
      "word-break:break-all;color:var(--vq-primary,#756DB3)}",
    /* 足もと */
    ".ft{display:flex;gap:8px;flex-wrap:wrap;padding:16px 22px 4px;position:sticky;bottom:0;",
      "background:linear-gradient(to top,var(--vq-surface,#fff) 72%,transparent)}",
    ".btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:44px;",
      "padding:0 16px;border-radius:12px;font-size:14px;font-weight:650;",
      "border:1px solid var(--vq-border,#D7D2E4);background:var(--vq-surface,#fff)}",
    ".btn:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".btn.pri{background:var(--vq-primary,#756DB3);color:#fff;border-color:transparent}",
    ".btn.pri:hover{background:var(--vq-primary-strong,#5F579E)}",
    ".btn.dan{color:var(--vq-danger,#B3261E);border-color:var(--vq-danger-border,#F0C4C0)}",
    ".btn.sp{flex:1 1 auto}",
    ".btn[disabled]{opacity:.45;cursor:default}",
    /* スマホ。**下から せり上がる 板**にする（真ん中の 窓は 指が 届かない） */
    "@media (max-width:640px){",
      ".w{left:0;top:auto;bottom:0;transform:none;width:100vw;max-width:100vw;",
        "max-height:92dvh;border-radius:20px 20px 0 0;animation:edSheet .26s cubic-bezier(.22,1,.36,1) both}",
      ".cv{border-radius:20px 20px 0 0;padding:22px 18px 18px}",
      ".cv-t{font-size:19px}",
      ".bd2{padding:16px 18px 0}",
      ".ft{padding:14px 18px 4px}",
      ".nums{grid-template-columns:repeat(2,1fr)}",
      ".btn{flex:1 1 46%;height:46px}",
      ".btn.sp{flex:1 1 100%}",
    "}",
    "@keyframes edSheet{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}",
    "@media (prefers-reduced-motion:reduce){.w,.bd{animation:none}}"
  ].join("");

  var host = null, root = null;
  var st = { id: "", 開: false, 公開の欄: false, err: "", 知: "", 送信中: false,
             slug: "", 題: "", 前の画面: "" };

  /* ── 器 ───────────────────────────────────────────────────── */
  function 建てる() {
    if (host) return;
    host = doc.createElement("div");
    host.id = "vqExamDetail";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = doc.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var box = doc.createElement("div"); box.setAttribute("data-box", ""); root.appendChild(box);
    doc.body.appendChild(host);
    つなぐ();
  }

  function 試験(id) {
    var S = ST();
    if (!S) return null;
    try {
      var p = S.getExamPreset ? S.getExamPreset(id) : null;
      if (!p) return null;
      var sp = S.examOf ? S.examOf(p) : null;
      if (!sp) return null;
      return { preset: p, spec: sp };
    } catch (e) { return null; }
  }
  /* 公開の 覚え。プリセットと 同じ 置き場を 使う（別に 持つと 食い違う）。 */
  function 公開の覚え(p) {
    var m = (p && p.publicMeta) || {};
    return {
      公開中: !!m.isPublic, slug: String(m.slug || ""),
      題: String(m.publicTitle || p.name || ""),
      とき: Number(m.publishedAt || 0) || 0
    };
  }

  function 開く(id) {
    建てる();
    st.id = String(id || ""); st.err = ""; st.知 = ""; st.公開の欄 = false; st.送信中 = false;
    var t = 試験(st.id);
    var m = t ? 公開の覚え(t.preset) : { slug: "", 題: "" };
    st.slug = m.slug; st.題 = m.題 || (t ? (t.spec.title || t.preset.name || "") : "");
    st.開 = true; st.前の画面 = "";
    host.setAttribute("data-open", "1");
    描く();
  }
  function 閉じる() {
    st.開 = false;
    if (host) host.removeAttribute("data-open");
  }

  /* ── 描く。**巻きと 指を 保つ**（vq-make と 同じ 作法）───────────── */
  function 描く() {
    if (!root) return;
    var box = root.querySelector("[data-box]");
    if (!box) return;
    if (!st.開) { box.innerHTML = ""; st.前の画面 = ""; return; }
    var 同じ = st.前の画面 === st.id;
    var 控 = null;
    if (同じ) {
      var w0 = box.querySelector(".w");
      if (w0) {
        控 = { 巻: w0.scrollTop, 焦: null };
        var a = null; try { a = root.activeElement; } catch (e) {}
        if (a && a.id) { 控.焦 = { id: a.id, s: null };
          try { 控.焦.s = a.selectionStart; } catch (e) {} }
      }
    }
    box.innerHTML = '<div class="bd" data-a="close"></div>'
      + '<div class="w' + (同じ ? " keep" : "") + '" role="dialog" aria-modal="true">' + 中身() + "</div>";
    st.前の画面 = st.id;
    if (控) {
      var w = box.querySelector(".w");
      if (w && 控.巻) { void w.scrollHeight; w.scrollTop = 控.巻; }
      if (控.焦) {
        var t2 = root.getElementById ? root.getElementById(控.焦.id) : box.querySelector("#" + 控.焦.id);
        if (t2) {
          try { t2.focus({ preventScroll: true }); } catch (e) { try { t2.focus(); } catch (e2) {} }
          if (控.焦.s !== null && t2.setSelectionRange) { try { t2.setSelectionRange(控.焦.s, 控.焦.s); } catch (e) {} }
        }
      }
    }
  }

  function 中身() {
    var t = 試験(st.id);
    if (!t) {
      return '<div class="cv"><div class="cv-k">試験</div><div class="cv-t">見つかりません</div>'
        + '<button class="cv-x" data-a="close" aria-label="閉じる">' + svg("x") + "</button></div>"
        + '<div class="bd2"><p class="note">この 試験は 端末から 消えて いるようです。'
        + "一覧を 開き直して ください。</p></div>"
        + '<div class="ft"><button class="btn sp" data-a="close">閉じる</button></div>';
    }
    var sp = t.spec, c = sp.cover || {};
    var m = 公開の覚え(t.preset);
    var 問数 = (sp.sections || []).reduce(function (a, x) { return a + ((x.questions || []).length); }, 0);
    var h = '<div class="cv">'
      + '<button class="cv-x" data-a="close" aria-label="閉じる">' + svg("x") + "</button>"
      /* ★ **この 画面の ヘルプ**（2026-09-01）。困った その 場から 開く。 */
      + '<button class="cv-x cv-h" data-a="help" aria-label="この 画面の ヘルプ" title="この 画面の ヘルプ">'
      + svg("help") + "</button>"
      + '<div class="cv-k">' + esc(c.subject || sp.subject || "試験") + "</div>"
      + '<div class="cv-t">' + esc(c.examName || sp.title || t.preset.name || "名前の ない 試験") + "</div>"
      + (c.examDate ? '<div class="cv-s">' + esc(c.examDate) + "</div>" : "")
      + '<span class="pub">' + svg(m.公開中 ? "globe" : "lock", "i")
      + (m.公開中 ? "公開中" : "自分だけ") + "</span>"
      + "</div>";
    h += '<div class="nums">'
      + '<div class="num"><b>' + esc((sp.sections || []).length) + "</b><span>大問</span></div>"
      + '<div class="num"><b>' + esc(問数) + "</b><span>問</span></div>"
      + '<div class="num"><b>' + esc(sp.totalPoints || "–") + "</b><span>点</span></div>"
      + '<div class="num"><b>' + esc(sp.durationMinutes || "–") + "</b><span>分</span></div>"
      + "</div>";
    h += '<div class="bd2">';
    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    if (st.知) h += '<div class="ok">' + esc(st.知) + "</div>";

    /* 公開のつまみ */
    if (st.公開の欄) {
      h += '<div class="h2">公開の 設定</div>'
        + '<div class="pf">'
        + '<div class="row"><label for="ed-t">みんなに 見せる 名前</label>'
        + '<input id="ed-t" data-f="題" maxlength="80" value="' + esc(st.題) + '"></div>'
        + '<div class="row"><label for="ed-s">公開 ID（URL に なります）</label>'
        + '<input id="ed-s" data-f="slug" maxlength="60" placeholder="eiken-2ji-2026" value="'
        + esc(st.slug) + '">'
        + '<div class="hint">英小文字・数字・ハイフンだけ。'
        + "空の ままなら 名前から こちらで 作ります。</div></div>"
        + (st.slug ? '<div class="lnk">' + svg("link", "i")
            + esc(apiBase().replace(/^https?:\/\//, "") + "/p/" + st.slug) + "</div>" : "")
        + '<p class="hint">公開すると、ほかの 人が この 試験を 見つけて 受けられます。'
        + "いつでも 非公開に 戻せます。</p>"
        + "</div>";
    }

    /* 大問の 内訳 */
    h += '<div class="h2">大問</div><div class="secs">';
    (sp.sections || []).forEach(function (sec, i) {
      var qs = sec.questions || [];
      h += '<div class="sec"><div class="sec-h"><b>大問 ' + esc(sec.number || (i + 1)) + "　"
        + esc(sec.title || "") + "</b>"
        + '<span>' + esc(qs.length) + " 問 ・ " + esc(sec.points || 0) + " 点</span></div>"
        + (qs.length ? '<div class="sec-q">' + esc(String(qs[0].question || qs[0].prompt || "").slice(0, 90)) + "</div>" : "")
        + "</div>";
    });
    h += "</div>";
    if (!(sp.sections || []).length) h += '<p class="note">大問が ありません。</p>';
    h += "</div>";

    /* 足もと */
    h += '<div class="ft">';
    if (st.公開の欄) {
      h += '<button class="btn" data-a="pub-cancel">やめる</button>'
        + '<button class="btn pri sp" data-a="pub-go"' + (st.送信中 ? " disabled" : "") + ">"
        + svg("globe") + (st.送信中 ? "公開して います…" : "この 内容で 公開する") + "</button>";
    } else {
      h += '<button class="btn pri sp" data-a="take">' + svg("play") + "受験する</button>"
        + '<button class="btn" data-a="paper">' + svg("paper") + "紙面</button>"
        + (m.公開中
            ? '<button class="btn" data-a="unpub"' + (st.送信中 ? " disabled" : "") + ">"
              + svg("lock") + "非公開に 戻す</button>"
            : '<button class="btn" data-a="pub">' + svg("globe") + "公開する</button>")
        + '<button class="btn" data-a="dup">' + svg("copy") + "複製</button>"
        + '<button class="btn dan" data-a="del">' + svg("trash") + "消す</button>";
    }
    h += "</div>";
    return h;
  }

  /* ── 押したとき ───────────────────────────────────────────── */
  function つなぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-a]") : null;
      if (!el) return;
      var a = el.getAttribute("data-a");
      e.preventDefault();
      if (a === "close") { 閉じる(); return; }
      if (a === "help") {
        try { if (window.__vqHelp) { window.__vqHelp.open({ id: "exam-detail" }); return; } } catch (eH) {}
        return;
      }
      if (a === "take") { 受験へ(); return; }
      if (a === "paper") { 紙面へ(); return; }
      if (a === "pub") { st.公開の欄 = true; st.err = ""; st.知 = ""; st.前の画面 = ""; 描く(); return; }
      if (a === "pub-cancel") { st.公開の欄 = false; st.前の画面 = ""; 描く(); return; }
      if (a === "pub-go") { 公開する(true); return; }
      if (a === "unpub") { 公開する(false); return; }
      if (a === "dup") { 複製する(); return; }
      if (a === "del") { 消す(); return; }
    });
    root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || !t.dataset || !t.dataset.f) return;
      if (t.dataset.f === "題") st.題 = String(t.value || "");
      else if (t.dataset.f === "slug") st.slug = String(t.value || "");
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && st.開) { e.preventDefault(); 閉じる(); }
    }, true);
  }

  function 受験へ() {
    var id = st.id;
    閉じる();
    try {
      if (window.__vqScreens && window.__vqScreens.受験へ) { window.__vqScreens.受験へ(id); return; }
    } catch (e) {}
    try {
      var V = window.VQ2;
      if (V && V.examWorkspace && V.examWorkspace.open) { V.examWorkspace.open({ mockId: id }); return; }
    } catch (e) {}
    st.開 = true; host.setAttribute("data-open", "1");
    st.err = "受験の 画面を 開けませんでした。少し 待ってから もう一度 押して ください。";
    描く();
  }
  function 紙面へ() {
    var t = 試験(st.id);
    if (!t) return;
    try {
      if (window.__vqMake && window.__vqMake.試験を入れる) {
        閉じる();
        window.__vqMake.試験を入れる(t.spec);
        return;
      }
    } catch (e) {}
    st.err = "紙面の 画面を 開けませんでした。";
    描く();
  }

  /* ══ 公開（プリセットと **同じ 口**）════════════════════════════════
     ★ 試験は 器が preset なので、/api/preset/publish が そのまま 使える。
       新しい 口を 作ると、公開の 決まりが 2 か所に なって いつか ずれる。 */
  function 公開する(する) {
    var t = 試験(st.id);
    if (!t) { st.err = "試験が 見つかりません。"; 描く(); return; }
    if (!token()) { st.err = "公開するには ログインが 必要です。"; 描く(); return; }
    st.送信中 = true; st.err = ""; st.知 = ""; 描く();
    var 体 = {
      isPublic: !!する,
      preset: t.preset,
      slug: する ? String(st.slug || "") : "",
      publicTitle: する ? String(st.題 || "") : ""
    };
    window.fetch(apiBase() + "/api/preset/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify(体)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        st.送信中 = false;
        if (!r.ok || (r.j && r.j.ok === false)) {
          st.err = (r.j && r.j.message) || "公開できませんでした。";
          st.前の画面 = "";
          描く();
          return;
        }
        /* 端末の 覚えにも 書く（プリセットと 同じ 形）。
           ★ ここで 落ちても **公開は もう 済んで いる**。
             後片づけの 失敗を 「公開に 失敗」に しては いけない。 */
        try {
          var S = ST();
          var p = t.preset;
          p.publicMeta = Object.assign({}, p.publicMeta || {}, {
            isPublic: !!する,
            slug: する ? String((r.j && r.j.slug) || st.slug || "") : String((p.publicMeta || {}).slug || ""),
            publicTitle: する ? String((r.j && r.j.publicTitle) || st.題 || p.name || "") : String((p.publicMeta || {}).publicTitle || p.name || ""),
            publishedAt: する ? (Number(r.j && r.j.updatedAt) || Date.now()) : Number((p.publicMeta || {}).publishedAt || 0),
            publicVisibilityState: する ? "published" : "private"
          });
          p.visibility = する ? "public" : "private";
          if (S && S.savePreset) S.savePreset(p, { force: true });
          if (する && r.j && r.j.slug) st.slug = String(r.j.slug);
        } catch (e) {
          console.warn("[vq-examdetail] 後片づけで つまずきました:", String((e && e.message) || e));
        }
        st.公開の欄 = false;
        st.知 = する ? "公開しました。ほかの 人が 見つけられます。" : "非公開に 戻しました。";
        st.前の画面 = "";
        描く();
        /* 一覧の 見た目も 更新する（札が 変わる）。 */
        try { if (window.__vqScreens && window.__vqScreens.描き直す) window.__vqScreens.描き直す(); } catch (e) {}
      }, function (e) {
        st.送信中 = false;
        st.err = "つながりませんでした：" + String((e && e.message) || e).slice(0, 80);
        st.前の画面 = "";
        描く();
      });
  }

  function 複製する() {
    var t = 試験(st.id);
    var S = ST();
    if (!t || !S || !S.savePreset) { st.err = "複製できませんでした。"; 描く(); return; }
    try {
      var p = JSON.parse(JSON.stringify(t.preset));
      p.id = "exam-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
      p.name = String(p.name || "試験") + "（写し）";
      p.publicMeta = null; p.visibility = "private";
      p.createdAt = Date.now(); p.updatedAt = Date.now();
      if (p.exam && p.exam.cover) p.exam.cover.examName = String(p.exam.cover.examName || "") + "（写し）";
      var w = S.savePreset(p, { force: true });
      if (!w || w.ok === false) { st.err = "複製できませんでした。"; 描く(); return; }
      st.知 = "複製しました。一覧に 増えて います。";
      st.前の画面 = "";
      描く();
      try { if (window.__vqScreens && window.__vqScreens.描き直す) window.__vqScreens.描き直す(); } catch (e) {}
    } catch (e) { st.err = "複製できませんでした：" + String((e && e.message) || e).slice(0, 80); 描く(); }
  }

  function 消す() {
    var S = ST();
    if (!S || !S.deletePreset) { st.err = "消せませんでした。"; 描く(); return; }
    /* ★ 消すのは 戻せない。**必ず 一度 聞く。** */
    if (!window.confirm("この 試験を 消します。戻せません。よろしいですか？")) return;
    try {
      S.deletePreset(st.id);
      閉じる();
      try { if (window.__vqScreens && window.__vqScreens.描き直す) window.__vqScreens.描き直す(); } catch (e) {}
    } catch (e) { st.err = "消せませんでした：" + String((e && e.message) || e).slice(0, 80); 描く(); }
  }

  window.__vqExamDetail = {
    open: 開く, close: 閉じる,
    /* 検査のため */
    状態: function () { return { id: st.id, 開: st.開, 公開の欄: st.公開の欄, err: st.err, 知: st.知,
                                 slug: st.slug, 題: st.題 }; }
  };
})();
