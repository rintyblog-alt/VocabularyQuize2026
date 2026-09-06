/* rpg/ の 全 モジュールを 実際に import して 通るか 見る。
   node --check は CommonJS 扱いなので **class の 中の const を 見逃す**（実測）。*/
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const root = __dirname;
const files = [];
(function walk(d){ for(const f of fs.readdirSync(d)){ const p=path.join(d,f);
  const st=fs.statSync(p); if(st.isDirectory()) walk(p); else if(f.endsWith(".js")) files.push(p); }})(path.join(root,"rpg"));
files.push(path.join(root,"engine","mesh.js"),path.join(root,"engine","renderer.js"),path.join(root,"engine","shaders.js"));
let ng=0;
for(const f of files){
  try{ execFileSync(process.execPath,["--input-type=module","-e",`await import(${JSON.stringify("file://"+f)})`],{stdio:["ignore","ignore","pipe"]}); }
  catch(e){ ng++; console.log("NG", path.relative(root,f), String(e.stderr).split("\n").filter(l=>l.trim()).slice(0,3).join(" / ")); }
}
console.log("ok", files.length-ng, "/ NG", ng);
