/* ══════════════════════════════════════════════════════════════════════════
   やりとりの 形。**サーバと 画面が 同じ この 1 枚を 見る。**

   ここを 直したら 必ず 両方を 直す。片方だけ 直すと
   「繋がるのに 何も 起きない」に なる（いちばん 分かりにくい 壊れ方）。
   ══════════════════════════════════════════════════════════════════════════ */

/* 画面 → サーバ */
export const C2S = {
  PING: "ping",       /* {ts} */
  READY: "ready",     /* {v:bool} */
  COLOR: "color",     /* {v:0..7} */
  COURSE: "course",   /* {id} 部屋主だけ */
  MODE: "mode",       /* {v} 部屋主だけ */
  START: "start",     /* {length} 部屋主だけ */
  INPUT: "in",        /* {seq, s:{x,y,z,yaw,g,st,pr,cp,rs}} */
  GATE: "gate",       /* {g, a} 答えの 番号。正誤は サーバが 決める */
  FINISH: "fin"       /* {} */
};

/* サーバ → 画面 */
export const S2C = {
  WELCOME: "welcome", /* {you, room, questions} */
  ROOM: "room",       /* {room} */
  GO: "go",           /* {startAt, seed, courseId, mode, questions, room} */
  SNAP: "snap",       /* {ts, ps:[{id,x,y,z,yaw,g,st,pr,cp,rank,fin}]} */
  GATE: "gate",       /* {g, c, a} 自分の 答え合わせ */
  PGATE: "pgate",     /* {id, g, c} ほかの人 */
  FIN: "fin",         /* {id, rank, time} */
  END: "end",         /* {results} */
  FIX: "fix",         /* {x,y,z,pr,why} つじつま合わせ（サーバが 正） */
  PONG: "pong",       /* {ts} */
  ERR: "err"          /* {code, msg} */
};

/** 送る 間隔（秒）。要件 20「毎フレーム 不要な 情報を 送信しない」 */
export const SEND_HZ = 20;
export const SEND_INTERVAL = 1 / SEND_HZ;
/** 受け取った ものを 表示するまでの 遅らせ（補間の ため）。 */
export const INTERP_DELAY_MS = 110;
