export function getBattleState() {
  return (typeof window._rtBattleState === "function") ? window._rtBattleState() : {};
}

export function getBattle3dState() {
  return (typeof window._rtBattle3dState === "function") ? window._rtBattle3dState() : {};
}

export function myPlayerKey() {
  return (typeof window._rtBattleMyStateKey === "function")
    ? String(window._rtBattleMyStateKey() || "")
    : "";
}

export function myPlayerId() {
  return (typeof window._rtBattleMyPlayerId === "function")
    ? Math.max(0, Number(window._rtBattleMyPlayerId() || 0))
    : 0;
}

export function sendBattleMessage(payload) {
  if (typeof window._rtBattleSafeSend !== "function") return false;
  return !!window._rtBattleSafeSend(payload);
}

export function buildInputPayload({ seq, moveX, moveZ, jump, sprint, yaw, pitch, viewMode }) {
  return {
    type: "player3d:input",
    seq: Math.max(1, Number(seq || 1)),
    moveX: Math.round(Number(moveX || 0) * 1000) / 1000,
    moveZ: Math.round(Number(moveZ || 0) * 1000) / 1000,
    jump: !!jump,
    sprint: !!sprint,
    yaw: Math.round(Number(yaw || 0) * 1000) / 1000,
    pitch: Math.round(Number(pitch || 0) * 1000) / 1000,
    viewMode: String(viewMode || "third").toLowerCase() === "first" ? "first" : "third",
    ts: Date.now()
  };
}

export function extractWorld(msg) {
  const game3d = msg?.game3d && typeof msg.game3d === "object"
    ? msg.game3d
    : (msg?.state?.game3d && typeof msg.state.game3d === "object" ? msg.state.game3d : null);
  return game3d && game3d.world && typeof game3d.world === "object" ? game3d.world : null;
}

export function extractSnapshot(msg) {
  if (msg?.game3d && typeof msg.game3d === "object") return msg.game3d;
  if (msg?.state?.game3d && typeof msg.state.game3d === "object") return msg.state.game3d;
  const st = getBattleState();
  return st?.game3d && typeof st.game3d === "object" ? st.game3d : null;
}
