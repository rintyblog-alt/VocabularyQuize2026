var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@myriaddreamin/typst.ts/dist/esm/options.init.mjs
function disableDefaultFontAssets() {
  return loadFonts([], { assets: false });
}
function preloadFontAssets(options) {
  return loadFonts([], options);
}
function _resolveAssets(options) {
  const fonts = [];
  if (options && options?.assets !== false && options?.assets?.length && options?.assets?.length > 0) {
    let defaultPrefix = {
      text: "https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.13.1/files/fonts/",
      _: "https://cdn.jsdelivr.net/gh/typst/typst-dev-assets@v0.13.1/files/fonts/"
    };
    let assetUrlPrefix = options.assetUrlPrefix ?? defaultPrefix;
    if (typeof assetUrlPrefix === "string") {
      assetUrlPrefix = { _: assetUrlPrefix };
    } else {
      assetUrlPrefix = { ...defaultPrefix, ...assetUrlPrefix };
    }
    for (const key of Object.keys(assetUrlPrefix)) {
      const u = assetUrlPrefix[key];
      if (u[u.length - 1] !== "/") {
        assetUrlPrefix[key] = u + "/";
      }
    }
    const prefix = (asset, f) => f.map((font) => (assetUrlPrefix[asset] || assetUrlPrefix["_"]) + font);
    for (const asset of options.assets) {
      switch (asset) {
        case "text":
          fonts.push(...prefix(asset, _textFonts));
          break;
        case "cjk":
          fonts.push(...prefix(asset, _cjkFonts));
          break;
        case "emoji":
          fonts.push(...prefix(asset, _emojiFonts));
          break;
      }
    }
  }
  return fonts;
}
function preloadRemoteFonts(userFonts, options) {
  return loadFonts(userFonts, options);
}
function loadFonts(userFonts, options) {
  const assetFonts = _resolveAssets(options);
  const loader = async (_, { ref, builder }) => {
    if (options?.fetcher) {
      ref.setFetcher(options.fetcher);
    }
    await ref.loadFonts(builder, [...userFonts, ...assetFonts]);
  };
  loader._preloadRemoteFontOptions = options;
  loader._kind = "fontLoader";
  return loader;
}
function withPackageRegistry(packageRegistry) {
  return async (_, { builder }) => {
    return new Promise((resolve) => {
      builder.set_package_registry(packageRegistry, function(spec) {
        return packageRegistry.resolve(spec, this);
      });
      resolve();
    });
  };
}
function withAccessModel(accessModel) {
  return async (_, ctx) => {
    if (ctx.alreadySetAccessModel) {
      throw new Error(`already set some assess model before: ${ctx.alreadySetAccessModel.constructor?.name}(${ctx.alreadySetAccessModel})`);
    }
    ctx.alreadySetAccessModel = accessModel;
    return new Promise((resolve) => {
      ctx.builder.set_access_model(accessModel, (path) => {
        const lastModified = accessModel.getMTime(path);
        if (lastModified) {
          return lastModified.getTime();
        }
        return 0;
      }, (path) => {
        return accessModel.isFile(path) || false;
      }, (path) => {
        return accessModel.getRealPath(path) || path;
      }, (path) => {
        return accessModel.readAll(path);
      });
      resolve();
    });
  };
}
var _textFonts, _cjkFonts, _emojiFonts;
var init_options_init = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/options.init.mjs"() {
    _textFonts = [
      "DejaVuSansMono-Bold.ttf",
      "DejaVuSansMono-BoldOblique.ttf",
      "DejaVuSansMono-Oblique.ttf",
      "DejaVuSansMono.ttf",
      "LibertinusSerif-Bold.otf",
      "LibertinusSerif-BoldItalic.otf",
      "LibertinusSerif-Italic.otf",
      "LibertinusSerif-Regular.otf",
      "LibertinusSerif-Semibold.otf",
      "LibertinusSerif-SemiboldItalic.otf",
      "NewCM10-Bold.otf",
      "NewCM10-BoldItalic.otf",
      "NewCM10-Italic.otf",
      "NewCM10-Regular.otf",
      "NewCMMath-Bold.otf",
      "NewCMMath-Book.otf",
      "NewCMMath-Regular.otf"
    ];
    _cjkFonts = [
      "InriaSerif-Bold.ttf",
      "InriaSerif-BoldItalic.ttf",
      "InriaSerif-Italic.ttf",
      "InriaSerif-Regular.ttf",
      "Roboto-Regular.ttf",
      "NotoSerifCJKsc-Regular.otf"
    ];
    _emojiFonts = ["TwitterColorEmoji.ttf", "NotoColorEmoji-Regular-COLR.subset.ttf"];
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/internal.types.mjs
var kObject, TypstDefaultParams;
var init_internal_types = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/internal.types.mjs"() {
    kObject = /* @__PURE__ */ Symbol.for("reflexo-obj");
    (function(TypstDefaultParams2) {
      TypstDefaultParams2[TypstDefaultParams2["PIXEL_PER_PT"] = 3] = "PIXEL_PER_PT";
    })(TypstDefaultParams || (TypstDefaultParams = {}));
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/render/canvas/view.mjs
var RenderView;
var init_view = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/render/canvas/view.mjs"() {
    init_internal_types();
    RenderView = class {
      pageInfos;
      loadPageCount;
      imageScaleFactor;
      container;
      canvasList;
      textLayerList;
      commonList;
      textLayerParentList;
      semanticLayerList;
      constructor(pageInfos, container, options) {
        this.pageInfos = pageInfos;
        this.imageScaleFactor = options.pixelPerPt ?? TypstDefaultParams.PIXEL_PER_PT;
        container.innerHTML = "";
        container.style.width = "100%";
        this.container = container;
        this.canvasList = new Array(this.loadPageCount);
        this.textLayerList = new Array(this.loadPageCount);
        this.commonList = new Array(this.loadPageCount);
        this.textLayerParentList = new Array(this.loadPageCount);
        this.semanticLayerList = new Array(this.loadPageCount);
        const createOver = (i, pageAst, commonDiv) => {
          const width = Math.ceil(pageAst.width) * this.imageScaleFactor;
          const height = Math.ceil(pageAst.height) * this.imageScaleFactor;
          const canvas = this.canvasList[i] = document.createElement("canvas");
          const semanticLayer = this.semanticLayerList[i] = document.createElement("div");
          const textLayer = this.textLayerList[i] = document.createElement("div");
          const textLayerParent = this.textLayerParentList[i] = document.createElement("div");
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const canvasDiv = document.createElement("div");
            canvas.width = width;
            canvas.height = height;
            canvasDiv.appendChild(canvas);
            commonDiv.appendChild(canvasDiv);
            canvasDiv.style.position = "absolute";
          }
          {
            textLayerParent.appendChild(textLayer);
            textLayerParent.className = "typst-html-semantics";
            const containerWidth = container.offsetWidth;
            const originalScale = containerWidth / pageAst.width;
            textLayerParent.style.width = `${containerWidth}px`;
            textLayerParent.style.height = `${pageAst.height * originalScale}px`;
            textLayerParent.style.setProperty("--data-text-width", `${originalScale}px`);
            textLayerParent.style.setProperty("--data-text-height", `${originalScale}px`);
            commonDiv.classList.add("typst-page");
            commonDiv.classList.add("canvas");
            commonDiv.style.width = `${containerWidth}px`;
            commonDiv.style.height = `${height * originalScale}px`;
            commonDiv.style.position = "relative";
            semanticLayer.appendChild(textLayerParent);
            commonDiv.appendChild(semanticLayer);
          }
        };
        for (let i = 0; i < this.pageInfos.length; i++) {
          const pageAst = this.pageInfos[i];
          let commonDiv = void 0;
          commonDiv = this.commonList[i] = document.createElement("div");
          container.appendChild(commonDiv);
          createOver(i, pageAst, commonDiv);
        }
      }
      resetLayout() {
        for (let i = 0; i < this.pageInfos.length; i++) {
          const pageAst = this.pageInfos[i];
          const width = Math.ceil(pageAst.width) * this.imageScaleFactor;
          const height = Math.ceil(pageAst.height) * this.imageScaleFactor;
          const canvasDiv = this.canvasList[i].parentElement;
          if (!canvasDiv) {
            throw new Error(`canvasDiv is null for page ${i}, canvas list length ${this.canvasList.length}`);
          }
          const commonDiv = this.commonList[i];
          const textLayerParent = this.textLayerParentList[i];
          const containerWidth = this.container.offsetWidth;
          const originalScale = containerWidth / width;
          textLayerParent.style.width = `${containerWidth}px`;
          textLayerParent.style.height = `${height * originalScale}px`;
          commonDiv.style.width = `${containerWidth}px`;
          commonDiv.style.height = `${height * originalScale}px`;
          const currentScale = this.container.offsetWidth / width;
          canvasDiv.style.transformOrigin = "0px 0px";
          canvasDiv.style.transform = `scale(${currentScale})`;
        }
      }
    };
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/wasm.mjs
var once, LazyWasmModule;
var init_wasm = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/wasm.mjs"() {
    once = (fn) => {
      let called = false;
      let res;
      return () => {
        if (called) {
          return res;
        }
        called = true;
        return res = fn();
      };
    };
    LazyWasmModule = class {
      wasmBin;
      initOnce;
      constructor(initFn) {
        if (typeof initFn !== "function") {
          throw new Error("initFn is not a function");
        }
        this.initOnce = once(async () => {
          await initFn(this.wasmBin);
        });
      }
      async init(module) {
        this.wasmBin = module;
        await this.initOnce();
      }
    };
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/init.mjs
async function buildComponent(options, gModule, Builder, hooks) {
  await gModule.init(options?.getModule?.());
  return await new ComponentBuilder().build(options, new Builder(), hooks);
}
function loadFontSync(font) {
  return () => {
    const xhr = new XMLHttpRequest();
    xhr.overrideMimeType("text/plain; charset=x-user-defined");
    xhr.open("GET", font.url, false);
    xhr.send(null);
    if (xhr.status === 200 && (xhr.response instanceof String || typeof xhr.response === "string")) {
      return Uint8Array.from(xhr.response, (c) => c.charCodeAt(0));
    }
    return new Uint8Array();
  };
}
var ComponentBuilder;
var init_init = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/init.mjs"() {
    ComponentBuilder = class {
      loadedFonts = /* @__PURE__ */ new Set();
      fetcher = fetch;
      setFetcher(fetcher) {
        this.fetcher = fetcher;
      }
      async loadFonts(builder, fonts) {
        const escapeImport = new Function("m", "return import(m)");
        const fetcher = this.fetcher ||= await (async function() {
          const { fetchBuilder, FileSystemCache } = await escapeImport("node-fetch-cache");
          const cache = new FileSystemCache({
            /// By default, we don't have a complicated cache policy.
            cacheDirectory: ".cache/typst/fonts"
          });
          const cachedFetcher = fetchBuilder.withCache(cache);
          return function(input, init) {
            const timeout = setTimeout(() => {
              console.warn("font fetching is stucking:", input);
            }, 15e3);
            return cachedFetcher(input, init).finally(() => {
              clearTimeout(timeout);
            });
          };
        })();
        const fontsToLoad = fonts.filter((font) => {
          if (font instanceof Uint8Array || typeof font === "object" && "info" in font) {
            return true;
          }
          if (this.loadedFonts.has(font)) {
            return false;
          }
          this.loadedFonts.add(font);
          return true;
        });
        const fontLists = await Promise.all(fontsToLoad.map(async (font) => {
          if (font instanceof Uint8Array) {
            await builder.add_raw_font(font);
            return;
          }
          if (typeof font === "object" && "info" in font) {
            await builder.add_lazy_font(font, "blob" in font ? font.blob : loadFontSync(font));
            return;
          }
          return new Uint8Array(await (await fetcher(font)).arrayBuffer());
        }));
        for (const font of fontLists) {
          if (!font) {
            continue;
          }
          await builder.add_raw_font(font);
        }
      }
      async build(options, builder, hooks) {
        const buildCtx = { ref: this, builder, hooks };
        for (const fn of options?.beforeBuild ?? []) {
          await fn(void 0, buildCtx);
        }
        if (hooks.latelyBuild) {
          hooks.latelyBuild(buildCtx);
        }
        return await builder.build();
      }
    };
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/dom/typst-doc.mjs
function provideDoc(Base) {
  return class TypstDocument {
    impl;
    kModule;
    constructor(options) {
      if (options.isContentPreview) {
        options.renderMode = "canvas";
      }
      this.kModule = options.kModule;
      this.impl = new Base(options);
      if (!this.impl.r) {
        throw new Error(`mode is not supported, ${options?.renderMode}`);
      }
      if (options.isContentPreview) {
        this.impl.partialRendering = true;
        this.impl.pixelPerPt = 1;
        this.impl.isMixinOutline = true;
      }
    }
    dispose() {
      this.impl.dispose();
    }
    reset() {
      this.impl.reset();
    }
    addChangement(change) {
      this.impl.addChangement(change);
    }
    addViewportChange() {
      this.impl.addViewportChange();
    }
    setPageColor(color) {
      this.impl.pageColor = color;
      this.addViewportChange();
    }
    setPartialRendering(partialRendering) {
      this.impl.partialRendering = partialRendering;
    }
    setCursor(page, x, y) {
      this.impl.cursorPosition = [page, x, y];
    }
    setPartialPageNumber(page) {
      if (page <= 0 || page > this.kModule.retrievePagesInfo().length) {
        return false;
      }
      this.impl.partialRenderPage = page - 1;
      this.addViewportChange();
      return true;
    }
    getPartialPageNumber() {
      return this.impl.partialRenderPage + 1;
    }
    setOutineData(outline) {
      this.impl.outline = outline;
      this.addViewportChange();
    }
  };
}
function composeDoc(Base, ...mixins) {
  return mixins.reduce((acc, mixin) => mixin(acc), Base);
}
var PreviewMode, TypstDocumentContext;
var init_typst_doc = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/dom/typst-doc.mjs"() {
    (function(PreviewMode2) {
      PreviewMode2[PreviewMode2["Doc"] = 0] = "Doc";
      PreviewMode2[PreviewMode2["Slide"] = 1] = "Slide";
    })(PreviewMode || (PreviewMode = {}));
    TypstDocumentContext = class _TypstDocumentContext {
      hookedElem;
      kModule;
      opts;
      modes = [];
      /// Configuration fields
      /// enable partial rendering
      partialRendering = true;
      /// underlying renderer
      renderMode = "svg";
      r = void 0;
      /// preview mode
      previewMode = PreviewMode.Doc;
      /// whether this is a content preview
      isContentPreview = false;
      /// whether this content preview will mix outline titles
      isMixinOutline = false;
      /// background color
      backgroundColor = "black";
      /// default page color (empty string means transparent)
      pageColor = "white";
      /// pixel per pt
      pixelPerPt = 3;
      /// customized way to retrieving dom state
      retrieveDOMState;
      /// State fields
      /// whether svg is updating (in triggerSvgUpdate)
      isRendering = false;
      /// whether kModule is initialized
      moduleInitialized = false;
      /// patch queue for updating data.
      patchQueue = [];
      /// resources to dispose
      disposeList = [];
      /// canvas render ctoken
      canvasRenderCToken;
      /// There are two scales in this class: The real scale is to adjust the size
      /// of `hookedElem` to fit the svg. The virtual scale (scale ratio) is to let
      /// user zoom in/out the svg. For example:
      /// + the default value of virtual scale is 1, which means the svg is totally
      ///   fit in `hookedElem`.
      /// + if user set virtual scale to 0.5, then the svg will be zoomed out to fit
      ///   in half width of `hookedElem`. "real" current scale of `hookedElem`
      currentRealScale = 1;
      /// "virtual" current scale of `hookedElem`
      currentScaleRatio = 1;
      /// timeout for delayed viewport change
      vpTimeout = void 0;
      /// sampled by last render time.
      sampledRenderTime = 0;
      /// page to partial render
      partialRenderPage = 0;
      /// outline data
      outline = void 0;
      /// cursor position in form of [page, x, y]
      cursorPosition = void 0;
      // id: number = rnd++;
      /// Cache fields
      /// cached state of container, default to retrieve state from `this.hookedElem`
      cachedDOMState = {
        width: 0,
        height: 0,
        window: {
          innerWidth: 0,
          innerHeight: 0
        },
        boundingRect: {
          left: 0,
          top: 0,
          right: 0
        }
      };
      constructor(opts) {
        this.hookedElem = opts.hookedElem;
        this.kModule = opts.kModule;
        this.opts = opts || {};
        {
          const { renderMode, previewMode, isContentPreview, retrieveDOMState } = opts || {};
          this.partialRendering = false;
          this.renderMode = renderMode ?? this.renderMode;
          this.previewMode = previewMode ?? this.previewMode;
          this.isContentPreview = isContentPreview || false;
          this.retrieveDOMState = retrieveDOMState ?? (() => {
            return {
              width: this.hookedElem.offsetWidth,
              height: this.hookedElem.offsetHeight,
              window: {
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight
              },
              boundingRect: this.hookedElem.getBoundingClientRect()
            };
          });
          this.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--typst-preview-background-color");
        }
        this.hookedElem.classList.add("hide-scrollbar-x");
        this.hookedElem.parentElement?.classList.add("hide-scrollbar-x");
        if (this.previewMode === PreviewMode.Slide) {
          this.hookedElem.classList.add("hide-scrollbar-y");
          this.hookedElem.parentElement?.classList.add("hide-scrollbar-y");
        }
        this.installCtrlWheelHandler();
      }
      reset() {
        this.kModule.reset();
        this.moduleInitialized = false;
      }
      dispose() {
        const disposeList = this.disposeList;
        this.disposeList = [];
        disposeList.forEach((x) => x());
      }
      static derive(ctx, mode) {
        return ["rescale", "rerender", "postRender"].reduce((acc, x) => {
          acc[x] = ctx[`${x}$${mode}`].bind(ctx);
          console.assert(acc[x] !== void 0, `${x}$${mode} is undefined`);
          return acc;
        }, {});
      }
      registerMode(mode) {
        const facade = _TypstDocumentContext.derive(this, mode);
        this.modes.push([mode, facade]);
        if (mode === this.renderMode) {
          this.r = facade;
        }
      }
      installCtrlWheelHandler() {
        const factors = [
          0.1,
          0.2,
          0.3,
          0.4,
          0.5,
          0.6,
          0.7,
          0.8,
          0.9,
          1,
          1.1,
          1.3,
          1.5,
          1.7,
          1.9,
          2.1,
          2.4,
          2.7,
          3,
          3.3,
          3.7,
          4.1,
          4.6,
          5.1,
          5.7,
          6.3,
          7,
          7.7,
          8.5,
          9.4,
          10
        ];
        const wheelEventHandler = (event) => {
          if (event.ctrlKey) {
            event.preventDefault();
            this.cachedDOMState = this.retrieveDOMState();
            if (window.onresize !== null) {
              window.onresize = null;
            }
            const prevScaleRatio = this.currentScaleRatio;
            if (event.deltaY < 0) {
              if (this.currentScaleRatio >= factors.at(-1)) {
                return;
              } else {
                this.currentScaleRatio = factors.filter((x) => x > this.currentScaleRatio).at(0);
              }
            } else if (event.deltaY > 0) {
              if (this.currentScaleRatio <= factors.at(0)) {
                return;
              } else {
                this.currentScaleRatio = factors.filter((x) => x < this.currentScaleRatio).at(-1);
              }
            } else {
              return;
            }
            const scrollFactor = this.currentScaleRatio / prevScaleRatio;
            const scrollX = event.pageX * (scrollFactor - 1);
            const scrollY = event.pageY * (scrollFactor - 1);
            if (Math.abs(this.currentScaleRatio - 1) < 1e-5) {
              this.hookedElem.classList.add("hide-scrollbar-x");
              this.hookedElem.parentElement?.classList.add("hide-scrollbar-x");
              if (this.previewMode === PreviewMode.Slide) {
                this.hookedElem.classList.add("hide-scrollbar-y");
                this.hookedElem.parentElement?.classList.add("hide-scrollbar-y");
              }
            } else {
              this.hookedElem.classList.remove("hide-scrollbar-x");
              this.hookedElem.parentElement?.classList.remove("hide-scrollbar-x");
              if (this.previewMode === PreviewMode.Slide) {
                this.hookedElem.classList.remove("hide-scrollbar-y");
                this.hookedElem.parentElement?.classList.remove("hide-scrollbar-y");
              }
            }
            const svg = this.hookedElem.firstElementChild;
            if (svg) {
              const scaleRatio = this.getSvgScaleRatio();
              const dataHeight = Number.parseFloat(svg.getAttribute("data-height"));
              const scaledHeight = Math.ceil(dataHeight * scaleRatio);
              this.hookedElem.style.height = `${scaledHeight * 2}px`;
            }
            window.scrollBy(scrollX, scrollY);
            this.addViewportChange();
            return false;
          }
        };
        if (this.renderMode !== "dom") {
          const vscodeAPI = typeof acquireVsCodeApi !== "undefined";
          if (vscodeAPI) {
            window.addEventListener("wheel", wheelEventHandler, {
              passive: false
            });
            this.disposeList.push(() => {
              window.removeEventListener("wheel", wheelEventHandler);
            });
          } else {
            document.body.addEventListener("wheel", wheelEventHandler, {
              passive: false
            });
            this.disposeList.push(() => {
              document.body.removeEventListener("wheel", wheelEventHandler);
            });
          }
        }
      }
      /// Get current scale from html to svg
      // Note: one should retrieve dom state before rescale
      getSvgScaleRatio() {
        const svg = this.hookedElem.firstElementChild;
        if (!svg) {
          return 0;
        }
        const container = this.cachedDOMState;
        const svgWidth = Number.parseFloat(svg.getAttribute("data-width") || svg.getAttribute("width") || "1");
        const svgHeight = Number.parseFloat(svg.getAttribute("data-height") || svg.getAttribute("height") || "1");
        this.currentRealScale = this.previewMode === PreviewMode.Slide ? Math.min(container.width / svgWidth, container.height / svgHeight) : container.width / svgWidth;
        return this.currentRealScale * this.currentScaleRatio;
      }
      processQueue(svgUpdateEvent) {
        const eventName = svgUpdateEvent[0];
        switch (eventName) {
          case "new":
          case "diff-v1": {
            if (eventName === "new") {
              this.reset();
            }
            this.kModule.manipulateData({
              action: "merge",
              data: svgUpdateEvent[1]
            });
            this.moduleInitialized = true;
            return true;
          }
          case "viewport-change": {
            if (!this.moduleInitialized) {
              console.log("viewport-change before initialization");
              return false;
            }
            return true;
          }
          default:
            console.log("svgUpdateEvent", svgUpdateEvent);
            return false;
        }
      }
      triggerUpdate() {
        if (this.isRendering) {
          return;
        }
        this.isRendering = true;
        const doUpdate = async () => {
          this.cachedDOMState = this.retrieveDOMState();
          if (this.patchQueue.length === 0) {
            this.isRendering = false;
            this.postprocessChanges();
            return;
          }
          try {
            let t0 = performance.now();
            const ctoken = this.canvasRenderCToken;
            if (ctoken) {
              await ctoken.cancel();
              await ctoken.wait();
              this.canvasRenderCToken = void 0;
              console.log("cancel canvas rendering");
            }
            let needRerender = false;
            while (this.patchQueue.length > 0) {
              needRerender = this.processQueue(this.patchQueue.shift()) || needRerender;
            }
            let t1 = performance.now();
            if (needRerender) {
              this.r.rescale();
              await this.r.rerender();
              this.r.rescale();
            }
            let t2 = performance.now();
            const d = (e, x, y) => `${e} ${(y - x).toFixed(2)} ms`;
            this.sampledRenderTime = t2 - t0;
            requestAnimationFrame(doUpdate);
          } catch (e) {
            console.error(e);
            this.isRendering = false;
            this.postprocessChanges();
          }
        };
        requestAnimationFrame(doUpdate);
      }
      postprocessChanges() {
        this.r.postRender();
        if (this.previewMode === PreviewMode.Slide) {
          document.querySelectorAll(".typst-page-number-indicator").forEach((x) => {
            x.textContent = `${this.kModule.retrievePagesInfo().length}`;
          });
        }
      }
      addChangement(change) {
        if (change[0] === "new") {
          this.patchQueue.splice(0, this.patchQueue.length);
        }
        const pushChange = () => {
          this.vpTimeout = void 0;
          this.patchQueue.push(change);
          this.triggerUpdate();
        };
        if (this.vpTimeout !== void 0) {
          clearTimeout(this.vpTimeout);
        }
        if (change[0] === "viewport-change" && this.isRendering) {
          this.vpTimeout = setTimeout(pushChange, this.sampledRenderTime || 100);
        } else {
          pushChange();
        }
      }
      addViewportChange() {
        this.addChangement(["viewport-change", ""]);
      }
    };
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/dom/typst-cancel.mjs
var TypstCancellationToken;
var init_typst_cancel = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/dom/typst-cancel.mjs"() {
    TypstCancellationToken = class {
      isCancellationRequested = false;
      _onCancelled;
      _onCancelledResolveResolved;
      constructor() {
        let resolveT = void 0;
        let resolveX = void 0;
        this._onCancelled = new Promise((resolve) => {
          resolveT = resolve;
          if (resolveX) {
            resolveX(resolve);
          }
        });
        this._onCancelledResolveResolved = new Promise((resolve) => {
          resolveX = resolve;
          if (resolveT) {
            resolve(resolveT);
          }
        });
      }
      async cancel() {
        await this._onCancelledResolveResolved;
        this.isCancellationRequested = true;
      }
      isCancelRequested() {
        return this.isCancellationRequested;
      }
      async consume() {
        (await this._onCancelledResolveResolved)();
      }
      wait() {
        return this._onCancelled;
      }
    };
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/dom.mjs
function provideDomDoc(Base) {
  return class DomDocument extends Base {
    /// The template element for creating DOM by string.
    tmpl = document.createElement("template");
    /// The stub element for replacing an invisible element.
    stub = this.createElement("<stub></stub>");
    /// Typescript side of lib.
    plugin;
    /// Rust side of kernel.
    docKernel;
    /// The element to track.
    resourceHeader = void 0;
    /// Expected exact state of the current DOM.
    /// Initially it is empty meaning no any page is rendered.
    pages = [];
    /// The virtual scale of the document.
    domScale = 1;
    /// Track mode.
    track_mode = TrackMode.Doc;
    /// Current executing task.
    current_task = void 0;
    /// The currently maintained viewport.
    viewport;
    constructor(...args) {
      super(...args);
      this.registerMode("dom");
      this.disposeList.push(() => {
        this.dispose();
      });
      this.plugin = this.opts.renderer;
      if (this.opts.domScale !== void 0) {
        if (this.opts.domScale <= 0) {
          throw new Error("domScale must be positive");
        }
        this.domScale = this.opts.domScale;
      }
    }
    dispose() {
      for (const page of this.pages) {
        page.dispose();
      }
      if (this.docKernel) {
        this.docKernel.free();
      }
    }
    createElement(tmpl) {
      this.tmpl.innerHTML = tmpl;
      return this.tmpl.content.firstElementChild;
    }
    async mountDom(pixelPerPt) {
      if (this.docKernel) {
        throw new Error("already mounted");
      }
      this.hookedElem.innerHTML = `<svg class="typst-svg-resources" viewBox="0 0 0 0" width="0" height="0" style="opacity: 0; position: absolute;"></svg>`;
      this.resourceHeader = this.hookedElem.querySelector(".typst-svg-resources");
      this.docKernel = await this.plugin.renderer.mount_dom(this.kModule[kObject], this.hookedElem);
      this.docKernel.bind_functions({
        populateGlyphs: (data) => {
          let svg = this.createElement(data);
          let content = svg.firstElementChild;
          this.resourceHeader.append(content);
        }
      });
    }
    async cancelAnyway$dom() {
      if (this.current_task) {
        const task = this.current_task;
        this.current_task = void 0;
        await task.cancel();
      }
    }
    retrieveDOMPages() {
      return Array.from(this.hookedElem.querySelectorAll(".typst-dom-page"));
    }
    // doesn't need to postRender
    postRender$dom() {
    }
    // doesn't need to rescale
    rescale$dom() {
    }
    getDomViewport(cachedWindow, cachedBoundingRect) {
      const left = cachedBoundingRect.left;
      const top = -cachedBoundingRect.top;
      const right = cachedBoundingRect.right;
      const bottom = cachedWindow.innerHeight - cachedBoundingRect.top;
      const rect = {
        x: 0,
        y: top / this.domScale,
        width: Math.max(right - left, 0) / this.domScale,
        height: Math.max(bottom - top, 0) / this.domScale
      };
      if (rect.width <= 0 || rect.height <= 0) {
        rect.x = rect.y = rect.width = rect.height = 0;
      }
      return rect;
    }
    // fast mode
    async rerender$dom() {
      const domState = this.retrieveDOMState();
      const { x, y, width, height } = this.getDomViewport(domState.window, domState.boundingRect);
      let dirty = await this.docKernel.relayout(x, y, width, height);
      if (!dirty) {
        return;
      }
      const cancel = new TypstCancellationToken();
      this.doRender$dom(cancel);
      this.current_task = cancel;
    }
    async doRender$dom(ctx) {
      const condOrExit = (needFrame, cb) => {
        if (needFrame && !ctx.isCancelRequested() && cb) {
          return cb();
        }
      };
      const pages = this.retrieveDOMPages().map((page) => {
        const { innerWidth, innerHeight } = window;
        const browserBBox = page.getBoundingClientRect();
        return {
          inWindow: !(browserBBox.left > innerWidth || browserBBox.right < 0 || browserBBox.top > innerHeight || browserBBox.bottom < 0),
          page
        };
      });
      const renderPage = async (i) => {
        await animationFrame();
        if (ctx.isCancelRequested()) {
          return void 0;
        }
        const page = pages[i].page;
        const browserBBox = page.getBoundingClientRect();
        const v = this.getDomViewport(window, browserBBox);
        const needCalc = (stage) => this.docKernel.need_repaint(i, v.x, v.y, v.width, v.height, stage);
        const repaint = (stage) => this.docKernel.repaint(i, v.x, v.y, v.width, v.height, stage);
        const calc = (stage) => {
          if (ctx.isCancelRequested()) {
            return void 0;
          }
          return condOrExit(needCalc(stage), () => repaint(stage));
        };
        await calc(RepaintStage.Layout);
        const wScale = (browserBBox.width ? Number.parseFloat(page.getAttribute("data-width")) / browserBBox.width : 1) * this.domScale;
        const hScale = (browserBBox.height ? Number.parseFloat(page.getAttribute("data-height")) / browserBBox.height : 1) * this.domScale;
        v.x *= wScale;
        v.y *= hScale;
        v.y -= 100;
        v.width *= wScale;
        v.height *= hScale;
        v.height += 200;
        await calc(RepaintStage.Svg);
        await calc(RepaintStage.Semantics);
        if (ctx.isCancelRequested()) {
          return void 0;
        }
        if (needCalc(RepaintStage.PrepareCanvas)) {
          const calcCanvasAfterPreparing = async () => {
            await repaint(RepaintStage.PrepareCanvas);
            if (ctx.isCancelRequested()) {
              return void 0;
            }
            return calc(RepaintStage.Canvas);
          };
          calcCanvasAfterPreparing();
        } else {
          await calc(RepaintStage.Canvas);
        }
      };
      const renderPages = async (inWindow) => {
        for (let idx = 0; idx < pages.length; ++idx) {
          if (ctx.isCancelRequested()) {
            return;
          }
          if (pages[idx].inWindow === inWindow) {
            await renderPage(idx);
          }
        }
      };
      this.cancelAnyway$dom();
      await renderPages(true);
      await renderPages(false);
      if (ctx.isCancelRequested()) {
        return;
      }
    }
  };
}
var animationFrame, TrackMode, RepaintStage, TypstDomDocument;
var init_dom = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/dom.mjs"() {
    init_internal_types();
    init_typst_doc();
    init_typst_cancel();
    animationFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    (function(TrackMode2) {
      TrackMode2[TrackMode2["Doc"] = 0] = "Doc";
      TrackMode2[TrackMode2["Pages"] = 1] = "Pages";
    })(TrackMode || (TrackMode = {}));
    (function(RepaintStage2) {
      RepaintStage2[RepaintStage2["Layout"] = 0] = "Layout";
      RepaintStage2[RepaintStage2["Svg"] = 1] = "Svg";
      RepaintStage2[RepaintStage2["Semantics"] = 2] = "Semantics";
      RepaintStage2[RepaintStage2["PrepareCanvas"] = 3] = "PrepareCanvas";
      RepaintStage2[RepaintStage2["Canvas"] = 4] = "Canvas";
    })(RepaintStage || (RepaintStage = {}));
    TypstDomDocument = class extends provideDoc(composeDoc(TypstDocumentContext, provideDomDoc)) {
    };
  }
});

// node_modules/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs
function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  if (typeof heap_next !== "number") throw new Error("corrupt heap");
  heap[idx] = obj;
  return idx;
}
function _assertBoolean(n) {
  if (typeof n !== "boolean") {
    throw new Error(`expected a boolean argument, found ${typeof n}`);
  }
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
function _assertNum(n) {
  if (typeof n !== "number") throw new Error(`expected a number argument, found ${typeof n}`);
}
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
function dropObject(idx) {
  if (idx < 132) return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
function getDataViewMemory0() {
  if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(ptr, len);
}
function getUint32ArrayMemory0() {
  if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
    cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
  }
  return cachedUint32ArrayMemory0;
}
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function getObject(idx) {
  return heap[idx];
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_export3(addHeapObject(e));
  }
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
function logError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    let error = (function() {
      try {
        return e instanceof Error ? `${e.message}

Stack:
${e.stack}` : e.toString();
      } catch (_) {
        return "<failed to stringify thrown value>";
      }
    })();
    console.error("wasm-bindgen: imported JS function that was not marked as `catch` threw an error:", error);
    throw e;
  }
}
function makeClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    try {
      return f(state.a, state.b, ...args);
    } finally {
      real._wbg_cb_unref();
    }
  };
  real._wbg_cb_unref = () => {
    if (--state.cnt === 0) {
      state.dtor(state.a, state.b);
      state.a = 0;
      CLOSURE_DTORS.unregister(state);
    }
  };
  CLOSURE_DTORS.register(real, state, state);
  return real;
}
function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      state.a = a;
      real._wbg_cb_unref();
    }
  };
  real._wbg_cb_unref = () => {
    if (--state.cnt === 0) {
      state.dtor(state.a, state.b);
      state.a = 0;
      CLOSURE_DTORS.unregister(state);
    }
  };
  CLOSURE_DTORS.register(real, state, state);
  return real;
}
function passArray32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4, 4) >>> 0;
  getUint32ArrayMemory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function passArrayJsValueToWasm0(array, malloc) {
  const ptr = malloc(array.length * 4, 4) >>> 0;
  const mem = getDataViewMemory0();
  for (let i = 0; i < array.length; i++) {
    mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
  }
  WASM_VECTOR_LEN = array.length;
  return ptr;
}
function passStringToWasm0(arg, malloc, realloc) {
  if (typeof arg !== "string") throw new Error(`expected a string argument, found ${typeof arg}`);
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder.encodeInto(arg, view);
    if (ret.read !== arg.length) throw new Error("failed to pass whole string");
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
function __wasm_bindgen_func_elem_1056(arg0, arg1, arg2) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm.__wasm_bindgen_func_elem_1056(arg0, arg1, addHeapObject(arg2));
}
function __wasm_bindgen_func_elem_1035(arg0, arg1) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm.__wasm_bindgen_func_elem_1035(arg0, arg1);
}
function __wasm_bindgen_func_elem_1034(arg0, arg1, arg2) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm.__wasm_bindgen_func_elem_1034(arg0, arg1, addHeapObject(arg2));
}
function __wasm_bindgen_func_elem_3555(arg0, arg1, arg2, arg3) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm.__wasm_bindgen_func_elem_3555(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}
function renderer_build_info() {
  const ret = wasm.renderer_build_info();
  return takeObject(ret);
}
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);
        if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg___wbindgen_debug_string_adfb662ae34724b6 = function(arg0, arg1) {
    const ret = debugString(getObject(arg1));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg___wbindgen_is_function_8d400b8b1af978cd = function(arg0) {
    const ret = typeof getObject(arg0) === "function";
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_undefined_f6b95eab589e0269 = function(arg0) {
    const ret = getObject(arg0) === void 0;
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbg___wbindgen_jsval_eq_b6101cc9cef1fe36 = function(arg0, arg1) {
    const ret = getObject(arg0) === getObject(arg1);
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbg___wbindgen_string_get_a2a31e16edf96e42 = function(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof obj === "string" ? obj : void 0;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg__wbg_cb_unref_87dfb5aaa0cbcea7 = function() {
    return logError(function(arg0) {
      getObject(arg0)._wbg_cb_unref();
    }, arguments);
  };
  imports.wbg.__wbg_appendChild_7465eba84213c75f = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).appendChild(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_3020136f7a2d6e44 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_78f94eb02ec7f9b2 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3), getObject(arg4));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_abb4ff46ce38be40 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).call(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_c8baa5c5e72d274e = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_clearRect_c2909c2f38887f82 = function() {
    return logError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).clearRect(arg1, arg2, arg3, arg4);
    }, arguments);
  };
  imports.wbg.__wbg_clientWidth_dbc9540f4ebdce2a = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).clientWidth;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_clip_35de02bb25d222d9 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).clip(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_clip_afc9a92171eee96e = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).clip(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_cloneNode_c9c45b24b171a776 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).cloneNode();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_content_ad90fa08b8c037c5 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).content;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createElement_da4ed2b219560fc6 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).createElement(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createImageBitmap_15b94d7a7277d0be = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).createImageBitmap(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createImageBitmap_4772db6cb0dff013 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).createImageBitmap(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createObjectURL_7d9f7f8f41373850 = function() {
    return handleError(function(arg0, arg1) {
      const ret = URL.createObjectURL(getObject(arg1));
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_document_5b745e82ba551ca5 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).document;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_2859dfb229439d8c = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_6949f7679b2a9758 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_c2aacfe3133aedb7 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      getObject(arg0).drawImage(getObject(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_c40aff4a38206f4a = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_c4f2c6d2bcfa9463 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      getObject(arg0).drawImage(getObject(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_de5946f9cc23c2b9 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      getObject(arg0).drawImage(getObject(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_e2012c2a2d434ee2 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function() {
    return logError(function(arg0, arg1) {
      let deferred0_0;
      let deferred0_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
      } finally {
        wasm.__wbindgen_export4(deferred0_0, deferred0_1, 1);
      }
    }, arguments);
  };
  imports.wbg.__wbg_fillRect_84131220403e26a4 = function() {
    return logError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).fillRect(arg1, arg2, arg3, arg4);
    }, arguments);
  };
  imports.wbg.__wbg_fillRect_e0efe328740308e7 = function() {
    return logError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).fillRect(arg1, arg2, arg3, arg4);
    }, arguments);
  };
  imports.wbg.__wbg_fill_2f2cb4f3f75aadd4 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).fill(getObject(arg1), __wbindgen_enum_CanvasWindingRule[arg2]);
    }, arguments);
  };
  imports.wbg.__wbg_fill_38a7d7455451c001 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).fill(getObject(arg1), __wbindgen_enum_CanvasWindingRule[arg2]);
    }, arguments);
  };
  imports.wbg.__wbg_fill_3d82e52894462c95 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).fill(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_fill_f1043be5324533f3 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).fill(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_firstElementChild_54d515b19cee5ae7 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).firstElementChild;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_firstElementChild_e207b33aaa4a86df = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).firstElementChild;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_getAttribute_80900eec94cb3636 = function() {
    return logError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject(arg1).getAttribute(getStringFromWasm0(arg2, arg3));
      var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      var len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_getContext_01f42b234e833f0a = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_getContext_2f210d0a58d43d95 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_get_af9dab7e9603ea93 = function() {
    return handleError(function(arg0, arg1) {
      const ret = Reflect.get(getObject(arg0), getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_globalCompositeOperation_03e6a5201c8ee369 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg1).globalCompositeOperation;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_globalCompositeOperation_d52c6e6666e4be00 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg1).globalCompositeOperation;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_height_3a0b31e52a5b7f17 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).height;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_incrdomdocclient_new = function() {
    return logError(function(arg0) {
      const ret = IncrDomDocClient.__wrap(arg0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_CanvasRenderingContext2d_d070139aaac1459f = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof CanvasRenderingContext2D;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_Element_6f7ba982258cfc0f = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof Element;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlCanvasElement_c4251b1b6a15edcc = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof HTMLCanvasElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlDivElement_a55b9d453d2d8037 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof HTMLDivElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlElement_20a3acb594113d73 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof HTMLElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlTemplateElement_702a22ea7e74d089 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof HTMLTemplateElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_ImageBitmap_e44697c70dffc0fe = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof ImageBitmap;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_OffscreenCanvasRenderingContext2d_52996da29a2bf2f5 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof OffscreenCanvasRenderingContext2D;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_OffscreenCanvas_8fb961f5ea27473f = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof OffscreenCanvas;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_Promise_eca6c43a2610558d = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof Promise;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_SvgGraphicsElement_16c442d1a36270b3 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof SVGGraphicsElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_SvgsvgElement_27a38efc9750b6fa = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof SVGSVGElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_Window_b5cf7783caa68180 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof Window;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_WorkerGlobalScope_9a3411db21c65a54 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof WorkerGlobalScope;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_lastElementChild_6b90fe10adf639a2 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).lastElementChild;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_length_22ac23eaec9d8053 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).length;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_log_1d990106d99dacb7 = function() {
    return logError(function(arg0) {
      console.log(getObject(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_log_fd6486c6d5396ce5 = function() {
    return logError(function(arg0, arg1) {
      console.log(getObject(arg0), getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_measureText_a465ecc06491802d = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).measureText(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
    return logError(function() {
      const ret = new Object();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_25f239778d6112b9 = function() {
    return logError(function() {
      const ret = new Array();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_2884ddbcda091bc1 = function() {
    return handleError(function() {
      const ret = new Image();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
    return logError(function() {
      const ret = new Error();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_9468dd6e5df427f6 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_df1173567d5ff028 = function() {
    return logError(function(arg0, arg1) {
      const ret = new Error(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_ff12d2b041fb48f1 = function() {
    return logError(function(arg0, arg1) {
      try {
        var state0 = { a: arg0, b: arg1 };
        var cb0 = (arg02, arg12) => {
          const a = state0.a;
          state0.a = 0;
          try {
            return __wasm_bindgen_func_elem_3555(a, state0.b, arg02, arg12);
          } finally {
            state0.a = a;
          }
        };
        const ret = new Promise(cb0);
        return addHeapObject(ret);
      } finally {
        state0.a = state0.b = 0;
      }
    }, arguments);
  };
  imports.wbg.__wbg_new_from_slice_f9c22b9153b26992 = function() {
    return logError(function(arg0, arg1) {
      const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_no_args_cb138f77cf6151ee = function() {
    return logError(function(arg0, arg1) {
      const ret = new Function(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_with_length_aa5eaf41d35235e5 = function() {
    return logError(function(arg0) {
      const ret = new Uint8Array(arg0 >>> 0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_with_path_string_3aea637e78135c46 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new Path2D(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_with_u8_array_sequence_and_options_d4def9ec0588c7ec = function() {
    return handleError(function(arg0, arg1) {
      const ret = new Blob(getObject(arg0), getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_nextElementSibling_c745ee48314963c0 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).nextElementSibling;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_push_7d9be8f38fc13975 = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject(arg0).push(getObject(arg1));
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_putImageData_c280ca107c4b7828 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      getObject(arg0).putImageData(getObject(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_putImageData_e96eabf0e9610ed3 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      getObject(arg0).putImageData(getObject(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_queueMicrotask_9b549dfce8865860 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).queueMicrotask;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_queueMicrotask_fca69f5bfad613a5 = function() {
    return logError(function(arg0) {
      queueMicrotask(getObject(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_removeProperty_c2e16faee2834bef = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject(arg1).removeProperty(getStringFromWasm0(arg2, arg3));
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_remove_32f69ffabcbc4072 = function() {
    return logError(function(arg0) {
      getObject(arg0).remove();
    }, arguments);
  };
  imports.wbg.__wbg_renderpageimageoptions_unwrap = function() {
    return logError(function(arg0) {
      const ret = RenderPageImageOptions.__unwrap(getObject(arg0));
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_replaceWith_923cfb1b2f584408 = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).replaceWith(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_resolve_fd5bfbaa4ce36e1e = function() {
    return logError(function(arg0) {
      const ret = Promise.resolve(getObject(arg0));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_restore_352c39c9bbeedc91 = function() {
    return logError(function(arg0) {
      getObject(arg0).restore();
    }, arguments);
  };
  imports.wbg.__wbg_restore_6486cb1a7aa3af7b = function() {
    return logError(function(arg0) {
      getObject(arg0).restore();
    }, arguments);
  };
  imports.wbg.__wbg_revokeObjectURL_88db3468842ff09e = function() {
    return handleError(function(arg0, arg1) {
      URL.revokeObjectURL(getStringFromWasm0(arg0, arg1));
    }, arguments);
  };
  imports.wbg.__wbg_save_131c8dc648f702b6 = function() {
    return logError(function(arg0) {
      getObject(arg0).save();
    }, arguments);
  };
  imports.wbg.__wbg_save_b8767cfd2ee7f600 = function() {
    return logError(function(arg0) {
      getObject(arg0).save();
    }, arguments);
  };
  imports.wbg.__wbg_setAttribute_34747dd193f45828 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).setAttribute(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_setLineDash_7e3aad159aa2710c = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).setLineDash(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_setLineDash_cfbc3a6bfddeee62 = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).setLineDash(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_setProperty_f27b2c05323daf8a = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).setProperty(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_setTransform_9de588d9f080f5bc = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      getObject(arg0).setTransform(arg1, arg2, arg3, arg4, arg5, arg6);
    }, arguments);
  };
  imports.wbg.__wbg_setTransform_c55eca1193bf5ea1 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      getObject(arg0).setTransform(arg1, arg2, arg3, arg4, arg5, arg6);
    }, arguments);
  };
  imports.wbg.__wbg_set_169e13b608078b7b = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).set(getArrayU8FromWasm0(arg1, arg2));
    }, arguments);
  };
  imports.wbg.__wbg_set_781438a03c0c3c81 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_set_7df433eea03a5c14 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_fillStyle_b26e462a87b14315 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).fillStyle = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_fillStyle_c9a0550307cd4671 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).fillStyle = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_font_6d67b15564a1e344 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).font = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_globalCompositeOperation_418a0b97ba91a947 = function() {
    return handleError(function(arg0, arg1, arg2) {
      getObject(arg0).globalCompositeOperation = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_globalCompositeOperation_7e16c72877ba5f86 = function() {
    return handleError(function(arg0, arg1, arg2) {
      getObject(arg0).globalCompositeOperation = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_height_6f8f8ef4cb40e496 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).height = arg1 >>> 0;
    }, arguments);
  };
  imports.wbg.__wbg_set_innerHTML_f1d03f780518a596 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).innerHTML = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_lineCap_74b37c7ff968f854 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).lineCap = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_lineCap_791e7648138cc371 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).lineCap = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_lineDashOffset_85f21a63ddf34d2c = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).lineDashOffset = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_set_lineDashOffset_f032b4e2a273a2f5 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).lineDashOffset = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_set_lineJoin_196c6ac02fd494c3 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).lineJoin = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_lineJoin_a136f09dd803e0cc = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).lineJoin = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_lineWidth_ed39767bf75d602d = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).lineWidth = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_set_lineWidth_feda4b79a15c660b = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).lineWidth = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_set_miterLimit_b12c03757937d228 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).miterLimit = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_set_miterLimit_d891f47e244a915c = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).miterLimit = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_set_onerror_e7e40c62a55a0770 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).onerror = getObject(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_set_onload_5e2862e3453854de = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).onload = getObject(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_set_src_84f27c5105946dce = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).src = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_strokeStyle_25d5381be570e780 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).strokeStyle = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_strokeStyle_697a576d2d3fbeaa = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).strokeStyle = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_type_7ce650670a34c68f = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).type = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_width_7ff7a22c6e9f423e = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).width = arg1 >>> 0;
    }, arguments);
  };
  imports.wbg.__wbg_stack_0ed75d68575b0f3c = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject(arg1).stack;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_769e6b65d6557335 = function() {
    return logError(function() {
      const ret = typeof global === "undefined" ? null : global;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_THIS_60cf02db4de8e1c1 = function() {
    return logError(function() {
      const ret = typeof globalThis === "undefined" ? null : globalThis;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_SELF_08f5a74c69739274 = function() {
    return logError(function() {
      const ret = typeof self === "undefined" ? null : self;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_WINDOW_a8924b26aa92d024 = function() {
    return logError(function() {
      const ret = typeof window === "undefined" ? null : window;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_stringify_655a6390e1f5eb6b = function() {
    return handleError(function(arg0) {
      const ret = JSON.stringify(getObject(arg0));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_stroke_41b0736a6a0b61aa = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).stroke(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_stroke_7cfe6d60a6c48303 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).stroke(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_style_521a717da50e53c6 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).style;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_then_429f7caf1026411d = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_then_4f95312d68691235 = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject(arg0).then(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_transferToImageBitmap_7048556ff33da7ed = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).transferToImageBitmap();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_typstrenderer_new = function() {
    return logError(function(arg0) {
      const ret = TypstRenderer.__wrap(arg0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_warn_6e567d0d926ff881 = function() {
    return logError(function(arg0) {
      console.warn(getObject(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_width_c3f96f2ca7ab208d = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).width;
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_width_f13d2e86324fc226 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).width;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function() {
    return logError(function(arg0, arg1) {
      const ret = getStringFromWasm0(arg0, arg1);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_cast_34ce245e5be1ba8b = function() {
    return logError(function(arg0, arg1) {
      const ret = makeClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_1022, __wasm_bindgen_func_elem_1035);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_cast_b2e692da0ea8478a = function() {
    return logError(function(arg0, arg1) {
      const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_1077, __wasm_bindgen_func_elem_1056);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_cast_d3d3bd81840cfbdd = function() {
    return logError(function(arg0, arg1) {
      const ret = makeClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_1022, __wasm_bindgen_func_elem_1034);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function() {
    return logError(function(arg0) {
      const ret = arg0;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
    const ret = getObject(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject(arg0);
  };
  return imports;
}
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module;
  cachedDataViewMemory0 = null;
  cachedUint32ArrayMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  return wasm;
}
function initSync(module) {
  if (wasm !== void 0) return wasm;
  if (typeof module !== "undefined") {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ({ module } = module);
    } else {
      console.warn("using deprecated parameters for `initSync()`; pass a single object instead");
    }
  }
  const imports = __wbg_get_imports();
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  return __wbg_finalize_init(instance, module);
}
async function __wbg_init(module_or_path) {
  if (wasm !== void 0) return wasm;
  if (typeof module_or_path !== "undefined") {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (typeof module_or_path === "undefined") {
    module_or_path = importWasmModule("typst_ts_renderer_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  const { instance, module } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module);
}
function setImportWasmModule(importer) {
  importWasmModule = importer;
}
var wasm, CLOSURE_DTORS, cachedDataViewMemory0, cachedUint32ArrayMemory0, cachedUint8ArrayMemory0, heap, heap_next, cachedTextDecoder, MAX_SAFARI_DECODE_BYTES, numBytesDecoded, cachedTextEncoder, WASM_VECTOR_LEN, __wbindgen_enum_CanvasWindingRule, CreateSessionOptionsFinalization, IncrDomDocClientFinalization, PageInfoFinalization, PagesInfoFinalization, RenderPageImageOptionsFinalization, RenderSessionFinalization, RenderSessionOptionsFinalization, TypstRendererFinalization, TypstRendererBuilderFinalization, TypstWorkerFinalization, WorkerBridgeFinalization, CreateSessionOptions, IncrDomDocClient, PageInfo, PagesInfo, RenderPageImageOptions, RenderSession, RenderSessionOptions, TypstRenderer, TypstRendererBuilder, TypstWorker, WorkerBridge, EXPECTED_RESPONSE_TYPES, typst_ts_renderer_default, importWasmModule;
var init_typst_ts_renderer = __esm({
  "node_modules/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs"() {
    CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((state) => state.dtor(state.a, state.b));
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    heap = new Array(128).fill(void 0);
    heap.push(void 0, null, true, false);
    heap_next = heap.length;
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    MAX_SAFARI_DECODE_BYTES = 2146435072;
    numBytesDecoded = 0;
    cachedTextEncoder = new TextEncoder();
    if (!("encodeInto" in cachedTextEncoder)) {
      cachedTextEncoder.encodeInto = function(arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
          read: arg.length,
          written: buf.length
        };
      };
    }
    WASM_VECTOR_LEN = 0;
    __wbindgen_enum_CanvasWindingRule = ["nonzero", "evenodd"];
    CreateSessionOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_createsessionoptions_free(ptr >>> 0, 1));
    IncrDomDocClientFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_incrdomdocclient_free(ptr >>> 0, 1));
    PageInfoFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_pageinfo_free(ptr >>> 0, 1));
    PagesInfoFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_pagesinfo_free(ptr >>> 0, 1));
    RenderPageImageOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_renderpageimageoptions_free(ptr >>> 0, 1));
    RenderSessionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_rendersession_free(ptr >>> 0, 1));
    RenderSessionOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_rendersessionoptions_free(ptr >>> 0, 1));
    TypstRendererFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_typstrenderer_free(ptr >>> 0, 1));
    TypstRendererBuilderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_typstrendererbuilder_free(ptr >>> 0, 1));
    TypstWorkerFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_typstworker_free(ptr >>> 0, 1));
    WorkerBridgeFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_workerbridge_free(ptr >>> 0, 1));
    CreateSessionOptions = class {
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CreateSessionOptionsFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_createsessionoptions_free(ptr, 0);
      }
      constructor() {
        const ret = wasm.createsessionoptions_new();
        this.__wbg_ptr = ret >>> 0;
        CreateSessionOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * @param {string} format
       */
      set format(format) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.createsessionoptions_set_format(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @param {Uint8Array} artifact_content
       */
      set artifact_content(artifact_content) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ptr0 = passArray8ToWasm0(artifact_content, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.createsessionoptions_set_artifact_content(this.__wbg_ptr, ptr0, len0);
      }
    };
    if (Symbol.dispose) CreateSessionOptions.prototype[Symbol.dispose] = CreateSessionOptions.prototype.free;
    IncrDomDocClient = class _IncrDomDocClient {
      constructor() {
        throw new Error("cannot invoke `new` directly");
      }
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_IncrDomDocClient.prototype);
        obj.__wbg_ptr = ptr;
        IncrDomDocClientFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IncrDomDocClientFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_incrdomdocclient_free(ptr, 0);
      }
      /**
       * @param {any} functions
       */
      bind_functions(functions) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        wasm.incrdomdocclient_bind_functions(this.__wbg_ptr, addHeapObject(functions));
      }
      /**
       * Relayout the document in the given window.
       * @param {number} x
       * @param {number} y
       * @param {number} w
       * @param {number} h
       * @returns {Promise<boolean>}
       */
      relayout(x, y, w, h) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.incrdomdocclient_relayout(this.__wbg_ptr, x, y, w, h);
        return takeObject(ret);
      }
      /**
       * @param {number} page_num
       * @param {number} x
       * @param {number} y
       * @param {number} w
       * @param {number} h
       * @param {number} stage
       * @returns {boolean}
       */
      need_repaint(page_num, x, y, w, h, stage) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          _assertNum(page_num);
          _assertNum(stage);
          wasm.incrdomdocclient_need_repaint(retptr, this.__wbg_ptr, page_num, x, y, w, h, stage);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return r0 !== 0;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {number} page_num
       * @param {number} x
       * @param {number} y
       * @param {number} w
       * @param {number} h
       * @param {number} stage
       * @returns {any}
       */
      repaint(page_num, x, y, w, h, stage) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          _assertNum(page_num);
          _assertNum(stage);
          wasm.incrdomdocclient_repaint(retptr, this.__wbg_ptr, page_num, x, y, w, h, stage);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    if (Symbol.dispose) IncrDomDocClient.prototype[Symbol.dispose] = IncrDomDocClient.prototype.free;
    PageInfo = class _PageInfo {
      constructor() {
        throw new Error("cannot invoke `new` directly");
      }
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_PageInfo.prototype);
        obj.__wbg_ptr = ptr;
        PageInfoFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PageInfoFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pageinfo_free(ptr, 0);
      }
      /**
       * @returns {number}
       */
      get page_off() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pageinfo_page_off(this.__wbg_ptr);
        return ret >>> 0;
      }
      /**
       * @returns {number}
       */
      get width_pt() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pageinfo_width_pt(this.__wbg_ptr);
        return ret;
      }
      /**
       * @returns {number}
       */
      get height_pt() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pageinfo_height_pt(this.__wbg_ptr);
        return ret;
      }
    };
    if (Symbol.dispose) PageInfo.prototype[Symbol.dispose] = PageInfo.prototype.free;
    PagesInfo = class _PagesInfo {
      constructor() {
        throw new Error("cannot invoke `new` directly");
      }
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_PagesInfo.prototype);
        obj.__wbg_ptr = ptr;
        PagesInfoFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PagesInfoFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pagesinfo_free(ptr, 0);
      }
      /**
       * @returns {number}
       */
      get page_count() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pagesinfo_page_count(this.__wbg_ptr);
        return ret >>> 0;
      }
      /**
       * @param {number} num
       * @returns {PageInfo | undefined}
       */
      page_by_number(num) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        _assertNum(num);
        const ret = wasm.pagesinfo_page_by_number(this.__wbg_ptr, num);
        return ret === 0 ? void 0 : PageInfo.__wrap(ret);
      }
      /**
       * @param {number} i
       * @returns {PageInfo}
       */
      page(i) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        _assertNum(i);
        const ret = wasm.pagesinfo_page(this.__wbg_ptr, i);
        return PageInfo.__wrap(ret);
      }
      /**
       * @returns {number}
       */
      width() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pagesinfo_width(this.__wbg_ptr);
        return ret;
      }
      /**
       * @returns {number}
       */
      height() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pagesinfo_height(this.__wbg_ptr);
        return ret;
      }
    };
    if (Symbol.dispose) PagesInfo.prototype[Symbol.dispose] = PagesInfo.prototype.free;
    RenderPageImageOptions = class _RenderPageImageOptions {
      static __unwrap(jsValue) {
        if (!(jsValue instanceof _RenderPageImageOptions)) {
          return 0;
        }
        return jsValue.__destroy_into_raw();
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderPageImageOptionsFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_renderpageimageoptions_free(ptr, 0);
      }
      constructor() {
        const ret = wasm.renderpageimageoptions_new();
        this.__wbg_ptr = ret >>> 0;
        RenderPageImageOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * @returns {number | undefined}
       */
      get pixel_per_pt() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.renderpageimageoptions_pixel_per_pt(this.__wbg_ptr);
        return ret === 4294967297 ? void 0 : ret;
      }
      /**
       * @param {number | null} [pixel_per_pt]
       */
      set pixel_per_pt(pixel_per_pt) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(pixel_per_pt)) {
          _assertNum(pixel_per_pt);
        }
        wasm.renderpageimageoptions_set_pixel_per_pt(this.__wbg_ptr, isLikeNone(pixel_per_pt) ? 4294967297 : Math.fround(pixel_per_pt));
      }
      /**
       * @returns {string | undefined}
       */
      get background_color() {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          wasm.renderpageimageoptions_background_color(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [background_color]
       */
      set background_color(background_color) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(background_color) ? 0 : passStringToWasm0(background_color, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len0 = WASM_VECTOR_LEN;
        wasm.renderpageimageoptions_set_background_color(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @returns {number}
       */
      get page_off() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.renderpageimageoptions_page_off(this.__wbg_ptr);
        return ret >>> 0;
      }
      /**
       * @param {number} page_off
       */
      set page_off(page_off) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        _assertNum(page_off);
        wasm.renderpageimageoptions_set_page_off(this.__wbg_ptr, page_off);
      }
      /**
       * @returns {string | undefined}
       */
      get cache_key() {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          wasm.renderpageimageoptions_cache_key(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [cache_key]
       */
      set cache_key(cache_key) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(cache_key) ? 0 : passStringToWasm0(cache_key, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len0 = WASM_VECTOR_LEN;
        wasm.renderpageimageoptions_set_cache_key(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @returns {number | undefined}
       */
      get data_selection() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.renderpageimageoptions_data_selection(this.__wbg_ptr);
        return ret === 4294967297 ? void 0 : ret;
      }
      /**
       * @param {number | null} [data_selection]
       */
      set data_selection(data_selection) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(data_selection)) {
          _assertNum(data_selection);
        }
        wasm.renderpageimageoptions_set_data_selection(this.__wbg_ptr, isLikeNone(data_selection) ? 4294967297 : data_selection >>> 0);
      }
    };
    if (Symbol.dispose) RenderPageImageOptions.prototype[Symbol.dispose] = RenderPageImageOptions.prototype.free;
    RenderSession = class _RenderSession {
      constructor() {
        throw new Error("cannot invoke `new` directly");
      }
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_RenderSession.prototype);
        obj.__wbg_ptr = ptr;
        RenderSessionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderSessionFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rendersession_free(ptr, 0);
      }
      /**
       * @param {number} rect_lo_x
       * @param {number} rect_lo_y
       * @param {number} rect_hi_x
       * @param {number} rect_hi_y
       * @returns {string}
       */
      render_in_window(rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
        let deferred1_0;
        let deferred1_1;
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          wasm.rendersession_render_in_window(retptr, this.__wbg_ptr, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {number | undefined}
       */
      get pixel_per_pt() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_pixel_per_pt(this.__wbg_ptr);
        return ret === 4294967297 ? void 0 : ret;
      }
      /**
       * @param {number | null} [pixel_per_pt]
       */
      set pixel_per_pt(pixel_per_pt) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(pixel_per_pt)) {
          _assertNum(pixel_per_pt);
        }
        wasm.rendersession_set_pixel_per_pt(this.__wbg_ptr, isLikeNone(pixel_per_pt) ? 4294967297 : Math.fround(pixel_per_pt));
      }
      /**
       * @returns {string | undefined}
       */
      get background_color() {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          wasm.rendersession_background_color(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [background_color]
       */
      set background_color(background_color) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(background_color) ? 0 : passStringToWasm0(background_color, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len0 = WASM_VECTOR_LEN;
        wasm.rendersession_set_background_color(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @returns {PagesInfo}
       */
      get pages_info() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_pages_info(this.__wbg_ptr);
        return PagesInfo.__wrap(ret);
      }
      /**
       * @returns {number}
       */
      get doc_width() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_doc_width(this.__wbg_ptr);
        return ret;
      }
      /**
       * @returns {number}
       */
      get doc_height() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_doc_height(this.__wbg_ptr);
        return ret;
      }
      /**
       * @param {Uint32Array} path
       * @returns {string | undefined}
       */
      source_span(path) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          const ptr0 = passArray32ToWasm0(path, wasm.__wbindgen_export);
          const len0 = WASM_VECTOR_LEN;
          wasm.rendersession_source_span(retptr, this.__wbg_ptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          if (r3) {
            throw takeObject(r2);
          }
          let v2;
          if (r0 !== 0) {
            v2 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
          }
          return v2;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    if (Symbol.dispose) RenderSession.prototype[Symbol.dispose] = RenderSession.prototype.free;
    RenderSessionOptions = class {
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderSessionOptionsFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rendersessionoptions_free(ptr, 0);
      }
      constructor() {
        const ret = wasm.rendersessionoptions_new();
        this.__wbg_ptr = ret >>> 0;
        RenderSessionOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * @returns {number | undefined}
       */
      get pixel_per_pt() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_pixel_per_pt(this.__wbg_ptr);
        return ret === 4294967297 ? void 0 : ret;
      }
      /**
       * @param {number | null} [pixel_per_pt]
       */
      set pixel_per_pt(pixel_per_pt) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(pixel_per_pt)) {
          _assertNum(pixel_per_pt);
        }
        wasm.rendersession_set_pixel_per_pt(this.__wbg_ptr, isLikeNone(pixel_per_pt) ? 4294967297 : Math.fround(pixel_per_pt));
      }
      /**
       * @returns {string | undefined}
       */
      get background_color() {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          wasm.rendersessionoptions_background_color(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [background_color]
       */
      set background_color(background_color) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(background_color) ? 0 : passStringToWasm0(background_color, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len0 = WASM_VECTOR_LEN;
        wasm.rendersessionoptions_set_background_color(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @returns {string | undefined}
       */
      get format() {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          wasm.rendersessionoptions_format(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [format]
       */
      set format(format) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(format) ? 0 : passStringToWasm0(format, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len0 = WASM_VECTOR_LEN;
        wasm.rendersessionoptions_set_format(this.__wbg_ptr, ptr0, len0);
      }
    };
    if (Symbol.dispose) RenderSessionOptions.prototype[Symbol.dispose] = RenderSessionOptions.prototype.free;
    TypstRenderer = class _TypstRenderer {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TypstRenderer.prototype);
        obj.__wbg_ptr = ptr;
        TypstRendererFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstRendererFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typstrenderer_free(ptr, 0);
      }
      constructor() {
        const ret = wasm.typstrenderer_new();
        this.__wbg_ptr = ret >>> 0;
        TypstRendererFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * @param {CreateSessionOptions | null} [options]
       * @returns {RenderSession}
       */
      create_session(options) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          let ptr0 = 0;
          if (!isLikeNone(options)) {
            _assertClass(options, CreateSessionOptions);
            if (options.__wbg_ptr === 0) {
              throw new Error("Attempt to use a moved value");
            }
            ptr0 = options.__destroy_into_raw();
          }
          wasm.typstrenderer_create_session(retptr, this.__wbg_ptr, ptr0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return RenderSession.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {RenderSession} session
       */
      reset(session) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          _assertClass(session, RenderSession);
          if (session.__wbg_ptr === 0) {
            throw new Error("Attempt to use a moved value");
          }
          wasm.typstrenderer_reset(retptr, this.__wbg_ptr, session.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {RenderSession} session
       * @param {string} action
       * @param {Uint8Array} data
       */
      manipulate_data(session, action, data) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          _assertClass(session, RenderSession);
          if (session.__wbg_ptr === 0) {
            throw new Error("Attempt to use a moved value");
          }
          const ptr0 = passStringToWasm0(action, wasm.__wbindgen_export, wasm.__wbindgen_export2);
          const len0 = WASM_VECTOR_LEN;
          const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_export);
          const len1 = WASM_VECTOR_LEN;
          wasm.typstrenderer_manipulate_data(retptr, this.__wbg_ptr, session.__wbg_ptr, ptr0, len0, ptr1, len1);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {Uint8Array} artifact_content
       * @param {string} decoder
       * @returns {RenderSession}
       */
      session_from_artifact(artifact_content, decoder) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          const ptr0 = passArray8ToWasm0(artifact_content, wasm.__wbindgen_export);
          const len0 = WASM_VECTOR_LEN;
          const ptr1 = passStringToWasm0(decoder, wasm.__wbindgen_export, wasm.__wbindgen_export2);
          const len1 = WASM_VECTOR_LEN;
          wasm.typstrenderer_session_from_artifact(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return RenderSession.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {any} _v
       */
      load_glyph_pack(_v) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          wasm.typstrenderer_load_glyph_pack(retptr, this.__wbg_ptr, addHeapObject(_v));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {RenderSession} session
       * @param {number} rect_lo_x
       * @param {number} rect_lo_y
       * @param {number} rect_hi_x
       * @param {number} rect_hi_y
       * @returns {string}
       */
      render_svg_diff(session, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
        let deferred1_0;
        let deferred1_1;
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          _assertClass(session, RenderSession);
          if (session.__wbg_ptr === 0) {
            throw new Error("Attempt to use a moved value");
          }
          wasm.typstrenderer_render_svg_diff(retptr, this.__wbg_ptr, session.__wbg_ptr, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {RenderSession} session
       * @param {number | null} [parts]
       * @returns {string}
       */
      svg_data(session, parts) {
        let deferred2_0;
        let deferred2_1;
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          _assertClass(session, RenderSession);
          if (session.__wbg_ptr === 0) {
            throw new Error("Attempt to use a moved value");
          }
          if (!isLikeNone(parts)) {
            _assertNum(parts);
          }
          wasm.typstrenderer_svg_data(retptr, this.__wbg_ptr, session.__wbg_ptr, isLikeNone(parts) ? 4294967297 : parts >>> 0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * @param {RenderSession} session
       * @returns {Array<any> | undefined}
       */
      get_customs(session) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        _assertClass(session, RenderSession);
        if (session.__wbg_ptr === 0) {
          throw new Error("Attempt to use a moved value");
        }
        const ret = wasm.typstrenderer_get_customs(this.__wbg_ptr, session.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @param {RenderSession} session
       * @param {HTMLElement} root
       * @returns {boolean}
       */
      render_svg(session, root) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          _assertClass(session, RenderSession);
          if (session.__wbg_ptr === 0) {
            throw new Error("Attempt to use a moved value");
          }
          wasm.typstrenderer_render_svg(retptr, this.__wbg_ptr, session.__wbg_ptr, addHeapObject(root));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return r0 !== 0;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {any} _w
       * @returns {Promise<TypstWorker>}
       */
      create_worker(_w) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstrenderer_create_worker(this.__wbg_ptr, addHeapObject(_w));
        return takeObject(ret);
      }
      /**
       * @returns {WorkerBridge}
       */
      create_worker_bridge() {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const ptr = this.__destroy_into_raw();
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(ptr);
          wasm.typstrenderer_create_worker_bridge(retptr, ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return WorkerBridge.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {RenderSession} ses
       * @param {any} canvas
       * @param {RenderPageImageOptions | null} [options]
       * @returns {Promise<any>}
       */
      render_page_to_canvas(ses, canvas, options) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        _assertClass(ses, RenderSession);
        if (ses.__wbg_ptr === 0) {
          throw new Error("Attempt to use a moved value");
        }
        let ptr0 = 0;
        if (!isLikeNone(options)) {
          _assertClass(options, RenderPageImageOptions);
          if (options.__wbg_ptr === 0) {
            throw new Error("Attempt to use a moved value");
          }
          ptr0 = options.__destroy_into_raw();
        }
        const ret = wasm.typstrenderer_render_page_to_canvas(this.__wbg_ptr, ses.__wbg_ptr, addHeapObject(canvas), ptr0);
        return takeObject(ret);
      }
      /**
       * @param {RenderSession} ses
       * @param {HTMLElement} elem
       * @returns {Promise<IncrDomDocClient>}
       */
      mount_dom(ses, elem) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        _assertClass(ses, RenderSession);
        if (ses.__wbg_ptr === 0) {
          throw new Error("Attempt to use a moved value");
        }
        const ret = wasm.typstrenderer_mount_dom(this.__wbg_ptr, ses.__wbg_ptr, addHeapObject(elem));
        return takeObject(ret);
      }
    };
    if (Symbol.dispose) TypstRenderer.prototype[Symbol.dispose] = TypstRenderer.prototype.free;
    TypstRendererBuilder = class {
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstRendererBuilderFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typstrendererbuilder_free(ptr, 0);
      }
      constructor() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.typstrendererbuilder_new(retptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          TypstRendererBuilderFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {Promise<TypstRenderer>}
       */
      build() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        const ptr = this.__destroy_into_raw();
        _assertNum(ptr);
        const ret = wasm.typstrendererbuilder_build(ptr);
        return takeObject(ret);
      }
      /**
       * @param {any} _pack
       * @returns {Promise<void>}
       */
      add_glyph_pack(_pack) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstrendererbuilder_add_glyph_pack(this.__wbg_ptr, addHeapObject(_pack));
        return takeObject(ret);
      }
      /**
       * @param {Uint8Array} _font_buffer
       * @returns {Promise<void>}
       */
      add_raw_font(_font_buffer) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstrendererbuilder_add_raw_font(this.__wbg_ptr, addHeapObject(_font_buffer));
        return takeObject(ret);
      }
      /**
       * @param {any} _font
       * @param {any} _blob
       * @returns {Promise<void>}
       */
      add_lazy_font(_font, _blob) {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstrendererbuilder_add_lazy_font(this.__wbg_ptr, addHeapObject(_font), addHeapObject(_blob));
        return takeObject(ret);
      }
    };
    if (Symbol.dispose) TypstRendererBuilder.prototype[Symbol.dispose] = TypstRendererBuilder.prototype.free;
    TypstWorker = class {
      constructor() {
        throw new Error("cannot invoke `new` directly");
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstWorkerFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typstworker_free(ptr, 0);
      }
      /**
       * @param {string} _action
       * @param {Uint8Array} _data
       * @returns {Promise<any>}
       */
      manipulate_data(_action, _data) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          const ptr0 = passStringToWasm0(_action, wasm.__wbindgen_export, wasm.__wbindgen_export2);
          const len0 = WASM_VECTOR_LEN;
          wasm.typstworker_manipulate_data(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(_data));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {Promise<any>}
       */
      get_pages_info() {
        if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstworker_get_pages_info(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @param {Uint8Array} _actions
       * @param {HTMLCanvasElement[]} _canvas_list
       * @param {RenderPageImageOptions[]} _data
       * @returns {Promise<any>}
       */
      render_canvas(_actions, _canvas_list, _data) {
        try {
          if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertNum(this.__wbg_ptr);
          const ptr0 = passArray8ToWasm0(_actions, wasm.__wbindgen_export);
          const len0 = WASM_VECTOR_LEN;
          const ptr1 = passArrayJsValueToWasm0(_canvas_list, wasm.__wbindgen_export);
          const len1 = WASM_VECTOR_LEN;
          const ptr2 = passArrayJsValueToWasm0(_data, wasm.__wbindgen_export);
          const len2 = WASM_VECTOR_LEN;
          wasm.typstworker_render_canvas(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    if (Symbol.dispose) TypstWorker.prototype[Symbol.dispose] = TypstWorker.prototype.free;
    WorkerBridge = class _WorkerBridge {
      constructor() {
        throw new Error("cannot invoke `new` directly");
      }
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_WorkerBridge.prototype);
        obj.__wbg_ptr = ptr;
        WorkerBridgeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WorkerBridgeFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_workerbridge_free(ptr, 0);
      }
    };
    if (Symbol.dispose) WorkerBridge.prototype[Symbol.dispose] = WorkerBridge.prototype.free;
    EXPECTED_RESPONSE_TYPES = /* @__PURE__ */ new Set(["basic", "cors", "default"]);
    typst_ts_renderer_default = __wbg_init;
    importWasmModule = async function(wasm_name, url) {
      throw new Error("Cannot import wasm module without importer: " + wasm_name + " " + url);
    };
  }
});

// node_modules/@myriaddreamin/typst-ts-renderer/pkg/wasm-pack-shim.mjs
var wasm_pack_shim_exports = {};
__export(wasm_pack_shim_exports, {
  CreateSessionOptions: () => CreateSessionOptions,
  IncrDomDocClient: () => IncrDomDocClient,
  PageInfo: () => PageInfo,
  PagesInfo: () => PagesInfo,
  RenderPageImageOptions: () => RenderPageImageOptions,
  RenderSession: () => RenderSession,
  RenderSessionOptions: () => RenderSessionOptions,
  TypstRenderer: () => TypstRenderer,
  TypstRendererBuilder: () => TypstRendererBuilder,
  TypstWorker: () => TypstWorker,
  WorkerBridge: () => WorkerBridge,
  default: () => wasm_pack_shim_default,
  initSync: () => initSync,
  renderer_build_info: () => renderer_build_info,
  setImportWasmModule: () => setImportWasmModule
});
var wasm_pack_shim_default, nodeJsImportWasmModule, isNode;
var init_wasm_pack_shim = __esm({
  "node_modules/@myriaddreamin/typst-ts-renderer/pkg/wasm-pack-shim.mjs"() {
    init_typst_ts_renderer();
    init_typst_ts_renderer();
    init_typst_ts_renderer();
    wasm_pack_shim_default = typst_ts_renderer_default;
    nodeJsImportWasmModule = async function(wasm_name, url) {
      const escapeImport = new Function("m", "return import(m)");
      const { readFileSync } = await escapeImport("fs");
      const wasmPath = new URL(wasm_name, url);
      return await readFileSync(wasmPath).buffer;
    };
    isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
    if (isNode) {
      setImportWasmModule(nodeJsImportWasmModule);
    }
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/renderer.mjs
var renderer_exports = {};
__export(renderer_exports, {
  RenderSession: () => RenderSession2,
  TypstRendererDriver: () => TypstRendererDriver,
  TypstWorker: () => TypstWorker2,
  createTypstRenderer: () => createTypstRenderer,
  rendererBuildInfo: () => rendererBuildInfo
});
function createTypstRenderer() {
  return new TypstRendererDriver();
}
async function rendererBuildInfo() {
  const renderModule = await Promise.resolve().then(() => (init_wasm_pack_shim(), wasm_pack_shim_exports));
  return renderModule.renderer_build_info();
}
var RenderSession2, ManageStatus, TypstWorker2, gRendererModule, warnOnceCanvasSet, TypstRendererDriver;
var init_renderer = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/renderer.mjs"() {
    init_internal_types();
    init_view();
    init_wasm();
    init_init();
    init_dom();
    RenderSession2 = class {
      plugin;
      /**
       * @internal
       */
      [kObject];
      /**
       * @internal
       */
      constructor(plugin, o) {
        this.plugin = plugin;
        this[kObject] = o;
      }
      /**
       * @deprecated set in {@link RenderToCanvasOptions} instead
       *
       * Set the background color of the Typst document.
       * @param {string} t - The background color in format of `^#?[0-9a-f]{6}$`
       *
       * Note: Default to `#ffffff`.
       *
       * Note: Only available in canvas rendering mode.
       */
      set backgroundColor(t) {
        if (t !== void 0) {
          this[kObject].background_color = t;
        }
      }
      /**
       * Get the background color of the Typst document.
       *
       * Note: Default to `#ffffff`.
       *
       * Note: Only available in canvas rendering mode.
       */
      get backgroundColor() {
        return this[kObject].background_color;
      }
      /**
       * Set the pixel per point scale up the canvas panel.
       *
       * Note: Default to `3`.
       *
       * Note: Only available in canvas rendering mode.
       */
      set pixelPerPt(t) {
        if (t !== void 0) {
          this[kObject].pixel_per_pt = t;
        }
      }
      /**
       * @deprecated set in {@link RenderToCanvasOptions} instead
       *
       * Get the pixel per point scale up the canvas panel.
       *
       * Note: Default to `3`.
       *
       * Note: Only available in canvas rendering mode.
       */
      get pixelPerPt() {
        return this[kObject].pixel_per_pt;
      }
      /**
       * Reset state
       */
      reset() {
        this.plugin.resetSession(this);
      }
      /**
       * @deprecated
       * use {@link docWidth} instead
       */
      get doc_width() {
        return this[kObject].doc_width;
      }
      get docWidth() {
        return this[kObject].doc_width;
      }
      /**
       * @deprecated
       * use {@link docHeight} instead
       */
      get doc_height() {
        return this[kObject].doc_height;
      }
      get docHeight() {
        return this[kObject].doc_height;
      }
      retrievePagesInfo() {
        const pages_info = this[kObject].pages_info;
        const pageInfos = [];
        const pageCount = pages_info.page_count;
        for (let i = 0; i < pageCount; i++) {
          const pageAst = pages_info.page(i);
          pageInfos.push({
            pageOffset: pageAst.page_off,
            width: pageAst.width_pt,
            height: pageAst.height_pt
          });
        }
        return pageInfos;
      }
      getSourceLoc(path) {
        return this[kObject].source_span(path);
      }
      /**
       * See {@link TypstRenderer#renderSvg} for more details.
       */
      renderSvg(options) {
        return this.plugin.renderSvg({
          renderSession: this,
          ...options
        });
      }
      /**
       * See {@link TypstRenderer#renderToSvg} for more details.
       */
      renderToSvg(options) {
        return this.plugin.renderToSvg({
          renderSession: this,
          ...options
        });
      }
      /**
       * See {@link TypstRenderer#renderCanvas} for more details.
       */
      renderCanvas(options) {
        return this.plugin.renderCanvas({
          renderSession: this,
          ...options
        });
      }
      /**
       * See {@link TypstRenderer#manipulateData} for more details.
       */
      manipulateData(opts) {
        this.plugin.manipulateData({
          renderSession: this,
          ...opts
        });
      }
      /**
       * See {@link TypstRenderer#renderSvgDiff} for more details.
       */
      renderSvgDiff(opts) {
        return this.plugin.renderSvgDiff({
          renderSession: this,
          ...opts
        });
      }
      /**
       * @deprecated
       * use {@link getSourceLoc} instead
       */
      get_source_loc(path) {
        return this[kObject].source_span(path);
      }
      /**
       * @deprecated
       * use {@link renderSvgDiff} instead
       */
      render_in_window(rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
        return this[kObject].render_in_window(rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
      }
      /**
       * @deprecated
       * use {@link manipulateData} instead
       */
      merge_delta(data) {
        this.plugin.manipulateData({
          renderSession: this,
          action: "merge",
          data
        });
      }
    };
    (function(ManageStatus2) {
      ManageStatus2[ManageStatus2["Delete"] = 0] = "Delete";
      ManageStatus2[ManageStatus2["New"] = 1] = "New";
      ManageStatus2[ManageStatus2["Update"] = 2] = "Update";
    })(ManageStatus || (ManageStatus = {}));
    TypstWorker2 = class {
      plugin;
      /**
       * @internal
       */
      [kObject];
      /**
       * @internal
       */
      constructor(plugin, o) {
        this.plugin = plugin;
        this[kObject] = o;
      }
      /**
       * See {@link TypstRenderer#manipulateData} for more details.
       */
      manipulateData(action, data) {
        return this[kObject].manipulate_data(action, data);
      }
      /**
       * @internal
       */
      managedCanvasElemList = /* @__PURE__ */ new Map();
      /**
       * @internal
       */
      canvasCounter = Math.random();
      /**
       * You must submit all canvas in pages to ensure synchronization with the background worker
       *
       * See {@link TypstRenderer#renderCanvas} for more details.
       */
      renderCanvas(canvasElemList) {
        const m = this.managedCanvasElemList;
        for (const [_, elem] of m) {
          elem[0] = ManageStatus.Delete;
        }
        for (const elem of canvasElemList) {
          const canvas = elem.canvas;
          let elemId = canvas.dataset.manageId;
          let action = ManageStatus.Update;
          if (!elemId) {
            elemId = this.canvasCounter.toFixed(5);
            this.canvasCounter += 1;
            canvas.dataset.manageId = elemId;
            action = ManageStatus.New;
          }
          let prev = m.get(elemId);
          if (prev && prev[0] !== ManageStatus.Delete) {
            throw new Error("cannot update a canvas for two times in batch");
          }
          m.set(elemId, [action, { ...elem }]);
        }
        const entries = Array.from(m.entries());
        const actions = new Uint8Array(entries.length);
        const elements = new Array(entries.length);
        const options = entries.map(([key, [action, elem]], index) => {
          if (!action) {
            m.delete(key);
          }
          actions[index] = action;
          elements[index] = elem.canvas;
          return this.plugin.canvasOptionsToRust(elem);
        });
        return this[kObject].render_canvas(actions, elements, options);
      }
      async retrievePagesInfo() {
        const pages_info = await this[kObject].get_pages_info();
        console.log(pages_info);
        const pageInfos = [];
        const pageCount = pages_info.page_count;
        for (let i = 0; i < pageCount; i++) {
          const pageAst = pages_info.page(i);
          pageInfos.push({
            pageOffset: pageAst.page_off,
            width: pageAst.width_pt,
            height: pageAst.height_pt
          });
        }
        return pageInfos;
      }
    };
    gRendererModule = (module) => new LazyWasmModule(async (bin) => {
      return await module.default(bin);
    });
    warnOnceCanvasSet = true;
    TypstRendererDriver = class {
      renderer;
      rendererJs;
      constructor() {
      }
      async init(options) {
        this.rendererJs = await (options?.getWrapper?.() || Promise.resolve().then(() => (init_wasm_pack_shim(), wasm_pack_shim_exports)));
        const TypstRendererBuilder2 = this.rendererJs.TypstRendererBuilder;
        this.renderer = await buildComponent(options, gRendererModule(this.rendererJs), TypstRendererBuilder2, {});
      }
      loadGlyphPack(_pack) {
        return Promise.resolve();
      }
      createOptionsToRust(options) {
        const rustOptions = new this.rendererJs.CreateSessionOptions();
        if (options.format !== void 0) {
          rustOptions.format = options.format;
        }
        if (options.artifactContent !== void 0) {
          rustOptions.artifact_content = options.artifactContent;
        }
        return rustOptions;
      }
      canvasOptionsToRust(options) {
        const rustOptions = new this.rendererJs.RenderPageImageOptions();
        if (options.pageOffset === void 0) {
          throw new Error("pageOffset is required in reflexo v0.5.0");
        } else {
          rustOptions.page_off = options.pageOffset;
        }
        if (options.cacheKey !== void 0) {
          rustOptions.cache_key = options.cacheKey;
        }
        if (options.backgroundColor !== void 0) {
          rustOptions.background_color = options.backgroundColor;
        }
        if (options.pixelPerPt !== void 0) {
          rustOptions.pixel_per_pt = options.pixelPerPt;
        }
        if (options.dataSelection !== void 0) {
          let encoded = 0;
          if (options.dataSelection.body) {
            encoded |= 1 << 0;
          } else if (options.canvas && warnOnceCanvasSet) {
            warnOnceCanvasSet = false;
            console.warn("dataSelection.body is not set but providing canvas for body");
          }
          if (options.dataSelection.text || options.dataSelection.annotation) {
            console.error("dataSelection.text and dataSelection.annotation are deprecated");
          }
          if (options.dataSelection.semantics) {
            encoded |= 1 << 3;
          }
          rustOptions.data_selection = encoded;
        }
        return rustOptions;
      }
      retrievePagesInfoFromSession(session) {
        return session.retrievePagesInfo();
      }
      /**
       * Render a Typst document to canvas.
       */
      renderCanvas(options) {
        return this.withinOptionSession(options, async (sessionRef) => {
          return this.renderer.render_page_to_canvas(sessionRef[kObject], options.canvas || void 0, this.canvasOptionsToRust(options));
        });
      }
      // async renderPdf(artifactContent: string): Promise<Uint8Array> {
      // return this.renderer.render_to_pdf(artifactContent);
      // }
      async inAnimationFrame(fn) {
        return new Promise((resolve, reject) => {
          requestAnimationFrame(() => {
            try {
              resolve(fn());
            } catch (e) {
              reject(e);
            }
          });
        });
      }
      async renderDisplayLayer(session, canvasList, options) {
        const pages_info = session[kObject].pages_info;
        const page_count = pages_info.page_count;
        const doRender = async (i, page_off) => {
          const canvas = canvasList[i];
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            throw new Error("canvas context is null");
          }
          return await this.renderCanvas({
            ...options,
            canvas: ctx,
            renderSession: session,
            pageOffset: page_off
          });
        };
        const t = performance.now();
        const textContentList = await (async () => {
          const results = [];
          for (let i = 0; i < page_count; i++) {
            results.push(await this.inAnimationFrame(() => doRender(i, i)));
          }
          return results;
        })();
        const t2 = performance.now();
        console.log(`display layer used: render = ${(t2 - t).toFixed(1)}ms`);
        return textContentList;
      }
      renderTextLayer(layerList, textSourceList) {
        const t2 = performance.now();
        layerList.forEach((layer, i) => {
          layer.innerHTML = textSourceList[i].htmlSemantics[0];
        });
        const t3 = performance.now();
        console.log(`text layer used: render = ${(t3 - t2).toFixed(1)}ms`);
      }
      async render(options) {
        if ("format" in options) {
          if (options.format !== "vector") {
            const artifactFormats = ["serde_json", "js", "ir"];
            if (artifactFormats.includes(options.format)) {
              throw new Error(`deprecated format ${options.format}, please use vector format`);
            }
          }
        }
        return this.renderToCanvas(options);
      }
      async renderDom(options) {
        if ("format" in options) {
          if (options.format !== "vector") {
            const artifactFormats = ["serde_json", "js", "ir"];
            if (artifactFormats.includes(options.format)) {
              throw new Error(`deprecated format ${options.format}, please use vector format`);
            }
          }
        }
        return this.withinOptionSession(options, async (sessionRef) => {
          const t = new TypstDomDocument({
            ...options,
            renderMode: "dom",
            hookedElem: options.container,
            kModule: sessionRef,
            renderer: this
          });
          t;
          await t.impl.mountDom(options.pixelPerPt);
          return t;
        });
      }
      async renderToCanvas(options) {
        let session;
        let renderPageResults;
        const mountContainer = options.container;
        mountContainer.style.visibility = "hidden";
        const doRenderDisplayLayer = async (canvasList, resetLayout) => {
          try {
            renderPageResults = await this.renderDisplayLayer(session, canvasList, options);
            resetLayout();
          } finally {
            mountContainer.style.visibility = "visible";
          }
        };
        return this.withinOptionSession(options, async (sessionRef) => {
          session = sessionRef;
          if (session[kObject].pages_info.page_count === 0) {
            throw new Error(`No page found in session`);
          }
          if (options.pixelPerPt !== void 0 && options.pixelPerPt <= 0) {
            throw new Error("Invalid typst.RenderOptions.pixelPerPt, should be a positive number " + options.pixelPerPt);
          }
          let backgroundColor = options.backgroundColor;
          if (backgroundColor !== void 0) {
            if (!/^#[0-9a-f]{6}$/.test(backgroundColor)) {
              throw new Error("Invalid typst.backgroundColor color for matching ^#?[0-9a-f]{6}$ " + backgroundColor);
            }
          }
          session.pixelPerPt = options.pixelPerPt ?? TypstDefaultParams.PIXEL_PER_PT;
          session.backgroundColor = backgroundColor ?? "#ffffff";
          const t = performance.now();
          const pageView = new RenderView(this.retrievePagesInfoFromSession(session), mountContainer, options);
          const t2 = performance.now();
          console.log(`layer used: retrieve = ${(t2 - t).toFixed(1)}ms`);
          await doRenderDisplayLayer(pageView.canvasList, () => pageView.resetLayout());
          this.renderTextLayer(pageView.textLayerList, renderPageResults);
          return;
        });
      }
      createModule(b) {
        return Promise.resolve(new RenderSession2(this, this.renderer.create_session(b && this.createOptionsToRust({
          format: "vector",
          artifactContent: b
        }))));
      }
      async createWorkerV0(worker) {
        return new TypstWorker2(this, await this.renderer.create_worker(worker));
      }
      workerBridge() {
        return this.renderer.create_worker_bridge();
      }
      renderSvg(options, container) {
        if (options instanceof RenderSession2 || container) {
          throw new Error("removed api, please use renderToSvg({ renderSession, container }) instead");
        }
        return this.withinOptionSession(options, async (sessionRef) => {
          let parts = void 0;
          if (options.data_selection) {
            parts = 0;
            if (options.data_selection.body) {
              parts |= 1 << 0;
            }
            if (options.data_selection.defs) {
              parts |= 1 << 1;
            }
            if (options.data_selection.css) {
              parts |= 1 << 2;
            }
            if (options.data_selection.js) {
              parts |= 1 << 3;
            }
          }
          return Promise.resolve(this.renderer.svg_data(sessionRef[kObject], parts));
        });
      }
      renderSvgDiff(options) {
        if (!options.window) {
          return this.renderer.render_svg_diff(options.renderSession[kObject], 0, 0, 1e33, 1e33);
        }
        return this.renderer.render_svg_diff(options.renderSession[kObject], options.window.lo.x, options.window.lo.y, options.window.hi.x, options.window.hi.y);
      }
      renderToSvg(options) {
        return this.withinOptionSession(options, async (sessionRef) => {
          return Promise.resolve(this.renderer.render_svg(sessionRef[kObject], options.container));
        });
      }
      getCustomV1(options) {
        return Promise.resolve(this.renderer.get_customs(options.renderSession[kObject]));
      }
      resetSession(session) {
        return this.renderer.reset(session[kObject]);
      }
      manipulateData(opts) {
        return this.renderer.manipulate_data(opts.renderSession[kObject], opts.action ?? "reset", opts.data);
      }
      withinOptionSession(options, fn) {
        function isRenderByContentOption(options2) {
          return "artifactContent" in options2;
        }
        if ("renderSession" in options) {
          return fn(options.renderSession);
        }
        if (isRenderByContentOption(options)) {
          return this.runWithSession(options, fn);
        }
        throw new Error("Invalid render options, should be one of RenderByContentOptions|RenderBySessionOptions");
      }
      async runWithSession(arg1, arg2) {
        let options = arg1;
        let fn = arg2;
        if (!arg2) {
          options = void 0;
          fn = arg1;
        }
        const session = this.renderer.create_session(
          /* moved */
          options && this.createOptionsToRust(options)
        );
        try {
          const res = await fn(new RenderSession2(this, session));
          session.free();
          return res;
        } catch (e) {
          session.free();
          throw e;
        }
      }
    };
  }
});

// node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs
function addHeapObject2(obj) {
  if (heap_next2 === heap2.length) heap2.push(heap2.length + 1);
  const idx = heap_next2;
  heap_next2 = heap2[idx];
  heap2[idx] = obj;
  return idx;
}
function _assertClass2(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
function debugString2(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString2(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString2(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
function dropObject2(idx) {
  if (idx < 132) return;
  heap2[idx] = heap_next2;
  heap_next2 = idx;
}
function getArrayJsValueFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  const mem = getDataViewMemory02();
  const result = [];
  for (let i = ptr; i < ptr + 4 * len; i += 4) {
    result.push(takeObject2(mem.getUint32(i, true)));
  }
  return result;
}
function getArrayU32FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint32ArrayMemory02().subarray(ptr / 4, ptr / 4 + len);
}
function getArrayU8FromWasm02(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory02().subarray(ptr / 1, ptr / 1 + len);
}
function getDataViewMemory02() {
  if (cachedDataViewMemory02 === null || cachedDataViewMemory02.buffer.detached === true || cachedDataViewMemory02.buffer.detached === void 0 && cachedDataViewMemory02.buffer !== wasm2.memory.buffer) {
    cachedDataViewMemory02 = new DataView(wasm2.memory.buffer);
  }
  return cachedDataViewMemory02;
}
function getStringFromWasm02(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText2(ptr, len);
}
function getUint32ArrayMemory02() {
  if (cachedUint32ArrayMemory02 === null || cachedUint32ArrayMemory02.byteLength === 0) {
    cachedUint32ArrayMemory02 = new Uint32Array(wasm2.memory.buffer);
  }
  return cachedUint32ArrayMemory02;
}
function getUint8ArrayMemory02() {
  if (cachedUint8ArrayMemory02 === null || cachedUint8ArrayMemory02.byteLength === 0) {
    cachedUint8ArrayMemory02 = new Uint8Array(wasm2.memory.buffer);
  }
  return cachedUint8ArrayMemory02;
}
function getObject2(idx) {
  return heap2[idx];
}
function handleError2(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm2.__wbindgen_export3(addHeapObject2(e));
  }
}
function isLikeNone2(x) {
  return x === void 0 || x === null;
}
function makeMutClosure2(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      state.a = a;
      real._wbg_cb_unref();
    }
  };
  real._wbg_cb_unref = () => {
    if (--state.cnt === 0) {
      state.dtor(state.a, state.b);
      state.a = 0;
      CLOSURE_DTORS2.unregister(state);
    }
  };
  CLOSURE_DTORS2.register(real, state, state);
  return real;
}
function passArray8ToWasm02(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory02().set(arg, ptr / 1);
  WASM_VECTOR_LEN2 = arg.length;
  return ptr;
}
function passArrayJsValueToWasm02(array, malloc) {
  const ptr = malloc(array.length * 4, 4) >>> 0;
  const mem = getDataViewMemory02();
  for (let i = 0; i < array.length; i++) {
    mem.setUint32(ptr + 4 * i, addHeapObject2(array[i]), true);
  }
  WASM_VECTOR_LEN2 = array.length;
  return ptr;
}
function passStringToWasm02(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder2.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory02().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN2 = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory02();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory02().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder2.encodeInto(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN2 = offset;
  return ptr;
}
function takeObject2(idx) {
  const ret = getObject2(idx);
  dropObject2(idx);
  return ret;
}
function decodeText2(ptr, len) {
  numBytesDecoded2 += len;
  if (numBytesDecoded2 >= MAX_SAFARI_DECODE_BYTES2) {
    cachedTextDecoder2 = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder2.decode();
    numBytesDecoded2 = len;
  }
  return cachedTextDecoder2.decode(getUint8ArrayMemory02().subarray(ptr, ptr + len));
}
function __wasm_bindgen_func_elem_944(arg0, arg1, arg2) {
  wasm2.__wasm_bindgen_func_elem_944(arg0, arg1, addHeapObject2(arg2));
}
function __wasm_bindgen_func_elem_37350(arg0, arg1, arg2, arg3) {
  wasm2.__wasm_bindgen_func_elem_37350(arg0, arg1, addHeapObject2(arg2), addHeapObject2(arg3));
}
function get_font_info(buffer) {
  const ret = wasm2.get_font_info(addHeapObject2(buffer));
  return takeObject2(ret);
}
async function __wbg_load2(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && EXPECTED_RESPONSE_TYPES2.has(module.type);
        if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports2() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg_Error_52673b7de5a0ca89 = function(arg0, arg1) {
    const ret = Error(getStringFromWasm02(arg0, arg1));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_Number_2d1dcfcf4ec51736 = function(arg0) {
    const ret = Number(getObject2(arg0));
    return ret;
  };
  imports.wbg.__wbg___wbindgen_bigint_get_as_i64_6e32f5e6aff02e1d = function(arg0, arg1) {
    const v = getObject2(arg1);
    const ret = typeof v === "bigint" ? v : void 0;
    getDataViewMemory02().setBigInt64(arg0 + 8 * 1, isLikeNone2(ret) ? BigInt(0) : ret, true);
    getDataViewMemory02().setInt32(arg0 + 4 * 0, !isLikeNone2(ret), true);
  };
  imports.wbg.__wbg___wbindgen_boolean_get_dea25b33882b895b = function(arg0) {
    const v = getObject2(arg0);
    const ret = typeof v === "boolean" ? v : void 0;
    return isLikeNone2(ret) ? 16777215 : ret ? 1 : 0;
  };
  imports.wbg.__wbg___wbindgen_debug_string_adfb662ae34724b6 = function(arg0, arg1) {
    const ret = debugString2(getObject2(arg1));
    const ptr1 = passStringToWasm02(ret, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN2;
    getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg___wbindgen_in_0d3e1e8f0c669317 = function(arg0, arg1) {
    const ret = getObject2(arg0) in getObject2(arg1);
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_bigint_0e1a2e3f55cfae27 = function(arg0) {
    const ret = typeof getObject2(arg0) === "bigint";
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_function_8d400b8b1af978cd = function(arg0) {
    const ret = typeof getObject2(arg0) === "function";
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_object_ce774f3490692386 = function(arg0) {
    const val = getObject2(arg0);
    const ret = typeof val === "object" && val !== null;
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_string_704ef9c8fc131030 = function(arg0) {
    const ret = typeof getObject2(arg0) === "string";
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_undefined_f6b95eab589e0269 = function(arg0) {
    const ret = getObject2(arg0) === void 0;
    return ret;
  };
  imports.wbg.__wbg___wbindgen_jsval_eq_b6101cc9cef1fe36 = function(arg0, arg1) {
    const ret = getObject2(arg0) === getObject2(arg1);
    return ret;
  };
  imports.wbg.__wbg___wbindgen_jsval_loose_eq_766057600fdd1b0d = function(arg0, arg1) {
    const ret = getObject2(arg0) == getObject2(arg1);
    return ret;
  };
  imports.wbg.__wbg___wbindgen_number_get_9619185a74197f95 = function(arg0, arg1) {
    const obj = getObject2(arg1);
    const ret = typeof obj === "number" ? obj : void 0;
    getDataViewMemory02().setFloat64(arg0 + 8 * 1, isLikeNone2(ret) ? 0 : ret, true);
    getDataViewMemory02().setInt32(arg0 + 4 * 0, !isLikeNone2(ret), true);
  };
  imports.wbg.__wbg___wbindgen_string_get_a2a31e16edf96e42 = function(arg0, arg1) {
    const obj = getObject2(arg1);
    const ret = typeof obj === "string" ? obj : void 0;
    var ptr1 = isLikeNone2(ret) ? 0 : passStringToWasm02(ret, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN2;
    getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
    throw new Error(getStringFromWasm02(arg0, arg1));
  };
  imports.wbg.__wbg__wbg_cb_unref_87dfb5aaa0cbcea7 = function(arg0) {
    getObject2(arg0)._wbg_cb_unref();
  };
  imports.wbg.__wbg_call_3020136f7a2d6e44 = function() {
    return handleError2(function(arg0, arg1, arg2) {
      const ret = getObject2(arg0).call(getObject2(arg1), getObject2(arg2));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_78f94eb02ec7f9b2 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4) {
      const ret = getObject2(arg0).call(getObject2(arg1), getObject2(arg2), getObject2(arg3), getObject2(arg4));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_abb4ff46ce38be40 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = getObject2(arg0).call(getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_done_62ea16af4ce34b24 = function(arg0) {
    const ret = getObject2(arg0).done;
    return ret;
  };
  imports.wbg.__wbg_entries_83c79938054e065f = function(arg0) {
    const ret = Object.entries(getObject2(arg0));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
      deferred0_0 = arg0;
      deferred0_1 = arg1;
      console.error(getStringFromWasm02(arg0, arg1));
    } finally {
      wasm2.__wbindgen_export4(deferred0_0, deferred0_1, 1);
    }
  };
  imports.wbg.__wbg_error_85faeb8919b11cc6 = function(arg0, arg1, arg2) {
    console.error(getObject2(arg0), getObject2(arg1), getObject2(arg2));
  };
  imports.wbg.__wbg_getTimezoneOffset_45389e26d6f46823 = function(arg0) {
    const ret = getObject2(arg0).getTimezoneOffset();
    return ret;
  };
  imports.wbg.__wbg_get_6b7bd52aca3f9671 = function(arg0, arg1) {
    const ret = getObject2(arg0)[arg1 >>> 0];
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_get_af9dab7e9603ea93 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = Reflect.get(getObject2(arg0), getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_get_with_ref_key_1dc361bd10053bfe = function(arg0, arg1) {
    const ret = getObject2(arg0)[getObject2(arg1)];
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_info_ce6bcc489c22f6f0 = function(arg0) {
    console.info(getObject2(arg0));
  };
  imports.wbg.__wbg_instanceof_ArrayBuffer_f3320d2419cd0355 = function(arg0) {
    let result;
    try {
      result = getObject2(arg0) instanceof ArrayBuffer;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Map_084be8da74364158 = function(arg0) {
    let result;
    try {
      result = getObject2(arg0) instanceof Map;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Uint8Array_da54ccc9d3e09434 = function(arg0) {
    let result;
    try {
      result = getObject2(arg0) instanceof Uint8Array;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_isArray_51fd9e6422c0a395 = function(arg0) {
    const ret = Array.isArray(getObject2(arg0));
    return ret;
  };
  imports.wbg.__wbg_isSafeInteger_ae7d3f054d55fa16 = function(arg0) {
    const ret = Number.isSafeInteger(getObject2(arg0));
    return ret;
  };
  imports.wbg.__wbg_iterator_27b7c8b35ab3e86b = function() {
    const ret = Symbol.iterator;
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_length_22ac23eaec9d8053 = function(arg0) {
    const ret = getObject2(arg0).length;
    return ret;
  };
  imports.wbg.__wbg_length_d45040a40c570362 = function(arg0) {
    const ret = getObject2(arg0).length;
    return ret;
  };
  imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
    const ret = new Object();
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_25f239778d6112b9 = function() {
    const ret = new Array();
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_6421f6084cc5bc5a = function(arg0) {
    const ret = new Uint8Array(getObject2(arg0));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
    const ret = new Error();
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_b2db8aa2650f793a = function(arg0) {
    const ret = new Date(getObject2(arg0));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_df1173567d5ff028 = function(arg0, arg1) {
    const ret = new Error(getStringFromWasm02(arg0, arg1));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_ff12d2b041fb48f1 = function(arg0, arg1) {
    try {
      var state0 = { a: arg0, b: arg1 };
      var cb0 = (arg02, arg12) => {
        const a = state0.a;
        state0.a = 0;
        try {
          return __wasm_bindgen_func_elem_37350(a, state0.b, arg02, arg12);
        } finally {
          state0.a = a;
        }
      };
      const ret = new Promise(cb0);
      return addHeapObject2(ret);
    } finally {
      state0.a = state0.b = 0;
    }
  };
  imports.wbg.__wbg_new_from_slice_db0691b69e9d3891 = function(arg0, arg1) {
    const ret = new Uint32Array(getArrayU32FromWasm0(arg0, arg1));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_from_slice_f9c22b9153b26992 = function(arg0, arg1) {
    const ret = new Uint8Array(getArrayU8FromWasm02(arg0, arg1));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_no_args_cb138f77cf6151ee = function(arg0, arg1) {
    const ret = new Function(getStringFromWasm02(arg0, arg1));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_new_with_args_df9e7125ffe55248 = function(arg0, arg1, arg2, arg3) {
    const ret = new Function(getStringFromWasm02(arg0, arg1), getStringFromWasm02(arg2, arg3));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_next_138a17bbf04e926c = function(arg0) {
    const ret = getObject2(arg0).next;
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_next_3cfe5c0fe2a4cc53 = function() {
    return handleError2(function(arg0) {
      const ret = getObject2(arg0).next();
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_now_69d776cd24f5215b = function() {
    const ret = Date.now();
    return ret;
  };
  imports.wbg.__wbg_prototypesetcall_dfe9b766cdc1f1fd = function(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm02(arg0, arg1), getObject2(arg2));
  };
  imports.wbg.__wbg_proxycontext_new = function(arg0) {
    const ret = ProxyContext.__wrap(arg0);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_push_7d9be8f38fc13975 = function(arg0, arg1) {
    const ret = getObject2(arg0).push(getObject2(arg1));
    return ret;
  };
  imports.wbg.__wbg_queueMicrotask_9b549dfce8865860 = function(arg0) {
    const ret = getObject2(arg0).queueMicrotask;
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_queueMicrotask_fca69f5bfad613a5 = function(arg0) {
    queueMicrotask(getObject2(arg0));
  };
  imports.wbg.__wbg_resolve_fd5bfbaa4ce36e1e = function(arg0) {
    const ret = Promise.resolve(getObject2(arg0));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
    getObject2(arg0)[takeObject2(arg1)] = takeObject2(arg2);
  };
  imports.wbg.__wbg_set_781438a03c0c3c81 = function() {
    return handleError2(function(arg0, arg1, arg2) {
      const ret = Reflect.set(getObject2(arg0), getObject2(arg1), getObject2(arg2));
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_set_7df433eea03a5c14 = function(arg0, arg1, arg2) {
    getObject2(arg0)[arg1 >>> 0] = takeObject2(arg2);
  };
  imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
    const ret = getObject2(arg1).stack;
    const ptr1 = passStringToWasm02(ret, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN2;
    getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_769e6b65d6557335 = function() {
    const ret = typeof global === "undefined" ? null : global;
    return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_THIS_60cf02db4de8e1c1 = function() {
    const ret = typeof globalThis === "undefined" ? null : globalThis;
    return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
  };
  imports.wbg.__wbg_static_accessor_SELF_08f5a74c69739274 = function() {
    const ret = typeof self === "undefined" ? null : self;
    return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
  };
  imports.wbg.__wbg_static_accessor_WINDOW_a8924b26aa92d024 = function() {
    const ret = typeof window === "undefined" ? null : window;
    return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
  };
  imports.wbg.__wbg_then_4f95312d68691235 = function(arg0, arg1) {
    const ret = getObject2(arg0).then(getObject2(arg1));
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_typstcompiler_new = function(arg0) {
    const ret = TypstCompiler.__wrap(arg0);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_typstfontresolver_new = function(arg0) {
    const ret = TypstFontResolver.__wrap(arg0);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbg_value_57b7b035e117f7ee = function(arg0) {
    const ret = getObject2(arg0).value;
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
    const ret = getStringFromWasm02(arg0, arg1);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_cast_3334ea73b4b28ba3 = function(arg0, arg1) {
    const ret = makeMutClosure2(arg0, arg1, wasm2.__wasm_bindgen_func_elem_957, __wasm_bindgen_func_elem_944);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_cast_4625c577ab2ec9ee = function(arg0) {
    const ret = BigInt.asUintN(64, arg0);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_cast_9ae0607507abb057 = function(arg0) {
    const ret = arg0;
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function(arg0) {
    const ret = arg0;
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
    const ret = getObject2(arg0);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject2(arg0);
  };
  return imports;
}
function __wbg_finalize_init2(instance, module) {
  wasm2 = instance.exports;
  __wbg_init2.__wbindgen_wasm_module = module;
  cachedDataViewMemory02 = null;
  cachedUint32ArrayMemory02 = null;
  cachedUint8ArrayMemory02 = null;
  return wasm2;
}
function initSync2(module) {
  if (wasm2 !== void 0) return wasm2;
  if (typeof module !== "undefined") {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ({ module } = module);
    } else {
      console.warn("using deprecated parameters for `initSync()`; pass a single object instead");
    }
  }
  const imports = __wbg_get_imports2();
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  return __wbg_finalize_init2(instance, module);
}
async function __wbg_init2(module_or_path) {
  if (wasm2 !== void 0) return wasm2;
  if (typeof module_or_path !== "undefined") {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (typeof module_or_path === "undefined") {
    module_or_path = importWasmModule2("typst_ts_web_compiler_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports2();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  const { instance, module } = await __wbg_load2(await module_or_path, imports);
  return __wbg_finalize_init2(instance, module);
}
function setImportWasmModule2(importer) {
  importWasmModule2 = importer;
}
var wasm2, CLOSURE_DTORS2, cachedDataViewMemory02, cachedUint32ArrayMemory02, cachedUint8ArrayMemory02, heap2, heap_next2, cachedTextDecoder2, MAX_SAFARI_DECODE_BYTES2, numBytesDecoded2, cachedTextEncoder2, WASM_VECTOR_LEN2, IncrServerFinalization, ProxyContextFinalization, TypstCompileWorldFinalization, TypstCompilerFinalization, TypstCompilerBuilderFinalization, TypstFontResolverFinalization, TypstFontResolverBuilderFinalization, IncrServer, ProxyContext, TypstCompileWorld, TypstCompiler, TypstCompilerBuilder, TypstFontResolver, TypstFontResolverBuilder, EXPECTED_RESPONSE_TYPES2, typst_ts_web_compiler_default, importWasmModule2;
var init_typst_ts_web_compiler = __esm({
  "node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs"() {
    CLOSURE_DTORS2 = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((state) => state.dtor(state.a, state.b));
    cachedDataViewMemory02 = null;
    cachedUint32ArrayMemory02 = null;
    cachedUint8ArrayMemory02 = null;
    heap2 = new Array(128).fill(void 0);
    heap2.push(void 0, null, true, false);
    heap_next2 = heap2.length;
    cachedTextDecoder2 = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder2.decode();
    MAX_SAFARI_DECODE_BYTES2 = 2146435072;
    numBytesDecoded2 = 0;
    cachedTextEncoder2 = new TextEncoder();
    if (!("encodeInto" in cachedTextEncoder2)) {
      cachedTextEncoder2.encodeInto = function(arg, view) {
        const buf = cachedTextEncoder2.encode(arg);
        view.set(buf);
        return {
          read: arg.length,
          written: buf.length
        };
      };
    }
    WASM_VECTOR_LEN2 = 0;
    IncrServerFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm2.__wbg_incrserver_free(ptr >>> 0, 1));
    ProxyContextFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm2.__wbg_proxycontext_free(ptr >>> 0, 1));
    TypstCompileWorldFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm2.__wbg_typstcompileworld_free(ptr >>> 0, 1));
    TypstCompilerFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm2.__wbg_typstcompiler_free(ptr >>> 0, 1));
    TypstCompilerBuilderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm2.__wbg_typstcompilerbuilder_free(ptr >>> 0, 1));
    TypstFontResolverFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm2.__wbg_typstfontresolver_free(ptr >>> 0, 1));
    TypstFontResolverBuilderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm2.__wbg_typstfontresolverbuilder_free(ptr >>> 0, 1));
    IncrServer = class _IncrServer {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_IncrServer.prototype);
        obj.__wbg_ptr = ptr;
        IncrServerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IncrServerFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm2.__wbg_incrserver_free(ptr, 0);
      }
      /**
       * @param {boolean} attach
       */
      set_attach_debug_info(attach) {
        wasm2.incrserver_set_attach_debug_info(this.__wbg_ptr, attach);
      }
      /**
       * @returns {Uint8Array | undefined}
       */
      current() {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.incrserver_current(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getArrayU8FromWasm02(r0, r1).slice();
            wasm2.__wbindgen_export4(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      reset() {
        wasm2.incrserver_reset(this.__wbg_ptr);
      }
    };
    if (Symbol.dispose) IncrServer.prototype[Symbol.dispose] = IncrServer.prototype.free;
    ProxyContext = class _ProxyContext {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_ProxyContext.prototype);
        obj.__wbg_ptr = ptr;
        ProxyContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProxyContextFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm2.__wbg_proxycontext_free(ptr, 0);
      }
      /**
       * Creates a new `ProxyContext` instance.
       * @param {any} context
       */
      constructor(context) {
        const ret = wasm2.proxycontext_new(addHeapObject2(context));
        this.__wbg_ptr = ret >>> 0;
        ProxyContextFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * Returns the JavaScript this.
       * @returns {any}
       */
      get context() {
        const ret = wasm2.proxycontext_context(this.__wbg_ptr);
        return takeObject2(ret);
      }
      /**
       * A convenience function to untar a tarball and call a callback for each
       * entry.
       * @param {Uint8Array} data
       * @param {Function} cb
       */
      untar(data, cb) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passArray8ToWasm02(data, wasm2.__wbindgen_export);
          const len0 = WASM_VECTOR_LEN2;
          wasm2.proxycontext_untar(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject2(cb));
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject2(r0);
          }
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    if (Symbol.dispose) ProxyContext.prototype[Symbol.dispose] = ProxyContext.prototype.free;
    TypstCompileWorld = class _TypstCompileWorld {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TypstCompileWorld.prototype);
        obj.__wbg_ptr = ptr;
        TypstCompileWorldFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstCompileWorldFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm2.__wbg_typstcompileworld_free(ptr, 0);
      }
      /**
       * @param {number} kind
       * @param {number} diagnostics_format
       * @returns {any}
       */
      compile(kind, diagnostics_format) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompileworld_compile(retptr, this.__wbg_ptr, kind, diagnostics_format);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {number} kind
       * @returns {string | undefined}
       */
      title(kind) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompileworld_title(retptr, this.__wbg_ptr, kind);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory02().getInt32(retptr + 4 * 3, true);
          if (r3) {
            throw takeObject2(r2);
          }
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm02(r0, r1).slice();
            wasm2.__wbindgen_export4(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {number} fmt
       * @param {number} diagnostics_format
       * @returns {any}
       */
      get_artifact(fmt, diagnostics_format) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompileworld_get_artifact(retptr, this.__wbg_ptr, fmt, diagnostics_format);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {number} kind
       * @param {string} selector
       * @param {string | null} [field]
       * @returns {string}
       */
      query(kind, selector, field) {
        let deferred4_0;
        let deferred4_1;
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm02(selector, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          const len0 = WASM_VECTOR_LEN2;
          var ptr1 = isLikeNone2(field) ? 0 : passStringToWasm02(field, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          var len1 = WASM_VECTOR_LEN2;
          wasm2.typstcompileworld_query(retptr, this.__wbg_ptr, kind, ptr0, len0, ptr1, len1);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory02().getInt32(retptr + 4 * 3, true);
          var ptr3 = r0;
          var len3 = r1;
          if (r3) {
            ptr3 = 0;
            len3 = 0;
            throw takeObject2(r2);
          }
          deferred4_0 = ptr3;
          deferred4_1 = len3;
          return getStringFromWasm02(ptr3, len3);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
          wasm2.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
      }
      /**
       * @param {IncrServer} state
       * @param {number} diagnostics_format
       * @returns {any}
       */
      incr_compile(state, diagnostics_format) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          _assertClass2(state, IncrServer);
          wasm2.typstcompileworld_incr_compile(retptr, this.__wbg_ptr, state.__wbg_ptr, diagnostics_format);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    if (Symbol.dispose) TypstCompileWorld.prototype[Symbol.dispose] = TypstCompileWorld.prototype.free;
    TypstCompiler = class _TypstCompiler {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TypstCompiler.prototype);
        obj.__wbg_ptr = ptr;
        TypstCompilerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstCompilerFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm2.__wbg_typstcompiler_free(ptr, 0);
      }
      reset() {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompiler_reset(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject2(r0);
          }
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {TypstFontResolver} fonts
       */
      set_fonts(fonts) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          _assertClass2(fonts, TypstFontResolver);
          wasm2.typstcompiler_set_fonts(retptr, this.__wbg_ptr, fonts.__wbg_ptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject2(r0);
          }
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {any} inputs
       */
      set_inputs(inputs) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompiler_set_inputs(retptr, this.__wbg_ptr, addHeapObject2(inputs));
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject2(r0);
          }
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string} path
       * @param {string} content
       * @returns {boolean}
       */
      add_source(path, content) {
        const ptr0 = passStringToWasm02(path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN2;
        const ptr1 = passStringToWasm02(content, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN2;
        const ret = wasm2.typstcompiler_add_source(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
      }
      /**
       * @param {string} path
       * @param {Uint8Array} content
       * @returns {boolean}
       */
      map_shadow(path, content) {
        const ptr0 = passStringToWasm02(path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN2;
        const ptr1 = passArray8ToWasm02(content, wasm2.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN2;
        const ret = wasm2.typstcompiler_map_shadow(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
      }
      /**
       * @param {string} path
       * @returns {boolean}
       */
      unmap_shadow(path) {
        const ptr0 = passStringToWasm02(path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN2;
        const ret = wasm2.typstcompiler_unmap_shadow(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
      }
      reset_shadow() {
        wasm2.typstcompiler_reset_shadow(this.__wbg_ptr);
      }
      /**
       * @returns {string[]}
       */
      get_loaded_fonts() {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompiler_get_loaded_fonts(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var v1 = getArrayJsValueFromWasm0(r0, r1).slice();
          wasm2.__wbindgen_export4(r0, r1 * 4, 4);
          return v1;
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string} main_file_path
       * @returns {string}
       */
      get_ast(main_file_path) {
        let deferred3_0;
        let deferred3_1;
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm02(main_file_path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          const len0 = WASM_VECTOR_LEN2;
          wasm2.typstcompiler_get_ast(retptr, this.__wbg_ptr, ptr0, len0);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory02().getInt32(retptr + 4 * 3, true);
          var ptr2 = r0;
          var len2 = r1;
          if (r3) {
            ptr2 = 0;
            len2 = 0;
            throw takeObject2(r2);
          }
          deferred3_0 = ptr2;
          deferred3_1 = len2;
          return getStringFromWasm02(ptr2, len2);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
          wasm2.__wbindgen_export4(deferred3_0, deferred3_1, 1);
        }
      }
      /**
       * @returns {any}
       */
      get_semantic_token_legend() {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompiler_get_semantic_token_legend(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string} offset_encoding
       * @param {string | null} [file_path]
       * @param {string | null} [result_id]
       * @returns {object}
       */
      get_semantic_tokens(offset_encoding, file_path, result_id) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm02(offset_encoding, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          const len0 = WASM_VECTOR_LEN2;
          var ptr1 = isLikeNone2(file_path) ? 0 : passStringToWasm02(file_path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          var len1 = WASM_VECTOR_LEN2;
          var ptr2 = isLikeNone2(result_id) ? 0 : passStringToWasm02(result_id, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          var len2 = WASM_VECTOR_LEN2;
          wasm2.typstcompiler_get_semantic_tokens(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [root]
       * @param {string | null} [main_file_path]
       * @param {(Array<any>)[] | null} [inputs]
       * @returns {TypstCompileWorld}
       */
      snapshot(root, main_file_path, inputs) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          var ptr0 = isLikeNone2(root) ? 0 : passStringToWasm02(root, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          var len0 = WASM_VECTOR_LEN2;
          var ptr1 = isLikeNone2(main_file_path) ? 0 : passStringToWasm02(main_file_path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          var len1 = WASM_VECTOR_LEN2;
          var ptr2 = isLikeNone2(inputs) ? 0 : passArrayJsValueToWasm02(inputs, wasm2.__wbindgen_export);
          var len2 = WASM_VECTOR_LEN2;
          wasm2.typstcompiler_snapshot(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return TypstCompileWorld.__wrap(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string} fmt
       * @param {number} diagnostics_format
       * @returns {any}
       */
      get_artifact(fmt, diagnostics_format) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm02(fmt, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          const len0 = WASM_VECTOR_LEN2;
          wasm2.typstcompiler_get_artifact(retptr, this.__wbg_ptr, ptr0, len0, diagnostics_format);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null | undefined} main_file_path
       * @param {(Array<any>)[] | null | undefined} inputs
       * @param {string} fmt
       * @param {number} diagnostics_format
       * @returns {any}
       */
      compile(main_file_path, inputs, fmt, diagnostics_format) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          var ptr0 = isLikeNone2(main_file_path) ? 0 : passStringToWasm02(main_file_path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          var len0 = WASM_VECTOR_LEN2;
          var ptr1 = isLikeNone2(inputs) ? 0 : passArrayJsValueToWasm02(inputs, wasm2.__wbindgen_export);
          var len1 = WASM_VECTOR_LEN2;
          const ptr2 = passStringToWasm02(fmt, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          const len2 = WASM_VECTOR_LEN2;
          wasm2.typstcompiler_compile(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, diagnostics_format);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string} main_file_path
       * @param {(Array<any>)[] | null | undefined} inputs
       * @param {string} selector
       * @param {string | null} [field]
       * @returns {string}
       */
      query(main_file_path, inputs, selector, field) {
        let deferred6_0;
        let deferred6_1;
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm02(main_file_path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          const len0 = WASM_VECTOR_LEN2;
          var ptr1 = isLikeNone2(inputs) ? 0 : passArrayJsValueToWasm02(inputs, wasm2.__wbindgen_export);
          var len1 = WASM_VECTOR_LEN2;
          const ptr2 = passStringToWasm02(selector, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          const len2 = WASM_VECTOR_LEN2;
          var ptr3 = isLikeNone2(field) ? 0 : passStringToWasm02(field, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          var len3 = WASM_VECTOR_LEN2;
          wasm2.typstcompiler_query(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory02().getInt32(retptr + 4 * 3, true);
          var ptr5 = r0;
          var len5 = r1;
          if (r3) {
            ptr5 = 0;
            len5 = 0;
            throw takeObject2(r2);
          }
          deferred6_0 = ptr5;
          deferred6_1 = len5;
          return getStringFromWasm02(ptr5, len5);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
          wasm2.__wbindgen_export4(deferred6_0, deferred6_1, 1);
        }
      }
      /**
       * @returns {IncrServer}
       */
      create_incr_server() {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompiler_create_incr_server(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return IncrServer.__wrap(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string} main_file_path
       * @param {(Array<any>)[] | null | undefined} inputs
       * @param {IncrServer} state
       * @param {number} diagnostics_format
       * @returns {any}
       */
      incr_compile(main_file_path, inputs, state, diagnostics_format) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm02(main_file_path, wasm2.__wbindgen_export, wasm2.__wbindgen_export2);
          const len0 = WASM_VECTOR_LEN2;
          var ptr1 = isLikeNone2(inputs) ? 0 : passArrayJsValueToWasm02(inputs, wasm2.__wbindgen_export);
          var len1 = WASM_VECTOR_LEN2;
          _assertClass2(state, IncrServer);
          wasm2.typstcompiler_incr_compile(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, state.__wbg_ptr, diagnostics_format);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    if (Symbol.dispose) TypstCompiler.prototype[Symbol.dispose] = TypstCompiler.prototype.free;
    TypstCompilerBuilder = class {
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstCompilerBuilderFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm2.__wbg_typstcompilerbuilder_free(ptr, 0);
      }
      constructor() {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompilerbuilder_new(retptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          TypstCompilerBuilderFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      set_dummy_access_model() {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstcompilerbuilder_set_dummy_access_model(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject2(r0);
          }
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {any} context
       * @param {Function} mtime_fn
       * @param {Function} is_file_fn
       * @param {Function} real_path_fn
       * @param {Function} read_all_fn
       * @returns {Promise<void>}
       */
      set_access_model(context, mtime_fn, is_file_fn, real_path_fn, read_all_fn) {
        const ret = wasm2.typstcompilerbuilder_set_access_model(this.__wbg_ptr, addHeapObject2(context), addHeapObject2(mtime_fn), addHeapObject2(is_file_fn), addHeapObject2(real_path_fn), addHeapObject2(read_all_fn));
        return takeObject2(ret);
      }
      /**
       * @param {any} context
       * @param {Function} real_resolve_fn
       * @returns {Promise<void>}
       */
      set_package_registry(context, real_resolve_fn) {
        const ret = wasm2.typstcompilerbuilder_set_package_registry(this.__wbg_ptr, addHeapObject2(context), addHeapObject2(real_resolve_fn));
        return takeObject2(ret);
      }
      /**
       * @param {Uint8Array} data
       * @returns {Promise<void>}
       */
      add_raw_font(data) {
        const ret = wasm2.typstcompilerbuilder_add_raw_font(this.__wbg_ptr, addHeapObject2(data));
        return takeObject2(ret);
      }
      /**
       * @param {any} font
       * @param {Function} blob
       * @returns {Promise<void>}
       */
      add_lazy_font(font, blob) {
        const ret = wasm2.typstcompilerbuilder_add_lazy_font(this.__wbg_ptr, addHeapObject2(font), addHeapObject2(blob));
        return takeObject2(ret);
      }
      /**
       * @returns {Promise<TypstCompiler>}
       */
      build() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm2.typstcompilerbuilder_build(ptr);
        return takeObject2(ret);
      }
    };
    if (Symbol.dispose) TypstCompilerBuilder.prototype[Symbol.dispose] = TypstCompilerBuilder.prototype.free;
    TypstFontResolver = class _TypstFontResolver {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TypstFontResolver.prototype);
        obj.__wbg_ptr = ptr;
        TypstFontResolverFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstFontResolverFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm2.__wbg_typstfontresolver_free(ptr, 0);
      }
    };
    if (Symbol.dispose) TypstFontResolver.prototype[Symbol.dispose] = TypstFontResolver.prototype.free;
    TypstFontResolverBuilder = class {
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstFontResolverBuilderFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm2.__wbg_typstfontresolverbuilder_free(ptr, 0);
      }
      constructor() {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstfontresolverbuilder_new(retptr);
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          TypstFontResolverBuilderFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {Uint8Array} buffer
       * @returns {any}
       */
      get_font_info(buffer) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstfontresolverbuilder_get_font_info(retptr, this.__wbg_ptr, addHeapObject2(buffer));
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject2(r1);
          }
          return takeObject2(r0);
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Adds font data to the searcher.
       * @param {Uint8Array} buffer
       */
      add_raw_font(buffer) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstfontresolverbuilder_add_raw_font(retptr, this.__wbg_ptr, addHeapObject2(buffer));
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject2(r0);
          }
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Adds callback that loads font data lazily to the searcher.
       * `get_font_info` can be used to get the font info.
       * @param {any} font
       * @param {Function} blob
       */
      add_lazy_font(font, blob) {
        try {
          const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
          wasm2.typstfontresolverbuilder_add_lazy_font(retptr, this.__wbg_ptr, addHeapObject2(font), addHeapObject2(blob));
          var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject2(r0);
          }
        } finally {
          wasm2.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {Promise<TypstFontResolver>}
       */
      build() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm2.typstfontresolverbuilder_build(ptr);
        return takeObject2(ret);
      }
    };
    if (Symbol.dispose) TypstFontResolverBuilder.prototype[Symbol.dispose] = TypstFontResolverBuilder.prototype.free;
    EXPECTED_RESPONSE_TYPES2 = /* @__PURE__ */ new Set(["basic", "cors", "default"]);
    typst_ts_web_compiler_default = __wbg_init2;
    importWasmModule2 = async function(wasm_name, url) {
      throw new Error("Cannot import wasm module without importer: " + wasm_name + " " + url);
    };
  }
});

// node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/wasm-pack-shim.mjs
var wasm_pack_shim_exports2 = {};
__export(wasm_pack_shim_exports2, {
  IncrServer: () => IncrServer,
  ProxyContext: () => ProxyContext,
  TypstCompileWorld: () => TypstCompileWorld,
  TypstCompiler: () => TypstCompiler,
  TypstCompilerBuilder: () => TypstCompilerBuilder,
  TypstFontResolver: () => TypstFontResolver,
  TypstFontResolverBuilder: () => TypstFontResolverBuilder,
  default: () => wasm_pack_shim_default2,
  get_font_info: () => get_font_info,
  initSync: () => initSync2,
  setImportWasmModule: () => setImportWasmModule2
});
var wasm_pack_shim_default2, nodeJsImportWasmModule2, isNode2;
var init_wasm_pack_shim2 = __esm({
  "node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/wasm-pack-shim.mjs"() {
    init_typst_ts_web_compiler();
    init_typst_ts_web_compiler();
    init_typst_ts_web_compiler();
    wasm_pack_shim_default2 = typst_ts_web_compiler_default;
    nodeJsImportWasmModule2 = async function(wasm_name, url) {
      const escapeImport = new Function("m", "return import(m)");
      const { readFileSync } = await escapeImport("fs");
      const wasmPath = new URL(wasm_name, url);
      return await readFileSync(wasmPath).buffer;
    };
    isNode2 = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
    if (isNode2) {
      setImportWasmModule2(nodeJsImportWasmModule2);
    }
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/compiler.mjs
var compiler_exports = {};
__export(compiler_exports, {
  CompileFormatEnum: () => CompileFormatEnum,
  IncrementalServer: () => IncrementalServer,
  TypstFontBuilderDriver: () => TypstFontBuilderDriver,
  TypstWorld: () => TypstWorld,
  createTypstCompiler: () => createTypstCompiler,
  createTypstFontBuilder: () => createTypstFontBuilder
});
function createTypstFontBuilder() {
  return new TypstFontBuilderDriver();
}
function createTypstCompiler() {
  return new TypstCompilerDriver();
}
function convertInputs(inputs) {
  return inputs ? Object.entries(inputs) : void 0;
}
function getDiagnosticsArg(diagnostics) {
  switch (diagnostics) {
    case "none":
      return 1;
    case "unix":
      return 2;
    case "full":
    default:
      return 3;
  }
}
var CompileFormatEnum, IncrementalServer, TypstFontResolverCons, TypstWorld, gCompilerModule, TypstFontBuilderDriver, TypstCompilerDriver;
var init_compiler = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/compiler.mjs"() {
    init_init();
    init_internal_types();
    init_options_init();
    init_wasm();
    (function(CompileFormatEnum2) {
      CompileFormatEnum2[CompileFormatEnum2["vector"] = 0] = "vector";
      CompileFormatEnum2[CompileFormatEnum2["pdf"] = 1] = "pdf";
      CompileFormatEnum2[CompileFormatEnum2["_dummy"] = 2] = "_dummy";
    })(CompileFormatEnum || (CompileFormatEnum = {}));
    IncrementalServer = class {
      /**
       * @internal
       */
      [kObject];
      /**
       * @internal
       */
      constructor(s) {
        this[kObject] = s;
      }
      /**
       * Reset the incremental server to the initial state.
       */
      reset() {
        this[kObject].reset();
      }
      /**
       * Return current result.
       */
      current() {
        return this[kObject].current();
      }
      /**
       * Also attach the debug info to the result.
       */
      setAttachDebugInfo(enable) {
        this[kObject].set_attach_debug_info(enable);
      }
    };
    /* @__PURE__ */ (function(TypstFontResolverCons2) {
    })(TypstFontResolverCons || (TypstFontResolverCons = {}));
    TypstWorld = class {
      [kObject];
      constructor(world) {
        this[kObject] = world;
      }
      /**
       * Compile the paged document.
       *
       * @param {DiagnosticsFormat} format - The format of the diagnostics.
       * @returns {Promise<{ diagnostics?: DiagnosticsData[DiagnosticsFormat][] }>} - The result of the compilation.
       */
      compile(opts) {
        return this[kObject].compile(0, getDiagnosticsArg(opts?.diagnostics));
      }
      /**
       * Compile the paged document.
       *
       * @param {DiagnosticsFormat} format - The format of the diagnostics.
       * @returns {Promise<{ diagnostics?: DiagnosticsData[DiagnosticsFormat][] }>} - The result of the compilation.
       */
      compileHtml(opts) {
        return this[kObject].compile(1, getDiagnosticsArg(opts?.diagnostics));
      }
      /**
       * Runs query on the paged document.
       */
      async query(options) {
        return JSON.parse(this[kObject].query(0, options.selector, options.field));
      }
      /**
       * Get the title of the paged document.
       * Throw error if the world didn't compile the paged document.
       *
       * @returns {string | undefined} - The title of the paged document.
       */
      title() {
        return this[kObject].title(0);
      }
      /**
       * Export the paged document as vector format.
       *
       * @returns {Uint8Array | undefined} - The title of the paged document.
       */
      vector(opts) {
        return this[kObject].get_artifact(0, getDiagnosticsArg(opts?.diagnostics)) || {};
      }
      /**
       * Export the paged document to PDF.
       *
       * @returns {Uint8Array | undefined} - The title of the paged document.
       */
      pdf(opts) {
        return this[kObject].get_artifact(1, getDiagnosticsArg(opts?.diagnostics)) || {};
      }
    };
    gCompilerModule = (module) => new LazyWasmModule(async (bin) => {
      return await module.default(bin);
    });
    TypstFontBuilderDriver = class {
      fontBuilderJs;
      fontBuilder;
      async init(options) {
        this.fontBuilderJs = await (options?.getWrapper?.() || Promise.resolve().then(() => (init_wasm_pack_shim2(), wasm_pack_shim_exports2)));
        await gCompilerModule(this.fontBuilderJs).init(options?.getModule?.());
        this.fontBuilder = new this.fontBuilderJs.TypstFontResolverBuilder();
      }
      async getFontInfo(font_buffer) {
        return this.fontBuilder.get_font_info(font_buffer);
      }
      async addFontData(font_buffer) {
        this.fontBuilder.add_raw_font(font_buffer);
      }
      async addLazyFont(info, blob) {
        return this.fontBuilder.add_lazy_font(info, blob);
      }
      async build(cb) {
        const fonts = await this.fontBuilder.build();
        const result = await cb(fonts);
        fonts.free();
        return result;
      }
    };
    TypstCompilerDriver = class _TypstCompilerDriver {
      compiler;
      compilerJs;
      static defaultAssets = ["text"];
      constructor() {
      }
      async init(options) {
        this.compilerJs = await (options?.getWrapper?.() || Promise.resolve().then(() => (init_wasm_pack_shim2(), wasm_pack_shim_exports2)));
        const TypstCompilerBuilder2 = this.compilerJs.TypstCompilerBuilder;
        const compilerOptions = { ...options || {} };
        const beforeBuild = compilerOptions.beforeBuild ??= [];
        const hasPreloadRemoteFonts = beforeBuild.some((fn) => fn._preloadRemoteFontOptions !== void 0);
        const hasSpecifiedAssets = beforeBuild.some((fn) => fn._preloadRemoteFontOptions?.assets !== void 0);
        const hasDisableAssets = beforeBuild.some((fn) => fn._preloadRemoteFontOptions?.assets === false);
        if (!hasPreloadRemoteFonts || !hasSpecifiedAssets && !hasDisableAssets) {
          beforeBuild.push(loadFonts([], { assets: _TypstCompilerDriver.defaultAssets }));
        }
        const hasFontLoader = beforeBuild.some((fn) => fn._kind === "fontLoader");
        if (!hasFontLoader) {
          throw new Error("TypstCompiler: no font loader found, please use font loaders, e.g. loadFonts or preloadSystemFonts");
        }
        this.compiler = await buildComponent(options, gCompilerModule(this.compilerJs), TypstCompilerBuilder2, {});
      }
      setFonts(fonts) {
        this.compiler.set_fonts(fonts);
      }
      compile(options) {
        return new Promise((resolve) => {
          const world = this.compiler.snapshot(options.root, options.mainFilePath, convertInputs(options.inputs));
          if ("incrementalServer" in options) {
            resolve(world.incr_compile(options.incrementalServer[kObject], getDiagnosticsArg(options.diagnostics)));
            return;
          }
          resolve(world.get_artifact(options.format || CompileFormatEnum.vector, getDiagnosticsArg(options.diagnostics)));
        });
      }
      async runWithWorld(options, cb) {
        const world = this.compiler.snapshot(options.root, options.mainFilePath, convertInputs(options.inputs));
        let result = await cb(new TypstWorld(world));
        world.free();
        return result;
      }
      query(options) {
        return this.runWithWorld(options, async (world) => {
          return JSON.parse(await world.query(options));
        });
      }
      getSemanticTokenLegend() {
        return new Promise((resolve) => {
          resolve(this.compiler.get_semantic_token_legend());
        });
      }
      getSemanticTokens(opts) {
        return new Promise((resolve) => {
          this.compiler.reset();
          resolve(this.compiler.get_semantic_tokens(opts.offsetEncoding || "utf-16", opts.mainFilePath, opts.resultId));
        });
      }
      async withIncrementalServer(f) {
        const srv = new IncrementalServer(this.compiler.create_incr_server());
        try {
          return await f(srv);
        } finally {
          srv[kObject].free();
        }
      }
      async getAst(mainFilePath) {
        return this.compiler.get_ast(mainFilePath);
      }
      async reset() {
        await new Promise((resolve) => {
          this.compiler.reset();
          resolve(void 0);
        });
      }
      addSource(path, source) {
        if (arguments.length > 2) {
          throw new Error("use of addSource(path, source, isMain) is deprecated, please use addSource(path, source) instead");
        }
        this.compiler.add_source(path, source);
      }
      mapShadow(path, content) {
        this.compiler.map_shadow(path, content);
      }
      unmapShadow(path) {
        this.compiler.unmap_shadow(path);
      }
      resetShadow() {
        this.compiler.reset_shadow();
      }
      renderPageToCanvas() {
        throw new Error("Please use the api TypstRenderer.renderToCanvas in v0.4.0");
      }
    };
    createTypstCompiler._impl = TypstCompilerDriver;
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/global-compiler.mjs
var global_compiler_exports = {};
__export(global_compiler_exports, {
  createGlobalCompiler: () => createGlobalCompiler,
  getGlobalCompiler: () => getGlobalCompiler,
  withGlobalCompiler: () => withGlobalCompiler
});
function getGlobalCompiler() {
  return isReady ? globalCompiler : void 0;
}
function createGlobalCompiler(creator, initOptions) {
  const compiler = globalCompiler || creator();
  if (globalCompilerInitReady !== void 0) {
    return globalCompilerInitReady;
  }
  return globalCompilerInitReady = (async () => {
    isReady = true;
    await compiler.init(initOptions);
    return globalCompiler = compiler;
  })();
}
function withGlobalCompiler(creator, initOptions, resolve, reject) {
  const compiler = getGlobalCompiler();
  if (compiler) {
    resolve(compiler);
    return;
  }
  createGlobalCompiler(creator, initOptions).then(resolve).catch(reject);
}
var globalCompiler, globalCompilerInitReady, isReady;
var init_global_compiler = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/global-compiler.mjs"() {
    globalCompiler = void 0;
    isReady = false;
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/global-renderer.mjs
var global_renderer_exports = {};
__export(global_renderer_exports, {
  createGlobalRenderer: () => createGlobalRenderer,
  getGlobalRenderer: () => getGlobalRenderer,
  withGlobalRenderer: () => withGlobalRenderer
});
function getGlobalRenderer() {
  return isReady2 ? globalRenderer : void 0;
}
function createGlobalRenderer(creator, initOptions) {
  const renderer = globalRenderer || creator();
  if (globalRendererInitReady !== void 0) {
    return globalRendererInitReady;
  }
  return globalRendererInitReady = (async () => {
    isReady2 = true;
    await renderer.init(initOptions);
    return globalRenderer = renderer;
  })();
}
function withGlobalRenderer(creator, initOptions, resolve, reject) {
  const renderer = getGlobalRenderer();
  if (renderer) {
    resolve(renderer);
    return;
  }
  createGlobalRenderer(creator, initOptions).then(resolve).catch(reject);
}
var globalRenderer, globalRendererInitReady, isReady2;
var init_global_renderer = __esm({
  "node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/global-renderer.mjs"() {
    globalRenderer = void 0;
    isReady2 = false;
  }
});

// node_modules/@myriaddreamin/typst.ts/dist/esm/index.mjs
init_options_init();
init_options_init();
init_renderer();

// node_modules/@myriaddreamin/typst.ts/dist/esm/fs/memory.mjs
var MemoryAccessModel = class {
  mTimes = /* @__PURE__ */ new Map();
  mData = /* @__PURE__ */ new Map();
  constructor() {
  }
  reset() {
    this.mTimes.clear();
    this.mData.clear();
  }
  insertFile(path, data, mtime) {
    this.mTimes.set(path, mtime);
    this.mData.set(path, data);
  }
  removeFile(path) {
    this.mTimes.delete(path);
    this.mData.delete(path);
  }
  getMTime(path) {
    if (!path.startsWith("/@memory/")) {
      return void 0;
    }
    if (this.mTimes.has(path)) {
      return this.mTimes.get(path);
    }
    return void 0;
  }
  isFile() {
    return true;
  }
  getRealPath(path) {
    return path;
  }
  readAll(path) {
    if (!path.startsWith("/@memory/")) {
      return void 0;
    }
    if (this.mData.has(path)) {
      return this.mData.get(path);
    }
    return void 0;
  }
};

// node_modules/@myriaddreamin/typst.ts/dist/esm/fs/package.mjs
var FetchPackageRegistry = class {
  am;
  cache = /* @__PURE__ */ new Map();
  constructor(am) {
    this.am = am;
  }
  resolvePath(path) {
    return `https://packages.typst.org/preview/${path.name}-${path.version}.tar.gz`;
  }
  pullPackageData(path) {
    const request = new XMLHttpRequest();
    request.overrideMimeType("text/plain; charset=x-user-defined");
    request.open("GET", this.resolvePath(path), false);
    request.send(null);
    if (request.status === 200 && (request.response instanceof String || typeof request.response === "string")) {
      return Uint8Array.from(request.response, (c) => c.charCodeAt(0));
    }
    return void 0;
  }
  resolve(spec, context) {
    if (spec.namespace !== "preview") {
      return void 0;
    }
    const path = this.resolvePath(spec);
    if (this.cache.has(path)) {
      return this.cache.get(path)();
    }
    const data = this.pullPackageData(spec);
    if (!data) {
      return void 0;
    }
    const previewDir = `/@memory/fetch/packages/${spec.namespace}/${spec.name}/${spec.version}`;
    const entries = [];
    context.untar(data, (path2, data2, mtime) => {
      entries.push([previewDir + "/" + path2, data2, new Date(mtime)]);
    });
    const cacheClosure = () => {
      for (const [path2, data2, mtime] of entries) {
        this.am.insertFile(path2, data2, mtime);
      }
      return previewDir;
    };
    this.cache.set(path, cacheClosure);
    return cacheClosure();
  }
};

// node_modules/@myriaddreamin/typst.ts/dist/esm/index.mjs
init_compiler();

// node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs
init_options_init();
init_init();

// node_modules/@myriaddreamin/typst.ts/dist/esm/utils.mjs
function randstr(prefix) {
  return Math.random().toString(36).replace("0.", prefix || "");
}

// node_modules/@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs
init_compiler();
var isNode3 = (
  // @ts-ignore
  typeof process !== "undefined" && process.versions != null && process.versions.node != null
);
var TypstSnippet = class _TypstSnippet {
  /** @internal */
  mainFilePath;
  /** @internal */
  cc;
  /** @internal */
  fr;
  /** @internal */
  ex;
  /**
   * Create a new instance of {@link TypstSnippet}.
   * @param cc the compiler instance, see {@link PromiseJust} and {@link TypstCompiler}.
   * @param ex the renderer instance, see {@link PromiseJust} and {@link TypstRenderer}.
   *
   * @example
   *
   * Passes a global shared compiler instance that get initialized lazily:
   * ```typescript
   * const $typst = new TypstSnippet(() => {
   *  return createGlobalCompiler(createTypstCompiler, initOptions);
   * });
   *
   */
  constructor(options) {
    this.cc = options?.compiler || _TypstSnippet.buildLocalCompiler;
    this.fr = options?.fontResolver || _TypstSnippet.buildLocalFontResolver;
    this.ex = options?.renderer || _TypstSnippet.buildLocalRenderer;
    this.mainFilePath = "/main.typ";
    this.providers = [];
  }
  /**
   * Set lazy initialized compiler instance for the utility instance.
   * @param cc the compiler instance, see {@link PromiseJust} and {@link TypstCompiler}.
   */
  setCompiler(cc) {
    this.cc = cc;
  }
  async getFontResolver() {
    return typeof this.fr === "function" ? this.fr = await this.fr() : this.fr;
  }
  /**
   * Get an initialized compiler instance from the utility instance.
   */
  async getCompiler() {
    return typeof this.cc === "function" ? this.cc = await this.cc() : this.cc;
  }
  async getCompilerReset() {
    const compiler = await this.getCompiler();
    await compiler.reset();
    return compiler;
  }
  /**
   * Set lazy initialized renderer instance for the utility instance.
   * @param ex the renderer instance, see {@link PromiseJust} and {@link TypstRenderer}.
   */
  setRenderer(ex) {
    this.ex = ex;
  }
  /**
   * Get an initialized renderer instance from the utility instance.
   */
  async getRenderer() {
    return typeof this.ex === "function" ? this.ex = await this.ex() : this.ex;
  }
  providers;
  /**
   * add providers for bullding the compiler or renderer component.
   */
  use(...providers) {
    if (!this.providers) {
      throw new Error("already prepare uses for instances");
    }
    this.providers.push(...providers);
  }
  /**
   * todo: add docs
   */
  static preloadFontFromUrl(fontUrl) {
    return _TypstSnippet.preloadFonts([fontUrl]);
  }
  /**
   * todo: add docs
   */
  static preloadFontData(fontData) {
    return _TypstSnippet.preloadFonts([fontData]);
  }
  /**
   * todo: add docs
   */
  static preloadFonts(userFonts) {
    return {
      key: "access-model",
      forRoles: ["compiler"],
      provides: [loadFonts(userFonts)]
    };
  }
  /**
   * don't load any default font assets.
   * todo: add docs
   */
  static disableDefaultFontAssets() {
    return {
      key: "access-model",
      forRoles: ["compiler"],
      provides: [disableDefaultFontAssets()]
    };
  }
  /**
   * todo: add docs
   */
  static preloadFontAssets(options) {
    return {
      key: "access-model",
      forRoles: ["compiler"],
      provides: [preloadFontAssets(options)]
    };
  }
  /**
   * Set accessl model for the compiler instance
   * @example
   *
   * use memory access model
   *
   * ```typescript
   * const m = new MemoryAccessModel();
   * $typst.use(TypstSnippet.withAccessModel(m));
   * ```
   */
  static withAccessModel(accessModel) {
    return {
      key: "access-model",
      forRoles: ["compiler"],
      provides: [withAccessModel(accessModel)]
    };
  }
  /**
   * Set package registry for the compiler instance
   * @example
   *
   * use a customized package registry
   *
   * ```typescript
   * const n = new NodeFetchPackageRegistry();
   * $typst.use(TypstSnippet.withPackageRegistry(n));
   * ```
   */
  static withPackageRegistry(registry) {
    return {
      key: "package-registry",
      forRoles: ["compiler"],
      provides: [withPackageRegistry(registry)]
    };
  }
  /**
   * Retrieve an access model to store the data of fetched files.
   * Provide a PackageRegistry instance for the compiler instance.
   *
   * @example
   *
   * use default (memory) access model
   *
   * ```typescript
   * $typst.use(await TypstSnippet.fetchPackageRegistry());
   * ```
   *
   * @example
   *
   * use external access model
   *
   * ```typescript
   * const m = new MemoryAccessModel();
   * $typst.use(TypstSnippet.withAccessModel(m), await TypstSnippet.fetchPackageRegistry(m));
   * ```
   */
  static fetchPackageRegistry(accessModel) {
    const m = accessModel || new MemoryAccessModel();
    const provides = [
      ...accessModel ? [] : [withAccessModel(m)],
      withPackageRegistry(new FetchPackageRegistry(m))
    ];
    return {
      key: "package-registry$fetch",
      forRoles: ["compiler"],
      provides
    };
  }
  /**
   * Retrieve a fetcher for fetching package data.
   * Provide a PackageRegistry instance for the compiler instance.
   * @example
   *
   * use a customized fetcher
   *
   * ```typescript
   * import request from 'sync-request-curl';
   * const m = new MemoryAccessModel();
   * $typst.use(TypstSnippet.withAccessModel(m), await TypstSnippet.fetchPackageBy(m, (_, httpUrl) => {
   *   const response = request('GET', this.resolvePath(path), {
   *     insecure: true,
   *   });
   *
   *   if (response.statusCode === 200) {
   *     return response.getBody(undefined);
   *   }
   *   return undefined;
   * }));
   * ```
   */
  static fetchPackageBy(accessModel, fetcher) {
    class HttpPackageRegistry extends FetchPackageRegistry {
      pullPackageData(path) {
        return fetcher(path, this.resolvePath(path));
      }
    }
    return {
      key: "package-registry$lambda",
      forRoles: ["compiler"],
      provides: [withPackageRegistry(new HttpPackageRegistry(accessModel))]
    };
  }
  /** @internal */
  ccOptions;
  /**
   * Set compiler init options for initializing global instance {@link $typst}.
   * See {@link InitOptions}.
   */
  setCompilerInitOptions(options) {
    this.requireIsUninitialized("compiler", this.cc);
    this.ccOptions = options;
  }
  /** @internal */
  exOptions;
  /**
   * Set renderer init options for initializing global instance {@link $typst}.
   * See {@link InitOptions}.
   */
  setRendererInitOptions(options) {
    this.requireIsUninitialized("renderer", this.ex);
    this.exOptions = options;
  }
  /**
   * Set shared main file path.
   */
  setMainFilePath(path) {
    this.mainFilePath = path;
  }
  /**
   * Get shared main file path.
   */
  getMainFilePath() {
    return this.mainFilePath;
  }
  removeTmp(opts) {
    if (opts.mainFilePath.startsWith("/tmp/")) {
      return this.unmapShadow(opts.mainFilePath);
    }
    return Promise.resolve();
  }
  /**
   * Adds a font to the compiler.
   *
   * @example
   *
   * ```typescript
   * const fonts = await fetch('fontInfo.json').then(res => res.json());
   * $typst.addFonts(fonts.map(font => $typst.loadFont(font.url)));
   * ```
   *
   * @param fontInfos the font infos to add.
   */
  async setFonts(fontInfos) {
    const fb = await this.getFontResolver();
    for (const font of fontInfos) {
      await fb.addLazyFont(font, "blob" in font ? font.blob : loadFontSync(font), font);
    }
    const compiler = await this.getCompiler();
    await fb.build(async (fonts) => compiler.setFonts(fonts));
  }
  /**
   * Add a source file to the compiler.
   * See {@link TypstCompiler#addSource}.
   */
  async addSource(path, content) {
    (await this.getCompiler()).addSource(path, content);
  }
  /**
   * Reset the shadow files.
   * Note: this function is independent to the {@link reset} function.
   * See {@link TypstCompiler#resetShadow}.
   */
  async resetShadow() {
    (await this.getCompiler()).resetShadow();
  }
  /**
   * Add a shadow file to the compiler.
   * See {@link TypstCompiler#mapShadow}.
   */
  async mapShadow(path, content) {
    (await this.getCompiler()).mapShadow(path, content);
  }
  /**
   * Remove a shadow file from the compiler.
   * See {@link TypstCompiler#unmapShadow}.
   */
  async unmapShadow(path) {
    (await this.getCompiler()).unmapShadow(path);
  }
  /**
   * Compile the document to vector (IR) format.
   * See {@link SweetCompileOptions}.
   */
  async vector(o) {
    const opts = await this.getCompileOptions(o);
    const compiler = await this.getCompilerReset();
    return compiler.compile(opts).then((res) => res.result).finally(() => this.removeTmp(opts));
  }
  /**
   * Compile the document to PDF format.
   * See {@link SweetCompileOptions}.
   */
  async pdf(o) {
    const opts = await this.getCompileOptions(o);
    opts.format = CompileFormatEnum.pdf;
    const compiler = await this.getCompilerReset();
    return compiler.compile(opts).then((res) => res.result).finally(() => this.removeTmp(opts));
  }
  /**
   * Compile the document to SVG format.
   * See {@link SweetRenderOptions} and {@link RenderSvgOptions}.
   */
  async svg(o) {
    return this.transientRender(o, (renderer, renderSession) => renderer.renderSvg({
      ...o,
      renderSession
    }));
  }
  /**
   * Compile the document to canvas operations.
   * See {@link SweetRenderOptions} and {@link RenderToCanvasOptions}.
   */
  async canvas(container, o) {
    return this.transientRender(o, (renderer, renderSession) => renderer.renderToCanvas({
      container,
      ...o,
      renderSession
    }));
  }
  /**
   * Get semantic tokens for the document.
   */
  async query(o) {
    const opts = await this.getCompileOptions(o);
    const compiler = await this.getCompilerReset();
    return compiler.query({
      ...o,
      ...opts
    }).finally(() => this.removeTmp(opts));
  }
  /**
   * Get token legend for semantic tokens.
   */
  async getSemanticTokenLegend() {
    const compiler = await this.getCompilerReset();
    return compiler.getSemanticTokenLegend();
  }
  /**
   * Get semantic tokens for the document.
   * See {@link SweetCompileOptions}.
   * See {@link TypstCompiler#getSemanticTokens}.
   */
  async getSemanticTokens(o) {
    const opts = await this.getCompileOptions(o);
    const compiler = await this.getCompilerReset();
    return compiler.getSemanticTokens({
      mainFilePath: opts.mainFilePath,
      resultId: o.resultId
    }).finally(() => this.removeTmp(opts));
  }
  async getCompileOptions(opts) {
    if (opts === void 0) {
      return { mainFilePath: this.mainFilePath, diagnostics: "none" };
    } else if (typeof opts === "string") {
      throw new Error(`please specify opts as {mainContent: '...'} or {mainFilePath: '...'}`);
    } else if ("mainFilePath" in opts) {
      return { ...opts, diagnostics: "none" };
    } else {
      const destFile = `/tmp/${randstr()}.typ`;
      await this.addSource(destFile, opts.mainContent);
      return { mainFilePath: destFile, inputs: opts.inputs, diagnostics: "none" };
    }
  }
  async getVector(o) {
    if (o && "vectorData" in o) {
      return o.vectorData;
    }
    const opts = await this.getCompileOptions(o);
    return (await this.getCompiler()).compile(opts).then((res) => res.result).finally(() => this.removeTmp(opts));
  }
  async transientRender(opts, f) {
    const rr = await this.getRenderer();
    if (!rr) {
      throw new Error("does not provide renderer instance");
    }
    const data = await this.getVector(opts);
    return await rr.runWithSession(async (session) => {
      rr.manipulateData({
        renderSession: session,
        action: "reset",
        data
      });
      return f(rr, session);
    });
  }
  prepareUseOnce = void 0;
  async prepareUse() {
    if (this.prepareUseOnce) {
      return this.prepareUseOnce;
    }
    return this.prepareUseOnce = this.doPrepareUse();
  }
  async doPrepareUse() {
    if (!this.providers) {
      return;
    }
    const providers = await Promise.all(this.providers.map((p) => typeof p === "function" ? p() : p));
    this.providers = [];
    if ($typst == this && !providers.some((p) => p.key.includes("package-registry") || p.key.includes("access-model"))) {
      if (isNode3) {
        const escapeImport = new Function("m", "return import(m)");
        try {
          const m = new MemoryAccessModel();
          const { default: request } = await escapeImport("sync-request");
          $typst.use(_TypstSnippet.withAccessModel(m), _TypstSnippet.fetchPackageBy(m, (_, path) => {
            const response = request("GET", path);
            if (response.statusCode === 200) {
              return response.getBody(void 0);
            }
            return void 0;
          }));
        } catch (e) {
        }
      } else {
        $typst.use(_TypstSnippet.fetchPackageRegistry());
      }
    }
    const providers2 = await Promise.all(this.providers.map((p) => typeof p === "function" ? p() : p));
    const ccOptions = this.ccOptions ||= {};
    const ccBeforeBuild = ccOptions.beforeBuild ||= [];
    const exOptions = this.exOptions ||= {};
    const exBeforeBuild = exOptions.beforeBuild ||= [];
    for (const provider of [...providers, ...providers2]) {
      if (provider.forRoles.includes("compiler")) {
        this.requireIsUninitialized("compiler", this.cc);
        ccBeforeBuild.push(...provider.provides);
      }
      if (provider.forRoles.includes("renderer")) {
        this.requireIsUninitialized("renderer", this.ex);
        exBeforeBuild.push(...provider.provides);
      }
    }
    this.providers = void 0;
  }
  requireIsUninitialized(role, c, e) {
    if (c && typeof c !== "function") {
      throw new Error(`${role} has been initialized: ${c}`);
    }
  }
  /** @internal */
  static async buildLocalCompiler() {
    const { createTypstCompiler: createTypstCompiler2 } = await Promise.resolve().then(() => (init_compiler(), compiler_exports));
    await this.prepareUse();
    const compiler = createTypstCompiler2();
    await compiler.init(this.ccOptions);
    return compiler;
  }
  /** @internal */
  static async buildLocalFontResolver() {
    const { createTypstFontBuilder: createTypstFontBuilder2 } = await Promise.resolve().then(() => (init_compiler(), compiler_exports));
    await this.prepareUse();
    const fonts = createTypstFontBuilder2();
    await fonts.init(this.ccOptions);
    return fonts;
  }
  /** @internal */
  static async buildGlobalCompiler() {
    const { createGlobalCompiler: createGlobalCompiler2 } = await Promise.resolve().then(() => (init_global_compiler(), global_compiler_exports));
    const { createTypstCompiler: createTypstCompiler2 } = await Promise.resolve().then(() => (init_compiler(), compiler_exports));
    await this.prepareUse();
    return createGlobalCompiler2(createTypstCompiler2, this.ccOptions);
  }
  /** @internal */
  static async buildLocalRenderer() {
    const { createTypstRenderer: createTypstRenderer2 } = await Promise.resolve().then(() => (init_renderer(), renderer_exports));
    await this.prepareUse();
    const renderer = createTypstRenderer2();
    await renderer.init(this.exOptions);
    return renderer;
  }
  /** @internal */
  static async buildGlobalRenderer() {
    const { createGlobalRenderer: createGlobalRenderer2 } = await Promise.resolve().then(() => (init_global_renderer(), global_renderer_exports));
    const { createTypstRenderer: createTypstRenderer2 } = await Promise.resolve().then(() => (init_renderer(), renderer_exports));
    await this.prepareUse();
    return createGlobalRenderer2(createTypstRenderer2, this.exOptions);
  }
};
var $typst = new TypstSnippet({
  compiler: TypstSnippet.buildGlobalCompiler,
  renderer: TypstSnippet.buildGlobalRenderer
});

// entry.mjs
window.__typst = { $typst, preloadRemoteFonts };
