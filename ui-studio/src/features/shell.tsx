import React, { useState } from "react";
import {
  Bell, BookOpen, Coins, FileScan, Home, MessageCircle, Pencil, Plus, Search,
  Settings, Shield, Sparkles, Timer, User, Zap,
} from "lucide-react";
import { Avatar, Badge, IconButton, ListItem, Modal } from "../ui/components";

/*
  AppFrame — VocabuQuiz 本体のアプリケーションシェル。
  PC: 左サイドバー + トップバー / モバイル: Bottom Navigation。
  コンテナクエリで切り替わるため、Studioのデバイス切替に追従する。
*/

export interface AppFrameProps {
  active: string;
  title: string;
  topExtra?: React.ReactNode;
  children: React.ReactNode;
  showAdmin?: boolean;
  fab?: React.ReactNode;
  noTopbar?: boolean;
}

const MAIN_NAV = [
  { id: "home", label: "ホーム", icon: Home },
  { id: "quiz", label: "クイズ", icon: BookOpen },
  { id: "preexam", label: "PreExam", icon: Timer },
  { id: "create", label: "作成", icon: Pencil },
  { id: "feed", label: "Feed", icon: MessageCircle },
];
const SUB_NAV = [
  { id: "quickchat", label: "Quick Chat", icon: Zap },
  { id: "sede", label: "Sede", icon: Sparkles },
  { id: "notifications", label: "通知", icon: Bell, badge: 3 },
  { id: "qredit", label: "Qredit", icon: Coins },
];
const FOOT_NAV = [
  { id: "profile", label: "プロフィール", icon: User },
  { id: "settings", label: "設定", icon: Settings },
];

const BOTTOM_NAV = [
  { id: "home", label: "ホーム", icon: Home },
  { id: "quiz", label: "クイズ", icon: BookOpen },
  { id: "create", label: "作成", icon: Plus },
  { id: "feed", label: "Feed", icon: MessageCircle },
  { id: "profile", label: "マイページ", icon: User },
];

export function AppFrame({ active, title, topExtra, children, showAdmin, fab, noTopbar }: AppFrameProps) {
  const [current, setCurrent] = useState(active);
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="qz-shell">
      <aside className="qz-sidebar">
        <div className="qz-sidebar__brand">
          <span className="qz-logo" style={{ width: 32, height: 32, fontSize: 12, borderRadius: 9 }}>VQ</span>
          <span style={{ font: "var(--vq-type-heading-sm)" }}>VocabuQuiz</span>
        </div>
        <nav aria-label="メインナビゲーション" className="vq-stack" style={{ gap: 2 }}>
          {MAIN_NAV.map((n) => (
            <button key={n.id} className={`qz-nav-item ${current === n.id ? "is-active" : ""}`} onClick={() => setCurrent(n.id)} aria-current={current === n.id ? "page" : undefined}>
              <n.icon size={17} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="qz-sidebar__section">ツール</div>
        <nav aria-label="ツール" className="vq-stack" style={{ gap: 2 }}>
          {SUB_NAV.map((n) => (
            <button key={n.id} className={`qz-nav-item ${current === n.id ? "is-active" : ""}`} onClick={() => setCurrent(n.id)}>
              <n.icon size={17} /> {n.label}
              {n.badge && <Badge tone="accent" className="qz-nav-item__badge">{n.badge}</Badge>}
            </button>
          ))}
          {showAdmin && (
            <button className={`qz-nav-item ${current === "admin" ? "is-active" : ""}`} onClick={() => setCurrent("admin")}>
              <Shield size={17} /> 管理 <Badge tone="outline" className="qz-nav-item__badge">Admin</Badge>
            </button>
          )}
        </nav>
        <div className="qz-sidebar__foot vq-stack" style={{ gap: 2 }}>
          {FOOT_NAV.map((n) => (
            <button key={n.id} className={`qz-nav-item ${current === n.id ? "is-active" : ""}`} onClick={() => setCurrent(n.id)}>
              <n.icon size={17} /> {n.label}
            </button>
          ))}
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)", padding: "var(--vq-sp-4)" }}>
            <Avatar name="あおい" size="sm" online />
            <span className="vq-stack" style={{ minWidth: 0 }}>
              <span className="vq-truncate" style={{ font: "var(--vq-type-label)", fontSize: 13 }}>あおい</span>
              <span className="vq-truncate" style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>@aoi_eng · 高3</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="qz-main">
        {!noTopbar && (
          <header className="qz-topbar">
            <span className="qz-topbar__title">{title}</span>
            <span className="vq-grow" />
            {topExtra}
            <div className="vq-row" style={{ gap: 2 }}>
              <IconButton label="検索"><Search size={18} /></IconButton>
              <IconButton label="通知 3件"><Bell size={18} /></IconButton>
            </div>
          </header>
        )}
        <div className="qz-content">{children}</div>
        {fab}
        <nav className="qz-bottomnav" aria-label="メインナビゲーション">
          {BOTTOM_NAV.map((n) =>
            n.id === "create" ? (
              <button key={n.id} className="qz-bottomnav__create" onClick={() => setCreateOpen(true)} aria-label="クイズを作成">
                <span><Plus size={22} strokeWidth={2.4} /></span>
                {n.label}
              </button>
            ) : (
              <button key={n.id} className={`qz-bottomnav__item ${current === n.id ? "is-active" : ""}`} onClick={() => setCurrent(n.id)} aria-current={current === n.id ? "page" : undefined}>
                <n.icon size={20} strokeWidth={current === n.id ? 2.2 : 1.8} />
                {n.label}
              </button>
            )
          )}
        </nav>

        {/* 作成メニュー（モバイル: Bottom Sheet / PC: モーダル） */}
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="なにを作りますか？" sheetGrab>
          <div className="vq-stack" style={{ gap: 2 }}>
            <ListItem
              leading={<span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--vq-r-sm)", background: "var(--vq-accent-subtle)", color: "var(--vq-accent-text)", flex: "0 0 auto" }}><Pencil size={18} /></span>}
              title="クイズを自分で作る"
              description="問題文と選択肢を入力して作成"
              onClick={() => setCreateOpen(false)}
            />
            <ListItem
              leading={<span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--vq-r-sm)", background: "var(--vq-info-bg)", color: "var(--vq-info-text)", flex: "0 0 auto" }}><FileScan size={18} /></span>}
              title="プリント・PDFから読み取る"
              description="撮影またはアップロードでAIが問題化"
              onClick={() => setCreateOpen(false)}
            />
            <ListItem
              leading={<span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--vq-r-sm)", background: "var(--vq-ai-bg)", color: "var(--vq-ai-text)", flex: "0 0 auto" }}><Sparkles size={18} /></span>}
              title="AIで生成する"
              description="範囲を伝えるだけでクイズを自動生成"
              onClick={() => setCreateOpen(false)}
            />
          </div>
        </Modal>
      </div>
    </div>
  );
}
