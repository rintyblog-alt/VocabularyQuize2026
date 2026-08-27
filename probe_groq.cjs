/* Groq のどのモデルが実際に使えるか、開発版の口から叩いて確かめる */
const BASE="https://vocabuquiz-api-dev.rintyblog.workers.dev";
const PIN="8306", PW="Passw0rd!vq";
async function call(p,o={}){const h={"Content-Type":"application/json"};if(o.token)h.Authorization="Bearer "+o.token;
 const r=await fetch(BASE+p,{method:o.method||"GET",headers:h,body:o.body?JSON.stringify(o.body):undefined});
 let j=null;try{j=await r.json()}catch(e){} return {s:r.status,j:j||{}};}
const uniq=()=>"vqg"+String(Date.now()).slice(-7)+Math.floor(Math.random()*90+10);
const MODELS=["openai/gpt-oss-20b","openai/gpt-oss-120b","qwen/qwen3.6-27b","llama-3.3-70b-versatile","llama-3.1-8b-instant"];
(async()=>{
 const u=uniq();
 const a=await call("/api/auth/register/start",{method:"POST",body:{email:u+"@gmail.com",gradePrefix:"H2",nickname:u,password:PW}});
 const b=await call("/api/auth/register/verify",{method:"POST",body:{challengeId:a.j.challengeId,code:a.j.devCode}});
 const c=await call("/api/auth/register/consent",{method:"POST",body:{registrationSession:b.j.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:PIN}});
 const tk=c.j.token;
 if(!tk){console.error("検証アカウントを作れません");process.exit(1);}
 console.log("モデル [JSONの指定]".padEnd(38)+"結果  時間      JSON  トークン(入/出)");
 for(const m of MODELS){
  for(const mode of ["json_object","なし"]){
   const body={provider:"groq", model:m, max_tokens:1400, temperature:0.2,
    messages:[
     {role:"system",content:"あなたは日本の学習教材の作問者です。出力は JSON だけ。前置きも後書きも書きません。"},
     {role:"user",content:'高校英語の「英文並べ替え」問題を2問作ってください。日本語の解説を付けてください。次の JSON だけを返してください。\n{"questions":[{"question":"","items":["","","",""],"answer":"","explanation":""}]}'}
    ]};
   if(mode==="なし") body.response_format=null;
   const r=await call("/api/ai/probe",{method:"POST",token:tk,body});
   const j=r.j;
   const tag=(m+" ["+mode+"]").padEnd(38);
   if(!j.ok){ console.log(tag+"NG     -       -     "+(j.reason||"")+" "+String(j.error||"").replace(/\s+/g," ").slice(0,70)); continue; }
   const us=j.usage||{};
   console.log(tag+"ok  "+String(j.ms).padStart(6)+"ms   "+(j.isJson?"○":"×")+"    "
    +String(us.prompt_tokens||"?")+"/"+String(us.completion_tokens||"?")
    +(j.isJson?"":"   先頭:"+String(j.text||"").replace(/\s+/g," ").slice(0,50)));
  }
 }
})();
