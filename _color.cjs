const { chromium } = require("playwright");
const fs=require("fs");
(async()=>{
  const b64=fs.readFileSync(process.argv[2]).toString("base64");
  const br=await chromium.launch(); const pg=await br.newPage();
  const o=await pg.evaluate(async(b64)=>{
    const img=new Image(); img.src="data:image/png;base64,"+b64; await img.decode();
    const c=document.createElement("canvas"); c.width=img.width; c.height=img.height;
    const x=c.getContext("2d"); x.drawImage(img,0,0);
    const d=x.getImageData(0,0,img.width,img.height).data;
    const at=(px,py)=>{const i=(py*img.width+px)*4;return "rgb("+d[i]+", "+d[i+1]+", "+d[i+2]+")";};
    const H=img.height, W=img.width;
    return {
      画像: W+"x"+H,
      "時計の帯（左上 x=30 y=20）": at(30, 20),
      "時計の帯（x=30 y=100）": at(30, 100),
      "帯の すぐ下（y=145）": at(30, 145),
      "アプリの 地色（左 x=15 y=800）": at(15, 800),
      "アプリの 地色（x=15 y=1200）": at(15, 1200)
    };
  }, b64);
  console.log(JSON.stringify(o,null,1));
  await br.close();
})();
