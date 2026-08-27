/* client/ を 127.0.0.1:8791 で配るだけの小さなサーバ（テスト用・書き込みなし）。
   本番と同じように gzip と 溜めかたを 真似る。 */
const http=require("http"),fs=require("fs"),path=require("path"),zlib=require("zlib");
const ROOT=path.join(__dirname,"client");
const PORT=Number(process.env.VQ_PORT||8791);
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
 ".json":"application/json",".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",
 ".ico":"image/x-icon",".woff2":"font/woff2",".woff":"font/woff",".ttf":"font/ttf",".otf":"font/otf",
 ".m4a":"audio/mp4",".wav":"audio/wav",".mp3":"audio/mpeg",".jpg":"image/jpeg",".jpeg":"image/jpeg",
 ".webp":"image/webp",".mp4":"video/mp4",".txt":"text/plain; charset=utf-8",".typ":"text/plain"};
const 控=new Map();
http.createServer((req,rq)=>{
  let p=decodeURIComponent(String(req.url).split("?")[0]);
  if(p==="/")p="/index.html";
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){rq.writeHead(404,{"Content-Type":"text/plain"});rq.end("not found");return;}
  const 種=MIME[path.extname(f)]||"application/octet-stream";
  const h={"Content-Type":種};
  if(/^\/(js|css)\/[A-Za-z0-9_-]+\.[0-9a-f]{10}\.(js|css)$/.test(p))h["Cache-Control"]="public, max-age=31536000, immutable";
  else h["Cache-Control"]="no-store";
  const 生=fs.readFileSync(f);
  if(/^(text|application\/(javascript|json))/.test(種)&&String(req.headers["accept-encoding"]||"").includes("gzip")){
    let z=控.get(p); if(!z){z=zlib.gzipSync(生,{level:6});控.set(p,z);}
    h["Content-Encoding"]="gzip";h["Content-Length"]=z.length;rq.writeHead(200,h);rq.end(z);return;
  }
  h["Content-Length"]=生.length;rq.writeHead(200,h);rq.end(生);
}).listen(PORT,"127.0.0.1",()=>console.log("client/ を http://127.0.0.1:"+PORT+" で配っています"));
