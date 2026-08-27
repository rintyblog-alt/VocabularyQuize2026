/* テスト用の PDF を作る。

   欲しいのは 3 種類。
   ・テキスト PDF   … 文字レイヤーがある。画像解析へ回らないはず
   ・スキャン PDF   … 文字レイヤーが無い。全ページを画像解析へ回すはず
   ・混在 PDF       … 一部だけ文字レイヤーが無い。そのページだけ回すはず

   外部の部品は入れない。PDF は自分で組み立てる。
   画像は PNG の IDAT をそのまま /FlateDecode（PNG 予測子つき）として置ける。
   JPEG の符号化器を持ち込まずに済む。

   文字は Helvetica（標準 14 書体）で書く。日本語はフォントの埋め込みが要るので、
   ここでは英語で書く。**見たいのは「文字レイヤーがあるか」**なので、これで足りる。
*/
const zlib = require("node:zlib");

/* ── PNG（塗りつぶし or 縞）の生画素を作る ── */
function rawPixels(w, h, kind) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1);
    raw[off] = 0;                                     /* フィルタ種別 None */
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      let r = 255, g = 255, b = 255;
      if (kind === "noise") {
        /* 文字らしい黒い塊を散らす。読めなくてよい（読めないことを見たい）。 */
        const on = ((x >> 3) + (y >> 4)) % 7 === 0 && (y % 40) < 12;
        if (on) { r = g = b = 30; }
      }
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }
  return raw;
}

function obj(n, body) { return n + " 0 obj\n" + body + "\nendobj\n"; }

/* pages: [{ text: "..." } | { image: true }] */
function buildPdf(pages) {
  const W = 612, H = 792;
  const IW = 320, IH = 420;
  const chunks = [];
  const offsets = [];
  let out = Buffer.from("%PDF-1.4\n", "latin1");
  const push = (s) => { out = Buffer.concat([out, Buffer.isBuffer(s) ? s : Buffer.from(s, "latin1")]); };
  const mark = (n) => { offsets[n] = out.length; };

  const nPages = pages.length;
  /* 1: Catalog, 2: Pages, 3: Font, 4: Image, 5.. : Page/Contents の組 */
  const FONT = 3, IMG = 4;
  const pageObj = (i) => 5 + i * 2;
  const contObj = (i) => 6 + i * 2;

  mark(1);
  push(obj(1, "<< /Type /Catalog /Pages 2 0 R >>"));
  mark(2);
  push(obj(2, "<< /Type /Pages /Kids [" +
    pages.map((_, i) => pageObj(i) + " 0 R").join(" ") + "] /Count " + nPages + " >>"));
  mark(FONT);
  push(obj(FONT, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));

  /* 画像は 1 つだけ作って、必要なページから使い回す */
  const idat = zlib.deflateSync(rawPixels(IW, IH, "noise"));
  mark(IMG);
  push(obj(IMG,
    "<< /Type /XObject /Subtype /Image /Width " + IW + " /Height " + IH +
    " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode" +
    " /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns " + IW + " >>" +
    " /Length " + idat.length + " >>\nstream\n"));
  push(idat);
  push("\nendstream");
  /* obj() を使わずに書いたので、閉じを自分で足す */
  push("\nendobj\n");

  pages.forEach((p, i) => {
    let stream;
    if (p.image) {
      stream = "q " + IW + " 0 0 " + IH + " 140 200 cm /Im0 Do Q\n";
    } else {
      const lines = String(p.text || "").split("\n");
      stream = "BT /F1 11 Tf 12 TL 56 720 Td\n"
        + lines.map((l) => "(" + l.replace(/([()\\])/g, "\\$1") + ") Tj T*\n").join("")
        + "ET\n";
    }
    const buf = Buffer.from(stream, "latin1");
    mark(pageObj(i));
    push(obj(pageObj(i),
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "]" +
      " /Resources << /Font << /F1 " + FONT + " 0 R >> /XObject << /Im0 " + IMG + " 0 R >> >>" +
      " /Contents " + contObj(i) + " 0 R >>"));
    mark(contObj(i));
    push(contObj(i) + " 0 obj\n<< /Length " + buf.length + " >>\nstream\n");
    push(buf);
    push("\nendstream\nendobj\n");
  });

  const maxObj = contObj(nPages - 1);
  const xref = out.length;
  let table = "xref\n0 " + (maxObj + 1) + "\n0000000000 65535 f \n";
  for (let n = 1; n <= maxObj; n++) {
    const o = offsets[n] || 0;
    table += String(o).padStart(10, "0") + " 00000 n \n";
  }
  push(table);
  push("trailer\n<< /Size " + (maxObj + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
  return out;
}

/* 読ませたい中身。英語なのは、埋め込みフォント無しで文字レイヤーを作るため。 */
const BODY1 = [
  "Photosynthesis Study Sheet",
  "",
  "Plants use light energy in chloroplasts to convert carbon",
  "dioxide and water into starch and oxygen. This process is",
  "called photosynthesis. Three conditions control its rate:",
  "light intensity, carbon dioxide concentration, and",
  "temperature. Respiration happens day and night, taking in",
  "oxygen and releasing carbon dioxide."
].join("\n");
const BODY2 = [
  "Leaf Structure and Stomata",
  "",
  "A leaf cross section shows the epidermis, palisade layer,",
  "spongy layer, and veins. Stomata are found mostly on the",
  "underside of the leaf and control transpiration and gas",
  "exchange. Guard cells swell with water to open a stoma and",
  "close it again as water leaves the cell.",
  "In a variegated leaf only the green parts turn blue-purple",
  "when iodine solution is applied to them."
].join("\n");

module.exports = {
  buildPdf,
  textPdf: () => buildPdf([{ text: BODY1 }, { text: BODY2 }]),
  scannedPdf: () => buildPdf([{ image: true }, { image: true }]),
  mixedPdf: () => buildPdf([{ text: BODY1 }, { image: true }, { text: BODY2 }]),
  BODY1, BODY2
};

if (require.main === module) {
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(__dirname, "artifacts", "attach");
  fs.mkdirSync(dir, { recursive: true });
  const made = [
    ["text.pdf", module.exports.textPdf()],
    ["scanned.pdf", module.exports.scannedPdf()],
    ["mixed.pdf", module.exports.mixedPdf()]
  ];
  made.forEach(([n, b]) => {
    fs.writeFileSync(path.join(dir, n), b);
    console.log(n + "  " + (b.length / 1024).toFixed(1) + " KB");
  });
}
