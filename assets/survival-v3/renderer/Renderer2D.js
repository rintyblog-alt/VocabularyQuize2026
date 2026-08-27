/**
 * Renderer2D.js — 2D orthographic scene (side-scrolling)
 */
const T = () => window.THREE;

export class Renderer2D {
  constructor() {
    const THREE = T();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a0a3e);

    const viewHeight = 12;
    this.camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 100);
    this.camera.userData.viewHeight = viewHeight;
    this.camera.position.set(0, 0, 20);
    this.camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(3, 8, 10);
    this.scene.add(dir);

    this._scrollX = 0;
  }

  /** Player stays at left 1/3, stage scrolls */
  followTarget(targetPos, dt) {
    const targetX = targetPos.x - 4;
    this._scrollX += (targetX - this._scrollX) * Math.min(1, 0.07 * 60 * dt);
    this.camera.position.x = this._scrollX;
    this.camera.position.y = 0;
    this.camera.lookAt(this._scrollX, 0, 0);
  }

  dispose() {
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
