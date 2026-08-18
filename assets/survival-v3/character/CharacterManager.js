/**
 * CharacterManager.js — Manages local + remote player characters
 */
const T = () => window.THREE;
import { createBeanCharacter, disposeBeanCharacter, BEAN_PALETTE } from "./BeanCharacter.js";

export class CharacterManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, { bean, targetPos, targetRotY, state }>} */
    this.players = new Map();
    this.localId = null;
  }

  setLocalId(id) {
    this.localId = id;
  }

  addPlayer(id, colorIndex = 0) {
    if (this.players.has(id)) return this.players.get(id);
    const color = BEAN_PALETTE[colorIndex % BEAN_PALETTE.length];
    const bean = createBeanCharacter(color);
    this.scene.add(bean.group);
    const entry = {
      id,
      bean,
      targetPos: new (T()).Vector3(0, 0, 0),
      targetRotY: 0,
      state: "idle"
    };
    this.players.set(id, entry);
    return entry;
  }

  removePlayer(id) {
    const entry = this.players.get(id);
    if (!entry) return;
    disposeBeanCharacter(entry.bean);
    this.players.delete(id);
  }

  /**
   * Update target position/state for a player (called on network sync)
   */
  updatePlayer(id, { x, y, z, rotY, state }) {
    const entry = this.players.get(id);
    if (!entry) return;
    if (x != null) entry.targetPos.x = x;
    if (y != null) entry.targetPos.y = y;
    if (z != null) entry.targetPos.z = z;
    if (rotY != null) entry.targetRotY = rotY;
    if (state != null) entry.state = state;
  }

  /**
   * Called every frame to interpolate positions and run animations
   */
  tick(dt, elapsed) {
    for (const [id, entry] of this.players) {
      const isLocal = id === this.localId;
      const lerpFactor = Math.min(1, (isLocal ? 0.42 : 0.15) * 60 * dt);
      const g = entry.bean.group;

      // Interpolate position
      g.position.x += (entry.targetPos.x - g.position.x) * lerpFactor;
      g.position.y += (entry.targetPos.y - g.position.y) * lerpFactor;
      g.position.z += (entry.targetPos.z - g.position.z) * lerpFactor;

      // Interpolate rotation
      let diff = entry.targetRotY - g.rotation.y;
      // Shortest path
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.rotation.y += diff * lerpFactor * 0.7;

      // Animation
      const moving = entry.state === "running" || entry.state === "moving";
      entry.bean.update(elapsed, {
        moving,
        knockback: entry.state === "knockback" ? (entry.knockbackDir || 1) : undefined
      });
    }
  }

  /** Apply knockback to a specific player */
  applyKnockback(id, direction = 1) {
    const entry = this.players.get(id);
    if (!entry) return;
    entry.state = "knockback";
    entry.knockbackDir = direction;
    // Reset to idle after a short delay
    setTimeout(() => {
      if (entry.state === "knockback") entry.state = "idle";
    }, 600);
  }

  getLocalCharacter() {
    return this.localId ? this.players.get(this.localId) : null;
  }

  getLocalPosition() {
    const entry = this.getLocalCharacter();
    if (!entry) return new (T()).Vector3();
    return entry.bean.group.position.clone();
  }

  removeAll() {
    for (const [id] of this.players) {
      this.removePlayer(id);
    }
  }

  dispose() {
    this.removeAll();
  }
}
