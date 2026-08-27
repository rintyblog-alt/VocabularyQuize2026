import { listSurvivalThemes, getSurvivalTheme } from "./maps.js";
import { getGraphicsBadge } from "./ui.js";

let stylesReady = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initials(name) {
  const text = String(name || "G").trim();
  return text ? text.slice(0, 1).toUpperCase() : "G";
}

export function ensureLobbyUiStyles() {
  if (stylesReady) return;
  stylesReady = true;
  const style = document.createElement("style");
  style.id = "survival-v2-lobby-styles";
  style.textContent = `
    .sv2-root{position:fixed; inset:0; z-index:3800; background:radial-gradient(circle at 50% 8%, rgba(92,133,255,.18), transparent 26%), linear-gradient(180deg,#0a1220 0%,#0c1628 52%,#08111f 100%); color:#eef4ff; display:flex; flex-direction:column; overflow:hidden}
    .sv2-topbar{display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:64px; padding:18px 22px 12px; position:relative; z-index:2}
    .sv2-brand{display:flex; flex-direction:column; gap:4px}
    .sv2-title{font:800 24px/1.1 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif; letter-spacing:.01em}
    .sv2-sub{font-size:12px; color:rgba(226,234,248,.66)}
    .sv2-top-actions{display:flex; align-items:center; gap:10px}
    .sv2-top-mobile{display:none; align-items:center; gap:8px}
    .sv2-pill{display:inline-flex; align-items:center; gap:8px; min-height:36px; padding:0 14px; border-radius:999px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.1); color:#eef4ff; font-size:13px}
    .sv2-shell{display:grid; grid-template-columns:minmax(260px,300px) minmax(0,1fr) minmax(300px,360px); gap:18px; padding:0 20px 18px; min-height:0; flex:1}
    .sv2-panel{background:rgba(14,22,38,.72); border:1px solid rgba(151,183,241,.12); border-radius:22px; box-shadow:0 24px 50px rgba(0,0,0,.22); backdrop-filter:blur(18px) saturate(1.08); overflow:hidden; min-height:0}
    .sv2-panel-head{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:18px 18px 12px}
    .sv2-panel-title{font-size:13px; letter-spacing:.12em; color:rgba(221,231,246,.72); font-weight:800}
    .sv2-panel-body{padding:0 18px 18px; min-height:0}
    .sv2-party-list{display:flex; flex-direction:column; gap:10px; min-height:0; max-height:100%; overflow:auto; padding-right:4px}
    .sv2-party-row{display:grid; grid-template-columns:48px minmax(0,1fr) auto; gap:12px; align-items:center; padding:12px 12px; border-radius:18px; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.07)}
    .sv2-party-row.is-me{box-shadow:inset 0 0 0 1px rgba(116,168,255,.42)}
    .sv2-avatar{width:48px; height:48px; border-radius:16px; overflow:hidden; display:grid; place-items:center; background:linear-gradient(145deg,#1a2740,#27395a); font-weight:800; color:#f7fbff}
    .sv2-party-main{min-width:0}
    .sv2-party-name{font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
    .sv2-party-handle{font-size:12px; color:rgba(222,232,247,.62); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
    .sv2-badge-col{display:flex; flex-direction:column; align-items:flex-end; gap:8px}
    .sv2-ready-badge,.sv2-host-badge{display:inline-flex; align-items:center; min-height:26px; padding:0 10px; border-radius:999px; font-size:11px; font-weight:800; letter-spacing:.06em; border:1px solid rgba(255,255,255,.1)}
    .sv2-ready-badge.is-ready{background:rgba(65,190,129,.16); color:#e5fff0; border-color:rgba(77,216,145,.42)}
    .sv2-ready-badge.is-wait{background:rgba(255,255,255,.05); color:rgba(235,241,252,.74)}
    .sv2-host-badge{background:rgba(104,150,255,.15); color:#dce8ff; border-color:rgba(124,171,255,.36)}
    .sv2-center{display:flex; flex-direction:column; min-width:0; min-height:0}
    .sv2-scene-panel{position:relative; min-height:0; flex:1; background:linear-gradient(180deg,rgba(13,20,36,.84) 0%, rgba(10,16,30,.94) 100%)}
    .sv2-scene-canvas{position:absolute; inset:0; width:100%; height:100%; display:block}
    .sv2-scene-overlay{position:absolute; inset:auto 18px 18px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; pointer-events:none}
    .sv2-scene-note{padding:10px 14px; border-radius:16px; background:rgba(8,14,24,.58); border:1px solid rgba(255,255,255,.08); color:rgba(235,243,255,.8); font-size:12px; backdrop-filter:blur(10px)}
    .sv2-match-panel{display:flex; flex-direction:column; min-height:0}
    .sv2-drawer-backdrop{display:none}
    .sv2-section{display:flex; flex-direction:column; gap:10px; margin-top:16px}
    .sv2-label{font-size:12px; font-weight:700; color:rgba(226,233,246,.72); letter-spacing:.06em}
    .sv2-chip-row{display:flex; flex-wrap:wrap; gap:8px}
    .sv2-chip{display:inline-flex; align-items:center; min-height:34px; padding:0 12px; border-radius:999px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.04); color:#eef4ff; font-size:13px}
    .sv2-chip.is-active{background:rgba(93,140,255,.18); border-color:rgba(113,161,255,.42)}
    .sv2-map-grid{display:grid; grid-template-columns:1fr 1fr; gap:10px; max-height:280px; overflow:auto; padding-right:4px}
    .sv2-map-card{display:flex; flex-direction:column; gap:6px; padding:12px 12px; border-radius:18px; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.08); cursor:pointer; transition:transform .18s ease, border-color .18s ease, background .18s ease}
    .sv2-map-card:hover{transform:translateY(-1px); border-color:rgba(156,188,247,.26)}
    .sv2-map-card.is-active{background:rgba(85,124,230,.14); border-color:rgba(116,156,255,.42); box-shadow:0 0 0 1px rgba(116,156,255,.16)}
    .sv2-map-name{font-size:14px; font-weight:700}
    .sv2-map-desc{font-size:12px; color:rgba(224,232,244,.66); line-height:1.45}
    .sv2-field,.sv2-select{width:100%; min-height:44px; border-radius:16px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.05); color:#eef4ff; padding:0 14px; font:inherit}
    .sv2-select option{color:#0b1220}
    .sv2-settings-grid{display:grid; grid-template-columns:1fr 1fr; gap:10px}
    .sv2-entry-hidden{display:none!important}
    .sv2-bottom{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 20px 18px; position:relative; z-index:2}
    .sv2-bottom-main{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
    .sv2-btn{display:inline-flex; align-items:center; justify-content:center; gap:10px; min-height:52px; padding:0 18px; border-radius:18px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); color:#eef4ff; font:700 14px/1 ui-sans-serif,system-ui; cursor:pointer; transition:transform .16s ease, background .16s ease, border-color .16s ease, opacity .16s ease}
    .sv2-btn:hover{transform:translateY(-1px); background:rgba(255,255,255,.09)}
    .sv2-btn:disabled{cursor:not-allowed; opacity:.48; transform:none}
    .sv2-btn-primary{background:linear-gradient(180deg,#5e84ff 0%,#3d68ef 100%); border-color:rgba(126,164,255,.58); box-shadow:0 14px 30px rgba(57,104,239,.24)}
    .sv2-btn-primary:hover{background:linear-gradient(180deg,#6a8eff 0%,#4a74f4 100%)}
    .sv2-btn-ghost{background:rgba(255,255,255,.04)}
    .sv2-code{display:inline-flex; align-items:center; gap:10px; min-height:48px; padding:0 16px; border-radius:16px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.09); font-size:13px; color:rgba(235,243,255,.84)}
    .sv2-loading{position:absolute; inset:0; display:flex; flex-direction:column; justify-content:space-between; padding:26px; background:linear-gradient(180deg,rgba(7,11,20,.96) 0%, rgba(9,14,26,.88) 100%); z-index:5}
    .sv2-loading-top{display:flex; align-items:flex-start; justify-content:space-between; gap:12px}
    .sv2-loading-title{font-size:24px; font-weight:800}
    .sv2-loading-hint{max-width:280px; font-size:13px; line-height:1.5; color:rgba(226,235,248,.8); text-align:right}
    .sv2-loading-center{display:flex; flex-direction:column; align-items:flex-start; gap:8px}
    .sv2-loading-stage{font-size:18px; font-weight:700}
    .sv2-loading-bottom{display:flex; flex-direction:column; gap:10px}
    .sv2-loading-bar{height:10px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden}
    .sv2-loading-bar > i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#5d84ff 0%,#86d8ff 100%)}
    .sv2-rotate{position:absolute; inset:0; background:rgba(5,8,14,.92); display:none; align-items:center; justify-content:center; text-align:center; padding:24px; z-index:7}
    .sv2-rotate.is-show{display:flex}
    .sv2-rotate-card{max-width:360px; padding:22px 22px; border-radius:22px; background:rgba(16,22,38,.82); border:1px solid rgba(255,255,255,.1)}
    .sv2-empty{font-size:13px; color:rgba(225,233,246,.7)}
    @media (max-width: 1180px){
      .sv2-shell{grid-template-columns:minmax(240px,280px) minmax(0,1fr) minmax(280px,320px)}
    }
    @media (max-width: 1024px){
      .sv2-root{padding-top:env(safe-area-inset-top,0); padding-bottom:env(safe-area-inset-bottom,0)}
      .sv2-top-actions .sv2-pill{display:none}
      .sv2-top-mobile{display:flex}
      .sv2-shell{display:block; padding:0 14px 12px}
      .sv2-center{min-height:0}
      .sv2-scene-panel{min-height:calc(100vh - 176px)}
      .sv2-bottom{padding:0 14px calc(14px + env(safe-area-inset-bottom,0)); flex-wrap:wrap}
      .sv2-bottom-main{width:100%}
      .sv2-code{width:100%; justify-content:center}
      .sv2-drawer-backdrop{position:fixed; inset:0; background:rgba(0,0,0,.42); backdrop-filter:blur(8px); z-index:4}
      .sv2-drawer-backdrop.is-open{display:block}
      .sv2-party-panel,.sv2-match-panel{position:fixed; top:72px; bottom:88px; width:min(380px,calc(100vw - 28px)); z-index:6; display:flex; box-shadow:0 28px 60px rgba(0,0,0,.34)}
      .sv2-party-panel{left:14px; transform:translateX(-115%); transition:transform .22s ease}
      .sv2-match-panel{right:14px; transform:translateX(115%); transition:transform .22s ease}
      .sv2-root.is-party-open .sv2-party-panel{transform:translateX(0)}
      .sv2-root.is-match-open .sv2-match-panel{transform:translateX(0)}
    }
  `;
  document.head.appendChild(style);
}

export function createLobbyShell() {
  ensureLobbyUiStyles();
  const root = document.createElement("section");
  root.className = "sv2-root";
  root.innerHTML = `
    <header class="sv2-topbar">
      <div class="sv2-brand">
        <div class="sv2-title">VocabuSurvival</div>
        <div class="sv2-sub" data-sv2-subtitle>Babylon Lobby</div>
      </div>
      <div class="sv2-top-actions">
        <div class="sv2-top-mobile">
          <button class="sv2-btn sv2-btn-ghost" type="button" data-sv2-action="show-party">Party</button>
          <button class="sv2-btn sv2-btn-ghost" type="button" data-sv2-action="show-match">Match</button>
        </div>
        <div class="sv2-pill" data-sv2-room-pill>Room ----</div>
        <div class="sv2-pill" data-sv2-conn-pill>Connecting...</div>
        <button class="sv2-btn sv2-btn-ghost" type="button" data-sv2-action="leave">Leave</button>
      </div>
    </header>
    <div class="sv2-shell">
      <aside class="sv2-panel sv2-party-panel">
        <div class="sv2-panel-head">
          <div class="sv2-panel-title">PARTY</div>
          <div class="sv2-empty" data-sv2-party-meta>0 / 8</div>
        </div>
        <div class="sv2-panel-body">
          <div class="sv2-section" data-sv2-entry-panel>
            <div class="sv2-label">LOBBY ACCESS</div>
            <div class="sv2-empty" style="margin-bottom:8px;">ルームを作成するか、既存ルームに参加します。</div>
            <div class="sv2-settings-grid" style="margin-bottom:10px;">
              <div style="grid-column:1 / -1;">
                <div class="sv2-label" style="margin-bottom:6px;">Nickname</div>
                <input class="sv2-field" id="rtRoomNickInput" data-sv2-nick-input type="text" maxlength="32" placeholder="Player" />
              </div>
              <div>
                <div class="sv2-label" style="margin-bottom:6px;">Create Password</div>
                <input class="sv2-field" id="rtRoomCreatePasswordInput" data-sv2-create-password type="text" maxlength="6" placeholder="ABC123" />
              </div>
              <div>
                <div class="sv2-label" style="margin-bottom:6px;">Questions</div>
                <select class="sv2-select" id="rtRoomCreateQuestionCountSelect" data-sv2-create-count></select>
              </div>
              <div>
                <div class="sv2-label" style="margin-bottom:6px;">Join Room</div>
                <input class="sv2-field" id="rtRoomJoinIdInput" data-sv2-join-room type="text" maxlength="6" placeholder="A1B2C3" />
              </div>
              <div>
                <div class="sv2-label" style="margin-bottom:6px;">Join Password</div>
                <input class="sv2-field" id="rtRoomJoinPasswordInput" data-sv2-join-password type="text" maxlength="6" placeholder="ABC123" />
              </div>
            </div>
            <div class="sv2-chip-row">
              <button class="sv2-btn" type="button" data-sv2-action="create-room">CREATE ROOM</button>
              <button class="sv2-btn sv2-btn-primary" type="button" data-sv2-action="join-room">JOIN ROOM</button>
            </div>
          </div>
          <div class="sv2-party-list" data-sv2-party-list></div>
        </div>
      </aside>
      <main class="sv2-center">
        <section class="sv2-panel sv2-scene-panel">
          <canvas class="sv2-scene-canvas" data-sv2-canvas></canvas>
          <div class="sv2-loading" data-sv2-loading>
            <div class="sv2-loading-top">
              <div class="sv2-loading-title">VocabuSurvival</div>
              <div class="sv2-loading-hint" data-sv2-loading-hint>フレンドと一緒に勝ち抜こう</div>
            </div>
            <div class="sv2-loading-center">
              <div class="sv2-loading-stage" data-sv2-loading-stage>Loading Lobby...</div>
              <div class="sv2-empty" data-sv2-loading-meta>Preparing lobby scene</div>
            </div>
            <div class="sv2-loading-bottom">
              <div class="sv2-loading-bar"><i data-sv2-loading-progress style="width:18%"></i></div>
            </div>
          </div>
          <div class="sv2-rotate" data-sv2-rotate>
            <div class="sv2-rotate-card">
              <div class="sv2-title" style="font-size:20px;">端末を横向きにしてください</div>
              <div class="sv2-sub" style="margin-top:8px;">VocabuSurvival のロビーは横画面前提です。</div>
            </div>
          </div>
          <div class="sv2-scene-overlay">
            <div class="sv2-scene-note" data-sv2-scene-note>中央があなた、後方がパーティメンバーです。</div>
            <div class="sv2-scene-note" data-sv2-quality-badge>Graphics · ${escapeHtml(getGraphicsBadge("medium").label)}</div>
          </div>
        </section>
      </main>
      <aside class="sv2-panel sv2-match-panel">
        <div class="sv2-panel-head">
          <div class="sv2-panel-title">MATCH</div>
          <div class="sv2-empty" data-sv2-host-note>Host only</div>
        </div>
        <div class="sv2-panel-body">
          <div class="sv2-section">
            <div class="sv2-label">MODE</div>
            <div class="sv2-chip-row" data-sv2-mode-row></div>
          </div>
          <div class="sv2-section">
            <div class="sv2-label">MAP</div>
            <div class="sv2-map-grid" data-sv2-map-grid></div>
          </div>
          <div class="sv2-section">
            <div class="sv2-label">PRESET</div>
            <select class="sv2-select" id="rtBattlePresetSelect" data-sv2-preset-select></select>
          </div>
          <div class="sv2-section">
            <div class="sv2-label">DETAIL</div>
            <div class="sv2-settings-grid">
              <div>
                <div class="sv2-label" style="margin-bottom:6px;">Questions</div>
                <select class="sv2-select" id="rtBattleQuestionCountSelect" data-sv2-count-select></select>
              </div>
              <div>
                <div class="sv2-label" style="margin-bottom:6px;">Graphics</div>
                <select class="sv2-select" data-sv2-quality-select>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
    <div class="sv2-drawer-backdrop" data-sv2-action="close-drawers"></div>
    <footer class="sv2-bottom">
      <div class="sv2-bottom-main">
        <button class="sv2-btn" type="button" data-sv2-action="ready">READY</button>
        <button class="sv2-btn sv2-btn-primary" type="button" data-sv2-action="play">PLAY</button>
        <button class="sv2-btn sv2-btn-ghost" type="button" data-sv2-action="copy">COPY CODE</button>
      </div>
      <div class="sv2-code" data-sv2-code>Room ----</div>
    </footer>
  `;
  return root;
}

export function renderPartyList(target, players, mePlayerId) {
  if (!(target instanceof HTMLElement)) return;
  const list = Array.isArray(players) ? players : [];
  if (!list.length) {
    target.innerHTML = `<div class="sv2-empty">まだ参加者はいません。</div>`;
    return;
  }
  target.innerHTML = list.map((player) => {
    const isMe = Math.max(0, Number(player?.id || 0)) === Math.max(0, Number(mePlayerId || 0));
    const ready = !!player?.ready;
    const host = !!player?.host;
    const displayName = escapeHtml(player?.nick || player?.displayName || "Guest");
    const handle = player?.handle ? `@${escapeHtml(String(player.handle).replace(/^@/, ""))}` : "guest";
    return `
      <div class="sv2-party-row${isMe ? " is-me" : ""}">
        <div class="sv2-avatar">${escapeHtml(initials(displayName))}</div>
        <div class="sv2-party-main">
          <div class="sv2-party-name">${displayName}${isMe ? " (You)" : ""}</div>
          <div class="sv2-party-handle">${handle}</div>
        </div>
        <div class="sv2-badge-col">
          <span class="sv2-ready-badge ${ready ? "is-ready" : "is-wait"}">${ready ? "READY" : "WAIT"}</span>
          ${host ? `<span class="sv2-host-badge">HOST</span>` : ``}
        </div>
      </div>
    `;
  }).join("");
}

export function renderMapCards(target, activeMapId) {
  if (!(target instanceof HTMLElement)) return;
  const themes = listSurvivalThemes();
  target.innerHTML = themes.map((theme) => `
    <button class="sv2-map-card${theme.id === activeMapId ? " is-active" : ""}" type="button" data-sv2-map="${escapeHtml(theme.id)}">
      <div class="sv2-map-name">${escapeHtml(theme.label)}</div>
      <div class="sv2-map-desc">${escapeHtml(theme.description || theme.tag || "")}</div>
    </button>
  `).join("");
}

export function fillPresetSelect(selectEl, options, selectedValue) {
  if (!(selectEl instanceof HTMLSelectElement)) return;
  const list = Array.isArray(options) ? options : [];
  selectEl.innerHTML = list.map((opt) => `<option value="${escapeHtml(opt.value)}"${opt.value === selectedValue ? " selected" : ""}>${escapeHtml(opt.label)}</option>`).join("");
}

export function fillQuestionCountSelect(selectEl, options, selectedValue) {
  if (!(selectEl instanceof HTMLSelectElement)) return;
  const list = Array.isArray(options) ? options : [];
  selectEl.innerHTML = list.map((opt) => `<option value="${escapeHtml(opt.value)}"${String(opt.value) === String(selectedValue) ? " selected" : ""}>${escapeHtml(opt.label)}</option>`).join("");
}

export function updateLobbyFrame(root, payload) {
  if (!(root instanceof HTMLElement)) return;
  const roomCode = escapeHtml(payload.roomCode || "----");
  const roomPill = root.querySelector("[data-sv2-room-pill]");
  const code = root.querySelector("[data-sv2-code]");
  const conn = root.querySelector("[data-sv2-conn-pill]");
  const meta = root.querySelector("[data-sv2-party-meta]");
  const hostNote = root.querySelector("[data-sv2-host-note]");
  const qualityBadge = root.querySelector("[data-sv2-quality-badge]");
  if (roomPill) roomPill.textContent = `Room ${roomCode}`;
  if (code) code.textContent = `Room Code · ${roomCode}`;
  if (conn) conn.textContent = payload.connected ? "Connected" : (payload.connecting ? "Connecting..." : "Offline");
  if (meta) meta.textContent = `${payload.playerCount || 0} / ${payload.maxPlayers || 8}`;
  if (hostNote) hostNote.textContent = payload.isHost ? "Host controls enabled" : "Host only";
  if (qualityBadge) qualityBadge.textContent = `Graphics · ${escapeHtml(payload.graphicsLabel || "Medium")}`;
}

export function setLoadingState(root, { active, stageText, hintText, progress, metaText }) {
  if (!(root instanceof HTMLElement)) return;
  const panel = root.querySelector("[data-sv2-loading]");
  if (!(panel instanceof HTMLElement)) return;
  panel.style.display = active ? "flex" : "none";
  const stage = root.querySelector("[data-sv2-loading-stage]");
  const hint = root.querySelector("[data-sv2-loading-hint]");
  const meta = root.querySelector("[data-sv2-loading-meta]");
  const bar = root.querySelector("[data-sv2-loading-progress]");
  if (stage) stage.textContent = stageText || "Loading Lobby...";
  if (hint) hint.textContent = hintText || "";
  if (meta) meta.textContent = metaText || "";
  if (bar instanceof HTMLElement) bar.style.width = `${Math.max(4, Math.min(100, Number(progress || 0)))}%`;
}

export function setRotateState(root, isPortrait) {
  if (!(root instanceof HTMLElement)) return;
  const node = root.querySelector("[data-sv2-rotate]");
  if (!(node instanceof HTMLElement)) return;
  node.classList.toggle("is-show", !!isPortrait);
}

export function modeOptions() {
  return [
    { id: "race", label: "Race" },
    { id: "survival", label: "Survival" }
  ];
}

export function renderModeChips(target, activeMode) {
  if (!(target instanceof HTMLElement)) return;
  const modes = modeOptions();
  target.innerHTML = modes.map((mode) => `
    <button class="sv2-chip${mode.id === activeMode ? " is-active" : ""}" type="button" data-sv2-mode="${escapeHtml(mode.id)}">${escapeHtml(mode.label)}</button>
  `).join("");
}

export function mapSummary(mapId) {
  const theme = getSurvivalTheme(mapId);
  return {
    id: theme.id,
    label: theme.label,
    description: theme.description || theme.tag || ""
  };
}
