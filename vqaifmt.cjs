/* ══════════════════════════════════════════════════════════════════════
   Workplace の AI アシスタントが実際に何を返すかを採り、
   整形層（ai-format.js）を通すとどう変わるかを測る — 開発環境のみ

   ここで見たいこと:
     ・今の頼み方だと、会話文がどれくらい混ざるか
     ・約束（===OUTPUT===）を足すと守られるか
     ・表を頼んだとき、実際に表として読めるか

   使い方: node vqaifmt.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

/* 整形層をそのまま読み込む（画面と同じものを試す） */
const fs = require("fs");
const vm = require("vm");
const sandbox = { window: {}, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("client/v2/workplace/ai-format.js", "utf8"), sandbox);
const F = sandbox.window.VQ2.workplace.aiFormat;

const CASES = [
  { id: "表にする", kind: "table",
    base: "次の文章の内容を Markdown の表に整理してください。出力は表だけ。",
    src: "2026年の売上は、4月が120万円、5月が145万円、6月が98万円だった。7月は再び伸びて160万円、8月は175万円に達した。" },
  { id: "読みやすく", kind: "text",
    base: "次の文章を、意味を変えずに、より読みやすい日本語へ書き直してください。出力は本文だけ。",
    src: "本件につきましては現在検討中であり結論には至っておらず今後の状況を踏まえた上で改めてご連絡させていただく所存でございます。" },
  { id: "見出しを付ける", kind: "text",
    base: "次の文章に見出しを付けた形へ整えてください。見出しは「## 」で始めます。出力は本文だけ。",
    src: "光合成は植物が光を使って栄養を作る仕組みである。葉緑体で行われる。二酸化炭素と水から糖と酸素を作る。明反応と暗反応に分かれる。" },
  { id: "表を作る(TSV)", kind: "tsv",
    base: "次の指示にしたがって表を作ってください。出力はタブ区切りの表だけ。1 行目は見出し。",
    src: "【指示】1 週間の勉強時間を科目ごとに記録する表。国語・数学・英語・理科・社会。" },
  { id: "数式", kind: "formula",
    base: "次の表に対して役立つ数式を 1 つだけ提案してください。出力は「=」で始まる数式の 1 行だけ。説明は不要。",
    src: "科目\t月\t火\t水\n国語\t30\t45\t20\n数学\t60\t30\t50" },
  { id: "スライド構成", kind: "outline",
    base: "次のテーマで発表スライドの構成を作ってください。1 枚ごとに「## 見出し」の行と、その下に「- 箇条書き」を 3 行まで。出力は構成だけ。",
    src: "【指示】光合成のしくみについて、中学生向けに 6 枚で発表したい。" },
  { id: "アンケート", kind: "form",
    base: "次の指示にしたがってアンケートの質問を作ってください。\n1 行につき 1 問。形式は「type|質問文|選択肢1;選択肢2」。\ntype は single_choice / multi_choice / short_text / long_text / scale / star のいずれか。出力は行だけ。",
    src: "【指示】文化祭の満足度アンケート。生徒向けで 5 分以内。自由記述は 2 問まで。" },
  { id: "要約", kind: "text",
    base: "次の文章を 3〜5 行で要約してください。出力は要約だけ。",
    src: "江戸時代の教育は寺子屋が中心であった。庶民の子どもは読み書きそろばんを学んだ。武士の子は藩校へ通い儒学を修めた。識字率は当時の世界でも高い水準にあったとされる。明治になると学制が公布され、近代的な学校制度が始まった。" }
];

async function ask(token, message) {
  const r = await fetch(BASE + "/api/chat/workers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ messages: [{ role: "user", content: message }] })
  });
  const t = await r.text();
  let d = null; try { d = JSON.parse(t); } catch (e) { return { err: t.slice(0, 200) }; }
  const c = d?.choices?.[0]?.message?.content;
  if (typeof c !== "string") return { err: JSON.stringify(d).slice(0, 250) };
  return { text: c };
}

/* 会話文が混ざっているかの判定。甘くしない。 */
const CHATTY = /(はい[、,]|承知(いた)?しました|かしこまりました|了解(いた)?しました|以下(が|に)|作成しました|書き直しました|いかがでしょうか|ご確認ください|必要に応じて|Sure[,!]|Certainly|Here('s| is| are))/;
function chatty(s) {
  const L = String(s).split("\n").filter(x => x.trim());
  if (!L.length) return false;
  return CHATTY.test(L[0]) || CHATTY.test(L[L.length - 1]);
}
function fenced(s) { return /```/.test(String(s)); }

(async () => {
  console.log("接続先: " + BASE + "（開発環境）\n");
  const nick = "fmt" + Date.now().toString(36).slice(-7);
  const pw = "AiFmt#2026a";
  const reg = await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: pw, tosAccepted: true, tosVersion: "1" })
  }).then(r => r.json());
  if (!reg.token) { console.error("検証アカウントを作れませんでした:", reg); process.exit(1); }
  const token = reg.token;

  const tally = { 旧チャット混入: 0, 新チャット混入: 0, 旧フェンス: 0, 新フェンス: 0,
    旧形式OK: 0, 新形式OK: 0, 件数: 0 };

  for (const c of CASES) {
    tally.件数++;
    console.log("══ " + c.id + " ══");

    /* 今の頼み方 */
    const oldMsg = c.base + "\n\n【対象】\n" + c.src;
    const a = await ask(token, oldMsg);
    const oldRaw = a.text || ("(取得失敗) " + a.err);
    const oldChat = chatty(oldRaw), oldFence = fenced(oldRaw);
    const oldVal = F.validate(c.kind, oldRaw);
    if (oldChat) tally.旧チャット混入++;
    if (oldFence) tally.旧フェンス++;
    if (oldVal.ok) tally.旧形式OK++;
    console.log("  【今】 会話文=" + (oldChat ? "混入" : "なし")
      + " / ```=" + (oldFence ? "あり" : "なし")
      + " / 形式=" + (oldVal.ok ? "OK" : "NG(" + oldVal.why + ")"));
    console.log("        " + JSON.stringify(oldRaw.slice(0, 150)));

    /* 約束を足した頼み方 → 整形層を通す */
    const newMsg = c.base + F.contract(c.kind) + "\n【対象】\n" + c.src;
    const b = await ask(token, newMsg);
    const newRaw = b.text || ("(取得失敗) " + b.err);
    const cleaned = F.clean(newRaw, c.kind);
    let val = F.validate(c.kind, cleaned);
    let retried = false;
    if (!val.ok) {
      /* 画面と同じく 1 回だけ言い直す */
      retried = true;
      const r2 = await ask(token, newMsg + "\n\n" + F.retryNote(c.kind, val.why));
      const c2 = F.clean(r2.text || "", c.kind);
      const v2 = F.validate(c.kind, c2);
      if (v2.ok) { val = v2; }
    }
    const newChat = chatty(cleaned), newFence = fenced(cleaned);
    if (newChat) tally.新チャット混入++;
    if (newFence) tally.新フェンス++;
    if (val.ok) tally.新形式OK++;
    console.log("  【新】 会話文=" + (newChat ? "混入" : "なし")
      + " / ```=" + (newFence ? "あり" : "なし")
      + " / 形式=" + (val.ok ? "OK" : "NG(" + val.why + ")")
      + (retried ? " ※1回言い直した" : ""));
    console.log("        " + JSON.stringify(cleaned.slice(0, 150)));
    if (val.table) console.log("        → 表として読めた: " + val.table.cols + " 列 × "
      + (val.table.rows.length + 1) + " 行  見出し=" + JSON.stringify(val.table.header));
    if (val.slides) console.log("        → スライド " + val.slides.length + " 枚として読めた");
    console.log();
  }

  await fetch(BASE + "/api/auth/delete", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ password: pw })
  }).catch(() => {});

  const n = tally.件数;
  console.log("══ まとめ（" + n + " 件）══");
  console.log("  会話文の混入   今 " + tally.旧チャット混入 + " 件  →  新 " + tally.新チャット混入 + " 件");
  console.log("  ``` の混入     今 " + tally.旧フェンス + " 件  →  新 " + tally.新フェンス + " 件");
  console.log("  形式が通った   今 " + tally.旧形式OK + " / " + n + "  →  新 " + tally.新形式OK + " / " + n);
  process.exit(tally.新形式OK >= tally.旧形式OK && tally.新チャット混入 <= tally.旧チャット混入 ? 0 : 1);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(2); });
