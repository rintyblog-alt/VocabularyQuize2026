/* ══════════════════════════════════════════════════════════════════════════
   クイズの 門。VocabuSurvive の 一番の 特徴。

   考え方（要件のまま）:
     「クイズは ゲームを 止める ためでは なく、ゲームそのもの」

   だから:
     ・門の 前で **走りながら** 出る。カウントダウンは 止めない。
     ・正解 … その場で 幕が 開き、少しの 間 速くなる（ごほうび）
     ・不正解 … 幕は 開くが 少し 遅くなる（罰）。**閉じ込めない。**
       閉じ込めると 実力差が そのまま 待ち時間に なって つまらない。
     ・時間切れ … 不正解 と 同じ。走りながら 考えられる 猶予を 置く。

   幕が 固いのは **その 端末の 自分にだけ**。
   ほかの 人の 通り抜けは 見た目だけ（各自が 自分の 分を 判定する）。
   ══════════════════════════════════════════════════════════════════════════ */
import { Obstacle } from "./obstacle.js";
import { Solid, SOLID } from "./physics.js";
import { M } from "./meshes.js";
import { m4, clamp, smoothstep, TAU } from "../engine/math.js";

export const GATE_STATE = {
  IDLE: 0,       /* まだ 近づいていない */
  ASKING: 1,     /* 問題が 出ている */
  CORRECT: 2,
  WRONG: 3,
  TIMEOUT: 4
};

export class QuizGate extends Obstacle {
  constructor(course, o) {
    super(course, o);
    this.kind = "quizgate";
    this.index = o.index || 0;
    this.w = o.w || 7;
    this.h = o.h || 4.6;
    this.triggerZ = o.triggerZ === undefined ? 16 : o.triggerZ;  /* 何 m 手前で 出すか */
    this.limit = o.limit === undefined ? 12 : o.limit;           /* 考える 秒 */
    this.moving = true;

    this.state = GATE_STATE.IDLE;
    this.open = 0;          /* 0 閉 → 1 開 */
    this.answeredAt = 0;
    this.question = null;

    /* 幕（自分にだけ 固い） */
    this.curtain = this._solid({
      type: SOLID.BOX, x: this.x, y: this.y + this.h / 2, z: this.z,
      hx: this.w / 2, hy: this.h / 2, hz: 0.45, tag: "gate"
    });
    /* 出題の きっかけ（当たらない） */
    this.trigger = this._solid({
      type: SOLID.BOX, x: this.x, y: this.y + 2.5, z: this.z + this.triggerZ / 2,
      hx: this.w / 2 + 3, hy: 3.5, hz: this.triggerZ / 2, solid: false, tag: "gatetrigger"
    });
    this.t = 0;
  }

  /** 問題を 出した */
  ask(question) {
    this.question = question;
    this.state = GATE_STATE.ASKING;
    this.askedAt = this.t;
  }
  /** 答えが 出た */
  resolve(kind) {
    this.state = kind;
    this.answeredAt = this.t;
  }
  get isOpenForMe() { return this.state === GATE_STATE.CORRECT || this.state === GATE_STATE.WRONG || this.state === GATE_STATE.TIMEOUT; }

  update(t) {
    this.t = t;
    const want = this.isOpenForMe ? 1 : 0;
    /* 幕は 0.35 秒で 上がる */
    const k = 1 - Math.exp(-9 * (1 / 60));
    this.open += (want - this.open) * k;
    if (this.open > 0.995) this.open = 1;
    this.curtain.enabled = this.open < 0.72;
    this.curtain.y = this.y + this.h / 2 + this.open * (this.h + 0.4);
    this.glow = 0.5 + 0.5 * Math.sin(t * 2.2 + this.index);
  }

  draw(R) {
    const P = this.course.palette;
    /* 枠 */
    m4.compose(_m2, this.x, this.y + this.h / 2 + 0.2, this.z, 0, this.w + 1.4, this.h + 1.6, 0.9);
    R.draw(M.frame, _m2, P.gateFrame, 0.06, 0.3, 0, 0, this.w);

    /* 上の 看板 */
    const sign = this.state === GATE_STATE.CORRECT ? P.spring
      : (this.state === GATE_STATE.WRONG || this.state === GATE_STATE.TIMEOUT) ? P.danger
      : (this.state === GATE_STATE.ASKING ? P.gold : P.gateFrame);
    this._part(R, M.box, this.x, this.y + this.h + 1.15, this.z, 0, this.w + 2.0, 0.9, 0.7,
      sign, 0.25 + this.glow * 0.25, 0.4);
    /* 「？」の 印（丸 3 つで 作る。文字は 3D では 出さない） */
    if (!this.isOpenForMe) {
      const b = 0.34 + Math.sin(this.t * 3.4 + this.index) * 0.06;
      this._part(R, M.ball, this.x, this.y + this.h + 1.15, this.z + 0.5, 0, b, b, b, [1, 1, 1, 1], 0.7, 0.2);
    }

    /* 幕 */
    if (this.open < 0.995) {
      const a = 0.86 * (1 - this.open * 0.5);
      this._part(R, M.box, this.curtain.x, this.curtain.y, this.curtain.z, 0,
        this.w, this.h, 0.55,
        [P.gateCurtain[0], P.gateCurtain[1], P.gateCurtain[2], a],
        0.14 + this.glow * 0.10, 0.34, 7);
    }

    /* 手前の 目印。どこで 出るか 分かる ように 床へ 線を 引く。 */
    const tz = this.z + this.triggerZ;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.0);
    this._part(R, M.slab, this.x, this.y + 0.06, tz, 0, this.w + 2, 0.1, 0.5,
      this.state === GATE_STATE.ASKING ? P.gold : P.gateFrame, 0.3 + pulse * 0.3, 0.3);
  }
}

const _m2 = m4.create();
