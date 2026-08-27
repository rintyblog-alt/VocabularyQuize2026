/* ══════════════════════════════════════════════════════════════════════
   core/tts/voices.js — 読み上げの 声の 一覧（2026-08-26）

   訴え:「リスニングの声の種類を 男女で 新たに追加させる。無料API ＋ 高品質」

   ★ なぜ この ファイルが 要るか
     声の 一覧は もともと **2 か所に 手で 書いてあった**
       ・server/src/worker.js の LIVE_VOICES（サーバが 通す 名前）
       ・js-src/vq-settings-store.*.js の opts（画面で 選べる 名前）
     片方だけ 足すと、サーバの liveVoiceOf が **黙って 既定へ 落とす**ので
     「選べるのに 鳴らない」「鳴るのに 選べない」に なる。無言の 不具合。
     → 決めどころは **サーバの TTS_VOICES ただ 1 つ**。
        画面は /api/tts/voices で それを 読む。ここは その 受け皿。

   ★ 控え（手元の一覧）を 置いてある 理由
     圏外・起動直後・ログイン前でも 選択肢を 出せるようにするため。
     控えは **サーバと 同じ 中身**でなければ ならない。
     ずれていないことは vqvoice.cjs が 実測で 見張る。

   ★ 男女は **測った 値**（基本周波数 F0 / 単位 Hz）で 分けてある。
     名前の 印象では 決めていない。測りかたは worker.js の ttsPitchHz。
     hz が null のものは 前に 人が 確かめた ぶん（今回 無料枠が 尽きて
     測り直せなかった）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ = root.VQVOICE || (root.VQVOICE = {});

  /* サーバの TTS_VOICES と **同じ 中身**（vqvoice.cjs が 見張る） */
  var 控え = [
    { id: "Kore",       名: "コレ",         性: "女", hz: 200,   印象: "しっかり" },
    { id: "Leda",       名: "レダ",         性: "女", hz: 208.7, 印象: "はきはき" },
    { id: "Autonoe",    名: "アウトノエ",   性: "女", hz: 200,   印象: "明るい" },
    { id: "Zephyr",     名: "ゼファー",     性: "女", hz: 192,   印象: "軽やか" },
    { id: "Erinome",    名: "エリノメ",     性: "女", hz: 192,   印象: "澄んだ" },
    { id: "Achernar",   名: "アケルナル",   性: "女", hz: 189,   印象: "やわらかい" },
    { id: "Aoede",      名: "アオエデ",     性: "女", hz: 170.2, 印象: "さわやか" },
    { id: "Sulafat",    名: "スラファト",   性: "女", hz: null,  印象: "あたたかい" },
    { id: "Charon",     名: "カロン",       性: "男", hz: 93.4,  印象: "説明が得意" },
    { id: "Enceladus",  名: "エンケラドス", 性: "男", hz: 100,   印象: "落ち着いた" },
    { id: "Iapetus",    名: "イアペトス",   性: "男", hz: 116.5, 印象: "静かな" },
    { id: "Umbriel",    名: "ウンブリエル", 性: "男", hz: 117.1, 印象: "おだやか" },
    { id: "Algieba",    名: "アルギエバ",   性: "男", hz: 118.2, 印象: "低め" },
    { id: "Fenrir",     名: "フェンリル",   性: "男", hz: 121.8, 印象: "力強い" },
    { id: "Puck",       名: "パック",       性: "男", hz: 123.1, 印象: "明るい" },
    { id: "Orus",       名: "オルス",       性: "男", hz: 125.7, 印象: "きびきび" },
    { id: "Alnilam",    名: "アルニラム",   性: "男", hz: 125.7, 印象: "はっきり" },
    { id: "Rasalgethi", 名: "ラサルゲティ", 性: "男", hz: 131.1, 印象: "ものしり" },
    { id: "Schedar",    名: "シェダル",     性: "男", hz: 135.6, 印象: "落ち着いた" },
    { id: "Achird",     名: "アキルド",     性: "男", hz: 143.7, 印象: "親しみやすい" }
  ];

  VQ.既定 = "Kore";
  var いま = 控え.slice();
  var 取った = false;

  function 札(v) {
    return v.名 + "（" + (v.性 === "女" ? "女性" : "男性")
      + (v.印象 ? "・" + v.印象 : "") + (v.id === VQ.既定 ? "／既定" : "") + "）";
  }

  VQ.控え = function () { return 控え.slice(); };
  VQ.一覧 = function () { return いま.slice(); };
  VQ.札 = 札;
  /* 設定の select が そのまま 使える形 [[値, 見せる文], …] */
  VQ.選択肢 = function () {
    return いま.map(function (v) { return [v.id, v.label || 札(v)]; });
  };
  VQ.性別 = function (id) {
    for (var i = 0; i < いま.length; i++) if (いま[i].id === id) return いま[i].性;
    return "";
  };
  VQ.ある = function (id) { return !!VQ.性別(id); };
  /* 男女で 絞る。声を 20 も 並べると 選べないので、画面は これで 分ける。 */
  VQ.男 = function () { return いま.filter(function (v) { return v.性 === "男"; }); };
  VQ.女 = function () { return いま.filter(function (v) { return v.性 === "女"; }); };

  /* サーバの 一覧を 取りに行く。**取れなくても 黙って 控えのまま**。
     圏外で 選択肢が 空に なるほうが 困る。 */
  VQ.取りに行く = function (api) {
    if (取った) return Promise.resolve(いま.slice());
    var 元 = String(api || "").replace(/\/+$/, "");
    return fetch(元 + "/api/tts/voices", { method: "GET" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !Array.isArray(j.voices) || !j.voices.length) return いま.slice();
        いま = j.voices.map(function (v) {
          return { id: v.id, 名: v.名 || v.id, 性: v.性 || "",
                   hz: v["高さHz"] === undefined ? null : v["高さHz"],
                   印象: v.印象 || "", label: v.label || "" };
        });
        if (j["既定"]) VQ.既定 = j["既定"];
        取った = true;
        try { root.dispatchEvent(new CustomEvent("vq-voices-updated", { detail: { 数: いま.length } })); }
        catch (e) {}
        return いま.slice();
      })
      .catch(function () { return いま.slice(); });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
