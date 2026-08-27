import React, { Suspense, lazy, useEffect } from "react";
import { RouterProvider, useRouter } from "./router";
import { PrefsProvider } from "./prefs";
import { StudioShell } from "./StudioShell";
import { ToastProvider } from "../ui/components/Toast";
import { Spinner } from "../ui/components";
import { Button } from "../ui/components";
import { Minimize2 } from "lucide-react";

/* ページは遅延読み込み（初期表示を軽く保つ） */
const OverviewWelcome = lazy(() => import("../showcase/overview").then((m) => ({ default: m.OverviewWelcome })));
const GettingStarted = lazy(() => import("../showcase/overview").then((m) => ({ default: m.GettingStarted })));
const Principles = lazy(() => import("../showcase/overview").then((m) => ({ default: m.Principles })));
const ReleaseNotes = lazy(() => import("../showcase/overview").then((m) => ({ default: m.ReleaseNotes })));

const FColors = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FColors })));
const FTypography = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FTypography })));
const FSpacing = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FSpacing })));
const FRadius = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FRadius })));
const FShadows = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FShadows })));
const FMotion = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FMotion })));
const FIcons = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FIcons })));
const FLayout = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FLayout })));
const FA11y = lazy(() => import("../showcase/foundations").then((m) => ({ default: m.FA11y })));

const CButtons = lazy(() => import("../showcase/catalog1").then((m) => ({ default: m.CButtons })));
const CInputs = lazy(() => import("../showcase/catalog1").then((m) => ({ default: m.CInputs })));
const CSelection = lazy(() => import("../showcase/catalog1").then((m) => ({ default: m.CSelection })));
const CTabs = lazy(() => import("../showcase/catalog1").then((m) => ({ default: m.CTabs })));
const CDisplay = lazy(() => import("../showcase/catalog2").then((m) => ({ default: m.CDisplay })));
const CCards = lazy(() => import("../showcase/catalog2").then((m) => ({ default: m.CCards })));
const COverlays = lazy(() => import("../showcase/catalog2").then((m) => ({ default: m.COverlays })));
const CFeedback = lazy(() => import("../showcase/catalog2").then((m) => ({ default: m.CFeedback })));
const CTables = lazy(() => import("../showcase/catalog3").then((m) => ({ default: m.CTables })));
const CNavigation = lazy(() => import("../showcase/catalog3").then((m) => ({ default: m.CNavigation })));
const CCharts = lazy(() => import("../showcase/catalog3").then((m) => ({ default: m.CCharts })));

const PAuth = lazy(() => import("../showcase/patterns").then((m) => ({ default: m.PAuth })));
const PShell = lazy(() => import("../showcase/patterns").then((m) => ({ default: m.PShell })));
const PStates = lazy(() => import("../showcase/patterns").then((m) => ({ default: m.PStates })));
const PForms = lazy(() => import("../showcase/patterns").then((m) => ({ default: m.PForms })));
const PCelebration = lazy(() => import("../showcase/patterns").then((m) => ({ default: m.PCelebration })));

const SSplash = lazy(() => import("../features/pages").then((m) => ({ default: m.SSplash })));
const SWelcome = lazy(() => import("../features/pages").then((m) => ({ default: m.SWelcome })));
const SAuth = lazy(() => import("../features/pages").then((m) => ({ default: m.SAuth })));
const SOnboarding = lazy(() => import("../features/pages").then((m) => ({ default: m.SOnboarding })));
const SHome = lazy(() => import("../features/pages").then((m) => ({ default: m.SHome })));
const SLibrary = lazy(() => import("../features/pages").then((m) => ({ default: m.SLibrary })));
const SPlayer = lazy(() => import("../features/pages").then((m) => ({ default: m.SPlayer })));
const SResults = lazy(() => import("../features/pages").then((m) => ({ default: m.SResults })));
const SPreExam = lazy(() => import("../features/pages").then((m) => ({ default: m.SPreExam })));
const SFeed = lazy(() => import("../features/pages").then((m) => ({ default: m.SFeed })));
const SProfile = lazy(() => import("../features/pages").then((m) => ({ default: m.SProfile })));
const SNotifications = lazy(() => import("../features/pages").then((m) => ({ default: m.SNotifications })));
const SSettings = lazy(() => import("../features/pages").then((m) => ({ default: m.SSettings })));
const SQuickChat = lazy(() => import("../features/pages").then((m) => ({ default: m.SQuickChat })));
const SSede = lazy(() => import("../features/pages").then((m) => ({ default: m.SSede })));
const SQredit = lazy(() => import("../features/pages").then((m) => ({ default: m.SQredit })));
const SQreditCard = lazy(() => import("../features/pages").then((m) => ({ default: m.SQreditCard })));
const SQdp = lazy(() => import("../features/pages").then((m) => ({ default: m.SQdp })));
const SAdmin = lazy(() => import("../features/pages").then((m) => ({ default: m.SAdmin })));
const SSystem = lazy(() => import("../features/pages").then((m) => ({ default: m.SSystem })));

const LabMotion = lazy(() => import("../showcase/playground").then((m) => ({ default: m.LabMotion })));
const LabResponsive = lazy(() => import("../showcase/playground").then((m) => ({ default: m.LabResponsive })));
const LabStress = lazy(() => import("../showcase/playground").then((m) => ({ default: m.LabStress })));
const LabTheme = lazy(() => import("../showcase/playground").then((m) => ({ default: m.LabTheme })));

const FullScreenView = lazy(() => import("../features/pages").then((m) => ({ default: m.FullScreenView })));

const ROUTES: Record<string, React.LazyExoticComponent<() => React.ReactElement>> = {
  "/overview/welcome": OverviewWelcome,
  "/overview/getting-started": GettingStarted,
  "/overview/principles": Principles,
  "/overview/release-notes": ReleaseNotes,
  "/foundations/colors": FColors,
  "/foundations/typography": FTypography,
  "/foundations/spacing": FSpacing,
  "/foundations/radius": FRadius,
  "/foundations/shadows": FShadows,
  "/foundations/motion": FMotion,
  "/foundations/icons": FIcons,
  "/foundations/layout": FLayout,
  "/foundations/accessibility": FA11y,
  "/components/buttons": CButtons,
  "/components/inputs": CInputs,
  "/components/selection": CSelection,
  "/components/tabs": CTabs,
  "/components/display": CDisplay,
  "/components/cards": CCards,
  "/components/overlays": COverlays,
  "/components/feedback": CFeedback,
  "/components/tables": CTables,
  "/components/navigation": CNavigation,
  "/components/charts": CCharts,
  "/patterns/authentication": PAuth,
  "/patterns/app-shell": PShell,
  "/patterns/states": PStates,
  "/patterns/forms": PForms,
  "/patterns/celebration": PCelebration,
  "/screens/splash": SSplash,
  "/screens/welcome": SWelcome,
  "/screens/auth": SAuth,
  "/screens/onboarding": SOnboarding,
  "/screens/home": SHome,
  "/screens/library": SLibrary,
  "/screens/player": SPlayer,
  "/screens/results": SResults,
  "/screens/preexam": SPreExam,
  "/screens/feed": SFeed,
  "/screens/profile": SProfile,
  "/screens/notifications": SNotifications,
  "/screens/settings": SSettings,
  "/screens/quickchat": SQuickChat,
  "/screens/sede": SSede,
  "/screens/qredit": SQredit,
  "/screens/qredit-card": SQreditCard,
  "/screens/qdp": SQdp,
  "/screens/admin": SAdmin,
  "/screens/system": SSystem,
  "/playground/motion": LabMotion,
  "/playground/responsive": LabResponsive,
  "/playground/stress": LabStress,
  "/playground/theme": LabTheme,
};

function PageFallback() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "40vh" }}>
      <Spinner size={24} muted label="ページを読み込み中" />
    </div>
  );
}

function NotFound() {
  const { navigate } = useRouter();
  return (
    <div className="studio-page" style={{ textAlign: "center", paddingTop: "var(--vq-sp-13)" }}>
      <div style={{ font: "var(--vq-type-display)", marginBottom: "var(--vq-sp-4)" }}>404</div>
      <p style={{ color: "var(--vq-text-secondary)", marginBottom: "var(--vq-sp-7)" }}>このページはStudioに存在しません。</p>
      <Button onClick={() => navigate("/overview/welcome")}>Welcomeへ戻る</Button>
    </div>
  );
}

function Routed() {
  const { path, navigate } = useRouter();

  useEffect(() => {
    if (path === "/" || path === "") navigate("/overview/welcome", { replace: true });
  }, [path, navigate]);

  /* フルスクリーンプレビュー: /full/<screen> */
  if (path.startsWith("/full/")) {
    const id = path.slice("/full/".length);
    return (
      <Suspense fallback={<PageFallback />}>
        <div className="studio-full">
          <Button
            className="studio-full__exit"
            variant="outline"
            size="sm"
            icon={<Minimize2 size={14} />}
            onClick={() => navigate(`/screens/${id}`)}
          >
            プレビューを終了
          </Button>
          <FullScreenView id={id} />
        </div>
      </Suspense>
    );
  }

  const Page = ROUTES[path];
  return (
    <StudioShell>
      <Suspense fallback={<PageFallback />}>
        {Page ? <Page /> : path === "/" ? <PageFallback /> : <NotFound />}
      </Suspense>
    </StudioShell>
  );
}

export function App() {
  return (
    <PrefsProvider>
      <ToastProvider>
        <RouterProvider>
          <Routed />
        </RouterProvider>
      </ToastProvider>
    </PrefsProvider>
  );
}
