/**
 * VocabuSurvival v3 — Entry point
 *
 * Exposes window.VocabuSurvivalV3 for integration with VocabuQuiz.
 * Supports 3 modes: "3d" (survival), "2d" (side-scroll), "quiz" (quiz battle)
 */
import { Renderer } from "./renderer/Renderer.js";
import { Renderer3D } from "./renderer/Renderer3D.js";
import { Renderer2D } from "./renderer/Renderer2D.js";
import { CharacterManager } from "./character/CharacterManager.js";
import { GameLoop } from "./core/GameLoop.js";
import { GamePhase } from "./core/GameState.js";
import { StageBuilder } from "./stage/StageBuilder.js";
import { ObstacleManager } from "./stage/ObstacleManager.js";
import { Physics } from "./physics/Physics.js";
import { QuestionManager } from "./question/QuestionManager.js";
import { RoomManager } from "./online/RoomManager.js";
import { PlayerManager } from "./online/PlayerManager.js";
import { LobbyUI } from "./ui/LobbyUI.js";
import { HUD } from "./ui/HUD.js";
import { ResultUI } from "./ui/ResultUI.js";
import { QuizBattle } from "./quiz/QuizBattle.js";
import { BEAN_PALETTE } from "./character/BeanCharacter.js";

let _instance = null;

class VocabuSurvivalApp {
  constructor() {
    this.container = null;
    this.gameLoop = null;
    this.stage = null;
    this.obstacles = null;
    this.physics = null;
    this.questionMgr = null;
    this.roomMgr = null;
    this.playerMgr = null;
    this.lobbyUI = null;
    this.hud = null;
    this.resultUI = null;
    this.quizBattle = null;
    this._inputState = { left: false, right: false };
    this._boundKeyDown = null;
    this._boundKeyUp = null;
    this._boundTouchStart = null;
    this._boundTouchEnd = null;
  }

  /**
   * Initialize with container element
   * @param {HTMLElement} container
   * @param {{ mode?: '3d' | '2d' | 'quiz' }} options
   */
  init(container, options = {}) {
    if (this.gameLoop) this.close();

    this.container = container;
    container.style.position = "relative";
    container.style.overflow = "hidden";
    const mode = options.mode || "3d";

    // Room & player manager (shared by all modes)
    this.roomMgr = new RoomManager();
    this.playerMgr = new PlayerManager();

    // Token getter — uses VocabuQuiz auth if available
    this.roomMgr.setTokenGetter(async () => {
      if (window._authGetToken) return await window._authGetToken();
      if (window.firebase?.auth) {
        const user = window.firebase.auth().currentUser;
        if (user) return await user.getIdToken();
      }
      return null;
    });

    // Quiz mode — no Three.js needed
    if (mode === "quiz") {
      this._initQuizMode();
      return;
    }

    // 3D / 2D mode — Three.js
    this._initGameMode(mode);
  }

  _initQuizMode() {
    // Show lobby first, then switch to QuizBattle on game start
    this.lobbyUI = new LobbyUI(this.container);
    this._bindLobbyEvents("quiz");

    this.quizBattle = new QuizBattle(this.container, { roomManager: this.roomMgr });
    this.roomMgr.on("countdown", () => {
      this.lobbyUI.hide();
      // QuizBattle inits on first question
    });
  }

  _initGameMode(mode) {
    // Renderer
    const renderer = new Renderer(this.container);
    const modeRenderer = mode === "2d" ? new Renderer2D() : new Renderer3D();

    // Characters
    const characters = new CharacterManager(modeRenderer.scene);

    // Stage
    this.stage = new StageBuilder(modeRenderer.scene);
    this.stage.build();

    // Obstacles
    this.obstacles = new ObstacleManager(modeRenderer.scene);
    this.obstacles.generate();

    // Physics
    this.physics = new Physics();

    // Question manager
    this.questionMgr = new QuestionManager();
    this.questionMgr.init(this.container, {
      onPause: () => {
        this.physics.pause();
        if (this.gameLoop) this.gameLoop.pause();
      },
      onResume: (correct, result) => {
        if (this.gameLoop) this.gameLoop.resume();
        if (correct) {
          this.gameLoop.state.score += 10;
          this.hud?.flash("green");
        } else {
          this.gameLoop.state.hp--;
          this.hud?.flash("red");
          this.physics.knockback();
          const local = characters.getLocalCharacter();
          if (local) characters.applyKnockback(local.id, -1);
        }
        this.physics.resume();
        this._updateHUD();

        if (this.gameLoop.state.hp <= 0) {
          this.gameLoop.state.phase = GamePhase.GAMEOVER;
          this._showResult(false);
        }
      },
      onSendAnswer: (payload) => {
        this.roomMgr.sendAnswer(payload);
      }
    });

    // HUD
    this.hud = new HUD(this.container);

    // Game loop
    this.gameLoop = new GameLoop();
    this.gameLoop.state.mode = mode;
    this.gameLoop.setRenderer(renderer);
    this.gameLoop.setModeRenderer(modeRenderer);
    this.gameLoop.setCharacterManager(characters);

    // Local player
    const localId = "local";
    characters.setLocalId(localId);
    characters.addPlayer(localId, 0);
    this.playerMgr.setLocalId(localId);

    // Add game tick
    renderer.onTick((dt, elapsed) => this._gameTick(dt, elapsed));

    // Show lobby first
    this.lobbyUI = new LobbyUI(this.container);
    this._bindLobbyEvents(mode);

    // Input
    this._bindInput();

    this.gameLoop.start();
  }

  _bindLobbyEvents(mode) {
    this.lobbyUI.on("modeSelect", ({ mode: m }) => {
      // Restart with new mode
      this.init(this.container, { mode: m });
    });

    this.lobbyUI.on("createRoom", async (opts) => {
      try {
        const { roomId } = await this.roomMgr.createRoom({
          password: opts.password,
          questionCount: opts.questionCount,
          mode
        });
        this.lobbyUI.showWaiting(roomId, true);
      } catch (e) {
        this.lobbyUI.showError(e.message || "ルーム作成に失敗しました");
      }
    });

    this.lobbyUI.on("joinRoom", async (opts) => {
      try {
        await this.roomMgr.joinRoom(opts);
        this.lobbyUI.showWaiting(opts.roomId, false);
      } catch (e) {
        this.lobbyUI.showError(e.message || "参加に失敗しました");
      }
    });

    this.lobbyUI.on("ready", () => this.roomMgr.setReady(true));
    this.lobbyUI.on("startGame", () => this.roomMgr.startGame());

    // Server events
    this.roomMgr.on("snapshot", (data) => {
      const players = data.players || [];
      this.lobbyUI.updatePlayerList(Array.isArray(players) ? players : Object.values(players));
      this.playerMgr.syncAll(data);
    });

    this.roomMgr.on("countdown", (data) => {
      const startAt = data.startAtMs || Date.now();
      let count = 3;
      const tick = () => {
        this.lobbyUI.showCountdown(count);
        if (count <= 0) {
          setTimeout(() => {
            this.lobbyUI.hide();
            this._startGame();
          }, 600);
          return;
        }
        count--;
        setTimeout(tick, 1000);
      };
      tick();
    });

    this.roomMgr.on("question", (data) => {
      if (this.questionMgr) this.questionMgr.showQuestion(data);
    });

    this.roomMgr.on("result", (data) => {
      if (this.questionMgr) this.questionMgr.handleResult(data);
    });

    this.roomMgr.on("final", () => {
      this._showResult(this.physics?.isGoalReached() || false);
    });

    this.roomMgr.on("playerUpdate", (data) => {
      this.playerMgr.updatePlayer(data.id || data.playerId, data);
      // Sync to character manager
      const chars = this.gameLoop?.characters;
      if (chars) {
        const id = String(data.id || data.playerId || "");
        if (id && !chars.players.has(id)) {
          chars.addPlayer(id, chars.players.size);
        }
        chars.updatePlayer(id, data);
      }
    });

    this.roomMgr.on("error", (data) => {
      this.lobbyUI.showError(data.message || "エラーが発生しました");
    });
  }

  _startGame() {
    if (this.gameLoop) {
      this.gameLoop.state.phase = GamePhase.RUNNING;
      this.gameLoop.resume();
    }
    this.hud?.show();
    this.hud?.updateHP(3);
    this.hud?.updateScore(0);
    this.hud?.updateProgress(0);

    // Start position sync
    this.roomMgr.sync?.startPositionSync(() => {
      if (!this.physics) return null;
      return {
        x: this.physics.posX,
        z: this.physics.posZ,
        lane: this.physics.lane,
        progress: this.physics.progress,
        state: this.physics.moving ? "running" : "idle"
      };
    });

    // Init quiz mode if applicable
    if (this.quizBattle) {
      this.quizBattle.init(this.playerMgr.localId || "local");
    }
  }

  _gameTick(dt, elapsed) {
    if (!this.physics || !this.gameLoop || this.gameLoop.state.phase !== GamePhase.RUNNING) return;
    if (this.questionMgr?.isPaused()) return;

    // Input → physics
    if (this._inputState.left) { this.physics.switchLane(-1); this._inputState.left = false; }
    if (this._inputState.right) { this.physics.switchLane(1); this._inputState.right = false; }

    // Physics tick
    const pos = this.physics.tick(dt);

    // Update local character
    const chars = this.gameLoop.characters;
    if (chars) {
      chars.updatePlayer("local", {
        x: pos.x, y: pos.y, z: pos.z,
        state: pos.moving ? "running" : "idle"
      });
    }

    // Obstacle collision
    if (this.obstacles) {
      this.obstacles.tick(elapsed);
      const hit = this.obstacles.checkCollision({ x: pos.x, z: pos.z });
      if (hit) {
        this.obstacles.deactivate(hit);
        // Trigger question from server or locally
        if (this.roomMgr.sync?.isConnected()) {
          // Server will send game:question
        } else {
          // Offline — mock question
          this.questionMgr?.showQuestion({
            text: "テスト問題", choices: ["A", "B", "C", "D"],
            round: 1, totalRounds: 1
          });
        }
      }
    }

    // Stage scroll
    if (this.stage && pos.moving) {
      this.stage.scrollTiles(dt * 4.5);
    }

    // Progress & goal check
    this.gameLoop.state.progress = pos.progress;
    this._updateHUD();

    if (this.physics.isGoalReached()) {
      this.gameLoop.state.phase = GamePhase.RESULT;
      this._showResult(true);
    }
  }

  _updateHUD() {
    if (!this.hud || !this.gameLoop) return;
    this.hud.updateScore(this.gameLoop.state.score);
    this.hud.updateHP(this.gameLoop.state.hp);
    this.hud.updateProgress(this.gameLoop.state.progress);

    const ranking = this.playerMgr.getRanking().map(p => ({
      nick: p.nick,
      score: p.score,
      isMe: p.id === this.playerMgr.localId
    }));
    if (ranking.length > 0) this.hud.updateRanking(ranking);
  }

  _showResult(cleared) {
    this.hud?.hide();
    this.physics?.pause();
    this.roomMgr.sync?.stopPositionSync();

    this.resultUI = new ResultUI(this.container);
    const ranking = this.playerMgr.getRanking().map(p => ({
      nick: p.nick, score: p.score,
      correct: 0, total: 0, isMe: p.id === this.playerMgr.localId
    }));
    const myRank = ranking.findIndex(p => p.isMe) + 1 || 1;

    this.resultUI.show({ ranking, myRank, cleared });
    this.resultUI.on("rematch", () => {
      this.resultUI.dispose();
      this.resultUI = null;
      this.roomMgr.sync?.send({ type: "rematch" });
      this._resetGame();
    });
    this.resultUI.on("lobby", () => {
      this.close();
    });
  }

  _resetGame() {
    this.physics?.reset();
    this.obstacles?.reactivateAll();
    this.gameLoop.state.score = 0;
    this.gameLoop.state.hp = 3;
    this.gameLoop.state.progress = 0;
    this.gameLoop.state.phase = GamePhase.RUNNING;
    this.gameLoop.resume();
    this.hud?.show();
    this._updateHUD();
  }

  _bindInput() {
    this._boundKeyDown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") this._inputState.left = true;
      if (e.key === "ArrowRight" || e.key === "d") this._inputState.right = true;
    };
    this._boundKeyUp = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") this._inputState.left = false;
      if (e.key === "ArrowRight" || e.key === "d") this._inputState.right = false;
    };
    window.addEventListener("keydown", this._boundKeyDown);
    window.addEventListener("keyup", this._boundKeyUp);

    // Touch
    let touchStartX = 0;
    this._boundTouchStart = (e) => {
      touchStartX = e.touches[0]?.clientX || 0;
    };
    this._boundTouchEnd = (e) => {
      const endX = e.changedTouches[0]?.clientX || 0;
      const diff = endX - touchStartX;
      if (Math.abs(diff) > 30) {
        if (diff < 0) this._inputState.left = true;
        else this._inputState.right = true;
      }
    };
    this.container.addEventListener("touchstart", this._boundTouchStart, { passive: true });
    this.container.addEventListener("touchend", this._boundTouchEnd, { passive: true });
  }

  _unbindInput() {
    if (this._boundKeyDown) window.removeEventListener("keydown", this._boundKeyDown);
    if (this._boundKeyUp) window.removeEventListener("keyup", this._boundKeyUp);
    if (this._boundTouchStart) this.container?.removeEventListener("touchstart", this._boundTouchStart);
    if (this._boundTouchEnd) this.container?.removeEventListener("touchend", this._boundTouchEnd);
  }

  open(options = {}) {
    if (!this.container) return;
    this.init(this.container, options);
  }

  close() {
    this._unbindInput();
    this.gameLoop?.dispose();
    this.stage?.dispose();
    this.obstacles?.dispose();
    this.questionMgr?.dispose();
    this.roomMgr?.dispose();
    this.lobbyUI?.dispose();
    this.hud?.dispose();
    this.resultUI?.dispose();
    this.quizBattle?.dispose();
    this.gameLoop = null;
    this.stage = null;
    this.obstacles = null;
    this.physics = null;
    this.questionMgr = null;
    this.roomMgr = null;
    this.playerMgr = null;
    this.lobbyUI = null;
    this.hud = null;
    this.resultUI = null;
    this.quizBattle = null;
  }

  getState() {
    if (!this.gameLoop) return null;
    return {
      phase: this.gameLoop.state.phase,
      mode: this.gameLoop.state.mode,
      score: this.gameLoop.state.score,
      hp: this.gameLoop.state.hp,
      progress: this.gameLoop.state.progress
    };
  }

  getCharacters() {
    return this.gameLoop?.characters || null;
  }
}

function getInstance() {
  if (!_instance) _instance = new VocabuSurvivalApp();
  return _instance;
}

window.VocabuSurvivalV3 = {
  init(container, options) { return getInstance().init(container, options); },
  open(options) { return getInstance().open(options); },
  close() { return getInstance().close(); },
  getState() { return getInstance().getState(); },
  getCharacters() { return getInstance().getCharacters(); }
};

export default getInstance;
