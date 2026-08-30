const fs=require("fs");
function 器(){
  const root={
    document:{readyState:"complete",createElement:()=>({style:{},appendChild(){},setAttribute(){},addEventListener(){}}),
      addEventListener(){},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
      head:{appendChild(){}},body:{appendChild(){},classList:{contains:()=>false}}},
    addEventListener(){},removeEventListener(){},
    setTimeout:(f,m)=>setTimeout(f,m),clearTimeout:(t)=>clearTimeout(t),
    setInterval:(f,m)=>0,clearInterval:()=>{},requestAnimationFrame:(f)=>0,
    location:{href:"http://x/",origin:"http://x",search:""},navigator:{userAgent:"node",onLine:true},
    matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
    fetch:()=>Promise.reject(new Error("no net"))
  };
  const mem={};
  root.localStorage={getItem:k=>(k in mem?mem[k]:null),setItem:(k,v)=>{mem[k]=String(v)},
    removeItem:k=>{delete mem[k]},clear:()=>{for(const k in mem)delete mem[k]},
    key:i=>Object.keys(mem)[i],get length(){return Object.keys(mem).length}};
  root.sessionStorage=root.localStorage;
  global.window=root;
  try{new Function("globalThis",fs.readFileSync("js-src/vq2-app.b85018b5b8.js","utf8"))(root);}catch(e){root.__loadErr=String(e&&e.message);}
  return root;
}
module.exports={器};
