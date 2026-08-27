/**
 * GameLoop.js — Main game loop & state machine
 */
import { GameState, GamePhase } from "./GameState.js";

export class GameLoop {
  constructor() {
    this.state = new GameState();
    /** @type {import('../renderer/Renderer.js').Renderer | null} */
    this.renderer = null;
    /** @type {import('../renderer/Renderer3D.js').Renderer3D | import('../renderer/Renderer2D.js').Renderer2D | null} */
    this.modeRenderer = null;
    /** @type {import('../character/CharacterManager.js').CharacterManager | null} */
    this.characters = null;
    this._paused = false;
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  setModeRenderer(modeRenderer) {
    this.modeRenderer = modeRenderer;
    if (this.renderer) {
      this.renderer.setSceneAndCamera(modeRenderer.scene, modeRenderer.camera);
    }
  }

  setCharacterManager(characters) {
    this.characters = characters;
  }

  start() {
    if (!this.renderer) return;
    this.renderer.onTick((dt, elapsed) => this._tick(dt, elapsed));
    this.renderer.start();
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; }

  _tick(dt, elapsed) {
    if (this._paused) return;

    // Update characters
    if (this.characters) {
      this.characters.tick(dt, elapsed);
    }

    // Camera follow
    if (this.modeRenderer && this.characters) {
      const pos = this.characters.getLocalPosition();
      this.modeRenderer.followTarget(pos, dt);
    }
  }

  dispose() {
    if (this.renderer) this.renderer.stop();
    if (this.characters) this.characters.dispose();
    if (this.modeRenderer) this.modeRenderer.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}
