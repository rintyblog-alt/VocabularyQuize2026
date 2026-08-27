
/* ═══════════════════════════════════════════════════════════════
   Quick Sede — Inline code-generation chat with 2-pane editor
   ═══════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  /* ── Elements ── */
  var wrap = document.getElementById("sedeChatWrap");
  var welcomeArea = document.getElementById("sedeWelcomeArea");
  var scrollArea = document.getElementById("sedeChatScrollInline");
  var chatList = document.getElementById("sedeChatListInline");
  var inputEl = document.getElementById("sedeInputInline");
  var sendBtn = document.getElementById("sedeSendInline");
  var composerEl = document.getElementById("sedeComposerInline");
  /* New 2-pane elements */
  var editorArea = document.getElementById("sedeEditorArea");
  var codeView = document.getElementById("sedeCodeView");
  var editorEmpty = document.getElementById("sedeEditorEmpty");
  var fileTabs = document.getElementById("sedeFileTabs");
  var editorLang = document.getElementById("sedeEditorLang");
  var terminalBody = document.getElementById("sedeTerminalBody");
  var editorToolbar = document.getElementById("sedeEditorToolbar");
  var voiceBtn = document.getElementById("sedeVoiceBtn");

  /* ── Progress message rotation for auto-continue ── */
  /* Progress messages — use Material Symbols (.ms) icons to match VocabuQuiz design */
  var SEDE_PROGRESS_MSGS = [
    '<span class="ms" style="font-size:14px;vertical-align:-2px;">search</span> コードを解析中...',
    '<span class="ms" style="font-size:14px;vertical-align:-2px;">settings</span> ロジックを構築中...',
    '<span class="ms" style="font-size:14px;vertical-align:-2px;">extension</span> モジュールを組み立て中...',
    '<span class="ms" style="font-size:14px;vertical-align:-2px;">tune</span> 最適化しています...',
    '<span class="ms" style="font-size:14px;vertical-align:-2px;">inventory_2</span> 依存関係を確認中...',
    '<span class="ms" style="font-size:14px;vertical-align:-2px;">rocket_launch</span> もうすぐ完成です...',
    '<span class="ms" style="font-size:14px;vertical-align:-2px;">auto_fix_high</span> 仕上げをしています...'
  ];
  function _sedeProgressAnimate(el) {
    if (!el) return;
    var msgEl = el.querySelector(".sede-progress-msg");
    if (!msgEl) return;
    var idx = 0;
    msgEl.innerHTML = SEDE_PROGRESS_MSGS[0];
    var timer = setInterval(function(){
      if (!document.contains(el) || el.classList.contains("is-complete")) { clearInterval(timer); return; }
      idx = (idx + 1) % SEDE_PROGRESS_MSGS.length;
      msgEl.style.opacity = "0";
      setTimeout(function(){
        msgEl.innerHTML = SEDE_PROGRESS_MSGS[idx];
        msgEl.style.opacity = "1";
      }, 300);
    }, 3000);
  }

  /* ── State ── */
  var _sede = {
    processing: false,
    abortCtrl: null,
    codeHistory: [],       /* Array of { lang, filename, code } for diff */
    twoPaneOpen: false,
    mobileCodeModal: null,
    /* Selected Sede model tier */
    selectedModel: (function(){ try { return localStorage.getItem("sede.selectedModel") || "sprout-3"; } catch(e){ return "sprout-3"; } })(),
    /* Voice co-create */
    voiceActive: false,
    voiceRecognition: null,
    voiceSilenceTimer: null,
    voiceTranscript: "",
    voiceInterim: ""
  };
  /* 外部からリセット可能にする */
  window._sede = _sede;

  /* ── Sede 3モデル定義 ── */
  var _sedeModelDefs = [
    {
      id: "sprout-3",
      name: "Sede Sprout 3.0",
      badge: "Free / Free+",
      desc: "高速・気軽に試せる標準モデル",
      engine: "DeepSeek V3.2",
      icon: "eco",
      bg: "#dcfce7", fg: "#16a34a",
      locked: false
    },
    {
      id: "oak-5",
      name: "Sede Oak 5.0",
      badge: "EDU PRE / PRE",
      desc: "信頼と実用のバランス型",
      engine: "Sonnet 4.6 + Haiku 4.5",
      icon: "park",
      bg: "#fef3c7", fg: "#ca8a04",
      locked: true,
      lockedTip: "EDU PRE / PRE プランで利用可能"
    },
    {
      id: "canopy-5",
      name: "Sede Canopy 5.0",
      badge: "Ultra",
      desc: "最上位・設計と自律の極致",
      engine: "Opus 4.7 + Sonnet 4.6",
      icon: "forest",
      bg: "#d1fae5", fg: "#047857",
      locked: true,
      lockedTip: "Ultra プランで利用可能"
    }
  ];

  function _sedeRenderModelMenu(){
    var menu = document.getElementById("sedeModelMenu");
    if (!menu) return;
    var current = _sede.selectedModel || "sprout-3";
    var html = '<div style="padding:10px 14px 6px;font-size:12px;font-weight:600;color:#8c8c8c;letter-spacing:0.3px;">SEDE MODEL</div>';
    _sedeModelDefs.forEach(function(m){
      var active = m.id === current;
      html += '<div class="sede-model-item' + (active ? " is-active" : "") + (m.locked ? " is-locked" : "") + '"'
        + ' role="option" data-sede-model="' + m.id + '"'
        + ' style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;cursor:' + (m.locked ? "not-allowed" : "pointer") + ';' + (active ? "background:#f5f3ff;" : "") + (m.locked ? "opacity:0.55;" : "") + '">'
        + '<div style="width:32px;height:32px;border-radius:8px;background:' + m.bg + ';color:' + m.fg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="ms" style="font-size:18px;">' + m.icon + '</span></div>'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:13px;font-weight:600;color:#1f2937;display:flex;align-items:center;gap:6px;">' + m.name
        + '<span style="font-size:9px;font-weight:500;padding:1px 6px;border-radius:4px;background:#f3f4f6;color:#6b7280;">' + m.badge + '</span></div>'
        + '<div style="font-size:11px;color:#6b7280;margin-top:2px;">' + m.desc + '</div>'
        + '<div style="font-size:10px;color:#9ca3af;margin-top:2px;">Engine: ' + m.engine + '</div>'
        + '</div>'
        + (active ? '<span class="ms" style="color:#6366f1;font-size:18px;flex-shrink:0;">check_circle</span>' : '')
        + (m.locked ? '<span class="ms" style="color:#9ca3af;font-size:16px;flex-shrink:0;">lock</span>' : '')
        + '</div>';
    });
    menu.innerHTML = html;
  }

  function _sedeUpdateModelLabel(){
    var def = _sedeModelDefs.find(function(m){ return m.id === _sede.selectedModel; }) || _sedeModelDefs[0];
    var lbl = document.getElementById("sedeModelLabel");
    if (lbl) lbl.textContent = def.name;
  }

  function _sedeSelectModel(id){
    var def = _sedeModelDefs.find(function(m){ return m.id === id; });
    if (!def || def.locked){
      if (def && def.lockedTip){
        try { alert(def.lockedTip); } catch(e){}
      }
      return;
    }
    _sede.selectedModel = id;
    try { localStorage.setItem("sede.selectedModel", id); } catch(e){}
    _sedeUpdateModelLabel();
    _sedeRenderModelMenu();
    var menu = document.getElementById("sedeModelMenu");
    if (menu) menu.classList.add("hidden");
    var trigger = document.getElementById("sedeModelTrigger");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }

  function _sedeToggleModelMenu(e){
    if (e) { e.stopPropagation(); e.preventDefault(); }
    var menu = document.getElementById("sedeModelMenu");
    var trigger = document.getElementById("sedeModelTrigger");
    if (!menu || !trigger) return;
    var isOpen = !menu.classList.contains("hidden");
    if (isOpen){
      menu.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
    } else {
      _sedeRenderModelMenu();
      menu.classList.remove("hidden");
      trigger.setAttribute("aria-expanded", "true");
    }
  }

  /* 初期化: 起動時にトリガーにハンドラ + ラベル更新 */
  (function _sedeInitModelPicker(){
    var trigger = document.getElementById("sedeModelTrigger");
    var menu = document.getElementById("sedeModelMenu");
    if (!trigger || !menu) return;
    trigger.addEventListener("click", _sedeToggleModelMenu);
    menu.addEventListener("click", function(e){
      var item = e.target.closest("[data-sede-model]");
      if (!item) return;
      e.stopPropagation();
      _sedeSelectModel(item.getAttribute("data-sede-model"));
    });
    document.addEventListener("click", function(e){
      if (menu.classList.contains("hidden")) return;
      if (!menu.contains(e.target) && !trigger.contains(e.target)){
        menu.classList.add("hidden");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    _sedeUpdateModelLabel();
  })();

  /* ── Welcome greetings (time-based) ── */
  var GREETINGS = [
    { start:5, end:12, texts:["// おはよう。今日も良いコードを書こう","// Good morning. Let's ship something great.","// 朝イチのコーディング、最高の時間帯だ"] },
    { start:12, end:17, texts:["// 午後もコード書いていこう","// Afternoon coding session. Let's go.","// いいペースだ。続けよう"] },
    { start:17, end:22, texts:["// 夜のコーディングタイム","// Late night hacking session","// 静かな時間、集中して書こう"] },
    { start:22, end:5, texts:["// 深夜のコーディング...無理するなよ","// Burning the midnight oil","// こんな時間まで...さすがだな"] }
  ];
  function getGreeting(){
    var h = new Date().getHours();
    for (var i = 0; i < GREETINGS.length; i++){
      var g = GREETINGS[i];
      if (g.start < g.end ? (h >= g.start && h < g.end) : (h >= g.start || h < g.end)){
        return g.texts[Math.floor(Math.random() * g.texts.length)];
      }
    }
    return "// コードを書こう";
  }

  /* ── Set welcome greeting ── */
  function initWelcome(){
    var el = document.getElementById("sedeWelcomeGreeting");
    if (el) el.textContent = getGreeting();
  }

  /* ── Show/hide welcome vs chat ── */
  function updateView(){
    var ses = _sedeGetActiveSession();
    var hasMessages = ses && ses.messages && ses.messages.length > 0;
    /* Project mode: empty project welcome */
    var isProjectMode = !!window._sedeActiveProjectId;
    var hasProjectFiles = _sede.codeHistory.length > 0;
    if (welcomeArea) {
      if (hasMessages) {
        welcomeArea.style.display = "none";
      } else if (isProjectMode && !hasProjectFiles) {
        welcomeArea.style.display = "";
        welcomeArea.innerHTML = '<div class="sede-welcome-icon"><span class="ms" aria-hidden="true">folder_open</span></div>'
          + '<div class="sede-welcome-greeting">📁 ファイルがありません</div>'
          + '<div class="sede-welcome-sub">何を作りますか？AIに話しかけてください。</div>'
          + '<div class="sede-welcome-chips">'
          + '<div class="sede-welcome-chip" data-sede-prompt="Reactのボタンコンポーネントを作って">React Component</div>'
          + '<div class="sede-welcome-chip" data-sede-prompt="Pythonでスクレイパーを作って">Python Scraper</div>'
          + '<div class="sede-welcome-chip" data-sede-prompt="シンプルなTodoアプリを作って">Todo App</div>'
          + '</div>';
      } else {
        welcomeArea.style.display = "";
        /* Re-render template grid when welcome is shown */
        if(!welcomeArea.querySelector(".sede-template-grid")){
          welcomeArea.innerHTML = '<div class="sede-welcome-icon"><span class="ms" aria-hidden="true">terminal</span></div>'
            + '<div class="sede-welcome-greeting" id="sedeWelcomeGreeting">// 何を作る？</div>'
            + '<div class="sede-welcome-sub">テンプレートから始めるか、自由に入力</div>'
            + '<div class="sede-template-grid" id="sedeTemplateGrid"></div>';
        }
        try{ if(typeof _sedeRenderTemplateGrid === "function") _sedeRenderTemplateGrid(); }catch(e){}
      }
    }
    if (scrollArea) scrollArea.style.display = hasMessages ? "" : "none";
    /* Center composer when welcome is shown, bottom when chatting */
    if (composerEl){
      composerEl.classList.toggle("is-centered", !hasMessages);
    }
    /* Focus input when switching to sede */
    if (inputEl) setTimeout(function(){ inputEl.focus(); }, 100);
  }

  /* ── Session helpers — FIX: access _sedeState via window since it's in a different scope ── */
  function _sedeGetActiveSession(){
    var st = window._sedeState;
    if (!st) return null;
    return (st.sessions || []).find(function(s){ return s.id === st.activeId; }) || null;
  }

  /* ── Render chat messages ── */
  var _sedeIsRestoring = false;
  function renderSedeChat(){
    if (!chatList) return;
    chatList.innerHTML = "";
    var ses = _sedeGetActiveSession();
    if (!ses || !ses.messages || !ses.messages.length){
      updateView();
      return;
    }
    /* currentCodeがある場合、メッセージ復元中のコード抽出を抑制 */
    var hasCurrentCode = ses.currentCode && ses.currentCode.code;
    if (hasCurrentCode) _sedeIsRestoring = true;
    ses.messages.forEach(function(m){
      appendMsgDom(m.role, m.text, false);
    });
    _sedeIsRestoring = false;
    /* 保存されたコード状態を復元 */
    if (hasCurrentCode) {
      _sedeUpdateEditor(ses.currentCode);
    }
    updateView();
    scrollToBottom();
  }

  /* ── Append message to DOM (+ code detection) ── */
  function appendMsgDom(role, text, animate){
    if (!chatList) return;
    /* ── [FIX_LOG] → 折りたたみログとして表示 ── */
    if (role === "ai" && typeof text === "string" && text.indexOf("[FIX_LOG]") === 0) {
      try {
        var fld = JSON.parse(text.slice(9));
        var det = document.createElement("details");
        det.className = "sede-fix-log-group";
        var resHtml = fld.result === "applied"
          ? '<span style="color:#22c55e"><span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 適用済み</span>'
          : '<span style="color:#ef4444"><span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 拒否</span>';
        var smr = document.createElement("summary");
        smr.innerHTML = '<span class="ms" style="font-size:13px;vertical-align:-2px">build</span> '
          + '差分修正 <code>' + escHtml(fld.file || "") + '</code> '
          + '<span style="color:#22c55e">+' + (fld.add || 0) + '</span>'
          + '<span style="color:#ef4444">/-' + (fld.del || 0) + '</span> '
          + resHtml;
        det.appendChild(smr);
        var bd = document.createElement("div");
        bd.className = "sede-fix-log-body";
        var _iconMap = {"📖":"description","🔍":"search","✏️":"edit","✅":"check_circle","⚠️":"warning","🔧":"build","🔄":"sync","📄":"note_add","❌":"cancel","💬":"chat","▶":"play_arrow"};
        (fld.logs || []).forEach(function(lg){
          var it = document.createElement("div");
          it.className = "sede-oplog-item";
          /* 先頭の絵文字をMaterial Symbolsアイコンに変換 */
          var _lgText = String(lg);
          var _msIcon = "";
          for (var _ek in _iconMap) {
            if (_lgText.indexOf(_ek) === 0) {
              _msIcon = _iconMap[_ek];
              _lgText = _lgText.slice(_ek.length).replace(/^\s+/, "");
              break;
            }
          }
          var _iconHtml = _msIcon
            ? '<span class="ms" style="font-size:13px;vertical-align:-2px">' + _msIcon + '</span> '
            : '';
          it.innerHTML = '<div class="sede-oplog-dot is-done"></div><div class="sede-oplog-text">' + _iconHtml + escHtml(_lgText) + '</div>';
          bd.appendChild(it);
        });
        /* diffプレビューを復元 */
        if (fld.diff && typeof _sedeRenderDiffInChat === "function") {
          try {
            var _tmpContainer = document.createElement("div");
            var _diffLines = String(fld.diff).split("\n");
            var _dHdr = document.createElement("div");
            _dHdr.className = "sede-diff-inline-header";
            _dHdr.innerHTML = '<span class="ms" style="font-size:13px">description</span> <span class="sede-diff-fname">' + escHtml(fld.file || "file") + '</span>';
            var _dBody = document.createElement("div");
            _dBody.className = "sede-diff-inline-body";
            var _dLineNum = 0;
            for (var _di = 0; _di < _diffLines.length; _di++){
              var _dl = _diffLines[_di];
              if (_dl.startsWith("---") || _dl.startsWith("+++")) continue;
              var _row = document.createElement("div");
              _row.className = "sede-diff-inline-line";
              if (_dl.startsWith("@@")){
                _row.classList.add("is-hunk");
                var _hm = _dl.match(/\+(\d+)/);
                if (_hm) _dLineNum = parseInt(_hm[1], 10) - 1;
                _row.innerHTML = '<div class="sede-diff-inline-num"></div><div class="sede-diff-inline-marker"></div><div class="sede-diff-inline-code">' + escHtml(_dl) + '</div>';
              } else if (_dl.startsWith("+")){
                _dLineNum++;
                _row.classList.add("is-add");
                _row.innerHTML = '<div class="sede-diff-inline-num">' + _dLineNum + '</div><div class="sede-diff-inline-marker">+</div><div class="sede-diff-inline-code">' + escHtml(_dl.slice(1)) + '</div>';
              } else if (_dl.startsWith("-")){
                _row.classList.add("is-del");
                _row.innerHTML = '<div class="sede-diff-inline-num"></div><div class="sede-diff-inline-marker">−</div><div class="sede-diff-inline-code">' + escHtml(_dl.slice(1)) + '</div>';
              } else {
                _dLineNum++;
                _row.innerHTML = '<div class="sede-diff-inline-num" style="opacity:.4">' + _dLineNum + '</div><div class="sede-diff-inline-marker"> </div><div class="sede-diff-inline-code">' + escHtml(_dl.startsWith(" ") ? _dl.slice(1) : _dl) + '</div>';
              }
              _dBody.appendChild(_row);
            }
            var _dWrap = document.createElement("div");
            _dWrap.className = "sede-diff-inline";
            _dWrap.appendChild(_dHdr);
            _dWrap.appendChild(_dBody);
            bd.appendChild(_dWrap);
          } catch(_de){}
        }
        det.appendChild(bd);
        chatList.appendChild(det);
        return;
      } catch(e){}
    }
    var msg = document.createElement("div");
    msg.className = "sede-chat-msg is-" + role + (animate ? "" : "");
    /* Role label */
    var roleEl = document.createElement("div");
    roleEl.className = "sede-chat-role";
    roleEl.textContent = role === "user" ? "You" : "Sede";
    msg.appendChild(roleEl);
    /* Bubble */
    var bubble = document.createElement("div");
    bubble.className = "sede-chat-bubble";
    if (role === "ai"){
      var html = parseMarkdown(text);
      bubble.innerHTML = html;
      /* Post-process code blocks */
      processCodeBlocks(bubble);
      /* Check for code blocks → trigger 2-pane（復元中はスキップ） */
      if (!_sedeIsRestoring) {
        var codeBlocks = extractCodeBlocks(text);
        if (codeBlocks.length > 0 && window.innerWidth > 768){
          requestAnimationFrame(function(){ _sedeUpdateEditor(codeBlocks[codeBlocks.length - 1]); });
        }
      }
    } else {
      bubble.textContent = text;
    }
    msg.appendChild(bubble);
    chatList.appendChild(msg);
  }

  /* ── Markdown parser ── */
  function parseMarkdown(text){
    try {
      if (typeof marked !== "undefined" && marked.parse){
        var html = marked.parse(String(text), { breaks: true, gfm: true });
        if (typeof DOMPurify !== "undefined") html = DOMPurify.sanitize(html);
        return html;
      }
    } catch(e){}
    /* markedがない場合の簡易マークダウン（コードブロック対応） */
    /* Step 1: Extract code blocks first */
    var codeBlocks = [];
    var s = text.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code){
      var idx = codeBlocks.length;
      /* Simple syntax coloring */
      var colored = escHtml(code.trim())
        .replace(/\b(function|const|let|var|return|if|else|for|while|class|new|this|import|export|from|async|await|try|catch|throw)\b/g, '<span style="color:#c586c0;">$1</span>')
        .replace(/\b(true|false|null|undefined|NaN)\b/g, '<span style="color:#569cd6;">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#b5cea8;">$1</span>')
        .replace(/(["'`])([^"'`]*?)\1/g, '<span style="color:#ce9178;">$1$2$1</span>')
        .replace(/(\/\/.*)/g, '<span style="color:#6a9955;">$1</span>');
      codeBlocks.push('<pre style="background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:12px 14px;margin:8px 0;overflow-x:auto;font-size:12px;line-height:1.5;font-family:\'Fira Code\',Consolas,monospace;">'
        + (lang ? '<div style="font-size:10px;color:#666;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">' + escHtml(lang) + '</div>' : '')
        + '<code>' + colored + '</code></pre>');
      return '%%CODEBLOCK_' + idx + '%%';
    });
    /* Step 2: Escape & format inline */
    s = escHtml(s);
    s = s.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,.06);padding:1px 5px;border-radius:3px;font-size:0.9em;font-family:\'Fira Code\',Consolas,monospace;">$1</code>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/^\s*[-*]\s+(.+)/gm, '<li>$1</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    s = s.replace(/^\s*(\d+)\.\s+(.+)/gm, '<li>$2</li>');
    s = s.replace(/\n/g, '<br>');
    /* Step 3: Restore code blocks */
    for(var ci = 0; ci < codeBlocks.length; ci++){
      s = s.replace('%%CODEBLOCK_' + ci + '%%', codeBlocks[ci]);
    }
    return s;
  }
  function escHtml(s){
    var d = document.createElement("div"); d.textContent = s; return d.innerHTML;
  }

  /* ── Process code blocks in bubble: add header bar + hljs ── */
  function processCodeBlocks(bubble){
    bubble.querySelectorAll("pre code").forEach(function(block){
      /* Detect language */
      var lang = "";
      (block.className || "").split(/\s+/).forEach(function(c){
        var m = c.match(/^(?:language-|hljs-)(.+)/);
        if (m) lang = m[1].toLowerCase();
      });
      /* highlight.js */
      if (typeof hljs !== "undefined") try { hljs.highlightElement(block); } catch(e){}
      /* Insert header bar */
      var pre = block.parentElement;
      if (!pre || pre.querySelector(".sede-code-header")) return;
      var header = document.createElement("div");
      header.className = "sede-code-header";
      var langSpan = document.createElement("span");
      langSpan.className = "sede-code-lang";
      var ver = _trackCodeVersion(lang, block.textContent);
      langSpan.textContent = (lang || "code") + (ver > 1 ? " v" + ver : "");
      header.appendChild(langSpan);
      /* Copy button */
      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.innerHTML = '<span class="ms" style="font-size:14px">content_copy</span> Copy';
      copyBtn.addEventListener("click", function(){
        navigator.clipboard.writeText(block.textContent).then(function(){
          copyBtn.innerHTML = '<span class="ms" style="font-size:14px">check</span> Copied';
          setTimeout(function(){ copyBtn.innerHTML = '<span class="ms" style="font-size:14px">content_copy</span> Copy'; }, 2000);
        });
      });
      header.appendChild(copyBtn);
      /* →右パネル: 検討中のコードを右パネルに送る */
      if (window.innerWidth > 768){
        var sendRightBtn = document.createElement("button");
        sendRightBtn.type = "button";
        sendRightBtn.innerHTML = '<span class="ms" style="font-size:14px">arrow_forward</span> 右へ';
        sendRightBtn.addEventListener("click", function(){
          var _blk = { lang: lang, code: block.textContent, filename: guessFilename(lang, block.textContent) };
          _sedeUpdateEditor(_blk);
          _sedeStreamLongestLen = block.textContent.length; /* 以降これより短いコードで上書きされない */
          sendRightBtn.innerHTML = '<span class="ms" style="font-size:14px">check</span> 送信済み';
          setTimeout(function(){ sendRightBtn.innerHTML = '<span class="ms" style="font-size:14px">arrow_forward</span> 右へ'; }, 2000);
        });
        header.appendChild(sendRightBtn);
      }
      /* Run button (python, javascript, java, c, html) */
      var runLangs = ["python","javascript","js","java","c","html"];
      var normalizedLang = lang === "js" ? "javascript" : lang;
      if (runLangs.indexOf(lang) !== -1 || runLangs.indexOf(normalizedLang) !== -1){
        var runBtn = document.createElement("button");
        runBtn.type = "button";
        runBtn.className = "sede-run-btn";
        runBtn.innerHTML = '<span class="ms" style="font-size:14px">play_arrow</span> Run';
        runBtn.addEventListener("click", function(){
          executeCodeBlock(normalizedLang === "js" ? "javascript" : normalizedLang, block.textContent, pre);
        });
        header.appendChild(runBtn);
      }
      /* Mobile: fullscreen button */
      if (window.innerWidth <= 768){
        var fsBtn = document.createElement("button");
        fsBtn.type = "button";
        fsBtn.className = "sede-code-fullscreen-btn";
        fsBtn.innerHTML = '<span class="ms" style="font-size:14px">fullscreen</span>';
        fsBtn.addEventListener("click", function(){
          openMobileCodeModal({ lang: lang, code: block.textContent, filename: guessFilename(lang, block.textContent) });
        });
        header.appendChild(fsBtn);
      }
      pre.insertBefore(header, pre.firstChild);
    });
  }

  /* ── Extract code blocks from raw text ── */
  function extractCodeBlocks(text){
    var blocks = [];
    var re = /```(\w*)\n([\s\S]*?)```/g;
    var m;
    while ((m = re.exec(text)) !== null){
      var lang = m[1] || "";
      var code = m[2] || "";
      blocks.push({ lang: lang, code: code, filename: guessFilename(lang, code) });
    }
    return blocks;
  }

  /* ── Guess filename from lang + code content ── */
  function guessFilename(lang, code){
    /* Try to find filename comment in first lines */
    var lines = String(code).split("\n").slice(0, 5);
    for (var i = 0; i < lines.length; i++){
      var fm = lines[i].match(/(?:ファイル名|filename|file)\s*[:：]\s*(\S+)/i);
      if (fm) return fm[1];
    }
    var extMap = { javascript:"index.js", js:"index.js", typescript:"index.ts", ts:"index.ts",
      python:"main.py", py:"main.py", html:"index.html", css:"style.css", scss:"style.scss",
      rust:"main.rs", go:"main.go", java:"Main.java", c:"main.c", cpp:"main.cpp",
      ruby:"main.rb", php:"index.php", swift:"main.swift", kotlin:"Main.kt",
      shell:"script.sh", bash:"script.sh", sql:"query.sql", json:"data.json", yaml:"config.yaml" };
    return extMap[lang.toLowerCase()] || ("code." + (lang || "txt"));
  }

  /* ── 2-Pane Code Editor ── */
  /* ── Right Pane: Update editor with new code ── */
  function _sedeUpdateEditor(block){
    if (!codeView || !block) return;
    _sede.codeHistory.push({ lang: block.lang, filename: block.filename, code: block.code });
    /* コード状態をセッションに保存（リロード対応） */
    try {
      var _ses = _sedeGetActiveSession();
      if (_ses) {
        _ses.currentCode = { lang: block.lang, filename: block.filename, code: block.code };
        _ses.updatedAt = Date.now();
        if (typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
      }
    } catch(e){}
    /* Update file tabs */
    _sedeRenderFileTabs();
    /* Update lang badge */
    if (editorLang) editorLang.textContent = (block.lang || "txt").toUpperCase();
    /* Hide empty state */
    if (editorEmpty) editorEmpty.style.display = "none";
    /* Render code with line numbers */
    var lines = block.code.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    var numDiv = document.createElement("div");
    numDiv.className = "sede-line-numbers";
    for (var i = 0; i < lines.length; i++){
      var ln = document.createElement("div"); ln.textContent = String(i + 1); numDiv.appendChild(ln);
    }
    var pre = document.createElement("pre");
    var code = document.createElement("code");
    if (block.lang) code.className = "language-" + block.lang;
    code.textContent = block.code;
    if (typeof hljs !== "undefined") try { hljs.highlightElement(code); } catch(e){}
    pre.appendChild(code);
    codeView.innerHTML = "";
    codeView.appendChild(numDiv);
    codeView.appendChild(pre);
    /* Hook: update file tree + auto-preview */
    try{ if(typeof _sedeRenderFileTree === "function") _sedeRenderFileTree(); }catch(e){}
    try{ if(typeof _sedeAutoPreview === "function") _sedeAutoPreview(block); }catch(e){}
  }

  function _sedeRenderFileTabs(){
    if (!fileTabs) return;
    var seen = {};
    var tabs = [];
    _sede.codeHistory.forEach(function(b){
      var name = b.filename || ("code." + (b.lang || "txt"));
      if (!seen[name]){ seen[name] = true; tabs.push(name); }
    });
    if (!tabs.length){ fileTabs.innerHTML = ""; return; }
    var activeFile = _sede.codeHistory[_sede.codeHistory.length - 1]?.filename || tabs[tabs.length - 1];
    fileTabs.innerHTML = tabs.map(function(t){
      return '<div class="sede-file-tab' + (t === activeFile ? ' is-active' : '') + '" data-sede-file="' + t + '">' + t + '</div>';
    }).join("");
  }

  /* ── Operation Log (Claude Code style) ── */
  function _sedeAddOpLog(text, active){
    /* Write to dedicated Logs tab panel */
    var logBody = document.getElementById("sedeLogPanelBody");
    if(logBody){
      var now = new Date();
      var ts = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0") + ":" + String(now.getSeconds()).padStart(2,"0");
      var logItem = document.createElement("div");
      logItem.className = "sede-oplog-item";
      logItem.innerHTML = '<div class="sede-oplog-dot' + (active ? " is-active" : " is-done") + '"></div>'
        + '<span style="font-size:10px;color:rgba(0,0,0,.3);flex-shrink:0;font-family:monospace;min-width:56px;">' + ts + '</span>'
        + '<div class="sede-oplog-text">' + text + '</div>';
      logBody.appendChild(logItem);
      logBody.scrollTop = logBody.scrollHeight;
      if(_sede.processing && typeof _sedeActivateRightTab === "function") _sedeActivateRightTab("logs");
    }
    /* Also write to chat list (compact) */
    if (!chatList) return logBody ? logBody.lastElementChild : null;
    var item = document.createElement("div");
    item.className = "sede-oplog-item";
    item.innerHTML = '<div class="sede-oplog-dot' + (active ? ' is-active' : ' is-done') + '"></div>'
      + '<div class="sede-oplog-text">' + text + '</div>';
    var _spinner = window._sedeFixSpinner || window._sedeCreateSpinner;
    if (_spinner && _spinner.parentNode === chatList) {
      chatList.insertBefore(item, _spinner);
    } else {
      chatList.appendChild(item);
    }
    if (_spinner && _spinner.parentNode === chatList) {
      chatList.appendChild(_spinner);
    }
    scrollToBottom();
    return item;
  }
  function _sedeCompleteOpLog(item){
    if (!item) return;
    var dot = item.querySelector(".sede-oplog-dot");
    if (dot){ dot.classList.remove("is-active"); dot.classList.add("is-done"); }
    /* Also complete in log panel */
    var logDot = item?._logItem?.querySelector(".sede-oplog-dot");
    if (logDot){ logDot.classList.remove("is-active"); logDot.classList.add("is-done"); }
  }

  /* ── Add chat message to Logs tab (markdown + connected line) ── */
  function _sedeAddLogChat(text){
    var logBody = document.getElementById("sedeLogPanelBody");
    if(!logBody || !text) return;
    var item = document.createElement("div");
    item.className = "sede-log-chat-item";
    var mdHtml = (typeof parseMarkdown === "function") ? parseMarkdown(text) : text.replace(/\n/g, "<br>");
    item.innerHTML = '<div class="sede-log-chat-dot"></div>'
      + '<div class="sede-log-chat-body">' + mdHtml + '</div>';
    logBody.appendChild(item);
    logBody.scrollTop = logBody.scrollHeight;
  }

  /* ── Render inline diff in left chat pane (Claude Code style) ── */
  function _sedeRenderDiffInChat(diffText, filename){
    if (!chatList || !diffText) return;
    /* +/- 行数カウント */
    var _dAdd = 0, _dDel = 0;
    diffText.split("\n").forEach(function(l){
      if (l.startsWith("+") && !l.startsWith("+++")) _dAdd++;
      if (l.startsWith("-") && !l.startsWith("---")) _dDel++;
    });
    var container = document.createElement("div");
    container.className = "sede-diff-inline";
    var hdr = document.createElement("div");
    hdr.className = "sede-diff-inline-header";
    hdr.innerHTML = '<span class="ms" style="font-size:13px">description</span> <span class="sede-diff-fname">' + escHtml(filename || "file") + '</span>'
      + ' <span style="color:#22c55e;font-weight:700;">+' + _dAdd + '</span>'
      + ' <span style="color:#ef4444;font-weight:700;">-' + _dDel + '</span>';
    container.appendChild(hdr);
    var body = document.createElement("div");
    body.className = "sede-diff-inline-body";
    var lines = String(diffText).split("\n");
    var lineNum = 0;
    for (var i = 0; i < lines.length; i++){
      var l = lines[i];
      /* Skip --- +++ headers */
      if (l.startsWith("---") || l.startsWith("+++")) continue;
      var row = document.createElement("div");
      row.className = "sede-diff-inline-line";
      if (l.startsWith("@@")){
        row.classList.add("is-hunk");
        /* Parse line number from hunk header */
        var hm = l.match(/\+(\d+)/);
        if (hm) lineNum = parseInt(hm[1], 10) - 1;
        row.innerHTML = '<div class="sede-diff-inline-num"></div><div class="sede-diff-inline-marker"></div>'
          + '<div class="sede-diff-inline-code">' + escHtml(l) + '</div>';
      } else if (l.startsWith("+")){
        lineNum++;
        row.classList.add("is-add");
        row.innerHTML = '<div class="sede-diff-inline-num">' + lineNum + '</div><div class="sede-diff-inline-marker">+</div>'
          + '<div class="sede-diff-inline-code">' + escHtml(l.slice(1)) + '</div>';
      } else if (l.startsWith("-")){
        row.classList.add("is-del");
        row.innerHTML = '<div class="sede-diff-inline-num"></div><div class="sede-diff-inline-marker">−</div>'
          + '<div class="sede-diff-inline-code">' + escHtml(l.slice(1)) + '</div>';
      } else {
        lineNum++;
        row.innerHTML = '<div class="sede-diff-inline-num" style="opacity:.4">' + lineNum + '</div><div class="sede-diff-inline-marker"> </div>'
          + '<div class="sede-diff-inline-code">' + escHtml(l.startsWith(" ") ? l.slice(1) : l) + '</div>';
      }
      body.appendChild(row);
    }
    container.appendChild(body);
    chatList.appendChild(container);
    scrollToBottom();
    return container;
  }

  /* ── Diff Approval Card (per-edit) ── */
  function _sedeShowDiffApproval(filename, addCount, delCount, diffText, lang){
    return new Promise(function(resolve){
      var card = document.createElement("div");
      card.className = "sede-diff-card";
      card.innerHTML = '<div class="sede-diff-card-head"><span class="ms" style="font-size:16px">edit_note</span> Edit <strong>' + escHtml(filename || "file") + '</strong></div>'
        + '<div class="sede-diff-card-stats"><span class="is-add">+' + addCount + ' 追加</span>　<span class="is-del">−' + delCount + ' 削除</span></div>'
        + '<div class="sede-diff-card-btns">'
        + '<button class="sede-diff-card-btn is-apply" type="button" data-diff-action="apply">✅ 承認</button>'
        + '<button class="sede-diff-card-btn is-reject" type="button" data-diff-action="reject">❌ 拒否</button>'
        + '</div>';
      chatList.appendChild(card);
      scrollToBottom();
      card.addEventListener("click", function(e){
        var btn = e.target.closest("[data-diff-action]");
        if (!btn) return;
        var action = btn.getAttribute("data-diff-action");
        if (action === "apply"){
          card.classList.add("is-resolved");
          card.innerHTML = '<div class="sede-diff-card-head" style="color:#22c55e"><span class="ms" style="font-size:16px">check_circle</span> 適用しました — ' + escHtml(filename || "file") + '</div>';
          resolve(true);
        } else if (action === "reject"){
          card.classList.add("is-resolved");
          card.innerHTML = '<div class="sede-diff-card-head" style="color:#ef4444"><span class="ms" style="font-size:16px">cancel</span> 拒否しました — ' + escHtml(filename || "file") + '</div>';
          resolve(false);
        }
      });
    });
  }

  /* Render raw unified diff text in the editor pane with +/- coloring */
  function _sedeRenderDiffInEditor(diffText, viewEl){
    var cv = viewEl || codeView || document.getElementById("sedeCodeView");
    if (!cv) return;
    /* Hide empty state */
    var emptyEl = cv.querySelector(".sede-editor-empty");
    if (emptyEl) emptyEl.style.display = "none";
    /* Fix escaped newlines (literal \n from JSON.stringify) */
    var _dt = String(diffText || "");
    if (_dt.indexOf("\\n") >= 0 && _dt.split("\n").length <= 2) _dt = _dt.replace(/\\n/g, "\n");
    var lines = _dt.split("\n");
    var html = "", numHtml = "", lineNum = 0;
    for (var i = 0; i < lines.length; i++){
      var l = lines[i];
      /* Skip diff headers */
      if (l.startsWith("---") || l.startsWith("+++") || l.startsWith("@@")) {
        html += '<div style="color:var(--muted);font-weight:600;background:var(--chip-bg);">' + escHtml(l) + '</div>';
        numHtml += '<div> </div>';
        continue;
      }
      lineNum++;
      if (l.startsWith("+")){
        html += '<div class="sede-diff-line-add"><span class="sede-diff-marker is-add">+</span>' + escHtml(l.slice(1)) + '</div>';
      } else if (l.startsWith("-")){
        html += '<div class="sede-diff-line-del"><span class="sede-diff-marker is-del">-</span>' + escHtml(l.slice(1)) + '</div>';
      } else {
        html += '<div><span class="sede-diff-marker"> </span>' + escHtml(l.startsWith(" ") ? l.slice(1) : l) + '</div>';
      }
      numHtml += '<div>' + lineNum + '</div>';
    }
    cv.innerHTML = '<div class="sede-line-numbers">' + numHtml + '</div>'
      + '<pre style="padding-left:52px;margin:0;min-height:100%;"><code style="display:block;font-size:13px;line-height:1.65;font-family:\'Fira Code\',Consolas,monospace;">' + html + '</code></pre>';
  }

  function _sedeShowDiffView(newCode, lang){
    if (!codeView) return;
    var prev = _sede.codeHistory.length >= 2 ? _sede.codeHistory[_sede.codeHistory.length - 2] : null;
    if (!prev){ _sedeUpdateEditor({ lang: lang, code: newCode, filename: guessFilename(lang, newCode) }); return; }
    var prevLines = prev.code.split("\n");
    var newLines = newCode.split("\n");
    var maxLen = Math.max(prevLines.length, newLines.length);
    var html = "", numHtml = "";
    for (var i = 0; i < maxLen; i++){
      var pL = prevLines[i], nL = newLines[i];
      var ln = String(i + 1);
      if (pL === undefined){
        html += '<div class="sede-diff-line-add"><span class="sede-diff-marker is-add">＋</span>' + escHtml(nL) + '</div>';
      } else if (nL === undefined){
        html += '<div class="sede-diff-line-del"><span class="sede-diff-marker is-del">ー</span>' + escHtml(pL) + '</div>';
      } else if (pL !== nL){
        html += '<div class="sede-diff-line-del"><span class="sede-diff-marker is-del">ー</span>' + escHtml(pL) + '</div>';
        html += '<div class="sede-diff-line-add"><span class="sede-diff-marker is-add">＋</span>' + escHtml(nL) + '</div>';
        numHtml += '<div>' + ln + '</div><div></div>';
        continue;
      } else {
        html += '<div><span class="sede-diff-marker"> </span>' + escHtml(nL) + '</div>';
      }
      numHtml += '<div>' + ln + '</div>';
    }
    codeView.innerHTML = '<div class="sede-line-numbers">' + numHtml + '</div>'
      + '<pre style="padding-left:52px;margin:0;min-height:100%;"><code style="display:block;font-size:13px;line-height:1.65;font-family:\'Fira Code\',Consolas,monospace;">' + html + '</code></pre>';
  }

  /* ── Terminal ── */
  function _sedeTerminalLog(text, cls){
    if (!terminalBody) return;
    var line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = text;
    terminalBody.appendChild(line);
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }
  function _sedeTerminalClear(){
    if (terminalBody) terminalBody.innerHTML = '';
  }

  /* ── Terminal Input: コマンド入力→Piston実行 ── */
  (function(){
    var input = document.getElementById("sedeTerminalInput");
    if (!input) return;
    var _history = [], _histIdx = -1;
    input.addEventListener("keydown", function(e){
      if (e.key === "ArrowUp"){ e.preventDefault(); if (_histIdx < _history.length - 1){ _histIdx++; input.value = _history[_history.length - 1 - _histIdx] || ""; } return; }
      if (e.key === "ArrowDown"){ e.preventDefault(); if (_histIdx > 0){ _histIdx--; input.value = _history[_history.length - 1 - _histIdx] || ""; } else { _histIdx = -1; input.value = ""; } return; }
      if (e.key !== "Enter") return;
      var cmd = input.value.trim();
      if (!cmd) return;
      _history.push(cmd); _histIdx = -1;
      input.value = "";
      _sedeTerminalLog("$ " + cmd, "is-cmd");

      /* E2B Sandbox でコマンド実行 */
      var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
      var hdrs = { "Content-Type": "application/json" };
      try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(ex){}

      _sedeTerminalLog("実行中...", "");
      fetch(base + "/api/sede/exec", {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ command: cmd, timeout: 30000 })
      }).then(function(r){ return r.json(); }).then(function(d){
        if (d.stdout) _sedeTerminalLog(d.stdout, "is-ok");
        if (d.stderr) _sedeTerminalLog(d.stderr, "is-err");
        if (d.error) _sedeTerminalLog("Error: " + d.error, "is-err");
        if (!d.stdout && !d.stderr && !d.error) _sedeTerminalLog("(出力なし)", "");
        if (d.exitCode !== undefined && d.exitCode !== 0) _sedeTerminalLog("exit code: " + d.exitCode, "is-err");
      }).catch(function(err){
        _sedeTerminalLog("Error: " + (err?.message || "通信エラー"), "is-err");
      });
    });
  })();

  /* ── Code Editor: 編集モード切替 ── */
  var _sedeEditMode = false;
  function _sedeToggleEditMode(){
    if (!codeView) return;
    if (_sedeEditMode){
      /* 編集モードを解除 */
      _sedeEditMode = false;
      var latest = _sede.codeHistory.length ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;
      if (latest) _sedeUpdateEditor(latest);
      return;
    }
    /* 編集モードに入る */
    var latest = _sede.codeHistory.length ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;
    if (!latest || !latest.code) return;
    _sedeEditMode = true;
    var bar = document.createElement("div");
    bar.className = "sede-code-edit-bar";
    bar.innerHTML = '<span class="ms" style="font-size:13px">edit_note</span> 編集モード '
      + '<button class="is-save" type="button" data-edit-action="save">💾 保存</button>'
      + '<button type="button" data-edit-action="cancel">✕ キャンセル</button>';
    var textarea = document.createElement("textarea");
    textarea.className = "sede-code-edit-area";
    textarea.value = latest.code;
    textarea.spellcheck = false;
    /* Tab キー対応 */
    textarea.addEventListener("keydown", function(e){
      if (e.key === "Tab"){
        e.preventDefault();
        var s = this.selectionStart, en = this.selectionEnd;
        this.value = this.value.substring(0, s) + "  " + this.value.substring(en);
        this.selectionStart = this.selectionEnd = s + 2;
      }
    });
    codeView.innerHTML = "";
    codeView.appendChild(bar);
    codeView.appendChild(textarea);
    textarea.focus();
    /* ボタンイベント */
    bar.addEventListener("click", function(e){
      var btn = e.target.closest("[data-edit-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-edit-action");
      if (action === "save"){
        var newCode = textarea.value;
        var fname = latest.filename || ("code." + (latest.lang || "txt"));
        var lang = latest.lang || "txt";
        _sedeUpdateEditor({ lang: lang, code: newCode, filename: fname });
        _sedeEditMode = false;
        _sedeTerminalLog("Saved: " + fname + " (" + newCode.split("\n").length + " lines)", "is-ok");
      } else {
        _sedeEditMode = false;
        _sedeUpdateEditor(latest);
      }
    });
  }

  /* ── Preview Mode ── */
  function _sedePreviewFullscreen(on){
    var centerPane = document.getElementById("sedeCenterPane");
    var rightPane = document.getElementById("sedeRightPane");
    if(!centerPane || !rightPane) return;
    if(on){
      centerPane.setAttribute("style","display:none !important");
      rightPane.setAttribute("style","flex:1 1 100% !important;order:1 !important;border:none !important;min-width:0 !important;display:flex !important;flex-direction:column !important;overflow:hidden !important;");
    } else {
      centerPane.removeAttribute("style");
      rightPane.removeAttribute("style");
    }
  }
  function _sedeOpenPreview(code, lang, mode){
    var rightPane = document.getElementById("sedeRightPane");
    if (!rightPane) return;
    var existing = rightPane.querySelector(".sede-preview");
    if (existing) existing.remove();
    _sedePreviewFullscreen(true);
    var preview = document.createElement("div");
    preview.className = "sede-preview";
    var isPC = mode !== "mobile";
    var html = "";
    if (lang === "html" || lang === "css" || lang === "javascript" || lang === "js"){
      if (lang === "html") html = code;
      else if (lang === "css") html = '<!DOCTYPE html><html><head><style>' + code + '</style></head><body><h1>Preview</h1><p>CSS applied</p></body></html>';
      else html = '<!DOCTYPE html><html><head></head><body><script>' + code + '<\/script></body></html>';
    }
    preview.innerHTML = '<div class="sede-preview-bar">'
      + '<button class="sede-preview-bar-btn' + (isPC ? ' is-active' : '') + '" type="button" data-preview-mode="pc">💻 PC</button>'
      + '<button class="sede-preview-bar-btn' + (!isPC ? ' is-active' : '') + '" type="button" data-preview-mode="mobile">📱 スマホ</button>'
      + '<button class="sede-preview-bar-btn" type="button" data-preview-mode="console" style="margin-left:auto;opacity:.7;"><span class="ms" style="font-size:14px;vertical-align:-2px;">terminal</span> コンソール</button>'
      + '<button class="sede-preview-bar-btn sede-preview-bar-close" type="button" data-preview-mode="close">✕ 閉じる</button>'
      + '</div>'
      + '<div class="sede-preview-frame-wrap"></div>'
      + '<div class="sede-preview-console" style="display:none;max-height:180px;overflow-y:auto;background:#1e1e1e;color:#d4d4d4;font-family:monospace;font-size:12px;padding:8px 12px;border-top:1px solid rgba(255,255,255,.1);"></div>';
    var frameWrap = preview.querySelector(".sede-preview-frame-wrap");
    var iframe = document.createElement("iframe");
    iframe.className = "sede-preview-frame" + (!isPC ? " is-mobile" : "");
    iframe.sandbox = "allow-scripts allow-same-origin allow-modals allow-forms allow-popups";
    if (isPC){ iframe.style.width = "100%"; iframe.style.height = "100%"; }
    else { iframe.style.transform = "scale(" + Math.min(1, (rightPane.clientHeight - 60) / 812) + ")"; }
    frameWrap.appendChild(iframe);
    /* コンソールキャプチャを注入 */
    var _capScript = '<script>'
      + 'window.onerror=function(m,s,l,c,e){parent.postMessage({_sedeC:1,t:"error",m:m+" (line "+l+")"},"*");};'
      + 'window.addEventListener("unhandledrejection",function(e){parent.postMessage({_sedeC:1,t:"error",m:"Promise: "+e.reason},"*");});'
      + 'var _oL=console.log,_oW=console.warn,_oE=console.error;'
      + 'console.log=function(){_oL.apply(console,arguments);parent.postMessage({_sedeC:1,t:"log",m:[].slice.call(arguments).join(" ")},"*");};'
      + 'console.warn=function(){_oW.apply(console,arguments);parent.postMessage({_sedeC:1,t:"warn",m:[].slice.call(arguments).join(" ")},"*");};'
      + 'console.error=function(){_oE.apply(console,arguments);parent.postMessage({_sedeC:1,t:"error",m:[].slice.call(arguments).join(" ")},"*");};'
      + '<\/script>';
    if (html) {
      var injected = html.replace(/<head>/i, '<head>' + _capScript);
      if (injected === html) injected = _capScript + html;
      iframe.srcdoc = injected;
    } else {
      iframe.srcdoc = '<pre style="padding:20px;font-family:monospace;">' + escHtml(code) + '</pre>';
    }
    /* コンソールメッセージ受信 */
    var _conEl = preview.querySelector(".sede-preview-console");
    var _conErrorCount = 0;
    var _conHandler = function(e){
      if (!e.data || !e.data._sedeC || !_conEl) return;
      if (e.data.t === "error") {
        _conEl.style.display = "";
        _conErrorCount++;
        /* 「エラーを修正」ボタンを表示（初回エラー時のみ） */
        if (_conErrorCount === 1) {
          var _fixBtn = document.createElement("div");
          _fixBtn.style.cssText = "padding:6px 0;margin-top:4px;";
          _fixBtn.innerHTML = '<button style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;" data-fix-errors="1">エラーを自動修正</button>';
          _conEl.appendChild(_fixBtn);
          _fixBtn.querySelector("button").addEventListener("click", function(){
            /* コンソールのエラーを収集 */
            var _errTexts = [];
            var _errDivs = _conEl.querySelectorAll("div");
            for(var _ei = 0; _ei < _errDivs.length; _ei++){
              var _et = (_errDivs[_ei].textContent || "").trim();
              if(_et.startsWith("✕")) _errTexts.push(_et.slice(1).trim());
            }
            if(_errTexts.length === 0) return;
            /* チャット入力にエラー修正指示を設定して送信 */
            var _fixMsg = "以下のコンソールエラーを全て修正して:\n" + _errTexts.slice(0, 10).join("\n");
            if(typeof _sedeAgentRun === "function" && !_sede.agentRunning){
              _sedeAgentRun(_fixMsg);
            } else {
              var _chatInput = document.getElementById("sedeChatInput");
              if(_chatInput){ _chatInput.value = _fixMsg; }
            }
            _fixBtn.remove();
          });
        }
      }
      var ln = document.createElement("div");
      ln.style.cssText = "padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05);word-break:break-all;";
      var _colors = { log:"#d4d4d4", warn:"#e5c07b", error:"#e06c75" };
      var _icons = { log:"▸", warn:"⚠", error:"✕" };
      ln.innerHTML = '<span style="color:' + (_colors[e.data.t]||"#d4d4d4") + '">' + (_icons[e.data.t]||"▸") + ' ' + String(e.data.m||"").replace(/</g,"&lt;").slice(0,500) + '</span>';
      _conEl.appendChild(ln);
      _conEl.scrollTop = _conEl.scrollHeight;
    };
    if (window._sedePreviewConHandler) window.removeEventListener("message", window._sedePreviewConHandler);
    window._sedePreviewConHandler = _conHandler;
    window.addEventListener("message", _conHandler);

    rightPane.style.position = "relative";
    rightPane.appendChild(preview);
    preview.addEventListener("click", function(e){
      var btn = e.target.closest("[data-preview-mode]");
      if (!btn) return;
      var m = btn.getAttribute("data-preview-mode");
      if (m === "close"){ preview.remove(); _sedePreviewFullscreen(false); if (window._sedePreviewConHandler){ window.removeEventListener("message", window._sedePreviewConHandler); } return; }
      if (m === "console"){ if (_conEl) _conEl.style.display = _conEl.style.display === "none" ? "" : "none"; return; }
      preview.remove();
      _sedeOpenPreview(code, lang, m);
    });
  }

  /* ── Editor Toolbar Handler ── */
  if (editorToolbar) editorToolbar.addEventListener("click", function(e){
    var btn = e.target.closest("[data-sede-edit]");
    if (!btn) return;
    var action = btn.getAttribute("data-sede-edit");
    var latest = _sede.codeHistory[_sede.codeHistory.length - 1];
    if (!latest && action !== "preview" && action !== "history") return;
    if (action === "copy"){
      navigator.clipboard.writeText(latest.code);
      btn.innerHTML = '<span class="ms">check</span>';
      setTimeout(function(){ btn.innerHTML = '<span class="ms">content_copy</span>'; }, 2000);
    } else if (action === "download"){
      var blob = new Blob([latest.code], { type: "text/plain" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = latest.filename || "code.txt"; a.click(); URL.revokeObjectURL(a.href);
    } else if (action === "diff"){
      _sedeShowDiffView(latest.code, latest.lang);
    } else if (action === "run"){
      _sedeRunFromEditor(latest);
    } else if (action === "preview"){
      if (latest) _sedeOpenPreview(latest.code, latest.lang, "pc");
    } else if (action === "edit"){
      _sedeToggleEditMode();
    } else if (action === "history"){
      _sedeToggleHistoryPanel();
    } else if (action === "deploy"){
      _sedeDeployToPages();
    } else if (action === "depgraph"){
      _sedeUpdateDepGraph();
    }
  });

  /* ── Deploy to Cloudflare Pages ── */
  async function _sedeDeployToPages(){
    var latest = _sede.codeHistory.length ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;
    var pid = window._sedeActiveProjectId || "";
    if (!latest && !pid){ appendMsgDom("ai", "デプロイするコードがありません。まずアプリを作成してください。", true); return; }

    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try { var t = (typeof _authGetToken === "function") ? _authGetToken() : null; if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (t) hdrs.Authorization = "Bearer " + t; } catch(e){}

    /* Check if previously deployed */
    var ses = (typeof _sedeGetActiveSession === "function") ? _sedeGetActiveSession() : null;
    var lastDeploy = ses?._deploySubdomain || "";
    var isUpdate = !!lastDeploy;

    /* Show deploy dialog in chat */
    if(isUpdate){
      appendMsgDom("ai", "**サイトを更新**\n\n前回のデプロイ先: `" + lastDeploy + ".vocabuquiz.app`\nそのまま更新するか、新しいURLに変更できます。", true);
    } else {
      appendMsgDom("ai", "**公開URL を設定**\n\nサブドメインを入力してください。\n例: `my-quiz` → `my-quiz.vocabuquiz.app`", true);
    }

    var dialogEl = document.createElement("div");
    dialogEl.style.cssText = "padding:12px;background:var(--panel,#1b1b1f);border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.1));margin:8px 0;";
    dialogEl.innerHTML = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">'
      + '<input id="sedeDeploySubdomain" type="text" placeholder="my-app-name" maxlength="40" value="' + (lastDeploy || "") + '" style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.15));background:var(--bg,#111);color:var(--text,#eee);font-size:14px;font-family:monospace;" />'
      + '<span style="color:var(--muted,rgba(255,255,255,.4));font-size:13px;white-space:nowrap;">.vocabuquiz.app</span>'
      + '</div>'
      + '<div id="sedeDeployStatus" style="font-size:12px;color:var(--muted,rgba(255,255,255,.4));margin-bottom:10px;min-height:18px;">' + (isUpdate ? '<span style="color:#22c55e;">✓ 前回のデプロイ先 — そのまま更新できます</span>' : '') + '</div>'
      + '<div style="display:flex;gap:8px;">'
      + (isUpdate ? '' : '<button id="sedeDeployCheck" type="button" style="padding:8px 16px;border-radius:8px;border:none;background:var(--accent,#6366f1);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">空き確認</button>')
      + '<button id="sedeDeployGo" type="button" ' + (isUpdate ? '' : 'disabled') + ' style="padding:8px 16px;border-radius:8px;border:none;background:#22c55e;color:#fff;font-size:13px;font-weight:600;cursor:pointer;' + (isUpdate ? '' : 'opacity:.4;') + '">' + (isUpdate ? '更新する' : '公開する') + '</button>'
      + '<button id="sedeDeployCancel" type="button" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.15));background:transparent;color:var(--text,#eee);font-size:13px;cursor:pointer;">キャンセル</button>'
      + '</div>';
    if(chatList) chatList.appendChild(dialogEl);
    scrollToBottom();

    var subInput = dialogEl.querySelector("#sedeDeploySubdomain");
    var statusEl = dialogEl.querySelector("#sedeDeployStatus");
    var checkBtn = dialogEl.querySelector("#sedeDeployCheck");
    var goBtn = dialogEl.querySelector("#sedeDeployGo");
    var cancelBtn = dialogEl.querySelector("#sedeDeployCancel");
    var confirmedName = isUpdate ? lastDeploy : "";

    /* When input changes in update mode, require re-check if name changed */
    if(isUpdate && subInput){
      subInput.addEventListener("input", function(){
        var val = subInput.value.toLowerCase().trim().replace(/[^a-z0-9-]/g, "");
        if(val !== lastDeploy){
          confirmedName = "";
          goBtn.disabled = true; goBtn.style.opacity = ".4"; goBtn.textContent = "公開する";
          statusEl.innerHTML = '<span style="color:var(--muted);">名前を変更した場合は空き確認が必要です</span>';
          /* Show check button */
          if(!dialogEl.querySelector("#sedeDeployCheck")){
            var chk = document.createElement("button");
            chk.id = "sedeDeployCheck"; chk.type = "button";
            chk.style.cssText = "padding:8px 16px;border-radius:8px;border:none;background:var(--accent,#6366f1);color:#fff;font-size:13px;font-weight:600;cursor:pointer;";
            chk.textContent = "空き確認";
            goBtn.parentElement.insertBefore(chk, goBtn);
            chk.addEventListener("click", doCheck);
          }
        } else {
          confirmedName = lastDeploy;
          goBtn.disabled = false; goBtn.style.opacity = "1"; goBtn.textContent = "更新する";
          statusEl.innerHTML = '<span style="color:#22c55e;">✓ 前回のデプロイ先 — そのまま更新できます</span>';
        }
      });
    }

    async function doCheck(){
      var name = subInput.value.toLowerCase().trim().replace(/[^a-z0-9-]/g, "").replace(/^-|-$/g, "");
      if(!name || name.length < 2){ statusEl.textContent = "2文字以上の英数字・ハイフンで入力"; statusEl.style.color = "#ef4444"; return; }
      subInput.value = name;
      statusEl.textContent = "確認中..."; statusEl.style.color = "var(--muted)";
      try{
        var res = await fetch(base + "/api/sede/subdomain-check", { method: "POST", headers: hdrs, body: JSON.stringify({ subdomain: name }) });
        var data = await res.json();
        if(data.available || data.owned){
          statusEl.innerHTML = '<span style="color:#22c55e;">✓ ' + name + '.vocabuquiz.app は' + (data.owned ? '自分のサイトです — 更新可能' : '利用可能です') + '</span>';
          goBtn.disabled = false; goBtn.style.opacity = "1";
          goBtn.textContent = data.owned ? "更新する" : "公開する";
          confirmedName = name;
        } else {
          statusEl.innerHTML = '<span style="color:#ef4444;">✗ ' + (data.error || "他のユーザーが使用中") + '</span>';
          goBtn.disabled = true; goBtn.style.opacity = ".4";
          confirmedName = "";
        }
      }catch(e){ statusEl.textContent = "確認エラー"; statusEl.style.color = "#ef4444"; }
    }
    if(checkBtn) checkBtn.addEventListener("click", doCheck);

    goBtn.addEventListener("click", async function(){
      if(!confirmedName) return;
      goBtn.disabled = true; goBtn.textContent = "公開中...";
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">rocket_launch</span> ' + confirmedName + '.vocabuquiz.app にデプロイ中...', true);
      try{
        var payload = { subdomain: confirmedName };
        /* Use previous deploy's project_id for updates */
        var deployPid = pid || (ses?._deployProjectId) || "";
        if(deployPid){ payload.project_id = deployPid; }
        /* Always send latest code for updates */
        if(latest){ payload.code = latest.code; payload.filename = latest.filename || "index.html"; }
        var res = await fetch(base + "/api/sede/subdomain-deploy", { method: "POST", headers: hdrs, body: JSON.stringify(payload) });
        var data = await res.json();
        if(data.ok && data.url){
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> デプロイ完了！', false);
          /* Save deployed subdomain to session for future updates */
          try{
            var _dSes = (typeof _sedeGetActiveSession === "function") ? _sedeGetActiveSession() : null;
            if(_dSes){ _dSes._deploySubdomain = confirmedName; _dSes._deployUrl = data.url; _dSes._deployProjectId = data.project_id; if(typeof window._sedeSaveSessions === "function") window._sedeSaveSessions(); }
          }catch(e){}
          dialogEl.innerHTML = '<div style="text-align:center;padding:16px;">'
            + '<div style="font-size:24px;margin-bottom:8px;">🚀</div>'
            + '<div style="font-size:15px;font-weight:700;color:var(--text,#eee);margin-bottom:4px;">公開完了！</div>'
            + '<a href="' + data.url + '" target="_blank" rel="noopener" style="color:#6366f1;font-size:14px;font-family:monospace;word-break:break-all;">' + data.url + '</a>'
            + '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">'
            + '<button onclick="navigator.clipboard.writeText(\'' + data.url + '\');this.textContent=\'Copied!\'" style="padding:8px 16px;border-radius:8px;border:none;background:var(--accent,#6366f1);color:#fff;font-size:13px;cursor:pointer;">URLをコピー</button>'
            + '<a href="' + data.url + '" target="_blank" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);color:var(--text);font-size:13px;text-decoration:none;display:inline-flex;align-items:center;">開く ↗</a>'
            + '</div></div>';
          appendMsgDom("ai", "**" + data.url + "** に公開しました！", true);
        } else {
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> デプロイ失敗: ' + (data.error || ""), false);
          statusEl.textContent = "デプロイ失敗: " + (data.error || ""); statusEl.style.color = "#ef4444";
          goBtn.disabled = false; goBtn.textContent = "公開する";
        }
      }catch(e){
        statusEl.textContent = "通信エラー"; statusEl.style.color = "#ef4444";
        goBtn.disabled = false; goBtn.textContent = "公開する";
      }
    });

    cancelBtn.addEventListener("click", function(){ dialogEl.remove(); });
  }

  /* ── Update Dependency Graph ── */
  async function _sedeUpdateDepGraph(){
    var pid = window._sedeActiveProjectId || "";
    if (!pid){ uiToast("プロジェクトを選択してください", "warn"); return; }
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var h = { "Content-Type": "application/json" };
    try { var t = (typeof _authGetToken === "function") ? _authGetToken() : null; if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (t) h.Authorization = "Bearer " + t; } catch(e){}
    uiToast("依存グラフを解析中...", "info");
    try {
      var res = await fetch(base + "/api/sede/depgraph", { method: "POST", headers: h, body: JSON.stringify({ project_id: pid }) });
      var data = await res.json();
      if (data.ok) {
        uiToast("依存グラフ更新完了（" + data.files_analyzed + "ファイル解析）", "ok");
      } else {
        uiToast("依存グラフ更新失敗: " + (data.message || data.code), "ng");
      }
    } catch(e) {
      uiToast("エラー: " + (e.message || ""), "ng");
    }
  }

  /* ── History Panel ── */
  function _sedeToggleHistoryPanel(){
    var rightPane = document.getElementById("sedeRightPane");
    if (!rightPane) return;
    var existing = rightPane.querySelector(".sede-history-panel");
    if (existing){ existing.remove(); return; }
    var panel = document.createElement("div");
    panel.className = "sede-history-panel";
    panel.innerHTML = '<div class="sede-history-head"><span class="ms">history</span> 変更履歴<button type="button"><span class="ms">close</span></button></div><div class="sede-history-list" id="sedeHistoryList"><div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">読み込み中...</div></div>';
    rightPane.style.position = "relative";
    rightPane.appendChild(panel);
    panel.querySelector(".sede-history-head button").addEventListener("click", function(){ panel.remove(); });
    _sedeLoadHistory(panel.querySelector("#sedeHistoryList"));
  }

  async function _sedeLoadHistory(listEl){
    if (!listEl) return;
    var pid = window._sedeActiveProjectId || "";
    if (!pid){ listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">プロジェクトが選択されていません</div>'; return; }
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var h = { "Content-Type": "application/json" };
    try { var t = (typeof _authGetToken === "function") ? _authGetToken() : null; if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (t) h.Authorization = "Bearer " + t; } catch(e){}
    try {
      var res = await fetch(base + "/api/sede/history/" + pid, { method: "GET", headers: h });
      var data = await res.json();
      if (!data.history || !data.history.length){ listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">変更履歴がありません</div>'; return; }
      listEl.innerHTML = "";
      data.history.forEach(function(entry){
        var time = "";
        try { var d = new Date(entry.created_at); time = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); } catch(e){}
        var item = document.createElement("div");
        item.className = "sede-history-item";
        item.innerHTML = '<span class="sede-history-time">' + time + '</span>'
          + '<span class="sede-history-file">' + escHtml(entry.file_path || entry.file_id) + '</span>'
          + '<span class="sede-history-stats"><span class="is-add">+' + entry.add_count + '</span>/<span class="is-del">-' + entry.del_count + '</span></span>'
          + '<button class="sede-history-rollback" type="button" data-rollback-id="' + entry.id + '">戻す</button>';
        listEl.appendChild(item);
      });
      listEl.addEventListener("click", async function(e){
        var btn = e.target.closest("[data-rollback-id]");
        if (!btn) return;
        var hid = btn.getAttribute("data-rollback-id");
        var ok = await uiConfirm("この時点に戻しますか？\nそれ以降の変更は全て取り消されます。", { title: "ロールバック確認", okText: "戻す", cancelText: "キャンセル", danger: true });
        if (!ok) return;
        btn.textContent = "...";
        btn.disabled = true;
        try {
          var rRes = await fetch(base + "/api/sede/rollback", {
            method: "POST", headers: h,
            body: JSON.stringify({ history_id: hid, project_id: pid })
          });
          var rData = await rRes.json();
          if (rData.ok){
            if (rData.content && typeof _sedeUpdateEditor === "function"){
              var latest = _sede.codeHistory[_sede.codeHistory.length - 1];
              _sedeUpdateEditor({ lang: latest?.lang || "txt", code: rData.content, filename: latest?.filename || "file" });
            }
            _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> ロールバック完了（' + rData.rolled_back_count + '件取消）', false);
            _sedeLoadHistory(listEl); /* Refresh list */
          } else {
            uiAlert(rData.message || "ロールバックに失敗しました。");
            btn.textContent = "戻す"; btn.disabled = false;
          }
        } catch(err){
          uiAlert("通信エラー: " + (err?.message || ""));
          btn.textContent = "戻す"; btn.disabled = false;
        }
      });
    } catch(e){
      listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">読み込みエラー</div>';
    }
  }

  /* ── Run code from editor → terminal ── */
  async function _sedeRunFromEditor(block){
    if (!block) return;
    _sedeTerminalClear();
    _sedeTerminalLog("$ Running " + (block.filename || block.lang) + "...", "is-cmd");
    var runBaseUrl = (typeof CHAT_AI_API_URL !== "undefined" ? CHAT_AI_API_URL : "").replace(/\/api\/ai\/chat.*/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var headers = { "Content-Type": "application/json" };
    try { var t = (typeof _authGetToken === "function") ? _authGetToken() : null; if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (t) headers.Authorization = "Bearer " + t; } catch(e){}
    try {
      var res = await fetch(runBaseUrl + "/api/code/run", {
        method: "POST", headers: headers,
        body: JSON.stringify({ language: block.lang || "javascript", code: block.code, mode: "code" })
      });
      var data = await res.json();
      if (!res.ok || data.code){
        _sedeTerminalLog("Error: " + (data.message || "実行エラー"), "is-err");
      } else {
        if (data.output) _sedeTerminalLog(data.output, "is-ok");
        if (data.error) _sedeTerminalLog(data.error, "is-err");
        if (!data.output && !data.error) _sedeTerminalLog("(出力なし)", "");
        if (data.executionTime) _sedeTerminalLog("--- " + data.executionTime + "ms", "");
      }
    } catch(err){
      _sedeTerminalLog("Connection error: " + (err?.message || ""), "is-err");
    }
  }

  /* ── File tab click handler ── */
  if (fileTabs) fileTabs.addEventListener("click", function(e){
    var tab = e.target.closest("[data-sede-file]");
    if (!tab) return;
    var fname = tab.getAttribute("data-sede-file");
    for (var i = _sede.codeHistory.length - 1; i >= 0; i--){
      if ((_sede.codeHistory[i].filename || "") === fname){
        _sedeUpdateEditor(_sede.codeHistory[i]);
        break;
      }
    }
  });

  /* ── Legacy compatibility wrappers ── */
  function openTwoPane(block){
    _sedeUpdateEditor(block);
    _sede.twoPaneOpen = true;
    /* Save to history for diff */
    _sede.codeHistory.push({ lang: block.lang, filename: block.filename, code: block.code });
    /* Restructure: wrap existing scroll+composer in chat pane, add code pane */
    var container = document.createElement("div");
    container.className = "sede-twopane";
    container.id = "sedeTwoPaneContainer";
    /* Chat pane */
    var chatPane = document.createElement("div");
    chatPane.className = "sede-pane-chat";
    /* Move scroll + composer into chat pane */
    if (scrollArea) chatPane.appendChild(scrollArea);
    if (welcomeArea) chatPane.appendChild(welcomeArea);
    if (composerEl) chatPane.appendChild(composerEl);
    container.appendChild(chatPane);
    /* Code pane */
    var codePane = document.createElement("div");
    codePane.className = "sede-pane-code";
    codePane.id = "sedeCodePane";
    /* Toolbar */
    var toolbar = document.createElement("div");
    toolbar.className = "sede-code-toolbar";
    var fnameEl = document.createElement("span");
    fnameEl.className = "sede-code-filename";
    fnameEl.textContent = block.filename || "code.txt";
    toolbar.appendChild(fnameEl);
    var langBadge = document.createElement("span");
    langBadge.className = "sede-code-lang-badge";
    langBadge.textContent = (block.lang || "txt").toUpperCase();
    toolbar.appendChild(langBadge);
    /* Toolbar buttons — ▶ Run added */
    var btns = [
      { icon:"play_arrow", title:"実行", action:"run", cls:"sede-run-btn" },
      { icon:"content_copy", title:"コピー", action:"copy" },
      { icon:"difference", title:"Diff", action:"diff" },
      { icon:"download", title:"ダウンロード", action:"download" },
      { icon:"close", title:"閉じる", action:"close" }
    ];
    btns.forEach(function(b){
      var btn = document.createElement("button");
      btn.className = "sede-code-toolbar-btn" + (b.cls ? " " + b.cls : "");
      btn.type = "button";
      btn.title = b.title;
      btn.setAttribute("aria-label", b.title);
      btn.setAttribute("data-sede-editor-action", b.action);
      btn.innerHTML = '<span class="ms">' + b.icon + '</span>';
      toolbar.appendChild(btn);
    });
    /* Status indicator (success/error) */
    var statusEl = document.createElement("span");
    statusEl.className = "sede-exec-status";
    statusEl.id = "sedeExecStatus";
    toolbar.appendChild(statusEl);
    codePane.appendChild(toolbar);
    /* Editor area */
    var editor = document.createElement("div");
    editor.className = "sede-code-editor";
    editor.id = "sedeCodeEditorArea";
    renderCodeEditor(editor, block);
    codePane.appendChild(editor);
    /* Live preview area (JS/React/HTML) */
    var previewWrap = document.createElement("div");
    previewWrap.className = "sede-preview-wrap";
    previewWrap.id = "sedePreviewWrap";
    previewWrap.style.display = "none";
    previewWrap.innerHTML = '<div class="sede-preview-header"><span class="ms" style="font-size:14px;">visibility</span> プレビュー'
      + '<button class="sede-preview-toggle-console" type="button" title="コンソール" style="margin-left:auto;background:none;border:none;cursor:pointer;color:inherit;font-size:13px;opacity:.7;"><span class="ms" style="font-size:14px;">terminal</span></button>'
      + '<button class="sede-preview-close" type="button" title="閉じる"><span class="ms">close</span></button></div>'
      + '<iframe class="sede-preview-iframe" id="sedePreviewIframe" sandbox="allow-scripts allow-modals allow-same-origin" title="Live Preview"></iframe>'
      + '<div class="sede-preview-console" id="sedePreviewConsole" style="display:none;max-height:150px;overflow-y:auto;background:#1e1e1e;color:#d4d4d4;font-family:monospace;font-size:12px;padding:8px;border-top:1px solid rgba(255,255,255,.1);"></div>';
    previewWrap.querySelector(".sede-preview-toggle-console")?.addEventListener("click", function(){
      var con = document.getElementById("sedePreviewConsole");
      if (con) con.style.display = con.style.display === "none" ? "" : "none";
    });
    previewWrap.querySelector(".sede-preview-close")?.addEventListener("click", function(){ previewWrap.style.display = "none"; });
    codePane.appendChild(previewWrap);
    /* Auto-show preview for web languages */
    var webLangs = ["html","javascript","js","jsx","tsx","typescript","ts","css","react"];
    if (webLangs.indexOf(String(block.lang||"").toLowerCase()) >= 0) {
      _sedeRenderPreview(block);
    }
    /* Terminal area (hidden until first run) */
    var termWrap = document.createElement("div");
    termWrap.className = "sede-terminal-wrap";
    termWrap.id = "sedeTerminalWrap";
    termWrap.style.display = "none";
    termWrap.innerHTML = '<div class="sede-terminal-header"><span class="ms" style="font-size:14px;">terminal</span> ターミナル</div>'
      + '<div class="sede-terminal-output" id="sedeTerminalOutput"></div>'
      + '<div class="sede-terminal-status" id="sedeTerminalStatus"></div>';
    codePane.appendChild(termWrap);
    container.appendChild(codePane);
    wrap.innerHTML = "";
    wrap.appendChild(container);
    scrollToBottom();
    /* Toolbar click handler */
    toolbar.addEventListener("click", function(e){
      var btn = e.target.closest("[data-sede-editor-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-sede-editor-action");
      if (action === "copy"){
        navigator.clipboard.writeText(block.code).then(function(){
          btn.innerHTML = '<span class="ms">check</span>';
          setTimeout(function(){ btn.innerHTML = '<span class="ms">content_copy</span>'; }, 2000);
        });
      } else if (action === "diff"){
        toggleDiffView(editor, block);
      } else if (action === "download"){
        downloadCode(block);
      } else if (action === "close"){
        closeTwoPane();
      } else if (action === "run"){
        _sedeRunCode(block, editor);
      }
    });
  }

  /* ═══ Live Preview (iframe srcdoc + Babel for React/JSX) ═══ */
  function _sedeRenderPreview(block) {
    var previewWrap = document.getElementById("sedePreviewWrap");
    var iframe = document.getElementById("sedePreviewIframe");
    if (!previewWrap || !iframe) return;
    previewWrap.style.display = "";
    var lang = String(block.lang || "").toLowerCase();
    var code = block.code || "";
    var htmlDoc = "";

    /* コンソールキャプチャスクリプト（全HTMLに注入） */
    var _consoleScript = '<script>'
      + 'window.onerror=function(m,s,l,c,e){parent.postMessage({_sedeConsole:true,type:"error",msg:m+" (line "+l+")"},"*");};'
      + 'window.addEventListener("unhandledrejection",function(e){parent.postMessage({_sedeConsole:true,type:"error",msg:"Promise: "+e.reason},"*");});'
      + 'var _origLog=console.log,_origWarn=console.warn,_origErr=console.error;'
      + 'console.log=function(){var a=[].slice.call(arguments).join(" ");parent.postMessage({_sedeConsole:true,type:"log",msg:a},"*");_origLog.apply(console,arguments);};'
      + 'console.warn=function(){var a=[].slice.call(arguments).join(" ");parent.postMessage({_sedeConsole:true,type:"warn",msg:a},"*");_origWarn.apply(console,arguments);};'
      + 'console.error=function(){var a=[].slice.call(arguments).join(" ");parent.postMessage({_sedeConsole:true,type:"error",msg:a},"*");_origErr.apply(console,arguments);};'
      + '<\/script>';

    if (lang === "html" || code.trim().startsWith("<!") || code.trim().startsWith("<html")) {
      /* Plain HTML — inject console capture */
      htmlDoc = code.replace(/<head>/i, '<head>' + _consoleScript);
      if (htmlDoc === code) htmlDoc = _consoleScript + code;
    } else if (/^(jsx|tsx|react)$/.test(lang) || /import\s+React|from\s+['"]react|ReactDOM|useState|useEffect/.test(code)) {
      /* React/JSX — use Babel standalone + React CDN */
      htmlDoc = '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:system-ui,sans-serif;padding:16px;}</style>'
        + '<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>'
        + '<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>'
        + '<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>'
        + '</head><body><div id="root"></div>'
        + '<script type="text/babel" data-presets="react">'
        + _sedeCleanImports(code)
        + '\nconst _root = document.getElementById("root");'
        + '\nif (typeof App !== "undefined") { ReactDOM.createRoot(_root).render(React.createElement(App)); }'
        + '\nelse if (typeof default_export !== "undefined") { ReactDOM.createRoot(_root).render(React.createElement(default_export)); }'
        + '<\/script></body></html>';
    } else if (/^(js|javascript|typescript|ts)$/.test(lang)) {
      /* Plain JS — wrap in HTML */
      htmlDoc = '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:monospace;padding:16px;white-space:pre-wrap;}'
        + '#output{background:#f8f9fa;padding:12px;border-radius:8px;}</style>'
        + '</head><body><div id="output"></div><script>'
        + 'const _out=[];const _origLog=console.log;console.log=function(){_out.push([...arguments].join(" "));document.getElementById("output").textContent=_out.join("\\n");_origLog.apply(console,arguments);};'
        + code
        + '<\/script></body></html>';
    } else if (lang === "css") {
      htmlDoc = '<!DOCTYPE html><html><head><style>' + code + '</style></head><body><div class="preview">CSS Preview</div></body></html>';
    } else {
      previewWrap.style.display = "none";
      return;
    }
    iframe.srcdoc = htmlDoc;
    /* コンソールメッセージ受信 */
    var _consoleHandler = function(e){
      if (!e.data || !e.data._sedeConsole) return;
      var con = document.getElementById("sedePreviewConsole");
      if (!con) return;
      /* エラーが出たら自動で開く */
      if (e.data.type === "error") con.style.display = "";
      var line = document.createElement("div");
      line.style.cssText = "padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05);word-break:break-all;";
      var colors = { log: "#d4d4d4", warn: "#e5c07b", error: "#e06c75" };
      var icons = { log: "▸", warn: "⚠", error: "✕" };
      line.innerHTML = '<span style="color:' + (colors[e.data.type] || "#d4d4d4") + '">'
        + (icons[e.data.type] || "▸") + ' ' + String(e.data.msg || "").replace(/</g, "&lt;").slice(0, 500) + '</span>';
      con.appendChild(line);
      con.scrollTop = con.scrollHeight;
    };
    /* 古いハンドラ除去 + 新規登録 */
    if (window._sedeConsoleHandler) window.removeEventListener("message", window._sedeConsoleHandler);
    window._sedeConsoleHandler = _consoleHandler;
    window.addEventListener("message", _consoleHandler);
  }

  /* Strip import/export statements for Babel (CDN React doesn't need them) */
  function _sedeCleanImports(code) {
    return code
      .replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, "")
      .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, "")
      .replace(/^export\s+default\s+/gm, "var default_export = ")
      .replace(/^export\s+/gm, "");
  }

  /* ═══ Code Execution System ═══ */

  /* Detect dangerous commands */
  var SEDE_DANGEROUS_RE = /\brm\s+(-rf?|--)/i;
  var SEDE_LANG_MAP = {
    "js":"javascript","javascript":"javascript","node":"javascript","ts":"javascript",
    "py":"python","python":"python","python3":"python",
    "java":"java","c":"c","cpp":"c",
    "go":"go","golang":"go",
    "rb":"ruby","ruby":"ruby",
    "bash":"bash","sh":"bash","shell":"bash","zsh":"bash",
    "html":"html"
  };

  function _sedeLangFromBlock(block) {
    var l = String(block.lang || "").trim().toLowerCase();
    return SEDE_LANG_MAP[l] || "auto";
  }

  /* Show confirmation dialog */
  function _sedeConfirmRun(lang, filename, code, isDangerous) {
    return new Promise(function(resolve) {
      var existing = document.getElementById("sedeRunConfirmOverlay");
      if (existing) existing.remove();
      var ov = document.createElement("div");
      ov.className = "sede-run-confirm-overlay";
      ov.id = "sedeRunConfirmOverlay";
      var card = document.createElement("div");
      card.className = "sede-run-confirm-card";
      card.innerHTML = (isDangerous
        ? '<div class="sede-run-confirm-warn"><span class="ms">warning</span> 危険なコマンドが含まれています。本当に実行しますか？</div>'
        : '')
        + '<div class="sede-run-confirm-title">以下のコードを実行しますか？</div>'
        + '<div class="sede-run-confirm-meta"><span>言語：' + (lang || "auto").toUpperCase() + '</span><span>ファイル：' + (filename || "code") + '</span></div>'
        + '<pre class="sede-run-confirm-preview"><code>' + String(code || "").slice(0, 300).replace(/</g,"&lt;") + (code.length > 300 ? "\n..." : "") + '</code></pre>'
        + '<div class="sede-run-confirm-actions">'
        + '<button class="sede-run-confirm-btn is-cancel" type="button"><span class="ms">close</span> キャンセル</button>'
        + '<button class="sede-run-confirm-btn is-run" type="button"><span class="ms">play_arrow</span> 実行</button>'
        + '</div>';
      ov.appendChild(card);
      document.body.appendChild(ov);
      function close(val) { ov.remove(); resolve(val); }
      ov.addEventListener("click", function(e) {
        if (e.target === ov) return close(false);
        if (e.target.closest(".is-cancel")) return close(false);
        if (e.target.closest(".is-run")) return close(true);
      });
      ov.addEventListener("keydown", function(e) { if (e.key === "Escape") close(false); });
    });
  }

  /* Main run function */
  async function _sedeRunCode(block, editorEl) {
    var lang = _sedeLangFromBlock(block);
    var code = block.code;
    var filename = block.filename || "code";

    /* Web languages → live preview (no server needed) */
    var webLangs = ["html","javascript","js","jsx","tsx","typescript","ts","css","react","auto"];
    var isReact = /import\s+React|from\s+['"]react|ReactDOM|useState|useEffect|export\s+default\s+function\s+App/.test(code);
    if (webLangs.indexOf(lang) >= 0 || isReact) {
      var previewBlock = { lang: isReact ? "jsx" : lang, code: code, filename: filename };
      _sedeRenderPreview(previewBlock);
      _sedeAiFeedback(block, { exitCode: 0, output: "ライブプレビューに表示しました", language: lang });
      return;
    }

    var isDangerous = SEDE_DANGEROUS_RE.test(code);

    /* Confirmation dialog (server-side execution only) */
    var ok = await _sedeConfirmRun(lang, filename, code, isDangerous);
    if (!ok) return;

    /* Show terminal */
    var termWrap = document.getElementById("sedeTerminalWrap");
    var termOutput = document.getElementById("sedeTerminalOutput");
    var termStatus = document.getElementById("sedeTerminalStatus");
    var execStatus = document.getElementById("sedeExecStatus");
    if (termWrap) termWrap.style.display = "";
    if (termOutput) termOutput.innerHTML = '<span class="sede-term-prompt">$</span> Running ' + filename + '...\n';
    if (termStatus) { termStatus.className = "sede-terminal-status"; termStatus.textContent = ""; }
    if (execStatus) { execStatus.className = "sede-exec-status is-running"; execStatus.innerHTML = '<span class="ms">sync</span> 実行中...'; }

    /* Clear previous error markers */
    _sedeClearErrorMarkers(editorEl);

    /* Call API — FIX: use window.CHAT_AI_API_URL */
    var runBaseUrl = (window.CHAT_AI_API_URL || "").replace(/\/api\/ai\/chat.*/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var runUrl = runBaseUrl + "/api/code/run";
    var headers = { "Content-Type": "application/json" };
    try {
      var t = String(localStorage.getItem("app.auth.token.v1") || "").trim();
      if (t) headers.Authorization = "Bearer " + t;
    } catch(e){}

    try {
      var res = await fetch(runUrl, {
        method: "POST", headers: headers,
        body: JSON.stringify({ language: lang, code: code, mode: "code" }),
        signal: AbortSignal.timeout(35000)
      });
      var data = await res.json();

      if (!res.ok || data.blocked) {
        _sedeShowTermResult(termOutput, termStatus, execStatus, { error: data.error || data.message || "実行失敗", exitCode: 1 });
        return;
      }

      /* Display result */
      _sedeShowTermResult(termOutput, termStatus, execStatus, data);

      /* VSCode-style error markers in editor */
      if (data.exitCode !== 0 && data.errorLine && editorEl) {
        _sedeShowErrorMarker(editorEl, data.errorLine, data.error);
      } else if (data.exitCode === 0 && editorEl) {
        _sedeShowSuccessMarker(editorEl);
      }

      /* AI feedback — send result to chat */
      _sedeAiFeedback(block, data);

    } catch (err) {
      _sedeShowTermResult(termOutput, termStatus, execStatus, { error: "接続エラー: " + (err?.message || ""), exitCode: 1 });
    }
  }

  /* Show terminal result */
  function _sedeShowTermResult(outputEl, statusEl, execStatusEl, data) {
    if (!outputEl) return;
    var html = '<span class="sede-term-prompt">$</span> ';
    if (data.output) html += '<span class="sede-term-stdout">' + String(data.output).replace(/</g,"&lt;").replace(/\n/g,"\n") + '</span>\n';
    if (data.error) html += '<span class="sede-term-stderr">' + String(data.error).replace(/</g,"&lt;").replace(/\n/g,"\n") + '</span>\n';
    if (data.timeout) html += '<span class="sede-term-stderr">Timeout: 実行時間が制限を超えました</span>\n';
    outputEl.innerHTML = html;
    /* Status bar */
    if (statusEl) {
      var dur = data.duration ? (data.duration + "ms") : "";
      if (data.exitCode === 0) {
        statusEl.className = "sede-terminal-status is-success";
        statusEl.innerHTML = '<span class="ms">check_circle</span> 終了コード 0' + (dur ? " · " + dur : "");
      } else {
        statusEl.className = "sede-terminal-status is-error";
        statusEl.innerHTML = '<span class="ms">error</span> 終了コード ' + data.exitCode + (data.errorLine ? " · " + data.errorLine + "行目" : "") + (dur ? " · " + dur : "");
      }
    }
    /* Tab status */
    if (execStatusEl) {
      if (data.exitCode === 0) {
        execStatusEl.className = "sede-exec-status is-success";
        execStatusEl.innerHTML = '<span class="sede-status-dot is-success"></span> 実行成功';
      } else {
        execStatusEl.className = "sede-exec-status is-error";
        execStatusEl.innerHTML = '<span class="sede-status-dot is-error"></span> エラーあり';
      }
    }
  }

  /* VSCode-style error markers */
  function _sedeClearErrorMarkers(editorEl) {
    if (!editorEl) return;
    editorEl.querySelectorAll(".sede-line-error,.sede-line-success,.sede-line-icon").forEach(function(e){ e.remove(); });
    editorEl.querySelectorAll(".sede-line-highlight").forEach(function(e){ e.classList.remove("sede-line-highlight","is-error","is-success"); });
  }

  function _sedeShowErrorMarker(editorEl, lineNum, errorMsg) {
    var numDiv = editorEl.querySelector(".sede-line-numbers");
    if (!numDiv) return;
    var lineEl = numDiv.children[lineNum - 1];
    if (lineEl) {
      lineEl.classList.add("sede-line-highlight", "is-error");
      var icon = document.createElement("span");
      icon.className = "sede-line-icon is-error ms";
      icon.textContent = "close";
      icon.title = String(errorMsg || "").slice(0, 200);
      lineEl.prepend(icon);
    }
  }

  function _sedeShowSuccessMarker(editorEl) {
    var numDiv = editorEl.querySelector(".sede-line-numbers");
    if (!numDiv) return;
    for (var i = 0; i < numDiv.children.length; i++) {
      numDiv.children[i].classList.add("sede-line-highlight", "is-success");
    }
  }

  /* ═══ AI Feedback — send execution result to chat ═══ */
  function _sedeAiFeedback(block, result) {
    if (!result) return;
    var msg = "";
    if (result.exitCode === 0) {
      msg = "コードを実行しました。結果:\n```\n" + String(result.output || "(出力なし)").slice(0, 2000) + "\n```\n結果を解説してください。";
    } else {
      msg = "コードを実行しましたがエラーになりました。\n\n言語: " + (result.language || block.lang || "不明")
        + "\nエラー:\n```\n" + String(result.error || "不明なエラー").slice(0, 2000) + "\n```\n"
        + (result.errorLine ? "エラー行: " + result.errorLine + "\n" : "")
        + "\n原因を分析して修正コードを提案してください。";
    }
    /* Send to Sede chat as user message */
    if (typeof window._sedeInlineSend === "function") {
      window._sedeInlineSend(msg);
    }
  }

  /* ═══ AI auto-suggest execution (pattern D) ═══ */
  function _sedeCheckAutoRunSuggestion(text) {
    if (!text) return;
    if (/実行して(確認|試|みて)|実行する(と|こと)|を実行/.test(text)) {
      var banner = document.createElement("div");
      banner.className = "sede-autorun-banner";
      banner.innerHTML = '<span class="ms" style="font-size:16px;">play_arrow</span> AIが実行を提案しています'
        + '<button class="sede-autorun-btn" type="button"><span class="ms">play_arrow</span> 実行する</button>';
      var list = document.getElementById("sedeChatListInline");
      if (list) list.appendChild(banner);
      banner.querySelector(".sede-autorun-btn")?.addEventListener("click", function() {
        banner.remove();
        /* Find latest code block and run it */
        var latestBlock = _sede.codeHistory[_sede.codeHistory.length - 1];
        if (latestBlock) {
          var editorEl = document.getElementById("sedeCodeEditorArea");
          _sedeRunCode(latestBlock, editorEl);
        }
      });
    }
  }

  /* Render code in editor with line numbers */
  function renderCodeEditor(editor, block, diffMode){
    var lines = block.code.split("\n");
    if (lines[lines.length-1] === "") lines.pop();
    /* Line numbers */
    var numDiv = document.createElement("div");
    numDiv.className = "sede-line-numbers";
    for (var i = 0; i < lines.length; i++){
      var ln = document.createElement("div");
      ln.textContent = String(i + 1);
      numDiv.appendChild(ln);
    }
    var pre = document.createElement("pre");
    var code = document.createElement("code");
    if (block.lang) code.className = "language-" + block.lang;
    code.textContent = block.code;
    if (typeof hljs !== "undefined") try { hljs.highlightElement(code); } catch(e){}
    pre.appendChild(code);
    editor.innerHTML = "";
    editor.appendChild(numDiv);
    editor.appendChild(pre);
  }

  /* Diff view */
  function toggleDiffView(editor, block){
    if (_sede.codeHistory.length < 2){
      /* No previous code to diff against */
      return;
    }
    var prev = _sede.codeHistory[_sede.codeHistory.length - 2];
    var cur = block;
    var prevLines = prev.code.split("\n");
    var curLines = cur.code.split("\n");
    var maxLen = Math.max(prevLines.length, curLines.length);
    var html = '';
    var numHtml = '';
    for (var i = 0; i < maxLen; i++){
      var pL = prevLines[i];
      var cL = curLines[i];
      var lineNum = String(i + 1);
      if (pL === undefined){
        html += '<div class="sede-diff-add">' + escHtml(cL) + '</div>';
        numHtml += '<div>' + lineNum + '</div>';
      } else if (cL === undefined){
        html += '<div class="sede-diff-del">' + escHtml(pL) + '</div>';
        numHtml += '<div>' + lineNum + '</div>';
      } else if (pL !== cL){
        html += '<div class="sede-diff-del">' + escHtml(pL) + '</div>';
        html += '<div class="sede-diff-add">' + escHtml(cL) + '</div>';
        numHtml += '<div>' + lineNum + '</div><div></div>';
      } else {
        html += '<div>' + escHtml(cL) + '</div>';
        numHtml += '<div>' + lineNum + '</div>';
      }
    }
    editor.innerHTML = '<div class="sede-line-numbers">' + numHtml + '</div>'
      + '<pre style="padding-left:56px;margin:0;min-height:100%;"><code style="display:block;font-size:13px;line-height:1.65;font-family:\'Fira Code\',Consolas,monospace;">' + html + '</code></pre>';
  }

  /* Download code */
  function downloadCode(block){
    var blob = new Blob([block.code], { type:"text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = block.filename || "code.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* Close 2-pane */
  function closeTwoPane(){
    _sede.twoPaneOpen = false;
    /* Clear editor, show empty state */
    if (codeView) codeView.innerHTML = '';
    if (editorEmpty){ editorEmpty.style.display = ''; codeView?.appendChild(editorEmpty); }
    if (fileTabs) fileTabs.innerHTML = '';
    if (editorLang) editorLang.textContent = '--';
  }

  /* ── Mobile: fullscreen code modal ── */
  function openMobileCodeModal(block){
    closeMobileCodeModal();
    var modal = document.createElement("div");
    modal.className = "sede-code-modal";
    modal.id = "sedeCodeModal";
    /* Toolbar */
    var toolbar = document.createElement("div");
    toolbar.className = "sede-code-toolbar";
    var fname = document.createElement("span");
    fname.className = "sede-code-filename";
    fname.textContent = block.filename;
    toolbar.appendChild(fname);
    var langB = document.createElement("span");
    langB.className = "sede-code-lang-badge";
    langB.textContent = (block.lang || "txt").toUpperCase();
    toolbar.appendChild(langB);
    /* Copy */
    var copyB = document.createElement("button");
    copyB.className = "sede-code-toolbar-btn";
    copyB.type = "button";
    copyB.innerHTML = '<span class="ms">content_copy</span>';
    copyB.addEventListener("click", function(){
      navigator.clipboard.writeText(block.code);
      copyB.innerHTML = '<span class="ms">check</span>';
      setTimeout(function(){ copyB.innerHTML = '<span class="ms">content_copy</span>'; }, 2000);
    });
    toolbar.appendChild(copyB);
    /* Download */
    var dlB = document.createElement("button");
    dlB.className = "sede-code-toolbar-btn";
    dlB.type = "button";
    dlB.innerHTML = '<span class="ms">download</span>';
    dlB.addEventListener("click", function(){ downloadCode(block); });
    toolbar.appendChild(dlB);
    /* Close */
    var closeB = document.createElement("button");
    closeB.className = "sede-code-toolbar-btn";
    closeB.type = "button";
    closeB.innerHTML = '<span class="ms">close</span>';
    closeB.addEventListener("click", closeMobileCodeModal);
    toolbar.appendChild(closeB);
    modal.appendChild(toolbar);
    /* Editor */
    var editor = document.createElement("div");
    editor.className = "sede-code-editor";
    renderCodeEditor(editor, block);
    modal.appendChild(editor);
    document.body.appendChild(modal);
    _sede.mobileCodeModal = modal;
  }
  function closeMobileCodeModal(){
    if (_sede.mobileCodeModal){ _sede.mobileCodeModal.remove(); _sede.mobileCodeModal = null; }
    var existing = document.getElementById("sedeCodeModal");
    if (existing) existing.remove();
  }

  /* ── Scroll ── */
  /* ── スクロール制御 ── */
  var _sedeLeftUserScrolled = false;
  var _sedeRightUserScrolled = false;
  var _sedeStreamLongestLen = 0; /* 最長コード追跡用 */

  function scrollToBottom(){
    /* ユーザーが上にスクロール中は強制スクロールしない */
    if (_sedeLeftUserScrolled) return;
    var target = scrollArea;
    if (_sede.twoPaneOpen){
      target = document.querySelector(".sede-pane-chat .sede-chat-scroll-inline") || scrollArea;
    }
    if (target) requestAnimationFrame(function(){ target.scrollTop = target.scrollHeight; });
  }

  /* 左パネル: ユーザースクロール検知 */
  if (scrollArea) {
    scrollArea.addEventListener("scroll", function(){
      if (!_sede.processing) { _sedeLeftUserScrolled = false; return; }
      var diff = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
      _sedeLeftUserScrolled = (diff > 80);
    });
  }

  /* 右パネル自動スクロール（codeViewのスクロールは<pre>内） */
  function _sedeRightScrollToBottom(){
    if (_sedeRightUserScrolled) return;
    var pre = codeView ? codeView.querySelector("pre") : null;
    if (pre) pre.scrollTop = pre.scrollHeight;
  }
  function _sedeInitRightScrollWatch(){
    if (!codeView) return;
    codeView.addEventListener("scroll", function(){
      if (!_sede.processing) { _sedeRightUserScrolled = false; return; }
      var pre = codeView.querySelector("pre");
      if (!pre) return;
      var diff = pre.scrollHeight - pre.scrollTop - pre.clientHeight;
      _sedeRightUserScrolled = (diff > 80);
      /* 下に戻るボタン表示/非表示 */
      var btn = document.getElementById("sedeScrollBottomBtn");
      if (_sedeRightUserScrolled) {
        if (!btn) {
          btn = document.createElement("button");
          btn.id = "sedeScrollBottomBtn";
          btn.type = "button";
          btn.className = "sede-scroll-bottom-btn";
          btn.innerHTML = '<span class="ms">keyboard_arrow_down</span>';
          btn.title = "最新のコードに移動";
          btn.onclick = function(){ _sedeRightUserScrolled = false; _sedeRightScrollToBottom(); btn.remove(); };
          codeView.style.position = "relative";
          codeView.appendChild(btn);
        }
      } else if (btn) { btn.remove(); }
    }, true);
  }
  _sedeInitRightScrollWatch();

  /* ── Auto-grow textarea ── */
  function autoGrow(){
    if (!inputEl) return;
    inputEl.style.height = "0px";
    inputEl.style.height = Math.min(160, Math.max(38, inputEl.scrollHeight)) + "px";
  }

  /* ── Sede slash command definitions ── */
  var SEDE_COMMANDS = [
    { cmd: "deploy",  icon: "rocket_launch", desc: "公開",                hint: "Cloudflare Pagesにデプロイ" },
    { cmd: "test",    icon: "science",       desc: "テスト生成・実行",      hint: "" },
    { cmd: "search",  icon: "search",        desc: "セマンティック検索",     hint: "[キーワード]" },
    { cmd: "history", icon: "history",       desc: "変更履歴・ロールバック",  hint: "" },
    { cmd: "run",     icon: "play_arrow",    desc: "コマンド実行",          hint: "[コマンド]" },
    { cmd: "preview", icon: "visibility",    desc: "プレビュー",            hint: "" }
  ];

  /* ── Sede command detection (client-side) ── */
  function _detectSedeCmd(text){
    var t = String(text || "").trim();
    for (var i = 0; i < SEDE_COMMANDS.length; i++){
      var c = SEDE_COMMANDS[i].cmd;
      if (t === "/" + c || t.startsWith("/" + c + " ")) return c;
    }
    /* Legacy commands → auto-mode (strip prefix, treat as natural language) */
    if (t.startsWith("/fix ") || t.startsWith("/create ") || t.startsWith("/parallel ") ||
        t.startsWith("/rebuild ") || t.startsWith("/new ") || t.startsWith("/extend ") ||
        t.startsWith("/explain ")) return "__auto__";
    return null;
  }

  /* ── Auto-mode detection: Create vs Fix ── */
  function _sedeDetectAutoMode(){
    var hasCode = _sede.codeHistory && _sede.codeHistory.length > 0;
    var existBlock = hasCode ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;
    var hasSubstantialCode = existBlock && existBlock.code && existBlock.code.length > 100;
    if (!hasSubstantialCode){
      /* Also check session's currentCode */
      var ses = (typeof _sedeGetActiveSession === "function") ? _sedeGetActiveSession() : null;
      if (ses && ses.currentCode && ses.currentCode.code && ses.currentCode.code.length > 100) return "fix";
      return "create";
    }
    return "fix";
  }

  /* Parse command + args from text */
  function _parseSedeCmd(text){
    var t = String(text || "").trim();
    var m = t.match(/^\/(\S+)\s*([\s\S]*)$/);
    if (!m) return { command: null, args: t };
    return { command: m[1], args: m[2].trim() };
  }

  /* ── Slash command suggest UI ── */
  var _sedeCmdSuggestEl = null;
  var _sedeCmdActiveIdx = -1;
  var _sedeCmdFiltered = [];

  function _sedeCmdSuggestInit(){
    _sedeCmdSuggestEl = document.getElementById("sedeCmdSuggest");
  }

  function _sedeCmdSuggestShow(filter){
    if (!_sedeCmdSuggestEl) _sedeCmdSuggestInit();
    if (!_sedeCmdSuggestEl) return;
    var q = String(filter || "").toLowerCase();
    _sedeCmdFiltered = SEDE_COMMANDS.filter(function(c){
      return !q || ("/" + c.cmd).indexOf(q) === 0;
    });
    if (!_sedeCmdFiltered.length){ _sedeCmdSuggestHide(); return; }
    _sedeCmdActiveIdx = 0;
    var html = "";
    for (var i = 0; i < _sedeCmdFiltered.length; i++){
      var c = _sedeCmdFiltered[i];
      html += '<div class="sede-cmd-item' + (i === 0 ? " is-active" : "") + '" data-cmd-idx="' + i + '">'
        + '<span class="sede-cmd-icon ms">' + c.icon + '</span>'
        + '<span class="sede-cmd-name">/' + c.cmd + '</span>'
        + '<span class="sede-cmd-desc">' + c.desc + (c.hint ? " " + c.hint : "") + '</span>'
        + '</div>';
    }
    _sedeCmdSuggestEl.innerHTML = html;
    _sedeCmdSuggestEl.classList.add("is-visible");
  }

  function _sedeCmdSuggestHide(){
    if (_sedeCmdSuggestEl) _sedeCmdSuggestEl.classList.remove("is-visible");
    _sedeCmdActiveIdx = -1;
    _sedeCmdFiltered = [];
  }

  function _sedeCmdSuggestNav(dir){
    if (!_sedeCmdFiltered.length) return;
    var items = _sedeCmdSuggestEl?.querySelectorAll(".sede-cmd-item");
    if (!items || !items.length) return;
    if (items[_sedeCmdActiveIdx]) items[_sedeCmdActiveIdx].classList.remove("is-active");
    _sedeCmdActiveIdx = (_sedeCmdActiveIdx + dir + _sedeCmdFiltered.length) % _sedeCmdFiltered.length;
    if (items[_sedeCmdActiveIdx]) items[_sedeCmdActiveIdx].classList.add("is-active");
    items[_sedeCmdActiveIdx].scrollIntoView({ block: "nearest" });
  }

  function _sedeCmdSuggestSelect(){
    if (_sedeCmdActiveIdx < 0 || !_sedeCmdFiltered[_sedeCmdActiveIdx]) return false;
    var c = _sedeCmdFiltered[_sedeCmdActiveIdx];
    if (inputEl){
      inputEl.value = "/" + c.cmd + (c.hint ? " " : "");
      autoGrow();
      inputEl.focus();
    }
    _sedeCmdSuggestHide();
    return true;
  }

  function _sedeCmdSuggestCheck(){
    if (!inputEl) return;
    var val = inputEl.value;
    /* Show suggest only when input starts with "/" and cursor is in the command portion */
    if (val.indexOf("/") === 0){
      var spaceIdx = val.indexOf(" ");
      if (spaceIdx === -1){
        /* Still typing command name */
        _sedeCmdSuggestShow(val);
        return;
      }
    }
    _sedeCmdSuggestHide();
  }

  function _getLatestCodeLines(){
    var latest = _sede.codeHistory[_sede.codeHistory.length - 1];
    if (latest && latest.code) return latest.code.split("\n").length;
    return 0;
  }

  /* ── Client-side unified diff apply (mirrors server _applyUnifiedDiff) ── */
  function _sedeApplyDiffLocal(originalCode, diffText){
    /* New file creation: --- /dev/null */
    if (/^---\s+\/dev\/null/m.test(diffText)){
      return diffText.split("\n")
        .filter(function(l){ return l.startsWith("+") && !l.startsWith("+++"); })
        .map(function(l){ return l.slice(1); })
        .join("\n");
    }
    var origLines = String(originalCode || "").split("\n");
    var dLines = diffText.split("\n");
    var result = origLines.slice(); /* copy */
    var offset = 0;
    for (var i = 0; i < dLines.length; i++){
      var line = dLines[i];
      var hm = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!hm) continue;
      var origStart = parseInt(hm[1], 10) - 1;
      var pos = origStart + offset;
      i++;
      while (i < dLines.length){
        var dl = dLines[i];
        if (dl.startsWith("@@") || dl.startsWith("--- ") || dl.startsWith("+++ ")){ i--; break; }
        if (dl.startsWith("-")){
          if (pos < result.length){ result.splice(pos, 1); offset--; }
        } else if (dl.startsWith("+")){
          result.splice(pos, 0, dl.slice(1));
          pos++; offset++;
        } else {
          pos++;
        }
        i++;
      }
    }
    return result.join("\n");
  }

  /* ── Fix v2 via /api/sede/fix-v2 ── */
  async function _sedeFixV2(instruction, existBlock){
    _sedeSetBusy(true);
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}

    var lastActiveLog = _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">build</span> Fix v2: 修正開始...', true);
    try {
      var res = await fetch(base + "/api/sede/fix-v2", {
        method: "POST", headers: hdrs,
        body: JSON.stringify({
          code: existBlock ? existBlock.code : "",
          instruction: instruction,
          filename: existBlock ? (existBlock.filename || "index.html") : "index.html"
        })
      });
      if (!res.ok || !res.body){
        _sedeCompleteOpLog(lastActiveLog);
        appendMsgDom("ai", "エラー: " + res.status, true);
        return;
      }

      /* SSEループ — _sedeParallelGen と同じイベント処理 */
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      while (true){
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop() || "";
        for (var li = 0; li < lines.length; li++){
          var line = lines[li].trim();
          if (!line || !line.startsWith("data: ")) continue;
          var d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            var ev = JSON.parse(d);
            if (ev.type === "log"){
              _sedeCompleteOpLog(lastActiveLog);
              var logText = String(ev.text || "");
              var icon = "info";
              if (ev.icon === "📖") icon = "description";
              else if (ev.icon === "🔍") icon = "search";
              else if (ev.icon === "✏️") icon = "edit";
              else if (ev.icon === "✅") icon = "check_circle";
              else if (ev.icon === "🧠") icon = "psychology";
              else if (ev.icon === "🚀") icon = "rocket_launch";
              else if (ev.icon === "🔗") icon = "link";
              else if (ev.icon === "⚠️") icon = "warning";
              lastActiveLog = _sedeAddOpLog(
                '<span class="ms" style="font-size:13px;vertical-align:-2px">' + icon + '</span> ' + escHtml(logText),
                logText.includes("中...")
              );
              /* 左パネル展開エリアにもログ追加 */
              var _spLogs = document.getElementById("sedeFixSpinnerLogs");
              if (_spLogs) {
                var _sl = document.createElement("div");
                _sl.style.cssText = "font-size:12px;color:var(--text-secondary,#888);padding:2px 0;";
                _sl.innerHTML = '<span class="ms" style="font-size:12px;vertical-align:-1px">' + icon + '</span> ' + escHtml(logText);
                _spLogs.appendChild(_sl);
              }
              /* 右パネル: 初回のみCanvas風ヘッダーを作成（ログは表示しない、会話のみ） */
              var _cvLog = codeView || document.getElementById("sedeCodeView");
              if (_cvLog && !document.getElementById("sedeFixLogArea")) {
                _cvLog.innerHTML = "";
                var _logArea = document.createElement("div");
                _logArea.id = "sedeFixLogArea";
                _logArea.style.cssText = "padding:0;font-family:system-ui,-apple-system,sans-serif;height:100%;display:flex;flex-direction:column;";
                /* ヘッダー: タイトル + ストップウォッチ */
                var _logHeader = document.createElement("div");
                _logHeader.style.cssText = "padding:16px 20px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));display:flex;align-items:center;justify-content:space-between;";
                _logHeader.innerHTML = '<div style="display:flex;align-items:center;gap:8px;">'
                  + '<span class="ms" style="font-size:18px;color:var(--accent,#6366f1);">code</span>'
                  + '<span id="sedeFixTitle" style="font-size:15px;font-weight:600;color:var(--text-primary,#333);">処理中...</span></div>'
                  + '<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary,#888);">'
                  + '<span class="ms" style="font-size:14px;">timer</span>'
                  + '<span id="sedeFixTimer">0:00</span></div>';
                _logArea.appendChild(_logHeader);
                /* 会話エリア */
                var _logBody = document.createElement("div");
                _logBody.id = "sedeFixLogBody";
                _logBody.style.cssText = "flex:1;overflow-y:auto;padding:20px 24px;";
                _logArea.appendChild(_logBody);
                _cvLog.appendChild(_logArea);
                if (editorEmpty) editorEmpty.style.display = "none";
                if (editorLang) editorLang.textContent = "修正中...";
                /* ストップウォッチ開始 */
                var _timerStart = Date.now();
                window._sedeFixTimerInterval = setInterval(function(){
                  var _elapsed = Math.floor((Date.now() - _timerStart) / 1000);
                  var _min = Math.floor(_elapsed / 60);
                  var _sec = _elapsed % 60;
                  var _el = document.getElementById("sedeFixTimer");
                  if (_el) _el.textContent = _min + ":" + (_sec < 10 ? "0" : "") + _sec;
                }, 1000);
                /* タイトルはサーバーからfix_titleイベントで受信 */
              }
            }
            else if (ev.type === "chat_msg"){
              /* 左パネル: oplog風 */
              var _chatItem2 = document.createElement("div");
              _chatItem2.className = "sede-oplog-item";
              _chatItem2.innerHTML = '<div class="sede-oplog-dot is-done" style="background:var(--accent,#6366f1)"></div>'
                + '<div class="sede-oplog-text" style="font-size:13.5px;color:var(--text-primary,#333);line-height:1.6;font-weight:500;">' + parseMarkdown(ev.text || "") + '</div>';
              var _spChat = document.getElementById("sedeFixV2Spinner");
              if (_spChat && _spChat.parentNode === chatList) chatList.insertBefore(_chatItem2, _spChat);
              else if (chatList) chatList.appendChild(_chatItem2);
              scrollToBottom();
              /* 右パネルにも会話（自然な会話表示） */
              var _logBody2 = document.getElementById("sedeFixLogBody");
              if (_logBody2) {
                var _chatBubble = document.createElement("div");
                _chatBubble.style.cssText = "margin-bottom:16px;font-size:14px;line-height:1.7;color:var(--text-primary,#333);";
                _chatBubble.innerHTML = parseMarkdown(ev.text || "");
                /* コードブロックにスタイル適用 */
                _chatBubble.querySelectorAll("pre").forEach(function(pre){
                  pre.style.cssText = "background:var(--bg-tertiary,#f5f5f5);border-radius:8px;padding:12px;margin:8px 0;overflow-x:auto;font-size:13px;";
                });
                _chatBubble.querySelectorAll("code").forEach(function(c){
                  if (!c.parentElement || c.parentElement.tagName !== "PRE") {
                    c.style.cssText = "background:rgba(0,0,0,.06);padding:1px 4px;border-radius:3px;font-size:0.9em;";
                  }
                });
                _logBody2.appendChild(_chatBubble);
                _logBody2.scrollTop = _logBody2.scrollHeight;
              }
            }
            else if (ev.type === "fix_title"){
              var _titleEl = document.getElementById("sedeFixTitle");
              if (_titleEl && ev.text) _titleEl.textContent = ev.text;
            }
            else if (ev.type === "spinner"){
              var _existSp = document.getElementById("sedeFixV2Spinner");
              if (!_existSp) {
                _existSp = document.createElement("details");
                _existSp.id = "sedeFixV2Spinner";
                _existSp.className = "sede-fix-spinner-details";
                _existSp.style.cssText = "margin:8px 0;";
                _existSp.innerHTML = '<summary style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;font-size:13px;color:var(--text-secondary,#666);list-style:none;">'
                  + '<div class="sede-spinner-icon" style="width:16px;height:16px;"></div>'
                  + '<span class="sede-spinner-text" style="flex:1;">処理中...</span>'
                  + '<span class="ms" style="font-size:14px;opacity:.5;transition:transform .2s;">expand_more</span>'
                  + '</summary>'
                  + '<div class="sede-fix-spinner-logs" id="sedeFixSpinnerLogs" style="padding:4px 0 4px 24px;border-left:2px solid var(--border,rgba(0,0,0,.08));margin-left:8px;"></div>';
                if (chatList) chatList.appendChild(_existSp);
                scrollToBottom();
              }
              var _spT = _existSp.querySelector(".sede-spinner-text");
              if (_spT) _spT.textContent = ev.text || "処理中...";
            }
            else if (ev.type === "code_preview"){
              /* スピナー + ログエリア削除 + タイマー停止 */
              var _sp2 = document.getElementById("sedeFixV2Spinner");
              if (_sp2) _sp2.remove();
              if (window._sedeFixTimerInterval) { clearInterval(window._sedeFixTimerInterval); window._sedeFixTimerInterval = null; }
              var _logArea3 = document.getElementById("sedeFixLogArea");
              if (_logArea3) _logArea3.remove();
              var _cv = codeView || document.getElementById("sedeCodeView");
              if (_cv && ev.code) {
                var _pLines = ev.code.split("\n");
                if (_pLines[_pLines.length - 1] === "") _pLines.pop();
                var _numDiv = document.createElement("div");
                _numDiv.className = "sede-line-numbers";
                for (var _pi = 0; _pi < _pLines.length; _pi++){
                  var _ln2 = document.createElement("div"); _ln2.textContent = String(_pi + 1); _numDiv.appendChild(_ln2);
                }
                var _pre = document.createElement("pre");
                var _code = document.createElement("code");
                _code.textContent = ev.code;
                _pre.appendChild(_code);
                _cv.innerHTML = "";
                _cv.appendChild(_numDiv);
                _cv.appendChild(_pre);
                if (editorLang) editorLang.textContent = _pLines.length + "行";
                if (editorEmpty) editorEmpty.style.display = "none";
              }
            }
            else if (ev.type === "fix_diff_ready"){
              _sedeCompleteOpLog(lastActiveLog);
              var _sp3 = document.getElementById("sedeFixV2Spinner");
              if (_sp3) _sp3.remove();
              var _fname = ev.file_path || "index.html";
              if (ev.explanation) appendMsgDom("ai", ev.explanation, true);
              /* 承認カード */
              var card = document.createElement("div");
              card.className = "sede-approve-bar";
              card.innerHTML = '<div class="sede-approve-file"><span class="ms" style="font-size:16px;vertical-align:-3px">edit_note</span> '
                + escHtml(_fname) + ' <span class="add">+' + (ev.add_count || 0) + '</span></div>'
                + '<div class="sede-diff-card-btns">'
                + '<button class="sede-diff-card-btn is-apply" type="button" data-diff-action="apply">✅ 適用する</button>'
                + '<button class="sede-diff-card-btn is-reject" type="button" data-diff-action="reject">❌ 拒否する</button>'
                + '</div>';
              chatList.appendChild(card);
              scrollToBottom();
              await new Promise(function(resolve){
                card.addEventListener("click", async function handler(e){
                  var btn = e.target.closest("[data-diff-action]");
                  if (!btn) return;
                  card.removeEventListener("click", handler);
                  if (btn.getAttribute("data-diff-action") === "apply"){
                    var newCode = ev.diff ? _sedeApplyDiffLocal("", ev.diff) : "";
                    if (newCode) {
                      var _newBlock = { lang: "html", code: newCode, filename: _fname };
                      _sedeUpdateEditor(_newBlock);
                      if (existBlock) existBlock.code = newCode;
                      try { _sedeRenderPreview(_newBlock); } catch(_pe){}
                    }
                    card.innerHTML = '<div style="color:#22c55e">✅ 適用しました (' + (ev.add_count||0) + '行)</div>';
                  } else {
                    card.innerHTML = '<div style="color:#ef4444">❌ 拒否しました</div>';
                  }
                  resolve();
                });
              });
            }
            else if (ev.type === "error"){
              _sedeCompleteOpLog(lastActiveLog);
              var _sp4 = document.getElementById("sedeFixV2Spinner");
              if (_sp4) _sp4.remove();
              appendMsgDom("ai", "エラー: " + (ev.text || ev.message || ""), true);
            }
          } catch(e){ console.warn("[Sede/FixV2] parse:", e); }
        }
      }
      _sedeCompleteOpLog(lastActiveLog);
    } catch(err){
      appendMsgDom("ai", "通信エラー: " + (err?.message || ""), true);
    } finally {
      _sede.processing = false;
      if (sendBtn) sendBtn.disabled = false;
      _sedeSetBusy(false);
      scrollToBottom();
    }
  }

  /* ── Parallel generation via /api/sede/parallel-gen ── */
  async function _sedeParallelGen(instruction){
    _sedeSetBusy(true);
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}

    var lastActiveLog = _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">rocket_launch</span> 3並列生成を開始...', true);
    try {
      var res = await fetch(base + "/api/sede/parallel-gen", {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ instruction: instruction })
      });
      if (!res.ok || !res.body){
        _sedeCompleteOpLog(lastActiveLog);
        appendMsgDom("ai", "エラー: " + res.status, true);
        return;
      }

      /* SSEループ — _sedeQuickFixと同じイベント形式を処理 */
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      while (true){
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop() || "";
        for (var li = 0; li < lines.length; li++){
          var line = lines[li].trim();
          if (!line || !line.startsWith("data: ")) continue;
          var d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            var ev = JSON.parse(d);
            if (ev.type === "log"){
              _sedeCompleteOpLog(lastActiveLog);
              var logText = String(ev.text || "");
              var icon = "info";
              if (ev.icon === "🧠") icon = "psychology";
              else if (ev.icon === "🚀") icon = "rocket_launch";
              else if (ev.icon === "✅") icon = "check_circle";
              else if (ev.icon === "⏳") icon = "hourglass_empty";
              else if (ev.icon === "🔗") icon = "link";
              else if (ev.icon === "⚠️") icon = "warning";
              lastActiveLog = _sedeAddOpLog(
                '<span class="ms" style="font-size:13px;vertical-align:-2px">' + icon + '</span> ' + escHtml(logText),
                logText.includes("中...")
              );
            }
            else if (ev.type === "spinner"){
              /* ぐるぐるスピナー + テキスト更新 */
              var _existSpinner = document.getElementById("sedeParallelSpinner");
              if (!_existSpinner) {
                _existSpinner = document.createElement("div");
                _existSpinner.id = "sedeParallelSpinner";
                _existSpinner.className = "sede-spinner";
                _existSpinner.innerHTML = '<div class="sede-spinner-icon"></div> <span class="sede-spinner-text"></span>';
                if (chatList) chatList.appendChild(_existSpinner);
                scrollToBottom();
              }
              var _spText = _existSpinner.querySelector(".sede-spinner-text");
              if (_spText) _spText.textContent = ev.text || "処理中...";
            }
            else if (ev.type === "chat_msg"){
              /* oplog風の丸つなぎで表示 */
              var _chatItem = document.createElement("div");
              _chatItem.className = "sede-oplog-item";
              _chatItem.innerHTML = '<div class="sede-oplog-dot is-done" style="background:var(--accent,#6366f1)"></div>'
                + '<div class="sede-oplog-text" style="font-size:13.5px;color:var(--text-primary,#333);line-height:1.6;font-weight:500;">' + parseMarkdown(ev.text || "") + '</div>';
              var _sp = document.getElementById("sedeParallelSpinner");
              if (_sp && _sp.parentNode === chatList) {
                chatList.insertBefore(_chatItem, _sp);
              } else if (chatList) {
                chatList.appendChild(_chatItem);
              }
              scrollToBottom();
            }
            else if (ev.type === "code_preview"){
              var _cv = codeView || document.getElementById("sedeCodeView");
              if (_cv && ev.code) {
                var _pLines = ev.code.split("\n");
                if (_pLines[_pLines.length - 1] === "") _pLines.pop();
                var _numDiv = document.createElement("div");
                _numDiv.className = "sede-line-numbers";
                for (var _pi = 0; _pi < _pLines.length; _pi++){
                  var _ln2 = document.createElement("div"); _ln2.textContent = String(_pi + 1); _numDiv.appendChild(_ln2);
                }
                var _pre = document.createElement("pre");
                var _code = document.createElement("code");
                _code.textContent = ev.code;
                _pre.appendChild(_code);
                _cv.innerHTML = "";
                _cv.appendChild(_numDiv);
                _cv.appendChild(_pre);
                if (editorLang) editorLang.textContent = _pLines.length + "行 生成完了";
                if (editorEmpty) editorEmpty.style.display = "none";
                _pre.scrollTop = _pre.scrollHeight;
              }
            }
            else if (ev.type === "fix_diff_ready"){
              _sedeCompleteOpLog(lastActiveLog);
              /* スピナー削除 */
              var _remSpinner = document.getElementById("sedeParallelSpinner");
              if (_remSpinner) _remSpinner.remove();
              var _fname = ev.file_path || "index.html";
              if (ev.explanation) appendMsgDom("ai", ev.explanation, true);
              /* 承認カード */
              var card = document.createElement("div");
              card.className = "sede-approve-bar";
              card.innerHTML = '<div class="sede-approve-file"><span class="ms" style="font-size:16px;vertical-align:-3px">edit_note</span> '
                + escHtml(_fname) + ' <span class="add">+' + (ev.add_count || 0) + '</span></div>'
                + '<div class="sede-diff-card-btns">'
                + '<button class="sede-diff-card-btn is-apply" type="button" data-diff-action="apply">✅ 適用する</button>'
                + '<button class="sede-diff-card-btn is-reject" type="button" data-diff-action="reject">❌ 拒否する</button>'
                + '</div>';
              chatList.appendChild(card);
              scrollToBottom();
              await new Promise(function(resolve){
                card.addEventListener("click", async function handler(e){
                  var btn = e.target.closest("[data-diff-action]");
                  if (!btn) return;
                  card.removeEventListener("click", handler);
                  if (btn.getAttribute("data-diff-action") === "apply"){
                    var newCode = ev.diff ? _sedeApplyDiffLocal("", ev.diff) : "";
                    if (newCode) {
                      _sedeUpdateEditor({ lang: "html", code: newCode, filename: _fname });
                      try { _sedeRenderPreview({ lang: "html", code: newCode }); } catch(_pe){}
                    }
                    card.innerHTML = '<div style="color:#22c55e">✅ 適用しました (' + (ev.add_count||0) + '行)</div>';

                    /* ── Phase 4: 自動テスト → 自動fix ── */
                    if (newCode && _fname.endsWith(".html") && typeof _sedeAutoVerify === "function") {
                      _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">play_arrow</span> Phase 4: 動作テスト中...', true);
                      var _p4Errors = await _sedeAutoVerify(newCode, 4000);
                      if (_p4Errors.length > 0) {
                        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">warning</span> JSエラー ' + _p4Errors.length + '件検出。自動修正中...', true);
                        appendMsgDom("ai", "⚠️ JSエラー検出: " + _p4Errors.slice(0,3).join("; ") + "\n自動修正を実行します...", true);
                        /* 自動fixを最大2回 */
                        var _p4Block = { lang: "html", code: newCode, filename: _fname };
                        for (var _p4Round = 0; _p4Round < 2 && _p4Errors.length > 0; _p4Round++) {
                          await _sedeFixNew("以下のJSエラーを全て修正してください:\n" + _p4Errors.join("\n"), _p4Block, _p4Round + 1);
                          /* fix後のコードで再テスト */
                          var _p4Latest = _sede.codeHistory.length ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;
                          if (_p4Latest && _p4Latest.code) {
                            _p4Block = _p4Latest;
                            _p4Errors = await _sedeAutoVerify(_p4Latest.code, 4000);
                            if (_p4Errors.length === 0) {
                              _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">check_circle</span> Phase 4: 全エラー解消 ✓', false);
                              break;
                            }
                          } else { break; }
                        }
                        if (_p4Errors.length > 0) {
                          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">info</span> 残りエラー ' + _p4Errors.length + '件。/fix で手動修正してください。', false);
                        }
                      } else {
                        _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">check_circle</span> Phase 4: テスト通過 ✓ エラーなし', false);
                      }
                    }
                  } else {
                    card.innerHTML = '<div style="color:#ef4444">❌ 拒否しました</div>';
                  }
                  resolve();
                });
              });
            }
            else if (ev.type === "error"){
              _sedeCompleteOpLog(lastActiveLog);
              appendMsgDom("ai", "エラー: " + (ev.text || ev.message || ""), true);
            }
          } catch(e){ console.warn("[Sede/Parallel] parse:", e); }
        }
      }
      _sedeCompleteOpLog(lastActiveLog);
    } catch(err){
      appendMsgDom("ai", "通信エラー: " + (err?.message || ""), true);
    } finally {
      _sede.processing = false;
      if (sendBtn) sendBtn.disabled = false;
      _sedeSetBusy(false);
      _sedeLeftUserScrolled = false;
      _sedeRightUserScrolled = false;
      _sedeStreamLongestLen = 0;
      scrollToBottom();
    }
  }

  /* ── Non-project quick fix via /api/sede/quick-fix ── */
  async function _sedeQuickFix(instruction, mode, existBlock){
    _sedeSetBusy(true);
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}

    var fname = existBlock ? (existBlock.filename || "file." + (existBlock.lang || "txt")) : "file.txt";
    /* ── Claude Code style: show initial operation logs ── */
    _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">folder_open</span> <code>' + escHtml(fname) + '</code>', false);
    var opRead = _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">description</span> Read <code>' + escHtml(fname) + '</code>', true);
    try {
      /* 停止ボタン用に AbortController を公開 */
      var _abortCtrl = new AbortController();
      if(window._sede) window._sede.abortController = _abortCtrl;
      var res = await fetch(base + "/api/sede/quick-fix", {
        method: "POST", headers: hdrs,
        body: JSON.stringify({
          code: existBlock ? existBlock.code : "",
          instruction: instruction,
          filename: fname,
          mode: mode,
          model: (window._sede && window._sede.selectedModel) || "sprout-3"
        }),
        signal: _abortCtrl.signal
      });
      console.log("[Sede QuickFix] status:", res.status, "ct:", res.headers.get("content-type"));
      if (!res.ok || !res.body){
        _sedeCompleteOpLog(opRead);
        appendMsgDom("ai", "エラー: " + res.status, true);
        return;
      }

      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      var lastActiveLog = opRead;
      while (true){
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop() || "";
        for (var li = 0; li < lines.length; li++){
          var line = lines[li].trim();
          if (!line || !line.startsWith("data: ")) continue;
          var d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            var ev = JSON.parse(d);
            if (ev.type === "thinking"){ /* already showing */ }
            else if (ev.type === "log"){
              /* Claude Code style operation log */
              _sedeCompleteOpLog(lastActiveLog);
              /* Map emoji prefixes to Material Symbols icons */
              var logText = String(ev.text || "");
              var icon = "info";
              if (logText.startsWith("📖")){ icon = "description"; logText = logText.replace(/^📖\s*/, ""); }
              else if (logText.startsWith("🔍")){ icon = "search"; logText = logText.replace(/^🔍\s*/, ""); }
              else if (logText.startsWith("✏️")){ icon = "edit"; logText = logText.replace(/^✏️\s*/, ""); }
              lastActiveLog = _sedeAddOpLog(
                '<span class="ms" style="font-size:13px;vertical-align:-2px">' + icon + '</span> ' + escHtml(logText),
                logText.includes("生成中")
              );
            }
            else if (ev.type === "diff"){
              _sedeCompleteOpLog(lastActiveLog);
              var addC = ev.add_count || 0, delC = ev.del_count || 0;
              var diffStr = ev.diff || "";
              /* ── Log: Edit filename +N/-N ── */
              _sedeAddOpLog(
                '<span class="ms" style="font-size:13px;vertical-align:-2px">edit</span> Edit <code>'
                + escHtml(ev.filename || fname)
                + '</code> <span style="color:#22c55e">+' + addC + '</span><span style="color:#ef4444">/-' + delC + '</span>',
                false
              );
              /* ── Show inline diff in LEFT chat pane ── */
              _sedeRenderDiffInChat(diffStr, ev.filename || fname);
              /* ── Show explanation as AI message ── */
              if (ev.explanation) appendMsgDom("ai", ev.explanation, true);
              /* ── Show diff in RIGHT editor pane ── */
              var _cv = codeView || document.getElementById("sedeCodeView");
              if (_cv) _sedeRenderDiffInEditor(diffStr, _cv);
              /* ── Approval card (per-edit) ── */
              var approved = await _sedeShowDiffApproval(
                ev.filename || fname, addC, delC, diffStr, (existBlock?.lang || "txt")
              );
              if (approved){
                var srcCode = existBlock ? existBlock.code : "";
                var newCode = _sedeApplyDiffLocal(srcCode, diffStr);
                var newLang = existBlock ? (existBlock.lang || "txt") : ((ev.filename || "").split(".").pop() || "txt");
                var newFname = existBlock ? (existBlock.filename || ev.filename || fname) : (ev.filename || fname);
                _sedeUpdateEditor({ lang: newLang, code: newCode, filename: newFname });
                /* Update existBlock for subsequent edits in same session */
                if (existBlock){ existBlock.code = newCode; }
                _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 変更を適用しました', false);
              } else {
                if (existBlock) _sedeUpdateEditor(existBlock);
                _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 変更を拒否しました', false);
              }
            } else if (ev.type === "code_preview"){
              /* リアルタイムコードプレビュー: 右パネルに生成中コード表示 */
              /* openTwoPaneはblock引数必須 — ストリーミング中は直接codeViewに書く */
              var _cv = codeView || document.getElementById("sedeCodeView");
              if (_cv && ev.code) {
                var _pLines = ev.code.split("\n");
                if (_pLines[_pLines.length - 1] === "") _pLines.pop();
                var _numDiv = document.createElement("div");
                _numDiv.className = "sede-line-numbers";
                for (var _pi = 0; _pi < _pLines.length; _pi++){
                  var _ln2 = document.createElement("div"); _ln2.textContent = String(_pi + 1); _numDiv.appendChild(_ln2);
                }
                var _pre = document.createElement("pre");
                var _code = document.createElement("code");
                _code.textContent = ev.code;
                _pre.appendChild(_code);
                _cv.innerHTML = "";
                _cv.appendChild(_numDiv);
                _cv.appendChild(_pre);
                if (editorLang) editorLang.textContent = (ev.lines || 0) + "行 生成中...";
                if (editorEmpty) editorEmpty.style.display = "none";
                _pre.scrollTop = _pre.scrollHeight;
              }
            } else if (ev.type === "chat_msg"){
              appendMsgDom("ai", ev.text || "", true);
              if(typeof _sedeAddLogChat === "function") _sedeAddLogChat(ev.text || "");
            } else if (ev.type === "raw_response"){
              _sedeCompleteOpLog(lastActiveLog);
              var _rawText = (typeof ev.text === "string") ? ev.text : JSON.stringify(ev.text || ev, null, 2);
              appendMsgDom("ai", _rawText, true);
            } else if (ev.type === "error"){
              _sedeCompleteOpLog(lastActiveLog);
              appendMsgDom("ai", "エラー: " + (ev.text || ev.message || "不明なエラー"), true);
            }
          } catch(e){ console.warn("[Sede QuickFix] parse error:", e); }
        }
      }
      _sedeCompleteOpLog(lastActiveLog);
    } catch(err){
      appendMsgDom("ai", "通信エラー: " + (err?.message || ""), true);
    } finally {
      _sede.processing = false;
      if (sendBtn) sendBtn.disabled = false;
      _sedeSetBusy(false);
      scrollToBottom();
    }
  }

  /* ── Fix Log: 折りたたみ＋セッション保存 ── */
  function _sedeCollapseFixLogs(marker, logTexts, filename, applied, addCount, delCount, diffText){
    if (!chatList) { console.error("[FixLog] chatList is null"); return; }
    /* ── 1. まずセッションに保存（DOM操作の前に確実に） ── */
    var _fixLogSaved = false;
    try {
      var ses = _sedeGetActiveSession();
      console.log("[FixLog] ses:", !!ses, "sesId:", ses?.id, "msgCount:", ses?.messages?.length);
      if (ses) {
        var _fixLogEntry = {
          role: "ai",
          text: "[FIX_LOG]" + JSON.stringify({
            logs: logTexts,
            result: applied ? "applied" : "rejected",
            file: filename || "",
            add: addCount || 0,
            del: delCount || 0,
            diff: (diffText || "").slice(0, 5000)
          }),
          ts: Date.now()
        };
        ses.messages.push(_fixLogEntry);
        ses.updatedAt = Date.now();
        if (typeof window._sedeSaveSessions === "function") {
          window._sedeSaveSessions();
          _fixLogSaved = true;
          console.log("[FixLog] SAVED OK. Total messages:", ses.messages.length);
        } else {
          console.error("[FixLog] _sedeSaveSessions not found");
        }
      } else {
        console.error("[FixLog] No active session!");
      }
    } catch(e){ console.error("[FixLog] save error:", e); }
    if (!_fixLogSaved) {
      /* セッション保存失敗時：直接localStorageに書く */
      console.warn("[FixLog] Fallback: direct localStorage write");
      try {
        var raw = localStorage.getItem("app.sede.sessions.v1");
        var sessions = raw ? JSON.parse(raw) : [];
        if (sessions[0]) {
          sessions[0].messages.push({
            role: "ai",
            text: "[FIX_LOG]" + JSON.stringify({ logs: logTexts, result: applied ? "applied" : "rejected", file: filename || "", add: addCount || 0, del: delCount || 0, diff: (diffText || "").slice(0, 5000) }),
            ts: Date.now()
          });
          sessions[0].updatedAt = Date.now();
          localStorage.setItem("app.sede.sessions.v1", JSON.stringify(sessions));
          console.log("[FixLog] Fallback save OK");
        }
      } catch(e2){ console.error("[FixLog] Fallback also failed:", e2); }
    }

    /* ── 2. DOM折りたたみ（マーカーがなくてもセッション保存は完了済み） ── */
    if (!marker || !marker.parentNode) return;
    var items = [];
    var node = marker.nextSibling;
    while (node) {
      var next = node.nextSibling;
      items.push(node);
      chatList.removeChild(node);
      node = next;
    }
    chatList.removeChild(marker);
    var det = document.createElement("details");
    det.className = "sede-fix-log-group";
    var resHtml = applied
      ? '<span style="color:#22c55e">✅ 適用済み</span>'
      : '<span style="color:#ef4444">❌ 拒否</span>';
    var smr = document.createElement("summary");
    smr.innerHTML = '<span class="ms" style="font-size:13px;vertical-align:-2px">build</span> '
      + '差分修正 <code>' + escHtml(filename || "") + '</code> '
      + '<span style="color:#22c55e">+' + (addCount || 0) + '</span>'
      + '<span style="color:#ef4444">/-' + (delCount || 0) + '</span> '
      + resHtml;
    det.appendChild(smr);
    var bd = document.createElement("div");
    bd.className = "sede-fix-log-body";
    items.forEach(function(it){ bd.appendChild(it); });
    det.appendChild(bd);
    chatList.appendChild(det);
    scrollToBottom();
  }

  /* ── 自動動作チェック: iframeでHTML実行してJSエラーをキャッチ ── */
  function _sedeAutoVerify(htmlCode, timeoutMs){
    return new Promise(function(resolve){
      var errors = [];
      var iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:400px;height:300px;border:none;opacity:0;pointer-events:none;";
      iframe.sandbox = "allow-scripts allow-same-origin";

      /* エラーキャッチ用のスクリプトを注入 */
      var errorScript = '<script>'
        + 'window.onerror=function(m,s,l,c,e){parent.postMessage({_sedeErr:true,msg:m,line:l,col:c},"*");};'
        + 'window.addEventListener("unhandledrejection",function(e){parent.postMessage({_sedeErr:true,msg:"UnhandledRejection: "+e.reason},"*");});'
        + '<\/script>';
      var injected = htmlCode.replace(/<head>/i, '<head>' + errorScript);
      if (injected === htmlCode) injected = errorScript + htmlCode;

      function onMsg(e){
        if (e.data && e.data._sedeErr) {
          errors.push((e.data.msg || "Unknown error") + (e.data.line ? " (line " + e.data.line + ")" : ""));
        }
      }
      window.addEventListener("message", onMsg);

      iframe.srcdoc = injected;
      document.body.appendChild(iframe);

      setTimeout(function(){
        window.removeEventListener("message", onMsg);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve(errors);
      }, timeoutMs || 3000);
    });
  }

  /* ── Non-project /fix: New 3-step flow handler ── */
  async function _sedeFixNew(instruction, existBlock, _autoRound){
    _sedeSetBusy(true);
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}

    var fname = existBlock ? (existBlock.filename || "file." + (existBlock.lang || "txt")) : "file.txt";
    /* ログ追跡（永続化＋折りたたみ用） — マーカー方式 */
    var _round = _autoRound || 0;
    var _fixMarker = document.createElement("div");
    _fixMarker.className = "sede-fix-marker";
    _fixMarker.style.display = "none";
    if (chatList) chatList.appendChild(_fixMarker);
    if (_round > 0) {
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">auto_fix_high</span> 自動修正 ラウンド ' + _round + '/2', false);
    }
    var _fixLogTexts = [_round > 0 ? "🔄 自動修正 ラウンド " + _round : "🔧 差分修正モード"];

    try {
      var _abortCtrl2 = new AbortController();
      if(window._sede) window._sede.abortController = _abortCtrl2;
      var res = await fetch(base + "/api/sede/quick-fix", {
        method: "POST", headers: hdrs,
        body: JSON.stringify({
          code: existBlock ? existBlock.code : "",
          instruction: instruction,
          filename: fname,
          mode: "fix",
          model: (window._sede && window._sede.selectedModel) || "sprout-3"
        }),
        signal: _abortCtrl2.signal
      });
      if (!res.ok || !res.body){
        appendMsgDom("ai", "エラー: " + res.status, true);
        return;
      }

      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      while (true){
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop() || "";
        for (var li = 0; li < lines.length; li++){
          var line = lines[li].trim();
          if (!line || !line.startsWith("data: ")) continue;
          var d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            var ev = JSON.parse(d);

            if (ev.type === "fix_diff_ready" || ev.type === "error") {
              /* スピナー削除（diff完了 or エラー時のみ） */
              if (window._sedeFixSpinner && window._sedeFixSpinner.parentNode) {
                window._sedeFixSpinner.parentNode.removeChild(window._sedeFixSpinner);
                window._sedeFixSpinner = null;
              }
              if (window._sedeFixSpinnerTimer) { clearInterval(window._sedeFixSpinnerTimer); window._sedeFixSpinnerTimer = null; }
            }
            /* ログ到着でスピナーテキスト更新 */
            if (ev.type === "log" && window._sedeFixSpinner) {
              var _logTexts = {
                "📖": ["ファイルの中身を確認中...", "コードを読み込んでいます...", "ソースコードをスキャン中..."],
                "🔍": ["修正箇所を特定中...", "該当するコードを見つけています...", "パターンマッチング中...", "関連箇所をリストアップ中..."],
                "✏️": ["差分を生成しています...", "修正コードを書いています...", "変更箇所を組み立て中...", "コードを書き換え中..."],
                "✅": ["最終チェック中...", "もう少しで完了です...", "仕上げに入っています..."],
                "⚠️": ["問題を確認中...", "警告内容を分析中..."],
                "🧠": ["Embedding検索中...", "関連コードを探しています...", "コンテキストを収集中..."],
                "🔧": ["外部APIを呼び出し中...", "ツール実行中...", "データ取得中..."],
                "🚀": ["並列生成中...", "マルチファイル生成中..."],
                "🔗": ["整合性チェック中...", "ファイル間の依存を検証中..."],
                "📦": ["コードを変換中...", "diff形式に変換中..."],
                "📊": ["結果を分析中...", "出力を確認中..."],
                "🎉": ["完了しました！", "生成完了！"]
              };
              var _candidates = _logTexts[ev.icon] || ["処理中..."];
              var _st2 = window._sedeFixSpinner.querySelector(".sede-spinner-text");
              if (_st2) _st2.textContent = _candidates[Math.floor(Math.random() * _candidates.length)];
            }
            if (ev.type === "tool_result"){
              /* ツールコール結果の表示 */
              var _toolDiv = document.createElement("div");
              _toolDiv.className = "sede-log-tool-result";
              _toolDiv.style.cssText = "margin:4px 0;padding:8px 12px;background:rgba(0,0,0,.03);border-radius:8px;font-size:12px;font-family:monospace;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow-y:auto;border:1px solid var(--border,rgba(0,0,0,.06));";
              var _trText = "";
              if (ev.result && ev.result.error) _trText = "❌ " + ev.result.error;
              else if (ev.result && ev.result.body) _trText = "✅ " + ev.result.url + " → " + (ev.result.status || 200) + "\n" + (ev.result.body || "").slice(0, 500);
              else _trText = JSON.stringify(ev.result || {}).slice(0, 500);
              _toolDiv.textContent = _trText;
              var _sp2 = window._sedeFixSpinner || window._sedeCreateSpinner;
              if (_sp2 && _sp2.parentNode === chatList) chatList.insertBefore(_toolDiv, _sp2);
              else chatList.appendChild(_toolDiv);
              scrollToBottom();
            }
            else if (ev.type === "chat_msg" || ev.type === "chat_stream"){
              /* 会話メッセージ（マークダウン対応） */
              var _existChat = ev.type === "chat_stream" ? document.getElementById("sedeChatStream") : null;
              if (_existChat) {
                /* chat_stream: 既存要素を更新（ストリーミング的に上書き） */
                _existChat.innerHTML = parseMarkdown(ev.text || "");
              } else {
                var _chatDiv = document.createElement("div");
                _chatDiv.className = "sede-log-chat";
                if (ev.type === "chat_stream") _chatDiv.id = "sedeChatStream";
                _chatDiv.innerHTML = parseMarkdown(ev.text || "");
                var _sp = window._sedeFixSpinner || window._sedeCreateSpinner;
                if (_sp && _sp.parentNode === chatList) {
                  chatList.insertBefore(_chatDiv, _sp);
                } else {
                  chatList.appendChild(_chatDiv);
                }
              }
              scrollToBottom();
              if (ev.type === "chat_msg") _fixLogTexts.push("💬 " + (ev.text || ""));
            }
            else if (ev.type === "code_preview"){
              /* リアルタイムコードプレビュー: 右パネルに生成中のコードを表示 */
              /* openTwoPaneはblock引数必須 — ストリーミング中は直接codeViewに書く */
              var _cv = codeView || document.getElementById("sedeCodeView");
              if (_cv && ev.code) {
                var _pLines = ev.code.split("\n");
                if (_pLines[_pLines.length - 1] === "") _pLines.pop();
                var _numDiv = document.createElement("div");
                _numDiv.className = "sede-line-numbers";
                for (var _pi = 0; _pi < _pLines.length; _pi++){
                  var _ln2 = document.createElement("div"); _ln2.textContent = String(_pi + 1); _numDiv.appendChild(_ln2);
                }
                var _pre = document.createElement("pre");
                var _code = document.createElement("code");
                _code.textContent = ev.code;
                _pre.appendChild(_code);
                _cv.innerHTML = "";
                _cv.appendChild(_numDiv);
                _cv.appendChild(_pre);
                /* エディタ下部にステータス表示 */
                if (editorLang) editorLang.textContent = (ev.lines || 0) + "行 生成中...";
                if (editorEmpty) editorEmpty.style.display = "none";
                /* 自動スクロール: 最下部に追従 */
                _pre.scrollTop = _pre.scrollHeight;
              }
            }
            else if (ev.type === "log"){
              /* Claude Code風ログ行 */
              var _fxIcon = "info";
              if (ev.icon === "📖") _fxIcon = "description";
              else if (ev.icon === "🔍") _fxIcon = "search";
              else if (ev.icon === "✏️") _fxIcon = "edit";
              else if (ev.icon === "✅") _fxIcon = "check_circle";
              else if (ev.icon === "⚠️") _fxIcon = "warning";
              else if (ev.icon === "🧠") _fxIcon = "psychology";
              else if (ev.icon === "🔧") _fxIcon = "build";
              else if (ev.icon === "🚀") _fxIcon = "rocket_launch";
              else if (ev.icon === "🔗") _fxIcon = "link";
              var _fxText = ev.text || "";
              var _fxActive = _fxText.indexOf("中...") >= 0;
              /* コマンド名を太字にする */
              var _fxHtml = escHtml(_fxText)
                .replace(/^(Read|Grep|Edit|Verify|Search|Done)\b/, '<span class="cmd">$1</span>')
                .replace(/(\+\d+)/, '<span class="add">$1</span>')
                .replace(/(-\d+)/, '<span class="del">$1</span>');
              _sedeAddOpLog(
                '<span class="ms" style="font-size:14px;vertical-align:-2px">' + _fxIcon + '</span> ' + _fxHtml,
                _fxActive
              );
              _fixLogTexts.push((ev.icon || "") + " " + _fxText);
            }
            else if (ev.type === "fix_diff_ready"){
              /* ── 1. インラインdiff表示（赤/緑）── */
              var _fxFname = ev.file_path || fname || "file";
              var _fxLang = _fxFname.split(".").pop() || "txt";
              try { if (ev.diff) _sedeRenderDiffInChat(ev.diff, _fxFname); } catch(_dc){}

              /* ── 2. explanation（マークダウン） ── */
              if (ev.explanation) {
                var _explDiv = document.createElement("div");
                _explDiv.className = "sede-log-chat";
                _explDiv.innerHTML = parseMarkdown("**変更内容：**\n" + ev.explanation);
                chatList.appendChild(_explDiv);
                _fixLogTexts.push("📝 " + ev.explanation);
              }

              /* ── 3. 承認バー（入力欄の上に固定） ── */
              var card = document.createElement("div");
              card.className = "sede-approve-bar";
              card.innerHTML = '<div class="sede-approve-file"><span class="ms" style="font-size:16px;vertical-align:-3px">edit_note</span> '
                + escHtml(_fxFname)
                + ' <span class="add">+' + (ev.add_count || 0) + '</span>'
                + '<span class="del">-' + (ev.del_count || 0) + '</span></div>'
                + '<div class="sede-diff-card-btns">'
                + '<button class="sede-diff-card-btn is-apply" type="button" data-diff-action="apply">✅ 適用する</button>'
                + '<button class="sede-diff-card-btn is-reject" type="button" data-diff-action="reject">❌ 拒否する</button>'
                + '</div>';
              chatList.appendChild(card);
              scrollToBottom();

              /* ── 2. 右ペインにdiff表示（失敗しても止めない） ── */
              try {
                var _cv = codeView || document.getElementById("sedeCodeView");
                if (_cv && ev.diff) _sedeRenderDiffInEditor(ev.diff, _cv);
              } catch(_de){ console.warn("[SedeFixNew] diff render error:", _de); }

              /* ── 3. ユーザーの承認/拒否を待つ ── */
              await new Promise(function(resolve){
                card.addEventListener("click", async function handler(e){
                  var btn = e.target.closest("[data-diff-action]");
                  if (!btn) return;
                  card.removeEventListener("click", handler);
                  var action = btn.getAttribute("data-diff-action");
                  if (action === "apply"){
                    try {
                      var srcCode = (existBlock && existBlock.code) ? existBlock.code : "";
                      if (ev.diff) {
                        var newCode = _sedeApplyDiffLocal(srcCode, ev.diff);
                        var _newBlock = { lang: _fxLang, code: newCode, filename: _fxFname };
                        _sedeUpdateEditor(_newBlock);
                        if (existBlock) existBlock.code = newCode;
                        else { existBlock = _newBlock; }
                        /* 承認後にプレビューも更新 */
                        try { _sedeRenderPreview(_newBlock); } catch(_pe){}
                        /* 変更行をハイライト表示（5秒間） */
                        try {
                          var _cv3 = codeView || document.getElementById("sedeCodeView");
                          if (_cv3) {
                            /* diffから変更行番号を抽出 */
                            var _changedLines = new Set();
                            var _diffLines = ev.diff.split("\n");
                            var _curLine = 0;
                            for (var _di = 0; _di < _diffLines.length; _di++) {
                              var _hm = _diffLines[_di].match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
                              if (_hm) { _curLine = parseInt(_hm[1], 10); continue; }
                              if (_diffLines[_di].startsWith("+") && !_diffLines[_di].startsWith("+++")) {
                                _changedLines.add(_curLine); _curLine++;
                              } else if (_diffLines[_di].startsWith("-") && !_diffLines[_di].startsWith("---")) {
                                /* 削除行はスキップ */
                              } else { _curLine++; }
                            }
                            /* 行番号divにハイライトclassを付与 */
                            var _lineNumDivs = _cv3.querySelectorAll(".sede-line-numbers div");
                            _changedLines.forEach(function(ln) {
                              if (_lineNumDivs[ln - 1]) _lineNumDivs[ln - 1].style.cssText = "background:rgba(34,197,94,.15);color:#22c55e;font-weight:600;";
                            });
                            /* 最初の変更行にスクロール */
                            var _firstChanged = Math.min(..._changedLines);
                            if (_firstChanged < Infinity && _lineNumDivs[_firstChanged - 1]) {
                              _lineNumDivs[_firstChanged - 1].scrollIntoView({ behavior: "smooth", block: "center" });
                            }
                            /* 5秒後にハイライト解除 */
                            setTimeout(function() {
                              _changedLines.forEach(function(ln) {
                                if (_lineNumDivs[ln - 1]) _lineNumDivs[ln - 1].style.cssText = "";
                              });
                            }, 5000);
                          }
                        } catch(_hl) {}
                      }
                    } catch(_ae){ console.warn("[SedeFixNew] apply error:", _ae); }
                    fetch(base + "/api/sede/apply-diff", {
                      method: "POST", headers: hdrs,
                      body: JSON.stringify({ history_id: ev.history_id, project_id: window._sedeActiveProjectId || "" })
                    }).catch(function(){});
                    card.classList.add("is-resolved");
                    card.innerHTML = '<div class="sede-diff-card-head" style="color:#22c55e">✅ 適用しました</div>';
                    _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 適用しました', false);
                    _fixLogTexts.push("✅ 適用しました");

                    /* ── 自動動作チェック（HTML限定・最大2ラウンド） ── */
                    var _curRound = _autoRound || 0;
                    var _appliedCode = (existBlock && existBlock.code) ? existBlock.code : "";
                    if (_fxLang === "html" && _appliedCode && _curRound < 2) {
                      _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">play_arrow</span> <span class="cmd">Verify</span> 動作チェック中...', true);
                      _fixLogTexts.push("▶ 動作チェック中...");
                      var _verifyErrors = await _sedeAutoVerify(_appliedCode, 3000);
                      if (_verifyErrors.length > 0) {
                        var _errSummary = _verifyErrors.slice(0, 3).join("; ");
                        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> JSエラー検出: ' + escHtml(_errSummary), false);
                        _fixLogTexts.push("❌ JSエラー検出: " + _errSummary);
                        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">auto_fix_high</span> 自動修正を開始 (ラウンド ' + (_curRound + 1) + '/2)', false);
                        _fixLogTexts.push("🔄 自動修正 ラウンド " + (_curRound + 1));
                        _sedeCollapseFixLogs(_fixMarker, _fixLogTexts, _fxFname, true, ev.add_count, ev.del_count, ev.diff);
                        /* ラウンド2を即実行して完了を待ってからresolve */
                        await _sedeFixNew("以下のJSエラーを修正してください:\n" + _verifyErrors.join("\n"), existBlock, _curRound + 1);
                        resolve();
                        return;
                      } else {
                        _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">check_circle</span> <span class="cmd">Verify</span> 動作チェックOK ✓', false);
                        _fixLogTexts.push("✅ 動作チェックOK。エラーなし。");
                      }
                    }

                    /* ── 折りたたみ＋セッション保存 ── */
                    _sedeCollapseFixLogs(_fixMarker, _fixLogTexts, _fxFname, true, ev.add_count, ev.del_count, ev.diff);
                    resolve();
                  } else {
                    try { if (existBlock) _sedeUpdateEditor(existBlock); } catch(_re){}
                    fetch(base + "/api/sede/reject-diff", {
                      method: "POST", headers: hdrs,
                      body: JSON.stringify({ history_id: ev.history_id })
                    }).catch(function(){});
                    card.classList.add("is-resolved");
                    card.innerHTML = '<div class="sede-diff-card-head" style="color:#ef4444">❌ 変更を拒否しました</div>';
                    _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 変更を拒否しました', false);
                    _fixLogTexts.push("❌ 変更を拒否しました");
                    /* ── 折りたたみ＋セッション保存 ── */
                    _sedeCollapseFixLogs(_fixMarker, _fixLogTexts, _fxFname, false, ev.add_count, ev.del_count, ev.diff);
                    resolve();
                  }
                });
              });
            }
            else if (ev.type === "error"){
              appendMsgDom("ai", "エラー: " + (ev.text || ev.message || ""), true);
            }
          } catch(e){ console.warn("[SedeFixNew] parse error:", e); _sedeAddOpLog("❗ パースエラー: " + (e?.message||""), false); }
        }
      }
      console.log("[SedeFixNew] SSE stream ended");
    } catch(err){
      appendMsgDom("ai", "通信エラー: " + (err?.message || ""), true);
    } finally {
      _sede.processing = false;
      if (sendBtn) sendBtn.disabled = false;
      _sedeSetBusy(false);
      scrollToBottom();
      /* セーフティ: 処理完了後に必ずセッション保存 */
      try { if (typeof window._sedeSaveSessions === "function") window._sedeSaveSessions(); } catch(e){}
    }
  }

  /* ═══ Voice Co-Create ═══ */
  var _voiceBanner = null;

  var _voiceToggling = false;
  function _sedeVoiceToggle(){
    if (_voiceToggling) return;
    _voiceToggling = true;
    setTimeout(function(){ _voiceToggling = false; }, 500);
    if (_sede.voiceActive) { _sedeVoiceStop(); return; }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR){
      if (typeof uiToast === "function") uiToast("このブラウザは音声認識に対応していません");
      return;
    }
    _sede.voiceActive = true;
    if (voiceBtn) voiceBtn.classList.add("is-active");
    /* バナー表示 */
    _voiceBanner = document.createElement("div");
    _voiceBanner.className = "sede-voice-banner";
    _voiceBanner.innerHTML = '<span class="ms">mic</span>'
      + '<div class="sede-voice-banner-text"><div>🔴 共同作成モード ON — 話しかけてください</div>'
      + '<div class="sede-voice-banner-transcript" id="sedeVoiceTranscript"></div></div>'
      + '<button class="sede-voice-banner-close" type="button" aria-label="終了"><span class="ms" style="font-size:16px">close</span></button>';
    if (composerEl) composerEl.insertBefore(_voiceBanner, composerEl.firstChild);
    _voiceBanner.querySelector(".sede-voice-banner-close").addEventListener("click", _sedeVoiceStop);
    _sedeVoiceStartListening();
    appendMsgDom("ai", "共同作成モードを開始しました。話しかけてコードを修正できます。終了するにはマイクボタンをもう一度押してください。", true);
    scrollToBottom();
  }

  function _sedeVoiceStop(){
    _sede.voiceActive = false;
    if (voiceBtn) voiceBtn.classList.remove("is-active");
    if (_sede.voiceRecognition){ try { _sede.voiceRecognition.abort(); } catch(e){} _sede.voiceRecognition = null; }
    if (_sede.voiceSilenceTimer){ clearTimeout(_sede.voiceSilenceTimer); _sede.voiceSilenceTimer = null; }
    if (_voiceBanner && _voiceBanner.parentNode){ _voiceBanner.parentNode.removeChild(_voiceBanner); _voiceBanner = null; }
    _sede.voiceTranscript = "";
    _sede.voiceInterim = "";
  }

  function _sedeVoiceStartListening(){
    if (!_sede.voiceActive) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    var rec = new SR();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    _sede.voiceRecognition = rec;
    _sede.voiceTranscript = "";
    _sede.voiceInterim = "";

    rec.onresult = function(ev){
      var final = "", interim = "";
      for (var i = 0; i < ev.results.length; i++){
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
        else interim += ev.results[i][0].transcript;
      }
      _sede.voiceTranscript = final;
      _sede.voiceInterim = interim;
      /* リアルタイム表示 */
      var tEl = document.getElementById("sedeVoiceTranscript");
      if (tEl) tEl.textContent = (final + interim) || "...";
      /* 無音検知: final が更新されるたびにリセット */
      if (final){
        if (_sede.voiceSilenceTimer) clearTimeout(_sede.voiceSilenceTimer);
        _sede.voiceSilenceTimer = setTimeout(function(){
          if (!_sede.voiceActive) return;
          var t = _sede.voiceTranscript.trim();
          if (t && !_sede.processing){
            console.log("[Voice] Auto-send:", t);
            _sedeVoiceApply(t);
          }
        }, 1800);
      }
    };

    rec.onend = function(){
      /* continuous modeでも環境によって勝手に止まることがある → 再起動 */
      if (_sede.voiceActive && !_sede.processing){
        setTimeout(function(){ _sedeVoiceStartListening(); }, 300);
      }
    };

    rec.onerror = function(ev){
      console.warn("[Voice] error:", ev.error);
      if (ev.error === "not-allowed"){
        if (typeof uiToast === "function") uiToast("マイクの許可が必��です");
        _sedeVoiceStop();
      } else if (ev.error === "no-speech"){
        /* 無音 → 再起動 */
      } else if (ev.error === "aborted"){
        /* 手動停止 */
      }
    };

    try { rec.start(); } catch(e){ console.warn("[Voice] start error:", e); }
  }

  /* ── iframe DOM検査 ── */
  function _sedeInspectPreview(){
    var rightPane = document.getElementById("sedeRightPane");
    if (!rightPane) return null;
    /* Check both preview locations: manual preview (.sede-preview-frame) and auto-preview (#sedeLivePreview iframe) */
    var iframe = rightPane.querySelector(".sede-preview-frame");
    if (!iframe) {
      var livePreview = document.getElementById("sedeLivePreview");
      if (livePreview) iframe = livePreview.querySelector("iframe");
    }
    if (!iframe) return null;
    try {
      var doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || !doc.body) return null;
      /* 要素カウント */
      var counts = {};
      var tags = ["nav","header","footer","main","section","article","form","button","a","input","select","textarea","img","table","ul","ol","h1","h2","h3","div","span","p"];
      for (var i = 0; i < tags.length; i++){
        var n = doc.querySelectorAll(tags[i]).length;
        if (n > 0) counts[tags[i]] = n;
      }
      /* イベントリスナー付きの要素 */
      var clickables = doc.querySelectorAll("[onclick],[onsubmit],[onchange],[oninput]");
      var eventHandlers = [];
      for (var j = 0; j < Math.min(clickables.length, 20); j++){
        var el = clickables[j];
        var id = el.id ? "#" + el.id : (el.className ? "." + String(el.className).split(" ")[0] : el.tagName.toLowerCase());
        eventHandlers.push(id);
      }
      /* JS内のaddEventListener検出 */
      var scripts = doc.querySelectorAll("script");
      var listenerCount = 0;
      for (var k = 0; k < scripts.length; k++){
        var src = scripts[k].textContent || "";
        var matches = src.match(/addEventListener/g);
        if (matches) listenerCount += matches.length;
      }
      /* テキストコンテンツ（ヘッダー等） */
      var headings = [];
      var hEls = doc.querySelectorAll("h1,h2,h3");
      for (var h = 0; h < Math.min(hEls.length, 10); h++){
        headings.push(hEls[h].tagName.toLowerCase() + ": " + (hEls[h].textContent || "").trim().slice(0, 50));
      }
      /* コンソールエラー: manual preview console + global error array */
      var consoleErrors = [];
      var conEl = rightPane.querySelector(".sede-preview-console");
      if (conEl){
        var errLines = conEl.querySelectorAll("div");
        for (var e = 0; e < errLines.length; e++){
          var t = (errLines[e].textContent || "").trim();
          if (t.startsWith("\u2715")) consoleErrors.push(t.slice(1).trim());
        }
      }
      /* Also check global error array from auto-preview */
      if (window._sedePreviewErrors && window._sedePreviewErrors.length){
        for (var pe = 0; pe < window._sedePreviewErrors.length; pe++){
          consoleErrors.push(window._sedePreviewErrors[pe]);
        }
      }
      /* アクセシビリティ */
      var imgs = doc.querySelectorAll("img");
      var missingAlt = 0;
      for (var m = 0; m < imgs.length; m++){ if (!imgs[m].alt) missingAlt++; }
      var inputs = doc.querySelectorAll("input,select,textarea");
      var missingLabel = 0;
      for (var n2 = 0; n2 < inputs.length; n2++){
        var inp = inputs[n2];
        if (inp.type === "hidden") continue;
        if (!inp.labels || inp.labels.length === 0){
          if (!inp.getAttribute("aria-label") && !inp.getAttribute("aria-labelledby")) missingLabel++;
        }
      }
      return {
        elements: counts,
        eventHandlers: eventHandlers,
        listenerCount: listenerCount,
        headings: headings,
        consoleErrors: consoleErrors,
        missingAlt: missingAlt,
        missingLabel: missingLabel,
        bodyText: (doc.body.textContent || "").trim().slice(0, 200)
      };
    } catch(e){
      console.warn("[Voice] iframe inspect error:", e);
      return null;
    }
  }

  /* ── Extract multi-file project from Sede generation output ──
     Supports patterns like:
       ```python filename=server.py
       ```javascript name=app.js
       <!-- === file: index.html === -->
     Returns { filesMap, hasBackend } or null if single-file */
  function _sedeParseMultiFile(code){
    if (!code || typeof code !== "string") return null;
    var files = {};

    /* Pattern 1: fenced code blocks with filename attribute */
    var fenceRe = /```(\w+)[^\n]*?(?:filename|name|file)=([^\s`]+)[^\n]*\n([\s\S]*?)```/g;
    var m;
    while ((m = fenceRe.exec(code)) !== null) {
      var fname = m[2].trim().replace(/^["']|["']$/g, "");
      if (fname) files[fname] = m[3];
    }

    /* Pattern 2: HTML comment markers */
    if (Object.keys(files).length === 0) {
      var markerRe = /<!--\s*===\s*file:\s*([^\s=]+)\s*===\s*-->([\s\S]*?)(?=<!--\s*===\s*file:|$)/g;
      while ((m = markerRe.exec(code)) !== null) {
        var fname2 = m[1].trim();
        if (fname2) files[fname2] = m[2].trim();
      }
    }

    if (Object.keys(files).length === 0) return null;

    var hasBackend = Boolean(files["server.py"] || files["app.py"] || files["main.py"] || (files["server.js"] && files["package.json"]));
    return { filesMap: files, hasBackend: hasBackend };
  }

  /* ── Live Preview via E2B /serve or /serve-fullstack → iframe inline ── */
  async function _sedeShowScreenshot(code, files){
    /* Auto-parse multi-file if not provided explicitly */
    if (!files && typeof code === "string") {
      var parsed = _sedeParseMultiFile(code);
      if (parsed) { files = parsed.filesMap; }
    }

    if ((!code || typeof code !== "string") && (!files || typeof files !== "object")) return;
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}
    var chatList = document.getElementById("sedeChatList");
    if (!chatList) return;

    /* Detect backend from files map */
    var hasBackend = files && (files["server.py"] || files["app.py"] || files["main.py"] || (files["server.js"] && files["package.json"]));

    /* Placeholder bubble with loading state */
    var wrap = document.createElement("div");
    wrap.className = "sede-chat-msg is-ai";
    var role = document.createElement("div");
    role.className = "sede-chat-role"; role.textContent = hasBackend ? "Sede ライブプレビュー (フルスタック)" : "Sede ライブプレビュー";
    var bubble = document.createElement("div");
    bubble.className = "sede-chat-bubble";
    bubble.style.cssText = "padding:6px;max-width:480px;";
    var loading = document.createElement("div");
    loading.style.cssText = "padding:16px;font-size:12px;color:#64748b;display:flex;align-items:center;gap:8px;";
    loading.innerHTML = '<span class="ms" style="font-size:14px;animation:spin 1s linear infinite">autorenew</span>' + (hasBackend ? "E2B で Flask/Express 起動中 (30秒〜)..." : "E2B でライブサーバー起動中...");
    bubble.appendChild(loading);
    wrap.appendChild(role); wrap.appendChild(bubble);
    chatList.appendChild(wrap);
    try { if (typeof scrollToBottom === "function") scrollToBottom(); } catch(e){}

    try {
      /* Route to fullstack endpoint if backend detected, else static serve */
      var endpoint = hasBackend ? "/api/sede/serve-fullstack" : "/api/sede/serve";
      var payload = files ? { files: files, entrypoint: "index.html" } : { html: code, entrypoint: "index.html" };
      if (hasBackend) payload.backend = "auto";
      var timeoutMs = hasBackend ? 240000 : 45000;
      var resp = await fetch(base + endpoint, {
        method: "POST", headers: hdrs,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!resp.ok) { loading.textContent = "ライブプレビュー起動失敗 (HTTP " + resp.status + ")"; return; }
      var data = await resp.json();
      if (!data?.ok || !data.url) { loading.textContent = "ライブプレビュー URL 取得失敗: " + (data?.error || ""); return; }

      /* Replace loading with iframe + open-in-new-tab link */
      bubble.innerHTML = "";
      var urlBar = document.createElement("div");
      urlBar.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 8px;font-size:11px;color:#64748b;border-bottom:1px solid rgba(0,0,0,.06);";
      urlBar.innerHTML = '<span class="ms" style="font-size:12px;color:#22c55e">circle</span><span style="flex:1;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(data.url) + '</span><a href="' + escHtml(data.url) + '" target="_blank" rel="noopener" style="color:var(--accent,#6366f1);text-decoration:none;font-size:11px">新しいタブで開く →</a>';
      bubble.appendChild(urlBar);
      var frame = document.createElement("iframe");
      frame.src = data.url;
      frame.title = "生成アプリのライブプレビュー";
      frame.sandbox = "allow-scripts allow-forms allow-same-origin allow-popups";
      frame.style.cssText = "width:100%;max-width:460px;height:320px;border:0;border-radius:6px;background:#fff;display:block;";
      bubble.appendChild(frame);
      var ctrl = document.createElement("div");
      ctrl.style.cssText = "display:flex;gap:6px;padding:6px 0 0;font-size:11px;";
      var reloadBtn = document.createElement("button");
      reloadBtn.textContent = "↻ リロード";
      reloadBtn.style.cssText = "padding:3px 8px;font-size:11px;border:1px solid rgba(0,0,0,.1);background:#fff;border-radius:4px;cursor:pointer;";
      reloadBtn.onclick = function(){ try { frame.src = data.url + "?t=" + Date.now(); } catch(e){} };
      var expandBtn = document.createElement("button");
      expandBtn.textContent = "⛶ 拡大";
      expandBtn.style.cssText = "padding:3px 8px;font-size:11px;border:1px solid rgba(0,0,0,.1);background:#fff;border-radius:4px;cursor:pointer;";
      expandBtn.onclick = function(){
        var ov = document.createElement("div");
        ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:default;padding:20px;flex-direction:column;gap:8px;";
        var closeBtn = document.createElement("button");
        closeBtn.textContent = "✕ 閉じる"; closeBtn.style.cssText = "align-self:flex-end;padding:6px 12px;background:#fff;border:0;border-radius:4px;cursor:pointer;";
        closeBtn.onclick = function(){ ov.remove(); };
        var full = document.createElement("iframe");
        full.src = data.url; full.sandbox = frame.sandbox;
        full.style.cssText = "flex:1;width:100%;max-width:1280px;border:0;border-radius:8px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.5);";
        ov.appendChild(closeBtn); ov.appendChild(full);
        document.body.appendChild(ov);
      };
      ctrl.appendChild(reloadBtn); ctrl.appendChild(expandBtn);
      bubble.appendChild(ctrl);
    } catch(e){
      loading.textContent = "ライブプレビューエラー: " + (e?.message || "");
    }
  }

  /* ── Voice Apply: 音声テキスト → AI修正 → プレビュー → DOM検査 ── */
  async function _sedeVoiceApply(transcript){
    if (!transcript || _sede.processing) return;
    /* 認識を一時停止 */
    if (_sede.voiceRecognition){ try { _sede.voiceRecognition.stop(); } catch(e){} }
    _sede.processing = true;
    if (sendBtn) sendBtn.disabled = true;

    /* セッション確保 */
    if (window._sedeState && !window._sedeState.sessions.length){
      if (typeof window._sedeCreateSession === "function") window._sedeCreateSession();
    }
    var ses = _sedeGetActiveSession();
    if (!ses && typeof window._sedeCreateSession === "function"){
      window._sedeCreateSession();
      ses = _sedeGetActiveSession();
    }
    if (ses){
      if (!ses.messages) ses.messages = [];
      ses.messages.push({ role: "user", text: "[Voice] " + transcript, ts: Date.now() });
      ses.updatedAt = Date.now();
      if (typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
    }

    /* UI */
    appendMsgDom("user", "[Voice] " + transcript, true);
    updateView();
    scrollToBottom();
    var tEl = document.getElementById("sedeVoiceTranscript");
    if (tEl) tEl.textContent = "AI処理中...";

    var opLog = _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">mic</span> 音声指示: ' + escHtml(transcript.slice(0, 60)), false);
    var opFix = _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">edit</span> コード修正中...', true);

    var existBlock = _sede.codeHistory.length ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}

    var fname = existBlock ? (existBlock.filename || "file." + (existBlock.lang || "txt")) : "file.txt";
    var retryCount = 0;
    var maxRetry = 2;

    async function doFix(instruction){
      try {
        var res = await fetch(base + "/api/sede/voice-fix", {
          method: "POST", headers: hdrs,
          body: JSON.stringify({
            code: existBlock ? existBlock.code : "",
            instruction: instruction,
            filename: fname,
            mode: "fix"
          })
        });
        if (!res.ok || !res.body){
          appendMsgDom("ai", "エラー: " + res.status, true);
          return false;
        }
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        var applied = false;
        while (true){
          var chunk = await reader.read();
          if (chunk.done) break;
          buf += dec.decode(chunk.value, { stream: true });
          var lines = buf.split("\n"); buf = lines.pop() || "";
          for (var li = 0; li < lines.length; li++){
            var line = lines[li].trim();
            if (!line || !line.startsWith("data: ")) continue;
            var d = line.slice(6).trim();
            if (d === "[DONE]") continue;
            try {
              var ev = JSON.parse(d);
              if (ev.type === "diff"){
                _sedeCompleteOpLog(opFix);
                var addC = ev.add_count || 0, delC = ev.del_count || 0;
                _sedeAddOpLog(
                  '<span class="ms" style="font-size:13px;vertical-align:-2px">edit</span> Edit <code>'
                  + escHtml(ev.filename || fname)
                  + '</code> <span style="color:#22c55e">+' + addC + '</span><span style="color:#ef4444">/-' + delC + '</span>',
                  false
                );
                /* Voice modeはdiffを自動適用（承認不要） */
                var srcCode = existBlock ? existBlock.code : "";
                var newCode = _sedeApplyDiffLocal(srcCode, ev.diff || "");
                if (newCode && newCode.length > srcCode.length * 0.4){
                  var newLang = existBlock ? (existBlock.lang || "html") : "html";
                  var newFname = existBlock ? (existBlock.filename || fname) : fname;
                  _sedeUpdateEditor({ lang: newLang, code: newCode, filename: newFname });
                  if (existBlock){ existBlock.code = newCode; }
                  else { existBlock = { lang: "html", code: newCode, filename: fname }; }
                  applied = true;
                  /* プレビュー自動更新 */
                  _sedeOpenPreview(newCode, newLang, "pc");
                } else {
                  appendMsgDom("ai", "⚠ 安全弁: 修正後コードが元の40%未満のため拒否しました", true);
                }
              } else if (ev.type === "code_preview"){
                /* リアルタイムコード表示 */
                var _cv = codeView || document.getElementById("sedeCodeView");
                if (_cv && ev.code){
                  var _pLines = ev.code.split("\n");
                  if (_pLines[_pLines.length - 1] === "") _pLines.pop();
                  var _numDiv = document.createElement("div");
                  _numDiv.className = "sede-line-numbers";
                  for (var _pi = 0; _pi < _pLines.length; _pi++){
                    var _ln2 = document.createElement("div"); _ln2.textContent = String(_pi + 1); _numDiv.appendChild(_ln2);
                  }
                  var _pre = document.createElement("pre");
                  var _codeEl = document.createElement("code");
                  _codeEl.textContent = ev.code;
                  _pre.appendChild(_codeEl);
                  _cv.innerHTML = "";
                  _cv.appendChild(_numDiv);
                  _cv.appendChild(_pre);
                  if (editorLang) editorLang.textContent = (ev.lines || 0) + "行 生成中...";
                  if (editorEmpty) editorEmpty.style.display = "none";
                }
              } else if (ev.type === "explanation"){
                appendMsgDom("ai", ev.text || "", true);
              } else if (ev.type === "chat_msg"){
                appendMsgDom("ai", ev.text || "", true);
              } else if (ev.type === "error"){
                appendMsgDom("ai", "エラー: " + (ev.text || ""), true);
              }
            } catch(e){ console.warn("[Voice] parse error:", e); }
          }
        }
        return applied;
      } catch(err){
        appendMsgDom("ai", "通信エラー: " + (err?.message || ""), true);
        return false;
      }
    }

    /* メイン修正実行 */
    var success = await doFix(transcript);

    /* DOM検査 → 自動再修正ループ */
    if (success){
      /* プレビュー読み込み完了を少し待つ */
      await new Promise(function(r){ setTimeout(r, 1500); });
      var inspection = _sedeInspectPreview();
      if (inspection){
        var hasErrors = inspection.consoleErrors.length > 0;
        var verifyEl = document.createElement("div");
        verifyEl.className = "sede-voice-verify" + (hasErrors ? " is-fail" : "");
        if (hasErrors){
          verifyEl.innerHTML = '<span class="ms">error</span> エラー検出: ' + escHtml(inspection.consoleErrors[0]);
          if (composerEl && _voiceBanner) composerEl.insertBefore(verifyEl, _voiceBanner.nextSibling);
          else if (chatList) chatList.appendChild(verifyEl);
          /* 自動修正トライ */
          if (retryCount < maxRetry){
            retryCount++;
            var autoFixInstruction = "以下のJSエラーを修正してください: " + inspection.consoleErrors.join("; ");
            _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">auto_fix_high</span> 自動エラー修正 (' + retryCount + '/' + maxRetry + ')', true);
            opFix = _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">build</span> 再修正中...', true);
            var retryOk = await doFix(autoFixInstruction);
            _sedeCompleteOpLog(opFix);
            if (retryOk){
              await new Promise(function(r2){ setTimeout(r2, 1500); });
              var inspection2 = _sedeInspectPreview();
              if (inspection2 && inspection2.consoleErrors.length === 0){
                verifyEl.className = "sede-voice-verify";
                verifyEl.innerHTML = '<span class="ms">check_circle</span> エラー修正完了';
              }
            }
          }
        } else {
          /* 構造サマリー */
          var summary = [];
          var el = inspection.elements;
          if (el.button) summary.push("ボタン" + el.button);
          if (el.a) summary.push("リンク" + el.a);
          if (el.input || el.select || el.textarea) summary.push("入力欄" + ((el.input||0)+(el.select||0)+(el.textarea||0)));
          if (el.img) summary.push("画像" + el.img);
          if (inspection.listenerCount) summary.push("イベント" + inspection.listenerCount);
          verifyEl.innerHTML = '<span class="ms">check_circle</span> ✅ 動作確認OK' + (summary.length ? " — " + summary.join(", ") : "");
          if (composerEl && _voiceBanner) composerEl.insertBefore(verifyEl, _voiceBanner.nextSibling);
          else if (chatList) chatList.appendChild(verifyEl);
        }
        /* 3秒後にverify表示を消す */
        setTimeout(function(){ if (verifyEl.parentNode) verifyEl.parentNode.removeChild(verifyEl); }, 4000);
      }
    }

    _sedeCompleteOpLog(opFix);
    _sede.processing = false;
    if (sendBtn) sendBtn.disabled = false;
    scrollToBottom();
    if (ses){
      var aiMsg = success ? "✅ 音声指示を適用しました" : "⚠ 修正を適用できませんでした";
      ses.messages.push({ role: "ai", text: aiMsg, ts: Date.now() });
      if (typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
    }

    /* 音声認識を再開（連続モード） */
    if (_sede.voiceActive){
      var tEl2 = document.getElementById("sedeVoiceTranscript");
      if (tEl2) tEl2.textContent = "次の指示を待っています...";
      _sedeVoiceStartListening();
    }
  }

  /* Voice button handler */
  /* voiceBtn click はツールバーのデリゲートハンドラ(data-sede-toolbar="voice")で処理 */

  /* ── Send message with SSE streaming ─�� */
  async function sendMessage(text){
    text = text || String(inputEl?.value || "").trim();
    if (!text || _sede.processing) return;
    _sedeCmdSuggestHide();

    /* Parse slash command */
    var parsed = _parseSedeCmd(text);
    var cmd = parsed.command;
    var cmdArgs = parsed.args;

    /* ── Local commands (no AI needed) ── */
    if (cmd === "run"){
      if (inputEl){ inputEl.value = ""; autoGrow(); }
      if (cmdArgs){
        /* /run <command> → execute on Koyeb */
        var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
        var hdrs = { "Content-Type": "application/json" };
        try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}
        appendMsgDom("user", text, true); updateView(); scrollToBottom();
        _sedeAddOpLog("▶ コマンド実行: <code>" + escHtml(cmdArgs) + "</code>", true);
        await _sedeExecCommand(cmdArgs, base, hdrs);
      } else {
        var latest = _sede.codeHistory[_sede.codeHistory.length - 1];
        if (latest && typeof executeCodeBlock === "function"){
          var lastPre = chatList?.querySelector(".sede-chat-msg:last-child pre");
          executeCodeBlock(latest.lang || "javascript", latest.code, lastPre || chatList);
        }
      }
      return;
    }
    if (cmd === "test"){
      if (inputEl){ inputEl.value = ""; autoGrow(); }
      appendMsgDom("user", text, true); updateView(); scrollToBottom();
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">science</span> テスト実行中...', true);
      var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
      var hdrs = { "Content-Type": "application/json" };
      try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}
      try {
        var latest = _sede.codeHistory[_sede.codeHistory.length - 1];
        var testRes = await fetch(base + "/api/sede/test", { method:"POST", headers:hdrs,
          body:JSON.stringify({ project_id: window._sedeActiveProjectId || "", file_ext: (latest?.filename || "").split(".").pop() || "js", file_content: latest?.code || "" })
        });
        var testData = await testRes.json();
        if (testData.success) _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">science</span> テスト通過', false);
        else _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">science</span> テスト失敗', false);
        if (testData.output) _sedeTerminalLog(testData.output, testData.success ? "is-ok" : "is-err");
      } catch(e){ _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> テスト通信エラー', false); }
      return;
    }
    if (cmd === "rollback"){
      if (inputEl){ inputEl.value = ""; autoGrow(); }
      appendMsgDom("user", text, true); updateView(); scrollToBottom();
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">sync</span> ロールバック中...', true);
      var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
      var hdrs = { "Content-Type": "application/json" };
      try { var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (tk) hdrs.Authorization = "Bearer " + tk; } catch(e){}
      try {
        var rbRes = await fetch(base + "/api/sede/rollback", { method:"POST", headers:hdrs,
          body:JSON.stringify({ project_id: window._sedeActiveProjectId || "" })
        });
        var rbData = await rbRes.json();
        if (rbData.ok){
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">sync</span> ロールバック完了', false);
          if (rbData.content && rbData.file_path){
            _sedeUpdateEditor({ lang: rbData.file_path.split(".").pop() || "txt", code: rbData.content, filename: rbData.file_path });
          }
          appendMsgDom("ai", "✅ 直前の変更をロールバックしました。", true);
        } else {
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> ' + (rbData.message || 'ロールバック失敗'), false);
          appendMsgDom("ai", "❌ " + (rbData.message || "ロールバックに失敗しました。"), true);
        }
      } catch(e){ _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 通信エラー', false); }
      updateView(); scrollToBottom();
      return;
    }
    if (cmd === "preview"){
      if (inputEl){ inputEl.value = ""; autoGrow(); }
      var latest = _sede.codeHistory[_sede.codeHistory.length - 1];
      if (latest) _sedeOpenPreview(latest.code, latest.lang || "html", "pc");
      else appendMsgDom("ai", "プレビューするコードがありません。", true);
      updateView(); scrollToBottom();
      return;
    }
    if (cmd === "deploy"){
      if (inputEl){ inputEl.value = ""; autoGrow(); }
      if(typeof _sedeDeployToPages === "function"){
        appendMsgDom("user", text, true); updateView(); scrollToBottom();
        _sedeDeployToPages();
      } else {
        appendMsgDom("ai", "デプロイ機能を初期化中です。もう一度お試しください。", true);
      }
      updateView(); scrollToBottom();
      return;
    }

    /* ── /parallel: 3並列高速生成 ── */
    if (cmd === "parallel"){
      if (inputEl){ inputEl.value = ""; autoGrow(); }
      _sede.processing = true;
      _sedeSetBusy(true);
      _sedeHideSteer();
      if (sendBtn) sendBtn.disabled = true;
      /* セッション確保 */
      if (window._sedeState && !window._sedeState.sessions.length){
        if (typeof window._sedeCreateSession === "function") window._sedeCreateSession();
      }
      var _pSes = _sedeGetActiveSession();
      if (!_pSes && typeof window._sedeCreateSession === "function"){
        window._sedeCreateSession();
        _pSes = _sedeGetActiveSession();
      }
      if (_pSes){
        if (!_pSes.messages) _pSes.messages = [];
        _pSes.messages.push({ role:"user", text:text, ts:Date.now() });
        _pSes.updatedAt = Date.now();
        if (_pSes.messages.filter(function(m){ return m.role === "user"; }).length === 1 && _pSes.title === "新規セッション"){
          _pSes.title = text.slice(0, 40) + (text.length > 40 ? "..." : "");
        }
        if (typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
        if (typeof window._sedeRenderSidebar === "function") window._sedeRenderSidebar();
      }
      appendMsgDom("user", text, true);
      updateView();
      scrollToBottom();
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">rocket_launch</span> 3並列高速生成モード', false);
      await _sedeParallelGen(cmdArgs || text);
      return;
    }

    /* ── AI commands: legacy /fix, /rebuild, /create → auto-route to agent ── */
    var aiMode = null;
    var aiMessage = text;
    if (cmd === "fix" || cmd === "rebuild" || cmd === "new" || cmd === "create" || cmd === "extend" || cmd === "explain"){
      /* Legacy commands → strip prefix, route to agent */
      aiMessage = cmdArgs || text;
      aiMode = "__auto__";
    }

    if (inputEl){ inputEl.value = ""; autoGrow(); }
    _sede.processing = true;
    _sedeSetBusy(true);
    _sedeHideSteer();
    if (sendBtn) sendBtn.disabled = true;

    /* FIX: Ensure session exists — access via window since _sedeState is in a different scope */
    if (window._sedeState && !window._sedeState.sessions.length){
      if (typeof window._sedeCreateSession === "function") window._sedeCreateSession();
    }

    /* Save user message */
    var ses = _sedeGetActiveSession();
    if (!ses){
      if (typeof window._sedeCreateSession === "function"){
        window._sedeCreateSession();
        ses = _sedeGetActiveSession();
      }
    }
    if (ses){
      if (!ses.messages) ses.messages = [];
      ses.messages.push({ role:"user", text:text, ts:Date.now() });
      ses.updatedAt = Date.now();
      /* Auto-name from first message */
      if (ses.messages.filter(function(m){ return m.role === "user"; }).length === 1 && ses.title === "新規セッション"){
        ses.title = text.slice(0, 40) + (text.length > 40 ? "..." : "");
      }
      /* FIX: call via window */
      if (typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
      if (typeof window._sedeRenderSidebar === "function") window._sedeRenderSidebar();
    }

    /* Render user message */
    appendMsgDom("user", text, true);
    updateView();
    scrollToBottom();

    /* Mode operation log */
    if (aiMode === "fix") {
      var _fixSpinner = document.createElement("div");
      _fixSpinner.className = "sede-spinner";
      _fixSpinner.innerHTML = '<div class="sede-spinner-icon"></div> <span class="sede-spinner-text">コードを分析中...</span>';
      if (chatList) chatList.appendChild(_fixSpinner);
      scrollToBottom();
      window._sedeFixSpinner = _fixSpinner;
      /* ステップごとにテキスト変化 */
      var _fixSpinnerTexts = [
        "コードを分析中...", "ファイルを読み込んでいます...", "該当箇所を探しています...",
        "修正箇所を特定中...", "変更パターンを検討中...", "最適な修正方法を選択中...",
        "差分を生成しています...", "コードの整合性を確認中...", "修正を組み立てています...",
        "構文チェック中...", "もう少しで完了します...", "最終調整中..."
      ];
      var _fixSpinnerUsed = [0];
      window._sedeFixSpinnerTimer = setInterval(function(){
        if (!_fixSpinner.parentNode) { clearInterval(window._sedeFixSpinnerTimer); return; }
        if (_fixSpinnerUsed.length >= _fixSpinnerTexts.length) { clearInterval(window._sedeFixSpinnerTimer); return; }
        var _next;
        do { _next = Math.floor(Math.random() * _fixSpinnerTexts.length); } while (_fixSpinnerUsed.indexOf(_next) !== -1);
        _fixSpinnerUsed.push(_next);
        var _st = _fixSpinner.querySelector(".sede-spinner-text");
        if (_st) _st.textContent = _fixSpinnerTexts[_next];
      }, 3000);
    }
    else if (aiMode === "rebuild") _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">sync</span> 完全再生成モード', false);
    else if (aiMode === "new") _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">note_add</span> 新規ファイル作成モード', false);
    else if (!aiMode) {
      var _createSpinner = document.createElement("div");
      _createSpinner.className = "sede-spinner";
      _createSpinner.innerHTML = '<div class="sede-spinner-icon"></div> <span class="sede-spinner-text">リクエストを処理中...</span>';
      if (chatList) chatList.appendChild(_createSpinner);
      scrollToBottom();
      window._sedeCreateSpinner = _createSpinner;
      var _createSpinnerTexts = [
        "リクエストを処理中...", "最適なアーキテクチャを設計中...", "HTMLの骨組みを構築中...",
        "CSSスタイルを組み立てています...", "レスポンシブデザインを適用中...", "アニメーションを追加中...",
        "ダークモードを実装中...", "JavaScriptのロジックを書いています...", "インタラクションを実装中...",
        "コンポーネントを配置中...", "フォントとカラーを調整中...", "最終チェック中...",
        "コードを整形しています...", "仕上げに入っています...", "もう少しお待ちください..."
      ];
      var _createSpinnerUsed = [0];
      window._sedeCreateSpinnerTimer = setInterval(function(){
        if (!_createSpinner.parentNode) { clearInterval(window._sedeCreateSpinnerTimer); return; }
        if (_createSpinnerUsed.length >= _createSpinnerTexts.length) { clearInterval(window._sedeCreateSpinnerTimer); return; }
        var _next;
        do { _next = Math.floor(Math.random() * _createSpinnerTexts.length); } while (_createSpinnerUsed.indexOf(_next) !== -1);
        _createSpinnerUsed.push(_next);
        var _st = _createSpinner.querySelector(".sede-spinner-text");
        if (_st) _st.textContent = _createSpinnerTexts[_next];
      }, 2500);
    }

    /* If project mode is active → delegate to project chat with mode */
    if (window._sedeActiveProjectId && (aiMode === "fix" || aiMode === "rebuild")){
      _sede.processing = false;
      if (sendBtn) sendBtn.disabled = false;
      _sedeSetBusy(false);
      if (typeof window._sedeSendProjectChat === "function") window._sedeSendProjectChat(aiMessage, aiMode);
      else if (typeof _sedeSendProjectChat === "function") _sedeSendProjectChat(aiMessage, aiMode);
      return;
    }

    /* ── /create: quick-fixパスを使用（ストリーミング・大量出力対応） ── */
    if (aiMode === "new"){
      await _sedeQuickFix(aiMessage, "fix", null);
      return;
    }

    /* ── Non-project fix: Fix v2（コードあり→v2、なし→従来） ── */
    if (aiMode === "fix" && !window._sedeActiveProjectId){
      var _existBlockFix = _sede.codeHistory.length ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;
      if (_existBlockFix && _existBlockFix.code && _existBlockFix.code.length > 100) {
        await _sedeFixV2(aiMessage, _existBlockFix);
      } else {
        await _sedeFixNew(aiMessage, _existBlockFix);
      }
      return;
    }
    /* ── Non-project rebuild: use dedicated /api/sede/quick-fix endpoint ── */
    if (aiMode === "rebuild" && !window._sedeActiveProjectId){
      var _existBlock = _sede.codeHistory.length ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;
      await _sedeQuickFix(aiMessage, aiMode, _existBlock);
      return;
    }

    /* ── コマンドなし or __auto__: エージェントモードで自律実行 ── */
    if (!aiMode || aiMode === "__auto__") {
      _sede.processing = false;
      if(sendBtn) sendBtn.disabled = false;
      _sedeSetBusy(false);
      await _sedeAgentRun(aiMessage);
      return;
    }
    var apiMessage = text;

    /* Show operation logs instead of typing indicator */
    /* スピナー削除 */
    if (window._sedeCreateSpinner && window._sedeCreateSpinner.parentNode) {
      window._sedeCreateSpinner.parentNode.removeChild(window._sedeCreateSpinner);
      window._sedeCreateSpinner = null;
      if (window._sedeCreateSpinnerTimer) { clearInterval(window._sedeCreateSpinnerTimer); window._sedeCreateSpinnerTimer = null; }
    }
    var _createOpSearch = _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">search</span> <span class="cmd">Search</span> Web検索中...', true);
    var typingEl = document.createElement("div");
    typingEl.className = "sede-chat-msg is-ai is-typing";
    typingEl.id = "sedeTypingIndicator";
    typingEl.innerHTML = '<div class="sede-chat-role">Sede</div>'
      + '<div class="sede-chat-bubble"><div class="sede-typing-dots"><span></span><span></span><span></span></div></div>';
    chatList.appendChild(typingEl);
    scrollToBottom();

    /* Build API payload */
    var messages = (ses?.messages || []).map(function(m){
      return { role: m.role === "ai" ? "assistant" : "user", content: m.text };
    });
    /* FIX: Use window.CHAT_AI_API_URL exposed from main scope */
    var apiUrl = window.CHAT_AI_API_URL || "";
    if (!apiUrl){
      var apiBase = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
      apiUrl = apiBase + "/api/ai/chat";
    }
    var headers = { "Content-Type": "application/json" };
    try {
      var t = (typeof _authGetToken === "function") ? _authGetToken() : null;
      if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim();
      if (t) headers.Authorization = "Bearer " + t;
    } catch(e){ console.warn("[Sede] auth token error:", e); }

    var payload = {
      message: apiMessage,
      messages: messages,
      mode: "code",
      stream: true,
      context: { codeLines: _getLatestCodeLines() }
    };
    if (aiMode) payload.sede_action = aiMode;

    var fullText = "";
    _sede.abortCtrl = new AbortController();

    try {
      console.log("[Sede] Sending to:", apiUrl, "mode:", payload.mode, "sede_action:", payload.sede_action || "none", "msgLen:", (payload.message || "").length, "msgs:", payload.messages.length);
      var res = await fetch(apiUrl, {
        method:"POST", headers:headers, body:JSON.stringify(payload),
        signal: _sede.abortCtrl.signal
      });
      var ct = String(res.headers.get("content-type") || "");
      var _vqModel = res.headers.get("x-vq-model") || "?";
      var _vqProvider = res.headers.get("x-vq-provider") || "?";
      console.log("[Sede] Response status:", res.status, "model:", _vqModel, "provider:", _vqProvider, "ct:", ct);

      if (!res.ok) {
        /* Non-OK response — read and show error */
        var errBody = "";
        try { errBody = await res.text(); } catch(e){}
        console.error("[Sede] Error response:", res.status, errBody.slice(0, 500));
        var tElErr = document.getElementById("sedeTypingIndicator");
        if (tElErr) tElErr.remove();
        appendMsgDom("ai", "エラー (" + res.status + "): " + (errBody.slice(0, 200) || "応答がありません"), true);
        return;
      }

      if (res.ok && res.body && ct.includes("text/event-stream")){
        /* SSE streaming with auto-continuation support */
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = "", lastRender = 0;
        var isAutoContinue = String(res.headers.get("x-vq-auto-continue") || "") === "1";
        /* Update operation logs */
        _sedeCompleteOpLog(_createOpSearch);
        var _createOpGen = _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">edit</span> <span class="cmd">Generate</span> コード生成中...', true);
        var _lastSectionLog = "";
        /* Replace typing indicator with streaming bubble */
        var tEl = document.getElementById("sedeTypingIndicator");
        if (tEl){
          tEl.classList.remove("is-typing");
          tEl.id = "sedeStreamingMsg";
          tEl.innerHTML = '<div class="sede-chat-role">Sede</div><div class="sede-chat-bubble"></div>';
        }
        var streamBubble = tEl?.querySelector(".sede-chat-bubble");
        /* ── Progress UI (auto-continue only) ── */
        var progressEl = null;
        if (isAutoContinue && streamBubble) {
          progressEl = document.createElement("div");
          progressEl.className = "sede-progress-bar";
          progressEl.innerHTML = '<div class="sede-progress-track"><div class="sede-progress-fill"></div></div>'
            + '<div class="sede-progress-info"><span class="sede-progress-counter">1 / 12</span>'
            + '<span class="sede-progress-msg"></span></div>';
          streamBubble.parentElement?.insertBefore(progressEl, streamBubble);
          _sedeProgressAnimate(progressEl);
        }

        var _sedeChunkCount = 0;
        while (true){
          var chunk = await reader.read();
          if (chunk.done) { console.log("[Sede] Stream done. Chunks:", _sedeChunkCount, "fullText length:", fullText.length); break; }
          _sedeChunkCount++;
          var rawChunk = dec.decode(chunk.value, { stream:true });
          if (_sedeChunkCount <= 3) console.log("[Sede] Chunk #" + _sedeChunkCount + ":", JSON.stringify(rawChunk.slice(0, 200)));
          buf += rawChunk;
          var lines = buf.split("\n");
          buf = lines.pop() || "";
          for (var li = 0; li < lines.length; li++){
            var line = lines[li].trim();
            if (!line || line.charAt(0) === ":") continue;
            if (line.indexOf("data: ") === 0){
              var d = line.slice(6).trim();
              if (d === "[DONE]") continue;
              try {
                var p = JSON.parse(d);
                /* Handle progress/completion/error events from auto-continue */
                if (p._progress && progressEl) {
                  var fill = progressEl.querySelector(".sede-progress-fill");
                  var counter = progressEl.querySelector(".sede-progress-counter");
                  if (fill) fill.style.width = Math.min(95, (p.round / p.maxRounds) * 100) + "%";
                  if (counter) counter.textContent = p.round + " / " + p.maxRounds;
                  continue;
                }
                if (p._complete && progressEl) {
                  var fill2 = progressEl.querySelector(".sede-progress-fill");
                  var info2 = progressEl.querySelector(".sede-progress-info");
                  if (fill2) fill2.style.width = "100%";
                  if (info2) info2.innerHTML = '<span class="sede-progress-done"><span class="ms" style="font-size:14px;vertical-align:-2px;">check_circle</span> 完了！' + p.rounds + '回連結・' + p.lines + '行・' + p.elapsed + '秒</span>';
                  progressEl.classList.add("is-complete");
                  setTimeout(function(){ if (progressEl) progressEl.classList.add("is-fade"); }, 3000);
                  continue;
                }
                if (p._truncated) {
                  if (progressEl) {
                    var info4 = progressEl.querySelector(".sede-progress-info");
                    if (info4) info4.innerHTML = '<span class="sede-progress-error"><span class="ms" style="font-size:14px;vertical-align:-2px;">warning</span> ' + (p.message || "分割生成されました") + '</span>';
                  }
                  continue;
                }
                if (p._info) {
                  /* Server retry/fallback info — show in typing bubble */
                  if (streamBubble) {
                    streamBubble.innerHTML = '<div class="sede-retry-notice">'
                      + '<span class="ms" style="font-size:16px;vertical-align:-3px;">hourglass_empty</span> '
                      + escHtml(p.message || "再試行中...") + '</div>';
                  }
                  continue;
                }
                if (p._error) {
                  if (progressEl) {
                    var info3 = progressEl.querySelector(".sede-progress-info");
                    if (info3) info3.innerHTML = '<span class="sede-progress-error"><span class="ms" style="font-size:14px;vertical-align:-2px;">error</span> エラー: ' + (p.message || "不明") + (p.partial ? ' (途中まで表示)' : '') + '</span>';
                  }
                  /* Also show in bubble if no progress bar */
                  if (!progressEl && streamBubble && !fullText) {
                    streamBubble.innerHTML = '<div class="sede-retry-notice is-error">'
                      + '<span class="ms" style="font-size:16px;vertical-align:-3px;">error</span> '
                      + escHtml(p.message || "AIエラー") + '</div>';
                  }
                  continue;
                }
                /* FIX: Kimi K2.6 outputs reasoning_content during thinking phase, then content for final answer */
                var _d = p.choices && p.choices[0] && p.choices[0].delta;
                var delta = p.response || (_d && (_d.content || _d.reasoning_content || _d.reasoning)) || "";
                if (delta) fullText += delta;
              } catch(e){
                if (d) fullText += d;
              }
            }
          }
          /* Throttled render (80ms) */
          var now = Date.now();
          if (now - lastRender > 80 && fullText && streamBubble){
            lastRender = now;
            /* 生成中の進捗ログ: コメントからセクション名を検出 */
            var _sectionMatch = fullText.match(/(?:\/\*\s*=+\s*(.+?)\s*=+\s*\*\/|<!--\s*(.+?)\s*-->|\/\/\s*={3,}\s*(.+?)\s*={3,})/g);
            if (_sectionMatch) {
              var _lastSection = _sectionMatch[_sectionMatch.length - 1];
              var _secName = (_lastSection.match(/(?:\/\*\s*=+\s*(.+?)\s*=+|<!--\s*(.+?)\s*-->|\/\/\s*={3,}\s*(.+?)\s*={3,})/) || [])[1] || "";
              _secName = _secName.replace(/[\*\/=\-<>!]/g, "").trim();
              if (_secName && _secName !== _lastSectionLog) {
                _lastSectionLog = _secName;
                var _secDiv = document.createElement("div");
                _secDiv.className = "sede-log-chat";
                _secDiv.style.opacity = ".6";
                _secDiv.textContent = _secName + " を作成中...";
                chatList.appendChild(_secDiv);
                scrollToBottom();
              }
            }
            /* 左パネル: メインコード（最長ブロック）だけ非表示、検討中の短いコードは残す */
            var _leftText = fullText;
            var _allBlocks = fullText.match(/```\w*\n[\s\S]*?```/g) || [];
            if (_allBlocks.length > 0) {
              /* 最長ブロックを特定して除去 */
              var _longestIdx = 0;
              for (var _bi = 1; _bi < _allBlocks.length; _bi++){
                if (_allBlocks[_bi].length > _allBlocks[_longestIdx].length) _longestIdx = _bi;
              }
              _leftText = _leftText.replace(_allBlocks[_longestIdx], "\n`📄 コードは右パネルに表示中`\n");
            }
            /* 未完成の最長ブロック（開き```のみ）も除去 */
            var _tickPositions = [], _tp2 = 0;
            while ((_tp2 = _leftText.indexOf("```", _tp2)) !== -1) { _tickPositions.push(_tp2); _tp2 += 3; }
            if (_tickPositions.length % 2 === 1) {
              var _lastOpenPos = _tickPositions[_tickPositions.length - 1];
              var _unclosedBlock = _leftText.slice(_lastOpenPos);
              if (_unclosedBlock.length > 200) {
                _leftText = _leftText.slice(0, _lastOpenPos) + "\n`📄 コードは右パネルに表示中`\n";
              }
            }
            _leftText = _leftText.replace(/\n{3,}/g, "\n\n").trim();
            if (typeof _chatTextHasThinking === "function" && _chatTextHasThinking(_leftText)){
              var _tp = _chatParseThinkingContent(_leftText);
              streamBubble.replaceChildren(_chatBuildThinkingDisplay(_tp, 0, true));
            } else {
              streamBubble.innerHTML = parseMarkdown(_leftText || "コード生成中...");
            }
            /* ── リアルタイムコードプレビュー: 最長コードモデル ── */
            try {
              /* 全コードブロックを収集（完成 + 未完成 + 生コード） */
              var _candidates = [];
              /* 完成済み```ブロック */
              var _streamBlocks = extractCodeBlocks(fullText);
              _streamBlocks.forEach(function(b){ _candidates.push({ code: b.code, lang: b.lang }); });
              /* 未完成```ブロック（閉じ```なし） */
              var _allTicks = [], _si = 0;
              while ((_si = fullText.indexOf("```", _si)) !== -1) { _allTicks.push(_si); _si += 3; }
              if (_allTicks.length % 2 === 1) {
                var _lastOpen = _allTicks[_allTicks.length - 1];
                var _afterTicks = fullText.slice(_lastOpen + 3);
                var _nlIdx = _afterTicks.indexOf("\n");
                if (_nlIdx !== -1) {
                  _candidates.push({ code: _afterTicks.slice(_nlIdx + 1), lang: _afterTicks.slice(0, _nlIdx).trim() });
                }
              }
              /* 生コード検出（```なし） */
              if (_candidates.length === 0) {
                var _docIdx = fullText.indexOf("<!DOCTYPE");
                if (_docIdx === -1) _docIdx = fullText.indexOf("<!doctype");
                if (_docIdx === -1) _docIdx = fullText.indexOf("<html");
                if (_docIdx !== -1) _candidates.push({ code: fullText.slice(_docIdx), lang: "html" });
              }
              /* 最長のコードブロックを選択（検討中の短いコードで上書きしない） */
              var _bestCode = "", _bestLang = "";
              _candidates.forEach(function(c){
                if (c.code.length > _bestCode.length) { _bestCode = c.code; _bestLang = c.lang; }
              });
              /* 前回より長い場合のみ更新（検討中の短いコードで2100行を壊さない） */
              if (_bestCode.length >= _sedeStreamLongestLen && _bestCode.trim().length > 20) {
                _sedeStreamLongestLen = _bestCode.length;
                var _cv = codeView || document.getElementById("sedeCodeView");
                if (_cv) {
                  var _pLines = _bestCode.split("\n");
                  if (_pLines[_pLines.length - 1] === "") _pLines.pop();
                  var _numDiv = document.createElement("div");
                  _numDiv.className = "sede-line-numbers";
                  for (var _pi = 0; _pi < _pLines.length; _pi++){
                    var _ln2 = document.createElement("div"); _ln2.textContent = String(_pi + 1); _numDiv.appendChild(_ln2);
                  }
                  var _pre = document.createElement("pre");
                  var _codeEl = document.createElement("code");
                  _codeEl.textContent = _bestCode;
                  _pre.appendChild(_codeEl);
                  _cv.innerHTML = "";
                  _cv.appendChild(_numDiv);
                  _cv.appendChild(_pre);
                  if (editorLang) editorLang.textContent = _pLines.length + "行 生成中...";
                  if (editorEmpty) editorEmpty.style.display = "none";
                  /* 自動スクロール（ユーザーが上にスクロール中は追従しない） */
                  _sedeRightScrollToBottom();
                }
              }
            } catch(_rpe) { console.warn("[Sede/Preview]", _rpe); }
            scrollToBottom();
          }
        }
        /* Final render — メインコードのみ非表示、検討コードは残す */
        if (streamBubble){
          var _finalLeftText = fullText;
          var _fBlocks = fullText.match(/```\w*\n[\s\S]*?```/g) || [];
          if (_fBlocks.length > 0) {
            var _fLongest = 0;
            for (var _fi = 1; _fi < _fBlocks.length; _fi++){
              if (_fBlocks[_fi].length > _fBlocks[_fLongest].length) _fLongest = _fi;
            }
            _finalLeftText = _finalLeftText.replace(_fBlocks[_fLongest], "\n`📄 コードは右パネルに表示中`\n");
          }
          _finalLeftText = _finalLeftText.replace(/\n{3,}/g, "\n\n").trim();
          if (typeof _chatTextHasThinking === "function" && _chatTextHasThinking(_finalLeftText)){
            var _fparsed = _chatParseThinkingContent(_finalLeftText);
            streamBubble.replaceChildren(_chatBuildThinkingDisplay(_fparsed, 0, false));
          } else {
            streamBubble.innerHTML = parseMarkdown(_finalLeftText || "コードを生成しました。右パネルをご確認ください。");
          }
          /* 左パネルの検討コードブロックにヘッダー（Copy / →右へ）を付与 */
          processCodeBlocks(streamBubble);
        }
        /* Check for code → 2-pane（最長コードブロックを使用） */
        {
          var codeBlocks = extractCodeBlocks(fullText);
          if (codeBlocks.length > 0 && window.innerWidth > 768){
            /* 最長ブロックを選択（検討中の短いコードではなくメインコード） */
            var _longestBlock = codeBlocks[0];
            codeBlocks.forEach(function(b){ if (b.code.length > _longestBlock.code.length) _longestBlock = b; });
            _sedeUpdateEditor(_longestBlock);
          }
          /* ── ログUI: 生成完了 + 行数 + 動作チェック ── */
          _sedeCompleteOpLog(_createOpGen);
          if (codeBlocks.length > 0) {
            var _lastBlock = codeBlocks[codeBlocks.length - 1];
            var _lineCount = (_lastBlock.code || "").split("\n").length;
            var _fname = _lastBlock.filename || ("code." + (_lastBlock.lang || "txt"));
            _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">check_circle</span> <span class="cmd">Done</span> 生成完了 — ' + _lineCount + '行 / <code>' + escHtml(_fname) + '</code>', false);
            /* HTML動作チェック */
            if ((_lastBlock.lang === "html" || _fname.endsWith(".html")) && _lastBlock.code && typeof _sedeAutoVerify === "function") {
              var _verifyOp = _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">play_arrow</span> <span class="cmd">Verify</span> 動作チェック中...', true);
              _sedeAutoVerify(_lastBlock.code, 3000).then(function(errors){
                _sedeCompleteOpLog(_verifyOp);
                if (errors.length > 0) {
                  _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">warning</span> JSエラー検出: ' + escHtml(errors.slice(0,2).join("; ")), false);
                } else {
                  _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-2px">check_circle</span> <span class="cmd">Verify</span> 動作チェックOK ✓', false);
                }
              });
            }
          } else {
            _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 回答完了', false);
          }
        }
        /* Check if AI suggests running the code (pattern D) */
        _sedeCheckAutoRunSuggestion(fullText);
      } else {
        /* Non-streaming fallback */
        var data = await res.json();
        fullText = String(data?.text || data?.answer || data?.reply || "回答を取得できませんでした。");
        var tEl2 = document.getElementById("sedeTypingIndicator");
        if (tEl2) tEl2.remove();
        appendMsgDom("ai", fullText, true);
      }

      /* Save AI response — FIX: call via window */
      if (ses && fullText){
        ses.messages.push({ role:"ai", text:fullText, ts:Date.now() });
        ses.updatedAt = Date.now();
        if (typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
      }

      /* Apply Qredit */
      try { if (typeof _appApplyQreditPayload === "function") _appApplyQreditPayload({}); } catch(e){}

    } catch(err){
      if (err.name !== "AbortError"){
        var tEl3 = document.getElementById("sedeTypingIndicator") || document.getElementById("sedeStreamingMsg");
        if (tEl3) tEl3.remove();
        appendMsgDom("ai", "通信エラーが発生しました: " + (err?.message || ""), true);
        if (ses){
          ses.messages.push({ role:"ai", text:"[Error] " + (err?.message || ""), ts:Date.now() });
          /* FIX: call via window */
          if (typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
        }
      }
    } finally {
      _sede.processing = false;
      _sede.abortCtrl = null;
      if (sendBtn) sendBtn.disabled = false;
      /* スクロールフラグ + 最長コード追跡をリセット */
      _sedeLeftUserScrolled = false;
      _sedeRightUserScrolled = false;
      _sedeStreamLongestLen = 0;
      var _scrollBtn = document.getElementById("sedeScrollBottomBtn");
      if (_scrollBtn) _scrollBtn.remove();
      _sedeSetBusy(false);
      /* Clean up streaming element ID */
      var sMsg = document.getElementById("sedeStreamingMsg");
      if (sMsg) sMsg.removeAttribute("id");
      scrollToBottom();
    }
  }

  /* ── Event handlers ── */
  var sedeStopBtn = document.getElementById("sedeStopBtn");
  var sedeSteerArea = document.getElementById("sedeSteerArea");
  var sedeSteerInput = document.getElementById("sedeSteerInput");
  var sedeSteerBtn = document.getElementById("sedeSteerBtn");
  var sedeSteerCloseBtn = document.getElementById("sedeSteerCloseBtn");

  if (inputEl){
    inputEl.addEventListener("input", function(){ autoGrow(); _sedeCmdSuggestCheck(); });
    inputEl.addEventListener("keydown", function(ev){
      /* FIX: Skip during IME composition (日本語入力中) */
      if (ev.isComposing || ev.keyCode === 229) return;
      /* Slash command suggest navigation */
      if (_sedeCmdFiltered.length > 0 && _sedeCmdSuggestEl && _sedeCmdSuggestEl.classList.contains("is-visible")){
        if (ev.key === "ArrowDown"){ ev.preventDefault(); _sedeCmdSuggestNav(1); return; }
        if (ev.key === "ArrowUp"){ ev.preventDefault(); _sedeCmdSuggestNav(-1); return; }
        if (ev.key === "Tab" || (ev.key === "Enter" && !ev.shiftKey)){
          ev.preventDefault();
          if (_sedeCmdSuggestSelect()) return;
        }
        if (ev.key === "Escape"){ ev.preventDefault(); _sedeCmdSuggestHide(); return; }
      }
      if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey){
        ev.preventDefault();
        /* During AI generation → show steer area instead of sending */
        if (_sede.processing){
          var text = String(inputEl.value || "").trim();
          if (text) _sedeShowSteer(text);
          return;
        }
        sendMessage();
      }
    });
  }
  /* Suggest popup click handler */
  (function(){
    var sugEl = document.getElementById("sedeCmdSuggest");
    if (sugEl) sugEl.addEventListener("click", function(e){
      var item = e.target.closest(".sede-cmd-item");
      if (!item) return;
      var idx = parseInt(item.getAttribute("data-cmd-idx"), 10);
      if (!isNaN(idx)){ _sedeCmdActiveIdx = idx; _sedeCmdSuggestSelect(); }
    });
  })();
  if (sendBtn) sendBtn.addEventListener("click", function(){ sendMessage(); });

  /* ── Stop button ── */
  if (sedeStopBtn) sedeStopBtn.addEventListener("click", function(){
    _sedeStopGeneration();
  });
  function _sedeStopGeneration(){
    if (_sede.abortCtrl){
      _sede.abortCtrl.abort();
      _sede.abortCtrl = null;
    }
    _sede.processing = false;
    if (sendBtn) sendBtn.disabled = false;
    _sedeSetBusy(false);
    /* Remove typing indicator */
    var typing = document.getElementById("sedeTypingIndicator");
    if (typing) typing.remove();
    var streaming = document.getElementById("sedeStreamingMsg");
    if (streaming) streaming.removeAttribute("id");
  }
  function _sedeSetBusy(busy){
    if (sedeStopBtn) sedeStopBtn.classList.toggle("hidden", !busy);
    if (sendBtn) sendBtn.classList.toggle("hidden", !!busy);
    /* 深夜帯バナー（JST 0:00〜7:00） */
    var _nightBanner = document.getElementById("sedeNightBanner");
    if (busy) {
      var _jstHour = (new Date().getUTCHours() + 9) % 24;
      if ((_jstHour >= 1 && _jstHour < 6 || (_jstHour === 6 && new Date().getMinutes() < 30)) && !_nightBanner) {
        _nightBanner = document.createElement("div");
        _nightBanner.id = "sedeNightBanner";
        _nightBanner.style.cssText = "padding:10px 16px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);border-radius:8px;margin:8px 12px;font-size:13px;color:#b45309;display:flex;align-items:flex-start;gap:8px;line-height:1.5;";
        _nightBanner.innerHTML = '<span class="ms" style="font-size:18px;color:#f59e0b;flex-shrink:0;margin-top:1px;">warning</span>'
          + '<div style="flex:1;"><strong style="display:block;margin-bottom:2px;">深夜帯のため生成に時間がかかる場合があります</strong>'
          + '<span style="opacity:.8;">現在の時間帯（1:00〜6:30 JST）はサーバー負荷が高く、通常より大幅に時間を要する可能性があります。</span></div>'
          + '<button type="button" style="background:none;border:none;cursor:pointer;color:#b45309;font-size:18px;padding:0;line-height:1;flex-shrink:0;" onclick="this.parentNode.remove()"><span class="ms">close</span></button>';
        if (composerEl && composerEl.parentNode) {
          composerEl.parentNode.insertBefore(_nightBanner, composerEl);
        }
      }
    } else {
      if (_nightBanner) _nightBanner.remove();
    }
  }

  /* ── Steer (direction correction during generation) ── */
  function _sedeShowSteer(text){
    if (!sedeSteerArea || !sedeSteerInput) return;
    sedeSteerInput.value = text || "";
    sedeSteerArea.classList.remove("hidden");
    if (inputEl){ inputEl.value = ""; autoGrow(); }
    sedeSteerInput.focus();
    sedeSteerInput.setSelectionRange(sedeSteerInput.value.length, sedeSteerInput.value.length);
  }
  function _sedeHideSteer(){
    if (sedeSteerArea) sedeSteerArea.classList.add("hidden");
    if (sedeSteerInput) sedeSteerInput.value = "";
  }
  function _sedeExecuteSteer(){
    var text = String(sedeSteerInput?.value || "").trim();
    if (!text) return;
    _sedeHideSteer();
    /* Abort current generation */
    _sedeStopGeneration();
    /* Send steer as new message with context */
    var steerMsg = "【方向修正】前の回答を中断しました。以下の指示に従って最初からやり直してください:\n\n" + text;
    sendMessage(steerMsg);
  }
  if (sedeSteerBtn) sedeSteerBtn.addEventListener("click", _sedeExecuteSteer);
  if (sedeSteerCloseBtn) sedeSteerCloseBtn.addEventListener("click", _sedeHideSteer);
  if (sedeSteerInput) sedeSteerInput.addEventListener("keydown", function(ev){
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === "Enter" && !ev.shiftKey){ ev.preventDefault(); _sedeExecuteSteer(); }
    if (ev.key === "Escape") _sedeHideSteer();
  });

  /* Welcome chips */
  if (wrap) wrap.addEventListener("click", function(e){
    var chip = e.target.closest("[data-sede-prompt]");
    if (chip){
      var prompt = chip.getAttribute("data-sede-prompt");
      if (prompt) sendMessage(prompt);
    }
  });

  /* ═══ Sede Toolbar Button Handlers ═══ */
  var sedeFileInput = document.getElementById("sedeFileInput");
  var sedePendingAttach = document.getElementById("sedePendingAttachments");
  var sedeWebSearchOn = false;

  /* Toolbar event delegation */
  var sedeForm = document.getElementById("sedeComposerForm");
  if (sedeForm) sedeForm.addEventListener("click", function(e){
    var btn = e.target.closest("[data-sede-toolbar]");
    if (!btn) return;
    var action = btn.getAttribute("data-sede-toolbar");

    /* 1. File attach */
    if (action === "attach") {
      if (sedeFileInput) sedeFileInput.click();
      return;
    }

    /* 2. Code snippet */
    if (action === "snippet") {
      _sedeOpenSnippetMode();
      return;
    }

    /* 3. File tree */
    if (action === "files") {
      if (typeof _sedeHandleAction === "function") window._sedeHandleAction("files", "", e);
      else if (typeof _sedeOpenFiles === "function") _sedeOpenFiles();
      return;
    }

    /* 4. Code search */
    if (action === "search") {
      if (typeof _sedeHandleAction === "function") window._sedeHandleAction("search", "", e);
      else if (typeof _sedeOpenSearch === "function") _sedeOpenSearch();
      return;
    }

    /* 5. Web search toggle */
    if (action === "webSearch") {
      sedeWebSearchOn = !sedeWebSearchOn;
      btn.classList.toggle("is-active", sedeWebSearchOn);
      return;
    }

    /* 5.5 Voice co-create (delegateから呼ぶ → 直接ハンドラと統合) */
    if (action === "voice") {
      _sedeVoiceToggle();
      return;
    }

    /* 6. Run code */
    if (action === "run") {
      var latestBlock = _sede.codeHistory[_sede.codeHistory.length - 1];
      if (latestBlock) {
        var editorEl = document.getElementById("sedeCodeEditorArea");
        _sedeRunCode(latestBlock, editorEl);
      } else {
        /* No code in right pane — check if input has code */
        var inputCode = String(inputEl?.value || "").trim();
        if (inputCode.length > 10) {
          var lang = "auto";
          var block = { lang: lang, code: inputCode, filename: "input" };
          _sedeRunCode(block, null);
        }
      }
      return;
    }
  });

  /* File input change handler (text + image support) */
  var _sedeAttachedImages = []; /* { name, mimeType, preview (data URL) } */
  if (sedeFileInput) sedeFileInput.addEventListener("change", function(e){
    var files = Array.from(e.target.files || []);
    if (!files.length) return;
    var imageExts = ["png","jpg","jpeg","gif","webp","svg"];
    var videoExts = ["mp4","mov","webm"];
    files.forEach(function(f){
      var ext = f.name.split(".").pop().toLowerCase();
      var isImage = imageExts.indexOf(ext) !== -1;
      var isVideo = videoExts.indexOf(ext) !== -1;

      if(isVideo){
        /* Extract frames from video → treat as multiple images */
        var url = URL.createObjectURL(f);
        var video = document.createElement("video");
        video.muted = true; video.preload = "auto"; video.src = url;
        video.addEventListener("loadedmetadata", function(){
          var duration = video.duration || 1;
          if(duration > 60){
            URL.revokeObjectURL(url);
            if(sedePendingAttach){
              sedePendingAttach.classList.remove("hidden");
              var errChip = document.createElement("div");
              errChip.className = "app-chat-attach-chip";
              errChip.style.color = "#ef4444";
              errChip.innerHTML = '<span class="ms" style="font-size:14px;">error</span> ' + f.name + ': 60秒以内の動画のみ対応';
              sedePendingAttach.appendChild(errChip);
              setTimeout(function(){ errChip.remove(); if(!sedePendingAttach.children.length) sedePendingAttach.classList.add("hidden"); }, 4000);
            }
            return;
          }
          /* Extract 8 frames → combine into 2x4 grid → 1 image */
          var frameCount = 8;
          var times = [];
          for(var fi = 0; fi < frameCount; fi++) times.push((duration / (frameCount + 1)) * (fi + 1));
          var frameCanvases = [];
          var extracted = 0;

          function grabFrame(t, idx){
            video.currentTime = t;
            video.addEventListener("seeked", function onSeek(){
              video.removeEventListener("seeked", onSeek);
              var fc = document.createElement("canvas");
              var thumbW = 400, thumbH = Math.round(400 * (video.videoHeight / video.videoWidth));
              fc.width = thumbW; fc.height = thumbH;
              fc.getContext("2d").drawImage(video, 0, 0, thumbW, thumbH);
              frameCanvases[idx] = fc;
              extracted++;
              if(extracted >= frameCount){
                /* Build 2x4 grid */
                var cols = 2, rows = 4;
                var tw = frameCanvases[0].width, th = frameCanvases[0].height;
                var labelH = 20;
                var gridCanvas = document.createElement("canvas");
                gridCanvas.width = tw * cols;
                gridCanvas.height = (th + labelH) * rows;
                var gctx = gridCanvas.getContext("2d");
                gctx.fillStyle = "#000";
                gctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);
                for(var gi = 0; gi < frameCount; gi++){
                  var col = gi % cols, row = Math.floor(gi / cols);
                  var x = col * tw, y = row * (th + labelH);
                  if(frameCanvases[gi]) gctx.drawImage(frameCanvases[gi], x, y);
                  /* Timestamp label */
                  gctx.fillStyle = "rgba(0,0,0,0.6)";
                  gctx.fillRect(x, y + th, tw, labelH);
                  gctx.fillStyle = "var(--vq-surface, #fff)";
                  gctx.font = "bold 12px monospace";
                  var sec = times[gi];
                  var tLabel = Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
                  gctx.fillText("Frame " + (gi+1) + " @ " + tLabel, x + 4, y + th + 14);
                }
                var gridDataUrl = gridCanvas.toDataURL("image/jpeg", 0.8);
                var gridName = f.name + "_grid_8frames.jpg";
                _sedeAttachedImages.push({ name: gridName, mimeType: "image/jpeg", preview: gridDataUrl });
                URL.revokeObjectURL(url);

                if(sedePendingAttach){
                  sedePendingAttach.classList.remove("hidden");
                  var chip = document.createElement("div");
                  chip.className = "app-chat-attach-chip";
                  chip.style.cssText = "display:inline-flex;align-items:center;gap:6px;";
                  var thumb = document.createElement("img");
                  thumb.src = gridDataUrl; thumb.style.cssText = "width:48px;height:24px;border-radius:3px;object-fit:cover;";
                  chip.appendChild(thumb);
                  chip.appendChild(document.createTextNode(" " + f.name + " (8フレーム)"));
                  var closeBtn = document.createElement("button");
                  closeBtn.className = "app-chat-attach-chip-close"; closeBtn.type = "button"; closeBtn.innerHTML = '<span class="ms">close</span>';
                  closeBtn.addEventListener("click", function(){
                    _sedeAttachedImages = _sedeAttachedImages.filter(function(img){ return img.name !== gridName; });
                    chip.remove(); if(!sedePendingAttach.children.length) sedePendingAttach.classList.add("hidden");
                  });
                  chip.appendChild(closeBtn);
                  sedePendingAttach.appendChild(chip);
                }
              }
            }, { once: true });
          }
          times.forEach(function(t, i){ setTimeout(function(){ grabFrame(t, i); }, i * 300); });
        });
        return;
      }

      if(isImage){
        /* Read image as base64 data URL */
        var reader = new FileReader();
        reader.onload = function(ev){
          var dataUrl = ev.target.result;
          _sedeAttachedImages.push({ name: f.name, mimeType: f.type || "image/" + ext, preview: dataUrl });
          /* Show thumbnail in pending attachments */
          if(sedePendingAttach){
            sedePendingAttach.classList.remove("hidden");
            var chip = document.createElement("div");
            chip.className = "app-chat-attach-chip";
            chip.style.cssText = "display:inline-flex;align-items:center;gap:6px;";
            var thumb = document.createElement("img");
            thumb.src = dataUrl; thumb.style.cssText = "width:24px;height:24px;border-radius:4px;object-fit:cover;";
            chip.appendChild(thumb);
            chip.appendChild(document.createTextNode(" " + f.name));
            var closeBtn = document.createElement("button");
            closeBtn.className = "app-chat-attach-chip-close"; closeBtn.type = "button"; closeBtn.innerHTML = '<span class="ms">close</span>';
            closeBtn.addEventListener("click", function(){
              _sedeAttachedImages = _sedeAttachedImages.filter(function(img){ return img.name !== f.name; });
              chip.remove(); if(!sedePendingAttach.children.length) sedePendingAttach.classList.add("hidden");
            });
            chip.appendChild(closeBtn);
            sedePendingAttach.appendChild(chip);
          }
        };
        reader.readAsDataURL(f);
      } else {
        /* Text file — existing behavior */
        var reader = new FileReader();
        reader.onload = function(ev){
          var content = ev.target.result;
          var langMap = { py:"python", js:"javascript", ts:"typescript", go:"go", rb:"ruby", sh:"bash", json:"json", html:"html", css:"css", c:"c", java:"java", rs:"rust" };
          var lang = langMap[ext] || "text";
          var insertion = "```" + lang + "\n// " + f.name + "\n" + content + "\n```\n";
          if(inputEl){ inputEl.value = (inputEl.value || "") + insertion; inputEl.focus(); autoGrow(); }
          if(sedePendingAttach){
            sedePendingAttach.classList.remove("hidden");
            var chip = document.createElement("div");
            chip.className = "app-chat-attach-chip";
            chip.innerHTML = '<span class="ms" style="font-size:14px;">description</span> ' + f.name
              + '<button class="app-chat-attach-chip-close" type="button" aria-label="削除"><span class="ms">close</span></button>';
            chip.querySelector(".app-chat-attach-chip-close")?.addEventListener("click", function(){ chip.remove(); if(!sedePendingAttach.children.length) sedePendingAttach.classList.add("hidden"); });
            sedePendingAttach.appendChild(chip);
          }
        };
        reader.readAsText(f);
      }
    });
    sedeFileInput.value = "";
  });

  /* Snippet mode */
  function _sedeOpenSnippetMode(){
    var existing = document.getElementById("sedeSnippetOverlay");
    if (existing) { existing.remove(); return; }
    var ov = document.createElement("div");
    ov.className = "sede-run-confirm-overlay";
    ov.id = "sedeSnippetOverlay";
    var card = document.createElement("div");
    card.className = "sede-run-confirm-card";
    card.innerHTML = '<div class="sede-run-confirm-title"><span class="ms" style="font-size:18px;vertical-align:-3px;margin-right:4px;">code</span> コードスニペットを挿入</div>'
      + '<div style="display:flex;gap:8px;align-items:center;"><label style="font-size:12px;font-weight:600;color:var(--muted);">言語:</label>'
      + '<select id="sedeSnippetLang" style="padding:4px 8px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-family:inherit;">'
      + '<option value="python">Python</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option>'
      + '<option value="go">Go</option><option value="ruby">Ruby</option><option value="bash">Bash</option>'
      + '<option value="html">HTML</option><option value="css">CSS</option><option value="java">Java</option><option value="c">C</option>'
      + '</select></div>'
      + '<textarea id="sedeSnippetCode" rows="10" style="width:100%;font-family:Fira Code,Consolas,monospace;font-size:13px;padding:10px;border:1px solid var(--border);border-radius:10px;resize:vertical;" placeholder="コードを貼り付け..."></textarea>'
      + '<div class="sede-run-confirm-actions">'
      + '<button class="sede-run-confirm-btn is-cancel" type="button"><span class="ms">close</span> キャンセル</button>'
      + '<button class="sede-run-confirm-btn is-run" type="button" id="sedeSnippetInsert"><span class="ms">add</span> 挿入</button></div>';
    ov.appendChild(card);
    document.body.appendChild(ov);
    ov.addEventListener("click", function(e){
      if (e.target === ov || e.target.closest(".is-cancel")) { ov.remove(); return; }
      if (e.target.closest("#sedeSnippetInsert")) {
        var lang = document.getElementById("sedeSnippetLang")?.value || "text";
        var code = document.getElementById("sedeSnippetCode")?.value || "";
        if (code.trim() && inputEl) {
          inputEl.value = (inputEl.value || "") + "```" + lang + "\n" + code + "\n```\n";
          inputEl.focus();
          autoGrow();
        }
        ov.remove();
      }
    });
    ov.addEventListener("keydown", function(e){ if (e.key === "Escape") ov.remove(); });
    setTimeout(function(){ document.getElementById("sedeSnippetCode")?.focus(); }, 100);
  }

  /* Expose handlers globally */
  window._sedeHandleAction = window._sedeHandleAction || function(){};

  /* ── Code execution ── */
  async function executeCodeBlock(language, code, preEl){
    /* Find or create result area */
    var existing = preEl.parentElement?.querySelector(".sede-run-result");
    if (existing) existing.remove();
    var resultDiv = document.createElement("div");
    resultDiv.className = "sede-run-result is-loading";
    resultDiv.innerHTML = '<div class="sede-run-result-head"><span class="ms" style="font-size:16px">terminal</span> 実行中...</div>';
    preEl.insertAdjacentElement("afterend", resultDiv);

    /* Get current mode */
    var currentMode = "code";
    try { currentMode = (typeof _chatNormalizeAiMode === "function") ? _chatNormalizeAiMode(typeof _chatState !== "undefined" ? _chatState.aiMode : "code") : "code"; } catch(e){}

    var apiUrl = "";
    try { apiUrl = (typeof CHAT_AI_API_URL !== "undefined") ? CHAT_AI_API_URL.replace("/api/ai/chat", "/api/code/run") : ""; } catch(e){}
    if (!apiUrl){
      var apiBase = "";
      try { apiBase = String(typeof AUTH_API_BASE !== "undefined" ? AUTH_API_BASE : "").trim().replace(/\/+$/, ""); } catch(e){}
      if (!apiBase) apiBase = "https://vocabuquiz-api.rintyblog.workers.dev";
      apiUrl = apiBase + "/api/code/run";
    }
    var headers = { "Content-Type": "application/json" };
    try {
      var t = (typeof _authGetToken === "function") ? _authGetToken() : null;
      if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim();
      if (t) headers.Authorization = "Bearer " + t;
    } catch(e){}

    try {
      var res = await fetch(apiUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ language: language, code: code, mode: currentMode })
      });
      var data = await res.json();
      resultDiv.classList.remove("is-loading");

      if (!res.ok || data.code){
        resultDiv.classList.add("is-error");
        var errMsg = data.message || data.detail || "実行エラー";
        resultDiv.innerHTML = '<div class="sede-run-result-head"><span class="ms" style="font-size:16px">error</span> エラー'
          + '<button class="sede-run-result-close" type="button" aria-label="閉じる"><span class="ms" style="font-size:16px">close</span></button></div>'
          + '<pre class="sede-run-output">' + escHtml(errMsg) + '</pre>'
          + '<div class="sede-run-actions">'
          + '<button class="sede-run-action-btn is-fix" type="button" data-run-action="fix">🔧 AIに修正依頼</button>'
          + '</div>';
        _attachRunActions(resultDiv, language, code, errMsg, "");
        return;
      }

      var output = String(data.output || "").trim();
      var error = String(data.error || "").trim();
      var exitCode = data.exitCode || 0;
      var execTime = data.executionTime || 0;

      var headText = exitCode === 0 ? "実行完了" : "実行完了 (exit: " + exitCode + ")";
      if (execTime) headText += " — " + execTime + "ms";
      var headIcon = exitCode === 0 ? "check_circle" : "warning";
      var headClass = exitCode === 0 ? "" : " is-warning";

      resultDiv.className = "sede-run-result" + headClass;
      var html = '<div class="sede-run-result-head"><span class="ms" style="font-size:16px">' + headIcon + '</span> ' + escHtml(headText)
        + '<button class="sede-run-result-close" type="button" aria-label="閉じる"><span class="ms" style="font-size:16px">close</span></button></div>';
      if (output) html += '<pre class="sede-run-output">' + escHtml(output) + '</pre>';
      if (error) html += '<pre class="sede-run-output is-stderr">' + escHtml(error) + '</pre>';
      if (!output && !error) html += '<pre class="sede-run-output" style="color:var(--muted);">(出力なし)</pre>';
      /* Action buttons — always show for iterative development */
      html += '<div class="sede-run-actions">';
      if (exitCode !== 0 || error){
        html += '<button class="sede-run-action-btn is-fix" type="button" data-run-action="fix">🔧 AIに修正依頼</button>';
      }
      html += '<button class="sede-run-action-btn is-add" type="button" data-run-action="add">✨ 機能追加を依頼</button>';
      html += '<button class="sede-run-action-btn is-done" type="button" data-run-action="done">✅ 完成</button>';
      html += '</div>';
      resultDiv.innerHTML = html;

      /* Attach event handlers */
      _attachRunActions(resultDiv, language, code, error || "", output);

      /* Close button */
      var closeBtn = resultDiv.querySelector(".sede-run-result-close");
      if (closeBtn) closeBtn.addEventListener("click", function(){ resultDiv.remove(); });

    } catch(err){
      resultDiv.classList.remove("is-loading");
      resultDiv.classList.add("is-error");
      resultDiv.innerHTML = '<div class="sede-run-result-head"><span class="ms" style="font-size:16px">error</span> 接続エラー</div>'
        + '<pre class="sede-run-output">' + escHtml(err?.message || "通信エラー") + '</pre>'
        + '<div class="sede-run-actions"><button class="sede-run-action-btn is-fix" type="button" data-run-action="fix">🔧 AIに修正依頼</button></div>';
      _attachRunActions(resultDiv, language, code, err?.message || "通信エラー", "");
    }
  }

  /* ── Iterative dev: action buttons on execution results ── */
  function _attachRunActions(resultDiv, lang, code, errorText, outputText){
    resultDiv.addEventListener("click", function(e){
      var btn = e.target.closest("[data-run-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-run-action");
      var prompt = "";
      if (action === "fix"){
        prompt = "以下のコード（" + lang + "）を実行したらエラーが出ました。修正してください。\n\n"
          + "エラー内容:\n```\n" + (errorText || "不明なエラー") + "\n```\n\n"
          + "元のコード:\n```" + lang + "\n" + code.slice(0, 3000) + "\n```";
      } else if (action === "add"){
        var feature = window.prompt("追加したい機能を入力してください:", "");
        if (!feature || !feature.trim()) return;
        prompt = "以下のコード（" + lang + "）は正常に動作しました。\n\n"
          + (outputText ? "実行結果:\n```\n" + outputText.slice(0, 1000) + "\n```\n\n" : "")
          + "このコードに以下の機能を追加してください:\n" + feature.trim() + "\n\n"
          + "元のコード:\n```" + lang + "\n" + code.slice(0, 3000) + "\n```";
      } else if (action === "done"){
        resultDiv.innerHTML = '<div class="sede-run-result-head is-done"><span class="ms" style="font-size:16px">celebration</span> 完成！コードは上のコピーボタンからコピーできます。</div>';
        resultDiv.className = "sede-run-result is-done";
        return;
      }
      if (prompt && typeof sendMessage === "function"){
        sendMessage(prompt);
      }
    });
  }

  /* ── Code version tracking ── */
  var _codeVersions = {};
  function _trackCodeVersion(lang, code){
    var key = lang || "code";
    if (!_codeVersions[key]) _codeVersions[key] = [];
    _codeVersions[key].push({ code: code, ts: Date.now() });
    return _codeVersions[key].length;
  }

  /* Expose globally for Quick Chat code blocks too */
  window._vqRunCode = executeCodeBlock;

  /* ── Project Creation Modal ── */
  var _sedeProjectFiles = [];

  function _sedeOpenProjectModal(){
    var existing = document.querySelector(".sede-project-modal");
    if (existing) existing.remove();
    _sedeProjectFiles = [];
    var modal = document.createElement("div");
    modal.className = "sede-project-modal";
    modal.innerHTML = '<div class="sede-project-modal-card">'
      + '<div class="sede-project-modal-head"><h3>New Project</h3><button class="sede-project-modal-close" type="button"><span class="ms">close</span></button></div>'
      + '<div class="sede-project-modal-body">'
      + '<div class="sede-project-field"><label>プロジェクト名</label><input id="sedeProjName" type="text" maxlength="100" placeholder="例: my-todo-app" /></div>'
      + '<div class="sede-project-field"><label>説明（任意）</label><textarea id="sedeProjDesc" rows="2" maxlength="500" placeholder="概要を入力..."></textarea></div>'
      + '<div class="sede-project-dropzone" id="sedeProjDropzone">'
      + '<span class="ms">cloud_upload</span>ファイルまたはZIPをドロップ<br><span style="font-size:11px;opacity:.6;">クリックで選択も可</span>'
      + '<input type="file" id="sedeProjFileInput" multiple style="display:none;" accept=".py,.js,.ts,.go,.rb,.sh,.txt,.json,.md,.html,.css,.c,.java,.rs,.toml,.yaml,.yml,.zip" />'
      + '</div>'
      + '<div class="sede-project-file-list" id="sedeProjFileList"></div>'
      + '</div>'
      + '<div class="sede-project-modal-foot">'
      + '<button type="button" class="sede-project-modal-cancel">キャンセル</button>'
      + '<button type="button" class="is-primary" id="sedeProjCreateBtn">プロジェクト作成</button>'
      + '</div></div>';
    document.body.appendChild(modal);

    var dropzone = modal.querySelector("#sedeProjDropzone");
    var fileInput = modal.querySelector("#sedeProjFileInput");
    var fileListEl = modal.querySelector("#sedeProjFileList");

    /* Close */
    modal.querySelector(".sede-project-modal-close").addEventListener("click", function(){ modal.remove(); });
    modal.querySelector(".sede-project-modal-cancel").addEventListener("click", function(){ modal.remove(); });
    modal.addEventListener("click", function(e){ if (e.target === modal) modal.remove(); });

    /* Dropzone click → file input */
    dropzone.addEventListener("click", function(){ fileInput.click(); });
    dropzone.addEventListener("dragover", function(e){ e.preventDefault(); dropzone.classList.add("is-dragover"); });
    dropzone.addEventListener("dragleave", function(){ dropzone.classList.remove("is-dragover"); });
    dropzone.addEventListener("drop", function(e){
      e.preventDefault(); dropzone.classList.remove("is-dragover");
      _sedeProcessFiles(Array.from(e.dataTransfer.files), fileListEl);
    });
    fileInput.addEventListener("change", function(e){
      _sedeProcessFiles(Array.from(e.target.files), fileListEl);
      fileInput.value = "";
    });

    /* Create button */
    modal.querySelector("#sedeProjCreateBtn").addEventListener("click", async function(){
      var name = (modal.querySelector("#sedeProjName")?.value || "").trim();
      if (!name){ uiAlert("プロジェクト名を入力してください。"); return; }
      var desc = (modal.querySelector("#sedeProjDesc")?.value || "").trim();
      var btn = modal.querySelector("#sedeProjCreateBtn");
      btn.disabled = true; btn.textContent = "🧠 コードを解析中...";
      var h = {};
      try { h["Content-Type"] = "application/json";
        var t = (typeof _authGetToken === "function") ? _authGetToken() : null;
        if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim();
        if (t) h.Authorization = "Bearer " + t;
      } catch(e){}
      var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
      try {
        var res = await fetch(base + "/api/sede/projects", {
          method: "POST", headers: h,
          body: JSON.stringify({ name: name, description: desc, files: _sedeProjectFiles })
        });
        var data = await res.json();
        if (!res.ok){ uiAlert(data.message || "作成に失敗しました。"); btn.disabled = false; btn.textContent = "プロジェクト作成"; return; }
        modal.remove();
        var msg = "✅ プロジェクト **" + escHtml(name) + "** を作成しました。\n\n";
        if (data.context){ msg += "```json\n" + JSON.stringify(data.context, null, 2) + "\n```"; }
        if (typeof sendMessage === "function") sendMessage("/create " + name + (desc ? " — " + desc : ""));
        else appendMsgDom("ai", msg, true);
        updateView(); scrollToBottom();
      } catch(err){
        uiAlert("通信エラー: " + (err?.message || "")); btn.disabled = false; btn.textContent = "プロジェクト作成";
      }
    });
  }

  async function _sedeProcessFiles(fileArray, listEl){
    for (var i = 0; i < fileArray.length; i++){
      var file = fileArray[i];
      if (file.name.toLowerCase().endsWith(".zip") && typeof JSZip !== "undefined"){
        /* ZIP展開 */
        try {
          var zip = await JSZip.loadAsync(file);
          var entries = [];
          zip.forEach(function(path, entry){ if (!entry.dir) entries.push({ path: path, entry: entry }); });
          for (var j = 0; j < entries.length; j++){
            var content = await entries[j].entry.async("string");
            var ext = entries[j].path.split(".").pop().toLowerCase();
            var langMap = { py:"python",js:"javascript",ts:"typescript",go:"go",rb:"ruby",sh:"bash",json:"json",html:"html",css:"css",c:"c",java:"java",rs:"rust" };
            _sedeProjectFiles.push({ path: entries[j].path, content: content.slice(0, 500000), language: langMap[ext] || "text" });
          }
        } catch(e){ console.warn("[ZIP]", e); }
      } else {
        /* 通常ファイル */
        try {
          var content = await file.text();
          var ext = file.name.split(".").pop().toLowerCase();
          var langMap = { py:"python",js:"javascript",ts:"typescript",go:"go",rb:"ruby",sh:"bash",json:"json",html:"html",css:"css",c:"c",java:"java",rs:"rust" };
          _sedeProjectFiles.push({ path: file.name, content: content.slice(0, 500000), language: langMap[ext] || "text" });
        } catch(e){}
      }
    }
    _sedeRenderFileList(listEl);
  }

  function _sedeRenderFileList(listEl){
    if (!listEl) return;
    listEl.innerHTML = _sedeProjectFiles.map(function(f, i){
      return '<div class="sede-project-file-item"><span class="ms">description</span>' + escHtml(f.path)
        + '<span style="color:var(--muted);font-size:10px;margin-left:4px;">' + (f.language || "") + '</span>'
        + '<button type="button" data-sede-file-rm="' + i + '"><span class="ms">close</span></button></div>';
    }).join("");
    listEl.addEventListener("click", function(e){
      var btn = e.target.closest("[data-sede-file-rm]");
      if (!btn) return;
      var idx = Number(btn.getAttribute("data-sede-file-rm"));
      _sedeProjectFiles.splice(idx, 1);
      _sedeRenderFileList(listEl);
    }, { once: false });
  }

  window._sedeOpenProjectModal = _sedeOpenProjectModal;

  /* ── Command Confirmation Card ── */
  /* ── Multi-file diff confirmation card ── */
  async function _sedeShowMultiDiffCard(ev, base, headers){
    var files = ev.files || [];
    var groupId = ev.group_id || "";
    var card = document.createElement("div");
    card.className = "sede-diff-card";
    var html = '<div class="sede-diff-card-head"><span class="ms" style="font-size:16px">edit_note</span> ' + files.length + 'ファイルの変更があります</div>';
    files.forEach(function(f, idx){
      html += '<div class="sede-multi-file-row" data-mf-idx="' + idx + '" data-mf-hid="' + f.history_id + '">'
        + '<span style="color:var(--muted);font-size:11px;width:28px;">' + (idx + 1) + '/' + files.length + '</span>'
        + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(f.file_path) + '</span>'
        + '<span class="sede-diff-card-stats"><span class="is-add">+' + f.add_count + '</span>/<span class="is-del">-' + f.del_count + '</span></span>'
        + '<button class="sede-diff-card-btn" type="button" data-mf-action="view" data-mf-idx="' + idx + '">確認→</button>'
        + '<span class="sede-mf-status" id="sedeMfStatus' + idx + '" style="font-size:10px;width:40px;text-align:center;color:var(--muted);">待機中</span>'
        + '</div>';
    });
    html += '<div class="sede-diff-card-btns" style="margin-top:8px;">'
      + '<button class="sede-diff-card-btn is-apply" type="button" data-mf-action="applyAll">✅ 全て適用</button>'
      + '<button class="sede-diff-card-btn is-reject" type="button" data-mf-action="cancelAll">❌ 全てキャンセル</button>'
      + '</div>';
    card.innerHTML = html;
    card.style.cssText = "font-family:'Fira Code',Consolas,monospace;";
    chatList.appendChild(card);
    scrollToBottom();

    /* Style rows */
    card.querySelectorAll(".sede-multi-file-row").forEach(function(r){
      r.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;";
    });

    return new Promise(function(resolve){
      var applied = 0, rejected = 0;
      card.addEventListener("click", async function(e){
        var btn = e.target.closest("[data-mf-action]");
        if (!btn) return;
        var action = btn.getAttribute("data-mf-action");

        if (action === "view"){
          var idx = Number(btn.getAttribute("data-mf-idx"));
          var f = files[idx];
          if (f && f.diff) _sedeShowDiffView(
            f.diff.split("\n").filter(function(l){ return l.startsWith("+") && !l.startsWith("+++"); }).map(function(l){ return l.slice(1); }).join("\n"),
            (f.file_path || "").split(".").pop() || "txt"
          );
          /* Show individual apply/reject */
          var statusEl = document.getElementById("sedeMfStatus" + idx);
          if (statusEl && statusEl.textContent === "待機中"){
            var ok = await _sedeShowDiffApproval(f.file_path, f.add_count, f.del_count,
              f.diff.split("\n").filter(function(l){ return l.startsWith("+") && !l.startsWith("+++"); }).map(function(l){ return l.slice(1); }).join("\n"),
              (f.file_path || "").split(".").pop() || "txt"
            );
            if (ok){
              try {
                var r = await fetch(base + "/api/sede/apply-diff", { method:"POST", headers:headers, body:JSON.stringify({ history_id: f.history_id, project_id: window._sedeActiveProjectId || "" }) });
                var d = await r.json();
                if (d.ok) { statusEl.textContent = "✅"; statusEl.style.color = "#22c55e"; applied++; if (d.content) _sedeUpdateEditor({ lang: (f.file_path || "").split(".").pop() || "txt", code: d.content, filename: f.file_path }); }
                else { statusEl.textContent = "❌"; statusEl.style.color = "#ef4444"; }
              } catch(err){ statusEl.textContent = "❌"; statusEl.style.color = "#ef4444"; }
            } else { statusEl.textContent = "⏭"; statusEl.style.color = "var(--muted)"; rejected++; fetch(base + "/api/sede/reject-diff", { method:"POST", headers:headers, body:JSON.stringify({ history_id: f.history_id }) }).catch(function(){}); }
            /* Check if all files processed */
            if (applied + rejected >= files.length){
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> ' + applied + 'ファイル適用 / ' + rejected + 'ファイルスキップ', false);
              resolve();
            }
          }
        } else if (action === "applyAll"){
          btn.disabled = true; btn.textContent = "適用中...";
          try {
            var r = await fetch(base + "/api/sede/apply-group", { method:"POST", headers:headers, body:JSON.stringify({ group_id: groupId, project_id: window._sedeActiveProjectId || "" }) });
            var d = await r.json();
            _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> ' + (d.applied_files || 0) + 'ファイルを一括適用しました', false);
            card.querySelectorAll(".sede-mf-status").forEach(function(s){ s.textContent = "✅"; s.style.color = "#22c55e"; });
          } catch(err){ _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 一括適用エラー', false); }
          resolve();
        } else if (action === "cancelAll"){
          files.forEach(function(f){ fetch(base + "/api/sede/reject-diff", { method:"POST", headers:headers, body:JSON.stringify({ history_id: f.history_id }) }).catch(function(){}); });
          card.querySelectorAll(".sede-mf-status").forEach(function(s){ s.textContent = "❌"; s.style.color = "#ef4444"; });
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 全ファイルキャンセル', false);
          resolve();
        }
      });
    });
  }

  function _sedeShowTestFailCard(testResult, historyId, filePath){
    return new Promise(function(resolve){
      var card = document.createElement("div");
      card.className = "sede-diff-card";
      var errSnippet = (testResult.output || "").slice(0, 300).replace(/</g, "&lt;");
      card.innerHTML = '<div class="sede-diff-card-head" style="color:#ef4444"><span class="ms" style="font-size:16px">warning</span> テストが失敗しました</div>'
        + '<div class="sede-diff-card-stats">' + escHtml(filePath || "") + ' — '
        + '<span class="is-add">' + testResult.passed + ' passed</span> / '
        + '<span class="is-del">' + testResult.failed + ' failed</span></div>'
        + '<pre style="margin:6px 0;padding:6px 8px;border-radius:6px;background:var(--chip-bg);font-size:11px;max-height:100px;overflow-y:auto;color:#ef4444;">' + errSnippet + '</pre>'
        + '<div class="sede-diff-card-btns">'
        + '<button class="sede-diff-card-btn is-reject" type="button" data-tf-action="rollback">🔄 ロールバック</button>'
        + '<button class="sede-diff-card-btn" type="button" data-tf-action="ignore">無視して続行</button>'
        + '</div>';
      chatList.appendChild(card);
      scrollToBottom();
      card.addEventListener("click", function(e){
        var btn = e.target.closest("[data-tf-action]");
        if (!btn) return;
        var act = btn.getAttribute("data-tf-action");
        if (act === "rollback"){
          card.innerHTML = '<div class="sede-diff-card-head" style="color:#f59e0b"><span class="ms" style="font-size:16px">undo</span> ロールバック中...</div>';
          resolve(true);
        } else {
          card.innerHTML = '<div class="sede-diff-card-head" style="color:var(--muted)"><span class="ms" style="font-size:16px">check</span> 続行</div>';
          resolve(false);
        }
      });
    });
  }

  function _sedeShowCommandCard(command){
    return new Promise(function(resolve){
      var card = document.createElement("div");
      card.className = "sede-diff-card";
      card.innerHTML = '<div class="sede-diff-card-head"><span class="ms" style="font-size:16px">terminal</span> 以下のコマンドを実行しますか？</div>'
        + '<pre style="margin:6px 0;padding:8px;border-radius:6px;background:var(--chip-bg);font-size:12px;font-family:\'Fira Code\',monospace;">$ ' + escHtml(command) + '</pre>'
        + '<div class="sede-diff-card-btns">'
        + '<button class="sede-diff-card-btn is-apply" type="button" data-cmd-action="run">✅ 実行</button>'
        + '<button class="sede-diff-card-btn is-reject" type="button" data-cmd-action="cancel">❌ キャンセル</button>'
        + '</div>';
      chatList.appendChild(card);
      scrollToBottom();
      card.addEventListener("click", function(e){
        var btn = e.target.closest("[data-cmd-action]");
        if (!btn) return;
        if (btn.getAttribute("data-cmd-action") === "run"){
          card.innerHTML = '<div class="sede-diff-card-head" style="color:#22c55e"><span class="ms" style="font-size:16px">check_circle</span> 実行中...</div>';
          resolve(true);
        } else {
          card.innerHTML = '<div class="sede-diff-card-head" style="color:var(--muted)"><span class="ms" style="font-size:16px">cancel</span> スキップ</div>';
          resolve(false);
        }
      });
    });
  }

  async function _sedeExecCommand(command, base, headers){
    _sedeTerminalLog("$ " + command, "is-cmd");
    var opCmd = _sedeAddOpLog("コマンド実行中: <code>" + escHtml(command) + "</code>", true);
    try {
      var res = await fetch(base + "/api/sede/command", {
        method: "POST", headers: headers,
        body: JSON.stringify({
          project_id: window._sedeActiveProjectId || "",
          session_id: window._sedeActiveSessionId || "",
          command: command,
          language: "bash"
        })
      });
      var data = await res.json();
      _sedeCompleteOpLog(opCmd);
      if (data.output) _sedeTerminalLog(data.output, "is-ok");
      if (data.error) _sedeTerminalLog(data.error, "is-err");
      var status = (data.exitCode === 0) ? "is-ok" : "is-err";
      _sedeTerminalLog("✅ 終了コード: " + (data.exitCode || 0) + " (" + (data.duration || 0) + "ms)", status);
      _sedeAddOpLog("コマンド完了 (exit " + (data.exitCode || 0) + ")", false);
    } catch(err){
      _sedeCompleteOpLog(opCmd);
      _sedeTerminalLog("Error: " + (err?.message || "接続エラー"), "is-err");
      _sedeAddOpLog("コマンド失敗", false);
    }
  }

  /* ── Index / Re-index ── */
  async function _sedeReindex(){
    var pid = window._sedeActiveProjectId || "";
    if (!pid){ uiAlert("プロジェクトが選択されていません。"); return; }
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var h = { "Content-Type": "application/json" };
    try { var t = (typeof _authGetToken === "function") ? _authGetToken() : null; if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (t) h.Authorization = "Bearer " + t; } catch(e){}
    var op = _sedeAddOpLog("🔍 ファイルをインデックス中...", true);
    try {
      var res = await fetch(base + "/api/sede/index", {
        method: "POST", headers: h,
        body: JSON.stringify({ project_id: pid })
      });
      var data = await res.json();
      _sedeCompleteOpLog(op);
      if (data.ok){
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> ' + data.indexed_files + 'ファイル / ' + data.total_chunks + 'チャンクをインデックスしました', false);
      } else {
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> インデックスエラー: ' + (data.message || ''), false);
      }
    } catch(err){
      _sedeCompleteOpLog(op);
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 通信エラー', false);
    }
  }
  window._sedeReindex = _sedeReindex;

  /* ── Sede Project Chat (design AI → implementation AI → diff) ── */
  var _sedeActiveProjectId = "";
  var _sedeActiveSessionId = "";

  async function _sedeSendProjectChat(text, mode){
    if (!_sedeActiveProjectId || !text) return;
    if (_sede.processing) return;
    _sede.processing = true;
    _sedeSetBusy(true);
    if (sendBtn) sendBtn.disabled = true;

    /* Show user message (skip if already shown by sendMessage) */
    if (!mode){
      appendMsgDom("user", text, true);
      updateView(); scrollToBottom();
    }

    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var h = { "Content-Type": "application/json" };
    try {
      var t = (typeof _authGetToken === "function") ? _authGetToken() : null;
      if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim();
      if (t) h.Authorization = "Bearer " + t;
    } catch(e){}

    /* Step indicators */
    var modeLabel = mode === "fix" ? "差分修正" : mode === "rebuild" ? "完全再生成" : mode === "new" ? "新規作成" : "";
    var opThinking = _sedeAddOpLog((modeLabel ? "[" + modeLabel + "] " : "") + "設計AIが分析中...", true);

    try {
      var payload = {
        project_id: _sedeActiveProjectId,
        session_id: _sedeActiveSessionId,
        message: text,
        current_file: _sede.codeHistory.length ? _sede.codeHistory[_sede.codeHistory.length - 1].filename : ""
      };
      if (mode) payload.mode = mode;
      var res = await fetch(base + "/api/sede/chat", {
        method: "POST", headers: h,
        body: JSON.stringify(payload)
      });

      if (!res.ok || !res.body) {
        _sedeCompleteOpLog(opThinking);
        var errData = await res.json().catch(function(){ return {}; });
        appendMsgDom("ai", "エラー: " + (errData.message || res.status), true);
        return;
      }

      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      var opTarget = null, opImpl = null;
      var diffData = null;

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop() || "";
        for (var li = 0; li < lines.length; li++){
          var line = lines[li].trim();
          if (!line || !line.startsWith("data: ")) continue;
          var d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            var ev = JSON.parse(d);
            if (ev.type === "thinking"){
              /* Already showing */
            } else if (ev.type === "log"){
              /* /fix 操作ログ（Material Symbols アイコン） */
              _sedeCompleteOpLog(opThinking);
              if (opImpl) _sedeCompleteOpLog(opImpl);
              var _pLogIcon = "info";
              if (ev.icon === "📖") _pLogIcon = "description";
              else if (ev.icon === "🔍") _pLogIcon = "search";
              else if (ev.icon === "✏️") _pLogIcon = "edit";
              else if (ev.icon === "✅") _pLogIcon = "check_circle";
              else if (ev.icon === "⚠️") _pLogIcon = "warning";
              var _pLogText = ev.text || "";
              var _pLogActive = _pLogText.indexOf("確認しています") >= 0 || _pLogText.indexOf("編集しています") >= 0;
              _sedeAddOpLog(
                '<span class="ms" style="font-size:13px;vertical-align:-2px">' + _pLogIcon + '</span> ' + escHtml(_pLogText),
                _pLogActive
              );
            } else if (ev.type === "target"){
              _sedeCompleteOpLog(opThinking);
              opTarget = _sedeAddOpLog("対象ファイル: <code>" + escHtml(ev.target) + "</code> (" + ev.action + ")", false);
              _sedeCompleteOpLog(opTarget);
            } else if (ev.type === "implementing"){
              opImpl = _sedeAddOpLog("実装AIがコードを生成中...", true);
            } else if (ev.type === "command_suggestion"){
              /* Show command confirmation card */
              var cmdApproved = await _sedeShowCommandCard(ev.command);
              if (cmdApproved){
                await _sedeExecCommand(ev.command, base, h);
              } else {
                _sedeAddOpLog("コマンドをスキップしました: " + escHtml(ev.command), false);
              }
            } else if (ev.type === "streaming"){
              /* Partial text — could show progress but skip for now */
            } else if (ev.type === "fix_diff_ready"){
              /* ═══ New /fix flow: fix_diff_ready event ═══ */
              if (opImpl) _sedeCompleteOpLog(opImpl);

              /* Show diff in right pane immediately */
              var _cvFix = codeView || document.getElementById("sedeCodeView");
              if (_cvFix && ev.diff) _sedeRenderDiffInEditor(ev.diff, _cvFix);

              /* Show approval card in left pane */
              var fixCard = document.createElement("div");
              fixCard.className = "sede-diff-card";
              fixCard.innerHTML = '<div class="sede-diff-card-head">✏️ ' + escHtml(ev.file_path || "file") + ' の変更</div>'
                + '<div class="sede-diff-card-stats"><span class="is-add">＋' + (ev.add_count || 0) + '行追加</span> ／ <span class="is-del">ー' + (ev.del_count || 0) + '行削除</span></div>'
                + (ev.explanation ? '<div style="color:var(--muted);font-size:11px;margin-bottom:8px;">変更内容：' + escHtml(ev.explanation) + '</div>' : '')
                + '<div class="sede-diff-card-btns">'
                + '<button class="sede-diff-card-btn is-apply" type="button" data-diff-action="apply">✅ 適用する</button>'
                + '<button class="sede-diff-card-btn is-reject" type="button" data-diff-action="reject">❌ 拒否する</button>'
                + '</div>';
              chatList.appendChild(fixCard);
              scrollToBottom();

              /* Wait for user action */
              await new Promise(function(resolve){
                fixCard.addEventListener("click", function handler(e){
                  var btn = e.target.closest("[data-diff-action]");
                  if (!btn) return;
                  fixCard.removeEventListener("click", handler);
                  var action = btn.getAttribute("data-diff-action");
                  if (action === "apply"){
                    /* Apply via server */
                    var opApplyFix = _sedeAddOpLog("差分を適用中...", true);
                    fetch(base + "/api/sede/apply-diff", {
                      method: "POST", headers: h,
                      body: JSON.stringify({ history_id: ev.history_id, project_id: window._sedeActiveProjectId || "" })
                    }).then(function(r){ return r.json(); }).then(function(data){
                      _sedeCompleteOpLog(opApplyFix);
                      if (data.ok && data.content){
                        _sedeUpdateEditor({ lang: (ev.file_path || "").split(".").pop() || "txt", code: data.content, filename: ev.file_path });
                      }
                      fixCard.classList.add("is-resolved");
                      fixCard.innerHTML = '<div class="sede-diff-card-head" style="color:#22c55e">✅ 適用しました</div>';
                      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 適用しました', false);
                      resolve();
                    }).catch(function(){
                      _sedeCompleteOpLog(opApplyFix);
                      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 適用失敗', false);
                      resolve();
                    });
                  } else {
                    /* Reject */
                    fetch(base + "/api/sede/reject-diff", {
                      method: "POST", headers: h,
                      body: JSON.stringify({ history_id: ev.history_id })
                    }).catch(function(){});
                    fixCard.classList.add("is-resolved");
                    fixCard.innerHTML = '<div class="sede-diff-card-head" style="color:#ef4444">❌ 変更を拒否しました</div>';
                    _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 変更を拒否しました', false);
                    resolve();
                  }
                });
              });
              diffData = ev; /* Prevent "no diff" fallback */
            } else if (ev.type === "diff"){
              if (opImpl) _sedeCompleteOpLog(opImpl);
              _sedeAddOpLog("差分生成完了 — ＋" + ev.add_count + "行 ／ ー" + ev.del_count + "行", false);
              diffData = ev;
              /* Show diff in right pane (proper diff format with +/- markers) */
              var _cv = codeView || document.getElementById("sedeCodeView");
              if (ev.diff && _cv) {
                _sedeRenderDiffInEditor(ev.diff, _cv);
              }
              /* Show approval card */
              var approved = await _sedeShowDiffApproval(
                ev.file_path || "file",
                ev.add_count || 0,
                ev.del_count || 0,
                ev.diff.split("\n").filter(function(l){ return l.startsWith("+") && !l.startsWith("+++"); }).map(function(l){ return l.slice(1); }).join("\n"),
                (ev.file_path || "").split(".").pop() || "txt"
              );
              if (approved){
                /* Apply diff */
                var opApply = _sedeAddOpLog("差分を適用中...", true);
                try {
                  var applyRes = await fetch(base + "/api/sede/apply-diff", {
                    method: "POST", headers: h,
                    body: JSON.stringify({ history_id: ev.history_id, project_id: window._sedeActiveProjectId || "" })
                  });
                  var applyData = await applyRes.json();
                  _sedeCompleteOpLog(opApply);
                  if (applyData.ok && applyData.content){
                    _sedeUpdateEditor({ lang: (ev.file_path || "").split(".").pop() || "txt", code: applyData.content, filename: ev.file_path });
                    /* Auto-test results */
                    if (applyData.test && !applyData.test.skipped){
                      var t = applyData.test;
                      if (t.success){
                        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">science</span> テスト通過 (' + t.passed + '/' + (t.passed + t.failed) + ')', false);
                        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 適用しました', false);
                      } else {
                        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">science</span> テスト失敗 (' + t.failed + '/' + (t.passed + t.failed) + ')', false);
                        /* Show test output detail */
                        if (t.output) _sedeTerminalLog(t.output.slice(0, 1500), "is-err");
                        /* Show rollback card */
                        var rollbackChoice = await _sedeShowTestFailCard(t, ev.history_id, ev.file_path);
                        if (rollbackChoice){
                          var rbOp = _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">sync</span> ロールバック中...', true);
                          try {
                            var rbRes = await fetch(base + "/api/sede/rollback", {
                              method: "POST", headers: h,
                              body: JSON.stringify({ history_id: ev.history_id, project_id: window._sedeActiveProjectId || "" })
                            });
                            var rbData = await rbRes.json();
                            _sedeCompleteOpLog(rbOp);
                            if (rbData.ok && rbData.content){
                              _sedeUpdateEditor({ lang: (ev.file_path || "").split(".").pop() || "txt", code: rbData.content, filename: ev.file_path });
                              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">sync</span> ロールバック完了', false);
                            }
                          } catch(rbErr){ _sedeCompleteOpLog(rbOp); _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> ロールバック失敗', false); }
                        } else {
                          _sedeAddOpLog("⚠️ テスト失敗を無視して続行", false);
                        }
                      }
                    } else {
                      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 適用しました', false);
                    }
                    if (terminalBody) _sedeTerminalLog("Applied: " + ev.file_path, "is-ok");
                  } else {
                    _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 適用失敗: ' + (applyData.message || ''), false);
                  }
                } catch(e){
                  _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 通信エラー', false);
                }
              } else {
                /* Reject */
                fetch(base + "/api/sede/reject-diff", {
                  method: "POST", headers: h,
                  body: JSON.stringify({ history_id: ev.history_id })
                }).catch(function(){});
                _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">cancel</span> 変更を拒否しました', false);
              }
            } else if (ev.type === "multi_diff_ready"){
              if (opImpl) _sedeCompleteOpLog(opImpl);
              _sedeAddOpLog("全差分の確認をお待ちしています (" + ev.total_files + "ファイル)", false);
              /* Show multi-file confirmation card */
              await _sedeShowMultiDiffCard(ev, base, h);
            } else if (ev.type === "raw_response"){
              if (opImpl) _sedeCompleteOpLog(opImpl);
              var _rawText = (typeof ev.text === "string") ? ev.text : JSON.stringify(ev.text || "");
              if (_rawText && _rawText !== "[object Object]") appendMsgDom("ai", _rawText, true);
            } else if (ev.type === "error"){
              _sedeCompleteOpLog(opThinking);
              if (opImpl) _sedeCompleteOpLog(opImpl);
              appendMsgDom("ai", "エラー: " + (ev.text || ev.message || ""), true);
            }
          } catch(e){}
        }
      }
      if (!diffData){
        _sedeCompleteOpLog(opThinking);
      }
    } catch(err){
      _sedeCompleteOpLog(opThinking);
      appendMsgDom("ai", "通信エラー: " + (err?.message || ""), true);
    } finally {
      _sede.processing = false;
      if (sendBtn) sendBtn.disabled = false;
      _sedeSetBusy(false);
      scrollToBottom();
    }
  }

  window._sedeSendProjectChat = _sedeSendProjectChat;
  window._sedeSetActiveProject = function(pid, sid){ _sedeActiveProjectId = pid; _sedeActiveSessionId = sid; window._sedeActiveProjectId = pid; window._sedeActiveSessionId = sid; };

  /* ═══ Phase 1: 3-Pane UI (Resize, File Tree, Tabs, Logs, Live Preview) ═══ */

  /* ── Resize Handles ── */
  (function _sedeInitResize(){
    var leftH = document.getElementById("sedeResizeLeft");
    var rightH = document.getElementById("sedeResizeRight");
    var treePane = document.getElementById("sedeFileTreePane");
    var rightPane = document.getElementById("sedeRightPane");
    var wrap = document.getElementById("sedeChatWrap");

    function startDrag(handle, onMove){
      if(!handle) return;
      function down(e){
        e.preventDefault();
        var startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        handle.classList.add("is-dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        function move(e2){
          var x = e2.clientX || (e2.touches && e2.touches[0].clientX) || 0;
          onMove(x - startX, startX);
        }
        function up(){
          handle.classList.remove("is-dragging");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          document.removeEventListener("touchmove", move);
          document.removeEventListener("touchend", up);
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
        document.addEventListener("touchmove", move, {passive:false});
        document.addEventListener("touchend", up);
      }
      handle.addEventListener("mousedown", down);
      handle.addEventListener("touchstart", down, {passive:false});
    }

    if(leftH && treePane){
      var initW = 220;
      startDrag(leftH, function(dx){
        var nw = Math.max(140, Math.min(400, initW + dx));
        treePane.style.width = nw + "px";
        treePane.style.flexBasis = nw + "px";
      });
      leftH.addEventListener("dblclick", function(){ treePane.classList.toggle("is-collapsed"); });
    }
    if(rightH && rightPane && wrap){
      startDrag(rightH, function(dx){
        var wW = wrap.clientWidth;
        var cur = rightPane.clientWidth;
        var nw = Math.max(280, Math.min(wW * 0.6, cur - dx));
        rightPane.style.flexBasis = nw + "px";
      });
    }
  })();

  /* ── File Tree Collapse Toggle ── */
  document.addEventListener("click", function(e){
    var btn = e.target.closest("[data-sede-tree]");
    if(!btn) return;
    var action = btn.dataset.sedeTree;
    var tree = document.getElementById("sedeFileTreePane");
    if(action === "collapse" && tree) tree.classList.add("is-collapsed");
    if(action === "refresh") _sedeRenderFileTree();
    if(action === "newFile"){ /* TODO Phase 2 */ }
  });

  /* ── File Tree Renderer ── */
  function _sedeRenderFileTree(){
    var body = document.getElementById("sedeFileTreeBody");
    var nameEl = document.getElementById("sedeFileTreeProjectName");
    if(!body) return;
    var files = [];
    /* Project mode */
    if(window._sedeActiveProjectId && Array.isArray(window._sedeProjectFiles)){
      files = window._sedeProjectFiles;
      if(nameEl) nameEl.textContent = window._sedeProjectName || window._sedeActiveProjectId;
    } else {
      /* Quick session: build from codeHistory */
      var seen = {};
      (_sede.codeHistory || []).forEach(function(b){
        var name = b.filename || ("code." + (b.lang || "txt"));
        if(!seen[name]){ seen[name] = 1; files.push({ path: name, language: b.lang }); }
      });
      if(nameEl) nameEl.textContent = files.length ? "Quick Session" : "No Project";
    }
    body.innerHTML = "";
    if(!files.length){
      body.innerHTML = '<div class="sede-file-tree-empty">プロジェクトを開始してください</div>';
      return;
    }
    /* Build flat list (folder grouping can be added later) */
    var sorted = files.slice().sort(function(a,b){ return (a.path||"").localeCompare(b.path||""); });
    var frag = document.createDocumentFragment();
    sorted.forEach(function(f){
      var el = document.createElement("div");
      el.className = "sede-tree-file";
      var ext = String(f.path||"").split(".").pop().toLowerCase();
      var icon = ext === "js" || ext === "ts" ? "javascript" : ext === "css" ? "css" : ext === "html" ? "html" : ext === "py" ? "code" : "description";
      el.innerHTML = '<span class="ms">' + icon + '</span> ' + escHtml(f.path || "unknown");
      el.setAttribute("data-sede-tree-file", f.path||"");
      el.addEventListener("click", function(){
        /* Open file in editor */
        body.querySelectorAll(".sede-tree-file").forEach(function(x){ x.classList.remove("is-active"); });
        el.classList.add("is-active");
        /* Find code block */
        var found = null;
        (_sede.codeHistory || []).forEach(function(b){ if(b.filename === f.path) found = b; });
        if(found && typeof _sedeUpdateEditor === "function") _sedeUpdateEditor(found.code, found.lang, found.filename);
      });
      frag.appendChild(el);
    });
    body.appendChild(frag);
  }
  window._sedeRenderFileTree = _sedeRenderFileTree;

  /* ── Right Pane Tab Switching ── */
  function _sedeActivateRightTab(tabName){
    var bar = document.getElementById("sedeRightTabBar");
    var pane = document.getElementById("sedeRightPane");
    var centerPane = document.getElementById("sedeCenterPane");
    if(!bar || !pane) return;
    bar.querySelectorAll(".sede-right-tab").forEach(function(t){ t.classList.remove("is-active"); });
    pane.querySelectorAll(".sede-right-tab-content").forEach(function(p){ p.classList.remove("is-active"); });
    var btn = bar.querySelector('[data-sede-right-tab="' + tabName + '"]');
    var panel = pane.querySelector('[data-sede-tab-panel="' + tabName + '"]');
    if(btn) btn.classList.add("is-active");
    if(panel) panel.classList.add("is-active");
  }
  window._sedeActivateRightTab = _sedeActivateRightTab;

  var _rtBar = document.getElementById("sedeRightTabBar");
  if(_rtBar) _rtBar.addEventListener("click", function(e){
    var btn = e.target.closest(".sede-right-tab");
    if(btn) _sedeActivateRightTab(btn.getAttribute("data-sede-right-tab") || "chat");
  });

  /* ── Log Panel (timestamps, dedicated tab) ── */
  var _origSedeAddOpLog = (typeof _sedeAddOpLog === "function") ? _sedeAddOpLog : null;
  function _sedeAddOpLogV2(text, active){
    /* Write to dedicated Logs tab */
    var logBody = document.getElementById("sedeLogPanelBody");
    if(logBody){
      var now = new Date();
      var ts = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0") + ":" + String(now.getSeconds()).padStart(2,"0");
      var item = document.createElement("div");
      item.className = "sede-oplog-item";
      item.innerHTML = '<div class="sede-oplog-dot' + (active ? " is-active" : " is-done") + '"></div>'
        + '<span style="font-size:10px;color:rgba(0,0,0,.3);flex-shrink:0;font-family:monospace;min-width:56px;">' + ts + '</span>'
        + '<div class="sede-oplog-text">' + text + '</div>';
      logBody.appendChild(item);
      logBody.scrollTop = logBody.scrollHeight;
      /* Auto-switch to Logs tab during processing */
      if(_sede.processing) _sedeActivateRightTab("logs");
      return item;
    }
    /* Fallback to original */
    if(_origSedeAddOpLog) return _origSedeAddOpLog(text, active);
    return null;
  }

  /* ── Live Preview Auto-update ── */
  window._sedePreviewErrors = [];
  /* Listen for sede-console error messages from auto-preview iframe */
  window.addEventListener("message", function(e){
    if(e.data && e.data.type === "sede-console" && e.data.method === "error"){
      var msg = (e.data.args || []).join(" ");
      if(msg) window._sedePreviewErrors.push(msg);
    }
  });

  function _sedeAutoPreview(block){
    var container = document.getElementById("sedeLivePreview");
    if(!container) return;
    var lang = String(block.lang || "").toLowerCase();
    if(lang !== "html" && lang !== "css" && lang !== "javascript" && lang !== "js") return;
    var code = block.code || "";
    if(!code.trim()) return;
    /* Clear previous errors */
    window._sedePreviewErrors = [];
    var html = "";
    if(lang === "html") html = code;
    else if(lang === "css") html = "<!DOCTYPE html><html><head><style>" + code + "</style></head><body></body></html>";
    else html = "<!DOCTYPE html><html><head></head><body><script>" + code + "<\/script></body></html>";
    /* Inject console capture + window.onerror + unhandledrejection */
    var cap = '<script>'
      + 'window.onerror=function(m,s,l,c,e){window.parent.postMessage({type:"sede-console",method:"error",args:["Uncaught: "+m+" (line "+l+")"]},"*");};'
      + 'window.addEventListener("unhandledrejection",function(e){window.parent.postMessage({type:"sede-console",method:"error",args:["Promise: "+e.reason]},"*");});'
      + 'var _c=console;["log","warn","error","info"].forEach(function(m){var o=_c[m];_c[m]=function(){o.apply(_c,arguments);try{window.parent.postMessage({type:"sede-console",method:m,args:Array.from(arguments).map(String)},"*")}catch(e){}}});'
      + '<\/script>';
    var injected = html.replace(/<head>/i, "<head>" + cap);
    if(injected === html) injected = cap + html;
    /* Remove old iframe */
    var old = container.querySelector("iframe");
    if(old) old.remove();
    container.querySelector(".sede-live-preview-empty")?.remove();
    var iframe = document.createElement("iframe");
    iframe.className = "sede-live-preview-frame";
    iframe.sandbox = "allow-scripts allow-same-origin allow-modals allow-forms allow-popups";
    iframe.style.cssText = "width:100%;flex:1;border:none;min-height:0;background:#fff;";
    iframe.srcdoc = injected;
    container.appendChild(iframe);
  }
  window._sedeAutoPreview = _sedeAutoPreview;

  /* ═══ Phase 2: Autonomous AI Agent ═══ */

  var AGENT_MAX_FIX = 1;
  var AGENT_MAX_TEST = 3;
  var AGENT_PREVIEW_WAIT = 2500;

  async function _sedeAgentRun(userPrompt){
    if(_sede.agentRunning){ appendMsgDom("ai", "エージェントが既に実行中です", true); return; }
    _sede.agentRunning = true;
    _sede.processing = true;
    if(sendBtn) sendBtn.disabled = true;
    _sedeSetBusy(true);
    if(typeof _sedeActivateRightTab === "function") _sedeActivateRightTab("logs");

    /* Clear logs */
    var logBody = document.getElementById("sedeLogPanelBody");
    if(logBody) logBody.innerHTML = "";

    var autoMode = _sedeDetectAutoMode();
    var existBlock = (_sede.codeHistory && _sede.codeHistory.length) ? _sede.codeHistory[_sede.codeHistory.length - 1] : null;

    try{
      /* ── Show user message + spinner in chat ── */
      appendMsgDom("user", userPrompt, true);
      updateView(); scrollToBottom();
      /* Add spinner to chat (only visible element during generation) */
      var _agentSpinner = document.createElement("div");
      _agentSpinner.className = "sede-chat-msg is-ai";
      _agentSpinner.id = "sedeAgentSpinner";
      _agentSpinner.innerHTML = '<div class="sede-agent-spinner-wrap">'
        + '<div class="sede-spinner-icon"></div>'
        + '<span class="sede-agent-spinner-text" style="font-size:13px;color:var(--muted,#888);">生成中...</span>'
        + '</div>';
      if(chatList) chatList.appendChild(_agentSpinner);
      scrollToBottom();
      /* Switch to Logs tab for detailed progress */
      if(typeof _sedeActivateRightTab === "function") _sedeActivateRightTab("logs");

      /* ── Phase A: Analysis ── */
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">search</span> 要件を分析中...', true);

      /* ── Collect attached images ── */
      var attachedImages = (typeof _sedeAttachedImages !== "undefined" && _sedeAttachedImages.length) ? _sedeAttachedImages.slice() : [];
      if(attachedImages.length){
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">image</span> ' + attachedImages.length + '枚の画像が添付されています', false);
        /* Clear after collecting */
        _sedeAttachedImages = [];
        var pa = document.getElementById("sedePendingAttachments");
        if(pa){ pa.innerHTML = ""; pa.classList.add("hidden"); }
      }

      /* ── Phase B: Generate/Fix ── */
      var modeLabel = autoMode === "create" ? "生成" : "修正";
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">code</span> コード' + modeLabel + '中... (Phase B)', true);

      var genResult = await _sedeAgentGenerate(userPrompt, existBlock, autoMode, attachedImages);
      if(!genResult.ok){
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> ' + modeLabel + '失敗: ' + (genResult.error || "不明"), false);
        return;
      }
      var currentBlock = genResult.block;
      var lineCount = (currentBlock.code || "").split("\n").length;
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> ' + modeLabel + '完了 (' + lineCount + '行)', false);

      /* ── Phase C↔D: Preview Inspect + Auto-Fix Loop ── */
      for(var fixRetry = 0; fixRetry < AGENT_MAX_FIX; fixRetry++){
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">visibility</span> プレビュー検査中... (Phase C)', true);

        /* Update preview */
        if(typeof _sedeAutoPreview === "function") _sedeAutoPreview(currentBlock);
        if(typeof _sedeActivateRightTab === "function") _sedeActivateRightTab("preview");
        await _sleep(AGENT_PREVIEW_WAIT);
        if(typeof _sedeActivateRightTab === "function") _sedeActivateRightTab("logs");

        /* Inspect */
        var inspection = (typeof _sedeInspectPreview === "function") ? _sedeInspectPreview() : null;
        /* Clear global error array after reading so next iteration gets fresh errors */
        window._sedePreviewErrors = [];
        var errors = [];
        if(inspection){
          if(inspection.consoleErrors && inspection.consoleErrors.length){
            /* Deduplicate errors */
            var seen = {};
            for(var ei = 0; ei < inspection.consoleErrors.length; ei++){
              var errKey = inspection.consoleErrors[ei].slice(0, 100);
              if(!seen[errKey]){ seen[errKey] = true; errors.push("JSエラー: " + inspection.consoleErrors[ei]); }
            }
          }
          if((!inspection.bodyText || inspection.bodyText.trim().length < 5) && autoMode === "create"){
            errors.push("画面に何も表示されていません");
          }
        }

        /* ── Static analysis: find undefined function refs in onclick/onchange/onsubmit etc ── */
        var _codeStr = (currentBlock.code || "");
        if(_codeStr.length > 50){
          /* Extract function calls from on* attributes: onclick="foo()" etc */
          var _onRefs = _codeStr.match(/\bon\w+\s*=\s*"([^"]+)"/g) || [];
          var _calledFns = {};
          for(var oi = 0; oi < _onRefs.length; oi++){
            var _fnMatch = _onRefs[oi].match(/=\s*"([^"]+)"/);
            if(_fnMatch){
              var _calls = _fnMatch[1].match(/([a-zA-Z_$][\w$]*)\s*\(/g) || [];
              for(var ci = 0; ci < _calls.length; ci++){
                var _fn = _calls[ci].replace(/\s*\($/, "");
                if(_fn && _fn !== "event" && _fn !== "this" && _fn !== "return" && _fn !== "if" && _fn !== "alert" && _fn !== "confirm" && _fn !== "prompt" && _fn !== "parseInt" && _fn !== "parseFloat" && _fn !== "console" && _fn !== "JSON" && _fn !== "Math" && _fn !== "Date" && _fn !== "Array" && _fn !== "Object" && _fn !== "String" && _fn !== "Number" && _fn !== "Boolean" && _fn !== "setTimeout" && _fn !== "setInterval" && _fn !== "clearTimeout" && _fn !== "clearInterval" && _fn !== "fetch" && _fn !== "document" && _fn !== "window" && _fn !== "navigator" && _fn !== "location" && _fn !== "history"){
                  _calledFns[_fn] = true;
                }
              }
            }
          }
          /* Check which called functions are actually defined */
          var _undefinedFns = [];
          for(var _fn2 in _calledFns){
            /* Look for function definition: function name(, const/let/var name =, name: function, name = function */
            var _defPat = new RegExp("(function\\s+" + _fn2 + "\\s*\\(|(?:const|let|var)\\s+" + _fn2 + "\\s*=|" + _fn2 + "\\s*:\\s*function|" + _fn2 + "\\s*=\\s*function|" + _fn2 + "\\s*=\\s*\\()", "");
            if(!_defPat.test(_codeStr)){
              _undefinedFns.push(_fn2);
            }
          }
          if(_undefinedFns.length > 0){
            var _seenStatic = {};
            for(var ui = 0; ui < _undefinedFns.length; ui++){
              if(!_seenStatic[_undefinedFns[ui]]){
                _seenStatic[_undefinedFns[ui]] = true;
                errors.push("未定義関数: " + _undefinedFns[ui] + "() がonclick等で呼ばれていますが、関数が定義されていません。function " + _undefinedFns[ui] + "(){...} を追加してください");
              }
            }
          }
        }

        if(errors.length === 0){
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> エラーなし', false);
          break;
        }

        /* Errors found → auto-fix */
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">warning</span> エラー検出: ' + escHtml(errors[0].slice(0, 80)), false);

        if(fixRetry >= AGENT_MAX_FIX - 1){
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> 最大修正回数に達しました', false);
          break;
        }

        /* Phase D: Auto-fix */
        var fixInstruction = "以下のエラーを修正してください:\n" + errors.join("\n");
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">build</span> 自動修正中... (Phase D, 試行 ' + (fixRetry + 1) + '/' + AGENT_MAX_FIX + ')', true);

        var fixResult = await _sedeAgentGenerate(fixInstruction, currentBlock, "fix");
        if(fixResult.ok){
          currentBlock = fixResult.block;
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 修正適用完了', false);
        } else {
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> 修正失敗', false);
          break;
        }
      }

      /* ── Phase E2B: E2B Sandbox自動実行 ── */
      try {
        var _e2bCode = currentBlock.code || "";
        var _e2bLang = String(currentBlock.lang || "html").toLowerCase();
        var _e2bBase = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
        var _e2bHdrs = { "Content-Type": "application/json" };
        try { var _e2bTk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (_e2bTk) _e2bHdrs.Authorization = "Bearer " + _e2bTk; } catch {}

        /* HTMLアプリ: E2Bにファイル書き込み→簡易サーバー起動チェック */
        if (_e2bCode.length > 100) {
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">terminal</span> E2B Sandbox: コードを書き込み中...', true);

          /* ファイル書き込み */
          var _writeRes = await fetch(_e2bBase + "/api/sede/file-write", {
            method: "POST", headers: _e2bHdrs,
            body: JSON.stringify({ path: "/home/user/app/" + (currentBlock.filename || "index.html"), content: _e2bCode })
          }).then(function(r) { return r.json(); });

          if (_writeRes.ok) {
            _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> ファイル書き込み完了', false);

            /* E2B実行 + エラー自動修正ループ */
            var _e2bMaxFix = 3;
            var _e2bRunCmd = "";
            var _e2bInstallCmd = "";

            if (_e2bLang === "js" || _e2bLang === "javascript" || _e2bCode.includes("require(") || _e2bCode.includes("import ")) {
              _e2bInstallCmd = "cd /home/user/app && npm install 2>&1 | tail -5";
              _e2bRunCmd = "cd /home/user/app && timeout 5 node " + (currentBlock.filename || "index.js") + " 2>&1 || true";
            } else if (_e2bLang === "py" || _e2bLang === "python") {
              _e2bRunCmd = "cd /home/user/app && timeout 5 python3 " + (currentBlock.filename || "main.py") + " 2>&1 || true";
            } else if (_e2bLang === "html") {
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> HTMLファイルをE2Bに保存完了', false);
            }

            if (_e2bRunCmd) {
              /* npm install (JSのみ) */
              if (_e2bInstallCmd) {
                _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">terminal</span> npm install 実行中...', true);
                var _npmRes = await fetch(_e2bBase + "/api/sede/exec", {
                  method: "POST", headers: _e2bHdrs,
                  body: JSON.stringify({ command: _e2bInstallCmd, timeout: 30000 })
                }).then(function(r) { return r.json(); });
                if (_npmRes.stdout) _sedeTerminalLog(_npmRes.stdout, "is-ok");
                if (_npmRes.stderr) _sedeTerminalLog(_npmRes.stderr, "is-err");
              }

              /* 実行 → エラーなら自動修正 → 再実行 */
              for (var _e2bFix = 0; _e2bFix < _e2bMaxFix; _e2bFix++) {
                _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">terminal</span> 実行中... (' + (_e2bFix + 1) + '/' + _e2bMaxFix + ')', true);
                var _runRes = await fetch(_e2bBase + "/api/sede/exec", {
                  method: "POST", headers: _e2bHdrs,
                  body: JSON.stringify({ command: _e2bRunCmd, timeout: 10000 })
                }).then(function(r) { return r.json(); });

                if (_runRes.stdout) _sedeTerminalLog(_runRes.stdout, "is-ok");
                if (_runRes.stderr) _sedeTerminalLog(_runRes.stderr, "is-err");

                /* エラー判定 */
                var _e2bErrors = [];
                if (_runRes.stderr && _runRes.stderr.trim()) _e2bErrors.push(_runRes.stderr.trim());
                if (_runRes.exitCode && _runRes.exitCode !== 0 && !_runRes.stdout) _e2bErrors.push("exit code: " + _runRes.exitCode);

                if (_e2bErrors.length === 0) {
                  _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 実行成功', false);
                  if (_runRes.stdout) _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">info</span> 出力: ' + _runRes.stdout.split("\n")[0].slice(0, 60), false);
                  break;
                }

                /* エラーあり → 自動修正 */
                _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">warning</span> E2Bエラー: ' + escHtml(_e2bErrors[0].split("\n")[0].slice(0, 80)), false);

                if (_e2bFix >= _e2bMaxFix - 1) {
                  _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> E2B自動修正の最大回数に達しました', false);
                  break;
                }

                /* DeepSeekで修正 */
                _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">build</span> E2Bエラーを自動修正中...', true);
                var _e2bFixInst = "以下の実行時エラーを修正してください:\n" + _e2bErrors.join("\n");
                var _e2bFixRes = await _sedeAgentGenerate(_e2bFixInst, currentBlock, "fix");
                if (_e2bFixRes.ok) {
                  currentBlock = _e2bFixRes.block;
                  _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 修正適用完了', false);
                  /* 修正コードをE2Bに再書き込み */
                  await fetch(_e2bBase + "/api/sede/file-write", {
                    method: "POST", headers: _e2bHdrs,
                    body: JSON.stringify({ path: "/home/user/app/" + (currentBlock.filename || "index.html"), content: currentBlock.code })
                  });
                } else {
                  _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> 修正失敗', false);
                  break;
                }
              }
            }
          }
        }
      } catch (_e2bErr) {
        console.warn("[Agent/E2B]", _e2bErr);
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">info</span> E2B: ' + (_e2bErr?.message || "スキップ"), false);
      }

      /* ── Phase E↔F: Test (HTML only for now — skip for non-testable) ── */
      var lang = String(currentBlock.lang || "").toLowerCase();
      if(lang === "js" || lang === "javascript" || lang === "py" || lang === "python"){
        for(var testRetry = 0; testRetry < AGENT_MAX_TEST; testRetry++){
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">science</span> テスト生成・実行中... (Phase E)', true);
          var testResult = await _sedeAgentTest(currentBlock);
          if(testResult.passed){
            _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> テスト通過', false);
            break;
          }
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">warning</span> テスト失敗: ' + escHtml((testResult.error || "").slice(0, 80)), false);
          if(testRetry >= AGENT_MAX_TEST - 1){
            _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> テスト修正の最大回数に達しました', false);
            break;
          }
          /* Phase F: Fix failing tests */
          var testFixInst = "以下のテストが失敗しました。コードを修正してください:\n" + (testResult.error || testResult.output || "");
          _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">build</span> テスト修正中... (Phase F, 試行 ' + (testRetry + 1) + '/' + AGENT_MAX_TEST + ')', true);
          var tFixResult = await _sedeAgentGenerate(testFixInst, currentBlock, "fix");
          if(tFixResult.ok) currentBlock = tFixResult.block;
        }
      }

      /* ── Phase G: Done ── */
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 完成！', false);

      /* Remove spinner */
      var _sp = document.getElementById("sedeAgentSpinner");
      if(_sp) _sp.remove();

      /* Build completion summary */
      var _lines = (currentBlock.code || "").split("\n").length;
      var _lang = (currentBlock.lang || "html").toUpperCase();
      var _fname = currentBlock.filename || "app.html";
      var _summary = "**完了！** " + _lines + "行 / " + _lang + "\n\n";
      _summary += "**実装内容:**\n";
      _summary += "- `" + _fname + "` を" + (autoMode === "create" ? "生成" : "修正") + "\n";
      if(autoMode === "create"){
        /* Extract key features from the code */
        var _hasLS = currentBlock.code.includes("localStorage");
        var _hasModal = currentBlock.code.includes("modal");
        var _hasSearch = currentBlock.code.includes("search");
        var _hasDark = currentBlock.code.includes("dark") || currentBlock.code.includes("theme");
        var _features = [];
        if(_hasLS) _features.push("データ永続化 (localStorage)");
        if(_hasModal) _features.push("モーダル/ダイアログ");
        if(_hasSearch) _features.push("検索機能");
        if(_hasDark) _features.push("ダークモード");
        if(_features.length) _summary += "- " + _features.join("、") + "\n";
      }
      _summary += "\n**次のステップ:**\n";
      _summary += "- プレビューボタン(▶)で動作確認\n";
      _summary += "- 修正したい箇所があれば自然言語で指示\n";
      _summary += "- `/deploy` で公開";

      appendMsgDom("ai", _summary, true);
      if(typeof _sedeActivateRightTab === "function") _sedeActivateRightTab("chat");
      scrollToBottom();

      /* Fetch live preview via E2B and display inline (best-effort, non-blocking)
         Pass fullstack files map if Reasoner emitted one via files_preview event */
      try {
        if(typeof _sedeShowScreenshot === "function") {
          var _fm = window._sedeLastFilesMap || null;
          _sedeShowScreenshot(currentBlock.code || "", _fm);
          window._sedeLastFilesMap = null;
        }
      } catch(e){}

    }catch(err){
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">error</span> エージェントエラー: ' + escHtml(err?.message || ""), false);
      var _spErr = document.getElementById("sedeAgentSpinner");
      if(_spErr) _spErr.remove();
      appendMsgDom("ai", "エラーが発生しました: " + (err?.message || "不明"), true);
    }finally{
      _sede.agentRunning = false;
      _sede.processing = false;
      if(sendBtn) sendBtn.disabled = false;
      _sedeSetBusy(false);
      scrollToBottom();
    }
  }

  /* Agent: Generate or Fix code (auto-approve diffs, with optional image attachments) */
  async function _sedeAgentGenerate(instruction, existBlock, mode, images){
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try{ var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if(tk) hdrs.Authorization = "Bearer " + tk; }catch(e){}

    var fname = existBlock ? (existBlock.filename || "file." + (existBlock.lang || "html")) : "app.html";
    var srcCode = existBlock ? (existBlock.code || "") : "";
    var useFix = mode === "fix" && srcCode.length > 100;
    /* 全てquick-fixに統一（エージェントループ方式） */
    var useParallel = false;
    var endpoint = "/api/sede/quick-fix";

    /* If images attached, analyze via server-side Vision AI */
    if(images && images.length > 0){
      _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">image</span> 画像を分析中... (' + images.length + '枚)', true);
      try{
        /* Compress to thumbnails for faster upload */
        var visionImages = [];
        for(var ii = 0; ii < Math.min(images.length, 2); ii++){
          var img = images[ii];
          try{
            var canvas = document.createElement("canvas");
            var imgEl = new Image();
            var loaded = await new Promise(function(resolve){
              imgEl.onload = function(){ resolve(true); };
              imgEl.onerror = function(){ resolve(false); };
              imgEl.src = img.preview;
            });
            if(loaded){
              var scale = Math.min(800 / imgEl.width, 800 / imgEl.height, 1);
              canvas.width = Math.round(imgEl.width * scale);
              canvas.height = Math.round(imgEl.height * scale);
              canvas.getContext("2d").drawImage(imgEl, 0, 0, canvas.width, canvas.height);
              visionImages.push({ name: img.name, mimeType: "image/jpeg", preview: canvas.toDataURL("image/jpeg", 0.7) });
            }
          }catch(e){}
        }
        if(visionImages.length){
          var vRes = await fetch(base + "/api/sede/vision", {
            method: "POST", headers: hdrs,
            body: JSON.stringify({ images: visionImages, instruction: instruction })
          });
          if(vRes.ok){
            var vData = await vRes.json();
            if(vData.ok && vData.analysis){
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">check_circle</span> 画像分析完了', false);
              instruction = "【画像分析結果】\n" + vData.analysis.slice(0, 2000) + "\n\n【ユーザーの指示】\n" + instruction;
            } else {
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">warning</span> 画像分析失敗: ' + (vData.error || ""), false);
            }
          } else {
            _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">warning</span> 画像分析: HTTP ' + vRes.status, false);
          }
        }
      }catch(e){
        _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">warning</span> 画像分析エラー', false);
        console.warn("[Sede Vision]", e);
      }
    }

    /* ═══ コンテキスト自動注入 ═══ */
    var _autoCtx = "";
    try {
      /* 1. プレビューのコンソールエラーを自動取得 */
      if (useFix && typeof _sedeInspectPreview === "function") {
        var _insp = _sedeInspectPreview();
        if (_insp && _insp.consoleErrors && _insp.consoleErrors.length) {
          _autoCtx += "\n\n【現在のコンソールエラー】\n" + _insp.consoleErrors.slice(0, 5).join("\n");
        }
        if (_insp && _insp.bodyText && _insp.bodyText.trim().length < 5) {
          _autoCtx += "\n\n【警告】画面に何も表示されていません。HTML構造を確認してください。";
        }
      }
      /* 2. コード構造サマリー(fix時) */
      if (useFix && srcCode) {
        var _funcs = (srcCode.match(/function\s+(\w+)/g) || []).slice(0, 20).map(function(f){ return f.replace("function ", ""); });
        var _ids = (srcCode.match(/id="([^"]+)"/g) || []).slice(0, 15).map(function(m){ return m.slice(4, -1); });
        var _sections = (srcCode.match(/\/\*\s*={3,}\s*(.+?)\s*={3,}\s*\*\//g) || []).slice(0, 10).map(function(s){ return s.replace(/\/\*\s*=+\s*|\s*=+\s*\*\//g, "").trim(); });
        if (_funcs.length || _ids.length || _sections.length) {
          _autoCtx += "\n\n【コード構造】";
          if (_sections.length) _autoCtx += "\nセクション: " + _sections.join(", ");
          if (_funcs.length) _autoCtx += "\n関数: " + _funcs.join(", ");
          if (_ids.length) _autoCtx += "\nID: " + _ids.join(", ");
        }
      }
    } catch(e) { console.warn("[AutoCtx]", e); }

    /* ═══ 途切れ検出 + 継続指示の自動生成 ═══ */
    var _isTruncated = false;
    if(useFix && srcCode.length > 200){
      var _trimmed = srcCode.trim();
      var _hasClosingHtml = /(<\/html>|<\/body>)\s*$/i.test(_trimmed);
      var _hasClosingBrace = /[})\]];?\s*$/.test(_trimmed);
      var _endsAbruptly = !_hasClosingHtml && !_hasClosingBrace;
      /* 明らかに途中で切れている場合 */
      if(_endsAbruptly){
        _isTruncated = true;
        var _lastLines = srcCode.split("\n").slice(-5).join("\n");
        _autoCtx += "\n\n【重要: コードが途中で途切れています】\n最後の5行:\n```\n" + _lastLines + "\n```\n上記の続きから、コードを最後（</html>まで）完成させてください。途切れた箇所以降を全て生成してください。";
      }
    }
    /* ユーザーが「続き」「途切れ」「最後まで」と言った場合も検出 */
    if(useFix && /続き|途切れ|切れて|最後まで|完成させ|残り/.test(instruction)){
      if(!_isTruncated){
        var _lastLines2 = srcCode.split("\n").slice(-10).join("\n");
        _autoCtx += "\n\n【ユーザーはコードの続きを求めています】\n現在のコードの最後の部分:\n```\n" + _lastLines2 + "\n```\nこの続きから、コードを最後まで完成させてください。</html>タグまで全て含めてください。";
      }
    }

    var enrichedInstruction = instruction + _autoCtx;

    try{
      /* コンソールエラーを収集 */
      var _ceList = [];
      if(window._sedePreviewErrors && window._sedePreviewErrors.length) _ceList = window._sedePreviewErrors.slice(0, 10);
      if(!_ceList.length && typeof _sedeInspectPreview === "function"){
        var _ceInsp = _sedeInspectPreview();
        if(_ceInsp && _ceInsp.consoleErrors) _ceList = _ceInsp.consoleErrors.slice(0, 10);
      }

      var _selectedModel = (window._sede && window._sede.selectedModel) || "sprout-3";
      var payload = useFix
        ? { code: srcCode, instruction: enrichedInstruction, filename: fname, consoleErrors: _ceList.join("\n"), model: _selectedModel }
        : { code: srcCode, instruction: enrichedInstruction, filename: fname, mode: mode || "fix", consoleErrors: _ceList.join("\n"), model: _selectedModel };

      var res = await fetch(base + endpoint, { method: "POST", headers: hdrs, body: JSON.stringify(payload) });
      if(!res.ok || !res.body) return { ok: false, error: "HTTP " + res.status };

      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      var newCode = srcCode;
      var newLang = existBlock ? (existBlock.lang || "html") : "html";
      var newFname = fname;
      var gotCode = false;

      while(true){
        var chunk = await reader.read();
        if(chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop() || "";
        for(var li = 0; li < lines.length; li++){
          var line = lines[li].trim();
          if(!line || !line.startsWith("data: ")) continue;
          var d = line.slice(6).trim();
          if(d === "[DONE]") continue;
          try{
            var ev = JSON.parse(d);
            if(ev.type === "tool_call"){
              /* Claude Code風ツールコール表示 */
              var _tc = ev.tool || "info";
              var _tcIcon = {write:"cloud_upload",read:"description",grep:"search",edit:"edit",think:"psychology",done:"check_circle",warning:"warning",error:"error",check_app:"preview",terminal:"terminal",psychology:"psychology"}[_tc] || "info";
              var _tcColor = _tc === "done" ? "color:#22c55e;font-weight:600;" : _tc === "error" ? "color:#ef4444;" : _tc === "warning" ? "color:#f59e0b;" : _tc === "edit" ? "color:var(--accent,#6366f1);" : "";
              var _tcStatus = ev.status === "ok" ? ' <span style="color:#22c55e;">✓</span>' : ev.status === "skip" ? ' <span style="color:#f59e0b;">skip</span>' : ev.status === "retry" ? ' <span style="color:#f59e0b;">retry</span>' : "";
              var _tcFile = ev.file ? '<code style="font-size:11px;background:rgba(0,0,0,.06);padding:1px 5px;border-radius:3px;margin:0 4px;">' + escHtml(ev.file) + '</code>' : "";
              _sedeAddOpLog('<span class="ms" style="font-size:14px;vertical-align:-3px;' + _tcColor + '">' + _tcIcon + '</span> ' + _tcFile + '<span style="' + _tcColor + '">' + escHtml(ev.text || "") + '</span>' + _tcStatus, _tc === "think");
            }
            else if(ev.type === "log"){
              var logText = String(ev.text || "");
              var _logIcon = String(ev.icon || "info");
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">' + escHtml(_logIcon) + '</span> ' + escHtml(logText), false);
            }
            /* quick-fix diff event */
            else if(ev.type === "diff" && ev.diff){
              gotCode = true;
              var diffStr = ev.diff || "";
              newCode = _sedeApplyDiffLocal(srcCode, diffStr);
              newFname = ev.filename || fname;
              newLang = (newFname.split(".").pop() || "html");
              _sedeUpdateEditor({ lang: newLang, code: newCode, filename: newFname });
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">edit</span> Edit <code>' + escHtml(newFname) + '</code> <span style="color:#22c55e">+' + (ev.add_count||0) + '</span><span style="color:#ef4444">/-' + (ev.del_count||0) + '</span>', false);
            }
            /* fix-v2 diff ready event — auto-approve in agent mode (use code_preview if available) */
            else if(ev.type === "fix_diff_ready"){
              /* If we already got code from code_preview, just log. Don't re-apply diff (it's a synthetic "add all" diff) */
              if(!gotCode && ev.diff){
                newCode = _sedeApplyDiffLocal(srcCode, ev.diff);
                gotCode = true;
              }
              newFname = ev.file_path || ev.filename || fname;
              newLang = (newFname.split(".").pop() || "html");
              if(newCode) _sedeUpdateEditor({ lang: newLang, code: newCode, filename: newFname });
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">edit</span> Auto-apply <code>' + escHtml(newFname) + '</code> <span style="color:#22c55e">+' + (ev.add_count||0) + '</span>', false);
            }
            /* code_preview event (both endpoints) */
            else if(ev.type === "code_preview" && ev.code){
              gotCode = true;
              newCode = ev.code;
              var _cv = codeView || document.getElementById("sedeCodeView");
              if(_cv){
                var _pLines = ev.code.split("\n");
                if(_pLines[_pLines.length-1]==="") _pLines.pop();
                var _numDiv = document.createElement("div"); _numDiv.className = "sede-line-numbers";
                for(var _pi=0;_pi<_pLines.length;_pi++){ var _ln=document.createElement("div");_ln.textContent=String(_pi+1);_numDiv.appendChild(_ln); }
                var _pre = document.createElement("pre"); var _code = document.createElement("code"); _code.textContent = ev.code; _pre.appendChild(_code);
                _cv.innerHTML=""; _cv.appendChild(_numDiv); _cv.appendChild(_pre);
                if(editorLang) editorLang.textContent = (ev.lines||_pLines.length) + "行 生成中...";
                if(editorEmpty) editorEmpty.style.display = "none";
              }
            }
            /* files_preview event — multi-file / fullstack generation */
            else if(ev.type === "files_preview" && ev.files && typeof ev.files === "object"){
              window._sedeLastFilesMap = ev.files;
              var _fcount = ev.fileCount || Object.keys(ev.files).length;
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px;color:#2563eb">dns</span> フルスタック検出: ' + _fcount + '個のファイル (' + Object.keys(ev.files).slice(0,5).join(', ') + ')', false);
            }
            else if(ev.type === "chat_msg"){
              /* ログタブに会話表示 */
              if(typeof _sedeAddLogChat === "function") _sedeAddLogChat(ev.text || "");
              /* チャットにもAIバブルとして表示 */
              var _cmText = String(ev.text || "").trim();
              if(_cmText){
                var _cmMsg = document.createElement("div");
                _cmMsg.className = "sede-chat-msg is-ai";
                var _cmRole = document.createElement("div");
                _cmRole.className = "sede-chat-role";
                _cmRole.textContent = "Sede";
                _cmMsg.appendChild(_cmRole);
                var _cmBubble = document.createElement("div");
                _cmBubble.className = "sede-chat-bubble";
                _cmBubble.innerHTML = (typeof parseMarkdown === "function") ? parseMarkdown(_cmText) : _cmText;
                _cmMsg.appendChild(_cmBubble);
                /* Insert before spinner to keep spinner at bottom */
                var _agSp = document.getElementById("sedeAgentSpinner");
                if(_agSp && _agSp.parentNode === chatList) chatList.insertBefore(_cmMsg, _agSp);
                else if(chatList) chatList.appendChild(_cmMsg);
                scrollToBottom();
              }
              /* Update spinner text */
              var _spText = document.querySelector("#sedeAgentSpinner .sede-agent-spinner-text");
              if(_spText){
                var _short = String(ev.text || "").replace(/\n/g, " ").slice(0, 50);
                if(_short) _spText.textContent = _short + "...";
              }
            }
            else if(ev.type === "spinner"){
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">sync</span> ' + escHtml(ev.text || "処理中..."), true);
            }
            else if(ev.type === "fix_title"){
              /* ignore in agent mode */
            }
            else if(ev.type === "edit_diff" && ev.diff){
              /* Claude Code風 diff表示をチャットに挿入 */
              var _diffWrap = document.createElement("div");
              _diffWrap.className = "sede-diff-inline";
              var _diffHdr = document.createElement("div");
              _diffHdr.className = "sede-diff-inline-header";
              _diffHdr.innerHTML = '<span class="ms" style="font-size:13px">description</span> <span class="sede-diff-fname">' + escHtml(ev.file || "file") + '</span> <span style="margin-left:auto;color:#3fb950">+' + (ev.add||0) + '</span> <span style="color:#f85149">-' + (ev.del||0) + '</span>';
              _diffWrap.appendChild(_diffHdr);
              var _diffBody = document.createElement("div");
              _diffBody.className = "sede-diff-inline-body";
              var _diffLines = String(ev.diff).split("\n");
              for(var _di = 0; _di < _diffLines.length; _di++){
                var _dl = _diffLines[_di];
                if(_dl.startsWith("---") || _dl.startsWith("+++")) continue;
                var _row = document.createElement("div");
                _row.className = "sede-diff-inline-line";
                if(_dl.startsWith("@@")){
                  _row.classList.add("is-hunk");
                  _row.innerHTML = '<div class="sede-diff-inline-num"></div><div class="sede-diff-inline-marker"></div><div class="sede-diff-inline-code">' + escHtml(_dl) + '</div>';
                } else if(_dl.startsWith("+")){
                  _row.classList.add("is-add");
                  _row.innerHTML = '<div class="sede-diff-inline-num"></div><div class="sede-diff-inline-marker">+</div><div class="sede-diff-inline-code">' + escHtml(_dl.slice(1)) + '</div>';
                } else if(_dl.startsWith("-")){
                  _row.classList.add("is-del");
                  _row.innerHTML = '<div class="sede-diff-inline-num"></div><div class="sede-diff-inline-marker">−</div><div class="sede-diff-inline-code">' + escHtml(_dl.slice(1)) + '</div>';
                } else {
                  _row.innerHTML = '<div class="sede-diff-inline-num"></div><div class="sede-diff-inline-marker"> </div><div class="sede-diff-inline-code">' + escHtml(_dl) + '</div>';
                }
                _diffBody.appendChild(_row);
              }
              _diffWrap.appendChild(_diffBody);
              /* チャットに挿入 */
              var _agSpDiff = document.getElementById("sedeAgentSpinner");
              if(_agSpDiff && _agSpDiff.parentNode === chatList) chatList.insertBefore(_diffWrap, _agSpDiff);
              else if(chatList) chatList.appendChild(_diffWrap);
              scrollToBottom();
              /* ログにも追加 */
              _sedeAddOpLog('<span class="ms" style="font-size:13px;vertical-align:-2px">edit</span> Edit <code>' + escHtml(ev.file || "") + '</code> <span style="color:#22c55e">+' + (ev.add||0) + '</span><span style="color:#ef4444">/-' + (ev.del||0) + '</span>', false);
            }
            else if(ev.type === "error"){
              return { ok: false, error: ev.text || ev.message || "AI error" };
            }
          }catch(e){}
        }
      }

      /* Finalize */
      if(gotCode && newCode){
        _sedeUpdateEditor({ lang: newLang, code: newCode, filename: newFname });
        return { ok: true, block: { lang: newLang, code: newCode, filename: newFname } };
      }
      return { ok: false, error: "AIからのコード出力がありませんでした" };

    }catch(err){
      return { ok: false, error: err?.message || "fetch error" };
    }
  }

  /* Agent: Run tests */
  async function _sedeAgentTest(block){
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try{ var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if(tk) hdrs.Authorization = "Bearer " + tk; }catch(e){}
    try{
      var res = await fetch(base + "/api/sede/test", {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ code: block.code, filename: block.filename || "file." + (block.lang||"js"), language: block.lang || "js" })
      });
      if(!res.ok) return { passed: false, error: "HTTP " + res.status };
      var data = await res.json();
      if(data.output && typeof _sedeTerminalLog === "function") _sedeTerminalLog(data.output, data.success ? "is-ok" : "is-err");
      return { passed: !!data.success, output: data.output || "", error: data.error || "" };
    }catch(err){
      return { passed: false, error: err?.message || "" };
    }
  }

  /* Utility: sleep */
  function _sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  window._sedeAgentRun = _sedeAgentRun;
  window.SEDE_TEMPLATES = SEDE_TEMPLATES;

  /* ═══ Phase 3: Template Store ═══ */
  var SEDE_TEMPLATES = [
    { id:"todo", icon:"checklist", color:"#22c55e", title:"Todo App", desc:"タスク管理、カテゴリ、ドラッグソート、ダークモード", prompt:"Todoアプリを作って。機能: タスク追加・削除・完了切替、カテゴリ分け、ドラッグ&ドロップで並べ替え、localStorage保存、ダークモード切替、検索フィルター。モダンなUIで。" },
    { id:"dashboard", icon:"dashboard", color:"#3b82f6", title:"Dashboard", desc:"チャート、メトリクスカード、データテーブル", prompt:"管理ダッシュボードを作って。機能: 4つのメトリクスカード(売上・ユーザー数・注文数・成長率)、棒グラフと折れ線グラフ(Canvas)、データテーブル(ソート・検索)、サイドバーナビ、レスポンシブ。" },
    { id:"ecommerce", icon:"shopping_cart", color:"#f59e0b", title:"E-Commerce", desc:"商品グリッド、カート、チェックアウト", prompt:"ECサイトを作って。機能: 商品グリッド(6個以上のダミー商品、画像placeholder、価格、評価)、カート(追加・削除・数量変更)、チェックアウトフォーム、カテゴリフィルター、検索、合計金額計算。" },
    { id:"blog", icon:"article", color:"#8b5cf6", title:"Blog / CMS", desc:"記事一覧、Markdownエディタ、カテゴリ", prompt:"ブログCMSを作って。機能: 記事一覧(カード表示)、Markdown対応エディタ(リアルタイムプレビュー)、カテゴリ・タグ管理、検索、localStorage保存、読了時間表示、レスポンシブ。" },
    { id:"chat", icon:"forum", color:"#06b6d4", title:"Chat App", desc:"リアルタイムメッセージ、ルーム、絵文字", prompt:"チャットアプリを作って。機能: メッセージ送受信(ダミーAI応答)、複数ルーム切替、絵文字ピッカー、メッセージ検索、タイピングインジケーター、未読バッジ、ダークテーマ、アバター表示。" },
    { id:"portfolio", icon:"palette", color:"#ec4899", title:"Portfolio", desc:"セクション、アニメーション、レスポンシブ", prompt:"ポートフォリオサイトを作って。セクション: ヒーロー(名前・肩書・CTA)、About、Skills(プログレスバー)、Projects(6件カードグリッド)、Contact(フォーム)。スクロールアニメーション(IntersectionObserver)、ダークモード、スムーズスクロール。" },
    { id:"calendar", icon:"calendar_month", color:"#14b8a6", title:"Calendar", desc:"イベント、ドラッグ、繰り返し予定", prompt:"カレンダーアプリを作って。機能: 月表示カレンダー、イベント追加・編集・削除(モーダル)、イベント色分け、月の切替(前月・次月)、今日ハイライト、localStorage保存、ミニカレンダー。" },
    { id:"kanban", icon:"view_kanban", color:"#f97316", title:"Kanban Board", desc:"カラム、ドラッグ&ドロップ、ラベル", prompt:"カンバンボードを作って。機能: 3カラム(Todo/In Progress/Done)、カード追加・編集・削除、ドラッグ&ドロップでカラム間移動、ラベル(色分け)、優先度、検索フィルター、localStorage保存。" },
    { id:"landing", icon:"web", color:"#6366f1", title:"Landing Page", desc:"ヒーロー、機能紹介、料金表、CTA", prompt:"SaaSのランディングページを作って。セクション: ヒーロー(キャッチコピー・CTA・イラストplaceholder)、機能紹介(3カラム・アイコン)、料金表(3プラン・人気バッジ)、お客様の声(3件)、FAQ(アコーディオン)、フッター。グラデーション背景、スクロールアニメーション。" },
    { id:"admin", icon:"admin_panel_settings", color:"var(--vq-text-secondary, #5A5568)", title:"Admin Panel", desc:"サイドバーナビ、CRUDテーブル、フォーム", prompt:"管理パネルを作って。機能: サイドバーナビ(折りたたみ可)、ユーザー管理テーブル(CRUD・ソート・ページネーション)、ユーザー追加/編集モーダルフォーム、検索、ステータスバッジ、統計カード4つ、レスポンシブ。" },
    { id:"platformer", icon:"sports_esports", color:"#ef4444", title:"2D Platformer", desc:"Canvas、物理演算、レベル", prompt:"2Dプラットフォーマーゲームを作って。Canvas使用。機能: キャラクター(矩形)の左右移動・ジャンプ、重力物理、プラットフォーム(複数配置)、コイン収集(スコア)、敵キャラ(左右移動)、衝突判定、ゲームオーバー・リスタート、スコア表示。60fps requestAnimationFrame。" },
    { id:"visualizer", icon:"equalizer", color:"#a855f7", title:"Music Visualizer", desc:"Web Audio API、Canvas アニメーション", prompt:"音楽ビジュアライザーを作って。Web Audio API + Canvas使用。機能: マイク入力またはデモ音源、周波数スペクトラム(バー表示)、波形表示、フルスクリーン対応、色テーマ切替(3種)、感度調整スライダー。美しいグラデーションアニメーション。" },
    { id:"drawing", icon:"brush", color:"#f43f5e", title:"Drawing App", desc:"Canvas、ブラシ、レイヤー、エクスポート", prompt:"お絵描きアプリを作って。Canvas使用。機能: フリーハンド描画、ブラシサイズ・色選択(カラーピッカー)、消しゴム、図形ツール(線・矩形・円)、Undo/Redo(Ctrl+Z/Y)、キャンバスクリア、PNG保存(ダウンロード)、背景色切替。" },
    { id:"quiz", icon:"quiz", color:"#0ea5e9", title:"Quiz Game", desc:"問題、スコア、タイマー、ランキング", prompt:"クイズゲームを作って。機能: 10問の4択クイズ(一般知識)、制限時間(15秒/問)、プログレスバー、正誤フィードバック(色+アニメーション)、最終スコア画面(正答率・時間)、ハイスコア保存(localStorage)、リトライ、カテゴリ選択。" },
    { id:"particles", icon:"blur_on", color:"#84cc16", title:"Particle Simulator", desc:"物理演算、インタラクティブ、プリセット", prompt:"パーティクルシミュレーターを作って。Canvas使用。機能: 200個以上のパーティクル、マウス追従(引力/斥力切替)、パーティクル間の線描画(距離ベース)、プリセット3種(銀河・花火・波)、色・サイズ・速度スライダー、パーティクル数調整、フルスクリーン。" }
  ];

  function _sedeRenderTemplateGrid(){
    var grid = document.getElementById("sedeTemplateGrid");
    if(!grid) return;
    grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    for(var i = 0; i < SEDE_TEMPLATES.length; i++){
      var t = SEDE_TEMPLATES[i];
      var card = document.createElement("div");
      card.className = "sede-template-card";
      card.setAttribute("data-sede-template", t.id);
      card.innerHTML = '<div class="sede-template-card-icon" style="background:' + t.color + '20;color:' + t.color + ';"><span class="ms">' + t.icon + '</span></div>'
        + '<div class="sede-template-card-title">' + escHtml(t.title) + '</div>'
        + '<div class="sede-template-card-desc">' + escHtml(t.desc) + '</div>';
      card.addEventListener("click", (function(tmpl){
        return function(){
          var inp = document.getElementById("sedeInputInline");
          if(inp){ inp.value = tmpl.prompt; inp.focus(); }
          /* Auto-send */
          if(typeof sendMessage === "function") sendMessage(tmpl.prompt);
          else if(typeof window._sedeInlineSend === "function") window._sedeInlineSend(tmpl.prompt);
        };
      })(t));
      frag.appendChild(card);
    }
    grid.appendChild(frag);
  }

  /* Render on init */
  setTimeout(_sedeRenderTemplateGrid, 100);

  /* ── Expose to inline Sede functions ── */
  window._sedeInlineRender = renderSedeChat;
  window._sedeInlineUpdateView = updateView;
  window._sedeInlineScrollBottom = scrollToBottom;
  window._sedeInlineSend = sendMessage;
  window._sedeInlineInitWelcome = initWelcome;
  window._sedeInlineCloseTwoPane = closeTwoPane;

  /* ── ページロード時: 送信ボタン確実にリセット ── */
  if (sendBtn) sendBtn.disabled = false;
  _sede.processing = false;

  /* ── Open / Close redirects ── */
  window._sedeOpen = function(){
    if (typeof _chatSwitchToSede === "function") _chatSwitchToSede();
  };
  window._sedeClose = function(){
    if (typeof _chatSwitchToQuickChat === "function") _chatSwitchToQuickChat();
  };

  /* ── Usage bar update ── */
  var _sedeUsageTimer = 0;
  async function _sedeUpdateUsageBars(){
    var h = { "Content-Type": "application/json" };
    try {
      var t = (typeof _authGetToken === "function") ? _authGetToken() : null;
      if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim();
      if (t) h.Authorization = "Bearer " + t; else return;
    } catch(e){ return; }
    var base = "";
    try { base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev"; } catch(e){}
    try {
      var res = await fetch(base + "/api/sede/usage", { method: "GET", headers: h });
      if (!res.ok) return;
      var d = await res.json();
      var badge = document.getElementById("sedePlanBadge");
      var dailyBar = document.getElementById("sedeDailyBar");
      var monthlyBar = document.getElementById("sedeMonthlyBar");
      var dailyPct = document.getElementById("sedeDailyPct");
      var monthlyPct = document.getElementById("sedeMonthlyPct");
      if (badge) {
        var planNames = {"free-plus":"Free+","edu-pre":"EDU PRE","pre":"PRE","sede-max":"Sede MAX"};
        badge.textContent = planNames[d.plan] || "Free+";
      }
      var dp = d.dailyPercent || 0;
      var mp = d.monthlyPercent || 0;
      if (dailyBar) { dailyBar.style.width = dp + "%"; if (dp >= 80) dailyBar.classList.add("is-warning"); else dailyBar.classList.remove("is-warning"); }
      if (monthlyBar) { monthlyBar.style.width = mp + "%"; if (mp >= 80) monthlyBar.classList.add("is-warning"); else monthlyBar.classList.remove("is-warning"); }
      if (dailyPct) dailyPct.textContent = dp + "%";
      if (monthlyPct) monthlyPct.textContent = mp + "%";
    } catch(e){ console.warn("[SedeUsage]", e); }
  }
  function _sedeStartUsagePolling(){
    _sedeUpdateUsageBars();
    if (_sedeUsageTimer) clearInterval(_sedeUsageTimer);
    _sedeUsageTimer = setInterval(_sedeUpdateUsageBars, 30000);
  }
  window._sedeUpdateUsageBars = _sedeUpdateUsageBars;
  window._sedeStartUsagePolling = _sedeStartUsagePolling;

  /* ── Usage Modal open/close ── */
  window._sedeOpenUsageModal = function(){
    var overlay = document.getElementById("sedeUsageModalOverlay");
    if(!overlay) return;
    overlay.style.display = "flex";
    /* プランバッジをモーダルにコピー */
    var planBadge = document.getElementById("sedePlanBadge");
    var modalPlan = document.getElementById("sedeUsageModalPlan");
    if(planBadge && modalPlan) modalPlan.textContent = planBadge.textContent;
    /* リセット時間の計算 */
    var now = new Date();
    var resetH = 23 - now.getHours();
    var resetM = 59 - now.getMinutes();
    var dailyReset = document.getElementById("sedeUsageModalDailyReset");
    if(dailyReset) dailyReset.textContent = "リセットまで " + resetH + ":" + String(resetM).padStart(2,"0");
    var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var monthlyReset = document.getElementById("sedeUsageModalMonthlyReset");
    if(monthlyReset) monthlyReset.textContent = (now.getMonth()+1) + "月" + lastDay + "日リセット";
    /* モーダル用データ取得 */
    _sedeUpdateUsageModal();
    /* アニメーション */
    requestAnimationFrame(function(){ overlay.classList.add("is-visible"); });
    /* ESCで閉じる */
    overlay._escHandler = function(e){ if(e.key === "Escape") window._sedeCloseUsageModal(); };
    document.addEventListener("keydown", overlay._escHandler);
    /* 背景クリックで閉じる */
    overlay.onclick = function(e){ if(e.target === overlay) window._sedeCloseUsageModal(); };
  };
  window._sedeCloseUsageModal = function(){
    var overlay = document.getElementById("sedeUsageModalOverlay");
    if(!overlay) return;
    overlay.classList.remove("is-visible");
    if(overlay._escHandler) document.removeEventListener("keydown", overlay._escHandler);
    setTimeout(function(){ overlay.style.display = "none"; }, 250);
  };
  async function _sedeUpdateUsageModal(){
    var h = { "Content-Type": "application/json" };
    try {
      var t = (typeof _authGetToken === "function") ? _authGetToken() : null;
      if (!t) t = String(localStorage.getItem("app.auth.token.v1") || "").trim();
      if (t) h.Authorization = "Bearer " + t; else return;
    } catch(e){ return; }
    var base = "";
    try { base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev"; } catch(e){}
    try {
      var res = await fetch(base + "/api/sede/usage", { method: "GET", headers: h });
      if (!res.ok) return;
      var d = await res.json();
      /* バー更新 */
      function setBar(id, pctId, pct){
        var bar = document.getElementById(id);
        var pctEl = document.getElementById(pctId);
        if(bar){
          bar.style.width = Math.min(pct, 100) + "%";
          bar.className = "sede-usage-modal-fill" + (pct >= 85 ? " is-danger" : pct >= 60 ? " is-warn" : "");
        }
        if(pctEl) pctEl.textContent = Math.round(pct) + "%";
      }
      setBar("sedeUsageModalDailyGen", "sedeUsageModalDailyGenPct", d.dailyGenPercent || 0);
      setBar("sedeUsageModalDailyFix", "sedeUsageModalDailyFixPct", d.dailyFixPercent || 0);
      setBar("sedeUsageModalMonthlyGen", "sedeUsageModalMonthlyGenPct", d.monthlyGenPercent || 0);
      setBar("sedeUsageModalMonthlyFix", "sedeUsageModalMonthlyFixPct", d.monthlyFixPercent || 0);
      /* アップグレードメッセージ */
      var maxPct = Math.max(d.dailyGenPercent||0, d.dailyFixPercent||0, d.monthlyGenPercent||0, d.monthlyFixPercent||0);
      var msgEl = document.getElementById("sedeUsageModalUpgradeMsg");
      var textEl = document.getElementById("sedeUsageModalUpgradeText");
      var upgradeSection = document.getElementById("sedeUsageModalUpgrade");
      if(d.plan === "sede-ultra" || d.plan === "sede-max"){
        if(upgradeSection) upgradeSection.style.display = "none";
      } else {
        if(upgradeSection) upgradeSection.style.display = "";
        if(maxPct >= 100 && msgEl && textEl){
          msgEl.style.display = "flex";
          textEl.textContent = "本日の上限に達しました。";
          msgEl.querySelector(".ms").textContent = "block";
          msgEl.querySelector(".ms").style.color = "#ef4444";
        } else if(maxPct >= 80 && msgEl && textEl){
          msgEl.style.display = "flex";
          textEl.textContent = "まもなく上限に達します。";
        } else if(maxPct >= 50 && msgEl && textEl){
          msgEl.style.display = "flex";
          textEl.textContent = "制限に近づいています。";
        } else if(msgEl){
          msgEl.style.display = "none";
        }
      }
    } catch(e){ console.warn("[SedeUsageModal]", e); }
  }

  /* Init greeting */
  initWelcome();
})();
