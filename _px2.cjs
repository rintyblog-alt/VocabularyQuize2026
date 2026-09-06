const { chromium } = require("playwright");
const fs=require("fs");
(async()=>{
  const f=process.argv[2];
  const b64=fs.readFileSync(f).toString("base64");
  const br=await chromium.launch(); const pg=await br.newPage();
  const out=await pg.evaluate(async(b64)=>{
    const img=new Image(); img.src="data:image/png;base64,"+b64; await img.decode();
    const c=document.createElement("canvas"); c.width=img.width; c.height=img.height;
    const x=c.getContext("2d"); x.drawImage(img,0,0);
    const d=x.getImageData(0,0,img.width,img.height).data;
    const at=(px,py)=>{const i=(py*img.width+px)*4;return [d[i],d[i+1],d[i+2]];};
    const L=(p)=>0.2126*p[0]+0.7152*p[1]+0.0722*p[2];
    const S=3; // iPhone 15/16 Pro
    const pt=(v)=>Math.round(v/S*10)/10;
    /* 島: 「ホーム」の 絵の 真下、x=0.13w の 縦で 探す */
    const 島x=Math.round(img.width*0.13);
    let 島下=null, 島上=null;
    for(let y=img.height-1;y>img.height*0.75;y--){ // 下から 上へ
      const v=L(at(島x,y)), u=L(at(島x,y-3));
      if(島下===null && u-v>3.5){ 島下=y; }              // 暗い→ 島の 面(少し 明るい)
    }
    for(let y=Math.round(img.height*0.72);y<img.height-10;y++){
      const v=L(at(島x,y)), u=L(at(島x,y+3));
      if(島上===null && u-v>3.5){ 島上=y; break; }
    }
    /* ピル: x=0.13w（ハンバーガーの 左、ピルの 内側）の 縦 */
    let ピル上=null, ピル下=null;
    for(let y=1;y<img.height*0.2;y++){
      const v=L(at(島x,y)), u=L(at(島x,y+3));
      if(ピル上===null && u-v>3.5 && y>img.height*0.02){ ピル上=y; }
      if(ピル上!==null && ピル下===null && y>ピル上+40 && v-L(at(島x,y+3))>3.5){ ピル下=y; break; }
    }
    /* ホームインジケータ（白い 線） */
    let 白上=null,白下=null;
    for(let y=img.height-1;y>img.height-60;y--){
      const v=L(at(Math.round(img.width/2),y));
      if(v>180){ if(白下===null)白下=y; 白上=y; }
    }
    return {
      画面: img.width+"x"+img.height+" = "+pt(img.width)+"x"+pt(img.height)+"pt",
      ピルの上端: ピル上!==null?pt(ピル上):null, ピルの下端: ピル下!==null?pt(ピル下):null,
      島の上端: 島上!==null?pt(島上):null, 島の下端: 島下!==null?pt(島下):null,
      島の下の空き: 島下!==null?pt(img.height-島下):null,
      ホームインジケータ: 白上!==null?(pt(白上)+"〜"+pt(白下)):null
    };
  }, b64);
  console.log(JSON.stringify(out,null,1));
  await br.close();
})();
