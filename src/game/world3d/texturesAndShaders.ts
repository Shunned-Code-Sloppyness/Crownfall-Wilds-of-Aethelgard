import * as THREE from 'three';
import { ZoneConfig, ZoneId } from '../types';
import { ZONE_CONFIGS } from '../zones';

/** World coordinate conversion: 20 simulation pixels = 1.0 3D meter */
export const WORLD_SCALE = 0.05;

export function simTo3D(simX: number, simY: number): { x: number; z: number } {
  return { x: simX * WORLD_SCALE, z: simY * WORLD_SCALE };
}

/**
 * Continuous procedural ground height function shared by terrain mesh, props, actors, and camera.
 * Keeps roads, village plaza, and combat clearings smoothly walkable while giving rolling Albion hills,
 * recessed lake/lava basins, and rising natural mountain perimeters outside the playable bounds.
 */
export function groundHeightAt(zoneId: ZoneId, wx: number, wz: number): number {
  const zone = ZONE_CONFIGS[zoneId];
  const simX = wx / WORLD_SCALE;
  const simY = wz / WORLD_SCALE;

  // Base gentle rolling terrain undulation
  let h =
    Math.sin(wx * 0.095 + 0.7) * Math.cos(wz * 0.085 - 0.3) * 0.42 +
    Math.sin(wx * 0.21 - wz * 0.17) * 0.16;

  if (zoneId === 'crags') {
    h = h * 1.45 + Math.cos(wx * 0.06 + wz * 0.05) * 0.38;
  } else if (zoneId === 'caldera') {
    h = h * 1.35 + Math.sin(wx * 0.12) * Math.sin(wz * 0.11) * 0.32;
  }

  // Flatten Oakhaven central village plaza & surrounding structure pads cleanly
  if (zoneId === 'oakhaven') {
    const plazaDist = Math.hypot(simX - 1100, simY - 900);
    if (plazaDist < 420) {
      const t = THREE.MathUtils.smoothstep(plazaDist, 190, 420);
      h = THREE.MathUtils.lerp(0.18, h, t);
    }
  }

  // Flatten around all village structures & travel portals so buildings sit flush
  for (const st of zone.structures) {
    const d = Math.hypot(simX - st.x, simY - st.y);
    const pad = st.radius + 95;
    if (d < pad) {
      const t = THREE.MathUtils.smoothstep(d, st.radius + 15, pad);
      h = THREE.MathUtils.lerp(0.18, h, t);
    }
  }
  for (const pt of zone.portals) {
    const d = Math.hypot(simX - pt.x, simY - pt.y);
    if (d < 130) {
      const t = THREE.MathUtils.smoothstep(d, 45, 130);
      h = THREE.MathUtils.lerp(0.12, h, t);
    }
  }

  // Depress water & lava pool basins smoothly below water level (y = -0.15)
  for (const w of zone.waterPools) {
    const nx = (simX - w.x) / (w.rx + 42);
    const ny = (simY - w.y) / (w.ry + 42);
    const d = Math.hypot(nx, ny);
    if (d < 1.15) {
      const basin = 1 - THREE.MathUtils.smoothstep(d, 0.55, 1.15);
      h -= basin * 1.18;
    }
  }

  // Natural rising cliffs & hills beyond playable perimeter so terrain never ends in an empty void
  const marginX = Math.max(0, 60 - simX, simX - (zone.width - 60));
  const marginY = Math.max(0, 60 - simY, simY - (zone.height - 60));
  const outDist = Math.hypot(marginX, marginY) * WORLD_SCALE;
  if (outDist > 0) {
    const ridge =
      Math.min(11, Math.pow(outDist, 1.25) * 0.24) +
      Math.abs(Math.sin(wx * 0.14 + wz * 0.11)) * Math.min(3.5, outDist * 0.15);
    h += ridge;
  }

  return h;
}

export interface BiomeAtmosphere {
  skyZenith: number;
  skyHorizon: number;
  skyGround: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogColor: number;
  fogDensity: number;
  cloudTint: number;
  grassPrimary: string;
  grassSecondary: string;
  dirtColor: string;
  rockColor: string;
  waterShallow: number;
  waterDeep: number;
}

export const BIOME_ATMOSPHERE: Record<ZoneId, BiomeAtmosphere> = {
  oakhaven: {
    skyZenith: 0x3b7bc4,
    skyHorizon: 0xf4cfa0,
    skyGround: 0x76644c,
    sunColor: 0xffe4b0,
    sunIntensity: 2.35,
    sunPos: [42, 54, 28],
    hemiSky: 0x9ecbff,
    hemiGround: 0x7a6544,
    hemiIntensity: 0.92,
    fogColor: 0xdccaa8,
    fogDensity: 0.0085,
    cloudTint: 0xfff3de,
    grassPrimary: '#5e8842',
    grassSecondary: '#4b7334',
    dirtColor: '#a6875c',
    rockColor: '#7a7266',
    waterShallow: 0x4ba9b0,
    waterDeep: 0x1b5869,
  },
  glade: {
    skyZenith: 0x2f6ba8,
    skyHorizon: 0xe3cf9e,
    skyGround: 0x4c5d3a,
    sunColor: 0xffdf9e,
    sunIntensity: 2.15,
    sunPos: [38, 50, 26],
    hemiSky: 0x8ec3eb,
    hemiGround: 0x4f6638,
    hemiIntensity: 0.88,
    fogColor: 0xc2cfa6,
    fogDensity: 0.0105,
    cloudTint: 0xfaf0d7,
    grassPrimary: '#457636',
    grassSecondary: '#315c2a',
    dirtColor: '#7f6948',
    rockColor: '#666b60',
    waterShallow: 0x419ca0,
    waterDeep: 0x174a57,
  },
  crags: {
    skyZenith: 0x38699e,
    skyHorizon: 0xf0be86,
    skyGround: 0x7b5e46,
    sunColor: 0xffd596,
    sunIntensity: 2.55,
    sunPos: [46, 56, 22],
    hemiSky: 0xa7c5e3,
    hemiGround: 0x856649,
    hemiIntensity: 0.9,
    fogColor: 0xd9b892,
    fogDensity: 0.0092,
    cloudTint: 0xffe8c7,
    grassPrimary: '#8a7a4f',
    grassSecondary: '#6f6142',
    dirtColor: '#a47e54',
    rockColor: '#786e63',
    waterShallow: 0x3f8c9c,
    waterDeep: 0x1a4659,
  },
  caldera: {
    skyZenith: 0x2d1b1e,
    skyHorizon: 0xb85230,
    skyGround: 0x2e1e1a,
    sunColor: 0xff9b5c,
    sunIntensity: 2.2,
    sunPos: [36, 44, 24],
    hemiSky: 0xd97d54,
    hemiGround: 0x45261e,
    hemiIntensity: 0.85,
    fogColor: 0x6b3a2b,
    fogDensity: 0.0115,
    cloudTint: 0xdfa077,
    grassPrimary: '#4a3d37',
    grassSecondary: '#362c28',
    dirtColor: '#5c463c',
    rockColor: '#3b3330',
    waterShallow: 0xff8029,
    waterDeep: 0xb52412,
  },
};

function seededNoise(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Generates hand-painted Albion-style seamless PBR albedo + bump texture pair on offscreen canvas.
 */
export function createPaintedGroundTextures(
  zone: ZoneConfig,
  maxAnisotropy: number,
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const atmo = BIOME_ATMOSPHERE[zone.id];
  const size = 512;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  // Base warm earthy fill
  ctx.fillStyle = atmo.grassPrimary;
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Layered painterly brush blotches (wraps cleanly via 3x3 offset stamps)
  const stampWrapped = (
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    fill: string,
    alpha: number,
  ) => {
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = fill;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const px = x + ox * size;
        const py = y + oy * size;
        if (px + rx < 0 || px - rx > size || py + ry < 0 || py - ry > size) continue;
        c.save();
        c.translate(px, py);
        c.rotate(rot);
        c.beginPath();
        c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
    c.restore();
  };

  for (let i = 0; i < 240; i++) {
    const x = seededNoise(i, 1.3) * size;
    const y = seededNoise(i, 4.7) * size;
    const rx = 18 + seededNoise(i, 9.1) * 44;
    const ry = 10 + seededNoise(i, 12.2) * 26;
    const rot = seededNoise(i, 15.8) * Math.PI;
    const pick = seededNoise(i, 19.4);
    const col =
      pick < 0.48 ? atmo.grassSecondary : pick < 0.78 ? atmo.dirtColor : atmo.rockColor;
    stampWrapped(ctx, x, y, rx, ry, rot, col, pick < 0.48 ? 0.32 : 0.16);
    stampWrapped(bctx, x, y, rx * 0.85, ry * 0.85, rot, pick < 0.5 ? '#9c9c9c' : '#656565', 0.25);
  }

  // Fine grass blades / pebbles / volcanic grit strokes
  for (let i = 0; i < 950; i++) {
    const x = seededNoise(i, 23.1) * size;
    const y = seededNoise(i, 29.7) * size;
    const len = 4 + seededNoise(i, 31.4) * 7;
    const ang = -Math.PI * 0.5 + (seededNoise(i, 37.9) - 0.5) * 0.9;
    const bright = seededNoise(i, 41.2) > 0.5;
    ctx.strokeStyle =
      zone.id === 'caldera'
        ? bright
          ? 'rgba(120, 88, 72, 0.35)'
          : 'rgba(28, 22, 20, 0.45)'
        : bright
        ? 'rgba(182, 204, 118, 0.34)'
        : 'rgba(34, 52, 22, 0.32)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();

    bctx.fillStyle = bright ? 'rgba(215,215,215,0.35)' : 'rgba(55,55,55,0.35)';
    bctx.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(22, 18);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(22, 18);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/**
 * Generates cobblestone plaza texture for Oakhaven Bastion's village square.
 */
export function createCobblestoneTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bctx = b.getContext('2d')!;

  ctx.fillStyle = '#5c4e3e';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#383838';
  bctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 8;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const offset = (r % 2) * (cellW * 0.5);
      const x = (col * cellW + offset) % size;
      const y = r * cellH;
      const shade = 148 + Math.floor(seededNoise(r * 13 + col, 2.7) * 42);
      const warm = Math.floor(seededNoise(r * 7 + col, 8.1) * 18);
      ctx.fillStyle = `rgb(${shade + warm}, ${shade + warm - 10}, ${shade - 22})`;
      bctx.fillStyle = `rgb(${165 + warm * 2}, ${165 + warm * 2}, ${165 + warm * 2})`;

      for (const wrapX of [0, -size]) {
        const px = x + wrapX + 2;
        const py = y + 2;
        const w = cellW - 4;
        const h = cellH - 4;
        ctx.beginPath();
        ctx.roundRect(px, py, w, h, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,244,220,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();

        bctx.beginPath();
        bctx.roundRect(px, py, w, h, 5);
        bctx.fill();
      }
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(9, 9);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(9, 9);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/**
 * Generates subtle hand-painted bark/wood or carved stone surface texture for buildings & trees.
 */
export function createWoodTexture(baseHex: string, darkHex: string, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 95; i++) {
    const x = seededNoise(i, 3.1) * size;
    const w = 2 + seededNoise(i, 6.4) * 5;
    ctx.fillStyle = i % 2 === 0 ? darkHex : 'rgba(255, 232, 195, 0.12)';
    ctx.globalAlpha = 0.25 + seededNoise(i, 9.2) * 0.25;
    ctx.fillRect(x, 0, w, size);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Procedural Atmospheric Skybox Dome ShaderMaterial with warm afternoon sun glow & painted drifting clouds.
 */
export function createSkyboxMesh(atmo: BiomeAtmosphere): {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
} {
  const sunDir = new THREE.Vector3(...atmo.sunPos).normalize();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uZenith: { value: new THREE.Color(atmo.skyZenith) },
      uHorizon: { value: new THREE.Color(atmo.skyHorizon) },
      uGround: { value: new THREE.Color(atmo.skyGround) },
      uSunColor: { value: new THREE.Color(atmo.sunColor) },
      uCloudTint: { value: new THREE.Color(atmo.cloudTint) },
      uSunDir: { value: sunDir },
      uWarmLighting: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSunColor;
      uniform vec3 uCloudTint;
      uniform vec3 uSunDir;
      uniform float uWarmLighting;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = dir.y;

        // Sky-to-horizon-to-ground atmospheric gradient
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.52));
        sky = mix(uGround, sky, smoothstep(-0.18, 0.06, h));

        // Sun disc + warm atmospheric Mie scattering
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float sunHalo = pow(sunDot, 10.0) * 0.42 * uWarmLighting;
        float sunCore = smoothstep(0.9965, 0.9992, sunDot) * 1.4;
        sky += uSunColor * (sunHalo + sunCore);

        // Stylized hand-painted drifting clouds in upper sky dome
        if (h > 0.03) {
          vec2 cloudUv = dir.xz / (h + 0.24) * 1.45 + vec2(uTime * 0.012, uTime * 0.004);
          float c = fbm(cloudUv);
          float cloudMask = smoothstep(0.49, 0.72, c) * smoothstep(0.03, 0.22, h) * (1.0 - smoothstep(0.7, 0.98, h));
          vec3 cloudCol = mix(uCloudTint * 0.88, uSunColor, pow(sunDot, 3.0) * 0.55);
          sky = mix(sky, cloudCol, cloudMask * 0.62);
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const geo = new THREE.SphereGeometry(260, 28, 20);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

/**
 * Custom GLSL Animated Water & Molten Lava ShaderMaterial.
 */
export function createWaterShaderMaterial(
  atmo: BiomeAtmosphere,
  isLava: boolean,
): THREE.ShaderMaterial {
  const sunDir = new THREE.Vector3(...atmo.sunPos).normalize();
  return new THREE.ShaderMaterial({
    transparent: !isLava,
    depthWrite: isLava,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(isLava ? 0xff9233 : atmo.waterShallow) },
      uDeep: { value: new THREE.Color(isLava ? 0x6e1309 : atmo.waterDeep) },
      uSunColor: { value: new THREE.Color(atmo.sunColor) },
      uSunDir: { value: sunDir },
      uIsLava: { value: isLava ? 1.0 : 0.0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uIsLava;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec3 pos = position;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        float wave = sin(worldPos.x * 1.8 + uTime * 2.1) * cos(worldPos.z * 1.6 - uTime * 1.7) * 0.045;
        worldPos.y += wave * (1.0 - uIsLava * 0.5);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uIsLava;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float radial = length(centered);
        if (radial > 1.0) discard;

        if (uIsLava > 0.5) {
          float n1 = noise(vWorldPos.xz * 0.55 + vec2(uTime * 0.22, -uTime * 0.14));
          float n2 = noise(vWorldPos.xz * 1.2 - vec2(uTime * 0.16, uTime * 0.25));
          float heat = smoothstep(0.28, 0.78, n1 * 0.65 + n2 * 0.35);
          vec3 crust = vec3(0.16, 0.08, 0.07);
          vec3 magma = mix(uDeep, uShallow, heat);
          vec3 col = mix(crust, magma, smoothstep(0.22, 0.55, heat));
          float glow = smoothstep(0.66, 0.92, heat) * 0.65;
          col += vec3(1.0, 0.78, 0.35) * glow;
          float rim = smoothstep(0.84, 1.0, radial);
          col = mix(col, crust, rim * 0.75);
          gl_FragColor = vec4(col, 1.0);
          return;
        }

        // Stylized Albion clear water with ripples, shoreline foam, Fresnel sky glint & sun sparkles
        float r1 = noise(vWorldPos.xz * 0.95 + vec2(uTime * 0.45, uTime * 0.25));
        float r2 = noise(vWorldPos.xz * 1.85 - vec2(uTime * 0.32, uTime * 0.5));
        float ripple = (r1 + r2) * 0.5;

        float shoreFactor = smoothstep(0.55, 0.98, radial);
        vec3 col = mix(uDeep, uShallow, shoreFactor * 0.8 + ripple * 0.28);

        // Specular sunlight glints on wave crests
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 n = normalize(vec3((r1 - 0.5) * 0.35, 1.0, (r2 - 0.5) * 0.35));
        float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
        vec3 halfVec = normalize(normalize(uSunDir) + viewDir);
        float spec = pow(max(dot(n, halfVec), 0.0), 42.0);

        col = mix(col, uSunColor * 0.95, fresnel * 0.28);
        col += uSunColor * spec * 0.85;

        // Animated shoreline white foam ring
        float foamWave = sin(radial * 24.0 - uTime * 2.8 + ripple * 4.0) * 0.5 + 0.5;
        float foam = smoothstep(0.83, 0.97, radial) * (0.55 + foamWave * 0.45);
        col = mix(col, vec3(0.92, 0.97, 0.98), foam * 0.68);

        float alpha = mix(0.88, 0.55, smoothstep(0.86, 1.0, radial));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * Custom GLSL Swirling Zone Portal Vortex ShaderMaterial.
 */
export function createPortalVortexMaterial(colorHex: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(colorHex) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float swirl = sin(a * 4.0 + r * 8.0 - uTime * 3.8) * 0.5 + 0.5;
        float core = smoothstep(1.0, 0.1, r);
        float ring = smoothstep(0.65, 0.85, r) * (1.0 - smoothstep(0.85, 1.0, r));
        vec3 col = mix(uColor, vec3(1.0, 0.95, 0.78), swirl * 0.5 + ring * 0.6);
        float alpha = (core * (0.45 + swirl * 0.4) + ring * 0.6) * (1.0 - smoothstep(0.88, 1.0, r));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * Patches a MeshStandardMaterial with subtle GPU vertex wind-sway for foliage canopies & herbs
 * while preserving full PBR lighting, shadows, and RoomEnvironment reflections.
 */
export function applyWindSwayToMaterial(
  material: THREE.MeshStandardMaterial,
  timeUniform: { value: number },
  strength = 0.08,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = timeUniform;
    shader.uniforms.uWindStrength = { value: strength };
    shader.vertexShader =
      'uniform float uWindTime;\nuniform float uWindStrength;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float swayHeight = max(0.0, position.y);
      float swayPhase = uWindTime * 1.85 + position.x * 0.9 + position.z * 0.7;
      transformed.x += sin(swayPhase) * uWindStrength * swayHeight;
      transformed.z += cos(swayPhase * 0.85) * uWindStrength * 0.65 * swayHeight;
      `,
    );
  };
}
