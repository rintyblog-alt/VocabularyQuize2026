/* ══════════════════════════════════════════════════════════════════════
   声を選ぶ画面

   ・1 画面に 1 つの声だけを見せる。172 個を一覧にしても選べない。
   ・玉を押すと、その声で試し聞きできる。**聞かずに選ばせない。**
   ・左右で送る。点は「いまどのあたりか」を表す。
   ・言語と速さは下の行で変える。言語を変えると、その言語の声だけになる。
   ・選んだ瞬間に決まる（閉じたときではない）。迷ったら送り直せばよい。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui;
  if (!U) throw new Error("VQ2.ui must be loaded before voice-picker.js");
  var esc = U.esc;
  function str(v) { return v === undefined || v === null ? "" : String(v); }

  var MAX_DOTS = 9;                 /* 点はここまで。多いと帯になって意味を失う */
  var SAMPLE_JA = "これから問題を読み上げます。よく聞いて答えてください。";
  var SAMPLE_EN = "Listen carefully, then choose the best answer.";

  /* 声ごとの色。同じ声はいつも同じ色にする（覚えられるように）。 */
  function hueOf(id) {
    var h = 0, s = String(id || "");
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
  }
  /* 声の感じを短い言葉にする。無いものを作らない（分かる範囲だけ）。 */
  var STYLE_WORD = {
    "ノーマル": "落ち着いた標準の声", "あまあま": "やわらかく甘い声",
    "ツンツン": "きっぱりした強い声", "セクシー": "低めで大人びた声",
    "ささやき": "ささやくような小さい声", "ヒソヒソ": "息づかいの near な小声",
    "ヘロヘロ": "力の抜けた声", "なみだめ": "涙まじりの声",
    "喜び": "うれしそうな声", "悲しみ": "沈んだ声", "ツンギレ": "怒った強い声",
    "熱血": "熱のこもった声", "不機嫌": "むすっとした声", "しっとり": "静かで落ち着いた声",
    "かなしみ": "かなしげな声", "囁き": "ささやく声", "ふつう": "ふつうの声",
    "わーい": "はしゃいだ声", "びくびく": "おびえた声", "おこ": "怒った声", "びえーん": "泣き声",
    "クイーン": "堂々とした声"
  };
  function describe(v) {
    if (!v) return "";
    if (v.style && STYLE_WORD[v.style]) return STYLE_WORD[v.style];
    if (v.style) return v.style + "の声";
    var g = v.gender ? v.gender + "の声" : "";
    return [v.langLabel, g].filter(Boolean).join("・");
  }
  /* 声 ID を人の読める名前へ。まだ一覧を取っていなければ ID のまま出す
     （名前を作り話しない）。 */
  function labelOf(id, emptyLabel) {
    if (!id) return emptyLabel || "自動（原稿の言語で決める）";
    var T = VQ2.tts;
    var list = (T && T.cachedVoices) ? T.cachedVoices() : [];
    var v = list.filter(function (x) { return x.id === id; })[0];
    if (!v) return id;
    return v.name + (v.style ? "（" + v.style + "）" : "") + "・" + v.langLabel;
  }
  function titleOf(v) {
    if (!v) return "";
    return v.style ? v.name : v.name;
  }
  function subTitleOf(v) {
    if (!v) return "";
    return [v.langLabel, v.style || v.gender].filter(Boolean).join("・");
  }

  var SPEEDS = [
    { v: 0.8, label: "ゆっくり" }, { v: 1, label: "ふつう" },
    { v: 1.2, label: "すこし速い" }, { v: 1.5, label: "速い" }
  ];

  /* ══════════════════════════════════════════════════════════════
     開く
       o.value   … いま選んでいる声（"voicevox:3" など）
       o.speed   … いまの速さ
       o.lang    … 最初に出す言語（"ja" / "en-us" / "" ＝すべて）
       o.title   … 見出し（省略時「声を選ぶ」）
       o.sampleText … 試し聞きに使う文（省略時は決まり文句。160 字を超えたら使わない）
       o.onPick(voiceId, speed, voice) … 選ぶたびに呼ばれる
     返り値: Promise<{voice, speed} | null>
     ══════════════════════════════════════════════════════════════ */
  function open(o) {
    o = o || {};
    var TTS = VQ2.tts;
    var st = {
      all: [], list: [], at: 0,
      lang: o.lang === undefined ? "" : o.lang,
      speed: Number(o.speed) || 1,
      loading: true, error: "", playing: false,
      engines: {}, openRow: ""
    };
    var picked = null;

    /* 閉じたときに結果を返す。閉じ方は 3 つ（×・Escape・背景）あるので、
       どれで閉じても同じところへ集める。 */
    var settle = null;
    var closed = new Promise(function (res) { settle = res; });

    var sheet = U.mount("vq2-voice-picker", {
      sheet: true, stack: true, title: o.title || "声を選ぶ",
      onResize: function () { draw(); },
      onClose: function () { if (TTS) TTS.stop(); settle(result()); }
    });
    sheet.root.classList.add("vq2-vp-host");
    draw();
    load();

    function load() {
      if (!TTS) { st.loading = false; st.error = "読み上げの部品が読み込まれていません。"; draw(); return; }
      /* 一覧を見にいくときは、止まっているエンジンも起こす。
         ここで起こさないと「声が 0 個」になり、何も選べない。 */
      TTS.voices({ start: true }).then(function (r) {
        st.loading = false;
        st.all = (r && r.voices) || [];
        st.engines = (r && r.engines) || {};
        if (!st.all.length) {
          st.error = (r && r.reason)
            || "使える声が見つかりませんでした。ローカルAI（Bridge）が動いているか確かめてください。";
        }
        applyFilter(true);
        draw();
      }).catch(function () {
        st.loading = false;
        st.error = "声の一覧を取れませんでした。";
        draw();
      });
    }

    function applyFilter(keepValue) {
      var lang = st.lang;
      st.list = st.all.filter(function (v) { return !lang || v.lang === lang; });
      if (!st.list.length) st.list = st.all.slice();
      var want = keepValue ? (picked || o.value) : (current() && current().id);
      var i = -1;
      if (want) {
        for (var k = 0; k < st.list.length; k++) if (st.list[k].id === want) { i = k; break; }
      }
      st.at = i >= 0 ? i : 0;
    }
    function current() { return st.list[st.at] || null; }

    /* 言語の選択肢は、実際にある声からしか作らない。 */
    function langOptions() {
      var seen = {}, out = [{ v: "", label: "すべての言語" }];
      st.all.forEach(function (v) {
        if (!v.lang || seen[v.lang]) return;
        seen[v.lang] = 1;
        out.push({ v: v.lang, label: v.langLabel || v.lang });
      });
      return out;
    }

    function draw() {
      var v = current();
      sheet.root.innerHTML =
        '<div class="vq2-vp-card">'
        + U.button({ icon: "close", iconOnly: true, variant: "quiet", action: "x", aria: "閉じる" })
        + (st.loading ? loadingHtml() : (st.error && !st.all.length ? errorHtml() : bodyHtml(v)))
        + "</div>";
      wire();
    }

    function loadingHtml() {
      return '<div class="vq2-vp-stage">'
        + '<div class="vq2-vp-orb is-loading"></div>'
        + '<div class="vq2-vp-name">声を読み込んでいます</div>'
        + '<div class="vq2-vp-desc">初回は少し時間がかかります</div>'
        + "</div>";
    }
    function errorHtml() {
      return '<div class="vq2-vp-stage">'
        + '<div class="vq2-vp-orb is-off"></div>'
        + '<div class="vq2-vp-name">声を用意できません</div>'
        + '<div class="vq2-vp-desc">' + esc(st.error) + "</div>"
        + '<div class="vq2-vp-retry">'
        + U.button({ label: "もう一度ためす", icon: "refresh", action: "retry" })
        + "</div></div>";
    }

    function bodyHtml(v) {
      var hue = hueOf(v && v.id);
      return '<div class="vq2-vp-stage">'
        + '<button type="button" class="vq2-vp-orb' + (st.playing ? " is-playing" : "") + '"'
        + ' data-act="try" aria-label="' + esc(titleOf(v)) + ' の声を試し聞きする"'
        + ' style="--vp-h:' + hue + '">'
        + '<span class="vq2-vp-orb-in"></span>'
        + (st.playing ? '<span class="vq2-vp-wave"><i></i><i></i><i></i></span>' : "")
        + "</button>"
        + '<div class="vq2-vp-row1">'
        + '<button type="button" class="vq2-vp-arrow" data-act="prev" aria-label="前の声"'
        + (st.list.length < 2 ? " disabled" : "") + ">" + chevron("left") + "</button>"
        + '<div class="vq2-vp-titles">'
        + '<div class="vq2-vp-name">' + esc(titleOf(v)) + "</div>"
        + '<div class="vq2-vp-desc">' + esc(describe(v)) + "</div>"
        + "</div>"
        + '<button type="button" class="vq2-vp-arrow" data-act="next" aria-label="次の声"'
        + (st.list.length < 2 ? " disabled" : "") + ">" + chevron("right") + "</button>"
        + "</div>"
        + dotsHtml()
        + '<div class="vq2-vp-sub">' + esc(subTitleOf(v))
        + (v && v.engineLabel ? '<span class="vq2-vp-eng">' + esc(v.engineLabel) + "</span>" : "")
        + "</div>"
        + "</div>"
        + rowsHtml(v);
    }

    /* 点。声が多いときは、いまの前後だけを出す（帯にしない）。 */
    function dotsHtml() {
      var n = st.list.length;
      if (n < 2) return '<div class="vq2-vp-dots"></div>';
      var show = Math.min(MAX_DOTS, n);
      var half = Math.floor(show / 2);
      var start = Math.max(0, Math.min(st.at - half, n - show));
      var h = "";
      for (var i = start; i < start + show; i++) {
        h += '<button type="button" class="vq2-vp-dot' + (i === st.at ? " is-on" : "") + '"'
          + ' data-go="' + i + '" aria-label="' + (i + 1) + ' 番目の声"'
          + (i === st.at ? ' aria-current="true"' : "") + "></button>";
      }
      return '<div class="vq2-vp-dots">' + h
        + (n > show ? '<span class="vq2-vp-count">' + (st.at + 1) + " / " + n + "</span>" : "")
        + "</div>";
    }

    function rowsHtml(v) {
      var speed = SPEEDS.filter(function (s) { return s.v === st.speed; })[0] || SPEEDS[1];
      var langs = langOptions();
      var lang = langs.filter(function (x) { return x.v === st.lang; })[0] || langs[0];
      return '<div class="vq2-vp-rows">'
        + rowHtml("speed", "gauge", "話す速さ", speed.label,
                  st.openRow === "speed"
                    ? SPEEDS.map(function (s) {
                        return optHtml("speed", String(s.v), s.label, s.v === st.speed);
                      }).join("")
                    : "")
        + rowHtml("lang", "globe", "言語", lang.label,
                  st.openRow === "lang"
                    ? langs.map(function (x) {
                        return optHtml("lang", x.v, x.label + langCount(x.v), x.v === st.lang);
                      }).join("")
                    : "")
        + "</div>";
    }
    function langCount(l) {
      var n = l ? st.all.filter(function (v) { return v.lang === l; }).length : st.all.length;
      return "（" + n + "）";
    }
    function rowHtml(key, ic, label, value, openHtml) {
      var on = st.openRow === key;
      return '<div class="vq2-vp-rw' + (on ? " is-open" : "") + '">'
        + '<button type="button" class="vq2-vp-rwh" data-row="' + key + '"'
        + ' aria-expanded="' + (on ? "true" : "false") + '">'
        + '<span class="vq2-vp-ic">' + rowIcon(ic) + "</span>"
        + '<span class="vq2-vp-lb">' + esc(label) + "</span>"
        + '<span class="vq2-vp-val">' + esc(value) + "</span>"
        + '<span class="vq2-vp-ch">' + chevron("down") + "</span>"
        + "</button>"
        + (openHtml ? '<div class="vq2-vp-opts">' + openHtml + "</div>" : "")
        + "</div>";
    }
    function optHtml(key, val, label, on) {
      return '<button type="button" class="vq2-vp-opt' + (on ? " is-on" : "") + '"'
        + ' data-set="' + key + '" data-val="' + esc(val) + '"'
        + ' aria-pressed="' + (on ? "true" : "false") + '">' + esc(label) + "</button>";
    }

    function chevron(dir) {
      var d = dir === "left" ? "M15 18l-6-6 6-6"
            : dir === "right" ? "M9 18l6-6-6-6"
            : "M6 9l6 6 6-6";
      return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"'
        + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="' + d + '"/></svg>';
    }
    function rowIcon(kind) {
      if (kind === "globe")
        return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'
          + '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>';
      return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M7.5 7.5a6 6 0 0 0 0 9M16.5 7.5a6 6 0 0 1 0 9"/></svg>';
    }

    /* ── 操作 ─────────────────────────────────────────────── */
    function go(n) {
      if (!st.list.length) return;
      st.at = (n + st.list.length) % st.list.length;
      commit();
      draw();
      tryPlay();          /* 送ったらすぐ聞こえる。押し直させない。 */
    }
    function commit() {
      var v = current();
      if (!v) return;
      picked = v.id;
      if (o.onPick) { try { o.onPick(v.id, st.speed, v); } catch (e) {} }
    }
    function tryPlay() {
      var v = current();
      if (!v || !VQ2.tts) return;
      st.playing = true; draw();
      /* 呼び出し側が原稿をくれたら、その文で試す（本番と同じ音を先に聞ける）。
         長すぎるものはそのまま流さない（選ぶたびに長々と鳴る）。 */
      var given = str(o.sampleText).trim();
      var text = given && given.length <= 160
        ? given : (v.lang === "ja" ? SAMPLE_JA : SAMPLE_EN);
      VQ2.tts.play(text, { voice: v.id, speed: st.speed, noFallback: true })
        .then(function (r) {
          st.playing = false; draw();
          if (!r.ok && r.reason) sheet.toast(r.reason, "warning");
        })
        .catch(function () { st.playing = false; draw(); });
    }

    function wire() {
      var r = sheet.root;
      U.on(r, "click", '[data-act="x"]', function () { close(); });
      U.on(r, "click", '[data-act="retry"]', function () {
        st.loading = true; st.error = ""; draw(); load();
      });
      U.on(r, "click", '[data-act="prev"]', function () { go(st.at - 1); });
      U.on(r, "click", '[data-act="next"]', function () { go(st.at + 1); });
      U.on(r, "click", '[data-act="try"]', function () {
        if (st.playing) { VQ2.tts && VQ2.tts.stop(); st.playing = false; draw(); return; }
        tryPlay();
      });
      U.on(r, "click", "[data-go]", function (e, t) { go(Number(t.getAttribute("data-go"))); });
      U.on(r, "click", "[data-row]", function (e, t) {
        var k = t.getAttribute("data-row");
        st.openRow = st.openRow === k ? "" : k;
        draw();
      });
      U.on(r, "click", "[data-set]", function (e, t) {
        var k = t.getAttribute("data-set"), val = t.getAttribute("data-val");
        if (k === "speed") { st.speed = Number(val) || 1; commit(); }
        else { st.lang = val; applyFilter(false); commit(); }
        st.openRow = "";
        draw();
        if (k === "speed") tryPlay();
      });
      /* 左右キーでも送れる。玉を押すのと同じ操作を指以外でもできるように。 */
      U.on(r, "keydown", ".vq2-vp-card", function (e) {
        if (e.key === "ArrowLeft") { e.preventDefault(); go(st.at - 1); }
        if (e.key === "ArrowRight") { e.preventDefault(); go(st.at + 1); }
      });
    }

    function close() {
      if (VQ2.tts) VQ2.tts.stop();
      sheet.close("ok");
    }

    return closed;

    function result() {
      return picked ? { voice: picked, speed: st.speed } : null;
    }
  }

  VQ2.voicePicker = { open: open, describe: describe, labelOf: labelOf, hueOf: hueOf, SPEEDS: SPEEDS };
})(typeof globalThis !== "undefined" ? globalThis : this);
