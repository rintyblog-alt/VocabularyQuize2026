/* ══════════════════════════════════════════════════════════════════════
   design/sample.js — **確認用の中身**（design-lab でしか使わない）

   ★ これはテンプレートではない。デザインだけを見たいときに、
     中身を毎回 人が書かなくて済むようにするための ダミー原稿。
   ★ 本番の生成では LLM が中身を作る。ここは import されない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  var 文 = {
    heading: ["文化祭の企画", "なぜ いま やるのか", "来場者に 何が残るか", "当日の流れ",
              "費用の内訳", "役割の分担", "起こりうること", "この企画で 変わること"],
    subheading: ["3 年 A 組 実行委員会", "去年の反省から", "はじめの 30 分が勝負",
                 "準備は 3 週間前から", "見積りは 10 万円以内"],
    body: ["来場者が自分の手で作って持ち帰れる体験を用意します。待ち時間を短くするため、受付と制作を分けます。",
           "去年は行列が出口までのび、途中で帰る人が多く出ました。今年は導線を一方通行にします。",
           "материалは前日に検品し、当日の朝はもう触らない。決めごとを減らすほど、当日は静かになります。"],
    bullets: [["準備は 3 週間前から", "当日は 2 交代制", "材料は前日に検品"],
              ["受付と制作を分ける", "導線は一方通行", "出口で感想を集める"],
              ["雨天のときは 体育館", "電源は 2 系統まで", "ごみは 分別して持ち帰り"]],
    quote: ["待たせない。それが満足度を いちばん動かす。", "作ったものを持ち帰れると、話が家まで続く。"],
    quoteBy: ["昨年の来場者アンケート", "実行委員会のふりかえり"],
    metric: [["1,240", "昨年の来場者数"], ["10 万円", "今年の予算"], ["3 週間", "準備の期間"],
             ["92%", "また来たいと答えた割合"]],
    diagram: [["企画", "準備", "当日", "片づけ"], ["受付", "制作", "撮影", "出口"]],
    tableRows: [
      [["項目", "金額"], ["装飾", "30,000"], ["材料", "20,000"], ["雑費", "10,000"], ["飲食", "40,000"]],
      [["担当", "人数", "時間帯"], ["受付", "2", "10:00-12:00"], ["制作", "4", "終日"], ["片づけ", "6", "15:00-"]]
    ],
    chart: [
      { type: "pie", title: "費用の内訳", labels: ["装飾", "材料", "雑費", "飲食"],
        series: [{ name: "万円", data: [3, 2, 1, 4] }] },
      { type: "bar", title: "時間帯ごとの来場者", labels: ["10時", "11時", "12時", "13時", "14時"],
        series: [{ name: "人", data: [120, 260, 410, 380, 210] }] },
      { type: "line", title: "3 年間の来場者数", labels: ["一昨年", "昨年", "今年（見込み）"],
        series: [{ name: "人", data: [820, 1240, 1500] }] }
    ]
  };
  /* 「材料」がキリル文字混じりになっていた行を 直す（打ち間違い） */
  文.body[2] = "材料は前日に検品し、当日の朝はもう触らない。決めごとを減らすほど、当日は静かになります。";

  function 切る(s, n) {
    s = String(s);
    return s.length <= n ? s : s.slice(0, Math.max(2, n - 1)) + "…";
  }

  /* スロットの寸法（文字数上限・行数上限）に合わせて 中身を作る */
  function 中身(role, 寸, 種) {
    var i = (種 | 0);
    var 上限 = 寸 && 寸.文字数上限 || 40;
    var 行 = 寸 && 寸.行数上限 || 3;
    var 一行 = 寸 && 寸.一行の文字数 || 20;
    if (role === "heading") return { text: 切る(文.heading[i % 文.heading.length], 上限) };
    if (role === "subheading") return { text: 切る(文.subheading[i % 文.subheading.length], 上限) };
    if (role === "body") return { text: 切る(文.body[i % 文.body.length], 上限) };
    if (role === "bullets") {
      var 元 = 文.bullets[i % 文.bullets.length], 出 = [], 残字 = 上限, 残行 = 行;
      元.forEach(function (x) {
        var t = 切る(x, Math.max(2, Math.min(一行 - 1, 残字 - 1)));
        if (残行 < 1 || 残字 < t.length + 1) return;
        出.push(t); 残行 -= 1; 残字 -= t.length + 1;
      });
      return { items: 出.length ? 出 : [切る(元[0], Math.max(2, Math.min(一行 - 1, 上限 - 1)))] };
    }
    if (role === "quote")
      return { text: 切る(文.quote[i % 文.quote.length], Math.max(6, 上限 - 10)),
               caption: 文.quoteBy[i % 文.quoteBy.length] };
    if (role === "metric") {
      var m = 文.metric[i % 文.metric.length];
      return { value: m[0], caption: m[1] };
    }
    if (role === "diagram") return { items: 文.diagram[i % 文.diagram.length].slice(0, Math.max(2, Math.min(4, 行 + 1))) };
    if (role === "table") return { rows: 文.tableRows[i % 文.tableRows.length].slice(0, Math.max(2, 行 + 1)) };
    if (role === "chart") return { chart: 文.chart[i % 文.chart.length] };
    if (role === "steps") return { cells: [
      { title: "企画を決める", text: "3 週間前まで" },
      { title: "材料をそろえる", text: "2 週間前まで" },
      { title: "試作する", text: "1 週間前まで" }].slice(0, Math.max(2, Math.min(4, 行 + 1))) };
    if (role === "compare") return { cells: [
      { title: "去年", text: "行列が出口までのび、途中で帰る人が出た" },
      { title: "今年", text: "受付と制作を分け、導線を一方通行にする" }] };
    if (role === "kpi") return { cells: [
      { value: "1,240", title: "昨年の来場者" },
      { value: "92%", title: "また来たい" },
      { value: "10 万円", title: "今年の予算" }].slice(0, Math.max(2, Math.min(4, 行 + 1))) };
    if (role === "callout") return { text: 切る("待たせない。それが満足度を いちばん動かす。", 上限),
                                     caption: "昨年のアンケート" };
    if (role === "timeline") return { cells: [
      { title: "9 月", text: "企画決定" }, { title: "10 月", text: "材料手配" },
      { title: "11 月", text: "試作" }, { title: "文化祭", text: "本番" }] };
    if (role === "section") return { text: 切る("当日の進めかた", 上限), value: "02" };
    return { text: 切る(文.body[i % 文.body.length], 上限) };
  }

  VQD.sample = { 中身: 中身, 文: 文 };
})(typeof globalThis !== "undefined" ? globalThis : this);
