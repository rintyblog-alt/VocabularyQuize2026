import React from "react";

/*
  VocabuQuiz Illustration System — フラットSVGイラスト
  ─────────────────────────────────────────────────
  ・外部画像なし。すべてインラインSVG（オフライン・単一HTMLでも動く）
  ・色は --vq-il-* トークンのみ参照 → Light/Darkに自動追従
  ・柔らかい角丸・淡い配色・学習モチーフ。子どもっぽくしない
  ・装飾なのでデフォルト aria-hidden。意味を持たせる場合は label を渡す
*/

const B = "var(--vq-il-blob)";   // 背景ブロブ
const A = "var(--vq-il-a)";      // ラベンダー中間
const P = "var(--vq-il-b)";      // ブランドラベンダー
const C = "var(--vq-il-c)";      // ピーチ
const D = "var(--vq-il-d)";      // ピンク
const E = "var(--vq-il-e)";      // スカイ
const PAPER = "var(--vq-il-paper)";
const INK = "var(--vq-il-ink)";
const LINE = "var(--vq-il-line)";

function Blob({ variant = 0 }: { variant?: 0 | 1 | 2 }) {
  const d = [
    "M100 6c42 0 86 22 86 64s-30 84-86 84S14 116 14 70 58 6 100 6Z",
    "M104 10c40-6 82 26 80 66s-42 78-88 74S12 110 18 66 64 16 104 10Z",
    "M96 8c46-2 92 24 90 66s-38 80-90 78S8 114 10 68 50 10 96 8Z",
  ][variant];
  return <path d={d} fill={B} />;
}

function Spark({ x, y, s = 8, fill = C }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <path
      d={`M${x} ${y - s} Q${x + s * 0.22} ${y - s * 0.22} ${x + s} ${y} Q${x + s * 0.22} ${y + s * 0.22} ${x} ${y + s} Q${x - s * 0.22} ${y + s * 0.22} ${x - s} ${y} Q${x - s * 0.22} ${y - s * 0.22} ${x} ${y - s}Z`}
      fill={fill}
    />
  );
}

const Dot = ({ x, y, r = 3, fill = D }: { x: number; y: number; r?: number; fill?: string }) => (
  <circle cx={x} cy={y} r={r} fill={fill} />
);

/* ══ 各イラスト（viewBox 200×160） ══ */
const ART: Record<string, React.ReactNode> = {
  /* 開いた本 + きらめき — Welcome/学習全般 */
  hello: (
    <>
      <Blob />
      <path d="M100 52c-14-9-34-12-52-8v58c18-4 38-1 52 8 14-9 34-12 52-8V44c-18-4-38-1-52 8Z" fill={PAPER} />
      <path d="M100 52v58" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
      <rect x="58" y="58" width="30" height="4.5" rx="2.25" fill={LINE} />
      <rect x="58" y="69" width="24" height="4.5" rx="2.25" fill={LINE} />
      <rect x="58" y="80" width="28" height="4.5" rx="2.25" fill={A} />
      <rect x="112" y="58" width="30" height="4.5" rx="2.25" fill={LINE} />
      <rect x="112" y="69" width="22" height="4.5" rx="2.25" fill={LINE} />
      <circle cx="123" cy="86" r="8" fill={P} />
      <path d="m119.5 86 2.6 2.6 4.8-5" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Spark x={152} y={40} s={10} fill={C} />
      <Spark x={44} y={34} s={7} fill={D} />
      <Dot x={166} y={72} fill={E} r={4} />
    </>
  ),

  /* プリント → クイズカード化 — 作成機能 */
  create: (
    <>
      <Blob variant={1} />
      <rect x="44" y="30" width="62" height="80" rx="10" fill={PAPER} />
      <rect x="54" y="42" width="42" height="5" rx="2.5" fill={LINE} />
      <rect x="54" y="54" width="34" height="5" rx="2.5" fill={LINE} />
      <rect x="54" y="66" width="40" height="5" rx="2.5" fill={LINE} />
      <rect x="54" y="78" width="26" height="5" rx="2.5" fill={LINE} />
      <rect x="102" y="62" width="58" height="40" rx="10" fill={P} />
      <rect x="110" y="72" width="30" height="5" rx="2.5" fill={PAPER} opacity="0.85" />
      <circle cx="112.5" cy="88" r="4.5" fill={PAPER} opacity="0.9" />
      <circle cx="127" cy="88" r="4.5" fill={PAPER} opacity="0.45" />
      <circle cx="141.5" cy="88" r="4.5" fill={PAPER} opacity="0.45" />
      <rect x="112" y="98" width="58" height="40" rx="10" fill={C} />
      <rect x="120" y="108" width="32" height="5" rx="2.5" fill={PAPER} opacity="0.9" />
      <rect x="120" y="119" width="24" height="5" rx="2.5" fill={PAPER} opacity="0.6" />
      <Spark x={100} y={44} s={9} fill={D} />
      <Spark x={158} y={40} s={7} fill={A} />
    </>
  ),

  /* 棒グラフ + 虫めがね — 苦手分析 */
  analyze: (
    <>
      <Blob variant={2} />
      <rect x="46" y="82" width="18" height="42" rx="7" fill={E} />
      <rect x="72" y="64" width="18" height="60" rx="7" fill={A} />
      <rect x="98" y="46" width="18" height="78" rx="7" fill={P} />
      <circle cx="134" cy="62" r="24" fill={PAPER} opacity="0.92" />
      <circle cx="134" cy="62" r="24" fill="none" stroke={C} strokeWidth="7" />
      <rect x="150" y="80" width="26" height="9" rx="4.5" transform="rotate(45 150 80)" fill={C} />
      <path d="M126 62l5.5 5.5L145 54" stroke={P} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Dot x={42} y={48} fill={D} r={4} />
      <Spark x={168} y={116} s={7} fill={D} />
    </>
  ),

  /* 吹き出し + きらめき — AIサポート */
  coach: (
    <>
      <Blob />
      <path d="M46 46h108a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12H92l-18 18v-18H46a12 12 0 0 1-12-12V58a12 12 0 0 1 12-12Z" fill={PAPER} />
      <path d="M74 82c0-12 10-20 26-20s26 8 26 20-10 20-26 20a32 32 0 0 1-8-1l-10 5 2-9c-6-3-10-8-10-15Z" fill={B} />
      <Spark x={100} y={81} s={9} fill={P} />
      <Spark x={140} y={62} s={6} fill={C} />
      <Dot x={62} y={64} fill={E} r={4} />
      <Dot x={150} y={122} fill={D} r={4} />
    </>
  ),

  /* マグカップ + 本 — おかえりなさい（Login） */
  login: (
    <>
      <Blob variant={1} />
      <rect x="42" y="96" width="116" height="12" rx="6" fill={A} />
      <rect x="52" y="60" width="64" height="38" rx="6" fill={P} />
      <rect x="58" y="54" width="64" height="38" rx="6" fill={E} />
      <rect x="64" y="48" width="64" height="38" rx="6" fill={PAPER} />
      <rect x="72" y="58" width="36" height="5" rx="2.5" fill={LINE} />
      <rect x="72" y="69" width="28" height="5" rx="2.5" fill={LINE} />
      <path d="M138 74h18a8 8 0 0 1 0 16h-2" fill="none" stroke={C} strokeWidth="6" />
      <rect x="128" y="66" width="26" height="32" rx="7" fill={C} />
      <path d="M136 52c0-4 4-4 4-8m8 8c0-4 4-4 4-8" stroke={LINE} strokeWidth="3" strokeLinecap="round" fill="none" />
      <Spark x={50} y={38} s={8} fill={D} />
    </>
  ),

  /* IDカード + ペン — アカウント作成 */
  signup: (
    <>
      <Blob variant={2} />
      <rect x="38" y="48" width="104" height="66" rx="12" fill={PAPER} />
      <circle cx="66" cy="74" r="13" fill={A} />
      <path d="M52 100c2-10 7-15 14-15s12 5 14 15" fill={A} />
      <rect x="90" y="62" width="40" height="5.5" rx="2.75" fill={LINE} />
      <rect x="90" y="74" width="32" height="5.5" rx="2.75" fill={LINE} />
      <rect x="90" y="86" width="36" height="5.5" rx="2.75" fill={P} />
      <rect x="132" y="70" width="14" height="52" rx="7" transform="rotate(38 132 70)" fill={C} />
      <path d="m118 120 12 8-14 3Z" fill={C} />
      <Spark x={156} y={44} s={8} fill={D} />
      <Dot x={40} y={34} fill={E} r={4} />
    </>
  ),

  /* 封筒 + 紙飛行機 — メール送信 */
  mail: (
    <>
      <Blob />
      <rect x="44" y="58" width="92" height="62" rx="10" fill={P} />
      <path d="M44 66a10 10 0 0 1 10-8h72a10 10 0 0 1 10 8L90 96Z" fill={A} />
      <rect x="58" y="40" width="64" height="42" rx="8" fill={PAPER} />
      <rect x="66" y="50" width="40" height="5" rx="2.5" fill={LINE} />
      <rect x="66" y="61" width="30" height="5" rx="2.5" fill={LINE} />
      <path d="m136 46 34-14-10 34-8-12Z" fill={C} />
      <path d="m152 54-14 12 6-14" fill={PAPER} opacity="0.7" />
      <Spark x={40} y={38} s={7} fill={D} />
      <Dot x={162} y={104} fill={E} r={4} />
    </>
  ),

  /* シールド + コード — OTP/2FA */
  otp: (
    <>
      <Blob variant={1} />
      <path d="M100 30c14 10 30 14 44 14v34c0 26-18 44-44 54-26-10-44-28-44-54V44c14 0 30-4 44-14Z" fill={P} />
      <path d="M100 42c10 7 21 10 32 10v26c0 20-13 34-32 42-19-8-32-22-32-42V52c11 0 22-3 32-10Z" fill={PAPER} />
      <circle cx="82" cy="82" r="5.5" fill={INK} />
      <circle cx="100" cy="82" r="5.5" fill={INK} />
      <circle cx="118" cy="82" r="5.5" fill={C} />
      <rect x="76" y="98" width="48" height="6" rx="3" fill={LINE} />
      <Spark x={152} y={44} s={8} fill={C} />
      <Dot x={46} y={116} fill={D} r={4} />
    </>
  ),

  /* 封筒 + チェックバッジ — メール確認完了 */
  verify: (
    <>
      <Blob variant={2} />
      <rect x="42" y="52" width="96" height="64" rx="10" fill={PAPER} />
      <path d="m42 60 48 34 48-34" fill="none" stroke={LINE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="136" cy="108" r="22" fill={P} />
      <path d="m126 108 7 7 13-14" stroke={PAPER} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Spark x={54} y={36} s={8} fill={C} />
      <Dot x={164} y={62} fill={D} r={4} />
    </>
  ),

  /* 南京錠 + 鍵 — パスワード再設定 */
  reset: (
    <>
      <Blob />
      <rect x="56" y="66" width="64" height="54" rx="12" fill={P} />
      <path d="M70 66V54a18 18 0 0 1 36 0v12" fill="none" stroke={A} strokeWidth="9" strokeLinecap="round" />
      <circle cx="88" cy="88" r="7" fill={PAPER} />
      <rect x="85" y="90" width="6" height="14" rx="3" fill={PAPER} />
      <circle cx="140" cy="96" r="13" fill="none" stroke={C} strokeWidth="8" />
      <rect x="148" y="100" width="26" height="8" rx="4" transform="rotate(28 148 100)" fill={C} />
      <rect x="164" y="112" width="9" height="8" rx="3" transform="rotate(28 164 112)" fill={C} />
      <Spark x={52} y={40} s={7} fill={D} />
      <Dot x={158} y={52} fill={E} r={4} />
    </>
  ),

  /* 大きなチェック + 紙吹雪 — 完了/成功 */
  done: (
    <>
      <Blob variant={1} />
      <circle cx="100" cy="80" r="40" fill={P} />
      <path d="m82 80 12 12 24-26" stroke={PAPER} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Dot x={48} y={50} fill={C} r={5} />
      <Dot x={152} y={44} fill={D} r={4} />
      <Dot x={160} y={104} fill={E} r={5} />
      <Dot x={42} y={108} fill={A} r={4} />
      <Spark x={140} y={30} s={8} fill={C} />
      <Spark x={58} y={130} s={7} fill={D} />
    </>
  ),

  /* 南京錠 + 時計 — アカウントロック */
  locked: (
    <>
      <Blob variant={2} />
      <rect x="48" y="70" width="60" height="50" rx="11" fill={P} />
      <path d="M61 70V59a17 17 0 0 1 34 0v11" fill="none" stroke={A} strokeWidth="8.5" strokeLinecap="round" />
      <circle cx="78" cy="91" r="6" fill={PAPER} />
      <rect x="75.2" y="93" width="5.6" height="12" rx="2.8" fill={PAPER} />
      <circle cx="136" cy="94" r="26" fill={PAPER} />
      <circle cx="136" cy="94" r="26" fill="none" stroke={C} strokeWidth="6" />
      <path d="M136 80v14l10 7" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <Dot x={52} y={44} fill={D} r={4} />
    </>
  ),

  /* 砂時計 — セッション切れ */
  expired: (
    <>
      <Blob />
      <rect x="68" y="34" width="64" height="10" rx="5" fill={A} />
      <rect x="68" y="118" width="64" height="10" rx="5" fill={A} />
      <path d="M78 44h44c0 18-10 26-16 32 6 6 16 14 16 32H78c0-18 10-26 16-32-6-6-16-14-16-32Z" fill={PAPER} />
      <path d="M88 52h24c-2 9-8 13-12 17-4-4-10-8-12-17Z" fill={C} />
      <path d="M100 96c4 6 12 9 14 22H86c2-13 10-16 14-22Z" fill={C} />
      <Spark x={148} y={56} s={8} fill={D} />
      <Dot x={52} y={98} fill={E} r={4} />
    </>
  ),

  /* コーン + レンチ — メンテナンス */
  maintenance: (
    <>
      <Blob variant={1} />
      <path d="M88 44c2-6 10-6 12 0l18 62H70Z" fill={C} />
      <path d="M80 78h28l4 14H76Z" fill={PAPER} />
      <rect x="56" y="106" width="76" height="12" rx="6" fill={A} />
      <path d="M138 64a16 16 0 0 1 20-16l-9 9 8 8 9-9a16 16 0 0 1-16 20 16 16 0 0 1-4-1l-14 14a6 6 0 0 1-9-9l14-14a16 16 0 0 1 1-2Z" fill={P} />
      <Dot x={48} y={52} fill={D} r={4} />
      <Spark x={166} y={110} s={7} fill={D} />
    </>
  ),

  /* 雲 + Zzz — オフライン */
  offline: (
    <>
      <Blob variant={2} />
      <path d="M66 100a20 20 0 0 1 3-40 26 26 0 0 1 50-6 22 22 0 0 1 15 40Z" fill={PAPER} />
      <path d="M60 112c10 6 70 6 80 0" stroke={LINE} strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" fill="none" />
      <path d="M138 46h14l-14 14h14" stroke={A} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M158 30h10l-10 10h10" stroke={C} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Dot x={44} y={54} fill={D} r={4} />
    </>
  ),

  /* 望遠鏡 + 星 — 404 */
  notfound: (
    <>
      <Blob />
      <rect x="58" y="52" width="72" height="20" rx="10" transform="rotate(-22 58 52)" fill={P} />
      <rect x="118" y="26" width="18" height="24" rx="9" transform="rotate(-22 118 26)" fill={A} />
      <rect x="86" y="74" width="10" height="46" rx="5" transform="rotate(18 86 74)" fill={C} />
      <rect x="96" y="74" width="10" height="46" rx="5" transform="rotate(-30 96 74)" fill={C} />
      <Spark x={156} y={70} s={9} fill={D} />
      <Spark x={48} y={38} s={7} fill={E} />
      <Dot x={166} y={112} fill={A} r={4} />
      <Dot x={40} y={102} fill={D} r={3.5} />
    </>
  ),

  /* 抜けたプラグ — エラー */
  error: (
    <>
      <Blob variant={1} />
      <path d="M40 76h32" stroke={A} strokeWidth="9" strokeLinecap="round" />
      <rect x="66" y="60" width="28" height="32" rx="9" fill={P} />
      <path d="M94 68h10M94 84h10" stroke={P} strokeWidth="7" strokeLinecap="round" />
      <rect x="118" y="60" width="26" height="32" rx="9" fill={C} />
      <path d="M112 68h8M112 84h8" stroke={C} strokeWidth="7" strokeLinecap="round" />
      <path d="M144 76h24" stroke={A} strokeWidth="9" strokeLinecap="round" />
      <Spark x={108} y={44} s={7} fill={D} />
      <Spark x={104} y={112} s={6} fill={E} />
    </>
  ),

  /* 空の箱 — Empty state */
  empty: (
    <>
      <Blob variant={2} />
      <path d="M56 74h88v40a10 10 0 0 1-10 10H66a10 10 0 0 1-10-10Z" fill={P} />
      <path d="M56 74 44 56h50l10 18Z" fill={A} />
      <path d="M144 74l12-18H106l-10 18Z" fill={A} />
      <path d="M96 56h8v18h-8Z" fill={A} opacity="0.5" />
      <Spark x={100} y={40} s={9} fill={C} />
      <Dot x={148} y={44} fill={D} r={4} />
      <Dot x={54} y={118} fill={E} r={4} />
    </>
  ),

  /* トロフィー — 結果/実績 */
  trophy: (
    <>
      <Blob />
      <path d="M76 42h48v26a24 24 0 0 1-48 0Z" fill={C} />
      <path d="M76 48H58a16 16 0 0 0 18 18M124 48h18a16 16 0 0 1-18 18" fill="none" stroke={C} strokeWidth="6" />
      <rect x="94" y="90" width="12" height="16" rx="4" fill={C} />
      <rect x="80" y="106" width="40" height="12" rx="6" fill={P} />
      <path d="m100 54 3.2 6.6 7.3 1-5.3 5.1 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1Z" fill={PAPER} />
      <Dot x={56} y={44} fill={D} r={4} />
      <Dot x={148} y={106} fill={E} r={4} />
      <Spark x={148} y={38} s={8} fill={D} />
      <Spark x={46} y={102} s={6} fill={A} />
    </>
  ),

  /* カレンダー + 旗 — 試験対策 */
  exam: (
    <>
      <Blob variant={1} />
      <rect x="46" y="46" width="84" height="72" rx="12" fill={PAPER} />
      <rect x="46" y="46" width="84" height="22" rx="12" fill={A} />
      <rect x="46" y="58" width="84" height="10" fill={A} />
      <rect x="62" y="38" width="8" height="16" rx="4" fill={P} />
      <rect x="106" y="38" width="8" height="16" rx="4" fill={P} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`${r}${c}`} x={58 + c * 17} y={76 + r * 13} width="10" height="8" rx="3" fill={r === 1 && c === 2 ? D : LINE} />
        ))
      )}
      <path d="M142 44v70" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M142 44c14 6 22-6 34 2v26c-12-8-20 4-34-2Z" fill={C} />
      <Spark x={166} y={104} s={7} fill={D} />
    </>
  ),
};

export type IllusName = keyof typeof ART & string;
export const ILLUS_NAMES = Object.keys(ART) as IllusName[];

export function Illus({
  name, size = 168, label, className, style,
}: {
  name: IllusName;
  size?: number;
  /** 渡すと意味を持つ画像として読み上げられる。省略時は装飾扱い */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const art = ART[name] ?? ART.empty;
  return (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={(size * 160) / 200}
      className={className}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {art}
    </svg>
  );
}
