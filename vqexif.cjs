/* EXIF の向きが、実際にブラウザ側で立て直されているかを確かめる。

   サーバは画素を持っていないので回せない。回すのは画像を読み込む側で、
   いまの経路は <img> → canvas.drawImage → 再エンコードになっている。
   「ブラウザが勝手に直してくれるはず」で済ませず、実際に測る。

   やること:
   1. ブラウザで横長（400×200）の JPEG を作る
   2. その JPEG へ Orientation=6（右へ 90 度）の EXIF を差し込む
   3. もう一度ブラウザで読み、縦横が入れ替わって見えるかを見る
   4. いまの縮小処理（prepImage と同じ手順）を通し、向きが保たれるかを見る

   実行: node vqexif.cjs
*/
const { chromium } = require("playwright");

let pass = 0, fail = 0;
const failures = [];
function step(name, ok, detail) {
  if (ok) { pass++; console.log("  ok   " + name + (detail ? " — " + detail : "")); }
  else { fail++; failures.push(name); console.log("  NG   " + name + (detail ? "\n         → " + detail : "")); }
}

/* JPEG の先頭（FFD8）の直後へ APP1（Exif）を差し込む */
function withOrientation(jpegBuf, orientation) {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "ascii"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt32LE(0, 22);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xffe1, 0); head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpegBuf.slice(0, 2), head, payload, jpegBuf.slice(2)]);
}

(async () => {
  console.log("══ EXIF の向き ══");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");

  /* 1) 横長の JPEG を作る（左半分だけ塗って、回転したかを色で見分ける） */
  const baseB64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400; c.height = 200;
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, 400, 200);
    x.fillStyle = "#ff0000"; x.fillRect(0, 0, 40, 200);      /* 左端に赤い帯 */
    return c.toDataURL("image/jpeg", 0.92).split(",")[1];
  });
  const base = Buffer.from(baseB64, "base64");
  const rotated = withOrientation(base, 6);

  const probe = async (b64) => page.evaluate(async (data) => {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = () => rej(new Error("decode"));
      img.src = "data:image/jpeg;base64," + data;
    });
    /* いまの prepImage と同じ手順で縮小＋再エンコードする */
    const scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    const cw = Math.round(img.naturalWidth * scale), ch = Math.round(img.naturalHeight * scale);
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, cw, ch);
    /* 上辺の左端と、上辺の中ほどの色を見る。回っていれば赤帯の位置が変わる */
    const at = (px, py) => {
      const d = x.getImageData(px, py, 1, 1).data;
      return d[0] > 180 && d[1] < 90 && d[2] < 90 ? "赤" : "白";
    };
    return {
      natural: [img.naturalWidth, img.naturalHeight],
      canvas: [cw, ch],
      topLeft: at(2, 2),
      topRight: at(cw - 3, 2),
      bottomLeft: at(2, ch - 3)
    };
  }, b64);

  const a = await probe(baseB64);
  step("元の画像は横長のまま読める", a.natural[0] === 400 && a.natural[1] === 200,
    JSON.stringify(a.natural));
  step("元の画像は左端が赤い", a.topLeft === "赤" && a.topRight === "白",
    "左 " + a.topLeft + " / 右 " + a.topRight);

  const r = await probe(rotated.toString("base64"));
  const swapped = r.natural[0] === 200 && r.natural[1] === 400;
  step("Orientation=6 の写真は縦横が入れ替わって読める（ブラウザが立て直す）",
    swapped, JSON.stringify(r.natural) + "（入れ替わっていなければブラウザは EXIF を見ていない）");
  step("回したあとも赤帯が正しい辺に来る（描き直しで向きが失われない）",
    swapped && r.topLeft === "赤" && r.topRight === "赤" && r.bottomLeft === "白",
    "上左 " + r.topLeft + " / 上右 " + r.topRight + " / 下左 " + r.bottomLeft);

  /* 縮小の上限が実際に効いているか（長辺 2048） */
  const big = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 5000; c.height = 3000;
    const x = c.getContext("2d"); x.fillStyle = "#888"; x.fillRect(0, 0, 5000, 3000);
    const b64 = c.toDataURL("image/jpeg", 0.8).split(",")[1];
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
        res({ from: [img.naturalWidth, img.naturalHeight],
              to: [Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s)] });
      };
      img.src = "data:image/jpeg;base64," + b64;
    });
  });
  step("長辺 2048 の頭打ちが実際に効く",
    Math.max(big.to[0], big.to[1]) === 2048,
    big.from.join("×") + " → " + big.to.join("×"));

  await browser.close();
  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
