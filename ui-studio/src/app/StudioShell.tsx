import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, Clock, Globe, Languages, LayoutGrid, Maximize2, Monitor,
  Moon, PanelLeft, Search, Smartphone, SlidersHorizontal, Star, Sun, Tablet,
} from "lucide-react";
import { NAV, findNavItem } from "./nav";
import { Link, useRouter } from "./router";
import { DEVICE_PRESETS, usePrefs, useT } from "./prefs";
import { Breadcrumbs, Dropdown, IconButton, Kbd, SearchInput, Tooltip } from "../ui/components";
import { CommandPalette } from "./CommandPalette";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const { path, dir, navigate } = useRouter();
  const prefs = usePrefs();
  const t = useT();
  const [navFilter, setNavFilter] = useState("");
  const [openSections, setOpenSections] = useState<string[]>(["overview", "foundations", "components", "patterns", "screens", "playground"]);
  const [cmdOpen, setCmdOpen] = useState(false);

  const found = findNavItem(path);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 900;

  // Cmd+K / ページ訪問記録
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((o) => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { if (found) prefs.pushRecent(path); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredNav = useMemo(() => {
    const needle = navFilter.trim().toLowerCase();
    if (!needle) return NAV;
    return NAV.map((s) => ({
      ...s,
      items: s.items.filter((it) => `${it.ja} ${it.en} ${it.keywords ?? ""}`.toLowerCase().includes(needle)),
    })).filter((s) => s.items.length > 0);
  }, [navFilter]);

  const isScreen = path.startsWith("/screens/");
  const deviceOf = DEVICE_PRESETS.find((d) => d.id === prefs.device) ?? DEVICE_PRESETS[8];

  const closeSidebarOnMobile = () => { if (isMobile) prefs.set({ sidebarOpen: false }); };

  return (
    <div className={`studio ${prefs.sidebarOpen ? "" : "sidebar-closed"}`}>
      {/* ── Sidebar ── */}
      <aside className="studio-sidebar">
        <div className="studio-brand">
          <span className="studio-brand__mark" aria-hidden>VQ</span>
          <span>
            <div className="studio-brand__name">VocabuQuiz</div>
            <div className="studio-brand__sub">UI Studio v0.2</div>
          </span>
        </div>
        <div className="studio-sidebar__search">
          <SearchInput size="sm" value={navFilter} onChange={setNavFilter} placeholder={t.search} aria-label="ナビゲーション検索" />
        </div>
        <nav className="studio-nav" aria-label="Studio ナビゲーション">
          {prefs.favorites.length > 0 && !navFilter && (
            <div className="studio-nav__section is-open">
              <div className="studio-nav__head" style={{ cursor: "default" }}><Star size={12} style={{ marginRight: 6 }} />{t.favorites}</div>
              <div className="studio-nav__items"><div>
                {prefs.favorites.map((p) => {
                  const f = findNavItem(p);
                  if (!f) return null;
                  return (
                    <Link key={p} to={p} className={`studio-nav__link ${path === p ? "is-active" : ""}`} onClick={closeSidebarOnMobile}>
                      {prefs.lang === "ja" ? f.item.ja : f.item.en}
                    </Link>
                  );
                })}
              </div></div>
            </div>
          )}
          {filteredNav.map((s) => {
            const open = !!navFilter || openSections.includes(s.id);
            return (
              <div key={s.id} className={`studio-nav__section ${open ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="studio-nav__head"
                  aria-expanded={open}
                  onClick={() => setOpenSections((os) => (os.includes(s.id) ? os.filter((x) => x !== s.id) : [...os, s.id]))}
                >
                  {prefs.lang === "ja" ? s.ja : s.en}
                  <ChevronRight size={13} />
                </button>
                <div className="studio-nav__items"><div>
                  {s.items.map((it) => (
                    <Link
                      key={it.path}
                      to={it.path}
                      className={`studio-nav__link ${path === it.path ? "is-active" : ""}`}
                      onClick={closeSidebarOnMobile}
                    >
                      {prefs.lang === "ja" ? it.ja : it.en}
                    </Link>
                  ))}
                </div></div>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="studio-scrim" onClick={() => prefs.set({ sidebarOpen: false })} />

      {/* ── Main ── */}
      <div className="studio-main">
        <header className="studio-topbar">
          <IconButton label="サイドバー開閉" onClick={() => prefs.set({ sidebarOpen: !prefs.sidebarOpen })}>
            <PanelLeft size={18} />
          </IconButton>

          <button
            type="button"
            className="vq-input vq-input--sm"
            style={{ minWidth: 0, width: 210, cursor: "pointer", color: "var(--vq-text-tertiary)" }}
            onClick={() => setCmdOpen(true)}
            aria-label="コマンドパレットを開く"
          >
            <span className="vq-input__icon"><Search size={14} /></span>
            <span className="vq-grow" style={{ textAlign: "left", fontSize: 13, padding: "0 4px" }}>{t.search}</span>
            <span className="vq-input__trail"><Kbd>⌘K</Kbd></span>
          </button>

          <div className="vq-grow" style={{ minWidth: 8 }}>
            {found && (
              <Breadcrumbs
                items={[
                  { label: prefs.lang === "ja" ? found.section.ja : found.section.en },
                  { label: prefs.lang === "ja" ? found.item.ja : found.item.en },
                ]}
              />
            )}
          </div>

          {/* デバイス切り替え（Screens でプレビュー幅が実際に変わる） */}
          <div className="studio-topbar__group" role="group" aria-label={t.device}>
            <Dropdown
              align="end"
              label={t.device}
              trigger={
                <IconButton label={`${t.device}: ${deviceOf.label}`} active={prefs.device !== "fit"}>
                  {deviceOf.kind === "mobile" ? <Smartphone size={17} /> : deviceOf.kind === "tablet" ? <Tablet size={17} /> : <Monitor size={17} />}
                </IconButton>
              }
              items={DEVICE_PRESETS.map((d) => ({
                id: d.id,
                label: d.id === "fit" ? "Fit（コンテナ幅いっぱい）" : `${d.w}px ${d.kind === "mobile" ? "— スマートフォン" : d.kind === "tablet" ? "— タブレット" : "— PC"}`,
                icon: d.kind === "mobile" ? <Smartphone size={14} /> : d.kind === "tablet" ? <Tablet size={14} /> : d.kind === "fit" ? <LayoutGrid size={14} /> : <Monitor size={14} />,
                hint: prefs.device === d.id ? "選択中" : undefined,
                onSelect: () => prefs.set({ device: d.id }),
              }))}
            />
            <Tooltip content={prefs.theme === "light" ? "ダークモード" : "ライトモード"}>
              <IconButton label={t.theme} onClick={() => prefs.set({ theme: prefs.theme === "light" ? "dark" : "light" })}>
                {prefs.theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              </IconButton>
            </Tooltip>
            <Dropdown
              align="end"
              label="表示設定"
              trigger={<IconButton label="表示設定"><SlidersHorizontal size={17} /></IconButton>}
              items={[
                { id: "density", label: `${t.density}: ${prefs.density === "comfortable" ? "標準" : "コンパクト"}`, onSelect: () => prefs.set({ density: prefs.density === "comfortable" ? "compact" : "comfortable" }) },
                { id: "motion", label: `${t.motionOff}: ${prefs.motion === "off" ? "ON" : "OFF"}`, onSelect: () => prefs.set({ motion: prefs.motion === "on" ? "off" : "on" }) },
                { id: "bg", label: `${t.bg}: ${prefs.canvasBg}`, onSelect: () => prefs.set({ canvasBg: prefs.canvasBg === "default" ? "sunken" : prefs.canvasBg === "sunken" ? "checker" : "default" }) },
                { id: "lang", separatorAbove: true, icon: <Languages size={14} />, label: prefs.lang === "ja" ? "English UI" : "日本語 UI", onSelect: () => prefs.set({ lang: prefs.lang === "ja" ? "en" : "ja" }) },
              ]}
            />
            <Tooltip content="お気に入り登録">
              <IconButton
                label="このページをお気に入り"
                active={prefs.favorites.includes(path)}
                onClick={() => prefs.toggleFavorite(path)}
              >
                <Star size={17} fill={prefs.favorites.includes(path) ? "var(--vq-favorite)" : "none"} style={prefs.favorites.includes(path) ? { color: "var(--vq-favorite)" } : undefined} />
              </IconButton>
            </Tooltip>
            <Dropdown
              align="end"
              label={t.recents}
              trigger={<IconButton label={t.recents}><Clock size={17} /></IconButton>}
              items={
                prefs.recents.length
                  ? prefs.recents.map((p) => {
                      const f = findNavItem(p);
                      return { id: p, label: f ? (prefs.lang === "ja" ? f.item.ja : f.item.en) : p, onSelect: () => navigate(p) };
                    })
                  : [{ id: "none", label: "履歴はまだありません", disabled: true }]
              }
            />
            {isScreen && (
              <Tooltip content={t.fullscreen}>
                <IconButton label={t.fullscreen} onClick={() => navigate(`/full${path.replace("/screens", "")}`)}>
                  <Maximize2 size={17} />
                </IconButton>
              </Tooltip>
            )}
          </div>
        </header>

        <main className={`studio-content studio-content--${prefs.canvasBg}`}>
          <div key={path} className={`studio-route ${dir !== "none" ? `studio-route--${dir}` : ""}`}>
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

/* Screens 用: デバイス幅つきプレビュー枠 */
export function ScreenStage({ children, minH = 560 }: { children: React.ReactNode; minH?: number }) {
  const prefs = usePrefs();
  const device = DEVICE_PRESETS.find((d) => d.id === prefs.device) ?? DEVICE_PRESETS[8];
  return (
    <div className="device-stage">
      <div
        className="device-frame"
        style={{ ["--frame-w" as string]: device.kind === "fit" ? "100%" : `${device.w}px` }}
      >
        <div className="device-frame__bar">
          <Globe size={11} />
          app.vocabuquiz.com
          <span style={{ opacity: 0.6 }}>·</span>
          <span className="vq-num">{device.kind === "fit" ? "container" : `${device.w}px`}</span>
        </div>
        <div className="device-frame__viewport" style={{ minHeight: minH }}>{children}</div>
      </div>
    </div>
  );
}
