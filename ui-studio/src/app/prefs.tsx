import React, { createContext, useContext, useEffect } from "react";
import { useLocalStorage } from "../ui/hooks";

/* Studio 全体の表示設定（テーマ / デバイス幅 / 密度 / 言語 / モーション / 背景） */

export const DEVICE_PRESETS = [
  { id: "375", label: "375", w: 375, kind: "mobile" },
  { id: "390", label: "390", w: 390, kind: "mobile" },
  { id: "430", label: "430", w: 430, kind: "mobile" },
  { id: "768", label: "768", w: 768, kind: "tablet" },
  { id: "1024", label: "1024", w: 1024, kind: "desktop" },
  { id: "1280", label: "1280", w: 1280, kind: "desktop" },
  { id: "1440", label: "1440", w: 1440, kind: "desktop" },
  { id: "1728", label: "1728", w: 1728, kind: "desktop" },
  { id: "fit", label: "Fit", w: 0, kind: "fit" },
] as const;

export type DeviceId = (typeof DEVICE_PRESETS)[number]["id"];

interface Prefs {
  theme: "light" | "dark";
  density: "comfortable" | "compact";
  lang: "ja" | "en";
  device: DeviceId;
  motion: "on" | "off";
  canvasBg: "default" | "sunken" | "checker";
  sidebarOpen: boolean;
  favorites: string[];
  recents: string[];
  set: (p: Partial<Omit<Prefs, "set" | "toggleFavorite" | "pushRecent">>) => void;
  toggleFavorite: (path: string) => void;
  pushRecent: (path: string) => void;
}

const Ctx = createContext<Prefs>(null as unknown as Prefs);
export const usePrefs = () => useContext(Ctx);

interface PrefsData {
  theme: "light" | "dark";
  density: "comfortable" | "compact";
  lang: "ja" | "en";
  device: DeviceId;
  motion: "on" | "off";
  canvasBg: "default" | "sunken" | "checker";
  sidebarOpen: boolean;
  favorites: string[];
  recents: string[];
}

const DEFAULTS: PrefsData = {
  theme: "light", density: "comfortable", lang: "ja", device: "fit",
  motion: "on", canvasBg: "default", sidebarOpen: true, favorites: [], recents: [],
};

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useLocalStorage<PrefsData>("vq-studio-prefs", DEFAULTS);

  /* モバイル幅ではサイドバーを初期状態で閉じる（コンテンツを覆わない） */
  useEffect(() => {
    if (window.innerWidth <= 900) setData((d) => (d.sidebarOpen ? { ...d, sidebarOpen: false } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = data.theme;
    root.dataset.density = data.density;
    root.dataset.motion = data.motion;
    root.lang = data.lang;
  }, [data.theme, data.density, data.motion, data.lang]);

  const value: Prefs = {
    ...DEFAULTS,
    ...data,
    set: (p) => setData((d) => ({ ...d, ...p })),
    toggleFavorite: (path) =>
      setData((d) => ({
        ...d,
        favorites: d.favorites.includes(path) ? d.favorites.filter((f) => f !== path) : [...d.favorites, path].slice(-12),
      })),
    pushRecent: (path) =>
      setData((d) => ({ ...d, recents: [path, ...d.recents.filter((r) => r !== path)].slice(0, 8) })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* Studio クロームの2言語対応（コンテンツは日本語基準） */
export const T = {
  ja: {
    search: "検索…", overview: "Overview", foundations: "Foundations", components: "Components",
    patterns: "Patterns", screens: "Screens", playground: "Playground",
    favorites: "お気に入り", recents: "最近見たページ",
    theme: "テーマ", density: "密度", lang: "言語", fullscreen: "フルスクリーンプレビュー",
    device: "デバイス幅", motionOff: "モーション最小化", bg: "背景",
  },
  en: {
    search: "Search…", overview: "Overview", foundations: "Foundations", components: "Components",
    patterns: "Patterns", screens: "Screens", playground: "Playground",
    favorites: "Favorites", recents: "Recent",
    theme: "Theme", density: "Density", lang: "Language", fullscreen: "Fullscreen preview",
    device: "Device width", motionOff: "Reduce motion", bg: "Background",
  },
} as const;

export function useT() {
  const { lang } = usePrefs();
  return T[lang];
}
