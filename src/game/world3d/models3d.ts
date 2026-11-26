import * as THREE from 'three';
import {
  ArmorClass,
  EnemyEntity,
  OffhandStyle,
  ResourceNode,
  VillageStructure,
  WeaponArchetype,
  ZonePortal,
} from '../types';
import {
  applyWindSwayToMaterial,
  createPortalVortexMaterial,
  WORLD_SCALE,
} from './texturesAndShaders';

export interface HumanoidRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  capeMesh?: THREE.Object3D;
  mountGroup?: THREE.Group;
  mountLegs?: THREE.Object3D[];
  orbMesh?: THREE.Object3D;
  torchFlame?: THREE.Object3D;
  shieldDome?: THREE.Mesh;
  parryArc?: THREE.Mesh;
  signature: string;
}

export interface EnemyRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  limbs: THREE.Object3D[];
  wings?: THREE.Object3D[];
  carcassGroup: THREE.Group;
  shadowDisc: THREE.Mesh;
  hpFill?: THREE.Mesh;
}

const sharedGeo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  octa: new THREE.OctahedronGeometry(0.5, 0),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.1, 8, 18),
  disc: new THREE.CircleGeometry(1, 18),
};

function makeMat(
  color: number | string,
  opts: {
    roughness?: number;
    metalness?: number;
    emissive?: number | string;
    emissiveIntensity?: number;
    flatShading?: boolean;
    transparent?: boolean;
    opacity?: number;
    map?: THREE.Texture;
    side?: THREE.Side;
  } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.08,
    emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: opts.flatShading ?? true,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    map: opts.map,
    side: opts.side ?? THREE.FrontSide,
  });
}

function addPart(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number],
  scale: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  castShadow = true,
  receiveShadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  parent.add(m);
  return m;
}

/**
 * Creates a soft contact shadow disc grounded flush at y = 0.03 to anchor actors visually.
 */
export function createContactShadowDisc(radius: number, opacity = 0.42): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1a140e,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const m = new THREE.Mesh(sharedGeo.disc, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.035;
  m.scale.set(radius, radius, 1);
  return m;
}

// ================= ARTICULATED 3D HUMANOID, WEAPONS, OFFHANDS & MOUNTS =================

function buildWeaponMesh(arch: WeaponArchetype): THREE.Group {
  const g = new THREE.Group();
  const steelMat = makeMat(0xcfd8e3, { metalness: 0.85, roughness: 0.22 });
  const darkIron = makeMat(0x464e56, { metalness: 0.78, roughness: 0.35 });
  const goldMat = makeMat(0xe5a93c, { metalness: 0.86, roughness: 0.24 });
  const woodMat = makeMat(0x6e482b, { roughness: 0.86, metalness: 0.02 });

  if (arch === 'sword') {
    addPart(g, sharedGeo.cyl, woodMat, [0, -0.05, 0], [0.06, 0.28, 0.06]);
    addPart(g, sharedGeo.box, goldMat, [0, 0.1, 0], [0.34, 0.06, 0.08]);
    addPart(g, sharedGeo.box, steelMat, [0, 0.56, 0], [0.1, 0.86, 0.04]);
    addPart(g, sharedGeo.cone, steelMat, [0, 1.08, 0], [0.1, 0.2, 0.05]);
  } else if (arch === 'greataxe') {
    addPart(g, sharedGeo.cyl, woodMat, [0, 0.32, 0], [0.07, 1.35, 0.07]);
    addPart(g, sharedGeo.box, darkIron, [0, 0.82, 0], [0.14, 0.34, 0.12]);
    addPart(g, sharedGeo.box, steelMat, [0.22, 0.84, 0], [0.32, 0.42, 0.05], [0, 0, -0.15]);
    addPart(g, sharedGeo.box, steelMat, [-0.22, 0.84, 0], [0.32, 0.42, 0.05], [0, 0, 0.15]);
  } else if (arch === 'hammer') {
    addPart(g, sharedGeo.cyl, woodMat, [0, 0.3, 0], [0.075, 1.25, 0.075]);
    addPart(g, sharedGeo.box, darkIron, [0, 0.86, 0], [0.56, 0.3, 0.3]);
    addPart(g, sharedGeo.box, goldMat, [0, 0.86, 0], [0.6, 0.08, 0.32]);
  } else if (arch === 'spear') {
    addPart(g, sharedGeo.cyl, woodMat, [0, 0.48, 0], [0.055, 1.85, 0.055]);
    addPart(g, sharedGeo.box, goldMat, [0, 1.38, 0], [0.11, 0.08, 0.11]);
    addPart(g, sharedGeo.cone, steelMat, [0, 1.58, 0], [0.12, 0.38, 0.06]);
  } else if (arch === 'daggers') {
    addPart(g, sharedGeo.cyl, woodMat, [0, 0, 0], [0.05, 0.2, 0.05]);
    addPart(g, sharedGeo.box, goldMat, [0, 0.12, 0], [0.18, 0.04, 0.06]);
    addPart(g, sharedGeo.cone, steelMat, [0, 0.38, 0], [0.08, 0.52, 0.035]);
  } else if (arch === 'bow') {
    const bowWood = makeMat(0x8c5c30, { roughness: 0.78 });
    const bowArc = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 6, 14, Math.PI * 1.15), bowWood);
    bowArc.rotation.z = -Math.PI * 0.58;
    bowArc.position.set(0, 0.25, 0.12);
    bowArc.castShadow = true;
    g.add(bowArc);
    addPart(g, sharedGeo.cyl, makeMat(0xe8e0cf, { roughness: 0.9 }), [0, 0.25, -0.05], [0.015, 1.1, 0.015], [0, 0, 0], false);
  } else {
    // Fire, Frost, or Nature Staff
    const crystalColor =
      arch === 'fire_staff' ? 0xff752b : arch === 'frost_staff' ? 0x70d4ff : 0x5ce07d;
    addPart(g, sharedGeo.cyl, woodMat, [0, 0.42, 0], [0.06, 1.65, 0.06]);
    addPart(g, sharedGeo.torus, goldMat, [0, 1.24, 0], [0.22, 0.22, 0.22], [Math.PI / 2, 0, 0]);
    const gemMat = makeMat(crystalColor, {
      emissive: crystalColor,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.1,
    });
    addPart(g, sharedGeo.octa, gemMat, [0, 1.38, 0], [0.26, 0.34, 0.26]);
  }
  return g;
}

function buildOffhandMesh(
  style: OffhandStyle,
): { group: THREE.Group; orbMesh?: THREE.Object3D; torchFlame?: THREE.Object3D } {
  const g = new THREE.Group();
  const steel = makeMat(0x8fa0b2, { metalness: 0.8, roughness: 0.28 });
  const gold = makeMat(0xe5a93c, { metalness: 0.85, roughness: 0.22 });
  const wood = makeMat(0x6e4729, { roughness: 0.85 });

  if (style === 'shield') {
    addPart(g, sharedGeo.box, makeMat(0x2f4e73, { metalness: 0.55, roughness: 0.38 }), [0, 0, 0.14], [0.56, 0.72, 0.08]);
    addPart(g, sharedGeo.box, gold, [0, 0, 0.17], [0.62, 0.78, 0.04]);
    addPart(g, sharedGeo.octa, gold, [0, 0.04, 0.2], [0.16, 0.16, 0.1]);
  } else if (style === 'buckler') {
    addPart(g, sharedGeo.cyl, steel, [0, 0, 0.14], [0.46, 0.07, 0.46], [Math.PI / 2, 0, 0]);
    addPart(g, sharedGeo.sphere, gold, [0, 0, 0.19], [0.18, 0.18, 0.1]);
  } else if (style === 'torch') {
    addPart(g, sharedGeo.cyl, wood, [0, 0.12, 0.08], [0.06, 0.56, 0.06]);
    addPart(g, sharedGeo.cyl, makeMat(0x47423e, { metalness: 0.6 }), [0, 0.42, 0.08], [0.14, 0.1, 0.14]);
    const flameMat = makeMat(0xff9838, {
      emissive: 0xff6b1a,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    const flame = addPart(g, sharedGeo.cone, flameMat, [0, 0.62, 0.08], [0.18, 0.34, 0.18], [0, 0, 0], false);
    return { group: g, torchFlame: flame };
  } else if (style === 'dirk') {
    addPart(g, sharedGeo.cyl, wood, [0, -0.04, 0.08], [0.045, 0.18, 0.045]);
    addPart(g, sharedGeo.box, gold, [0, 0.08, 0.08], [0.16, 0.04, 0.05]);
    addPart(g, sharedGeo.cone, steel, [0, 0.34, 0.08], [0.08, 0.48, 0.035]);
  } else if (style === 'tome') {
    addPart(g, sharedGeo.box, makeMat(0x523185, { roughness: 0.55 }), [0, 0.08, 0.12], [0.34, 0.42, 0.1], [0.25, 0.2, 0]);
    addPart(g, sharedGeo.box, makeMat(0xf5e8c8, { roughness: 0.9 }), [0.02, 0.08, 0.12], [0.29, 0.37, 0.11], [0.25, 0.2, 0]);
    addPart(g, sharedGeo.box, gold, [0, 0.08, 0.18], [0.12, 0.16, 0.02], [0.25, 0.2, 0]);
  } else if (style === 'orb') {
    const orbGroup = new THREE.Group();
    orbGroup.position.set(0.05, 0.28, 0.18);
    const orbMat = makeMat(0x88e6ff, {
      emissive: 0x3ec5ff,
      emissiveIntensity: 1.2,
      roughness: 0.1,
      metalness: 0.2,
    });
    addPart(orbGroup, sharedGeo.sphere, orbMat, [0, 0, 0], [0.28, 0.28, 0.28], [0, 0, 0], false);
    addPart(orbGroup, sharedGeo.torus, gold, [0, 0, 0], [0.36, 0.36, 0.36], [0.6, 0.4, 0], false);
    g.add(orbGroup);
    return { group: g, orbMesh: orbGroup };
  }
  return { group: g };
}

function buildMountMesh(kind: 'horse' | 'ox' | 'stag' | 'warhorse' | 'direwolf'): {
  group: THREE.Group;
  legs: THREE.Object3D[];
} {
  const g = new THREE.Group();
  const bodyColors: Record<typeof kind, number> = {
    horse: 0x7d4f2c,
    ox: 0x5c4433,
    stag: 0x996d3f,
    warhorse: 0x3f434a,
    direwolf: 0x4b5159,
  };
  const bodyMat = makeMat(bodyColors[kind], { roughness: 0.8 });
  const darkMat = makeMat(0x2a211c, { roughness: 0.9 });
  const saddleMat = makeMat(kind === 'warhorse' ? 0xb53a30 : 0x5e341c, { roughness: 0.72 });
  const metalMat = makeMat(0xbec9d6, { metalness: 0.82, roughness: 0.26 });

  const bodyScale: [number, number, number] =
    kind === 'ox'
      ? [0.95, 0.85, 1.55]
      : kind === 'direwolf'
      ? [0.68, 0.58, 1.48]
      : [0.74, 0.72, 1.52];
  const bodyY = kind === 'direwolf' ? 0.74 : 0.96;

  // Barrel torso & saddle
  addPart(g, sharedGeo.box, bodyMat, [0, bodyY, 0], bodyScale);
  addPart(g, sharedGeo.box, saddleMat, [0, bodyY + bodyScale[1] * 0.45, -0.05], [bodyScale[0] * 1.05, 0.16, 0.62]);

  // Neck & Head (facing +Z locally)
  const neckY = bodyY + 0.35;
  addPart(g, sharedGeo.box, bodyMat, [0, neckY, 0.66], [0.34, 0.62, 0.36], [0.42, 0, 0]);
  addPart(g, sharedGeo.box, bodyMat, [0, neckY + 0.28, 0.92], [0.3, 0.28, 0.54], [0.18, 0, 0]);

  // Tail
  addPart(g, sharedGeo.cone, darkMat, [0, bodyY - 0.1, -0.82], [0.18, 0.65, 0.18], [-0.5, 0, 0]);

  if (kind === 'warhorse') {
    addPart(g, sharedGeo.box, metalMat, [0, neckY + 0.32, 0.96], [0.34, 0.24, 0.48], [0.18, 0, 0]);
    addPart(g, sharedGeo.box, metalMat, [0, bodyY + 0.04, 0.58], [0.8, 0.52, 0.42]);
  } else if (kind === 'stag') {
    const antlerMat = makeMat(0xdfceb0, { roughness: 0.72 });
    addPart(g, sharedGeo.cyl, antlerMat, [-0.18, neckY + 0.64, 0.84], [0.05, 0.52, 0.05], [0.2, 0, 0.48]);
    addPart(g, sharedGeo.cyl, antlerMat, [0.18, neckY + 0.64, 0.84], [0.05, 0.52, 0.05], [0.2, 0, -0.48]);
    addPart(g, sharedGeo.cyl, antlerMat, [-0.34, neckY + 0.82, 0.88], [0.04, 0.3, 0.04], [0, 0, 0.9]);
    addPart(g, sharedGeo.cyl, antlerMat, [0.34, neckY + 0.82, 0.88], [0.04, 0.3, 0.04], [0, 0, -0.9]);
  } else if (kind === 'ox') {
    const hornMat = makeMat(0xe8dec6, { roughness: 0.65 });
    addPart(g, sharedGeo.cone, hornMat, [-0.28, neckY + 0.38, 0.94], [0.1, 0.42, 0.1], [0, 0, 1.1]);
    addPart(g, sharedGeo.cone, hornMat, [0.28, neckY + 0.38, 0.94], [0.1, 0.42, 0.1], [0, 0, -1.1]);
  } else if (kind === 'direwolf') {
    addPart(g, sharedGeo.cone, bodyMat, [-0.12, neckY + 0.46, 0.86], [0.1, 0.22, 0.1]);
    addPart(g, sharedGeo.cone, bodyMat, [0.12, neckY + 0.46, 0.86], [0.1, 0.22, 0.1]);
  }

  // 4 Articulated Legs
  const legs: THREE.Object3D[] = [];
  const legPositions: [number, number, number][] = [
    [-bodyScale[0] * 0.38, bodyY - 0.18, 0.5],
    [bodyScale[0] * 0.38, bodyY - 0.18, 0.5],
    [-bodyScale[0] * 0.38, bodyY - 0.18, -0.5],
    [bodyScale[0] * 0.38, bodyY - 0.18, -0.5],
  ];
  const legH = bodyY - 0.12;
  for (const [lx, ly, lz] of legPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, ly, lz);
    addPart(pivot, sharedGeo.box, bodyMat, [0, -legH * 0.48, 0], [0.16, legH, 0.16]);
    addPart(pivot, sharedGeo.box, darkMat, [0, -legH + 0.06, 0], [0.18, 0.14, 0.18]);
    g.add(pivot);
    legs.push(pivot);
  }
  return { group: g, legs };
}

export function createHumanoidRig(opts: {
  armorClass: ArmorClass;
  weaponArchetype: WeaponArchetype;
  offhandStyle?: OffhandStyle;
  hasCape: boolean;
  mounted: boolean;
  mountKind?: 'horse' | 'ox' | 'stag' | 'warhorse' | 'direwolf';
  primaryColor?: string;
  cloakColor?: string;
  isPlayer?: boolean;
}): HumanoidRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();

  // Contact shadow disc
  root.add(createContactShadowDisc(opts.mounted ? 1.08 : 0.64, 0.44));

  let mountGroup: THREE.Group | undefined;
  let mountLegs: THREE.Object3D[] | undefined;
  if (opts.mounted) {
    const mount = buildMountMesh(opts.mountKind ?? 'horse');
    mountGroup = mount.group;
    mountLegs = mount.legs;
    root.add(mountGroup);
    bodyPivot.position.y = opts.mountKind === 'direwolf' ? 0.82 : 1.05;
    bodyPivot.position.z = -0.05;
  }

  root.add(bodyPivot);

  const armorColors: Record<ArmorClass, { main: number; trim: number; rough: number; metal: number }> = {
    plate: { main: 0x9aa8b8, trim: 0xe5a93c, rough: 0.28, metal: 0.78 },
    leather: { main: 0x7f512c, trim: 0x486e42, rough: 0.78, metal: 0.08 },
    cloth: { main: 0x455b9e, trim: 0xe5b84b, rough: 0.88, metal: 0.12 },
  };
  const pal = armorColors[opts.armorClass];
  const armorMat = makeMat(opts.primaryColor ?? pal.main, {
    roughness: pal.rough,
    metalness: pal.metal,
  });
  const trimMat = makeMat(pal.trim, { roughness: 0.35, metalness: 0.65 });
  const skinMat = makeMat(0xe5b894, { roughness: 0.82 });
  const bootMat = makeMat(opts.armorClass === 'plate' ? 0x6c7785 : 0x3b281c, {
    roughness: opts.armorClass === 'plate' ? 0.35 : 0.85,
    metalness: opts.armorClass === 'plate' ? 0.7 : 0.05,
  });

  // Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.18, 0.72, 0);
  addPart(leftLeg, sharedGeo.box, bootMat, [0, -0.34, 0], [0.22, 0.68, 0.24]);
  bodyPivot.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.18, 0.72, 0);
  addPart(rightLeg, sharedGeo.box, bootMat, [0, -0.34, 0], [0.22, 0.68, 0.24]);
  bodyPivot.add(rightLeg);

  // Torso & Armor Silhouettes
  addPart(bodyPivot, sharedGeo.box, armorMat, [0, 1.06, 0], [0.62, 0.74, 0.38]);
  addPart(bodyPivot, sharedGeo.box, trimMat, [0, 0.78, 0], [0.66, 0.12, 0.42]); // Belt/waistband

  if (opts.armorClass === 'plate') {
    addPart(bodyPivot, sharedGeo.box, armorMat, [-0.42, 1.36, 0], [0.28, 0.22, 0.34], [0, 0, 0.22]);
    addPart(bodyPivot, sharedGeo.box, armorMat, [0.42, 1.36, 0], [0.28, 0.22, 0.34], [0, 0, -0.22]);
    addPart(bodyPivot, sharedGeo.box, trimMat, [0, 1.15, 0.2], [0.22, 0.34, 0.04]);
  } else if (opts.armorClass === 'cloth') {
    // Flowing mage robe skirt
    addPart(bodyPivot, sharedGeo.cyl, armorMat, [0, 0.45, 0], [0.66, 0.65, 0.46]);
    addPart(bodyPivot, sharedGeo.box, trimMat, [0, 0.96, 0.2], [0.16, 0.56, 0.04]);
  } else {
    // Leather ranger shoulder pad & strap
    addPart(bodyPivot, sharedGeo.box, trimMat, [-0.38, 1.34, 0], [0.24, 0.18, 0.3]);
    addPart(bodyPivot, sharedGeo.box, trimMat, [0, 1.08, 0.2], [0.64, 0.1, 0.04], [0, 0, 0.55]);
  }

  // Head & Helmet
  addPart(bodyPivot, sharedGeo.sphere, skinMat, [0, 1.62, 0], [0.42, 0.44, 0.42]);
  if (opts.armorClass === 'plate') {
    addPart(bodyPivot, sharedGeo.box, armorMat, [0, 1.68, 0], [0.46, 0.44, 0.48]);
    addPart(bodyPivot, sharedGeo.box, makeMat(0x1f252b, { roughness: 0.4 }), [0, 1.66, 0.23], [0.34, 0.08, 0.04]);
    addPart(bodyPivot, sharedGeo.box, trimMat, [0, 1.94, -0.02], [0.09, 0.18, 0.44]); // Helmet crest
  } else if (opts.armorClass === 'cloth') {
    addPart(bodyPivot, sharedGeo.cyl, armorMat, [0, 1.78, 0], [0.74, 0.06, 0.74]);
    addPart(bodyPivot, sharedGeo.cone, armorMat, [0, 2.08, -0.04], [0.46, 0.58, 0.46], [-0.18, 0, 0]);
    addPart(bodyPivot, sharedGeo.torus, trimMat, [0, 1.82, 0], [0.24, 0.24, 0.24], [Math.PI / 2, 0, 0]);
  } else {
    // Leather ranger hood / cowl
    addPart(bodyPivot, sharedGeo.sphere, armorMat, [0, 1.7, -0.04], [0.48, 0.44, 0.5]);
    addPart(bodyPivot, sharedGeo.cone, trimMat, [0, 1.84, -0.24], [0.28, 0.32, 0.28], [-0.85, 0, 0]);
  }

  // Cape
  let capeMesh: THREE.Object3D | undefined;
  if (opts.hasCape) {
    const capePivot = new THREE.Group();
    capePivot.position.set(0, 1.38, -0.22);
    const capeMat = makeMat(opts.cloakColor ?? (opts.isPlayer ? '#a63329' : '#3d5e7a'), {
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    addPart(capePivot, sharedGeo.box, capeMat, [0, -0.46, -0.05], [0.58, 0.92, 0.05], [0.16, 0, 0]);
    bodyPivot.add(capePivot);
    capeMesh = capePivot;
  }

  // Right Arm + Main Weapon
  const rightArm = new THREE.Group();
  rightArm.position.set(0.42, 1.32, 0);
  addPart(rightArm, sharedGeo.box, armorMat, [0, -0.26, 0], [0.18, 0.54, 0.18]);
  const wpn = buildWeaponMesh(opts.weaponArchetype);
  wpn.position.set(0, -0.5, 0.24);
  wpn.rotation.x = Math.PI * 0.42;
  rightArm.add(wpn);
  bodyPivot.add(rightArm);

  // Left Arm + Offhand (Shield, Buckler, Torch, Dirk, Tome, Orb)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.42, 1.32, 0);
  addPart(leftArm, sharedGeo.box, armorMat, [0, -0.26, 0], [0.18, 0.54, 0.18]);
  let orbMesh: THREE.Object3D | undefined;
  let torchFlame: THREE.Object3D | undefined;
  if (opts.offhandStyle) {
    const off = buildOffhandMesh(opts.offhandStyle);
    off.group.position.set(-0.06, -0.36, 0.12);
    leftArm.add(off.group);
    orbMesh = off.orbMesh;
    torchFlame = off.torchFlame;
  }
  bodyPivot.add(leftArm);

  // Player-only Armor Shield Bubble & Parry Counter Ward Arc
  let shieldDome: THREE.Mesh | undefined;
  let parryArc: THREE.Mesh | undefined;
  if (opts.isPlayer) {
    const domeMat = new THREE.MeshBasicMaterial({
      color: 0x7dd4e8,
      transparent: true,
      opacity: 0.26,
      wireframe: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    shieldDome = new THREE.Mesh(new THREE.SphereGeometry(1.22, 16, 12), domeMat);
    shieldDome.position.y = 1.15;
    shieldDome.visible = false;
    root.add(shieldDome);

    const parryMat = new THREE.MeshBasicMaterial({
      color: 0xffe38a,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    parryArc = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 8, 22, Math.PI * 1.1), parryMat);
    parryArc.rotation.x = Math.PI / 2;
    parryArc.rotation.z = -Math.PI * 0.05;
    parryArc.position.y = 1.05;
    parryArc.visible = false;
    root.add(parryArc);
  }

  const signature = `${opts.armorClass}|${opts.weaponArchetype}|${opts.offhandStyle ?? 'none'}|${opts.hasCape}|${opts.mounted}|${opts.mountKind ?? ''}|${opts.primaryColor ?? ''}`;

  return {
    root,
    bodyPivot,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    capeMesh,
    mountGroup,
    mountLegs,
    orbMesh,
    torchFlame,
    shieldDome,
    parryArc,
    signature,
  };
}

// ================= COMPOSITE 3D VILLAGE BUILDINGS & CENTRAL STORAGE CHEST =================

export function createVillageStructureMesh(
  st: VillageStructure,
  woodTex: THREE.Texture,
): { group: THREE.Group; animPart?: THREE.Object3D; ringMesh: THREE.Mesh } {
  const g = new THREE.Group();
  const r = st.radius * WORLD_SCALE;
  const stoneMat = makeMat(0x7c7469, { roughness: 0.92, metalness: 0.04 });
  const darkStone = makeMat(0x4f4943, { roughness: 0.94 });
  const timberMat = makeMat(0x7d5533, { map: woodTex, roughness: 0.86 });
  const roofMat = makeMat(st.color, { roughness: 0.78 });
  const accentMat = makeMat(st.accent, { metalness: 0.65, roughness: 0.32 });

  // Ground selection/highlight ring (glows when player is near)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffe38a,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(r * 0.96, r * 1.1, 28), ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.06;
  g.add(ringMesh);

  let animPart: THREE.Object3D | undefined;

  if (st.kind === 'village_chest') {
    // Grand Oakhaven Central Vault Chest on carved octagonal stone plinth + twin glowing braziers!
    addPart(g, new THREE.CylinderGeometry(r * 0.92, r * 1.04, 0.38, 8), stoneMat, [0, 0.19, 0], [1, 1, 1]);
    addPart(g, new THREE.CylinderGeometry(r * 0.68, r * 0.74, 0.24, 8), darkStone, [0, 0.48, 0], [1, 1, 1]);

    // Ornate Oak & Gold Vault Chest
    addPart(g, sharedGeo.box, timberMat, [0, 1.05, 0], [2.1, 0.92, 1.35]);
    addPart(g, new THREE.CylinderGeometry(0.68, 0.68, 2.12, 10, 1, false, 0, Math.PI), timberMat, [0, 1.5, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
    // Gilded iron bands & clasp
    addPart(g, sharedGeo.box, accentMat, [-0.68, 1.24, 0], [0.16, 1.18, 1.44]);
    addPart(g, sharedGeo.box, accentMat, [0.68, 1.24, 0], [0.16, 1.18, 1.44]);
    addPart(g, sharedGeo.box, accentMat, [0, 1.42, 0.72], [0.34, 0.36, 0.12]);

    // Twin flanking glowing braziers
    for (const bx of [-1.75, 1.75]) {
      addPart(g, sharedGeo.cyl, darkStone, [bx, 0.72, 0.8], [0.38, 0.9, 0.38]);
      const ember = makeMat(0xff9a38, { emissive: 0xff6d1c, emissiveIntensity: 1.5 });
      addPart(g, sharedGeo.cone, ember, [bx, 1.32, 0.8], [0.36, 0.48, 0.36], [0, 0, 0], false);
    }
    const vaultGlow = new THREE.PointLight(0xffb85c, 2.8, 12, 1.6);
    vaultGlow.position.set(0, 2.5, 0.4);
    g.add(vaultGlow);
  } else if (st.kind === 'smelter') {
    // Stone Blast Furnace & Chimney with glowing molten hearth
    addPart(g, new THREE.CylinderGeometry(r * 0.95, r * 1.02, 0.25, 8), darkStone, [0, 0.125, 0], [1, 1, 1]);
    addPart(g, sharedGeo.box, stoneMat, [0, 1.3, -0.35], [2.4, 2.2, 1.9]);
    addPart(g, new THREE.CylinderGeometry(0.55, 0.82, 2.4, 8), darkStone, [0, 3.2, -0.45], [1, 1, 1]);
    const fireMat = makeMat(0xff7d2b, { emissive: 0xff5214, emissiveIntensity: 1.7 });
    addPart(g, sharedGeo.box, fireMat, [0, 0.82, 0.62], [1.1, 0.78, 0.18], [0, 0, 0], false);
    // Stacked iron/copper ingot pallets
    addPart(g, sharedGeo.box, accentMat, [1.5, 0.42, 0.7], [0.75, 0.34, 0.55]);
    addPart(g, sharedGeo.box, makeMat(0xb8c5d4, { metalness: 0.85, roughness: 0.25 }), [-1.45, 0.42, 0.68], [0.75, 0.32, 0.55]);
    const glow = new THREE.PointLight(0xff7733, 2.4, 10, 1.8);
    glow.position.set(0, 1.3, 1.2);
    g.add(glow);
  } else if (st.kind === 'blacksmith') {
    // Timber Forge Pavilion + Anvil + Coal Hearth
    addPart(g, new THREE.CylinderGeometry(r * 0.96, r * 1.02, 0.24, 8), darkStone, [0, 0.12, 0], [1, 1, 1]);
    for (const [px, pz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) {
      addPart(g, sharedGeo.cyl, timberMat, [px, 1.35, pz], [0.22, 2.4, 0.22]);
    }
    addPart(g, new THREE.ConeGeometry(2.65, 1.45, 4), roofMat, [0, 3.15, 0], [1, 1, 1], [0, Math.PI / 4, 0]);
    // Iron anvil on stump
    addPart(g, sharedGeo.cyl, timberMat, [0.4, 0.52, 0.55], [0.48, 0.56, 0.48]);
    addPart(g, sharedGeo.box, makeMat(0x3a4047, { metalness: 0.82, roughness: 0.35 }), [0.4, 0.94, 0.55], [0.85, 0.32, 0.42]);
    // Glowing forge hearth
    addPart(g, sharedGeo.box, stoneMat, [-0.85, 0.72, -0.45], [1.2, 1.0, 0.95]);
    addPart(g, sharedGeo.box, makeMat(0xff6b24, { emissive: 0xff5214, emissiveIntensity: 1.5 }), [-0.85, 1.24, -0.45], [0.85, 0.16, 0.65], [0, 0, 0], false);
  } else if (st.kind === 'hunter') {
    // Hunter's Lodge with Hide Tent Canopy & Tanning Rack
    addPart(g, new THREE.CylinderGeometry(r * 0.92, r, 0.2, 8), makeMat(0x6b563c, { roughness: 0.95 }), [0, 0.1, 0], [1, 1, 1]);
    addPart(g, new THREE.ConeGeometry(2.35, 2.4, 6), roofMat, [-0.2, 1.75, -0.2], [1, 1, 1]);
    addPart(g, sharedGeo.box, timberMat, [-0.2, 0.75, -0.2], [2.2, 1.1, 1.9]);
    // Hide drying rack
    addPart(g, sharedGeo.cyl, timberMat, [1.35, 0.9, 0.75], [0.12, 1.5, 0.12]);
    addPart(g, sharedGeo.cyl, timberMat, [2.1, 0.9, 0.25], [0.12, 1.5, 0.12]);
    addPart(g, sharedGeo.box, makeMat(0xc49258, { roughness: 0.85 }), [1.72, 0.92, 0.5], [0.82, 0.78, 0.08], [0, -0.58, 0]);
  } else if (st.kind === 'mage') {
    // Octagonal Wizard Spire + Conical Slate Roof + Orbiting Arcane Rune Ring
    addPart(g, new THREE.CylinderGeometry(1.45, 1.72, 3.0, 8), stoneMat, [0, 1.5, 0], [1, 1, 1]);
    addPart(g, new THREE.ConeGeometry(1.95, 2.15, 8), roofMat, [0, 4.05, 0], [1, 1, 1]);
    const crystalMat = makeMat(0x9ce5ff, { emissive: 0x5bc8ff, emissiveIntensity: 1.4, roughness: 0.15 });
    const crystal = addPart(g, sharedGeo.octa, crystalMat, [0, 5.55, 0], [0.55, 0.82, 0.55], [0, 0, 0], false);
    const ring = addPart(g, sharedGeo.torus, accentMat, [0, 3.25, 0], [3.6, 3.6, 1.2], [Math.PI / 2, 0, 0], false);
    const animGrp = new THREE.Group();
    animGrp.add(crystal, ring);
    g.add(animGrp);
    animPart = animGrp;
    const glow = new THREE.PointLight(0x88c9ff, 2.2, 12, 1.6);
    glow.position.set(0, 4.6, 0);
    g.add(glow);
  } else if (st.kind === 'alchemist') {
    // Alchemist Cauldron + Timber Awning + Bubbling Potion Brew
    addPart(g, new THREE.CylinderGeometry(r * 0.92, r, 0.22, 8), darkStone, [0, 0.11, 0], [1, 1, 1]);
    addPart(g, sharedGeo.sphere, makeMat(0x2a2f33, { metalness: 0.75, roughness: 0.4 }), [0, 0.92, 0.15], [1.45, 1.15, 1.45]);
    const brewMat = makeMat(0x52eb8c, { emissive: 0x26c763, emissiveIntensity: 1.4, roughness: 0.2 });
    const brew = addPart(g, sharedGeo.cyl, brewMat, [0, 1.38, 0.15], [1.15, 0.14, 1.15], [0, 0, 0], false);
    addPart(g, sharedGeo.box, timberMat, [-1.4, 1.2, -1.0], [0.2, 2.2, 0.2]);
    addPart(g, sharedGeo.box, timberMat, [1.4, 1.2, -1.0], [0.2, 2.2, 0.2]);
    addPart(g, sharedGeo.box, roofMat, [0, 2.35, -0.7], [3.2, 0.18, 1.5], [0.22, 0, 0]);
    animPart = brew;
  } else {
    // Grand Auction Market Pavilion with Striped Canopy & Crates
    addPart(g, new THREE.CylinderGeometry(r * 0.96, r * 1.04, 0.26, 8), stoneMat, [0, 0.13, 0], [1, 1, 1]);
    for (const [px, pz] of [[-1.7, -1.3], [1.7, -1.3], [-1.7, 1.3], [1.7, 1.3]]) {
      addPart(g, sharedGeo.cyl, timberMat, [px, 1.4, pz], [0.22, 2.5, 0.22]);
    }
    addPart(g, new THREE.ConeGeometry(2.95, 1.55, 4), roofMat, [0, 3.25, 0], [1, 1, 1], [0, Math.PI / 4, 0]);
    addPart(g, new THREE.ConeGeometry(1.5, 0.82, 4), makeMat(0xf5e8cf, { roughness: 0.85 }), [0, 3.68, 0], [1, 1, 1], [0, Math.PI / 4, 0]);
    addPart(g, sharedGeo.box, timberMat, [0, 0.65, 0.85], [2.6, 0.85, 0.72]); // Counter
    addPart(g, sharedGeo.box, accentMat, [-1.0, 1.22, 0.85], [0.55, 0.42, 0.45]);
    addPart(g, sharedGeo.box, makeMat(0x56824d, { roughness: 0.85 }), [0.95, 1.2, 0.85], [0.52, 0.38, 0.45]);
  }

  return { group: g, animPart, ringMesh };
}

export function createPortalMesh(portal: ZonePortal): {
  group: THREE.Group;
  vortexMat: THREE.ShaderMaterial;
} {
  const g = new THREE.Group();
  const stoneMat = makeMat(0x6b6762, { roughness: 0.9 });
  const runeColor =
    portal.risk === 'high_risk' ? 0xf06454 : portal.risk === 'contested' ? 0xe5a93c : 0x56c878;

  // Stepped dais + carved twin monoliths + keystone arch
  addPart(g, new THREE.CylinderGeometry(2.1, 2.35, 0.28, 10), stoneMat, [0, 0.14, 0], [1, 1, 1]);
  addPart(g, sharedGeo.box, stoneMat, [-1.45, 1.85, 0], [0.68, 3.4, 0.78], [0, 0, 0.05]);
  addPart(g, sharedGeo.box, stoneMat, [1.45, 1.85, 0], [0.68, 3.4, 0.78], [0, 0, -0.05]);
  addPart(g, sharedGeo.box, stoneMat, [0, 3.62, 0], [3.65, 0.62, 0.88]);
  addPart(g, sharedGeo.octa, makeMat(runeColor, { emissive: runeColor, emissiveIntensity: 1.4 }), [0, 4.18, 0], [0.42, 0.56, 0.42], [0, 0, 0], false);

  const vortexMat = createPortalVortexMaterial(runeColor);
  const vortex = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 3.1), vortexMat);
  vortex.position.set(0, 1.82, 0);
  g.add(vortex);

  return { group: g, vortexMat };
}

// ================= COMPOSITE 3D RESOURCE NODES =================

export function createResourceNodeMesh(
  node: ResourceNode,
  woodTex: THREE.Texture,
  windUniform: { value: number },
): { group: THREE.Group; ringMesh: THREE.Mesh } {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffe38a,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringR = Math.max(1.1, node.radius * WORLD_SCALE * 1.05);
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(ringR * 0.86, ringR, 20), ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.06;
  g.add(ringMesh);

  const scaleVar = 0.9 + ((node.seed % 100) / 100) * 0.22;

  if (node.kind === 'tree') {
    const trunkMat = makeMat(node.tier === 1 ? '#d8cfbe' : '#634329', {
      map: woodTex,
      roughness: 0.92,
    });
    const canopyMat = makeMat(node.color, { roughness: 0.82 });
    const canopyTopMat = makeMat(node.accent, { roughness: 0.78 });
    applyWindSwayToMaterial(canopyMat, windUniform, 0.065);
    applyWindSwayToMaterial(canopyTopMat, windUniform, 0.085);

    const h = (2.6 + node.tier * 0.35) * scaleVar;
    addPart(g, new THREE.CylinderGeometry(0.24, 0.44, h * 0.65, 7), trunkMat, [0, h * 0.32, 0], [1, 1, 1]);
    // Exposed root buttresses
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + node.seed;
      addPart(g, sharedGeo.box, trunkMat, [Math.cos(a) * 0.35, 0.16, Math.sin(a) * 0.35], [0.22, 0.28, 0.52], [0, -a, 0]);
    }
    // Layered stylized Albion low-poly foliage crowns
    addPart(g, sharedGeo.dodeca, canopyMat, [0, h * 0.78, 0], [2.45 * scaleVar, 1.75 * scaleVar, 2.35 * scaleVar]);
    addPart(g, sharedGeo.dodeca, canopyTopMat, [0.55, h * 1.02, 0.35], [1.65 * scaleVar, 1.35 * scaleVar, 1.65 * scaleVar]);
    addPart(g, sharedGeo.dodeca, canopyMat, [-0.62, h * 0.95, -0.35], [1.5 * scaleVar, 1.2 * scaleVar, 1.5 * scaleVar]);
  } else if (node.kind === 'ore') {
    const rockMat = makeMat(0x57524c, { roughness: 0.92 });
    const veinMat = makeMat(node.accent, {
      metalness: 0.86,
      roughness: 0.2,
      emissive: node.tier >= 5 ? node.accent : 0x000000,
      emissiveIntensity: node.tier >= 5 ? 0.5 : 0,
    });
    addPart(g, sharedGeo.dodeca, rockMat, [0, 0.55, 0], [1.95 * scaleVar, 1.25 * scaleVar, 1.75 * scaleVar], [0.2, node.seed, 0.1]);
    addPart(g, sharedGeo.dodeca, rockMat, [0.65, 0.38, 0.42], [1.1 * scaleVar, 0.85 * scaleVar, 1.0 * scaleVar]);
    // Gleaming metallic ore protrusions
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + node.seed;
      addPart(
        g,
        sharedGeo.octa,
        veinMat,
        [Math.cos(a) * 0.52, 0.72 + (i % 2) * 0.25, Math.sin(a) * 0.48],
        [0.42, 0.65, 0.38],
        [0.4 * Math.cos(a), a, 0.35 * Math.sin(a)],
      );
    }
  } else if (node.kind === 'stone') {
    const stoneMat = makeMat(node.color, { roughness: 0.94 });
    const lightStone = makeMat(node.accent, { roughness: 0.88 });
    addPart(g, sharedGeo.dodeca, stoneMat, [0, 0.52, 0], [2.1 * scaleVar, 1.05 * scaleVar, 1.8 * scaleVar], [0.1, node.seed, 0]);
    addPart(g, sharedGeo.box, lightStone, [0.45, 0.82, -0.25], [1.1, 0.65, 0.95], [0.15, 0.6, -0.1]);
  } else if (node.kind === 'fiber') {
    const stalkMat = makeMat(node.color, { roughness: 0.85 });
    const tipMat = makeMat(node.accent, { roughness: 0.75 });
    applyWindSwayToMaterial(stalkMat, windUniform, 0.14);
    applyWindSwayToMaterial(tipMat, windUniform, 0.16);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + node.seed;
      const dist = 0.18 + (i % 3) * 0.2;
      addPart(g, sharedGeo.cyl, stalkMat, [Math.cos(a) * dist, 0.52, Math.sin(a) * dist], [0.1, 1.05, 0.1], [0.15, a, 0.12]);
      addPart(g, sharedGeo.sphere, tipMat, [Math.cos(a) * dist * 1.15, 1.08, Math.sin(a) * dist * 1.15], [0.24, 0.24, 0.24]);
    }
  } else if (node.kind === 'herb') {
    const stemMat = makeMat(0x3f7337, { roughness: 0.82 });
    const bloomMat = makeMat(node.accent, {
      roughness: 0.6,
      emissive: node.tier >= 4 ? node.accent : 0x000000,
      emissiveIntensity: node.tier >= 4 ? 0.45 : 0,
    });
    applyWindSwayToMaterial(bloomMat, windUniform, 0.11);
    const isMushroom = node.dropTemplateId === 'herb_redcap';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + node.seed;
      const rDist = 0.25 + (i % 2) * 0.2;
      const px = Math.cos(a) * rDist;
      const pz = Math.sin(a) * rDist;
      if (isMushroom) {
        addPart(g, sharedGeo.cyl, makeMat(0xe8dec8, { roughness: 0.85 }), [px, 0.24, pz], [0.16, 0.46, 0.16]);
        addPart(g, sharedGeo.cone, makeMat(0xc93b2e, { roughness: 0.68 }), [px, 0.54, pz], [0.58, 0.34, 0.58]);
      } else {
        addPart(g, sharedGeo.cyl, stemMat, [px, 0.28, pz], [0.08, 0.55, 0.08]);
        addPart(g, sharedGeo.octa, bloomMat, [px, 0.62, pz], [0.36, 0.28, 0.36]);
      }
    }
  } else {
    // Fishing Shoal (Water ripples + swimming fish!)
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xbef5ff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rip = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.88, 20), rippleMat);
    rip.rotation.x = -Math.PI / 2;
    rip.position.y = 0.08;
    g.add(rip);
    const fishMat = makeMat(node.accent, { metalness: 0.4, roughness: 0.35 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      addPart(g, sharedGeo.cone, fishMat, [Math.cos(a) * 0.5, 0.02, Math.sin(a) * 0.5], [0.16, 0.42, 0.12], [Math.PI / 2, a, 0], false);
    }
  }

  return { group: g, ringMesh };
}

// ================= COMPOSITE 3D WILDLIFE, MONSTERS & WORLD BOSSES =================

export function createEnemyRig(enemy: EnemyEntity): EnemyRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const carcassGroup = new THREE.Group();
  carcassGroup.visible = false;
  root.add(bodyGroup);
  root.add(carcassGroup);

  const scale = Math.max(0.7, enemy.radius * WORLD_SCALE * 0.95);
  const shadowDisc = createContactShadowDisc(scale * 1.05, 0.44);
  root.add(shadowDisc);

  const mainMat = makeMat(enemy.color, { roughness: 0.78 });
  const accMat = makeMat(enemy.accent, { roughness: 0.65 });
  const darkMat = makeMat(0x241d19, { roughness: 0.9 });
  const limbs: THREE.Object3D[] = [];
  const wings: THREE.Object3D[] = [];

  // Skinnable fallen carcass visual (compact pelt bundle + golden glint)
  addPart(carcassGroup, sharedGeo.box, mainMat, [0, 0.24, 0], [scale * 1.25, 0.42, scale * 0.9], [0, 0.3, 0.25]);
  addPart(carcassGroup, sharedGeo.sphere, accMat, [scale * 0.4, 0.22, 0.2], [scale * 0.45, 0.35, 0.45]);
  const skinHalo = new THREE.Mesh(
    new THREE.RingGeometry(scale * 0.85, scale * 1.05, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe38a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
  );
  skinHalo.rotation.x = -Math.PI / 2;
  skinHalo.position.y = 0.06;
  carcassGroup.add(skinHalo);

  const sp = enemy.species;

  if (sp === 'bird') {
    addPart(bodyGroup, sharedGeo.sphere, mainMat, [0, 1.35, 0], [0.52, 0.42, 0.72]);
    addPart(bodyGroup, sharedGeo.cone, makeMat(0xe5a93c), [0, 1.38, 0.48], [0.16, 0.28, 0.16], [Math.PI / 2, 0, 0]);
    const lw = new THREE.Group();
    lw.position.set(-0.22, 1.42, 0);
    addPart(lw, sharedGeo.box, accMat, [-0.38, 0, 0], [0.75, 0.08, 0.45]);
    const rw = new THREE.Group();
    rw.position.set(0.22, 1.42, 0);
    addPart(rw, sharedGeo.box, accMat, [0.38, 0, 0], [0.75, 0.08, 0.45]);
    bodyGroup.add(lw, rw);
    wings.push(lw, rw);
  } else if (['deer', 'fox', 'hog', 'wolf', 'leopard', 'bear'].includes(sp)) {
    const isTall = sp === 'deer';
    const isBear = sp === 'bear';
    const isHog = sp === 'hog';
    const bodyY = isBear ? 0.92 : isTall ? 0.86 : isHog ? 0.56 : 0.62;
    const bw = isBear ? 0.95 : isHog ? 0.66 : isTall ? 0.48 : 0.46;
    const bh = isBear ? 0.82 : isHog ? 0.58 : 0.48;
    const bl = isBear ? 1.55 : isTall ? 1.18 : isHog ? 0.96 : 1.05;

    addPart(bodyGroup, sharedGeo.box, mainMat, [0, bodyY, 0], [bw, bh, bl]);
    // Head + snout
    const headY = bodyY + (isTall ? 0.55 : isBear ? 0.22 : 0.18);
    if (isTall) {
      addPart(bodyGroup, sharedGeo.box, mainMat, [0, bodyY + 0.34, bl * 0.44], [0.24, 0.5, 0.24], [0.32, 0, 0]);
    }
    addPart(bodyGroup, sharedGeo.box, mainMat, [0, headY, bl * 0.58], [bw * 0.68, bh * 0.62, bw * 0.85]);
    addPart(bodyGroup, sharedGeo.box, darkMat, [0, headY - 0.05, bl * 0.78], [bw * 0.34, bh * 0.26, 0.22]);

    if (sp === 'deer') {
      const ant = makeMat(0xdfceb0);
      addPart(bodyGroup, sharedGeo.cyl, ant, [-0.14, headY + 0.38, bl * 0.54], [0.04, 0.44, 0.04], [0.15, 0, 0.45]);
      addPart(bodyGroup, sharedGeo.cyl, ant, [0.14, headY + 0.38, bl * 0.54], [0.04, 0.44, 0.04], [0.15, 0, -0.45]);
    } else if (sp === 'hog') {
      const tusk = makeMat(0xf0ead8);
      addPart(bodyGroup, sharedGeo.cone, tusk, [-0.2, headY - 0.04, bl * 0.82], [0.07, 0.26, 0.07], [0.4, 0, 0.45]);
      addPart(bodyGroup, sharedGeo.cone, tusk, [0.2, headY - 0.04, bl * 0.82], [0.07, 0.26, 0.07], [0.4, 0, -0.45]);
    } else if (sp === 'fox' || sp === 'wolf' || sp === 'leopard') {
      addPart(bodyGroup, sharedGeo.cone, accMat, [0, bodyY + 0.05, -bl * 0.68], [0.2, 0.62, 0.2], [-0.9, 0, 0]);
      addPart(bodyGroup, sharedGeo.cone, mainMat, [-0.12, headY + 0.22, bl * 0.56], [0.1, 0.2, 0.1]);
      addPart(bodyGroup, sharedGeo.cone, mainMat, [0.12, headY + 0.22, bl * 0.56], [0.1, 0.2, 0.1]);
    } else if (sp === 'bear') {
      addPart(bodyGroup, sharedGeo.sphere, mainMat, [-0.26, headY + 0.24, bl * 0.54], [0.18, 0.18, 0.14]);
      addPart(bodyGroup, sharedGeo.sphere, mainMat, [0.26, headY + 0.24, bl * 0.54], [0.18, 0.18, 0.14]);
    }

    const legH = bodyY - 0.08;
    for (const [lx, lz] of [[-bw * 0.36, bl * 0.34], [bw * 0.36, bl * 0.34], [-bw * 0.36, -bl * 0.34], [bw * 0.36, -bl * 0.34]]) {
      const p = new THREE.Group();
      p.position.set(lx, bodyY - 0.1, lz);
      addPart(p, sharedGeo.box, mainMat, [0, -legH * 0.45, 0], [bw * 0.24, legH, bw * 0.24]);
      bodyGroup.add(p);
      limbs.push(p);
    }
  } else if (sp === 'boss_treant') {
    // Towering Elder Sylvan Treant Boss
    const bark = makeMat(0x4d3a27, { roughness: 0.94 });
    const leaf = makeMat(0x2f7539, { roughness: 0.82 });
    const core = makeMat(0x66ff99, { emissive: 0x3be073, emissiveIntensity: 1.4 });
    addPart(bodyGroup, new THREE.CylinderGeometry(0.95, 1.35, 3.2, 8), bark, [0, 1.85, 0], [1, 1, 1]);
    addPart(bodyGroup, sharedGeo.octa, core, [0, 2.05, 0.95], [0.72, 0.95, 0.45], [0, 0, 0], false);
    addPart(bodyGroup, sharedGeo.dodeca, leaf, [0, 3.95, 0], [3.4, 2.1, 3.2]);
    addPart(bodyGroup, sharedGeo.dodeca, makeMat(0x489c4f), [1.1, 4.35, 0.4], [1.9, 1.4, 1.9]);
    for (const sx of [-1.45, 1.45]) {
      const arm = new THREE.Group();
      arm.position.set(sx, 2.75, 0);
      addPart(arm, sharedGeo.box, bark, [0, -0.95, 0.25], [0.58, 2.2, 0.58], [0.25, 0, sx * 0.12]);
      bodyGroup.add(arm);
      limbs.push(arm);
    }
  } else if (sp === 'boss_warlord') {
    // Towering Ironhide Warlord Krauss Boss
    const plate = makeMat(0x484e57, { metalness: 0.82, roughness: 0.3 });
    const gold = makeMat(0xe5a93c, { metalness: 0.88, roughness: 0.24 });
    const crimson = makeMat(0xa82820, { roughness: 0.85 });
    addPart(bodyGroup, sharedGeo.box, plate, [0, 1.95, 0], [1.75, 1.85, 1.1]);
    addPart(bodyGroup, sharedGeo.box, plate, [-1.18, 2.58, 0], [0.78, 0.65, 0.92]);
    addPart(bodyGroup, sharedGeo.box, plate, [1.18, 2.58, 0], [0.78, 0.65, 0.92]);
    addPart(bodyGroup, sharedGeo.box, plate, [0, 3.25, 0], [0.95, 0.92, 0.95]);
    addPart(bodyGroup, sharedGeo.cone, gold, [-0.62, 3.62, 0.15], [0.24, 0.78, 0.24], [0.2, 0, 0.65]);
    addPart(bodyGroup, sharedGeo.cone, gold, [0.62, 3.62, 0.15], [0.24, 0.78, 0.24], [0.2, 0, -0.65]);
    addPart(bodyGroup, sharedGeo.box, crimson, [0, 1.65, -0.68], [1.6, 2.2, 0.12], [0.15, 0, 0]);
    for (const sx of [-0.46, 0.46]) {
      const leg = new THREE.Group();
      leg.position.set(sx, 1.05, 0);
      addPart(leg, sharedGeo.box, plate, [0, -0.52, 0], [0.56, 1.08, 0.62]);
      bodyGroup.add(leg);
      limbs.push(leg);
    }
    const axeArm = new THREE.Group();
    axeArm.position.set(1.25, 2.35, 0.2);
    addPart(axeArm, sharedGeo.cyl, makeMat(0x5c3a22), [0, -0.4, 0.65], [0.16, 3.1, 0.16], [1.1, 0, 0]);
    addPart(axeArm, sharedGeo.box, makeMat(0xd5dee8, { metalness: 0.88, roughness: 0.2 }), [0, -0.1, 1.95], [0.2, 1.15, 0.95]);
    bodyGroup.add(axeArm);
    limbs.push(axeArm);
  } else if (sp === 'boss_wyrm') {
    // Towering Ignis, Cinder-Crowned Wyrm Dragon Boss!
    const scaleMat = makeMat(0x7a2118, { roughness: 0.48, metalness: 0.22 });
    const magmaMat = makeMat(0xff842b, { emissive: 0xff5214, emissiveIntensity: 1.5, roughness: 0.25 });
    const hornMat = makeMat(0x2a211d, { roughness: 0.65 });
    addPart(bodyGroup, sharedGeo.box, scaleMat, [0, 1.65, 0], [1.85, 1.45, 3.1]);
    addPart(bodyGroup, sharedGeo.box, magmaMat, [0, 1.4, 0.15], [1.4, 0.95, 2.6], [0, 0, 0], false);
    // Neck, horned dragon head, glowing eyes
    addPart(bodyGroup, sharedGeo.box, scaleMat, [0, 2.7, 1.55], [0.95, 1.55, 1.0], [0.48, 0, 0]);
    addPart(bodyGroup, sharedGeo.box, scaleMat, [0, 3.35, 2.25], [1.05, 0.78, 1.45]);
    addPart(bodyGroup, sharedGeo.cone, hornMat, [-0.45, 3.85, 1.85], [0.22, 0.95, 0.22], [-0.55, 0, 0.35]);
    addPart(bodyGroup, sharedGeo.cone, hornMat, [0.45, 3.85, 1.85], [0.22, 0.95, 0.22], [-0.55, 0, -0.35]);
    // Spiked tail
    addPart(bodyGroup, sharedGeo.cone, scaleMat, [0, 1.45, -2.55], [0.88, 2.5, 0.88], [-Math.PI * 0.48, 0, 0]);
    // Sweeping articulated dragon wings
    const lw = new THREE.Group();
    lw.position.set(-0.9, 2.2, 0.2);
    addPart(lw, sharedGeo.box, scaleMat, [-1.85, 0.4, -0.2], [3.6, 0.14, 1.85], [0.1, 0.15, 0.25]);
    const rw = new THREE.Group();
    rw.position.set(0.9, 2.2, 0.2);
    addPart(rw, sharedGeo.box, scaleMat, [1.85, 0.4, -0.2], [3.6, 0.14, 1.85], [0.1, -0.15, -0.25]);
    bodyGroup.add(lw, rw);
    wings.push(lw, rw);
    const wyrmLight = new THREE.PointLight(0xff6b24, 3.0, 14, 1.6);
    wyrmLight.position.set(0, 2.4, 1.6);
    bodyGroup.add(wyrmLight);
  } else {
    // Humanoid / Golem Monsters (Bandit, Skeleton, Golem, Cultist, Obsidian Knight)
    const isHeavy = sp === 'golem' || sp === 'obsidian_knight';
    const mScale = isHeavy ? 1.32 : 1.0;
    const mat =
      sp === 'obsidian_knight'
        ? makeMat(0x2d2930, { metalness: 0.82, roughness: 0.26 })
        : sp === 'golem'
        ? makeMat(0x6e6962, { roughness: 0.95 })
        : mainMat;

    addPart(bodyGroup, sharedGeo.box, mat, [0, 1.1 * mScale, 0], [0.68 * mScale, 0.78 * mScale, 0.42 * mScale]);
    addPart(bodyGroup, sharedGeo.sphere, sp === 'skeleton' ? makeMat(0xebe4d3) : mat, [0, 1.68 * mScale, 0], [0.44 * mScale, 0.44 * mScale, 0.44 * mScale]);
    if (sp === 'golem' || sp === 'obsidian_knight') {
      addPart(
        bodyGroup,
        sharedGeo.octa,
        makeMat(enemy.accent, { emissive: enemy.accent, emissiveIntensity: 1.4 }),
        [0, 1.15 * mScale, 0.26 * mScale],
        [0.24 * mScale, 0.28 * mScale, 0.16 * mScale],
        [0, 0, 0],
        false,
      );
    }
    for (const sx of [-0.2, 0.2]) {
      const leg = new THREE.Group();
      leg.position.set(sx * mScale, 0.7 * mScale, 0);
      addPart(leg, sharedGeo.box, darkMat, [0, -0.34 * mScale, 0], [0.22 * mScale, 0.68 * mScale, 0.24 * mScale]);
      bodyGroup.add(leg);
      limbs.push(leg);
    }
    const weaponArm = new THREE.Group();
    weaponArm.position.set(0.46 * mScale, 1.35 * mScale, 0);
    addPart(weaponArm, sharedGeo.box, mat, [0, -0.26 * mScale, 0], [0.2 * mScale, 0.56 * mScale, 0.2 * mScale]);
    addPart(weaponArm, sharedGeo.box, accMat, [0, -0.45 * mScale, 0.45 * mScale], [0.12 * mScale, 0.12 * mScale, 0.95 * mScale]);
    bodyGroup.add(weaponArm);
    limbs.push(weaponArm);
  }

  return { root, bodyGroup, limbs, wings: wings.length > 0 ? wings : undefined, carcassGroup, shadowDisc };
}
