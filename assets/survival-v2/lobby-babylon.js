import { getSurvivalTheme, getGraphicsProfile } from "./maps.js";

function ensureBabylon() {
  if (!window.BABYLON) throw new Error("Babylon.js is not loaded.");
  return window.BABYLON;
}

function color3(hex) {
  const BABYLON = ensureBabylon();
  return BABYLON.Color3.FromHexString(hex);
}

function color4(hex, alpha = 1) {
  const BABYLON = ensureBabylon();
  return BABYLON.Color4.FromHexString(hex).setAlpha(alpha);
}

function disposeNode(node) {
  if (!node) return;
  try { node.dispose?.(false, true); } catch (_) {}
}

function stableIndexFromId(id, total) {
  const n = Math.max(0, Number(id || 0));
  if (!total) return 0;
  return n % total;
}

const BEAN_PALETTE = ["#ff6b9d","#7c4dff","#00d4ff","#00e676","#ffb400","#ff5252"];

function createBeanCharacter(B, scene, color) {
  const root = new B.TransformNode("bean-root", scene);

  const bodyMat = new B.StandardMaterial("bean-body", scene);
  bodyMat.diffuseColor = B.Color3.FromHexString(color);
  bodyMat.specularColor = B.Color3.FromHexString("#222222");

  const whiteMat = new B.StandardMaterial("bean-white", scene);
  whiteMat.diffuseColor = B.Color3.FromHexString("#ffffff");
  whiteMat.specularColor = B.Color3.FromHexString("#111111");

  const blackMat = new B.StandardMaterial("bean-black", scene);
  blackMat.diffuseColor = B.Color3.FromHexString("#111111");
  blackMat.specularColor = B.Color3.FromHexString("#000000");

  const body = B.MeshBuilder.CreateSphere("bean-body", { diameter: 1.1, segments: 12 }, scene);
  body.scaling.y = 1.15;
  body.position.y = 0.62;
  body.material = bodyMat;
  body.parent = root;

  const head = B.MeshBuilder.CreateSphere("bean-head", { diameter: 0.76, segments: 12 }, scene);
  head.position.y = 1.38;
  head.material = bodyMat;
  head.parent = root;

  for (const side of [-1, 1]) {
    const eye = B.MeshBuilder.CreateSphere(`bean-eye-${side}`, { diameter: 0.18, segments: 8 }, scene);
    eye.position.set(0.14 * side, 1.44, 0.32);
    eye.material = whiteMat;
    eye.parent = root;
    const pupil = B.MeshBuilder.CreateSphere(`bean-pupil-${side}`, { diameter: 0.09, segments: 8 }, scene);
    pupil.position.set(0.14 * side, 1.44, 0.38);
    pupil.material = blackMat;
    pupil.parent = root;
  }

  const legL = B.MeshBuilder.CreateCylinder("bean-legL", { diameterTop: 0.28, diameterBottom: 0.32, height: 0.45, tessellation: 8 }, scene);
  legL.position.set(-0.22, 0.2, 0);
  legL.material = bodyMat;
  legL.parent = root;

  const legR = B.MeshBuilder.CreateCylinder("bean-legR", { diameterTop: 0.28, diameterBottom: 0.32, height: 0.45, tessellation: 8 }, scene);
  legR.position.set(0.22, 0.2, 0);
  legR.material = bodyMat;
  legR.parent = root;

  const footL = B.MeshBuilder.CreateSphere("bean-footL", { diameter: 0.36, segments: 8 }, scene);
  footL.scaling.set(1.2, 0.7, 1.4);
  footL.position.set(-0.22, -0.02, 0.1);
  footL.material = whiteMat;
  footL.parent = root;

  const footR = B.MeshBuilder.CreateSphere("bean-footR", { diameter: 0.36, segments: 8 }, scene);
  footR.scaling.set(1.2, 0.7, 1.4);
  footR.position.set(0.22, -0.02, 0.1);
  footR.material = whiteMat;
  footR.parent = root;

  const armL = B.MeshBuilder.CreateCylinder("bean-armL", { diameter: 0.2, height: 0.45, tessellation: 8 }, scene);
  armL.rotation.z = -0.5;
  armL.position.set(-0.65, 0.75, 0);
  armL.material = bodyMat;
  armL.parent = root;

  const armR = B.MeshBuilder.CreateCylinder("bean-armR", { diameter: 0.2, height: 0.45, tessellation: 8 }, scene);
  armR.rotation.z = 0.5;
  armR.position.set(0.65, 0.75, 0);
  armR.material = bodyMat;
  armR.parent = root;

  return { root, body, head, legL, legR, footL, footR, armL, armR };
}

function makeNameTag(scene, text, accentHex = "#8bbdff") {
  const BABYLON = ensureBabylon();
  const plane = BABYLON.MeshBuilder.CreatePlane(`tag-${text}`, { width: 1.8, height: 0.38 }, scene);
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
  plane.isPickable = false;
  const dt = new BABYLON.DynamicTexture(`tag-dt-${text}`, { width: 512, height: 128 }, scene, true);
  const ctx = dt.getContext();
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = "rgba(8, 13, 24, 0.78)";
  ctx.beginPath();
  ctx.roundRect?.(0, 8, 512, 112, 28);
  if (!ctx.roundRect) {
    ctx.fillRect(0, 8, 512, 112);
  } else {
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(1, 9, 510, 110, 26);
    ctx.stroke();
  }
  ctx.fillStyle = accentHex;
  ctx.font = "600 42px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text || "Guest"), 256, 66);
  dt.update();
  const mat = new BABYLON.StandardMaterial(`tag-mat-${text}`, scene);
  mat.diffuseTexture = dt;
  mat.emissiveColor = color3("#f4f8ff");
  mat.opacityTexture = dt;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  plane.material = mat;
  return plane;
}

export class SurvivalLobbyBabylon {
  constructor({ canvas, quality = "medium" } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.sceneRoot = null;
    this.avatarNodes = new Map();
    this.remoteOrder = [];
    this.myPlayerId = 0;
    this.mapId = "bridge";
    this.rafState = {
      sway: 0,
      running: false
    };
    this.resizeHandler = () => this.engine?.resize();
  }

  async mount() {
    const BABYLON = ensureBabylon();
    const profile = getGraphicsProfile(this.quality);
    this.engine = new BABYLON.Engine(this.canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      disableWebGL2Support: false
    });
    this.engine.setHardwareScalingLevel(profile.scalingLevel || 1);
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = color4("#07111f", 1);
    this.scene.autoClear = true;
    this.scene.imageProcessingConfiguration.toneMappingEnabled = false;
    this.scene.imageProcessingConfiguration.vignetteEnabled = false;
    this.scene.performancePriority = BABYLON.ScenePerformancePriority.Intermediate;

    this.camera = new BABYLON.ArcRotateCamera(
      "survival-lobby-camera",
      -Math.PI / 2,
      Math.PI / 2.6,
      16,
      new BABYLON.Vector3(0, 1.8, 0),
      this.scene
    );
    this.camera.lowerRadiusLimit = 12;
    this.camera.upperRadiusLimit = 18;
    this.camera.lowerBetaLimit = 0.85;
    this.camera.upperBetaLimit = 1.32;
    this.camera.fov = 0.9;
    this.camera.inputs.clear();

    const hemi = new BABYLON.HemisphericLight("survival-lobby-hemi", new BABYLON.Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.05;
    hemi.groundColor = color3("#0b1422");
    hemi.diffuse = color3("#d7e7ff");

    const dir = new BABYLON.DirectionalLight("survival-lobby-dir", new BABYLON.Vector3(-0.4, -1, 0.18), this.scene);
    dir.position = new BABYLON.Vector3(10, 18, -8);
    dir.intensity = 0.78;
    dir.diffuse = color3("#c3d7ff");

    const accent = new BABYLON.PointLight("survival-lobby-accent", new BABYLON.Vector3(0, 5.8, 6), this.scene);
    accent.intensity = 12;
    accent.range = 24;
    accent.diffuse = color3("#74a8ff");

    this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.018;

    this.sceneRoot = new BABYLON.TransformNode("survival-lobby-root", this.scene);
    this._buildLobbyShell();
    this.setTheme(this.mapId);

    this.engine.runRenderLoop(() => {
      this._tick();
      this.scene.render();
    });
    window.addEventListener("resize", this.resizeHandler);
    this.rafState.running = true;
  }

  setGraphicsQuality(quality) {
    this.quality = quality || "medium";
    if (!this.engine) return;
    const profile = getGraphicsProfile(this.quality);
    this.engine.setHardwareScalingLevel(profile.scalingLevel || 1);
    const dense = Number(profile.environmentDensity || 0.72);
    if (this.sceneRoot) {
      const decor = this.sceneRoot.getChildren((node) => String(node.name || "").startsWith("bg-"), false);
      decor.forEach((node, index) => {
        node.setEnabled(index < Math.max(6, Math.round(10 * dense)));
      });
    }
  }

  setTheme(mapId) {
    this.mapId = String(mapId || "bridge").toLowerCase();
    const theme = getSurvivalTheme(this.mapId);
    if (!this.scene) return;
    this.scene.clearColor = color4(theme.skyTop || "#07111f", 1);
    this.scene.fogColor = color3(theme.fogColor || theme.backdropColor || "#0f1b2a");
    this._rebuildBackdrop(theme);
  }

  setPlayers(players, myPlayerId = 0) {
    this.myPlayerId = Math.max(0, Number(myPlayerId || 0));
    const list = Array.isArray(players) ? players : [];
    const ids = new Set(list.map((p) => String(p?.id || p?.userId || p?.nick || Math.random())));
    for (const [id, entry] of this.avatarNodes.entries()) {
      if (!ids.has(id)) {
        disposeNode(entry.root);
        this.avatarNodes.delete(id);
      }
    }
    const me = list.find((p) => Math.max(0, Number(p?.id || 0)) === this.myPlayerId) || list[0] || null;
    const remotes = list.filter((p) => p !== me);
    if (me) this._upsertAvatar(me, new window.BABYLON.Vector3(0, 0, 0), true);
    remotes.forEach((player, index) => {
      const row = Math.floor(index / 4);
      const col = index % 4;
      const x = -4.5 + col * 3;
      const z = 4.8 + row * 2.8;
      this._upsertAvatar(player, new window.BABYLON.Vector3(x, 0, z), false);
    });
  }

  _tick() {
    if (!this.scene || !this.camera) return;
    this.rafState.sway += 0.008;
    this.camera.alpha = -Math.PI / 2 + Math.sin(this.rafState.sway * 0.65) * 0.06;
    this.camera.beta = 1.15 + Math.sin(this.rafState.sway * 0.45) * 0.025;
    this.camera.radius = 14.8 + Math.sin(this.rafState.sway * 0.35) * 0.24;
    const now = performance.now() * 0.001;
    for (const entry of this.avatarNodes.values()) {
      if (!entry || !entry.root) continue;
      entry.root.position.y = Math.sin(now * 1.2 + entry.seed) * 0.05;
      const bean = entry.bean;
      if (bean) {
        // Idle breathing animation
        const breathe = Math.sin(now * 2.0 + entry.seed) * 0.03;
        bean.body.position.y = 0.62 + breathe;
        bean.head.position.y = 1.38 + breathe * 1.2;
        // Gentle arm sway
        const sway = Math.sin(now * 1.4 + entry.seed) * 0.15;
        bean.armL.rotation.x = sway;
        bean.armR.rotation.x = -sway;
      }
    }
  }

  _buildLobbyShell() {
    const BABYLON = ensureBabylon();
    const root = this.sceneRoot;
    const groundMat = new BABYLON.PBRMaterial("lobby-ground", this.scene);
    groundMat.albedoColor = color3("#132139");
    groundMat.metallic = 0.12;
    groundMat.roughness = 0.78;
    groundMat.emissiveColor = color3("#08121f");

    const ground = BABYLON.MeshBuilder.CreateCylinder("lobby-ground", {
      diameter: 18,
      height: 0.45,
      tessellation: 48
    }, this.scene);
    ground.material = groundMat;
    ground.parent = root;
    ground.position.y = -0.24;

    const ringMat = new BABYLON.StandardMaterial("lobby-ring", this.scene);
    ringMat.emissiveColor = color3("#6fb2ff");
    ringMat.alpha = 0.85;
    const ring = BABYLON.MeshBuilder.CreateTorus("lobby-ring-main", {
      diameter: 4,
      thickness: 0.08,
      tessellation: 64
    }, this.scene);
    ring.material = ringMat;
    ring.parent = root;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;

    const platformMat = new BABYLON.StandardMaterial("lobby-platform", this.scene);
    platformMat.diffuseColor = color3("#1f3558");
    platformMat.emissiveColor = color3("#091223");
    for (let i = 0; i < 6; i += 1) {
      const arc = BABYLON.MeshBuilder.CreateBox(`bg-rail-${i}`, { width: 3.2, height: 0.18, depth: 0.24 }, this.scene);
      arc.material = platformMat;
      arc.parent = root;
      arc.position.y = 0.65;
      arc.rotation.y = (Math.PI * 2 * i) / 6;
      arc.position.x = Math.cos(arc.rotation.y) * 6.9;
      arc.position.z = Math.sin(arc.rotation.y) * 6.9;
    }
  }

  _rebuildBackdrop(theme) {
    const BABYLON = ensureBabylon();
    const current = this.sceneRoot.getChildren((node) => String(node.name || "").startsWith("bg-"), true);
    current.forEach((node) => {
      if (String(node.name || "").startsWith("bg-rail-")) return;
      disposeNode(node);
    });
    const profile = getGraphicsProfile(this.quality);
    const density = Number(profile.environmentDensity || 0.72);
    const count = Math.max(8, Math.round(14 * density));
    const backdrop = new BABYLON.TransformNode("bg-backdrop", this.scene);
    backdrop.parent = this.sceneRoot;

    const pillarMat = new BABYLON.StandardMaterial(`bg-pillars-${theme.id}`, this.scene);
    pillarMat.diffuseColor = color3(theme.backdropColor || theme.edgeColor || "#365178");
    pillarMat.emissiveColor = color3(theme.accentGlow || "#17304d").scale(0.12);

    const accentMat = new BABYLON.StandardMaterial(`bg-accent-${theme.id}`, this.scene);
    accentMat.diffuseColor = color3(theme.accentColor || "#6fb2ff");
    accentMat.emissiveColor = color3(theme.accentColor || "#6fb2ff").scale(0.65);
    accentMat.alpha = 0.92;

    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const radius = 11 + (i % 4) * 1.2;
      const height = 3.2 + (i % 5) * 1.1;
      const tower = BABYLON.MeshBuilder.CreateBox(`bg-tower-${i}`, {
        width: 1.1 + (i % 3) * 0.45,
        height,
        depth: 1.1 + (i % 2) * 0.4
      }, this.scene);
      tower.material = pillarMat;
      tower.parent = backdrop;
      tower.position = new BABYLON.Vector3(Math.cos(angle) * radius, height / 2 - 0.1, Math.sin(angle) * radius);
      tower.rotation.y = angle * 0.35;
      if (i % 2 === 0) {
        const lightBar = BABYLON.MeshBuilder.CreatePlane(`bg-light-${i}`, { width: 0.14, height: Math.max(1.4, height - 0.6) }, this.scene);
        lightBar.material = accentMat;
        lightBar.parent = tower;
        lightBar.position.z = tower.scaling.z * 0.5 + 0.08;
        lightBar.position.y = 0.1;
      }
    }

    const halo = BABYLON.MeshBuilder.CreateDisc("bg-halo", { radius: 7.8, tessellation: 80 }, this.scene);
    const haloMat = new BABYLON.StandardMaterial(`bg-halo-mat-${theme.id}`, this.scene);
    haloMat.emissiveColor = color3(theme.accentGlow || "#8bbdff").scale(0.35);
    haloMat.alpha = 0.22;
    halo.material = haloMat;
    halo.parent = backdrop;
    halo.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    halo.position = new BABYLON.Vector3(0, 4.2, 10.5);
  }

  _upsertAvatar(player, targetPosition, isMe) {
    const BABYLON = ensureBabylon();
    const id = String(player?.id || player?.userId || player?.nick || Math.random());
    let entry = this.avatarNodes.get(id);
    if (!entry) {
      const color = BEAN_PALETTE[stableIndexFromId(id, BEAN_PALETTE.length)];
      const bean = createBeanCharacter(BABYLON, this.scene, color);
      bean.root.name = `avatar-${id}`;

      const label = makeNameTag(this.scene, player?.nick || player?.displayName || "Guest", isMe ? "#b9d6ff" : "#d9f2ff");
      label.parent = bean.root;
      label.position.y = 2.3;
      entry = {
        id,
        root: bean.root,
        bean,
        label,
        isMe,
        seed: Math.random() * Math.PI * 2
      };
      this.avatarNodes.set(id, entry);
    }
    entry.isMe = !!isMe;
    entry.root.position.x = targetPosition.x;
    entry.root.position.z = targetPosition.z;
    entry.root.position.y = 0;
    entry.root.rotation.y = isMe ? 0 : Math.PI;
    if (entry.label) entry.label.isVisible = true;
  }

  dispose() {
    window.removeEventListener("resize", this.resizeHandler);
    for (const entry of this.avatarNodes.values()) {
      disposeNode(entry.root);
    }
    this.avatarNodes.clear();
    try { this.scene?.dispose(); } catch (_) {}
    try { this.engine?.dispose(); } catch (_) {}
    this.scene = null;
    this.engine = null;
    this.camera = null;
    this.sceneRoot = null;
  }
}
