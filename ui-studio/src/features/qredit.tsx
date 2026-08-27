import React, { useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, Ban, Coins, Copy, CreditCard, Eye,
  EyeOff, Gift, RefreshCw, RotateCw, Send, Snowflake, TrendingUp, Trophy, Wallet,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, DataTable, Divider, IconButton, LineChart, Modal,
  Progress, Segmented, StatCard, Tooltip, useToast,
} from "../ui/components";
import { AppFrame } from "./shell";
import { QDP_STATS, QREDIT_HISTORY } from "../mocks/data";

/* ═══ Qredit Wallet ════════════════════════════════════════ */
export function QreditScreen() {
  const [detail, setDetail] = useState<(typeof QREDIT_HISTORY)[number] | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const toast = useToast();
  return (
    <AppFrame active="qredit" title="Qredit">
      <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
        <Card style={{ background: "linear-gradient(130deg, var(--vq-qredit-bg), transparent 70%)", borderColor: "color-mix(in srgb, var(--vq-qredit) 25%, transparent)" }}>
          <div className="vq-row" style={{ gap: "var(--vq-sp-6)", flexWrap: "wrap" }}>
            <div className="vq-grow">
              <div style={{ font: "var(--vq-type-caption)", fontWeight: 650, color: "var(--vq-qredit)", letterSpacing: "0.06em", marginBottom: 4 }}>残高</div>
              <div className="vq-num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}>
                1,250 <span style={{ fontSize: 16, fontWeight: 650, color: "var(--vq-text-tertiary)" }}>Qredit</span>
              </div>
              <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginTop: 4 }}>
                Qreditはアプリ内ポイントです。現実の通貨ではなく、換金はできません。
              </div>
            </div>
            <div className="vq-row" style={{ gap: "var(--vq-sp-3)", flexWrap: "wrap" }}>
              <Button variant="secondary" icon={<Gift size={15} />}>受け取る</Button>
              <Button variant="outline" icon={<Send size={15} />} onClick={() => setSendOpen(true)}>送る</Button>
            </div>
          </div>
        </Card>

        <div className="qz-stat-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <StatCard label="今週の獲得" value="+280" unit="Q" delta={22} deltaLabel="先週比" tone="qredit" icon={<TrendingUp size={15} />} />
          <StatCard label="今週の利用" value="200" unit="Q" icon={<Wallet size={15} />} />
          <StatCard label="保留中" value="200" unit="Q" icon={<RefreshCw size={15} />} />
        </div>

        <Card pad={false}>
          <div className="vq-row" style={{ padding: "var(--vq-sp-6) var(--vq-sp-6) var(--vq-sp-4)", justifyContent: "space-between" }}>
            <h2 style={{ font: "var(--vq-type-heading-sm)" }}>利用明細</h2>
            <Button variant="link" size="sm">CSVエクスポート</Button>
          </div>
          <DataTable
            caption="Qredit利用明細"
            columns={[
              {
                key: "label", header: "内容",
                render: (r) => (
                  <span className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
                    <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, flex: "0 0 auto", background: r.type === "earn" ? "var(--vq-qredit-bg)" : "var(--vq-surface-active)", color: r.type === "earn" ? "var(--vq-qredit)" : "var(--vq-text-secondary)" }}>
                      {r.type === "earn" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </span>
                    <span style={{ fontWeight: 550 }}>{r.label}</span>
                  </span>
                ),
              },
              { key: "time", header: "日時", render: (r) => <span style={{ color: "var(--vq-text-tertiary)" }}>{r.time}</span> },
              {
                key: "status", header: "状態",
                render: (r) => (
                  <Badge tone={r.status === "完了" ? "success" : r.status === "保留中" ? "warning" : "neutral"} dot>{r.status}</Badge>
                ),
              },
              {
                key: "amount", header: "増減", numeric: true, sortable: true, sortValue: (r) => r.amount,
                render: (r) => (
                  <b style={{ color: r.amount > 0 ? "var(--vq-qredit)" : "var(--vq-text)" }}>
                    {r.amount > 0 ? "+" : ""}{r.amount.toLocaleString()}
                  </b>
                ),
              },
            ]}
            rows={QREDIT_HISTORY}
            onRowClick={(r) => setDetail(r)}
          />
        </Card>
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.label}
        description={detail?.time}
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>閉じる</Button>}
      >
        {detail && (
          <div className="vq-stack" style={{ gap: "var(--vq-sp-4)", font: "var(--vq-type-body-sm)" }}>
            <div className="vq-row" style={{ justifyContent: "space-between" }}>
              <span style={{ color: "var(--vq-text-tertiary)" }}>増減</span>
              <b className="vq-num" style={{ fontSize: 20, color: detail.amount > 0 ? "var(--vq-qredit)" : "var(--vq-text)" }}>{detail.amount > 0 ? "+" : ""}{detail.amount} Q</b>
            </div>
            <Divider />
            <div className="vq-row" style={{ justifyContent: "space-between" }}>
              <span style={{ color: "var(--vq-text-tertiary)" }}>状態</span>
              <Badge tone={detail.status === "完了" ? "success" : detail.status === "保留中" ? "warning" : "neutral"} dot>{detail.status}</Badge>
            </div>
            <div className="vq-row" style={{ justifyContent: "space-between" }}>
              <span style={{ color: "var(--vq-text-tertiary)" }}>取引ID</span>
              <code style={{ font: "var(--vq-type-code)", fontSize: 12 }}>qr_{detail.id}_8f2c41</code>
            </div>
            {detail.status === "保留中" && (
              <Alert tone="warning" title="保留中の理由">紹介されたユーザーの初回学習が完了すると確定します（最大7日）。</Alert>
            )}
            {detail.status === "返金済み" && (
              <Alert tone="info" title="返金について">AI生成が失敗したため自動返金されました。</Alert>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title="Qreditを送る"
        description="友達に学習の応援としてQreditを送れます（1日500Qまで）。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSendOpen(false)}>キャンセル</Button>
            <Button onClick={() => { setSendOpen(false); toast({ title: "ゆず さんに 100 Qredit を送りました", tone: "success" }); }}>送る</Button>
          </>
        }
      >
        <div className="vq-stack" style={{ gap: "var(--vq-sp-5)" }}>
          <Alert tone="info" title="送り先: ゆず（@yuzu_bio）">友達のみに送れます。</Alert>
          <Segmented ariaLabel="金額" value="100" onChange={() => {}} items={[{ id: "50", label: "50" }, { id: "100", label: "100" }, { id: "300", label: "300" }]} />
        </div>
      </Modal>
    </AppFrame>
  );
}

/* ═══ Qredit Card（3D） ════════════════════════════════════ */
export function QreditCardScreen() {
  const [flipped, setFlipped] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const onMove = (e: React.PointerEvent) => {
    const el = cardRef.current;
    if (!el || flipped) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${px * 16}deg) rotateX(${-py * 12}deg)`;
    el.style.setProperty("--gx", `${(px + 0.5) * 100}%`);
    el.style.setProperty("--gy", `${(py + 0.5) * 100}%`);
  };
  const onLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = flipped ? "rotateY(180deg)" : "";
  };

  return (
    <AppFrame active="qredit" title="Qredit Card">
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {frozen && (
          <div style={{ marginBottom: "var(--vq-sp-5)" }}>
            <Alert tone="warning" title="カードは一時停止中です" actions={<Button size="sm" variant="outline" onClick={() => setFrozen(false)}>再開する</Button>}>
              停止中はアプリ内ストアでの支払いに使えません。
            </Alert>
          </div>
        )}

        <div className="qz-card3d-stage">
          <div
            ref={cardRef}
            className={`qz-card3d ${flipped ? "is-flipped" : ""}`}
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            onClick={() => { setFlipped(!flipped); onLeave(); }}
            role="button"
            aria-label={flipped ? "カード裏面（クリックで表面へ）" : "カード表面（クリックで裏面へ）"}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped(!flipped); } }}
            style={frozen ? { filter: "grayscale(0.8) opacity(0.8)" } : undefined}
          >
            <div className="qz-card3d__face">
              <div className="qz-card3d__gloss" aria-hidden />
              <div className="vq-row" style={{ justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800, letterSpacing: "0.04em" }}>VocabuQuiz</span>
                <Coins size={20} style={{ opacity: 0.85 }} />
              </div>
              <div style={{ marginTop: "auto" }}>
                <div className="qz-card3d__num">5024 1900 2026 0722</div>
                <div className="vq-row" style={{ justifyContent: "space-between", marginTop: "var(--vq-sp-5)" }}>
                  <div>
                    <div className="qz-card3d__label">Card Holder</div>
                    <div style={{ fontWeight: 650, letterSpacing: "0.06em" }}>AOI</div>
                  </div>
                  <div>
                    <div className="qz-card3d__label">残高</div>
                    <div className="vq-num" style={{ fontWeight: 700 }}>1,250 Q</div>
                  </div>
                  <BadgeCheck size={22} style={{ opacity: 0.8, alignSelf: "flex-end" }} />
                </div>
              </div>
            </div>
            <div className="qz-card3d__face qz-card3d__face--back">
              <div className="qz-card3d__mag" />
              <div style={{ marginTop: "var(--vq-sp-6)" }}>
                <div className="qz-card3d__label">セキュアコード</div>
                <div className="vq-row" style={{ gap: "var(--vq-sp-4)", marginTop: 6 }}>
                  <code className="vq-num" style={{ font: "var(--vq-type-heading-lg)", fontFamily: "var(--vq-font-mono)", letterSpacing: "0.2em", background: "rgba(255,255,255,0.12)", padding: "4px 12px", borderRadius: 8 }}>
                    {showCode ? "482" : "•••"}
                  </code>
                </div>
              </div>
              <p style={{ marginTop: "auto", font: "var(--vq-type-caption)", opacity: 0.6 }}>
                このカードはVocabuQuiz内でのみ有効なバーチャルカードです。実際の決済には使用できません。
              </p>
            </div>
          </div>
        </div>

        <div className="vq-row" style={{ justifyContent: "center", gap: "var(--vq-sp-3)", flexWrap: "wrap", marginBottom: "var(--vq-sp-8)" }}>
          <Button variant="outline" icon={<RotateCw size={14} />} onClick={() => setFlipped(!flipped)}>{flipped ? "表面を見る" : "裏面を見る"}</Button>
          <Button
            variant="outline"
            icon={showCode ? <EyeOff size={14} /> : <Eye size={14} />}
            onClick={() => { setShowCode(!showCode); if (!flipped) setFlipped(true); }}
          >
            {showCode ? "コードを隠す" : "コードを表示"}
          </Button>
          <Button variant="outline" icon={<Copy size={14} />} onClick={() => toast({ title: "カード番号をコピーしました", tone: "success" })}>番号をコピー</Button>
          <Button variant={frozen ? "secondary" : "danger-soft"} icon={frozen ? <RefreshCw size={14} /> : <Snowflake size={14} />} onClick={() => setFrozen(!frozen)}>
            {frozen ? "利用を再開" : "一時停止"}
          </Button>
        </div>

        <Card sunken>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)", alignItems: "flex-start" }}>
            <CreditCard size={16} style={{ color: "var(--vq-text-tertiary)", marginTop: 2 }} />
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-secondary)", lineHeight: 1.8 }}>
              カードをドラッグ（ポインター移動）すると傾き、クリックで裏返ります。番号は学習実績から生成されたダミーで、
              プロフィールのフレームやアプリ内ストアの支払いに使えます。紛失の概念はありませんが、共有端末では「一時停止」を推奨します。
            </p>
          </div>
        </Card>
      </div>
    </AppFrame>
  );
}

/* ═══ QDP Dashboard ════════════════════════════════════════ */
export function QdpScreen() {
  return (
    <AppFrame active="qredit" title="QDP — Quiz Developers Program">
      <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
        <div className="vq-row" style={{ gap: "var(--vq-sp-4)", flexWrap: "wrap" }}>
          <Badge tone="success" dot>参加中 · クリエイターランク B</Badge>
          <Badge tone="outline">審査通過 2026-03-14</Badge>
          <span className="vq-grow" />
          <Button size="sm" variant="outline">新しいクイズを申請</Button>
        </div>

        <div className="qz-stat-row">
          <StatCard label="今月の表示数" value="11,202" delta={25} deltaLabel="先月比" tone="accent" icon={<TrendingUp size={15} />} />
          <StatCard label="完走数" value="4,890" delta={31} deltaLabel="先月比" icon={<Trophy size={15} />} />
          <StatCard label="推定報酬" value="1,840" unit="Q" tone="qredit" icon={<Coins size={15} />} />
          <StatCard label="確定報酬（今月）" value="840" unit="Q" tone="qredit" icon={<BadgeCheck size={15} />} />
        </div>

        <Card>
          <div className="vq-row" style={{ justifyContent: "space-between", marginBottom: "var(--vq-sp-5)", flexWrap: "wrap", gap: "var(--vq-sp-4)" }}>
            <h2 style={{ font: "var(--vq-type-heading-sm)" }}>表示数と完走数の推移（6ヶ月）</h2>
            <Segmented ariaLabel="期間" value="6m" onChange={() => {}} items={[{ id: "6m", label: "6ヶ月" }, { id: "1y", label: "1年" }]} />
          </div>
          <LineChart
            labels={QDP_STATS.months}
            series={[
              { name: "表示数", values: QDP_STATS.views },
              { name: "完走数", values: QDP_STATS.completions },
            ]}
            area
            height={220}
          />
        </Card>

        <Card pad={false}>
          <div style={{ padding: "var(--vq-sp-6) var(--vq-sp-6) var(--vq-sp-4)", font: "var(--vq-type-heading-sm)" }}>クイズ別の成績</div>
          <DataTable
            caption="クイズ別成績"
            columns={[
              { key: "name", header: "クイズ", render: (r) => <span style={{ fontWeight: 550 }} className="vq-truncate">{r.name}</span> },
              { key: "views", header: "表示", numeric: true, sortable: true, sortValue: (r) => r.views, render: (r) => r.views.toLocaleString() },
              { key: "done", header: "完走", numeric: true, sortable: true, sortValue: (r) => r.done, render: (r) => r.done.toLocaleString() },
              { key: "save", header: "保存", numeric: true, render: (r) => r.save },
              { key: "q", header: "推定報酬", numeric: true, render: (r) => <b style={{ color: "var(--vq-qredit)" }}>{r.q} Q</b> },
              {
                key: "status", header: "状態",
                render: (r) => <Badge tone={r.status === "承認" ? "success" : r.status === "審査中" ? "warning" : "danger"} dot>{r.status}</Badge>,
              },
            ]}
            rows={[
              { id: 1, name: "江戸幕府の成立と幕藩体制", views: 6210, done: 2840, save: 412, q: 980, status: "承認" },
              { id: 2, name: "鎌倉幕府と執権政治", views: 3110, done: 1204, save: 188, q: 460, status: "承認" },
              { id: 3, name: "室町文化 総まとめ", views: 1420, done: 512, save: 64, q: 220, status: "審査中" },
              { id: 4, name: "戦国大名の分国法", views: 462, done: 334, save: 41, q: 180, status: "却下" },
            ]}
          />
        </Card>

        <Alert tone="warning" title="不正検知: 軽微な注意 1件">
          「戦国大名の分国法」で同一端末からの連続完走を検出したため、7/18の集計から除外しました。心当たりがない場合は異議申し立てができます。
        </Alert>
      </div>
    </AppFrame>
  );
}
