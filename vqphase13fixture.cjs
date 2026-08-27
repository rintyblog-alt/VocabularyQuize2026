/* Phase 13 再現テスト用の資料をつくる。

   利用者の実ファイル（スラスラEnglish 2ページ / 日本史探究 17ページ）は
   手元に無いので、**破綻したときと同じ条件**を持つ資料を作る。

   日本史側は「1学期期末考査資料」＝ 試験問題そのものの体裁を持つ。
     ・問題番号 1〜28
     ・a / b / c / d の選択肢記号
     ・氏名欄・組番欄・試験時間・配点・注意事項
     ・ページ番号
   これがあるから「問題番号は 1 から 28 まである」が出題できてしまった。
   体裁を消した資料で試しても、直ったことの証明にならない。
   同時に、出題に足る教科内容（人名・年号・因果）も入れる。

   実行: node vqphase13fixture.cjs
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT = path.join(__dirname, "artifacts", "quick-mock-phase13");
fs.mkdirSync(OUT, { recursive: true });

const CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; font-size: 10.5pt; line-height: 1.7; color:#111; }
  .pg { page-break-after: always; }
  .pg:last-child { page-break-after: auto; }
  h1 { font-size: 15pt; margin: 0 0 8px; }
  h2 { font-size: 12pt; margin: 14px 0 6px; border-left: 4px solid #333; padding-left: 6px; }
  .head { display:flex; justify-content:space-between; border-bottom:1px solid #333; padding-bottom:4px; margin-bottom:10px; font-size:9.5pt; }
  .name { border:1px solid #333; padding:4px 10px; }
  .q { margin: 10px 0; }
  .ch { margin-left: 14px; }
  .fo { margin-top: 16px; text-align:center; font-size:9pt; color:#444; }
`;

/* ── 日本史探究 1学期期末考査資料（17ページ） ── */
const TOPICS = [
  { h: "第1章 江戸幕府の成立", b: [
    "1600年、関ヶ原の戦いで徳川家康が石田三成らを破り、全国の実権を握った。",
    "1603年、家康は征夷大将軍に任じられ、江戸に幕府を開いた。",
    "1615年、大坂夏の陣で豊臣氏が滅び、幕府の支配が確立した。同年、武家諸法度が制定され、大名の居城の修築や無断の婚姻が禁じられた。",
    "幕府は将軍と大名の主従関係を基礎とし、大名を親藩・譜代・外様に分けて配置した。外様大名は江戸から遠い地に置かれ、要地は譜代大名が固めた。"
  ] },
  { h: "第2章 幕藩体制の仕組み", b: [
    "幕府と藩が全国の土地と人民を支配する体制を幕藩体制という。",
    "1635年、三代将軍徳川家光は武家諸法度を改定し、参勤交代を制度化した。大名は原則として一年おきに江戸と領国を往復し、妻子は江戸に住まわされた。",
    "参勤交代は大名に多額の出費を強い、経済力を削ぐ効果を持った。同時に街道や宿場町が整備され、全国的な交通網の発達をうながした。",
    "石高制のもとで大名は石高に応じた軍役を負担した。年貢は主に米で納められ、四公六民や五公五民の割合が用いられた。"
  ] },
  { h: "第3章 鎖国と対外関係", b: [
    "1612年から幕府は禁教令を出し、キリスト教を禁じた。",
    "1637年、島原・天草一揆が起こり、幕府は大軍を送って鎮圧した。この一揆はキリスト教徒の農民が中心であった。",
    "1639年、ポルトガル船の来航が禁止され、1641年にオランダ商館が平戸から長崎の出島へ移された。以後、ヨーロッパではオランダのみが幕府と交易した。",
    "対外関係は四つの窓口で保たれた。長崎ではオランダと中国、対馬藩を通じて朝鮮、薩摩藩を通じて琉球、松前藩を通じてアイヌと交易した。",
    "朝鮮からは将軍の代替わりごとに朝鮮通信使が派遣された。"
  ] },
  { h: "第4章 産業と交通の発達", b: [
    "新田開発が進み、17世紀を通じて耕地面積は大きく増加した。備中鍬・千歯扱き・唐箕などの農具が普及し、生産力が高まった。",
    "商品作物の栽培が広がり、木綿・菜種・藍・紅花などが各地で生産された。",
    "五街道が整備され、東海道・中山道・甲州道中・日光道中・奥州道中が江戸を起点に延びた。海路では東廻り航路・西廻り航路が河村瑞賢によって整えられた。",
    "大坂は「天下の台所」と呼ばれ、諸藩の蔵屋敷が置かれて年貢米や特産物が集められた。"
  ] },
  { h: "第5章 元禄文化", b: [
    "17世紀末から18世紀初めにかけて、上方の町人を担い手とする元禄文化が栄えた。",
    "井原西鶴は浮世草子で町人の生活を描き、松尾芭蕉は俳諧を芸術へ高めた。近松門左衛門は人形浄瑠璃・歌舞伎の脚本を書いた。",
    "学問では朱子学が幕府に重んじられ、林羅山の子孫が代々学問を担った。一方で古学派の伊藤仁斎や荻生徂徠が現れた。",
    "自然科学では宮崎安貞が『農業全書』を、関孝和が和算を大成した。"
  ] },
  { h: "第6章 幕政の改革", b: [
    "1716年から徳川吉宗は享保の改革を行った。上米の制で大名から米を献上させ、代わりに参勤交代の江戸滞在を半減した。",
    "目安箱を設置して庶民の意見を聞き、小石川養生所を設けた。公事方御定書を定めて裁判の基準を整えた。",
    "田沼意次は商人の力を利用し、株仲間を公認して運上・冥加を徴収した。印旛沼の干拓や蝦夷地の開発も試みた。",
    "1787年から松平定信の寛政の改革が行われた。囲米で飢饉に備え、旧里帰農令を出し、寛政異学の禁で朱子学以外を昌平坂学問所で講じることを禁じた。",
    "1841年から水野忠邦の天保の改革が行われた。株仲間の解散、人返しの法、上知令が出されたが、上知令は反対を受けて失敗した。"
  ] }
];

function historyPages() {
  const pages = [];
  /* p.1 表紙（体裁のみ） */
  pages.push(`
    <div class="pg">
      <div class="head"><span>令和7年度 1学期期末考査</span><span>日本史探究</span></div>
      <h1>日本史探究 1学期期末考査資料</h1>
      <p>試験時間 50分 ／ 満点 100点 ／ 問題は 1 から 28 まであります。</p>
      <p>解答はすべて解答用紙の所定の欄に記入しなさい。選択問題は a・b・c・d の記号で答えなさい。</p>
      <h2>注意事項</h2>
      <p>1. 監督者の指示があるまで開いてはいけません。<br>
         2. 解答用紙に組・番・氏名を記入しなさい。<br>
         3. 問題冊子は持ち帰ってかまいません。</p>
      <p class="name">組 &nbsp;&nbsp;&nbsp; 番 &nbsp;&nbsp;&nbsp; 氏 名 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
      <div class="fo">- 1 -</div>
    </div>`);

  /* p.2〜p.13 学習内容（各章を 2 ページに割る） */
  let pno = 2;
  TOPICS.forEach((t) => {
    const half = Math.ceil(t.b.length / 2);
    [t.b.slice(0, half), t.b.slice(half)].forEach((part, k) => {
      if (!part.length) return;
      pages.push(`
        <div class="pg">
          <div class="head"><span>日本史探究</span><span>${t.h}</span></div>
          <h2>${t.h}${k ? "（続き）" : ""}</h2>
          ${part.map((p) => `<p>${p}</p>`).join("")}
          <div class="fo">- ${pno} -</div>
        </div>`);
      pno++;
    });
  });

  /* 残りを過去問（体裁の濃いページ）で埋めて 17 ページにする */
  const QS = [
    ["江戸幕府を開いた人物として正しいものを一つ選べ。", ["徳川家光", "徳川家康", "豊臣秀吉", "徳川吉宗"]],
    ["参勤交代を制度化した将軍を一つ選べ。", ["徳川家康", "徳川綱吉", "徳川家光", "徳川慶喜"]],
    ["オランダ商館が移された場所を一つ選べ。", ["平戸", "出島", "堺", "博多"]],
    ["享保の改革を行った将軍を一つ選べ。", ["徳川吉宗", "田沼意次", "松平定信", "水野忠邦"]],
    ["株仲間の解散を命じた改革を一つ選べ。", ["享保の改革", "寛政の改革", "天保の改革", "安政の改革"]],
    ["『農業全書』を著した人物を一つ選べ。", ["関孝和", "宮崎安貞", "井原西鶴", "荻生徂徠"]]
  ];
  let qno = 1;
  while (pages.length < 17) {
    const items = [];
    for (let i = 0; i < 5 && qno <= 28; i++, qno++) {
      const [text, ch] = QS[(qno - 1) % QS.length];
      items.push(`
        <div class="q"><b>問 ${qno}</b> ${text}
          <div class="ch">a. ${ch[0]} &nbsp; b. ${ch[1]} &nbsp; c. ${ch[2]} &nbsp; d. ${ch[3]}</div>
          <div class="ch">配点 3点</div>
        </div>`);
    }
    pages.push(`
      <div class="pg">
        <div class="head"><span>日本史探究</span><span>練習問題</span></div>
        <h2>練習問題（第${Math.ceil(qno / 5)}回）</h2>
        ${items.join("")}
        <div class="fo">- ${pno} -</div>
      </div>`);
    pno++;
    if (qno > 28) qno = 1;
  }
  return pages.slice(0, 17).join("");
}

function englishPages() {
  return `
    <div class="pg">
      <div class="head"><span>SuraSura English</span><span>Unit 1</span></div>
      <h1>スラスラEnglish 速習ドリル</h1>
      <h2>Unit 1: Daily Conversation</h2>
      <p>A: How was your weekend? B: It was great. I went hiking with my family.</p>
      <p>Key phrases: How was ~? / I went ~ing / It was great.</p>
      <p>Practice: Rewrite the sentences using the present perfect tense.</p>
      <p>1. I visit Kyoto last year. 2. She finish her homework already.</p>
      <div class="fo">- 1 -</div>
    </div>
    <div class="pg">
      <div class="head"><span>SuraSura English</span><span>Unit 2</span></div>
      <h2>Unit 2: Reading</h2>
      <p>Read the passage and answer the questions. Many students find speaking English difficult
         because they worry about making mistakes. However, making mistakes is a natural part of learning.</p>
      <p>Q1. Why do students find speaking difficult? Q2. What does the writer say about mistakes?</p>
      <p>Vocabulary: natural, mistake, worry, part of learning</p>
      <div class="fo">- 2 -</div>
    </div>`;
}

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage();

  const make = async (name, inner) => {
    await pg.setContent(`<style>${CSS}</style>${inner}`, { waitUntil: "load" });
    const file = path.join(OUT, name);
    await pg.pdf({ path: file, format: "A4", printBackground: true });
    const size = fs.statSync(file).size;
    console.log(`  ${name}  ${(size / 1024).toFixed(0)} KB`);
    return file;
  };

  console.log("Phase 13 再現テスト用の資料を作ります");
  await make("スラスラEnglish.pdf", englishPages());
  await make("日本史探究 1学期期末考査資料.pdf", historyPages());
  await browser.close();
  console.log("→ " + OUT);
})();
