import { buildThemeEnvironmentSeed, getGraphicsProfile, getSurvivalTheme } from "./maps.js";
import { createSurvivalMaterialKit } from "./materials.js";

function assertBabylon() {
  if (!window.BABYLON) throw new Error("Babylon.js is not available.");
  return window.BABYLON;
}

function v3(B, x = 0, y = 0, z = 0) {
  return new B.Vector3(Number(x || 0), Number(y || 0), Number(z || 0));
}

function clamp(n, min, max, fallback = min) {
  const value = Number(n);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return Number(a || 0) + ((Number(b || 0) - Number(a || 0)) * Number(t || 0));
}

function colorFromHex(B, hex, alpha = 1) {
  const c = B.Color3.FromHexString(String(hex || "#ffffff"));
  return new B.Color4(c.r, c.g, c.b, alpha);
}

function makeStandard(B, scene, key, diffuse, specular = "#000000", emissive = null, alpha = 1) {
  const mat = new B.StandardMaterial(key, scene);
  mat.diffuseColor = B.Color3.FromHexString(String(diffuse || "#ffffff"));
  mat.specularColor = B.Color3.FromHexString(String(specular || "#000000"));
  if (emissive) mat.emissiveColor = B.Color3.FromHexString(String(emissive || "#000000"));
  mat.alpha = alpha;
  return mat;
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

function setTransformFromSegment(mesh, from, to, thickness = 1, y = 0) {
  const dx = Number(to.x || 0) - Number(from.x || 0);
  const dz = Number(to.z || 0) - Number(from.z || 0);
  const len = Math.max(0.1, Math.hypot(dx, dz));
  mesh.position.x = (Number(from.x || 0) + Number(to.x || 0)) * 0.5;
  mesh.position.y = y;
  mesh.position.z = (Number(from.z || 0) + Number(to.z || 0)) * 0.5;
  mesh.scaling.z = len;
  mesh.scaling.x = Math.max(0.1, thickness);
  mesh.rotation.y = Math.atan2(dx, dz);
}

function distanceBetween(a, b) {
  const dx = Number(b?.x || 0) - Number(a?.x || 0);
  const dz = Number(b?.z || 0) - Number(a?.z || 0);
  return Math.max(0.001, Math.hypot(dx, dz));
}

export class SurvivalBabylonRenderer {
  constructor(options = {}) {
    const B = assertBabylon();
    this.B = B;
    this.container = options.container;
    this.qualityId = String(options.quality || "medium");
    this.profile = getGraphicsProfile(this.qualityId);
    this.canvas = document.createElement("canvas");
    this.canvas.className = "vs-babylon-canvas";
    this.canvas.setAttribute("aria-label", "VocabuSurvival Babylon canvas");
    this.container.innerHTML = "";
    this.container.appendChild(this.canvas);

    this.engine = new B.Engine(this.canvas, true, {
      antialias: this.profile.id !== "low",
      preserveDrawingBuffer: false,
      stencil: true
    });
    this.engine.setHardwareScalingLevel(clamp(this.profile.scalingLevel, 1, 2, 1.15));

    this.scene = new B.Scene(this.engine);
    this.scene.autoClear = true;
    this.scene.collisionsEnabled = false;
    this.scene.skipPointerMovePicking = true;

    this.cameraTarget = new B.TransformNode("vsCamTarget", this.scene);
    this.cameraPivot = new B.TransformNode("vsCamPivot", this.scene);
    this.cameraPivot.parent = this.cameraTarget;
    this.camera = new B.UniversalCamera("vsCamera", new B.Vector3(0, 2.4, 7.2), this.scene);
    this.camera.minZ = 0.05;
    this.camera.fov = 0.9;
    this.camera.parent = this.cameraPivot;
    this.camera.inputs.clear();

    this.hemiLight = new B.HemisphericLight("vsHemi", new B.Vector3(0, 1, 0), this.scene);
    this.hemiLight.intensity = 0.92;
    this.dirLight = new B.DirectionalLight("vsDir", new B.Vector3(-0.35, -1, 0.25), this.scene);
    this.dirLight.intensity = 0.62;
    this.accentLight = new B.PointLight("vsAccent", new B.Vector3(0, 12, -8), this.scene);
    this.accentLight.intensity = 0.32;
    this.accentLight.range = 52;

    this.scene.clearColor = colorFromHex(B, "#0f1524", 1);
    this.scene.fogMode = B.Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.008;

    this.materials = Object.create(null);
    this.materialKit = null;
    this.worldRoot = new B.TransformNode("vsWorldRoot", this.scene);
    this.environmentRoot = new B.TransformNode("vsEnvironmentRoot", this.scene);
    this.environmentRoot.parent = this.worldRoot;
    this.courseRoot = new B.TransformNode("vsCourseRoot", this.scene);
    this.courseRoot.parent = this.worldRoot;
    this.hazardRoot = new B.TransformNode("vsHazardRoot", this.scene);
    this.hazardRoot.parent = this.worldRoot;
    this.playerRoot = new B.TransformNode("vsPlayerRoot", this.scene);
    this.playerRoot.parent = this.worldRoot;

    this.worldMeshes = [];
    this.blockerMeshes = [];
    this.gateMeshes = new Map();
    this.hazardMeshes = new Map();
    this.playerMeshes = new Map();

    this.theme = getSurvivalTheme("bridge");
    this.environmentSeed = buildThemeEnvironmentSeed("bridge", this.profile.id);
    this.currentWorldVersion = "";
    this.localPlayerKey = "";
    this.currentSnapshot = null;
    this.viewMode = "third";
    this.look = { yaw: 0, pitch: 0.34, distance: 6.6 };
    this.pointer = { active: false, x: 0, y: 0 };
    this.lastTickMs = 0;
    this._bindControls();
    this.engine.runRenderLoop(() => this._tick());
    window.addEventListener("resize", this._handleResize, { passive: true });
  }

  _handleResize = () => {
    try { this.engine.resize(); } catch (_) {}
  };

  _bindControls() {
    const pitchMin = 0.1;
    const pitchMax = 1.18;
    this.canvas.addEventListener("pointerdown", (ev) => {
      this.pointer.active = true;
      this.pointer.x = ev.clientX;
      this.pointer.y = ev.clientY;
      try { this.canvas.setPointerCapture(ev.pointerId); } catch (_) {}
    });
    this.canvas.addEventListener("pointermove", (ev) => {
      if (!this.pointer.active) return;
      const dx = Number(ev.clientX || 0) - Number(this.pointer.x || 0);
      const dy = Number(ev.clientY || 0) - Number(this.pointer.y || 0);
      this.pointer.x = ev.clientX;
      this.pointer.y = ev.clientY;
      this.look.yaw -= dx * 0.0085;
      this.look.pitch = clamp(this.look.pitch - (dy * 0.0042), pitchMin, pitchMax, this.look.pitch);
    });
    const stopPointer = () => { this.pointer.active = false; };
    this.canvas.addEventListener("pointerup", stopPointer);
    this.canvas.addEventListener("pointercancel", stopPointer);
    this.canvas.addEventListener("wheel", (ev) => {
      this.look.distance = clamp(this.look.distance + (Math.sign(Number(ev.deltaY || 0)) * 0.42), 2.2, 9.2, this.look.distance);
      ev.preventDefault();
    }, { passive: false });
  }

  dispose() {
    window.removeEventListener("resize", this._handleResize);
    try { this.engine.stopRenderLoop(); } catch (_) {}
    try { this.scene.dispose(); } catch (_) {}
    try { this.engine.dispose(); } catch (_) {}
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }

  setGraphicsQuality(raw) {
    this.qualityId = String(raw || this.qualityId || "medium");
    this.profile = getGraphicsProfile(this.qualityId);
    this.environmentSeed = buildThemeEnvironmentSeed(this.theme.id, this.profile.id);
    this.engine.setHardwareScalingLevel(clamp(this.profile.scalingLevel, 1, 2, 1.15));
    if (this.currentSnapshot?.world) this._rebuildWorld(this.currentSnapshot.world, this.currentSnapshot);
  }

  setLocalPlayerKey(key) {
    this.localPlayerKey = String(key || "");
  }

  setViewMode(mode) {
    this.viewMode = String(mode || "third").toLowerCase() === "first" ? "first" : "third";
  }

  getLookState() {
    return {
      yaw: Number(this.look.yaw || 0),
      pitch: Number(this.look.pitch || 0.34),
      distance: Number(this.look.distance || 6.6),
      viewMode: this.viewMode
    };
  }

  getProjectorState() {
    return {
      scene: this.scene,
      camera: this.camera,
      engine: this.engine
    };
  }

  sync(snapshot, localKey = "") {
    if (!snapshot || typeof snapshot !== "object") return;
    if (localKey) this.localPlayerKey = String(localKey || "");
    this.currentSnapshot = snapshot;
    if (snapshot.world && snapshot.world.version !== this.currentWorldVersion) {
      this._rebuildWorld(snapshot.world, snapshot);
    }
    this._syncPlayers(snapshot.players || {});
    this._syncGates(snapshot);
    this._syncHazards(snapshot);
  }

  _rebuildWorld(world, snapshot) {
    this.currentWorldVersion = String(world?.version || "");
    this.theme = getSurvivalTheme(snapshot?.mapId || "bridge");
    this.environmentSeed = buildThemeEnvironmentSeed(this.theme.id, this.profile.id);
    this.scene.clearColor = colorFromHex(this.B, this.theme.skyBottom || "#10182a", 1);
    this.scene.fogColor = this.B.Color3.FromHexString(this.theme.fogColor || "#9eb4d3");
    this.hemiLight.groundColor = this.B.Color3.FromHexString(this.theme.groundColor || "#25354a");
    this.hemiLight.diffuse = this.B.Color3.FromHexString(this.theme.ambientColor || "#f5f7fb");
    this.accentLight.diffuse = this.B.Color3.FromHexString(this.theme.accentGlow || this.theme.accentColor || "#8ac4ff");
    this.dirLight.diffuse = this.B.Color3.FromHexString(this.theme.ambientColor || "#ffffff");
    this._refreshMaterialKit();

    this._clearNode(this.environmentRoot);
    this._clearNode(this.courseRoot);
    this._clearNode(this.hazardRoot);
    this.worldMeshes = [];
    this.blockerMeshes = [];
    this.gateMeshes.clear();
    this.hazardMeshes.clear();

    this._buildCourse(world?.track || {});
    this._buildEnvironment(world?.track || {}, snapshot?.mapId || "bridge");
    this._buildHazards(world?.hazards || []);
  }

  _clearNode(node) {
    const children = node.getChildMeshes(false);
    for (const mesh of children) {
      try { mesh.dispose(false, true); } catch (_) {}
    }
    const transforms = node.getChildTransformNodes(false);
    for (const child of transforms) {
      if (child === node) continue;
      try { child.dispose(false, true); } catch (_) {}
    }
  }

  _ensureMaterial(key, diffuse, specular, emissive, alpha = 1) {
    if (!this.materials[key]) {
      this.materials[key] = makeStandard(this.B, this.scene, key, diffuse, specular, emissive, alpha);
    }
    return this.materials[key];
  }

  _refreshMaterialKit() {
    this.materialKit = createSurvivalMaterialKit(this.B, this.scene, this.theme, this.profile);
  }

  _buildCourse(track) {
    const B = this.B;
    const sections = Array.isArray(track?.sections) ? track.sections : [];
    const checkpoints = Array.isArray(track?.checkpoints) ? track.checkpoints : [];
    const gates = Array.isArray(track?.gates) ? track.gates : [];
    const goal = track?.goal && typeof track.goal === "object" ? track.goal : null;

    if (!this.materialKit) this._refreshMaterialKit();
    const laneMat = this.materialKit.lane;
    const edgeMat = this.materialKit.edge;
    const railMat = this.materialKit.rail;
    const gateMat = this.materialKit.gate;
    const gateDoorMat = this.materialKit.gateDoor;
    const checkpointMat = this.materialKit.checkpoint;
    const goalMat = this.materialKit.goal;
    const styleAccentMat = this.materialKit.accent;
    const styleWarmMat = this.materialKit.warm;

    for (const section of sections) {
      const from = section?.from || {};
      const to = section?.to || {};
      const width = lerp(from.width, to.width, 0.5);
      const style = String(section?.style || "default");
      const road = B.MeshBuilder.CreateBox(`sec-road-${section.index}`, {
        width: Math.max(2.4, Number(width || 7.5)),
        height: 0.6,
        depth: 1
      }, this.scene);
      road.material = laneMat;
      road.parent = this.courseRoot;
      setTransformFromSegment(road, from, to, width, 0.25);
      this.worldMeshes.push(road);
      this.blockerMeshes.push(road);

      const leftRail = B.MeshBuilder.CreateBox(`sec-left-${section.index}`, { width: 0.24, height: 1.2, depth: 1 }, this.scene);
      leftRail.material = railMat;
      leftRail.parent = this.courseRoot;
      setTransformFromSegment(leftRail, from, to, 0.24, 0.9);
      leftRail.position.x += Math.cos(leftRail.rotation.y) * (width * 0.5 + 0.18);
      leftRail.position.z -= Math.sin(leftRail.rotation.y) * (width * 0.5 + 0.18);
      this.blockerMeshes.push(leftRail);
      this.worldMeshes.push(leftRail);

      const rightRail = leftRail.clone(`sec-right-${section.index}`);
      rightRail.parent = this.courseRoot;
      rightRail.position.x -= Math.cos(leftRail.rotation.y) * ((width * 0.5 + 0.18) * 2);
      rightRail.position.z += Math.sin(leftRail.rotation.y) * ((width * 0.5 + 0.18) * 2);
      this.blockerMeshes.push(rightRail);
      this.worldMeshes.push(rightRail);

      const shadowStrip = B.MeshBuilder.CreateGround(`sec-shadow-${section.index}`, { width: Math.max(2.8, width + 1), height: Math.max(8, road.scaling.z) }, this.scene);
      shadowStrip.material = edgeMat;
      shadowStrip.position.copyFrom(road.position);
      shadowStrip.position.y = -0.02;
      shadowStrip.rotation.y = road.rotation.y;
      shadowStrip.parent = this.courseRoot;
      shadowStrip.visibility = 0.24;

      this._decorateCourseSection({
        section,
        road,
        width,
        from,
        to,
        style,
        laneMat,
        edgeMat,
        railMat,
        accentMat: styleAccentMat,
        warmMat: styleWarmMat
      });
    }

    for (const checkpoint of checkpoints) {
      if (Number(checkpoint.index || 0) === 0) continue;
      const ring = B.MeshBuilder.CreateTorus(`cp-ring-${checkpoint.index}`, { diameter: Math.max(2.4, Number(checkpoint.r || 1.2) * 2.8), thickness: 0.14, tessellation: 24 }, this.scene);
      ring.material = checkpointMat;
      ring.position = v3(B, checkpoint.x, 1.25, checkpoint.z);
      ring.rotation.x = Math.PI * 0.5;
      ring.parent = this.courseRoot;
      ring.renderingGroupId = 1;
      this.worldMeshes.push(ring);
    }

    for (const gate of gates) {
      const gateStyle = String(gate?.style || "checkpoint");
      const frame = new B.TransformNode(`gate-frame-${gate.id}`, this.scene);
      frame.parent = this.courseRoot;
      frame.position = v3(B, gate.x, 0, gate.z);
      const left = B.MeshBuilder.CreateBox(`gate-left-${gate.id}`, { width: 0.28, height: 2.8, depth: 0.28 }, this.scene);
      left.material = gateMat;
      left.parent = frame;
      left.position.x = -Math.max(1.1, Number(gate.halfW || 2.6) - 0.22);
      left.position.y = 1.4;
      const right = left.clone(`gate-right-${gate.id}`);
      right.parent = frame;
      right.position.x = Math.abs(left.position.x);
      const top = B.MeshBuilder.CreateBox(`gate-top-${gate.id}`, { width: Math.max(2.4, Number(gate.halfW || 2.6) * 2), height: 0.22, depth: 0.28 }, this.scene);
      top.material = gateMat;
      top.parent = frame;
      top.position.y = 2.72;
      const door = B.MeshBuilder.CreateBox(`gate-door-${gate.id}`, { width: Math.max(2.0, Number(gate.halfW || 2.6) * 1.78), height: 2.24, depth: 0.22 }, this.scene);
      door.material = gateStyle === "lava" || gateStyle === "hazard" ? styleWarmMat : gateDoorMat;
      door.parent = frame;
      door.position.y = 1.2;
      this.gateMeshes.set(String(gate.id || ""), { frame, door, open: false, anim: 0 });
      this.worldMeshes.push(left, right, top, door);
      this.blockerMeshes.push(left, right, top, door);
    }

    if (goal) {
      const goalBase = B.MeshBuilder.CreateCylinder("goal-base", { diameter: Math.max(3.4, Number(goal.halfW || 2.5) * 2.5), height: 0.4, tessellation: 32 }, this.scene);
      goalBase.material = goalMat;
      goalBase.position = v3(B, goal.x, 0.2, goal.z);
      goalBase.parent = this.courseRoot;
      const goalRing = B.MeshBuilder.CreateTorus("goal-ring", { diameter: Math.max(3.8, Number(goal.halfW || 2.5) * 2.6), thickness: 0.22, tessellation: 32 }, this.scene);
      goalRing.material = goalMat;
      goalRing.position = v3(B, goal.x, 2.4, goal.z);
      goalRing.rotation.x = Math.PI * 0.5;
      goalRing.parent = this.courseRoot;
      this.goalRing = goalRing;
    }

    this._buildTrackLandmarks(track?.profile || null);
  }

  _decorateCourseSection(ctx) {
    const B = this.B;
    const {
      section,
      road,
      width,
      from,
      to,
      style,
      accentMat,
      warmMat,
      railMat
    } = ctx;
    const segLen = Math.max(2.4, Number(road.scaling.z || 1));
    const addStrip = (count, colorMat, widthScale = 0.18, y = 0.34, gapScale = 0.72) => {
      const usable = Math.max(1, count);
      for (let i = 0; i < usable; i += 1) {
        const marker = B.MeshBuilder.CreateBox(`sec-style-${section.index}-${style}-${i}`, {
          width: Math.max(0.18, width * widthScale),
          height: 0.04,
          depth: Math.max(0.55, segLen / Math.max(6, usable + 2))
        }, this.scene);
        marker.material = colorMat;
        marker.parent = this.courseRoot;
        marker.position.copyFrom(road.position);
        marker.position.y = y;
        marker.rotation.y = road.rotation.y;
        const offsetZ = ((i - ((usable - 1) / 2)) * (segLen / (usable + gapScale)));
        marker.position.x += Math.sin(road.rotation.y) * offsetZ;
        marker.position.z += Math.cos(road.rotation.y) * offsetZ;
      }
    };
    const addSidePosts = (count, height = 1.8, spread = 0.8, mat = railMat, yBase = 0.75) => {
      const usable = Math.max(1, count);
      for (let i = 0; i < usable; i += 1) {
        const offsetZ = ((i - ((usable - 1) / 2)) * (segLen / (usable + 0.9)));
        for (const side of [-1, 1]) {
          const post = B.MeshBuilder.CreateCylinder(`sec-post-${section.index}-${style}-${side}-${i}`, {
            diameter: 0.16,
            height
          }, this.scene);
          post.material = mat;
          post.parent = this.courseRoot;
          post.position.copyFrom(road.position);
          post.position.y = yBase + (height * 0.5);
          post.rotation.y = road.rotation.y;
          post.position.x += Math.cos(road.rotation.y) * ((width * 0.5) + spread) * side;
          post.position.z -= Math.sin(road.rotation.y) * ((width * 0.5) + spread) * side;
          post.position.x += Math.sin(road.rotation.y) * offsetZ;
          post.position.z += Math.cos(road.rotation.y) * offsetZ;
        }
      }
    };
    const addBannerPair = (count, tint = accentMat, yBase = 1.4) => {
      addSidePosts(count, 2.6, 0.86, railMat, 0.32);
      const usable = Math.max(1, count);
      for (let i = 0; i < usable; i += 1) {
        const offsetZ = ((i - ((usable - 1) / 2)) * (segLen / (usable + 0.9)));
        for (const side of [-1, 1]) {
          const flag = B.MeshBuilder.CreatePlane(`sec-flag-${section.index}-${style}-${side}-${i}`, { width: 0.9, height: 1.2 }, this.scene);
          flag.material = tint;
          flag.parent = this.courseRoot;
          flag.position.copyFrom(road.position);
          flag.position.y = yBase;
          flag.rotation.y = road.rotation.y + (side < 0 ? Math.PI : 0);
          flag.position.x += Math.cos(road.rotation.y) * ((width * 0.5) + 0.94) * side;
          flag.position.z -= Math.sin(road.rotation.y) * ((width * 0.5) + 0.94) * side;
          flag.position.x += Math.sin(road.rotation.y) * offsetZ;
          flag.position.z += Math.cos(road.rotation.y) * offsetZ;
        }
      }
    };
    if (style === "crosswalk") {
      addStrip(6, accentMat, 0.88, 0.35, 1.3);
      return;
    }
    if (style === "elevated") {
      for (let i = 0; i < 3; i += 1) {
        const brace = B.MeshBuilder.CreateCylinder(`sec-elev-${section.index}-${i}`, { diameter: 0.3, height: 4.8 }, this.scene);
        brace.material = railMat;
        brace.parent = this.courseRoot;
        brace.position.copyFrom(road.position);
        brace.position.y = -1.6;
        brace.rotation.y = road.rotation.y;
        const step = (i - 1) * (segLen / 3.8);
        brace.position.x += Math.sin(road.rotation.y) * step;
        brace.position.z += Math.cos(road.rotation.y) * step;
      }
      addBannerPair(2, accentMat, 2.2);
      return;
    }
    if (style === "suspension") {
      for (let side = -1; side <= 1; side += 2) {
        const cable = B.MeshBuilder.CreateCylinder(`sec-cable-${section.index}-${side}`, { diameter: 0.14, height: Math.max(6.4, segLen * 0.42), tessellation: 12 }, this.scene);
        cable.material = accentMat;
        cable.parent = this.courseRoot;
        cable.position.copyFrom(road.position);
        cable.position.y = 3.6;
        cable.rotation.z = side * 0.22;
        cable.rotation.y = road.rotation.y;
        cable.position.x += Math.cos(road.rotation.y) * (width * 0.48 + 0.35) * side;
        cable.position.z -= Math.sin(road.rotation.y) * (width * 0.48 + 0.35) * side;
      }
      addSidePosts(3, 2.4, 0.92, accentMat, 0.32);
      return;
    }
    if (style === "lava-rim" || style === "vent" || style === "broken") {
      addStrip(3, warmMat, 0.22, 0.36, 1.8);
      if (style === "broken") addBannerPair(2, warmMat, 1.9);
      if (style === "vent") addSidePosts(3, 1.4, 0.76, warmMat, 0.42);
      return;
    }
    if (style === "trial" || style === "hazard") {
      addStrip(4, accentMat, 0.16, 0.36, 1.5);
      addBannerPair(2, style === "hazard" ? warmMat : accentMat, 1.85);
      return;
    }
    if (style === "boulevard") {
      addStrip(5, accentMat, 0.06, 0.35, 1.1);
      addSidePosts(4, 2.2, 1.12, accentMat, 0.2);
      return;
    }
    if (style === "alley" || style === "narrow") {
      const marker = B.MeshBuilder.CreateBox(`sec-narrow-${section.index}`, {
        width: Math.max(0.12, width * 0.08),
        height: 0.05,
        depth: Math.max(1.2, segLen * 0.72)
      }, this.scene);
      marker.material = accentMat;
      marker.parent = this.courseRoot;
      marker.position.copyFrom(road.position);
      marker.position.y = 0.34;
      marker.rotation.y = road.rotation.y;
      addSidePosts(2, 1.6, 0.58, accentMat, 0.24);
      return;
    }
    if (style === "wind") {
      addStrip(3, accentMat, 0.14, 0.35, 1.4);
      addBannerPair(3, accentMat, 2.0);
      return;
    }
    if (style === "ridge" || style === "basalt") {
      addStrip(3, warmMat, 0.12, 0.36, 1.6);
      addSidePosts(3, 1.6, 0.72, warmMat, 0.18);
      return;
    }
    if (style === "wide") {
      addStrip(6, accentMat, 0.05, 0.34, 1.0);
      addBannerPair(2, accentMat, 1.75);
      return;
    }
    if (style === "goal" || style === "start") {
      addBannerPair(2, accentMat, 2.2);
    }
  }

  _buildTrackLandmarks(profile) {
    const B = this.B;
    const landmarks = Array.isArray(profile?.landmarks) ? profile.landmarks : [];
    if (!landmarks.length) return;
    const backMat = this._ensureMaterial(`landmark-back-${this.theme.id}`, this.theme.backdropColor || this.theme.edgeColor, "#111");
    const accentMat = this._ensureMaterial(`landmark-accent-${this.theme.id}`, this.theme.accentColor, "#111", this.theme.accentGlow);
    for (const [index, row] of landmarks.entries()) {
      const type = String(row?.type || "totem");
      const x = Number(row?.x || 0);
      const z = Number(row?.z || 0);
      if (type === "tower" || type === "totem" || type === "spike") {
        const mesh = B.MeshBuilder.CreateCylinder(`landmark-${type}-${index}`, {
          diameterTop: type === "spike" ? 0.6 : 1.2,
          diameterBottom: type === "spike" ? 1.8 : 1.6,
          height: type === "totem" ? 7.2 : 10.4,
          tessellation: 10
        }, this.scene);
        mesh.material = type === "totem" ? accentMat : backMat;
        mesh.position = v3(B, x, (type === "totem" ? 3.6 : 5.2), z);
        mesh.parent = this.environmentRoot;
        continue;
      }
      if (type === "arch" || type === "overpass") {
        const ring = B.MeshBuilder.CreateTorus(`landmark-${type}-${index}`, {
          diameter: type === "overpass" ? 16 : 12,
          thickness: 0.4,
          tessellation: 28
        }, this.scene);
        ring.material = accentMat;
        ring.position = v3(B, x, type === "overpass" ? 6.8 : 5.8, z);
        ring.rotation.x = Math.PI * 0.5;
        ring.parent = this.environmentRoot;
        continue;
      }
      if (type === "billboard") {
        const pole = B.MeshBuilder.CreateCylinder(`landmark-billboard-pole-${index}`, { diameter: 0.34, height: 6.4 }, this.scene);
        pole.material = backMat;
        pole.position = v3(B, x, 3.2, z);
        pole.parent = this.environmentRoot;
        const board = B.MeshBuilder.CreateBox(`landmark-billboard-${index}`, { width: 4.8, height: 2.2, depth: 0.2 }, this.scene);
        board.material = accentMat;
        board.position = v3(B, x, 6.2, z);
        board.parent = this.environmentRoot;
        continue;
      }
      if (type === "plaza" || type === "caldera") {
        const disk = B.MeshBuilder.CreateCylinder(`landmark-${type}-${index}`, {
          diameter: type === "caldera" ? 10.4 : 8.6,
          height: 0.4,
          tessellation: 28
        }, this.scene);
        disk.material = type === "caldera" ? accentMat : backMat;
        disk.position = v3(B, x, 0.12, z);
        disk.parent = this.environmentRoot;
      }
    }
  }

  _buildEnvironment(track, mapId) {
    const B = this.B;
    const bounds = track?.bounds || { minX: -12, maxX: 12, minZ: -120, maxZ: 20 };
    const env = this.environmentSeed;
    const theme = this.theme;
    const envCfg = theme.environment || {};
    if (!this.materialKit) this._refreshMaterialKit();
    const groundMat = this.materialKit.ground;
    const backMat = this.materialKit.backdrop;
    const accentMat = this.materialKit.accent;
    const sidewalkMat = this.materialKit.sidewalk;

    const floor = B.MeshBuilder.CreateGround(`env-floor-${theme.id}`, {
      width: Math.max(40, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 24),
      height: Math.max(120, (Number(bounds.maxZ || 12) - Number(bounds.minZ || -120)) + 36)
    }, this.scene);
    floor.material = groundMat;
    floor.position.y = -0.05;
    floor.position.z = (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5;
    floor.parent = this.environmentRoot;

    const farRows = Math.max(1, Number(env.farLayers || envCfg.skylineLayers || 1));
    this._buildBackdropBands(bounds, backMat, accentMat, farRows, envCfg);

    if (mapId === "bridge") {
      this._buildBridgeEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "city") {
      this._buildCityEnvironment(bounds, sidewalkMat, accentMat, backMat);
      return;
    }
    if (mapId === "volcano") {
      this._buildVolcanoEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "snow") {
      this._buildSnowEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "factory") {
      this._buildFactoryEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "jungle") {
      this._buildJungleEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "lab") {
      this._buildLabEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "sky") {
      this._buildSkyEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "aqua") {
      this._buildAquaEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "ice") {
      this._buildIceEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "desert") {
      this._buildDesertEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "rail") {
      this._buildRailEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "canyon") {
      this._buildCanyonEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "ruins") {
      this._buildRuinsEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "neon") {
      this._buildNeonEnvironment(bounds, accentMat, backMat);
      return;
    }
    if (mapId === "gauntlet") {
      this._buildGauntletEnvironment(bounds, accentMat, backMat);
      return;
    }

    const decorCount = Math.max(6, Number(env.decorCount || 12));
    for (let i = 0; i < decorCount; i += 1) {
      const box = B.MeshBuilder.CreateBox(`env-box-${theme.id}-${i}`, {
        width: 1.8 + ((i % 3) * 0.8),
        height: 2.4 + ((i % 4) * 1.2),
        depth: 1.8 + ((i % 2) * 1.1)
      }, this.scene);
      box.material = backMat;
      box.position.x = (i % 2 === 0 ? 1 : -1) * (Math.max(8, Number(bounds.maxX || 12)) + 3 + ((i % 4) * 2.2));
      box.position.z = Number(bounds.maxZ || 12) - (i * 9.5);
      box.position.y = box.scaling.y * 0.5;
      box.parent = this.environmentRoot;
      box.visibility = 0.76;
    }
  }

  _buildBackdropBands(bounds, backMat, accentMat, farRows, envCfg) {
    const B = this.B;
    const widthBase = Math.max(48, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 36);
    for (let row = 0; row < farRows; row += 1) {
      const width = widthBase + (row * 18);
      const plane = B.MeshBuilder.CreateGround(`env-far-${this.theme.id}-${row}`, {
        width,
        height: 28 + (row * 6)
      }, this.scene);
      plane.material = row === 0 ? backMat : accentMat;
      plane.position.z = Number(bounds.minZ || -120) - 24 - (row * 18);
      plane.position.y = -0.28 - (row * 0.05);
      plane.parent = this.environmentRoot;
      plane.visibility = row === 0 ? 0.34 : Math.max(0.08, 0.18 - (row * 0.03));
    }

    const horizonType = String(envCfg.horizonType || this.theme.id || "default");
    const density = Math.max(1, Number(envCfg.landmarkDensity || 1));
    const layerCount = Math.max(2, farRows + 1);
    for (let layer = 0; layer < layerCount; layer += 1) {
      const count = Math.max(3, Math.round((4 + (layer * 2)) * density));
      for (let i = 0; i < count; i += 1) {
        const height = 4 + (((i + layer) % 4) * 2.2) + (layer * 1.4);
        const width = 2 + (((i + layer) % 3) * 1.1);
        const depth = 1.8 + (((i + layer) % 2) * 0.9);
        const mesh = B.MeshBuilder.CreateBox(`env-horizon-${horizonType}-${layer}-${i}`, {
          width,
          height,
          depth
        }, this.scene);
        mesh.material = layer === 0 ? backMat : accentMat;
        mesh.visibility = layer === 0 ? 0.22 : Math.max(0.06, 0.16 - (layer * 0.02));
        mesh.position.x = (i - ((count - 1) * 0.5)) * (6.8 + (layer * 1.8));
        mesh.position.z = Number(bounds.minZ || -120) - 18 - (layer * 16) - ((i % 3) * 3.4);
        mesh.position.y = (height * 0.5) - 0.4;
        mesh.parent = this.environmentRoot;
      }
    }
  }

  _buildBridgeEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const cfg = this.theme.environment || {};
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    const water = B.MeshBuilder.CreateGround("bridge-water", {
      width: Math.max(84, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 72),
      height: Math.max(220, Math.abs(Number(bounds.minZ || -120)) + 90)
    }, this.scene);
    water.material = this.materialKit?.water || this._ensureMaterial("bridge-water-mat", "#5b98c8", "#111", "#89d2ff");
    water.position.z = (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5 - 26;
    water.position.y = -3.4;
    water.parent = this.environmentRoot;
    water.visibility = 0.66;

    const towerCount = Math.max(2, Number(cfg.bridgeTowerCount || 3));
    const span = Math.abs(Number(bounds.minZ || -120)) + 20;
    for (let i = 0; i < towerCount; i += 1) {
      const z = Number(bounds.maxZ || 12) - (i * (span / Math.max(1, towerCount - 1))) - 10;
      const anchorZ = z - 18;
      for (const side of [-1, 1]) {
        const tower = B.MeshBuilder.CreateBox(`bridge-tower-${i}-${side}`, { width: 1.4, height: 16, depth: 1.4 }, this.scene);
        tower.material = this.materialKit?.bridgeSteel || backMat;
        tower.position = v3(B, side * 8.8, 8, z);
        tower.parent = this.environmentRoot;
        const cap = B.MeshBuilder.CreateBox(`bridge-cap-${i}-${side}`, { width: 1.8, height: 1, depth: 1.8 }, this.scene);
        cap.material = this.materialKit?.accent || accentMat;
        cap.position = v3(B, side * 8.8, 16.2, z);
        cap.parent = this.environmentRoot;
        const anchor = B.MeshBuilder.CreateCylinder(`bridge-anchor-${i}-${side}`, { diameter: 0.34, height: 2.2 }, this.scene);
        anchor.material = this.materialKit?.bridgeSteel || accentMat;
        anchor.position = v3(B, side * 5.1, 2.1, anchorZ);
        anchor.parent = this.environmentRoot;
        const cableHeight = Math.max(8.4, distanceBetween({ x: side * 8.8, z }, { x: side * 5.1, z: anchorZ }) * 0.9);
        const cable = B.MeshBuilder.CreateCylinder(`bridge-main-cable-${i}-${side}`, { diameter: 0.18, height: cableHeight, tessellation: 10 }, this.scene);
        cable.material = this.materialKit?.bridgeSteel || accentMat;
        cable.parent = this.environmentRoot;
        cable.position = v3(B, (side * 8.8 + side * 5.1) * 0.5, 9.2, (z + anchorZ) * 0.5);
        cable.rotation.z = side * 0.3;
      }
      const cross = B.MeshBuilder.CreateBox(`bridge-cross-${i}`, { width: 18.5, height: 0.5, depth: 0.5 }, this.scene);
      cross.material = this.materialKit?.bridgeSteel || accentMat;
      cross.position = v3(B, 0, 14.4, z);
      cross.parent = this.environmentRoot;
    }

    const ribbonCount = Math.max(3, Number(cfg.windRibbonCount || 5));
    for (let i = 0; i < ribbonCount; i += 1) {
      const ribbon = B.MeshBuilder.CreatePlane(`bridge-ribbon-${i}`, { width: 7.5, height: 0.9 }, this.scene);
      ribbon.material = this._ensureMaterial(`bridge-ribbon-mat-${i}`, "#d8efff", "#111", "#b3ecff", 0.22);
      ribbon.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
      ribbon.position = v3(B, (i % 2 === 0 ? -1 : 1) * (4 + (i * 0.8)), 6 + (i * 1.3), Number(bounds.maxZ || 12) - 16 - (i * 18));
      ribbon.parent = this.environmentRoot;
    }

    const pillarCount = Math.max(10, Math.round(14 * density));
    for (let i = 0; i < pillarCount; i += 1) {
      const pillar = B.MeshBuilder.CreateCylinder(`bridge-pillar-${i}`, { diameter: 1.6, height: 8 + (i % 3) * 2.6 }, this.scene);
      pillar.material = this.materialKit?.bridgeSteel || backMat;
      pillar.position.x = i % 2 === 0 ? -7.2 : 7.2;
      pillar.position.z = Number(bounds.maxZ || 12) - (i * 15.5);
      pillar.position.y = (pillar.scaling.y * 0.5) - 4.1;
      pillar.parent = this.environmentRoot;
    }

    if (density >= 0.7) {
      for (let i = 0; i < 6; i += 1) {
        const debris = B.MeshBuilder.CreateBox(`bridge-debris-${i}`, {
          width: 0.8 + ((i % 2) * 0.5),
          height: 0.4 + ((i % 3) * 0.18),
          depth: 2.8 + ((i % 2) * 1.2)
        }, this.scene);
        debris.material = this.materialKit?.bridgeSteel || backMat;
        debris.position = v3(B, i % 2 === 0 ? -11.2 : 11.2, -1.2 - ((i % 2) * 0.8), Number(bounds.maxZ || 12) - 44 - (i * 18));
        debris.rotation.y = i * 0.44;
        debris.parent = this.environmentRoot;
      }
    }

    const arch = B.MeshBuilder.CreateTorus("bridge-arch", { diameter: 21, thickness: 0.46, tessellation: 36 }, this.scene);
    arch.material = this.materialKit?.accent || accentMat;
    arch.position = v3(B, 0, 8.2, Number(bounds.minZ || -120) + 16);
    arch.rotation.x = Math.PI * 0.5;
    arch.parent = this.environmentRoot;
  }

  _buildCityEnvironment(bounds, sidewalkMat, accentMat, backMat) {
    const B = this.B;
    const cfg = this.theme.environment || {};
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    const road = B.MeshBuilder.CreateGround("city-road", {
      width: Math.max(28, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 18),
      height: Math.max(176, Math.abs(Number(bounds.minZ || -120)) + 48)
    }, this.scene);
    road.material = this.materialKit?.road || this._ensureMaterial("city-road-mat", this.theme.laneColor, "#111");
    road.position.z = (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5 - 22;
    road.position.y = -0.08;
    road.parent = this.environmentRoot;

    const stripeMat = this.materialKit?.roadStripe || this._ensureMaterial("city-stripe-mat", this.theme.roadStripeColor || "#f5efcf", "#111", null, 0.92);
    for (let i = 0; i < 18; i += 1) {
      const stripe = B.MeshBuilder.CreateGround(`city-stripe-${i}`, { width: 0.35, height: 3.4 }, this.scene);
      stripe.material = stripeMat;
      stripe.position = v3(B, 0, 0.02, Number(bounds.maxZ || 12) - 10 - (i * 9.2));
      stripe.parent = this.environmentRoot;
    }

    const walkHeight = Number(road.scaling.z || 176);
    for (const side of [-1, 1]) {
      const sidewalk = B.MeshBuilder.CreateGround(`city-sidewalk-${side}`, { width: 6.2, height: walkHeight }, this.scene);
      sidewalk.material = sidewalkMat;
      sidewalk.position.x = side * 10.6;
      sidewalk.position.z = road.position.z;
      sidewalk.position.y = 0.03;
      sidewalk.parent = this.environmentRoot;

      const curb = B.MeshBuilder.CreateBox(`city-curb-${side}`, { width: 0.35, height: 0.25, depth: walkHeight }, this.scene);
      curb.material = accentMat;
      curb.position = v3(B, side * 7.6, 0.12, road.position.z);
      curb.parent = this.environmentRoot;
    }

    const bandCount = Math.max(2, Number(cfg.buildingBands || 3));
    for (let band = 0; band < bandCount; band += 1) {
      const depthOffset = 14 + (band * 8.5);
      const spacing = 11.5 - (band * 1.6);
      const count = Math.max(8, Math.round(10 + (band * 4 * this.profile.environmentDensity)));
      for (const side of [-1, 1]) {
        for (let i = 0; i < count; i += 1) {
          const height = 7 + (((i + band) % 6) * 3.2) + (band * 2.1);
          const width = 2.8 + (((i + band) % 3) * 1.1);
          const depth = 2.8 + (((i + band) % 4) * 0.9);
          const building = B.MeshBuilder.CreateBox(`city-building-${band}-${side}-${i}`, {
            width,
            height,
            depth
          }, this.scene);
          building.material = band === 0 ? (this.materialKit?.building || backMat) : (this.materialKit?.glass || accentMat);
          building.visibility = band === 0 ? 0.92 : (band === 1 ? 0.55 : 0.32);
          building.position.x = side * (14 + (band * 6) + ((i % 3) * 2.8));
          building.position.z = Number(bounds.maxZ || 12) - (i * spacing) - depthOffset;
          building.position.y = height * 0.5;
          building.parent = this.environmentRoot;
        }
      }
    }

    for (let i = 0; i < 12; i += 1) {
      const rail = B.MeshBuilder.CreateBox(`city-guardrail-${i}`, { width: 0.16, height: 1.1, depth: 6.2 }, this.scene);
      rail.material = this.materialKit?.rail || accentMat;
      rail.position.x = i % 2 === 0 ? -6.8 : 6.8;
      rail.position.z = Number(bounds.maxZ || 12) - (i * 10.8);
      rail.position.y = 0.72;
      rail.parent = this.environmentRoot;
    }

    const lightCount = Math.max(6, Math.round(10 * density));
    for (let i = 0; i < lightCount; i += 1) {
      for (const side of [-1, 1]) {
        const pole = B.MeshBuilder.CreateCylinder(`city-light-pole-${i}-${side}`, { diameter: 0.14, height: 4.8 }, this.scene);
        pole.material = this.materialKit?.rail || backMat;
        pole.position = v3(B, side * 9.3, 2.4, Number(bounds.maxZ || 12) - 12 - (i * 18));
        pole.parent = this.environmentRoot;
        const lamp = B.MeshBuilder.CreateSphere(`city-light-lamp-${i}-${side}`, { diameter: 0.42, segments: 12 }, this.scene);
        lamp.material = this._ensureMaterial(`city-light-mat-${side}`, "#fff3cf", "#111", "#ffe7a1", 0.96);
        lamp.position = v3(B, pole.position.x + (side * -0.24), 4.7, pole.position.z);
        lamp.parent = this.environmentRoot;
      }
    }

    const scaffoldCount = Math.max(2, Math.round(4 * density));
    for (let i = 0; i < scaffoldCount; i += 1) {
      const root = new B.TransformNode(`city-scaffold-${i}`, this.scene);
      root.parent = this.environmentRoot;
      root.position = v3(B, i % 2 === 0 ? -12.8 : 12.8, 0, Number(bounds.maxZ || 12) - 34 - (i * 32));
      const span = 4.2;
      const height = 5.6 + ((i % 2) * 1.2);
      for (const x of [-1, 1]) {
        for (const z of [-1, 1]) {
          const post = B.MeshBuilder.CreateBox(`city-scaffold-post-${i}-${x}-${z}`, { width: 0.18, height, depth: 0.18 }, this.scene);
          post.material = this.materialKit?.rail || accentMat;
          post.parent = root;
          post.position = v3(B, x * (span * 0.5), height * 0.5, z * 1.8);
        }
      }
      const deck = B.MeshBuilder.CreateBox(`city-scaffold-deck-${i}`, { width: span + 0.5, height: 0.2, depth: 4.1 }, this.scene);
      deck.material = this.materialKit?.sidewalk || sidewalkMat;
      deck.parent = root;
      deck.position = v3(B, 0, 3.1, 0);
    }

    const elevatedRoads = Math.max(1, Number(cfg.elevatedRoads || 2));
    this.cityTrafficLane = { lanes: [] };
    for (let laneIndex = 0; laneIndex < elevatedRoads; laneIndex += 1) {
      const offsetX = laneIndex === 0 ? 0 : (laneIndex % 2 === 0 ? 4.8 : -4.8);
      const elevated = B.MeshBuilder.CreateGround(`city-elevated-${laneIndex}`, { width: 8.8, height: 118 }, this.scene);
      elevated.material = this.materialKit?.edge || this._ensureMaterial(`city-elevated-mat-${laneIndex}`, laneIndex === 0 ? "#5d6778" : "#6a7386", "#111");
      elevated.position = v3(B, offsetX, 8.8 + (laneIndex * 0.8), Number(bounds.minZ || -120) * 0.48 - (laneIndex * 8));
      elevated.parent = this.environmentRoot;
      for (let i = 0; i < 9; i += 1) {
        const support = B.MeshBuilder.CreateCylinder(`city-elev-support-${laneIndex}-${i}`, { diameter: 0.7, height: 8.8 + laneIndex }, this.scene);
        support.material = this.materialKit?.backdrop || backMat;
        support.position = v3(B, offsetX + (i % 2 === 0 ? -3.7 : 3.7), 4.4 + (laneIndex * 0.4), Number(bounds.maxZ || 12) - (i * 14.6));
        support.parent = this.environmentRoot;
      }
      this.cityTrafficLane.lanes.push({
        x: offsetX,
        y: 9.55 + (laneIndex * 0.8),
        z0: Number(bounds.maxZ || 12) + (laneIndex * 10),
        z1: Number(bounds.minZ || -120) - (laneIndex * 14),
        cars: []
      });
    }

    const trafficLanes = Math.max(1, Number(cfg.trafficLanes || 2));
    for (let laneIndex = 0; laneIndex < Math.min(trafficLanes, this.cityTrafficLane.lanes.length); laneIndex += 1) {
      const lane = this.cityTrafficLane.lanes[laneIndex];
      for (let i = 0; i < 5; i += 1) {
        const car = B.MeshBuilder.CreateBox(`city-traffic-car-${laneIndex}-${i}`, { width: 1.7, height: 1, depth: 3.5 }, this.scene);
        car.material = i % 2 ? (this.materialKit?.carWarm || accentMat) : (this.materialKit?.carCool || backMat);
        car.parent = this.environmentRoot;
        lane.cars.push({ mesh: car, offset: (i * 0.19) + (laneIndex * 0.11) });
      }
    }

    const billboardCount = Math.max(2, Number(cfg.billboardCount || 4));
    for (let i = 0; i < billboardCount; i += 1) {
      const pole = B.MeshBuilder.CreateCylinder(`city-billboard-pole-${i}`, { diameter: 0.28, height: 7.2 }, this.scene);
      pole.material = this.materialKit?.backdrop || backMat;
      pole.position = v3(B, i % 2 === 0 ? -11.8 : 11.8, 3.6, Number(bounds.maxZ || 12) - 22 - (i * 26));
      pole.parent = this.environmentRoot;
      const board = B.MeshBuilder.CreateBox(`city-billboard-${i}`, { width: 5.8, height: 2.4, depth: 0.22 }, this.scene);
      board.material = this.materialKit?.accent || accentMat;
      board.position = v3(B, pole.position.x, 6.7, pole.position.z);
      board.parent = this.environmentRoot;
    }

    if (density >= 0.7) {
      for (let i = 0; i < 4; i += 1) {
        const signRoot = new B.TransformNode(`city-sign-${i}`, this.scene);
        signRoot.parent = this.environmentRoot;
        signRoot.position = v3(B, 0, 0, Number(bounds.maxZ || 12) - 20 - (i * 34));
        const beam = B.MeshBuilder.CreateBox(`city-sign-beam-${i}`, { width: 10.4, height: 0.18, depth: 0.18 }, this.scene);
        beam.material = this.materialKit?.rail || backMat;
        beam.parent = signRoot;
        beam.position.y = 4.8;
        for (const side of [-1, 1]) {
          const post = B.MeshBuilder.CreateCylinder(`city-sign-post-${i}-${side}`, { diameter: 0.18, height: 4.9 }, this.scene);
          post.material = this.materialKit?.rail || backMat;
          post.parent = signRoot;
          post.position = v3(B, side * 5.0, 2.45, 0);
          const panel = B.MeshBuilder.CreateBox(`city-sign-panel-${i}-${side}`, { width: 2.6, height: 0.9, depth: 0.14 }, this.scene);
          panel.material = this.materialKit?.accent || accentMat;
          panel.parent = signRoot;
          panel.position = v3(B, side * 2.4, 4.2, 0);
        }
      }
    }
  }

  _buildVolcanoEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const cfg = this.theme.environment || {};
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    const lava = B.MeshBuilder.CreateGround("volcano-lava", {
      width: Math.max(48, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 34),
      height: Math.max(168, Math.abs(Number(bounds.minZ || -120)) + 48)
    }, this.scene);
    lava.material = this.materialKit?.lava || this._ensureMaterial("volcano-lava-mat", "#7b2718", "#111", "#ff6a32");
    lava.position.z = (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5 - 14;
    lava.position.y = -2.2;
    lava.parent = this.environmentRoot;
    lava.visibility = 0.74;

    const calderaRings = Math.max(1, Number(cfg.calderaRings || 2));
    for (let i = 0; i < calderaRings; i += 1) {
      const ring = B.MeshBuilder.CreateTorus(`volcano-caldera-${i}`, { diameter: 28 + (i * 9), thickness: 1.2, tessellation: 36 }, this.scene);
      ring.material = this.materialKit?.stone || backMat;
      ring.position = v3(B, 0, -0.3 + (i * 0.2), Number(bounds.minZ || -120) + 24 + (i * 8));
      ring.rotation.x = Math.PI * 0.5;
      ring.parent = this.environmentRoot;
    }

    const cliffBands = Math.max(2, Number(cfg.cliffBands || 3));
    for (let band = 0; band < cliffBands; band += 1) {
      for (let i = 0; i < 12; i += 1) {
        const rock = B.MeshBuilder.CreateCylinder(`volcano-rock-${band}-${i}`, {
          diameterTop: 0.8 + ((i + band) % 3),
          diameterBottom: 2.4 + ((i + band) % 4),
          height: 3.4 + (((i + band) % 5) * 1.1)
        }, this.scene);
        rock.material = band === 0 ? (this.materialKit?.stone || backMat) : (this.materialKit?.warm || accentMat);
        rock.visibility = band === 0 ? 0.92 : 0.38;
        rock.position.x = i % 2 === 0 ? -10.5 - (band * 4.2) : 10.5 + (band * 4.2);
        rock.position.z = Number(bounds.maxZ || 12) - (i * (8.8 + (band * 1.4)));
        rock.position.y = (rock.scaling.y * 0.5) - 0.2 - (band * 0.3);
        rock.parent = this.environmentRoot;
      }
    }

    const lavaFalls = Math.max(2, Number(cfg.lavaFalls || 3));
    for (let i = 0; i < lavaFalls; i += 1) {
      const fall = B.MeshBuilder.CreatePlane(`volcano-lavafall-${i}`, { width: 3.2, height: 12 + (i * 2) }, this.scene);
      fall.material = this._ensureMaterial(`volcano-lavafall-mat-${i}`, "#ff7a3f", "#111", "#ffb36a", 0.28);
      fall.position = v3(B, i % 2 === 0 ? -14.8 : 14.8, 8 + i, Number(bounds.maxZ || 12) - 28 - (i * 18));
      fall.parent = this.environmentRoot;
    }

    const vents = Math.max(4, Number(cfg.ventCount || 6));
    for (let i = 0; i < vents; i += 1) {
      const plume = B.MeshBuilder.CreateCylinder(`volcano-plume-${i}`, { diameter: 1.2, height: 7 + i }, this.scene);
      plume.material = this.materialKit?.warm || accentMat;
      plume.visibility = 0.16;
      plume.position = v3(B, i % 2 === 0 ? -5.6 : 5.6, 3.5 + (i * 0.35), Number(bounds.maxZ || 12) - 18 - (i * 14));
      plume.parent = this.environmentRoot;
    }

    if (density >= 0.7) {
      for (let i = 0; i < 5; i += 1) {
        const arch = B.MeshBuilder.CreateTorus(`volcano-arch-${i}`, {
          diameter: 7.2 + ((i % 2) * 1.6),
          thickness: 0.7,
          tessellation: 18
        }, this.scene);
        arch.material = this.materialKit?.stone || backMat;
        arch.position = v3(B, i % 2 === 0 ? -12.4 : 12.4, 3.2 + ((i % 3) * 0.7), Number(bounds.maxZ || 12) - 38 - (i * 28));
        arch.rotation.x = Math.PI * 0.5;
        arch.parent = this.environmentRoot;
      }
    }
  }

  _buildGauntletEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const cfg = this.theme.environment || {};
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    const zones = Math.max(3, Number(cfg.gauntletZones || 4));
    const zoneLen = Math.max(18, (Math.abs(Number(bounds.minZ || -120)) + Number(bounds.maxZ || 12)) / zones);
    const zoneMats = [
      this.materialKit?.backdrop || backMat,
      this.materialKit?.accent || accentMat,
      this.materialKit?.warm || this._ensureMaterial("gauntlet-zone-warm", "#ff9b67", "#111", "#ffca91"),
      this.materialKit?.carCool || this._ensureMaterial("gauntlet-zone-cool", "#78cfff", "#111", "#bfefff")
    ];
    for (let zone = 0; zone < zones; zone += 1) {
      const slab = B.MeshBuilder.CreateGround(`gauntlet-zone-${zone}`, { width: 34, height: zoneLen + 8 }, this.scene);
      slab.material = zoneMats[zone % zoneMats.length];
      slab.position = v3(B, 0, -0.04 + (zone * 0.01), Number(bounds.maxZ || 12) - (zoneLen * zone) - (zoneLen * 0.5));
      slab.parent = this.environmentRoot;
      slab.visibility = 0.2;
    }

    const monumentCount = Math.max(4, Number(cfg.monumentCount || 6));
    for (let i = 0; i < monumentCount; i += 1) {
      const pillar = B.MeshBuilder.CreateBox(`gauntlet-pillar-${i}`, {
        width: 2 + ((i % 2) * 0.8),
        height: 5 + ((i % 4) * 2),
        depth: 2 + ((i % 3) * 0.5)
      }, this.scene);
      pillar.material = i % 2 === 0 ? (this.materialKit?.accent || accentMat) : (this.materialKit?.backdrop || backMat);
      pillar.position.x = i % 2 === 0 ? -8.4 - (i % 3) : 8.4 + (i % 3);
      pillar.position.z = Number(bounds.maxZ || 12) - (i * 12.4);
      pillar.position.y = pillar.scaling.y * 0.5;
      pillar.parent = this.environmentRoot;
    }

    const arch = B.MeshBuilder.CreateTorus("gauntlet-arch", { diameter: 20, thickness: 0.56, tessellation: 44 }, this.scene);
    arch.material = this.materialKit?.goal || accentMat;
    arch.position = v3(B, 0, 8.4, Number(bounds.minZ || -120) + 18);
    arch.rotation.x = Math.PI * 0.5;
    arch.parent = this.environmentRoot;

    const mixedBands = Math.max(3, Number(cfg.mixedDecorBands || 4));
    for (let band = 0; band < mixedBands; band += 1) {
      const row = B.MeshBuilder.CreateGround(`gauntlet-band-${band}`, { width: 42 + (band * 6), height: 18 }, this.scene);
      row.material = zoneMats[(band + 1) % zoneMats.length];
      row.position = v3(B, 0, -0.12 - (band * 0.03), Number(bounds.maxZ || 12) - 18 - (band * 28));
      row.parent = this.environmentRoot;
      row.visibility = 0.1;
    }

    const bannerCount = Math.max(3, Math.round(5 * density));
    for (let i = 0; i < bannerCount; i += 1) {
      for (const side of [-1, 1]) {
        const pole = B.MeshBuilder.CreateCylinder(`gauntlet-banner-pole-${i}-${side}`, { diameter: 0.18, height: 4.8 }, this.scene);
        pole.material = this.materialKit?.rail || backMat;
        pole.position = v3(B, side * 11.6, 2.4, Number(bounds.maxZ || 12) - 16 - (i * 36));
        pole.parent = this.environmentRoot;
        const flag = B.MeshBuilder.CreatePlane(`gauntlet-banner-${i}-${side}`, { width: 1.4, height: 2.2 }, this.scene);
        flag.material = i % 2 === 0 ? (this.materialKit?.accent || accentMat) : (this.materialKit?.warm || accentMat);
        flag.position = v3(B, side * 11.0, 3.4, pole.position.z);
        flag.rotation.y = side < 0 ? 0 : Math.PI;
        flag.parent = this.environmentRoot;
      }
    }

    if (density >= 0.75) {
      for (let i = 0; i < 4; i += 1) {
        const beacon = B.MeshBuilder.CreateCylinder(`gauntlet-beacon-${i}`, { diameter: 1.1, height: 6.2 }, this.scene);
        beacon.material = i % 2 === 0 ? (this.materialKit?.accent || accentMat) : (this.materialKit?.goal || accentMat);
        beacon.position = v3(B, i % 2 === 0 ? -5.4 : 5.4, 3.1, Number(bounds.minZ || -120) + 38 + (i * 18));
        beacon.parent = this.environmentRoot;
      }
    }
  }

  _buildSnowEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    const snowbankMat = this.materialKit?.snow || this.materialKit?.ground || backMat;
    for (let i = 0; i < Math.max(14, Math.round(22 * density)); i += 1) {
      const bank = B.MeshBuilder.CreateSphere(`snow-bank-${i}`, { diameter: 3.2 + ((i % 4) * 0.9), segments: 10 }, this.scene);
      bank.material = snowbankMat;
      bank.scaling.y = 0.52 + ((i % 3) * 0.08);
      bank.position = v3(B, i % 2 === 0 ? -11.4 - (i % 3) : 11.4 + (i % 3), 0.4, Number(bounds.maxZ || 12) - 10 - (i * 10.5));
      bank.parent = this.environmentRoot;
    }
    for (let i = 0; i < Math.max(10, Math.round(18 * density)); i += 1) {
      const root = new B.TransformNode(`snow-tree-${i}`, this.scene);
      root.parent = this.environmentRoot;
      root.position = v3(B, i % 2 === 0 ? -15.8 - (i % 4) : 15.8 + (i % 4), 0, Number(bounds.maxZ || 12) - 8 - (i * 13));
      const trunk = B.MeshBuilder.CreateCylinder(`snow-tree-trunk-${i}`, { diameter: 0.38, height: 2.8 }, this.scene);
      trunk.material = this.materialKit?.warm || accentMat;
      trunk.parent = root;
      trunk.position.y = 1.4;
      for (let tier = 0; tier < 3; tier += 1) {
        const cone = B.MeshBuilder.CreateCylinder(`snow-tree-cone-${i}-${tier}`, {
          diameterTop: 0,
          diameterBottom: 2.6 - (tier * 0.4),
          height: 2.3 - (tier * 0.25),
          tessellation: 10
        }, this.scene);
        cone.material = this.materialKit?.backdrop || backMat;
        cone.parent = root;
        cone.position.y = 2.4 + tier * 1.1;
      }
    }
    for (let i = 0; i < 8; i += 1) {
      const ridge = B.MeshBuilder.CreateCylinder(`snow-ridge-${i}`, {
        diameterTop: 3.8,
        diameterBottom: 7.8,
        height: 9 + (i % 3) * 2.6,
        tessellation: 9
      }, this.scene);
      ridge.material = this.materialKit?.stone || backMat;
      ridge.scaling.x = 1.2;
      ridge.scaling.z = 1.8;
      ridge.position = v3(B, i % 2 === 0 ? -20.5 : 20.5, 2.6, Number(bounds.maxZ || 12) - 22 - (i * 20));
      ridge.parent = this.environmentRoot;
    }
    for (let i = 0; i < 10; i += 1) {
      const icicle = B.MeshBuilder.CreateCylinder(`snow-icicle-${i}`, {
        diameterTop: 0.08,
        diameterBottom: 0.7,
        height: 2.8 + (i % 3) * 0.8,
        tessellation: 8
      }, this.scene);
      icicle.material = this.materialKit?.glass || accentMat;
      icicle.position = v3(B, i % 2 === 0 ? -9.4 : 9.4, 3.6, Number(bounds.maxZ || 12) - 14 - (i * 16));
      icicle.parent = this.environmentRoot;
    }
  }

  _buildFactoryEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(6, Math.round(10 * density)); i += 1) {
      const gantry = new B.TransformNode(`factory-gantry-${i}`, this.scene);
      gantry.parent = this.environmentRoot;
      gantry.position = v3(B, 0, 0, Number(bounds.maxZ || 12) - 16 - (i * 22));
      for (const side of [-1, 1]) {
        const post = B.MeshBuilder.CreateBox(`factory-post-${i}-${side}`, { width: 0.48, height: 7.4, depth: 0.48 }, this.scene);
        post.material = this.materialKit?.rail || backMat;
        post.parent = gantry;
        post.position = v3(B, side * 9.8, 3.7, 0);
      }
      const beam = B.MeshBuilder.CreateBox(`factory-beam-${i}`, { width: 20.4, height: 0.42, depth: 0.52 }, this.scene);
      beam.material = this.materialKit?.bridgeSteel || accentMat;
      beam.parent = gantry;
      beam.position.y = 6.6;
    }
    for (let i = 0; i < Math.max(5, Math.round(8 * density)); i += 1) {
      const tank = B.MeshBuilder.CreateCylinder(`factory-tank-${i}`, { diameter: 3.8, height: 5.6, tessellation: 14 }, this.scene);
      tank.material = this.materialKit?.bridgeSteel || backMat;
      tank.position = v3(B, i % 2 === 0 ? -16.2 : 16.2, 2.8, Number(bounds.maxZ || 12) - 18 - (i * 24));
      tank.parent = this.environmentRoot;
      const cap = B.MeshBuilder.CreateSphere(`factory-tank-cap-${i}`, { diameter: 3.4, segments: 10 }, this.scene);
      cap.material = this.materialKit?.accent || accentMat;
      cap.scaling.y = 0.32;
      cap.position = v3(B, tank.position.x, 5.7, tank.position.z);
      cap.parent = this.environmentRoot;
    }
    for (let i = 0; i < 12; i += 1) {
      const pipe = B.MeshBuilder.CreateCylinder(`factory-pipe-${i}`, { diameter: 0.52, height: 10 + (i % 3) * 3.2, tessellation: 10 }, this.scene);
      pipe.material = this.materialKit?.bridgeSteel || accentMat;
      pipe.rotation.z = Math.PI * 0.5;
      pipe.position = v3(B, i % 2 === 0 ? -11.8 : 11.8, 4.2 + (i % 2), Number(bounds.maxZ || 12) - 8 - (i * 12));
      pipe.parent = this.environmentRoot;
    }
    for (let i = 0; i < 14; i += 1) {
      const crate = B.MeshBuilder.CreateBox(`factory-crate-${i}`, { width: 1.8, height: 1.8, depth: 1.8 }, this.scene);
      crate.material = i % 2 === 0 ? (this.materialKit?.warm || accentMat) : (this.materialKit?.backdrop || backMat);
      crate.position = v3(B, i % 2 === 0 ? -13.8 : 13.8, 0.9, Number(bounds.maxZ || 12) - 20 - (i * 8.5));
      crate.parent = this.environmentRoot;
    }
  }

  _buildJungleEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(14, Math.round(22 * density)); i += 1) {
      const root = new B.TransformNode(`jungle-tree-${i}`, this.scene);
      root.parent = this.environmentRoot;
      root.position = v3(B, i % 2 === 0 ? -14.5 - (i % 4) : 14.5 + (i % 4), 0, Number(bounds.maxZ || 12) - 12 - (i * 11));
      const trunk = B.MeshBuilder.CreateCylinder(`jungle-trunk-${i}`, { diameter: 0.7, height: 5.8 + (i % 3) }, this.scene);
      trunk.material = this.materialKit?.warm || accentMat;
      trunk.parent = root;
      trunk.position.y = 2.9;
      for (let layer = 0; layer < 2; layer += 1) {
        const crown = B.MeshBuilder.CreateSphere(`jungle-crown-${i}-${layer}`, { diameter: 3.6 - (layer * 0.5), segments: 10 }, this.scene);
        crown.material = this.materialKit?.backdrop || backMat;
        crown.scaling.y = 0.7;
        crown.parent = root;
        crown.position.y = 5.4 + layer * 1.2;
      }
    }
    for (let i = 0; i < 8; i += 1) {
      const pillar = B.MeshBuilder.CreateBox(`jungle-pillar-${i}`, { width: 1.8, height: 6 + (i % 3) * 1.8, depth: 1.8 }, this.scene);
      pillar.material = this.materialKit?.stone || backMat;
      pillar.position = v3(B, i % 2 === 0 ? -9.8 : 9.8, pillar.scaling.y * 0.5, Number(bounds.maxZ || 12) - 24 - (i * 18));
      pillar.parent = this.environmentRoot;
    }
    for (let i = 0; i < 10; i += 1) {
      const vine = B.MeshBuilder.CreateTube(`jungle-vine-${i}`, {
        path: [
          v3(B, i % 2 === 0 ? -10.4 : 10.4, 8, Number(bounds.maxZ || 12) - 10 - (i * 14)),
          v3(B, i % 2 === 0 ? -7.8 : 7.8, 4.4, Number(bounds.maxZ || 12) - 14 - (i * 14)),
          v3(B, i % 2 === 0 ? -9.1 : 9.1, 1.6, Number(bounds.maxZ || 12) - 18 - (i * 14))
        ],
        radius: 0.14,
        tessellation: 8
      }, this.scene);
      vine.material = this.materialKit?.backdrop || accentMat;
      vine.parent = this.environmentRoot;
    }
    for (let i = 0; i < 8; i += 1) {
      const mud = B.MeshBuilder.CreateGround(`jungle-mud-${i}`, { width: 4.2, height: 7.6 }, this.scene);
      mud.material = this.materialKit?.warm || accentMat;
      mud.visibility = 0.22;
      mud.position = v3(B, i % 2 === 0 ? -7.4 : 7.4, -0.02, Number(bounds.maxZ || 12) - 30 - (i * 16));
      mud.parent = this.environmentRoot;
    }
  }

  _buildLabEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(8, Math.round(12 * density)); i += 1) {
      const pad = B.MeshBuilder.CreateBox(`lab-panel-${i}`, { width: 4.8, height: 5.4 + (i % 3), depth: 0.34 }, this.scene);
      pad.material = this.materialKit?.glass || accentMat;
      pad.position = v3(B, i % 2 === 0 ? -11.8 : 11.8, pad.scaling.y * 0.5, Number(bounds.maxZ || 12) - 12 - (i * 14));
      pad.parent = this.environmentRoot;
    }
    for (let i = 0; i < 6; i += 1) {
      const arch = B.MeshBuilder.CreateTorus(`lab-portal-${i}`, { diameter: 5.8, thickness: 0.34, tessellation: 28 }, this.scene);
      arch.material = this.materialKit?.accent || accentMat;
      arch.position = v3(B, i % 2 === 0 ? -8.6 : 8.6, 3.8, Number(bounds.maxZ || 12) - 24 - (i * 22));
      arch.rotation.x = Math.PI * 0.5;
      arch.parent = this.environmentRoot;
    }
    for (let i = 0; i < 10; i += 1) {
      const laserPost = B.MeshBuilder.CreateCylinder(`lab-laser-post-${i}`, { diameter: 0.24, height: 4.2, tessellation: 8 }, this.scene);
      laserPost.material = this.materialKit?.rail || backMat;
      laserPost.position = v3(B, i % 2 === 0 ? -7.4 : 7.4, 2.1, Number(bounds.maxZ || 12) - 12 - (i * 12));
      laserPost.parent = this.environmentRoot;
      const laser = B.MeshBuilder.CreateBox(`lab-laser-bar-${i}`, { width: 12.8, height: 0.08, depth: 0.08 }, this.scene);
      laser.material = this.materialKit?.warm || accentMat;
      laser.position = v3(B, 0, 3.4, laserPost.position.z);
      laser.parent = this.environmentRoot;
    }
    for (let i = 0; i < 8; i += 1) {
      const glow = B.MeshBuilder.CreateCylinder(`lab-glow-${i}`, { diameter: 1.2, height: 7.8 + (i % 2), tessellation: 10 }, this.scene);
      glow.material = this._ensureMaterial(`lab-glow-mat-${i}`, "#dff7ff", "#111", "#8fe3ff", 0.12);
      glow.position = v3(B, i % 2 === 0 ? -13.8 : 13.8, 3.8, Number(bounds.maxZ || 12) - 22 - (i * 16));
      glow.parent = this.environmentRoot;
    }
  }

  _buildSkyEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(12, Math.round(18 * density)); i += 1) {
      const cloud = B.MeshBuilder.CreateSphere(`sky-cloud-${i}`, { diameter: 3.8 + ((i % 4) * 1.1), segments: 8 }, this.scene);
      cloud.material = this._ensureMaterial(`sky-cloud-mat-${i}`, "#f6fbff", "#111", "#ffffff", 0.72);
      cloud.scaling.y = 0.42;
      cloud.position = v3(B, i % 2 === 0 ? -16.4 - (i % 3) : 16.4 + (i % 3), 5.4 + (i % 4), Number(bounds.maxZ || 12) - 10 - (i * 14));
      cloud.parent = this.environmentRoot;
    }
    for (let i = 0; i < 8; i += 1) {
      const island = B.MeshBuilder.CreateCylinder(`sky-island-${i}`, {
        diameterTop: 6.2,
        diameterBottom: 8.8,
        height: 3.6 + (i % 2),
        tessellation: 12
      }, this.scene);
      island.material = this.materialKit?.stone || backMat;
      island.position = v3(B, i % 2 === 0 ? -19.2 : 19.2, -0.6, Number(bounds.maxZ || 12) - 26 - (i * 22));
      island.parent = this.environmentRoot;
    }
    for (let i = 0; i < 10; i += 1) {
      const ribbon = B.MeshBuilder.CreatePlane(`sky-ribbon-${i}`, { width: 8.2, height: 1.1 }, this.scene);
      ribbon.material = this._ensureMaterial(`sky-ribbon-mat-${i}`, "#e8faff", "#111", "#9fe5ff", 0.18);
      ribbon.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
      ribbon.position = v3(B, i % 2 === 0 ? -6.2 : 6.2, 6 + (i % 3), Number(bounds.maxZ || 12) - 8 - (i * 18));
      ribbon.parent = this.environmentRoot;
    }
  }

  _buildAquaEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    const water = B.MeshBuilder.CreateGround("aqua-basin", {
      width: Math.max(80, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 48),
      height: Math.max(200, Math.abs(Number(bounds.minZ || -120)) + 72)
    }, this.scene);
    water.material = this.materialKit?.water || accentMat;
    water.position = v3(B, 0, -2.8, (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5 - 24);
    water.parent = this.environmentRoot;
    water.visibility = 0.68;
    for (let i = 0; i < Math.max(10, Math.round(16 * density)); i += 1) {
      const buoy = B.MeshBuilder.CreateTorus(`aqua-buoy-${i}`, { diameter: 1.8, thickness: 0.22, tessellation: 18 }, this.scene);
      buoy.material = i % 2 === 0 ? (this.materialKit?.warm || accentMat) : (this.materialKit?.accent || accentMat);
      buoy.position = v3(B, i % 2 === 0 ? -10.4 : 10.4, -0.6, Number(bounds.maxZ || 12) - 16 - (i * 12));
      buoy.rotation.x = Math.PI * 0.5;
      buoy.parent = this.environmentRoot;
    }
    for (let i = 0; i < 8; i += 1) {
      const floatPad = B.MeshBuilder.CreateCylinder(`aqua-float-${i}`, { diameter: 4.4, height: 0.4, tessellation: 20 }, this.scene);
      floatPad.material = this.materialKit?.sidewalk || backMat;
      floatPad.position = v3(B, i % 2 === 0 ? -16.8 : 16.8, 0.15 + ((i % 3) * 0.12), Number(bounds.maxZ || 12) - 24 - (i * 18));
      floatPad.parent = this.environmentRoot;
    }
    for (let i = 0; i < 8; i += 1) {
      const arch = B.MeshBuilder.CreateTorus(`aqua-arch-${i}`, { diameter: 7.4, thickness: 0.28, tessellation: 24 }, this.scene);
      arch.material = this.materialKit?.accent || accentMat;
      arch.position = v3(B, 0, 4.2, Number(bounds.maxZ || 12) - 18 - (i * 22));
      arch.rotation.x = Math.PI * 0.5;
      arch.parent = this.environmentRoot;
      arch.visibility = 0.48;
    }
  }

  _buildIceEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(8, Math.round(14 * density)); i += 1) {
      const cliff = B.MeshBuilder.CreateCylinder(`ice-cliff-${i}`, {
        diameterTop: 4.4,
        diameterBottom: 7.2,
        height: 8 + (i % 4) * 1.8,
        tessellation: 10
      }, this.scene);
      cliff.material = this.materialKit?.stone || backMat;
      cliff.position = v3(B, i % 2 === 0 ? -18.2 : 18.2, 2.2, Number(bounds.maxZ || 12) - 18 - (i * 18));
      cliff.parent = this.environmentRoot;
    }
    for (let i = 0; i < Math.max(10, Math.round(16 * density)); i += 1) {
      const crystal = B.MeshBuilder.CreateCylinder(`ice-crystal-${i}`, {
        diameterTop: 0.08,
        diameterBottom: 1.2 + ((i % 2) * 0.4),
        height: 3.4 + (i % 3) * 1.4,
        tessellation: 8
      }, this.scene);
      crystal.material = this.materialKit?.glass || accentMat;
      crystal.position = v3(B, i % 2 === 0 ? -9.4 : 9.4, 1.6, Number(bounds.maxZ || 12) - 10 - (i * 12));
      crystal.parent = this.environmentRoot;
    }
    for (let i = 0; i < 10; i += 1) {
      const crack = B.MeshBuilder.CreateGround(`ice-crack-${i}`, { width: 5.4, height: 0.5 }, this.scene);
      crack.material = this._ensureMaterial(`ice-crack-mat-${i}`, "#dff7ff", "#111", "#89cfff", 0.34);
      crack.position = v3(B, i % 2 === 0 ? -5.4 : 5.4, 0.01, Number(bounds.maxZ || 12) - 16 - (i * 14));
      crack.rotation.y = i * 0.38;
      crack.parent = this.environmentRoot;
    }
  }

  _buildDesertEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(10, Math.round(18 * density)); i += 1) {
      const dune = B.MeshBuilder.CreateSphere(`desert-dune-${i}`, { diameter: 8 + ((i % 4) * 1.4), segments: 10 }, this.scene);
      dune.material = this.materialKit?.ground || backMat;
      dune.scaling.y = 0.28;
      dune.position = v3(B, i % 2 === 0 ? -16.8 - (i % 2) : 16.8 + (i % 2), -0.2, Number(bounds.maxZ || 12) - 14 - (i * 15));
      dune.parent = this.environmentRoot;
    }
    for (let i = 0; i < 8; i += 1) {
      const obelisk = B.MeshBuilder.CreateBox(`desert-obelisk-${i}`, { width: 1.4, height: 7 + (i % 3) * 2.2, depth: 1.4 }, this.scene);
      obelisk.material = this.materialKit?.stone || backMat;
      obelisk.position = v3(B, i % 2 === 0 ? -11.8 : 11.8, obelisk.scaling.y * 0.5, Number(bounds.maxZ || 12) - 20 - (i * 18));
      obelisk.parent = this.environmentRoot;
    }
    for (let i = 0; i < 10; i += 1) {
      const ribbon = B.MeshBuilder.CreatePlane(`desert-sandstorm-${i}`, { width: 7.2, height: 1.2 }, this.scene);
      ribbon.material = this._ensureMaterial(`desert-ribbon-mat-${i}`, "#fff0b6", "#111", "#ffd087", 0.12);
      ribbon.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
      ribbon.position = v3(B, i % 2 === 0 ? -4.6 : 4.6, 4.8 + (i % 2), Number(bounds.maxZ || 12) - 18 - (i * 16));
      ribbon.parent = this.environmentRoot;
    }
  }

  _buildRailEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (const side of [-1.8, 1.8]) {
      const rail = B.MeshBuilder.CreateGround(`rail-track-${side}`, { width: 0.18, height: Math.max(176, Math.abs(Number(bounds.minZ || -120)) + 48) }, this.scene);
      rail.material = this.materialKit?.rail || backMat;
      rail.position = v3(B, side, 0.04, (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5 - 20);
      rail.parent = this.environmentRoot;
    }
    for (let i = 0; i < 28; i += 1) {
      const sleeper = B.MeshBuilder.CreateBox(`rail-sleeper-${i}`, { width: 5.2, height: 0.14, depth: 0.48 }, this.scene);
      sleeper.material = this.materialKit?.warm || accentMat;
      sleeper.position = v3(B, 0, 0.06, Number(bounds.maxZ || 12) - 8 - (i * 6.2));
      sleeper.parent = this.environmentRoot;
    }
    for (let i = 0; i < Math.max(4, Math.round(7 * density)); i += 1) {
      const signal = new B.TransformNode(`rail-signal-${i}`, this.scene);
      signal.parent = this.environmentRoot;
      signal.position = v3(B, i % 2 === 0 ? -9.8 : 9.8, 0, Number(bounds.maxZ || 12) - 18 - (i * 24));
      const pole = B.MeshBuilder.CreateCylinder(`rail-signal-pole-${i}`, { diameter: 0.22, height: 5.2 }, this.scene);
      pole.material = this.materialKit?.rail || backMat;
      pole.parent = signal;
      pole.position.y = 2.6;
      const head = B.MeshBuilder.CreateBox(`rail-signal-head-${i}`, { width: 0.8, height: 1.4, depth: 0.5 }, this.scene);
      head.material = this.materialKit?.backdrop || backMat;
      head.parent = signal;
      head.position = v3(B, 0, 4.5, 0);
      const lamp = B.MeshBuilder.CreateSphere(`rail-signal-lamp-${i}`, { diameter: 0.26, segments: 8 }, this.scene);
      lamp.material = this.materialKit?.accent || accentMat;
      lamp.parent = signal;
      lamp.position = v3(B, 0, 4.55, 0.28);
    }
    for (let i = 0; i < Math.max(3, Math.round(5 * density)); i += 1) {
      const cart = B.MeshBuilder.CreateBox(`rail-cart-${i}`, { width: 3.8, height: 1.6, depth: 7.4 }, this.scene);
      cart.material = i % 2 === 0 ? (this.materialKit?.carCool || accentMat) : (this.materialKit?.carWarm || accentMat);
      cart.position = v3(B, i % 2 === 0 ? -13.4 : 13.4, 0.8, Number(bounds.maxZ || 12) - 28 - (i * 28));
      cart.parent = this.environmentRoot;
    }
  }

  _buildCanyonEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(12, Math.round(18 * density)); i += 1) {
      const wall = B.MeshBuilder.CreateCylinder(`canyon-wall-${i}`, {
        diameterTop: 5.2,
        diameterBottom: 9.4,
        height: 10 + (i % 4) * 2.4,
        tessellation: 9
      }, this.scene);
      wall.material = this.materialKit?.stone || backMat;
      wall.scaling.z = 1.6;
      wall.position = v3(B, i % 2 === 0 ? -18.8 - (i % 3) : 18.8 + (i % 3), wall.scaling.y * 0.5, Number(bounds.maxZ || 12) - 14 - (i * 14));
      wall.parent = this.environmentRoot;
    }
    for (let i = 0; i < 8; i += 1) {
      const arch = B.MeshBuilder.CreateTorus(`canyon-arch-${i}`, { diameter: 8 + ((i % 2) * 2), thickness: 0.6, tessellation: 16 }, this.scene);
      arch.material = this.materialKit?.warm || accentMat;
      arch.position = v3(B, i % 2 === 0 ? -11.4 : 11.4, 4.4, Number(bounds.maxZ || 12) - 20 - (i * 24));
      arch.rotation.x = Math.PI * 0.5;
      arch.parent = this.environmentRoot;
    }
    for (let i = 0; i < 10; i += 1) {
      const post = B.MeshBuilder.CreateCylinder(`canyon-post-${i}`, { diameter: 0.22, height: 2.2 }, this.scene);
      post.material = this.materialKit?.rail || backMat;
      post.position = v3(B, i % 2 === 0 ? -7.8 : 7.8, 1.1, Number(bounds.maxZ || 12) - 8 - (i * 14));
      post.parent = this.environmentRoot;
    }
  }

  _buildRuinsEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(8, Math.round(12 * density)); i += 1) {
      const wall = B.MeshBuilder.CreateBox(`ruins-wall-${i}`, { width: 5.2, height: 4.8 + (i % 3), depth: 1.2 }, this.scene);
      wall.material = this.materialKit?.stone || backMat;
      wall.position = v3(B, i % 2 === 0 ? -12.8 : 12.8, wall.scaling.y * 0.5, Number(bounds.maxZ || 12) - 16 - (i * 18));
      wall.parent = this.environmentRoot;
    }
    for (let i = 0; i < 12; i += 1) {
      const column = B.MeshBuilder.CreateCylinder(`ruins-column-${i}`, { diameter: 1.1, height: 5.8 + (i % 2) * 2.4, tessellation: 12 }, this.scene);
      column.material = this.materialKit?.stone || backMat;
      column.position = v3(B, i % 2 === 0 ? -9.2 : 9.2, column.scaling.y * 0.5, Number(bounds.maxZ || 12) - 10 - (i * 12));
      column.parent = this.environmentRoot;
    }
    for (let i = 0; i < 10; i += 1) {
      const slab = B.MeshBuilder.CreateBox(`ruins-slab-${i}`, { width: 3.8, height: 0.34, depth: 5.2 }, this.scene);
      slab.material = this.materialKit?.backdrop || accentMat;
      slab.position = v3(B, i % 2 === 0 ? -13.4 : 13.4, 0.18, Number(bounds.maxZ || 12) - 24 - (i * 10));
      slab.rotation.y = i * 0.24;
      slab.parent = this.environmentRoot;
    }
  }

  _buildNeonEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const density = Math.max(0.45, Number(this.profile?.environmentDensity || 1));
    for (let i = 0; i < Math.max(10, Math.round(16 * density)); i += 1) {
      const pylon = B.MeshBuilder.CreateCylinder(`neon-pylon-${i}`, { diameter: 0.9, height: 7.2 + (i % 3), tessellation: 10 }, this.scene);
      pylon.material = this.materialKit?.accent || accentMat;
      pylon.position = v3(B, i % 2 === 0 ? -13.4 : 13.4, pylon.scaling.y * 0.5, Number(bounds.maxZ || 12) - 12 - (i * 14));
      pylon.parent = this.environmentRoot;
    }
    for (let i = 0; i < 12; i += 1) {
      const grid = B.MeshBuilder.CreateGround(`neon-grid-${i}`, { width: 7.2, height: 7.2 }, this.scene);
      grid.material = this.materialKit?.goal || accentMat;
      grid.position = v3(B, i % 2 === 0 ? -15.8 : 15.8, -0.1, Number(bounds.maxZ || 12) - 16 - (i * 12));
      grid.parent = this.environmentRoot;
      grid.visibility = 0.12;
    }
    for (let i = 0; i < 8; i += 1) {
      const ring = B.MeshBuilder.CreateTorus(`neon-ring-${i}`, { diameter: 7.6 + ((i % 2) * 1.6), thickness: 0.24, tessellation: 28 }, this.scene);
      ring.material = this.materialKit?.goal || accentMat;
      ring.position = v3(B, 0, 4.2 + ((i % 3) * 0.4), Number(bounds.maxZ || 12) - 16 - (i * 20));
      ring.rotation.x = Math.PI * 0.5;
      ring.parent = this.environmentRoot;
    }
    for (let i = 0; i < Math.max(6, Math.round(10 * density)); i += 1) {
      const panel = B.MeshBuilder.CreatePlane(`neon-panel-${i}`, { width: 3.4, height: 2.1 }, this.scene);
      panel.material = this._ensureMaterial(`neon-panel-mat-${i}`, "#8dd6ff", "#111", "#ff76f7", 0.24);
      panel.position = v3(B, i % 2 === 0 ? -9.8 : 9.8, 3.4, Number(bounds.maxZ || 12) - 18 - (i * 16));
      panel.parent = this.environmentRoot;
    }
  }

  _buildHazards(hazards) {
    const B = this.B;
    const hazardMat = this.materialKit?.warm || this._ensureMaterial(`hazard-${this.theme.id}`, this.theme.hazardColor, "#111", this.theme.accentGlow);
    for (const hazard of (Array.isArray(hazards) ? hazards : [])) {
      const type = String(hazard?.type || "");
      let mesh = null;
      if (type === "movingBar" || type === "laser") {
        mesh = B.MeshBuilder.CreateBox(`haz-${hazard.id}`, { width: Math.max(1.2, Number(hazard.halfW || 3) * 2), height: 0.3, depth: Math.max(0.4, Number(hazard.halfD || 0.4) * 2) }, this.scene);
      } else if (type === "rotator" || type === "pendulum") {
        mesh = B.MeshBuilder.CreateCylinder(`haz-${hazard.id}`, { diameter: Math.max(2, Number(hazard.halfW || 2) * 2), height: 0.28, tessellation: 24 }, this.scene);
      } else if (type === "fallingRocks" || type === "boulder" || type === "train") {
        mesh = B.MeshBuilder.CreateSphere(`haz-${hazard.id}`, { diameter: Math.max(1.2, Number(hazard.radius || hazard.halfW || 1.2) * 1.9), segments: 16 }, this.scene);
      } else {
        mesh = B.MeshBuilder.CreateBox(`haz-${hazard.id}`, { width: Math.max(1.2, Number(hazard.halfW || 1.2) * 2), height: 0.4, depth: Math.max(1.2, Number(hazard.halfD || 1.2) * 2) }, this.scene);
      }
      mesh.material = hazardMat;
      mesh.parent = this.hazardRoot;
      mesh.position = v3(B, hazard.x, hazard.y, hazard.z);
      this.hazardMeshes.set(String(hazard.id || ""), { mesh, data: hazard });
    }
  }

  _syncGates(snapshot) {
    for (const [gateId, gateMesh] of this.gateMeshes.entries()) {
      const nextOpen = !!snapshot?.gateOpenStates?.[gateId];
      gateMesh.open = nextOpen;
    }
  }

  _syncHazards(snapshot) {
    const hazards = snapshot?.world?.hazards || [];
    for (const hazard of hazards) {
      const entry = this.hazardMeshes.get(String(hazard.id || ""));
      if (entry) entry.data = hazard;
    }
  }

  _ensurePlayerMesh(key, isLocal = false) {
    const B = this.B;
    if (this.playerMeshes.has(key)) return this.playerMeshes.get(key);
    const playerIndex = this.playerMeshes.size;
    const color = BEAN_PALETTE[playerIndex % BEAN_PALETTE.length];
    const bean = createBeanCharacter(B, this.scene, color);
    bean.root.name = `player-${key}`;
    bean.root.parent = this.playerRoot;
    const state = {
      key,
      root: bean.root,
      bean,
      targetPos: v3(B, 0, 0.9, 0),
      targetRot: 0,
      isLocal,
      knockbackTilt: 0
    };
    this.playerMeshes.set(key, state);
    return state;
  }

  _syncPlayers(playersObj) {
    const players = playersObj && typeof playersObj === "object" ? playersObj : {};
    const keep = new Set();
    for (const [key, row] of Object.entries(players)) {
      keep.add(String(key));
      const meshState = this._ensurePlayerMesh(String(key), String(key) === this.localPlayerKey);
      const state = row?.state || {};
      meshState.targetPos = v3(this.B, state.x, Math.max(0.9, Number(state.y || 0.9)), state.z);
      meshState.targetRot = Number(state.rotY || 0);
    }
    for (const [key, meshState] of this.playerMeshes.entries()) {
      if (keep.has(key)) continue;
      try { meshState.root.dispose(false, true); } catch (_) {}
      this.playerMeshes.delete(key);
    }
  }

  _resolveCameraTarget() {
    const local = this.playerMeshes.get(this.localPlayerKey);
    if (local) return local.root.position.clone();
    return this.cameraTarget.position.clone();
  }

  _resolveCameraDesired(target) {
    const yaw = Number(this.look.yaw || 0);
    const pitch = clamp(this.look.pitch, 0.1, 1.18, 0.34);
    if (this.viewMode === "first") {
      return v3(this.B, target.x, target.y + 1.4, target.z);
    }
    const dist = clamp(this.look.distance, 2.2, 9.2, 6.6);
    const horiz = Math.cos(pitch) * dist;
    return v3(
      this.B,
      target.x + (Math.sin(yaw) * horiz),
      target.y + 1.5 + (Math.sin(pitch) * dist),
      target.z + (Math.cos(yaw) * horiz)
    );
  }

  _resolveCameraCollision(target, desired) {
    const B = this.B;
    if (!this.blockerMeshes.length || this.viewMode === "first") return desired;
    const dir = desired.subtract(target);
    const length = Math.max(0.01, dir.length());
    const ray = new B.Ray(target, dir.normalize(), length);
    const hit = this.scene.pickWithRay(ray, (mesh) => this.blockerMeshes.includes(mesh), false);
    if (!hit?.hit || !hit.pickedPoint) return desired;
    const safe = hit.pickedPoint.subtract(dir.normalize().scale(0.42));
    return safe;
  }

  _tick() {
    const now = performance.now();
    const dt = clamp((now - Number(this.lastTickMs || now)) / 1000, 0.001, 0.05, 0.016);
    this.lastTickMs = now;

    const tickTime = now * 0.006;
    for (const meshState of this.playerMeshes.values()) {
      const prevX = meshState.root.position.x;
      const prevZ = meshState.root.position.z;
      meshState.root.position.x = lerp(meshState.root.position.x, meshState.targetPos.x, meshState.isLocal ? 0.42 : 0.18);
      meshState.root.position.y = lerp(meshState.root.position.y, meshState.targetPos.y, meshState.isLocal ? 0.42 : 0.18);
      meshState.root.position.z = lerp(meshState.root.position.z, meshState.targetPos.z, meshState.isLocal ? 0.42 : 0.18);
      meshState.root.rotation.y = lerp(meshState.root.rotation.y, meshState.targetRot, meshState.isLocal ? 0.28 : 0.16);
      const dx = meshState.root.position.x - prevX;
      const dz = meshState.root.position.z - prevZ;
      const speed = Math.hypot(dx, dz);
      const moving = speed > 0.002;
      const bean = meshState.bean;
      if (bean) {
        const bob = moving ? Math.abs(Math.sin(tickTime)) * 0.18 : 0;
        bean.body.position.y = 0.62 + bob * 0.5;
        bean.head.position.y = 1.38 + bob;
        const legSwing = moving ? Math.sin(tickTime) * 0.5 : 0;
        bean.legL.rotation.x = legSwing;
        bean.legR.rotation.x = -legSwing;
        bean.footL.position.z = 0.1 + (moving ? Math.sin(tickTime) * 0.12 : 0);
        bean.footR.position.z = 0.1 + (moving ? -Math.sin(tickTime) * 0.12 : 0);
        bean.armL.rotation.x = -legSwing * 0.6;
        bean.armR.rotation.x = legSwing * 0.6;
        if (Math.abs(meshState.knockbackTilt) > 0.01) {
          meshState.root.rotation.z = meshState.knockbackTilt;
          meshState.knockbackTilt *= (1 - 0.08);
        } else {
          meshState.knockbackTilt = 0;
          meshState.root.rotation.z = 0;
        }
      }
    }

    for (const gate of this.gateMeshes.values()) {
      gate.anim = lerp(gate.anim, gate.open ? 1 : 0, 0.14);
      gate.door.position.y = 1.2 + (gate.anim * 2.4);
      gate.door.visibility = Math.max(0.06, 1 - gate.anim);
    }

    for (const hazard of this.hazardMeshes.values()) {
      const t = now * 0.001;
      const data = hazard.data || {};
      const mesh = hazard.mesh;
      if (data.type === "movingBar") {
        mesh.position.x = Number(data.x || 0) + (Math.sin(t * Number(data.speed || 1)) * Number(data.amp || 2));
      } else if (data.type === "rotator" || data.type === "pendulum") {
        mesh.rotation.y += dt * Number(data.speed || 1.2);
      } else if (data.type === "boulder" || data.type === "train") {
        mesh.position.x = Number(data.x || 0) + (Math.sin(t * Number(data.speed || 1)) * Number(data.amp || 3));
      } else if (data.type === "fallingRocks") {
        mesh.position.y = Number(data.y || 0.9) + Math.abs(Math.sin(t * Number(data.period || 1.5))) * 3.2;
      } else if (data.type === "laser" || data.type === "rhythm") {
        mesh.visibility = Math.max(0.12, 0.35 + (Math.sin(t * (Number(data.period || 1.8) * 2)) * 0.45));
      } else if (data.type === "float") {
        mesh.position.y = Number(data.y || 0.9) + (Math.sin(t * Number(data.speed || 0.8)) * Number(data.amp || 0.8));
      } else if (data.type === "vent") {
        mesh.scaling.y = 1 + Math.abs(Math.sin(t * Number(data.period || 1.6))) * 0.8;
      }
    }

    if (Array.isArray(this.cityTrafficLane?.lanes) && this.cityTrafficLane.lanes.length) {
      for (const lane of this.cityTrafficLane.lanes) {
        const range = Math.abs(Number(lane.z1 || -100) - Number(lane.z0 || 10));
        for (const car of lane.cars) {
          const phase = ((now * 0.00008) + Number(car.offset || 0)) % 1;
          car.mesh.position.x = Number(lane.x || 0) + (Math.sin((phase * Math.PI * 2) + Number(car.offset || 0)) * 1.8);
          car.mesh.position.y = Number(lane.y || 9.3);
          car.mesh.position.z = Number(lane.z0 || 10) - (phase * range);
        }
      }
    }

    if (this.goalRing) this.goalRing.rotation.z += dt * 0.78;

    const camTarget = this._resolveCameraTarget();
    this.cameraTarget.position.x = lerp(this.cameraTarget.position.x, camTarget.x, 0.22);
    this.cameraTarget.position.y = lerp(this.cameraTarget.position.y, camTarget.y, 0.22);
    this.cameraTarget.position.z = lerp(this.cameraTarget.position.z, camTarget.z, 0.22);

    const desired = this._resolveCameraDesired(this.cameraTarget.position);
    const resolved = this._resolveCameraCollision(this.cameraTarget.position.add(v3(this.B, 0, 1.2, 0)), desired);
    if (this.viewMode === "first") {
      this.camera.position.copyFrom(resolved);
      this.camera.setTarget(this.cameraTarget.position.add(v3(this.B, Math.sin(this.look.yaw) * 4, 1.35 + Math.sin(this.look.pitch) * 2, Math.cos(this.look.yaw) * 4)));
    } else {
      this.camera.position.x = lerp(this.camera.position.x, resolved.x, 0.18);
      this.camera.position.y = lerp(this.camera.position.y, resolved.y, 0.18);
      this.camera.position.z = lerp(this.camera.position.z, resolved.z, 0.18);
      this.camera.setTarget(this.cameraTarget.position.add(v3(this.B, 0, 1.2, 0)));
    }

    this.scene.render();
  }
}
