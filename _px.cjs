/* 写真の 縦 1 本を 走って、境目の y を 出す（実機の 実測を 取る ため） */
const { chromium } = require("playwright");
const fs=require("fs");
(async()=>{
  const f=process.argv[2];
  const b64=fs.readFileSync(f).toString("base64");
  const br=await chromium.launch(); const pg=await br.newPage();
  const out=await pg.evaluate(async(b64)=>{
    const img=new Image(); img.src="data:image/png;base64,"+b64;
    await img.decode();
    const c=document.createElement("canvas"); c.width=img.width; c.height=img.height;
    const x=c.getContext("2d"); x.drawImage(img,0,0);
    const d=x.getImageData(0,0,img.width,img.height).data;
    const at=(px,py)=>{const i=(py*img.width+px)*4;return [d[i],d[i+1],d[i+2]];};
    const 明るさ=(p)=>0.2126*p[0]+0.7152*p[1]+0.0722*p[2];
    // 画面 中央の 縦線を 下から 見て、色が 変わる ところを 拾う
    const cx=Math.round(img.width*0.5);
    const 線=[];
    let 前=明るさ(at(cx,img.height-1));
    for(let y=img.height-2;y>img.height*0.7;y--){
      const v=明るさ(at(cx,y));
      if(Math.abs(v-前)>6) 線.push({y, 前:Math.round(前), 後:Math.round(v)});
      前=v;
    }
    // 上端も
    const 上線=[];
    前=明るさ(at(cx,0));
    for(let y=1;y<img.height*0.2;y++){
      const v=明るさ(at(cx,y));
      if(Math.abs(v-前)>6) 上線.push({y, 前:Math.round(前), 後:Math.round(v)});
      前=v;
    }
    return {w:img.width,h:img.height,下の境目:線.slice(0,10),上の境目:上線.slice(0,10)};
  }, b64);
  console.log(JSON.stringify(out,null,1));
  await br.close();
})();
