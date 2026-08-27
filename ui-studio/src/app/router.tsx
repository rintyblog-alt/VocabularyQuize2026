import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/*
  Hash router — 静的ホスティングでもブラウザ戻る/進むが完全動作。
  遷移方向(fwd/back)を追跡し、方向つきトランジションを実現する。
*/

interface RouteState {
  path: string;
  dir: "fwd" | "back" | "none";
  navigate: (path: string, opts?: { replace?: boolean }) => void;
}

const RouterCtx = createContext<RouteState>({ path: "/", dir: "none", navigate: () => {} });
export const useRouter = () => useContext(RouterCtx);

function readHash(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h : "/" + h;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState(readHash);
  const [dir, setDir] = useState<"fwd" | "back" | "none">("none");

  useEffect(() => {
    // 履歴インデックスで方向を判定
    if (history.state?.vqIdx == null) {
      history.replaceState({ ...(history.state ?? {}), vqIdx: 0 }, "");
    }
    const onPop = () => {
      const prevIdx = (window as unknown as { __vqIdx?: number }).__vqIdx ?? 0;
      const nextIdx = history.state?.vqIdx ?? 0;
      (window as unknown as { __vqIdx?: number }).__vqIdx = nextIdx;
      setDir(nextIdx < prevIdx ? "back" : "fwd");
      setPath(readHash());
    };
    (window as unknown as { __vqIdx?: number }).__vqIdx = history.state?.vqIdx ?? 0;
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  const navigate = useMemo(
    () => (to: string, opts?: { replace?: boolean }) => {
      const cur = readHash();
      if (to === cur) return;
      const curIdx = history.state?.vqIdx ?? 0;
      const nextIdx = opts?.replace ? curIdx : curIdx + 1;
      if (opts?.replace) {
        history.replaceState({ vqIdx: nextIdx }, "", `#${to}`);
      } else {
        history.pushState({ vqIdx: nextIdx }, "", `#${to}`);
      }
      (window as unknown as { __vqIdx?: number }).__vqIdx = nextIdx;
      setDir("fwd");
      setPath(to);
      // ページ遷移時は必ず先頭へ（コンテンツ領域は各シェルで制御）
      requestAnimationFrame(() => document.querySelector(".studio-content")?.scrollTo({ top: 0 }));
    },
    []
  );

  return <RouterCtx.Provider value={{ path, dir, navigate }}>{children}</RouterCtx.Provider>;
}

export function Link({
  to, children, className, style, onClick,
}: { to: string; children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${to}`}
      className={className}
      style={style}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
