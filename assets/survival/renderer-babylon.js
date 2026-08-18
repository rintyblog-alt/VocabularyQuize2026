import { buildThemeEnvironmentSeed, getGraphicsProfile, getSurvivalTheme } from "./maps.js";

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

  _buildCourse(track) {
    const B = this.B;
    const sections = Array.isArray(track?.sections) ? track.sections : [];
    const checkpoints = Array.isArray(track?.checkpoints) ? track.checkpoints : [];
    const gates = Array.isArray(track?.gates) ? track.gates : [];
    const goal = track?.goal && typeof track.goal === "object" ? track.goal : null;

    const laneMat = this._ensureMaterial(`lane-${this.theme.id}`, this.theme.laneColor, "#202630");
    const edgeMat = this._ensureMaterial(`edge-${this.theme.id}`, this.theme.edgeColor, "#111");
    const railMat = this._ensureMaterial(`rail-${this.theme.id}`, this.theme.railColor || this.theme.edgeColor, "#111");
    const gateMat = this._ensureMaterial(`gate-${this.theme.id}`, this.theme.accentColor, "#111", this.theme.accentGlow);
    const gateDoorMat = this._ensureMaterial(`gate-door-${this.theme.id}`, this.theme.hazardColor, "#111", this.theme.accentGlow);
    const checkpointMat = this._ensureMaterial(`checkpoint-${this.theme.id}`, this.theme.accentColor, "#111", this.theme.accentGlow);
    const goalMat = this._ensureMaterial(`goal-${this.theme.id}`, this.theme.accentColor, "#111", "#ffffff");
    const styleAccentMat = this._ensureMaterial(`style-accent-${this.theme.id}`, this.theme.accentGlow || this.theme.accentColor, "#111", this.theme.accentGlow);
    const styleWarmMat = this._ensureMaterial(`style-warm-${this.theme.id}`, this.theme.hazardColor, "#111", this.theme.accentGlow);

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
      return;
    }
    if (style === "lava-rim" || style === "vent" || style === "broken") {
      addStrip(3, warmMat, 0.22, 0.36, 1.8);
      return;
    }
    if (style === "trial" || style === "hazard") {
      addStrip(4, accentMat, 0.16, 0.36, 1.5);
      return;
    }
    if (style === "boulevard") {
      addStrip(5, accentMat, 0.06, 0.35, 1.1);
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
    const groundMat = this._ensureMaterial(`ground-${theme.id}`, theme.groundColor, "#111");
    const backMat = this._ensureMaterial(`back-${theme.id}`, theme.backdropColor || theme.groundColor, "#111");
    const accentMat = this._ensureMaterial(`accent-${theme.id}`, theme.accentColor, "#111", theme.accentGlow);
    const sidewalkMat = this._ensureMaterial(`sidewalk-${theme.id}`, theme.sidewalkColor || theme.edgeColor, "#111");

    const floor = B.MeshBuilder.CreateGround(`env-floor-${theme.id}`, {
      width: Math.max(40, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 24),
      height: Math.max(120, (Number(bounds.maxZ || 12) - Number(bounds.minZ || -120)) + 36)
    }, this.scene);
    floor.material = groundMat;
    floor.position.y = -0.05;
    floor.position.z = (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5;
    floor.parent = this.environmentRoot;

    const farRows = Math.max(1, Number(env.farLayers || 1));
    for (let row = 0; row < farRows; row += 1) {
      const width = 48 + (row * 16);
      const plane = B.MeshBuilder.CreateGround(`env-far-${theme.id}-${row}`, { width, height: 24 }, this.scene);
      plane.material = backMat;
      plane.position.z = Number(bounds.minZ || -120) - 22 - (row * 16);
      plane.position.y = -0.3 - (row * 0.04);
      plane.parent = this.environmentRoot;
      plane.visibility = Math.max(0.18, 0.42 - (row * 0.08));
    }

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

  _buildBridgeEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const water = B.MeshBuilder.CreateGround("bridge-water", {
      width: Math.max(60, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 50),
      height: Math.max(180, Math.abs(Number(bounds.minZ || -120)) + 60)
    }, this.scene);
    water.material = this._ensureMaterial("bridge-water-mat", "#7fb6e3", "#111", "#9bcfff");
    water.position.z = (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5 - 18;
    water.position.y = -1.6;
    water.parent = this.environmentRoot;
    water.visibility = 0.58;
    for (let i = 0; i < 10; i += 1) {
      const pillar = B.MeshBuilder.CreateCylinder(`bridge-pillar-${i}`, { diameter: 1.6, height: 8 + (i % 3) * 2.6 }, this.scene);
      pillar.material = backMat;
      pillar.position.x = i % 2 === 0 ? -5.8 : 5.8;
      pillar.position.z = Number(bounds.maxZ || 12) - (i * 14.5);
      pillar.position.y = (pillar.scaling.y * 0.5) - 1.3;
      pillar.parent = this.environmentRoot;
    }
    const arch = B.MeshBuilder.CreateTorus("bridge-arch", { diameter: 16, thickness: 0.45, tessellation: 32 }, this.scene);
    arch.material = accentMat;
    arch.position = v3(B, 0, 6.8, Number(bounds.minZ || -120) + 12);
    arch.rotation.x = Math.PI * 0.5;
    arch.parent = this.environmentRoot;
  }

  _buildCityEnvironment(bounds, sidewalkMat, accentMat, backMat) {
    const B = this.B;
    const road = B.MeshBuilder.CreateGround("city-road", {
      width: Math.max(22, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 12),
      height: Math.max(140, Math.abs(Number(bounds.minZ || -120)) + 30)
    }, this.scene);
    road.material = this._ensureMaterial("city-road-mat", this.theme.laneColor, "#111");
    road.position.z = (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5 - 16;
    road.position.y = -0.08;
    road.parent = this.environmentRoot;

    const leftSidewalk = B.MeshBuilder.CreateGround("city-sidewalk-left", { width: 6, height: road.scaling.z || 120 }, this.scene);
    leftSidewalk.material = sidewalkMat;
    leftSidewalk.position.x = -9.8;
    leftSidewalk.position.z = road.position.z;
    leftSidewalk.position.y = 0.02;
    leftSidewalk.parent = this.environmentRoot;
    const rightSidewalk = leftSidewalk.clone("city-sidewalk-right");
    rightSidewalk.parent = this.environmentRoot;
    rightSidewalk.position.x = 9.8;

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 18; i += 1) {
        const height = 6 + ((i % 5) * 3);
        const width = 2.6 + ((i % 3) * 0.9);
        const building = B.MeshBuilder.CreateBox(`city-building-${side}-${i}`, {
          width,
          height,
          depth: 2.6 + ((i % 4) * 0.7)
        }, this.scene);
        building.material = backMat;
        building.position.x = side * (13.5 + ((i % 3) * 3.4));
        building.position.z = Number(bounds.maxZ || 12) - (i * 10.2);
        building.position.y = height * 0.5;
        building.parent = this.environmentRoot;
      }
    }
    for (let i = 0; i < 12; i += 1) {
      const rail = B.MeshBuilder.CreateBox(`city-guardrail-${i}`, { width: 0.16, height: 1.1, depth: 6.2 }, this.scene);
      rail.material = accentMat;
      rail.position.x = i % 2 === 0 ? -6.8 : 6.8;
      rail.position.z = Number(bounds.maxZ || 12) - (i * 10.8);
      rail.position.y = 0.72;
      rail.parent = this.environmentRoot;
    }
    const elevated = B.MeshBuilder.CreateGround("city-elevated", { width: 8.6, height: 104 }, this.scene);
    elevated.material = this._ensureMaterial("city-elevated-mat", "#5d6778", "#111");
    elevated.position = v3(B, 0, 8.6, Number(bounds.minZ || -120) * 0.5);
    elevated.parent = this.environmentRoot;
    for (let i = 0; i < 8; i += 1) {
      const support = B.MeshBuilder.CreateCylinder(`city-elev-support-${i}`, { diameter: 0.6, height: 8.6 }, this.scene);
      support.material = backMat;
      support.position = v3(B, i % 2 === 0 ? -3.6 : 3.6, 4.3, Number(bounds.maxZ || 12) - (i * 14.2));
      support.parent = this.environmentRoot;
    }
    this.cityTrafficLane = {
      x: 0,
      y: 9.3,
      z0: Number(bounds.maxZ || 12),
      z1: Number(bounds.minZ || -120),
      cars: []
    };
    for (let i = 0; i < 5; i += 1) {
      const car = B.MeshBuilder.CreateBox(`city-traffic-car-${i}`, { width: 1.6, height: 0.9, depth: 3.2 }, this.scene);
      car.material = this._ensureMaterial(`city-car-${i}`, i % 2 ? "#f78462" : "#7cc1ff", "#111");
      car.parent = this.environmentRoot;
      this.cityTrafficLane.cars.push({ mesh: car, offset: i * 0.22 });
    }
  }

  _buildVolcanoEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    const lava = B.MeshBuilder.CreateGround("volcano-lava", {
      width: Math.max(40, (Number(bounds.maxX || 12) - Number(bounds.minX || -12)) + 26),
      height: Math.max(150, Math.abs(Number(bounds.minZ || -120)) + 36)
    }, this.scene);
    lava.material = this._ensureMaterial("volcano-lava-mat", "#7b2718", "#111", "#ff6a32");
    lava.position.z = (Number(bounds.minZ || -120) + Number(bounds.maxZ || 12)) * 0.5 - 12;
    lava.position.y = -1.1;
    lava.parent = this.environmentRoot;
    lava.visibility = 0.7;
    for (let i = 0; i < 16; i += 1) {
      const rock = B.MeshBuilder.CreateCylinder(`volcano-rock-${i}`, { diameterTop: 0.6 + (i % 3), diameterBottom: 1.8 + (i % 4), height: 2.8 + (i % 5) }, this.scene);
      rock.material = backMat;
      rock.position.x = i % 2 === 0 ? -9.5 - ((i % 4) * 2.6) : 9.5 + ((i % 4) * 2.6);
      rock.position.z = Number(bounds.maxZ || 12) - (i * 8.4);
      rock.position.y = rock.scaling.y * 0.5 - 0.2;
      rock.parent = this.environmentRoot;
    }
    for (let i = 0; i < 6; i += 1) {
      const plume = B.MeshBuilder.CreateCylinder(`volcano-plume-${i}`, { diameter: 1.2, height: 6 + i }, this.scene);
      plume.material = accentMat;
      plume.visibility = 0.18;
      plume.position = v3(B, i % 2 === 0 ? -5.2 : 5.2, 3 + (i * 0.4), Number(bounds.maxZ || 12) - 18 - (i * 14));
      plume.parent = this.environmentRoot;
    }
  }

  _buildGauntletEnvironment(bounds, accentMat, backMat) {
    const B = this.B;
    for (let i = 0; i < 14; i += 1) {
      const pillar = B.MeshBuilder.CreateBox(`gauntlet-pillar-${i}`, {
        width: 1.8 + (i % 2) * 0.6,
        height: 4.2 + (i % 4) * 1.6,
        depth: 1.8 + (i % 3) * 0.5
      }, this.scene);
      pillar.material = i % 3 === 0 ? accentMat : backMat;
      pillar.position.x = i % 2 === 0 ? -8 - (i % 3) : 8 + (i % 3);
      pillar.position.z = Number(bounds.maxZ || 12) - (i * 10.2);
      pillar.position.y = pillar.scaling.y * 0.5;
      pillar.parent = this.environmentRoot;
    }
    const arch = B.MeshBuilder.CreateTorus("gauntlet-arch", { diameter: 18, thickness: 0.5, tessellation: 40 }, this.scene);
    arch.material = accentMat;
    arch.position = v3(B, 0, 7.4, Number(bounds.minZ || -120) + 18);
    arch.rotation.x = Math.PI * 0.5;
    arch.parent = this.environmentRoot;
  }

  _buildHazards(hazards) {
    const B = this.B;
    const hazardMat = this._ensureMaterial(`hazard-${this.theme.id}`, this.theme.hazardColor, "#111", this.theme.accentGlow);
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
    const root = new B.TransformNode(`player-${key}`, this.scene);
    root.parent = this.playerRoot;
    const body = B.MeshBuilder.CreateCapsule(`player-body-${key}`, { radius: 0.45, height: 1.2, tessellation: 10 }, this.scene);
    body.parent = root;
    body.position.y = 1.05;
    body.material = this._ensureMaterial(isLocal ? `player-local-${key}` : `player-remote-${key}`, isLocal ? "#ff6fb2" : "#6bb7ff", "#111");
    const ring = B.MeshBuilder.CreateTorus(`player-ring-${key}`, { diameter: 1.42, thickness: 0.06, tessellation: 24 }, this.scene);
    ring.parent = root;
    ring.position.y = 0.05;
    ring.rotation.x = Math.PI * 0.5;
    ring.material = this._ensureMaterial(isLocal ? `player-ring-local` : `player-ring-remote`, isLocal ? this.theme.accentColor : "#d7e7ff", "#111", isLocal ? this.theme.accentGlow : "#dce9ff");
    const state = {
      key,
      root,
      body,
      ring,
      targetPos: v3(B, 0, 0.9, 0),
      targetRot: 0,
      isLocal
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

    for (const meshState of this.playerMeshes.values()) {
      meshState.root.position.x = lerp(meshState.root.position.x, meshState.targetPos.x, meshState.isLocal ? 0.42 : 0.18);
      meshState.root.position.y = lerp(meshState.root.position.y, meshState.targetPos.y, meshState.isLocal ? 0.42 : 0.18);
      meshState.root.position.z = lerp(meshState.root.position.z, meshState.targetPos.z, meshState.isLocal ? 0.42 : 0.18);
      meshState.root.rotation.y = lerp(meshState.root.rotation.y, meshState.targetRot, meshState.isLocal ? 0.28 : 0.16);
      meshState.ring.rotation.z += dt * 0.85;
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

    if (this.cityTrafficLane?.cars?.length) {
      const lane = this.cityTrafficLane;
      const range = Math.abs(Number(lane.z1 || -100) - Number(lane.z0 || 10));
      for (const car of lane.cars) {
        const phase = ((now * 0.00008) + Number(car.offset || 0)) % 1;
        car.mesh.position.x = Number(lane.x || 0) + (Math.sin((phase * Math.PI * 2) + Number(car.offset || 0)) * 1.8);
        car.mesh.position.y = Number(lane.y || 9.3);
        car.mesh.position.z = Number(lane.z0 || 10) - (phase * range);
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
