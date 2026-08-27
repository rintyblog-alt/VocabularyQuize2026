/* VocabuSheets の数式エンジン（§14.3 / §14.4）
   実行: node client/v2/tests/workplace-formula.test.mjs

   ここで見ているのは「関数一覧に載っているものが本当に計算できるか」。
   一覧にあるのに動かない関数を作らないための歯止め。 */
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const V2 = join(HERE, "..");

const sandbox = { console, Date, Math, JSON, isNaN, isFinite, parseFloat, parseInt, RegExp, Error, String, Number, Array, Object };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
createContext(sandbox);
for (const f of ["workplace/model.js", "workplace/formula.js"]) {
  runInContext(readFileSync(join(V2, f), "utf8"), sandbox, { filename: f });
}
const WP = sandbox.VQ2.workplace;
const F = WP.formula, M = WP.model;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "\n      → " + JSON.stringify(extra) : "")); }
};
const section = (t) => console.log("\n══ " + t + " ══");

/* 値を入れたシートを作る */
function sheet(cells) {
  const s = M.newSheet("t");
  Object.keys(cells).forEach((k) => {
    const v = cells[k];
    s.cells[k] = (typeof v === "string" && v.startsWith("=")) ? { f: v, v: "" } : { v };
  });
  return s;
}
function calc(cells) { return F.recalc(sheet(cells)).values; }
function one(formula, cells) { return calc(Object.assign({ Z99: formula }, cells || {})).Z99; }

section("四則と優先順位");
{
  ok("1+2*3 = 7", one("=1+2*3") === 7, one("=1+2*3"));
  ok("(1+2)*3 = 9", one("=(1+2)*3") === 9);
  ok("2^3^2 = 512（右結合）", one("=2^3^2") === 512, one("=2^3^2"));
  ok("-3+5 = 2", one("=-3+5") === 2);
  ok("10%  = 0.1", one("=10%") === 0.1, one("=10%"));
  ok("文字の連結", one('="あ"&"い"') === "あい");
}

section("セル参照と範囲");
{
  const v = calc({ A1: 1, A2: 2, A3: 3, B1: "=SUM(A1:A3)", B2: "=A1+A3" });
  ok("SUM(A1:A3) = 6", v.B1 === 6, v.B1);
  ok("A1+A3 = 4", v.B2 === 4, v.B2);
  const v2 = calc({ A1: 1, B1: 2, A2: 3, B2: 4, C1: "=SUM(A1:B2)" });
  ok("二次元の範囲 = 10", v2.C1 === 10, v2.C1);
}

section("エラー（§14.4）");
{
  ok("0 除算は #DIV/0!", one("=1/0") === "#DIV/0!", one("=1/0"));
  ok("知らない関数は #NAME?", one("=HOGEHOGE(1)") === "#NAME?", one("=HOGEHOGE(1)"));
  const cyc = calc({ A1: "=B1", B1: "=A1" });
  ok("循環参照は #CYCLE!", cyc.A1 === "#CYCLE!" || cyc.B1 === "#CYCLE!", cyc);
  ok("循環しても止まる（ここまで到達している）", true);
  ok("文字を足すと #VALUE!", one('="あ"+1') === "#VALUE!", one('="あ"+1'));
}

section("登録されている関数が全部動く");
{
  /* 一覧に出す以上、最低限「呼んでエラーにならない」ことを全件で確かめる。 */
  const args = {
    SUM: "A1:A3", AVERAGE: "A1:A3", MIN: "A1:A3", MAX: "A1:A3", COUNT: "A1:A3",
    COUNTA: "A1:A3", COUNTBLANK: "A1:A5", MEDIAN: "A1:A3", STDEV: "A1:A3", PRODUCT: "A1:A3",
    IF: "TRUE,1,2", IFERROR: "1,2", AND: "TRUE,TRUE", OR: "TRUE,FALSE", NOT: "TRUE",
    ROUND: "1.234,1", ROUNDUP: "1.234,1", ROUNDDOWN: "1.234,1", ABS: "-2", INT: "1.9",
    MOD: "7,3", SQRT: "9", POWER: "2,3",
    CONCAT: '"a","b"', CONCATENATE: '"a","b"', LEFT: '"abc",2', RIGHT: '"abc",2',
    MID: '"abcde",2,3', LEN: '"abc"', UPPER: '"ab"', LOWER: '"AB"', TRIM: '"  a  "',
    SUBSTITUTE: '"aaa","a","b"', TEXT: "1234.5,\"#,##0.0\"",
    TODAY: "", NOW: "", DATE: "2026,8,6", YEAR: "45000", MONTH: "45000", DAY: "45000",
    SUMIF: 'A1:A3,">1"', COUNTIF: 'A1:A3,">1"', AVERAGEIF: 'A1:A3,">1"',
    VLOOKUP: '"b",A1:B3,2,FALSE', HLOOKUP: '"x",A1:C2,2,FALSE', INDEX: "A1:B3,2,1",
    MATCH: '"b",A1:A3', UNIQUE: "A1:A3"
  };
  const base = { A1: 1, A2: 2, A3: 3, B1: 10, B2: 20, B3: 30, C1: "x", C2: "y" };
  const all = F.list();
  ok("関数が 40 個以上ある", all.length >= 40, all.length);
  let broken = [];
  all.forEach((d) => {
    if (args[d.type] === undefined) { broken.push(d.type + "(テスト未定義)"); return; }
    const src = "=" + d.type + "(" + args[d.type] + ")";
    let r;
    try { r = one(src, base); } catch (e) { r = "THROW:" + e.message; }
    /* 値が返っていればよい。#NAME? は「登録されているのに実装が無い」印なので不可。 */
    if (r === "#NAME?" || String(r).startsWith("THROW")) broken.push(d.type + "→" + r);
  });
  ok("一覧の関数がすべて計算できる（#NAME? / 例外なし）", broken.length === 0, broken);
}

section("代表的な関数の値");
{
  const base = { A1: 1, A2: 2, A3: 3 };
  ok("AVERAGE = 2", one("=AVERAGE(A1:A3)", base) === 2);
  ok("MAX = 3", one("=MAX(A1:A3)", base) === 3);
  ok("COUNTIF(>1) = 2", one('=COUNTIF(A1:A3,">1")', base) === 2, one('=COUNTIF(A1:A3,">1")', base));
  ok("SUMIF(>1) = 5", one('=SUMIF(A1:A3,">1")', base) === 5);
  ok("IF(A1>0,\"正\",\"負\")", one('=IF(A1>0,"正","負")', base) === "正");
  ok("ROUND(1.25,1) = 1.3", one("=ROUND(1.25,1)") === 1.3, one("=ROUND(1.25,1)"));
  ok("LEN = 3", one('=LEN("abc")') === 3);
  ok("MID = bcd", one('=MID("abcde",2,3)') === "bcd");
  ok("IFERROR は 0 除算を拾う", one('=IFERROR(1/0,"だめ")') === "だめ");
  const lk = { A1: "a", B1: 10, A2: "b", B2: 20, A3: "c", B3: 30 };
  ok("VLOOKUP で 20", one('=VLOOKUP("b",A1:B3,2,FALSE)', lk) === 20, one('=VLOOKUP("b",A1:B3,2,FALSE)', lk));
  ok("VLOOKUP 見つからないと #N/A", one('=VLOOKUP("z",A1:B3,2,FALSE)', lk) === "#N/A");
  ok("INDEX で 20", one("=INDEX(A1:B3,2,2)", lk) === 20, one("=INDEX(A1:B3,2,2)", lk));
  ok("MATCH で 2", one('=MATCH("b",A1:A3)', lk) === 2);
}

section("連鎖と再計算");
{
  const v = calc({ A1: 5, B1: "=A1*2", C1: "=B1+1", D1: "=C1*C1" });
  ok("A1→B1→C1→D1 が伝わる", v.D1 === 121, v);
  const deep = {};
  deep.A1 = 1;
  for (let i = 2; i <= 60; i++) deep["A" + i] = "=A" + (i - 1) + "+1";
  const dv = F.recalc(sheet(deep)).values;
  ok("60 段の連鎖が計算できる", dv.A60 === 60, dv.A60);
}

section("大きな範囲でも止まらない");
{
  const big = {};
  for (let r = 1; r <= 500; r++) big["A" + r] = r;
  big.B1 = "=SUM(A1:A500)";
  const t0 = Date.now();
  const v = F.recalc(sheet(big)).values;
  const ms = Date.now() - t0;
  ok("500 行の合計 = 125250", v.B1 === 125250, v.B1);
  ok("1 秒以内に終わる（" + ms + "ms）", ms < 1000, ms);
}

console.log("\n══ まとめ ══");
console.log("  合格 " + pass + " / 不合格 " + fail);
if (fail) process.exit(1);
