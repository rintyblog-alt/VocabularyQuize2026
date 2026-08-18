/**
 * ObstacleManager.js — Obstacle types, movement, collision detection
 */
const T = () => window.THREE;

import { LANE_POSITIONS } from "./StageBuilder.js";

const OBSTACLE_TYPES = {
  SPIN_BAR: "spinBar",
  CUBE: "cube",
  BOUNCE_BALL: "bounceBall",
  SLIDE_WALL: "slideWall"
};

export { OBSTACLE_TYPES };

export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    /** @type {Array<{ mesh, type, lane, active, zPos }>} */
    this.obstacles = [];
    this.obstacleGroup = new (T()).Group();
    this.obstacleGroup.name = "obstacles";
    this.scene.add(this.obstacleGroup);
  }

  /**
   * Generate obstacles along the course
   * @param {number} stageLength
   * @param {number} count
   */
  generate(stageLength = 200, count = 20) {
    const THREE = T();
    const spacing = stageLength / (count + 2);

    for (let i = 0; i < count; i++) {
      const z = -(spacing * (i + 1));
      const typeRoll = Math.random();
      let type, mesh;

      if (typeRoll < 0.25) {
        type = OBSTACLE_TYPES.SPIN_BAR;
        const geo = new THREE.BoxGeometry(7.6, 0.3, 0.3);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff5252, emissive: 0xff5252, emissiveIntensity: 0.2 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 0.9, z);
        mesh.castShadow = true;
      } else if (typeRoll < 0.5) {
        type = OBSTACLE_TYPES.CUBE;
        const lane = Math.floor(Math.random() * 3);
        const geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffb400, emissive: 0xffb400, emissiveIntensity: 0.15 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(LANE_POSITIONS[lane], 0.8, z);
        mesh.castShadow = true;
      } else if (typeRoll < 0.75) {
        type = OBSTACLE_TYPES.BOUNCE_BALL;
        const lane = Math.floor(Math.random() * 3);
        const geo = new THREE.SphereGeometry(0.8, 16, 12);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 0.15 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(LANE_POSITIONS[lane], 0.8, z);
        mesh.castShadow = true;
      } else {
        type = OBSTACLE_TYPES.SLIDE_WALL;
        const geo = new THREE.BoxGeometry(2, 2.5, 0.3);
        const mat = new THREE.MeshStandardMaterial({ color: 0x7c4dff, emissive: 0x7c4dff, emissiveIntensity: 0.15 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 1.25, z);
        mesh.castShadow = true;
      }

      this.obstacleGroup.add(mesh);
      this.obstacles.push({
        mesh,
        type,
        lane: type === OBSTACLE_TYPES.CUBE || type === OBSTACLE_TYPES.BOUNCE_BALL
          ? Math.round((mesh.position.x - LANE_POSITIONS[0]) / (LANE_POSITIONS[1] - LANE_POSITIONS[0]))
          : -1,
        active: true,
        zPos: z,
        _baseX: mesh.position.x
      });
    }
  }

  /**
   * Animate obstacles each frame
   */
  tick(elapsed) {
    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      const t = elapsed * 3;
      switch (obs.type) {
        case OBSTACLE_TYPES.SPIN_BAR:
          obs.mesh.rotation.y += 0.04;
          break;
        case OBSTACLE_TYPES.BOUNCE_BALL:
          obs.mesh.position.y = Math.abs(Math.sin(t)) * 1.2 + 0.8;
          break;
        case OBSTACLE_TYPES.SLIDE_WALL:
          obs.mesh.position.x = Math.sin(t) * 2.4;
          break;
      }
    }
  }

  /**
   * Check collision between player position and obstacles
   * @param {{ x: number, z: number }} playerPos
   * @param {number} playerRadius
   * @returns {object|null} - collided obstacle or null
   */
  checkCollision(playerPos, playerRadius = 0.55) {
    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      const dz = Math.abs(playerPos.z - obs.mesh.position.z);
      if (dz > 2) continue;

      const dx = Math.abs(playerPos.x - obs.mesh.position.x);
      let hitRadius;

      switch (obs.type) {
        case OBSTACLE_TYPES.SPIN_BAR:
          hitRadius = 3.8;
          if (dx < hitRadius && dz < 0.8) return obs;
          break;
        case OBSTACLE_TYPES.CUBE:
          hitRadius = 0.8 + playerRadius;
          if (dx < hitRadius && dz < hitRadius) return obs;
          break;
        case OBSTACLE_TYPES.BOUNCE_BALL:
          hitRadius = 0.8 + playerRadius;
          if (dx < hitRadius && dz < hitRadius && obs.mesh.position.y < 1.5) return obs;
          break;
        case OBSTACLE_TYPES.SLIDE_WALL:
          hitRadius = 1.0 + playerRadius;
          if (dx < hitRadius && dz < 0.8) return obs;
          break;
      }
    }
    return null;
  }

  /** Deactivate an obstacle after collision */
  deactivate(obs) {
    obs.active = false;
    obs.mesh.visible = false;
  }

  /** Reactivate all obstacles (for restart) */
  reactivateAll() {
    for (const obs of this.obstacles) {
      obs.active = true;
      obs.mesh.visible = true;
    }
  }

  dispose() {
    this.obstacleGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    this.scene.remove(this.obstacleGroup);
    this.obstacles = [];
  }
}
