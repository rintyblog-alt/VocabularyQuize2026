/**
 * Physics.js — Movement control, collision, knockback
 */
import { LANE_POSITIONS, STAGE_LENGTH } from "../stage/StageBuilder.js";

const MOVE_SPEED = 4.5;
const LANE_SWITCH_SPEED = 8;

export class Physics {
  constructor() {
    this.lane = 1; // 0=left, 1=center, 2=right
    this.targetX = LANE_POSITIONS[1];
    this.posX = LANE_POSITIONS[1];
    this.posZ = 0;
    this.progress = 0;
    this.moving = true;
    this.knockedBack = false;
    this._knockbackTimer = 0;
  }

  /** Move left or right lane */
  switchLane(dir) {
    this.lane = Math.max(0, Math.min(2, this.lane + dir));
    this.targetX = LANE_POSITIONS[this.lane];
  }

  /** Set lane directly */
  setLane(lane) {
    this.lane = Math.max(0, Math.min(2, lane));
    this.targetX = LANE_POSITIONS[this.lane];
  }

  /** Pause forward movement (e.g., during question) */
  pause() { this.moving = false; }
  resume() { this.moving = true; }

  /** Apply knockback */
  knockback(distance = 2) {
    this.posZ += distance;
    this.progress = Math.max(0, this.progress - distance);
    this.knockedBack = true;
    this._knockbackTimer = 0.5;
  }

  /**
   * Tick physics
   * @param {number} dt - delta time in seconds
   * @returns {{ x, y, z, progress, moving, lane }}
   */
  tick(dt) {
    // Lane switching (horizontal)
    const dx = this.targetX - this.posX;
    if (Math.abs(dx) > 0.01) {
      this.posX += Math.sign(dx) * Math.min(Math.abs(dx), LANE_SWITCH_SPEED * dt);
    } else {
      this.posX = this.targetX;
    }

    // Forward movement
    if (this.moving && !this.knockedBack) {
      this.posZ -= MOVE_SPEED * dt;
      this.progress += MOVE_SPEED * dt;
    }

    // Knockback recovery
    if (this.knockedBack) {
      this._knockbackTimer -= dt;
      if (this._knockbackTimer <= 0) {
        this.knockedBack = false;
      }
    }

    return {
      x: this.posX,
      y: 0,
      z: this.posZ,
      progress: this.progress,
      moving: this.moving && !this.knockedBack,
      lane: this.lane
    };
  }

  /** Check if player has reached goal */
  isGoalReached() {
    return this.progress >= STAGE_LENGTH;
  }

  reset() {
    this.lane = 1;
    this.targetX = LANE_POSITIONS[1];
    this.posX = LANE_POSITIONS[1];
    this.posZ = 0;
    this.progress = 0;
    this.moving = true;
    this.knockedBack = false;
    this._knockbackTimer = 0;
  }
}
