/**
 * StageBuilder.js — Course tiles, walls, goal generation
 */
const T = () => window.THREE;

const TILE_COLORS = [0xff9ebc, 0xffcf6b, 0xb2eaff, 0xc9aaff, 0xb2ffcc, 0xffaaaa];
const TILE_WIDTH = 7.6;
const TILE_DEPTH = 4;
const TILE_HEIGHT = 0.4;
const TILE_COUNT = 60;
const LANE_POSITIONS = [-2.4, 0, 2.4];
const WALL_HEIGHT = 3;
const STAGE_LENGTH = 200;

export { LANE_POSITIONS, STAGE_LENGTH, TILE_WIDTH };

export class StageBuilder {
  constructor(scene) {
    this.scene = scene;
    this.tiles = [];
    this.walls = [];
    this.goalGroup = null;
    this.stageGroup = new (T()).Group();
    this.stageGroup.name = "stage";
    this.scene.add(this.stageGroup);
  }

  build() {
    const THREE = T();

    // Floor tiles
    const tileGeo = new THREE.BoxGeometry(TILE_WIDTH, TILE_HEIGHT, TILE_DEPTH);
    for (let i = 0; i < TILE_COUNT; i++) {
      const color = TILE_COLORS[i % TILE_COLORS.length];
      const mat = new THREE.MeshStandardMaterial({ color });
      const tile = new THREE.Mesh(tileGeo, mat);
      tile.position.set(0, -TILE_HEIGHT / 2, -i * TILE_DEPTH);
      tile.receiveShadow = true;
      this.stageGroup.add(tile);
      this.tiles.push(tile);
    }

    // Side walls
    const wallGeo = new THREE.BoxGeometry(0.4, WALL_HEIGHT, TILE_DEPTH * TILE_COUNT);
    const wallMatL = new THREE.MeshStandardMaterial({ color: 0xff6b9d });
    const wallMatR = new THREE.MeshStandardMaterial({ color: 0x7c4dff });

    const wallL = new THREE.Mesh(wallGeo, wallMatL);
    wallL.position.set(-TILE_WIDTH / 2 - 0.2, WALL_HEIGHT / 2, -(TILE_COUNT * TILE_DEPTH) / 2);
    this.stageGroup.add(wallL);
    this.walls.push(wallL);

    const wallR = new THREE.Mesh(wallGeo, wallMatR);
    wallR.position.set(TILE_WIDTH / 2 + 0.2, WALL_HEIGHT / 2, -(TILE_COUNT * TILE_DEPTH) / 2);
    this.stageGroup.add(wallR);
    this.walls.push(wallR);

    // Goal
    this._buildGoal();

    return this;
  }

  _buildGoal() {
    const THREE = T();
    const goalZ = -STAGE_LENGTH;
    this.goalGroup = new THREE.Group();
    this.goalGroup.name = "goal";

    // Gate top bar
    const gateGeo = new THREE.BoxGeometry(TILE_WIDTH + 1, 0.5, 0.3);
    const gateMat = new THREE.MeshStandardMaterial({ color: 0xffb400, emissive: 0xffb400, emissiveIntensity: 0.3 });
    const gate = new THREE.Mesh(gateGeo, gateMat);
    gate.position.set(0, WALL_HEIGHT, goalZ);
    this.goalGroup.add(gate);

    // Flag poles
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(side * 4, 2.5, goalZ);
      this.goalGroup.add(pole);

      // Flag
      const flagGeo = new THREE.PlaneGeometry(1.2, 0.8);
      const flagMat = new THREE.MeshStandardMaterial({
        color: side === -1 ? 0xff6b9d : 0x7c4dff,
        side: THREE.DoubleSide
      });
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(side * 4 + side * 0.6, 4.2, goalZ);
      this.goalGroup.add(flag);
    }

    this.stageGroup.add(this.goalGroup);
  }

  /**
   * Scroll tiles for infinite runner effect
   * @param {number} speed - movement per frame
   */
  scrollTiles(speed) {
    const recycleZ = 12;
    const resetZ = -(TILE_COUNT * TILE_DEPTH) + TILE_DEPTH;
    for (const tile of this.tiles) {
      tile.position.z += speed;
      if (tile.position.z > recycleZ) {
        tile.position.z += resetZ - recycleZ;
      }
    }
  }

  dispose() {
    this.stageGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    this.scene.remove(this.stageGroup);
    this.tiles = [];
    this.walls = [];
  }
}
