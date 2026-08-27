/**
 * Renderer.js — Three.js WebGLRenderer initialization & animation loop
 */
const T = () => window.THREE;

export class Renderer {
  constructor(container) {
    const THREE = T();
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";

    this.scene = null;
    this.camera = null;
    this._rafId = null;
    this._clock = new THREE.Clock();
    this._callbacks = [];

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.container);
    this._resize();
  }

  setSceneAndCamera(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._resize();
  }

  onTick(fn) {
    this._callbacks.push(fn);
  }

  start() {
    if (this._rafId != null) return;
    this._clock.start();
    const loop = () => {
      this._rafId = requestAnimationFrame(loop);
      const dt = this._clock.getDelta();
      const elapsed = this._clock.elapsedTime;
      for (const cb of this._callbacks) cb(dt, elapsed);
      if (this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }

  stop() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      if (this.camera.isPerspectiveCamera) {
        this.camera.aspect = w / h;
      } else if (this.camera.isOrthographicCamera) {
        const aspect = w / h;
        const viewH = this.camera.userData.viewHeight || 12;
        this.camera.left = -viewH * aspect / 2;
        this.camera.right = viewH * aspect / 2;
        this.camera.top = viewH / 2;
        this.camera.bottom = -viewH / 2;
      }
      this.camera.updateProjectionMatrix();
    }
  }

  dispose() {
    this.stop();
    this._ro.disconnect();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.scene = null;
    this.camera = null;
    this._callbacks = [];
  }
}
