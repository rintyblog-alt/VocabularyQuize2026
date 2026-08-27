import React, { useState } from "react";
import {
  BookOpen, Check, Coins, Copy, Flag, MoreHorizontal, Pencil, Play,
  Plus, Search as SearchIcon, Share2, Sparkles, Star, Trash2, WifiOff,
} from "lucide-react";
import { Demo, DocPage, LONG_JA, LONG_NAME, Section, SpecTable, UsageNotes } from "./lib/Doc";
import {
  Alert, Avatar, AvatarGroup, Badge, Banner, Button, Card, Checkbox, Chip,
  Divider, Drawer, Dropdown, EmptyState, IconButton, Kbd, ListItem, Modal,
  OfflineState, Progress, Ring, Skeleton, Spinner, StatCard, Stepper, Tag,
  TextInput, Tooltip, useToast,
} from "../ui/components";

/* ═══ Badges & Display ═════════════════════════════════════ */
export function CDisplay() {
  const [tags, setTags] = useState(["英単語", "定期考査", "高2"]);
  const [chips, setChips] = useState<string[]>(["英語"]);
  return (
    <DocPage
      kicker="Components"
      title="Badges & Display"
      lede="Badge は状態表示（読み取り専用）、Tag はメタ情報（削除可能）、Chip は選択操作。役割を混ぜない。"
    >
      <Section title="Badge">
        <Demo>
          <Badge>下書き</Badge>
          <Badge tone="accent">公式</Badge>
          <Badge tone="success" dot>公開中</Badge>
          <Badge tone="warning" dot>審査中</Badge>
          <Badge tone="danger">要修正</Badge>
          <Badge tone="info">ベータ</Badge>
          <Badge tone="ai"><Sparkles size={11} /> AI生成</Badge>
          <Badge tone="qredit"><Coins size={11} /> 1,250</Badge>
          <Badge tone="outline">高2</Badge>
        </Demo>
      </Section>

      <Section title="Tag（削除可能）">
        <Demo>
          {tags.map((t) => (
            <Tag key={t} onRemove={() => setTags((ts) => ts.filter((x) => x !== t))}>{t}</Tag>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setTags((ts) => [...ts, `タグ${ts.length + 1}`])}>追加</Button>
        </Demo>
      </Section>

      <Section title="Chip（フィルター選択）">
        <Demo>
          {["英語", "数学", "日本史", "情報", "化学"].map((s) => (
            <Chip
              key={s}
              selected={chips.includes(s)}
              onClick={() => setChips((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]))}
            >
              {s}
            </Chip>
          ))}
        </Demo>
      </Section>

      <Section title="Avatar">
        <Demo>
          <Avatar name="あおい" size="xs" />
          <Avatar name="はるか" size="sm" />
          <Avatar name="けんた" online />
          <Avatar name="みなと" size="lg" />
          <Avatar name="ゆず" size="xl" />
          <Avatar name="VocabuQuiz公式" square />
          <AvatarGroup names={["あおい", "はるか", "けんた", "みなと", "ゆず", "りく"]} />
        </Demo>
      </Section>

      <Section title="Divider / Kbd">
        <Demo col>
          <Divider />
          <Divider label="または" />
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
            <span style={{ font: "var(--vq-type-body-sm)" }}>次の問題へ</span>
            <Kbd>Enter</Kbd>
            <span style={{ font: "var(--vq-type-body-sm)", marginLeft: "var(--vq-sp-6)" }}>選択肢</span>
            <Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd><Kbd>4</Kbd>
          </div>
        </Demo>
      </Section>

      <Section title="日本語長文">
        <Demo col style={{ maxWidth: 420 }}>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)", minWidth: 0 }}>
            <Avatar name={LONG_NAME} size="sm" />
            <span className="vq-truncate" style={{ font: "var(--vq-type-label)" }}>{LONG_NAME}</span>
            <Badge tone="accent" className="vq-truncate" style={{ maxWidth: 120 } as React.CSSProperties}>{LONG_JA}</Badge>
          </div>
        </Demo>
      </Section>
    </DocPage>
  );
}

/* ═══ Cards & Lists ════════════════════════════════════════ */
export function CCards() {
  return (
    <DocPage
      kicker="Components"
      title="Cards & Lists"
      lede="カードは「独立して意味を持つまとまり」にだけ使う。リストで済む情報をカードで包まない。"
    >
      <UsageNotes
        use={["クイズ・投稿など独立したエンティティ", "ダッシュボードのKPI（StatCard）", "選択可能なオプション"]}
        avoid={["ただの文章のまとまり（→ 見出し＋余白）", "1画面に30枚以上並ぶ細かい情報（→ List / Table）"]}
      />

      <Section title="Card variants">
        <Demo>
          <Card style={{ width: 220 }}>
            <div style={{ font: "var(--vq-type-heading-sm)", marginBottom: 6 }}>標準</div>
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>border + subtle shadow</p>
          </Card>
          <Card hover style={{ width: 220, cursor: "pointer" }}>
            <div style={{ font: "var(--vq-type-heading-sm)", marginBottom: 6 }}>Hover</div>
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>浮き上がる（クリック可能な合図）</p>
          </Card>
          <Card sunken style={{ width: 220 }}>
            <div style={{ font: "var(--vq-type-heading-sm)", marginBottom: 6 }}>Sunken</div>
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>コード例・引用・注記</p>
          </Card>
          <Card selected style={{ width: 220 }}>
            <div style={{ font: "var(--vq-type-heading-sm)", marginBottom: 6 }}>Selected</div>
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>選択中のオプション</p>
          </Card>
        </Demo>
      </Section>

      <Section title="StatCard（KPI）">
        <Demo>
          <div style={{ width: 210 }}><StatCard label="今日の学習" value="42" unit="分" delta={12} deltaLabel="昨日比" tone="accent" icon={<BookOpen size={16} />} /></div>
          <div style={{ width: 210 }}><StatCard label="連続学習" value="18" unit="日" tone="success" icon={<Star size={16} />} /></div>
          <div style={{ width: 210 }}><StatCard label="Qredit残高" value="1,250" unit="Q" delta={-4} deltaLabel="今週" tone="qredit" icon={<Coins size={16} />} /></div>
        </Demo>
      </Section>

      <Section title="ListItem" desc="行の集合はカードで1枚に包み、行自体は淡いホバーのみ。">
        <Demo col>
          <Card pad={false} style={{ maxWidth: 480 }}>
            <ListItem
              leading={<Avatar name="はるか" size="sm" />}
              title="日本史探究 江戸幕府の成立と幕藩体制"
              description="42問 · 正答率64% · 5時間前に更新"
              trailing={<Badge tone="success" dot>公開中</Badge>}
              onClick={() => {}}
            />
            <Divider />
            <ListItem
              leading={<Avatar name="VocabuQuiz公式" size="sm" square />}
              title={LONG_JA}
              description="100問 · 12,840回プレイ（trailingが操作を持つ行は行自体をボタンにしない）"
              trailing={<IconButton label="その他" size="sm"><MoreHorizontal size={16} /></IconButton>}
            />
            <Divider />
            <ListItem
              leading={<Avatar name="けんた" size="sm" />}
              title="化学基礎 mol計算 頻出パターン30"
              description="30問 · 昨日"
              selected
              trailing={<Badge tone="accent">選択中</Badge>}
              onClick={() => {}}
            />
          </Card>
        </Demo>
      </Section>
    </DocPage>
  );
}

/* ═══ Overlays ═════════════════════════════════════════════ */
export function COverlays() {
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  return (
    <DocPage
      kicker="Components"
      title="Overlays"
      lede="モーダルは「今すぐ決めてほしいこと」だけ。情報の閲覧はドロワー、軽い操作はドロップダウン。モバイルではモーダルが自動的にBottom Sheetになる。"
    >
      <Section title="Modal / Dialog">
        <Demo>
          <Button onClick={() => setModal(true)}>クイズを公開</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>削除の確認</Button>
        </Demo>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="クイズを公開しますか？"
          description="公開すると、すべてのユーザーが検索・プレイできるようになります。"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>キャンセル</Button>
              <Button onClick={() => setModal(false)}>公開する</Button>
            </>
          }
        >
          <div className="vq-stack" style={{ gap: "var(--vq-sp-5)" }}>
            <TextInput defaultValue="英単語ターゲット1900 §1" aria-label="クイズ名" />
            <Checkbox label="Feedにも投稿する" defaultChecked />
            <Checkbox label="QDP（収益化プログラム）の対象にする" />
          </div>
        </Modal>
        <Modal
          open={confirm}
          onClose={() => setConfirm(false)}
          title="このクイズを削除しますか？"
          description="「化学基礎 mol計算」を削除します。この操作は取り消せません。学習履歴は保持されます。"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>キャンセル</Button>
              <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirm(false)}>削除する</Button>
            </>
          }
        />
      </Section>

      <Section title="Drawer">
        <Demo>
          <Button variant="outline" onClick={() => setDrawer(true)}>フィルターを開く</Button>
        </Demo>
        <Drawer open={drawer} onClose={() => setDrawer(false)} title="絞り込み">
          <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
            <div>
              <div style={{ font: "var(--vq-type-label)", marginBottom: "var(--vq-sp-4)" }}>科目</div>
              <div className="vq-wrap" style={{ gap: "var(--vq-sp-3)" }}>
                {["英語", "数学", "国語", "日本史", "情報"].map((s) => <Chip key={s}>{s}</Chip>)}
              </div>
            </div>
            <div>
              <div style={{ font: "var(--vq-type-label)", marginBottom: "var(--vq-sp-4)" }}>難易度</div>
              <div className="vq-stack" style={{ gap: "var(--vq-sp-3)" }}>
                <Checkbox label="基礎" defaultChecked />
                <Checkbox label="標準" defaultChecked />
                <Checkbox label="発展" />
              </div>
            </div>
            <Button full onClick={() => setDrawer(false)}>適用する</Button>
          </div>
        </Drawer>
      </Section>

      <Section title="Dropdown / Tooltip">
        <Demo>
          <Dropdown
            label="クイズ操作"
            trigger={<Button variant="outline" trailingIcon={<MoreHorizontal size={15} />}>操作</Button>}
            items={[
              { id: "edit", icon: <Pencil size={14} />, label: "編集", hint: "E" },
              { id: "copy", icon: <Copy size={14} />, label: "複製する" },
              { id: "share", icon: <Share2 size={14} />, label: "共有リンクをコピー" },
              { id: "report", icon: <Flag size={14} />, label: "報告", separatorAbove: true },
              { id: "delete", icon: <Trash2 size={14} />, label: "削除", danger: true },
            ]}
          />
          <Tooltip content="お気に入りに追加 (F)">
            <IconButton label="お気に入り"><Star size={17} /></IconButton>
          </Tooltip>
          <Tooltip content="このクイズはAIが下書きを生成し、作成者が監修しています">
            <span><Badge tone="ai"><Sparkles size={11} /> AI生成</Badge></span>
          </Tooltip>
        </Demo>
      </Section>

      <Section title="ルール">
        <SpecTable
          head={["やること", "理由"]}
          rows={[
            ["Escで閉じる・オーバーレイクリックで閉じる", "逃げ道のないモーダルを作らない"],
            ["破壊的操作は対象名を本文に明記", "「本当に削除しますか？」だけでは何が消えるか分からない"],
            ["主ボタンは右端・キャンセルはghost", "全モーダルで同じ配置にする"],
            ["ネストは2段まで", "モーダルの上のモーダルの上のモーダルは設計ミス"],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Feedback & Status ════════════════════════════════════ */
export function CFeedback() {
  const toast = useToast();
  const [progress, setProgress] = useState(64);
  return (
    <DocPage
      kicker="Components"
      title="Feedback & Status"
      lede="ユーザーの操作には必ず反応を返す。3秒以内に終わればトースト、続く状態はバナー、その場の文脈はアラート。"
    >
      <Section title="Alert">
        <Demo col>
          <Alert tone="info" title="下書きが自動保存されました">2分ごとに自動保存されます。手動保存は ⌘S。</Alert>
          <Alert tone="success" title="クイズを公開しました">ライブラリと検索結果に表示されるまで数分かかることがあります。</Alert>
          <Alert tone="warning" title="残り時間が少なくなっています">あと5分で解答時間が終了します。未回答は3問です。</Alert>
          <Alert
            tone="danger"
            title="保存に失敗しました"
            actions={<><Button size="sm" variant="danger-soft">再試行</Button><Button size="sm" variant="ghost">下書きを复製</Button></>}
          >
            サーバーに接続できません。編集内容はこの端末に保持されています。
          </Alert>
          <Alert tone="ai" title="AIからの提案">「古典文法・助動詞」の正答率が下がっています。10問の復習セットを作成しました。</Alert>
        </Demo>
      </Section>

      <Section title="Banner（画面上部の帯）">
        <Demo col>
          <Banner tone="info" actions={<Button size="sm" variant="ghost">詳細</Button>}>新機能: PDFからの問題生成が使えるようになりました</Banner>
          <Banner tone="warning" actions={<Button size="sm" variant="outline">再接続</Button>}><WifiOff size={14} style={{ marginRight: 6, verticalAlign: -2 }} />オフラインです — 変更は接続後に同期されます</Banner>
          <Banner tone="danger">7/25(土) 2:00〜4:00 メンテナンスのため利用できません</Banner>
        </Demo>
      </Section>

      <Section title="Toast" desc="操作の結果を短く通知して消える。取り消し可能な操作にはアクションを付ける。">
        <Demo>
          <Button variant="outline" onClick={() => toast({ title: "保存しました", tone: "success" })}>成功トースト</Button>
          <Button variant="outline" onClick={() => toast({ title: "お気に入りから削除しました", action: { label: "元に戻す", onClick: () => toast({ title: "元に戻しました", tone: "success" }) } })}>取り消しつき</Button>
          <Button variant="outline" onClick={() => toast({ title: "接続エラー", description: "ネットワークを確認して再試行してください。", tone: "danger" })}>エラー</Button>
          <Button variant="outline" onClick={() => toast({ title: "AIが復習セットを作成中", description: "完了したら通知します（約30秒）", tone: "ai" })}>AI</Button>
        </Demo>
      </Section>

      <Section title="Progress / Ring / Stepper">
        <Demo col style={{ maxWidth: 480 }}>
          <div className="vq-row" style={{ gap: "var(--vq-sp-5)" }}>
            <Progress value={progress} label={`進捗 ${progress}%`} />
            <Button size="sm" variant="ghost" onClick={() => setProgress((p) => (p >= 100 ? 12 : p + 12))}>進める</Button>
          </div>
          <div className="vq-row" style={{ gap: "var(--vq-sp-7)" }}>
            <Ring value={18} max={30}>18/30</Ring>
            <Ring value={64} size={56} tone="warning">64%</Ring>
            <Ring value={8} max={100} size={56} tone="danger">0:08</Ring>
            <Spinner />
            <Spinner muted size={16} />
          </div>
          <Stepper steps={["情報入力", "規約確認", "登録"]} current={1} />
        </Demo>
      </Section>

      <Section title="Skeleton" desc="ローディング中は実レイアウトと同じ骨格を出す。スピナー単独は3秒以内の処理だけ。">
        <Demo col style={{ maxWidth: 420 }}>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)" }} aria-busy="true" role="status" aria-label="読み込み中">
            <Skeleton circle width={40} height={40} />
            <div className="vq-grow vq-stack" style={{ gap: 8 }}>
              <Skeleton width="70%" />
              <Skeleton width="45%" height={10} />
            </div>
          </div>
          <Skeleton height={120} style={{ borderRadius: "var(--vq-r-lg)" }} />
        </Demo>
      </Section>

      <Section title="Empty / Offline">
        <Demo col>
          <Card pad={false}>
            <EmptyState
              icon={<SearchIcon size={22} />}
              title="「量子力学」に一致するクイズはありません"
              description="キーワードを変えるか、自分で作成してみましょう。AIがPDFや教科書から問題を生成することもできます。"
              actions={<><Button icon={<Plus size={15} />}>クイズを作成</Button><Button variant="outline" icon={<Sparkles size={15} />}>AIで生成</Button></>}
            />
          </Card>
          <Card pad={false}><OfflineState onRetry={() => {}} /></Card>
        </Demo>
      </Section>
    </DocPage>
  );
}
