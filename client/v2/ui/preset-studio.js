/* ══════════════════════════════════════════════════════════════════════
   Preset Studio V2（§7）
   ・Desktop は 3 ペイン（一覧 / 編集 / AI）。Mobile は 1 カラム＋タブ。
   ・AI の生成結果は自動確定しない。差分を出し、全体・問題単位・項目単位で適用する。
   ・自動保存・リロード復元・revision による競合検出・Undo / Redo。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  /* V3: 形式レジストリ・共通モデル・形式ごとの編集・プレビュー・配分 */
  var QT = VQ2.qtypes, QM = VQ2.qmodel, QE = VQ2.qtypeEditor, QP = VQ2.qtypePicker,
      QR = VQ2.qrender, QPL = VQ2.qplan;
  var U = VQ2.ui, S = VQ2.schema, V = VQ2.validate, ST = VQ2.store, D = VQ2.draft, AI = VQ2.ai,
      R = VQ2.repair, WS = VQ2.ws, ACT = VQ2.activity;

  /* 検証の表示で使うフィールド名。open() の外に置く。
     中に置くと、描画が var の代入より先に走って未定義になる。 */
  var FIELD_JA = {
    prompt: "問題文", choices: "選択肢", correctAnswer: "正解", acceptedAnswers: "別解",
    explanation: "解説", topic: "単元", sourceReferences: "出典", type: "問題形式",
    difficulty: "難易度"
  };
  var esc = U.esc, icon = U.icon, btn = U.button, field = U.field;
  /* chat.log の kind → タイムラインの種類と状態。
     open() の中に置くと、描画が var の代入より先に走って undefined になる
     （FIELD_JA と同じ罠。実際に「reading 'step'」で落ちた）。ここに置く。 */
  var LOG_KIND = {
    run: { kind: "thinking", status: "running" },
    step: { kind: "planning", status: "done" },
    done: { kind: "success", status: "done" },
    note: { kind: "info", status: "done" },
    warn: { kind: "warning", status: "warn" },
    error: { kind: "error", status: "error" }
  };
  var doc = root.document;

  var AUTOSAVE_MS = 1200;

  /* アイコンに使える絵文字。教科と学習にまつわるものだけ並べる。 */
  var EMOJI = ["📘", "📖", "📝", "✏️", "🧠", "🔬", "🧪", "🧮", "📐", "🌏", "🗾",
               "🏛", "⚖️", "💹", "🖥", "🎼", "🎨", "🏃", "🍳", "🩺", "🌱", "⭐️"];

  /* 画像を端末内で小さくして data URL にする。
     ・アイコンは 256×256 に切り出し、バナーは横 1280px までに収める。
     ・上限（schema.APPEARANCE_MAX）に収まるまで品質を落とす。落としきれなければ諦めて伝える。
     ・外へは一切送らない。canvas で処理して data URL にするだけ。 */
  var SHRINK = {
    iconImage: { w: 256, h: 256, crop: true, label: "アイコン" },
    banner: { w: 1280, h: 480, crop: true, label: "バナー" }
  };
  function shrinkImage(file, kind) {
    var spec = SHRINK[kind];
    var max = S.APPEARANCE_MAX[kind];
    return new Promise(function (resolve, reject) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        reject(new Error("PNG / JPEG / WebP の画像を選んでください。")); return;
      }
      if (file.size > 20 * 1024 * 1024) {
        reject(new Error("元の画像が大きすぎます（20MB まで）。")); return;
      }
      var fr = new root.FileReader();
      fr.onerror = function () { reject(new Error("画像を読み込めませんでした。")); };
      fr.onload = function () {
        var img = new root.Image();
        img.onerror = function () { reject(new Error("画像を読み込めませんでした。")); };
        img.onload = function () {
          try { resolve(draw(img)); } catch (e) { reject(new Error("画像を変換できませんでした。")); }
        };
        img.src = String(fr.result);
      };
      fr.readAsDataURL(file);

      function draw(img) {
        var cw = spec.w, ch = spec.h;
        var ratio = Math.min(1, Math.min(spec.w / img.width, spec.h / img.height));
        if (!spec.crop) { cw = Math.max(1, Math.round(img.width * ratio)); ch = Math.max(1, Math.round(img.height * ratio)); }
        var cv = doc.createElement("canvas");
        cv.width = cw; cv.height = ch;
        var g = cv.getContext("2d");
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, cw, ch);
        /* 中央を切り出して埋める（object-fit: cover と同じ見え方にする） */
        var s = Math.max(cw / img.width, ch / img.height);
        var dw = img.width * s, dh = img.height * s;
        g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);

        var q = 0.85, url = cv.toDataURL("image/jpeg", q);
        while (url.length > max && q > 0.35) { q -= 0.1; url = cv.toDataURL("image/jpeg", q); }
        if (url.length > max) {
          /* 品質だけでは収まらないので寸法も落とす */
          var cv2 = doc.createElement("canvas");
          cv2.width = Math.round(cw * 0.7); cv2.height = Math.round(ch * 0.7);
          cv2.getContext("2d").drawImage(cv, 0, 0, cv2.width, cv2.height);
          url = cv2.toDataURL("image/jpeg", 0.7);
        }
        if (url.length > max) {
          throw new Error(spec.label + "画像を上限まで小さくできませんでした。別の画像を選んでください。");
        }
        return { dataUrl: url, label: spec.label + "を設定しました（" + Math.round(url.length / 1024) + "KB）。" };
      }
    });
  }

  /* ── はじめの画面に出す一言 ───────────────────────────────────
     まだ何も話していないときは、印と一言だけを置く。
     説明を並べても読まれないので、何ができるかを一言で見せて入れ替える。
     （open() の中に置くと、最初の描画のときにまだ代入されていない） */
  var HERO_LINES = [
    "資料を入れれば、そこから問題ができます。",
    "「この範囲から 20 問」と書くだけで大丈夫です。",
    "作った問題は、あとから 1 問ずつ直せます。",
    "写真もプリントも、読み取ってから出題します。",
    "作っている途中の手順は、ここに出ます。",
    "途中で止めても、できたぶんは残ります。",
    "難しさや形式も、言葉で指定できます。"
  ];

  /* 形式の名前はレジストリが唯一の出どころ（§5）。ここへ書き写さない。
     旧いコードが TYPE_LABEL を見ているので、同じ形の表をレジストリから作る。 */
  var TYPE_LABEL = (function () {
    var m = {};
    (VQ2.qtypes ? VQ2.qtypes.all() : []).forEach(function (d) { m[d.id] = d.shortName; });
    return m;
  })();
  var DIFF_LABEL = { easy: "易", normal: "標準", hard: "難" };

  /* ══════════════════════════════════════════════════════════════════════
     生成条件の確認（§45）と、条件を満たせないときの言い方（§46）

     指示文の日本語を規則で解釈するところは、直すたびに別の読み違えが出る。
     実測で出たもの：
       ・「AとBとCで20問」の 20 問を、最後の形式の個数として読む
       ・「穴埋めをヒントなしで5問」の「なし」を、形式の禁止として読む
       ・「英訳和訳」の和訳が配分から消える
       ・「一問一答」の“一問”を数として食う
     規則を足しても完璧にはならない。だから **読み取った結果を出して直させる**。

     ここは画面を持たない純粋な部分だけを置く（テストから直に呼べるように）。
     ・build()      … extractRequirements() / candidates() の戻り値 → 画面に出す形
     ・rows()/text()… 「問題数：10問」の並び
     ・patch()      … 画面で直した内容を反映する（関係の整合もここで取る）
     ・applyToReq() … 直した条件を、実際の生成へ効かせる（指示文の読み取りより優先）
     ・unavailableText() / shortfall() … §46 の言い方

     **warnings と converted は必ず外へ出す。**
     いまこの記録は作られているのに誰も読んでいなかった（契約 §6）。
     ══════════════════════════════════════════════════════════════════════ */
  var COND = (function () {
    function reg() { return VQ2.qtypes; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function str(v) { return v === undefined || v === null ? "" : String(v); }
    function uniq(a) { var s = {}; return arr(a).map(str).filter(function (x) { if (!x || s[x]) return false; s[x] = 1; return true; }); }
    function toHalf(s) {
      return str(s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    }
    function intOf(v) { var n = parseInt(toHalf(v), 10); return isFinite(n) ? n : 0; }
    function clampCount(v) { var n = intOf(v); return n < 1 ? 1 : n > 500 ? 500 : n; }
    /* 形式の名前はレジストリが唯一の出どころ（契約 §1）。ここへ書き写さない。 */
    function nameOf(type) {
      var Q = reg();
      if (Q && Q.label) { try { return Q.label(type) || str(type); } catch (e) {} }
      return str(type);
    }

    /* ── 指示文からの読み取り（extractRequirements が持っていないもの）──
       ここで読むのは **表示のため**だけ。生成の条件は変えない。
       だから画面でも書き換えさせない（直すなら指示文を直す）。 */
    var PAGE_RES = [
      /([0-9０-９]+)\s*ページ\s*(?:から|〜|～|~|-|−|–|ー)\s*([0-9０-９]+)\s*ページ/,
      /([0-9０-９]+)\s*(?:〜|～|~|-|−|–|ー|から)\s*([0-9０-９]+)\s*ページ/,
      /p\s*\.?\s*([0-9０-９]+)\s*(?:〜|～|~|-|−|–)\s*p?\s*\.?\s*([0-9０-９]+)/i
    ];
    function readPageRange(text) {
      var t = str(text);
      for (var i = 0; i < PAGE_RES.length; i++) {
        var m = t.match(PAGE_RES[i]);
        if (m) {
          var a = intOf(m[1]), b = intOf(m[2]);
          if (a > 0 && b > 0) return { from: Math.min(a, b), to: Math.max(a, b) };
        }
      }
      var one = t.match(/([0-9０-９]+)\s*ページ\s*(以降|から)/);
      if (one) return { from: intOf(one[1]), to: 0 };
      var solo = t.match(/([0-9０-９]+)\s*ページ/);
      if (solo) { var n = intOf(solo[1]); if (n > 0) return { from: n, to: n }; }
      return null;
    }
    function pageText(r) {
      if (!r) return "";
      if (!r.to) return r.from + "ページ以降";
      if (r.to === r.from) return r.from + "ページ";
      return r.from + "〜" + r.to + "ページ";
    }
    var GRADE_RES = [
      /(小学校?|中学校?|高校|高等学校|大学)\s*([1-6１-６一二三四五六])\s*年(?:生)?/,
      /(小学生|中学生|高校生|大学生|社会人)/
    ];
    var KANJI_NUM = { "一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6" };
    var SCHOOL_NAME = { "小学": "小学", "小学校": "小学", "中学": "中学", "中学校": "中学",
                        "高校": "高校", "高等学校": "高校", "大学": "大学" };
    function readGrade(text) {
      var t = str(text);
      var m = t.match(GRADE_RES[0]);
      if (m) {
        var school = SCHOOL_NAME[m[1]] || m[1];
        var n = KANJI_NUM[m[2]] || toHalf(m[2]);
        return school + n + "年生";
      }
      var m2 = t.match(GRADE_RES[1]);
      return m2 ? m2[1] : "";
    }
    /* 解説の有無。AI 生成では解説欄を必ず作るので、書かれていなければ「あり」。
       ここは読み取ったことをそのまま出すだけで、こちらでは何も強制しない。 */
    function readExplanation(text) {
      var t = str(text);
      if (/解説(?:は|を|も)?\s*(?:いらない|いりません|要らない|要りません|不要|なし|無し|つけないで|付けないで|つけなくて|省いて|抜きで)/.test(t))
        return { value: false, stated: true };
      if (/解説(?:を|は)?\s*(?:つけて|付けて|入れて|くわしく|詳しく|丁寧に|必ず)|解説(?:は|も)?\s*(?:あり|必要)/.test(t))
        return { value: true, stated: true };
      return { value: true, stated: false };
    }

    /* 形式らしいことを言っているのに 1 つも読み取れなかったか。
       読み違えの多くはここで気づける（気づけたら画面で直させる）。 */
    var TYPEISH_RE = /(形式|択|選択|穴埋め|空欄|並(?:び|べ)替え|記述|論述|作文|正誤|○×|マル(?:バツ|×)|一問一答|マッチング|線結び|分類|語句|単語|和訳|英訳|翻訳|リスニング|音声|ディクテーション|書き取り|計算|figure|図)/;

    function normDist(list) {
      return arr(list).map(function (e) {
        return { type: str(e && e.type), count: intOf(e && e.count) };
      }).filter(function (e) { return e.type && e.count > 0; });
    }
    function sumDist(list) {
      return normDist(list).reduce(function (a, e) { return a + e.count; }, 0);
    }

    function build(req, cand, ctx) {
      req = req || {};
      ctx = ctx || {};
      var text = str(ctx.instruction || req.instruction);
      var stated = req.stated || {};
      var cond = {
        instruction: text,
        /* ここから下が「読み取った条件」。画面で直せるのは上 4 つだけ。 */
        totalQuestions: clampCount(req.totalQuestions || ctx.defaultCount || 10),
        requestedTypes: uniq(req.requestedTypes),
        onlyRequested: !!req.onlyRequested,
        typeDistribution: normDist(req.typeDistribution),
        excludedTypes: uniq(req.excludedTypes),
        flags: {
          noFourChoice: !!req.noFourChoice, noWriting: !!req.noWriting,
          noAiGrading: !!req.noAiGrading, noImage: !!req.noImage, noAudio: !!req.noAudio
        },
        /* 以下は読み取りの表示だけ（画面では直せない） */
        difficulty: str(req.difficulty) || "normal",
        difficultyStated: !!stated.difficulty,
        grade: readGrade(text) || str(req.grade),
        sources: arr(ctx.sources).map(str).filter(Boolean),
        sourceOnly: ctx.sourceOnly !== false,
        pageRange: readPageRange(text),
        explanation: readExplanation(text),
        /* 契約 §6：黙って変えたことを利用者へ届ける */
        warnings: arr(req.warnings).map(str).filter(Boolean),
        converted: arr(req.converted).slice(),
        /* §46：名指しされたのに使えない形式（理由と代わり付き） */
        unavailable: arr(cand && cand.unavailableRequested).map(function (u) {
          return {
            type: str(u.type), name: str(u.name) || nameOf(u.type), reason: str(u.reason),
            alternatives: arr(u.alternatives).map(function (a) {
              return { type: str(a.type), name: str(a.name) || nameOf(a.type) };
            })
          };
        }),
        /* いま足せる形式（教材と指定から作れると分かっているものだけ） */
        available: arr(cand && cand.types).slice(),
        /* 画面で直したときに、何を直したかを残す */
        notes: [],
        dropped: [],
        edited: false,
        read: !!(req && req.instruction !== undefined)
      };
      normalize(cond);
      return cond;
    }

    function clone(cond) {
      var c = JSON.parse(JSON.stringify(cond || {}));
      c.flags = c.flags || { noFourChoice: false, noWriting: false, noAiGrading: false, noImage: false, noAudio: false };
      return c;
    }

    /* 直したあとに、条件どうしの食い違いを取る。
       ここで黙って変えたことは notes に残す（画面へ出す）。 */
    function normalize(cond) {
      cond.requestedTypes = uniq(cond.requestedTypes);
      cond.excludedTypes = uniq(cond.excludedTypes);
      cond.typeDistribution = normDist(cond.typeDistribution);
      /* 使わないと決めた形式は、要求からも個数からも外す。 */
      cond.requestedTypes = cond.requestedTypes.filter(function (t) { return cond.excludedTypes.indexOf(t) < 0; });
      cond.typeDistribution = cond.typeDistribution.filter(function (e) { return cond.excludedTypes.indexOf(e.type) < 0; });
      /* 個数まで決めた形式は、名指しされているのと同じこと。 */
      cond.typeDistribution.forEach(function (e) {
        if (cond.requestedTypes.indexOf(e.type) < 0) cond.requestedTypes.push(e.type);
      });
      if (!cond.requestedTypes.length) cond.onlyRequested = false;
      /* 使えない形式の表示は、まだ頼んでいるものだけ残す。 */
      cond.unavailable = arr(cond.unavailable).filter(function (u) {
        return cond.requestedTypes.indexOf(u.type) >= 0;
      });
      cond.totalQuestions = clampCount(cond.totalQuestions);
      /* 形式ごとの個数の合計が問題数を超えたら、合計を採る（契約 §5 と同じ方針）。
         どの形式を削るかをこちらで決めるのは「無言の変換」になるのでやらない。 */
      var sum = sumDist(cond.typeDistribution);
      if (sum > cond.totalQuestions) {
        cond.notes.push("形式ごとの個数の合計が " + sum + " 問なので、問題数を " + sum + " 問にしました。");
        cond.totalQuestions = clampCount(sum);
      }
      return cond;
    }

    function patch(cond, p) {
      var c = clone(cond);
      p = p || {};
      c.notes = [];
      if (p.totalQuestions !== undefined) c.totalQuestions = clampCount(p.totalQuestions);
      if (p.requestedTypes !== undefined) c.requestedTypes = uniq(p.requestedTypes);
      if (p.excludedTypes !== undefined) c.excludedTypes = uniq(p.excludedTypes);
      if (p.typeDistribution !== undefined) c.typeDistribution = normDist(p.typeDistribution);
      if (p.onlyRequested !== undefined) c.onlyRequested = !!p.onlyRequested;
      if (p.flags) Object.keys(p.flags).forEach(function (k) { c.flags[k] = !!p.flags[k]; });

      /* 形式を足す（代わりの形式を選んだとき・一覧から選んだとき） */
      arr(p.addTypes).forEach(function (t) {
        t = str(t); if (!t) return;
        var i = c.excludedTypes.indexOf(t);
        if (i >= 0) c.excludedTypes.splice(i, 1);
        if (c.requestedTypes.indexOf(t) < 0) c.requestedTypes.push(t);
      });
      /* 形式を要求から外す */
      arr(p.removeTypes).forEach(function (t) {
        t = str(t); if (!t) return;
        c.requestedTypes = c.requestedTypes.filter(function (x) { return x !== t; });
        c.typeDistribution = c.typeDistribution.filter(function (e) { return e.type !== t; });
      });
      /* 使えないので「あきらめる」形式。黙って消さず、あきらめたことを残す（§46）。 */
      arr(p.dropTypes).forEach(function (t) {
        t = str(t); if (!t) return;
        c.requestedTypes = c.requestedTypes.filter(function (x) { return x !== t; });
        c.typeDistribution = c.typeDistribution.filter(function (e) { return e.type !== t; });
        if (c.dropped.indexOf(t) < 0) c.dropped.push(t);
      });
      /* 使わない形式にする / 戻す */
      arr(p.excludeTypes).forEach(function (t) {
        t = str(t); if (!t) return;
        if (c.excludedTypes.indexOf(t) < 0) c.excludedTypes.push(t);
      });
      arr(p.unexcludeTypes).forEach(function (t) {
        t = str(t);
        c.excludedTypes = c.excludedTypes.filter(function (x) { return x !== t; });
      });
      /* 形式ごとの個数を直す。0 にしたら、その行を消す。 */
      if (p.setCount) {
        Object.keys(p.setCount).forEach(function (t) {
          var n = intOf(p.setCount[t]);
          c.typeDistribution = c.typeDistribution.filter(function (e) { return e.type !== t; });
          if (n > 0) c.typeDistribution.push({ type: t, count: n });
        });
      }
      c.edited = true;
      normalize(c);
      return c;
    }

    /* ── 画面に出す並び ─────────────────────────────────────── */
    var FLAG_LABEL = {
      noFourChoice: "4択", noWriting: "記述", noAiGrading: "AI採点", noImage: "画像", noAudio: "音声"
    };
    var DIFFICULTY_TEXT = { easy: "やさしめ", normal: "標準", hard: "難しめ" };

    function typeText(cond) {
      if (!cond.requestedTypes.length) return "おまかせ（教材に合わせてこちらで決めます）";
      var names = cond.requestedTypes.map(nameOf);
      return cond.onlyRequested ? names.join("／") + "のみ" : names.join("／");
    }
    function distText(cond) {
      return cond.typeDistribution.map(function (e) { return nameOf(e.type) + " " + e.count + "問"; }).join("／");
    }
    function forbiddenList(cond) {
      var out = cond.excludedTypes.map(nameOf);
      Object.keys(FLAG_LABEL).forEach(function (k) {
        if (cond.flags[k] && out.indexOf(FLAG_LABEL[k]) < 0) out.push(FLAG_LABEL[k]);
      });
      return out;
    }
    function difficultyText(cond) {
      var d = DIFFICULTY_TEXT[cond.difficulty] || "標準";
      if (cond.grade) return cond.difficultyStated ? cond.grade + "（" + d + "）" : cond.grade;
      return d;
    }

    /* 「問題数：10問」の並び。値が無い行は出さない（空欄を並べても読めない）。 */
    function rows(cond) {
      cond = cond || {};
      var out = [];
      out.push({ key: "total", label: "問題数", value: cond.totalQuestions + "問", editable: true });
      out.push({ key: "types", label: "形式", value: typeText(cond), editable: true });
      var d = distText(cond);
      if (d) out.push({ key: "dist", label: "形式ごとの個数", value: d, editable: true });
      var ng = forbiddenList(cond);
      if (ng.length) out.push({ key: "forbidden", label: "禁止形式", value: ng.join("、"), editable: true });
      if (arr(cond.sources).length)
        out.push({ key: "sources", label: "資料", value: cond.sources.join("、"), editable: false });
      var pg = pageText(cond.pageRange);
      if (pg) out.push({ key: "range", label: "範囲", value: pg, editable: false });
      out.push({ key: "difficulty", label: "難易度", value: difficultyText(cond), editable: false });
      out.push({ key: "explanation", label: "解説",
                 value: (cond.explanation && cond.explanation.value === false) ? "なし" : "あり",
                 editable: false });
      return out;
    }
    function lines(cond) {
      return rows(cond).map(function (r) { return r.label + "：" + r.value; });
    }
    function text(cond) {
      return ["生成条件"].concat(lines(cond).map(function (l) { return "　" + l; })).join("\n");
    }

    /* 読み取りに迷いがあるか。ここが空でなければ、確認を飛ばさない。 */
    function ambiguity(cond) {
      var out = [];
      if (!cond) return ["生成条件を読み取れませんでした。"];
      arr(cond.warnings).forEach(function (w) { out.push(w); });
      arr(cond.unavailable).forEach(function (u) {
        out.push("指定された「" + u.name + "」は使えません。");
      });
      if (!arr(cond.requestedTypes).length && TYPEISH_RE.test(str(cond.instruction)))
        out.push("形式を指定しているようですが、どの形式か読み取れませんでした。");
      var sum = sumDist(cond.typeDistribution);
      if (sum > 0 && sum < cond.totalQuestions)
        out.push("形式ごとの個数の合計は " + sum + " 問です。残り "
                 + (cond.totalQuestions - sum) + " 問はこちらで決めます。");
      return out;
    }
    function needsConfirm(cond) { return ambiguity(cond).length > 0; }
    /* 確認シートを出すか。既定（always）は毎回出す。
       「省く」を選んであっても、読み取りに迷いがあるときは必ず出す。 */
    function shouldConfirm(cond, always) { return always !== false || needsConfirm(cond); }

    /* 実際に作る問題数。確かめた条件があればそれが正。
       無ければ指示文から読んだ数、それも無ければ既定。 */
    function wantFor(cond, statedCount, defaultCount) {
      if (cond && intOf(cond.totalQuestions) > 0) return intOf(cond.totalQuestions);
      var n = intOf(statedCount);
      return n > 0 ? n : (intOf(defaultCount) || 10);
    }

    /* 配分を割り当てる形式。
       「〜だけ」「全問 〜で」と言われているなら、その形式だけで割る。
       ここを通さないと、画面に「◯◯のみ」と出したのに 8 形式が混ざる
       （qplan は style:"manual" のときしか 1 形式に絞らないため）。
       画面のチェックで選んだ形式（manualTypes）は、指定が無いときだけ効く。 */
    function planTypes(cond, manualTypes) {
      if (cond && cond.onlyRequested && arr(cond.requestedTypes).length)
        return arr(cond.requestedTypes).slice();
      return arr(manualTypes).slice();
    }

    /* 直した条件を、実際の生成へ効かせる（§45 の「直した内容が反映されること」）。
       指示文をもう一度読み直しても、人が直した内容のほうが正しい。
       だから extractRequirements() の戻り値を **上書き** する。
       ここを通さないと、画面で外した形式が読み取りで復活する。 */
    function applyToReq(req, cond) {
      if (!req || !cond) return req;
      req.requestedTypes = arr(cond.requestedTypes).slice();
      req.excludedTypes = arr(cond.excludedTypes).slice();
      req.typeDistribution = normDist(cond.typeDistribution);
      req.onlyRequested = !!cond.onlyRequested;
      req.noFourChoice = !!cond.flags.noFourChoice;
      req.noWriting = !!cond.flags.noWriting;
      req.noAiGrading = !!cond.flags.noAiGrading;
      req.noImage = !!cond.flags.noImage;
      req.noAudio = !!cond.flags.noAudio;
      return req;
    }

    /* ── §46：条件を満たせないときの言い方 ──────────────────────
       できない理由と、次にできることを必ず出す。黙って別形式へ変えない。 */
    var REASON_TEXT = {
      "いまは使えません": "現在ご利用いただけません",
      "そのような形式はありません": "この名前の形式がありません"
    };
    function unavailableText(u) {
      if (!u) return "";
      var reason = REASON_TEXT[str(u.reason)] || str(u.reason) || "現在ご利用いただけません";
      var out = "指定された「" + (str(u.name) || nameOf(u.type)) + "」は" + reason + "。";
      var alts = arr(u.alternatives).map(function (a) { return str(a.name) || nameOf(a.type); });
      if (alts.length) out += "\n利用できる形式：" + alts.join("／");
      return out;
    }

    /* 頼まれた数に届かなかったとき。数だけ出して終わりにしない。 */
    function shortfall(o) {
      o = o || {};
      var want = intOf(o.want), made = intOf(o.made);
      var what = str(o.typeName) ? "「" + str(o.typeName) + "」の問題" : "問題";
      var where = arr(o.sources).length || o.sourceOnly ? "指定範囲から" : "この指示から";
      return {
        title: where + what + "を" + want + "問作れるだけの内容を取得できませんでした。",
        body: "作成可能：" + made + "問",
        made: made, want: want,
        actions: [
          { id: "shortfall-accept", label: made + "問で作成", icon: "check", variant: "primary" },
          { id: "attach-add", label: "範囲を広げる", icon: "plus" },
          { id: "shortfall-types", label: "別形式を追加", icon: "list" }
        ]
      };
    }

    /* ── 確認シートの中身（HTML）──────────────────────────────
       esc 以外の部品に頼らない。テストからも同じ関数を呼んで中身を見る。 */
    function html(cond, opts) {
      opts = opts || {};
      var e = esc;
      var h = "";

      /* ⓪ 読み取りに迷いがあるところを、いちばん上で強調する。
         毎回ここを読ませたいわけではない。**迷ったときだけ**目に入るようにする。 */
      var amb = ambiguity(cond);
      if (amb.length) {
        h += '<div class="vq2-card vq2-cond-amb" role="status"'
          + ' style="border-color:var(--vq-warning-border,#e6c200)">'
          + '<div class="vq2-sec-t">ここを確かめてください</div><ul>'
          + amb.map(function (x) { return "<li>" + e(x) + "</li>"; }).join("")
          + "</ul></div>";
      }

      /* ① 読み取った条件（直せるところ） */
      h += '<div class="vq2-card"><div class="vq2-sec-t">生成条件</div>'
        + '<div class="vq2-hint" style="margin-bottom:10px">'
        + "指示文から読み取った条件です。違っていたらここで直してください。</div>"
        /* 見た目は共通の部品だけで作る。この画面のためだけの CSS は足さない。 */
        + '<div class="vq2-cond-rows" style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px">';
      rows(cond).forEach(function (r) {
        h += '<div class="vq2-label" data-cond-row="' + e(r.key) + '">' + e(r.label) + "</div>"
          + '<div class="vq2-cond-v" data-cond-val="' + e(r.key) + '">' + e(r.value) + "</div>";
      });
      h += "</div>";

      /* 直す操作 */
      h += '<div class="vq2-cond-edit" style="margin-top:12px">'
        + '<div class="vq2-row" style="gap:8px;align-items:center;flex-wrap:wrap">'
        + '<label class="vq2-label" for="condTotal">問題数</label>'
        + '<input id="condTotal" class="vq2-input" type="number" min="1" max="500" step="1"'
        + ' data-cond="total" value="' + e(cond.totalQuestions) + '" style="width:96px">'
        + "<span>問</span></div>";

      if (cond.requestedTypes.length) {
        h += '<div style="margin-top:10px"><div class="vq2-label">形式</div>'
          + '<div class="vq2-row" style="gap:6px;flex-wrap:wrap;margin-top:4px">'
          + cond.requestedTypes.map(function (t) {
              return '<button type="button" class="vq2-chip sm" data-cond-untype="' + e(t) + '"'
                + ' aria-label="' + e(nameOf(t)) + " を外す" + '">' + e(nameOf(t)) + " ×</button>";
            }).join("")
          + "</div>"
          + '<label class="vq2-check sm" style="margin-top:6px"><input type="checkbox" data-cond="only"'
          + (cond.onlyRequested ? " checked" : "") + ">"
          + "<span>この形式だけで作る</span></label></div>";
      }

      /* 形式ごとの個数。0 にすると、その行は消える。 */
      if (cond.typeDistribution.length) {
        h += '<div style="margin-top:10px"><div class="vq2-label">形式ごとの個数</div>'
          + cond.typeDistribution.map(function (d) {
              return '<div class="vq2-row" style="gap:8px;align-items:center;margin-top:4px">'
                + "<span>" + e(nameOf(d.type)) + "</span>"
                + '<input class="vq2-input" type="number" min="0" max="500" step="1"'
                + ' data-cond-count="' + e(d.type) + '" value="' + e(d.count) + '" style="width:80px"'
                + ' aria-label="' + e(nameOf(d.type)) + " の問題数" + '">'
                + "<span>問</span></div>";
            }).join("")
          + '<div class="vq2-hint" style="margin-top:4px">0 にすると、その形式の個数指定を外します。</div></div>';
      }

      /* 禁止形式 */
      h += '<div style="margin-top:10px"><div class="vq2-label">禁止形式</div>';
      if (cond.excludedTypes.length) {
        h += '<div class="vq2-row" style="gap:6px;flex-wrap:wrap;margin-top:4px">'
          + cond.excludedTypes.map(function (t) {
              return '<button type="button" class="vq2-chip sm" data-cond-unexclude="' + e(t) + '"'
                + ' aria-label="' + e(nameOf(t)) + " の禁止をやめる" + '">' + e(nameOf(t)) + " ×</button>";
            }).join("")
          + "</div>";
      }
      h += '<div class="vq2-row" style="gap:10px;flex-wrap:wrap;margin-top:6px">'
        + Object.keys(FLAG_LABEL).map(function (k) {
            return '<label class="vq2-check sm"><input type="checkbox" data-cond-flag="' + e(k) + '"'
              + (cond.flags[k] ? " checked" : "") + "><span>" + e(FLAG_LABEL[k]) + "を使わない</span></label>";
          }).join("")
        + "</div></div>";

      /* 足せる形式 */
      var add = arr(opts.available !== undefined ? opts.available : cond.available)
        .filter(function (t) { return cond.requestedTypes.indexOf(t) < 0; })
        .slice(0, 12);
      if (add.length) {
        h += '<div style="margin-top:10px"><div class="vq2-label">形式を足す</div>'
          + '<div class="vq2-row" style="gap:6px;flex-wrap:wrap;margin-top:4px">'
          + add.map(function (t) {
              return '<button type="button" class="vq2-chip sm" data-cond-addtype="' + e(t) + '">'
                + "＋" + e(nameOf(t)) + "</button>";
            }).join("")
          + "</div></div>";
      }
      h += "</div></div>";

      /* ② 読み取りの注意（契約 §6：warnings / converted を必ず出す） */
      if (cond.warnings.length || cond.converted.length || cond.notes.length) {
        h += '<div class="vq2-card vq2-cond-warn"><div class="vq2-sec-t">読み取りの注意</div>'
          + '<div class="vq2-hint" style="margin-bottom:8px">'
          + "指示文のとおりではない扱いをしたところです。違っていたら上で直してください。</div><ul>";
        cond.warnings.forEach(function (w) { h += "<li>" + e(w) + "</li>"; });
        cond.converted.forEach(function (c) {
          h += '<li class="vq2-cond-conv">' + e(convText(c)) + "</li>";
        });
        cond.notes.forEach(function (n) { h += "<li>" + e(n) + "</li>"; });
        h += "</ul></div>";
      }

      /* ③ 使えない形式（§46） */
      if (cond.unavailable.length) {
        h += '<div class="vq2-card vq2-cond-ng"><div class="vq2-sec-t">指定された形式が使えません</div>'
          + cond.unavailable.map(function (u) {
              return '<div class="vq2-cond-ngrow" data-cond-ng="' + e(u.type) + '">'
                + "<p>" + e(unavailableText(u)).replace(/\n/g, "<br>") + "</p>"
                + '<div class="vq2-row" style="gap:6px;flex-wrap:wrap;margin-top:6px">'
                + u.alternatives.map(function (a) {
                    return '<button type="button" class="vq2-chip sm" data-cond-addtype="' + e(a.type) + '"'
                      + ' data-cond-instead="' + e(u.type) + '">' + e(a.name) + "を使う</button>";
                  }).join("")
                + '<button type="button" class="vq2-chip sm" data-cond-drop="' + e(u.type) + '">'
                + "この形式は使わずに続ける</button>"
                + "</div></div>";
            }).join("")
          + "</div>";
      }

      /* ④ あきらめた形式（黙って消さない） */
      if (cond.dropped.length) {
        h += '<div class="vq2-card"><div class="vq2-sec-t">使わないことにした形式</div><ul>'
          + cond.dropped.map(function (t) {
              return "<li>" + e(nameOf(t)) + "：この形式は使わずに作ります。</li>";
            }).join("")
          + "</ul></div>";
      }
      return h;
    }
    function convText(c) {
      if (!c || typeof c !== "object") return str(c);
      var what = { totalQuestions: "問題数", typeCount: "形式ごとの個数", typeMerge: "形式のまとめ" }[c.what] || str(c.what);
      return what + "：" + str(c.from) + " → " + str(c.to)
        + (c.reason ? "（" + str(c.reason) + "）" : "");
    }

    return {
      build: build, clone: clone, patch: patch, normalize: normalize,
      rows: rows, lines: lines, text: text, html: html,
      ambiguity: ambiguity, needsConfirm: needsConfirm, shouldConfirm: shouldConfirm,
      wantFor: wantFor, planTypes: planTypes,
      applyToReq: applyToReq, unavailableText: unavailableText, shortfall: shortfall,
      readPageRange: readPageRange, readGrade: readGrade, readExplanation: readExplanation,
      sumDistribution: sumDist, nameOf: nameOf, FLAG_LABEL: FLAG_LABEL
    };
  })();

  function open(o) {
    o = o || {};
    var app = U.mount("vq2-preset-studio", {
      title: "プリセットを編集",
      onBeforeClose: function () { return beforeClose(); },
      onClose: function (reason) {
        stopTickers();
        writeChat();                      /* 会話は閉じても残す */
        if (o.onClose) { try { o.onClose(reason); } catch (e) {} }
      },
      onEscape: function () { return false; },     /* 誤操作で閉じない。閉じるボタンから */
      onResize: function () { render(); }
    });

    /* ── 状態 ────────────────────────────────────────────────── */
    var st = {
      preset: null,
      baseRevision: null,
      selectedId: null,
      multi: {},                  /* 複数選択 */
      dirty: false,
      saving: false,
      savedAt: null,
      saveError: null,
      issues: [],
      /* 新規のときは「AI で作る」から始める（まだ検証するものが無いため） */
      mode: o.preset && (o.preset.questions || []).length ? "manual" : "auto",
      mobileTab: "list",          /* list | edit | ai（旧タブ。下の pane へ写す） */
      /* ── ワークスペース ───────────────────────────────────
         中央のタブと、狭い画面でどのペインを出すか。
         tab  … questions | verify | repair | diff
         pane … left（指示）| main（内容）| side（AI） */
      tab: o.preset && (o.preset.questions || []).length ? "questions" : "questions",
      pane: "main",
      /* 依頼文があいまいなときの補助。指示文と食い違ったら注意を出すだけで、
         勝手に上書きはしない（書いた言葉を最優先にする）。 */
      quick: { subject: "", grade: "", scope: "", count: 0,
               difficulty: "", qtype: "", choiceCount: 0 },
      foldQuick: false,
      foldSource: false,
      draft: D.newDraftState(),
      diff: null,
      diffSelection: {},          /* qid -> Set(field) 相当 */
      /* AI へ送る形。大きな資料は attachmentId だけになり、本体はここに入らない。 */
      attachments: [],
      attachDisplay: [],     /* 画面のチップに出す形（名前・形式・大きさ・状態） */
      attachBusy: false,
      /* 分割アップロードの束。1 つのプリセットで置き場所を共有する。 */
      upSession: null,
      /* 資料ごとのページ読み取り結果（サーバから戻る attachmentAnalysis） */
      pageAnalysis: {},
      /* 使わないことにしたページ（資料ID → [ページ番号]） */
      excludedPages: {},
      aiBusy: false,
      aiText: "",
      aiError: null,
      aiNote: null,
      aiCancelled: false,
      sawTruncation: false,
      autoInstruction: "",
      sourceOnly: true,
      /* 出題形式の内訳。既定は「完全自動」（教材に合わせてこちらが決める）。 */
      mixStyle: "auto",
      mixPlan: null,
      /* 使う形式を自分で選んだとき（空なら自動）。 */
      mixTypes: [],
      /* 使わない形式（形式ごと）。 */
      mixExclude: [],
      /* まとめて外すもの。「4 択は使わない」など（§14）。
         指定したのに使えないときは、**黙って 4 択へ置き換えない**。 */
      mixFlags: { noFourChoice: false, noWriting: false, noAiGrading: false, noImage: false, noAudio: false },
      collapsedDiff: {},
      /* AI 修正の対象。"question"＝選んでいる問題だけ / "preset"＝全体。
         AI が作った問題か自分で作った問題かでは区別しない。 */
      reviseScope: "question",
      /* AI が返したのに反映しない提案（対象外・正解が選択肢に無い等）。理由つきで出す。 */
      rejected: [],
      /* いま動いている生成の印。追加指示はこれへ紐付ける（別タブと混ざらないため）。 */
      runId: "",
      /* サーバ側の処理 ID。追加指示の二重適用をサーバで止めるために渡す。 */
      aiJobId: "",
      /* 生成中に送られた追加指示のキュー */
      followups: D.newFollowupQueue(),
      followupText: "",
      /* AI パネルの会話。{role:"user",text} と {role:"ai",log:[],text,error} が並ぶ。
         読み込み時に前回までの会話を復元する（afterLoad）。 */
      chat: [],

      /* ── 検証エラーの AI 修復 ─────────────────────────────
         ・repairSel   … 画面で選んだエラー（id → true）
         ・repairCtx   … いま出している修正案が「どのエラーの・どの問題の」ものか
         ・repairLoop  … 自動の再検証ループ（最大 3 回）
         ・repairDone  … 直らずに止まったときの手当て
         ・expectedCount … 指定問題数（不足の判定に使う。無ければ判定しない） */
      repairSel: {},
      repairCtx: null,
      repairLoop: null,
      repairDone: null,
      repairBusy: false,
      backfillMode: "",
      expectedCount: 0,
      /* 生成中の追加指示から読み取った全体制約（遡及確認に使う） */
      globalConstraints: null,

      /* ── 生成条件の確認（§45）─────────────────────────────
         ・condition     … 画面で確かめて（必要なら直して）決まった条件
         ・conditionFor  … その条件を決めたときの指示文。指示文が変われば作り直す
         ・conditionAlways … 毎回確認するか。既定は毎回。
           読み取りに迷いが無いときだけ省く設定を、確認シートの中から選べる。 */
      condition: null,
      conditionFor: null,
      conditionAlways: true
    };
    var history = new VQ2.History(null, { onChange: function () { renderTop(); } });
    var saveTimer = null;
    /* 進行の表示は右のタイムライン（actPanel）が持つ。
       start / stop は「動いている印」を切り替えるだけにする。 */
    var activity = {
      start: function () { actPanel.setBusy(true, "作っています"); },
      stop: function () { actPanel.setBusy(false, ""); },
      set: function (items) { actPanel.fromActivity(items); }
    };
    /* 会話パネルは load() より前に用意する。
       load() の中で最初の描画（wireAi）まで進むので、あとで var を書くと
       そこで設定済みのタイマーが null に戻され、止められないまま回り続ける。 */
    var chatTimer = null;
    var chat = new U.AiChat({
      getRoot: function () { return app.root; },
      /* 会話そのものは右のタイムラインへ流す。ここで描き直す相手はもう居ない。
         （元は #aiLog を探して見つからないと毎回描き直していた） */
      onRepaint: function () {},
      heroLines: HERO_LINES
    });
    /* chat.log の 1 行を、そのままタイムラインの出来事にする。
       onLog ではなく onAppend に付ける。onLog は積んだ瞬間に呼ばれるので、
       それだと溜まっていた行が一気に出てしまう。
       会話の記録（st.chat）は今までどおり残るので、保存・復元は変わらない。 */
    chat.onAppend = function (e) { timelineFromLog(e); };

    /* ── 右ペイン：AI アクティビティ ───────────────────────────
       進行・Bash・追加指示をここ 1 つにまとめる。
       状態は JS 側（actPanel）が持つので、画面を描き直しても消えない。 */
    var actPanel = new ACT.Panel({
      title: "AI アクティビティ",
      /* 経過と残り時間は共通部品（AiChat）が #aiEta を探して書く。
         見出しの中に置いておけば、これまでどおり動く。 */
      headExtra: '<span class="vq2-eta vq2-aiact-eta" id="aiEta" role="status" aria-live="polite"></span>',
      emptyText: "ここに AI の作業が並びます。",
      emptySub: "下の欄に作りたい問題を書いて送ると、ここに手順が出ます。",
      chips: ["正誤問題を多めに", "選択肢を5個に", "難易度を少し上げて", "解説を詳しくして"],
      onCancel: function () { AI.cancel(); app.toast("停止しています…", "info"); },
      /* 入力欄は 1 つ。押したときに何が起きるかは、いまの状況で決まる。 */
      onFollowup: function (text) { return composerSend(text); },
      onAttach: function () { pickAttachments(); },
      onAttachRemove: function (id) { removeAttachment(id); },
      onAttachRetry: function (id) { retryAttachment(id); },
      /* 送信の操作（止める・続ける・落ちた分だけ送り直す） */
      onAttachUpload: function (kind, id) { uploadAction(kind, id); },
      /* 部分成功のときの 4 つの手 */
      onAttachPageAction: function (act, id) { pageAction(act, id); },
      onAction: function (id) { onActivityAction(id); }
    });

    /* いまの入力欄の役目。作成前 / 生成中 / 生成後 の 3 つ。 */
    /* 失敗したら、打った文を入力欄へ戻す。 */
    function restoreComposer() {
      if (!st.lastSent) return;
      try { actPanel.restore(st.lastSent); } catch (e) {}
      st.lastSent = "";
    }

    function composerState() {
      if (st.aiBusy || st.repairBusy) return "running";
      return st.preset && st.preset.questions.length ? "after" : "before";
    }
    function composerSend(text) {
      var t = String(text || "").trim();
      if (!t) return false;
      var mode = composerState();
      if (mode === "running") return sendFollowupText(t);
      /* 資料の取り込みが終わっていないなら、終わってから始める。
         待たずに始めると、資料が付いていないまま作り出す
         （送信は済んでいても、文章の取り出しとページ画像の送信が残っている）。 */
      if (st.attachBusy && st.attachPending) {
        actPanel.push({ kind: "upload", status: "running",
                        title: "資料の取り込みが終わるのを待っています",
                        short: "終わり次第、続けて作り始めます" });
        st.attachPending.then(function () { composerSend(t); });
        return true;
      }
      st.autoInstruction = t;
      /* 失敗したときに打った文を戻せるよう、控えておく。
         Enter で送って失敗し、書いた指示が消えるのがいちばん困る。 */
      st.lastSent = t;
      /* 生成後でも「3 問作って」「〜を追加して」は作り足し。
         数や「追加」と書いてあるのに直しにすると、頼んだものが増えない。 */
      var wantsMore = mode === "after"
        && (countFrom(t) > 0 || /追加|足し|増やし|もう\s*\d*\s*問/.test(t));
      runAi(mode === "after" && !wantsMore ? "revise" : "generate");
      return true;
    }
    function paintComposer() {
      actPanel.setState(composerState());
      /* チップは表示用の情報（形式・大きさ・状態）を持つほうを使う */
      actPanel.setAttachments(st.attachDisplay);
      actPanel.setOptions(
        '<label class="vq2-check sm"><input type="checkbox" data-key="sourceOnly"'
        + (st.sourceOnly ? " checked" : "") + ">"
        + "<span>資料だけを根拠にする</span></label>"
        /* 何をどれだけ作るかを、頼む前に決める（§16）。
           これを出さないと、AI 生成はほぼ 4 択だけになる。 */
        + (QPL ? '<label class="vq2-check sm" style="gap:6px"><span>出題形式</span>'
            + '<select class="vq2-input vq2-select" data-key="mixStyle" style="height:32px;padding:2px 26px 2px 8px;max-width:150px">'
            + QPL.STYLES.filter(function (x) { return x.id !== "manual"; }).map(function (x) {
                return '<option value="' + x.id + '"' + (st.mixStyle === x.id ? " selected" : "") + ">" + esc(x.label) + "</option>";
              }).join("") + "</select></label>" : "")
        /* 形式を自分で選ぶ・使わない形式を決める（§14 / §26）。
           指定した形式が使えないときは、ここで理由と代わりを出す。 */
        + (QPL ? U.button({ label: mixLabel(), icon: "list", size: "sm", action: "open-mix" }) : "")
        + (st.attachDisplay.length
            ? '<span class="vq2-tlc-opt-n">資料 ' + st.attachDisplay.length + " 件</span>" : ""));
    }
    /* いまの指定を 1 語で。押す前に何が効いているか分かるようにする。 */
    function mixLabel() {
      var n = st.mixTypes.length;
      var off = st.mixExclude.length + Object.keys(st.mixFlags).filter(function (k) { return st.mixFlags[k]; }).length;
      if (n) return "形式 " + n + " 種類";
      if (off) return "形式（除外 " + off + "）";
      return "形式を選ぶ";
    }

    /* ── 読み込み ────────────────────────────────────────────── */
    load();

    function load() {
      var p = null;
      if (o.presetId) p = ST.getPreset(o.presetId);
      if (!p && o.preset) p = o.preset;
      if (!p) p = S.emptyPreset({ name: "新しいプリセット" });

      /* 未保存の下書きがあれば聞く */
      var d = ST.loadDraft("preset", p.id);
      if (d && d.payload) {
        st.preset = p; st.baseRevision = p.revision;
        render();
        app.confirm({
          title: "編集中の内容が残っています",
          body: "前回の編集が保存されずに終了しています（" + formatTime(d.savedAt) + "）。復元しますか？",
          okLabel: "復元する", cancelLabel: "破棄して開く"
        }).then(function (yes) {
          if (yes) { st.preset = d.payload; st.dirty = true; }
          else ST.clearDraft("preset", p.id);
          afterLoad();
        });
        return;
      }
      st.preset = p; st.baseRevision = p.revision;
      afterLoad();
    }
    function afterLoad() {
      if (!st.preset.questions.length) st.preset.questions = [];
      st.selectedId = st.preset.questions.length ? st.preset.questions[0].id : null;
      /* このプリセットで前にした AI とのやり取りを戻す。
         保存しても閉じても消さない（消えると「何をどう頼んだか」が追えなくなる）。 */
      try { st.chat = ST.loadChat(st.preset.id) || []; } catch (e) { st.chat = []; }
      st.chat.forEach(function (t) { (t.log || []).forEach(function (e) { e.__shown = true; }); });
      chat.turns = st.chat;
      restoreAttachments();
      restoreTimeline();
      history.reset(st.preset, "読み込み");
      revalidate();
      render();
    }

    /* 前回までのやり取りをタイムラインへ戻す。
       ここが無いと、閉じて開き直したときに「何をどう頼んだか」が消える。 */
    function restoreTimeline() {
      actPanel.clear();
      st.chat.forEach(function (t) {
        if (t.role === "user") {
          if (t.text) actPanel.push({ kind: "user-followup", status: "done", at: t.at,
                                      title: "作ってほしいことを受け取りました", short: t.text });
          return;
        }
        (t.log || []).forEach(function (e) { timelineFromLog(e); });
        if (t.error) actPanel.push({ kind: "error", status: "error", at: t.at, title: t.error });
        else if (t.note) actPanel.push({ kind: "info", status: "done", at: t.at, title: t.note });
      });
      actPanel.resetRun();
    }

    /* 会話の保存。打つたびに書くと重いので少し待ってからまとめて書く。 */
    function persistChat(now) {
      clearTimeout(chatTimer);
      if (now) { writeChat(); return; }
      chatTimer = setTimeout(writeChat, 600);
    }
    function writeChat() {
      if (!st.preset || !st.preset.id) return;
      try { ST.saveChat(st.preset.id, st.chat); } catch (e) {}
    }

    /* ── 検証 ──────────────────────────────────────────────────
       repair.js の audit を使う。validate.js の結果を正規化し、
       足りない検査（重複・日本語以外の文字・解説の有無など）を足したもの。
       severity は error / warning / info の 3 つ。 */
    function auditOptions() {
      return {
        sourceOnly: st.sourceOnly && hasAnySource(),
        expectedCount: st.expectedCount || 0,
        choiceCount: (st.globalConstraints && st.globalConstraints.choiceCount) || 0
      };
    }
    function revalidate() {
      st.issues = R.auditPreset(st.preset, auditOptions());
      /* 生成中の追加指示（全体制約）が全問へ効いているかも一緒に見る。 */
      if (st.globalConstraints) {
        var v = R.checkGlobalConstraints(st.preset, st.globalConstraints);
        /* すでに同じ問題・同じコードで出ているものは重ねない */
        var have = {};
        st.issues.forEach(function (i) { have[(i.questionId || "") + "|" + i.code] = true; });
        R.globalIssuesToAudit(v, "追加指示").forEach(function (i) {
          if (!have[(i.questionId || "") + "|" + i.code]) st.issues.push(i);
        });
      }
      /* 選んだまま消えたエラーは選択から外す */
      var alive = {};
      st.issues.forEach(function (i) { alive[i.id] = true; });
      Object.keys(st.repairSel).forEach(function (k) { if (!alive[k]) delete st.repairSel[k]; });
    }
    function hasAnySource() {
      return st.preset.questions.some(function (q) { return (q.sourceReferences || []).length; });
    }
    function issuesFor(qid) {
      return st.issues.filter(function (i) { return i.questionId === qid; });
    }

    /* ── 変更の記録 ─────────────────────────────────────────── */
    function change(label, key) {
      st.dirty = true;
      revalidate();
      history.push(st.preset, label, key);
      scheduleAutosave();
    }
    function scheduleAutosave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        var r = ST.saveDraft("preset", st.preset.id, st.preset, { selectedId: st.selectedId });
        if (!r.ok) { st.saveError = r.message || "一時保存に失敗しました。"; renderTop(); }
      }, AUTOSAVE_MS);
    }

    /* ── 保存 ────────────────────────────────────────────────── */
    function save(andClose) {
      if (st.saving) return;
      revalidate();
      /* 保存できるかどうかの線引きは、これまでと同じ validate.js のまま。
         検証タブが出す新しい指摘（日本語以外の文字・正解の対応など）は、
         直す手がかりとして見せるだけで、保存は止めない。
         止めるようにすると、いままで保存できていたプリセットが
         ある日から保存できなくなる。 */
      var errs = V.errorsOf(V.validatePresetForSave(st.preset, {
        sourceOnly: st.sourceOnly && hasAnySource()
      }));
      if (errs.length) {
        /* 直す場所は「検証」タブ。そこへ連れて行く。 */
        st.tab = "verify";
        if (app.isMobile()) st.pane = "main";
        render();
        app.alert({
          title: "保存できません",
          html: "<p>修正が必要な項目が " + errs.length + " 件あります。</p><ul>"
            + errs.slice(0, 6).map(function (e) { return "<li>" + esc(e.message) + "</li>"; }).join("")
            + "</ul>" + (errs.length > 6 ? "<p>ほか " + (errs.length - 6) + " 件</p>" : ""),
          okLabel: "確認する"
        });
        return;
      }
      st.saving = true; st.saveError = null; renderTop();
      var r = ST.savePreset(st.preset, { baseRevision: st.baseRevision });
      st.saving = false;

      if (!r.ok && r.error === "CONFLICT") {
        renderTop();
        app.confirm({
          title: "別の場所で更新されています",
          body: "このプリセットは別のタブや端末で更新されました（現在 rev." + r.currentRevision
              + " / 編集中 rev." + r.yourRevision + "）。あなたの編集で上書きしますか？",
          okLabel: "上書きする", cancelLabel: "読み込み直す", danger: true
        }).then(function (over) {
          if (over) {
            var r2 = ST.savePreset(st.preset, { baseRevision: r.currentRevision });
            afterSave(r2, andClose);
          } else {
            st.preset = r.current; st.baseRevision = r.current.revision; st.dirty = false;
            history.reset(st.preset, "読み込み直し");
            revalidate(); render();
            app.toast("最新の内容を読み込みました。", "info");
          }
        });
        return;
      }
      afterSave(r, andClose);
    }
    function afterSave(r, andClose) {
      if (!r.ok) {
        st.saveError = r.message || "保存に失敗しました。";
        renderTop();
        app.alert({ title: "保存に失敗しました", body: st.saveError, okLabel: "閉じる" });
        return;
      }
      st.preset = r.preset; st.baseRevision = r.revision;
      st.dirty = false; st.savedAt = new Date(); st.saveError = null;
      D.setDraftState(st.draft, "saved");
      renderTop();
      app.toast("保存しました。", "success");
      if (o.onSaved) { try { o.onSaved(r.preset); } catch (e) {} }
      if (andClose) app.close("saved");
    }

    function beforeClose() {
      if (!st.dirty) return true;
      app.confirm({
        title: "保存していない変更があります",
        body: "保存してから閉じますか？", okLabel: "保存して閉じる", cancelLabel: "破棄して閉じる"
      }).then(function (yes) {
        st.dirty = false;
        if (yes) save(true); else { ST.clearDraft("preset", st.preset.id); app.close("discard"); }
      });
      return false;
    }

    /* ── 問題の操作 ─────────────────────────────────────────── */
    function selected() {
      return st.preset.questions.find(function (q) { return q.id === st.selectedId; }) || null;
    }
    /* 表示する問題番号。決定元はドメイン層 1 か所（並び順ではない）。 */
    function numberOf(q, i) { return D.numberOf(q, i); }
    function numberOfId(qid) {
      var i = st.preset.questions.findIndex(function (q) { return q.id === qid; });
      return i < 0 ? 0 : D.numberOf(st.preset.questions[i], i);
    }

    /* 問題を足すときは、まず形式を選ばせる（§11）。
       いきなり 4 択が出てくると、他の形式があることに気づけない。 */
    function addQuestion(afterId) {
      if (QP) {
        QP.open({ purpose: st.preset && st.preset.purpose }).then(function (picked) {
          if (!picked) return;
          insertQuestion(afterId, QM.empty(picked, { points: 1 }));
        });
        return;
      }
      insertQuestion(afterId, S.emptyQuestion({
        prompt: "", choices: [S.emptyChoice("A", ""), S.emptyChoice("B", ""),
                              S.emptyChoice("C", ""), S.emptyChoice("D", "")]
      }));
    }
    function insertQuestion(afterId, q) {
      /* 手で足すときも採番はドメイン層に任せる（最大番号 + 1。空きは埋めない）。 */
      D.assignAppended(st.preset.questions, [q]);
      var idx = afterId ? st.preset.questions.findIndex(function (x) { return x.id === afterId; }) : -1;
      if (idx >= 0) st.preset.questions.splice(idx + 1, 0, q);
      else st.preset.questions.push(q);
      st.selectedId = q.id;
      change("問題を追加（" + QT.label(q.type) + "）", null);
      st.tab = "questions"; if (app.isMobile()) st.pane = "main";
      render();
      focusFirstInput();
    }
    function duplicateQuestion(id) {
      var i = st.preset.questions.findIndex(function (q) { return q.id === id; });
      if (i < 0) return;
      var copy = JSON.parse(JSON.stringify(st.preset.questions[i]));
      copy.id = S.newId("q");
      (copy.choices || []).forEach(function (c, ci) { c.id = "c" + (ci + 1); });
      copy.createdAt = copy.updatedAt = S.nowIso();
      /* 複製も新しい番号を取る。元の問題と同じ番号にはしない。 */
      D.assignAppended(st.preset.questions, [copy]);
      st.preset.questions.splice(i + 1, 0, copy);
      st.selectedId = copy.id;
      change("問題を複製");
      render();
    }
    function deleteQuestions(ids) {
      var names = ids.length === 1 ? "この問題" : ids.length + " 問";
      app.confirm({ title: "削除しますか", body: names + "を削除します。この操作は元に戻すで取り消せます。",
                    okLabel: "削除", danger: true }).then(function (yes) {
        if (!yes) return;
        st.preset.questions = st.preset.questions.filter(function (q) { return ids.indexOf(q.id) < 0; });
        st.multi = {};
        if (ids.indexOf(st.selectedId) >= 0)
          st.selectedId = st.preset.questions.length ? st.preset.questions[0].id : null;
        change("問題を削除");
        render();
      });
    }
    function moveQuestion(fromId, toId, before) {
      var qs = st.preset.questions;
      var fi = qs.findIndex(function (q) { return q.id === fromId; });
      var ti = qs.findIndex(function (q) { return q.id === toId; });
      if (fi < 0 || ti < 0 || fi === ti) return;
      var item = qs.splice(fi, 1)[0];
      var at = qs.findIndex(function (q) { return q.id === toId; });
      qs.splice(before ? at : at + 1, 0, item);
      change("並び替え");
      render();
    }
    function focusFirstInput() {
      setTimeout(function () {
        var e = app.root.querySelector('.vq2-qcard-b [data-key="prompt"]');
        if (e) e.focus();
      }, 20);
    }

    /* ── 値の更新 ───────────────────────────────────────────── */
    function setQ(qid, key, value, label) {
      var q = st.preset.questions.find(function (x) { return x.id === qid; });
      if (!q) return;
      q[key] = value;
      q.updatedAt = S.nowIso();
      change(label || "編集", key + ":" + qid);
    }

    /* ══════════════════════════════════════════════════════════
       AI（Auto Mode）
       ══════════════════════════════════════════════════════════ */
    /* 一度に作らせる問題数。
       ローカルモデルは 1 回の出力が長くなるほど、後半で前半と似た問題を書き出す。
       20 問を 1 回で作らせたときは 11 問が重複扱いになった（実測）。
       小分けにして「すでに作った問題」を毎回渡すと、重複が減り、
       途中まででも手元に残る（4 分待って全部失う、が起きない）。 */
    var BATCH = 5;

    function runAi(kind) {
      if (st.aiBusy) return;
      var instruction = st.autoInstruction.trim();
      if (!instruction) { app.toast("AI への指示を入力してください。", "warning"); return; }
      if (kind === "revise" && !st.preset.questions.length) {
        app.toast("修正できる問題がありません。", "warning"); return;
      }

      /* ── §45：作りはじめる前に、読み取った条件を見せて直させる ──
         ここで止めるのは「新しく作る」ときだけ。修正は対象がもう手元にあるので、
         条件の読み違えで別のものができあがることはない。
         同じ指示文で一度確かめてあれば、もう止めない（毎回止めると邪魔になる）。 */
      if (kind === "generate" && !conditionInEffect()) {
        var cond = currentCondition(instruction);
        if (COND.shouldConfirm(cond, st.conditionAlways)) { openConditionSheet(cond); return; }
        /* 迷いが無く、「確認を省く」を選んである。黙って始めず、読み取りは必ず残す。 */
        commitCondition(cond);
      }

      st.aiBusy = true; st.aiText = ""; st.aiError = null; st.diff = null;
      st.aiCancelled = false;
      st.rejected = [];
      /* この生成の印。追加指示はこれに紐付ける。前の生成の指示は引き継がない。 */
      st.runId = S.newId("run");
      st.aiJobId = "";
      st.followups = D.newFollowupQueue();
      st.followups.runId = st.runId;
      st.followupText = "";
      D.setDraftState(st.draft, "generating");
      if (activity) activity.start();
      logReset();
      /* 何を条件にして作るのかを、いちばん上に出す（§45）。
         読み取りの注意（warnings / converted）もここで届く（契約 §6）。 */
      if (kind === "generate") logCondition();
      st.tab = "questions";
      /* 実行カードは「AI で作る」→「停止」へ変わる。
         左を描き直さないと、動いているのに止められない。 */
      renderLeft();
      renderCenter();

      if (kind === "revise") { etaStart(1, "直しています"); runRevise(instruction); etaRoundBegin(); return; }
      runGenerate(instruction);
    }

    /* ══════════════════════════════════════════════════════════
       生成条件の確認（§45）

       読み取った条件を出して、その場で直させる。
       「この条件で作る」を押すまで生成を始めない。
       直した内容は planForBatch() / runGenerate() が実際に使う。
       ══════════════════════════════════════════════════════════ */

    /* いま効いている条件。指示文が書き換わっていたら、もう効いていない。 */
    function conditionInEffect() {
      if (!st.condition) return null;
      return st.conditionFor === st.autoInstruction.trim() ? st.condition : null;
    }
    /* 条件をもう一度確かめ直させる（形式の指定を変えたときなど）。 */
    function invalidateCondition() { st.condition = null; st.conditionFor = null; }

    /* いまの指示文と画面の指定から、読み取れる条件を作る。 */
    function currentCondition(instruction) {
      var BP = VQ2.blueprint;
      var text = String(instruction === undefined || instruction === null
        ? st.autoInstruction : instruction).trim();
      var req = null, cand = null;
      try {
        var analysis = BP ? BP.analyzeContent({ text: text, attachments: st.attachDisplay }) : null;
        req = BP ? BP.extractRequirements(text, {
          subject: (st.preset && st.preset.subject) || "",
          count: countFrom(text) || 10,
          style: st.mixStyle || "auto", sourceOnly: st.sourceOnly,
          requestedTypes: st.mixTypes, excludedTypes: st.mixExclude,
          noFourChoice: st.mixFlags.noFourChoice, noWriting: st.mixFlags.noWriting,
          noAiGrading: st.mixFlags.noAiGrading, noImage: st.mixFlags.noImage,
          noAudio: st.mixFlags.noAudio
        }) : null;
        cand = (BP && req) ? BP.candidates(req, analysis, {}) : null;
      } catch (e) { /* 読み取れなくても止めない。条件は「読めなかった」として出す。 */ }
      return COND.build(req, cand, {
        instruction: text,
        sources: st.attachDisplay.map(function (d) { return d.name; }),
        sourceOnly: st.sourceOnly,
        defaultCount: countFrom(text) || 10
      });
    }

    /* 決まった条件を控える。記録へ出すのは logCondition()（logReset のあと）。 */
    function commitCondition(cond) {
      st.condition = COND.clone(cond);
      st.conditionFor = st.autoInstruction.trim();
      /* 画面で決めた「使わない形式」は、形式シートの指定にも戻しておく。
         こうしないと、次に形式シートを開いたときに食い違って見える。 */
      st.mixExclude = st.condition.excludedTypes.slice();
      st.mixFlags = Object.assign({}, st.mixFlags, st.condition.flags);
      paintComposer();
    }

    /* 何を条件にして作るのかを、作業の記録へ出す。
       確認シートを通しても通さなくても **読み取りの注意は必ず出す**（契約 §6）。
       ここは logReset() のあとで呼ぶ（先に呼ぶと消える）。 */
    function logCondition() {
      var c = conditionInEffect();
      if (!c) return;
      /* logAdd は 2 引数（第 3 引数は捨てられる）。
         1 文目が見出し、残りが説明になるので、条件は本文へ続けて書く。 */
      logAdd("step", "この条件で作ります。" + COND.lines(c).join(" ／ "));
      c.warnings.forEach(function (w) { logAdd("warn", w); });
      c.notes.forEach(function (n) { logAdd("note", n); });
      c.dropped.forEach(function (t) {
        logAdd("warn", "「" + COND.nameOf(t) + "」は使わずに作ります。");
      });
    }

    /* 読み取った条件を出して、直させる。押されるまで生成は始めない。 */
    function openConditionSheet(cond) {
      var draft = COND.clone(cond || currentCondition());
      var sheet = U.mount("vq2-preset-cond", {
        title: "生成条件", sheet: true, stack: true, onResize: function () { draw(); },
        /* やめたときは、打った文を入力欄へ戻す。
           送った時点で入力欄は空になっているので、ここで戻さないと消えたように見える。 */
        onClose: function (reason) { if (reason !== "ok") restoreComposer(); }
      });
      draw();
      /* 受け取りは 1 回だけ付ける。sheet.root は描き直しても同じものなので、
         draw() のたびに付けると 1 回の操作が何度も走る。 */
      wire();

      function draw() {
        var blocked = draft.unavailable.length > 0;
        sheet.root.innerHTML =
          '<div class="vq2-top">'
          + U.button({ icon: "close", iconOnly: true, variant: "quiet", action: "x", aria: "閉じる" })
          + '<div class="vq2-top-title">生成条件の確認</div></div>'
          + '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
          + '<div class="vq2-q" style="gap:14px;padding:16px">'
          + COND.html(draft, {})
          + "</div></div></div></div>"
          + '<div class="vq2-pd-foot">'
          + '<label class="vq2-check sm"><input type="checkbox" data-cond="skip"'
          + (st.conditionAlways ? "" : " checked") + ">"
          + "<span>次からは、読み取りに迷いがないとき確認を省く</span></label>"
          + '<div class="vq2-top-sp"></div>'
          + U.button({ label: "やめる", variant: "quiet", action: "x" })
          + U.button({ label: "形式をくわしく選ぶ", icon: "list", action: "mix" })
          + U.button({ label: "この条件で作る", icon: "check", variant: "primary",
                       action: "ok", disabled: blocked })
          + (blocked
              ? '<div class="vq2-hint" style="width:100%;margin-top:6px">'
                + "使えない形式が残っています。代わりを選ぶか、使わずに続けるを押してください。</div>"
              : "")
          + "</div>";
      }

      function edit(p) { draft = COND.patch(draft, p); draw(); }

      function wire() {
        var r = sheet.root;
        U.on(r, "click", '[data-act="x"]', function () { sheet.close("user"); });
        U.on(r, "change", '[data-cond="total"]', function (e2, t) {
          edit({ totalQuestions: t.value });
        });
        U.on(r, "change", '[data-cond="only"]', function (e2, t) {
          edit({ onlyRequested: t.checked });
        });
        U.on(r, "change", '[data-cond="skip"]', function (e2, t) {
          st.conditionAlways = !t.checked;
        });
        U.on(r, "change", "[data-cond-count]", function (e2, t) {
          var m = {};
          m[t.getAttribute("data-cond-count")] = t.value;
          edit({ setCount: m });
        });
        U.on(r, "change", "[data-cond-flag]", function (e2, t) {
          var f = {};
          f[t.getAttribute("data-cond-flag")] = t.checked;
          edit({ flags: f });
        });
        U.on(r, "click", "[data-cond-untype]", function (e2, t) {
          edit({ removeTypes: [t.getAttribute("data-cond-untype")] });
        });
        U.on(r, "click", "[data-cond-unexclude]", function (e2, t) {
          edit({ unexcludeTypes: [t.getAttribute("data-cond-unexclude")] });
        });
        U.on(r, "click", "[data-cond-addtype]", function (e2, t) {
          var add = t.getAttribute("data-cond-addtype");
          var instead = t.getAttribute("data-cond-instead");
          edit(instead ? { addTypes: [add], dropTypes: [instead] } : { addTypes: [add] });
        });
        U.on(r, "click", "[data-cond-drop]", function (e2, t) {
          edit({ dropTypes: [t.getAttribute("data-cond-drop")] });
        });
        /* 形式をくわしく選ぶ。戻ってきたら、その指定で読み直す。 */
        U.on(r, "click", '[data-act="mix"]', function () {
          openMixSheet(function () {
            var next = currentCondition();
            /* 画面で直した問題数は残す（形式を選び直しただけで戻さない）。 */
            draft = COND.patch(next, { totalQuestions: draft.totalQuestions });
            draw();
          });
        });
        U.on(r, "click", '[data-act="ok"]', function () {
          if (draft.unavailable.length) {
            sheet.toast("使えない形式が残っています。", "warning"); return;
          }
          commitCondition(draft);
          sheet.close("ok");
          runAi("generate");
        });
      }
    }

    /* ══════════════════════════════════════════════════════════
       生成中の追加指示（フォローアップ）

       送信済みの 1 本の生成要求へ、途中からメッセージを差し込むことはできない。
       できたふりをしない。実際にやるのは次の順番だけ：

         受け付ける → いまの区切りを待つ → 反映する修正パスを走らせる
         → 番号を振り直す → 構造と重複を検査する → 完了にする
       ══════════════════════════════════════════════════════════ */
    /* 右のアクティビティ欄から送るときの入口。
       入力欄の値は向こうが持っているので、ここでは受け取るだけ。 */
    function sendFollowupText(text) {
      st.followupText = String(text || "");
      var before = (st.followups.items || []).length;
      sendFollowup();
      /* 積めなかった（重複・空）ときは入力欄を空にしない */
      return (st.followups.items || []).length > before;
    }
    function sendFollowup() {
      var text = String(st.followupText || "").trim();
      var r = D.pushFollowup(st.followups, text, { runId: st.runId });
      if (!r.ok) {
        /* 二重送信は「もう受け付けてある」と伝えるだけ。積み増さない。 */
        app.toast(r.message, r.error === "DUPLICATE" ? "info" : "warning");
        if (r.error === "DUPLICATE") { st.followupText = ""; renderAiPane(); }
        return;
      }
      st.followupText = "";
      /* 「選択肢を6個にして」のような全体への指示は、生成済みの問題にも
         効いている必要がある。読み取れたものを覚えておき、検証で全問を見る。 */
      var g = R.globalConstraintsFrom(st.followups.items);
      if (Object.keys(g.constraints).length) {
        st.globalConstraints = g.constraints;
        if (g.constraints.choiceCount) st.expectedChoiceCount = g.constraints.choiceCount;
        logAdd("note", "全体への指示として受け取りました："
          + g.sources.map(function (x) { return x.label; }).join("・")
          + "（生成済みの問題にも効いているか、検証で確かめます）");
      }
      logAdd("note", "追加の指示を受け付けました：" + text.slice(0, 40) + (text.length > 40 ? "…" : ""));
      renderAiPane();
    }
    function pendingFollowups() { return D.pendingFollowups(st.followups, st.runId); }
    function markFollowups(items, state, error) {
      D.setFollowupState(st.followups, items.map(function (it) { return it.id; }), state, error);
      renderAiPane();
    }

    /* 追加指示を、いまできている問題へ実際に反映する。
       ・反映できたら applied、できなかったら failed。途中の見せかけはしない。
       ・処理中に届いた指示も拾うので、最大 3 周まで繰り返す。
       ・失敗しても、ここまでにできた問題は捨てない。 */
    function applyFollowups(list, done) {
      var pass = 0;
      step();
      function step() {
        var items = pendingFollowups();
        if (!items.length || st.aiCancelled) { done(list); return; }
        if (++pass > 3) {
          logAdd("warn", "追加の指示が届き続けたため、ここで区切ります。残りは反映していません。");
          done(list);
          return;
        }
        markFollowups(items, "applying");
        logAdd("step", "追加の指示 " + items.length + " 件を反映しています（" + pass + " 回目）");
        etaRoundBegin("追加の指示を反映しています");
        /* 指示の本文はここでは書かない。追加指示は options.followups で渡し、
           本文へ足すのは Bridge（サーバ側）に任せる。
           こちらで本文へ書き込むと、サーバが「すでに反映済み」と判断しても
           指示は本文に残ってしまい、二重に適用されてしまう。 */
        AI.revisePreset(commonAiOpts({
          instruction: "あとから届いた追加の指示を、いまのプリセットへ反映してください。"
            + "指示に無いところは変えないでください。",
          questionIds: [],
          presetForAi: forAiList(list),
          followups: items,
          followupJobId: st.aiJobId || AI.currentJobId()
        })).then(function (res) {
          etaRoundEnd();
          var data = structuredOf(res);
          if (!data) {
            markFollowups(items, "failed", "AI の結果を読み取れませんでした");
            logAdd("warn", "追加の指示は反映できませんでした。ここまでの問題はそのまま残します。");
            done(list);
            return;
          }
          var proposed = D.draftToQuestions(data);
          /* 追加指示は「いま作ったぶん」だけが対象。それ以外は反映しない。 */
          var screen = D.screenRevision(list, proposed, { allowedIds: list.map(function (q) { return q.id; }) });
          st.rejected = st.rejected.concat(screen.rejected);
          var d = D.diffQuestions(list, screen.accepted, { matchByIndex: true });
          var r = D.applyDiff(list, d, { all: true });
          list = r.questions;
          markFollowups(items, "applied");
          logAdd("done", "追加の指示 " + items.length + " 件を反映しました（" + r.appliedCount + " 件の変更）");
          step();                        /* 反映中に届いた指示があればもう一度 */
        }).catch(function (e) {
          etaRoundEnd();
          if (e && e.cancelled) { D.cancelFollowups(st.followups); done(list); return; }
          markFollowups(items, "failed", (e && e.userMessage) || "反映に失敗しました");
          logAdd("warn", "追加の指示は反映できませんでした。ここまでの問題はそのまま残します。");
          done(list);
        });
      }
    }

    /* 出力が長さの上限で切れたことを表す文言。
       これが出たら「1 回に作らせる量が多すぎる」ので、次は減らして作り直す。 */
    function isTruncation(msg) {
      return /出力上限|上限で途中終了|長さの上限|出力が長さ/.test(String(msg || ""));
    }
    function commonAiOpts(extra) {
      return Object.assign({
        instruction: "",
        attachments: st.attachments,
        sourceOnly: st.sourceOnly,
        onActivity: function (items) {
          items.forEach(function (it) { if (isTruncation(it.label)) st.sawTruncation = true; });
          /* 添付カードは、サーバの解析ジョブの状態だけを見る。
             画面が独自に「解析待ち」を持ち続けると、読み取りが終わっても
             カードだけ止まったままになる（実測でそうなった）。 */
          for (var k = items.length - 1; k >= 0; k--) {
            if (items[k] && items[k].type === "attachment.analysis" && items[k].analysis) {
              applyPageAnalysis(items[k].analysis);
              break;
            }
          }
          /* この生成の Job ID。追加指示をこれに紐付けると、
             同じ指示が二度適用されないことをサーバ側で保証できる。 */
          if (!st.aiJobId) { try { st.aiJobId = AI.currentJobId() || ""; } catch (e) {} }
          logFromActivity(items);
        },
        /* 資料をどれだけ読めたかが届いたら、Bash カードを実データで置き換える。
           「17ページ / 抽出文字数 5535 / evidence 17件」はここから来る。 */
        onMetrics: function (m) {
          actPanel.attachSourceBash(m);
          /* ページごとの読み取り結果をチップへ写す。
             1 ページ落ちても資料は捨てず、次の一手を選べる形で見せる。 */
          if (m && m.attachmentAnalysis) applyPageAnalysis(m.attachmentAnalysis);
        },
        onToken: function (t, all) { st.aiText = all; paintStream(); },
        onWarning: function (m) {
          if (isTruncation(m)) { st.sawTruncation = true; return; }   /* 減らして作り直すので黙って進む */
          logAdd("warn", m);
        }
      }, extra || {});
    }

    /* ── 修正（範囲が決まっているので 1 回で足りる）─────────────
       AI が作った問題か、自分で手を動かして作った問題かでは区別しない。
       自分のプリセットなら、どちらも同じように直せる。 */
    function reviseTargetIds() {
      if (st.reviseScope === "preset") return [];          /* 空＝プリセット全体 */
      var ids = Object.keys(st.multi).filter(function (k) { return st.multi[k]; });
      if (!ids.length && st.selectedId) ids = [st.selectedId];
      return ids;
    }
    function runRevise(instruction) {
      var ids = reviseTargetIds();
      /* 「この問題だけ」を選んでいるのに問題を選んでいないとき。
         そのまま進めると対象が空＝プリセット全体になり、
         ボタンの表示よりずっと大きな範囲を黙って書き換えてしまう。 */
      if (st.reviseScope === "question" && !ids.length) {
        st.aiBusy = false;
        st.runId = "";
        if (activity) activity.stop();
        D.setDraftState(st.draft, "draft");
        render();
        app.toast("直したい問題を一覧から選んでください。プリセット全体を直すときは「プリセット全体」を選びます。", "warning", 6000);
        return;
      }
      logAdd("step", ids.length
        ? ids.map(function (id) { return "問 " + numberOfId(id); }).join("・") + " を直します"
        : "プリセット全体（" + st.preset.questions.length + " 問）を直します");
      AI.revisePreset(commonAiOpts({
        instruction: instruction, questionIds: ids, presetForAi: forAi(ids)
      })).then(function (res) {
        var data = structuredOf(res);
        if (!data) { failAi("AI の結果を問題として読み取れませんでした。指示を変えてもう一度お試しください。"); return; }
        var proposed = D.draftToQuestions(data);
        /* 頼んでいない問題まで書き換えて返してくることがある。ここで落とす。
           落としたものは黙って消さず、理由つきで画面へ出す。 */
        var screen = D.screenRevision(st.preset.questions, proposed, {
          allowedIds: ids, requireKnownTarget: true
        });
        st.rejected = screen.rejected;
        if (!screen.accepted.length) {
          failAi(screen.rejected.length
            ? "AI の修正案は反映できませんでした（" + screen.rejected[0].message + "）。指示を変えてもう一度お試しください。"
            : "AI の結果を問題として読み取れませんでした。指示を変えてもう一度お試しください。");
          return;
        }
        logAdd("done", screen.accepted.length + " 問の修正案ができました"
          + (screen.rejected.length ? "（" + screen.rejected.length + " 件は対象外なので使いません）" : ""));
        /* 修正中に届いた追加指示があれば、先に反映してから差分を出す。 */
        applyFollowups(screen.accepted, function (list) { finishAi(list, "revise"); });
      }).catch(onAiError);
    }

    /* ══════════════════════════════════════════════════════════════
       検証エラーの AI 修復
       ・AI へはエラーに対応する最小範囲だけを渡す。
       ・返ってきたものは repair.js がもう一度ふるいにかけ、
         許したフィールドだけを修正案にする。
       ・修正案は即時に反映しない。必ず画面で見てから適用する。
       ・適用したら自動で再検証する。直らなければ 3 回で止める。
       ══════════════════════════════════════════════════════════════ */
    function pickRepairIssues(mode, qid) {
      var all = R.repairableIssues(st.issues);
      if (mode === "question") return all.filter(function (i) { return i.questionId === qid; });
      if (mode === "selected") return all.filter(function (i) { return st.repairSel[i.id]; });
      return all;
    }

    function startRepair(mode, qid) {
      if (st.repairBusy || st.aiBusy) { app.toast("いま別の処理が動いています。", "warning"); return; }
      var pool = pickRepairIssues(mode, qid);
      if (!pool.length) {
        app.toast(mode === "selected" ? "修復する項目を選んでください。" : "AI で直せるエラーはありません。",
                  "warning");
        return;
      }
      st.repairDone = null;
      st.repairLoop = R.newLoopState();
      st.repairLoop.mode = mode;
      st.repairLoop.qid = qid || null;
      runRepairRound();
    }

    /* 1 周ぶん。まず AI を呼ばずに直せるものを片付け、残りを AI へ回す。 */
    function runRepairRound() {
      var l = st.repairLoop;
      if (!l || !R.loopCanContinue(l)) { finishRepair(); return; }
      var pool = pickRepairIssues(l.mode, l.qid);
      if (!pool.length) { finishRepair(); return; }

      var auto = pool.filter(function (i) { return i.autoRepairable; });
      if (auto.length) { proposeAutoRepair(auto); return; }

      var ai = pool.filter(function (i) {
        return i.aiRepairable && !(R.CODES[i.code] && R.CODES[i.code].backfill) && i.questionId;
      });
      if (!ai.length) {
        /* 残っているのは補充だけ、または手で直すものだけ */
        finishRepair(pool.filter(function (i) { return R.CODES[i.code] && R.CODES[i.code].backfill; }).length
          ? "不足問題は「不足 N 問を AI で補充」から作ってください。" : "");
        return;
      }
      runRepairAi(ai);
    }

    /* AI を呼ばずに直せるもの。何が変わるかを見せてから反映する。 */
    function proposeAutoRepair(issues) {
      var r = R.autoRepair(st.preset, issues);
      if (!r.changed) { runRepairRoundNext(); return; }
      app.dialog({
        title: "AI を使わずに直せます",
        html: '<div class="vq2-hint" style="margin-bottom:8px">'
          + "内容（問題文・選択肢・正解・解説）は 1 文字も変わりません。</div>"
          + "<ul>" + r.changes.slice(0, 20).map(function (c) {
              return "<li>" + esc((c.number ? "問 " + c.number + "：" : "") + c.message) + "</li>";
            }).join("") + "</ul>"
          + (r.changes.length > 20 ? "<p>ほか " + (r.changes.length - 20) + " 件</p>" : ""),
        okLabel: "直す",
        cancelLabel: "やめる",
        onOk: function () {
          /* 対象外の中身が変わっていないことを確かめてから入れ替える */
          var v = R.verifyApplication(st.preset.questions, r.preset.questions,
                                      r.preset.questions.map(function (q) { return q.id; }));
          if (!v.ok) {
            app.alert({ title: "直せませんでした",
                        body: "元の内容をそのまま残しました。" });
            finishRepair("直せませんでした。");
            return;
          }
          st.preset = r.preset;
          change("検証エラーの自動修復");
          runRepairRoundNext();
        },
        onCancel: function () { finishRepair("止めました。データは変えていません。"); }
      });
    }
    /* 1 周ぶんを記録してから次へ */
    function runRepairRoundNext() {
      var before = st.issues;
      revalidate();
      R.loopRecord(st.repairLoop, before, st.issues);
      render();
      if (R.loopCanContinue(st.repairLoop)) runRepairRound();
      else finishRepair();
    }

    function runRepairAi(issues) {
      var req = R.buildRepairRequest(st.preset, issues);
      if (!req.questionIds.length) { finishRepair(); return; }
      st.repairBusy = true;
      st.aiError = null;
      st.rejected = [];
      st.repairCtx = { request: req, issueIds: issues.map(function (i) { return i.id; }) };
      D.setDraftState(st.draft, "generating");
      if (activity) activity.start();
      logAdd("step", "検証エラーを直します（問 "
        + issues.map(function (i) { return i.questionNumber; }).filter(Boolean).join("・") + "）");
      render();

      AI.repairPreset(commonAiOpts({
        instruction: req.instruction,
        questionIds: req.questionIds,
        presetForAi: forAi(req.questionIds)
      })).then(function (res) {
        var data = structuredOf(res);
        if (!data) { failRepair("AI の結果を読み取れませんでした。"); return; }
        var proposed = D.draftToQuestions(data);
        /* 許した範囲だけを残す。対象外・保護フィールド・直っていないものは落とす。 */
        var screen = R.screenRepairProposal(st.preset, req, proposed);
        st.rejected = screen.rejected.map(function (x) {
          return { questionId: x.questionId, reason: x.reason, message: x.message };
        });
        if (!screen.accepted.length) {
          failRepair(screen.rejected.length
            ? "AI の修正案は使えませんでした（" + screen.rejected[0].message + "）。"
            : "AI の修正案がありませんでした。");
          return;
        }
        st.repairBusy = false;
        if (activity) activity.stop();
        chat.end({});
        logAdd("done", screen.accepted.length + " 問の修正案ができました"
          + (screen.rejected.length ? "（" + screen.rejected.length + " 件は範囲外なので使いません）" : ""));
        st.diff = D.diffQuestions(st.preset.questions, screen.acceptedQuestions, {});
        st.diffSelection = {};
        st.diff.changes.forEach(function (c) {
          if (c.kind !== "removeCandidate") st.diffSelection[c.questionId] = true;
        });
        D.setDraftState(st.draft, "reviewing", { totalChanges: st.diff.changes.length });
        if (app.isMobile()) st.pane = "left";
        render();
      }).catch(function (e) {
        if (e && e.cancelled) { failRepair("止めました。データは変えていません。", true); return; }
        failRepair((e && e.userMessage) || "AI の処理に失敗しました。");
      });
    }
    function failRepair(msg, cancelled) {
      st.repairBusy = false;
      if (activity) activity.stop();
      D.setDraftState(st.draft, cancelled ? "draft" : "failed", cancelled ? {} : { error: msg });
      if (!cancelled) { st.aiError = msg; restoreComposer(); logAdd("error", msg); }
      chat.end(cancelled ? {} : { error: msg });
      finishRepair(msg);
    }

    /* 修正案を反映する。対象外が変わっていたら入れ替えない。 */
    function applyRepair(scope) {
      if (!st.diff || !st.repairCtx) return;
      var sel = scope === "selected"
        ? { questionIds: Object.keys(st.diffSelection).filter(function (k) { return st.diffSelection[k]; }) }
        : { all: true };
      if (scope === "selected" && !sel.questionIds.length) {
        app.toast("適用する変更を選んでください。", "warning"); return;
      }
      var r = D.applyDiff(st.preset.questions, st.diff, sel);
      if (!r.identity.ok) {
        app.alert({ title: "反映できませんでした",
                    body: "問題番号または内部 ID が重複したため、元の内容をそのまま残しました。" });
        return;
      }
      /* 最後の確認。修復の対象にしていない問題が変わっていたら入れ替えない。 */
      var v = R.verifyApplication(st.preset.questions, r.questions, st.repairCtx.request.questionIds);
      if (!v.ok) {
        app.alert({ title: "反映できませんでした",
                    html: '<p>修復の対象にしていない問題が変わっていました。'
                      + "元の内容をそのまま残しました。</p><ul>"
                      + v.violations.slice(0, 5).map(function (x) {
                          return "<li>" + esc((x.number ? "問 " + x.number + "：" : "") + x.message) + "</li>";
                        }).join("") + "</ul>" });
        st.diff = null; st.repairCtx = null;
        finishRepair("対象外の変更があったため反映しませんでした。");
        return;
      }
      st.preset = Object.assign({}, st.preset, { questions: r.questions });
      D.setDraftState(st.draft, r.partial ? "partially_applied" : "applied", { appliedCount: r.appliedCount });
      st.diff = null;
      st.repairCtx = null;
      st.rejected = [];
      change("検証エラーの修復を適用");
      app.toast(r.appliedCount + " 件の修正を反映しました。", "success");
      runRepairRoundNext();
    }
    function cancelRepair() {
      /* 何も反映しない。元データはそのまま。 */
      st.diff = null;
      st.repairCtx = null;
      st.rejected = [];
      D.setDraftState(st.draft, "draft");
      finishRepair("止めました。データは変えていません。");
      render();
    }
    function finishRepair(extraMessage) {
      st.repairBusy = false;
      var l = st.repairLoop;
      if (!l) { render(); return; }
      l.stopped = true;
      revalidate();
      var remaining = R.bySeverity(st.issues, "error");
      st.repairDone = {
        ok: remaining.length === 0,
        message: (extraMessage ? extraMessage + " " : "")
          + (remaining.length === 0
              ? "残っているエラーはありません。"
              : R.loopMessage(l) || ("エラーが " + remaining.length + " 件残っています。")),
        guide: remaining.length ? R.manualGuide(remaining) : []
      };
      st.repairLoop = null;
      render();
    }

    /* ── 不足問題の補充 ─────────────────────────────────────── */
    function startBackfill() {
      if (st.repairBusy || st.aiBusy) { app.toast("いま別の処理が動いています。", "warning"); return; }
      var plan = R.shortagePlan(st.preset, { expectedCount: st.expectedCount });
      if (!plan.canBackfill) { app.toast("不足している問題はありません。", "info"); return; }
      if (!plan.gaps.length) { runBackfill(plan, "append"); return; }
      /* 欠番があるときは、表示番号の扱いを選んでもらう */
      app.dialog({
        title: "欠番があります",
        html: '<div class="vq2-hint" style="margin-bottom:8px">'
          + "問 " + plan.gaps.slice(0, 10).join("・") + " が空いています。"
          + "新しく作る問題の番号をどうしますか。</div>"
          + '<div style="display:flex;flex-direction:column;gap:8px" class="vq2-leading">'
          + '<label class="vq2-check"><input type="radio" name="bfmode" value="fill-gaps" checked>'
          + "<span>欠番を埋める（問 " + plan.gaps[0] + " から）</span></label>"
          + '<label class="vq2-check"><input type="radio" name="bfmode" value="append">'
          + "<span>末尾へ追加（問 " + (plan.maxNumber + 1) + " から）</span></label></div>",
        okLabel: "この番号で作る",
        cancelLabel: "やめる",
        onOk: function (root2) {
          var el = root2 && root2.querySelector('input[name="bfmode"]:checked');
          runBackfill(plan, el ? el.value : "fill-gaps");
        }
      });
    }
    function runBackfill(plan, mode) {
      var req = R.buildBackfillRequest(st.preset, plan, {
        numberingMode: mode,
        sourceOnly: st.sourceOnly,
        subject: st.preset.subject || "",
        choiceCount: (st.globalConstraints && st.globalConstraints.choiceCount) || 0
      });
      if (!req.count) { app.toast("補充する問題はありません。", "info"); return; }
      st.repairBusy = true;
      st.backfillMode = mode;
      st.aiError = null;
      st.rejected = [];
      D.setDraftState(st.draft, "generating");
      if (activity) activity.start();
      logAdd("step", "不足している " + req.count + " 問を作ります（既存の問題は変えません）");
      render();

      AI.backfillPreset(commonAiOpts({ instruction: req.instruction })).then(function (res) {
        var data = structuredOf(res);
        if (!data) { failRepair("AI の結果を読み取れませんでした。"); return; }
        var proposed = D.draftToQuestions(data);
        var screen = R.screenBackfill(st.preset, req, proposed);
        st.rejected = screen.rejected.map(function (x) {
          return { questionId: x.questionId || "", reason: x.reason, message: x.message };
        });
        if (!screen.accepted.length) {
          failRepair(screen.rejected.length
            ? "補充できませんでした（" + screen.rejected[0].message + "）。"
            : "補充する問題を作れませんでした。");
          return;
        }
        st.repairBusy = false;
        if (activity) activity.stop();
        chat.end({});
        logAdd("done", screen.accepted.length + " 問の追加案ができました");
        /* 追加も「変更案」として見せてから反映する */
        st.diff = D.diffQuestions(st.preset.questions,
                                  st.preset.questions.concat(screen.accepted), {});
        st.diffSelection = {};
        st.diff.changes.forEach(function (c) {
          if (c.kind === "add") st.diffSelection[c.questionId] = true;
        });
        st.repairCtx = { backfill: true, mode: mode, added: screen.accepted,
                         request: { questionIds: [] } };
        D.setDraftState(st.draft, "reviewing", { totalChanges: st.diff.changes.length });
        if (app.isMobile()) st.pane = "left";
        render();
      }).catch(function (e) {
        if (e && e.cancelled) { failRepair("止めました。データは変えていません。", true); return; }
        failRepair((e && e.userMessage) || "AI の処理に失敗しました。");
      });
    }
    function applyBackfill() {
      var ctx = st.repairCtx;
      if (!ctx || !ctx.backfill) return;
      var picked = ctx.added.filter(function (q) {
        return st.diffSelection[q.id] === undefined ? true : st.diffSelection[q.id];
      });
      if (!picked.length) { app.toast("追加する問題を選んでください。", "warning"); return; }
      var r = R.applyBackfill(st.preset, picked, { numberingMode: ctx.mode });
      /* 既存の問題が 1 つも変わっていないことを確かめる */
      var before = st.preset.questions;
      var kept = r.preset.questions.filter(function (q) {
        return before.some(function (b) { return b.id === q.id; });
      });
      var v = R.verifyApplication(before, kept, []);
      if (!v.ok) {
        app.alert({ title: "追加できませんでした",
                    body: "既存の問題が変わってしまうため、元の内容をそのまま残しました。" });
        st.diff = null; st.repairCtx = null; render();
        return;
      }
      st.preset = r.preset;
      st.diff = null;
      st.repairCtx = null;
      st.rejected = [];
      D.setDraftState(st.draft, "applied", { appliedCount: r.applied.length });
      change("不足問題を補充");
      app.toast(r.applied.length + " 問を追加しました（問 "
        + r.applied.map(function (a) { return a.number; }).join("・") + "）", "success");
      revalidate();
      render();
    }

    /* ── 生成（多いときは小分けにして、できたぶんから積む）───── */
    function runGenerate(instruction) {
      /* 数が書かれていないときの既定。
         数を決めずに投げると、資料が多い人ほど 1 回の出力が膨らんで上限に当たる。 */
      var DEFAULT_WANT = 10;
      var stated = countFrom(instruction);
      /* §45：画面で確かめて（必要なら直して）決めた問題数があれば、そちらが正。
         指示文の「10問」より、人がその場で直した数のほうが新しい。 */
      var cond0 = conditionInEffect();
      var want = COND.wantFor(cond0, stated, DEFAULT_WANT);
      /* 指定された問題数を覚えておく。あとで「不足 N 問」を出すのに使う。
         書かれていなければ判定しない（勝手に数を決めない）。 */
      if (cond0) st.expectedCount = want;
      else if (stated) st.expectedCount = stated;
      var collected = [];
      var round = 0;
      /* 1 回に作らせる数。上限に当たったらここを減らして作り直す。 */
      var size = Math.min(BATCH, want);
      /* 形式の配分は **最初に全体ぶんを 1 回だけ決め**、そこから回ごとに配る。
         毎回 planMix(n) を呼び直すと、どの回も同じ内訳になり、
         モデルはそれを 1 形式へ寄せてしまう（実測: 8 形式頼んで 1 形式しか返らない）。
         回ごとに 1〜2 形式へ絞れば、そのとおりに作る。 */
      st.__planPool = planForBatch(want);
      st.__planTotal = want;
      /* 重複を除くと目標に届かないことがある。足りなければ追い足すが、
         2 回続けて 1 問も増えなければ打ち切る（同じ問題を延々と作らせない）。 */
      var MAX_ROUNDS = Math.ceil(want / Math.max(1, size)) + 5;
      var dry = 0;

      logAdd("step", (stated ? want + " 問" : "問題 " + want + " 問（指定が無いので既定）")
        + "を " + size + " 問ずつに分けて作ります");
      logAdd("note", "できたぶんから下に出ます。途中で止めても、そこまでは残ります。");
      /* 予定している回数。見込み時間はここと「終わった回の実測」から出す。 */
      etaStart(Math.ceil(want / Math.max(1, size)), "問題を作っています");

      /* 先に「何を問うか」を決めてから作る。
         毎回まるごと丸投げすると同じ論点へ戻ってきて、重複ばかりになる。
         論点が決まっていれば、回ごとに別のところを指定でき、
         資料の要点のまとめ直し（毎回 11 秒）も省ける。 */
      var topics = [];
      var topicAt = 0;
      if (want > size) {
        st.aiText = "";
        logAdd("step", "先に、資料から問える論点を洗い出しています");
        if (chat.eta) chat.eta.label = "資料から論点を洗い出しています";
        AI.planTopics(commonAiOpts({ instruction: instruction, count: want }))
          .then(function (res) {
            topics = AI.parseTopics(res.text);
            if (topics.length >= 2) {
              logAdd("done", "論点を " + topics.length + " 個みつけました。これを順に問題にします。");
              next();
              return;
            }
            topics = [];
            /* 資料だけを根拠にする、と言われているときに
               資料なしの作り方へ落とすことはしない。
               落とすと、資料に無いことを書いた問題ができあがる。 */
            if (st.sourceOnly) { stopNoTopics("論点を取り出せませんでした"); return; }
            logAdd("warn", "論点をうまく取り出せませんでした。これまでどおりの作り方で進めます。");
            next();
          })
          .catch(function (e) {
            if (e && e.cancelled) { stopWithWhatWeHave(collected, "止めました"); return; }
            if (st.sourceOnly) {
              stopNoTopics((e && e.message) ? String(e.message).slice(0, 120) : "論点の洗い出しに失敗しました");
              return;
            }
            logAdd("warn", "論点の洗い出しはできませんでした。これまでどおりの作り方で進めます。");
            next();
          });

        /* 資料限定のまま止める。何が起きたかと、次にできることを出す。 */
        function stopNoTopics(why) {
          st.aiBusy = false;
          st.aiError = "資料から出題する論点を取り出せませんでした。"; restoreComposer();
          logAdd("error", "資料から出題する論点を取り出せませんでした。",
                 "「資料だけを根拠にする」が入っているため、資料なしの作り方には切り替えません。"
                 + "（" + why + "）");
          actPanel.push({
            kind: "error", status: "error",
            title: "資料から出題する論点を取り出せませんでした",
            short: "資料だけを根拠にする指定のため、ここで止めました",
            actions: [
              { id: "retry-topics", label: "もう一度やり直す", icon: "refresh", variant: "primary" },
              { id: "attach-add", label: "資料を追加する", icon: "plus" },
              { id: "source-off", label: "資料限定を外して作る", icon: "wand" }
            ]
          });
          paintComposer();
          render();
        }
        return;
      }

      next();

      function next() {
        if (st.aiCancelled) { stopWithWhatWeHave(collected, "止めました"); return; }
        if (collected.length >= want) { doneAll(collected); return; }
        if (round >= MAX_ROUNDS) {
          doneAll(collected, "重複しない問題がこれ以上出てこなかったため、" + collected.length + " 問で止めました。");
          return;
        }
        if (dry >= 2) {
          doneAll(collected, "同じ問題ばかりになったため、" + collected.length + " 問で止めました。"
            + "指示に単元や範囲を足すと、もっと作れます。");
          return;
        }

        var idx = round++;
        var n = Math.min(size, want - collected.length);
        st.aiText = "";
        st.sawTruncation = false;
        /* 生成中に届いた追加指示は、**次の回の指示**へそのまま足す。
           ここで足しておけば、これから作る問題は最初から指示どおりになる。
           すでに作ったぶんへは、基本生成が終わったあとの修正パスで反映する。
           （状態は applied にしない。実際に反映するのはそのパス。） */
        var carry = pendingFollowups();
        if (carry.length) logAdd("note", "追加の指示 " + carry.length + " 件を、ここから作る問題へ反映します");
        /* この回で扱う論点を切り出す。使い切ったら先頭へ戻さず、指定なしで作る。 */
        var mine = topics.slice(topicAt, topicAt + n);
        topicAt += mine.length;
        logAdd("step", (idx + 1) + " 回目：あと " + (want - collected.length) + " 問のうち " + n + " 問を作っています"
          + (mine.length ? "（" + mine[0].slice(0, 20) + (mine.length > 1 ? " ほか" + (mine.length - 1) + "件" : "") + "）" : ""));
        etaRoundBegin("問題を作っています（" + (idx + 1) + " 回目）");

        AI.generatePreset(commonAiOpts({
          /* ここでは本文へ足すだけ。options.followups では渡さない。
             渡すとサーバ側が「反映済み」として数え、最後の修正パスで
             同じ指示が使えなくなる（すでに作ったぶんへ反映できなくなる）。 */
          instruction: batchInstruction(instruction, n, collected, true, mine)
            + (carry.length ? "\n\n" + D.followupInstruction(carry) : ""),
          count: n,
          /* この回で作ってよい形式。**文章で頼むだけでは守られない。**
             サーバ側で JSON Schema の enum をここへ絞るので、
             ほかの形式は文法として書けなくなる（実測: ○×8問の指定が 4択8問になっていた）。 */
          questionTypes: st.__lastPlan
            ? st.__lastPlan.items.map(function (x) { return x.type; }) : null,
          /* 論点を渡した回は、資料の要点をまとめ直さない（着眼点はこちらが供給する） */
          skipDocumentAnalysis: mine.length > 0
        })).then(function (res) {
          etaRoundEnd();
          var data = structuredOf(res);
          if (!data) { onBatchMiss(idx, n, "読み取れませんでした"); return; }
          var got = D.draftToQuestions(data);
          var fresh = dropDuplicates(got, collected);
          if (want - collected.length < fresh.length) fresh = fresh.slice(0, want - collected.length);
          collected = collected.concat(fresh);
          dry = fresh.length ? 0 : dry + 1;
          logAdd(fresh.length ? "done" : "warn", (idx + 1) + " 回目："
            + (fresh.length ? fresh.length + " 問できました" : "新しい問題はできませんでした")
            + (got.length !== fresh.length ? "（重複 " + (got.length - fresh.length) + " 問は除きました）" : "")
            + " ／ 合計 " + collected.length + " / " + want + " 問");
          /* 頼んだ形式と違うものが返ることがある（実測: 正誤 8 問 → 4 択 8 問）。
             **黙って受け取らない。** 何が違ったのかをその場で出す。
             作り直しはしない（作り直しても同じになることがあり、時間だけ増える）。
             違いが分かれば、形式を選び直すか、その回だけ作り直すかを人が決められる。 */
          if (QPL && QPL.compare && st.__lastPlan && fresh.length) {
            var cmp = QPL.compare(st.__lastPlan, fresh);
            if (!cmp.ok) {
              logAdd("warn", (idx + 1) + " 回目：頼んだ形式と違うものが返りました — " + cmp.summary);
              var extra = cmp.rows.filter(function (r) { return r.wanted === 0 && r.got > 0; });
              if (extra.length)
                logAdd("note", "頼んでいない形式が入りました："
                  + extra.map(function (r) { return r.name + " " + r.got + " 問"; }).join("・"));
            }
          }
          next();
        }).catch(function (e) {
          if (e && e.cancelled) { stopWithWhatWeHave(collected, "止めました"); return; }
          onBatchMiss(idx, n, (e && e.userMessage) || "失敗しました", e);
        });
      }

      /* この回が取れなかったとき。
         出力の上限で切れていたなら「1 回に作らせる量が多すぎる」ということなので、
         数を半分にして続ける。資料をたくさん入れた人ほどここに来る。 */
      function onBatchMiss(idx, n, why, err) {
        if (st.sawTruncation && size > 1) {
          size = Math.max(1, Math.floor(size / 2));
          logAdd("note", "一度に作れる量を超えたので、ここからは " + size + " 問ずつに減らして続けます。");
          round = Math.max(0, round - 1);       /* この回はやり直しなので回数に数えない */
          MAX_ROUNDS += 2;
          /* 分け方が変わったので、予定回数も直す（古い見込みを出したままにしない） */
          if (chat.eta) chat.etaTotal(chat.eta.done + Math.ceil((want - collected.length) / size));
          next();
          return;
        }
        if (collected.length) {
          logAdd("warn", (idx + 1) + " 回目は" + why + "。ここまでを残します。");
          doneAll(collected, "途中で" + why + "。ここまでの " + collected.length + " 問を残しました。");
          return;
        }
        /* 1 問も取れなかったときは、起きたことをそのまま伝える。
           「読み取れませんでした」で一括りにすると、実際は別の理由でも直しようがない。 */
        failAi(st.sawTruncation
          ? "資料が多く、1 問ずつでも出力が収まりませんでした。資料を減らすか、範囲を絞って指示してください。"
          : (err && err.userMessage) ? err.userMessage
          : "AI の結果を問題として読み取れませんでした。指示を変えてもう一度お試しください。");
      }

      function doneAll(list, note) {
        if (!list.length) { failAi("AI の結果を問題として読み取れませんでした。指示を変えてもう一度お試しください。"); return; }
        logAdd("done", "合計 " + list.length + " 問できました"
          + (list.length < want ? "（頼んだのは " + want + " 問）" : ""));
        /* §46：頼まれた数に届かなかったことを、数だけ出して終わりにしない。
           できない理由と、次にできることを必ず出す。 */
        if (list.length < want) {
          var c2 = conditionInEffect();
          var sf = COND.shortfall({
            want: want, made: list.length,
            typeName: (c2 && c2.requestedTypes.length === 1) ? COND.nameOf(c2.requestedTypes[0]) : "",
            sources: st.attachDisplay.map(function (d) { return d.name; }),
            sourceOnly: st.sourceOnly
          });
          logAdd("warn", sf.title + sf.body);
          actPanel.push({ kind: "warning", status: "warn",
                          title: sf.title, short: sf.body, actions: sf.actions });
        }
        if (note) st.aiNote = note;
        /* 完了にする前に、必ず未反映の追加指示を確かめる。
           送信と完了がほぼ同時でも、ここで拾うので取りこぼさない。 */
        applyFollowups(list, function (finalList) {
          logAdd("done", "内容を確認してください。");
          finishAi(finalList, "generate");
        });
      }
      function stopWithWhatWeHave(list, why) {
        /* 止めたら追加指示も取り消す。次の生成で古い指示を拾い直さないため。 */
        var cancelled = D.cancelFollowups(st.followups);
        if (cancelled.length) logAdd("note", "反映前の追加指示 " + cancelled.length + " 件は取り消しました。");
        logAdd("note", why + (list.length ? "（ここまで " + list.length + " 問）" : ""));
        if (list.length) { finishAi(list, "generate"); return; }
        st.aiBusy = false;
        chat.end({});
        persistChat(true);
        if (activity) activity.stop();
        D.setDraftState(st.draft, "draft");
        render();
      }
    }

    /* 2 回目以降は「すでに作った問題」を渡して、同じ問題を書かせない */
    function batchInstruction(base, n, done, split, topics) {
      if (!split) return base;
      var lines = [stripCount(base)];
      lines.push("");
      lines.push("この回では " + n + " 問だけ作ってください。");
      if (topics && topics.length) {
        lines.push("");
        lines.push("**次の論点について 1 つずつ問題を作ってください。**");
        topics.forEach(function (t, i) { lines.push((i + 1) + ". " + t); });
        lines.push("この論点以外のことは、この回では出題しないでください。");
      }
      /* この回の形式の内訳。全体の配分から **この回のぶんだけ**取り出す。
         残りは次の回へ回す。こうすると 1 回に頼む形式が 1〜2 種類になり、
         モデルが守れる大きさになる。 */
      var plan = null;
      if (QPL && QPL.take && st.__planPool) {
        var got = QPL.take(st.__planPool, n);
        plan = got.plan;
        st.__planPool = got.rest;
      }
      /* 配分を持っていない（全体の計画を作れなかった）ときは、これまでどおり。 */
      if (!plan) plan = planForBatch(n);
      /* あとで「頼んだとおりに来たか」を見るために控えておく。 */
      st.__lastPlan = plan;
      if (plan) {
        lines.push("");
        lines.push(QPL.promptFor(plan, { sourceOnly: st.sourceOnly }));
      }
      if (done.length) {
        lines.push("");
        lines.push("すでに次の問題を作ってあります。**同じ内容・同じ論点の問題は作らないでください**。");
        done.slice(-30).forEach(function (q, i) {
          lines.push((i + 1) + ". " + String(q.prompt || "").slice(0, 60));
        });
      }
      return lines.join("\n");
    }

    /* 回ごとに資料の一部（ページ窓）だけを見せる案は測って取り消した。
       同条件で 20/20 問（867 秒）が 13/20 問（769 秒）へ落ちた。
       狭い範囲に閉じ込めると、そこで作れる問題を出し尽くして空振りが増える。
       資料全体を見せたまま「すでに作った問題」を渡すほうが結果が良い。 */

    /* この回で頼む形式の内訳。教材から分かることに合わせて決める。 */
    function planForBatch(n) {
      if (!QPL) return null;
      try {
        var BP = VQ2.blueprint;
        /* 何を頼まれたのか・教材に何があるのかを先に決める（§11 / §12）。
           ここを飛ばすと、形式の指定も教材の中身も効かないまま丸投げになる。 */
        var analysis = BP ? BP.analyzeContent({ text: st.autoInstruction, attachments: st.attachDisplay }) : null;
        var req = BP ? BP.extractRequirements(st.autoInstruction, {
          subject: (st.preset && st.preset.subject) || "",
          count: n, style: st.mixStyle || "auto", sourceOnly: st.sourceOnly,
          requestedTypes: st.mixTypes, excludedTypes: st.mixExclude,
          noFourChoice: st.mixFlags.noFourChoice, noWriting: st.mixFlags.noWriting,
          noAiGrading: st.mixFlags.noAiGrading, noImage: st.mixFlags.noImage,
          noAudio: st.mixFlags.noAudio
        }) : null;
        /* §45：画面で確かめて直した条件があれば、それが正。
           指示文をもう一度読み直しても、人が直した内容のほうが新しい。
           ここを通さないと、画面で外した形式が読み取りで復活する。 */
        var cond1 = conditionInEffect();
        if (req && cond1) COND.applyToReq(req, cond1);
        var cand = (BP && req) ? BP.candidates(req, analysis, {}) : null;
        /* まとめて外す指定（4 択なし・記述なし…）を、形式ごとの除外へ落とす。 */
        var exclude = (cond1 ? cond1.excludedTypes : st.mixExclude).slice();
        if (cand) cand.excluded.forEach(function (e) { if (exclude.indexOf(e.type) < 0) exclude.push(e.type); });
        /* 指示文で「使わないで」と書かれた形式（blueprint が読み取ったもの）。
           ここを入れないと、外してと言われた形式が配分に残る。 */
        if (req && req.excludedTypes) req.excludedTypes.forEach(function (t) {
          if (exclude.indexOf(t) < 0) exclude.push(t);
        });

        /* 「〜だけ」と言われている（＝画面にも「◯◯のみ」と出している）なら、
           その形式だけで割る。出した条件と、作るものを食い違わせない。 */
        var planTypes = COND.planTypes(cond1, st.mixTypes);
        var plan = QPL.planMix({
          count: n,
          style: planTypes.length ? "manual" : (st.mixStyle || "auto"),
          types: planTypes,
          /* 文章で頼まれた形式（「リスニングを入れて」「並び替えも」）。
             ここを渡さないと、読み取れていても自動の配分のままになり、
             **頼んだ形式が黙って出ない**（§14）。 */
          requestedTypes: req ? req.requestedTypes : [],
          subject: (st.preset && st.preset.subject) || "",
          hints: BP ? BP.toHints(analysis) : QPL.hintsFromAttachments(st.attachDisplay, st.autoInstruction),
          exclude: exclude, sourceOnly: st.sourceOnly, requirements: req
        });
        st.mixPlan = plan;
        st.mixCandidates = cand;
        /* 何を作るつもりかを、作り始める前に出す（§28）。
           同じ内訳が続く回では繰り返さない（ログを埋めない）。 */
        if (plan && plan.items.length && plan.summary !== st.__mixShown) {
          st.__mixShown = plan.summary;
          logAdd("step", "この回で作る内訳：" + plan.summary,
                 plan.distribution
                   ? plan.distribution.typeCount + " 形式／選んで答える問題 "
                     + Math.round(plan.distribution.choiceRatio * 100) + "%"
                   : "");
          (plan.notes || []).forEach(function (nt) { logAdd("note", nt); });
        }
        /* 指定した形式が使えなかったことを、黙って済ませない（§14）。 */
        if (cand && cand.unavailableRequested.length) {
          cand.unavailableRequested.forEach(function (u) {
            logAdd("warn", "「" + u.name + "」は" + u.reason,
              u.alternatives.length
                ? "代わりに使えます：" + u.alternatives.map(function (a) { return a.name; }).join("・")
                : "");
          });
        }
        return plan;
      } catch (e) { return null; }
    }

    function stripCount(text) { return D.stripCount(text); }
    /* 問題文がほぼ同じものを落とす（正規化して比較する） */
    function dropDuplicates(list, done) {
      var seen = {};
      done.forEach(function (q) { seen[normPrompt(q.prompt)] = true; });
      return list.filter(function (q) {
        var k = normPrompt(q.prompt);
        if (!k || seen[k]) return false;
        seen[k] = true;
        return true;
      });
    }
    function normPrompt(s) {
      return String(s || "").replace(/\s+/g, "").replace(/[。、．，？?！!「」（）()]/g, "").toLowerCase();
    }

    function structuredOf(res) {
      var data = res.structured && res.structured.questions ? res.structured
               : (res.structured && res.structured.data ? res.structured.data : null);
      return data && Array.isArray(data.questions) ? data : null;
    }
    function finishAi(proposed, kind) {
      /* 完了にする直前の最後の確認。ここまでに届いた追加指示が
         1 件でも残っていたら、まだ終わらせない。 */
      if (!st.aiCancelled && pendingFollowups().length) {
        applyFollowups(proposed, function (list) { finishAi(list, kind); });
        return;
      }
      st.aiBusy = false;
      st.runId = "";
      chat.end({ note: st.aiNote || null });
      if (activity) activity.stop();
      persistChat(true);
      var current = kind === "revise" ? st.preset.questions : [];
      st.diff = D.diffQuestions(current, proposed, { matchByIndex: kind === "revise" });
      st.diffSelection = {};
      st.diff.changes.forEach(function (c) {
        if (c.kind !== "removeCandidate") st.diffSelection[c.questionId] = true;
      });
      D.setDraftState(st.draft, "reviewing", { totalChanges: st.diff.changes.length });
      /* できたものは「差分」に出る。見えない場所に置いたままにしない。
         修復から出した案は「修復」タブで元と見比べる。 */
      st.tab = st.repairCtx ? "repair" : "diff";
      if (app.isMobile()) st.pane = "main";
      render();
      scrollChatToEnd();      /* 描き直すと先頭へ戻るので、結果が見える位置へ送る */
    }
    function failAi(msg) {
      st.aiBusy = false;
      st.runId = "";
      /* 失敗したら、まだ反映していない追加指示は取り消す。
         次の生成で古い指示を勝手に拾い直さないため。 */
      D.cancelFollowups(st.followups);
      if (activity) activity.stop();
      st.aiError = msg; restoreComposer();
      logAdd("error", msg);
      chat.end({ error: msg });
      persistChat(true);
      D.setDraftState(st.draft, "failed", { error: msg });
      render();
      scrollChatToEnd();
    }
    function onAiError(e) {
      st.aiBusy = false;
      st.runId = "";
      D.cancelFollowups(st.followups);
      if (activity) activity.stop();
      if (e && e.cancelled) {
        st.aiError = null; logAdd("note", "止めました"); chat.end({});
        persistChat(true);
        D.setDraftState(st.draft, "draft"); render(); return;
      }
      st.aiError = (e && e.userMessage) || "AI の処理に失敗しました。"; restoreComposer();
      /* 資料が使えなかったときは、理由に合わせた文面と「次にできること」を出す。
         どれも「読み取れませんでした」で片付けない。 */
      var diag = e && e.sourceDiagnosis;
      /* 資料が足りずに止まったときこそ、ページごとの結果が要る。
         「どこが読めなかったのか」が分からないと、次に何をすればいいか決められない。 */
      if (diag && diag.images && diag.images.jobs) applyPageAnalysis(diag.images.jobs);
      if (diag && diag.code) sourceFailureCard(diag, st.aiError);
      else logAdd("error", st.aiError);
      chat.end({ error: st.aiError });
      persistChat(true);
      D.setDraftState(st.draft, "failed", { error: st.aiError });
      render();
    }

    /* 資料が使えなかったときのカード。理由・内訳・次の 4 手をまとめて出す。 */
    function sourceFailureCard(diag, message) {
      var det = [{ k: "reason", v: diag.code }];
      if (diag.reasons && diag.reasons.length) det.push({ k: "gate", v: diag.reasons.join(",") });
      det.push({ k: "attachments", v: String(diag.attachmentCount) });
      det.push({ k: "evidence", v: String(diag.evidenceCount) + " 件 / "
        + String(diag.contentCharacters) + " 字" });
      (((diag.images || {}).perImage) || []).forEach(function (p) {
        det.push({ k: p.name, v: p.state + (p.characterCount ? "（" + p.characterCount + "字）" : "") });
      });
      actPanel.push({
        kind: "error", status: "error",
        title: SOURCE_TITLE[diag.code] || "資料を使えませんでした",
        short: message,
        details: det,
        actions: sourceFailureActions(diag)
      });
    }
    var SOURCE_TITLE = {
      attachment_missing: "資料が添付されていません",
      attachment_upload_failed: "資料を受け取れませんでした",
      unsupported_file_type: "この形式の資料には対応していません",
      image_analysis_unavailable: "この端末の AI では画像を読み取れません",
      extraction_failed: "資料の読み取りに失敗しました",
      no_relevant_evidence: "出題に使える内容を確認できませんでした",
      evidence_gate_rejected: "出題に使える内容が足りませんでした"
    };
    function sourceFailureActions(diag) {
      var acts = [];
      /* もう一度解析する（読み取りに失敗したものがあるときだけ意味がある） */
      var retryable = (((diag.images || {}).perImage) || [])
        .filter(function (p) { return p.state !== "image_analyzed"; }).length
        || diag.code === "extraction_failed";
      if (retryable && st.attachDisplay.length)
        acts.push({ id: "attach-retry-all", label: "もう一度解析する", icon: "refresh", variant: "primary" });
      acts.push({ id: "attach-add", label: "別の資料を追加する", icon: "plus" });
      acts.push({ id: "source-none", label: "資料を使わず作成する", icon: "sparkle" });
      return acts;
    }

    /* 資料を使わずに作り直す。資料限定が入っているときは必ず確認する
       （「資料だけ」と指定した人の意図を、黙って裏切らない）。 */
    function generateWithoutSources() {
      if (!st.autoInstruction.trim()) {
        app.toast("何を作るかを、下の欄に書いてください。", "warning"); return;
      }
      if (!st.sourceOnly) { st.sourceOnly = false; runAi("generate"); return; }
      app.confirm({
        title: "資料を使わずに作りますか",
        body: "いまは「資料だけを根拠にする」が入っています。"
          + "外すと、AI が資料に無いことも書きます。作った問題は資料と一致しないことがあります。",
        okLabel: "資料を使わずに作る", cancelLabel: "やめる"
      }).then(function (yes) {
        if (!yes) return;
        st.sourceOnly = false;
        paintComposer();
        actPanel.push({ kind: "warning", status: "warn", title: "資料限定を外しました",
                        short: "この先は資料に無いことも含まれます。" });
        runAi("generate");
      });
    }
    /* 数の読み取りはドメイン層（全角も読む）に任せる */
    function countFrom(text) { return D.parseCount(text); }
    /* AI へ渡す形。内部フィールドや巨大な media は落とす。
       id は必ず渡す。AI がそれを返してくれば「どの問題への提案か」が確定する。 */
    function forAi(ids) {
      var pick = ids && ids.length
        ? st.preset.questions.filter(function (q) { return ids.indexOf(q.id) >= 0; })
        : st.preset.questions;
      return forAiList(pick);
    }
    function forAiList(list) {
      return {
        title: st.preset.name,
        questions: (list || []).slice(0, 60).map(function (q, i) {
          return {
            id: q.id, number: D.numberOf(q, i), type: q.type, question: q.prompt,
            choices: (q.choices || []).map(function (c) { return { id: c.id, text: c.text, explanation: c.explanation }; }),
            correctAnswer: (q.choices || []).filter(function (c) { return c.isCorrect; }).map(function (c) { return c.id; })[0]
              || q.correctAnswer || "",
            explanation: q.explanation, difficulty: q.difficulty, topic: q.topic
          };
        })
      };
    }

    function applyAi(scope) {
      if (!st.diff) return;
      var sel;
      if (scope === "all") sel = { all: true };
      else if (scope === "selected") {
        sel = { questionIds: Object.keys(st.diffSelection).filter(function (k) { return st.diffSelection[k]; }) };
        if (!sel.questionIds.length) { app.toast("適用する変更を選んでください。", "warning"); return; }
      } else sel = scope;

      var r = D.applyDiff(st.preset.questions, st.diff, sel);
      /* 反映した結果に番号や内部 ID の重複が残っていたら、書き換えない。
         中途半端な状態を残さない（元のデータをそのまま保つ）。 */
      if (!r.identity.ok) {
        app.alert({ title: "反映できませんでした",
                    body: "問題番号または内部 ID が重複したため、元の内容をそのまま残しました。"
                        + "もう一度お試しください。" });
        return;
      }
      st.preset.questions = r.questions;
      D.setDraftState(st.draft, r.partial ? "partially_applied" : "applied", { appliedCount: r.appliedCount });
      st.diff = null;
      st.rejected = [];
      if (!st.selectedId && st.preset.questions.length) st.selectedId = st.preset.questions[0].id;
      change("AI の変更を適用");
      /* 反映したら「問題」へ戻る。空になった差分タブを見せ続けない。 */
      st.tab = "questions";
      render();
      var added = r.applied.filter(function (a2) { return a2.kind === "add"; });
      app.toast(r.appliedCount + " 件の変更を反映しました。"
        + (added.length ? "（問 " + added[0].number
            + (added.length > 1 ? "〜" + added[added.length - 1].number : "") + "）" : ""), "success");
    }

    /* ══════════════════════════════════════════════════════════
       描画
       ══════════════════════════════════════════════════════════ */
    /* 画面を描き直しても、見ていた場所へ戻す。
       Enter で作りはじめた瞬間に先頭へ飛ぶと、どこを見ていたか分からなくなる。
       ここで覚えるのは「入れ物のスクロール量」だけ（中身は作り直してよい）。 */
    var scrollMemo = null;
    /* 作業の記録（右側）は、進み具合を追って自分で末尾へ動く。
       ここで古い位置へ戻すと取り合いになるので入れない。
       関数にしてあるのは、load() が変数の初期化より先に render() を呼ぶため。 */
    function scrollers() { return ["#wsMainScroll", ".vq2-ws-side .vq2-pane-b"]; }
    function rememberScroll() {
      if (!scrollMemo) scrollMemo = Object.create(null);
      scrollers().forEach(function (sel) {
        var el = app.root.querySelector(sel);
        if (el && el.scrollTop > 0) scrollMemo[sel] = el.scrollTop;
      });
    }
    function restoreScroll() {
      if (!scrollMemo) return;
      scrollers().forEach(function (sel) {
        var y = scrollMemo[sel];
        if (!y) return;
        var el = app.root.querySelector(sel);
        if (!el) return;
        el.scrollTop = y;
        /* 中身の高さが決まるのを 1 フレーム待ってからもう一度合わせる。
           画像や折り返しで高さが変わると、1 回だけでは戻りきらない。 */
        if (root.requestAnimationFrame) root.requestAnimationFrame(function () {
          var e2 = app.root.querySelector(sel);
          if (e2 && Math.abs(e2.scrollTop - y) > 2) e2.scrollTop = y;
        });
      });
    }

    function render() {
      rememberScroll();
      var mobile = app.isMobile();
      app.root.innerHTML =
        topHtml() +
        '<div class="vq2-body">'
        + WS.layout({
            isMobile: mobile,
            mobile: st.pane,
            tabs: centerTabsHtml(),
            main: centerHtml(),
            side: '<div id="paneR" class="vq2-actwrap"></div>'
          })
        + "</div>"
        + (mobile ? WS.mobileBar(st.pane, { items: mobileBarItems() }) : "");
      mountActivity();
      wire();
      restoreScroll();
      /* 形式ごとの編集フォームとプレビューは、箱を置いただけでは空のまま。
         全画面を描き直したときも必ず中身を入れる（ここを忘れると
         形式を選んでも編集する場所が出てこない）。 */
      mountTypeEditor();
    }
    /* 狭い画面の下タブ。未処理があるところに点を出す。 */
    function mobileBarItems() {
      var errs = V.errorsOf(st.issues).length;
      return [
        { id: "main", label: "問題", icon: "doc",
          dot: !!(errs || (st.diff && st.diff.changes.length)) },
        { id: "side", label: "AI", icon: "sparkle", dot: st.aiBusy }
      ];
    }
    function mountActivity() {
      var host = app.root.querySelector("#paneR");
      if (host) actPanel.mount(host);
      paintActivityHead();
    }
    function paintActivityHead() {
      paintComposer();
      actPanel.setBusy(!!(st.aiBusy || st.repairBusy),
        st.repairBusy ? "直しています" : st.aiBusy ? "作っています" : "");
      actPanel.setFollowups(((st.followups && st.followups.items) || []).map(function (it) {
        return { text: it.text, state: it.status };
      }));
      chat.paintEta();
    }
    function renderTop() {
      var t = app.root.querySelector(".vq2-top");
      if (t) t.outerHTML = topHtml();
    }
    /* 右ペインは JS 側が状態を持つので、描き直すのは見出しと追加指示だけでよい。 */
    function renderAiPane() { paintActivityHead(); }
    /* 左ペインは廃止した。AI の操作は右のコンポーザーが唯一の入口。
       呼び出しが残っていても壊れないよう、右の状態だけ塗り直す。 */
    function renderLeft() { paintComposer(); }
    /* 中央だけを描き直す */
    function renderCenter() {
      var p = app.root.querySelector("#wsMainScroll");
      /* 中身を入れ替えても、見ていた場所は動かさない。 */
      var y = p ? p.scrollTop : 0;
      if (p) { p.innerHTML = centerHtml(); }
      var t = app.root.querySelector(".vq2-ws-tabs");
      if (t) t.innerHTML = centerTabsHtml();
      mountTypeEditor();
      if (p && y > 0) {
        p.scrollTop = y;
        if (root.requestAnimationFrame) root.requestAnimationFrame(function () {
          if (Math.abs(p.scrollTop - y) > 2) p.scrollTop = y;
        });
      }
    }

    /* 形式ごとの編集フォームとプレビューを差し込む。
       中身は qtype-editor.js が持つ。ここでは場所を用意するだけ。 */
    var qtBinding = null;
    function mountTypeEditor() {
      var q = selected();
      var box = app.root.querySelector("[data-qtedit]");
      if (box && q && QE) {
        QE.ensure(q);
        box.innerHTML = QE.html(q);
        qtBinding = QE.bind(box, q, {
          app: app,
          /* 読み上げの声を、この問題で選んでいないときの拠りどころ。 */
          preset: st.preset,
          onChange: function (qq, why) { change(why || "問題を編集"); paintPreview(); },
          onRepaint: function () { renderEditor(); renderList(); }
        });
      }
      paintPreview();
    }
    function paintPreview() {
      var q = selected();
      var pv = app.root.querySelector("[data-qtpreview]");
      if (!pv || !q || !QR) return;
      try {
        var view = QM ? QM.normalize(q) : q;
        pv.innerHTML = QR.promptHtml(view, { readonly: true })
          + QR.html(view, null, { readonly: true });
      } catch (e) {
        pv.innerHTML = '<div class="vq2-muted">この内容ではまだ表示できません。足りないところを埋めてください。</div>';
      }
    }
    /* 検証タブだけを描き直す（チェックのたびに全体を描くと重い） */
    function renderVerifyPane() { renderCenter(); }
    /* 一覧の見出しだけを塗り直す。
       ここで中央ごと作り直すと、選択肢を 1 文字打つたびに入力欄が作り替えられ、
       カーソルが飛び、続きが打てなくなる（実測でそうなっていた）。 */
    /* 触ったカードが画面の同じ場所に留まるようにする。
       開いたり閉じたりすると上にある中身の高さが変わるので、
       スクロール量をそのまま戻すだけでは、押したカードが動いて見える。 */
    function withAnchor(qid, fn) {
      var p = app.root.querySelector("#wsMainScroll");
      var card = (p && qid) ? p.querySelector('.vq2-qcard[data-qid="' + cssEscape(qid) + '"]') : null;
      var before = card ? (card.getBoundingClientRect().top - p.getBoundingClientRect().top) : null;
      fn();
      if (before === null) return;
      function settle() {
        var p2 = app.root.querySelector("#wsMainScroll");
        var c2 = p2 ? p2.querySelector('.vq2-qcard[data-qid="' + cssEscape(qid) + '"]') : null;
        if (!p2 || !c2) return;
        var after = c2.getBoundingClientRect().top - p2.getBoundingClientRect().top;
        var diff = after - before;
        if (Math.abs(diff) > 1) p2.scrollTop += diff;
      }
      settle();
      if (root.requestAnimationFrame) root.requestAnimationFrame(settle);
    }

    function renderList() {
      var p = app.root.querySelector("#wsMainScroll");
      if (!p) return;
      if (st.tab !== "questions") { p.innerHTML = centerHtml(); return; }
      var cards = p.querySelectorAll(".vq2-qcard[data-qid]");
      if (!cards.length) { p.innerHTML = centerHtml(); return; }
      st.preset.questions.forEach(function (q, i) {
        var card = p.querySelector('.vq2-qcard[data-qid="' + cssEscape(q.id) + '"]');
        if (!card) return;
        var head = card.querySelector(".vq2-qcard-h");
        if (head) head.outerHTML = cardHeadHtml(q, i);
        card.classList.toggle("is-err",
          issuesFor(q.id).some(function (x) { return x.severity === "error"; }));
      });
      var t = app.root.querySelector(".vq2-ws-tabs");
      if (t) t.innerHTML = centerTabsHtml();
    }
    function renderEditor() { renderCenter(); }

    /* ── 上部 ───────────────────────────────────────────────── */
    function topHtml() {
      var state = st.saving ? "保存中…"
        : st.saveError ? "保存に失敗"
        : st.dirty ? "未保存の変更あり"
        : st.savedAt ? "保存済み " + formatTime(st.savedAt) : "変更なし";
      var stateKind = st.saveError ? "error" : st.dirty ? "warning" : "success";
      var errs = V.errorsOf(st.issues).length;
      return '<div class="vq2-top">'
        + btn({ icon: "chevronL", iconOnly: true, variant: "quiet", action: "close", aria: "閉じる" })
        + '<div style="min-width:0;flex:0 1 auto">'
        + '<div class="vq2-top-title">' + esc(st.preset ? st.preset.name : "") + "</div>"
        + '<div class="vq2-top-sub">' + esc(state) + "</div></div>"
        + (errs ? U.statusChip("error", errs + " 件の要修正") : "")
        + '<div class="vq2-top-sp"></div>'
        + '<div class="vq2-top-actions">'
        /* 画面が狭いときは副次的な操作を「…」へまとめる。上部バーを横あふれさせない。 */
        + btn({ icon: "undo", iconOnly: true, variant: "quiet", action: "undo", hideOnMobile: true,
                disabled: !history.canUndo(), aria: "元に戻す", title: history.undoLabel() ? "元に戻す：" + history.undoLabel() : "元に戻す" })
        + btn({ icon: "redo", iconOnly: true, variant: "quiet", action: "redo", hideOnMobile: true,
                disabled: !history.canRedo(), aria: "やり直す", title: history.redoLabel() ? "やり直す：" + history.redoLabel() : "やり直す" })
        + btn({ icon: "eye", iconOnly: true, variant: "quiet", action: "preview", hideOnMobile: true, aria: "プレビュー", title: "プレビュー" })
        + btn({ icon: "settings", iconOnly: true, variant: "quiet", action: "settings", hideOnMobile: true, aria: "設定", title: "プリセットの設定" })
        + btn({ icon: "drag", iconOnly: true, variant: "quiet", action: "more", onlyMobile: true, aria: "その他の操作", title: "その他" })
        + btn({ label: "保存", icon: "save", variant: "primary", action: "save", disabled: st.saving })
        + "</div></div>";
    }

    /* ══════════════════════════════════════════════════════════
       左ペイン：何を作ってほしいか


    /* ══════════════════════════════════════════════════════════
       中央ペイン：できたものを見る
       ══════════════════════════════════════════════════════════ */
    function centerTabsHtml() {
      var errs = V.errorsOf(st.issues).length;
      var warns = R.bySeverity(st.issues, "warning").length;
      var diffN = st.diff ? st.diff.changes.length : 0;
      var repairN = (st.repairLoop || st.repairDone) ? 1 : 0;
      return WS.segmentedTabs([
        { id: "questions", label: "問題", icon: "doc", count: st.preset.questions.length },
        { id: "verify", label: "検証", icon: "shield", count: errs || warns,
          tone: errs ? "danger" : warns ? "warning" : "" },
        { id: "repair", label: "修復", icon: "wrench", count: repairN ? "" : 0 },
        { id: "diff", label: "差分", icon: "layers", count: diffN, tone: diffN ? "accent" : "" }
      ], st.tab, { action: "ws-tab", aria: "中身の表示切り替え" });
    }

    function centerHtml() {
      if (st.tab === "verify") return verifyPanelHtml();
      if (st.tab === "repair") return repairTabHtml();
      if (st.tab === "diff") return diffTabHtml();
      return questionsTabHtml();
    }

    /* ── 問題タブ：1 問 = 1 枚のカード。開いた 1 枚だけ編集できる ── */
    function questionsTabHtml() {
      var qs = st.preset.questions;
      if (!qs.length && st.aiBusy) {
        /* 作っている最中に空白を見せない。
           何を作っているかは右に出ているので、ここは待ちの形だけを出す。 */
        return WS.sectionCard({
          title: "問題を作っています", icon: "sparkle",
          sub: "できたぶんから、ここに 1 問ずつ並びます。途中で止めても残ります。",
          body: U.skeleton(5)
        });
      }
      if (!qs.length && st.chat.length) {
        /* 一度は頼んだのに問題が残っていない。
           はじめての人と同じ迎え方をすると「何も起きていない」ように見える。
           前のやり取りは右に残っているので、そこへ案内する。 */
        return WS.emptyState({
          icon: "refresh", title: "まだ問題が残っていません",
          body: "前に頼んだ内容と、そのときの経過は右の「AI アクティビティ」に残っています。"
            + "同じ指示で作り直すか、書き足してからもう一度お試しください。",
          action: btn({ label: "自分で 1 問ずつ作る", icon: "plus", variant: "primary", action: "add" })
        });
      }
      if (!qs.length) {
        /* まだ何も無いときは、印と一言で迎える。
           空白に「まだありません」だけを置くと、次に何をすればいいか分からない。 */
        return '<div class="vq2-startpad">'
          + U.heroHtml(HERO_LINES, "資料を入れて、作ってほしい内容を書いてください。")
          + '<div class="vq2-start-a">'
          + btn({ label: "自分で 1 問ずつ作る", icon: "plus", variant: "primary", action: "add" })
          + "</div>"
          + '<p class="vq2-start-h">AI に作らせるときは、右の欄に作りたい問題を書いてください。</p>'
          + "</div>";
      }
      var multiCount = Object.keys(st.multi).filter(function (k) { return st.multi[k]; }).length;
      var errs = V.errorsOf(st.issues).length;
      /* AI を使わない人が、ここだけで作り・直し・確かめ・保存まで終えられるようにする。 */
      var h = '<div class="vq2-qbar">'
        + "<span>" + qs.length + " 問</span>"
        + '<span class="vq2-qbar-h">カードを押すと編集・つまんで並べ替え</span>'
        + '<div class="vq2-top-sp"></div>'
        + (multiCount
            ? btn({ label: multiCount + " 件を削除", icon: "trash", size: "sm", variant: "quiet", action: "del-multi" })
            : "")
        + (st.selectedId
            ? btn({ label: "折りたたむ", icon: "chevronU", size: "sm", variant: "ghost", action: "collapse-all",
                    title: "開いている問題を閉じて、一覧だけにします" })
            : btn({ label: "開く", icon: "chevronD", size: "sm", variant: "ghost", action: "expand-first",
                    title: "最初の問題を開きます", disabled: !st.preset.questions.length }))
        + btn({ label: "検証する", icon: "shield", size: "sm", variant: "ghost", action: "revalidate" })
        + btn({ label: "保存", icon: "save", size: "sm", variant: "ghost", action: "save", disabled: st.saving })
        + btn({ label: "1 問追加", icon: "plus", size: "sm", variant: "primary", action: "add" })
        + "</div>"
        + (errs ? WS.inlineNotice({ tone: "danger",
              title: errs + " 件の要修正があります",
              body: "「検証」タブで中身を確かめられます。",
              action: btn({ label: "検証を見る", icon: "shield", size: "sm", variant: "ghost",
                            action: "ws-tab", id: "verify" }) }) : "");
      h += '<ul class="vq2-qcards" role="listbox" aria-label="問題一覧">';
      qs.forEach(function (q, i) {
        var qIssues = issuesFor(q.id);
        var hasErr = qIssues.some(function (x) { return x.severity === "error"; });
        var open = st.selectedId === q.id;
        h += '<li><div class="vq2-qcard' + (open ? " is-open" : "") + (hasErr ? " is-err" : "") + '"'
          + ' data-qid="' + esc(q.id) + '" role="option" tabindex="0" draggable="true"'
          + ' aria-selected="' + (open ? "true" : "false") + '">'
          + cardHeadHtml(q, i)
          + (open ? '<div class="vq2-qcard-b">' + editorHtml() + "</div>" : "")
          + "</div></li>";
      });
      return h + "</ul>";
    }

    /* カードの見出し。編集中でも安全に描き直せるよう、本文とは分けておく。 */
    function cardHeadHtml(q, i) {
      var qIssues = issuesFor(q.id);
      var hasErr = qIssues.some(function (x) { return x.severity === "error"; });
      var open = st.selectedId === q.id;
      return '<div class="vq2-qcard-h">'
        + '<span class="vq2-item-h" data-drag="1">' + icon("drag") + "</span>"
        + '<span class="vq2-item-n">' + numberOf(q, i) + "</span>"
        + '<span class="vq2-qcard-m">'
        + '<span class="vq2-item-t">' + (q.prompt ? esc(q.prompt) : '<span class="vq2-muted">（問題文が空です）</span>') + "</span>"
        + '<span class="vq2-item-s">'
        + U.badge(TYPE_LABEL[q.type] || q.type)
        + U.badge(DIFF_LABEL[q.difficulty] || "標準")
        + U.badge(q.createdBy === "ai" ? "AI が作成" : "自分で作成", q.createdBy === "ai" ? "ai" : "")
        + (q.requiresReview ? U.statusChip("warning", "要確認") : "")
        + (hasErr ? U.statusChip("error", "要修正") : "")
        + ((q.sourceReferences || []).length ? U.badge("出典" + q.sourceReferences.length) : "")
        + "</span></span>"
        + '<input type="checkbox" class="vq2-item-c" data-check="' + esc(q.id) + '"'
        + (st.multi[q.id] ? " checked" : "") + ' aria-label="この問題を選ぶ">'
        + '<span class="vq2-qcard-c" aria-label="' + (open ? "閉じる" : "開く") + '" title="'
        + (open ? "閉じる" : "開く") + '">' + icon(open ? "chevronU" : "chevronD") + "</span>"
        + "</div>";
    }

    /* ── 修復タブ：AI が返した修正案を、元と並べて確かめる ── */
    function repairTabHtml() {
      var h = "";
      if (st.repairLoop) h += repairLoopHtml();
      if (st.repairDone) h += repairDoneHtml();
      if (st.diff && st.repairCtx) return h + diffHtml();
      if (h) return h;
      return WS.emptyState({
        icon: "wrench", title: "修復の候補はまだありません",
        body: "「検証」で見つかったものを AI に直させると、ここに修正案が並びます。適用する前に、元の内容と見比べられます。",
        action: btn({ label: "検証を見る", icon: "shield", variant: "ghost", action: "ws-tab", id: "verify" })
      });
    }

    /* ── 差分タブ：生成・修正でこれから入る変更 ── */
    function diffTabHtml() {
      if (st.diff) return rejectedHtml() + diffHtml();
      return WS.emptyState({
        icon: "layers", title: "反映待ちの変更はありません",
        body: "AI が問題を作ったり直したりすると、ここに「追加された問題・変わった問題・消す候補」が並びます。選んでから反映できます。"
      });
    }

    /* ── 左：問題一覧（旧レイアウト用に残す。いまは使っていない）─ */
    function listHtml() {
      var qs = st.preset.questions;
      var multiCount = Object.keys(st.multi).filter(function (k) { return st.multi[k]; }).length;
      var h = '<div class="vq2-pane-h">'
        + "<span>問題 " + qs.length + " 問</span>"
        + '<div class="vq2-top-sp"></div>'
        + (multiCount
            ? btn({ label: multiCount + " 件を削除", icon: "trash", size: "sm", variant: "quiet", action: "del-multi" })
            : btn({ icon: "plus", iconOnly: true, size: "sm", variant: "quiet", action: "add", aria: "問題を追加", title: "問題を追加" }))
        + "</div>";

      if (!qs.length) {
        return h + '<div class="vq2-pane-b">' + U.empty({
          icon: "doc", title: "まだ問題がありません",
          body: "自分で作るか、右の AI に資料を渡して作らせることができます。",
          action: { label: "問題を追加", icon: "plus", variant: "primary", action: "add" }
        }) + "</div>";
      }

      h += '<div class="vq2-pane-b"><ul class="vq2-list" role="listbox" aria-label="問題一覧">';
      qs.forEach(function (q, i) {
        var qIssues = issuesFor(q.id);
        var hasErr = qIssues.some(function (x) { return x.severity === "error"; });
        h += '<li><div class="vq2-item" role="option" tabindex="0" data-qid="' + esc(q.id) + '"'
          + ' aria-selected="' + (st.selectedId === q.id ? "true" : "false") + '" draggable="true">'
          + '<span class="vq2-item-h" data-drag="1">' + icon("drag") + "</span>"
          + '<span class="vq2-item-n">' + numberOf(q, i) + "</span>"
          + '<span class="vq2-item-m">'
          + '<span class="vq2-item-t">' + (q.prompt ? esc(q.prompt) : '<span class="vq2-muted">（問題文が空です）</span>') + "</span>"
          + '<span class="vq2-item-s">'
          + U.badge(TYPE_LABEL[q.type] || q.type)
          + U.badge(DIFF_LABEL[q.difficulty] || "標準")
          + (q.createdBy === "ai" ? U.badge("AI", "ai") : "")
          + (q.requiresReview ? U.statusChip("warning", "要確認") : "")
          + (hasErr ? U.statusChip("error", "要修正") : "")
          + ((q.sourceReferences || []).length ? U.badge("出典" + q.sourceReferences.length) : "")
          + "</span></span>"
          + '<input type="checkbox" class="vq2-item-c" data-check="' + esc(q.id) + '"'
          + (st.multi[q.id] ? " checked" : "") + ' aria-label="選択">'
          + "</div></li>";
      });
      h += "</ul></div>";
      h += '<div class="vq2-pane-f">' + btn({ label: "問題を追加", icon: "plus", full: true, action: "add" }) + "</div>";
      return h;
    }

    /* ── 中央：問題の編集 ─────────────────────────────────── */
    function editorHtml() {
      var q = selected();
      if (!q) {
        return '<div class="vq2-pane-b">' + U.empty({
          icon: "book", title: "問題を選んでください",
          body: "左の一覧から編集したい問題を選びます。"
        }) + "</div>";
      }
      var qIssues = issuesFor(q.id);
      var idx = st.preset.questions.findIndex(function (x) { return x.id === q.id; });

      var h = '<div class="vq2-pane-h">'
        + "<span>問 " + numberOf(q, idx) + "（" + (idx + 1) + " / " + st.preset.questions.length + " 件目）</span>"
        + '<div class="vq2-top-sp"></div>'
        /* AI 修正はここからも始められる。作った人（AI／自分）では区別しない。 */
        + btn({ label: "AI で修正", icon: "sparkle", size: "sm", variant: "ghost", action: "ai-fix-this" })
        + btn({ icon: "copy", iconOnly: true, size: "sm", variant: "quiet", action: "dup", aria: "複製", title: "複製" })
        + btn({ icon: "trash", iconOnly: true, size: "sm", variant: "quiet", action: "del", aria: "削除", title: "削除" })
        + '<span style="width:8px"></span>'
        + btn({ icon: "chevronU", iconOnly: true, size: "sm", variant: "quiet", action: "prev", disabled: idx <= 0, aria: "前の問題" })
        + btn({ icon: "chevronD", iconOnly: true, size: "sm", variant: "quiet", action: "next", disabled: idx >= st.preset.questions.length - 1, aria: "次の問題" })
        + "</div>";

      h += '<div class="vq2-pane-b"><div class="vq2-q">';

      if (qIssues.length) {
        h += '<div class="vq2-card" style="padding:12px 14px">'
          + qIssues.slice(0, 6).map(function (i) {
              return '<div style="display:flex;gap:8px;align-items:flex-start;margin:4px 0">'
                + U.statusChip(i.severity === "error" ? "error" : "warning", i.severity === "error" ? "要修正" : "確認")
                + "<span>" + esc(i.message) + "</span></div>";
            }).join("")
          + "</div>";
      }

      h += field({ label: "問題文", type: "textarea", rows: 4, key: "prompt", value: q.prompt,
                   required: true, placeholder: "問題文を入力します" });

      h += '<div class="vq2-grid c3">'
        + ('<div class="vq2-field"><label class="vq2-label">形式</label>'
           + btn({ label: QT.label(q.type), icon: QT.icon(q.type), action: "pick-type" })
           + '<div class="vq2-hint">' + esc(QT.getOrUnknown(q.type).description) + "</div></div>")
        + field({ label: "難易度", type: "select", key: "difficulty", value: q.difficulty,
                  options: [{ value: "easy", label: "易" }, { value: "normal", label: "標準" }, { value: "hard", label: "難" }] })
        + field({ label: "配点", type: "number", key: "points", value: q.points, min: 0, step: 1 })
        + "</div>";

      /* 形式ごとの構造。V3 が受け持つ形式は専用フォームへ渡す（§12）。 */
      if (QE && QE.handles(q)) {
        QE.ensure(q);
        h += '<div class="vq2-qe-form" data-qtedit></div>';
      } else if (S.hasChoices(q.type)) {
        h += '<div><div class="vq2-label" style="margin-bottom:8px">選択肢と正解</div><div class="vq2-q-choices">';
        (q.choices || []).forEach(function (c, ci) {
          h += '<div class="vq2-choice' + (c.isCorrect ? " is-correct" : "") + '">'
            + '<span class="vq2-choice-l">' + esc(c.label || String.fromCharCode(65 + ci)) + "</span>"
            + '<span class="vq2-choice-m">'
            + '<input type="text" class="vq2-input" data-key="choiceText" data-cid="' + esc(c.id) + '" value="' + esc(c.text) + '" placeholder="選択肢の本文">'
            + '<input type="text" class="vq2-input" data-key="choiceExp" data-cid="' + esc(c.id) + '" value="' + esc(c.explanation) + '" placeholder="この選択肢の解説（誤答の理由など）">'
            + "</span>"
            + '<span class="vq2-choice-a">'
            + btn({ icon: "check", iconOnly: true, size: "sm", variant: c.isCorrect ? "primary" : "quiet",
                    action: "mark-correct", id: c.id, aria: c.isCorrect ? "正解に設定済み" : "正解にする",
                    title: "正解にする", pressed: c.isCorrect })
            + btn({ icon: "trash", iconOnly: true, size: "sm", variant: "quiet", action: "del-choice", id: c.id, aria: "この選択肢を削除" })
            + "</span></div>";
        });
        h += "</div>"
          + '<div style="margin-top:8px">' + btn({ label: "選択肢を追加", icon: "plus", size: "sm", action: "add-choice" }) + "</div></div>";
      } else if (S.isDeterministic(q.type)) {
        h += field({ label: "正解", key: "correctAnswer", value: q.correctAnswer || "", required: true,
                     placeholder: "正解を入力します" });
        h += field({ label: "別解（1 行に 1 つ）", type: "textarea", rows: 2, key: "acceptedAnswers",
                     value: (q.acceptedAnswers || []).join("\n"),
                     hint: "表記のゆれや言い換えを書いておくと正解として扱われます。" });
      } else {
        h += rubricHtml(q);
      }

      h += field({ label: "解説", type: "textarea", rows: 3, key: "explanation", value: q.explanation,
                   placeholder: "なぜその答えになるかを書きます" });

      h += '<div class="vq2-grid c2">'
        + field({ label: "単元", key: "topic", value: q.topic, placeholder: "例：古代・律令国家" })
        + field({ label: "タグ（カンマ区切り）", key: "tags", value: (q.tags || []).join(", ") })
        + "</div>";

      /* 出典 */
      h += "<div><div class=\"vq2-label\" style=\"margin-bottom:8px\">出典</div>";
      if ((q.sourceReferences || []).length) {
        h += (q.sourceReferences || []).map(function (s) {
          return '<div class="vq2-src" style="margin-bottom:6px">' + icon("doc")
            + '<span class="vq2-src-n">' + esc(s.sourceName) + (s.page ? "（p." + s.page + "）" : "") + "</span>"
            + (s.verified ? U.statusChip("success", "確認済み") : U.statusChip("warning", "未確認")) + "</div>";
        }).join("");
      } else {
        h += '<div class="vq2-muted">出典はまだありません。AI が資料から作った問題には自動で付きます。</div>';
      }
      h += "</div>";

      h += '<label class="vq2-check"><input type="checkbox" data-key="requiresReview"' + (q.requiresReview ? " checked" : "") + ">"
        + "<span>この問題を要確認にする<br><span class=\"vq2-hint\">内容に自信がないときに印を付けておけます。</span></span></label>";

      /* プレビュー。出題画面と同じ Renderer を使うので、見た目と実物がずれない（§12）。 */
      h += '<div class="vq2-label" style="margin:18px 0 8px">プレビュー（解く人にはこう見えます）</div>'
        + '<div class="vq2-qe-preview" data-qtpreview></div>';

      h += "</div></div>";
      return h;
    }

    /* ══════════════════════════════════════════════════════════
       AI パネルの会話とログ

       Quick Chat と同じ見え方にする（上に会話、下に入力欄）。
       ただしここは同じ Orchestrator を呼ぶ別の入口であって、
       Quick Chat の会話そのものではない。混ぜると Quick Chat 側が壊れる。
       ══════════════════════════════════════════════════════════ */
    /* 会話・作業ログ・時間表示・はじめの画面は共通部品（U.AiChat）に置いてある。
       Quick Mock と同じ見た目・同じ動きにするため、ここには書き写さない。 */
    function currentAiTurn() { return chat.current(); }
    function logReset() {
      var text = st.autoInstruction.trim();
      chat.begin(text);
      st.chat = chat.turns;
      /* 前の回の行はそのまま残し、対応づけだけ切る（履歴が消えると経緯を追えない） */
      actPanel.resetRun();
      if (text)
        actPanel.push({ kind: "user-followup", status: "done",
                        title: "作ってほしいことを受け取りました", short: text });
      renderAiPane();
      persistChat();
    }
    function logAdd(kind, text) { chat.log(kind, text); }
    /* AI 層の進行は、そのままタイムラインへ。
       chat.fromActivity を通すと label だけになり、
       件数・詳細・工程の種類が落ちてしまう。 */
    function logFromActivity(items) { actPanel.fromActivity(items); }
    function flushRevealAll() { chat.flushAll(); }
    function paintStream() { chat.setStream(st.aiText); }
    function scrollChatToEnd() { chat.scrollToEnd(); }
    function etaStart(total, label) { chat.etaStart(total, label); }
    function etaRoundBegin(label) { chat.etaRound(label); }
    function etaRoundEnd() { chat.etaDone(); }
    function paintEta() { chat.paintEta(); }
    function stopTickers() { chat.stop(); clearTimeout(chatTimer); }

    /* 添付したものを入力欄の上に出す。何が読めたのかが分からないと使えない。 */
    function attachListHtml() {
      if (st.attachBusy) {
        return '<div class="vq2-attach"><div class="vq2-attach-i">'
          + '<span class="vq2-spin"></span><span>資料を読み取っています…</span></div></div>';
      }
      if (!st.attachments.length) return "";
      return '<div class="vq2-attach">'
        + st.attachments.map(function (a) {
            var sub = U.attachSummary(a);
            return '<div class="vq2-attach-i">' + icon(a.kind === "image" ? "eye" : "doc")
              + '<span class="vq2-attach-n">' + esc(a.name) + "</span>"
              + '<span class="vq2-attach-s">' + esc(sub) + "</span>"
              + btn({ icon: "close", iconOnly: true, size: "sm", variant: "quiet",
                      action: "attach-del", id: a.id, aria: "この資料を外す" })
              + "</div>";
          }).join("")
        + "</div>";
    }

    /* ══════════════════════════════════════════════════════════
       chat.log の 1 行 → タイムラインの出来事

       これまでは会話欄に「印 ＋ 一文」を積むだけだった。
       同じ材料で、種類・状態・詳しい説明を持つカードにする。
       ══════════════════════════════════════════════════════════ */
    function timelineFromLog(e) {
      var m = LOG_KIND[e.kind] || LOG_KIND.note;
      var text = String(e.text || "");
      if (!text) return;
      /* 1 文目を見出し、残りを説明にする。長い 1 行を読ませない。 */
      var cut = text.indexOf("。");
      var title = cut > 0 && cut < text.length - 1 ? text.slice(0, cut + 1) : text;
      var rest = cut > 0 && cut < text.length - 1 ? text.slice(cut + 1) : "";
      actPanel.push({ kind: m.kind, status: m.status, title: title, short: rest, at: e.at });
    }

    /* タイムラインのカードから押された操作 */
    function onActivityAction(id) {
      if (id === "attach-add") { pickAttachments(); return; }
      if (id === "attach-retry-all") {
        st.attachDisplay.filter(function (d) {
          return d.status === "failed" || d.status === "error" || d.status === "unreadable";
        }).forEach(function (d) { retryAttachment(d.id); });
        return;
      }
      if (id === "source-none") { generateWithoutSources(); return; }
      /* 資料限定で止めたあとの 3 つの手 */
      if (id === "retry-topics") { runAi("generate"); return; }
      if (id === "source-off") {
        st.sourceOnly = false;
        paintComposer();
        runAi("generate");
        return;
      }
      /* 頼んだ数に届かなかったときの 3 つの手（§46）。
         「範囲を広げる」は資料の追加（attach-add）へ。 */
      if (id === "shortfall-accept") {
        if (!st.diff) { app.toast("反映できる変更がありません。", "warning"); return; }
        applyAi("all");
        return;
      }
      if (id === "shortfall-types") {
        invalidateCondition();
        openConditionSheet(currentCondition());
        return;
      }
      if (id === "verify") { st.tab = "verify"; st.pane = "main"; render(); return; }
      if (id === "repair") { st.tab = "verify"; st.pane = "main"; render(); return; }
      if (id === "diff") { st.tab = "diff"; st.pane = "main"; render(); }
    }

    /* ══════════════════════════════════════════════════════════════
       検証タブ（AI 修復つき）
       ・error / warning / info に分けて出す。
       ・各項目に「どの問題の・何が・どう直せるか」を書く。
       ・AI で直せないものは「手で直す」とはっきり出す（隠さない）。
       ══════════════════════════════════════════════════════════════ */
    function verifyPanelHtml() {
      var errs = R.bySeverity(st.issues, "error");
      var warns = R.bySeverity(st.issues, "warning");
      var infos = R.bySeverity(st.issues, "info");
      var repairable = R.repairableIssues(errs.concat(warns, infos));
      var selCount = Object.keys(st.repairSel).filter(function (k) { return st.repairSel[k]; }).length;
      var shortage = st.expectedCount ? R.shortagePlan(st.preset, { expectedCount: st.expectedCount }) : null;

      var h = '<div class="vq2-card" style="padding:14px">'
        + '<div class="vq2-row" style="justify-content:space-between;align-items:center">'
        + "<span>" + esc(verifySummary(errs, warns, infos)) + "</span>"
        + btn({ icon: "refresh", iconOnly: true, size: "sm", variant: "quiet",
                action: "revalidate", aria: "再検証" })
        + "</div>";

      /* 修復の操作 */
      if (repairable.length || (shortage && shortage.canBackfill)) {
        h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
          + btn({ label: "選んだ項目を AI で修復（" + selCount + "）", icon: "sparkle",
                  action: "repair-selected", disabled: st.repairBusy || !selCount })
          + btn({ label: "直せるエラーをすべて AI で修復", icon: "sparkle", variant: "primary",
                  action: "repair-all", disabled: st.repairBusy || !repairable.length })
          + (shortage && shortage.canBackfill
              ? btn({ label: shortage.missing
                        ? "不足 " + shortage.missing + " 問を AI で補充"
                        : "欠番 " + shortage.gaps.length + " 問を AI で補充",
                      icon: "plus", action: "repair-backfill", disabled: st.repairBusy })
              : "")
          + "</div>";
      }
      h += "</div>";

      /* 修復の進み具合 */
      if (st.repairLoop) h += repairLoopHtml();
      if (st.repairDone) h += repairDoneHtml();

      if (!errs.length && !warns.length && !infos.length) {
        h += U.empty({ icon: "check", title: "問題は見つかりませんでした", body: "このまま保存できます。" });
        return h;
      }
      h += issueListHtml("修正が必要", errs, "error");
      h += issueListHtml("確認したい", warns, "warning");
      h += issueListHtml("参考", infos, "info");
      return h;
    }
    function verifySummary(errs, warns, infos) {
      if (!errs.length && !warns.length && !infos.length) return "問題は見つかりませんでした。";
      var parts = [];
      if (errs.length) parts.push("要修正 " + errs.length + " 件");
      if (warns.length) parts.push("確認 " + warns.length + " 件");
      if (infos.length) parts.push("参考 " + infos.length + " 件");
      return parts.join(" ／ ");
    }
    function repairLoopHtml() {
      var l = st.repairLoop;
      return '<div class="vq2-card" style="padding:12px 14px">'
        + '<div class="vq2-row" style="gap:8px;align-items:center">'
        + (st.repairBusy ? '<span class="vq2-spin"></span>' : U.statusChip("info", "修復"))
        + "<span>" + (l.round || 0) + " 回目 / 最大 " + l.maxRounds + " 回</span>"
        + "</div>"
        + (l.history.length
            ? '<div class="vq2-hint" style="margin-top:6px">'
              + l.history.map(function (x) {
                  return x.round + " 回目: エラー " + x.before + " → " + x.after + " 件";
                }).join(" ／ ") + "</div>"
            : "")
        + "</div>";
    }
    function repairDoneHtml() {
      var d = st.repairDone;
      return '<div class="vq2-card" style="padding:12px 14px">'
        + U.statusChip(d.ok ? "success" : "warning", d.ok ? "完了" : "自動では直りませんでした")
        + '<span style="margin-left:8px">' + esc(d.message) + "</span>"
        + (d.guide && d.guide.length
            ? '<div style="margin-top:8px">'
              + '<div class="vq2-label" style="margin-bottom:4px">手で直すこと</div>'
              + d.guide.slice(0, 12).map(function (g) {
                  return '<div style="margin:3px 0">'
                    + U.statusChip("warning", g.questionNumber ? "問 " + g.questionNumber : "全体")
                    + '<span style="margin-left:8px">' + esc(g.message) + "</span>"
                    + '<div class="vq2-hint" style="margin-left:4px">' + esc(g.how) + "</div></div>";
                }).join("")
              + "</div>"
            : "")
        + '<div style="margin-top:8px">'
        + btn({ label: "閉じる", size: "sm", variant: "quiet", action: "repair-dismiss" })
        + "</div></div>";
    }

    /* ── 採点基準（記述・論述・英作文）─────────────────────────────
       この形式はコードで正誤を出せないので AI が採点する。
       ただし採点基準が無いと採点そのものを行わない（根拠を示せないため）。
       つまりここが空だと、解いても永久に未採点のまま残る。
       だから必ず編集できる形で出し、既定の基準も用意しておく。 */
    function rubricHtml(q) {
      var items = (q.scoringRubric && Array.isArray(q.scoringRubric.items)) ? q.scoringRubric.items : [];
      var sum = items.reduce(function (a, r) { return a + (Number(r.points) || 0); }, 0);
      var pts = Number(q.points) || 0;

      var h = '<div class="vq2-card" id="rubBox" style="padding:14px">'
        + '<div class="vq2-row" style="justify-content:space-between;align-items:flex-start;gap:8px">'
        + '<div><div class="vq2-sec-t">採点基準</div>'
        + '<div class="vq2-hint">この形式は AI が採点します。ここに書いた基準ごとに点をつけ、'
        + "その理由を示します。</div></div>"
        + '<span id="rubSum">' + (items.length ? rubSumChip(sum, pts) : "") + "</span>"
        + "</div>";

      if (!items.length) {
        h += '<div style="margin-top:12px">'
          + U.statusChip("warning", "未設定")
          + '<span style="margin-left:8px">採点基準がないと、この問題は採点されません。</span></div>'
          + '<div style="margin-top:10px">'
          + btn({ label: "既定の基準を作る", icon: "plus", variant: "primary", action: "rubric-default" })
          + "</div></div>";
        return h;
      }

      h += '<div class="vq2-rub" style="margin-top:12px">';
      items.forEach(function (r, i) {
        h += '<div class="vq2-rub-i">'
          + '<span class="vq2-rub-n">' + (i + 1) + "</span>"
          + '<span class="vq2-rub-m">'
          + '<input type="text" class="vq2-input" data-key="rubDesc" data-rid="' + esc(r.id) + '"'
          + ' value="' + esc(r.description) + '" placeholder="何ができていれば点を与えるか">'
          + '<span class="vq2-rub-row">'
          + '<label class="vq2-hint" style="display:flex;align-items:center;gap:6px">配点'
          + '<input type="number" class="vq2-input vq2-rub-p" data-key="rubPoints" data-rid="' + esc(r.id) + '"'
          + ' min="0" step="1" value="' + esc(r.points) + '"></label>'
          + '<select class="vq2-input vq2-rub-c" data-key="rubCriterion" data-rid="' + esc(r.id) + '">'
          + ["knowledge_skill", "thinking_judgment_expression"].map(function (c) {
              return '<option value="' + c + '"' + (r.criterionId === c ? " selected" : "") + ">"
                + esc(S.criterionLabel(c)) + "</option>";
            }).join("")
          + "</select></span></span>"
          + btn({ icon: "trash", iconOnly: true, size: "sm", variant: "quiet",
                  action: "rubric-del", id: r.id, aria: "この基準を削除" })
          + "</div>";
      });
      h += "</div>";
      h += '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
        + btn({ label: "基準を追加", icon: "plus", size: "sm", action: "rubric-add" })
        + btn({ label: "合計を配点に合わせる", size: "sm", action: "rubric-fit" })
        + "</div></div>";
      return h;
    }
    function rubSumChip(sum, pts) {
      return U.statusChip(sum === pts ? "success" : "error", "合計 " + sum + " / 配点 " + pts + " 点");
    }
    /* 採点基準の枠だけを描き直す（配点を変えたときに使う）。
       編集画面ごと描き直すと、入力中の欄からフォーカスが外れる。 */
    function renderRubric() {
      var q = selected();
      if (!q || !S.isAiGraded(q.type)) return;
      var box = app.root.querySelector("#rubBox");
      if (box) box.outerHTML = rubricHtml(q);
    }
    /* 合計の表示だけを書き換える（基準の配点を打っている最中に使う） */
    function paintRubricSum() {
      var q = selected();
      var host = app.root.querySelector("#rubSum");
      if (!q || !host) return;
      var items = (q.scoringRubric && q.scoringRubric.items) || [];
      host.innerHTML = items.length
        ? rubSumChip(items.reduce(function (a, r) { return a + (Number(r.points) || 0); }, 0), Number(q.points) || 0)
        : "";
    }

    function issueListHtml(title, list, kind) {
      if (!list.length) return "";
      return '<div><div class="vq2-label" style="margin-bottom:6px">' + esc(title) + "（" + list.length + "）</div>"
        + list.slice(0, 60).map(function (i) { return issueRowHtml(i, kind); }).join("") + "</div>";
    }
    /* 1 件ぶんの表示。仕様で決まっている項目をすべて出す。 */
    function issueRowHtml(i, kind) {
      var canRepair = i.aiRepairable || i.autoRepairable;
      var fields = (i.fields || []).map(function (f) { return FIELD_JA[f] || f; }).join("・");
      return '<div class="vq2-card" style="padding:10px 12px;margin-bottom:6px">'
        + '<div style="display:flex;gap:8px;align-items:flex-start">'
        + (canRepair
            ? '<label class="vq2-check" style="margin-top:2px">'
              + '<input type="checkbox" data-issue="' + esc(i.id) + '"'
              + (st.repairSel[i.id] ? " checked" : "") + '><span class="vq2-sr">選ぶ</span></label>'
            : '<span style="width:18px"></span>')
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
        + U.statusChip(kind, i.questionNumber ? "問 " + i.questionNumber : "全体")
        + '<span class="vq2-muted" style="font-size:12px">' + esc(i.code) + "</span>"
        + (i.fromGlobal ? U.statusChip("info", esc(i.fromGlobal)) : "")
        + (canRepair ? U.statusChip("success", i.autoRepairable ? "AI 不要で修復可" : "AI 修復可")
                     : U.statusChip("warning", "手で直す"))
        + "</div>"
        + '<div style="margin-top:4px">' + esc(i.message) + "</div>"
        + (i.excerpt ? '<div class="vq2-hint" style="margin-top:2px">該当: ' + esc(i.excerpt) + "…</div>" : "")
        + (i.questionId ? '<div class="vq2-hint">問題 ID: ' + esc(i.questionId) + "</div>" : "")
        + '<div class="vq2-hint">' + esc(i.hint) + (fields ? "（直すのは " + esc(fields) + " だけ）" : "") + "</div>"
        + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'
        + (i.questionId
            ? btn({ label: "この問題を見る", size: "sm", variant: "quiet",
                    action: "issue-jump", id: i.questionId })
            : "")
        + (canRepair && i.questionId
            ? btn({ label: "この問題を AI で修復", size: "sm",
                    action: "repair-question", id: i.questionId, disabled: st.repairBusy })
            : "")
        + "</div></div></div></div>";
    }

    function qidFromPath(path) {
      var m = String(path || "").match(/^questions\[(\d+)\]/);
      if (!m) return null;
      var q = st.preset.questions[parseInt(m[1], 10)];
      return q ? q.id : null;
    }
    function indexOfQ(qid) { return st.preset.questions.findIndex(function (q) { return q.id === qid; }); }

    /* ── 差分表示 ───────────────────────────────────────────── */
    /* AI が返したのに反映しないもの。黙って捨てず、理由をそのまま出す。 */
    function rejectedHtml() {
      if (!st.rejected.length) return "";
      return '<div class="vq2-card" style="padding:12px 14px;margin-bottom:10px">'
        + '<div class="vq2-label" style="margin-bottom:6px">反映しない提案（' + st.rejected.length + "）</div>"
        + st.rejected.slice(0, 20).map(function (r) {
            return '<div style="display:flex;gap:8px;align-items:flex-start;margin:4px 0">'
              + U.statusChip("warning", "見送り") + "<span>" + esc(r.message) + "</span></div>";
          }).join("")
        + "</div>";
    }

    function diffHtml() {
      var d = st.diff;
      var h = rejectedHtml()
        + '<div><div class="vq2-row" style="justify-content:space-between;margin-bottom:8px">'
        + '<span class="vq2-label">AI の提案（' + d.changes.length + " 件）</span>"
        + '<span>' + (d.added ? U.badge("追加 " + d.added, "success") : "")
        + (d.modified ? U.badge("変更 " + d.modified, "accent") : "")
        + (d.removeCandidates ? U.badge("削除候補 " + d.removeCandidates, "warning") : "") + "</span></div>";

      h += '<div class="vq2-diff">';
      d.changes.forEach(function (c) {
        var q = c.proposed || c.current;
        var no = c.kind === "add" ? 0 : numberOfId(c.questionId);
        var title = (no ? "問 " + no + "　" : "") + ((q && q.prompt) ? q.prompt : "（問題文なし）");
        var kindBadge = c.kind === "add" ? U.badge("追加", "success")
                      : c.kind === "removeCandidate" ? U.badge("削除候補", "warning")
                      : U.badge("変更", "accent");
        var collapsed = st.collapsedDiff[c.questionId];
        h += '<div class="vq2-diff-g">'
          + '<div class="vq2-diff-h">'
          + '<input type="checkbox" data-diffsel="' + esc(c.questionId) + '"' + (st.diffSelection[c.questionId] ? " checked" : "")
          + ' aria-label="この変更を選ぶ">'
          + kindBadge
          + '<span class="vq2-diff-h-t">' + esc(String(title).slice(0, 80)) + "</span>"
          + (c.fields.length ? '<button type="button" class="vq2-btn is-quiet sz-sm is-icon" data-difftoggle="' + esc(c.questionId) + '"'
              + ' aria-label="詳細">' + icon(collapsed ? "chevronD" : "chevronU") + "</button>" : "")
          + "</div>";
        if (!collapsed) {
          c.fields.forEach(function (f) {
            h += '<div class="vq2-diff-f">'
              + '<input type="checkbox" data-fieldsel="' + esc(c.questionId) + "|" + esc(f.field) + '" checked aria-label="' + esc(f.label) + 'を適用">'
              + '<div class="vq2-diff-f-m">'
              + '<div class="vq2-diff-f-l">' + esc(f.label) + "</div>"
              + '<div class="vq2-diff-f-s">' + esc(f.summary) + "</div>"
              + fieldPreview(f)
              + "</div></div>";
          });
          if (c.kind === "add" && q) {
            h += '<div class="vq2-diff-f"><div class="vq2-diff-f-m">'
              + '<div class="vq2-diff-f-l">内容</div>'
              + '<div class="vq2-diff-b">' + esc(q.prompt) + "\n"
              + (q.choices || []).map(function (ch, i) {
                  return (ch.isCorrect ? "◎ " : "　") + String.fromCharCode(65 + i) + ". " + ch.text;
                }).join("\n") + "</div></div></div>";
          }
        }
        h += "</div>";
      });
      h += "</div>";

      h += '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'
        + btn({ label: "選んだ変更を適用", variant: "primary", action: "apply-selected" })
        + btn({ label: "すべて適用", action: "apply-all" })
        + btn({ label: "もう一度作る", icon: "refresh", action: "ai-regenerate" })
        + btn({ label: "破棄", variant: "quiet", action: "discard-diff" })
        + "</div></div>";
      return h;
    }
    function fieldPreview(f) {
      if (f.field === "choices") {
        var a = (f.from || []).map(function (c, i) { return (c.isCorrect ? "◎ " : "　") + String.fromCharCode(65 + i) + ". " + c.text; }).join("\n");
        var b = (f.to || []).map(function (c, i) { return (c.isCorrect ? "◎ " : "　") + String.fromCharCode(65 + i) + ". " + c.text; }).join("\n");
        return '<div class="vq2-diff-ab"><div class="vq2-diff-a">' + esc(a) + '</div><div class="vq2-diff-b">' + esc(b) + "</div></div>";
      }
      if (typeof f.from === "string" || typeof f.to === "string") {
        return '<div class="vq2-diff-ab"><div class="vq2-diff-a">' + esc(String(f.from || "（なし）")).slice(0, 400)
          + '</div><div class="vq2-diff-b">' + esc(String(f.to || "（なし）")).slice(0, 400) + "</div></div>";
      }
      return "";
    }

    /* ══════════════════════════════════════════════════════════
       イベント結線
       ══════════════════════════════════════════════════════════ */
    /* 結線は 1 回だけ。
       U.on は app.root へ委譲で貼るので、中身を innerHTML で入れ替えても生き残る。
       描き直すたびに貼り直すと、同じボタンで処理が 2 回 3 回と走る
       （とくに開閉のような「反転」は、偶数回で元へ戻ってしまう）。 */
    function wire() {
      if (app.root.__psWired) { wireAfterPaint(); return; }
      app.root.__psWired = true;
      wireTop(); wireList(); wireEditor(); wireAi(); wirePanes();
      wireAfterPaint();
    }
    /* 描き直すたびに必要なもの（委譲では拾えない、実体への処理）*/
    function wireAfterPaint() {
      chat.startHero();
      chat.paintEta();
    }

    function wireTop() {
      var r = app.root;
      U.on(r, "click", '[data-act="close"]', function () { app.close("user"); });
      U.on(r, "click", '[data-act="save"]', function () { save(false); });
      U.on(r, "click", '[data-act="undo"]', function () {
        var s = history.undo(); if (!s) return;
        st.preset = s; st.dirty = true; revalidate(); render();
      });
      U.on(r, "click", '[data-act="redo"]', function () {
        var s = history.redo(); if (!s) return;
        st.preset = s; st.dirty = true; revalidate(); render();
      });
      U.on(r, "click", '[data-act="preview"]', function () { openPreview(); });
      U.on(r, "click", '[data-act="settings"]', function () { openSettings(); });
      U.on(r, "click", '[data-act="more"]', function (e, t) {
        U.menu(app.root, t, [
          { value: "undo", label: "元に戻す" + (history.undoLabel() ? "：" + history.undoLabel() : ""), icon: "undo", disabled: !history.canUndo() },
          { value: "redo", label: "やり直す" + (history.redoLabel() ? "：" + history.redoLabel() : ""), icon: "redo", disabled: !history.canRedo() },
          { divider: true },
          { value: "preview", label: "プレビュー", icon: "eye" },
          { value: "settings", label: "プリセットの設定", icon: "settings" }
        ]).then(function (v) {
          if (v === "undo") { var s = history.undo(); if (s) { st.preset = s; st.dirty = true; revalidate(); render(); } }
          else if (v === "redo") { var s2 = history.redo(); if (s2) { st.preset = s2; st.dirty = true; revalidate(); render(); } }
          else if (v === "preview") openPreview();
          else if (v === "settings") openSettings();
        });
      });
      /* 狭い画面のペイン切り替え（指示 / 内容 / AI） */
      U.on(r, "click", "[data-pane]", function (e, t) {
        st.pane = t.getAttribute("data-pane"); render();
      });
      /* 中央のタブ（問題 / 検証 / 修復 / 差分）*/
      U.on(r, "click", '[data-act="ws-tab"]', function (e, t) {
        st.tab = t.getAttribute("data-tab") || t.getAttribute("data-id") || "questions";
        st.pane = "main";
        render();
      });
      /* キーボード: Cmd/Ctrl+S 保存、Cmd/Ctrl+Z 戻す */
      r.addEventListener("keydown", function (e) {
        var meta = e.metaKey || e.ctrlKey;
        if (!meta) return;
        if (e.key === "s") { e.preventDefault(); save(false); }
        else if (e.key === "z" && !e.shiftKey) { e.preventDefault(); var s = history.undo(); if (s) { st.preset = s; st.dirty = true; revalidate(); render(); } }
        else if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); var s2 = history.redo(); if (s2) { st.preset = s2; st.dirty = true; revalidate(); render(); } }
      });
    }

    function wirePanes() { /* 3 ペインは幅を CSS で決める（つまみは置かない） */ }

    function wireList() {
      var r = app.root;
      U.on(r, "click", '[data-act="add"]', function () { addQuestion(st.selectedId); });
      U.on(r, "click", '[data-act="del-multi"]', function () {
        deleteQuestions(Object.keys(st.multi).filter(function (k) { return st.multi[k]; }));
      });
      U.on(r, "click", ".vq2-qcard[data-qid]", function (e, t) {
        /* 開いている編集欄の中は、カードの選択とは別物。
           ここを通すと、正解を選ぶボタンを押しただけで画面ごと作り直され、
           その操作自体が消える（実測: aria-pressed が付かないまま戻っていた）。 */
        if (e.target.closest("[data-check]") || e.target.closest("[data-drag]")
            || e.target.closest(".vq2-qcard-b")) return;
        var qid = t.getAttribute("data-qid");
        /* 開いているカードをもう一度押したら閉じる（折りたたみ）。 */
        var wasOpen = st.selectedId === qid;
        withAnchor(qid, function () {
          st.selectedId = wasOpen ? null : qid;
          st.tab = "questions"; if (app.isMobile()) st.pane = "main";
          render();
        });
      });
      U.on(r, "click", '[data-act="collapse-all"]', function () {
        var qid = st.selectedId;
        withAnchor(qid, function () { st.selectedId = null; render(); });
      });
      U.on(r, "click", '[data-act="expand-first"]', function () {
        var first = st.preset.questions[0];
        if (!first) return;
        st.selectedId = first.id;
        render();
      });
      U.on(r, "keydown", ".vq2-qcard[data-qid]", function (e, t) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t.click(); }
      });
      U.on(r, "change", "[data-check]", function (e, t) {
        st.multi[t.getAttribute("data-check")] = t.checked; renderList();
      });
      U.on(r, "click", "[data-jump]", function (e, t) {
        var id = t.getAttribute("data-jump");
        if (!id) return;
        st.selectedId = id;
        st.tab = "questions"; if (app.isMobile()) st.pane = "main";
        render();
      });

      /* ドラッグで並び替え */
      var dragId = null;
      U.on(r, "dragstart", ".vq2-qcard[data-qid]", function (e, t) {
        dragId = t.getAttribute("data-qid");
        t.classList.add("is-dragging");
        try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); } catch (x) {}
      });
      U.on(r, "dragend", ".vq2-qcard[data-qid]", function (e, t) {
        t.classList.remove("is-dragging");
        Array.prototype.forEach.call(r.querySelectorAll(".vq2-qcard"), function (x) {
          x.classList.remove("is-drop-before", "is-drop-after");
        });
        dragId = null;
      });
      U.on(r, "dragover", ".vq2-qcard[data-qid]", function (e, t) {
        if (!dragId || t.getAttribute("data-qid") === dragId) return;
        e.preventDefault();
        var rect = t.getBoundingClientRect();
        var before = (e.clientY - rect.top) < rect.height / 2;
        t.classList.toggle("is-drop-before", before);
        t.classList.toggle("is-drop-after", !before);
      });
      U.on(r, "drop", ".vq2-qcard[data-qid]", function (e, t) {
        if (!dragId) return;
        e.preventDefault();
        var rect = t.getBoundingClientRect();
        var before = (e.clientY - rect.top) < rect.height / 2;
        moveQuestion(dragId, t.getAttribute("data-qid"), before);
      });
    }

    function wireEditor() {
      var r = app.root;
      U.on(r, "click", '[data-act="dup"]', function () { duplicateQuestion(st.selectedId); });
      /* 編集画面から AI 修正へ。対象はいま開いている問題。 */
      U.on(r, "click", '[data-act="ai-fix-this"]', function () {
        if (st.aiBusy) { app.toast("AI が処理中です。終わるまでお待ちください。", "warning"); return; }
        st.mode = "auto";
        st.reviseScope = "question";
        if (app.isMobile()) st.pane = "left";
        render();
        var box = app.root.querySelector('[data-key="autoInstruction"]');
        if (box) { try { box.focus(); } catch (e) {} }
      });
      U.on(r, "click", '[data-act="del"]', function () { deleteQuestions([st.selectedId]); });
      U.on(r, "click", '[data-act="prev"]', function () { step(-1); });
      U.on(r, "click", '[data-act="next"]', function () { step(1); });
      function step(d) {
        var i = indexOfQ(st.selectedId);
        var n = st.preset.questions[i + d];
        if (n) { st.selectedId = n.id; renderEditor(); renderList(); }
      }

      U.on(r, "input", '.vq2-qcard-b [data-key]', function (e, t) {
        var q = selected(); if (!q) return;
        var key = t.getAttribute("data-key");
        if (key === "prompt") setQ(q.id, "prompt", t.value, "問題文を編集");
        else if (key === "explanation") setQ(q.id, "explanation", t.value, "解説を編集");
        else if (key === "topic") setQ(q.id, "topic", t.value, "単元を編集");
        else if (key === "correctAnswer") setQ(q.id, "correctAnswer", t.value, "正解を編集");
        else if (key === "tags") setQ(q.id, "tags", t.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean), "タグを編集");
        else if (key === "acceptedAnswers") setQ(q.id, "acceptedAnswers", t.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean), "別解を編集");
        else if (key === "points") {
          var pv = Number(t.value) || 0;
          /* 採点基準があるなら、合計が配点と合うように比率を保って直す。
             合っていないと保存できないので、配点を触るたびに手で直させない。 */
          if (S.isAiGraded(q.type) && q.scoringRubric) q.scoringRubric = S.rescaleRubric(q.scoringRubric, pv);
          setQ(q.id, "points", pv, "配点を編集");
          renderRubric();
        }
        else if (key === "rubDesc") { updateRubric(q, t.getAttribute("data-rid"), "description", t.value); }
        else if (key === "rubPoints") {
          updateRubric(q, t.getAttribute("data-rid"), "points", Number(t.value) || 0);
          paintRubricSum();
        }
        else if (key === "choiceText" || key === "choiceExp") {
          var c = (q.choices || []).find(function (x) { return x.id === t.getAttribute("data-cid"); });
          if (!c) return;
          c[key === "choiceText" ? "text" : "explanation"] = t.value;
          change("選択肢を編集", key + ":" + c.id);
        }
        renderList();
      });
      U.on(r, "click", '[data-act="pick-type"]', function () {
        var q = selected(); if (!q || !QP) return;
        QP.open({ current: q.type, subject: (q.metadata && q.metadata.subject) || "" }).then(function (picked) {
          if (!picked || picked === q.type) return;
          var written = (q.choices || []).filter(function (c) { return String(c.text || "").trim(); });
          var losesChoices = QT.hasChoices(q.type) && !QT.hasChoices(picked) && written.length;
          function go() {
            var next = QE.convert(q, picked);
            var i = st.preset.questions.findIndex(function (x) { return x.id === q.id; });
            if (i >= 0) st.preset.questions[i] = next;
            change("形式を「" + QT.label(picked) + "」へ変更");
            renderEditor(); renderList();
          }
          if (losesChoices) {
            app.confirm({
              title: "形式を変えますか",
              body: "「" + QT.label(picked) + "」では選択肢を使いません。書いた選択肢は残しますが、出題には出ません。",
              okLabel: "変更する"
            }).then(function (yes) { if (yes) go(); });
            return;
          }
          go();
        });
      });
      U.on(r, "change", '.vq2-qcard-b [data-key="type"]', function (e, t) {
        var q = selected(); if (!q) return;
        var next = t.value;
        /* 選択肢を持たない形式へ移すとき、書いた選択肢を捨てる前に確認する。
           まだ何も書いていない空の選択肢しか無いなら、聞く意味がないので聞かない。 */
        var written = (q.choices || []).filter(function (c) { return String(c.text || "").trim(); });
        if (S.hasChoices(q.type) && !S.hasChoices(next) && written.length) {
          app.confirm({ title: "形式を変更しますか", body: "選択肢は残りますが、この形式では使われません。",
                        okLabel: "変更する" }).then(function (yes) {
            if (!yes) { renderEditor(); return; }
            if (S.isAiGraded(next) && !(q.scoringRubric && (q.scoringRubric.items || []).length))
              q.scoringRubric = S.defaultRubric(next, Number(q.points) || 1);
            setQ(q.id, "type", next, "形式を変更"); renderEditor(); renderList();
          });
          return;
        }
        if (!S.hasChoices(q.type) && S.hasChoices(next) && !(q.choices || []).length) {
          q.choices = [S.emptyChoice("A", ""), S.emptyChoice("B", ""), S.emptyChoice("C", ""), S.emptyChoice("D", "")];
        }
        /* AI が採点する形式へ変えたら、採点基準の下敷きを用意する。
           無いまま保存すると、解いたときに未採点のまま残る。 */
        if (S.isAiGraded(next) && !(q.scoringRubric && (q.scoringRubric.items || []).length))
          q.scoringRubric = S.defaultRubric(next, Number(q.points) || 1);
        setQ(q.id, "type", next, "形式を変更");
        renderEditor(); renderList();
      });
      U.on(r, "change", '.vq2-qcard-b [data-key="difficulty"]', function (e, t) {
        var q = selected(); if (!q) return;
        setQ(q.id, "difficulty", t.value, "難易度を変更"); renderList();
      });
      U.on(r, "change", '.vq2-qcard-b [data-key="requiresReview"]', function (e, t) {
        var q = selected(); if (!q) return;
        setQ(q.id, "requiresReview", t.checked, "要確認を変更"); renderList();
      });
      U.on(r, "click", '[data-act="mark-correct"]', function (e, t) {
        var q = selected(); if (!q) return;
        var cid = t.getAttribute("data-id");
        (q.choices || []).forEach(function (c) {
          if (q.type === "multiple_choice_multiple") { if (c.id === cid) c.isCorrect = !c.isCorrect; }
          else c.isCorrect = (c.id === cid);
        });
        change("正解を変更");
        renderEditor(); renderList();
      });
      U.on(r, "click", '[data-act="add-choice"]', function () {
        var q = selected(); if (!q) return;
        q.choices = q.choices || [];
        if (q.choices.length >= 10) { app.toast("選択肢は 10 個までです。", "warning"); return; }
        q.choices.push(S.emptyChoice(String.fromCharCode(65 + q.choices.length), ""));
        relabel(q);
        change("選択肢を追加");
        renderEditor();
      });
      U.on(r, "click", '[data-act="del-choice"]', function (e, t) {
        var q = selected(); if (!q) return;
        var cid = t.getAttribute("data-id");
        q.choices = (q.choices || []).filter(function (c) { return c.id !== cid; });
        relabel(q);
        change("選択肢を削除");
        renderEditor(); renderList();
      });
      function relabel(q) {
        (q.choices || []).forEach(function (c, i) { c.label = String.fromCharCode(65 + i); });
      }

      /* ── 採点基準 ─────────────────────────────────────────── */
      U.on(r, "change", '.vq2-qcard-b [data-key="rubCriterion"]', function (e, t) {
        var q = selected(); if (!q) return;
        updateRubric(q, t.getAttribute("data-rid"), "criterionId", t.value);
      });
      U.on(r, "click", '[data-act="rubric-default"]', function () {
        var q = selected(); if (!q) return;
        q.scoringRubric = S.defaultRubric(q.type, Number(q.points) || 1);
        change("採点基準を作成");
        renderEditor(); renderList();
      });
      U.on(r, "click", '[data-act="rubric-add"]', function () {
        var q = selected(); if (!q) return;
        var items = (q.scoringRubric && q.scoringRubric.items) ? q.scoringRubric.items.slice() : [];
        if (items.length >= 8) { app.toast("採点基準は 8 個までです。", "warning"); return; }
        items.push({ id: "r" + (items.length + 1), description: "", points: 1,
                     criterionId: "thinking_judgment_expression" });
        q.scoringRubric = { items: items };
        change("採点基準を追加");
        renderEditor();
      });
      U.on(r, "click", '[data-act="rubric-del"]', function (e, t) {
        var q = selected(); if (!q || !q.scoringRubric) return;
        var rid = t.getAttribute("data-id");
        var items = q.scoringRubric.items.filter(function (x) { return x.id !== rid; });
        items.forEach(function (x, i) { x.id = "r" + (i + 1); });
        q.scoringRubric = items.length ? { items: items } : null;
        change("採点基準を削除");
        renderEditor();
      });
      U.on(r, "click", '[data-act="rubric-fit"]', function () {
        var q = selected(); if (!q || !q.scoringRubric) return;
        q.scoringRubric = S.rescaleRubric(q.scoringRubric, Number(q.points) || 0);
        change("採点基準の合計を調整");
        renderEditor();
      });
    }

    /* 入力のたびに描き直すと打ちにくいので、値だけ差し替えて検証し直す。 */
    function updateRubric(q, rid, key, value) {
      if (!q.scoringRubric || !Array.isArray(q.scoringRubric.items)) return;
      var it = q.scoringRubric.items.find(function (x) { return x.id === rid; });
      if (!it) return;
      it[key] = value;
      q.updatedAt = S.nowIso();
      change("採点基準を編集", "rubric:" + rid + ":" + key);
    }

    function wireAi() {
      var r = app.root;
      chat.startHero();
      chat.paintEta();

      /* 検証・修復は中央タブへ移した。旧いボタン名はタブの切り替えとして残す。 */
      U.on(r, "click", '[data-act="mode-auto"]', function () { st.mode = "auto"; st.tab = "questions"; renderCenter(); });
      U.on(r, "click", '[data-act="mode-manual"]', function () { st.mode = "manual"; st.tab = "verify"; renderCenter(); });
      U.on(r, "click", '[data-act="revalidate"]', function () { revalidate(); st.tab = "verify"; render(); });

      U.on(r, "input", '[data-key="autoInstruction"]', function (e, t) { st.autoInstruction = t.value; });
      U.on(r, "change", '[data-key="mixStyle"]', function (e, t) {
        st.mixStyle = t.value;
        var sty = (QPL ? QPL.STYLES.filter(function (x) { return x.id === t.value; })[0] : null);
        if (sty) app.toast(sty.label + "：" + sty.desc, "info");
        /* 配分の決め方が変わったら、生成条件は決め直し（§45）。 */
        invalidateCondition();
        paintComposer();
      });
      U.on(r, "click", '[data-act="open-mix"]', function () { openMixSheet(); });
      U.on(r, "change", '[data-key="sourceOnly"]', function (e, t) {
        st.sourceOnly = t.checked;
        /* 開き直したときに戻す。ここを保存しないと、資料限定を切ったのに
           次に開くと入った状態へ勝手に戻る。 */
        persistAttachments();
      });

      /* ── 補助の条件（依頼文があいまいなときだけ効く）── */

      /* ── AI 修正の対象 ── */
      U.on(r, "click", '[data-act="scope-question"]', function () { st.reviseScope = "question"; renderCenter(); });
      U.on(r, "click", '[data-act="scope-preset"]', function () { st.reviseScope = "preset"; renderCenter(); });

      U.on(r, "click", '[data-act="attach"]', function () { pickAttachments(); });
      U.on(r, "click", '[data-act="attach-del"]', function (e, t) { removeAttachment(t.getAttribute("data-id")); });
      /* 停止：分割生成の途中なら、そこまでの問題は残す */
      U.on(r, "click", '[data-act="ai-stop"]', function () {
        st.aiCancelled = true;
        AI.cancel();
        app.toast("停止しています…", "info");
      });
      U.on(r, "click", '[data-act="ai-generate"]', function () { runAi("generate"); });
      U.on(r, "click", '[data-act="ai-revise"]', function () { runAi("revise"); });
      U.on(r, "click", '[data-act="ai-regenerate"]', function () { st.diff = null; runAi(st.preset.questions.length ? "revise" : "generate"); });
      U.on(r, "click", '[data-act="quick"]', function (e, t) {
        st.autoInstruction = t.getAttribute("data-id");
        renderLeft();
        runAi("revise");
      });
      U.on(r, "click", '[data-act="discard-rejected"]', function () { st.rejected = []; renderCenter(); });

      U.on(r, "click", '[data-act="apply-all"]', function () {
        /* 修復から出した修正案は、修復側の確認を通してから反映する。 */
        if (st.repairCtx && st.repairCtx.backfill) { applyBackfill(); return; }
        if (st.repairCtx) { applyRepair("all"); return; }
        applyAi("all");
      });
      U.on(r, "click", '[data-act="apply-selected"]', function () {
        if (st.repairCtx && st.repairCtx.backfill) { applyBackfill(); return; }
        if (st.repairCtx) { applyRepair("selected"); return; }
        applySelectedFields();
      });
      U.on(r, "click", '[data-act="discard-diff"]', function () {
        if (st.repairCtx) { cancelRepair(); return; }
        st.diff = null; D.setDraftState(st.draft, "draft"); renderAiPane();
      });

      /* 検証エラーの AI 修復 */
      U.on(r, "change", "[data-issue]", function (e, t) {
        st.repairSel[t.getAttribute("data-issue")] = t.checked;
        renderVerifyPane();
      });
      U.on(r, "click", '[data-act="issue-jump"]', function (e, t) {
        var id = t.getAttribute("data-id");
        if (!id) return;
        st.selectedId = id;
        st.tab = "questions"; if (app.isMobile()) st.pane = "main";
        render();
      });
      U.on(r, "click", '[data-act="repair-question"]', function (e, t) {
        startRepair("question", t.getAttribute("data-id"));
      });
      U.on(r, "click", '[data-act="repair-selected"]', function () { startRepair("selected"); });
      U.on(r, "click", '[data-act="repair-all"]', function () { startRepair("all"); });
      U.on(r, "click", '[data-act="repair-backfill"]', function () { startBackfill(); });
      U.on(r, "click", '[data-act="repair-dismiss"]', function () {
        st.repairDone = null; renderVerifyPane();
      });
      U.on(r, "change", "[data-diffsel]", function (e, t) {
        st.diffSelection[t.getAttribute("data-diffsel")] = t.checked;
      });
      U.on(r, "click", "[data-difftoggle]", function (e, t) {
        var id = t.getAttribute("data-difftoggle");
        st.collapsedDiff[id] = !st.collapsedDiff[id];
        renderAiPane();
      });
    }

    /* 項目単位のチェックを集めて適用する */
    function applySelectedFields() {
      if (!st.diff) return;
      var sel = { questionIds: [], fields: {} };
      var r = app.root;
      st.diff.changes.forEach(function (c) {
        if (!st.diffSelection[c.questionId]) return;
        if (c.kind !== "modify") { sel.questionIds.push(c.questionId); return; }
        var picked = [];
        c.fields.forEach(function (f) {
          var box = r.querySelector('[data-fieldsel="' + cssEscape(c.questionId) + "|" + cssEscape(f.field) + '"]');
          if (!box || box.checked) picked.push(f.field);
        });
        if (picked.length === c.fields.length) sel.questionIds.push(c.questionId);
        else if (picked.length) sel.fields[c.questionId] = picked;
      });
      if (!sel.questionIds.length && !Object.keys(sel.fields).length) {
        app.toast("適用する変更を選んでください。", "warning"); return;
      }
      applyAi(sel);
    }
    function cssEscape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

    /* ── 添付 ───────────────────────────────────────────────── */
    /* 資料の添付。読み取りは共通実装（U.pickAttachments）に任せる。 */
    /* ══════════════════════════════════════════════════════════
       資料の添付

       ・AI へ送る形（本文・base64）と、画面へ出す形（名前・形式・大きさ・状態）を
         別々に持つ。片方だけだと「付いているのに読めたか分からない」になる。
       ・付け外しはそのつどプリセットへ保存する。閉じて開き直しても残す。
       ══════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════
       分割アップロード（大きな資料）

       本体を要求 JSON へ載せない。8MiB ずつ送り、あとは attachmentId だけを回す。
       ・送っている途中も、止めたあとも、チップは消さない
       ・落ちたパートだけ送り直せる（96MB を最初からやり直さない）
       ・開き直しても、置き場所が生きていれば選び直さずに使える
       ══════════════════════════════════════════════════════════ */
    function upSession() {
      if (!st.upSession) {
        st.upSession = new VQ2.upload.Session({
          jobId: st.upJobId || null,
          onChange: function () { syncUploadDisplay(); }
        });
      }
      return st.upSession;
    }
    /* 送信中の状態を、そのままチップへ写す。ここが唯一の書き換え口。 */
    function syncUploadDisplay() {
      var S = st.upSession;
      if (!S) return;
      st.upJobId = S.jobId;
      /* 置き場所の ID は、開き直したときの復元と、確認のために外から引ける。 */
      try { VQ2.__psJobId = S.jobId; } catch (e) {}
      S.tasks.forEach(function (t) {
        /* ページ画像は親のチップの中で語る。1 枚ずつチップにしない
           （48 ページの資料でチップが 48 枚並ぶことになる）。 */
        if (t.isPageImage) return;
        var d = st.attachDisplay.filter(function (x) { return x.id === t.id; })[0];
        if (!d) {
          d = { id: t.id, name: t.name, kind: t.kind, size: t.size };
          st.attachDisplay.push(d);
        }
        d.name = t.name; d.kind = t.kind; d.size = t.size;
        d.status = t.state === "uploaded" ? "queued"
          : t.state === "cancelled" ? "cancelled"
          : t.state === "expired" ? "expired"
          : t.state === "paused" ? "paused"
          : t.state === "failed" ? "failed" : "uploading";
        d.statusText = t.message || "";
        d.upload = t.progress();
        d.attachmentId = t.attachmentId;
        d.jobId = t.jobId;
      });
      persistAttachments();
      paintComposer();
    }

    /* 分割アップロードで資料を足す。

       やることは 2 つある。
       ・本体を 8MiB ずつ送る（要求 JSON へ載せない）
       ・PDF・DOCX・ZIP は、この端末で文章を取り出す
         （PDF.js はブラウザ側にしか無い。サーバは PDF を開けない）
       取り出した文章は上限つきで要求へ入るが、**本体は入らない**。
       文字の無いページは画像にして、それも送ってから ID で指す。 */
    function pickUploads() {
      var input = root.document.createElement("input");
      input.type = "file"; input.multiple = true;
      input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.docx,.zip";
      input.addEventListener("change", function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) return;
        var S = upSession();
        actPanel.push({ kind: "upload", status: "running",
                        title: files.length + " 件の資料を送っています",
                        short: "本体は要求へ載せず、8MiB ずつ送ります" });
        /* 取り込みが終わるまでを 1 本の約束にしておく。
           送信が済んでも、文章の取り出しとページ画像の送信がまだ残っている。
           ここを待たずに生成へ入ると、資料が付いていないまま作り始める
           （実測：テキスト PDF で 0 問、スキャン PDF で画像解析へ回らなかった）。 */
        /* 印は S.add より**前**に立てる。S.add はその場でチップを 1 枚出すので、
           あとから立てると「まだ取り込み中なのに、もう終わった」ように見える一瞬ができる。 */
        st.attachBusy = true;
        try { VQ2.__psAttachBusy = true; } catch (e) {}
        st.attachPending = S.add(files).then(function (tasks) {
          syncUploadDisplay();
          return extractLocally(files, tasks).then(function () { return tasks; });
        }).then(function (tasks) {
          var ok = tasks.filter(function (t) { return t.state === "uploaded"; });
          var ng = tasks.filter(function (t) { return t.state === "failed" || t.state === "expired"; });
          rebuildAttachmentsFromUploads();
          syncUploadDisplay();
          actPanel.push({
            kind: ng.length && !ok.length ? "error" : ng.length ? "warning" : "upload",
            status: ng.length && !ok.length ? "error" : ng.length ? "warn" : "done",
            title: ok.length ? ok.length + " 件の資料を送り終えました" : "資料を送れませんでした",
            short: ng.length ? ng.length + " 件は送れていません" : "",
            bash: { name: "資料を送信", in: tasks.map(function (t) { return t.name; }),
                    out: tasks.map(function (t) {
                      var p = t.progress();
                      return { k: t.name, v: p.sentParts + "/" + p.totalParts + " 個・"
                        + VQ2.upload.fmtBytes(t.sentBytes)
                        + (t.extractedChars ? " ／ 本文 " + t.extractedChars + " 字" : "")
                        + (t.pageImageCount ? " ／ 画像 " + t.pageImageCount + " ページ" : "") };
                    }),
                    summary: ok.length + " / " + tasks.length + " 件" }
          });
        }).then(function () {
          st.attachBusy = false;
          try { VQ2.__psAttachBusy = false; } catch (e) {}
          paintComposer();
        }, function () {
          st.attachBusy = false;
          try { VQ2.__psAttachBusy = false; } catch (e) {}
          paintComposer();
        });
        paintComposer();
      });
      input.click();
    }

    /* この端末で文章を取り出す（PDF・DOCX・ZIP・テキスト）。
       画像はここを通さない（読み取りは AI 側の仕事）。 */
    function extractLocally(files, tasks) {
      var F = root.__vqChatFiles;
      var need = tasks.filter(function (t) { return t.kind !== "image" && t.state === "uploaded"; });
      if (!F || !need.length) return Promise.resolve();
      var pick = files.filter(function (f) {
        return need.some(function (t) { return t.name === f.name && t.size === f.size; });
      });
      if (!pick.length) return Promise.resolve();
      return Promise.resolve(F.add(pick)).then(function () {
        return waitExtract(F);
      }).then(function (items) {
        need.forEach(function (t) {
          var it = items.filter(function (x) { return x.name === t.name; })[0];
          if (!it) return;
          t.extractedText = String(it.text || "");
          t.extractedChars = t.extractedText.length;
          t.pageCount = it.pageCount || 0;
          t.pages = (it.pages || []).filter(function (p) { return p.text; })
            .map(function (p) { return p.pageNumber; });
          t.localId = it.id;
          t.pageImages = it.pageImages || [];
          t.pageImageCount = t.pageImages.length;
        });
        /* 文字の取れなかったページを画像として送る。
           ここでも base64 を要求へ載せない。送ってから ID で指す。 */
        return uploadPageImages(need);
      }).catch(function () { /* 取り出せなくても、本体は送れている */ });
    }
    function waitExtract(F) {
      return new Promise(function (res) {
        var t0 = Date.now();
        (function poll() {
          var items = F.list();
          var busy = items.some(function (x) {
            return x.status === "queued" || x.status === "extracting";
          });
          if ((!busy && items.length) || Date.now() - t0 > 180000) { res(items); return; }
          root.setTimeout(poll, 300);
        })();
      });
    }
    /* ページ画像を送る。1 ページ = 1 添付として、親の ID を持たせる。 */
    function uploadPageImages(tasks) {
      var S = upSession();
      var jobs = [];
      tasks.forEach(function (t) {
        (t.pageImages || []).forEach(function (pi) {
          var b64 = String(pi.dataUrl || "");
          var c = b64.indexOf(",");
          if (c < 0) return;
          jobs.push({ parent: t, pageNumber: pi.pageNumber, data: b64.slice(c + 1) });
        });
      });
      if (!jobs.length) return Promise.resolve();
      /* ページ画像は上限の範囲でだけ送る。超えた分は「送っていない」と残す。 */
      var cap = (U.scanPageLimit && U.scanPageLimit()) || 12;
      var take = jobs.slice(0, cap);
      if (jobs.length > take.length)
        actPanel.push({ kind: "warning", status: "warn",
                        title: cap + " ページまでを画像として送りました",
                        short: "残り " + (jobs.length - take.length) + " ページは送っていません" });
      return take.reduce(function (chain, j) {
        return chain.then(function () {
          var bin = root.atob(j.data);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          var file = new root.File([arr], j.parent.name + "（" + j.pageNumber + "ページ）.png",
                                   { type: "image/png" });
          /* 印は送り始める前に立てる。あとからだとチップが 1 枚できてしまう。 */
          return S.add([file], { mark: {
            isPageImage: true,
            parentAttachmentId: j.parent.attachmentId,
            pageNumber: j.pageNumber
          } });
        });
      }, Promise.resolve());
    }

    /* 送り終えたものを attachmentId だけの形にする。**本体は入れない。** */
    function rebuildAttachmentsFromUploads() {
      var S = st.upSession;
      if (!S) return;
      var refs = S.tasks.map(function (t) {
        var r = t.ref();
        if (!r) return null;
        /* この端末で取り出した文章だけを添える（上限つき）。本体は付けない。 */
        if (t.extractedText) {
          r.extractedText = t.extractedText;
          r.extractedCharacterCount = t.extractedText.length;
        }
        if (t.pageCount) r.pageCount = t.pageCount;
        if (t.pages && t.pages.length) r.pages = t.pages;
        if (t.parentAttachmentId) r.parentAttachmentId = t.parentAttachmentId;
        if (t.pageNumber) r.pageNumber = t.pageNumber;
        return r;
      }).filter(Boolean);
      /* 従来の（本体を持つ）添付は残し、アップロード由来のものだけ入れ替える */
      var others = st.attachments.filter(function (a) { return !a.jobId; });
      st.attachments = others.concat(refs);
      persistAttachments();
    }

    /* 送信の操作。止める・続ける・落ちた分だけ送り直す。 */
    function uploadAction(kind, id) {
      var S = st.upSession;
      var t = S && S.get(id);
      if (!t) return;
      if (kind === "pause") { t.pause(); syncUploadDisplay(); return; }
      var run = kind === "resume" ? t.resume() : t.retryFailed();
      Promise.resolve(run).then(function () {
        syncUploadDisplay();
        rebuildAttachmentsFromUploads();
      });
    }

    function pickAttachments() {
      /* 分割アップロードの口が居るなら、そちらを使う（本体を JSON へ載せない）。 */
      if (VQ2.upload && root.__vqLocalAI) { pickUploads(); return; }
      U.pickAttachments({
        /* **文字層の無いページを画像として渡す。**
           渡さないと、スキャンした PDF や写真のページは
           「文字も画像も無い添付」として **AI へ届く前に捨てられる**
           （shell.js の toAiAttachments が `extractedText || imageBase64` で選ぶため）。
           資料を付けたのに「資料から出題できない」と言われるのはこれが原因だった。
           Quick Mock は前から渡していた。プリセット作成だけ抜けていた。 */
        pageImages: true,
        onStart: function (n) {
          st.attachBusy = true;
          /* 取り込み中であることを、そのままチップにも出す */
          st.attachDisplay = st.attachDisplay.concat(
            new Array(n).join(",").split(",").map(function (_, i) {
              return { id: "pending" + i, name: "読み込んでいます…", kind: "text",
                       size: 0, status: "uploading" };
            }));
          paintComposer();
          actPanel.push({ kind: "upload", status: "running", title: n + " 件の資料を取り込んでいます" });
        }
      }).then(function (r) {
        st.attachBusy = false;
        if (!r) { st.attachDisplay = st.attachDisplay.filter(notPending); paintComposer(); return; }
        st.attachments = r.attachments;
        st.attachDisplay = r.display || [];
        persistAttachments();
        paintComposer();
        logAttachOutcome(r);
      }).catch(function (e) {
        st.attachBusy = false;
        st.attachDisplay = st.attachDisplay.filter(notPending);
        paintComposer();
        if (e && e.message === "NO_FILE_MODULE") {
          app.alert({ title: "資料を添付できません",
                      body: "添付の処理部品が読み込まれていません。ページを再読み込みしてください。" });
        } else {
          actPanel.push({ kind: "error", status: "error", title: "資料を受け取れませんでした",
                          short: String((e && e.message) || "もう一度お試しください。") });
        }
      });
    }
    function notPending(a) { return String(a.id).indexOf("pending") !== 0; }

    /* 取り込みの結果を、読めた／一部だけ／読めなかった に分けて出す。 */
    function logAttachOutcome(r) {
      var disp = r.display || [];
      var ok = disp.filter(function (d) { return d.status === "ready"; });
      var part = disp.filter(function (d) { return d.status === "warning" || d.unreadablePages; });
      var bad = disp.filter(function (d) { return d.status === "failed" || d.status === "error"; });
      var out = ok.map(function (d) {
        return { k: d.name, v: (d.kind === "image" ? "画像" : (d.pageCount ? d.pageCount + "ページ" : ""))
          + (d.characterCount ? " / " + d.characterCount + "字" : "") };
      });
      actPanel.push({
        kind: bad.length && !ok.length ? "error" : part.length || bad.length ? "warning" : "upload",
        status: bad.length && !ok.length ? "error" : part.length || bad.length ? "warn" : "done",
        title: ok.length ? ok.length + " 件の資料を読み取りました" : "資料を読み取れませんでした",
        short: [part.length ? part.length + " 件は一部のみ" : "",
                bad.length ? bad.length + " 件は読み取れず" : ""].filter(Boolean).join(" ／ "),
        bash: out.length ? { name: "資料を取り込み", in: disp.map(function (d) { return d.name; }), out: out,
                             summary: ok.length + " / " + disp.length + " 件" } : null,
        actions: bad.length
          ? [{ id: "attach-retry-all", label: "もう一度解析する", icon: "refresh", variant: "primary" },
             { id: "attach-add", label: "別の資料を追加", icon: "plus" }]
          : null
      });
    }

    /* ══════════════════════════════════════════════════════════
       ページごとの読み取り結果と、部分成功のときの 4 つの手

       サーバは資料ごとに「何ページ読めて、何ページ読めなかったか」を返す。
       1 ページ落ちただけで資料ごと捨てないための情報なので、
       そのまま画面へ出し、次の一手を選べるようにする。
       ══════════════════════════════════════════════════════════ */
    /* サーバの解析ジョブ 13 状態 → 添付カードの表示。対応表はここだけに置く。 */
    var ANALYSIS_TO_CHIP = {
      queued: "queued", uploading: "uploading", uploaded: "uploaded",
      classifying: "analyzing", extracting_text: "analyzing",
      rendering_pages: "analyzing", running_ocr: "analyzing",
      analyzing_figures: "analyzing", building_evidence: "analyzing",
      completed: "ready", partially_completed: "partially_ready",
      failed: "unreadable", canceled: "cancelled"
    };
    function applyPageAnalysis(list) {
      if (!list || !list.length) return;
      list.forEach(function (j) {
        /* 資料の ID が来ていないときは、いま付いている資料のものとして扱う
           （確認用の差し込み口から呼ばれたとき）。 */
        if (!j.attachmentId && st.attachDisplay.length)
          j.attachmentId = st.attachDisplay[0].attachmentId || st.attachDisplay[0].id;
        st.pageAnalysis[j.attachmentId] = j;
      });
      /* チップへ写す。どの資料の話かは attachmentId で結ぶ。 */
      st.attachDisplay.forEach(function (d) {
        var j = st.pageAnalysis[d.attachmentId] || st.pageAnalysis[d.id];
        if (!j) return;
        d.pages = j.pages || [];
        d.pageSummary = j.summary || "";
        /* 全部読めたときは手を出さない。迷わせない。 */
        d.pageActions = (j.outcome === "partial" || j.outcome === "failed") ? (j.actions || []) : [];
        /* 表示はサーバの解析ジョブの状態から決める。画面側で作らない。
             queued / uploading / uploaded → 解析待ち
             classifying 〜 building_evidence → 読み取り中
             completed → 文字起こし済み / partially_completed → 一部読み取り
             failed → 読み取れません / canceled → 取り消し */
        d.status = ANALYSIS_TO_CHIP[j.state] || d.status;
      });
      persistAttachments();
      paintComposer();
    }

    /* 確認用の差し込み口。解析結果を実際に走らせずに入れられるようにする
       （ページ読み取りに数分かける代わりに、同じ形の結果を渡して画面の動きを見る）。 */
    try { VQ2.__psApplyAnalysis = applyPageAnalysis; } catch (e) {}

    function pageAction(act, id) {
      var d = st.attachDisplay.filter(function (x) { return x.id === id; })[0];
      var j = d && (st.pageAnalysis[d.attachmentId] || st.pageAnalysis[d.id]);
      if (!d) return;
      if (act === "cancel") { removeAttachment(id); return; }
      if (act === "use_readable") {
        /* 読めたページだけで進める＝読めなかったページを外して生成へ入る。 */
        var bad = ((j && j.failedPages) || []).slice();
        markExcluded(d, bad);
        app.toast(bad.length
          ? bad.length + " ページを外して進みます。" : "読めたページだけで進みます。", "info");
        d.pageActions = [];
        paintComposer();
        return;
      }
      if (act === "exclude_pages") {
        markExcluded(d, ((j && j.failedPages) || []).slice());
        app.toast("読めないページを資料から外しました。", "info");
        paintComposer();
        return;
      }
      if (act === "retry_failed") {
        /* 読み直しは、その資料だけをもう一度読ませる。
           いまの経路では生成の前段で読むため、外していたページを戻して作り直す。 */
        markExcluded(d, []);
        actPanel.push({ kind: "upload", status: "running",
                        title: "「" + d.name + "」を読み直しています",
                        short: ((j && j.failedPages) || []).length + " ページが対象です" });
        composerSend("");
        return;
      }
    }
    function markExcluded(d, pages) {
      var key = d.attachmentId || d.id;
      st.excludedPages[key] = pages || [];
      (d.pages || []).forEach(function (p) {
        if ((pages || []).indexOf(p.pageNumber) >= 0) p.status = "excluded";
      });
      persistAttachments();
    }

    function removeAttachment(id) {
      /* 分割アップロードのものは、置き場所からも消す。 */
      var S = st.upSession;
      if (S && S.get(id)) {
        var t = S.get(id);
        var gone = [t.attachmentId];
        /* その資料から作ったページ画像も一緒に外す。
           残すと、チップが 1 枚も無いのに置き場所が消えない。 */
        S.tasks.filter(function (x) {
          return x.parentAttachmentId && x.parentAttachmentId === t.attachmentId;
        }).forEach(function (x) { gone.push(x.attachmentId); S.remove(x.id); });
        S.remove(id);
        st.attachments = st.attachments.filter(function (a) {
          return gone.indexOf(a.attachmentId) < 0;
        });
        st.attachDisplay = st.attachDisplay.filter(function (a) { return a.id !== id; });
        if (!S.tasks.length) { S.drop(); st.upJobId = null; }
        persistAttachments();
        paintComposer();
        return;
      }
      U.removeAttachment(id);
      st.attachments = st.attachments.filter(function (a) {
        return a.id !== id && a.parentAttachmentId !== id;
      });
      st.attachDisplay = st.attachDisplay.filter(function (a) { return a.id !== id; });
      persistAttachments();
      paintComposer();
    }
    /* 解析のやり直し。元ファイルは添付部品が持っているので、そこから取り直す。 */
    function retryAttachment(id) {
      var F = root.__vqChatFiles;
      var target = st.attachDisplay.filter(function (a) { return a.id === id; })[0];
      if (!F || typeof F.retry !== "function") {
        /* やり直しの口が無いときは、正直に「選び直してください」と言う。 */
        app.alert({ title: "もう一度解析できません",
                    body: (target ? "「" + target.name + "」は" : "この資料は")
                      + "解析をやり直す口がありません。いったん外して、もう一度選び直してください。" })
          .then(function () { removeAttachment(id); });
        return;
      }
      actPanel.push({ kind: "upload", status: "running",
                      title: (target ? target.name : "資料") + " をもう一度読み取っています" });
      Promise.resolve(F.retry(id)).then(function () {
        /* 取り直しでも同じ条件で（ここだけ画像を落とすと、復元のたびに資料が痩せる）。 */
        var cur = U.currentAttachments({ pageImages: true });
        st.attachments = cur.attachments;
        st.attachDisplay = cur.display;
        persistAttachments();
        paintComposer();
        logAttachOutcome(cur);
      }).catch(function () {
        actPanel.push({ kind: "error", status: "error", title: "もう一度読み取れませんでした" });
        paintComposer();
      });
    }
    function persistAttachments() {
      if (!st.preset || !st.preset.id) return;
      /* いまどのプリセットを開いているか。開き直しの確認で外から引ける。 */
      try { VQ2.__psPresetId = st.preset.id; } catch (e) {}
      try {
        ST.saveAttachments(st.preset.id, st.attachments, st.attachDisplay, {
          /* 置き場所の ID とページの読み取り結果も一緒に残す。
             本体は残さない（localStorage に 96MB は入らないし、入れる必要も無い）。 */
          jobId: st.upJobId || null,
          pageAnalysis: st.pageAnalysis,
          excludedPages: st.excludedPages,
          sourceOnly: st.sourceOnly,
          /* 出題形式の指定も一緒に残す。開き直したときに戻さないと、
             「4 択を使わない」と決めたのに次は 4 択で作り始める。 */
          mix: { style: st.mixStyle, types: st.mixTypes, exclude: st.mixExclude, flags: st.mixFlags }
        });
      } catch (e) {}
    }
    /* 開き直したときに戻す。
       分割アップロードのものは Bridge の置き場所に本体が残っている（2 時間）。
       生きていれば選び直さずに使える。消えていれば、そう書く。 */
    function restoreAttachments() {
      var r = { attachments: [], display: [] };
      try { r = ST.loadAttachments(st.preset.id) || r; } catch (e) {}
      st.attachments = (r.attachments || []).filter(function (a) { return !a.__dropped; });
      st.pageAnalysis = (r.meta && r.meta.pageAnalysis) || {};
      st.excludedPages = (r.meta && r.meta.excludedPages) || {};
      st.upJobId = (r.meta && r.meta.jobId) || null;
      if (r.meta && typeof r.meta.sourceOnly === "boolean") st.sourceOnly = r.meta.sourceOnly;
      var mix = r.meta && r.meta.mix;
      if (mix) {
        if (mix.style) st.mixStyle = mix.style;
        if (Array.isArray(mix.types)) st.mixTypes = mix.types.slice();
        if (Array.isArray(mix.exclude)) st.mixExclude = mix.exclude.slice();
        if (mix.flags) st.mixFlags = Object.assign(st.mixFlags, mix.flags);
      }
      st.attachDisplay = (r.display || []).map(function (d) {
        var kept = (r.attachments || []).filter(function (a) {
          return a.id === d.id || (d.attachmentId && a.attachmentId === d.attachmentId);
        })[0];
        if (kept && !kept.__dropped) return d;
        return Object.assign({}, d, { status: "unreadable",
          statusText: "大きすぎて持ち越せませんでした。選び直してください。" });
      });
      /* 置き場所がまだ生きているかを確かめる。答えが返るまでは触らない。 */
      if (st.upJobId && VQ2.upload) verifyRestoredUploads();
    }
    function verifyRestoredUploads() {
      VQ2.upload.restore(st.upJobId).then(function (job) {
        var alive = {};
        ((job && job.files) || []).forEach(function (f) {
          if (f.status === "uploaded") alive[f.attachmentId] = f;
        });
        var lost = 0;
        st.attachDisplay.forEach(function (d) {
          if (!d.attachmentId) return;
          if (alive[d.attachmentId]) {
            if (d.status === "uploading" || d.status === "paused") d.status = "queued";
            d.statusText = "";
            d.upload = null;
            return;
          }
          lost++;
          d.status = "expired";
          /* 期限切れを「復元できた」ように見せない。
             ID だけ残っていても中身は消えているので、そのまま使わせない。 */
          d.statusText = "この資料の一時データは期限切れです。もう一度添付してください";
          d.pages = [];
          d.pageSummary = "";
          d.pageActions = [];
        });
        if (lost) {
          /* 使えないものを AI へ渡さない。ID だけ残っていても中身が無い。 */
          st.attachments = st.attachments.filter(function (a) {
            return !a.attachmentId || alive[a.attachmentId];
          });
          st.upJobId = job ? st.upJobId : null;
        }
        persistAttachments();
        paintComposer();
        /* 何が戻ったのかを、外から確かめられる形で置く。 */
        try {
          VQ2.__psRestored = {
            jobId: st.upJobId,
            sourceOnly: st.sourceOnly,
            files: st.attachDisplay.map(function (d) {
              var j = st.pageAnalysis[d.attachmentId] || st.pageAnalysis[d.id] || null;
              var by = (j && j.byStatus) || {};
              return {
                id: d.id, attachmentId: d.attachmentId, jobId: d.jobId,
                name: d.name, size: d.size, kind: d.kind, mimeType: d.mimeType || "",
                uploadState: d.status,
                analysisState: j ? j.state : null,
                totalPages: j ? j.totalPages : 0,
                ok: by.ok || 0, low_confidence: by.low_confidence || 0,
                no_text_detected: by.no_text_detected || 0,
                failed: by.failed || 0, excluded: by.excluded || 0,
                excludedPages: (st.excludedPages[d.attachmentId] || []).slice(),
                pageEvidence: (d.pages || []).map(function (p) {
                  return { pageNumber: p.pageNumber, status: p.status,
                           characterCount: p.characterCount };
                }),
                actions: (d.pageActions || []).map(function (a) { return a.id; }),
                statusText: d.statusText || ""
              };
            })
          };
        } catch (e) {}
      });
    }

    /* ── プレビュー・設定 ──────────────────────────────────── */
    function openPreview() {
      var qs = st.preset.questions;
      if (!qs.length) { app.toast("プレビューする問題がありません。", "warning"); return; }
      var html = qs.slice(0, 30).map(function (q, i) {
        return '<div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--vq-border-subtle)">'
          + '<div style="font-weight:600;margin-bottom:6px">問 ' + numberOf(q, i) + "　" + esc(q.prompt) + "</div>"
          + (q.choices || []).map(function (c, ci) {
              return '<div style="padding:3px 0' + (c.isCorrect ? ";color:var(--vq-success-text);font-weight:600" : "") + '">'
                + String.fromCharCode(65 + ci) + ". " + esc(c.text) + (c.isCorrect ? "　✓" : "") + "</div>";
            }).join("")
          + (q.explanation ? '<div class="vq2-muted" style="margin-top:6px">' + esc(q.explanation) + "</div>" : "")
          + "</div>";
      }).join("");
      app.alert({ title: "プレビュー", wide: true, html: html + (qs.length > 30 ? '<p class="vq2-muted">ほか ' + (qs.length - 30) + " 問</p>" : ""), okLabel: "閉じる" });
    }

    /* ══════════════════════════════════════════════════════════════
       出題形式を決める（V3 §14 / §26 / §27）

       ・「AI におまかせ」でも、**頼む前に予定の内訳が見える**ようにする。
       ・指定した形式が使えないときは、理由と代わりを出す。
         黙って 4 択へ置き換えない。
       ・使える形式は、教材の中身と実装の状態から絞ったものだけを出す。
       ══════════════════════════════════════════════════════════════ */
    /* onDone は「決め終わったら呼んでほしい」相手（生成条件の確認シートが使う）。
       渡さなければ、これまでどおり閉じるだけ。 */
    function openMixSheet(onDone) {
      if (!QPL) return;
      var BP = VQ2.blueprint, DESC = VQ2.qdescriptor;
      var draft = {
        style: st.mixStyle || "auto",
        types: st.mixTypes.slice(),
        exclude: st.mixExclude.slice(),
        flags: Object.assign({}, st.mixFlags),
        openCat: ""
      };
      var sheet = U.mount("vq2-preset-mix", {
        title: "出題形式", sheet: true, stack: true, onResize: function () { draw(); }
      });
      draw();

      /* いまの指定で作れる候補と、その理由。 */
      function computed() {
        var analysis = BP
          ? BP.analyzeContent({ text: st.autoInstruction, attachments: st.attachDisplay })
          : null;
        var req = BP ? BP.extractRequirements(st.autoInstruction, {
          subject: (st.preset && st.preset.subject) || "",
          count: countFrom(st.autoInstruction) || 10,
          style: draft.style, sourceOnly: st.sourceOnly,
          requestedTypes: draft.types, excludedTypes: draft.exclude,
          noFourChoice: draft.flags.noFourChoice, noWriting: draft.flags.noWriting,
          noAiGrading: draft.flags.noAiGrading, noImage: draft.flags.noImage,
          noAudio: draft.flags.noAudio
        }) : null;
        var cand = (BP && req) ? BP.candidates(req, analysis, {}) : null;
        var plan = null;
        try {
          plan = QPL.planMix({
            count: (req && req.totalQuestions) || 10,
            style: draft.types.length ? "manual" : draft.style,
            types: draft.types,
            subject: (st.preset && st.preset.subject) || "",
            hints: BP ? BP.toHints(analysis) : QPL.hintsFromAttachments(st.attachDisplay, st.autoInstruction),
            exclude: excludeIds(cand),
            sourceOnly: st.sourceOnly,
            requirements: req
          });
        } catch (e) { plan = null; }
        return { analysis: analysis, req: req, cand: cand, plan: plan };
      }
      /* まとめて外す指定（4 択なし・記述なし…）を、形式の一覧へ落とす。 */
      function excludeIds(cand) {
        var out = draft.exclude.slice();
        if (!cand) return out;
        cand.excluded.forEach(function (e) {
          if (out.indexOf(e.type) < 0) out.push(e.type);
        });
        return out;
      }

      function draw() {
        var c = computed();
        var cand = c.cand, plan = c.plan;
        sheet.root.innerHTML =
          '<div class="vq2-top">'
          + U.button({ icon: "close", iconOnly: true, variant: "quiet", action: "x", aria: "閉じる" })
          + '<div class="vq2-top-title">出題形式</div></div>'
          + '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
          + '<div class="vq2-q" style="gap:14px;padding:16px">'
          + styleCard()
          + offCard()
          + planCard(plan, cand)
          + typesCard(cand)
          + "</div></div></div></div>"
          + '<div class="vq2-pd-foot">'
          + '<div class="vq2-top-sp"></div>'
          + U.button({ label: "やめる", variant: "quiet", action: "x" })
          + U.button({ label: "この形式で頼む", icon: "check", variant: "primary", action: "ok" })
          + "</div>";
        wire();
      }

      function styleCard() {
        return '<div class="vq2-card"><div class="vq2-sec-t">配分の決め方</div>'
          + '<div class="vq2-hint" style="margin-bottom:10px">'
          + "どれを選んでも、下の「作る予定」で中身を確かめてから頼めます。</div>"
          + '<div class="vq2-mix-styles">'
          + QPL.STYLES.filter(function (x) { return x.id !== "manual"; }).map(function (x) {
              var on = !draft.types.length && draft.style === x.id;
              return '<button type="button" class="vq2-mix-st' + (on ? " is-on" : "") + '"'
                + ' data-mix-style="' + x.id + '" aria-pressed="' + (on ? "true" : "false") + '">'
                + "<b>" + esc(x.label) + "</b><span>" + esc(x.desc) + "</span></button>";
            }).join("")
          + '<button type="button" class="vq2-mix-st' + (draft.types.length ? " is-on" : "") + '"'
          + ' data-mix-style="manual" aria-pressed="' + (draft.types.length ? "true" : "false") + '">'
          + "<b>形式を自分で選ぶ</b><span>下の一覧から使う形式を選びます。</span></button>"
          + "</div></div>";
      }

      function offCard() {
        var rows = [
          { k: "noFourChoice", label: "選択式（4 択など）を使わない" },
          { k: "noWriting", label: "記述を使わない" },
          { k: "noAiGrading", label: "AI 採点の形式を使わない" },
          { k: "noImage", label: "画像が要る形式を使わない" },
          { k: "noAudio", label: "音声が要る形式を使わない" }
        ];
        return '<div class="vq2-card"><div class="vq2-sec-t">使わないもの</div>'
          + '<div class="vq2-mix-offs">'
          + rows.map(function (r) {
              return '<label class="vq2-check sm"><input type="checkbox" data-mix-flag="' + r.k + '"'
                + (draft.flags[r.k] ? " checked" : "") + "><span>" + esc(r.label) + "</span></label>";
            }).join("")
          + "</div></div>";
      }

      function planCard(plan, cand) {
        if (!plan || !plan.items.length) {
          return '<div class="vq2-card"><div class="vq2-sec-t">作る予定</div>'
            + '<div class="vq2-hint">いまの指定では作れる形式がありません。'
            + "「使わないもの」を減らすか、資料を追加してください。</div></div>";
        }
        var total = plan.items.reduce(function (a, i) { return a + i.count; }, 0);
        var reasons = {};
        if (cand) cand.ranked.forEach(function (r) { reasons[r.type] = r.reason; });
        var d = plan.distribution;
        return '<div class="vq2-card"><div class="vq2-sec-t">作る予定（' + total + " 問)</div>"
          + '<div class="vq2-mix-plan">'
          + plan.items.map(function (i) {
              return '<div class="vq2-mix-row">'
                + '<span class="vq2-mix-n">' + i.count + "</span>"
                + "<div><b>" + esc(i.name) + "</b>"
                + (reasons[i.type] ? '<span class="vq2-mix-why">' + esc(reasons[i.type]) + "</span>" : "")
                + "</div>"
                + '<span class="vq2-mix-bar"><i style="width:' + Math.round(i.count / total * 100) + '%"></i></span>'
                + "</div>";
            }).join("")
          + "</div>"
          + (d ? '<div class="vq2-hint" style="margin-top:8px">'
                 + d.typeCount + " 形式（" + total + " 問なら " + d.required + " 形式以上が目安）"
                 + "／選んで答える問題 " + Math.round(d.choiceRatio * 100) + "%</div>" : "")
          + noteList(plan.notes, "note")
          + noteList((d && d.issues || []).map(function (x) { return x.message; }), "warn")
          + unavailableList(cand)
          + "</div>";
      }
      function noteList(list, kind) {
        if (!list || !list.length) return "";
        return '<ul class="vq2-mix-notes' + (kind === "warn" ? " is-warn" : "") + '">'
          + list.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
      }
      /* 指定したのに使えない形式。理由と代わりを必ず出す（§14）。 */
      function unavailableList(cand) {
        var list = (cand && cand.unavailableRequested) || [];
        if (!list.length) return "";
        return '<div class="vq2-mix-ng">'
          + list.map(function (u) {
              return "<div><b>「" + esc(u.name) + "」は使えません</b><span>" + esc(u.reason) + "</span>"
                + (u.alternatives.length
                    ? '<span class="vq2-mix-alt">代わりに使えます：'
                      + u.alternatives.map(function (a) {
                          return '<button type="button" class="vq2-chip sm" data-mix-add="' + esc(a.type) + '">'
                            + esc(a.name) + "</button>";
                        }).join("") + "</span>"
                    : "")
                + "</div>";
            }).join("")
          + "</div>";
      }

      /* 使う形式の一覧。**使えないものは理由つきで灰色**にし、押せなくする。 */
      function typesCard(cand) {
        if (!cand) return "";
        var okSet = {};
        cand.types.forEach(function (t) { okSet[t] = 1; });
        var ngBy = {};
        cand.excluded.forEach(function (e) { if (!ngBy[e.type]) ngBy[e.type] = e.reason; });
        var cats = QT.CATEGORIES || [];
        var open = draft.openCat;
        return '<div class="vq2-card"><div class="vq2-sec-t">使う形式を選ぶ（任意）</div>'
          + '<div class="vq2-hint" style="margin-bottom:10px">'
          + "選ばなければ、上の決め方に合わせてこちらで決めます。"
          + "使えない形式には理由を出します。</div>"
          + cats.map(function (cat) {
              var inCat = cand.ranked.filter(function (r) { return r.category === cat.id; });
              var ngInCat = Object.keys(ngBy).filter(function (t) {
                var d = QT.get(t); return d && d.category === cat.id;
              });
              if (!inCat.length && !ngInCat.length) return "";
              var chosen = inCat.filter(function (r) { return draft.types.indexOf(r.type) >= 0; }).length;
              var isOpen = open === cat.id;
              return '<div class="vq2-mix-cat' + (isOpen ? " is-open" : "") + '">'
                + '<button type="button" class="vq2-mix-cath" data-mix-cat="' + cat.id + '"'
                + ' aria-expanded="' + (isOpen ? "true" : "false") + '">'
                + "<b>" + esc(cat.label) + "</b>"
                + '<span class="vq2-mix-cn">' + inCat.length + " 種類"
                + (chosen ? "・選択中 " + chosen : "") + "</span></button>"
                + (isOpen
                    ? '<div class="vq2-mix-list">'
                      + inCat.map(function (r) {
                          var on = draft.types.indexOf(r.type) >= 0;
                          var off = draft.exclude.indexOf(r.type) >= 0;
                          return '<div class="vq2-mix-t' + (on ? " is-on" : "") + (off ? " is-off" : "") + '">'
                            + '<button type="button" class="vq2-mix-tb" data-mix-toggle="' + esc(r.type) + '"'
                            + ' aria-pressed="' + (on ? "true" : "false") + '">'
                            + "<b>" + esc(r.name) + "</b>"
                            + '<span>' + esc((DESC && DESC.shortLine(r.type)) || "") + "</span></button>"
                            + U.button({ icon: off ? "plus" : "close", iconOnly: true, size: "sm", variant: "quiet",
                                         action: "mix-off", id: r.type,
                                         aria: off ? "この形式を戻す" : "この形式を使わない" })
                            + "</div>";
                        }).join("")
                      + ngInCat.map(function (t) {
                          return '<div class="vq2-mix-t is-ng"><div class="vq2-mix-tb">'
                            + "<b>" + esc(QT.label(t)) + "</b><span>" + esc(ngBy[t]) + "</span></div></div>";
                        }).join("")
                      + "</div>"
                    : "")
                + "</div>";
            }).join("")
          + "</div>";
      }

      function wire() {
        var r = sheet.root;
        U.on(r, "click", '[data-act="x"]', function () { sheet.close("user"); });
        U.on(r, "click", "[data-mix-style]", function (e, t) {
          var v = t.getAttribute("data-mix-style");
          if (v === "manual") { draft.openCat = draft.openCat || "choice"; }
          else { draft.style = v; draft.types = []; }
          draw();
        });
        U.on(r, "change", "[data-mix-flag]", function (e, t) {
          draft.flags[t.getAttribute("data-mix-flag")] = t.checked;
          draw();
        });
        U.on(r, "click", "[data-mix-cat]", function (e, t) {
          var id = t.getAttribute("data-mix-cat");
          draft.openCat = draft.openCat === id ? "" : id;
          draw();
        });
        U.on(r, "click", "[data-mix-toggle]", function (e, t) {
          var id = t.getAttribute("data-mix-toggle");
          var i = draft.types.indexOf(id);
          if (i >= 0) draft.types.splice(i, 1); else draft.types.push(id);
          draw();
        });
        U.on(r, "click", "[data-mix-add]", function (e, t) {
          var id = t.getAttribute("data-mix-add");
          if (draft.types.indexOf(id) < 0) draft.types.push(id);
          draw();
        });
        U.on(r, "click", '[data-act="mix-off"]', function (e, t) {
          var id = t.getAttribute("data-id");
          var i = draft.exclude.indexOf(id);
          if (i >= 0) draft.exclude.splice(i, 1);
          else {
            draft.exclude.push(id);
            var j = draft.types.indexOf(id);
            if (j >= 0) draft.types.splice(j, 1);
          }
          draw();
        });
        U.on(r, "click", '[data-act="ok"]', function () {
          st.mixStyle = draft.types.length ? "manual" : draft.style;
          st.mixTypes = draft.types.slice();
          st.mixExclude = draft.exclude.slice();
          st.mixFlags = Object.assign({}, draft.flags);
          persistAttachments();
          paintComposer();
          /* 形式の指定が変わったら、生成条件は決め直し（§45）。
             前に確かめた条件のまま作ると、いま選んだ形式が効かない。 */
          invalidateCondition();
          sheet.close("ok");
          app.toast(st.mixTypes.length
            ? "使う形式を " + st.mixTypes.length + " 種類に決めました。"
            : "出題形式の決め方を更新しました。", "success");
          if (onDone) { try { onDone(); } catch (e2) {} }
        });
      }
    }

    /* ── プリセットの設定（名前・説明・公開範囲・見た目）──────────
       画像を選ぶ操作が入るので、確認ダイアログではなく中央シートで開く。
       画像は端末内で縮小して data URL にしてから持つ（外部 URL は使わない）。 */
    function openSettings() {
      var ap = normalizeAppearance(st.preset.appearance);
      var draft = {
        name: st.preset.name, description: st.preset.description,
        visibility: st.preset.visibility || "private",
        appearance: { icon: ap.icon, iconImage: ap.iconImage, banner: ap.banner },
        /* 読み上げの既定。音声問題はここの声で読む（問題ごとに上書きできる）。 */
        audio: Object.assign({ voice: "", speed: 1 }, st.preset.audio || {})
      };
      var sheet = U.mount("vq2-preset-appearance", {
        title: "プリセットの設定", sheet: true, stack: true,
        onResize: function () { draw(); }
      });
      draw();

      function draw() {
        var a = draft.appearance;
        sheet.root.innerHTML =
          '<div class="vq2-top">'
          + U.button({ icon: "close", iconOnly: true, variant: "quiet", action: "x", aria: "閉じる" })
          + '<div class="vq2-top-title">プリセットの設定</div></div>'
          + '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
          + '<div class="vq2-q" style="gap:14px;padding:16px">'
          + '<div class="vq2-card">'
          + field({ label: "プリセット名", key: "name", value: draft.name, required: true })
          + '<div style="margin-top:12px">'
          + field({ label: "説明", key: "description", type: "textarea", rows: 3, value: draft.description })
          + "</div>"
          + '<div style="margin-top:12px">'
          + field({ label: "公開範囲", type: "select", key: "visibility", value: draft.visibility,
                    options: [{ value: "private", label: "自分だけ" },
                              { value: "unlisted", label: "リンクを知っている人" },
                              { value: "public", label: "全体に公開" }] })
          + "</div></div>"
          + voiceCardHtml()
          + '<div class="vq2-card"><div class="vq2-sec-t">見た目</div>'
          + '<div class="vq2-hint" style="margin-bottom:12px">ここで決めたアイコンとバナーが、'
          + "プリセットを開いたときに名前と一緒に出ます。</div>"
          + '<div class="vq2-ap">'
          + '<div><div class="vq2-label" style="margin-bottom:6px">アイコン</div>'
          + '<div class="vq2-ap-row"><span class="vq2-ap-prev">' + iconPreview(a) + "</span>"
          + U.button({ label: "画像を選ぶ", icon: "doc", size: "sm", action: "pick-icon" })
          + (a.iconImage || a.icon
              ? U.button({ label: "外す", size: "sm", variant: "quiet", action: "clear-icon" })
              : "")
          + "</div>"
          + '<div class="vq2-ap-emoji" style="margin-top:10px">'
          + EMOJI.map(function (e) {
              return '<button type="button" class="vq2-ap-e' + (a.icon === e && !a.iconImage ? " is-on" : "")
                + '" data-emoji="' + e + '" aria-label="' + e + '">' + e + "</button>";
            }).join("")
          + "</div>"
          + '<div class="vq2-hint" style="margin-top:6px">絵文字を選ぶか、画像を選べます。'
          + "画像を選ぶと絵文字より優先されます。</div></div>"
          + '<div><div class="vq2-label" style="margin-bottom:6px">バナー</div>'
          + '<div class="vq2-ap-bprev">'
          + (a.banner ? '<img src="' + esc(a.banner) + '" alt="">' : "まだ設定されていません")
          + "</div>"
          + '<div class="vq2-ap-row" style="margin-top:10px">'
          + U.button({ label: a.banner ? "画像を選び直す" : "画像を選ぶ", icon: "doc", size: "sm", action: "pick-banner" })
          + (a.banner ? U.button({ label: "外す", size: "sm", variant: "quiet", action: "clear-banner" }) : "")
          + "</div>"
          + '<div class="vq2-hint" style="margin-top:6px">横長の画像が向いています。'
          + "端末の中で小さくしてから保存します（外部への送信はしません）。</div></div>"
          + "</div></div>"
          + "</div></div></div></div>"
          + '<div class="vq2-pd-foot">'
          + '<div class="vq2-top-sp"></div>'
          + U.button({ label: "やめる", variant: "quiet", action: "x" })
          + U.button({ label: "適用", icon: "check", variant: "primary", action: "ok" })
          + "</div>";
        wireSheet();
      }
      /* 読み上げの声。音声問題（リスニング・書き取りなど）はここの声で読む。
         問題ごとに変えたいときは、その問題の編集で上書きする。 */
      function voiceCardHtml() {
        var a = draft.audio || {};
        var label = a.voice ? voiceLabel(a.voice) : "自動（原稿の言語で決める）";
        var sp = (VQ2.voicePicker ? VQ2.voicePicker.SPEEDS : [])
          .filter(function (x) { return x.v === (Number(a.speed) || 1); })[0];
        return '<div class="vq2-card"><div class="vq2-sec-t">読み上げの声</div>'
          + '<div class="vq2-hint" style="margin-bottom:12px">'
          + "リスニングや書き取りの問題を、この声で読み上げます。"
          + "問題ごとに変えることもできます。</div>"
          + '<div class="vq2-ap-row">'
          + '<span class="vq2-vc-dot" style="--vp-h:'
          + (VQ2.voicePicker ? VQ2.voicePicker.hueOf(a.voice || "auto") : 28) + '"></span>'
          + '<div style="flex:1 1 auto;min-width:0">'
          + '<div class="vq2-vc-name">' + esc(label) + "</div>"
          + '<div class="vq2-vc-sub">話す速さ：' + esc(sp ? sp.label : "ふつう") + "</div>"
          + "</div>"
          + U.button({ label: "声を選ぶ", icon: "audio", size: "sm", action: "pick-voice" })
          + (a.voice ? U.button({ label: "自動へ戻す", size: "sm", variant: "quiet", action: "clear-voice" }) : "")
          + "</div></div>";
      }
      /* 一覧を取れていれば名前で、取れていなければ ID のまま出す（作り話をしない）。 */
      function voiceLabel(id) {
        var v = (voiceCardHtml.__cache || []).filter(function (x) { return x.id === id; })[0];
        if (v) return v.name + (v.style ? "（" + v.style + "）" : "") + "・" + v.langLabel;
        return id;
      }

      function iconPreview(a) {
        if (a.iconImage) return '<img src="' + esc(a.iconImage) + '" alt="">';
        if (a.icon) return esc(a.icon);
        return esc((draft.name || "?").trim().slice(0, 1));
      }

      function wireSheet() {
        U.on(sheet.root, "click", '[data-act="x"]', function () { sheet.close("user"); });
        U.on(sheet.root, "input", "[data-key]", function (e, t) {
          draft[t.getAttribute("data-key")] = t.value;
        });
        U.on(sheet.root, "change", "[data-key]", function (e, t) {
          draft[t.getAttribute("data-key")] = t.value;
        });
        U.on(sheet.root, "click", "[data-emoji]", function (e, t) {
          draft.appearance.icon = t.getAttribute("data-emoji");
          draft.appearance.iconImage = "";
          draw();
        });
        U.on(sheet.root, "click", '[data-act="clear-icon"]', function () {
          draft.appearance.icon = ""; draft.appearance.iconImage = ""; draw();
        });
        U.on(sheet.root, "click", '[data-act="clear-banner"]', function () {
          draft.appearance.banner = ""; draw();
        });
        U.on(sheet.root, "click", '[data-act="pick-voice"]', function () {
          if (!VQ2.voicePicker) { sheet.toast("読み上げの部品が読み込まれていません。", "warning"); return; }
          VQ2.voicePicker.open({
            value: draft.audio.voice, speed: draft.audio.speed,
            onPick: function (voiceId, speed) { draft.audio.voice = voiceId; draft.audio.speed = speed; }
          }).then(function (r) {
            if (r) { draft.audio.voice = r.voice; draft.audio.speed = r.speed; }
            /* 選んだ声の名前を出せるように、一覧を控えておく */
            if (VQ2.tts) {
              VQ2.tts.voices({}).then(function (j) {
                voiceCardHtml.__cache = (j && j.voices) || [];
                draw();
              });
            } else draw();
          });
        });
        U.on(sheet.root, "click", '[data-act="clear-voice"]', function () {
          draft.audio.voice = ""; draft.audio.speed = 1; draw();
        });
        U.on(sheet.root, "click", '[data-act="pick-icon"]', function () { pickImage("iconImage"); });
        U.on(sheet.root, "click", '[data-act="pick-banner"]', function () { pickImage("banner"); });
        U.on(sheet.root, "click", '[data-act="ok"]', function () { apply(); });
      }

      function pickImage(kind) {
        var inp = doc.createElement("input");
        inp.type = "file";
        inp.accept = "image/png,image/jpeg,image/webp";
        inp.addEventListener("change", function () {
          var f = inp.files && inp.files[0];
          if (!f) return;
          shrinkImage(f, kind).then(function (res) {
            draft.appearance[kind] = res.dataUrl;
            if (kind === "iconImage") draft.appearance.icon = "";
            draw();
            sheet.toast(res.label, "success");
          }).catch(function (e) {
            sheet.toast(e && e.message ? e.message : "画像を読み込めませんでした。", "error");
          });
        });
        inp.click();
      }

      function apply() {
        if (!String(draft.name || "").trim()) { sheet.toast("プリセット名を入れてください。", "warning"); return; }
        var issues = S.validateAppearance(draft.appearance, "appearance", []);
        if (issues.length) { sheet.toast(issues[0].message, "error"); return; }
        st.preset.name = draft.name;
        st.preset.description = draft.description;
        st.preset.visibility = draft.visibility;
        st.preset.audio = { voice: String(draft.audio.voice || ""), speed: Number(draft.audio.speed) || 1 };
        st.preset.appearance = {
          icon: draft.appearance.icon || "",
          iconImage: draft.appearance.iconImage || "",
          banner: draft.appearance.banner || ""
        };
        sheet.close("ok");
        change("設定を変更");
        renderTop();
      }
    }

    function normalizeAppearance(a) {
      a = a && typeof a === "object" ? a : {};
      return { icon: String(a.icon || ""), iconImage: String(a.iconImage || ""), banner: String(a.banner || "") };
    }

    function formatTime(t) {
      var d = t instanceof Date ? t : new Date(t);
      if (isNaN(d.getTime())) return "";
      return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    }

    return app;
  }

  /* condition は画面を持たない部分（§45 / §46）。テストから直に呼べるように出す。 */
  VQ2.presetStudio = { open: open, TYPE_LABEL: TYPE_LABEL, condition: COND };
})(typeof globalThis !== "undefined" ? globalThis : this);
