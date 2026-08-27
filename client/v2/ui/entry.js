/* ══════════════════════════════════════════════════════════════════════
   既存アプリへの結線（§2）
   ・既存の画面・操作を書き換えない。V2 は「入口を足す」形で共存する。
   ・入口が出るのは対応するフラグが ON のときだけ。OFF なら本体は一切変わらない。
   ・押しても動かない飾りのボタンは置かない。出す入口はすべて実際に動く。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var doc = root.document;
  var F = VQ2.flags, ST = VQ2.store, U = VQ2.ui, S = VQ2.schema;

  var MOUNT_ID = "vq2-entry-bar";

  /* ══════════════════════════════════════════════════════════════════
     公開 API（本体からもコンソールからも呼べる）
     ══════════════════════════════════════════════════════════════════ */
  var api = {
    presetStudio: function (o) {
      if (!F.isOn("presetStudioV2")) return warnOff("presetStudioV2");
      return VQ2.presetStudio.open(o || {});
    },
    quiz: function (o) {
      if (!F.isOn("quizPlayerV2")) return warnOff("quizPlayerV2");
      return VQ2.quizPlayer.open(o || {});
    },
    result: function (o) {
      if (!F.isOn("resultViewV2")) return warnOff("resultViewV2");
      return VQ2.resultView.open(o || {});
    },
    speak: function (o) {
      if (!F.isOn("speakV1")) return warnOff("speakV1");
      return VQ2.speak.open(o || {});
    },
    quickMock: function (o) {
      if (!F.isOn("quickMockV2")) return warnOff("quickMockV2");
      return VQ2.quickMock.open(o || {});
    },
    exam: function (o) {
      if (!F.isOn("quickMockDigitalExam")) return warnOff("quickMockDigitalExam");
      return VQ2.examWorkspace.open(o || {});
    },
    flags: F
  };
  function warnOff(name) {
    try { root.console.warn("[VQ2] " + name + " は無効です。VQ2FLAGS.set(\"" + name + "\", true) で有効にできます。"); } catch (e) {}
    return null;
  }
  VQ2.open = api;

  /* ══════════════════════════════════════════════════════════════════
     入口の設置

     本体の「見えている UI」は 2 つの Shadow DOM で出来ている。
       #vqShell   … 左サイドバー（PC の左パネル／モバイルのドロワー、同じ枠）
       #vqScreens … ホームとプリセット一覧
     旧 #appLibraryPage は visibility:hidden で隠されているので、
     そこへ入口を置いても誰にも見えない（実際そうなっていた）。

     入口は左サイドバーの 1 か所だけに置く。プリセット一覧の上にも
     同じ並びを出していたが、同じものが 2 つ見えて画面が散らかるのでやめた。
     プリセット一覧側は「クイズを作成」を V2 へ繋ぐだけにする。
     フラグの設定は本体の設定画面（Learning Workspace）に置く。
     ══════════════════════════════════════════════════════════════════ */
  function anyOn() {
    var a = F.all();
    return a.presetStudioV2 || a.quizPlayerV2 || a.resultViewV2 || a.quickMockV2 || a.speakV1;
  }

  /* 出す入口。フラグが OFF のものは並べない（押せない飾りを置かないため）。
     クイズを解く導線はここに置かない。本体の「プリセット」から
     カードを開いて始めるのが正規の道なので、同じものを 2 か所に出さない。 */
  function entryItems() {
    var a = F.all(), out = [];
    if (a.presetStudioV2) out.push({ label: "プリセットを作る", action: "preset-new", icon: ICON.sparkle });
    if (a.resultViewV2) out.push({ label: "結果と分析", action: "result", icon: ICON.chart });
    if (a.speakV1) out.push({ label: "Speak", action: "speak", icon: ICON.mic });
    if (a.quickMockV2) out.push({ label: "Quick Mock（試験）", action: "mock", icon: ICON.paper });
    return out;
  }

  function ic(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  var ICON = {
    sparkle: ic('<path d="M12 3.5l1.7 4.3 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
    play: ic('<circle cx="12" cy="12" r="8.5"/><path d="M10.3 9.2l5 2.8-5 2.8z"/>'),
    chart: ic('<path d="M4 19.5V4"/><path d="M4 19.5h16"/><path d="M8 16v-4.5"/><path d="M12.5 16V7.5"/><path d="M17 16v-6.5"/>'),
    paper: ic('<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5"/><path d="M9 12.5h6"/><path d="M9 16h4"/>'),
    /* VocabuSpeak の印。マイク（話す）を線画で。絵文字は使わない。 */
    mic: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/><path d="M8.5 21h7"/>')
  };

  /* ── ① 左サイドバー（#vqShell の Shadow DOM 内） ───────────────── */
  var SHELL_NAV_ID = "vq2-shell-nav";

  function mountShellNav() {
    var host = doc.getElementById("vqShell");
    var sr = host && host.shadowRoot;
    if (!sr) return false;                        /* まだ作られていない */
    var scroll = sr.querySelector(".scroll");
    if (!scroll) return false;

    var old = sr.getElementById ? sr.getElementById(SHELL_NAV_ID) : sr.querySelector("#" + SHELL_NAV_ID);
    if (old) { try { old.parentNode.removeChild(old); } catch (e) {} }

    var items = entryItems();
    if (!items.length) { hookShadow(sr); return true; }

    var box = doc.createElement("div");
    box.id = SHELL_NAV_ID;
    /* サイドバー自身の CSS（.section / .nav / .vqs-item）にそのまま乗る */
    box.innerHTML =
      '<div class="section">Learning Workspace</div>'
      + '<div class="nav">'
      + items.map(function (it) {
          return '<button class="vqs-item" type="button" data-vq2="' + it.action + '">'
            + it.icon + '<span class="vqs-item__l">' + esc(it.label) + "</span></button>";
        }).join("")
      + "</div>";
    scroll.appendChild(box);
    hookShadow(sr);
    return true;
  }

  /* ── ② プリセット一覧（#vqScreens）─────────────────────────────
     こちらには入口を置かない。「クイズを作成」を V2 へ繋ぐためだけに触る。 */
  function hookScreens() {
    var host = doc.getElementById("vqScreens");
    var sr = host && host.shadowRoot;
    if (!sr) return false;
    if (!sr.querySelector('[data-screen="presets"]')) return false;
    /* 前の版が入れていたバーが残っていたら片づける */
    var stale = sr.querySelector("#vq2-screens-bar");
    if (stale) { try { stale.parentNode.removeChild(stale); } catch (e) {} }
    hookShadow(sr);
    return true;
  }

  /* ── ③ Shadow DOM 内のクリックを拾う ─────────────────────────────
     ・[data-vq2] … V2 の入口
     ・「クイズを作成」… 旧エンジンではなく Preset Studio V2 を開く
     ・プリセットのカード … 詳細（中央シート）を開く
     ・カードの「開始」 … 新しいクイズ画面をそのまま開く
     どれもフラグが OFF なら手を出さず、これまでの導線をそのまま流す。
     捕捉フェーズで受けて止めるので、各シェルが自前で付けている
     バブリングのブリッジ処理へは届かない。 */
  function hookShadow(sr) {
    if (sr.__vq2Hooked) return;
    sr.__vq2Hooked = true;
    sr.addEventListener("click", function (e) {
      var path = e.composedPath ? e.composedPath() : [e.target];
      for (var i = 0; i < path.length; i++) {
        var el = path[i];
        if (!el || el === sr || !el.getAttribute) continue;

        var a = el.getAttribute("data-vq2");
        if (a) { e.preventDefault(); e.stopPropagation(); onEntry(a); return; }

        /* お気に入りの星などは本体のまま通す */
        if (el.getAttribute("data-fav") != null) return;

        var start = el.getAttribute("data-preset-start");
        if (start != null && F.isOn("quizPlayerV2")) {
          e.preventDefault(); e.stopPropagation(); startQuizFor(start); return;
        }
        var sel = el.getAttribute("data-preset-select");
        if (sel != null && F.isOn("presetStudioV2") && VQ2.presetDetail) {
          e.preventDefault(); e.stopPropagation(); openDetail(sel, el); return;
        }

        var ca = el.getAttribute("data-action") || el.getAttribute("data-bridge-action");
        if (ca === "create-quiz" && F.isOn("presetStudioV2")) {
          e.preventDefault(); e.stopPropagation(); onEntry("preset-new"); return;
        }
      }
    }, true);
  }

  /* カードから V2 のプリセットを引き当てる。
     本体の一覧は V1 の保存領域から作られているので、同じ id で読めるものを渡す。
     読めなかった（V2 が扱えない形の）ときは、これまでの導線へそのまま戻す。 */
  function presetById(id) {
    try {
      var p = ST.getPreset(id);
      if (p) return p;
      var found = ST.listPresets().filter(function (x) { return String(x.id) === String(id); })[0];
      return found || null;
    } catch (e) { return null; }
  }
  function fallbackToLegacy(id, actions) {
    var page = doc.getElementById("appLibraryPage");
    if (!page) return false;
    for (var i = 0; i < actions.length; i++) {
      var all = page.querySelectorAll('[data-lib-action="' + actions[i] + '"][data-id]');
      for (var j = 0; j < all.length; j++) {
        if (all[j].getAttribute("data-id") === String(id)) { all[j].click(); return true; }
      }
    }
    return false;
  }

  /* 詳細は 3 種類（自分 / 公開 / 公式）すべてで開く。
     この端末に問題を持っていないもの（単語帳など）は、詳細から本体の出題へ渡す。
     一覧のカード（種別・作者・表紙）は __vqPresets から引く。 */
  function openDetail(id, cardEl) {
    var p = presetById(id);
    var card = null;
    try { card = root.__vqPresets && root.__vqPresets.card ? root.__vqPresets.card(id) : null; } catch (e) {}
    if (!p && !card) { fallbackToLegacy(id, ["useCustom", "useOfficial", "useBuiltin", "openPreset"]); return; }
    /* カードに出ている教科名を渡す（V2 側が持っていないことがある） */
    var subject = "";
    try {
      var badge = cardEl && cardEl.querySelector && cardEl.querySelector(".badge");
      subject = badge ? (badge.textContent || "").trim() : "";
    } catch (e) {}
    VQ2.presetDetail.open({ preset: p, card: card, presetId: id, subject: subject });
  }

  function startQuizFor(id) {
    var p = presetById(id);
    if (!p || !(p.questions || []).length) {
      fallbackToLegacy(id, ["startCustomExam", "startOfficialExam", "startBuiltinExam"]);
      return;
    }
    VQ2.quizPlayer.open({ preset: p, mode: "practice", resume: false });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ── ④ 旧ライブラリページ（新 UI が無効なときの保険） ───────────── */
  function mountEntryBar() {
    var host = doc.getElementById("appLibraryPage");
    if (!host) return false;
    var old = doc.getElementById(MOUNT_ID);
    if (old) { try { old.parentNode.removeChild(old); } catch (e) {} }
    if (!anyOn()) return true;

    var bar = doc.createElement("div");
    bar.id = MOUNT_ID;
    bar.setAttribute("aria-label", "Learning Workspace");
    bar.style.cssText = [
      "display:flex", "flex-wrap:wrap", "gap:8px", "align-items:center",
      "padding:12px 14px", "margin:0 0 14px",
      "border:1px solid #E7E4EF", "border-radius:14px", "background:#FCFBFE"
    ].join(";");

    var label = doc.createElement("span");
    label.textContent = "Learning Workspace";
    label.style.cssText = "font-size:13px;font-weight:600;color:#5A5568;margin-right:4px";
    bar.appendChild(label);

    var a = F.all();
    if (a.presetStudioV2) bar.appendChild(mkBtn("プリセットを作る", "preset", true));
    if (a.quizPlayerV2) bar.appendChild(mkBtn("クイズを解く", "quiz", false));
    if (a.resultViewV2) bar.appendChild(mkBtn("結果を見る", "result", false));
    if (a.quickMockV2) bar.appendChild(mkBtn("Quick Mock", "mock", a.quickMockV2 && !a.presetStudioV2));
    bar.appendChild(mkBtn("設定", "flags", false, true));

    host.insertBefore(bar, host.firstChild);
    return true;
  }

  function mkBtn(label, action, primary, quiet) {
    var b = doc.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("data-vq2", action);
    b.style.cssText = [
      "min-height:36px", "padding:0 14px", "border-radius:10px", "cursor:pointer",
      "font-size:13px", "font-weight:500", "font-family:inherit",
      primary ? "background:#756DB3;color:#fff;border:1px solid #756DB3"
              : quiet ? "background:transparent;color:#7A7589;border:1px solid transparent"
                      : "background:#fff;color:#454151;border:1px solid #E7E4EF"
    ].join(";");
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); onEntry(action); });
    return b;
  }

  /* ══════════════════════════════════════════════════════════════════
     入口の動作
     ══════════════════════════════════════════════════════════════════ */
  function onEntry(action) {
    if (action === "flags") return openFlagPanel();
    if (action === "preset-new") return api.presetStudio({});
    if (action === "preset") return api.presetStudio({});
    if (action === "result") return pickResult();
    if (action === "speak") return api.speak({});
    if (action === "mock") return api.quickMock({});
  }

  /* プリセットを選ぶ（V1・V2 の両方から集める） */
  /* プリセットの一覧はここに持たない。本体の「プリセット」画面が正規の一覧で、
     そこからカードを開いて始める（同じ一覧を 2 つ作らない）。 */

  function pickResult() {
    var list = ST.results.list().sort(function (a, b) { return (b.finishedAt || "").localeCompare(a.finishedAt || ""); });
    if (!list.length) {
      var a0 = U.mount("vq2-noresult", { title: "結果" });
      a0.root.innerHTML = '<div class="vq2-top">'
        + U.button({ icon: "chevronL", iconOnly: true, variant: "quiet", action: "x", aria: "閉じる" })
        + '<div class="vq2-top-title">結果</div></div>'
        + '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
        + U.empty({ icon: "chart", title: "まだ結果がありません", body: "クイズか試験を受けると、ここに残ります。" })
        + "</div></div></div>";
      U.on(a0.root, "click", '[data-act="x"]', function () { a0.close("user"); });
      return;
    }
    var app = U.mount("vq2-result-picker", { title: "結果" });
    app.root.innerHTML =
      '<div class="vq2-top">'
      + U.button({ icon: "chevronL", iconOnly: true, variant: "quiet", action: "x", aria: "閉じる" })
      + '<div class="vq2-top-title">結果</div></div>'
      + '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b"><ul class="vq2-list">'
      + list.map(function (r) {
          var rate = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
          return '<li><button type="button" class="vq2-item" data-rid="' + U.esc(r.id) + '">'
            + '<span class="vq2-item-m"><span class="vq2-item-t">' + U.esc(r.presetName || "テスト") + "</span>"
            + '<span class="vq2-item-s">'
            + U.badge((Math.round(r.score * 10) / 10) + " / " + r.maxScore + " 点")
            + U.badge(rate + "%")
            + U.badge(r.kind === "mock" ? "模試" : "クイズ")
            + '<span class="vq2-muted">' + U.esc(fmtDate(r.finishedAt)) + "</span>"
            + "</span></span></button></li>";
        }).join("")
      + "</ul></div></div></div>";
    U.on(app.root, "click", '[data-act="x"]', function () { app.close("user"); });
    U.on(app.root, "click", "[data-rid]", function (e, t) {
      var r = list.find(function (x) { return x.id === t.getAttribute("data-rid"); });
      app.close("picked");
      api.result({ result: r });
    });
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /* ══════════════════════════════════════════════════════════════════
     フラグの設定パネル
     ══════════════════════════════════════════════════════════════════ */
  function openFlagPanel() {
    var app = U.mount("vq2-flags", { title: "Learning Workspace の設定" });
    var DESC = {
      presetStudioV2: "新しいプリセット作成画面（AI 編集・差分適用・Undo）",
      quizPlayerV2: "新しいクイズ画面（集中モード・自動保存・再開）",
      resultViewV2: "新しい結果画面（分析・復習プリセット作成）",
      quickMockV2: "試験作成（MockSpec・配点調整・品質分析）",
      quickMockPdfEngine: "問題冊子・解答用紙・正解解説の紙面生成",
      quickMockDigitalExam: "デジタル受験（問題冊子と解答用紙の同期）",
      quickMockAiGrading: "記述問題の AI 補助採点",
      quickMockFeedSharing: "結果の FEED 共有"
    };
    render();

    function render() {
      var a = F.all();
      app.root.innerHTML =
        '<div class="vq2-top">'
        + U.button({ icon: "chevronL", iconOnly: true, variant: "quiet", action: "x", aria: "閉じる" })
        + '<div class="vq2-top-title">Learning Workspace の設定</div>'
        + '<div class="vq2-top-sp"></div>'
        + U.button({ label: "全部 ON", icon: "check", size: "sm", action: "all-on", aria: "全部 ON", title: "全部 ON" })
        + U.button({ label: "全部 OFF", icon: "close", size: "sm", action: "all-off", aria: "全部 OFF", title: "全部 OFF" })
        + "</div>"
        + '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b"><div class="vq2-q">'
        + '<div class="vq2-card">'
        + '<div class="vq2-hint" style="margin-bottom:10px">OFF にすると、その機能は既存の画面のままになります。'
        + " 問題が起きたら「全部 OFF」で元に戻せます。</div>"
        + F.NAMES.map(function (n) {
            var need = F.REQUIRES[n];
            var blocked = need && !a[need];
            return '<label class="vq2-check"' + (blocked ? ' style="opacity:.5"' : "") + ">"
              + '<input type="checkbox" data-flag="' + n + '"' + (a[n] ? " checked" : "") + (blocked ? " disabled" : "") + ">"
              + "<span>" + U.esc(DESC[n] || n)
              + '<br><span class="vq2-hint">' + U.esc(n)
              + (blocked ? "（先に「" + U.esc(DESC[need] || need) + "」を ON にしてください）" : "") + "</span></span></label>";
          }).join("")
        + "</div>"
        + '<div class="vq2-card"><div class="vq2-sec-t">保存されているデータ</div>'
        + '<div class="vq2-stats">'
        + stat("プリセット", ST.listPresets({ includeLegacy: false }).length)
        + stat("試験", ST.mocks.list().length)
        + stat("結果", ST.results.list().length)
        + stat("中断中のクイズ", ST.quizzes.list().filter(function (s) { return ["in_progress", "paused"].indexOf(s.state) >= 0; }).length)
        + stat("中断中の受験", ST.mockSessions.list().filter(function (s) { return ["in_progress", "paused"].indexOf(s.state) >= 0; }).length)
        + "</div>"
        + '<div class="vq2-hint" style="margin-top:10px">フラグを OFF にしてもデータは消えません。</div></div>'
        + usageHtml()
        + "</div></div></div></div>";

      U.on(app.root, "click", '[data-act="x"]', function () { app.close("user"); });
      U.on(app.root, "change", "[data-flag]", function (e, t) {
        /* 入口の並べ直しは vq2:flags を受けて mountAll(true) が行う */
        F.set(t.getAttribute("data-flag"), t.checked);
        render();
      });
      U.on(app.root, "click", '[data-act="all-on"]', function () { F.setAll(true); render(); });
      U.on(app.root, "click", '[data-act="all-off"]', function () { F.setAll(false); render(); });
    }
    function stat(l, v) {
      return '<div class="vq2-stat"><div class="vq2-stat-l">' + U.esc(l) + '</div><div class="vq2-stat-v">' + v + "</div></div>";
    }
    function usageHtml() {
      var s = ST.usageSummary();
      if (!s.total.events) return "";
      var rows = Object.keys(s.byType).map(function (k) {
        return "<tr><td>" + U.esc(LABEL_USAGE[k] || k) + '</td><td class="num">' + s.byType[k].events + "</td>"
          + '<td class="num">' + s.byType[k].modelCalls + "</td>"
          + '<td class="num">' + (Math.round(s.byType[k].computeUnits * 10) / 10) + "</td></tr>";
      }).join("");
      return '<div class="vq2-card"><div class="vq2-sec-t">AI の利用状況（計測のみ）</div>'
        + '<div class="vq2-hint" style="margin-bottom:8px">制限はかかっていません。将来のプラン設計のために記録しています。</div>'
        + '<div class="vq2-tblwrap"><table class="vq2-tbl"><thead><tr><th>種類</th><th class="num">回数</th>'
        + '<th class="num">モデル呼出</th><th class="num">計算量の目安</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
    }
  }
  var LABEL_USAGE = {
    chat_message: "会話", preset_generation: "プリセット生成", preset_revision: "プリセット修正",
    mock_generation: "試験生成", mock_revision: "試験修正", document_analysis: "資料解析",
    image_analysis: "画像解析", pdf_typesetting: "紙面の組版", pdf_compile: "紙面の生成",
    pdf_visual_review: "紙面の検査", ai_grading: "AI 採点", result_analysis: "結果の分析",
    export_generation: "書き出し"
  };

  /* ══════════════════════════════════════════════════════════════════
     処理中の Job を復元する（§33）
     ══════════════════════════════════════════════════════════════════ */
  function restoreJob() {
    if (!VQ2.ai || !VQ2.ai.restore) return;
    VQ2.ai.restore().then(function (r) {
      if (!r || r.finished || !r.job) return;
      try {
        root.console.info("[VQ2] 処理中の AI ジョブを検出しました: " + r.info.task);
      } catch (e) {}
    }).catch(function () {});
  }

  /* ══════════════════════════════════════════════════════════════════
     起動
     ══════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════
     設置の実行

     #vqShell は #appTabBar が現れるまで自分で再試行し、#vqScreens は
     DOMContentLoaded 後に作られる。どちらも「いつ出来るか」がこちら側から
     決められないので、出来るまで一定間隔で見に行く。
     設置済みのものは触らない（＝毎回作り直して画面をちらつかせない）。
     ══════════════════════════════════════════════════════════════════ */
  var done = { shell: false, screens: false, legacy: false };

  function mountAll(force) {
    if (force) done = { shell: false, screens: false, legacy: false };
    if (!done.shell) done.shell = mountShellNav();
    if (!done.screens) done.screens = hookScreens();
    if (!done.legacy) done.legacy = mountEntryBar();
    return done.shell && done.screens && done.legacy;
  }

  function boot() {
    if (!mountAll()) {
      var tries = 0;
      var timer = root.setInterval(function () {
        if (mountAll() || ++tries > 60) root.clearInterval(timer);   /* 最長 30 秒 */
      }, 500);
    }
    /* フラグを変えたら並びも変える（OFF にした入口はその場で消える） */
    root.addEventListener("vq2:flags", function () { mountAll(true); });
    restoreJob();
    backfillLearning();
  }

  /* すでに保存されている結果と、これまでの学習記録を、
     1 度だけ学習セッションへ取り込む。
     ここを通さないと、今回より前に解いたものが Insight に出てこない。 */
  var BACKFILL_KEY = "vq2.learn.backfill.v1";
  function backfillLearning() {
    if (!VQ2.learning) return;
    try {
      if (root.localStorage.getItem(BACKFILL_KEY) === String(VQ2.learning.SCHEMA_VERSION)) {
        /* 済んでいても、日次だけは作り直しておく（消えていても直る） */
        VQ2.learning.rebuildDaily();
        return;
      }
    } catch (e) {}
    try {
      var out = VQ2.learning.backfill();
      root.localStorage.setItem(BACKFILL_KEY, String(VQ2.learning.SCHEMA_VERSION));
      if (root.console && out && (out.created || out.legacy)) {
        root.console.info("[VQ2] 学習記録を取り込みました:", out.created, "件 / これまでの記録", out.legacy, "件");
      }
    } catch (e) {}
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else root.setTimeout(boot, 0);
})(typeof globalThis !== "undefined" ? globalThis : this);
