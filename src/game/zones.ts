import {
  AiAdventurer,
  EnemyEntity,
  ResourceNode,
  Tier,
  WildlifeSpecies,
  ZoneConfig,
  ZoneId,
} from './types';

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const ZONE_CONFIGS: Record<ZoneId, ZoneConfig> = {
  oakhaven: {
    id: 'oakhaven',
    name: 'Oakhaven Bastion',
    subtitle: 'Safe Frontier Village · Central Vault & Guild Stations',
    tierLabel: 'Safe Hub · T1',
    risk: 'safe',
    width: 2200,
    height: 1700,
    groundBase: '#7D9658',
    groundAlt: '#92AA69',
    groundDetail: '#CBB896',
    ambientTint: 'rgba(255, 206, 132, 0.11)',
    spawnX: 1100,
    spawnY: 1015,
    waterPools: [
      { x: 560, y: 1220, rx: 190, ry: 120 },
    ],
    structures: [
      {
        id: 'village_chest_main',
        kind: 'village_chest',
        name: 'Village Storage Chest',
        subtitle: 'Safe Vault · Stow Gear, Resources & Silver',
        x: 1100,
        y: 850,
        radius: 62,
        color: '#8C5830',
        accent: '#E5A93C',
      },
      {
        id: 'station_smelter',
        kind: 'smelter',
        name: 'Smelter & Refinery',
        subtitle: 'Iron Ore -> Bars · Planks · Cloth · Leather',
        x: 780,
        y: 650,
        radius: 56,
        color: '#6E5A4F',
        accent: '#E86A33',
      },
      {
        id: 'station_blacksmith',
        kind: 'blacksmith',
        name: 'Blacksmith Forge',
        subtitle: 'Metal Weapons · Plate Armor · Tools',
        x: 1420,
        y: 650,
        radius: 56,
        color: '#5C5856',
        accent: '#D98236',
      },
      {
        id: 'station_hunter',
        kind: 'hunter',
        name: "Hunter's Lodge",
        subtitle: 'Bows · Daggers · Leather · Mounts',
        x: 1460,
        y: 1050,
        radius: 56,
        color: '#8C623D',
        accent: '#5FA35E',
      },
      {
        id: 'station_mage',
        kind: 'mage',
        name: "Mage's Tower",
        subtitle: 'Staves · Cloth Armor · Arcane Artifacts',
        x: 760,
        y: 1020,
        radius: 56,
        color: '#4F638A',
        accent: '#9EC5FF',
      },
      {
        id: 'station_alchemist',
        kind: 'alchemist',
        name: 'Alchemist & Cookfire',
        subtitle: 'Potions · Boost Elixirs · Cooked Fish & Meat',
        x: 1100,
        y: 1230,
        radius: 52,
        color: '#5B784E',
        accent: '#82E07B',
      },
      {
        id: 'station_market',
        kind: 'market',
        name: 'Grand Auction Market',
        subtitle: 'Live Server Market · Trade With Players & AI',
        x: 1100,
        y: 490,
        radius: 64,
        color: '#9C4236',
        accent: '#F0C05A',
      },
    ],
    portals: [
      {
        id: 'portal_oak_to_glade',
        label: 'Whispering Glade',
        targetZone: 'glade',
        targetX: 240,
        targetY: 1100,
        x: 2040,
        y: 850,
        radius: 74,
        recommendedTier: 'Tier 1–2 Wilds',
        risk: 'contested',
      },
    ],
  },

  glade: {
    id: 'glade',
    name: 'Whispering Glade',
    subtitle: 'Emerald Woodland · Wildlife, Herbs, Streams & Sylvan Boss',
    tierLabel: 'Tier 1–2 · Contested',
    risk: 'contested',
    width: 2800,
    height: 2200,
    groundBase: '#4B8249',
    groundAlt: '#5D9657',
    groundDetail: '#3B6B3B',
    ambientTint: 'rgba(255, 212, 130, 0.13)',
    spawnX: 260,
    spawnY: 1100,
    waterPools: [
      { x: 1050, y: 1580, rx: 260, ry: 135 },
      { x: 1850, y: 640, rx: 220, ry: 125 },
    ],
    structures: [],
    portals: [
      {
        id: 'portal_glade_to_oak',
        label: 'Oakhaven Bastion',
        targetZone: 'oakhaven',
        targetX: 1880,
        targetY: 850,
        x: 130,
        y: 1100,
        radius: 72,
        recommendedTier: 'Safe Village',
        risk: 'safe',
      },
      {
        id: 'portal_glade_to_crags',
        label: 'Sunstone Crags',
        targetZone: 'crags',
        targetX: 240,
        targetY: 1200,
        x: 2660,
        y: 1100,
        radius: 74,
        recommendedTier: 'Tier 3–4 Highlands',
        risk: 'contested',
      },
    ],
  },

  crags: {
    id: 'crags',
    name: 'Sunstone Crags',
    subtitle: 'Golden Ochre Highlands · Rich Iron Ore, Bears, Leopards & Warlord',
    tierLabel: 'Tier 3–4 · Contested',
    risk: 'contested',
    width: 3000,
    height: 2400,
    groundBase: '#B8844B',
    groundAlt: '#CC9B60',
    groundDetail: '#966537',
    ambientTint: 'rgba(255, 186, 102, 0.15)',
    spawnX: 250,
    spawnY: 1200,
    waterPools: [
      { x: 1360, y: 1840, rx: 290, ry: 140 },
      { x: 2050, y: 680, rx: 210, ry: 120 },
    ],
    structures: [],
    portals: [
      {
        id: 'portal_crags_to_glade',
        label: 'Whispering Glade',
        targetZone: 'glade',
        targetX: 2500,
        targetY: 1100,
        x: 130,
        y: 1200,
        radius: 72,
        recommendedTier: 'Tier 1–2 Wilds',
        risk: 'contested',
      },
      {
        id: 'portal_crags_to_caldera',
        label: 'Ashen Caldera',
        targetZone: 'caldera',
        targetX: 250,
        targetY: 1200,
        x: 2860,
        y: 1200,
        radius: 76,
        recommendedTier: 'Tier 4–5 Boss Wilds',
        risk: 'high_risk',
      },
    ],
  },

  caldera: {
    id: 'caldera',
    name: 'Ashen Caldera',
    subtitle: 'High-Risk Volcanic Frontier · Runic Ore, Lava Eels & Cinder Wyrm',
    tierLabel: 'Tier 4–5 · High Risk',
    risk: 'high_risk',
    width: 3000,
    height: 2400,
    groundBase: '#4A3A3F',
    groundAlt: '#5C484D',
    groundDetail: '#382B30',
    ambientTint: 'rgba(242, 118, 66, 0.14)',
    spawnX: 260,
    spawnY: 1200,
    waterPools: [
      { x: 1180, y: 1750, rx: 240, ry: 135, isLava: true },
      { x: 1940, y: 690, rx: 230, ry: 125, isLava: true },
    ],
    structures: [],
    portals: [
      {
        id: 'portal_caldera_to_crags',
        label: 'Sunstone Crags',
        targetZone: 'crags',
        targetX: 2700,
        targetY: 1200,
        x: 130,
        y: 1200,
        radius: 72,
        recommendedTier: 'Tier 3–4 Highlands',
        risk: 'contested',
      },
    ],
  },
};

function isInsideWater(zone: ZoneConfig, x: number, y: number, pad = 35): boolean {
  for (const w of zone.waterPools) {
    const dx = (x - w.x) / (w.rx + pad);
    const dy = (y - w.y) / (w.ry + pad);
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
}

function isNearStructureOrPortal(zone: ZoneConfig, x: number, y: number, pad = 125): boolean {
  if (zone.id === 'oakhaven') {
    const dCenter = Math.hypot(x - 1100, y - 850);
    if (dCenter < 520) return true; // Keep the village plaza open!
  }
  for (const s of zone.structures) {
    if (Math.hypot(x - s.x, y - s.y) < s.radius + pad) return true;
  }
  for (const p of zone.portals) {
    if (Math.hypot(x - p.x, y - p.y) < p.radius + pad) return true;
  }
  return false;
}

export function generateZoneNodes(zoneId: ZoneId): ResourceNode[] {
  const zone = ZONE_CONFIGS[zoneId];
  const rand = seededRand(
    zoneId === 'oakhaven' ? 101 : zoneId === 'glade' ? 202 : zoneId === 'crags' ? 303 : 404,
  );
  const nodes: ResourceNode[] = [];
  let seq = 1;

  const pickOpenSpot = (): { x: number; y: number } => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = 180 + rand() * (zone.width - 360);
      const y = 180 + rand() * (zone.height - 360);
      if (isInsideWater(zone, x, y, 48)) continue;
      if (isNearStructureOrPortal(zone, x, y, 115)) continue;
      if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 88)) continue;
      return { x, y };
    }
    return { x: 240 + rand() * (zone.width - 480), y: 240 + rand() * (zone.height - 480) };
  };

  const addNodes = (
    count: number,
    spec: Omit<ResourceNode, 'id' | 'x' | 'y' | 'charges' | 'respawnTimer' | 'seed'>,
  ) => {
    for (let i = 0; i < count; i++) {
      const pos = pickOpenSpot();
      nodes.push({
        ...spec,
        id: `${zoneId}_node_${seq++}`,
        x: pos.x,
        y: pos.y,
        charges: spec.maxCharges,
        respawnTimer: 0,
        seed: Math.floor(rand() * 10000),
      });
    }
  };

  // Add fishing spots along every water pool edge!
  for (const pool of zone.waterPools) {
    const spots = zoneId === 'oakhaven' ? 3 : 4;
    for (let i = 0; i < spots; i++) {
      const angle = (i / spots) * Math.PI * 2 + 0.4;
      const fx = pool.x + Math.cos(angle) * (pool.rx * 0.84);
      const fy = pool.y + Math.sin(angle) * (pool.ry * 0.84);
      let fishTier: Tier = 1;
      let fishDrop = 'fish_trout';
      let fishName = 'Stream Trout Shoal';
      if (zoneId === 'oakhaven') {
        fishTier = i === 0 ? 1 : i === 1 ? 1 : 2;
        fishDrop = fishTier === 1 ? 'fish_trout' : 'fish_carp';
        fishName = fishTier === 1 ? 'Stream Trout Shoal' : 'Golden Carp Ripple';
      } else if (zoneId === 'glade') {
        fishTier = i % 2 === 0 ? 1 : 2;
        fishDrop = fishTier === 1 ? 'fish_trout' : 'fish_carp';
        fishName = fishTier === 1 ? 'Stream Trout Shoal' : 'Golden Carp Shoal';
      } else if (zoneId === 'crags') {
        fishTier = i % 2 === 0 ? 3 : 4;
        fishDrop = fishTier === 3 ? 'fish_pike' : 'fish_salmon';
        fishName = fishTier === 3 ? 'Ironfin Pike Hole' : 'Sunscale Salmon Run';
      } else {
        fishTier = 5;
        fishDrop = 'fish_eel';
        fishName = 'Caldera Lava Eel Vent';
      }

      nodes.push({
        id: `${zoneId}_fish_${seq++}`,
        kind: 'fish',
        name: fishName,
        x: fx,
        y: fy,
        radius: 38,
        tier: fishTier,
        requiredTool: 'rod',
        dropTemplateId: fishDrop,
        charges: 4,
        maxCharges: 4,
        respawnTimer: 0,
        respawnDuration: 28,
        color: pool.isLava ? '#FF7B38' : '#7DD4E8',
        accent: pool.isLava ? '#FFE08A' : '#E3FAFF',
        seed: Math.floor(rand() * 10000),
      });
    }
  }

  if (zoneId === 'oakhaven') {
    // Starter nodes right around the village edge so players can test gathering immediately
    addNodes(5, {
      kind: 'ore',
      name: 'Copper Ore Vein',
      radius: 28,
      tier: 1,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_copper',
      maxCharges: 3,
      respawnDuration: 24,
      color: '#7A726B',
      accent: '#D9864E',
    });
    addNodes(2, {
      kind: 'ore',
      name: 'Iron Ore Vein',
      radius: 30,
      tier: 3,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_iron',
      maxCharges: 3,
      respawnDuration: 32,
      color: '#5E6870',
      accent: '#C4D2DE',
    });
    addNodes(6, {
      kind: 'tree',
      name: 'Birch Tree',
      radius: 30,
      tier: 1,
      requiredTool: 'axe',
      dropTemplateId: 'wood_birch',
      maxCharges: 3,
      respawnDuration: 24,
      color: '#4E8C4A',
      accent: '#E5DCC8',
    });
    addNodes(4, {
      kind: 'fiber',
      name: 'Meadow Flax',
      radius: 22,
      tier: 1,
      requiredTool: 'sickle',
      dropTemplateId: 'fiber_flax',
      maxCharges: 3,
      respawnDuration: 20,
      color: '#95B558',
      accent: '#E8F2A2',
    });
    addNodes(4, {
      kind: 'stone',
      name: 'Rough Stone Outcrop',
      radius: 26,
      tier: 1,
      requiredTool: 'pickaxe',
      dropTemplateId: 'stone_rough',
      maxCharges: 3,
      respawnDuration: 24,
      color: '#918B82',
      accent: '#CFC9BE',
    });
    addNodes(5, {
      kind: 'herb',
      name: 'Sunbloom Flowers',
      radius: 20,
      tier: 1,
      requiredTool: 'sickle',
      dropTemplateId: 'herb_sunbloom',
      secondaryDropId: 'veg_berries',
      maxCharges: 3,
      respawnDuration: 18,
      color: '#E5A93C',
      accent: '#FFF2A6',
    });
    addNodes(4, {
      kind: 'herb',
      name: 'Silverleaf & Wheat',
      radius: 20,
      tier: 1,
      requiredTool: 'sickle',
      dropTemplateId: 'herb_silverleaf',
      secondaryDropId: 'veg_wheat',
      maxCharges: 3,
      respawnDuration: 18,
      color: '#6BB8B2',
      accent: '#F5DB89',
    });
  } else if (zoneId === 'glade') {
    addNodes(9, {
      kind: 'ore',
      name: 'Copper Ore Vein',
      radius: 28,
      tier: 1,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_copper',
      maxCharges: 3,
      respawnDuration: 26,
      color: '#787069',
      accent: '#DE884E',
    });
    addNodes(7, {
      kind: 'ore',
      name: 'Tin Ore Vein',
      radius: 29,
      tier: 2,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_tin',
      maxCharges: 3,
      respawnDuration: 30,
      color: '#7C858A',
      accent: '#DAE3E8',
    });
    addNodes(4, {
      kind: 'ore',
      name: 'Iron Ore Seam',
      radius: 30,
      tier: 3,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_iron',
      maxCharges: 3,
      respawnDuration: 34,
      color: '#5B6770',
      accent: '#C4D4E0',
    });
    addNodes(10, {
      kind: 'tree',
      name: 'Birch Tree',
      radius: 30,
      tier: 1,
      requiredTool: 'axe',
      dropTemplateId: 'wood_birch',
      maxCharges: 3,
      respawnDuration: 24,
      color: '#4B8A49',
      accent: '#EAE2CE',
    });
    addNodes(8, {
      kind: 'tree',
      name: 'Hearty Oak Tree',
      radius: 34,
      tier: 2,
      requiredTool: 'axe',
      dropTemplateId: 'wood_oak',
      maxCharges: 4,
      respawnDuration: 28,
      color: '#346E3A',
      accent: '#9E7047',
    });
    addNodes(6, {
      kind: 'fiber',
      name: 'Meadow Flax',
      radius: 22,
      tier: 1,
      requiredTool: 'sickle',
      dropTemplateId: 'fiber_flax',
      maxCharges: 3,
      respawnDuration: 22,
      color: '#A5BF5C',
      accent: '#EEF5AD',
    });
    addNodes(6, {
      kind: 'fiber',
      name: 'Wild Hemp Patch',
      radius: 23,
      tier: 2,
      requiredTool: 'sickle',
      dropTemplateId: 'fiber_hemp',
      maxCharges: 3,
      respawnDuration: 25,
      color: '#5A9E52',
      accent: '#A4E396',
    });
    addNodes(6, {
      kind: 'stone',
      name: 'Limestone Outcrop',
      radius: 27,
      tier: 2,
      requiredTool: 'pickaxe',
      dropTemplateId: 'stone_lime',
      secondaryDropId: 'stone_rough',
      maxCharges: 3,
      respawnDuration: 26,
      color: '#BFB599',
      accent: '#F0E8D1',
    });
    addNodes(6, {
      kind: 'herb',
      name: 'Sunbloom & Berries',
      radius: 20,
      tier: 1,
      requiredTool: 'sickle',
      dropTemplateId: 'herb_sunbloom',
      secondaryDropId: 'veg_berries',
      maxCharges: 3,
      respawnDuration: 20,
      color: '#E5A93C',
      accent: '#E85A6E',
    });
    addNodes(6, {
      kind: 'herb',
      name: 'Redcap Mushrooms',
      radius: 21,
      tier: 2,
      requiredTool: 'sickle',
      dropTemplateId: 'herb_redcap',
      secondaryDropId: 'herb_silverleaf',
      maxCharges: 3,
      respawnDuration: 24,
      color: '#D44B3A',
      accent: '#FFF0E6',
    });
    addNodes(5, {
      kind: 'herb',
      name: 'Golden Wheat Sheaves',
      radius: 22,
      tier: 1,
      requiredTool: 'sickle',
      dropTemplateId: 'veg_wheat',
      maxCharges: 3,
      respawnDuration: 20,
      color: '#D9AE4E',
      accent: '#FCE49C',
    });
  } else if (zoneId === 'crags') {
    addNodes(12, {
      kind: 'ore',
      name: 'Rich Iron Ore Vein',
      radius: 31,
      tier: 3,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_iron',
      maxCharges: 4,
      respawnDuration: 30,
      color: '#5A6670',
      accent: '#D4E2ED',
    });
    addNodes(8, {
      kind: 'ore',
      name: 'Steel-Vein Ore',
      radius: 32,
      tier: 4,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_steel',
      maxCharges: 4,
      respawnDuration: 36,
      color: '#46576B',
      accent: '#9BC2EB',
    });
    addNodes(9, {
      kind: 'tree',
      name: 'Highland Cedar',
      radius: 33,
      tier: 3,
      requiredTool: 'axe',
      dropTemplateId: 'wood_cedar',
      maxCharges: 4,
      respawnDuration: 30,
      color: '#7A5434',
      accent: '#B55B3D',
    });
    addNodes(6, {
      kind: 'tree',
      name: 'Ironwood Tree',
      radius: 35,
      tier: 4,
      requiredTool: 'axe',
      dropTemplateId: 'wood_ironwood',
      maxCharges: 4,
      respawnDuration: 34,
      color: '#47423E',
      accent: '#91847B',
    });
    addNodes(7, {
      kind: 'fiber',
      name: 'Skyflower Blooms',
      radius: 23,
      tier: 3,
      requiredTool: 'sickle',
      dropTemplateId: 'fiber_skyflower',
      maxCharges: 3,
      respawnDuration: 26,
      color: '#4B8BD1',
      accent: '#B8DEFF',
    });
    addNodes(5, {
      kind: 'fiber',
      name: 'Sunthread Stalks',
      radius: 24,
      tier: 4,
      requiredTool: 'sickle',
      dropTemplateId: 'fiber_sunthread',
      maxCharges: 3,
      respawnDuration: 30,
      color: '#D9A43D',
      accent: '#FFF0A8',
    });
    addNodes(7, {
      kind: 'stone',
      name: 'Sunstone Cliff Rock',
      radius: 29,
      tier: 3,
      requiredTool: 'pickaxe',
      dropTemplateId: 'stone_sand',
      secondaryDropId: 'stone_slate',
      maxCharges: 4,
      respawnDuration: 28,
      color: '#C28546',
      accent: '#F0C48B',
    });
    addNodes(7, {
      kind: 'herb',
      name: 'Frostmint Blossoms',
      radius: 21,
      tier: 3,
      requiredTool: 'sickle',
      dropTemplateId: 'herb_frostmint',
      secondaryDropId: 'herb_redcap',
      maxCharges: 3,
      respawnDuration: 24,
      color: '#52A8D6',
      accent: '#D4F4FF',
    });
  } else {
    // Ashen Caldera (T4-T5)
    addNodes(10, {
      kind: 'ore',
      name: 'Runic Adamant Vein',
      radius: 33,
      tier: 5,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_runic',
      maxCharges: 4,
      respawnDuration: 38,
      color: '#4D3244',
      accent: '#FF8547',
    });
    addNodes(6, {
      kind: 'ore',
      name: 'Steel-Vein Ore',
      radius: 31,
      tier: 4,
      requiredTool: 'pickaxe',
      dropTemplateId: 'ore_steel',
      maxCharges: 4,
      respawnDuration: 34,
      color: '#485A70',
      accent: '#9EC5EB',
    });
    addNodes(8, {
      kind: 'tree',
      name: 'Scorched Elderwood',
      radius: 34,
      tier: 5,
      requiredTool: 'axe',
      dropTemplateId: 'wood_elderwood',
      maxCharges: 4,
      respawnDuration: 36,
      color: '#543544',
      accent: '#E38A59',
    });
    addNodes(7, {
      kind: 'fiber',
      name: 'Starweave Silk Bush',
      radius: 24,
      tier: 5,
      requiredTool: 'sickle',
      dropTemplateId: 'fiber_starweave',
      maxCharges: 3,
      respawnDuration: 32,
      color: '#915FC4',
      accent: '#E6CCFF',
    });
    addNodes(8, {
      kind: 'stone',
      name: 'Volcanic Obsidian Spire',
      radius: 30,
      tier: 5,
      requiredTool: 'pickaxe',
      dropTemplateId: 'stone_obsidian',
      maxCharges: 4,
      respawnDuration: 36,
      color: '#322636',
      accent: '#C97595',
    });
    addNodes(8, {
      kind: 'herb',
      name: 'Emberpetal Orchids',
      radius: 22,
      tier: 4,
      requiredTool: 'sickle',
      dropTemplateId: 'herb_emberpetal',
      secondaryDropId: 'herb_frostmint',
      maxCharges: 3,
      respawnDuration: 26,
      color: '#E65C32',
      accent: '#FFD98C',
    });
  }

  return nodes;
}

interface SpeciesTemplate {
  name: string;
  isAnimal: boolean;
  isBoss: boolean;
  aggressiveOnProximity: boolean;
  aggroRadius: number;
  leashRadius: number;
  tier: Tier;
  armorClass: 'plate' | 'leather' | 'cloth';
  damageType: 'slashing' | 'piercing' | 'crushing' | 'arcane';
  radius: number;
  maxHp: number;
  attack: number;
  speed: number;
  attackRange: number;
  attackCooldown: number;
  windupDuration: number;
  windupType: 'melee' | 'charge' | 'aoe' | 'projectile';
  skinTemplateId?: string;
  meatTemplateId?: string;
  respawnDuration: number;
  xpReward: number;
  silverMin: number;
  silverMax: number;
  bossCoreId?: string;
  color: string;
  accent: string;
}

const SPECIES_STATS: Record<WildlifeSpecies, SpeciesTemplate> = {
  deer: {
    name: 'Woodland Deer',
    isAnimal: true,
    isBoss: false,
    aggressiveOnProximity: false,
    aggroRadius: 120,
    leashRadius: 420,
    tier: 1,
    armorClass: 'leather',
    damageType: 'crushing',
    radius: 20,
    maxHp: 85,
    attack: 10,
    speed: 145,
    attackRange: 48,
    attackCooldown: 1.5,
    windupDuration: 0.45,
    windupType: 'charge',
    skinTemplateId: 'hide_rugged',
    meatTemplateId: 'meat_venison',
    respawnDuration: 22,
    xpReward: 26,
    silverMin: 4,
    silverMax: 10,
    color: '#A6784E',
    accent: '#EFE2CE',
  },
  bird: {
    name: 'Crested Forest Hawk',
    isAnimal: true,
    isBoss: false,
    aggressiveOnProximity: false,
    aggroRadius: 130,
    leashRadius: 400,
    tier: 1,
    armorClass: 'cloth',
    damageType: 'piercing',
    radius: 16,
    maxHp: 65,
    attack: 12,
    speed: 168,
    attackRange: 54,
    attackCooldown: 1.35,
    windupDuration: 0.4,
    windupType: 'charge',
    skinTemplateId: 'hide_rugged',
    meatTemplateId: 'meat_venison',
    respawnDuration: 20,
    xpReward: 24,
    silverMin: 5,
    silverMax: 11,
    color: '#8C5E3C',
    accent: '#F0C778',
  },
  fox: {
    name: 'Red Brush Fox',
    isAnimal: true,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 145,
    leashRadius: 420,
    tier: 1,
    armorClass: 'leather',
    damageType: 'piercing',
    radius: 17,
    maxHp: 90,
    attack: 14,
    speed: 160,
    attackRange: 46,
    attackCooldown: 1.25,
    windupDuration: 0.42,
    windupType: 'melee',
    skinTemplateId: 'hide_rugged',
    meatTemplateId: 'meat_venison',
    respawnDuration: 22,
    xpReward: 30,
    silverMin: 6,
    silverMax: 14,
    color: '#CC5E2E',
    accent: '#F5EDE1',
  },
  hog: {
    name: 'Tusked Wild Hog',
    isAnimal: true,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 175,
    leashRadius: 460,
    tier: 2,
    armorClass: 'leather',
    damageType: 'crushing',
    radius: 22,
    maxHp: 155,
    attack: 21,
    speed: 142,
    attackRange: 64,
    attackCooldown: 1.7,
    windupDuration: 0.58,
    windupType: 'charge',
    skinTemplateId: 'hide_thin',
    meatTemplateId: 'meat_venison',
    respawnDuration: 26,
    xpReward: 48,
    silverMin: 12,
    silverMax: 24,
    color: '#6E5042',
    accent: '#E8DEC8',
  },
  wolf: {
    name: 'Timber Wolf',
    isAnimal: true,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 210,
    leashRadius: 520,
    tier: 2,
    armorClass: 'leather',
    damageType: 'slashing',
    radius: 20,
    maxHp: 145,
    attack: 23,
    speed: 165,
    attackRange: 52,
    attackCooldown: 1.35,
    windupDuration: 0.48,
    windupType: 'melee',
    skinTemplateId: 'hide_thin',
    meatTemplateId: 'meat_venison',
    respawnDuration: 25,
    xpReward: 52,
    silverMin: 14,
    silverMax: 28,
    color: '#6B727A',
    accent: '#D5DCE3',
  },
  leopard: {
    name: 'Sunstone Spotted Leopard',
    isAnimal: true,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 235,
    leashRadius: 560,
    tier: 3,
    armorClass: 'leather',
    damageType: 'slashing',
    radius: 22,
    maxHp: 245,
    attack: 36,
    speed: 185,
    attackRange: 72,
    attackCooldown: 1.3,
    windupDuration: 0.5,
    windupType: 'charge',
    skinTemplateId: 'hide_medium',
    meatTemplateId: 'meat_prime',
    respawnDuration: 28,
    xpReward: 95,
    silverMin: 28,
    silverMax: 52,
    color: '#D49B4B',
    accent: '#4A331E',
  },
  bear: {
    name: 'Grizzly Highland Bear',
    isAnimal: true,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 215,
    leashRadius: 520,
    tier: 4,
    armorClass: 'plate',
    damageType: 'crushing',
    radius: 28,
    maxHp: 390,
    attack: 48,
    speed: 132,
    attackRange: 70,
    attackCooldown: 1.85,
    windupDuration: 0.68,
    windupType: 'aoe',
    skinTemplateId: 'hide_heavy',
    meatTemplateId: 'meat_prime',
    respawnDuration: 34,
    xpReward: 145,
    silverMin: 42,
    silverMax: 78,
    color: '#5C3D28',
    accent: '#A37A58',
  },
  bandit: {
    name: 'Glade Bandit Scout',
    isAnimal: false,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 215,
    leashRadius: 500,
    tier: 2,
    armorClass: 'leather',
    damageType: 'slashing',
    radius: 19,
    maxHp: 170,
    attack: 24,
    speed: 144,
    attackRange: 54,
    attackCooldown: 1.45,
    windupDuration: 0.5,
    windupType: 'melee',
    respawnDuration: 28,
    xpReward: 62,
    silverMin: 24,
    silverMax: 46,
    color: '#7A3B32',
    accent: '#C99B63',
  },
  skeleton: {
    name: 'Risen Skeleton Archer',
    isAnimal: false,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 255,
    leashRadius: 540,
    tier: 2,
    armorClass: 'cloth',
    damageType: 'piercing',
    radius: 18,
    maxHp: 135,
    attack: 25,
    speed: 122,
    attackRange: 220,
    attackCooldown: 2.0,
    windupDuration: 0.62,
    windupType: 'projectile',
    respawnDuration: 28,
    xpReward: 60,
    silverMin: 22,
    silverMax: 44,
    color: '#D6CEBE',
    accent: '#6E8C76',
  },
  golem: {
    name: 'Sunstone Golem',
    isAnimal: false,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 205,
    leashRadius: 500,
    tier: 3,
    armorClass: 'plate',
    damageType: 'crushing',
    radius: 27,
    maxHp: 350,
    attack: 42,
    speed: 108,
    attackRange: 72,
    attackCooldown: 2.1,
    windupDuration: 0.78,
    windupType: 'aoe',
    respawnDuration: 34,
    xpReward: 125,
    silverMin: 45,
    silverMax: 84,
    color: '#A87642',
    accent: '#F5C46B',
  },
  cultist: {
    name: 'Caldera Pyromancer',
    isAnimal: false,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 280,
    leashRadius: 580,
    tier: 4,
    armorClass: 'cloth',
    damageType: 'arcane',
    radius: 19,
    maxHp: 310,
    attack: 54,
    speed: 135,
    attackRange: 255,
    attackCooldown: 2.0,
    windupDuration: 0.65,
    windupType: 'projectile',
    respawnDuration: 32,
    xpReward: 175,
    silverMin: 68,
    silverMax: 120,
    color: '#6E2B38',
    accent: '#FF8538',
  },
  obsidian_knight: {
    name: 'Obsidian Vanguard',
    isAnimal: false,
    isBoss: false,
    aggressiveOnProximity: true,
    aggroRadius: 235,
    leashRadius: 560,
    tier: 5,
    armorClass: 'plate',
    damageType: 'slashing',
    radius: 24,
    maxHp: 520,
    attack: 64,
    speed: 140,
    attackRange: 66,
    attackCooldown: 1.75,
    windupDuration: 0.65,
    windupType: 'melee',
    respawnDuration: 36,
    xpReward: 235,
    silverMin: 95,
    silverMax: 165,
    color: '#342938',
    accent: '#E85D43',
  },
  boss_treant: {
    name: 'Elder Sylvan Treant',
    isAnimal: false,
    isBoss: true,
    aggressiveOnProximity: true,
    aggroRadius: 290,
    leashRadius: 720,
    tier: 3,
    armorClass: 'plate',
    damageType: 'crushing',
    radius: 44,
    maxHp: 1150,
    attack: 52,
    speed: 102,
    attackRange: 105,
    attackCooldown: 2.3,
    windupDuration: 0.92,
    windupType: 'aoe',
    respawnDuration: 75,
    xpReward: 460,
    silverMin: 240,
    silverMax: 380,
    bossCoreId: 'core_sylvan',
    color: '#3D5E36',
    accent: '#8CF59E',
  },
  boss_warlord: {
    name: 'Ironhide Warlord Krauss',
    isAnimal: false,
    isBoss: true,
    aggressiveOnProximity: true,
    aggroRadius: 310,
    leashRadius: 760,
    tier: 4,
    armorClass: 'plate',
    damageType: 'slashing',
    radius: 40,
    maxHp: 1850,
    attack: 72,
    speed: 132,
    attackRange: 96,
    attackCooldown: 2.0,
    windupDuration: 0.85,
    windupType: 'charge',
    respawnDuration: 85,
    xpReward: 780,
    silverMin: 420,
    silverMax: 660,
    bossCoreId: 'core_warlord',
    color: '#4F5D6B',
    accent: '#6CB8FF',
  },
  boss_wyrm: {
    name: 'Ignis, Cinder-Crowned Wyrm',
    isAnimal: false,
    isBoss: true,
    aggressiveOnProximity: true,
    aggroRadius: 340,
    leashRadius: 820,
    tier: 5,
    armorClass: 'leather',
    damageType: 'arcane',
    radius: 48,
    maxHp: 2800,
    attack: 94,
    speed: 140,
    attackRange: 150,
    attackCooldown: 2.15,
    windupDuration: 0.95,
    windupType: 'aoe',
    skinTemplateId: 'hide_pristine',
    meatTemplateId: 'meat_prime',
    respawnDuration: 95,
    xpReward: 1350,
    silverMin: 750,
    silverMax: 1150,
    bossCoreId: 'core_wyrm',
    color: '#7A231E',
    accent: '#FFBF47',
  },
};

export function generateZoneEnemies(zoneId: ZoneId): EnemyEntity[] {
  const zone = ZONE_CONFIGS[zoneId];
  if (zoneId === 'oakhaven') {
    // Safe village — add 2 peaceful grazing deer near the far western glade edge outside the plaza
    return [
      createEnemy('oakhaven_deer_1', 'deer', 320, 420),
      createEnemy('oakhaven_bird_1', 'bird', 440, 340),
    ];
  }

  const rand = seededRand(zoneId === 'glade' ? 777 : zoneId === 'crags' ? 888 : 999);
  const entities: EnemyEntity[] = [];
  let seq = 1;

  const pickSpot = (minX = 400, maxX = zone.width - 380): { x: number; y: number } => {
    for (let i = 0; i < 40; i++) {
      const x = minX + rand() * (maxX - minX);
      const y = 240 + rand() * (zone.height - 480);
      if (isInsideWater(zone, x, y, 55)) continue;
      if (isNearStructureOrPortal(zone, x, y, 180)) continue;
      if (entities.some((e) => Math.hypot(e.x - x, e.y - y) < 120)) continue;
      return { x, y };
    }
    return { x: minX + 200, y: zone.height / 2 };
  };

  const spawnGroup = (species: WildlifeSpecies, count: number, minX?: number, maxX?: number) => {
    for (let i = 0; i < count; i++) {
      const pos = pickSpot(minX, maxX);
      entities.push(createEnemy(`${zoneId}_${species}_${seq++}`, species, pos.x, pos.y));
    }
  };

  if (zoneId === 'glade') {
    spawnGroup('deer', 5, 360, 1700);
    spawnGroup('bird', 4, 380, 1900);
    spawnGroup('fox', 4, 420, 1850);
    spawnGroup('hog', 4, 750, 2350);
    spawnGroup('wolf', 4, 900, 2450);
    spawnGroup('bandit', 3, 1200, 2450);
    spawnGroup('skeleton', 3, 1300, 2450);
    entities.push(createEnemy('glade_boss_treant', 'boss_treant', 1780, 1180));
  } else if (zoneId === 'crags') {
    spawnGroup('deer', 2, 420, 1400);
    spawnGroup('bird', 3, 450, 2200);
    spawnGroup('hog', 3, 480, 2000);
    spawnGroup('wolf', 4, 520, 2300);
    spawnGroup('leopard', 5, 700, 2650);
    spawnGroup('bear', 4, 950, 2650);
    spawnGroup('bandit', 3, 800, 2450);
    spawnGroup('golem', 4, 1250, 2650);
    entities.push(createEnemy('crags_boss_warlord', 'boss_warlord', 1920, 1250));
  } else if (zoneId === 'caldera') {
    spawnGroup('leopard', 4, 450, 2300);
    spawnGroup('bear', 4, 520, 2400);
    spawnGroup('golem', 3, 600, 2500);
    spawnGroup('cultist', 5, 750, 2650);
    spawnGroup('obsidian_knight', 5, 900, 2650);
    entities.push(createEnemy('caldera_boss_wyrm', 'boss_wyrm', 1980, 1200));
  }

  return entities;
}

function createEnemy(id: string, species: WildlifeSpecies, x: number, y: number): EnemyEntity {
  const s = SPECIES_STATS[species];
  return {
    id,
    species,
    name: s.name,
    isAnimal: s.isAnimal,
    isBoss: s.isBoss,
    aggressiveOnProximity: s.aggressiveOnProximity,
    aggroRadius: s.aggroRadius,
    leashRadius: s.leashRadius,
    tier: s.tier,
    armorClass: s.armorClass,
    damageType: s.damageType,
    x,
    y,
    homeX: x,
    homeY: y,
    vx: 0,
    vy: 0,
    facing: Math.random() * Math.PI * 2,
    radius: s.radius,
    hp: s.maxHp,
    maxHp: s.maxHp,
    attack: s.attack,
    speed: s.speed,
    attackRange: s.attackRange,
    attackCooldown: s.attackCooldown,
    attackTimer: 0.4 + Math.random() * 0.8,
    state: 'idle',
    stateTimer: 1 + Math.random() * 2,
    windupDuration: s.windupDuration,
    windupAimX: x,
    windupAimY: y,
    windupRadius: s.isBoss ? 115 : s.attackRange + 16,
    windupType: s.windupType,
    roamTargetX: x,
    roamTargetY: y,
    hitFlash: 0,
    slowTimer: 0,
    skinTemplateId: s.skinTemplateId,
    meatTemplateId: s.meatTemplateId,
    skinned: false,
    respawnTimer: 0,
    respawnDuration: s.respawnDuration,
    xpReward: s.xpReward,
    silverMin: s.silverMin,
    silverMax: s.silverMax,
    bossCoreId: s.bossCoreId,
    color: s.color,
    accent: s.accent,
  };
}

export function createInitialAiAdventurers(): AiAdventurer[] {
  return [
    {
      id: 'ai_aldric',
      name: 'Aldric Ironforge',
      title: 'Master Smith · Trader',
      zoneId: 'oakhaven',
      x: 1260,
      y: 780,
      targetX: 1320,
      targetY: 720,
      facing: 0.4,
      armorClass: 'plate',
      weaponArchetype: 'hammer',
      primaryColor: '#768491',
      cloakColor: '#A63A32',
      activity: 'Smelting Iron Bars',
      waitTimer: 2,
      mounted: false,
      tradeInventory: [
        { templateId: 'bar_iron', qty: 6, price: 120 },
        { templateId: 'tool_pickaxe_t3', qty: 1, price: 230 },
        { templateId: 'wpn_sword_t3', qty: 1, price: 420 },
        { templateId: 'arm_plate_chest_t3', qty: 1, price: 360 },
      ],
    },
    {
      id: 'ai_lyra',
      name: 'Lyra Swiftbow',
      title: 'Frontier Ranger · Skinner',
      zoneId: 'oakhaven',
      x: 1230,
      y: 980,
      targetX: 1380,
      targetY: 1020,
      facing: 2.1,
      armorClass: 'leather',
      weaponArchetype: 'bow',
      primaryColor: '#8C5E3C',
      cloakColor: '#3E7A4B',
      activity: 'Browsing Auction House',
      waitTimer: 3,
      mounted: true,
      tradeInventory: [
        { templateId: 'mount_horse_t2', qty: 1, price: 390 },
        { templateId: 'leather_thin', qty: 8, price: 65 },
        { templateId: 'wpn_bow_t2', qty: 1, price: 205 },
        { templateId: 'food_venison', qty: 4, price: 85 },
      ],
    },
    {
      id: 'ai_seraphina',
      name: 'Seraphina Dawn',
      title: 'Herbalist & Angler',
      zoneId: 'oakhaven',
      x: 940,
      y: 960,
      targetX: 880,
      targetY: 1040,
      facing: -1.1,
      armorClass: 'cloth',
      weaponArchetype: 'nature_staff',
      primaryColor: '#4C73A8',
      cloakColor: '#D9A441',
      activity: 'Brewing Boost Elixirs',
      waitTimer: 2.5,
      mounted: false,
      tradeInventory: [
        { templateId: 'pot_heal_minor', qty: 6, price: 35 },
        { templateId: 'pot_berserk', qty: 3, price: 96 },
        { templateId: 'pot_stoneskin', qty: 3, price: 88 },
        { templateId: 'food_carp_pie', qty: 3, price: 112 },
        { templateId: 'tool_rod_t2', qty: 1, price: 115 },
      ],
    },
    {
      id: 'ai_garrick',
      name: 'Garrick Wolfbane',
      title: 'Glade Hunter',
      zoneId: 'glade',
      x: 820,
      y: 980,
      targetX: 1250,
      targetY: 1120,
      facing: 0.2,
      armorClass: 'leather',
      weaponArchetype: 'spear',
      primaryColor: '#7A5436',
      cloakColor: '#5C6F4E',
      activity: 'Hunting Wolves & Hogs',
      waitTimer: 1.5,
      mounted: true,
      tradeInventory: [
        { templateId: 'hide_thin', qty: 8, price: 26 },
        { templateId: 'meat_venison', qty: 6, price: 16 },
        { templateId: 'ore_tin', qty: 6, price: 22 },
      ],
    },
    {
      id: 'ai_talia',
      name: 'Talia Sunblade',
      title: 'Highland Prospector',
      zoneId: 'crags',
      x: 780,
      y: 1060,
      targetX: 1200,
      targetY: 1180,
      facing: 0.1,
      armorClass: 'plate',
      weaponArchetype: 'greataxe',
      primaryColor: '#697885',
      cloakColor: '#C46835',
      activity: 'Mining Iron Ore',
      waitTimer: 2,
      mounted: true,
      tradeInventory: [
        { templateId: 'ore_iron', qty: 10, price: 45 },
        { templateId: 'bar_iron', qty: 4, price: 128 },
        { templateId: 'pot_haste', qty: 2, price: 125 },
      ],
    },
  ];
}
