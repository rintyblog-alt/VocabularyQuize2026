function clamp01(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex) {
  const clean = String(hex || "#ffffff").replace(/[^0-9a-f]/gi, "");
  const full = clean.length === 3
    ? clean.split("").map((ch) => ch + ch).join("")
    : clean.padEnd(6, "f").slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function mixHex(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const s = clamp01(t);
  return rgbToHex(
    x.r + ((y.r - x.r) * s),
    x.g + ((y.g - x.g) * s),
    x.b + ((y.b - x.b) * s)
  );
}

function alpha(hex, value = 1) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(value)})`;
}

function textureSize(profile) {
  const scale = Number(profile?.textureScale || 1);
  if (scale <= 0.72) return 192;
  if (scale <= 0.94) return 256;
  return 384;
}

function makeDynamicTexture(B, scene, key, size, painter) {
  const tex = new B.DynamicTexture(key, { width: size, height: size }, scene, false);
  const ctx = tex.getContext();
  painter(ctx, size, size);
  tex.update(false);
  tex.wrapU = B.Texture.WRAP_ADDRESSMODE;
  tex.wrapV = B.Texture.WRAP_ADDRESSMODE;
  return tex;
}

function paintBase(ctx, w, h, base) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
}

function paintRoad(ctx, w, h, theme) {
  paintBase(ctx, w, h, theme.laneColor || "#2e3441");
  ctx.fillStyle = alpha(theme.edgeColor || "#7f8796", 0.14);
  for (let y = 0; y < h; y += 12) ctx.fillRect(0, y, w, 4);
  ctx.strokeStyle = alpha(theme.roadStripeColor || theme.accentColor || "#f3e5ab", 0.88);
  ctx.lineWidth = Math.max(2, Math.round(w * 0.02));
  ctx.setLineDash([Math.max(8, w * 0.07), Math.max(8, w * 0.05)]);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.lineTo(w * 0.5, h);
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintSidewalk(ctx, w, h, theme) {
  paintBase(ctx, w, h, theme.sidewalkColor || mixHex(theme.edgeColor || "#888", "#d8d8d8", 0.2));
  ctx.strokeStyle = alpha("#ffffff", 0.08);
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 22) {
    for (let y = 0; y < h; y += 22) {
      ctx.strokeRect(x + 1, y + 1, 18, 18);
    }
  }
}

function paintSteel(ctx, w, h, base, accent) {
  paintBase(ctx, w, h, base);
  ctx.fillStyle = alpha(accent, 0.16);
  for (let y = 0; y < h; y += 24) ctx.fillRect(0, y, w, 3);
  ctx.fillStyle = alpha("#ffffff", 0.09);
  for (let x = 8; x < w; x += 28) {
    for (let y = 8; y < h; y += 28) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintWater(ctx, w, h, theme) {
  const top = mixHex(theme.accentColor || "#7ccfff", "#e4f7ff", 0.18);
  const bottom = mixHex(theme.backdropColor || "#487cb2", "#10355c", 0.35);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = alpha("#ffffff", 0.18);
  ctx.lineWidth = 2;
  for (let y = 8; y < h; y += 20) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + (Math.sin((x / w) * Math.PI * 6) * 2.5);
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function paintLava(ctx, w, h, theme) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, mixHex(theme.hazardColor || "#ff5d38", "#ffd085", 0.15));
  grad.addColorStop(0.6, theme.hazardColor || "#ff5d38");
  grad.addColorStop(1, mixHex(theme.groundColor || "#542b20", "#1b0a08", 0.45));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = alpha("#ffd18c", 0.2);
  for (let i = 0; i < 28; i += 1) {
    const x = (i * 37) % w;
    const y = (i * 53) % h;
    ctx.beginPath();
    ctx.arc(x, y, 4 + (i % 5), 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSnow(ctx, w, h, theme) {
  paintBase(ctx, w, h, theme.laneColor || "#eef6ff");
  ctx.fillStyle = alpha("#ffffff", 0.38);
  for (let i = 0; i < 180; i += 1) {
    const x = (i * 29) % w;
    const y = (i * 41) % h;
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 2), 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSand(ctx, w, h, theme) {
  paintBase(ctx, w, h, theme.laneColor || "#c99d63");
  ctx.strokeStyle = alpha(mixHex(theme.edgeColor || "#6e5338", "#fff2c3", 0.25), 0.18);
  ctx.lineWidth = 1.5;
  for (let y = 10; y < h; y += 16) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const yy = y + (Math.sin((x / w) * Math.PI * 5 + (y * 0.03)) * 1.6);
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function paintStone(ctx, w, h, theme) {
  paintBase(ctx, w, h, theme.groundColor || "#8c7b5d");
  ctx.strokeStyle = alpha("#ffffff", 0.08);
  ctx.lineWidth = 2;
  for (let y = 0; y < h; y += 28) {
    const offset = (Math.floor(y / 28) % 2) * 14;
    for (let x = -offset; x < w; x += 28) {
      ctx.strokeRect(x + 1, y + 1, 26, 26);
    }
  }
}

function paintNeon(ctx, w, h, theme) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, mixHex(theme.laneColor || "#241d65", "#0b0a25", 0.18));
  grad.addColorStop(1, mixHex(theme.accentColor || "#76d4ff", theme.hazardColor || "#ff5be4", 0.36));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = alpha(theme.accentGlow || theme.accentColor || "#d76dff", 0.34);
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    ctx.moveTo((i / 8) * w, 0);
    ctx.lineTo(((i / 8) * w) - (w * 0.2), h);
    ctx.stroke();
  }
}

function makeMaterial(B, scene, key, base, texturePainter, options = {}) {
  const usePbr = options.usePbr !== false;
  const material = usePbr ? new B.PBRMaterial(key, scene) : new B.StandardMaterial(key, scene);
  const size = textureSize(options.profile);
  const tex = makeDynamicTexture(B, scene, `${key}-tex`, size, (ctx, w, h) => texturePainter(ctx, w, h));
  tex.uScale = Number(options.uScale || 1);
  tex.vScale = Number(options.vScale || 1);
  if (material instanceof B.PBRMaterial) {
    material.albedoTexture = tex;
    material.albedoColor = B.Color3.FromHexString(base);
    material.metallic = Number(options.metallic || 0);
    material.roughness = Number(options.roughness ?? 0.88);
    material.emissiveColor = B.Color3.FromHexString(String(options.emissive || "#000000"));
  } else {
    material.diffuseTexture = tex;
    material.diffuseColor = B.Color3.FromHexString(base);
    material.specularColor = B.Color3.FromHexString(String(options.specular || "#111111"));
    material.emissiveColor = B.Color3.FromHexString(String(options.emissive || "#000000"));
  }
  material.backFaceCulling = true;
  material.alpha = Number(options.alpha ?? 1);
  return material;
}

export function createSurvivalMaterialKit(B, scene, theme, profile) {
  const pbr = profile?.id !== "low";
  const kit = {};
  kit.lane = makeMaterial(B, scene, `sv2-lane-${theme.id}-${profile.id}`, theme.laneColor || "#d6e3ef", (ctx, w, h) => paintRoad(ctx, w, h, theme), {
    profile,
    usePbr: pbr,
    roughness: 0.92,
    metallic: 0.02,
    uScale: 1,
    vScale: 6
  });
  kit.edge = makeMaterial(B, scene, `sv2-edge-${theme.id}-${profile.id}`, theme.edgeColor || "#5f7ea6", (ctx, w, h) => paintSteel(ctx, w, h, theme.edgeColor || "#5f7ea6", mixHex(theme.edgeColor || "#5f7ea6", "#ffffff", 0.2)), {
    profile,
    usePbr: pbr,
    roughness: 0.78,
    metallic: 0.14,
    uScale: 1,
    vScale: 3
  });
  kit.rail = makeMaterial(B, scene, `sv2-rail-${theme.id}-${profile.id}`, theme.railColor || theme.edgeColor || "#314a6d", (ctx, w, h) => paintSteel(ctx, w, h, theme.railColor || theme.edgeColor || "#314a6d", theme.accentColor || "#8ed0ff"), {
    profile,
    usePbr: pbr,
    roughness: 0.54,
    metallic: 0.45,
    uScale: 1,
    vScale: 4,
    emissive: mixHex(theme.accentGlow || theme.accentColor || "#8ed0ff", "#000000", 0.85)
  });
  kit.accent = makeMaterial(B, scene, `sv2-accent-${theme.id}-${profile.id}`, theme.accentColor || "#8ed0ff", (ctx, w, h) => paintSteel(ctx, w, h, theme.accentColor || "#8ed0ff", theme.accentGlow || theme.accentColor || "#b7ebff"), {
    profile,
    usePbr: pbr,
    roughness: 0.46,
    metallic: 0.22,
    emissive: mixHex(theme.accentGlow || theme.accentColor || "#8ed0ff", "#ffffff", 0.28)
  });
  kit.warm = makeMaterial(B, scene, `sv2-warm-${theme.id}-${profile.id}`, theme.hazardColor || "#ff8e6f", (ctx, w, h) => paintSteel(ctx, w, h, theme.hazardColor || "#ff8e6f", mixHex(theme.hazardColor || "#ff8e6f", "#ffd399", 0.32)), {
    profile,
    usePbr: pbr,
    roughness: 0.42,
    metallic: 0.18,
    emissive: mixHex(theme.hazardColor || "#ff8e6f", "#ffd08a", 0.32)
  });
  kit.gate = kit.accent;
  kit.gateDoor = kit.warm;
  kit.checkpoint = kit.accent;
  kit.goal = makeMaterial(B, scene, `sv2-goal-${theme.id}-${profile.id}`, mixHex(theme.accentColor || "#8ed0ff", "#ffffff", 0.15), (ctx, w, h) => paintNeon(ctx, w, h, {
    laneColor: mixHex(theme.accentColor || "#8ed0ff", "#0b1220", 0.72),
    accentColor: theme.accentColor || "#8ed0ff",
    hazardColor: theme.hazardColor || "#ff8e6f",
    accentGlow: theme.accentGlow || theme.accentColor || "#b7ebff"
  }), {
    profile,
    usePbr: pbr,
    roughness: 0.32,
    metallic: 0.2,
    emissive: "#ffffff"
  });
  kit.ground = makeMaterial(B, scene, `sv2-ground-${theme.id}-${profile.id}`, theme.groundColor || "#e2edf8", (ctx, w, h) => {
    if (theme.id === "snow" || theme.id === "ice") return paintSnow(ctx, w, h, theme);
    if (theme.id === "desert" || theme.id === "canyon") return paintSand(ctx, w, h, theme);
    if (theme.id === "volcano") return paintStone(ctx, w, h, theme);
    if (theme.id === "neon") return paintNeon(ctx, w, h, theme);
    return paintStone(ctx, w, h, { groundColor: mixHex(theme.groundColor || "#e2edf8", "#ffffff", 0.06) });
  }, {
    profile,
    usePbr: pbr,
    roughness: 0.96,
    metallic: 0.01,
    uScale: 3,
    vScale: 8
  });
  kit.backdrop = makeMaterial(B, scene, `sv2-backdrop-${theme.id}-${profile.id}`, theme.backdropColor || theme.groundColor || "#95b9df", (ctx, w, h) => paintStone(ctx, w, h, { groundColor: theme.backdropColor || theme.groundColor || "#95b9df" }), {
    profile,
    usePbr: pbr,
    roughness: 0.9,
    metallic: 0.04,
    uScale: 2,
    vScale: 4
  });
  kit.sidewalk = makeMaterial(B, scene, `sv2-sidewalk-${theme.id}-${profile.id}`, theme.sidewalkColor || theme.edgeColor || "#767f8d", (ctx, w, h) => paintSidewalk(ctx, w, h, theme), {
    profile,
    usePbr: pbr,
    roughness: 0.94,
    metallic: 0.02,
    uScale: 2,
    vScale: 6
  });
  kit.road = kit.lane;
  kit.roadStripe = makeMaterial(B, scene, `sv2-roadstripe-${theme.id}-${profile.id}`, theme.roadStripeColor || "#f6efcf", (ctx, w, h) => {
    paintBase(ctx, w, h, theme.roadStripeColor || "#f6efcf");
    ctx.fillStyle = alpha("#ffffff", 0.18);
    ctx.fillRect(0, 0, w, h * 0.2);
  }, { profile, usePbr: false, specular: "#111111", uScale: 1, vScale: 1 });
  kit.water = makeMaterial(B, scene, `sv2-water-${theme.id}-${profile.id}`, mixHex(theme.accentColor || "#7ccfff", theme.backdropColor || "#1b4c77", 0.25), (ctx, w, h) => paintWater(ctx, w, h, theme), {
    profile,
    usePbr: pbr,
    roughness: 0.22,
    metallic: 0.08,
    emissive: mixHex(theme.accentGlow || theme.accentColor || "#7ccfff", "#000000", 0.72),
    uScale: 3,
    vScale: 10
  });
  kit.lava = makeMaterial(B, scene, `sv2-lava-${theme.id}-${profile.id}`, theme.hazardColor || "#ff5d38", (ctx, w, h) => paintLava(ctx, w, h, theme), {
    profile,
    usePbr: pbr,
    roughness: 0.38,
    metallic: 0.05,
    emissive: mixHex(theme.hazardColor || "#ff5d38", "#ffdf9f", 0.34),
    uScale: 2,
    vScale: 7
  });
  kit.snow = makeMaterial(B, scene, `sv2-snow-${theme.id}-${profile.id}`, theme.laneColor || "#eef6ff", (ctx, w, h) => paintSnow(ctx, w, h, theme), {
    profile,
    usePbr: pbr,
    roughness: 0.92,
    metallic: 0.01,
    uScale: 3,
    vScale: 6
  });
  kit.sand = makeMaterial(B, scene, `sv2-sand-${theme.id}-${profile.id}`, theme.laneColor || "#c99d63", (ctx, w, h) => paintSand(ctx, w, h, theme), {
    profile,
    usePbr: pbr,
    roughness: 0.96,
    metallic: 0.01,
    uScale: 3,
    vScale: 8
  });
  kit.stone = makeMaterial(B, scene, `sv2-stone-${theme.id}-${profile.id}`, theme.groundColor || "#8c7b5d", (ctx, w, h) => paintStone(ctx, w, h, theme), {
    profile,
    usePbr: pbr,
    roughness: 0.95,
    metallic: 0.03,
    uScale: 2,
    vScale: 5
  });
  kit.neon = makeMaterial(B, scene, `sv2-neon-${theme.id}-${profile.id}`, theme.laneColor || "#251d65", (ctx, w, h) => paintNeon(ctx, w, h, theme), {
    profile,
    usePbr: pbr,
    roughness: 0.3,
    metallic: 0.22,
    emissive: mixHex(theme.accentGlow || theme.accentColor || "#d76dff", "#ffffff", 0.2),
    uScale: 2,
    vScale: 5
  });
  kit.bridgeSteel = makeMaterial(B, scene, `sv2-bridge-steel-${theme.id}-${profile.id}`, mixHex(theme.railColor || theme.edgeColor || "#314a6d", "#dbe7f2", 0.08), (ctx, w, h) => paintSteel(ctx, w, h, theme.railColor || theme.edgeColor || "#314a6d", theme.accentColor || "#8ed0ff"), {
    profile,
    usePbr: pbr,
    roughness: 0.48,
    metallic: 0.55,
    uScale: 1,
    vScale: 5
  });
  kit.building = makeMaterial(B, scene, `sv2-building-${theme.id}-${profile.id}`, mixHex(theme.backdropColor || theme.groundColor || "#7a869b", "#10141f", 0.18), (ctx, w, h) => paintSteel(ctx, w, h, mixHex(theme.backdropColor || theme.groundColor || "#7a869b", "#10141f", 0.18), mixHex(theme.accentColor || "#66a5ff", "#ffffff", 0.1)), {
    profile,
    usePbr: pbr,
    roughness: 0.72,
    metallic: 0.18,
    uScale: 1,
    vScale: 3
  });
  kit.glass = makeMaterial(B, scene, `sv2-glass-${theme.id}-${profile.id}`, mixHex(theme.accentColor || "#66a5ff", "#dff5ff", 0.5), (ctx, w, h) => {
    paintBase(ctx, w, h, mixHex(theme.accentColor || "#66a5ff", "#e9f7ff", 0.6));
    ctx.fillStyle = alpha("#ffffff", 0.18);
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 2);
  }, {
    profile,
    usePbr: pbr,
    roughness: 0.12,
    metallic: 0.08,
    alpha: 0.78,
    emissive: mixHex(theme.accentGlow || theme.accentColor || "#8bbdff", "#000000", 0.76)
  });
  kit.carWarm = makeMaterial(B, scene, `sv2-carwarm-${theme.id}-${profile.id}`, "#f78462", (ctx, w, h) => paintSteel(ctx, w, h, "#f78462", "#ffd1a2"), {
    profile,
    usePbr: pbr,
    roughness: 0.26,
    metallic: 0.48
  });
  kit.carCool = makeMaterial(B, scene, `sv2-carcool-${theme.id}-${profile.id}`, "#7cc1ff", (ctx, w, h) => paintSteel(ctx, w, h, "#7cc1ff", "#d8efff"), {
    profile,
    usePbr: pbr,
    roughness: 0.24,
    metallic: 0.46
  });
  return kit;
}
