/* ══════════════════════════════════════════════════════════════════════
   core/report/render.js — 報告文を **機械が** 作る

   ★ これがいちばん大事な決まり（§8.2）。
     報告を LLM に書かせているかぎり、嘘は 絶対に消えない。
     「ごめんごめん！作り変えて保存したよ」は これが原因で出ている。
     道具の返り値を 見て 感想を書くのではなく、
     **差分そのものから 文を組み立てる。**
   ★ 部分成功を 成功と言わない（§8.3）。3 件のうち 2 件なら「2 件を適用、
     1 件は未適用」と そのまま書く。
   ★ Workplace は 仕事の道具。「ごめんごめん！」「〜だよ！」は 使わない（§8.4）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  /* status が applied かつ error 0 のとき **以外**に 出してはいけない言葉
     ★ 2026-08-17 追加（受け入れテストの実測）。
       「見直しもしたから、崩れもないはず！確認してみてね。」が
       そのまま画面に出ていた。**検証していないのに 検証したと 言っている。**
       「見直しもした」「崩れもない」「保存しました」を 足す。 */
  var 完成の言葉 = [
    "できました", "完成しました", "修正しました", "変更しました",
    "作成しました", "保存したよ", "保存しました", "直しました", "対応しました",
    "確認してみて", "できたよ", "直したよ", "作ったよ", "できた！",
    "修正完了", "完了しました", "反映しました",
    "見直しもした", "見直しました", "崩れもない", "崩れはない", "問題ありません"
  ];

  var 理由の言葉 = {
    not_found: "該当箇所が 見つかりませんでした",
    ambiguous: "どこを指すか 1 つに決まりませんでした",
    locked: "ピン留めされているため 触っていません",
    invalid: "その操作は 使えませんでした",
    out_of_scope: "宣言していない所が変わるため 取り消しました",
    competing_edit: "その間に 書類が変わったため 取り消しました"
  };

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 切(s, n) { s = 文(s); return s.length <= n ? s : s.slice(0, n) + "…"; }

  /* ══ 報告文 ═══════════════════════════════════════════════════ */
  function render(rep, o) {
    o = o || {};
    rep = rep || {};
    var 済 = rep.applied || [], 落 = rep.skipped || [];
    var 検 = rep.validation || { errors: [], warnings: [] };
    var 行 = [];

    if (rep.見ただけ) {
      /* ★ 「いま開いている書類を 数えただけ」のとき。
         変更の件数を 出すと「変更 0 件」となり、作ったばかりの書類に
         そぐわない（実測: makeDocument の直後に出て 誤解を生む）。 */
      行.push("いまの書類を 数えました。");
    } else if (rep.status === "rejected") {
      行.push("**変更していません。**");
      落.slice(0, 4).forEach(function (s) {
        行.push("　" + (理由の言葉[s.reason] || "できませんでした")
          + (s.なぜ ? "\n　" + 切(s.なぜ, 160) : ""));
      });
      if (rep.はみ出し && rep.はみ出し.length) {
        行.push("　変わろうとしていた所: "
          + rep.はみ出し.slice(0, 4).map(function (x) { return x.id; }).join(" / "));
      }
    } else {
      行.push("変更 " + 済.length + " 件" + (落.length ? " / 未適用 " + 落.length + " 件" : ""));
      行.push("");
      済.slice(0, 12).forEach(function (a) {
        行.push("✓ " + (a.path || a.nodeId));
        if (a.before || a.after) {
          if (a.before) 行.push("　　旧「" + 切(a.before, 60) + "」");
          行.push("　　新「" + 切(a.after, 60) + "」");
        }
      });
      if (済.length > 12) 行.push("…ほか " + (済.length - 12) + " 件");
      落.forEach(function (s) {
        行.push("");
        行.push("未適用: 「" + 切(s.intent, 40) + "」");
        行.push("　　" + (理由の言葉[s.reason] || "できませんでした")
          + (s.候補 && s.候補.length ? "。どこか 指定してください。" : "。"));
      });
    }

    if (検.errors && 検.errors.length) {
      行.push("");
      行.push("**まだ 直す所が " + 検.errors.length + " か所 あります。**");
      検.errors.slice(0, 6).forEach(function (e) {
        行.push("　・" + (e.どこ ? e.どこ + " … " : "") + 切(e.なに, 90));
      });
      if (検.errors.length > 6) 行.push("　…ほか " + (検.errors.length - 6) + " か所");
    }
    if (検.warnings && 検.warnings.length) {
      行.push("");
      行.push("気になる所 " + 検.warnings.length + " か所（このままでも 使えます）");
      検.warnings.slice(0, 4).forEach(function (w) {
        行.push("　・" + (w.どこ ? w.どこ + " … " : "") + 切(w.なに, 80));
      });
    }
    if (rep.ことわり) { 行.push(""); 行.push(rep.ことわり); }
    return 行.join("\n");
  }

  /* 完成と言ってよいか。**ここだけが 判断する。** */
  function 言ってよい(rep) {
    if (!rep) return false;
    if (rep.status !== "applied") return false;
    var 検 = rep.validation || {};
    return !(検.errors && 検.errors.length);
  }

  /* 道具の返り値をまとめて作る。Lumi へは これを そのまま返す。 */
  function 道具の返り(rep, o) {
    o = o || {};
    var よい = 言ってよい(rep);
    var 出 = {
      報告: render(rep, o),
      状態: rep.status,
      変えた数: (rep.applied || []).length,
      未適用: (rep.skipped || []).length,
      残る崩れ: ((rep.validation || {}).errors || []).length,
      完成と言ってよい: よい,
      つぎ: よい
        ? "**上の「報告」を そのまま伝えてください。**足したり ぼかしたりしないこと。"
        : "**まだ「できました」と言わないでください。**上の「報告」を そのまま伝え、"
          + "残っている所を 直してから もう一度 見直してください。"
    };
    if (!よい) 出.言ってはいけない言葉 = 完成の言葉.slice(0, 8);
    if (rep.version) 出.版 = rep.version.from + " → " + rep.version.to;
    if (rep.候補) 出.候補 = rep.候補;
    /* ★ 画面の出口（said）が これを 見て 差し替える。**必ず 覚える。** */
    return 覚える(出);
  }

  /* 言ったことに 完成の言葉が 混ざっていないか（監査・試験で使う） */
  function 言ってしまった(発話) {
    var s = 文(発話);
    var 出 = [];
    完成の言葉.forEach(function (w) { if (s.indexOf(w) >= 0) 出.push(w); });
    return 出;
  }

  /* ══ 直近の報告 と 検閲（2026-08-17）══════════════════════════════
     ★ 受け入れテストの実測。**言い聞かせでは 止まらなかった。**
       システム指示に「完成と言ってよい が false のあいだは言うな」と
       書いてあっても、モデルは「見直しもしたから、崩れもないはず！」と
       言い、その文が そのまま 画面に出ていた。
     ★ だから **出口で 差し替える。**言わせないのではなく、
       言っても **画面には 機械の報告しか 出さない。**
     ★ 声は もう鳴っているので 完全には 止まらない。ここで止めるのは
       **画面に残る文**。残る文が 事実であれば、あとから読んだ人が
       だまされない。 */
  var 直近 = null;      /* { 出, 時 } */

  function 覚える(出) {
    if (!出 || typeof 出 !== "object") return 出;
    if (出.報告 !== undefined) { 直近 = { 出: 出, 時: Date.now() }; return 出; }
    /* 「聞き返し」の形（だめ／きくこと）も 覚える。
       聞いている最中に「直しました」と言われるのを 止めるため。 */
    if (出.だめ !== undefined) {
      直近 = { 時: Date.now(), 出: {
        報告: 文(出.だめ) + (出.きくこと ? "\n" + 文(出.きくこと) : ""),
        状態: "rejected", 変えた数: 0, 未適用: 1, 残る崩れ: 0,
        完成と言ってよい: 出.完成と言ってよい === true,
        つぎ: 文(出.つぎ)
      } };
    }
    return 出;
  }
  function 忘れる() { 直近 = null; }
  function いまの報告(有効ms) {
    if (!直近) return null;
    var 限 = Number(有効ms) || 120000;
    if (Date.now() - 直近.時 > 限) return null;
    return 直近.出;
  }

  /* 差し替える文。**なぜ差し替えたか**も 一緒に出す（黙って書き換えない）。 */
  function 差し替え文(r) {
    return "（いまの言いかたは 数えた結果と 合っていないので、"
      + "こちらで 差し替えました）\n" + 文(r && r.報告);
  }

  /* 発話を 検閲する。
       発話 … Lumi が 言った文（積み上がったもの）
       報告 … その場で 用意した機械の報告（無ければ 直近を使う）
     返り { 直した, 文, ひっかかり, もとの文 } */
  function 検閲(発話, 報告) {
    var s = 文(発話);
    var ひ = 言ってしまった(s);
    if (!ひ.length) return { 直した: false, 文: s, ひっかかり: [] };
    var r = 報告 || いまの報告();
    /* 機械の報告が 無い＝Workplace の話ではない（クイズなど）。**触らない。** */
    if (!r) return { 直した: false, 文: s, ひっかかり: ひ, 報告なし: true };
    if (r.完成と言ってよい) return { 直した: false, 文: s, ひっかかり: ひ };
    return { 直した: true, 文: 差し替え文(r), もとの文: s, ひっかかり: ひ };
  }

  VQW.report = {
    render: render, 言ってよい: 言ってよい, 道具の返り: 道具の返り,
    言ってしまった: 言ってしまった, 完成の言葉: 完成の言葉, 理由の言葉: 理由の言葉,
    覚える: 覚える, 忘れる: 忘れる, いまの報告: いまの報告, 検閲: 検閲
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
