/**
 * Renderer3D.js — 3D perspective scene (Fall Guys style)
 */
const T = () => window.THREE;

export class Renderer3D {
  constructor() {
    const THREE = T();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a0a3e);
    this.scene.fog = new THREE.FogExp2(0x1a0a3e, 0.018);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 12, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 60;
    dir.shadow.camera.left = -15;
    dir.shadow.camera.right = 15;
    dir.shadow.camera.top = 15;
    dir.shadow.camera.bottom = -15;
    this.scene.add(dir);

    this._targetPos = new THREE.Vector3(0, 0, 0);
  }

  /** Smooth camera follow on a target position */
  followTarget(targetPos, dt) {
    const THREE = T();
    this._targetPos.lerp(targetPos, Math.min(1, 0.07 * 60 * dt));
    this.camera.position.set(
      this._targetPos.x,
      this._targetPos.y + 5,
      this._targetPos.z + 10
    );
    this.camera.lookAt(this._targetPos.x, this._targetPos.y + 0.5, this._targetPos.z);
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
