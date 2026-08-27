/* ══════════════════════════════════════════════════════════════════════
   Undo / Redo（§7）
   ・対象：テキスト編集・選択肢・正解・問題追加/削除・並び替え・AI変更適用・配点・出典。
   ・文字入力は「打つたびに 1 段」だと使いものにならないので、同じ対象への
     連続した編集は時間で 1 つにまとめる（coalesce）。
   ・状態はスナップショットで持つ。件数が多いプリセットでも扱えるよう上限を設ける。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  var DEFAULT_LIMIT = 60;
  var COALESCE_MS = 700;

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  function History(initial, opts) {
    opts = opts || {};
    this.limit = opts.limit || DEFAULT_LIMIT;
    this.coalesceMs = opts.coalesceMs != null ? opts.coalesceMs : COALESCE_MS;
    this.stack = [{ state: clone(initial), label: "初期状態", key: null, at: Date.now() }];
    this.index = 0;
    this.onChange = opts.onChange || null;
  }

  History.prototype.current = function () { return this.stack[this.index].state; };
  History.prototype.canUndo = function () { return this.index > 0; };
  History.prototype.canRedo = function () { return this.index < this.stack.length - 1; };

  /* 変更を記録する。
     key を渡すと、同じ key への短時間の連続変更を 1 段にまとめる。
     （例: key="prompt:q3" で問題文への連続入力をまとめる） */
  History.prototype.push = function (state, label, key) {
    var now = Date.now();
    var top = this.stack[this.index];

    /* 直前と同じ内容なら積まない（無意味な Undo 段を作らない） */
    var next = clone(state);
    if (JSON.stringify(top.state) === JSON.stringify(next)) return false;

    if (key && top.key === key && (now - top.at) < this.coalesceMs && this.index === this.stack.length - 1) {
      top.state = next; top.at = now; top.label = label || top.label;
      this._emit();
      return true;
    }

    /* Redo 側を捨ててから積む */
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push({ state: next, label: label || "変更", key: key || null, at: now });
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    this._emit();
    return true;
  };

  History.prototype.undo = function () {
    if (!this.canUndo()) return null;
    this.index--;
    this._emit();
    return clone(this.stack[this.index].state);
  };
  History.prototype.redo = function () {
    if (!this.canRedo()) return null;
    this.index++;
    this._emit();
    return clone(this.stack[this.index].state);
  };

  /* 次に Undo / Redo すると何が戻るか（ボタンの説明に使う） */
  History.prototype.undoLabel = function () { return this.canUndo() ? this.stack[this.index].label : null; };
  History.prototype.redoLabel = function () { return this.canRedo() ? this.stack[this.index + 1].label : null; };

  History.prototype.reset = function (state, label) {
    this.stack = [{ state: clone(state), label: label || "読み込み", key: null, at: Date.now() }];
    this.index = 0;
    this._emit();
  };
  History.prototype.size = function () { return this.stack.length; };
  History.prototype._emit = function () {
    if (this.onChange) { try { this.onChange(this); } catch (e) {} }
  };

  VQ2.History = History;
})(typeof globalThis !== "undefined" ? globalThis : this);
