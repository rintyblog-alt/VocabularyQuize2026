import React from "react";
import { Check, X } from "lucide-react";

/* カタログページの共通ドキュメント部品 */

export function DocPage({
  kicker, title, lede, children, wide,
}: { kicker: string; title: string; lede?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`studio-page ${wide ? "studio-page--wide" : ""}`}>
      <header className="doc-header">
        <div className="doc-kicker">{kicker}</div>
        <h1 className="doc-title">{title}</h1>
        {lede && <p className="doc-lede">{lede}</p>}
      </header>
      {children}
    </div>
  );
}

export function Section({
  id, title, desc, children,
}: { id?: string; title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="doc-section" id={id}>
      <h2 className="doc-section__title">{title}</h2>
      {desc && <p className="doc-section__desc">{desc}</p>}
      {children}
    </section>
  );
}

export function Demo({
  children, note, col, center, style,
}: { children: React.ReactNode; note?: React.ReactNode; col?: boolean; center?: boolean; style?: React.CSSProperties }) {
  return (
    <div className="doc-demo">
      <div
        className={["doc-demo__canvas", col && "doc-demo__canvas--col", center && "doc-demo__canvas--center"].filter(Boolean).join(" ")}
        style={style}
      >
        {children}
      </div>
      {note && <div className="doc-demo__note">{note}</div>}
    </div>
  );
}

export function DoDont({
  doTitle, doBody, dontTitle, dontBody,
}: { doTitle: string; doBody: React.ReactNode; dontTitle: string; dontBody: React.ReactNode }) {
  return (
    <div className="doc-dodont">
      <div className="doc-dodont__card">
        <div className="doc-dodont__label is-do"><Check size={15} /> {doTitle}</div>
        <div className="doc-dodont__body">{doBody}</div>
      </div>
      <div className="doc-dodont__card">
        <div className="doc-dodont__label is-dont"><X size={15} /> {dontTitle}</div>
        <div className="doc-dodont__body">{dontBody}</div>
      </div>
    </div>
  );
}

export function SpecTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="vq-table-wrap" style={{ background: "var(--vq-surface)" }}>
      <div className="vq-table-scroll">
        <table className="doc-spec">
          <thead>
            <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 使いどころ／避けどころ の定型セクション */
export function UsageNotes({ use, avoid }: { use: string[]; avoid: string[] }) {
  return (
    <div className="doc-dodont">
      <div className="doc-dodont__card">
        <div className="doc-dodont__label is-do"><Check size={15} /> 使うべき場面</div>
        <div className="doc-dodont__body">
          <ul style={{ margin: 0, paddingLeft: "1.2em", display: "grid", gap: 6 }}>
            {use.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </div>
      </div>
      <div className="doc-dodont__card">
        <div className="doc-dodont__label is-dont"><X size={15} /> 避けるべき場面</div>
        <div className="doc-dodont__body">
          <ul style={{ margin: 0, paddingLeft: "1.2em", display: "grid", gap: 6 }}>
            {avoid.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

export const LONG_JA = "非常に長いクイズ名がここに入ります。英語コミュニケーションIII 定期考査対策 第7課 重要語句・熟語・構文まとめ 完全網羅版（改訂第3版・解説つき）";
export const LONG_NAME = "とてもとても長い表示名のユーザーさん_2026年度版アカウント";
