/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — AI アシスタント（§18）

   ・AI の呼び出しは **既存の VQ2.ai（AI Orchestrator）だけ** を通す。
     Workplace から Bridge や Ollama を直接叩く経路は作らない。
   ・毎回ファイル全体を送らない。送るのは「いま選んでいるもの」だけ。
     何を送るかは実行前に必ず画面へ出す。
   ・出てきた内容をその場で上書きしない。差分を見せてから、押されたら入れる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, U = WP.ui;
  var esc = U.esc, icon = U.icon, btn = U.btn;

  var MAX_CHARS = 6000;     /* 1 回で渡す文字数の上限。超えたら切って、切ったと出す。 */

  /* ── 製品ごとにできること ─────────────────────────────────────
     ここに載せるものは、必ず prompt を持つ＝実際に走る。 */
  var ACTIONS = {
    document: [
      { id: "rewrite", label: "選んだところを書き直す", icon: "wand",
        prompt: "次の文章を、意味を変えずに、より読みやすい日本語へ書き直してください。出力は本文だけ。" },
      { id: "shorter", label: "短くする", icon: "minus",
        prompt: "次の文章を、要点を落とさずに 6 割ほどの長さへ縮めてください。出力は本文だけ。" },
      { id: "longer", label: "詳しくする", icon: "plus",
        prompt: "次の文章に、具体例や理由を足して詳しくしてください。事実を作らないこと。出力は本文だけ。" },
      { id: "easy", label: "やさしい日本語にする", icon: "info",
        prompt: "次の文章を、中学生にも分かるやさしい日本語へ書き直してください。出力は本文だけ。" },
      { id: "polite", label: "ていねいにする", icon: "info",
        prompt: "次の文章を、目上の人へ出せるていねいな文体へ直してください。出力は本文だけ。" },
      { id: "bullets", label: "箇条書きにする", icon: "listUl",
        prompt: "次の文章の要点を箇条書きにしてください。各行の先頭は「- 」。出力は箇条書きだけ。" },
      { id: "summary", label: "要約する", icon: "text",
        prompt: "次の文章を 3〜5 行で要約してください。出力は要約だけ。" },
      { id: "translate", label: "英語に訳す", icon: "globe",
        prompt: "次の日本語を自然な英語へ訳してください。出力は訳文だけ。" },
      { id: "proof", label: "誤字と文法を直す", icon: "check",
        prompt: "次の文章の誤字・脱字・文法の誤りだけを直してください。表現は変えないこと。出力は直した本文だけ。" },
      { id: "headings", label: "見出しを付ける", icon: "type",
        prompt: "次の文章に見出しを付けた形へ整えてください。見出しは「## 」で始めます。出力は本文だけ。" },
      { id: "continue", label: "続きを書く", icon: "pencil", mode: "append",
        prompt: "次の文章の続きを、同じ文体で 3〜6 行ほど書いてください。出力は続きの本文だけ。" },
      { id: "table", label: "表に整理する", icon: "table",
        prompt: "次の文章の内容を Markdown の表に整理してください。出力は表だけ。" }
    ],
    spreadsheet: [
      { id: "summary", label: "この表の要点をまとめる", icon: "text",
        prompt: "次の表（タブ区切り）を読み、分かることを 3〜5 行でまとめてください。数値の根拠を添えること。" },
      { id: "trend", label: "傾向を読む", icon: "chart",
        prompt: "次の表から読み取れる傾向・増減・偏りを挙げてください。断定できないことは「〜のように見える」と書くこと。" },
      { id: "outlier", label: "おかしな値を探す", icon: "warning",
        prompt: "次の表から、明らかに他と外れた値・入力ミスらしき値を挙げてください。無ければ「見当たりません」と答えること。" },
      { id: "missing", label: "抜けている項目を探す", icon: "filter",
        prompt: "次の表で、空欄や欠けている項目を挙げてください。" },
      { id: "formula", label: "数式を提案してもらう", icon: "code", kind: "formula",
        prompt: "次の表に対して役立つ数式を 1 つだけ提案してください。出力は「=」で始まる数式の 1 行だけ。説明は不要。" },
      { id: "chartidea", label: "どのグラフが向くか", icon: "chart",
        prompt: "次の表を見せるのに向いたグラフの種類と、その理由を 2〜3 行で答えてください。" },
      { id: "maketable", label: "文章から表を作る", icon: "table", kind: "table", needsInput: true,
        prompt: "次の指示にしたがって表を作ってください。出力はタブ区切りの表だけ。1 行目は見出し。" }
    ],
    presentation: [
      { id: "outline", label: "テーマから構成を作る", icon: "layers", needsInput: true,
        prompt: "次のテーマで発表スライドの構成を作ってください。1 枚ごとに「## 見出し」の行と、"
          + "その下に「- 箇条書き」を 2〜4 行。5〜8 枚ぶん。出力は構成だけ。" },
      { id: "fromtext", label: "文章からスライドにする", icon: "presentation", needsInput: true,
        prompt: "次の文章をスライドの構成へ直してください。1 枚ごとに「## 見出し」と「- 箇条書き」。出力は構成だけ。" },
      { id: "shorten", label: "スライドの文を短くする", icon: "minus",
        prompt: "次のスライドの文言を、1 行 20 字以内を目安に短くしてください。同じ枚数のまま「## 見出し」「- 箇条書き」で出力。" },
      { id: "titles", label: "タイトル候補を出す", icon: "type",
        prompt: "次の内容に合う発表タイトルの候補を 5 つ挙げてください。出力は候補だけ。" },
      { id: "notes", label: "いまのスライドの発表原稿", icon: "doc2", kind: "notes",
        prompt: "次のスライドの内容について、40〜60 秒で話す原稿を書いてください。出力は原稿だけ。" },
      { id: "improve", label: "改善点を挙げる", icon: "wand",
        prompt: "次のスライド構成について、伝わりやすくするための改善点を 3〜5 点挙げてください。" }
    ],
    form: [
      { id: "make", label: "指示からフォームを作る", icon: "clipboardList", needsInput: true, kind: "form",
        prompt: "次の指示にしたがってアンケートの質問を作ってください。\n"
          + "1 行に 1 問。形式は「形式|質問文|選択肢1;選択肢2;...」。\n"
          + "使える形式は short_text / long_text / single_choice / multi_choice / dropdown / "
          + "scale / star / nps / date / number / email のみ。\n"
          + "選択肢の要らない形式は選択肢を空にすること。出力は質問の行だけ。" },
      { id: "improve", label: "質問を見直してもらう", icon: "wand",
        prompt: "次のアンケートについて、答えにくい質問・重複・誘導になっている質問を指摘してください。" },
      { id: "summary", label: "回答をまとめる", icon: "text",
        prompt: "次の自由記述の回答をまとめてください。1) 全体の傾向 2) よく出る意見 3) 少数だが重要な意見 "
          + "の順で。件数を添えること。事実でないことを断定しないこと。" },
      { id: "positive", label: "良い意見と厳しい意見に分ける", icon: "filter",
        prompt: "次の自由記述を「良い評価」「厳しい評価」「その他」に分けて、それぞれ代表的なものを挙げてください。" },
      { id: "themes", label: "テーマ別に分類する", icon: "layers",
        prompt: "次の自由記述をテーマごとに分類し、テーマ名と件数、代表的な意見を挙げてください。" },
      { id: "actions", label: "改善案を出す", icon: "wand",
        prompt: "次の回答をもとに、実行できる改善案を 3〜5 つ挙げてください。回答に書かれていないことは推測と明記すること。" }
    ]
  };

  function actionsFor(itemType) { return (ACTIONS[itemType] || []).slice(); }
  function actionById(itemType, id) {
    var list = ACTIONS[itemType] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function scopeText(scope) {
    var n = String(scope.text || "").length;
    var where = { selection: "選んだ文字", block: "いまのブロック", document: "この文書全体",
      range: "選んだ範囲", sheet: "このシート", deck: "このスライド一式",
      responses: "集まった回答", form: "このフォームの構成" }[scope.kind] || "選んだところ";
    return "AI へ渡すのは「" + (scope.label || where) + "」だけです（" + n + " 文字"
      + (n > MAX_CHARS ? "・" + MAX_CHARS + " 文字までに切ります" : "") + "）。";
  }

  /* ── パネルを開く（一覧から選ぶ）───────────────────────────── */
  function open(o) {
    var api = o.api;
    var acts = actionsFor(o.itemType);
    U.sheet(api.root, {
      title: "AI アシスタント",
      html: '<div class="wp-ai__scope">' + esc(scopeText(o.scope)) + "</div>"
        + (o.meta ? '<div class="wp-lab">対象 ' + o.meta.analyzed + " 件 / 全 " + o.meta.total
          + " 件（除外 " + o.meta.excluded + " 件）。AI による分析結果です。</div>" : "")
        + '<div class="wp-ai__a">' + acts.map(function (a) {
          return '<button type="button" class="wp-ai__b" data-a="' + esc(a.id) + '">'
            + icon(a.icon || "sparkle") + "<span>" + esc(a.label) + "</span></button>";
        }).join("") + "</div>"
        + (VQ2.ai && VQ2.ai.available && !VQ2.ai.available()
          ? '<div class="wp-lab" style="margin-top:10px;color:var(--vq-warning-text)">'
            + "いま AI につながっていません。設定から接続先を確かめてください。</div>" : ""),
      onOpen: function (bodyEl, close) {
        bodyEl.addEventListener("click", function (e) {
          var b = e.target.closest ? e.target.closest("[data-a]") : null;
          if (!b) return;
          close();
          run(Object.assign({}, o, { actionId: b.getAttribute("data-a") }));
        });
      }
    });
  }

  /* ── 実行 ─────────────────────────────────────────────────── */
  function run(o) {
    var api = o.api;
    var act = actionById(o.itemType, o.actionId);
    if (!act) { api.toast("その操作は登録されていません。", "error"); return; }
    if (!VQ2.ai || typeof VQ2.ai.run !== "function") {
      api.toast("AI の呼び出し口がありません。", "error", 6000);
      return;
    }
    if (VQ2.ai.available && !VQ2.ai.available()) {
      api.toast("AI につながっていません。設定から接続先を確かめてください。", "error", 7000);
      return;
    }
    if (act.needsInput) { askInput(o, act); return; }
    go(o, act, "");
  }
  function askInput(o, act) {
    var api = o.api;
    U.sheet(api.root, {
      title: act.label,
      html: '<div class="wp-row"><label class="wp-lab" for="wpai">どんなものを作りますか</label>'
        + '<textarea class="wp-ta" id="wpai" style="min-height:110px" placeholder="'
        + esc(hintFor(o.itemType)) + '"></textarea></div>'
        + btn({ label: "作ってもらう", variant: "primary", act: "go", cls: "is-lg", icon: "sparkle" }),
      onOpen: function (bodyEl, close) {
        var ta = bodyEl.querySelector("#wpai");
        try { ta.focus(); } catch (e) {}
        bodyEl.addEventListener("click", function (e) {
          if (!e.target.closest || !e.target.closest('[data-act="go"]')) return;
          var v = ta.value.trim();
          if (!v) { api.toast("内容を書いてください。", "warn"); return; }
          close();
          go(o, act, v);
        });
      }
    });
  }
  function hintFor(t) {
    return {
      form: "文化祭の満足度アンケートを作って。生徒向けで、5 分以内に答えられる内容。自由記述は 2 問まで。",
      presentation: "光合成のしくみについて、中学生向けに 6 枚で発表したい。",
      spreadsheet: "1 週間の勉強時間を科目ごとに記録する表がほしい。"
    }[t] || "作ってほしいものを書いてください。";
  }

  /* ── どこへ頼むか ─────────────────────────────────────────────
     手元の Bridge があればそれを使う。無ければ **サーバ側**へ回す。
     以前は Bridge しか見ておらず、動かしていない人には
     「AI につながっていません」しか出なかった（＝ほぼ全員が使えない）。 */
  function callAi(msg, o) {
    var kind = (o && o.kind) || "text";
    var wantBig = ["table", "tsv", "outline", "form"].indexOf(kind) >= 0;
    /* 手元の Bridge が使えるなら、そちら（速い・無料） */
    if (VQ2.ai && typeof VQ2.ai.run === "function"
        && (!VQ2.ai.available || VQ2.ai.available())) {
      return VQ2.ai.run({ task: "explanation", message: msg, level: "normal",
        onToken: o && o.onToken })
        .then(function (r) { return String((r && (r.text || r.output || r.content)) || "").trim(); });
    }
    /* サーバ側（Cloudflare）。system はサーバが必ず足す。 */
    var h = { "Content-Type": "application/json" };
    try {
      var tok = root.localStorage.getItem("app.auth.token.v1");
      if (tok) h.Authorization = "Bearer " + tok;
    } catch (e) {}
    return fetch("/api/chat/workers", {
      method: "POST", headers: h,
      body: JSON.stringify({
        messages: [{ role: "user", content: msg }],
        max_tokens: wantBig ? 1600 : 900,
        quality: wantBig ? "high" : "normal"
      })
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        var c = d && d.choices && d.choices[0] && d.choices[0].message
          && d.choices[0].message.content;
        if (typeof c !== "string" || !c) throw new Error(
          (d && (d.message || d.error)) || "AI から返事がありませんでした。");
        return c.trim();
      });
  }

  function go(o, act, extra) {
    var api = o.api;
    var src = String(o.scope.text || "");
    var truncated = src.length > MAX_CHARS;
    if (truncated) src = src.slice(0, MAX_CHARS);
    var kind = act.kind === "formula" ? "formula" : (act.outKind || kindOf(o.itemType, act));

    /* 出力の形を約束させる。守られたか検算し、外れたら 1 回だけ言い直す。 */
    var F = WP.aiFormat;
    var base = act.prompt + (F ? F.contract(kind) : "");
    var msg = base + "\n";
    if (extra) msg += "\n【指示】\n" + extra + "\n";
    if (src) msg += "\n【対象】\n" + src;
    if (truncated) msg += "\n（※ここまでで切っています）";

    /* 処理中は **モーダル**で出す（設定と同じ出し方）。
       裏で進むと「押したのに何も起きない」に見えるため。 */
    var busy = U.progressModal(api.root, {
      title: act.label,
      note: scopeText(o.scope) + (truncated ? "　長いので先頭 " + MAX_CHARS + " 文字だけを渡しました。" : ""),
      steps: ["AI へ渡しています", "考えています", "形をそろえています"]
    });

    var attempt = 0;
    function once(message) {
      attempt++;
      busy.step(attempt === 1 ? 1 : 2, attempt > 1 ? "形が崩れていたので、言い直しています" : "");
      return callAi(message, {
        kind: kind,
        onToken: function (t) { busy.stream(t); }
      });
    }

    once(msg).then(function (raw) {
      busy.step(2);
      var text = F ? F.clean(raw, kind) : String(raw || "").trim();
      var v = F ? F.validate(kind, text) : { ok: true };
      if (v.ok) return { text: text, v: v };
      /* 1 回だけ言い直す。それでも駄目ならそのまま見せる（勝手に捨てない）。 */
      return once(msg + "\n\n" + F.retryNote(kind, v.why)).then(function (raw2) {
        var t2 = F.clean(raw2, kind);
        var v2 = F.validate(kind, t2);
        return v2.ok ? { text: t2, v: v2 } : { text: text, v: v, failed: v.why };
      });
    }).then(function (res) {
      busy.close();
      if (!res.text) {
        api.toast("AI から返事がありませんでした。もう一度お試しください。", "error", 6000);
        return;
      }
      var box = U.sheet(api.root, {
        title: act.label,
        html: '<div class="wp-ai__scope">' + esc(scopeText(o.scope)) + "</div>"
          + (res.failed ? '<div class="wp-lab" style="color:var(--vq-warning-text)">'
            + "形をそろえきれませんでした（" + esc(res.failed) + "）。中身をご確認ください。</div>" : "")
          + '<div data-role="out"></div>'
      });
      showDiff(box, o, act, res.text, res.v);
    }).catch(function (e) {
      busy.close();
      var m = String(e && e.message || e);
      api.toast(m === "BUSY" ? "いま別の AI 処理が動いています。終わってからお試しください。"
        : "うまくいきませんでした：" + m, "error", 7000);
    });
  }
  /* その操作が「どんな形」を求めているか。検算に使う。 */
  function kindOf(itemType, act) {
    if (act.kind === "formula") return "formula";
    if (/表/.test(act.label) && itemType === "spreadsheet") return "tsv";
    if (/表/.test(act.label)) return "table";
    if (itemType === "presentation" && /構成|スライド/.test(act.label)) return "outline";
    if (itemType === "form" && /作|質問/.test(act.label)) return "form";
    if (/箇条書き/.test(act.label)) return "lines";
    return "text";
  }

  /* 差分を見せてから入れる（勝手に上書きしない §13.9 / §14.9）。 */
  function showDiff(box, o, act, text) {
    var out = box.body.querySelector('[data-role="out"]');
    var before = String(o.scope.text || "");
    var kind = act.kind || "text";
    out.innerHTML =
      (kind === "formula"
        ? '<div class="wp-diff"><div class="wp-diff__h">提案された数式</div>'
          + '<div class="wp-diff__b is-new" style="font:var(--vq-type-code)">' + esc(text) + "</div></div>"
        : '<div class="wp-diff" style="margin-bottom:10px"><div class="wp-diff__h">いまの内容</div>'
          + '<div class="wp-diff__b is-old">' + esc(before.slice(0, 1200) || "（空）")
          + (before.length > 1200 ? "\n…" : "") + "</div></div>"
          + '<div class="wp-diff"><div class="wp-diff__h">AI の案</div>'
          + '<div class="wp-diff__b is-new">' + esc(text) + "</div></div>")
      + '<div class="wp-inline" style="margin-top:12px;flex-wrap:wrap">'
      + btn({ label: applyLabel(o.itemType, kind), variant: "primary", act: "apply", icon: "check" })
      + btn({ label: "コピーする", act: "copy", variant: "outline", icon: "copy" })
      + btn({ label: "やめる", act: "cancel", variant: "outline" })
      + "</div>"
      + '<div class="wp-lab" style="margin-top:8px">AI の出力です。中身が正しいかは必ずご確認ください。</div>';
    out.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!t) return;
      var a = t.getAttribute("data-act");
      if (a === "cancel") { box.close(); return; }
      if (a === "copy") {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
          o.api.toast("コピーしました", "ok");
        } catch (er) {}
        return;
      }
      if (a === "apply") {
        box.close();
        if (kind === "formula" && o.onFormula) o.onFormula(text.split("\n")[0].trim());
        else if (kind === "notes" && o.onNotes) o.onNotes(text);
        else if (o.onApply) o.onApply(text, act.mode || "replace");
      }
    });
  }
  function applyLabel(itemType, kind) {
    if (kind === "formula") return "この数式を入れる";
    if (kind === "notes") return "発表者ノートに入れる";
    if (itemType === "spreadsheet") return "この表を入れる";
    if (itemType === "presentation") return "スライドにする";
    if (itemType === "form") return "この質問を足す";
    return "文書に入れる";
  }

  /* AI が出したフォームの行を、実際の質問へ直す。
     知らない形式は捨てる（登録されている形式しか作らない）。 */
  function parseForm(text) {
    var out = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      var t = line.trim().replace(/^[-*・]\s*/, "").replace(/^\d+[.)]\s*/, "");
      if (!t || t.indexOf("|") < 0) return;
      var parts = t.split("|");
      var type = String(parts[0] || "").trim().toLowerCase();
      var label = String(parts[1] || "").trim();
      var opts = String(parts[2] || "").split(/[;；,、]/).map(function (s) { return s.trim(); })
        .filter(Boolean);
      if (!WP.fieldRegistry.has(type) || !label) return;
      var f = { id: M.uid("f"), type: type, label: label, description: "", required: false, options: [] };
      if (["single_choice", "multi_choice", "dropdown", "image_choice", "ranking"].indexOf(type) >= 0) {
        if (!opts.length) return;                 /* 選択肢が無い選択形式は作らない */
        f.options = opts.map(function (x) { return { id: M.uid("o"), text: x }; });
      }
      if (type === "scale") { f.min = 1; f.max = 5; }
      if (type === "star") f.max = 5;
      out.push(f);
    });
    return out;
  }

  WP.ai = { ACTIONS: ACTIONS, actionsFor: actionsFor, actionById: actionById,
    scopeText: scopeText, open: open, run: run, parseForm: parseForm, MAX_CHARS: MAX_CHARS };
})(typeof globalThis !== "undefined" ? globalThis : this);
