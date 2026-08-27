/* ══════════════════════════════════════════════════════════════════════
   並べ替えの札に「→」などの記号だけのものが混ざらないこと

   実測（利用者の報告・問 27）:
     items = ["ウイルスなどが","突然変異を起こす","→","毒性や感染力が","変化してきた"]
   矢印は並べる中身ではないうえ、どこへ置いても「正しい位置」にならない。

   ここで見るのは 2 つ。
     ・サーバ: 受け取ったときに矢印の札を外し、外せないものは検査で落とす
     ・画面:   すでに作ってあるプリセットも、出すときに外す

   AI は呼ばない（純関数だけを取り出して確かめる）。枠も時間も使わない。
   使い方: node vqreorder.cjs
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const WORKER = fs.readFileSync(path.join(ROOT, "server", "src", "worker.js"), "utf8");
const INDEX = fs.readFileSync(path.join(ROOT, "client", "index.html"), "utf8");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

/* ── サーバ側の純関数を取り出す ───────────────────────────────── */
function loadServer() {
  const s = WORKER.indexOf("/* 並べ替えの札に「言葉」が入っているか");
  const e = WORKER.indexOf("function aigenQualityIssue");
  if (s < 0 || e < 0 || e <= s) throw new Error("並べ替えの部品が見つかりません");
  return new Function(WORKER.slice(s, e)
    + "\nreturn { E: AIGEN_ENGINES, coerce: aigenCoerceQuestion };")();
}
const S = loadServer();
const reorder = S.E.reorder;
/* 受け取り → 検査、の順に通す（本体と同じ流れ） */
const run = (q) => { S.coerce(q, "reorder"); return { q, why: reorder.validate(q) }; };
const sortedEq = (a, b) =>
  a.slice().map(String).sort().join("") === b.slice().map(String).sort().join("");

section("矢印だけの札を外す（実測の問 27）");
{
  const r = run({
    type: "reorder",
    question: "新興感染症が出現する理由に関する説明文を正しい順に並べなさい。",
    items: ["突然変異を起こす", "変化してきた", "→", "ウイルスなどが", "毒性や感染力が"],
    answer: ["ウイルスなどが", "突然変異を起こす", "→", "毒性や感染力が", "変化してきた"],
    explanation: "ウイルスは増えるときに設計図を写し間違えることがあり、それが突然変異になる。その結果、毒性や感染力が変わる。"
  });
  /* この問題は矢印だけでなく、札が文の切れはしにもなっている。
     掃除で矢印は消えるが、**切れはしの検査で落ちる**のが正しい。 */
  ok("★「→」の札が消えている", r.q.items.indexOf("→") < 0, r.q.items);
  ok("★正解からも「→」が消えている", r.q.answer.indexOf("→") < 0, r.q.answer);
  ok("札が 4 枚残る", r.q.items.length === 4, r.q.items.length);
  ok("items と answer の中身がそろっている", sortedEq(r.q.items, r.q.answer),
    { items: r.q.items, answer: r.q.answer });
  ok("答えの順が元のまま", r.q.answer.join("|") === "ウイルスなどが|突然変異を起こす|毒性や感染力が|変化してきた", r.q.answer);
  ok("残った切れはしは検査で落ちる", r.why === "順番に並べる問題なのに札が文の切れはしになっている", r.why);
}
{
  /* 札そのものは文として立っていて、矢印だけが余計な場合。
     掃除だけで問題として成立するので、**作り直させない**。 */
  const r = run({
    type: "reorder",
    question: "食中毒が起こるまでの流れを、起こる順に並べなさい。",
    items: ["→", "菌が食品の中で増える", "食品に菌がつく", "食べた人が症状を起こす", "菌が体の中に入る"],
    answer: ["食品に菌がつく", "→", "菌が食品の中で増える", "菌が体の中に入る", "食べた人が症状を起こす"],
    explanation: "食中毒は、食品に菌がついたあと増え、それを食べることで体に入って症状が出るという順で起こる。"
  });
  ok("★掃除だけで通る（作り直させない）", r.why === null, r.why);
  ok("札が 4 枚残る", r.q.items.length === 4, r.q.items);
}

section("札の頭やお尻に付いた矢印を落とす");
{
  const r = run({
    type: "reorder",
    question: "次の語句を並べ替えて意味の通る文にしなさい。",
    items: ["→ 突然変異を起こす", "ウイルスなどが", "変化してきた", "毒性や感染力が →", "・"],
    answer: ["ウイルスなどが", "→ 突然変異を起こす", "毒性や感染力が →", "変化してきた", "・"],
    explanation: "ウイルスは写し間違いで突然変異を起こし、その結果として毒性や感染力が変わっていく。"
  });
  ok("検査を通る", r.why === null, r.why);
  ok("頭の矢印が落ちている", r.q.answer.indexOf("突然変異を起こす") >= 0, r.q.answer);
  ok("お尻の矢印が落ちている", r.q.answer.indexOf("毒性や感染力が") >= 0, r.q.answer);
  ok("中黒だけの札が消えている", r.q.items.indexOf("・") < 0, r.q.items);
  ok("items と answer の中身がそろっている", sortedEq(r.q.items, r.q.answer), r.q.items);
}

section("外してはいけないものは外さない");
{
  /* 全部が記号 = 演算子の順序など、それ自体が問題。触らない。 */
  const r = run({
    type: "reorder",
    question: "計算の順序が先になるものから並べなさい。",
    items: ["+", "×", "( )", "−"],
    answer: ["( )", "×", "+", "−"],
    explanation: "かっこの中を最初に計算し、次にかけ算やわり算、最後にたし算やひき算をおこなう決まりになっている。"
  });
  ok("★記号だけの問題はそのまま通る", r.why === null, r.why);
  ok("札の数が変わらない", r.q.items.length === 4, r.q.items);
}
{
  /* 外すと 4 枚を切る。作り足さず、検査で落として作り直させる。 */
  const r = run({
    type: "reorder",
    question: "次の語句を並べ替えて意味の通る文にしなさい。",
    items: ["→", "ウイルスが", "変わる", "毒性が"],
    answer: ["ウイルスが", "→", "毒性が", "変わる"],
    explanation: "ウイルスの性質が変わることで毒性や感染力が変化するという流れを示している。"
  });
  ok("★3 枚を切るときは落とす（作り足さない）", r.why !== null, { why: r.why, items: r.q.items });
}

section("「順に並べなさい」なのに札が文の切れはし（実測の問 11・問 7）");
{
  /* 問 11。「過程を並べなさい」なのに、札は文をぶつ切りにしたもの。
     「加齢にともなって」「運動器の障害のために」だけでは何の順か分からない。 */
  const why = reorder.validate({
    question: "中高年の身体の変化のうち、ロコモティブシンドロームに至る過程を正しく並べなさい。",
    items: ["運動器の障害のために", "立ったり歩いたりする能力が低下する", "骨や関節などの運動器が衰え", "加齢にともなって"],
    answer: ["加齢にともなって", "骨や関節などの運動器が衰え", "運動器の障害のために", "立ったり歩いたりする能力が低下する"]
  });
  ok("★過程の並べ替えで切れはしの札は落ちる",
    why === "順番に並べる問題なのに札が文の切れはしになっている", why);
}
{
  /* 問 7。「手順について正しく並べなさい」なのに、札は文の切れはし。 */
  const why = reorder.validate({
    question: "感染症予防の3原則における感染源対策の手順について正しく並べなさい。",
    items: ["病原体をなくす", "新たな感染は起こらないため", "感染源を断てば", "消毒や殺菌などで"],
    answer: ["感染源を断てば", "新たな感染は起こらないため", "消毒や殺菌などで", "病原体をなくす"]
  });
  ok("★手順の並べ替えでも落ちる", why === "順番に並べる問題なのに札が文の切れはしになっている", why);
}
{
  /* 問 27。「正しい順に並べなさい」で「〜が」が 2 枚。 */
  const why = reorder.validate({
    question: "新興感染症が出現する理由に関する説明文を正しい順に並べなさい。",
    items: ["突然変異を起こす", "変化してきた", "ウイルスなどが", "毒性や感染力が"],
    answer: ["ウイルスなどが", "突然変異を起こす", "毒性や感染力が", "変化してきた"]
  });
  ok("★説明文の並べ替えでも落ちる", why === "順番に並べる問題なのに札が文の切れはしになっている", why);
}
{
  /* ちゃんとした順序並べ。1 枚ずつが文として立っている。 */
  const why = reorder.validate({
    question: "ロコモティブシンドロームに至る過程を、起こる順に並べなさい。",
    items: ["立ったり歩いたりする力が落ちる", "加齢によって骨や関節が衰える", "日常の動作がしにくくなる", "運動器に障害が起こる"],
    answer: ["加齢によって骨や関節が衰える", "運動器に障害が起こる", "立ったり歩いたりする力が落ちる", "日常の動作がしにくくなる"]
  });
  ok("★ちゃんとした順序並べは通る", why === null, why);
}
{
  /* 語句整序は、切れはしの札がふつう。**落としてはいけない。** */
  const why = reorder.validate({
    question: "次の語句を並べ替えて、意味の通る文にしなさい。",
    items: ["が", "手洗い", "です", "重要"],
    answer: ["手洗い", "が", "重要", "です"]
  });
  ok("★語句整序は切れはしでも通る（巻き込まない）", why === null, why);
}
{
  /* 英作文の並べ替えも巻き込まない。 */
  const why = reorder.validate({
    question: "次の語を並べ替えて英文を完成させなさい。",
    items: ["to", "I", "school", "go"],
    answer: ["I", "go", "to", "school"]
  });
  ok("★英作文の並べ替えも通る", why === null, why);
}
{
  /* 体言止め（「〜こと」「〜もの」）は文として立つので、切れはしにしない。 */
  const why = reorder.validate({
    question: "手洗いの手順を正しい順に並べなさい。",
    items: ["水でよくすすぐこと", "せっけんをつけること", "清潔なタオルでふくこと", "手をぬらすこと"],
    answer: ["手をぬらすこと", "せっけんをつけること", "水でよくすすぐこと", "清潔なタオルでふくこと"]
  });
  ok("★「〜こと」の札は落とさない", why === null, why);
}
{
  /* 切れはしが 1 枚だけなら、たまたまなので落とさない（作り直しを増やさない）。 */
  const why = reorder.validate({
    question: "実験の手順を正しい順に並べなさい。",
    items: ["試験管を加熱する", "変化を記録する", "試薬を加えて", "試験管に水を入れる"],
    answer: ["試験管に水を入れる", "試薬を加えて", "試験管を加熱する", "変化を記録する"]
  });
  ok("切れはしが 1 枚だけなら通す", why === null, why);
}

section("並べ終わった文が言い切りになっているか（実測）");
{
  /* 「感染症は/主に/空気や/飛沫で」— 全部そろえても文が終わらない。 */
  const why = reorder.validate({
    question: "次の語句を並べ替えて意味の通る文にしなさい。",
    items: ["主に", "感染症は", "飛沫で", "空気や"],
    answer: ["感染症は", "主に", "空気や", "飛沫で"]
  });
  ok("★「〜で」で終わる文は落ちる", why === "並べ替えた文が言い切りになっていない", why);
}
{
  /* 「糖尿病は/血糖値が/高い状態が/続くと」— 同じく終わっていない。 */
  const why = reorder.validate({
    question: "次の語句を並べ替えて意味の通る文にしなさい。",
    items: ["血糖値が", "糖尿病は", "続くと", "高い状態が"],
    answer: ["糖尿病は", "血糖値が", "高い状態が", "続くと"]
  });
  ok("★「〜と」で終わる文は落ちる", why === "並べ替えた文が言い切りになっていない", why);
}
{
  const why = reorder.validate({
    question: "次の語句を並べ替えて意味の通る文にしなさい。",
    items: ["毎年", "インフルエンザは", "予防できる", "ワクチン接種で"],
    answer: ["インフルエンザは", "毎年", "ワクチン接種で", "予防できる"]
  });
  ok("★言い切りで終わる文は通る", why === null, why);
}
{
  const why = reorder.validate({
    question: "次の語を並べ替えて英文を完成させなさい。",
    items: ["to", "I", "school", "go"],
    answer: ["I", "go", "to", "school"]
  });
  ok("英文は巻き込まない", why === null, why);
}
{
  const why = reorder.validate({
    question: "手洗いの手順を正しい順に並べなさい。",
    items: ["水でよくすすぐこと", "せっけんをつけること", "清潔なタオルでふくこと", "手をぬらすこと"],
    answer: ["手をぬらすこと", "せっけんをつけること", "水でよくすすぐこと", "清潔なタオルでふくこと"]
  });
  ok("「〜こと」で終わる並びは通る", why === null, why);
}

section("検査そのもの");
{
  /* 受け取りの掃除を通さずに直接検査した場合も、記号だけの札は落ちる。 */
  const why = reorder.validate({
    items: ["ウイルスなどが", "突然変異を起こす", "→", "毒性や感染力が"],
    answer: ["ウイルスなどが", "突然変異を起こす", "→", "毒性や感染力が"]
  });
  ok("★記号だけの札があれば検査で落ちる", why === "並べ替えの札に記号だけのものがある", why);
}
{
  const why = reorder.validate({
    items: ["骨や関節などの運動器が衰え", "加齢にともなって", "運動器の障害のために", "立ったり歩いたりする能力が低下する"],
    answer: ["加齢にともなって", "骨や関節などの運動器が衰え", "運動器の障害のために", "立ったり歩いたりする能力が低下する"]
  });
  ok("正しい問題はこれまでどおり通る", why === null, why);
}
ok("作り方の指示に「矢印だけの札を入れない」が入っている",
  /矢印（→ ⇒）や中黒（・）だけの札を入れない/.test(reorder.rule));

section("誤文訂正の作り方の指示");
{
  const ec = S.E.error_correction;
  /* 見本に「英文」と書いていたため、保健のプリセットに英語が混ざった（実測）。 */
  ok("★見本が言語を決め打ちしていない", ec.shape.indexOf("英文") < 0, ec.shape.slice(0, 90));
  ok("★言語は依頼文に合わせる、と書いてある", /言語は依頼文に合わせる/.test(ec.rule));
  ok("★その文だけで直せる誤りにする、と書いてある", /その文だけを読んで直せる/.test(ec.rule));
  ok("wrong と correct を対で出させる", /correct はその箇所だけを正しくした形/.test(ec.rule));
}
{
  /* wrong が本文に無い／wrong と correct が同じ、は取り込めないので落とす。 */
  ok("wrong が本文に無ければ落ちる",
    ec_v({ question: "アは正しい。", wrong: "イ", correct: "ウ", answer: "アは誤り。" })
      === "wrong が question の中に見つからない");
  ok("wrong と correct が同じなら落ちる",
    ec_v({ question: "アは正しい。", wrong: "ア", correct: "ア", answer: "アは誤り。" })
      === "wrong と correct が同じ");
  ok("そろっていれば通る",
    ec_v({ question: "AIDS は細菌によって起こる病気である。", wrong: "細菌", correct: "ウイルス",
      answer: "AIDS はウイルスによって起こる病気である。" }) === null);
}
function ec_v(q) { return S.E.error_correction.validate(q); }

section("画面側（すでに作ってあるプリセットも直る）");
{
  const s = INDEX.indexOf("var ORDER_WORD_RE =");
  const e = INDEX.indexOf("function normalizePairs");
  ok("札を外す部品がある", s >= 0 && e > s);
  if (s >= 0 && e > s) {
    const C = new Function(
      "var arr=function(v){return Array.isArray(v)?v:[];};var str=function(v){return v==null?'':String(v);};"
      + INDEX.slice(s, e) + "\nreturn dropMarkOnlyOrderItems;")();
    const items = [
      { id: "i1", text: "ウイルスなどが" }, { id: "i2", text: "突然変異を起こす" },
      { id: "i3", text: "→" }, { id: "i4", text: "毒性や感染力が" }, { id: "i5", text: "変化してきた" }
    ];
    const out = C(items);
    ok("★「→」の札が外れる", out.length === 4 && !out.some((x) => x.id === "i3"), out.map((x) => x.text));
    ok("全部が記号なら残す",
      C([{ id: "a", text: "+" }, { id: "b", text: "×" }, { id: "c", text: "−" }]).length === 3);
    ok("残りが 2 枚を切るなら触らない",
      C([{ id: "a", text: "→" }, { id: "b", text: "・" }, { id: "c", text: "計算する" }]).length === 3);
    ok("画像だけの札は残す",
      C([{ id: "a", text: "", image: "x.png" }, { id: "b", text: "" }, { id: "c", text: "あ" }]).length === 2);
  }
}
ok("並べ替えのときに呼んでいる",
  /engine === "reorder"\) q\.orderItems = dropMarkOnlyOrderItems\(q\.orderItems\)/.test(INDEX));
ok("★外した札を正解の並びからも落としている",
  /liveIds\[it\.id\] = true;[\s\S]{0,220}?order = order\.filter/.test(INDEX));

console.log("\n合格 " + pass + " / 不合格 " + fail);
if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
process.exit(fail ? 1 : 0);
