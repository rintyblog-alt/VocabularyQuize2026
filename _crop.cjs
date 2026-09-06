const { chromium } = require("playwright");
const fs=require("fs");
(async()=>{
  const b64=fs.readFileSync(process.argv[2]).toString("base64");
  const y0=parseInt(process.argv[3],10), h=parseInt(process.argv[4],10);
  const br=await chromium.launch(); const pg=await br.newPage();
  const png=await pg.evaluate(async([b64,y0,h])=>{
    const img=new Image(); img.src="data:image/png;base64,"+b64; await img.decode();
    const c=document.createElement("canvas"); c.width=img.width; c.height=h;
    c.getContext("2d").drawImage(img,0,y0,img.width,h,0,0,img.width,h);
    return c.toDataURL("image/png").split(",")[1];
  },[b64,y0,h]);
  fs.writeFileSync(process.argv[5], Buffer.from(png,"base64"));
  await br.close(); console.log("ok");
})();
