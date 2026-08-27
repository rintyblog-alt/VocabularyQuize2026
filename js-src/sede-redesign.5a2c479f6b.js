
(function(){
  var host = document.getElementById("sedeRedesignV2");
  var shadow = host.attachShadow({mode:"open"});

  /* ── Google Fonts (inside shadow DOM) ── */
  var fonts = [
    "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap",
    "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap",
    /* ★ Google から 取るのを やめた（2026-08-19・アイコンが 文字に 化ける）。 */
    (function(){ /* ★ アイコンの CSS は <head> に すでに 在る。
       名前には 指紋が 入っている（中身が 変わると 名前も 変わる）ので、
       ここへ 書き写すと いつか 404 になる。**在るものを 指す。** */
      var e = document.querySelector('link[href*="/css/material-symbols."]');
      return e ? e.getAttribute("href") : "/css/material-symbols.css";
    })()
  ];
  fonts.forEach(function(url){
    var lk = document.createElement("link");
    lk.rel = "stylesheet";
    lk.href = url;
    shadow.appendChild(lk);
  });

  /* ── Full CSS from sede-redesign.html (isolated inside shadow) ── */
  var styleEl = document.createElement("style");
  styleEl.textContent = '\
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}\
:host{display:flex;width:100vw;height:100dvh;background:var(--bg);color:var(--text);font-family:var(--font);-webkit-font-smoothing:antialiased;overflow:hidden;\
  --bg:#f8fafc;--surface:#fff;--surface2:#f1f5f9;\
  --text:#1e293b;--text-sub:#64748b;--text-muted:#94a3b8;--text-faint:#cbd5e1;\
  --border:rgba(0,0,0,.07);--border-strong:rgba(0,0,0,.12);\
  --accent:#6366f1;--accent-hover:#4f46e5;--accent-light:rgba(99,102,241,.08);--accent-glow:rgba(99,102,241,.25);\
  --success:#22c55e;--danger:#ef4444;--warning:#f59e0b;\
  --radius:12px;--radius-sm:8px;--radius-lg:16px;\
  --shadow:0 2px 8px rgba(0,0,0,.06);\
  --font:"Inter",system-ui,-apple-system,sans-serif;\
  --mono:"Fira Code","SF Mono",Consolas,monospace;\
}\
.ms{font-family:"Material Symbols Rounded";font-size:20px;vertical-align:-4px;font-variation-settings:"FILL" 1;}\
.sede{display:flex;height:100dvh;width:100vw;}\
.sidebar{width:260px;flex:0 0 260px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;}\
.sidebar-header{padding:16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);}\
.sidebar-logo{display:flex;align-items:center;gap:8px;}\
.sidebar-logo-icon{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,var(--accent),#8b5cf6);display:flex;align-items:center;justify-content:center;}\
.sidebar-logo-icon .ms{font-size:16px;color:#fff;}\
.sidebar-logo-text{font-size:15px;font-weight:800;letter-spacing:-.02em;}\
.sidebar-logo-sub{font-size:10px;color:var(--text-muted);}\
.sidebar-new{height:34px;padding:0 14px;border:0;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--accent),#8b5cf6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 8px rgba(99,102,241,.2);transition:all .15s;font-family:var(--font);}\
.sidebar-new:hover{box-shadow:0 4px 14px rgba(99,102,241,.35);transform:translateY(-1px);}\
.sidebar-new .ms{font-size:16px;}\
.sidebar-nav{padding:8px;display:flex;flex-direction:column;gap:1px;}\
.sidebar-nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-sm);font-size:13px;font-weight:500;color:var(--text-sub);cursor:pointer;transition:all .12s;border:0;background:none;text-align:left;width:100%;font-family:var(--font);}\
.sidebar-nav-item:hover{background:var(--accent-light);color:var(--text);}\
.sidebar-nav-item .ms{font-size:18px;}\
.sidebar-divider{height:1px;background:var(--border);margin:4px 16px;}\
.sidebar-label{padding:8px 16px 4px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;}\
.sidebar-sessions{flex:1;overflow-y:auto;padding:4px 8px;display:flex;flex-direction:column;gap:1px;}\
.sidebar-session-row{display:flex;align-items:center;border-radius:var(--radius-sm);position:relative;}\
.sidebar-session-row:hover{background:rgba(0,0,0,.03);}\
.sidebar-session-row.is-active{background:var(--accent-light);}\
.sidebar-session-row.is-active .sidebar-session{color:var(--accent);font-weight:600;}\
.sidebar-session{flex:1;padding:10px 12px;border-radius:var(--radius-sm);border:0;background:none;text-align:left;cursor:pointer;color:var(--text);font-size:13px;transition:all .12s;display:flex;flex-direction:column;gap:2px;min-width:0;font-family:var(--font);}\
.sidebar-session-opts{display:none;width:28px;height:28px;border:0;background:none;color:var(--text-muted);cursor:pointer;border-radius:6px;align-items:center;justify-content:center;flex-shrink:0;font-family:var(--font);position:relative;}\
.sidebar-session-opts .ms{font-size:16px;}\
.sidebar-session-row:hover .sidebar-session-opts{display:inline-flex;}\
.sidebar-session-opts:hover{background:rgba(0,0,0,.06);color:var(--text);}\
.session-menu{position:absolute;top:100%;right:0;z-index:100;min-width:150px;background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-sm);box-shadow:0 4px 16px rgba(0,0,0,.12);padding:4px;display:flex;flex-direction:column;gap:1px;}\
.session-menu-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border:0;background:none;color:var(--text);font-size:13px;font-weight:500;cursor:pointer;border-radius:6px;text-align:left;width:100%;font-family:var(--font);transition:background .1s;}\
.session-menu-item:hover{background:rgba(0,0,0,.04);}\
.session-menu-item .ms{font-size:16px;}\
.session-menu-item.is-danger{color:var(--danger);}\
.session-menu-item.is-danger:hover{background:rgba(239,68,68,.06);}\
.sidebar-session-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\
.sidebar-session-date{font-size:10px;color:var(--text-muted);font-weight:400;}\
.sidebar-footer{padding:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px;}\
.sidebar-usage{padding:6px 0;}\
.sidebar-usage-label{font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}\
.sidebar-usage-row{display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px;color:var(--text-sub);}\
.sidebar-usage-row strong{color:var(--text);}\
.sidebar-usage-bar{height:4px;background:rgba(0,0,0,.06);border-radius:2px;overflow:hidden;margin-bottom:6px;}\
.sidebar-usage-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--accent),#8b5cf6);}\
.sidebar-usage-btn{display:flex;align-items:center;gap:5px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:none;color:var(--text-sub);font-size:11px;font-weight:600;cursor:pointer;transition:all .12s;width:100%;font-family:var(--font);}\
.sidebar-usage-btn:hover{background:var(--accent-light);color:var(--accent);}\
.sidebar-usage-btn .ms{font-size:14px;}\
.sidebar-back{display:flex;align-items:center;gap:6px;padding:8px 10px;border:0;border-radius:var(--radius-sm);background:none;color:var(--text-sub);font-size:13px;font-weight:500;cursor:pointer;transition:all .12s;width:100%;text-align:left;font-family:var(--font);}\
.sidebar-back:hover{background:rgba(0,0,0,.04);color:var(--text);}\
.sidebar-back .ms{font-size:18px;}\
\
.topbar{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border);background:var(--surface);}\
.topbar-tabs{display:flex;gap:2px;background:rgba(0,0,0,.04);border-radius:var(--radius-sm);padding:3px;}\
.topbar-tab{padding:6px 14px;font-size:12px;font-weight:500;color:var(--text-sub);cursor:pointer;border-radius:6px;transition:all .12s;border:0;background:none;display:flex;align-items:center;gap:4px;font-family:var(--font);}\
.topbar-tab:hover{color:var(--text);}\
.topbar-tab.is-active{background:var(--surface);color:var(--text);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.05);}\
.topbar-tab .ms{font-size:16px;}\
.topbar-model{font-size:11px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:4px 10px;border-radius:6px;}\
.topbar-model-wrap{position:relative;}\
.topbar-model-trigger{font-size:11px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:4px 10px;border-radius:6px;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:var(--font);}\
.topbar-model-trigger:hover{background:rgba(99,102,241,.14);}\
.topbar-model-icon{font-size:14px !important;}\
.topbar-model-arrow{font-size:14px !important;}\
.topbar-model-dd{position:absolute;top:calc(100% + 6px);left:0;min-width:280px;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 32px rgba(0,0,0,.14);z-index:200;padding:6px 0;font-family:var(--font);}\
.topbar-model-dd.is-hidden{display:none;}\
.topbar-model-dd-label{padding:10px 14px 6px;font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.04em;}\
.topbar-model-item{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;cursor:pointer;transition:background .1s;}\
.topbar-model-item:hover{background:var(--accent-light);}\
.topbar-model-item.is-active{background:var(--accent-light);}\
.topbar-model-item.is-locked{opacity:.55;cursor:not-allowed;}\
.topbar-model-item.is-locked:hover{background:transparent;}\
.topbar-model-item-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}\
.topbar-model-item-icon .ms{font-size:18px !important;}\
.topbar-model-item-text{flex:1;min-width:0;}\
.topbar-model-item-name{font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px;}\
.topbar-model-item-badge{font-size:9px;font-weight:500;padding:1px 6px;border-radius:4px;background:rgba(0,0,0,.06);color:var(--text-muted);}\
.topbar-model-item-desc{font-size:11px;color:var(--text-muted);margin-top:2px;}\
.topbar-model-item-engine{font-size:10px;color:var(--text-muted);opacity:.7;margin-top:2px;}\
.topbar-model-item-check{color:var(--accent);font-size:18px !important;flex-shrink:0;}\
.topbar-model-item-lock{color:var(--text-muted);font-size:16px !important;flex-shrink:0;}\
.topbar-spacer{flex:1;}\
.topbar-actions{display:flex;gap:2px;}\
.topbar-btn{width:32px;height:32px;border:1px solid transparent;border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .12s;position:relative;}\
.topbar-btn:hover{background:var(--accent-light);color:var(--accent);}\
.topbar-btn .ms{font-size:17px;}\
.topbar-btn::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);padding:4px 8px;border-radius:5px;background:#1e293b;color:#fff;font-size:10px;font-weight:500;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s;font-family:var(--font);z-index:10;}\
.topbar-btn:hover::after{opacity:1;}\
.welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;overflow-y:auto;}\
.welcome-icon{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,var(--accent-light),rgba(139,92,246,.08));display:flex;align-items:center;justify-content:center;margin-bottom:20px;}\
.welcome-icon .ms{font-size:28px;color:var(--accent);}\
.welcome-title{font-size:20px;font-weight:700;margin-bottom:6px;letter-spacing:-.01em;}\
.welcome-sub{font-size:14px;color:var(--text-muted);margin-bottom:32px;}\
.tmpl-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-width:560px;width:100%;}\
.tmpl-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);cursor:pointer;transition:all .15s;}\
.tmpl-card:hover{border-color:rgba(99,102,241,.3);box-shadow:0 6px 20px rgba(99,102,241,.1);transform:translateY(-3px);}\
.tmpl-card:active{transform:translateY(0) scale(.98);}\
.tmpl-icon{width:40px;height:40px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;}\
.tmpl-icon .ms{font-size:22px;}\
.tmpl-icon.c1{background:rgba(59,130,246,.1);color:#3b82f6;}\
.tmpl-icon.c2{background:rgba(139,92,246,.1);color:#8b5cf6;}\
.tmpl-icon.c3{background:rgba(236,72,153,.1);color:#ec4899;}\
.tmpl-icon.c4{background:rgba(34,197,94,.1);color:#22c55e;}\
.tmpl-icon.c5{background:rgba(249,115,22,.1);color:#f97316;}\
.tmpl-icon.c6{background:rgba(20,184,166,.1);color:#14b8a6;}\
.tmpl-icon.c7{background:var(--accent-light);color:var(--accent);}\
.tmpl-icon.c8{background:rgba(239,68,68,.1);color:#ef4444;}\
.tmpl-name{font-size:11px;font-weight:600;color:var(--text-sub);}\
.composer{padding:0;background:var(--bg);flex-shrink:0;position:relative;}\
.composer::before{content:"";position:absolute;top:-40px;left:0;right:0;height:40px;background:linear-gradient(to top,var(--bg),transparent);pointer-events:none;}\
.composer-inner{max-width:800px;margin:0 auto;padding:12px 20px 16px;}\
.composer-input{width:100%;min-height:44px;max-height:200px;padding:10px 14px;border:1.5px solid var(--border-strong);border-radius:var(--radius);background:var(--surface);color:var(--text);font-size:14px;font-family:var(--font);resize:none;outline:none;transition:border-color .15s,box-shadow .15s;line-height:1.55;}\
.composer-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow);}\
.composer-input::placeholder{color:var(--text-muted);}\
.composer-toolbar{display:flex;align-items:center;justify-content:space-between;padding:6px 0 0;}\
.composer-toolbar-left{display:flex;gap:1px;}\
.composer-toolbar-right{display:flex;gap:4px;align-items:center;}\
.composer-tool{width:34px;height:34px;border:0;border-radius:var(--radius-sm);background:none;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .12s;}\
.composer-tool:hover{background:var(--accent-light);color:var(--accent);}\
.composer-tool .ms{font-size:18px;}\
.composer-send{min-height:36px;min-width:56px;padding:0 14px;border:0;border-radius:var(--radius-sm);background:var(--accent);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;flex-shrink:0;font-size:13px;font-weight:600;font-family:var(--font);}\
.composer-send:hover{background:var(--accent-hover);}\
.composer-send:active{transform:scale(.97);}\
.composer-send .ms{font-size:17px;}\
.composer-stop{width:36px;height:36px;border:0;border-radius:var(--radius-sm);background:#ef4444;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;}\
.composer-stop:hover{background:#dc2626;}\
.composer-stop .ms{font-size:18px;}\
.composer-tool.is-active{background:var(--accent-light);color:var(--accent);}\
.composer-pending{max-width:800px;margin:0 auto;padding:8px 20px 0;display:flex;flex-wrap:wrap;gap:6px;}\
.composer-pending .pending-item{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:var(--accent-light);color:var(--accent);font-size:11px;font-weight:500;}\
.composer-disclaimer{max-width:800px;margin:0 auto;padding:6px 20px 8px;font-size:10px;color:var(--text-muted);text-align:center;line-height:1.4;}\
.sede-hidden{display:none !important;}\
.steer{display:none;max-width:800px;margin:0 auto;padding:0 20px 8px;}\
.steer.is-active{display:block;}\
.steer-inner{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1.5px solid rgba(99,102,241,.25);border-radius:var(--radius);background:var(--accent-light);}\
.steer-icon{color:var(--accent);flex-shrink:0;}\
.steer-icon .ms{font-size:16px;}\
.steer-input{flex:1;border:0;background:none;color:var(--text);font-size:13px;font-family:var(--font);outline:none;}\
.steer-input::placeholder{color:var(--text-muted);}\
.steer-send{width:28px;height:28px;border:0;border-radius:6px;background:var(--accent);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .12s;}\
.steer-send:hover{background:var(--accent-hover);}\
.steer-send .ms{font-size:16px;}\
.chat-scroll{flex:1;overflow-y:auto;padding:20px;display:none;}\
.chat-list{max-width:800px;margin:0 auto;display:flex;flex-direction:column;gap:16px;}\
.chat-msg{display:flex;flex-direction:column;gap:4px;animation:msgIn .25s ease;}\
@keyframes msgIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;}}\
.chat-msg.is-user{align-items:flex-end;}\
.chat-role{font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;font-family:var(--mono);padding:0 2px;}\
.chat-bubble-user{max-width:70%;padding:12px 16px;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;border-radius:16px 16px 4px 16px;font-size:14px;line-height:1.7;box-shadow:0 2px 8px rgba(99,102,241,.15);}\
.chat-bubble-ai{max-width:100%;padding:14px 0 14px 16px;border-left:3px solid var(--accent);font-size:14px;line-height:1.7;}\
.chat-bubble-ai code{background:#1e1e2e;color:#e2e8f0;padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:13px;}\
.chat-bubble-ai pre{background:#1e1e2e;border-radius:var(--radius-sm);padding:14px 16px;margin:10px 0;overflow-x:auto;border:1px solid rgba(255,255,255,.06);}\
.chat-bubble-ai pre code{display:block;padding:0;background:none;font-size:13px;line-height:1.65;}\
.chat-gen-indicator{display:flex;align-items:center;gap:10px;padding:10px 0;animation:msgIn .25s ease;border-radius:var(--radius-sm);transition:background .12s;}\
.chat-gen-indicator:hover{background:rgba(0,0,0,.03);}\
.chat-gen-spinner-mini{width:14px;height:14px;border:2px solid rgba(99,102,241,.15);border-top-color:var(--accent);border-radius:50%;animation:spin 1.15s cubic-bezier(.45,.15,.35,.9) infinite;flex-shrink:0;}\
.chat-gen-label{flex:1;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:linear-gradient(90deg,var(--text) 0%,var(--accent) 40%,var(--text-muted) 60%,var(--text) 100%);background-size:200% 100%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 2s ease-in-out infinite;}\
.chat-gen-toggle{color:var(--text-muted);flex-shrink:0;}\
.chat-gen-toggle .ms{font-size:18px;}\
@keyframes shimmer{0%{background-position:100% 0;}100%{background-position:-100% 0;}}\
.chat-gen-toggle{background:none;border:none;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .12s;padding:2px;}\
.chat-gen-toggle:hover{color:var(--accent);}\
.chat-gen-toggle .ms{font-size:18px;transition:transform .2s;}\
.chat-gen-toggle.is-open .ms{transform:rotate(180deg);}\
.chat-done-card{max-width:100%;padding:16px 18px;margin-top:4px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);animation:msgIn .3s ease;}\
.chat-done-header{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:14px;font-weight:700;color:var(--text);}\
.chat-done-header .ms{color:var(--success);font-size:20px;}\
.chat-done-section{margin-bottom:10px;}\
.chat-done-section-title{font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}\
.chat-done-list{list-style:none;display:flex;flex-direction:column;gap:4px;}\
.chat-done-list li{font-size:13px;color:var(--text-sub);line-height:1.6;display:flex;align-items:flex-start;gap:6px;}\
.chat-done-list li .ms{font-size:14px;color:var(--success);flex-shrink:0;margin-top:2px;}\
.chat-done-future{font-size:13px;color:var(--text-muted);font-style:italic;line-height:1.6;}\
.chat-done-actions{display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);}\
.chat-done-btn{padding:7px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:none;color:var(--text-sub);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .12s;font-family:var(--font);}\
.chat-done-btn:hover{background:var(--accent-light);color:var(--accent);border-color:rgba(99,102,241,.2);}\
.chat-done-btn .ms{font-size:15px;}\
.chat-spinner{display:none;}\
.center{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden;transition:margin-right .25s ease;}\
.sede.has-right .center{margin-right:520px;}\
.right{position:absolute;top:0;right:0;bottom:0;width:520px;display:flex;flex-direction:column;border-left:1px solid var(--border);background:var(--surface);overflow:hidden;transform:translateX(100%);transition:transform .25s ease;z-index:10;}\
.sede.has-right .right{transform:translateX(0);}\
.sede{position:relative;}\
.right-back{display:none;width:32px;height:32px;border:0;border-radius:var(--radius-sm);background:none;color:var(--text);cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;}\
.right-back:hover{background:rgba(0,0,0,.04);}\
.right-back .ms{font-size:20px;}\
.right-tabs{display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid var(--border);}\
.right-tab{padding:7px 14px;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;border:0;background:none;border-radius:8px;transition:all .12s;display:flex;align-items:center;gap:5px;font-family:var(--font);}\
.right-tab:hover{background:rgba(0,0,0,.04);color:var(--text);}\
.right-tab.is-active{background:var(--accent-light);color:var(--accent);font-weight:600;}\
.right-tab .ms{font-size:15px;}\
.right-content{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;}\
.right-panel{flex:1;display:none;flex-direction:column;min-height:0;}\
.right-panel.is-active{display:flex;}\
.code-toolbar{display:flex;align-items:center;gap:4px;padding:8px 12px;border-bottom:1px solid var(--border);}\
.code-toolbar-file{font-size:12px;font-weight:600;font-family:var(--mono);display:flex;align-items:center;gap:6px;}\
.code-toolbar-file .ms{font-size:14px;color:var(--accent);}\
.code-toolbar-spacer{flex:1;}\
.code-toolbar-info{font-size:11px;color:var(--text-muted);font-family:var(--mono);}\
.code-toolbar-btn{width:28px;height:28px;border:0;border-radius:6px;background:none;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .1s;}\
.code-toolbar-btn:hover{background:rgba(0,0,0,.04);color:var(--text);}\
.code-toolbar-btn .ms{font-size:16px;}\
.code-view{flex:1;overflow:auto;background:#1e1e2e;font-family:var(--mono);font-size:13px;line-height:1.65;padding:14px 0;}\
.code-view pre{margin:0;color:#e2e8f0;}\
.code-line{display:flex;}\
.code-ln{min-width:44px;padding:0 10px 0 12px;text-align:right;color:rgba(255,255,255,.2);user-select:none;flex-shrink:0;}\
.code-cd{padding:0 16px 0 8px;white-space:pre;color:#e2e8f0;}\
.code-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:14px;}\
.logs-scroll{flex:1;overflow-y:auto;padding:16px;}\
.log-gen-header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}\
.log-gen-spinner{width:18px;height:18px;border:2px solid rgba(99,102,241,.15);border-top-color:var(--accent);border-radius:50%;animation:spin 1.15s cubic-bezier(.45,.15,.35,.9) infinite;flex-shrink:0;}\
@keyframes spin{to{transform:rotate(360deg);}}\
.log-gen-spinner.is-done{animation:none;border-color:var(--success);border-top-color:var(--success);background:var(--success);position:relative;}\
.log-gen-spinner.is-done::after{content:"\\2713";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;}\
.log-gen-info{flex:1;min-width:0;}\
.log-gen-prompt{font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\
.log-gen-sub{font-size:11px;color:var(--text-muted);margin-top:1px;}\
.log-gen-timer{font-size:13px;font-weight:600;color:var(--text);font-family:var(--mono);font-variant-numeric:tabular-nums;flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:5px;}\
.log-gen-timer .ms{font-size:15px;opacity:.4;}\
.log-gen-timer.is-done{color:var(--success);}\
.log-gen-timer.is-done .ms{opacity:1;color:var(--success);}\
.log-tool{display:flex;align-items:center;gap:6px;padding:5px 10px;font-family:var(--mono);font-size:12px;color:var(--text-muted);animation:logFadeIn .2s ease;}\
@keyframes logFadeIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;}}\
.log-tool .ms{font-size:15px;color:var(--accent);flex-shrink:0;}\
.log-tool .ms.is-ok{color:var(--success);}\
.log-tool .ms.is-warn{color:var(--warning);}\
.log-tool .ms.is-err{color:var(--danger);}\
.log-tool code{background:rgba(99,102,241,.08);color:var(--accent);padding:1px 5px;border-radius:3px;font-size:11px;}\
.log-tool .log-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:4px;background:rgba(0,0,0,.04);color:var(--text-muted);}\
.log-ai{margin:6px 0;padding:10px 0 10px 14px;border-left:3px solid var(--accent);animation:logFadeIn .25s ease;}\
.log-ai-header{display:none;}\
.log-ai-body{font-size:14px;line-height:1.8;color:var(--text);font-family:var(--font);}\
.log-ai-body strong{font-weight:700;color:var(--text);}\
.log-ai-body code{background:#1e1e2e;color:#e2e8f0;padding:2px 7px;border-radius:5px;font-family:var(--mono);font-size:12px;}\
.log-ai-body pre{background:#1e1e2e;border-radius:var(--radius-sm);padding:14px 16px;margin:10px 0;overflow-x:auto;border:1px solid rgba(255,255,255,.06);}\
.log-ai-body pre code{display:block;padding:0;background:none;font-size:12px;line-height:1.65;}\
.log-sep{height:1px;background:var(--border);margin:10px 0;}\
.log-diff{margin:6px 0;border-radius:var(--radius-sm);overflow:hidden;border:1px solid rgba(0,0,0,.06);background:#0d1117;font-family:var(--mono);font-size:11px;}\
.log-diff-header{display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.4);font-size:10px;font-weight:600;}\
.log-diff-header .fname{color:#a5b4fc;}\
.log-diff-header .add{color:#3fb950;margin-left:auto;}\
.log-diff-header .del{color:#f85149;margin-left:4px;}\
.log-diff-line{display:flex;min-height:18px;padding:0 8px;}\
.log-diff-marker{width:14px;text-align:center;font-weight:700;flex-shrink:0;user-select:none;}\
.log-diff-code{flex:1;white-space:pre;color:rgba(255,255,255,.6);}\
.log-diff-line.is-add{background:rgba(46,160,67,.12);}\
.log-diff-line.is-add .log-diff-marker{color:#3fb950;}\
.log-diff-line.is-add .log-diff-code{color:#aff5b4;}\
.log-diff-line.is-del{background:rgba(248,81,73,.12);}\
.log-diff-line.is-del .log-diff-marker{color:#f85149;}\
.log-diff-line.is-del .log-diff-code{color:#ffa198;text-decoration:line-through;opacity:.7;}\
.terminal-view{flex:1;background:#0f172a;padding:14px 16px;font-family:var(--mono);font-size:13px;color:#e2e8f0;overflow-y:auto;}\
.terminal-line{margin-bottom:4px;}\
.terminal-line.is-ok{color:var(--success);}\
.terminal-line.is-err{color:#f87171;}\
.terminal-prompt{display:flex;align-items:center;gap:8px;margin-top:8px;}\
.terminal-prompt-icon{color:var(--success);}\
.terminal-input{flex:1;background:none;border:none;color:#e2e8f0;font-family:var(--mono);font-size:13px;outline:none;}\
.preview-view{flex:1;background:#fff;}\
.preview-frame{width:100%;height:100%;border:none;}\
.fullpreview{position:fixed;inset:0;z-index:100;background:rgba(15,23,42,.6);backdrop-filter:blur(8px);display:flex;flex-direction:column;animation:fpIn .15s ease;}\
@keyframes fpIn{from{opacity:0}to{opacity:1}}\
.fullpreview-bar{display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}\
.fullpreview-title{font-size:13px;font-weight:600;color:var(--text);}\
.fullpreview-spacer{flex:1;}\
.fullpreview-btn{height:32px;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:none;color:var(--text-sub);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:var(--font);transition:all .12s;}\
.fullpreview-btn:hover{background:var(--accent-light);color:var(--accent);border-color:rgba(99,102,241,.2);}\
.fullpreview-btn.is-active{background:var(--accent);color:#fff;border-color:var(--accent);}\
.fullpreview-close{width:32px;height:32px;border:0;border-radius:var(--radius-sm);background:none;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .12s;}\
.fullpreview-close:hover{background:rgba(0,0,0,.06);color:var(--text);}\
.fullpreview-close .ms{font-size:20px;}\
.fullpreview-body{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:16px;}\
.fullpreview-frame{border:none;background:#fff;border-radius:var(--radius);box-shadow:0 4px 24px rgba(0,0,0,.15);transition:width .2s ease,height .2s ease;}\
.fullpreview-frame.is-pc{width:100%;height:100%;border-radius:0;box-shadow:none;}\
.fullpreview-frame.is-mobile{width:375px;height:812px;border-radius:40px;box-shadow:0 0 0 12px #1e293b,0 4px 24px rgba(0,0,0,.2);}\
.sidebar-toggle{display:none;width:36px;height:36px;border:0;border-radius:var(--radius-sm);background:none;color:var(--text);cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;}\
.sidebar-toggle .ms{font-size:22px;}\
.sidebar-toggle:hover{background:rgba(0,0,0,.04);}\
.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:49;}\
@media(max-width:768px){\
.sidebar-toggle{display:inline-flex;}\
.sidebar{position:fixed;left:0;top:0;bottom:0;z-index:50;transform:translateX(-100%);transition:transform .2s ease;}\
.sidebar.is-open{transform:translateX(0);}\
.sidebar-overlay.is-open{display:block;}\
.sede{overflow:hidden;}\
.center{width:100vw !important;margin-right:0 !important;}\
.sede.has-right .center{margin-right:0 !important;}\
.topbar-tabs{display:none;}\
.topbar-model{display:none;}\
.topbar-actions .topbar-btn[data-tip]{display:none;}\
.topbar-actions #sedeToggleRightBtn{display:inline-flex !important;}\
.topbar-actions .topbar-btn[data-tip="Run"]{display:inline-flex !important;}\
.right{position:fixed !important;top:0;right:0;bottom:0;left:0;width:100vw !important;flex:none !important;z-index:60;transform:translateX(100%);transition:transform .2s ease !important;opacity:1 !important;pointer-events:none !important;}\
.right.is-mobile-open{transform:translateX(0);pointer-events:auto !important;}\
.right-back{display:inline-flex !important;}\
.tmpl-grid{grid-template-columns:repeat(2,1fr) !important;}\
.welcome-title{font-size:16px;}\
.composer-inner{padding:0 8px;}\
}\
';
  shadow.appendChild(styleEl);

  /* ── HTML content (body from sede-redesign.html) ── */
  var container = document.createElement("div");
  container.innerHTML = '\
<div class="sede">\
  <div class="sidebar">\
    <div class="sidebar-header">\
      <div class="sidebar-logo">\
        <div class="sidebar-logo-icon"><span class="ms">code</span></div>\
        <div><div class="sidebar-logo-text">Sede</div><div class="sidebar-logo-sub">by VocabuQuiz</div></div>\
      </div>\
      <button class="sidebar-new"><span class="ms">add</span> New</button>\
    </div>\
    <div class="sidebar-nav">\
      <button class="sidebar-nav-item"><span class="ms">search</span> Search</button>\
      <button class="sidebar-nav-item"><span class="ms">folder</span> Files</button>\
      <button class="sidebar-nav-item"><span class="ms">terminal</span> Terminal</button>\
      <button class="sidebar-nav-item"><span class="ms">note_add</span> New Project</button>\
      <button class="sidebar-nav-item"><span class="ms">sync</span> Re-index</button>\
    </div>\
    <div class="sidebar-divider"></div>\
    <div class="sidebar-label">My Session</div>\
    <div class="sidebar-sessions">\
      <button class="sidebar-session is-active"><span class="sidebar-session-name">\u30AB\u30EC\u30F3\u30C0\u30FC\u30A2\u30D7\u30EA\u3092\u4F5C\u3063\u3066...</span><span class="sidebar-session-date">2\u5206\u524D</span></button>\
      <button class="sidebar-session"><span class="sidebar-session-name">Todo\u30A2\u30D7\u30EA\u3092\u4F5C\u3063\u3066\u3001\u6A5F\u80FD: \u30BF\u30B9\u30AF\u8FFD\u52A0...</span><span class="sidebar-session-date">15\u5206\u524D</span></button>\
      <button class="sidebar-session"><span class="sidebar-session-name">EC\u30B5\u30A4\u30C8\u3092\u4F5C\u3063\u3066\u3001\u5546\u54C1\u30B0\u30EA\u30C3\u30C9...</span><span class="sidebar-session-date">1\u6642\u9593\u524D</span></button>\
      <button class="sidebar-session"><span class="sidebar-session-name">\u30D1\u30FC\u30C6\u30A3\u30AF\u30EB\u30B7\u30DF\u30E5\u30EC\u30FC\u30BF\u30FC</span><span class="sidebar-session-date">\u6628\u65E5</span></button>\
    </div>\
    <div class="sidebar-footer">\
      <div class="sidebar-usage">\
        <div class="sidebar-usage-label">Usage</div>\
        <div class="sidebar-usage-row"><span>\u4ECA\u65E5</span><strong>23%</strong></div>\
        <div class="sidebar-usage-bar"><div class="sidebar-usage-fill" style="width:23%"></div></div>\
        <div class="sidebar-usage-row"><span>\u4ECA\u6708</span><strong>8%</strong></div>\
        <div class="sidebar-usage-bar"><div class="sidebar-usage-fill" style="width:8%"></div></div>\
        <button class="sidebar-usage-btn"><span class="ms">bar_chart</span> \u8A73\u7D30\u3092\u898B\u308B</button>\
      </div>\
      <button class="sidebar-back" id="sedeBackBtn"><span class="ms">arrow_back</span> Quick Chat</button>\
    </div>\
  </div>\
  <div class="sidebar-overlay" id="sedeSidebarOverlay"></div>\
  <div class="center" id="sedeCenterPane">\
    <div class="topbar">\
      <button class="sidebar-toggle" id="sedeSidebarToggle"><span class="ms">menu</span></button>\
      <div class="topbar-tabs">\
        <button class="topbar-tab is-active" data-center-tab="chat"><span class="ms">chat</span> Chat</button>\
        <button class="topbar-tab" data-center-tab="code"><span class="ms">code</span> Code</button>\
      </div>\
      <div class="topbar-model-wrap" id="sedeModelPicker" style="position:relative;">\
        <button class="topbar-model-trigger" id="sedeModelTrigger" type="button" aria-haspopup="listbox" aria-expanded="false">\
          <span class="ms topbar-model-icon">terminal</span>\
          <span id="sedeModelLabel">Sede Sprout 3.0</span>\
          <span class="ms topbar-model-arrow">keyboard_arrow_down</span>\
        </button>\
        <div class="topbar-model-dd is-hidden" id="sedeModelMenu" role="listbox"></div>\
      </div>\
      <div class="topbar-spacer"></div>\
      <div class="topbar-actions">\
        <button class="topbar-btn" data-tip="Run"><span class="ms">play_arrow</span></button>\
        <button class="topbar-btn" data-tip="Preview"><span class="ms">visibility</span></button>\
        <button class="topbar-btn" data-tip="Mobile"><span class="ms">smartphone</span></button>\
        <button class="topbar-btn" data-tip="Console"><span class="ms">terminal</span></button>\
        <button class="topbar-btn" data-tip="Deploy"><span class="ms">rocket_launch</span></button>\
        <button class="topbar-btn" data-tip="Settings"><span class="ms">settings</span></button>\
        <div style="width:1px;height:20px;background:var(--border);margin:0 4px;"></div>\
        <button class="topbar-btn" data-tip="Logs" id="sedeToggleRightBtn"><span class="ms">side_navigation</span></button>\
      </div>\
    </div>\
    <div class="welcome" id="sedeWelcomePane">\
      <div class="welcome-icon"><span class="ms">code</span></div>\
      <div class="welcome-title">// \u9759\u304B\u306A\u6642\u9593\u3001\u96C6\u4E2D\u3057\u3066\u66F8\u3053\u3046</div>\
      <div class="welcome-sub">\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u304B\u3089\u59CB\u3081\u308B\u304B\u3001\u81EA\u7531\u306B\u5165\u529B</div>\
      <div class="tmpl-grid">\
        <div class="tmpl-card"><div class="tmpl-icon c1"><span class="ms">check_box</span></div><div class="tmpl-name">Todo App</div></div>\
        <div class="tmpl-card"><div class="tmpl-icon c2"><span class="ms">dashboard</span></div><div class="tmpl-name">Dashboard</div></div>\
        <div class="tmpl-card"><div class="tmpl-icon c3"><span class="ms">shopping_cart</span></div><div class="tmpl-name">E-Commerce</div></div>\
        <div class="tmpl-card"><div class="tmpl-icon c4"><span class="ms">web</span></div><div class="tmpl-name">Portfolio</div></div>\
        <div class="tmpl-card"><div class="tmpl-icon c5"><span class="ms">article</span></div><div class="tmpl-name">Blog / CMS</div></div>\
        <div class="tmpl-card"><div class="tmpl-icon c6"><span class="ms">chat</span></div><div class="tmpl-name">Chat App</div></div>\
        <div class="tmpl-card"><div class="tmpl-icon c7"><span class="ms">calendar_month</span></div><div class="tmpl-name">Calendar</div></div>\
        <div class="tmpl-card"><div class="tmpl-icon c8"><span class="ms">sports_esports</span></div><div class="tmpl-name">Game</div></div>\
      </div>\
    </div>\
    <div class="chat-scroll" id="sedeChatPane" style="position:relative;">\
      <div class="chat-list" id="sedeChatList"></div>\
      <button id="sedeScrollDownBtn" style="position:sticky;bottom:16px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:4px;padding:8px 14px;background:var(--accent,#6366f1);color:#fff;border:none;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:10;margin:0 auto;" aria-label="\u6700\u65B0\u3078\u30B9\u30AF\u30ED\u30FC\u30EB"><span class="ms" style="font-size:16px;">arrow_downward</span>\u65B0\u3057\u3044\u30E1\u30C3\u30BB\u30FC\u30B8</button>\
    </div>\
    <div class="steer" id="sedeSteer">\
      <div class="steer-inner">\
        <span class="steer-icon"><span class="ms">reply</span></span>\
        <input class="steer-input" id="sedeSteerInput" placeholder="\u8FFD\u52A0\u306E\u6307\u793A\u3084\u4FEE\u6B63..." maxlength="500" />\
        <button class="steer-send" id="sedeSteerSend"><span class="ms">arrow_upward</span></button>\
        <button class="steer-stop" id="sedeStopBtn" style="margin-left:6px;padding:6px 10px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;"><span class="ms" style="font-size:14px;">stop_circle</span>停止</button>\
      </div>\
    </div>\
    <div class="composer">\
      <div class="composer-inner">\
        <input id="sedeComposerFileInput" class="sede-hidden" type="file" accept="image/*,application/pdf,text/*,.txt,.csv,.json,.md" multiple />\
        <div class="composer-pending sede-hidden" id="sedeComposerPending" aria-live="polite"></div>\
        <textarea class="composer-input" id="sedeComposerInput" rows="3" maxlength="4000" placeholder="\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5165\u529B..." aria-label="Sede\u5165\u529B"></textarea>\
        <div class="composer-toolbar">\
          <div class="composer-toolbar-left">\
            <button class="composer-tool" data-action="attach" title="\u30D5\u30A1\u30A4\u30EB\u6DFB\u4ED8" aria-label="\u30D5\u30A1\u30A4\u30EB\u6DFB\u4ED8"><span class="ms">attach_file</span></button>\
            <button class="composer-tool" data-action="image" title="\u753B\u50CF\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9" aria-label="\u753B\u50CF\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9"><span class="ms">image</span></button>\
            <button class="composer-tool" data-action="code" title="\u30B3\u30FC\u30C9\u30B9\u30CB\u30DA\u30C3\u30C8" aria-label="\u30B3\u30FC\u30C9\u30B9\u30CB\u30DA\u30C3\u30C8"><span class="ms">code</span></button>\
            <button class="composer-tool" id="sedeWebSearchToggle" data-action="websearch" title="\u30A6\u30A7\u30D6\u691C\u7D22" aria-label="\u30A6\u30A7\u30D6\u691C\u7D22"><span class="ms">language</span></button>\
            <button class="composer-tool" data-action="mic" title="\u97F3\u58F0\u5165\u529B" aria-label="\u97F3\u58F0\u5165\u529B"><span class="ms">mic</span></button>\
            <button class="composer-tool" data-action="camera" title="AR\u30AB\u30E1\u30E9" aria-label="AR\u30AB\u30E1\u30E9"><span class="ms">photo_camera</span></button>\
          </div>\
          <div class="composer-toolbar-right">\
            <button class="composer-stop sede-hidden" id="sedeComposerStop" type="button" title="\u751F\u6210\u3092\u505C\u6B62" aria-label="\u751F\u6210\u3092\u505C\u6B62"><span class="ms">stop</span></button>\
            <button class="composer-send" id="sedeSendBtn" type="submit"><span class="ms">arrow_upward</span><span>\u9001\u4FE1</span></button>\
          </div>\
        </div>\
      </div>\
      <div class="composer-disclaimer">Sede\u306E\u56DE\u7B54\u306F\u78BA\u5B9F\u306B\u6B63\u3057\u3044\u3068\u306F\u9650\u308A\u307E\u305B\u3093\u3002\u56DE\u7B54\u5185\u5BB9\u306E\u60C5\u5831\u3092\u3088\u304F\u78BA\u8A8D\u3059\u308B\u3053\u3068\u3092\u63A8\u5968\u3057\u307E\u3059\u3002</div>\
    </div>\
  </div>\
  <div class="right" id="sedeRightPane">\
    <div class="right-tabs" id="sedeRightTabs">\
      <button class="right-back" id="sedeRightBack"><span class="ms">arrow_back</span></button>\
      <button class="right-tab" data-right-tab="editor"><span class="ms">code</span> Editor</button>\
      <button class="right-tab is-active" data-right-tab="logs"><span class="ms">list_alt</span> Logs</button>\
      <button class="right-tab" data-right-tab="preview"><span class="ms">visibility</span> Preview</button>\
      <button class="right-tab" data-right-tab="terminal"><span class="ms">terminal</span> Terminal</button>\
    </div>\
    <div class="right-content">\
      <div class="right-panel" data-panel="editor">\
        <div class="code-toolbar">\
          <div class="code-toolbar-file"><span class="ms">description</span> app.html</div>\
          <div class="code-toolbar-spacer"></div>\
          <div class="code-toolbar-info" id="sedeCodeInfo">\u751F\u6210\u4E2D...</div>\
          <button class="code-toolbar-btn" title="Copy"><span class="ms">content_copy</span></button>\
          <button class="code-toolbar-btn" title="Download"><span class="ms">download</span></button>\
          <button class="code-toolbar-btn" title="Preview" style="color:var(--accent)"><span class="ms">play_arrow</span></button>\
        </div>\
        <div class="code-view" id="sedeCodeView">\
          <div class="code-empty">\u30B3\u30FC\u30C9\u304C\u751F\u6210\u3055\u308C\u308B\u3068\u3053\u3053\u306B\u8868\u793A\u3055\u308C\u307E\u3059</div>\
        </div>\
      </div>\
      <div class="right-panel is-active" data-panel="logs">\
        <div class="log-gen-header" id="sedeLogGenHeader" style="display:none"></div>\
        <div class="logs-scroll" id="sedeLogsScroll"></div>\
      </div>\
      <div class="right-panel" data-panel="preview">\
        <div class="preview-view"><iframe class="preview-frame" srcdoc="<div style=\'display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-family:Inter,sans-serif;\'>\u30D7\u30EC\u30D3\u30E5\u30FC\u304C\u3053\u3053\u306B\u8868\u793A\u3055\u308C\u307E\u3059</div>"></iframe></div>\
      </div>\
      <div class="right-panel" data-panel="terminal">\
        <div class="terminal-view">\
          <div class="terminal-line" style="color:var(--text-muted);">$ Sede Terminal Ready</div>\
          <div class="terminal-prompt"><span class="terminal-prompt-icon">$</span><input class="terminal-input" placeholder="\u30B3\u30DE\u30F3\u30C9\u3092\u5165\u529B..."></div>\
        </div>\
      </div>\
    </div>\
  </div>\
</div>\
';
  shadow.appendChild(container);

  /* ── JavaScript (adapted for shadow DOM) ── */
  var rightTabs = shadow.getElementById("sedeRightTabs");
  var rightPane = shadow.getElementById("sedeRightPane");
  var centerPane = shadow.getElementById("sedeCenterPane");
  var welcomePane = shadow.getElementById("sedeWelcomePane");
  var chatPane = shadow.getElementById("sedeChatPane");
  var chatList = shadow.getElementById("sedeChatList");
  var logsScroll = shadow.getElementById("sedeLogsScroll");
  var scrollDownBtn = shadow.getElementById("sedeScrollDownBtn");

  /* ── スマートスクロール: ユーザーが最下部にいる時だけ自動スクロール ── */
  var _userScrolledUp = false;
  function _isAtBottom(){
    if(!chatPane) return true;
    return (chatPane.scrollHeight - chatPane.scrollTop - chatPane.clientHeight) < 80;
  }
  function _smartScrollToBottom(){
    if(!chatPane) return;
    if(!_userScrolledUp){
      chatPane.scrollTop = chatPane.scrollHeight;
    } else if(scrollDownBtn){
      scrollDownBtn.style.display = "inline-flex";
    }
  }
  function _forceScrollToBottom(){
    if(!chatPane) return;
    chatPane.scrollTop = chatPane.scrollHeight;
    _userScrolledUp = false;
    if(scrollDownBtn) scrollDownBtn.style.display = "none";
  }
  window._sedeSmartScroll = _smartScrollToBottom;
  window._sedeForceScroll = _forceScrollToBottom;

  /* scroll event で上スクロール検知 */
  if(chatPane){
    chatPane.addEventListener("scroll", function(){
      if(_isAtBottom()){
        _userScrolledUp = false;
        if(scrollDownBtn) scrollDownBtn.style.display = "none";
      } else {
        _userScrolledUp = true;
      }
    });
  }
  /* ボタン クリックで下へ */
  if(scrollDownBtn){
    scrollDownBtn.addEventListener("click", _forceScrollToBottom);
  }
  var sendBtn = shadow.getElementById("sedeSendBtn");
  var input = shadow.getElementById("sedeComposerInput");
  var backBtn = shadow.getElementById("sedeBackBtn");
  var toggleRightBtn = shadow.getElementById("sedeToggleRightBtn");
  var sidebarToggle = shadow.getElementById("sedeSidebarToggle");
  var sidebarOverlay = shadow.getElementById("sedeSidebarOverlay");
  var sidebarEl = shadow.querySelector(".sidebar");
  var _generating = false;

  /* ═══ Sede Model Picker (Sprout / Oak / Canopy) ═══ */
  var _sedeModelDefs = [
    { id:"sprout-3", name:"Sede Sprout 3.0", badge:"Free / Free+", desc:"高速・気軽に試せる標準モデル", engine:"DeepSeek V3.2", icon:"eco", bg:"#dcfce7", fg:"#16a34a", locked:false },
    { id:"oak-5",    name:"Sede Oak 5.0",    badge:"EDU PRE / PRE", desc:"信頼と実用のバランス型",      engine:"Sonnet 4.6 + Haiku 4.5",  icon:"park",   bg:"#fef3c7", fg:"#ca8a04", locked:true, lockedTip:"EDU PRE / PRE プランで利用可能" },
    { id:"canopy-5", name:"Sede Canopy 5.0", badge:"Ultra",          desc:"最上位・設計と自律の極致",     engine:"Opus 4.7 + Sonnet 4.6",   icon:"forest", bg:"#d1fae5", fg:"#047857", locked:true, lockedTip:"Ultra プランで利用可能" }
  ];
  /* H3 Rinto (uid=10 or nickname=rinto) は全モデル常時アクセス可 — 動的判定 */
  function _sedeIsRintoDev(){ return !!window._sedeIsRintoDev; }
  var _sedeSelectedModelId = (function(){ try { return localStorage.getItem("sede.selectedModel") || "sprout-3"; } catch(e){ return "sprout-3"; } })();
  try { if (window._sede) window._sede.selectedModel = _sedeSelectedModelId; } catch(e){}
  var _modelTrigger = shadow.getElementById("sedeModelTrigger");
  var _modelLabel = shadow.getElementById("sedeModelLabel");
  var _modelMenu = shadow.getElementById("sedeModelMenu");
  function _renderSedeModelMenu(){
    if (!_modelMenu) return;
    var cur = _sedeSelectedModelId;
    var bypass = _sedeIsRintoDev();
    var html = '<div class="topbar-model-dd-label">SEDE MODEL</div>';
    _sedeModelDefs.forEach(function(m){
      var active = m.id === cur;
      var locked = m.locked && !bypass;
      html += '<div class="topbar-model-item' + (active ? ' is-active' : '') + (locked ? ' is-locked' : '') + '"'
        + ' role="option" data-sede-model="' + m.id + '">'
        + '<div class="topbar-model-item-icon" style="background:' + m.bg + ';color:' + m.fg + ';"><span class="ms">' + m.icon + '</span></div>'
        + '<div class="topbar-model-item-text">'
        + '<div class="topbar-model-item-name">' + m.name + '<span class="topbar-model-item-badge">' + m.badge + '</span></div>'
        + '<div class="topbar-model-item-desc">' + m.desc + '</div>'
        + '<div class="topbar-model-item-engine">Engine: ' + m.engine + '</div>'
        + '</div>'
        + (active ? '<span class="ms topbar-model-item-check">check_circle</span>' : '')
        + (locked ? '<span class="ms topbar-model-item-lock">lock</span>' : '')
        + '</div>';
    });
    _modelMenu.innerHTML = html;
  }
  function _updateSedeModelLabel(){
    var def = _sedeModelDefs.find(function(m){ return m.id === _sedeSelectedModelId; }) || _sedeModelDefs[0];
    if (_modelLabel) _modelLabel.textContent = def.name;
  }
  function _selectSedeModel(id){
    var def = _sedeModelDefs.find(function(m){ return m.id === id; });
    if (!def) return;
    if (def.locked && !_sedeIsRintoDev()){
      try { alert(def.lockedTip || "このモデルはまだ利用できません"); } catch(e){}
      return;
    }
    _sedeSelectedModelId = id;
    try { localStorage.setItem("sede.selectedModel", id); } catch(e){}
    try { if (window._sede) window._sede.selectedModel = id; } catch(e){}
    _updateSedeModelLabel();
    _renderSedeModelMenu();
    if (_modelMenu) _modelMenu.classList.add("is-hidden");
    if (_modelTrigger) _modelTrigger.setAttribute("aria-expanded", "false");
  }
  if (_modelTrigger){
    _modelTrigger.addEventListener("click", function(e){
      e.stopPropagation(); e.preventDefault();
      if (!_modelMenu) return;
      var open = !_modelMenu.classList.contains("is-hidden");
      if (open){
        _modelMenu.classList.add("is-hidden");
        _modelTrigger.setAttribute("aria-expanded", "false");
      } else {
        _renderSedeModelMenu();
        _modelMenu.classList.remove("is-hidden");
        _modelTrigger.setAttribute("aria-expanded", "true");
      }
    });
  }
  if (_modelMenu){
    _modelMenu.addEventListener("click", function(e){
      var item = e.target.closest("[data-sede-model]");
      if (!item) return;
      e.stopPropagation();
      _selectSedeModel(item.getAttribute("data-sede-model"));
    });
  }
  shadow.addEventListener("click", function(e){
    if (!_modelMenu || _modelMenu.classList.contains("is-hidden")) return;
    if (!_modelMenu.contains(e.target) && (!_modelTrigger || !_modelTrigger.contains(e.target))){
      _modelMenu.classList.add("is-hidden");
      if (_modelTrigger) _modelTrigger.setAttribute("aria-expanded", "false");
    }
  });
  _updateSedeModelLabel();
  _renderSedeModelMenu();

  /* ── サイドバー開閉（PC/モバイル共通） ── */
  function _openSidebar(){ sidebarEl.classList.add("is-open"); sidebarOverlay.classList.add("is-open"); }
  function _closeSidebar(){ sidebarEl.classList.remove("is-open"); sidebarOverlay.classList.remove("is-open"); }
  if(sidebarToggle) sidebarToggle.addEventListener("click", function(){ sidebarEl.classList.contains("is-open") ? _closeSidebar() : _openSidebar(); });
  if(sidebarOverlay) sidebarOverlay.addEventListener("click", _closeSidebar);
  var rightBackBtn = shadow.getElementById("sedeRightBack");
  if(rightBackBtn) rightBackBtn.addEventListener("click", function(){ _hideRight(); });

  var _rightOpen = false;
  /* 初回だけベーススタイル設定（transition含む） */
  /* スタイルはCSSクラスで制御、JSはクラスの付け外しのみ */
  function _isMobile(){ return window.innerWidth <= 768; }
  function _hideRight(){
    _rightOpen = false;
    shadow.querySelector(".sede").classList.remove("has-right");
    rightPane.classList.remove("is-mobile-open");
  }
  function _showRight(){
    _rightOpen = true;
    shadow.querySelector(".sede").classList.add("has-right");
    rightPane.classList.add("is-mobile-open");
  }
  function toggleRight(){
    if(_rightOpen) _hideRight(); else _showRight();
  }

  /* Right tab switching */
  rightTabs.addEventListener("click", function(e){
    var tab = e.target.closest(".right-tab");
    if(!tab) return;
    var name = tab.getAttribute("data-right-tab");
    shadow.querySelectorAll(".right-tab").forEach(function(t){ t.classList.remove("is-active"); });
    tab.classList.add("is-active");
    shadow.querySelectorAll(".right-panel").forEach(function(p){ p.classList.remove("is-active"); });
    if(name === "preview"){
      _openFullPreview("pc");
      return;
    }
    var panel = shadow.querySelector('[data-panel="'+name+'"]');
    if(panel) panel.classList.add("is-active");
  });

  /* Center tab switching */
  shadow.querySelectorAll("[data-center-tab]").forEach(function(tab){
    tab.addEventListener("click", function(){
      shadow.querySelectorAll("[data-center-tab]").forEach(function(t){ t.classList.remove("is-active"); });
      tab.classList.add("is-active");
    });
  });

  /* 1. 初期状態: 右ペインなし→中央フル幅 */
  _hideRight();

  /* Toggle right pane */
  if(toggleRightBtn) toggleRightBtn.addEventListener("click", toggleRight);

  /* 3. サイドバーナビ接続 */
  shadow.querySelectorAll(".sidebar-nav-item, .sv2-nav-item").forEach(function(item){
    item.addEventListener("click", function(){
      var text = (item.textContent || "").trim();
      /* 元のSedeのナビアイテムをクリック */
      var action = "";
      if(text.includes("Search")) action = "search";
      else if(text.includes("Files")) action = "files";
      else if(text.includes("Terminal")) action = "terminal";
      else if(text.includes("New Project")) action = "newProject";
      else if(text.includes("Re-index") || text.includes("index")) action = "reindex";
      if(action){
        var origItem = document.querySelector('[data-sede-action="'+action+'"]');
        if(origItem) origItem.click();
      }
    });
  });

  /* Usage接続 */
  function syncUsage(){
    var dailyPct = document.getElementById("sedeDailyPct");
    var monthlyPct = document.getElementById("sedeMonthlyPct");
    var dailyBar = document.getElementById("sedeDailyBar");
    var monthlyBar = document.getElementById("sedeMonthlyBar");
    var planBadge = document.getElementById("sedePlanBadge");
    /* Shadow DOM内のUsage要素 */
    var sUsageSection = shadow.querySelector(".sidebar-usage") || shadow.querySelector(".sv2-usage");
    if(!sUsageSection) return;
    var dp = dailyPct ? dailyPct.textContent : "0%";
    var mp = monthlyPct ? monthlyPct.textContent : "0%";
    var plan = planBadge ? planBadge.textContent : "Free+";
    sUsageSection.innerHTML = '<div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Usage</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:3px;"><span>今日</span><strong style="color:#1e293b;">'+dp+'</strong></div>'
      + '<div style="height:4px;background:rgba(0,0,0,.06);border-radius:2px;overflow:hidden;margin-bottom:6px;"><div style="height:100%;border-radius:2px;background:linear-gradient(90deg,#6366f1,#8b5cf6);width:'+dp+';"></div></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:3px;"><span>今月</span><strong style="color:#1e293b;">'+mp+'</strong></div>'
      + '<div style="height:4px;background:rgba(0,0,0,.06);border-radius:2px;overflow:hidden;margin-bottom:6px;"><div style="height:100%;border-radius:2px;background:linear-gradient(90deg,#6366f1,#8b5cf6);width:'+mp+';"></div></div>'
      + '<div style="font-size:10px;color:#94a3b8;margin-bottom:4px;">' + plan + '</div>';
  }
  setInterval(syncUsage, 3000);
  setTimeout(syncUsage, 1500);

  /* Back button → hide the host */
  if(backBtn){
    backBtn.addEventListener("click", function(){
      host.style.display = "none";
      document.body.style.overflow = "";
      /* 元のSedeモードを解除してQuick Chatに戻す */
      var shell = document.getElementById("appAiChatShell");
      if(shell) shell.removeAttribute("data-chat-mode");
      /* 元のQuick Chat戻るボタンをクリック */
      var origBackBtn = document.querySelector('[data-sede-action="backToChat"]');
      if(origBackBtn) origBackBtn.click();
    });
  }

  /* Load sessions into shadow DOM sidebar */
  function _sv2TimeAgo(ts){
    if(!ts) return "";
    var diff = Date.now() - ts;
    if(diff < 60000) return "たった今";
    if(diff < 3600000) return Math.floor(diff/60000) + "分前";
    if(diff < 86400000) return Math.floor(diff/3600000) + "時間前";
    return Math.floor(diff/86400000) + "日前";
  }
  /* ── セッション上限警告バナー ── */
  function _updateSessionLimitBanner(){
    var state = window._sedeState;
    var count = state && state.sessions ? state.sessions.length : 0;
    var banner = shadow.getElementById("sedeSessionLimitBanner");
    if(count < 90){
      if(banner) banner.remove();
      return;
    }
    var isNearMax = count >= 100;
    var msg = isNearMax
      ? '<span class="ms" style="font-size:18px;color:#dc2626;vertical-align:middle;">error</span> セッション上限(100件)に到達しました。新しいセッションを作ると古いものが削除されます。'
      : '<span class="ms" style="font-size:18px;color:#d97706;vertical-align:middle;">warning</span> セッション ' + count + '/100件 — あと ' + (100 - count) + '件で上限です。不要なセッションを削除してください。';
    if(!banner){
      banner = document.createElement("div");
      banner.id = "sedeSessionLimitBanner";
      banner.style.cssText = "padding:10px 16px;font-size:13px;line-height:1.5;border-bottom:1px solid " + (isNearMax ? "#fecaca" : "#fde68a") + ";background:" + (isNearMax ? "#fef2f2" : "#fffbeb") + ";color:" + (isNearMax ? "#991b1b" : "#92400e") + ";display:flex;align-items:center;gap:8px;";
      var center = shadow.getElementById("sedeCenterPane");
      if(center && center.firstChild) center.insertBefore(banner, center.firstChild);
      else if(center) center.appendChild(banner);
    } else {
      banner.style.background = isNearMax ? "#fef2f2" : "#fffbeb";
      banner.style.color = isNearMax ? "#991b1b" : "#92400e";
      banner.style.borderBottomColor = isNearMax ? "#fecaca" : "#fde68a";
    }
    banner.innerHTML = msg;
  }

  function loadSessionsToShadow(){
    var sessionsEl = shadow.querySelector(".sidebar-sessions") || shadow.querySelector(".sv2-sessions");
    if(!sessionsEl) return;
    var state = window._sedeState;
    /* 上限警告チェック */
    _updateSessionLimitBanner();
    if(!state || !state.sessions || !state.sessions.length){
      sessionsEl.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:var(--text-muted);">セッションなし</div>';
      return;
    }
    var sessions = state.sessions;
    sessionsEl.innerHTML = "";
    sessions.forEach(function(s){
      var row = document.createElement("div");
      var isActive = s.id === state.activeId;
      row.className = "sidebar-session-row" + (isActive ? " is-active" : "");
      var title = s.title || "セッション";
      if(title.length > 30) title = title.slice(0,30) + "...";
      var dateStr = _sv2TimeAgo(s.updatedAt || s.createdAt);
      var msgCount = (s.messages || []).length;
      row.innerHTML = '<button class="sidebar-session">'
        + '<span class="sidebar-session-name">' + esc(title) + '</span>'
        + '<span class="sidebar-session-date">' + esc(dateStr) + (msgCount ? ' \u00B7 ' + msgCount + '\u4EF6' : '') + '</span>'
        + '</button>'
        + '<button class="sidebar-session-opts"><span class="ms">more_horiz</span></button>';
      /* セッションクリック → 全パネル切替 */
      row.querySelector(".sidebar-session").addEventListener("click", function(){
        if(typeof window._sedeSwitchSession === "function") window._sedeSwitchSession(s.id);
        _closeSidebar();
        setTimeout(function(){ loadSessionsToShadow(); _switchToSession(s); }, 300);
      });
      /* オプションボタン */
      row.querySelector(".sidebar-session-opts").addEventListener("click", function(e){
        e.stopPropagation();
        _openSessionMenu(s, row);
      });
      sessionsEl.appendChild(row);
    });
  }

  /* ── セッション切替: 全パネル一括更新 ── */
  function _switchToSession(s){
    /* 1. チャット履歴 + ログを復元 */
    chatList.innerHTML = "";
    if(logsScroll) logsScroll.innerHTML = "";
    if(!s || !s.messages || !s.messages.length){
      if(welcomePane) welcomePane.style.display = "flex";
      if(chatPane) chatPane.style.display = "none";
    } else {
      if(welcomePane) welcomePane.style.display = "none";
      if(chatPane) chatPane.style.display = "block";
      s.messages.forEach(function(m){
        var r = m.role || "ai";
        if(r === "user" || r === "ai"){
          addChatMsg(r, m.text || m.content || "", true);
        } else if(r === "log"){
          addTool(m.icon || "info", m.text || "", true);
        } else if(r === "log-ok"){
          addToolOk(m.icon || "check_circle", m.text || "", true);
        } else if(r === "chat-log"){
          addAIChat(m.text || "", true);
        } else if(r === "steer"){
          var sd = document.createElement("div");
          sd.className = "chat-msg is-user";
          sd.innerHTML = '<div class="chat-role" style="display:flex;align-items:center;gap:4px;"><span class="ms" style="font-size:16px;color:var(--accent);">reply</span> Steer</div>'
            + '<div class="chat-bubble-user" style="background:var(--accent-light);color:var(--text);border:1px solid rgba(99,102,241,.15);">' + esc(m.text || "") + '</div>';
          chatList.appendChild(sd);
          addTool("reply", "Steer: " + (m.text||"").slice(0,80), true);
        }
      });
      if(typeof _forceScrollToBottom === "function") _forceScrollToBottom();
      else chatPane.scrollTop = chatPane.scrollHeight;
      if(logsScroll) logsScroll.scrollTop = logsScroll.scrollHeight;
    }
    /* 2. コードエディタ更新 — currentCodeをcodeHistoryに復元 */
    /* セッション切替時は常にcodeHistoryをリセット（前セッションのコード漏れ防止） */
    if(window._sede){
      var _resolvedCode = null;
      var _resolvedLang = "html";
      var _resolvedFname = "app.html";
      if(s && s.currentCode){
        if(s.currentCode.code){
          _resolvedCode = s.currentCode.code;
          _resolvedLang = s.currentCode.lang || "html";
          _resolvedFname = s.currentCode.filename || "app.html";
        } else if(s.currentCode._ref && s.id){
          /* localStorageから直接フォールバック復元 */
          try {
            var _fallback = localStorage.getItem("app.sede.code." + s.id);
            if(_fallback){
              _resolvedCode = _fallback;
              _resolvedLang = s._codeLang || s.currentCode.lang || "html";
              _resolvedFname = s._codeFname || s.currentCode.filename || "app.html";
              /* sessionオブジェクトも復元しておく */
              s.currentCode = { lang: _resolvedLang, filename: _resolvedFname, code: _resolvedCode };
            }
          } catch(e){}
        }
      }
      if(_resolvedCode){
        window._sede.codeHistory = [{ lang: _resolvedLang, filename: _resolvedFname, code: _resolvedCode }];
      } else {
        window._sede.codeHistory = [];
      }
    }
    var block = (window._sede && window._sede.codeHistory && window._sede.codeHistory.length)
      ? window._sede.codeHistory[window._sede.codeHistory.length - 1] : null;
    var codeView = shadow.getElementById("sedeCodeView");
    var codeInfo = shadow.getElementById("sedeCodeInfo");
    if(block && block.code){
      if(codeView) codeView.innerHTML = _buildCodeHtml(block.code);
      if(codeInfo) codeInfo.textContent = (block.lang||"html").toUpperCase() + " \u2022 " + block.code.split("\n").length + "\u884C";
    } else {
      if(codeView) codeView.innerHTML = '<div class="code-empty">\u30B3\u30FC\u30C9\u304C\u751F\u6210\u3055\u308C\u308B\u3068\u3053\u3053\u306B\u8868\u793A\u3055\u308C\u307E\u3059</div>';
      if(codeInfo) codeInfo.textContent = "";
    }
    /* 3. プレビュー更新 */
    if(block && block.code && typeof _loadPreview === "function"){
      _loadPreview(block.code, block.lang || "html");
    } else {
      var frame = shadow.querySelector(".preview-frame");
      if(frame) frame.srcdoc = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-family:sans-serif;">\u30D7\u30EC\u30D3\u30E5\u30FC\u304C\u3053\u3053\u306B\u8868\u793A\u3055\u308C\u307E\u3059</div>';
    }
    /* 4. ログヘッダー */
    var genHeader = shadow.getElementById("sedeLogGenHeader");
    if(genHeader) genHeader.style.display = "none";
    /* 5. ターミナルクリア */
    var termView = shadow.querySelector(".terminal-view");
    if(termView) termView.innerHTML = '<div class="terminal-line">$ Sede Terminal Ready</div><div class="terminal-prompt"><span class="terminal-prompt-icon">\u276F</span><input class="terminal-input" placeholder="\u30B3\u30DE\u30F3\u30C9\u3092\u5165\u529B..." spellcheck="false" /></div>';
  }

  /* ── セッションオプションメニュー ── */
  var _activeMenu = null;
  function _openSessionMenu(s, anchor){
    _closeSessionMenu();
    var menu = document.createElement("div");
    menu.className = "session-menu";
    menu.innerHTML = '<button class="session-menu-item" data-act="rename"><span class="ms">edit</span>\u540D\u524D\u3092\u5909\u66F4</button>'
      + '<button class="session-menu-item is-danger" data-act="delete"><span class="ms">delete</span>\u524A\u9664</button>';
    anchor.appendChild(menu);
    _activeMenu = menu;
    menu.querySelector('[data-act="rename"]').addEventListener("click", function(e){
      e.stopPropagation();
      _closeSessionMenu();
      var newName = prompt("\u30BB\u30C3\u30B7\u30E7\u30F3\u540D\u3092\u5165\u529B", s.title || "");
      if(newName !== null && newName.trim()){
        if(typeof window._sedeRenameSession === "function") window._sedeRenameSession(s.id, newName.trim());
        setTimeout(loadSessionsToShadow, 200);
      }
    });
    menu.querySelector('[data-act="delete"]').addEventListener("click", function(e){
      e.stopPropagation();
      _closeSessionMenu();
      if(confirm("\u3053\u306E\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")){
        if(typeof window._sedeDeleteSession === "function") window._sedeDeleteSession(s.id);
        setTimeout(function(){
          loadSessionsToShadow();
          /* 削除したのがアクティブなら Welcome に戻す */
          if(window._sedeState && window._sedeState.activeId !== s.id) return;
          if(welcomePane) welcomePane.style.display = "flex";
          if(chatPane) chatPane.style.display = "none";
          if(chatList) chatList.innerHTML = "";
          _hideRight();
        }, 200);
      }
    });
    /* 外側クリックで閉じる */
    setTimeout(function(){
      shadow.addEventListener("click", _closeSessionMenu, {once:true});
    }, 10);
  }
  function _closeSessionMenu(){
    if(_activeMenu && _activeMenu.parentNode) _activeMenu.parentNode.removeChild(_activeMenu);
    _activeMenu = null;
  }

  /* Periodically sync sessions */
  setInterval(loadSessionsToShadow, 2000);
  setTimeout(loadSessionsToShadow, 1000);
  setTimeout(loadSessionsToShadow, 3000);
  /* 初期表示: Sedeセッション＋アクティブセッションのコードを確実に復元 */
  function _sedeInitRestoreEditor(){
    /* 1. セッションが未ロードなら強制ロード */
    try {
      if(typeof window._sedeLoadSessions === "function" && window._sedeState && !window._sedeState.loaded){
        window._sedeLoadSessions();
      }
    } catch(e){}
    if(!window._sedeState || !window._sede) return false;
    var _initSes = window._sedeState.sessions.find(function(x){ return x.id === window._sedeState.activeId; });
    if(!_initSes) return false;
    /* 2. currentCode.code が無ければ localStorage から復元 */
    var _code = null, _lang = "html", _fname = "app.html";
    if(_initSes.currentCode && _initSes.currentCode.code){
      _code = _initSes.currentCode.code;
      _lang = _initSes.currentCode.lang || "html";
      _fname = _initSes.currentCode.filename || "app.html";
    } else if(_initSes.currentCode && _initSes.currentCode._ref && _initSes.id){
      try {
        var _raw = localStorage.getItem("app.sede.code." + _initSes.id);
        if(_raw){
          _code = _raw;
          _lang = _initSes._codeLang || _initSes.currentCode.lang || "html";
          _fname = _initSes._codeFname || _initSes.currentCode.filename || "app.html";
          _initSes.currentCode = { lang: _lang, filename: _fname, code: _code };
        }
      } catch(e){}
    }
    if(!_code) return false;
    /* 3. codeHistory + エディタ + プレビューすべて反映 */
    window._sede.codeHistory = [{ lang: _lang, filename: _fname, code: _code }];
    var _initCv = shadow.getElementById("sedeCodeView");
    if(_initCv) _initCv.innerHTML = _buildCodeHtml(_code);
    var _initCi = shadow.getElementById("sedeCodeInfo");
    if(_initCi) _initCi.textContent = _lang.toUpperCase() + " \u2022 " + _code.split("\n").length + "\u884C";
    if(typeof _loadPreview === "function") _loadPreview(_code, _lang);
    return true;
  }
  /* 複数タイミングで試行（_sedeStateロード待ち） */
  setTimeout(_sedeInitRestoreEditor, 500);
  setTimeout(_sedeInitRestoreEditor, 1500);
  setTimeout(_sedeInitRestoreEditor, 3000);

  /* New Session ボタン接続 */
  var newBtn = shadow.querySelector(".sidebar-new") || shadow.querySelector(".sv2-new");
  if(newBtn){
    newBtn.addEventListener("click", function(){
      if(typeof window._sedeNewSession === "function"){
        window._sedeNewSession();
      } else {
        /* 元のSedeの新規セッションボタンをクリック */
        var origNewBtn = document.querySelector('[data-sede-action="newSession"]');
        if(origNewBtn) origNewBtn.click();
      }
      /* UIリセット */
      _closeSidebar();
      if(welcomePane) welcomePane.style.display = "flex";
      if(chatPane) chatPane.style.display = "none";
      if(chatList) chatList.innerHTML = "";
      /* エディタ・コード履歴クリア */
      if(window._sede) window._sede.codeHistory = [];
      var _cv = shadow.getElementById("sedeCodeView");
      if(_cv) _cv.innerHTML = '<div class="code-empty">\u30B3\u30FC\u30C9\u304C\u751F\u6210\u3055\u308C\u308B\u3068\u3053\u3053\u306B\u8868\u793A\u3055\u308C\u307E\u3059</div>';
      var _ci = shadow.getElementById("sedeCodeInfo");
      if(_ci) _ci.textContent = "";
      if(logsScroll) logsScroll.innerHTML = "";
      var _gh = shadow.getElementById("sedeLogGenHeader");
      if(_gh) _gh.style.display = "none";
      var _pf = shadow.querySelector(".preview-frame");
      if(_pf) _pf.srcdoc = "";
      _hideRight();
      setTimeout(loadSessionsToShadow, 500);
    });
  }

  /* ── コマンドパレット ── */
  var _cmdPaletteEl = null;
  var _cmdPaletteIdx = 0;
  var _cmdPaletteFiltered = [];
  var _cmdList = [
    { name: "/run", desc: "現在のコードをプレビューで実行", icon: "play_arrow" },
    { name: "/preview", desc: "全画面プレビューを開く", icon: "visibility" },
    { name: "/deploy", desc: "Cloudflare Pages に公開", icon: "rocket_launch" },
    { name: "/help", desc: "コマンド一覧を表示", icon: "help" }
  ];
  function _showCmdPalette(query){
    if(!_cmdPaletteEl){
      _cmdPaletteEl = document.createElement("div");
      _cmdPaletteEl.id = "sedeCmdPalette";
      _cmdPaletteEl.style.cssText = "position:absolute;left:16px;right:16px;bottom:calc(100% + 8px);background:var(--panel,#1b1b1f);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);overflow:hidden;z-index:50;max-height:320px;overflow-y:auto;";
      var composer = input.parentElement;
      if(composer){
        composer.style.position = "relative";
        composer.appendChild(_cmdPaletteEl);
      }
    }
    var q = (query||"").toLowerCase().replace(/^\//,"");
    _cmdPaletteFiltered = _cmdList.filter(function(c){
      return !q || c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
    });
    if(!_cmdPaletteFiltered.length){ _hideCmdPalette(); return; }
    if(_cmdPaletteIdx >= _cmdPaletteFiltered.length) _cmdPaletteIdx = 0;
    _cmdPaletteEl.innerHTML = _cmdPaletteFiltered.map(function(c,i){
      var active = i === _cmdPaletteIdx;
      return '<div class="cmd-item" data-idx="'+i+'" style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);'+(active?"background:var(--accent-light,rgba(99,102,241,.15));":"")+'">'
        + '<span class="ms" style="font-size:20px;color:var(--accent,#6366f1);">'+c.icon+'</span>'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:14px;font-weight:600;color:var(--text,#eee);">'+c.name+'</div>'
        + '<div style="font-size:12px;color:var(--muted,rgba(255,255,255,.5));">'+c.desc+'</div>'
        + '</div>'
        + '</div>';
    }).join("");
    _cmdPaletteEl.style.display = "block";
    _cmdPaletteEl.querySelectorAll(".cmd-item").forEach(function(el){
      el.addEventListener("mouseenter", function(){
        _cmdPaletteIdx = parseInt(el.getAttribute("data-idx"));
        _renderCmdPaletteActive();
      });
      el.addEventListener("click", function(){
        _selectCmdPaletteItem();
      });
    });
  }
  function _renderCmdPaletteActive(){
    if(!_cmdPaletteEl) return;
    _cmdPaletteEl.querySelectorAll(".cmd-item").forEach(function(el, i){
      el.style.background = (i === _cmdPaletteIdx) ? "var(--accent-light,rgba(99,102,241,.15))" : "";
    });
  }
  function _hideCmdPalette(){
    if(_cmdPaletteEl){ _cmdPaletteEl.style.display = "none"; _cmdPaletteFiltered = []; _cmdPaletteIdx = 0; }
  }
  function _selectCmdPaletteItem(){
    if(!_cmdPaletteFiltered.length) return;
    var c = _cmdPaletteFiltered[_cmdPaletteIdx];
    if(!c) return;
    input.value = c.name + " ";
    _hideCmdPalette();
    input.focus();
  }

  /* ── デプロイダイアログ ── */
  function _showDeployDialog(block){
    var ses = null;
    try {
      if(window._sedeState){
        ses = window._sedeState.sessions.find(function(x){ return x.id === window._sedeState.activeId; });
      }
    } catch(e){}
    var lastDeploy = ses?._deploySubdomain || "";
    var isUpdate = !!lastDeploy;
    var dialog = document.createElement("div");
    dialog.className = "chat-msg";
    dialog.innerHTML = '<div class="chat-role">Sede</div>'
      + '<div class="chat-bubble-ai" style="padding:16px;">'
      + '<div style="font-size:15px;font-weight:600;margin-bottom:8px;">' + (isUpdate ? '\u30B5\u30A4\u30C8\u3092\u66F4\u65B0' : '\u516C\u958BURL\u3092\u8A2D\u5B9A') + '</div>'
      + '<div style="font-size:13px;color:var(--muted,rgba(255,255,255,.6));margin-bottom:12px;">' + (isUpdate ? '\u524D\u56DE: <code>' + lastDeploy + '.vocabuquiz.app</code>' : '\u30B5\u30D6\u30C9\u30E1\u30A4\u30F3\u3092\u5165\u529B\uFF08\u4F8B: my-game \u2192 my-game.vocabuquiz.app\uFF09') + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;">'
      + '<input class="dep-sub" type="text" placeholder="my-app" value="' + lastDeploy + '" maxlength="40" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.15));background:var(--bg,#111);color:var(--text,#eee);font-size:14px;font-family:monospace;" />'
      + '<span style="color:var(--muted,rgba(255,255,255,.5));font-size:13px;white-space:nowrap;">.vocabuquiz.app</span>'
      + '</div>'
      + '<div class="dep-status" style="font-size:12px;color:var(--muted,rgba(255,255,255,.5));margin-bottom:10px;min-height:16px;"></div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="dep-go" style="padding:8px 18px;border-radius:8px;border:none;background:#22c55e;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">' + (isUpdate ? '\u66F4\u65B0\u3059\u308B' : '\u516C\u958B\u3059\u308B') + '</button>'
      + '<button class="dep-cancel" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.15));background:transparent;color:var(--text,#eee);font-size:13px;cursor:pointer;">\u30AD\u30E3\u30F3\u30BB\u30EB</button>'
      + '</div>'
      + '</div>';
    chatList.appendChild(dialog);
    chatPane.scrollTop = chatPane.scrollHeight;
    var subInput = dialog.querySelector(".dep-sub");
    var statusEl = dialog.querySelector(".dep-status");
    var goBtn = dialog.querySelector(".dep-go");
    var cancelBtn = dialog.querySelector(".dep-cancel");
    cancelBtn.addEventListener("click", function(){ dialog.remove(); });
    subInput.focus();
    goBtn.addEventListener("click", async function(){
      var sub = subInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if(!sub || sub.length < 3){ statusEl.textContent = "3文字以上で英数字・ハイフンのみ"; statusEl.style.color = "#ef4444"; return; }
      goBtn.disabled = true;
      goBtn.style.opacity = ".5";
      statusEl.textContent = "デプロイ中...";
      statusEl.style.color = "var(--muted,rgba(255,255,255,.5))";
      addTool("rocket_launch", "Cloudflare Pages にデプロイ中: " + sub);
      try {
        var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
        var hdrs = { "Content-Type": "application/json" };
        try { var t = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if (t) hdrs.Authorization = "Bearer " + t; } catch(e){}
        var res = await fetch(base + "/api/sede/subdomain-deploy", {
          method: "POST", headers: hdrs,
          body: JSON.stringify({
            subdomain: sub,
            code: block.code,
            filename: block.filename || "index.html",
            project_id: ses?._deployProjectId || ""
          })
        });
        var data = await res.json();
        if(data.ok && data.url){
          var url = data.url;
          statusEl.innerHTML = '<span style="color:#22c55e;">\u2713 \u5B8C\u4E86: <a href="' + url + '" target="_blank" style="color:#60a5fa;text-decoration:underline;">' + url + '</a></span>';
          addToolOk("check_circle", "デプロイ完了: " + url);
          addChatMsg("ai", "\u2705 **\u30C7\u30D7\u30ED\u30A4\u5B8C\u4E86**\n\n" + url);
          /* セッションに記録 */
          if(ses){
            ses._deploySubdomain = sub;
            ses._deployUrl = url;
            if(data.project_id) ses._deployProjectId = data.project_id;
            if(typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
          }
        } else {
          var errMsg = data.error || data.message || ("HTTP " + res.status);
          statusEl.textContent = "失敗: " + errMsg;
          statusEl.style.color = "#ef4444";
          addTool("error", "デプロイ失敗: " + errMsg);
          goBtn.disabled = false;
          goBtn.style.opacity = "1";
        }
      } catch(e){
        statusEl.textContent = "通信エラー: " + (e.message || e);
        statusEl.style.color = "#ef4444";
        addTool("error", "デプロイ通信エラー: " + (e.message || e));
        goBtn.disabled = false;
        goBtn.style.opacity = "1";
      }
    });
  }

  /* Send message */
  sendBtn.addEventListener("click", startGeneration);
  input.addEventListener("input", function(){
    var v = input.value;
    if(v.startsWith("/") && !v.includes(" ")) _showCmdPalette(v);
    else _hideCmdPalette();
  });
  input.addEventListener("keydown", function(e){
    /* IME変換中のEnterは無視（日本語変換の確定用） */
    if(e.isComposing || e.keyCode === 229) return;
    /* コマンドパレット表示中の操作 */
    if(_cmdPaletteEl && _cmdPaletteEl.style.display !== "none" && _cmdPaletteFiltered.length){
      if(e.key === "ArrowDown"){ e.preventDefault(); _cmdPaletteIdx = (_cmdPaletteIdx + 1) % _cmdPaletteFiltered.length; _renderCmdPaletteActive(); return; }
      if(e.key === "ArrowUp"){ e.preventDefault(); _cmdPaletteIdx = (_cmdPaletteIdx - 1 + _cmdPaletteFiltered.length) % _cmdPaletteFiltered.length; _renderCmdPaletteActive(); return; }
      if(e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)){
        e.preventDefault();
        _selectCmdPaletteItem();
        return;
      }
      if(e.key === "Escape"){ e.preventDefault(); _hideCmdPalette(); return; }
    }
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();startGeneration();}
  });

  /* ── ステア（生成中の追加指示） ── */
  var steerEl = shadow.getElementById("sedeSteer");
  var steerInput = shadow.getElementById("sedeSteerInput");
  var steerSendBtn = shadow.getElementById("sedeSteerSend");
  function _showSteer(){ if(steerEl) steerEl.classList.add("is-active"); }
  function _hideSteer(){ if(steerEl) steerEl.classList.remove("is-active"); if(steerInput) steerInput.value = ""; }
  function _submitSteer(){
    if(!steerInput) return;
    var t = steerInput.value.trim();
    if(!t) return;
    steerInput.value = "";
    /* チャットに ↪ 付きで表示 */
    var steerDiv = document.createElement("div");
    steerDiv.className = "chat-msg is-user";
    steerDiv.innerHTML = '<div class="chat-role" style="display:flex;align-items:center;gap:4px;"><span class="ms" style="font-size:16px;color:var(--accent);">reply</span> Steer</div>'
      + '<div class="chat-bubble-user" style="background:var(--accent-light);color:var(--text);border:1px solid rgba(99,102,241,.15);">' + md(t) + '</div>';
    chatList.appendChild(steerDiv);
    chatPane.scrollTop = chatPane.scrollHeight;
    /* ログにも表示 */
    addTool("reply", "Steer: " + t.slice(0,80));
    /* エージェントにステアを渡す */
    if(window._sede) window._sede.pendingSteer = t;
    /* セッションに保存 */
    _saveToSession({ role:"steer", text:t, ts:Date.now() });
  }
  if(steerSendBtn) steerSendBtn.addEventListener("click", _submitSteer);
  if(steerInput) steerInput.addEventListener("keydown", function(e){
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); _submitSteer(); }
  });

  /* ── 停止ボタン: 生成/修正を中断（完全版） ── */
  var stopBtn = shadow.getElementById("sedeStopBtn");
  if(stopBtn){
    stopBtn.addEventListener("click", function(){
      try {
        /* 1. グローバル停止フラグ */
        window._sedeStopRequested = true;
        if(window._sede){
          window._sede.stopRequested = true;
          /* fetch AbortController */
          if(window._sede.abortController && typeof window._sede.abortController.abort === "function"){
            try { window._sede.abortController.abort(); } catch(e){}
          }
          window._sede.agentRunning = false;
          window._sede.processing = false;
          window._sede.pendingSteer = null;
        }

        /* 2. MutationObserver も止める */
        try {
          if(typeof _statusLogObs !== "undefined" && _statusLogObs && typeof _statusLogObs.disconnect === "function"){
            _statusLogObs.disconnect();
          }
        } catch(e){}

        /* 3. 既存の sede タイマーを個別にクリア */
        try {
          if(window._sedeFixTimerInterval){ clearInterval(window._sedeFixTimerInterval); window._sedeFixTimerInterval = null; }
          if(window._sedeFixSpinnerTimer){ clearInterval(window._sedeFixSpinnerTimer); window._sedeFixSpinnerTimer = null; }
          if(window._sedeCreateSpinnerTimer){ clearInterval(window._sedeCreateSpinnerTimer); window._sedeCreateSpinnerTimer = null; }
        } catch(e){}

        /* 4. スピナー・インジケータ削除 */
        var _gi = shadow.getElementById("sedeChatGenIndicator"); if(_gi) _gi.remove();
        var _oldSp = document.getElementById("sedeFixV2Spinner"); if(_oldSp) _oldSp.remove();
        var _agentSp = document.getElementById("sedeAgentSpinner"); if(_agentSp) _agentSp.remove();

        /* 5. ログヘッダー更新 */
        var _genHdr = shadow.querySelector("#sedeLogGenHeader .log-gen-sub");
        if(_genHdr) _genHdr.textContent = "停止済み";
        var _spinIcon = shadow.getElementById("sedeLogGenSpinner");
        if(_spinIcon) _spinIcon.classList.add("is-done");

        /* 6. 停止メッセージ */
        if(typeof addTool === "function") addTool("stop_circle", "ユーザーが停止しました");
        if(typeof addChatMsg === "function") addChatMsg("ai", "⏸ 生成/修正を停止しました。現在のコードは保持されています。");

        /* 7. UI 戻す */
        _generating = false;
        _hideSteer();

        /* 8. 5秒後にフラグ解除（次回生成を可能に） */
        setTimeout(function(){
          window._sedeStopRequested = false;
          if(window._sede) window._sede.stopRequested = false;
        }, 5000);

      } catch(e) { console.warn("[Stop] error:", e); }
    });
  }

  function startGeneration(){ try{
    var text = input.value.trim();
    if(!text || _generating) return;

    /* ── スラッシュコマンド処理（旧Sedeのロジックを流用） ── */
    var _slashMatch = text.match(/^\/(\w+)(?:\s+(.*))?$/);
    if(_slashMatch){
      var _cmd = _slashMatch[1].toLowerCase();
      var _args = (_slashMatch[2] || "").trim();
      var _latest = (window._sede && window._sede.codeHistory && window._sede.codeHistory.length) ? window._sede.codeHistory[window._sede.codeHistory.length-1] : null;

      if(_cmd === "run"){
        input.value = "";
        addChatMsg("user", text);
        if(!_latest){ addChatMsg("ai", "\u5B9F\u884C\u3059\u308B\u30B3\u30FC\u30C9\u304C\u3042\u308A\u307E\u305B\u3093\u3002"); return; }
        addTool("play_arrow", "\u30B3\u30FC\u30C9\u3092\u5B9F\u884C\u4E2D...");
        try {
          var frame = shadow.querySelector(".preview-frame");
          if(_latest.lang === "html" || /<html/i.test(_latest.code)){
            if(frame) frame.srcdoc = _latest.code;
            addToolOk("check_circle", "\u30D7\u30EC\u30D3\u30E5\u30FC\u3067\u5B9F\u884C\u3057\u307E\u3057\u305F");
          } else {
            addChatMsg("ai", "HTML\u4EE5\u5916\u306E\u8A00\u8A9E\u306F\u73FE\u5728\u30D7\u30EC\u30D3\u30E5\u30FC\u5B9F\u884C\u672A\u5BFE\u5FDC\u3002`/deploy`\u3067\u516C\u958B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
          }
        } catch(e){ addTool("error", "\u5B9F\u884C\u30A8\u30E9\u30FC: " + (e.message||e)); }
        return;
      }
      if(_cmd === "preview"){
        input.value = "";
        addChatMsg("user", text);
        if(!_latest){ addChatMsg("ai", "\u30D7\u30EC\u30D3\u30E5\u30FC\u3059\u308B\u30B3\u30FC\u30C9\u304C\u3042\u308A\u307E\u305B\u3093\u3002"); return; }
        addTool("visibility", "\u5168\u753B\u9762\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u958B\u304D\u307E\u3059...");
        if(typeof _openFullPreview === "function") _openFullPreview("pc");
        else if(typeof window._sedeOpenPreview === "function") window._sedeOpenPreview(_latest.code, _latest.lang || "html", "pc");
        return;
      }
      if(_cmd === "deploy"){
        input.value = "";
        addChatMsg("user", text);
        if(!_latest){ addChatMsg("ai", "\u30C7\u30D7\u30ED\u30A4\u3059\u308B\u30B3\u30FC\u30C9\u304C\u3042\u308A\u307E\u305B\u3093\u3002"); return; }
        _showDeployDialog(_latest);
        return;
      }
      if(_cmd === "help"){
        input.value = "";
        addChatMsg("user", text);
        addChatMsg("ai", "\u5229\u7528\u53EF\u80FD\u306A\u30B3\u30DE\u30F3\u30C9:\n- `/run` \u2014 \u73FE\u5728\u306E\u30B3\u30FC\u30C9\u3092\u30D7\u30EC\u30D3\u30E5\u30FC\u3067\u5B9F\u884C\n- `/preview` \u2014 \u5168\u753B\u9762\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u958B\u304F\n- `/deploy` \u2014 Cloudflare Pages\u306B\u30C7\u30D7\u30ED\u30A4\n- `/help` \u2014 \u3053\u306E\u30D8\u30EB\u30D7");
        return;
      }
      /* 未知のコマンドは通常プロンプトとして処理 */
    }

    _generating = true;

    /* 新しい生成/修正のたびにログ重複キャッシュをリセット */
    if(typeof _logResetDedup === "function") _logResetDedup();

    _showRight();
    welcomePane.style.display = "none";
    chatPane.style.display = "block";
    input.value = "";

    addChatMsg("user", text);
    _showSteer();

    var userMsg = text;

    /* 生成 or 修正の判定 */
    var _isFixMode = window._sede && window._sede.codeHistory && window._sede.codeHistory.length > 0;
    var _modeLabel = _isFixMode ? "\u4FEE\u6B63\u4E2D" : "\u751F\u6210\u4E2D";

    /* ── タイトル: 修正時は既存タイトル維持、新規時のみAI生成 ── */
    var _existingTitle = "";
    if(window._sedeState){
      var _ts = window._sedeState.sessions.find(function(x){ return x.id === window._sedeState.activeId; });
      if(_ts) _existingTitle = _ts.title || "";
    }
    var _autoTitle = _isFixMode ? "\u51E6\u7406\u3092\u6E96\u5099\u4E2D" : (userMsg.length > 40 ? userMsg.slice(0,40)+"..." : userMsg);

    /* AI要約タイトル: 生成モードでも修正モードでも実行 */
    (function(){
      var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
      var _prompt = _isFixMode
        ? "\u4EE5\u4E0B\u306F\u65E2\u5B58\u30B3\u30FC\u30C9\u3078\u306E\u4FEE\u6B63\u6307\u793A\u3067\u3059\u3002\u3069\u3093\u306A\u4FEE\u6B63\u3092\u884C\u3046\u304B\u3092\u65E5\u672C\u8A9E\u3067\u4E00\u884C10\u6587\u5B57\u4EE5\u5185\u306E\u30BF\u30A4\u30C8\u30EB\u306B\u8981\u7D04\u3002\u8AAC\u660E\u4E0D\u8981\u3001\u30BF\u30A4\u30C8\u30EB\u306E\u307F\u3002\u4F8B:\u300CAI\u5BFE\u6226\u8FFD\u52A0\u300D\u300C\u8272\u5909\u66F4\u300D\u300C\u30D0\u30B0\u4FEE\u6B63\u300D\n\n" + userMsg
        : "\u4EE5\u4E0B\u306F\u65B0\u898F\u30A2\u30D7\u30EA\u306E\u751F\u6210\u30EA\u30AF\u30A8\u30B9\u30C8\u3067\u3059\u3002\u30A2\u30D7\u30EA\u306E\u540D\u524D\u3092\u65E5\u672C\u8A9E\u3067\u4E00\u884C10\u6587\u5B57\u4EE5\u5185\u3067\u751F\u6210\u3002\u8AAC\u660E\u4E0D\u8981\u3001\u30BF\u30A4\u30C8\u30EB\u306E\u307F\u3002\n\n" + userMsg;
      fetch(base + "/api/chat/workers", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages:[{role:"user",content:_prompt}], max_tokens:30 })
      }).then(function(r){return r.json();}).then(function(d){
        var t = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || "").trim().replace(/[「」"'"']/g,"").replace(/^(タイトル|要約)[:：]\s*/,"");
        if(t && t.length > 0 && t.length < 30){
          _autoTitle = t;
          var hdr = shadow.querySelector("#sedeLogGenHeader .log-gen-prompt");
          if(hdr) hdr.textContent = _autoTitle;
          var _lbl = shadow.getElementById("sedeChatGenLabel");
          if(_lbl) _lbl.textContent = _autoTitle + " " + _modeLabel;
          /* 生成モードのみセッション名も更新（修正時は既存タイトル保持） */
          if(!_isFixMode && window._sedeState){
            var ses = window._sedeState.sessions.find(function(x){ return x.id === window._sedeState.activeId; });
            if(ses){ ses.title = _autoTitle; if(typeof window._sedeSaveSessions === "function") window._sedeSaveSessions(); loadSessionsToShadow(); }
          }
        }
      }).catch(function(){});
    })();

    /* ── チャット内ログインジケーター（ラベルがログと連動） ── */
    var genIndicator = document.createElement("div");
    genIndicator.className = "chat-gen-indicator";
    genIndicator.id = "sedeChatGenIndicator";
    genIndicator.innerHTML = '<div class="chat-gen-spinner-mini"></div>'
      + '<span class="chat-gen-label" id="sedeChatGenLabel">' + esc(_autoTitle) + ' ' + _modeLabel + '</span>'
      + '<span class="chat-gen-toggle" style="cursor:pointer;"><span class="ms">chevron_right</span></span>';
    genIndicator.style.cursor = "pointer";
    genIndicator.onclick = function(){ toggleRight(); };
    chatList.appendChild(genIndicator);
    /* 新規生成開始時は強制下スクロール */
    if(typeof _forceScrollToBottom === "function") _forceScrollToBottom();
    else chatPane.scrollTop = chatPane.scrollHeight;

    logsScroll.innerHTML = "";

    /* Generation header */
    var genHeader = shadow.getElementById("sedeLogGenHeader");
    genHeader.innerHTML = '<div class="log-gen-spinner" id="sedeLogGenSpinner"></div>'
      + '<div class="log-gen-info"><div class="log-gen-prompt">'+esc(_autoTitle)+'</div><div class="log-gen-sub">'+_modeLabel+'...</div></div>'
      + '<div class="log-gen-timer" id="sedeLogGenTimerWrap"><span class="ms">timer</span><span id="sedeLogGenTimer">0分00秒</span></div>';
    genHeader.style.display = "flex";

    /* Stopwatch */
    var _timerStart = Date.now();
    var _timerInterval = setInterval(function(){
      var elapsed = Math.floor((Date.now() - _timerStart) / 1000);
      var m = Math.floor(elapsed / 60);
      var s = elapsed % 60;
      var timerEl = shadow.getElementById("sedeLogGenTimer");
      if(timerEl) timerEl.textContent = m + "分" + String(s).padStart(2,"0") + "秒";
    }, 1000);

    /* Activate logs tab */
    shadow.querySelectorAll(".right-tab").forEach(function(t){ t.classList.remove("is-active"); });
    shadow.querySelector('[data-right-tab="logs"]').classList.add("is-active");
    shadow.querySelectorAll(".right-panel").forEach(function(p){ p.classList.remove("is-active"); });
    shadow.querySelector('[data-panel="logs"]').classList.add("is-active");

    /* ═══ 旧Sedeの仕組みをそのまま使う ═══ */
    /* 元のSedeモードを確実に有効化 */
    var origShell = document.getElementById("appAiChatShell");
    if(origShell && origShell.getAttribute("data-chat-mode") !== "sede"){
      origShell.setAttribute("data-chat-mode", "sede");
      if(typeof window._sedeLoadSessions === "function") window._sedeLoadSessions();
    }

    /* MutationObserver: 元Sedeのログパネル → Shadow DOMにミラー */
    var origLogBody = document.getElementById("sedeLogPanelBody");
    if(origLogBody){
      origLogBody.innerHTML = "";
      var _logObs = new MutationObserver(function(muts){
        muts.forEach(function(m){
          m.addedNodes.forEach(function(node){
            if(!node.textContent || node.nodeType !== 1) return;
            var t = node.textContent.trim();
            if(!t) return;
            if(node.classList && (node.classList.contains("sede-log-chat-item") || node.classList.contains("sede-log-chat"))){
              var body = node.querySelector(".sede-log-chat-body");
              addAIChat(body ? body.innerHTML : t.slice(0,200));
            } else if(node.classList && node.classList.contains("sede-oplog-item")){
              var lt = node.querySelector(".sede-oplog-text");
              var raw = lt ? lt.textContent.trim() : t;
              if(raw.includes("check_circle")||raw.includes("\u5B8C\u4E86")||raw.includes("\u2705")) addToolOk("check_circle", raw.replace(/check_circle|\u2705/g,"").trim().slice(0,120));
              else if(raw.includes("warning")||raw.includes("\u30A8\u30E9\u30FC\u691C\u51FA")||raw.includes("\u26A0")) addTool("warning", raw.replace(/warning|\u26A0/g,"").trim().slice(0,120));
              else addTool("info", raw.replace(/search|code|edit|visibility|info|build|description/g,"").trim().slice(0,120));
            } else {
              if(t.length > 3) addTool("info", t.slice(0,120));
            }
            logsScroll.scrollTop = logsScroll.scrollHeight;
          });
        });
      });
      _logObs.observe(origLogBody, {childList:true, subtree:true});
    }

    /* 旧Sedeの _sedeAgentRun を呼ぶ */
    if(window._sede){ window._sede.agentRunning = false; window._sede.processing = false; }
    /* 新規セッション（ユーザーメッセージ0件）の場合のみ codeHistory クリア */
    if(window._sede && window._sedeState){
      var _curSes = window._sedeState.sessions.find(function(x){ return x.id === window._sedeState.activeId; });
      var _userMsgCount = _curSes ? (_curSes.messages || []).filter(function(m){ return m.role === "user"; }).length : 0;
      if(_userMsgCount === 0){
        window._sede.codeHistory = [];
      }
      /* currentCode があるのに codeHistory が空なら復元 */
      if(_curSes && _curSes.currentCode && _curSes.currentCode.code && (!window._sede.codeHistory || !window._sede.codeHistory.length)){
        window._sede.codeHistory = [{ lang: _curSes.currentCode.lang || "html", filename: _curSes.currentCode.filename || "app.html", code: _curSes.currentCode.code }];
      }
    }
    if(typeof window._sedeAgentRun === "function"){
      Promise.resolve(window._sedeAgentRun(text)).catch(function(err){
        console.error("[Sede] agentRun error:", err);
        addChatMsg("ai", "\u30A8\u30E9\u30FC: " + (err.message || String(err)));
        addTool("error", "agentRun error: " + (err.message || String(err)));
        _generating = false;
        var gi = shadow.getElementById("sedeChatGenIndicator"); if(gi) gi.remove();
      });
    } else {
      addChatMsg("ai", "_sedeAgentRun\u304C\u5B58\u5728\u3057\u307E\u305B\u3093\u3002\u30EA\u30ED\u30FC\u30C9\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      addTool("error", "_sedeAgentRun not found");
      _generating = false;
    }

    /* ── イベント駆動AIステータス: ログ更新のたびに一行テキストを変える ── */
    var _aiStatusBusy = false;
    var _aiStatusLastChangeAt = 0;
    var _aiStatusDebounceTimer = null;
    var _statusTemplates = [
      "\u5206\u6790\u4E2D...", "\u51E6\u7406\u4E2D...", "\u4F5C\u696D\u4E2D...", "\u8003\u3048\u3066\u3044\u307E\u3059...",
      "\u914D\u7F6E\u3092\u8ABF\u6574\u4E2D...", "\u6700\u9069\u5316\u4E2D...", "\u691C\u8A3C\u4E2D...", "\u69CB\u6210\u3092\u8ABF\u3079\u3066\u3044\u307E\u3059...",
      "\u30B3\u30FC\u30C9\u3092\u5206\u6790\u4E2D...", "\u90E8\u54C1\u3092\u7D44\u307F\u7ACB\u3066\u4E2D...", "\u5F85\u6A5F\u4E2D..."
    ];
    function _pickTemplate(){
      return _statusTemplates[Math.floor(Math.random() * _statusTemplates.length)];
    }
    function _setStatusLabel(text){
      var _lbl = shadow.getElementById("sedeChatGenLabel");
      if(_lbl && text) _lbl.textContent = text;
      _aiStatusLastChangeAt = Date.now();
    }
    function _triggerStatusUpdate(){
      /* 連続更新防止: 最低 800ms は間隔を空ける */
      if(Date.now() - _aiStatusLastChangeAt < 800) return;
      if(_aiStatusBusy) return;
      /* 20% の確率でテンプレート（不定期に織り交ぜる） */
      if(Math.random() < 0.20){
        _setStatusLabel(_pickTemplate());
        return;
      }
      /* 右ペインログから直近2〜3行を取得してAI要約 */
      var _logEls = logsScroll ? logsScroll.querySelectorAll(".log-tool, .log-ai") : [];
      if(!_logEls || !_logEls.length){
        _setStatusLabel(_pickTemplate());
        return;
      }
      var _recentLogs = [];
      for(var _li = Math.max(0, _logEls.length - 3); _li < _logEls.length; _li++){
        var _lt = (_logEls[_li].textContent || "").trim().replace(/\s+/g," ").slice(0,100);
        if(_lt && _lt.length > 3) _recentLogs.push(_lt);
      }
      if(!_recentLogs.length){
        _setStatusLabel(_pickTemplate());
        return;
      }
      _aiStatusBusy = true;
      var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
      fetch(base + "/api/chat/workers", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          messages:[{ role:"user", content:"\u4EE5\u4E0B\u306FAI\u30B3\u30FC\u30C7\u30A3\u30F3\u30B0\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u306E\u4F5C\u696D\u30ED\u30B0\u3067\u3059\u3002\u4ECA\u9032\u884C\u4E2D\u306E\u4F5C\u696D\u3092\u65E5\u672C\u8A9E\u3067\u300C\u30FB\u30FB\u30FB\u4E2D...\u300D\u5F62\u5F0F\u306E15\u6587\u5B57\u4EE5\u5185\u306E\u4E00\u884C\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u30BF\u30A4\u30C8\u30EB\u3084\u524D\u7F6E\u304D\u306F\u4E0D\u8981\u3002\u8AAC\u660E\u4E0D\u8981\u3001\u4E00\u884C\u306E\u307F\u3002\n\n\u4F8B:\n\u30ED\u30B0: \u300Cwrite file: index.html (523\u884C)\u300D \u2192 \u300C\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u8FBC\u307F\u4E2D...\u300D\n\u30ED\u30B0: \u300Cgrep: button (12\u4EF6)\u300D \u2192 \u300C\u30DC\u30BF\u30F3\u3092\u691C\u7D22\u4E2D...\u300D\n\u30ED\u30B0: \u300Cedit: L245 (ok)\u300D \u2192 \u300C\u30B3\u30FC\u30C9\u3092\u7F6E\u63DB\u4E2D...\u300D\n\n\u30ED\u30B0:\n" + _recentLogs.join("\n") }],
          max_tokens: 25
        })
      }).then(function(r){return r.json();}).then(function(d){
        var t = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || "").trim().replace(/[「」"'"'\n\r]/g,"").replace(/^(タイトル|要約|答え|回答)[:：]\s*/,"").slice(0,30);
        if(t && t.length > 3) _setStatusLabel(t);
        else _setStatusLabel(_pickTemplate());
      }).catch(function(){ _setStatusLabel(_pickTemplate()); }).finally(function(){ _aiStatusBusy = false; });
    }
    /* 初期値: テンプレート */
    setTimeout(function(){ _setStatusLabel(_pickTemplate()); }, 300);
    /* logsScroll の変更を監視 */
    var _statusLogObs = null;
    if(logsScroll){
      _statusLogObs = new MutationObserver(function(){
        /* デバウンス: 連続追加時は最後の1回だけ */
        if(_aiStatusDebounceTimer) clearTimeout(_aiStatusDebounceTimer);
        _aiStatusDebounceTimer = setTimeout(_triggerStatusUpdate, 400 + Math.random() * 600);
      });
      _statusLogObs.observe(logsScroll, { childList: true });
    }

    /* 完了監視: _sede.agentRunning がfalseになったら完了処理 */
    var _checkDone = setInterval(function(){
      /* コードをリアルタイムでエディタに反映 */
      var _curBlock = (window._sede && window._sede.codeHistory && window._sede.codeHistory.length) ? window._sede.codeHistory[window._sede.codeHistory.length - 1] : null;
      if(_curBlock && _curBlock.code){
        var cv = shadow.getElementById("sedeCodeView");
        var ci = shadow.getElementById("sedeCodeInfo");
        var _cl = _curBlock.code.split("\n").length;
        if(cv && cv._lastLen !== _curBlock.code.length){
          cv._lastLen = _curBlock.code.length;
          cv.innerHTML = _buildCodeHtml(_curBlock.code);
        }
        if(ci) ci.textContent = (_curBlock.lang||"html").toUpperCase() + " \u2022 " + _cl + "\u884C";
      }

      if(window._sede && !window._sede.agentRunning && !window._sede.processing){
        clearInterval(_checkDone);
        clearInterval(_timerInterval);
        if(_statusLogObs){ _statusLogObs.disconnect(); _statusLogObs = null; }
        if(_aiStatusDebounceTimer){ clearTimeout(_aiStatusDebounceTimer); _aiStatusDebounceTimer = null; }
        _generating = false;

        var _gi = shadow.getElementById("sedeChatGenIndicator"); if(_gi) _gi.remove();
        var _block = _curBlock;
        var _lines = _block ? (_block.code || "").split("\n").length : 0;

        /* ログヘッダー完了表示 */
        var _spinEl = shadow.getElementById("sedeLogGenSpinner"); if(_spinEl) _spinEl.classList.add("is-done");
        var _genSub = shadow.querySelector("#sedeLogGenHeader .log-gen-sub"); if(_genSub) _genSub.textContent = "\u5B8C\u4E86 \u2014 " + _lines + "\u884C";

        /* プレビュー自動読み込み */
        if(_block && _block.code) _loadPreview(_block.code, _block.lang || "html");

        /* コードをセッションに永続保存（リロード対応） */
        if(_block && _block.code && window._sedeState){
          var _saveSes = window._sedeState.sessions.find(function(x){ return x.id === window._sedeState.activeId; });
          if(_saveSes){
            _saveSes.currentCode = { lang: _block.lang || "html", filename: _block.filename || "app.html", code: _block.code };
            _saveSes.updatedAt = Date.now();
            if(typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
          }
        }

        _hideSteer();
        /* 完了メッセージ */
        var _doneLabel = _isFixMode ? "\u4FEE\u6B63\u5B8C\u4E86" : "\u751F\u6210\u5B8C\u4E86";
        addChatMsg("ai", "\u2705 " + _doneLabel + "\uFF08" + _lines + "\u884C\uFF09");
        chatPane.scrollTop = chatPane.scrollHeight;
      }
    }, 500);

  }catch(e){ alert("Error: "+e.message); console.error(e); _generating=false; }}

  /* ── セッションへの保存ヘルパー ── */
  function _saveToSession(entry){
    if(!window._sedeState) return;
    var ses = window._sedeState.sessions.find(function(x){ return x.id === window._sedeState.activeId; });
    if(!ses) return;
    if(!ses.messages) ses.messages = [];
    ses.messages.push(entry);
    ses.updatedAt = Date.now();
    /* 最大200件に制限 */
    if(ses.messages.length > 200) ses.messages = ses.messages.slice(-200);
    if(typeof window._sedeSaveSessions === "function") window._sedeSaveSessions();
  }

  /* ── Chat helpers ── */
  function addChatMsg(role, text, skipSave){
    /* 停止中は AI メッセージだけブロック（ユーザーメッセージ・停止通知は通す） */
    if(window._sedeStopRequested && role === "ai" && !(text||"").includes("停止")) return;
    /* 会話ログも重複防止（生成/修正中のみ有効、skipSave=true の復元時はスキップしない） */
    if(!skipSave && _logIsDup("chat:" + role + "|" + (text||"").slice(0,200))) return;
    var div = document.createElement("div");
    div.className = "chat-msg" + (role==="user"?" is-user":"");
    var roleEl = document.createElement("div");
    roleEl.className = "chat-role";
    roleEl.textContent = role==="user"?"You":"Sede";
    div.appendChild(roleEl);
    var bubble = document.createElement("div");
    bubble.className = role==="user"?"chat-bubble-user":"chat-bubble-ai";
    bubble.innerHTML = md(text);
    div.appendChild(bubble);
    chatList.appendChild(div);
    /* スマートスクロール: ユーザーがスクロール上げてる場合は強制追従せず、ボタン表示 */
    if(typeof _smartScrollToBottom === "function") _smartScrollToBottom();
    else chatPane.scrollTop = chatPane.scrollHeight;
    if(!skipSave) _saveToSession({ role:role, text:text, ts:Date.now() });
  }

  /* ── ログ重複防止: 直近30件の指紋を記録、同じなら追加しない ── */
  var _logSeen = new Set();
  var _logSeenOrder = [];
  function _logIsDup(key){
    if(_logSeen.has(key)) return true;
    _logSeen.add(key);
    _logSeenOrder.push(key);
    /* 30件超えたら古いのを削除 */
    while(_logSeenOrder.length > 30){
      var _old = _logSeenOrder.shift();
      _logSeen.delete(_old);
    }
    return false;
  }
  function _logResetDedup(){ _logSeen.clear(); _logSeenOrder = []; }
  window._sedeLogResetDedup = _logResetDedup;

  /* ── Log helpers ── */
  function addTool(icon, text, skipSave){
    /* 停止中は追加ログ無視（停止ログ自体は icon==="stop_circle" で許可） */
    if(window._sedeStopRequested && icon !== "stop_circle") return;
    if(_logIsDup("tool:" + icon + "|" + text)) return;
    var div = document.createElement("div");
    div.className = "log-tool";
    div.innerHTML = '<span class="ms">'+icon+'</span> '+text;
    logsScroll.appendChild(div);
    /* ログはセッションに保存しない（容量節約） */
  }
  function addToolOk(icon, text, skipSave){
    if(window._sedeStopRequested) return;
    if(_logIsDup("ok:" + icon + "|" + text)) return;
    var div = document.createElement("div");
    div.className = "log-tool";
    div.innerHTML = '<span class="ms is-ok">'+icon+'</span> <span style="color:var(--success);font-weight:600;">'+text+'</span>';
    logsScroll.appendChild(div);
  }
  function addAIChat(text, skipSave){
    if(window._sedeStopRequested) return;
    if(_logIsDup("aichat:" + (text||"").slice(0,120))) return;
    var div = document.createElement("div");
    div.className = "log-ai";
    div.innerHTML = '<div class="log-ai-header"><span class="ms">chat</span> Sede</div><div class="log-ai-body">'+md(text)+'</div>';
    logsScroll.appendChild(div);
  }
  function addAIChatCode(code){
    var div = document.createElement("div");
    div.className = "log-ai";
    div.innerHTML = '<div class="log-ai-header"><span class="ms">code</span> Code</div><div class="log-ai-body"><pre><code>'+esc(code)+'</code></pre></div>';
    logsScroll.appendChild(div);
  }
  function addDiff(file, add, del, lines){
    var div = document.createElement("div");
    div.className = "log-diff";
    var h = '<div class="log-diff-header"><span class="ms" style="font-size:13px">description</span> <span class="fname">'+file+'</span> <span class="add">+'+add+'</span> <span class="del">-'+del+'</span></div>';
    var b = "";
    lines.forEach(function(l){
      if(l.t==="hunk") b += '<div class="log-diff-line" style="background:rgba(56,139,253,.06)"><div class="log-diff-marker"></div><div class="log-diff-code" style="color:rgba(121,192,255,.6);font-style:italic">'+esc(l.c)+'</div></div>';
      else if(l.t==="add") b += '<div class="log-diff-line is-add"><div class="log-diff-marker">+</div><div class="log-diff-code">'+esc(l.c)+'</div></div>';
      else if(l.t==="del") b += '<div class="log-diff-line is-del"><div class="log-diff-marker">-</div><div class="log-diff-code">'+esc(l.c)+'</div></div>';
    });
    div.innerHTML = h + b;
    logsScroll.appendChild(div);
  }

  function md(t){
    return t.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
      .replace(/`([^`]+)`/g,"<code>$1</code>")
      .replace(/\n- /g,"<br>\u2022 ")
      .replace(/\n/g,"<br>");
  }
  function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function _buildCodeHtml(code){
    var lines = code.split("\n");
    return lines.map(function(line, i){
      return '<div class="code-line"><span class="code-ln">'+(i+1)+'</span><span class="code-cd">'+esc(line||" ")+'</span></div>';
    }).join("");
  }

  /* ══════════════════════════════════════════
     機能接続: テンプレートカード
     ══════════════════════════════════════════ */
  shadow.querySelectorAll(".tmpl-card").forEach(function(card){
    card.addEventListener("click", function(){
      var name = card.querySelector(".tmpl-name");
      if(!name) return;
      var label = name.textContent.trim();
      /* SEDE_TEMPLATESから詳細プロンプトを取得 */
      var tmpl = (window.SEDE_TEMPLATES || []).find(function(t){ return t.title === label; });
      var prompt = tmpl ? tmpl.prompt : label + "アプリを作って";
      input.value = prompt;
      startGeneration();
    });
  });

  /* ══════════════════════════════════════════
     機能接続: トップバーアクションボタン
     ══════════════════════════════════════════ */
  shadow.querySelectorAll(".topbar-btn").forEach(function(btn){
    var tip = btn.getAttribute("data-tip");
    if(!tip) return;
    btn.addEventListener("click", function(){
      var block = (window._sede && window._sede.codeHistory && window._sede.codeHistory.length)
        ? window._sede.codeHistory[window._sede.codeHistory.length - 1] : null;

      if(tip === "Run" || tip === "Preview"){
        _openFullPreview("pc");
      }
      else if(tip === "Mobile"){
        _openFullPreview("mobile");
      }
      else if(tip === "Console"){
        /* ターミナルタブを開く */
        _showRight();
        shadow.querySelectorAll(".right-tab").forEach(function(t){ t.classList.remove("is-active"); });
        shadow.querySelector('[data-right-tab="terminal"]').classList.add("is-active");
        shadow.querySelectorAll(".right-panel").forEach(function(p){ p.classList.remove("is-active"); });
        shadow.querySelector('[data-panel="terminal"]').classList.add("is-active");
      }
      else if(tip === "Deploy"){
        if(typeof window._sedeDeployToPages === "function"){
          window._sedeDeployToPages();
        } else {
          var origDeploy = document.querySelector('[data-sede-action="deploy"]');
          if(origDeploy) origDeploy.click();
        }
      }
      else if(tip === "Settings"){
        var origSettings = document.querySelector(".app-chat-settings-btn, [data-action='openSettings']");
        if(origSettings) origSettings.click();
        else if(typeof _chatOpenSettingsModal === "function") window._chatOpenSettingsModal();
      }
    });
  });

  /* ══════════════════════════════════════════
     機能接続: エディタツールバーボタン（Copy/Download/Run）
     ══════════════════════════════════════════ */
  shadow.querySelectorAll(".code-toolbar-btn").forEach(function(btn){
    var icon = btn.querySelector(".ms");
    if(!icon) return;
    var action = icon.textContent.trim();
    btn.addEventListener("click", function(){
      var block = (window._sede && window._sede.codeHistory && window._sede.codeHistory.length)
        ? window._sede.codeHistory[window._sede.codeHistory.length - 1] : null;
      if(!block || !block.code) return;

      if(action === "content_copy"){
        /* コピー */
        navigator.clipboard.writeText(block.code).then(function(){
          icon.textContent = "check";
          setTimeout(function(){ icon.textContent = "content_copy"; }, 1500);
        });
      }
      else if(action === "download"){
        /* ダウンロード */
        var ext = (block.lang || "html").toLowerCase();
        var blob = new Blob([block.code], {type:"text/plain"});
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "app." + ext;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      else if(action === "play_arrow"){
        /* プレビュー実行 */
        _showRight();
        shadow.querySelectorAll(".right-tab").forEach(function(t){ t.classList.remove("is-active"); });
        shadow.querySelector('[data-right-tab="preview"]').classList.add("is-active");
        shadow.querySelectorAll(".right-panel").forEach(function(p){ p.classList.remove("is-active"); });
        shadow.querySelector('[data-panel="preview"]').classList.add("is-active");
        _loadPreview(block.code, block.lang || "html");
      }
    });
  });

  /* ══════════════════════════════════════════
     プレビューiframe読み込み
     ══════════════════════════════════════════ */
  function _loadPreview(code, lang){
    /* プレビュー更新時にエラーリストクリア */
    window._sedePreviewErrors = [];
    var frame = shadow.querySelector(".preview-frame");
    if(!frame) return;
    lang = String(lang || "html").toLowerCase();
    var html = "";
    if(lang === "html") html = code;
    else if(lang === "css") html = "<!DOCTYPE html><html><head><style>" + code + "</style></head><body></body></html>";
    else html = "<!DOCTYPE html><html><head></head><body><script>" + code + "<\/script></body></html>";
    /* コンソールキャプチャ注入 */
    var cap = '<script>'
      + 'window.onerror=function(m,s,l){window.parent.postMessage({type:"sede-preview-err",msg:"Error: "+m+" (line "+l+")"},"*");};'
      + 'window.addEventListener("unhandledrejection",function(e){window.parent.postMessage({type:"sede-preview-err",msg:"Promise: "+e.reason},"*");});'
      + '<\/script>';
    var injected = html.replace(/<head>/i, "<head>" + cap);
    if(injected === html) injected = cap + html;
    frame.srcdoc = injected;
  }

  /* ══════════════════════════════════════════
     全画面プレビュー（PC / スマホ切替）
     ══════════════════════════════════════════ */
  function _openFullPreview(mode){
    var block = (window._sede && window._sede.codeHistory && window._sede.codeHistory.length)
      ? window._sede.codeHistory[window._sede.codeHistory.length - 1] : null;
    if(!block || !block.code){ return; }
    /* 既存のオーバーレイがあれば閉じる */
    var old = shadow.querySelector(".fullpreview");
    if(old) old.remove();
    var overlay = document.createElement("div");
    overlay.className = "fullpreview";
    var _mode = mode || "pc";
    overlay.innerHTML = '<div class="fullpreview-bar">'
      + '<span class="fullpreview-title">Preview</span>'
      + '<div class="fullpreview-spacer"></div>'
      + '<button class="fullpreview-btn' + (_mode==="pc"?" is-active":"") + '" data-fp="pc"><span class="ms" style="font-size:16px;">desktop_windows</span> PC</button>'
      + '<button class="fullpreview-btn' + (_mode==="mobile"?" is-active":"") + '" data-fp="mobile"><span class="ms" style="font-size:16px;">smartphone</span> Mobile</button>'
      + '<button class="fullpreview-close"><span class="ms">close</span></button>'
      + '</div>'
      + '<div class="fullpreview-body">'
      + '<iframe class="fullpreview-frame is-' + _mode + '"></iframe>'
      + '</div>';
    shadow.querySelector(".sede").appendChild(overlay);
    /* iframe読み込み */
    var frame = overlay.querySelector(".fullpreview-frame");
    var code = block.code;
    var cap = '<script>window.onerror=function(m,s,l){window.parent.postMessage({type:"sede-preview-err",msg:"Error: "+m+" (line "+l+")"},"*");};<\/script>';
    var injected = code.replace(/<head>/i, "<head>" + cap);
    if(injected === code) injected = cap + code;
    frame.srcdoc = injected;
    /* PC/スマホ切替 */
    overlay.querySelectorAll("[data-fp]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var m = btn.getAttribute("data-fp");
        overlay.querySelectorAll("[data-fp]").forEach(function(b){ b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        frame.className = "fullpreview-frame is-" + m;
      });
    });
    /* 閉じる */
    overlay.querySelector(".fullpreview-close").addEventListener("click", function(){ overlay.remove(); });
  }

  /* プレビューエラー受信 → 変数に保存 + ターミナル表示 */
  if(!window._sedePreviewErrors) window._sedePreviewErrors = [];
  window.addEventListener("message", function(e){
    if(e.data && e.data.type === "sede-preview-err"){
      var msg = e.data.msg || "";
      /* グローバル変数に保存（修正時にAPIに渡される） */
      if(!window._sedePreviewErrors) window._sedePreviewErrors = [];
      window._sedePreviewErrors.push(msg);
      /* 最大20件 */
      if(window._sedePreviewErrors.length > 20) window._sedePreviewErrors = window._sedePreviewErrors.slice(-20);
      /* ターミナルに表示 */
      var termView = shadow.querySelector(".terminal-view");
      if(termView){
        var line = document.createElement("div");
        line.className = "terminal-line is-err";
        line.textContent = msg;
        var prompt = termView.querySelector(".terminal-prompt");
        if(prompt) termView.insertBefore(line, prompt); else termView.appendChild(line);
        termView.scrollTop = termView.scrollHeight;
      }
      /* チャットにもエラー通知（初回のみ） */
      if(window._sedePreviewErrors.length === 1){
        addTool("warning", "Preview error: " + msg.slice(0, 80));
      }
    }
  });

  /* ══════════════════════════════════════════
     機能接続: ターミナル入力
     ══════════════════════════════════════════ */
  /* ── ターミナル: E2B Sandbox直接接続 ── */
  var _termHistory = [], _termHistIdx = -1;
  function _termLog(text, cls){
    var tv = shadow.querySelector(".terminal-view");
    if(!tv) return;
    var line = document.createElement("div");
    line.className = "terminal-line" + (cls ? " " + cls : "");
    line.textContent = text;
    var prompt = tv.querySelector(".terminal-prompt");
    if(prompt) tv.insertBefore(line, prompt); else tv.appendChild(line);
    tv.scrollTop = tv.scrollHeight;
  }
  function _termExec(cmd){
    _termLog("$ " + cmd, "is-cmd");
    var base = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, "") || "https://vocabuquiz-api.rintyblog.workers.dev";
    var hdrs = { "Content-Type": "application/json" };
    try{ var tk = String(localStorage.getItem("app.auth.token.v1") || "").trim(); if(tk) hdrs.Authorization = "Bearer " + tk; }catch(ex){}
    fetch(base + "/api/sede/exec", {
      method: "POST", headers: hdrs,
      body: JSON.stringify({ command: cmd, timeout: 30000 })
    }).then(function(r){ return r.json(); }).then(function(d){
      if(d.stdout) _termLog(d.stdout, "is-ok");
      if(d.stderr) _termLog(d.stderr, "is-err");
      if(d.error) _termLog("Error: " + d.error, "is-err");
      if(!d.stdout && !d.stderr && !d.error) _termLog("(出力なし)", "");
    }).catch(function(err){
      _termLog("Error: " + (err && err.message || "通信エラー"), "is-err");
    });
  }
  /* ターミナル入力: 直接バインド + セッション切替時の再バインド */
  function _bindTermInput(){
    var ti = shadow.querySelector(".terminal-input");
    if(!ti || ti._bound) return;
    ti._bound = true;
    ti.addEventListener("keydown", function(e){
      if(e.key === "ArrowUp"){ e.preventDefault(); if(_termHistIdx < _termHistory.length - 1){ _termHistIdx++; ti.value = _termHistory[_termHistory.length - 1 - _termHistIdx] || ""; } return; }
      if(e.key === "ArrowDown"){ e.preventDefault(); if(_termHistIdx > 0){ _termHistIdx--; ti.value = _termHistory[_termHistory.length - 1 - _termHistIdx] || ""; } else { _termHistIdx = -1; ti.value = ""; } return; }
      if(e.key !== "Enter") return;
      var cmd = ti.value.trim();
      if(!cmd) return;
      _termHistory.push(cmd); _termHistIdx = -1;
      ti.value = "";
      _termExec(cmd);
    });
  }
  _bindTermInput();
  /* セッション切替後にinputが再生成されるので定期的に再バインド */
  setInterval(_bindTermInput, 2000);

  /* ══════════════════════════════════════════
     機能接続: コンポーザーツール（image/code/mic）
     ══════════════════════════════════════════ */
  shadow.querySelectorAll(".composer-tool").forEach(function(btn){
    var action = btn.getAttribute("data-action") || "";
    if(!action){ var icon = btn.querySelector(".ms"); if(icon) action = icon.textContent.trim(); }
    btn.addEventListener("click", function(){
      if(action === "image" || action === "attach"){
        /* 画像アップロード */
        var fi = document.createElement("input");
        fi.type = "file";
        fi.accept = "image/*";
        fi.onchange = function(){
          if(!fi.files || !fi.files[0]) return;
          var file = fi.files[0];
          var reader = new FileReader();
          reader.onload = function(){
            input.value = (input.value ? input.value + "\n" : "") + "[画像添付: " + file.name + "]";
            input.focus();
          };
          reader.readAsDataURL(file);
        };
        fi.click();
      }
      else if(action === "code"){
        /* コード入力モード切替 */
        if(input.rows < 6){
          input.rows = 8;
          input.placeholder = "\u30B3\u30FC\u30C9\u3092\u8CBC\u308A\u4ED8\u3051...";
          input.style.fontFamily = "var(--mono)";
          btn.style.color = "var(--accent)";
        } else {
          input.rows = 2;
          input.placeholder = "\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5165\u529B...";
          input.style.fontFamily = "";
          btn.style.color = "";
        }
      }
      else if(action === "mic"){
        /* 音声入力 */
        if(typeof window._sedeVoiceToggle === "function"){
          window._sedeVoiceToggle();
        } else if("webkitSpeechRecognition" in window || "SpeechRecognition" in window){
          var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
          var rec = new SR();
          rec.lang = "ja-JP";
          rec.continuous = false;
          rec.interimResults = false;
          btn.style.color = "var(--danger)";
          rec.onresult = function(ev){
            var t = ev.results[0][0].transcript;
            input.value = (input.value ? input.value + " " : "") + t;
            btn.style.color = "";
          };
          rec.onerror = function(){ btn.style.color = ""; };
          rec.onend = function(){ btn.style.color = ""; };
          rec.start();
        }
      }
    });
  });

  /* ══════════════════════════════════════════
     機能接続: Centerタブ Code → コード表示
     ══════════════════════════════════════════ */
  shadow.querySelectorAll("[data-center-tab]").forEach(function(tab){
    tab.addEventListener("click", function(){
      var which = tab.getAttribute("data-center-tab");
      if(which === "code"){
        /* コードタブ: 右ペインのEditorを中央に表示する代わりに、右ペインを開いてEditorタブに */
        _showRight();
        shadow.querySelectorAll(".right-tab").forEach(function(t){ t.classList.remove("is-active"); });
        shadow.querySelector('[data-right-tab="editor"]').classList.add("is-active");
        shadow.querySelectorAll(".right-panel").forEach(function(p){ p.classList.remove("is-active"); });
        shadow.querySelector('[data-panel="editor"]').classList.add("is-active");
      } else if(which === "chat"){
        /* チャットタブ: 右ペインを閉じる */
        _hideRight();
      }
    });
  });

  /* ══════════════════════════════════════════
     生成完了時: プレビュー自動更新 + Editorファイル名更新
     ══════════════════════════════════════════ */
  var _prevCodeLen = 0;
  setInterval(function(){
    var block = (window._sede && window._sede.codeHistory && window._sede.codeHistory.length)
      ? window._sede.codeHistory[window._sede.codeHistory.length - 1] : null;
    if(!block || !block.code) return;
    var len = block.code.length;
    if(len === _prevCodeLen) return;
    _prevCodeLen = len;

    /* Editorコード更新 */
    var codeView = shadow.getElementById("sedeCodeView");
    var codeInfo = shadow.getElementById("sedeCodeInfo");
    if(codeView){
      codeView.innerHTML = _buildCodeHtml(block.code);
    }
    if(codeInfo){
      var lang = (block.lang || "html").toUpperCase();
      codeInfo.textContent = lang + " \u2022 " + block.code.split("\n").length + "\u884C";
    }

    /* ファイル名更新 */
    var fname = shadow.querySelector(".code-toolbar-file .ms + span, .code-toolbar span:first-child");
    /* Preview iframe自動更新 */
    var previewPanel = shadow.querySelector('[data-panel="preview"]');
    if(previewPanel && previewPanel.classList.contains("is-active")){
      _loadPreview(block.code, block.lang || "html");
    }
  }, 1500);
})();
