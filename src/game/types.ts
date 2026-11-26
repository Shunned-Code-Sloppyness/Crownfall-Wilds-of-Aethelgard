export type Tier = 1 | 2 | 3 | 4 | 5;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ArmorClass = 'plate' | 'leather' | 'cloth';

export type DamageType = 'slashing' | 'piercing' | 'crushing' | 'arcane';

export type ItemCategory =
  | 'weapon'
  | 'offhand'
  | 'helmet'
  | 'chest'
  | 'boots'
  | 'cape'
  | 'bag'
  | 'mount'
  | 'tool'
  | 'resource'
  | 'refined'
  | 'consumable'
  | 'artifact_core';

export type ToolType = 'pickaxe' | 'axe' | 'sickle' | 'knife' | 'rod';

export type WeaponArchetype =
  | 'sword'
  | 'greataxe'
  | 'hammer'
  | 'bow'
  | 'daggers'
  | 'spear'
  | 'fire_staff'
  | 'frost_staff'
  | 'nature_staff';

export type EquipSlot =
  | 'weapon'
  | 'offhand'
  | 'helmet'
  | 'chest'
  | 'boots'
  | 'cape'
  | 'bag'
  | 'mount';

export type CraftingStationType =
  | 'field'
  | 'smelter'
  | 'blacksmith'
  | 'hunter'
  | 'mage'
  | 'alchemist';

export type ZoneId = 'oakhaven' | 'glade' | 'crags' | 'caldera';

export type ZoneRisk = 'safe' | 'contested' | 'high_risk';

export interface ItemStats {
  attack?: number;
  maxHp?: number;
  maxEnergy?: number;
  physArmor?: number;
  magicArmor?: number;
  critChance?: number;
  moveSpeed?: number;
  cooldownReduction?: number;
  carryWeight?: number;
  gatherBonus?: number;
  mountSpeed?: number;
  mountHp?: number;
}

export interface ConsumableEffect {
  healHp?: number;
  restoreEnergy?: number;
  buffId?: string;
  buffName?: string;
  duration?: number;
  attackPct?: number;
  armorPct?: number;
  maxHpBonus?: number;
  speedPct?: number;
  gatherPct?: number;
  regenPerSec?: number;
}

export type OffhandStyle = 'shield' | 'buckler' | 'torch' | 'dirk' | 'tome' | 'orb';

export interface ItemTemplate {
  id: string;
  name: string;
  category: ItemCategory;
  tier: Tier;
  rarity: Rarity;
  weight: number;
  basePrice: number;
  stackable: boolean;
  description: string;
  iconColor: string;
  accentColor?: string;
  armorClass?: ArmorClass;
  damageType?: DamageType;
  weaponArchetype?: WeaponArchetype;
  offhandStyle?: OffhandStyle;
  toolType?: ToolType;
  mountKind?: 'horse' | 'ox' | 'stag' | 'warhorse' | 'direwolf';
  stats?: ItemStats;
  consumable?: ConsumableEffect;
}

export interface InventoryItem {
  uid: string;
  templateId: string;
  qty: number;
  rarity: Rarity;
  durability?: number;
}

export interface RecipeIngredient {
  templateId: string;
  qty: number;
}

export interface CraftingRecipe {
  id: string;
  outputTemplateId: string;
  outputQty: number;
  station: CraftingStationType;
  tier: Tier;
  silverCost: number;
  xpReward: number;
  xpTree: MasteryTree;
  ingredients: RecipeIngredient[];
}

export type SkillAimType = 'line' | 'cone' | 'aoe' | 'self' | 'dash';

export type AbilitySource = 'weapon' | 'helmet' | 'chest' | 'boots';

export interface SkillDef {
  id: string;
  key: 'Q' | 'E' | 'R' | 'D' | 'C' | 'V';
  source?: AbilitySource;
  name: string;
  description: string;
  cooldown: number;
  energyCost: number;
  damageMult: number;
  damageType: DamageType;
  aimType: SkillAimType;
  range: number;
  radius: number;
  projectileSpeed?: number;
  healAmount?: number;
  energyRestore?: number;
  shieldAmount?: number;
  buffEffect?: {
    id: string;
    name: string;
    duration: number;
    attackPct?: number;
    armorPct?: number;
    speedPct?: number;
    regenPerSec?: number;
  };
  stunDuration?: number;
  slowDuration?: number;
  dashDistance?: number;
  color: string;
}

export interface GameSettings {
  // Display
  graphicsQuality: 'low' | 'medium' | 'high';
  renderScale: 0.75 | 1 | 1.5;
  showShadows: boolean;
  warmLighting: boolean;
  showMinimap: boolean;
  hudScale: 'compact' | 'standard' | 'large';
  cameraZoom: number; // 0.6 (close heroic) .. 1.55 (wide tactical), default 0.85
  // Audio
  masterVolume: number;
  muted: boolean;
  // Controls & Mobile
  showVirtualStick: 'auto' | 'always' | 'off';
  stickSize: 'small' | 'medium' | 'large';
  leftHandedLayout: boolean;
  dragSkillShots: boolean;
  // Gameplay
  showDamageNumbers: boolean;
  showResourceLabels: boolean;
  screenShake: boolean;
  autoEquipTools: boolean;
}

export type MasteryTree =
  | 'combat'
  | 'mining'
  | 'logging'
  | 'harvesting'
  | 'skinning'
  | 'fishing'
  | 'crafting';

export interface ActiveBuff {
  id: string;
  name: string;
  remaining: number;
  duration: number;
  attackPct: number;
  armorPct: number;
  maxHpBonus: number;
  speedPct: number;
  gatherPct: number;
  regenPerSec: number;
}

export type ResourceNodeKind =
  | 'ore'
  | 'tree'
  | 'fiber'
  | 'stone'
  | 'herb'
  | 'fish';

export interface ResourceNode {
  id: string;
  kind: ResourceNodeKind;
  name: string;
  x: number;
  y: number;
  radius: number;
  tier: Tier;
  requiredTool: ToolType;
  dropTemplateId: string;
  secondaryDropId?: string;
  charges: number;
  maxCharges: number;
  respawnTimer: number;
  respawnDuration: number;
  color: string;
  accent: string;
  seed: number;
}

export type WildlifeSpecies =
  | 'deer'
  | 'bird'
  | 'fox'
  | 'hog'
  | 'wolf'
  | 'leopard'
  | 'bear'
  | 'bandit'
  | 'skeleton'
  | 'golem'
  | 'cultist'
  | 'obsidian_knight'
  | 'boss_treant'
  | 'boss_warlord'
  | 'boss_wyrm';

export interface EnemyEntity {
  id: string;
  species: WildlifeSpecies;
  name: string;
  isAnimal: boolean;
  isBoss: boolean;
  aggressiveOnProximity: boolean;
  aggroRadius: number;
  leashRadius: number;
  tier: Tier;
  armorClass: ArmorClass;
  damageType: DamageType;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  facing: number;
  radius: number;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  state:
    | 'idle'
    | 'roam'
    | 'chase'
    | 'windup'
    | 'flee'
    | 'staggered'
    | 'carcass'
    | 'dead';
  stateTimer: number;
  windupDuration: number;
  windupAimX: number;
  windupAimY: number;
  windupRadius: number;
  windupType: 'melee' | 'charge' | 'aoe' | 'projectile';
  roamTargetX: number;
  roamTargetY: number;
  hitFlash: number;
  slowTimer: number;
  skinTemplateId?: string;
  meatTemplateId?: string;
  skinned: boolean;
  respawnTimer: number;
  respawnDuration: number;
  xpReward: number;
  silverMin: number;
  silverMax: number;
  bossCoreId?: string;
  color: string;
  accent: string;
}

export interface VillageStructure {
  id: string;
  kind:
    | 'village_chest'
    | 'smelter'
    | 'blacksmith'
    | 'hunter'
    | 'mage'
    | 'alchemist'
    | 'market';
  name: string;
  subtitle: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  accent: string;
}

export interface ZonePortal {
  id: string;
  label: string;
  targetZone: ZoneId;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  radius: number;
  recommendedTier: string;
  risk: ZoneRisk;
}

export interface WaterPool {
  x: number;
  y: number;
  rx: number;
  ry: number;
  isLava?: boolean;
}

export interface ZoneConfig {
  id: ZoneId;
  name: string;
  subtitle: string;
  tierLabel: string;
  risk: ZoneRisk;
  width: number;
  height: number;
  groundBase: string;
  groundAlt: string;
  groundDetail: string;
  ambientTint: string;
  spawnX: number;
  spawnY: number;
  waterPools: WaterPool[];
  structures: VillageStructure[];
  portals: ZonePortal[];
}

export interface AiAdventurer {
  id: string;
  name: string;
  title: string;
  zoneId: ZoneId;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facing: number;
  armorClass: ArmorClass;
  weaponArchetype: WeaponArchetype;
  primaryColor: string;
  cloakColor: string;
  activity: string;
  waitTimer: number;
  mounted: boolean;
  tradeInventory: { templateId: string; qty: number; price: number }[];
}

export interface RemotePlayer {
  id: string;
  name: string;
  zoneId: ZoneId;
  x: number;
  y: number;
  facing: number;
  armorClass: ArmorClass;
  weaponArchetype: WeaponArchetype;
  mounted: boolean;
  level: number;
  lastSeen: number;
}

export interface MarketListing {
  id: string;
  sellerId: string;
  sellerName: string;
  isAiSeller: boolean;
  item: InventoryItem;
  price: number;
  createdAt: number;
}

export interface FishingState {
  active: boolean;
  phase: 'casting' | 'waiting' | 'bite' | 'reeling';
  nodeId: string;
  bobberX: number;
  bobberY: number;
  tier: Tier;
  fishTemplateId: string;
  waitTimer: number;
  biteTimer: number;
  // Albion-style tug-of-war bar (0..100)
  fishPos: number;
  fishVel: number;
  zoneCenter: number;
  zoneWidth: number;
  progress: number; // 0..100
  tension: number; // 0..100 (escapes if hits 100 or 0 too long)
  holdingReel: boolean;
}

export interface NearbyInteraction {
  kind:
    | 'gather'
    | 'skin'
    | 'fish'
    | 'structure'
    | 'portal'
    | 'trade_ai'
    | 'trade_player';
  id: string;
  label: string;
  sublabel: string;
  blockedReason?: string;
}

export interface PlayerProgress {
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  silver: number;
  zoneId: ZoneId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  equipment: Partial<Record<EquipSlot, InventoryItem>>;
  tools: Partial<Record<ToolType, InventoryItem>>;
  inventory: InventoryItem[];
  villageChest: InventoryItem[];
  chestSilver: number;
  mastery: Record<MasteryTree, { level: number; xp: number }>;
  buffs: ActiveBuff[];
  quickPotionTemplateId: string;
  gearSpellChoice?: Record<'helmet' | 'chest' | 'boots', number>;
  actionBarSlots?: string[]; // 6 customizable slot assignments ('weapon_0', 'weapon_1', 'weapon_2', 'helmet', 'chest', 'boots')
}

export type GameScreenState = 'TITLE' | 'PLAYING' | 'PAUSED' | 'DEFEATED';

export interface ActiveModalState {
  type:
    | 'none'
    | 'character'
    | 'chest'
    | 'craft'
    | 'market'
    | 'trade'
    | 'settings';
  station?: CraftingStationType;
  settingsTab?: 'gameplay' | 'display' | 'controls' | 'slots';
  tradeTargetId?: string;
  tradeTargetName?: string;
  tradeIsAi?: boolean;
}

export interface ActionBarSlotHud {
  slotIndex: number;
  bindingId: string;
  hotkey: string;
  source: AbilitySource;
  def: SkillDef;
  cooldownRemaining: number;
  cooldownTotal: number;
  canAfford: boolean;
}

export interface HudSnapshot {
  screen: GameScreenState;
  zoneId: ZoneId;
  zoneName: string;
  zoneTier: string;
  zoneRisk: ZoneRisk;
  playerName: string;
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  shieldHp: number;
  energy: number;
  maxEnergy: number;
  silver: number;
  carryWeight: number;
  maxCarryWeight: number;
  mounted: boolean;
  hasMountEquipped: boolean;
  mountChannelPct: number;
  gatherChannelPct: number;
  gatherLabel: string;
  parryActive: boolean;
  riposteReady: boolean;
  dodgeCooldownPct: number;
  parryCooldownPct: number;
  skills: ActionBarSlotHud[];
  quickPotionCount: number;
  quickPotionName: string;
  buffs: ActiveBuff[];
  nearby: NearbyInteraction | null;
  activeBoss: {
    name: string;
    hp: number;
    maxHp: number;
    tier: Tier;
    state: string;
  } | null;
  fishing: FishingState | null;
  onlineCount: number;
  toast: { id: number; text: string; tone: 'info' | 'gold' | 'warn' | 'danger' } | null;
  minimap: {
    width: number;
    height: number;
    playerX: number;
    playerY: number;
    structures: { x: number; y: number; color: string; isCenter?: boolean }[];
    portals: { x: number; y: number; label: string }[];
    bosses: { x: number; y: number; alive: boolean }[];
    adventurers: { x: number; y: number; isPlayer: boolean }[];
  };
  armorClass: ArmorClass;
  weaponDamageType: DamageType;
  muted: boolean;
  settings: GameSettings;
  defeatSummary?: {
    cause: string;
    zoneName: string;
    silverLost: number;
  };
}
