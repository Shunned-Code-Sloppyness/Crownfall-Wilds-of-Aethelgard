import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ITEM_TEMPLATES } from './catalog';
import {
  AiAdventurer,
  ArmorClass,
  EnemyEntity,
  FishingState,
  GameSettings,
  OffhandStyle,
  RemotePlayer,
  ResourceNode,
  SkillDef,
  WeaponArchetype,
  ZoneConfig,
  ZoneId,
} from './types';
import {
  createEnemyRig,
  createHumanoidRig,
  createPortalMesh,
  createResourceNodeMesh,
  createVillageStructureMesh,
  EnemyRig,
  HumanoidRig,
} from './world3d/models3d';
import {
  BIOME_ATMOSPHERE,
  createCobblestoneTexture,
  createPaintedGroundTextures,
  createSkyboxMesh,
  createWaterShaderMaterial,
  createWoodTexture,
  groundHeightAt,
  simTo3D,
  WORLD_SCALE,
} from './world3d/texturesAndShaders';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  gravity: number;
  ring?: boolean;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface ProjectileVisual {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  fromPlayer: boolean;
  kind: 'arrow' | 'fire' | 'ice' | 'nature' | 'slash' | 'rock';
}

export interface GroundEffectVisual {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
  kind: 'ring' | 'aoe' | 'cone';
  angle?: number;
}

export interface RenderPlayerState {
  x: number;
  y: number;
  facing: number;
  walkCycle: number;
  swingAnim: number;
  dodgeTimer: number;
  parryTimer: number;
  riposteReady: boolean;
  hitFlash: number;
  mounted: boolean;
  mountKind?: 'horse' | 'ox' | 'stag' | 'warhorse' | 'direwolf';
  armorClass: ArmorClass;
  weaponArchetype: WeaponArchetype;
  offhandStyle?: OffhandStyle;
  shieldHp: number;
  hasCape: boolean;
  gatherChannelPct: number;
  mountChannelPct: number;
  name: string;
  hp: number;
  maxHp: number;
}

export interface AimPreview {
  skill: SkillDef;
  aimX: number;
  aimY: number;
  angle: number;
}

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
  } catch {
    return false;
  }
}

function simFacingToYaw(facing: number): number {
  // Simulation facing=0 points +X (cos, sin -> +X, +Z). Local 3D models face +Z.
  return Math.atan2(Math.cos(facing), Math.sin(facing));
}

function disposeObjectTree(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      // Keep shared primitive geometries? Only dispose non-shared geometries created per zone/rig if needed.
      // Safe to dispose all zone-owned meshes since terrain/water/structures/portals own unique geometries.
      if (mesh.userData.disposeGeo) {
        mesh.geometry.dispose();
      }
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.map && std.userData?.disposeTextures) std.map.dispose();
        if (std.bumpMap && std.userData?.disposeTextures) std.bumpMap.dispose();
        m.dispose();
      }
    }
  });
}

/**
 * 100% Procedural Stylized 3D Albion-Style WebGL Renderer (Three.js)
 * Features:
 * - PBR Hand-painted ground textures + displaced elevation + biome atmospheric skybox + FogExp2
 * - Custom GLSL animated water & molten lava shaders + GPU vertex wind-sway foliage
 * - Closer, slightly-behind 3/4 Albion perspective camera with smooth zoom & exact ground raycasting
 * - Articulated 3D character, weapons, offhands, mounts, village stations, bosses & wildlife
 * - Crisp projected 2D overlay canvas for floating damage numbers, HP bars, names & tier badges
 */
export class WorldRenderer3D {
  public readonly isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget;

  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D | null;
  private viewW = 1280;
  private viewH = 720;

  // Lighting & Atmosphere
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private skyMesh: THREE.Mesh | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;
  private windTimeUniform = { value: 0 };

  // Zone static containers
  private currentZoneId: ZoneId | null = null;
  private zoneGroup = new THREE.Group();
  private waterMaterials: THREE.ShaderMaterial[] = [];
  private portalMaterials: THREE.ShaderMaterial[] = [];
  private structureEntries = new Map<
    string,
    { group: THREE.Group; animPart?: THREE.Object3D; ringMesh: THREE.Mesh }
  >();
  private nodeEntries = new Map<
    string,
    { group: THREE.Group; ringMesh: THREE.Mesh; baseY: number; kind: ResourceNode['kind'] }
  >();
  private zoneTextures: THREE.Texture[] = [];

  // Dynamic actor containers
  private actorsGroup = new THREE.Group();
  private playerRig: HumanoidRig | null = null;
  private aiRigs = new Map<string, HumanoidRig>();
  private remoteRigs = new Map<string, HumanoidRig>();
  private enemyRigs = new Map<string, EnemyRig>();

  // Dynamic FX containers
  private fxGroup = new THREE.Group();
  private particleMesh: THREE.InstancedMesh;
  private moteMesh: THREE.InstancedMesh;
  private moteSeeds: { ox: number; oy: number; oz: number; phase: number; spd: number }[] = [];
  private projectilePool: THREE.Mesh[] = [];
  private telegraphPool: THREE.Mesh[] = [];
  private aimLineMesh: THREE.Mesh;
  private aimCircleMesh: THREE.Mesh;
  private fishingLine: THREE.Line;
  private fishingBobber: THREE.Group;

  // Camera smooth state
  private smoothZoom = 0.85;
  private smoothTarget = new THREE.Vector3(55, 1.2, 45);
  private smoothCamPos = new THREE.Vector3(59, 13, 59);
  private cameraInitialized = false;
  private lastGroundY = 0.18;

  // Pre-allocated scratch math (zero per-frame allocations)
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hitPoint = new THREE.Vector3();
  private readonly projVec = new THREE.Vector3();
  private readonly dummyObj = new THREE.Object3D();
  private readonly scratchColor = new THREE.Color();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly desiredCamPos = new THREE.Vector3();
  private readonly maxAniso: number;
  private readonly sharedWoodTex: THREE.CanvasTexture;

  constructor(glCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx = overlayCanvas.getContext('2d');
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      canvas: glCanvas,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAniso = this.isSoftwareGl ? 1 : Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xdccaa8, 0.0085);

    // RoomEnvironment IBL so steel armor, shields, weapons & iron veins gleam realistically
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = this.pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.65;

    // 36° FOV matches Albion Online's crisp 3/4 isometric-perspective landscape
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.4, 380);

    // Warm Golden-Afternoon Directional Sun (follows player for sharp shadows everywhere)
    this.sunLight = new THREE.DirectionalLight(0xffe4b0, 2.35);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(this.isSoftwareGl ? 512 : 2048, this.isSoftwareGl ? 512 : 2048);
    this.sunLight.shadow.camera.near = 6;
    this.sunLight.shadow.camera.far = 135;
    const d = 28;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.035;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Sky/Ground Hemisphere bounce + cool back-rim for figure separation
    this.hemiLight = new THREE.HemisphereLight(0x9ecbff, 0x7a6544, 0.92);
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(0xa3c9ff, 0.48);
    this.rimLight.position.set(-28, 22, -32);
    this.scene.add(this.rimLight);

    this.sharedWoodTex = createWoodTexture('#7c5230', '#4f3119', this.maxAniso);

    this.scene.add(this.zoneGroup);
    this.scene.add(this.actorsGroup);
    this.scene.add(this.fxGroup);

    // Fast single-draw-call InstancedMesh for combat & gather particles
    const partGeo = new THREE.OctahedronGeometry(0.18, 0);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(partGeo, partMat, 280);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = 0;
    this.fxGroup.add(this.particleMesh);

    // Sunlit drifting pollen / volcano ember ambient motes
    const moteGeo = new THREE.SphereGeometry(0.065, 5, 4);
    const moteMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c2,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.moteMesh = new THREE.InstancedMesh(moteGeo, moteMat, 72);
    this.moteMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.moteMesh.frustumCulled = false;
    for (let i = 0; i < 72; i++) {
      this.moteSeeds.push({
        ox: (Math.random() - 0.5) * 34,
        oy: 0.6 + Math.random() * 5.2,
        oz: (Math.random() - 0.5) * 34,
        phase: Math.random() * Math.PI * 2,
        spd: 0.5 + Math.random() * 0.9,
      });
    }
    this.fxGroup.add(this.moteMesh);

    // Aim Preview Ground Decals
    this.aimLineMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffe38a,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.aimLineMesh.rotation.x = -Math.PI / 2;
    this.aimLineMesh.visible = false;
    this.fxGroup.add(this.aimLineMesh);

    this.aimCircleMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.84, 1.0, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffe38a,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.aimCircleMesh.rotation.x = -Math.PI / 2;
    this.aimCircleMesh.visible = false;
    this.fxGroup.add(this.aimCircleMesh);

    // 3D Fishing Line + Bobber
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.fishingLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xf7f2e4, transparent: true, opacity: 0.85 }),
    );
    this.fishingLine.visible = false;
    this.fishingLine.frustumCulled = false;
    this.fxGroup.add(this.fishingLine);

    this.fishingBobber = new THREE.Group();
    const bobTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9382e, roughness: 0.4 }),
    );
    bobTop.position.y = 0.08;
    const bobBot = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf5efe6, roughness: 0.5 }),
    );
    bobBot.position.y = -0.05;
    const bobRing = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.42, 18),
      new THREE.MeshBasicMaterial({
        color: 0xd9f7ff,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    bobRing.rotation.x = -Math.PI / 2;
    this.fishingBobber.add(bobTop, bobBot, bobRing);
    this.fishingBobber.visible = false;
    this.fxGroup.add(this.fishingBobber);
  }

  public resize(width: number, height: number, renderScale = 1): void {
    this.viewW = Math.max(1, width);
    this.viewH = Math.max(1, height);

    const dpr = this.isSoftwareGl
      ? 1
      : Math.max(0.75, Math.min(2, (window.devicePixelRatio || 1) * renderScale));

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.viewW, this.viewH, false);

    this.camera.aspect = this.viewW / this.viewH;
    this.camera.updateProjectionMatrix();

    // Sync crisp 2D HUD overlay canvas
    const hudDpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlayCanvas.width = Math.max(1, Math.floor(this.viewW * hudDpr));
    this.overlayCanvas.height = Math.max(1, Math.floor(this.viewH * hudDpr));
    if (this.overlayCtx) {
      this.overlayCtx.setTransform(hudDpr, 0, 0, hudDpr, 0, 0);
    }
  }

  /**
   * Paces the main loop safely on software WebGL (using fenceSync) while running full 60 FPS rAF on GPU.
   */
  public scheduleNextFrame(cb: FrameRequestCallback): number {
    if (!this.isSoftwareGl) {
      return requestAnimationFrame(cb);
    }
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (!sync) {
          requestAnimationFrame(cb);
          return;
        }
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) {
          setTimeout(poll, 8);
        } else {
          gl.deleteSync(sync);
          requestAnimationFrame(cb);
        }
      };
      return window.setTimeout(poll, 4);
    }
    return requestAnimationFrame(cb);
  }

  /**
   * Projects screen pointer coordinates onto the 3D ground plane using true PerspectiveCamera raycasting,
   * returning exact simulation coordinates (simX, simY) at any zoom or angle.
   */
  public screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 1100, y: 920 };

    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.groundPlane.constant = -this.lastGroundY;

    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint)) {
      return {
        x: this.hitPoint.x / WORLD_SCALE,
        y: this.hitPoint.z / WORLD_SCALE,
      };
    }
    return {
      x: this.smoothTarget.x / WORLD_SCALE,
      y: this.smoothTarget.z / WORLD_SCALE,
    };
  }

  // ================= ZONE ENVIRONMENT BUILDER =================

  private rebuildZone(zone: ZoneConfig, nodes: ResourceNode[]): void {
    // Clean up previous zone meshes & textures
    while (this.zoneGroup.children.length > 0) {
      const child = this.zoneGroup.children[0];
      this.zoneGroup.remove(child);
      disposeObjectTree(child);
    }
    for (const tex of this.zoneTextures) tex.dispose();
    this.zoneTextures = [];
    this.waterMaterials = [];
    this.portalMaterials = [];
    this.structureEntries.clear();
    this.nodeEntries.clear();

    // Clear enemy rigs when changing zone
    for (const rig of this.enemyRigs.values()) {
      this.actorsGroup.remove(rig.root);
    }
    this.enemyRigs.clear();

    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      this.skyMat?.dispose();
      this.skyMesh = null;
      this.skyMat = null;
    }

    const atmo = BIOME_ATMOSPHERE[zone.id];
    this.currentZoneId = zone.id;

    // Atmosphere & Lighting
    this.scene.fog = new THREE.FogExp2(atmo.fogColor, atmo.fogDensity);
    this.sunLight.color.setHex(atmo.sunColor);
    this.sunLight.intensity = atmo.sunIntensity;
    this.hemiLight.color.setHex(atmo.hemiSky);
    this.hemiLight.groundColor.setHex(atmo.hemiGround);
    this.hemiLight.intensity = atmo.hemiIntensity;

    const sky = createSkyboxMesh(atmo);
    this.skyMesh = sky.mesh;
    this.skyMat = sky.material;
    this.scene.add(this.skyMesh);

    // Update ambient mote tint per biome
    const moteMat = this.moteMesh.material as THREE.MeshBasicMaterial;
    moteMat.color.setHex(zone.id === 'caldera' ? 0xff8b3d : 0xfff2c7);

    // 1. Displaced Hand-Painted Terrain Mesh extending far beyond playable borders
    const w3d = zone.width * WORLD_SCALE;
    const h3d = zone.height * WORLD_SCALE;
    const pad = 44; // 44m rolling mountain foothills around every edge
    const totalW = w3d + pad * 2;
    const totalH = h3d + pad * 2;
    const segX = 116;
    const segZ = 94;

    const terrainGeo = new THREE.PlaneGeometry(totalW, totalH, segX, segZ);
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);

    const grassCol = new THREE.Color(atmo.grassPrimary);
    const grass2Col = new THREE.Color(atmo.grassSecondary);
    const dirtCol = new THREE.Color(atmo.dirtColor);
    const rockCol = new THREE.Color(atmo.rockColor);
    const sandCol = new THREE.Color(zone.id === 'caldera' ? '#2c1c18' : '#c9b183');
    const tmpCol = new THREE.Color();

    const cx = w3d * 0.5;
    const cz = h3d * 0.5;

    for (let i = 0; i < posAttr.count; i++) {
      const wx = posAttr.getX(i) + cx;
      const wz = posAttr.getZ(i) + cz;
      const y = groundHeightAt(zone.id, wx, wz);
      posAttr.setXYZ(i, wx, y, wz);

      // Hand-painted biome vertex blending: grass variation, roads, beaches & perimeter cliffs
      const n = Math.sin(wx * 0.14 + 1.2) * Math.cos(wz * 0.13 - 0.6) * 0.5 + 0.5;
      tmpCol.copy(grassCol).lerp(grass2Col, n * 0.72);

      const simX = wx / WORLD_SCALE;
      const simY = wz / WORLD_SCALE;

      // Dirt trail blend leading from center toward portals & structures
      let roadWeight = 0;
      if (zone.id === 'oakhaven') {
        const dPlaza = Math.hypot(simX - 1100, simY - 900);
        if (dPlaza < 360) {
          roadWeight = Math.max(roadWeight, 1 - THREE.MathUtils.smoothstep(dPlaza, 210, 360));
        }
        // Main east-west & north-south village paths
        if (Math.abs(simY - 900) < 70 && simX > 650 && simX < zone.width - 60) {
          roadWeight = Math.max(roadWeight, 1 - Math.abs(simY - 900) / 70);
        }
        if (Math.abs(simX - 1100) < 68 && simY > 250 && simY < zone.height - 60) {
          roadWeight = Math.max(roadWeight, 1 - Math.abs(simX - 1100) / 68);
        }
      } else {
        // Organic dirt path near portals
        for (const pt of zone.portals) {
          const dp = Math.hypot(simX - pt.x, simY - pt.y);
          if (dp < 160) roadWeight = Math.max(roadWeight, (1 - dp / 160) * 0.85);
        }
      }
      if (roadWeight > 0) {
        tmpCol.lerp(dirtCol, Math.min(0.85, roadWeight * 0.85));
      }

      // Sandy shore / volcanic rim near water pools
      if (y < 0.05) {
        const shoreT = THREE.MathUtils.clamp((0.05 - y) / 0.55, 0, 1);
        tmpCol.lerp(sandCol, shoreT * 0.88);
      }

      // Rocky cliffs along elevated foothills
      if (y > 1.25) {
        const rockT = THREE.MathUtils.smoothstep(y, 1.25, 3.8);
        tmpCol.lerp(rockCol, rockT * 0.9);
      }

      // Keep brightness balanced so vertex colors multiply cleanly with painted albedo texture
      colors[i * 3] = Math.min(1, tmpCol.r * 1.35);
      colors[i * 3 + 1] = Math.min(1, tmpCol.g * 1.35);
      colors[i * 3 + 2] = Math.min(1, tmpCol.b * 1.35);
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const groundTex = createPaintedGroundTextures(zone, this.maxAniso);
    this.zoneTextures.push(groundTex.map, groundTex.bumpMap);

    const terrainMat = new THREE.MeshStandardMaterial({
      map: groundTex.map,
      bumpMap: groundTex.bumpMap,
      bumpScale: 0.14,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.userData.disposeGeo = true;
    this.zoneGroup.add(terrainMesh);

    // 2. Oakhaven Bastion Cobblestone Village Square
    if (zone.id === 'oakhaven') {
      const cobbleTex = createCobblestoneTexture(this.maxAniso);
      this.zoneTextures.push(cobbleTex.map, cobbleTex.bumpMap);
      const plazaGeo = new THREE.CircleGeometry(14.5, 44);
      plazaGeo.rotateX(-Math.PI / 2);
      const plazaMat = new THREE.MeshStandardMaterial({
        map: cobbleTex.map,
        bumpMap: cobbleTex.bumpMap,
        bumpScale: 0.18,
        roughness: 0.88,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const plaza = new THREE.Mesh(plazaGeo, plazaMat);
      const p3 = simTo3D(1100, 900);
      plaza.position.set(p3.x, 0.21, p3.z);
      plaza.receiveShadow = true;
      plaza.userData.disposeGeo = true;
      this.zoneGroup.add(plaza);

      // Decorative stone curb ring around village plaza
      const curbGeo = new THREE.RingGeometry(14.1, 14.8, 44);
      curbGeo.rotateX(-Math.PI / 2);
      const curb = new THREE.Mesh(
        curbGeo,
        new THREE.MeshStandardMaterial({ color: 0x8e8372, roughness: 0.9 }),
      );
      curb.position.set(p3.x, 0.23, p3.z);
      curb.receiveShadow = true;
      curb.userData.disposeGeo = true;
      this.zoneGroup.add(curb);
    }

    // 3. Animated GLSL Water & Molten Lava Pools
    for (const pool of zone.waterPools) {
      const isLava = Boolean(pool.isLava);
      const wMat = createWaterShaderMaterial(atmo, isLava);
      this.waterMaterials.push(wMat);
      const pGeo = new THREE.PlaneGeometry(pool.rx * WORLD_SCALE * 2.18, pool.ry * WORLD_SCALE * 2.18, 24, 24);
      pGeo.rotateX(-Math.PI / 2);
      const waterMesh = new THREE.Mesh(pGeo, wMat);
      const p3 = simTo3D(pool.x, pool.y);
      waterMesh.position.set(p3.x, isLava ? -0.18 : -0.14, p3.z);
      waterMesh.userData.disposeGeo = true;
      this.zoneGroup.add(waterMesh);
    }

    // 4. Village Structures (Central Vault Chest, Smelter, Forge, Hunter Lodge, Mage Spire, Alchemist, Market)
    for (const st of zone.structures) {
      const built = createVillageStructureMesh(st, this.sharedWoodTex);
      const p3 = simTo3D(st.x, st.y);
      const gy = groundHeightAt(zone.id, p3.x, p3.z);
      built.group.position.set(p3.x, gy, p3.z);
      this.zoneGroup.add(built.group);
      this.structureEntries.set(st.id, built);
    }

    // 5. Travel Portals (Carved Stone Arches + Swirling GLSL Vortex)
    for (const pt of zone.portals) {
      const built = createPortalMesh(pt);
      const p3 = simTo3D(pt.x, pt.y);
      const gy = groundHeightAt(zone.id, p3.x, p3.z);
      built.group.position.set(p3.x, gy, p3.z);
      // Orient portal toward center of zone so it faces the player invitingly
      built.group.rotation.y = Math.atan2(cx - p3.x, cz - p3.z);
      this.zoneGroup.add(built.group);
      this.portalMaterials.push(built.vortexMat);
    }

    // 6. All Interactive Resource Nodes (Trees, Iron/Copper/Steel/Mythril Ore, Stone, Fiber, Herbs, Fishing Shoals)
    for (const node of nodes) {
      const built = createResourceNodeMesh(node, this.sharedWoodTex, this.windTimeUniform);
      const p3 = simTo3D(node.x, node.y);
      const gy = node.kind === 'fish' ? -0.1 : groundHeightAt(zone.id, p3.x, p3.z);
      built.group.position.set(p3.x, gy, p3.z);
      this.zoneGroup.add(built.group);
      this.nodeEntries.set(node.id, {
        group: built.group,
        ringMesh: built.ringMesh,
        baseY: gy,
        kind: node.kind,
      });
    }

    // 7. Distant Horizon Framing: Instanced Peripheral Pines & Cliff Boulders outside playable edges
    this.buildPerimeterScenery(zone, w3d, h3d);
  }

  private buildPerimeterScenery(zone: ZoneConfig, w3d: number, h3d: number): void {
    const isVolcanic = zone.id === 'caldera';
    const rockCount = 90;
    const rockGeo = new THREE.DodecahedronGeometry(1.8, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: BIOME_ATMOSPHERE[zone.id].rockColor,
      roughness: 0.94,
      flatShading: true,
    });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rocks.userData.disposeGeo = true;
    rocks.receiveShadow = true;

    const treeCount = isVolcanic ? 0 : 120;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.48, 2.4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3e26, roughness: 0.92, flatShading: true });
    const crownGeo = new THREE.ConeGeometry(1.75, 4.4, 7);
    const crownMat = new THREE.MeshStandardMaterial({
      color: zone.id === 'crags' ? 0x5a6e42 : zone.id === 'glade' ? 0x29592d : 0x3b6e35,
      roughness: 0.85,
      flatShading: true,
    });

    const trunks = treeCount > 0 ? new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount) : null;
    const crowns = treeCount > 0 ? new THREE.InstancedMesh(crownGeo, crownMat, treeCount) : null;
    if (trunks) trunks.userData.disposeGeo = true;
    if (crowns) crowns.userData.disposeGeo = true;

    const samplePerimeterPos = (idx: number, minOut: number, maxOut: number) => {
      const side = idx % 4;
      const t = ((Math.sin(idx * 91.7 + 3.1) * 43758.5453) % 1 + 1) % 1;
      const out = minOut + (((Math.sin(idx * 47.3 + 7.9) * 19384.21) % 1 + 1) % 1) * (maxOut - minOut);
      let wx = 0;
      let wz = 0;
      if (side === 0) {
        wx = t * (w3d + out * 2) - out;
        wz = -out;
      } else if (side === 1) {
        wx = t * (w3d + out * 2) - out;
        wz = h3d + out;
      } else if (side === 2) {
        wx = -out;
        wz = t * h3d;
      } else {
        wx = w3d + out;
        wz = t * h3d;
      }
      return { wx, wz };
    };

    for (let i = 0; i < rockCount; i++) {
      const { wx, wz } = samplePerimeterPos(i + 17, 3.5, 28);
      const gy = groundHeightAt(zone.id, wx, wz);
      const sc = 0.85 + (i % 7) * 0.35;
      this.dummyObj.position.set(wx, gy + sc * 0.45, wz);
      this.dummyObj.rotation.set(i * 0.5, i * 1.1, i * 0.3);
      this.dummyObj.scale.set(sc * 1.3, sc * 0.95, sc * 1.15);
      this.dummyObj.updateMatrix();
      rocks.setMatrixAt(i, this.dummyObj.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    this.zoneGroup.add(rocks);

    if (trunks && crowns) {
      for (let i = 0; i < treeCount; i++) {
        const { wx, wz } = samplePerimeterPos(i + 101, 2.2, 24);
        const gy = groundHeightAt(zone.id, wx, wz);
        const sc = 0.9 + (i % 5) * 0.24;
        this.dummyObj.position.set(wx, gy + 1.1 * sc, wz);
        this.dummyObj.rotation.set(0, i * 1.7, 0);
        this.dummyObj.scale.set(sc, sc, sc);
        this.dummyObj.updateMatrix();
        trunks.setMatrixAt(i, this.dummyObj.matrix);

        this.dummyObj.position.set(wx, gy + 3.4 * sc, wz);
        this.dummyObj.scale.set(sc, sc, sc);
        this.dummyObj.updateMatrix();
        crowns.setMatrixAt(i, this.dummyObj.matrix);
      }
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      this.zoneGroup.add(trunks, crowns);
    }
  }

  // ================= MAIN PER-FRAME 3D RENDER + 2D HUD PROJECTION =================

  public render(
    elapsed: number,
    camSimX: number,
    camSimY: number,
    shakeX: number,
    shakeY: number,
    zone: ZoneConfig,
    nodes: ResourceNode[],
    enemies: EnemyEntity[],
    aiAdventurers: AiAdventurer[],
    remotePlayers: RemotePlayer[],
    player: RenderPlayerState,
    projectiles: ProjectileVisual[],
    groundEffects: GroundEffectVisual[],
    particles: Particle[],
    floatingTexts: FloatingText[],
    fishing: FishingState | null,
    aimPreview: AimPreview | null,
    nearbyHighlightId: string | null,
    settings: GameSettings,
    isTitleScreen: boolean,
  ): void {
    // 1. Rebuild static zone geometry when changing zones
    if (this.currentZoneId !== zone.id) {
      this.rebuildZone(zone, nodes);
      this.cameraInitialized = false;
    }

    // 2. Sync dynamic shaders & graphics toggles
    this.windTimeUniform.value = elapsed;
    if (this.skyMat) {
      this.skyMat.uniforms.uTime.value = elapsed;
      this.skyMat.uniforms.uWarmLighting.value = settings.warmLighting ? 1.0 : 0.35;
    }
    for (const wm of this.waterMaterials) wm.uniforms.uTime.value = elapsed;
    for (const pm of this.portalMaterials) pm.uniforms.uTime.value = elapsed;

    const wantShadows = !this.isSoftwareGl && settings.showShadows;
    if (this.renderer.shadowMap.enabled !== wantShadows) {
      this.renderer.shadowMap.enabled = wantShadows;
      this.sunLight.castShadow = wantShadows;
    }

    // Warm afternoon lighting toggle
    const atmo = BIOME_ATMOSPHERE[zone.id];
    this.sunLight.intensity = atmo.sunIntensity * (settings.warmLighting ? 1.0 : 0.82);

    // 3. Update Closer, Slightly-Behind Albion 3/4 Perspective Camera with Smooth Zoom
    const targetZoom = THREE.MathUtils.clamp(settings.cameraZoom ?? 0.85, 0.58, 1.55);
    this.smoothZoom += (targetZoom - this.smoothZoom) * 0.14;

    const focusSimX = isTitleScreen ? camSimX : player.x;
    const focusSimY = isTitleScreen ? camSimY : player.y;
    const f3 = simTo3D(focusSimX, focusSimY);
    const fy = groundHeightAt(zone.id, f3.x, f3.z);
    this.lastGroundY = fy;

    // Slight forward look-ahead along facing makes the landscape feel alive and Albion-authentic
    const lookAhead = isTitleScreen ? 0 : 0.55;
    this.desiredTarget.set(
      f3.x + Math.cos(player.facing) * lookAhead + shakeX * 0.025,
      fy + 1.05,
      f3.z + Math.sin(player.facing) * lookAhead + shakeY * 0.025,
    );

    // Closer & slightly behind 3/4 angle: zooming closer lowers camera height slightly more for horizon depth
    const z = this.smoothZoom;
    const offsetX = 4.2 * z;
    const offsetY = 13.8 * Math.pow(z, 1.12);
    const offsetZ = 16.4 * z;

    if (isTitleScreen) {
      const orbitA = elapsed * 0.14;
      this.desiredCamPos.set(
        this.desiredTarget.x + Math.sin(orbitA) * 18,
        fy + 11.5,
        this.desiredTarget.z + Math.cos(orbitA) * 18,
      );
    } else {
      this.desiredCamPos.set(
        this.desiredTarget.x + offsetX,
        this.desiredTarget.y + offsetY,
        this.desiredTarget.z + offsetZ,
      );
    }

    if (!this.cameraInitialized) {
      this.smoothTarget.copy(this.desiredTarget);
      this.smoothCamPos.copy(this.desiredCamPos);
      this.cameraInitialized = true;
    } else {
      this.smoothTarget.lerp(this.desiredTarget, 0.16);
      this.smoothCamPos.lerp(this.desiredCamPos, 0.16);
    }

    this.camera.position.copy(this.smoothCamPos);
    this.camera.lookAt(this.smoothTarget);

    // Keep Skybox dome centered on camera & Sun shadow frustum centered on player
    if (this.skyMesh) {
      this.skyMesh.position.copy(this.camera.position);
    }
    this.sunLight.position.set(
      this.smoothTarget.x + atmo.sunPos[0] * 0.58,
      this.smoothTarget.y + atmo.sunPos[1] * 0.65,
      this.smoothTarget.z + atmo.sunPos[2] * 0.58,
    );
    this.sunLight.target.position.copy(this.smoothTarget);
    this.sunLight.target.updateMatrixWorld();

    // 4. Animate Village Structures & Highlight Nearby Station/Chest
    for (const st of zone.structures) {
      const entry = this.structureEntries.get(st.id);
      if (!entry) continue;
      if (entry.animPart) {
        entry.animPart.rotation.y = elapsed * (st.kind === 'mage' ? 0.9 : 0.45);
        entry.animPart.position.y =
          st.kind === 'alchemist' ? 1.38 + Math.sin(elapsed * 4.5) * 0.04 : Math.sin(elapsed * 2) * 0.12;
      }
      const rMat = entry.ringMesh.material as THREE.MeshBasicMaterial;
      const isHi = nearbyHighlightId === st.id;
      rMat.opacity = isHi ? 0.65 + Math.sin(elapsed * 6) * 0.2 : 0.14;
      rMat.color.setHex(isHi ? 0xffe38a : 0xd4a857);
    }

    // 5. Sync Resource Nodes (Depleted shrink/hide, Highlight pulse, Fishing fish circle)
    for (const node of nodes) {
      const entry = this.nodeEntries.get(node.id);
      if (!entry) continue;
      const alive = node.charges > 0;
      const isHi = alive && nearbyHighlightId === node.id;

      if (node.kind === 'fish') {
        entry.group.visible = alive;
        if (alive) {
          entry.group.rotation.y = elapsed * 0.7 + node.seed;
        }
      } else {
        entry.group.visible = true;
        const sc = alive ? 1.0 : 0.26;
        entry.group.scale.set(sc, alive ? 1.0 : 0.16, sc);
      }

      const rMat = entry.ringMesh.material as THREE.MeshBasicMaterial;
      rMat.opacity = isHi ? 0.7 + Math.sin(elapsed * 7) * 0.2 : 0;
    }

    // 6. Sync Player 3D Rig
    this.syncPlayerRig(zone.id, player, elapsed);

    // 7. Sync AI Adventurers & Remote Players
    this.syncAdventurerRigs(zone.id, aiAdventurers, remotePlayers, elapsed);

    // 8. Sync Wildlife, Monsters & World Bosses
    this.syncEnemyRigs(zone.id, enemies, elapsed);

    // 9. Sync 3D Projectiles, Ground Spell FX, Enemy Telegraphs & Aim Preview
    this.syncProjectiles(zone.id, projectiles, elapsed);
    this.syncTelegraphsAndEffects(zone.id, enemies, groundEffects, aimPreview, player, elapsed);

    // 10. Sync 3D Instanced Particles & Sunlit Ambient Motes
    this.syncParticlesAndMotes(zone.id, particles, elapsed, settings);

    // 11. Sync 3D Fishing Line & Bobber
    this.syncFishingVisual(zone.id, player, fishing, elapsed);

    // 12. Render 3D WebGL Scene!
    this.renderer.render(this.scene, this.camera);

    // 13. Render Crisp 2D Projected World Labels, HP Bars & Floating Damage Numbers
    if (!isTitleScreen) {
      this.renderScreenSpaceOverlay(
        zone,
        nodes,
        enemies,
        aiAdventurers,
        remotePlayers,
        player,
        floatingTexts,
        nearbyHighlightId,
        settings,
      );
    } else if (this.overlayCtx) {
      this.overlayCtx.clearRect(0, 0, this.viewW, this.viewH);
    }
  }

  private syncPlayerRig(zoneId: ZoneId, player: RenderPlayerState, elapsed: number): void {
    const sig = `${player.armorClass}|${player.weaponArchetype}|${player.offhandStyle ?? 'none'}|${player.hasCape}|${player.mounted}|${player.mountKind ?? ''}|`;
    if (!this.playerRig || this.playerRig.signature !== sig) {
      if (this.playerRig) {
        this.actorsGroup.remove(this.playerRig.root);
      }
      this.playerRig = createHumanoidRig({
        armorClass: player.armorClass,
        weaponArchetype: player.weaponArchetype,
        offhandStyle: player.offhandStyle,
        hasCape: player.hasCape,
        mounted: player.mounted,
        mountKind: player.mountKind,
        isPlayer: true,
      });
      this.actorsGroup.add(this.playerRig.root);
    }

    const rig = this.playerRig;
    const p3 = simTo3D(player.x, player.y);
    const gy = groundHeightAt(zoneId, p3.x, p3.z);
    rig.root.position.set(p3.x, gy, p3.z);
    rig.root.rotation.y = simFacingToYaw(player.facing);

    // Animate walk stride, mount gallop, weapon slash, dodge somersault, cape & offhand VFX
    const stride = Math.sin(player.walkCycle * 10);
    const isDodging = player.dodgeTimer > 0;

    if (isDodging) {
      const t = 1 - player.dodgeTimer / 0.32;
      rig.bodyPivot.rotation.x = t * Math.PI * 2;
      rig.bodyPivot.position.y = (player.mounted ? 1.0 : 0) + Math.sin(t * Math.PI) * 0.7;
    } else {
      rig.bodyPivot.rotation.x = 0;
      const baseY = player.mounted ? (player.mountKind === 'direwolf' ? 0.82 : 1.05) : 0;
      rig.bodyPivot.position.y = baseY + Math.abs(stride) * (player.mounted ? 0.08 : 0.05);
    }

    if (player.mounted && rig.mountLegs) {
      rig.leftLeg.rotation.x = -0.35;
      rig.rightLeg.rotation.x = -0.35;
      rig.mountLegs[0].rotation.x = stride * 0.65;
      rig.mountLegs[1].rotation.x = -stride * 0.65;
      rig.mountLegs[2].rotation.x = -stride * 0.65;
      rig.mountLegs[3].rotation.x = stride * 0.65;
    } else {
      rig.leftLeg.rotation.x = stride * 0.58;
      rig.rightLeg.rotation.x = -stride * 0.58;
    }

    // Right arm weapon swing + idle breathing
    const swing = player.swingAnim > 0 ? Math.sin(player.swingAnim * Math.PI) : 0;
    rig.rightArm.rotation.x = -0.25 - swing * 1.45 - stride * 0.25;
    rig.rightArm.rotation.z = swing * 0.45;
    rig.leftArm.rotation.x = player.parryTimer > 0 ? -1.15 : stride * 0.25;

    if (rig.capeMesh) {
      rig.capeMesh.rotation.x = 0.14 + Math.abs(stride) * 0.22 + Math.sin(elapsed * 3.5) * 0.05;
    }
    if (rig.orbMesh) {
      rig.orbMesh.rotation.y = elapsed * 2.4;
      rig.orbMesh.position.y = 0.28 + Math.sin(elapsed * 4) * 0.08;
    }
    if (rig.torchFlame) {
      const f = 0.85 + Math.sin(elapsed * 16) * 0.22;
      rig.torchFlame.scale.set(0.18 * f, 0.34 * f, 0.18 * f);
    }
    if (rig.shieldDome) {
      rig.shieldDome.visible = player.shieldHp > 0;
      if (rig.shieldDome.visible) {
        rig.shieldDome.rotation.y = elapsed * 1.2;
      }
    }
    if (rig.parryArc) {
      rig.parryArc.visible = player.parryTimer > 0 || player.riposteReady;
      const mat = rig.parryArc.material as THREE.MeshBasicMaterial;
      mat.color.setHex(player.parryTimer > 0 ? 0xffe38a : 0xff9a38);
      mat.opacity = player.parryTimer > 0 ? 0.85 : 0.45 + Math.sin(elapsed * 10) * 0.2;
    }
  }

  private syncAdventurerRigs(
    zoneId: ZoneId,
    aiAdventurers: AiAdventurer[],
    remotePlayers: RemotePlayer[],
    elapsed: number,
  ): void {
    const activeAi = new Set<string>();
    for (const ai of aiAdventurers) {
      if (ai.zoneId !== zoneId) continue;
      activeAi.add(ai.id);
      const sig = `${ai.armorClass}|${ai.weaponArchetype}|none|true|${ai.mounted}|horse|${ai.primaryColor}`;
      let rig = this.aiRigs.get(ai.id);
      if (!rig || rig.signature !== sig) {
        if (rig) this.actorsGroup.remove(rig.root);
        rig = createHumanoidRig({
          armorClass: ai.armorClass,
          weaponArchetype: ai.weaponArchetype,
          hasCape: true,
          mounted: ai.mounted,
          mountKind: 'horse',
          primaryColor: ai.primaryColor,
          cloakColor: ai.cloakColor,
        });
        this.actorsGroup.add(rig.root);
        this.aiRigs.set(ai.id, rig);
      }
      const p3 = simTo3D(ai.x, ai.y);
      const gy = groundHeightAt(zoneId, p3.x, p3.z);
      rig.root.position.set(p3.x, gy, p3.z);
      rig.root.rotation.y = simFacingToYaw(ai.facing);
      const walk = Math.sin(elapsed * 7 + p3.x) * (ai.waitTimer <= 0 ? 0.55 : 0.08);
      rig.leftLeg.rotation.x = walk;
      rig.rightLeg.rotation.x = -walk;
      if (rig.mountLegs) {
        rig.mountLegs[0].rotation.x = walk;
        rig.mountLegs[1].rotation.x = -walk;
        rig.mountLegs[2].rotation.x = -walk;
        rig.mountLegs[3].rotation.x = walk;
      }
    }
    for (const [id, rig] of this.aiRigs) {
      if (!activeAi.has(id)) {
        this.actorsGroup.remove(rig.root);
        this.aiRigs.delete(id);
      }
    }

    const activeRem = new Set<string>();
    for (const rp of remotePlayers) {
      if (rp.zoneId !== zoneId) continue;
      activeRem.add(rp.id);
      const sig = `${rp.armorClass}|${rp.weaponArchetype}|none|true|${rp.mounted}|horse|`;
      let rig = this.remoteRigs.get(rp.id);
      if (!rig || rig.signature !== sig) {
        if (rig) this.actorsGroup.remove(rig.root);
        rig = createHumanoidRig({
          armorClass: rp.armorClass,
          weaponArchetype: rp.weaponArchetype,
          hasCape: true,
          mounted: rp.mounted,
          mountKind: 'horse',
          cloakColor: '#2d7d9a',
        });
        this.actorsGroup.add(rig.root);
        this.remoteRigs.set(rp.id, rig);
      }
      const p3 = simTo3D(rp.x, rp.y);
      const gy = groundHeightAt(zoneId, p3.x, p3.z);
      rig.root.position.set(p3.x, gy, p3.z);
      rig.root.rotation.y = simFacingToYaw(rp.facing);
    }
    for (const [id, rig] of this.remoteRigs) {
      if (!activeRem.has(id)) {
        this.actorsGroup.remove(rig.root);
        this.remoteRigs.delete(id);
      }
    }
  }

  private syncEnemyRigs(zoneId: ZoneId, enemies: EnemyEntity[], elapsed: number): void {
    const activeIds = new Set<string>();
    for (const en of enemies) {
      activeIds.add(en.id);
      let rig = this.enemyRigs.get(en.id);
      if (!rig) {
        rig = createEnemyRig(en);
        this.actorsGroup.add(rig.root);
        this.enemyRigs.set(en.id, rig);
      }

      if (en.state === 'dead') {
        rig.root.visible = false;
        continue;
      }
      rig.root.visible = true;

      const p3 = simTo3D(en.x, en.y);
      const gy = groundHeightAt(zoneId, p3.x, p3.z);
      rig.root.position.set(p3.x, gy, p3.z);
      rig.root.rotation.y = simFacingToYaw(en.facing);

      const isCarcass = en.state === 'carcass';
      rig.bodyGroup.visible = !isCarcass;
      rig.carcassGroup.visible = isCarcass;

      if (!isCarcass) {
        const speedMag = Math.hypot(en.vx, en.vy);
        const walkPhase = elapsed * (speedMag > 25 ? 9 : 2.2) + en.homeX * 0.1;
        const amp = speedMag > 25 ? 0.55 : 0.06;

        for (let i = 0; i < rig.limbs.length; i++) {
          const sign = i % 2 === 0 ? 1 : -1;
          rig.limbs[i].rotation.x = Math.sin(walkPhase) * amp * sign;
        }
        if (rig.wings) {
          const flap = Math.sin(elapsed * (en.isBoss ? 5.5 : 13) + en.homeY) * (en.isBoss ? 0.35 : 0.65);
          rig.wings[0].rotation.z = flap;
          rig.wings[1].rotation.z = -flap;
        }

        // Boss windup crouch/rear & stagger wobble
        if (en.state === 'windup') {
          const pulse = 1 + Math.sin(elapsed * 22) * 0.06;
          rig.bodyGroup.scale.set(pulse, 1.08, pulse);
        } else if (en.state === 'staggered') {
          rig.bodyGroup.rotation.z = Math.sin(elapsed * 26) * 0.18;
          rig.bodyGroup.scale.set(1, 1, 1);
        } else {
          rig.bodyGroup.rotation.z = 0;
          rig.bodyGroup.scale.set(1, 1, 1);
        }

        // Hit flash subtle pop
        if (en.hitFlash > 0) {
          rig.bodyGroup.position.y = 0.12;
        } else {
          rig.bodyGroup.position.y = en.species === 'bird' ? Math.sin(elapsed * 6 + en.homeX) * 0.18 : 0;
        }
      }
    }

    for (const [id, rig] of this.enemyRigs) {
      if (!activeIds.has(id)) {
        this.actorsGroup.remove(rig.root);
        this.enemyRigs.delete(id);
      }
    }
  }

  private syncProjectiles(zoneId: ZoneId, projectiles: ProjectileVisual[], elapsed: number): void {
    while (this.projectilePool.length < projectiles.length) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      this.fxGroup.add(m);
      this.projectilePool.push(m);
    }

    for (let i = 0; i < this.projectilePool.length; i++) {
      const mesh = this.projectilePool[i];
      if (i >= projectiles.length) {
        mesh.visible = false;
        continue;
      }
      const p = projectiles[i];
      mesh.visible = true;
      const p3 = simTo3D(p.x, p.y);
      const gy = groundHeightAt(zoneId, p3.x, p3.z);
      mesh.position.set(p3.x, gy + 1.05, p3.z);
      const ang = Math.atan2(p.vy, p.vx);
      mesh.rotation.y = simFacingToYaw(ang);
      mesh.rotation.z = elapsed * 8;

      if (p.kind === 'arrow') {
        mesh.scale.set(0.32, 0.32, 2.4);
      } else if (p.kind === 'slash') {
        mesh.scale.set(2.4, 0.3, 1.0);
      } else {
        const s = Math.max(0.65, p.radius * WORLD_SCALE * 0.9);
        mesh.scale.set(s, s, s);
      }
      (mesh.material as THREE.MeshBasicMaterial).color.set(p.color);
    }
  }

  private syncTelegraphsAndEffects(
    zoneId: ZoneId,
    enemies: EnemyEntity[],
    groundEffects: GroundEffectVisual[],
    aimPreview: AimPreview | null,
    player: RenderPlayerState,
    elapsed: number,
  ): void {
    // Gather all ground discs/rings needed this frame
    const items: {
      x: number;
      z: number;
      y: number;
      radius: number;
      color: string;
      opacity: number;
    }[] = [];

    // 1. Enemy Windup Danger Telegraphs (crisp red Albion danger rings!)
    for (const e of enemies) {
      if (e.state !== 'windup') continue;
      const p3 = simTo3D(e.x, e.y);
      const gy = groundHeightAt(zoneId, p3.x, p3.z);
      const pct = 1 - Math.max(0, e.stateTimer / Math.max(0.1, e.windupDuration));
      const r = (e.windupType === 'aoe' ? e.windupRadius : e.attackRange) * WORLD_SCALE;
      items.push({
        x: p3.x,
        z: p3.z,
        y: gy + 0.08,
        radius: Math.max(0.9, r * (0.45 + pct * 0.55)),
        color: '#ff3b2e',
        opacity: 0.28 + pct * 0.38,
      });
    }

    // 2. Active Spell / Combat Ground Effects
    for (const fx of groundEffects) {
      const p3 = simTo3D(fx.x, fx.y);
      const gy = groundHeightAt(zoneId, p3.x, p3.z);
      const t = Math.max(0, fx.life / Math.max(0.01, fx.maxLife));
      items.push({
        x: p3.x,
        z: p3.z,
        y: gy + 0.1,
        radius: fx.radius * WORLD_SCALE * (fx.kind === 'ring' ? 1.15 - t * 0.3 : 1),
        color: fx.color,
        opacity: t * 0.52,
      });
    }

    while (this.telegraphPool.length < items.length) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(1, 28),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      this.fxGroup.add(m);
      this.telegraphPool.push(m);
    }

    for (let i = 0; i < this.telegraphPool.length; i++) {
      const m = this.telegraphPool[i];
      if (i >= items.length) {
        m.visible = false;
        continue;
      }
      const it = items[i];
      m.visible = true;
      m.position.set(it.x, it.y, it.z);
      m.scale.set(it.radius, it.radius, 1);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(it.color);
      mat.opacity = it.opacity;
    }

    // 3. Skill-Shot Drag Aim Preview Decal
    if (aimPreview) {
      const p3 = simTo3D(player.x, player.y);
      const a3 = simTo3D(aimPreview.aimX, aimPreview.aimY);
      const gy = groundHeightAt(zoneId, p3.x, p3.z);
      const skill = aimPreview.skill;

      if (skill.aimType === 'aoe') {
        this.aimLineMesh.visible = false;
        this.aimCircleMesh.visible = true;
        const r = Math.max(1.2, skill.radius * WORLD_SCALE);
        this.aimCircleMesh.position.set(a3.x, groundHeightAt(zoneId, a3.x, a3.z) + 0.12, a3.z);
        this.aimCircleMesh.scale.set(r, r, 1);
        (this.aimCircleMesh.material as THREE.MeshBasicMaterial).color.set(skill.color);
      } else {
        this.aimCircleMesh.visible = false;
        this.aimLineMesh.visible = true;
        const len = Math.max(2.5, skill.range * WORLD_SCALE);
        const wid = skill.aimType === 'cone' ? len * 0.72 : Math.max(0.85, skill.radius * WORLD_SCALE * 1.4);
        const midX = p3.x + Math.cos(aimPreview.angle) * (len * 0.5);
        const midZ = p3.z + Math.sin(aimPreview.angle) * (len * 0.5);
        this.aimLineMesh.position.set(midX, gy + 0.12, midZ);
        this.aimLineMesh.rotation.set(-Math.PI / 2, 0, -aimPreview.angle + Math.PI / 2);
        this.aimLineMesh.scale.set(wid, len, 1);
        (this.aimLineMesh.material as THREE.MeshBasicMaterial).color.set(skill.color);
        (this.aimLineMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(elapsed * 10) * 0.1;
      }
    } else {
      this.aimLineMesh.visible = false;
      this.aimCircleMesh.visible = false;
    }
  }

  private syncParticlesAndMotes(
    zoneId: ZoneId,
    particles: Particle[],
    elapsed: number,
    settings: GameSettings,
  ): void {
    const count = Math.min(particles.length, 280);
    this.particleMesh.count = count;

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const p3 = simTo3D(p.x, p.y);
      const gy = groundHeightAt(zoneId, p3.x, p3.z);
      const t = Math.max(0, p.life / Math.max(0.01, p.maxLife));
      const arcY = gy + 0.45 + Math.sin((1 - t) * Math.PI) * 1.1;
      const sc = Math.max(0.08, p.size * 0.095 * t);

      this.dummyObj.position.set(p3.x, arcY, p3.z);
      this.dummyObj.rotation.set(elapsed * 4 + i, elapsed * 3, 0);
      this.dummyObj.scale.set(sc, sc, sc);
      this.dummyObj.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummyObj.matrix);

      this.scratchColor.set(p.color);
      this.particleMesh.setColorAt(i, this.scratchColor);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // Drifting golden sunlit motes / volcanic embers around camera focus
    const wantMotes = settings.warmLighting && settings.graphicsQuality !== 'low';
    this.moteMesh.visible = wantMotes;
    if (wantMotes) {
      const moteCount = settings.graphicsQuality === 'medium' ? 32 : 64;
      this.moteMesh.count = moteCount;
      for (let i = 0; i < moteCount; i++) {
        const s = this.moteSeeds[i];
        const mx = this.smoothTarget.x + ((s.ox + elapsed * s.spd * 0.6 + 51) % 34) - 17;
        const mz = this.smoothTarget.z + ((s.oz + Math.sin(elapsed * 0.4 + s.phase) * 2 + 51) % 34) - 17;
        const my = this.lastGroundY + s.oy + Math.sin(elapsed * 1.4 + s.phase) * 0.45;
        const pulse = 0.65 + Math.sin(elapsed * 2.5 + s.phase) * 0.35;
        this.dummyObj.position.set(mx, my, mz);
        this.dummyObj.rotation.set(0, 0, 0);
        this.dummyObj.scale.setScalar(pulse);
        this.dummyObj.updateMatrix();
        this.moteMesh.setMatrixAt(i, this.dummyObj.matrix);
      }
      this.moteMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private syncFishingVisual(
    zoneId: ZoneId,
    player: RenderPlayerState,
    fishing: FishingState | null,
    elapsed: number,
  ): void {
    if (!fishing || !fishing.active) {
      this.fishingLine.visible = false;
      this.fishingBobber.visible = false;
      return;
    }
    const p3 = simTo3D(player.x, player.y);
    const b3 = simTo3D(fishing.bobberX, fishing.bobberY);
    const py = groundHeightAt(zoneId, p3.x, p3.z) + 1.55;
    const dip = fishing.phase === 'bite' ? -0.18 + Math.sin(elapsed * 24) * 0.08 : Math.sin(elapsed * 4) * 0.05;
    const by = -0.1 + dip;

    this.fishingBobber.visible = true;
    this.fishingBobber.position.set(b3.x, by, b3.z);

    this.fishingLine.visible = true;
    const pos = this.fishingLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, p3.x + Math.cos(player.facing) * 0.7, py, p3.z + Math.sin(player.facing) * 0.7);
    pos.setXYZ(1, (p3.x + b3.x) * 0.5, (py + by) * 0.5 + 0.55, (p3.z + b3.z) * 0.5);
    pos.setXYZ(2, b3.x, by + 0.14, b3.z);
    pos.needsUpdate = true;
  }

  // ================= CRISP 2D SCREEN-SPACE PROJECTED OVERLAY =================

  private projectToScreen(wx: number, wy: number, wz: number): { x: number; y: number; visible: boolean } {
    this.projVec.set(wx, wy, wz).project(this.camera);
    const visible = this.projVec.z >= -1 && this.projVec.z <= 1;
    return {
      x: (this.projVec.x * 0.5 + 0.5) * this.viewW,
      y: (-this.projVec.y * 0.5 + 0.5) * this.viewH,
      visible,
    };
  }

  private renderScreenSpaceOverlay(
    zone: ZoneConfig,
    nodes: ResourceNode[],
    enemies: EnemyEntity[],
    aiAdventurers: AiAdventurer[],
    remotePlayers: RemotePlayer[],
    player: RenderPlayerState,
    floatingTexts: FloatingText[],
    nearbyHighlightId: string | null,
    settings: GameSettings,
  ): void {
    const ctx = this.overlayCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    // 1. Village Structure Names & Portals
    ctx.textAlign = 'center';
    for (const st of zone.structures) {
      const p3 = simTo3D(st.x, st.y);
      const gy = groundHeightAt(zone.id, p3.x, p3.z);
      const sp = this.projectToScreen(p3.x, gy + (st.kind === 'mage' ? 5.6 : 3.9), p3.z);
      if (!sp.visible || sp.x < -80 || sp.x > this.viewW + 80 || sp.y < -40 || sp.y > this.viewH + 40) continue;

      const isHi = nearbyHighlightId === st.id;
      ctx.font = '700 12px Inter, sans-serif';
      const w = ctx.measureText(st.name).width + 18;
      ctx.fillStyle = isHi ? 'rgba(42, 30, 14, 0.92)' : 'rgba(22, 17, 13, 0.78)';
      ctx.beginPath();
      ctx.roundRect(sp.x - w / 2, sp.y - 12, w, 21, 5);
      ctx.fill();
      ctx.strokeStyle = isHi ? '#FFE38A' : 'rgba(212, 168, 87, 0.45)';
      ctx.lineWidth = isHi ? 1.5 : 1;
      ctx.stroke();
      ctx.fillStyle = isHi ? '#FFE38A' : '#F5EFE6';
      ctx.fillText(st.name, sp.x, sp.y + 3);
    }

    for (const pt of zone.portals) {
      const p3 = simTo3D(pt.x, pt.y);
      const gy = groundHeightAt(zone.id, p3.x, p3.z);
      const sp = this.projectToScreen(p3.x, gy + 4.7, p3.z);
      if (!sp.visible || sp.x < -80 || sp.x > this.viewW + 80 || sp.y < -40 || sp.y > this.viewH + 40) continue;

      ctx.font = '700 12px Inter, sans-serif';
      const label = `${pt.label} (${pt.recommendedTier})`;
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = 'rgba(20, 15, 12, 0.82)';
      ctx.beginPath();
      ctx.roundRect(sp.x - w / 2, sp.y - 11, w, 20, 5);
      ctx.fill();
      ctx.fillStyle = pt.risk === 'high_risk' ? '#FF9488' : pt.risk === 'contested' ? '#FFE38A' : '#8CF59E';
      ctx.fillText(label, sp.x, sp.y + 3);
    }

    // 2. Resource Node Tier Badges (T1–T5) near player
    if (settings.showResourceLabels) {
      ctx.font = '700 10px "JetBrains Mono", monospace';
      for (const node of nodes) {
        if (node.charges <= 0) continue;
        const dist = Math.hypot(node.x - player.x, node.y - player.y);
        if (dist > 340) continue;
        const p3 = simTo3D(node.x, node.y);
        const gy = node.kind === 'fish' ? 0 : groundHeightAt(zone.id, p3.x, p3.z);
        const sp = this.projectToScreen(p3.x, gy + 0.15, p3.z);
        if (!sp.visible) continue;

        const isHi = nearbyHighlightId === node.id;
        const tpl = ITEM_TEMPLATES[node.dropTemplateId];
        const tag = isHi && tpl ? `T${node.tier} ${tpl.name}` : `T${node.tier}`;
        const tw = ctx.measureText(tag).width + 10;
        ctx.fillStyle = isHi ? 'rgba(42, 30, 14, 0.9)' : 'rgba(22, 17, 13, 0.72)';
        ctx.beginPath();
        ctx.roundRect(sp.x - tw / 2, sp.y + 8, tw, 16, 4);
        ctx.fill();
        ctx.fillStyle = isHi ? '#FFE38A' : '#E5D5B8';
        ctx.fillText(tag, sp.x, sp.y + 19);
      }
    }

    // 3. Enemies, Wildlife, World Bosses HP Bars & Skinnable Tags
    for (const en of enemies) {
      if (en.state === 'dead') continue;
      const dist = Math.hypot(en.x - player.x, en.y - player.y);
      if (dist > 540) continue;

      const p3 = simTo3D(en.x, en.y);
      const gy = groundHeightAt(zone.id, p3.x, p3.z);
      const heightOffset = en.state === 'carcass' ? 0.9 : en.isBoss ? 4.8 : 2.35;
      const sp = this.projectToScreen(p3.x, gy + heightOffset, p3.z);
      if (!sp.visible || sp.x < -80 || sp.x > this.viewW + 80 || sp.y < -40 || sp.y > this.viewH + 40) continue;

      if (en.state === 'carcass') {
        if (!en.skinned && en.skinTemplateId) {
          ctx.font = '700 10px Inter, sans-serif';
          const lbl = `SKIN T${en.tier}`;
          const tw = ctx.measureText(lbl).width + 12;
          ctx.fillStyle = 'rgba(42, 30, 14, 0.88)';
          ctx.beginPath();
          ctx.roundRect(sp.x - tw / 2, sp.y - 10, tw, 17, 4);
          ctx.fill();
          ctx.fillStyle = '#FFE38A';
          ctx.fillText(lbl, sp.x, sp.y + 2);
        }
        continue;
      }

      const barW = en.isBoss ? 86 : 48;
      const barH = en.isBoss ? 7 : 5;
      const pct = Math.max(0, Math.min(1, en.hp / Math.max(1, en.maxHp)));

      ctx.fillStyle = 'rgba(18, 12, 10, 0.82)';
      ctx.fillRect(sp.x - barW / 2 - 1, sp.y - 1, barW + 2, barH + 2);
      ctx.fillStyle = en.isBoss ? '#E89B3C' : en.aggressiveOnProximity ? '#D94E41' : '#D4A857';
      ctx.fillRect(sp.x - barW / 2, sp.y, barW * pct, barH);

      if (en.isBoss || dist < 300 || en.hp < en.maxHp) {
        ctx.font = en.isBoss ? '700 12px Inter, sans-serif' : '600 10px Inter, sans-serif';
        ctx.fillStyle = en.isBoss ? '#FFE38A' : '#F5EFE6';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 3;
        ctx.fillText(`T${en.tier} ${en.name}`, sp.x, sp.y - 5);
        ctx.shadowBlur = 0;
      }
    }

    // 4. AI Adventurers & Remote Player Nameplates
    ctx.font = '600 10px Inter, sans-serif';
    for (const ai of aiAdventurers) {
      if (ai.zoneId !== zone.id) continue;
      if (Math.hypot(ai.x - player.x, ai.y - player.y) > 480) continue;
      const p3 = simTo3D(ai.x, ai.y);
      const gy = groundHeightAt(zone.id, p3.x, p3.z);
      const sp = this.projectToScreen(p3.x, gy + (ai.mounted ? 3.5 : 2.55), p3.z);
      if (!sp.visible) continue;
      ctx.fillStyle = 'rgba(20, 16, 12, 0.72)';
      const txt = `${ai.name} · ${ai.title}`;
      const w = ctx.measureText(txt).width + 12;
      ctx.beginPath();
      ctx.roundRect(sp.x - w / 2, sp.y - 10, w, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#D8E8F5';
      ctx.fillText(txt, sp.x, sp.y + 2);
    }

    for (const rp of remotePlayers) {
      if (rp.zoneId !== zone.id) continue;
      const p3 = simTo3D(rp.x, rp.y);
      const gy = groundHeightAt(zone.id, p3.x, p3.z);
      const sp = this.projectToScreen(p3.x, gy + (rp.mounted ? 3.5 : 2.55), p3.z);
      if (!sp.visible) continue;
      ctx.fillStyle = '#8CF59E';
      ctx.fillText(`${rp.name} (Lv.${rp.level})`, sp.x, sp.y);
    }

    // 5. Player World Channel Bar (Gathering / Skinning / Summoning Mount)
    const chPct = player.gatherChannelPct > 0 ? player.gatherChannelPct : player.mountChannelPct;
    if (chPct > 0) {
      const p3 = simTo3D(player.x, player.y);
      const gy = groundHeightAt(zone.id, p3.x, p3.z);
      const sp = this.projectToScreen(p3.x, gy + (player.mounted ? 3.8 : 2.9), p3.z);
      if (sp.visible) {
        const bw = 64;
        ctx.fillStyle = 'rgba(18, 14, 11, 0.88)';
        ctx.fillRect(sp.x - bw / 2 - 1, sp.y - 4, bw + 2, 8);
        ctx.fillStyle = '#FFE38A';
        ctx.fillRect(sp.x - bw / 2, sp.y - 3, bw * Math.min(1, chPct), 6);
      }
    }

    // 6. Floating Damage, Crit, Parry & Loot Numbers
    if (settings.showDamageNumbers) {
      for (const ft of floatingTexts) {
        const p3 = simTo3D(ft.x, ft.y);
        const gy = groundHeightAt(zone.id, p3.x, p3.z);
        const age = 1 - ft.life / Math.max(0.01, ft.maxLife);
        const sp = this.projectToScreen(p3.x, gy + 2.3 + age * 1.45, p3.z);
        if (!sp.visible) continue;

        ctx.save();
        ctx.globalAlpha = Math.min(1, (ft.life / Math.max(0.01, ft.maxLife)) * 1.4);
        ctx.font = `800 ${Math.round(ft.size + 1)}px "JetBrains Mono", Inter, sans-serif`;
        ctx.strokeStyle = 'rgba(14, 10, 8, 0.92)';
        ctx.lineWidth = 3.5;
        ctx.strokeText(ft.text, sp.x, sp.y);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, sp.x, sp.y);
        ctx.restore();
      }
    }
  }

  public dispose(): void {
    while (this.zoneGroup.children.length > 0) {
      const c = this.zoneGroup.children[0];
      this.zoneGroup.remove(c);
      disposeObjectTree(c);
    }
    for (const tex of this.zoneTextures) tex.dispose();
    this.sharedWoodTex.dispose();
    this.skyMesh?.geometry.dispose();
    this.skyMat?.dispose();
    this.envRT.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
