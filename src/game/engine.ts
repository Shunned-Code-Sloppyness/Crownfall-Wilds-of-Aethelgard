import { sound } from './audio';
import {
  ARMOR_ABILITIES,
  CRAFTING_RECIPES,
  createItemInstance,
  DEFAULT_ACTION_BAR_SLOTS,
  getDamageMultiplier,
  getEffectivenessLabel,
  ITEM_TEMPLATES,
  RARITY_META,
  rollDropRarity,
  WEAPON_SKILLS,
} from './catalog';
import {
  AimPreview,
  FloatingText,
  GroundEffectVisual,
  Particle,
  ProjectileVisual,
  RenderPlayerState,
  WorldRenderer3D,
} from './renderer3d';
import {
  AbilitySource,
  ActionBarSlotHud,
  ActiveBuff,
  ActiveModalState,
  AiAdventurer,
  ArmorClass,
  CraftingRecipe,
  DamageType,
  EnemyEntity,
  EquipSlot,
  FishingState,
  GameScreenState,
  GameSettings,
  HudSnapshot,
  InventoryItem,
  MarketListing,
  MasteryTree,
  NearbyInteraction,
  PlayerProgress,
  RemotePlayer,
  ResourceNode,
  SkillDef,
  ToolType,
  WeaponArchetype,
  ZoneId,
} from './types';
import {
  createInitialAiAdventurers,
  generateZoneEnemies,
  generateZoneNodes,
  ZONE_CONFIGS,
} from './zones';

const SAVE_KEY = 'crownfall_aethelgard_save_v2';
const SETTINGS_KEY = 'crownfall_settings_v1';

export const SLOT_HOTKEYS = ['Q', 'E', 'R', 'Z', 'X', 'C'] as const;

export const DEFAULT_SETTINGS: GameSettings = {
  graphicsQuality: 'high',
  renderScale: 1,
  showShadows: true,
  warmLighting: true,
  showMinimap: true,
  hudScale: 'standard',
  masterVolume: 0.75,
  muted: false,
  showVirtualStick: 'auto',
  stickSize: 'medium',
  leftHandedLayout: false,
  dragSkillShots: true,
  showDamageNumbers: true,
  showResourceLabels: true,
  screenShake: true,
  autoEquipTools: true,
  cameraZoom: 0.85,
};

interface ActiveProjectile extends ProjectileVisual {
  damage: number;
  damageType: DamageType;
  life: number;
  stunDuration?: number;
  slowDuration?: number;
  hitIds: Set<string>;
}

interface GatherTask {
  kind: 'node' | 'skin';
  targetId: string;
  label: string;
  elapsed: number;
  duration: number;
  soundTick: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onProgressChange: (progress: PlayerProgress) => void;
  onOpenModal: (modal: ActiveModalState) => void;
  onPresenceSync: (payload: {
    name: string;
    zoneId: ZoneId;
    x: number;
    y: number;
    facing: number;
    armorClass: ArmorClass;
    weaponArchetype: WeaponArchetype;
    mounted: boolean;
    level: number;
  }) => void;
}

export class CrownfallEngine {
  private canvas: HTMLCanvasElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private renderer3d: WorldRenderer3D | null = null;
  private callbacks: EngineCallbacks;

  private rafId: number | null = null;
  private pinchStartDist: number | null = null;
  private pinchStartZoom = 0.85;
  private lastTs = 0;
  private elapsedTime = 0;
  private hitstopTimer = 0;
  private shakeMag = 0;
  private hudEmitTimer = 0;
  private presenceEmitTimer = 0;
  private saveTimer = 0;

  public screen: GameScreenState = 'TITLE';
  public progress: PlayerProgress;
  public settings: GameSettings;
  public zoneNodes = new Map<ZoneId, ResourceNode[]>();
  public zoneEnemies = new Map<ZoneId, EnemyEntity[]>();
  public aiAdventurers: AiAdventurer[] = createInitialAiAdventurers();
  public remotePlayers: RemotePlayer[] = [];
  public onlineCount = 1;
  public marketListings: MarketListing[] = [];

  // Camera
  private camX = 1100;
  private camY = 920;

  // Player live combat/animation runtime state
  private facing = 0;
  private walkCycle = 0;
  private swingAnim = 0;
  private basicAttackCd = 0;
  private dodgeTimer = 0;
  private dodgeCd = 0;
  private dodgeDirX = 1;
  private dodgeDirY = 0;
  private parryTimer = 0;
  private parryCd = 0;
  private riposteReady = false;
  private shieldHp = 0;
  private shieldTimer = 0;
  private hitFlash = 0;
  private mounted = false;
  private mountChannel = 0;
  private mountChannelDuration = 0.7;
  private slotCooldowns: Record<string, number> = {};
  private gatherTask: GatherTask | null = null;
  public fishing: FishingState | null = null;
  private defeatSummary: { cause: string; zoneName: string; silverLost: number } | undefined;

  // Input state (kept strictly decoupled from React)
  private heldKeys = new Set<string>();
  private stickVec = { x: 0, y: 0 };
  private pointerWorld = { x: 1100, y: 920 };
  private pointerScreen = { x: 0, y: 0 };
  private aimPreview: AimPreview | null = null;
  private modalOpen = false;

  // Dynamic world FX pools
  private projectiles: ActiveProjectile[] = [];
  private groundEffects: GroundEffectVisual[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private toast: { id: number; text: string; tone: 'info' | 'gold' | 'warn' | 'danger'; timer: number } | null =
    null;
  private toastSeq = 1;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
    this.settings = this.loadSettings();
    sound.setVolume(this.settings.masterVolume);
    sound.muted = this.settings.muted;
    this.progress = this.loadOrCreateProgress();
    for (const zId of ['oakhaven', 'glade', 'crags', 'caldera'] as ZoneId[]) {
      this.zoneNodes.set(zId, generateZoneNodes(zId));
      this.zoneEnemies.set(zId, generateZoneEnemies(zId));
    }
    this.camX = this.progress.x;
    this.camY = this.progress.y;
  }

  private createFreshProgress(): PlayerProgress {
    const startWeapon = createItemInstance('wpn_sword_t1', 1, 'common');
    const startShield = createItemInstance('off_shield_t1', 1, 'common');
    const startHelm = createItemInstance('arm_leather_helmet_t1', 1, 'common');
    const startChest = createItemInstance('arm_leather_chest_t1', 1, 'common');
    const startBoots = createItemInstance('arm_leather_boots_t1', 1, 'common');
    const startBag = createItemInstance('bag_t1', 1, 'common');
    const startCape = createItemInstance('cape_t1', 1, 'common');
    const startMount = createItemInstance('mount_horse_t2', 1, 'uncommon');

    return {
      name: 'Warden',
      level: 1,
      xp: 0,
      xpToNext: 120,
      silver: 360,
      zoneId: 'oakhaven',
      x: ZONE_CONFIGS.oakhaven.spawnX,
      y: ZONE_CONFIGS.oakhaven.spawnY,
      hp: 260,
      maxHp: 260,
      energy: 140,
      maxEnergy: 140,
      equipment: {
        weapon: startWeapon,
        offhand: startShield,
        helmet: startHelm,
        chest: startChest,
        boots: startBoots,
        bag: startBag,
        cape: startCape,
        mount: startMount,
      },
      tools: {
        pickaxe: createItemInstance('tool_pickaxe_t1', 1, 'common'),
        axe: createItemInstance('tool_axe_t1', 1, 'common'),
        sickle: createItemInstance('tool_sickle_t1', 1, 'common'),
        knife: createItemInstance('tool_knife_t1', 1, 'common'),
        rod: createItemInstance('tool_rod_t1', 1, 'common'),
      },
      inventory: [
        createItemInstance('pot_heal_minor', 5),
        createItemInstance('pot_energy', 3),
        createItemInstance('food_trout', 2),
        createItemInstance('ore_copper', 4),
        createItemInstance('ore_iron', 4),
        createItemInstance('wood_birch', 4),
        createItemInstance('herb_sunbloom', 4),
        createItemInstance('wpn_bow_t1', 1, 'uncommon'),
        createItemInstance('wpn_fire_staff_t1', 1, 'uncommon'),
        createItemInstance('off_dirk_t1', 1, 'uncommon'),
        createItemInstance('off_orb_t1', 1, 'uncommon'),
      ],
      villageChest: [
        createItemInstance('bar_copper', 4),
        createItemInstance('plank_birch', 4),
        createItemInstance('leather_rugged', 4),
        createItemInstance('cloth_linen', 4),
        createItemInstance('pot_stoneskin', 2),
        createItemInstance('pot_berserk', 2),
      ],
      chestSilver: 250,
      mastery: {
        combat: { level: 1, xp: 0 },
        mining: { level: 1, xp: 0 },
        logging: { level: 1, xp: 0 },
        harvesting: { level: 1, xp: 0 },
        skinning: { level: 1, xp: 0 },
        fishing: { level: 1, xp: 0 },
        crafting: { level: 1, xp: 0 },
      },
      buffs: [],
      quickPotionTemplateId: 'pot_heal_minor',
      gearSpellChoice: { helmet: 0, chest: 0, boots: 0 },
      actionBarSlots: [...DEFAULT_ACTION_BAR_SLOTS],
    };
  }

  private loadSettings(): GameSettings {
    if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  public updateSettings(patch: Partial<GameSettings>): void {
    const prevScale = this.settings.renderScale;
    this.settings = { ...this.settings, ...patch };
    sound.setVolume(this.settings.masterVolume);
    sound.muted = this.settings.muted;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      } catch {
        // Ignore storage quota errors
      }
    }
    if (patch.renderScale !== undefined && patch.renderScale !== prevScale) {
      this.handleResize();
    }
    this.emitHud();
  }

  public resetSettings(): void {
    this.updateSettings({ ...DEFAULT_SETTINGS });
    this.showToast('Settings restored to defaults', 'info');
  }

  private loadOrCreateProgress(): PlayerProgress {
    if (typeof window === 'undefined') return this.createFreshProgress();
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return this.createFreshProgress();
      const parsed = JSON.parse(raw) as PlayerProgress;
      if (!parsed || !parsed.zoneId || !ZONE_CONFIGS[parsed.zoneId] || !Array.isArray(parsed.inventory)) {
        return this.createFreshProgress();
      }
      // Clean out any invalid template IDs safely
      parsed.inventory = parsed.inventory.filter((i) => Boolean(ITEM_TEMPLATES[i.templateId]));
      parsed.villageChest = (parsed.villageChest ?? []).filter((i) => Boolean(ITEM_TEMPLATES[i.templateId]));
      parsed.buffs = parsed.buffs ?? [];
      parsed.gearSpellChoice = {
        helmet: parsed.gearSpellChoice?.helmet ?? 0,
        chest: parsed.gearSpellChoice?.chest ?? 0,
        boots: parsed.gearSpellChoice?.boots ?? 0,
      };
      parsed.actionBarSlots =
        Array.isArray(parsed.actionBarSlots) && parsed.actionBarSlots.length === 6
          ? parsed.actionBarSlots
          : [...DEFAULT_ACTION_BAR_SLOTS];
      return parsed;
    } catch {
      return this.createFreshProgress();
    }
  }

  public saveProgress(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.progress));
    } catch {
      // Ignore storage quota errors
    }
  }

  public resetCharacter(): void {
    this.progress = this.createFreshProgress();
    this.mounted = false;
    this.gatherTask = null;
    this.fishing = null;
    this.camX = this.progress.x;
    this.camY = this.progress.y;
    this.recomputeVitals(true);
    this.saveProgress();
    this.notifyProgress();
    this.showToast('Fresh adventure started in Oakhaven Bastion', 'gold');
  }

  public setCameraZoom(zoom: number): void {
    const clamped = Math.max(0.58, Math.min(1.55, Number(zoom.toFixed(2))));
    if (Math.abs(clamped - this.settings.cameraZoom) < 0.005) return;
    this.updateSettings({ cameraZoom: clamped });
  }

  public adjustCameraZoom(delta: number): void {
    this.setCameraZoom((this.settings.cameraZoom ?? 0.85) + delta);
  }

  public attachCanvas(canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.overlayCanvas = overlayCanvas;
    this.renderer3d = new WorldRenderer3D(canvas, overlayCanvas);
    this.recomputeVitals(false);
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    canvas.addEventListener('pointermove', this.handleCanvasPointerMove);
    canvas.addEventListener('pointerdown', this.handleCanvasPointerDown);
    canvas.addEventListener('wheel', this.handleCanvasWheel, { passive: false });
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    canvas.addEventListener('contextmenu', this.handleContextMenu);

    this.lastTs = performance.now();
    this.rafId = this.renderer3d.scheduleNextFrame(this.loop);
    this.emitHud();
    this.notifyProgress();
  }

  public detachCanvas(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      clearTimeout(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    if (this.canvas) {
      this.canvas.removeEventListener('pointermove', this.handleCanvasPointerMove);
      this.canvas.removeEventListener('pointerdown', this.handleCanvasPointerDown);
      this.canvas.removeEventListener('wheel', this.handleCanvasWheel);
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
      this.canvas.removeEventListener('touchend', this.handleTouchEnd);
      this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    }
    if (this.renderer3d) {
      this.renderer3d.dispose();
      this.renderer3d = null;
    }
    this.overlayCanvas = null;
    this.saveProgress();
  }

  private handleResize = (): void => {
    if (!this.canvas || !this.renderer3d) return;
    const rect = this.canvas.getBoundingClientRect();
    this.renderer3d.resize(rect.width, rect.height, this.settings?.renderScale ?? 1);
  };

  public setModalOpen(open: boolean): void {
    this.modalOpen = open;
    if (open) {
      this.heldKeys.clear();
      this.stickVec = { x: 0, y: 0 };
      this.aimPreview = null;
    }
  }

  public startGame(): void {
    sound.unlock();
    this.screen = 'PLAYING';
    this.recomputeVitals(false);
    this.emitHud();
  }

  public togglePause(): void {
    if (this.screen === 'PLAYING') {
      this.screen = 'PAUSED';
      this.heldKeys.clear();
      this.stickVec = { x: 0, y: 0 };
      this.emitHud();
    } else if (this.screen === 'PAUSED') {
      this.screen = 'PLAYING';
      this.emitHud();
    }
  }

  public toggleMute(): void {
    this.updateSettings({ muted: !this.settings.muted });
  }

  public setVirtualStick(x: number, y: number): void {
    this.stickVec.x = x;
    this.stickVec.y = y;
  }

  public setSlotAimPreview(slotIndex: number | null, dx = 0, dy = 0): void {
    if (slotIndex === null) {
      this.aimPreview = null;
      return;
    }
    const slots = this.getActionBarSlots();
    const slot = slots[slotIndex];
    if (!slot) {
      this.aimPreview = null;
      return;
    }
    const skill = slot.def;
    const mag = Math.hypot(dx, dy);
    const angle = mag > 0.15 ? Math.atan2(dy, dx) : this.facing;
    const dist = skill.aimType === 'aoe' ? Math.min(skill.range, Math.max(70, mag * skill.range)) : skill.range;
    this.aimPreview = {
      skill,
      angle,
      aimX: this.progress.x + Math.cos(angle) * dist,
      aimY: this.progress.y + Math.sin(angle) * dist,
    };
  }

  public castSlotFromTouch(slotIndex: number, dx: number, dy: number): void {
    const slots = this.getActionBarSlots();
    const slot = slots[slotIndex];
    this.aimPreview = null;
    if (!slot) return;
    const mag = Math.hypot(dx, dy);
    const angle = mag > 0.15 ? Math.atan2(dy, dx) : this.facing;
    if (mag > 0.15) this.facing = angle;
    const skill = slot.def;
    const dist = mag > 0.15 ? Math.min(skill.range, Math.max(75, mag * skill.range)) : Math.min(180, skill.range);
    this.executeSkill(
      slot.bindingId,
      skill,
      angle,
      this.progress.x + Math.cos(angle) * dist,
      this.progress.y + Math.sin(angle) * dist,
    );
  }

  private handleWindowBlur = (): void => {
    this.heldKeys.clear();
    this.stickVec = { x: 0, y: 0 };
    if (this.fishing) this.fishing.holdingReel = false;
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handleCanvasWheel = (e: WheelEvent): void => {
    if (this.screen !== 'PLAYING' || this.modalOpen) return;
    e.preventDefault();
    const step = Math.sign(e.deltaY) * 0.09;
    this.adjustCameraZoom(step);
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchStartDist = Math.hypot(dx, dy);
      this.pinchStartZoom = this.settings.cameraZoom ?? 0.85;
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (e.touches.length === 2 && this.pinchStartDist !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = this.pinchStartDist / Math.max(20, dist);
      this.setCameraZoom(this.pinchStartZoom * ratio);
    }
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    if (e.touches.length < 2) {
      this.pinchStartDist = null;
    }
  };

  private handleCanvasPointerMove = (e: PointerEvent): void => {
    if (!this.canvas || !this.renderer3d) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerScreen.x = e.clientX - rect.left;
    this.pointerScreen.y = e.clientY - rect.top;
    const world = this.renderer3d.screenToWorld(e.clientX, e.clientY);
    this.pointerWorld.x = world.x;
    this.pointerWorld.y = world.y;
  };

  private handleCanvasPointerDown = (e: PointerEvent): void => {
    if (this.screen !== 'PLAYING' || this.modalOpen) return;
    sound.unlock();
    this.handleCanvasPointerMove(e);

    // If fishing is active, clicking handles hooking/reeling
    if (this.fishing && this.fishing.active) {
      if (this.fishing.phase === 'bite') {
        this.hookBitingFish();
      }
      return;
    }

    if (e.button === 2) {
      this.triggerParry();
      return;
    }

    // Check if clicking directly on a nearby village station, chest, or AI trader
    const zone = ZONE_CONFIGS[this.progress.zoneId];
    for (const st of zone.structures) {
      if (
        Math.hypot(this.pointerWorld.x - st.x, this.pointerWorld.y - st.y) <= st.radius + 16 &&
        Math.hypot(this.progress.x - st.x, this.progress.y - st.y) <= st.radius + 120
      ) {
        this.openStructureModal(st.kind);
        return;
      }
    }

    for (const ai of this.aiAdventurers) {
      if (ai.zoneId !== this.progress.zoneId) continue;
      if (
        Math.hypot(this.pointerWorld.x - ai.x, this.pointerWorld.y - ai.y) <= 32 &&
        Math.hypot(this.progress.x - ai.x, this.progress.y - ai.y) <= 135
      ) {
        this.callbacks.onOpenModal({
          type: 'trade',
          tradeTargetId: ai.id,
          tradeTargetName: ai.name,
          tradeIsAi: true,
        });
        return;
      }
    }

    // Otherwise face pointer and fire basic attack!
    this.facing = Math.atan2(this.pointerWorld.y - this.progress.y, this.pointerWorld.x - this.progress.x);
    this.triggerBasicAttack();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();

    if (this.screen === 'TITLE') {
      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        this.startGame();
      }
      return;
    }

    if (key === 'escape') {
      if (this.fishing && this.fishing.active) {
        this.cancelFishing();
        return;
      }
      if (this.modalOpen) {
        this.callbacks.onOpenModal({ type: 'none' });
        return;
      }
      this.togglePause();
      return;
    }

    if (this.screen !== 'PLAYING' || this.modalOpen) return;

    if (this.fishing && this.fishing.active) {
      if (key === ' ' || key === 'e') {
        e.preventDefault();
        if (this.fishing.phase === 'bite') {
          this.hookBitingFish();
        } else if (this.fishing.phase === 'reeling') {
          this.fishing.holdingReel = true;
        }
      }
      return;
    }

    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      this.heldKeys.add(key);
      return;
    }

    if (e.repeat) return;

    if (key === ' ') {
      e.preventDefault();
      this.triggerDodge();
    } else if (key === 'f') {
      this.triggerParry();
    } else if (key === 'q' || key === '1') {
      this.castSlotWithPointer(0);
    } else if (key === 'e') {
      // During active combat, E casts Slot 2; outside combat, E interacts with nearby chests, nodes, fish, and portals
      const inCombat = (this.zoneEnemies.get(this.progress.zoneId) ?? []).some(
        (en) =>
          (en.state === 'chase' || en.state === 'windup') &&
          Math.hypot(en.x - this.progress.x, en.y - this.progress.y) < 280,
      );
      const nearby = this.findNearestInteraction();
      if (nearby && !inCombat) {
        this.triggerInteract();
      } else {
        this.castSlotWithPointer(1);
      }
    } else if (key === '2') {
      this.castSlotWithPointer(1);
    } else if (key === 'r' || key === '3') {
      this.castSlotWithPointer(2);
    } else if (key === 'z' || key === '4') {
      this.castSlotWithPointer(3);
    } else if (key === 'x' || key === '5') {
      this.castSlotWithPointer(4);
    } else if (key === 'c' || key === '6') {
      this.castSlotWithPointer(5);
    } else if (key === 'g') {
      this.triggerInteract();
    } else if (key === 'm') {
      this.toggleMount();
    } else if (key === 'h') {
      this.useQuickPotion();
    } else if (key === 'i' || key === 'b') {
      this.callbacks.onOpenModal({ type: 'character' });
    } else if (key === 'k') {
      this.callbacks.onOpenModal({ type: 'craft', station: 'field' });
    } else if (key === 'o') {
      this.callbacks.onOpenModal({ type: 'settings', settingsTab: 'gameplay' });
    } else if (key === '=' || key === '+' || key === ']') {
      this.adjustCameraZoom(-0.12);
    } else if (key === '-' || key === '_' || key === '[') {
      this.adjustCameraZoom(0.12);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    this.heldKeys.delete(key);
    if (this.fishing && (key === ' ' || key === 'e')) {
      this.fishing.holdingReel = false;
    }
  };

  // ================= STATS & DERIVED CHARACTER BUILD =================

  public getDerivedStats(): {
    attack: number;
    maxHp: number;
    maxEnergy: number;
    physArmor: number;
    magicArmor: number;
    critChance: number;
    moveSpeed: number;
    cooldownReduction: number;
    maxCarryWeight: number;
    gatherYieldMult: number;
    armorClass: ArmorClass;
    weaponArchetype: WeaponArchetype;
    damageType: DamageType;
  } {
    const p = this.progress;
    let attack = 16 + p.level * 4 + p.mastery.combat.level * 2;
    let maxHp = 180 + p.level * 22;
    let maxEnergy = 110 + p.level * 6;
    let physArmor = 8 + p.level * 2;
    let magicArmor = 8 + p.level * 2;
    let critChance = 0.08;
    let speedBonus = 0;
    let cdr = 0;
    let maxCarryWeight = 85;
    let gatherYieldMult = 1;

    let platePieces = 0;
    let leatherPieces = 0;
    let clothPieces = 0;

    for (const slot of Object.keys(p.equipment) as EquipSlot[]) {
      const item = p.equipment[slot];
      if (!item) continue;
      const tpl = ITEM_TEMPLATES[item.templateId];
      if (!tpl) continue;
      const rMult = RARITY_META[item.rarity].mult;
      if (tpl.armorClass === 'plate') platePieces++;
      if (tpl.armorClass === 'leather') leatherPieces++;
      if (tpl.armorClass === 'cloth') clothPieces++;

      if (tpl.stats) {
        attack += Math.round((tpl.stats.attack ?? 0) * rMult);
        maxHp += Math.round((tpl.stats.maxHp ?? 0) * rMult);
        maxEnergy += Math.round((tpl.stats.maxEnergy ?? 0) * rMult);
        physArmor += Math.round((tpl.stats.physArmor ?? 0) * rMult);
        magicArmor += Math.round((tpl.stats.magicArmor ?? 0) * rMult);
        critChance += tpl.stats.critChance ?? 0;
        speedBonus += tpl.stats.moveSpeed ?? 0;
        cdr += tpl.stats.cooldownReduction ?? 0;
        if (slot !== 'mount' || this.mounted) {
          maxCarryWeight += tpl.stats.carryWeight ?? 0;
        }
        if (slot === 'mount' && this.mounted) {
          speedBonus += tpl.stats.mountSpeed ?? 0;
        }
      }
    }

    // Active potion & food buffs
    let atkPct = 0;
    let armPct = 0;
    for (const b of p.buffs) {
      atkPct += b.attackPct;
      armPct += b.armorPct;
      maxHp += b.maxHpBonus;
      speedBonus += b.speedPct;
      gatherYieldMult += b.gatherPct;
    }

    attack = Math.round(attack * (1 + atkPct));
    physArmor = Math.round(physArmor * (1 + armPct));
    magicArmor = Math.round(magicArmor * (1 + armPct));

    // Overweight slowdown if bag is overloaded
    const weight = this.getCarryWeight();
    if (weight > maxCarryWeight) {
      speedBonus -= 0.35;
    }

    const armorClass: ArmorClass =
      platePieces >= leatherPieces && platePieces >= clothPieces && platePieces > 0
        ? 'plate'
        : clothPieces > leatherPieces
        ? 'cloth'
        : 'leather';

    const wpnItem = p.equipment.weapon;
    const wpnTpl = wpnItem ? ITEM_TEMPLATES[wpnItem.templateId] : undefined;
    const weaponArchetype: WeaponArchetype = wpnTpl?.weaponArchetype ?? 'sword';
    const damageType: DamageType = wpnTpl?.damageType ?? 'slashing';

    return {
      attack,
      maxHp,
      maxEnergy,
      physArmor,
      magicArmor,
      critChance: Math.min(0.75, critChance),
      moveSpeed: Math.max(105, Math.round(215 * (1 + speedBonus))),
      cooldownReduction: Math.min(0.45, cdr),
      maxCarryWeight,
      gatherYieldMult,
      armorClass,
      weaponArchetype,
      damageType,
    };
  }

  public getCarryWeight(): number {
    let total = 0;
    for (const it of this.progress.inventory) {
      const tpl = ITEM_TEMPLATES[it.templateId];
      if (tpl) total += tpl.weight * it.qty;
    }
    return Number(total.toFixed(1));
  }

  public getArmorPieceClass(piece: 'helmet' | 'chest' | 'boots'): ArmorClass {
    const it = this.progress.equipment[piece];
    if (it) {
      const tpl = ITEM_TEMPLATES[it.templateId];
      if (tpl?.armorClass) return tpl.armorClass;
    }
    return this.getDerivedStats().armorClass;
  }

  public getAbilityForBinding(bindingId: string): { source: AbilitySource; def: SkillDef } {
    const stats = this.getDerivedStats();
    const wpnSkills = WEAPON_SKILLS[stats.weaponArchetype] ?? WEAPON_SKILLS.sword;
    if (bindingId === 'weapon_0') return { source: 'weapon', def: wpnSkills[0] };
    if (bindingId === 'weapon_1') return { source: 'weapon', def: wpnSkills[1] };
    if (bindingId === 'weapon_2') return { source: 'weapon', def: wpnSkills[2] };

    const choices = this.progress.gearSpellChoice ?? { helmet: 0, chest: 0, boots: 0 };
    if (bindingId === 'helmet' || bindingId === 'chest' || bindingId === 'boots') {
      const cls = this.getArmorPieceClass(bindingId);
      const opts = ARMOR_ABILITIES[cls][bindingId];
      const idx = Math.max(0, Math.min(opts.length - 1, choices[bindingId] ?? 0));
      return { source: bindingId, def: opts[idx] };
    }
    return { source: 'weapon', def: wpnSkills[0] };
  }

  public getActionBarSlots(): ActionBarSlotHud[] {
    const stats = this.getDerivedStats();
    const bindings =
      this.progress.actionBarSlots && this.progress.actionBarSlots.length === 6
        ? this.progress.actionBarSlots
        : DEFAULT_ACTION_BAR_SLOTS;

    return bindings.map((bindingId, slotIndex) => {
      const { source, def } = this.getAbilityForBinding(bindingId);
      const cdRem = this.slotCooldowns[bindingId] ?? 0;
      const cdTot = def.cooldown * (1 - stats.cooldownReduction);
      return {
        slotIndex,
        bindingId,
        hotkey: SLOT_HOTKEYS[slotIndex] ?? String(slotIndex + 1),
        source,
        def,
        cooldownRemaining: cdRem,
        cooldownTotal: cdTot,
        canAfford: this.progress.energy >= def.energyCost,
      };
    });
  }

  public setActionBarSlot(slotIndex: number, bindingId: string): void {
    if (slotIndex < 0 || slotIndex > 5) return;
    const current =
      this.progress.actionBarSlots && this.progress.actionBarSlots.length === 6
        ? [...this.progress.actionBarSlots]
        : [...DEFAULT_ACTION_BAR_SLOTS];
    const existingIdx = current.indexOf(bindingId);
    const prevAtTarget = current[slotIndex];
    if (existingIdx !== -1 && existingIdx !== slotIndex) {
      current[existingIdx] = prevAtTarget;
    }
    current[slotIndex] = bindingId;
    this.progress.actionBarSlots = current;
    this.saveProgress();
    this.notifyProgress();
    this.emitHud();
  }

  public resetActionBarSlots(): void {
    this.progress.actionBarSlots = [...DEFAULT_ACTION_BAR_SLOTS];
    this.saveProgress();
    this.notifyProgress();
    this.emitHud();
  }

  public setGearSpellChoice(piece: 'helmet' | 'chest' | 'boots', choiceIndex: number): void {
    if (!this.progress.gearSpellChoice) {
      this.progress.gearSpellChoice = { helmet: 0, chest: 0, boots: 0 };
    }
    this.progress.gearSpellChoice[piece] = choiceIndex;
    this.saveProgress();
    this.notifyProgress();
    this.emitHud();
  }

  public getActiveSkills(): SkillDef[] {
    return this.getActionBarSlots().map((s) => s.def);
  }

  private recomputeVitals(refill: boolean): void {
    const stats = this.getDerivedStats();
    this.progress.maxHp = stats.maxHp;
    this.progress.maxEnergy = stats.maxEnergy;
    if (refill) {
      this.progress.hp = stats.maxHp;
      this.progress.energy = stats.maxEnergy;
    } else {
      this.progress.hp = Math.min(this.progress.hp, stats.maxHp);
      this.progress.energy = Math.min(this.progress.energy, stats.maxEnergy);
    }
  }

  // ================= COMBAT ACTIONS (ATTACK, SKILLS, DODGE, PARRY, MOUNT) =================

  public triggerBasicAttack(): void {
    if (this.screen !== 'PLAYING' || this.basicAttackCd > 0 || this.dodgeTimer > 0) return;
    if (this.mounted) this.dismount('Dismounted to fight');
    this.gatherTask = null;

    const stats = this.getDerivedStats();
    const arch = stats.weaponArchetype;
    const isRanged = arch === 'bow' || arch === 'fire_staff' || arch === 'frost_staff' || arch === 'nature_staff';
    this.basicAttackCd = arch === 'daggers' ? 0.3 : arch === 'greataxe' || arch === 'hammer' ? 0.56 : 0.42;
    this.swingAnim = 1;

    const riposteBoost = this.riposteReady ? 1.9 : 1;
    const forceCrit = this.riposteReady;
    this.riposteReady = false;

    if (isRanged) {
      if (arch === 'bow') sound.playBow();
      else sound.playMagic();

      const speed = arch === 'bow' ? 680 : 540;
      const color =
        arch === 'bow'
          ? '#A8F09C'
          : arch === 'fire_staff'
          ? '#FF8533'
          : arch === 'frost_staff'
          ? '#82D4FF'
          : '#6BD47E';
      this.projectiles.push({
        x: this.progress.x + Math.cos(this.facing) * 20,
        y: this.progress.y + Math.sin(this.facing) * 20,
        vx: Math.cos(this.facing) * speed,
        vy: Math.sin(this.facing) * speed,
        radius: 16,
        color,
        fromPlayer: true,
        kind: arch === 'bow' ? 'arrow' : arch === 'fire_staff' ? 'fire' : arch === 'frost_staff' ? 'ice' : 'nature',
        damage: Math.round(stats.attack * riposteBoost),
        damageType: stats.damageType,
        life: 0.62,
        hitIds: new Set(),
      });
    } else {
      sound.playSwing(arch === 'greataxe' || arch === 'hammer');
      const range = arch === 'spear' ? 115 : arch === 'greataxe' ? 98 : 84;
      this.groundEffects.push({
        x: this.progress.x,
        y: this.progress.y,
        radius: range,
        color: forceCrit ? '#FFE066' : '#F5E6CA',
        life: 0.16,
        maxLife: 0.16,
        kind: 'cone',
        angle: this.facing,
      });
      this.dealConeDamage(
        this.progress.x,
        this.progress.y,
        this.facing,
        range,
        1.1,
        Math.round(stats.attack * riposteBoost),
        stats.damageType,
        forceCrit,
      );
    }
  }

  public castSlotWithPointer(slotIndex: number): void {
    const slot = this.getActionBarSlots()[slotIndex];
    if (!slot) return;
    const skill = slot.def;
    const angle = Math.atan2(this.pointerWorld.y - this.progress.y, this.pointerWorld.x - this.progress.x);
    if (skill.aimType !== 'self') this.facing = angle;
    const dist = Math.min(skill.range, Math.hypot(this.pointerWorld.x - this.progress.x, this.pointerWorld.y - this.progress.y));
    const tx = this.progress.x + Math.cos(angle) * dist;
    const ty = this.progress.y + Math.sin(angle) * dist;
    this.executeSkill(slot.bindingId, skill, angle, tx, ty);
  }

  private executeSkill(
    bindingId: string,
    skill: SkillDef,
    angle: number,
    targetX: number,
    targetY: number,
  ): void {
    if (this.screen !== 'PLAYING' || (this.slotCooldowns[bindingId] ?? 0) > 0) return;
    if (this.progress.energy < skill.energyCost) {
      sound.playError();
      this.showToast('Not enough Energy — drink a Silverleaf Draught!', 'warn');
      return;
    }
    if (this.mounted) this.dismount('Dismounted for ability');
    this.gatherTask = null;

    const stats = this.getDerivedStats();
    this.progress.energy -= skill.energyCost;
    this.slotCooldowns[bindingId] = skill.cooldown * (1 - stats.cooldownReduction);
    this.swingAnim = 1;

    const riposteBoost = this.riposteReady && skill.damageMult > 0 ? 1.75 : 1;
    const forceCrit = this.riposteReady && skill.damageMult > 0;
    if (forceCrit) this.riposteReady = false;

    const dmg = Math.round(stats.attack * skill.damageMult * riposteBoost);

    // 1. Utility / Armor effects: Heal, Energy Restore, Shield Barrier, Timed Buffs
    let didUtility = false;
    if (skill.healAmount && skill.healAmount > 0) {
      sound.playHeal();
      const healed = Math.round(skill.healAmount + stats.attack * 0.55);
      this.progress.hp = Math.min(this.progress.maxHp, this.progress.hp + healed);
      this.spawnParticles(this.progress.x, this.progress.y, '#7FF598', 18, 120);
      this.spawnFloatText(this.progress.x, this.progress.y - 26, `+${healed} HP`, '#7FF598', 15);
      didUtility = true;
    }

    if (skill.energyRestore && skill.energyRestore > 0) {
      sound.playMagic();
      this.progress.energy = Math.min(this.progress.maxEnergy, this.progress.energy + skill.energyRestore);
      this.spawnParticles(this.progress.x, this.progress.y, '#8CD1FF', 16, 110);
      this.spawnFloatText(this.progress.x, this.progress.y - 40, `+${skill.energyRestore} EN`, '#8CD1FF', 14);
      didUtility = true;
    }

    if (skill.shieldAmount && skill.shieldAmount > 0) {
      sound.playParryStance();
      const totalShield = Math.round(skill.shieldAmount + stats.maxHp * 0.14);
      this.shieldHp = Math.max(this.shieldHp, totalShield);
      this.shieldTimer = 6.5;
      this.spawnParticles(this.progress.x, this.progress.y, skill.color, 18, 115, true);
      this.spawnFloatText(this.progress.x, this.progress.y - 32, `+${totalShield} SHIELD`, '#9CE5FA', 14);
      didUtility = true;
    }

    if (skill.buffEffect) {
      const bf = skill.buffEffect;
      this.progress.buffs = this.progress.buffs.filter((b) => b.id !== bf.id);
      this.progress.buffs.push({
        id: bf.id,
        name: bf.name,
        remaining: bf.duration,
        duration: bf.duration,
        attackPct: bf.attackPct ?? 0,
        armorPct: bf.armorPct ?? 0,
        maxHpBonus: 0,
        speedPct: bf.speedPct ?? 0,
        gatherPct: 0,
        regenPerSec: bf.regenPerSec ?? 0,
      });
      this.recomputeVitals(false);
      if (!didUtility) sound.playHeal();
      this.spawnParticles(this.progress.x, this.progress.y, skill.color, 14, 110);
      this.spawnFloatText(this.progress.x, this.progress.y - 46, bf.name.toUpperCase(), skill.color, 13);
      didUtility = true;
    }

    // 2. Spatial / Offensive execution
    if (skill.aimType === 'line') {
      if (skill.damageType === 'piercing') sound.playBow();
      else if (skill.damageType === 'arcane') sound.playMagic();
      else sound.playSwing(true);

      const spd = skill.projectileSpeed ?? 600;
      this.projectiles.push({
        x: this.progress.x + Math.cos(angle) * 20,
        y: this.progress.y + Math.sin(angle) * 20,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: skill.radius,
        color: skill.color,
        fromPlayer: true,
        kind:
          skill.damageType === 'piercing'
            ? 'arrow'
            : skill.damageType === 'slashing'
            ? 'slash'
            : skill.color.includes('74C7')
            ? 'ice'
            : 'fire',
        damage: dmg,
        damageType: skill.damageType,
        life: skill.range / spd,
        stunDuration: skill.stunDuration,
        slowDuration: skill.slowDuration,
        hitIds: new Set(),
      });
    } else if (skill.aimType === 'cone') {
      sound.playSwing(true);
      this.groundEffects.push({
        x: this.progress.x,
        y: this.progress.y,
        radius: skill.range,
        color: skill.color,
        life: 0.28,
        maxLife: 0.28,
        kind: 'cone',
        angle,
      });
      if (dmg > 0) {
        this.dealConeDamage(
          this.progress.x,
          this.progress.y,
          angle,
          skill.range,
          0.95,
          dmg,
          skill.damageType,
          forceCrit,
          skill.stunDuration,
          skill.slowDuration,
        );
      }
      this.spawnParticles(
        this.progress.x + Math.cos(angle) * 55,
        this.progress.y + Math.sin(angle) * 55,
        skill.color,
        14,
        140,
      );
    } else if (skill.aimType === 'dash') {
      sound.playDodge();
      const dist = skill.dashDistance ?? 175;
      const steps = 6;
      const hitSet = new Set<string>();
      for (let i = 1; i <= steps; i++) {
        const nx = this.progress.x + Math.cos(angle) * (dist / steps);
        const ny = this.progress.y + Math.sin(angle) * (dist / steps);
        if (!this.isBlocked(nx, ny)) {
          this.progress.x = nx;
          this.progress.y = ny;
        }
        this.spawnParticles(this.progress.x, this.progress.y, skill.color, 3, 60);
        if (dmg > 0) {
          this.dealRadiusDamage(
            this.progress.x,
            this.progress.y,
            skill.radius,
            dmg,
            skill.damageType,
            forceCrit,
            skill.stunDuration,
            skill.slowDuration,
            hitSet,
          );
        }
      }
      this.groundEffects.push({
        x: this.progress.x,
        y: this.progress.y,
        radius: skill.radius,
        color: skill.color,
        life: 0.3,
        maxLife: 0.3,
        kind: 'ring',
      });
    } else if (skill.aimType === 'aoe') {
      sound.playMagic();
      this.groundEffects.push({
        x: targetX,
        y: targetY,
        radius: skill.radius,
        color: skill.color,
        life: 0.48,
        maxLife: 0.48,
        kind: 'aoe',
      });
      this.spawnParticles(targetX, targetY, skill.color, 26, 170);
      if (this.settings.screenShake) this.shakeMag = Math.max(this.shakeMag, 6);
      if (dmg > 0) {
        this.dealRadiusDamage(
          targetX,
          targetY,
          skill.radius,
          dmg,
          skill.damageType,
          forceCrit,
          skill.stunDuration,
          skill.slowDuration,
        );
      }
    } else {
      // Self radial burst or aura pulse
      this.groundEffects.push({
        x: this.progress.x,
        y: this.progress.y,
        radius: skill.radius,
        color: skill.color,
        life: 0.38,
        maxLife: 0.38,
        kind: dmg > 0 ? 'aoe' : 'ring',
      });
      if (dmg > 0) {
        sound.playSwing(true);
        this.spawnParticles(this.progress.x, this.progress.y, skill.color, 22, 165);
        if (this.settings.screenShake) this.shakeMag = Math.max(this.shakeMag, 5);
        this.dealRadiusDamage(
          this.progress.x,
          this.progress.y,
          skill.radius,
          dmg,
          skill.damageType,
          forceCrit,
          skill.stunDuration,
          skill.slowDuration,
        );
      }
    }
  }

  public triggerDodge(): void {
    if (this.screen !== 'PLAYING' || this.dodgeCd > 0 || this.dodgeTimer > 0) return;
    if (this.mounted) this.dismount();
    this.gatherTask = null;
    if (this.fishing) this.cancelFishing();

    const move = this.getMoveVector();
    if (Math.hypot(move.x, move.y) > 0.1) {
      this.dodgeDirX = move.x;
      this.dodgeDirY = move.y;
      this.facing = Math.atan2(move.y, move.x);
    } else {
      this.dodgeDirX = Math.cos(this.facing);
      this.dodgeDirY = Math.sin(this.facing);
    }

    this.dodgeTimer = 0.32;
    this.dodgeCd = 1.65;
    sound.playDodge();
    this.spawnParticles(this.progress.x, this.progress.y, '#F5E6CA', 12, 110);
  }

  public triggerParry(): void {
    if (this.screen !== 'PLAYING' || this.parryCd > 0 || this.parryTimer > 0) return;
    if (this.mounted) this.dismount();
    this.gatherTask = null;
    this.parryTimer = 0.48;
    this.parryCd = 2.6;
    sound.playParryStance();
    this.spawnParticles(this.progress.x, this.progress.y, '#FFE38A', 8, 70, true);
  }

  public toggleMount(): void {
    if (this.screen !== 'PLAYING') return;
    if (this.mounted) {
      this.dismount('Dismounted');
      return;
    }
    if (!this.progress.equipment.mount) {
      sound.playError();
      this.showToast("No Mount equipped! Craft one at the Hunter's Lodge or buy on the Market.", 'warn');
      return;
    }
    if (this.mountChannel > 0) return;
    this.gatherTask = null;
    if (this.fishing) this.cancelFishing();
    this.mountChannel = 0.01;
    sound.playMount();
    this.showToast('Summoning mount...', 'info');
  }

  private dismount(reason?: string): void {
    if (!this.mounted && this.mountChannel <= 0) return;
    this.mounted = false;
    this.mountChannel = 0;
    if (reason) this.spawnFloatText(this.progress.x, this.progress.y - 24, reason, '#E5D5B8', 11);
  }

  // ================= CONTEXTUAL INTERACTION (GATHER / SKIN / FISH / STATIONS / PORTALS) =================

  public findNearestInteraction(): NearbyInteraction | null {
    const zone = ZONE_CONFIGS[this.progress.zoneId];
    const px = this.progress.x;
    const py = this.progress.y;

    let bestDist = Infinity;
    let best: NearbyInteraction | null = null;

    // 1. Village Structures (Central Chest, Crafting Stations, Market)
    for (const st of zone.structures) {
      const d = Math.hypot(px - st.x, py - st.y);
      if (d <= st.radius + 68 && d < bestDist) {
        bestDist = d;
        best = {
          kind: 'structure',
          id: st.id,
          label: `Open ${st.name}`,
          sublabel: st.subtitle,
        };
      }
    }

    // 2. Travel Portals
    for (const pt of zone.portals) {
      const d = Math.hypot(px - pt.x, py - pt.y);
      if (d <= pt.radius + 45 && d < bestDist) {
        bestDist = d;
        best = {
          kind: 'portal',
          id: pt.id,
          label: `Travel to ${pt.label}`,
          sublabel: pt.recommendedTier,
        };
      }
    }

    // 3. Skinnable Wildlife Carcasses!
    const enemies = this.zoneEnemies.get(this.progress.zoneId) ?? [];
    for (const e of enemies) {
      if (e.state !== 'carcass' || e.skinned || !e.skinTemplateId) continue;
      const d = Math.hypot(px - e.x, py - e.y);
      if (d <= e.radius + 58 && d < bestDist) {
        bestDist = d;
        const knife = this.progress.tools.knife;
        const knifeTier = knife ? ITEM_TEMPLATES[knife.templateId]?.tier ?? 0 : 0;
        const blocked =
          knifeTier < e.tier ? `Need T${e.tier} Skinning Knife (have T${knifeTier})` : undefined;
        best = {
          kind: 'skin',
          id: e.id,
          label: `Skin ${e.name}`,
          sublabel: `T${e.tier} Hide & Meat · Knife`,
          blockedReason: blocked,
        };
      }
    }

    // 4. Resource Nodes & Fishing Shoals!
    const nodes = this.zoneNodes.get(this.progress.zoneId) ?? [];
    for (const n of nodes) {
      if (n.charges <= 0) continue;
      const maxReach = n.kind === 'fish' ? 170 : n.radius + 56;
      const d = Math.hypot(px - n.x, py - n.y);
      if (d <= maxReach && d < bestDist) {
        bestDist = d;
        const tool = this.progress.tools[n.requiredTool];
        const toolTier = tool ? ITEM_TEMPLATES[tool.templateId]?.tier ?? 0 : 0;
        const toolLabel =
          n.requiredTool === 'pickaxe'
            ? 'Pickaxe'
            : n.requiredTool === 'axe'
            ? 'Wood Axe'
            : n.requiredTool === 'sickle'
            ? 'Sickle'
            : n.requiredTool === 'knife'
            ? 'Skinning Knife'
            : 'Fishing Rod';
        const blocked =
          toolTier < n.tier ? `Requires T${n.tier} ${toolLabel} (have T${toolTier})` : undefined;
        best = {
          kind: n.kind === 'fish' ? 'fish' : 'gather',
          id: n.id,
          label: n.kind === 'fish' ? `Cast Rod · ${n.name}` : `Gather ${n.name}`,
          sublabel: `T${n.tier} · ${n.charges}/${n.maxCharges} left`,
          blockedReason: blocked,
        };
      }
    }

    // 5. AI Adventurers (Direct Trade)
    for (const ai of this.aiAdventurers) {
      if (ai.zoneId !== this.progress.zoneId) continue;
      const d = Math.hypot(px - ai.x, py - ai.y);
      if (d <= 78 && d < bestDist) {
        bestDist = d;
        best = {
          kind: 'trade_ai',
          id: ai.id,
          label: `Trade with ${ai.name}`,
          sublabel: ai.title,
        };
      }
    }

    return best;
  }

  public triggerInteract(): void {
    if (this.screen !== 'PLAYING' || this.modalOpen) return;
    if (this.fishing && this.fishing.active) {
      if (this.fishing.phase === 'bite') this.hookBitingFish();
      return;
    }

    const nearby = this.findNearestInteraction();
    if (!nearby) return;

    if (nearby.blockedReason) {
      sound.playError();
      this.showToast(nearby.blockedReason, 'warn');
      this.spawnFloatText(this.progress.x, this.progress.y - 30, nearby.blockedReason, '#FF8A65', 12);
      return;
    }

    if (nearby.kind === 'structure') {
      const st = ZONE_CONFIGS[this.progress.zoneId].structures.find((s) => s.id === nearby.id);
      if (st) this.openStructureModal(st.kind);
      return;
    }

    if (nearby.kind === 'portal') {
      const pt = ZONE_CONFIGS[this.progress.zoneId].portals.find((p) => p.id === nearby.id);
      if (pt) this.travelToZone(pt.targetZone, pt.targetX, pt.targetY);
      return;
    }

    if (nearby.kind === 'trade_ai') {
      const ai = this.aiAdventurers.find((a) => a.id === nearby.id);
      if (ai) {
        this.callbacks.onOpenModal({
          type: 'trade',
          tradeTargetId: ai.id,
          tradeTargetName: ai.name,
          tradeIsAi: true,
        });
      }
      return;
    }

    if (nearby.kind === 'fish') {
      const node = (this.zoneNodes.get(this.progress.zoneId) ?? []).find((n) => n.id === nearby.id);
      if (node) this.startFishing(node);
      return;
    }

    if (nearby.kind === 'gather') {
      const node = (this.zoneNodes.get(this.progress.zoneId) ?? []).find((n) => n.id === nearby.id);
      if (node) {
        if (this.mounted) this.dismount();
        this.facing = Math.atan2(node.y - this.progress.y, node.x - this.progress.x);
        const tool = this.progress.tools[node.requiredTool];
        const bonus = tool ? ITEM_TEMPLATES[tool.templateId]?.stats?.gatherBonus ?? 0 : 0;
        this.gatherTask = {
          kind: 'node',
          targetId: node.id,
          label: `Gathering ${node.name}`,
          elapsed: 0,
          duration: Math.max(0.45, (0.85 + node.tier * 0.14) / (1 + bonus)),
          soundTick: 0,
        };
      }
      return;
    }

    if (nearby.kind === 'skin') {
      const enemy = (this.zoneEnemies.get(this.progress.zoneId) ?? []).find((e) => e.id === nearby.id);
      if (enemy) {
        if (this.mounted) this.dismount();
        this.facing = Math.atan2(enemy.y - this.progress.y, enemy.x - this.progress.x);
        this.gatherTask = {
          kind: 'skin',
          targetId: enemy.id,
          label: `Skinning ${enemy.name}`,
          elapsed: 0,
          duration: 0.85,
          soundTick: 0,
        };
      }
    }
  }

  private openStructureModal(
    kind: 'village_chest' | 'smelter' | 'blacksmith' | 'hunter' | 'mage' | 'alchemist' | 'market',
  ): void {
    if (kind === 'village_chest') {
      this.callbacks.onOpenModal({ type: 'chest' });
    } else if (kind === 'market') {
      this.callbacks.onOpenModal({ type: 'market' });
    } else {
      this.callbacks.onOpenModal({ type: 'craft', station: kind });
    }
  }

  public travelToZone(targetZone: ZoneId, x: number, y: number): void {
    this.gatherTask = null;
    this.fishing = null;
    this.projectiles = [];
    this.groundEffects = [];
    this.progress.zoneId = targetZone;
    this.progress.x = x;
    this.progress.y = y;
    this.camX = x;
    this.camY = y;
    const z = ZONE_CONFIGS[targetZone];
    this.showToast(`Entered ${z.name} (${z.tierLabel})`, z.risk === 'high_risk' ? 'danger' : 'gold');
    this.saveProgress();
    this.emitHud();
  }

  // ================= ALBION-STYLE FISHING MINIGAME =================

  private startFishing(node: ResourceNode): void {
    if (this.mounted) this.dismount();
    this.gatherTask = null;
    this.facing = Math.atan2(node.y - this.progress.y, node.x - this.progress.x);
    sound.playSplash();
    this.spawnParticles(node.x, node.y, '#B8F2FF', 14, 95);

    this.fishing = {
      active: true,
      phase: 'waiting',
      nodeId: node.id,
      bobberX: node.x,
      bobberY: node.y,
      tier: node.tier,
      fishTemplateId: node.dropTemplateId,
      waitTimer: 1.4 + Math.random() * 1.4,
      biteTimer: 2.4,
      fishPos: 45,
      fishVel: 0,
      zoneCenter: 50,
      zoneWidth: Math.max(24, 38 - node.tier * 2.5),
      progress: 18,
      tension: 45,
      holdingReel: false,
    };
    this.showToast('Bobber cast! Watch for the splash bite...', 'info');
    this.emitHud();
  }

  public hookBitingFish(): void {
    if (!this.fishing || this.fishing.phase !== 'bite') return;
    this.fishing.phase = 'reeling';
    this.fishing.holdingReel = true;
    sound.playSplash();
    this.spawnParticles(this.fishing.bobberX, this.fishing.bobberY, '#FFE38A', 16, 120);
    this.emitHud();
  }

  public setFishingReelHold(holding: boolean): void {
    if (!this.fishing || !this.fishing.active) return;
    if (this.fishing.phase === 'bite' && holding) {
      this.hookBitingFish();
      return;
    }
    this.fishing.holdingReel = holding;
  }

  public cancelFishing(): void {
    this.fishing = null;
    this.emitHud();
  }

  private updateFishing(dt: number): void {
    const f = this.fishing;
    if (!f || !f.active) return;

    if (f.phase === 'waiting') {
      f.waitTimer -= dt;
      if (f.waitTimer <= 0) {
        f.phase = 'bite';
        f.biteTimer = 2.6;
        sound.playFishBite();
        this.spawnParticles(f.bobberX, f.bobberY, '#E0FAFF', 16, 110, true);
      }
      return;
    }

    if (f.phase === 'bite') {
      f.biteTimer -= dt;
      if (f.biteTimer <= 0) {
        sound.playError();
        this.showToast('The fish slipped away! Cast again.', 'warn');
        this.fishing = null;
      }
      return;
    }

    if (f.phase === 'reeling') {
      // Albion Online tug-of-war: hold to pull right (+tension), release to ease left (-tension)
      const fishPull = 34 + f.tier * 7 + Math.sin(this.elapsedTime * (2.6 + f.tier * 0.4)) * 18;
      const reelForce = f.holdingReel ? 82 : -12;
      f.fishVel += (reelForce - fishPull) * dt * 2.2;
      f.fishVel *= Math.pow(0.25, dt);
      f.fishPos = Math.max(0, Math.min(100, f.fishPos + f.fishVel * dt));

      const halfZone = f.zoneWidth / 2;
      const inSweetSpot = Math.abs(f.fishPos - f.zoneCenter) <= halfZone;
      const gatherMult = this.getDerivedStats().gatherYieldMult;

      if (inSweetSpot) {
        f.progress = Math.min(100, f.progress + (24 + this.progress.mastery.fishing.level * 1.4) * gatherMult * dt);
        if (Math.random() < dt * 8) {
          this.spawnParticles(f.bobberX, f.bobberY, '#9EEBFF', 2, 70);
        }
      } else {
        f.progress = Math.max(0, f.progress - 12 * dt);
      }

      if (f.fishPos >= 98 || f.fishPos <= 2) {
        f.tension += 38 * dt;
      } else {
        f.tension = Math.max(10, f.tension - 24 * dt);
      }

      if (f.tension >= 100) {
        sound.playError();
        this.showToast('Line snapped! Balance hold & release inside the green zone.', 'warn');
        this.fishing = null;
        return;
      }

      if (f.progress >= 100) {
        // CAUGHT!
        const fishTpl = ITEM_TEMPLATES[f.fishTemplateId];
        const qty = Math.random() < 0.25 * gatherMult ? 2 : 1;
        this.addItemToInventory(f.fishTemplateId, qty);
        const xp = 24 * f.tier;
        this.grantMasteryXp('fishing', xp);
        this.grantPlayerXp(Math.round(xp * 0.7));
        sound.playCatch();
        this.spawnParticles(f.bobberX, f.bobberY, '#FFE38A', 22, 145);
        this.spawnFloatText(
          this.progress.x,
          this.progress.y - 34,
          `Caught ${qty}× ${fishTpl?.name ?? 'Fish'}!`,
          '#8CE6FF',
          14,
        );
        this.showToast(`Caught ${qty}× ${fishTpl?.name ?? 'Fish'} (+${xp} Fishing XP)`, 'gold');

        const node = (this.zoneNodes.get(this.progress.zoneId) ?? []).find((n) => n.id === f.nodeId);
        if (node) {
          node.charges = Math.max(0, node.charges - 1);
          if (node.charges <= 0) node.respawnTimer = node.respawnDuration;
        }
        this.fishing = null;
        this.notifyProgress();
      }
    }
  }

  // ================= MAIN 60 FPS SIMULATION LOOP =================

  private loop = (ts: number): void => {
    const rawDt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsedTime += dt;

    if (this.screen === 'TITLE') {
      // Atmospheric golden-hour live world pan over Oakhaven Plaza & Pond
      const angle = this.elapsedTime * 0.16;
      this.camX = 1100 + Math.cos(angle) * 240;
      this.camY = 860 + Math.sin(angle * 0.8) * 165;
      this.updateAiAdventurers(dt);
      this.updateParticles(dt);
    } else if (this.screen === 'PLAYING') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      } else {
        this.updateSimulation(dt);
      }
    }

    this.renderFrame();

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.08) {
      this.hudEmitTimer = 0;
      this.emitHud();
    }

    if (this.screen === 'PLAYING') {
      this.presenceEmitTimer += dt;
      if (this.presenceEmitTimer >= 0.25) {
        this.presenceEmitTimer = 0;
        const st = this.getDerivedStats();
        this.callbacks.onPresenceSync({
          name: this.progress.name,
          zoneId: this.progress.zoneId,
          x: Math.round(this.progress.x),
          y: Math.round(this.progress.y),
          facing: Number(this.facing.toFixed(2)),
          armorClass: st.armorClass,
          weaponArchetype: st.weaponArchetype,
          mounted: this.mounted,
          level: this.progress.level,
        });
      }

      this.saveTimer += dt;
      if (this.saveTimer >= 6) {
        this.saveTimer = 0;
        this.saveProgress();
      }
    }

    if (this.renderer3d) {
      this.rafId = this.renderer3d.scheduleNextFrame(this.loop);
    }
  };

  private updateSimulation(dt: number): void {
    const zone = ZONE_CONFIGS[this.progress.zoneId];
    const stats = this.getDerivedStats();
    this.recomputeVitals(false);

    // Cooldowns & timers
    this.basicAttackCd = Math.max(0, this.basicAttackCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.swingAnim = Math.max(0, this.swingAnim - dt * 4.5);
    this.shakeMag = Math.max(0, this.shakeMag - dt * 24);
    for (const key of Object.keys(this.slotCooldowns)) {
      if (this.slotCooldowns[key] > 0) {
        this.slotCooldowns[key] = Math.max(0, this.slotCooldowns[key] - dt);
      }
    }
    if (this.shieldTimer > 0) {
      this.shieldTimer = Math.max(0, this.shieldTimer - dt);
      if (this.shieldTimer <= 0) this.shieldHp = 0;
    }

    if (this.toast) {
      this.toast.timer -= dt;
      if (this.toast.timer <= 0) this.toast = null;
    }

    // Active Buffs & Natural Regeneration
    let regenPerSec = zone.risk === 'safe' ? 14 : 3.5;
    for (let i = this.progress.buffs.length - 1; i >= 0; i--) {
      const b = this.progress.buffs[i];
      b.remaining -= dt;
      regenPerSec += b.regenPerSec;
      if (b.remaining <= 0) {
        this.progress.buffs.splice(i, 1);
      }
    }
    this.progress.hp = Math.min(this.progress.maxHp, this.progress.hp + regenPerSec * dt);
    this.progress.energy = Math.min(this.progress.maxEnergy, this.progress.energy + 11.5 * dt);

    // Fishing update
    if (this.fishing && this.fishing.active) {
      this.updateFishing(dt);
    }

    // Movement / Dodge / Channel cancellation
    const move = this.getMoveVector();
    const isMoving = Math.hypot(move.x, move.y) > 0.08;

    if (this.dodgeTimer > 0) {
      this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
      const speed = 510;
      const nx = this.progress.x + this.dodgeDirX * speed * dt;
      const ny = this.progress.y + this.dodgeDirY * speed * dt;
      if (!this.isBlocked(nx, ny)) {
        this.progress.x = nx;
        this.progress.y = ny;
      }
    } else if (isMoving && !(this.fishing && this.fishing.active)) {
      if (this.gatherTask) this.gatherTask = null;
      if (this.mountChannel > 0) this.mountChannel = 0;
      const speed = stats.moveSpeed;
      const nx = this.progress.x + move.x * speed * dt;
      const ny = this.progress.y + move.y * speed * dt;
      if (!this.isBlocked(nx, this.progress.y)) this.progress.x = nx;
      if (!this.isBlocked(this.progress.x, ny)) this.progress.y = ny;
      this.facing = Math.atan2(move.y, move.x);
      this.walkCycle += dt * (this.mounted ? 1.45 : 1);

      // Subtle hoof / footstep dust
      if (Math.random() < dt * (this.mounted ? 11 : 4)) {
        this.spawnParticles(this.progress.x, this.progress.y + 10, '#E8D8B8', 1, 24);
      }
    }

    // Clamp player inside zone bounds
    this.progress.x = Math.max(36, Math.min(zone.width - 36, this.progress.x));
    this.progress.y = Math.max(36, Math.min(zone.height - 36, this.progress.y));

    // Mount Summon Channel
    if (this.mountChannel > 0) {
      this.mountChannel += dt;
      if (this.mountChannel >= this.mountChannelDuration) {
        this.mountChannel = 0;
        this.mounted = true;
        this.spawnParticles(this.progress.x, this.progress.y, '#FFE38A', 16, 110);
        const mTpl = this.progress.equipment.mount
          ? ITEM_TEMPLATES[this.progress.equipment.mount.templateId]
          : undefined;
        this.showToast(`Mounted ${mTpl?.name ?? 'Steed'}!`, 'gold');
      }
    }

    // Gather / Skinning Channel
    if (this.gatherTask) {
      this.gatherTask.elapsed += dt;
      this.gatherTask.soundTick += dt;
      if (this.gatherTask.soundTick >= 0.34) {
        this.gatherTask.soundTick = 0;
        if (this.gatherTask.kind === 'skin') {
          sound.playGather('skin');
        } else {
          const n = (this.zoneNodes.get(this.progress.zoneId) ?? []).find(
            (x) => x.id === this.gatherTask?.targetId,
          );
          if (n) {
            sound.playGather(n.kind === 'fish' ? 'herb' : n.kind);
            this.spawnParticles(n.x, n.y, n.accent, 6, 85);
          }
        }
      }
      if (this.gatherTask.elapsed >= this.gatherTask.duration) {
        this.completeGatherTask(this.gatherTask);
        this.gatherTask = null;
      }
    }

    // Update Resource Node Respawns
    for (const node of this.zoneNodes.get(this.progress.zoneId) ?? []) {
      if (node.charges <= 0) {
        node.respawnTimer -= dt;
        if (node.respawnTimer <= 0) {
          node.charges = node.maxCharges;
        }
      }
    }

    // Update Wildlife, Enemies & World Bosses (including skinning carcass expiration & respawns!)
    this.updateEnemies(dt);

    // Update Projectiles, Ground FX, AI Adventurers & Particles
    this.updateProjectiles(dt);
    this.updateAiAdventurers(dt);
    this.updateParticles(dt);

    // Smooth camera tracking
    const lerp = 1 - Math.exp(-8.5 * dt);
    this.camX += (this.progress.x - this.camX) * lerp;
    this.camY += (this.progress.y - this.camY) * lerp;
  }

  private completeGatherTask(task: GatherTask): void {
    const stats = this.getDerivedStats();
    if (task.kind === 'node') {
      const node = (this.zoneNodes.get(this.progress.zoneId) ?? []).find((n) => n.id === task.targetId);
      if (!node || node.charges <= 0) return;

      const tree: MasteryTree =
        node.kind === 'ore' || node.kind === 'stone'
          ? 'mining'
          : node.kind === 'tree'
          ? 'logging'
          : 'harvesting';
      const masteryLvl = this.progress.mastery[tree].level;
      const tool = this.progress.tools[node.requiredTool];
      const toolTier = tool ? ITEM_TEMPLATES[tool.templateId]?.tier ?? 1 : 1;

      const yieldCalc =
        (1 + Math.max(0, toolTier - node.tier) * 0.5 + masteryLvl * 0.1) * stats.gatherYieldMult;
      const qty = Math.max(1, Math.floor(yieldCalc) + (Math.random() < yieldCalc % 1 ? 1 : 0));

      this.addItemToInventory(node.dropTemplateId, qty);
      const primaryTpl = ITEM_TEMPLATES[node.dropTemplateId];
      let msg = `+${qty} ${primaryTpl?.name ?? 'Resource'}`;

      if (node.secondaryDropId && Math.random() < 0.65) {
        this.addItemToInventory(node.secondaryDropId, 1);
        msg += ` · +1 ${ITEM_TEMPLATES[node.secondaryDropId]?.name ?? ''}`;
      }

      node.charges = Math.max(0, node.charges - 1);
      if (node.charges <= 0) node.respawnTimer = node.respawnDuration;

      const xp = 16 * node.tier;
      this.grantMasteryXp(tree, xp);
      this.grantPlayerXp(Math.round(xp * 0.5));
      this.spawnParticles(node.x, node.y, node.accent, 14, 120);
      this.spawnFloatText(node.x, node.y - 24, msg, '#FFE38A', 13);
      this.notifyProgress();
    } else if (task.kind === 'skin') {
      const enemy = (this.zoneEnemies.get(this.progress.zoneId) ?? []).find((e) => e.id === task.targetId);
      if (!enemy || enemy.skinned || !enemy.skinTemplateId) return;

      enemy.skinned = true;
      enemy.state = 'dead';
      enemy.respawnTimer = enemy.respawnDuration;

      const skinLvl = this.progress.mastery.skinning.level;
      const hideQty = Math.max(1, Math.round((1.4 + skinLvl * 0.12) * stats.gatherYieldMult));
      this.addItemToInventory(enemy.skinTemplateId, hideQty);
      const hideTpl = ITEM_TEMPLATES[enemy.skinTemplateId];

      let msg = `+${hideQty} ${hideTpl?.name ?? 'Hide'}`;
      if (enemy.meatTemplateId) {
        const meatQty = enemy.tier >= 3 ? 2 : 1;
        this.addItemToInventory(enemy.meatTemplateId, meatQty);
        msg += ` · +${meatQty} ${ITEM_TEMPLATES[enemy.meatTemplateId]?.name ?? 'Meat'}`;
      }

      const xp = 20 * enemy.tier;
      this.grantMasteryXp('skinning', xp);
      this.grantPlayerXp(Math.round(xp * 0.55));
      sound.playGather('skin');
      this.spawnParticles(enemy.x, enemy.y, '#E8A86B', 14, 110);
      this.spawnFloatText(enemy.x, enemy.y - 24, msg, '#F5C45E', 13);
      this.notifyProgress();
    }
  }

  private updateEnemies(dt: number): void {
    const zone = ZONE_CONFIGS[this.progress.zoneId];
    const enemies = this.zoneEnemies.get(this.progress.zoneId) ?? [];

    for (const e of enemies) {
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.slowTimer = Math.max(0, e.slowTimer - dt);
      e.attackTimer = Math.max(0, e.attackTimer - dt);

      // Dead / Respawn timer
      if (e.state === 'dead') {
        e.respawnTimer -= dt;
        if (e.respawnTimer <= 0) {
          e.hp = e.maxHp;
          e.x = e.homeX;
          e.y = e.homeY;
          e.skinned = false;
          e.state = 'idle';
          e.stateTimer = 1.5;
          this.spawnParticles(e.x, e.y, '#A8E6A3', 10, 80);
        }
        continue;
      }

      // Skinnable Carcass countdown (if unskinned for 24s, disappears and starts respawn!)
      if (e.state === 'carcass') {
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.state = 'dead';
          e.respawnTimer = e.respawnDuration * 0.65;
        }
        continue;
      }

      if (e.state === 'staggered') {
        e.stateTimer -= dt;
        e.vx = 0;
        e.vy = 0;
        if (e.stateTimer <= 0) {
          e.state = 'chase';
        }
        continue;
      }

      const distToPlayer = Math.hypot(this.progress.x - e.x, this.progress.y - e.y);
      const distHome = Math.hypot(e.x - e.homeX, e.y - e.homeY);
      const moveMult = e.slowTimer > 0 ? 0.48 : 1;

      if (e.state === 'windup') {
        e.vx = 0;
        e.vy = 0;
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          this.resolveEnemyAttack(e);
          e.attackTimer = e.attackCooldown;
          e.state = 'chase';
        }
        continue;
      }

      // Proximity aggro check: aggressive animals/monsters attack if player gets too close!
      // Passive animals (deer/birds) also retaliate or buck if player crowds them super closely (< 65px) or attacks them
      if (e.state === 'idle' || e.state === 'roam') {
        const triggerRadius = e.aggressiveOnProximity ? e.aggroRadius : 62;
        if (zone.risk !== 'safe' && distToPlayer < triggerRadius) {
          e.state = 'chase';
          if (e.isBoss) {
            sound.playBossRoar();
            this.showToast(`${e.name} engages you!`, 'danger');
          }
        }
      }

      if (e.state === 'chase') {
        if (distHome > e.leashRadius && distToPlayer > 280) {
          e.state = 'roam';
          e.roamTargetX = e.homeX;
          e.roamTargetY = e.homeY;
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15);
          continue;
        }

        const ang = Math.atan2(this.progress.y - e.y, this.progress.x - e.x);
        e.facing = ang;

        if (distToPlayer <= e.attackRange && e.attackTimer <= 0) {
          e.state = 'windup';
          e.stateTimer = e.windupDuration;
          e.windupAimX = this.progress.x;
          e.windupAimY = this.progress.y;
          if (e.isBoss) sound.playBossRoar();
        } else if (distToPlayer > e.attackRange * 0.78) {
          e.vx = Math.cos(ang) * e.speed * moveMult;
          e.vy = Math.sin(ang) * e.speed * moveMult;
          const nx = e.x + e.vx * dt;
          const ny = e.y + e.vy * dt;
          if (!this.isBlocked(nx, ny)) {
            e.x = nx;
            e.y = ny;
          }
        }
      } else {
        // Natural idle & habitat roaming
        e.stateTimer -= dt;
        if (e.state === 'idle' && e.stateTimer <= 0) {
          e.state = 'roam';
          const a = Math.random() * Math.PI * 2;
          const r = 60 + Math.random() * 140;
          e.roamTargetX = Math.max(90, Math.min(zone.width - 90, e.homeX + Math.cos(a) * r));
          e.roamTargetY = Math.max(90, Math.min(zone.height - 90, e.homeY + Math.sin(a) * r));
          e.stateTimer = 2.5 + Math.random() * 3;
        } else if (e.state === 'roam') {
          const dx = e.roamTargetX - e.x;
          const dy = e.roamTargetY - e.y;
          const d = Math.hypot(dx, dy);
          if (d < 16 || e.stateTimer <= 0) {
            e.state = 'idle';
            e.vx = 0;
            e.vy = 0;
            e.stateTimer = 1.6 + Math.random() * 2.4;
          } else {
            e.facing = Math.atan2(dy, dx);
            e.vx = (dx / d) * e.speed * 0.45;
            e.vy = (dy / d) * e.speed * 0.45;
            const nx = e.x + e.vx * dt;
            const ny = e.y + e.vy * dt;
            if (!this.isBlocked(nx, ny)) {
              e.x = nx;
              e.y = ny;
            } else {
              e.state = 'idle';
              e.stateTimer = 1;
            }
          }
        }
      }
    }
  }

  private resolveEnemyAttack(e: EnemyEntity): void {
    const ang = Math.atan2(e.windupAimY - e.y, e.windupAimX - e.x);

    if (e.windupType === 'projectile') {
      const spd = 420;
      this.projectiles.push({
        x: e.x + Math.cos(ang) * 18,
        y: e.y + Math.sin(ang) * 18,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        radius: 14,
        color: e.accent,
        fromPlayer: false,
        kind: e.damageType === 'arcane' ? 'fire' : 'arrow',
        damage: e.attack,
        damageType: e.damageType,
        life: 1.0,
        hitIds: new Set(),
      });
      return;
    }

    if (e.windupType === 'charge') {
      const dash = e.isBoss ? 140 : 88;
      const nx = e.x + Math.cos(ang) * dash;
      const ny = e.y + Math.sin(ang) * dash;
      if (!this.isBlocked(nx, ny)) {
        e.x = nx;
        e.y = ny;
      }
      this.spawnParticles(e.x, e.y, e.accent, 12, 110);
    }

    const d = Math.hypot(this.progress.x - e.x, this.progress.y - e.y);
    const hitRadius = e.windupType === 'aoe' ? e.windupRadius : e.attackRange + 24;

    if (e.windupType === 'aoe') {
      this.groundEffects.push({
        x: e.x,
        y: e.y,
        radius: e.windupRadius,
        color: e.accent,
        life: 0.35,
        maxLife: 0.35,
        kind: 'aoe',
      });
      if (e.isBoss) this.shakeMag = Math.max(this.shakeMag, 8);
    }

    if (d <= hitRadius) {
      this.applyDamageToPlayer(e.attack, e.damageType, e);
    }
  }

  private applyDamageToPlayer(rawDmg: number, damageType: DamageType, attacker?: EnemyEntity): void {
    // 1. Invulnerable during Dodge-Roll!
    if (this.dodgeTimer > 0) {
      this.spawnFloatText(this.progress.x, this.progress.y - 26, 'DODGED!', '#A8F5C2', 13);
      return;
    }

    // 2. Timed Parry Counter! Negates damage, triggers hitstop, staggers attacker & empowers next hit!
    if (this.parryTimer > 0) {
      this.parryTimer = 0;
      this.parryCd = 1.0; // Refund part of cooldown on skilled parry
      this.riposteReady = true;
      this.hitstopTimer = 0.055;
      if (this.settings.screenShake) this.shakeMag = 7;
      sound.playParrySuccess();
      this.spawnParticles(this.progress.x, this.progress.y, '#FFE38A', 24, 180);
      this.spawnFloatText(this.progress.x, this.progress.y - 34, 'PARRY COUNTER!', '#FFE38A', 16);
      if (attacker) {
        attacker.state = 'staggered';
        attacker.stateTimer = attacker.isBoss ? 1.5 : 2.1;
        this.damageEnemy(attacker, Math.round(this.getDerivedStats().attack * 0.7), 'crushing', true);
      }
      return;
    }

    // 3. Calculate Armor Class + Physical/Magic Defense mitigation
    const stats = this.getDerivedStats();
    const mult = getDamageMultiplier(damageType, stats.armorClass);
    const defense = damageType === 'arcane' ? stats.magicArmor : stats.physArmor;
    const mitigation = 100 / (100 + defense * 1.4);
    let finalDmg = Math.max(3, Math.round(rawDmg * mult * mitigation));

    // Absorb with active Armor Shield barrier first
    if (this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, finalDmg);
      this.shieldHp -= absorbed;
      finalDmg -= absorbed;
      this.spawnFloatText(this.progress.x, this.progress.y - 38, `SHIELD -${absorbed}`, '#9CE5FA', 12);
      if (finalDmg <= 0) {
        sound.playParryStance();
        return;
      }
    }

    this.progress.hp = Math.max(0, this.progress.hp - finalDmg);
    this.hitFlash = 0.2;
    if (this.settings.screenShake) {
      this.shakeMag = Math.max(this.shakeMag, attacker?.isBoss ? 7 : 3.5);
    }
    sound.playHit(false);

    if (this.mounted && (attacker?.isBoss || finalDmg >= 28)) {
      this.dismount('Knocked off mount!');
    }

    const eff = getEffectivenessLabel(mult);
    const tag = eff === 'STRONG' ? '!' : '';
    this.spawnFloatText(this.progress.x, this.progress.y - 26, `-${finalDmg}${tag}`, '#FF6B5B', 14);

    if (this.progress.hp <= 0) {
      this.handlePlayerDefeat(attacker?.name ?? 'Wilderness Hazard');
    }
  }

  private handlePlayerDefeat(cause: string): void {
    const zone = ZONE_CONFIGS[this.progress.zoneId];
    const silverLost =
      zone.risk === 'high_risk'
        ? Math.floor(this.progress.silver * 0.15)
        : zone.risk === 'contested'
        ? Math.floor(this.progress.silver * 0.05)
        : 0;
    this.progress.silver = Math.max(0, this.progress.silver - silverLost);
    this.mounted = false;
    this.gatherTask = null;
    this.fishing = null;
    this.defeatSummary = {
      cause,
      zoneName: zone.name,
      silverLost,
    };
    this.screen = 'DEFEATED';
    this.heldKeys.clear();
    this.stickVec = { x: 0, y: 0 };
    this.saveProgress();
    this.emitHud();
  }

  public respawnInOakhaven(): void {
    this.progress.zoneId = 'oakhaven';
    this.progress.x = ZONE_CONFIGS.oakhaven.spawnX;
    this.progress.y = ZONE_CONFIGS.oakhaven.spawnY;
    this.recomputeVitals(true);
    this.camX = this.progress.x;
    this.camY = this.progress.y;
    this.defeatSummary = undefined;
    this.screen = 'PLAYING';
    this.showToast('Revived safely in Oakhaven Bastion', 'gold');
    this.saveProgress();
    this.emitHud();
  }

  private dealConeDamage(
    ox: number,
    oy: number,
    angle: number,
    range: number,
    halfArc: number,
    baseDmg: number,
    damageType: DamageType,
    forceCrit: boolean,
    stunDuration?: number,
    slowDuration?: number,
  ): void {
    const enemies = this.zoneEnemies.get(this.progress.zoneId) ?? [];
    for (const e of enemies) {
      if (e.state === 'dead' || e.state === 'carcass') continue;
      const dx = e.x - ox;
      const dy = e.y - oy;
      const d = Math.hypot(dx, dy);
      if (d > range + e.radius) continue;
      let diff = Math.atan2(dy, dx) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= halfArc || d < e.radius + 22) {
        this.damageEnemy(e, baseDmg, damageType, forceCrit, stunDuration, slowDuration);
      }
    }
  }

  private dealRadiusDamage(
    cx: number,
    cy: number,
    radius: number,
    baseDmg: number,
    damageType: DamageType,
    forceCrit: boolean,
    stunDuration?: number,
    slowDuration?: number,
    alreadyHit?: Set<string>,
  ): void {
    const enemies = this.zoneEnemies.get(this.progress.zoneId) ?? [];
    for (const e of enemies) {
      if (e.state === 'dead' || e.state === 'carcass') continue;
      if (alreadyHit && alreadyHit.has(e.id)) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d <= radius + e.radius) {
        alreadyHit?.add(e.id);
        this.damageEnemy(e, baseDmg, damageType, forceCrit, stunDuration, slowDuration);
      }
    }
  }

  private damageEnemy(
    e: EnemyEntity,
    baseDmg: number,
    damageType: DamageType,
    forceCrit: boolean,
    stunDuration?: number,
    slowDuration?: number,
  ): void {
    const stats = this.getDerivedStats();
    const mult = getDamageMultiplier(damageType, e.armorClass);
    const isCrit = forceCrit || Math.random() < stats.critChance;
    const critMult = isCrit ? 1.55 : 1;
    const dmg = Math.max(4, Math.round(baseDmg * mult * critMult));

    e.hp = Math.max(0, e.hp - dmg);
    e.hitFlash = 0.16;

    // Aggro immediately if attacked! (Even passive deer/birds fight back when struck!)
    if (e.state === 'idle' || e.state === 'roam') {
      e.state = 'chase';
    }

    if (stunDuration && stunDuration > 0) {
      e.state = 'staggered';
      e.stateTimer = e.isBoss ? stunDuration * 0.55 : stunDuration;
    }
    if (slowDuration && slowDuration > 0) {
      e.slowTimer = Math.max(e.slowTimer, slowDuration);
    }

    sound.playHit(isCrit);
    if (isCrit) {
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.035);
      this.shakeMag = Math.max(this.shakeMag, 4.5);
    }

    const eff = getEffectivenessLabel(mult);
    const suffix = eff === 'STRONG' ? ' STRONG!' : eff === 'RESISTED' ? ' RES' : '';
    const color = isCrit ? '#FFE066' : eff === 'STRONG' ? '#FFA85C' : '#F5EFE6';
    this.spawnFloatText(e.x, e.y - e.radius - 8, `${dmg}${suffix}`, color, isCrit ? 16 : 13);
    this.spawnParticles(e.x, e.y, isCrit ? '#FFE066' : e.accent, isCrit ? 12 : 6, 125);

    if (e.hp <= 0) {
      this.handleEnemyKilled(e);
    }
  }

  private handleEnemyKilled(e: EnemyEntity): void {
    // Rewards: Silver, XP, Rarity Gear / Resource Drops, Boss Artifact Cores!
    const silver =
      e.silverMin + Math.floor(Math.random() * Math.max(1, e.silverMax - e.silverMin + 1));
    this.progress.silver += silver;
    this.grantPlayerXp(e.xpReward);
    this.grantMasteryXp('combat', Math.round(e.xpReward * 0.7));

    this.spawnParticles(e.x, e.y, e.isBoss ? '#FFE38A' : e.accent, e.isBoss ? 34 : 16, 165);
    this.spawnFloatText(e.x, e.y - 36, `+${silver} Silver · +${e.xpReward} XP`, '#FFE38A', 13);

    // Boss Artifact Core + Guaranteed Rare/Epic/Legendary Gear Drop!
    if (e.isBoss) {
      sound.playLevelUp();
      if (e.bossCoreId) {
        this.addItemToInventory(e.bossCoreId, 1);
        this.showToast(`Defeated ${e.name}! Claimed ${ITEM_TEMPLATES[e.bossCoreId]?.name}!`, 'gold');
      }
      const dropRarity = rollDropRarity(e.tier, true);
      const gearPool = [
        `wpn_sword_t${e.tier}`,
        `wpn_greataxe_t${e.tier}`,
        `wpn_bow_t${e.tier}`,
        `wpn_fire_staff_t${e.tier}`,
        `arm_plate_chest_t${e.tier}`,
        `arm_leather_chest_t${e.tier}`,
        `arm_cloth_chest_t${e.tier}`,
      ];
      const pick = gearPool[Math.floor(Math.random() * gearPool.length)];
      if (ITEM_TEMPLATES[pick]) {
        this.addItemToInventory(pick, 1, dropRarity);
        this.spawnFloatText(
          e.x,
          e.y - 56,
          `${RARITY_META[dropRarity].label} ${ITEM_TEMPLATES[pick].name}!`,
          RARITY_META[dropRarity].color,
          15,
        );
      }
    } else if (!e.isAnimal && Math.random() < 0.38) {
      // Monster rarity loot drop
      const dropRarity = rollDropRarity(e.tier, false);
      const lootPool = [
        'pot_heal_minor',
        'pot_energy',
        `wpn_daggers_t${e.tier}`,
        `wpn_spear_t${e.tier}`,
        `arm_plate_helmet_t${e.tier}`,
        `arm_leather_boots_t${e.tier}`,
        `arm_cloth_helmet_t${e.tier}`,
      ];
      const pick = lootPool[Math.floor(Math.random() * lootPool.length)];
      if (ITEM_TEMPLATES[pick]) {
        this.addItemToInventory(pick, 1, ITEM_TEMPLATES[pick].stackable ? undefined : dropRarity);
        this.spawnFloatText(e.x, e.y - 52, `Loot: ${ITEM_TEMPLATES[pick].name}`, RARITY_META[dropRarity].color, 12);
      }
    }

    // Skinnable animals leave a glowing skinnable carcass before respawning!
    if (e.skinTemplateId) {
      e.state = 'carcass';
      e.skinned = false;
      e.stateTimer = 26;
    } else {
      e.state = 'dead';
      e.respawnTimer = e.respawnDuration;
    }

    this.notifyProgress();
  }

  private updateProjectiles(dt: number): void {
    const enemies = this.zoneEnemies.get(this.progress.zoneId) ?? [];
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;

      if (pr.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (pr.fromPlayer) {
        let hit = false;
        for (const e of enemies) {
          if (e.state === 'dead' || e.state === 'carcass' || pr.hitIds.has(e.id)) continue;
          if (Math.hypot(e.x - pr.x, e.y - pr.y) <= e.radius + pr.radius) {
            pr.hitIds.add(e.id);
            this.damageEnemy(e, pr.damage, pr.damageType, false, pr.stunDuration, pr.slowDuration);
            if (pr.kind !== 'slash') {
              hit = true;
              break;
            }
          }
        }
        if (hit) this.projectiles.splice(i, 1);
      } else {
        if (Math.hypot(this.progress.x - pr.x, this.progress.y - pr.y) <= 20 + pr.radius) {
          this.applyDamageToPlayer(pr.damage, pr.damageType);
          this.projectiles.splice(i, 1);
        }
      }
    }

    for (let i = this.groundEffects.length - 1; i >= 0; i--) {
      this.groundEffects[i].life -= dt;
      if (this.groundEffects[i].life <= 0) this.groundEffects.splice(i, 1);
    }
  }

  private updateAiAdventurers(dt: number): void {
    for (const ai of this.aiAdventurers) {
      const zone = ZONE_CONFIGS[ai.zoneId];
      const dx = ai.targetX - ai.x;
      const dy = ai.targetY - ai.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 18) {
        ai.waitTimer -= dt;
        if (ai.waitTimer <= 0) {
          ai.waitTimer = 2 + Math.random() * 3.5;
          if (ai.zoneId === 'oakhaven') {
            const st = zone.structures[Math.floor(Math.random() * zone.structures.length)];
            const a = Math.random() * Math.PI * 2;
            ai.targetX = st.x + Math.cos(a) * (st.radius + 45);
            ai.targetY = st.y + Math.sin(a) * (st.radius + 45);
          } else {
            ai.targetX = 350 + Math.random() * (zone.width - 700);
            ai.targetY = 350 + Math.random() * (zone.height - 700);
          }
        }
      } else {
        const spd = ai.mounted ? 115 : 78;
        ai.facing = Math.atan2(dy, dx);
        ai.x += (dx / dist) * spd * dt;
        ai.y += (dy / dist) * spd * dt;
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  // ================= INVENTORY, EQUIPMENT, CHEST, CRAFTING, CONSUMABLES, TRADE =================

  public addItemToInventory(templateId: string, qty: number, rarityOverride?: InventoryItem['rarity']): void {
    const tpl = ITEM_TEMPLATES[templateId];
    if (!tpl || qty <= 0) return;

    // Auto-equip upgraded gathering tools into the tool belt when enabled in settings
    if (this.settings.autoEquipTools && tpl.category === 'tool' && tpl.toolType && qty === 1) {
      const current = this.progress.tools[tpl.toolType];
      const currentTier = current ? ITEM_TEMPLATES[current.templateId]?.tier ?? 0 : 0;
      if (tpl.tier > currentTier) {
        this.progress.tools[tpl.toolType] = createItemInstance(templateId, 1, rarityOverride);
        if (current) this.progress.inventory.push(current);
        return;
      }
    }

    if (tpl.stackable) {
      const existing = this.progress.inventory.find((i) => i.templateId === templateId);
      if (existing) {
        existing.qty += qty;
        return;
      }
      this.progress.inventory.push(createItemInstance(templateId, qty));
    } else {
      for (let i = 0; i < qty; i++) {
        this.progress.inventory.push(createItemInstance(templateId, 1, rarityOverride));
      }
    }
  }

  public getItemCount(templateId: string): number {
    return this.progress.inventory
      .filter((i) => i.templateId === templateId)
      .reduce((acc, it) => acc + it.qty, 0);
  }

  public consumeItemsFromInventory(templateId: string, qty: number): boolean {
    if (this.getItemCount(templateId) < qty) return false;
    let remaining = qty;
    for (let i = this.progress.inventory.length - 1; i >= 0 && remaining > 0; i--) {
      const item = this.progress.inventory[i];
      if (item.templateId !== templateId) continue;
      if (item.qty <= remaining) {
        remaining -= item.qty;
        this.progress.inventory.splice(i, 1);
      } else {
        item.qty -= remaining;
        remaining = 0;
      }
    }
    return true;
  }

  public equipItem(uid: string): void {
    const idx = this.progress.inventory.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const item = this.progress.inventory[idx];
    const tpl = ITEM_TEMPLATES[item.templateId];
    if (!tpl) return;

    if (tpl.category === 'tool' && tpl.toolType) {
      const prev = this.progress.tools[tpl.toolType];
      this.progress.tools[tpl.toolType] = item;
      this.progress.inventory.splice(idx, 1);
      if (prev) this.progress.inventory.push(prev);
      sound.playCraft();
      this.showToast(`Equipped ${tpl.name}`, 'gold');
    } else if (
      ['weapon', 'offhand', 'helmet', 'chest', 'boots', 'cape', 'bag', 'mount'].includes(tpl.category)
    ) {
      const slot = tpl.category as EquipSlot;
      const prev = this.progress.equipment[slot];
      this.progress.equipment[slot] = item;
      this.progress.inventory.splice(idx, 1);
      if (prev) this.progress.inventory.push(prev);
      if (slot === 'mount') this.mounted = false;
      this.recomputeVitals(false);
      sound.playCraft();
      this.showToast(`Equipped ${tpl.name}`, 'gold');
    } else if (tpl.category === 'consumable') {
      this.useConsumableByUid(uid);
      return;
    }

    this.saveProgress();
    this.notifyProgress();
    this.emitHud();
  }

  public unequipSlot(slot: EquipSlot): void {
    const item = this.progress.equipment[slot];
    if (!item) return;
    delete this.progress.equipment[slot];
    if (slot === 'mount') this.mounted = false;
    this.progress.inventory.push(item);
    this.recomputeVitals(false);
    this.saveProgress();
    this.notifyProgress();
    this.emitHud();
  }

  public useQuickPotion(): void {
    const pot =
      this.progress.inventory.find((i) => i.templateId === this.progress.quickPotionTemplateId) ??
      this.progress.inventory.find((i) => ITEM_TEMPLATES[i.templateId]?.consumable?.healHp);
    if (!pot) {
      sound.playError();
      this.showToast('No potions or food in bag!', 'warn');
      return;
    }
    this.useConsumableByUid(pot.uid);
  }

  public useConsumableByUid(uid: string): void {
    const idx = this.progress.inventory.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const item = this.progress.inventory[idx];
    const tpl = ITEM_TEMPLATES[item.templateId];
    if (!tpl || !tpl.consumable) return;

    const c = tpl.consumable;
    if (c.healHp) {
      this.progress.hp = Math.min(this.progress.maxHp, this.progress.hp + c.healHp);
      this.spawnFloatText(this.progress.x, this.progress.y - 28, `+${c.healHp} HP`, '#7FF598', 14);
    }
    if (c.restoreEnergy) {
      this.progress.energy = Math.min(this.progress.maxEnergy, this.progress.energy + c.restoreEnergy);
      this.spawnFloatText(this.progress.x, this.progress.y - 44, `+${c.restoreEnergy} EN`, '#8CD1FF', 14);
    }
    if (c.buffId && c.duration) {
      this.progress.buffs = this.progress.buffs.filter((b) => b.id !== c.buffId);
      const buff: ActiveBuff = {
        id: c.buffId,
        name: c.buffName ?? tpl.name,
        remaining: c.duration,
        duration: c.duration,
        attackPct: c.attackPct ?? 0,
        armorPct: c.armorPct ?? 0,
        maxHpBonus: c.maxHpBonus ?? 0,
        speedPct: c.speedPct ?? 0,
        gatherPct: c.gatherPct ?? 0,
        regenPerSec: c.regenPerSec ?? 0,
      };
      this.progress.buffs.push(buff);
      this.recomputeVitals(false);
    }

    item.qty -= 1;
    if (item.qty <= 0) this.progress.inventory.splice(idx, 1);

    sound.playHeal();
    this.spawnParticles(this.progress.x, this.progress.y, tpl.iconColor, 14, 95);
    this.showToast(`Used ${tpl.name}`, 'info');
    this.saveProgress();
    this.notifyProgress();
    this.emitHud();
  }

  public craftRecipe(recipeId: string): { ok: boolean; message: string } {
    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { ok: false, message: 'Recipe not found' };
    if (this.progress.silver < recipe.silverCost) {
      sound.playError();
      return { ok: false, message: `Need ${recipe.silverCost} Silver` };
    }
    for (const ing of recipe.ingredients) {
      if (this.getItemCount(ing.templateId) < ing.qty) {
        sound.playError();
        const name = ITEM_TEMPLATES[ing.templateId]?.name ?? ing.templateId;
        return { ok: false, message: `Missing ${ing.qty}× ${name}` };
      }
    }

    this.progress.silver -= recipe.silverCost;
    for (const ing of recipe.ingredients) {
      this.consumeItemsFromInventory(ing.templateId, ing.qty);
    }

    const outTpl = ITEM_TEMPLATES[recipe.outputTemplateId];
    // Chance to roll upgraded rarity when crafting gear!
    let craftedRarity = outTpl.rarity;
    if (!outTpl.stackable && outTpl.category !== 'tool') {
      const craftLvl = this.progress.mastery.crafting.level;
      const roll = Math.random() - craftLvl * 0.015;
      if (roll < 0.08 && craftedRarity === 'common') craftedRarity = 'rare';
      else if (roll < 0.28 && craftedRarity === 'common') craftedRarity = 'uncommon';
      else if (roll < 0.14 && craftedRarity === 'uncommon') craftedRarity = 'rare';
    }

    this.addItemToInventory(recipe.outputTemplateId, recipe.outputQty, craftedRarity);
    this.grantMasteryXp(recipe.xpTree, recipe.xpReward);
    this.grantPlayerXp(Math.round(recipe.xpReward * 0.55));
    sound.playCraft();
    this.spawnParticles(this.progress.x, this.progress.y, '#FFE38A', 16, 115);

    const msg = `Crafted ${recipe.outputQty}× ${outTpl.name}!`;
    this.showToast(msg, 'gold');
    this.saveProgress();
    this.notifyProgress();
    this.emitHud();
    return { ok: true, message: msg };
  }

  public canCraftRecipe(recipe: CraftingRecipe): boolean {
    if (this.progress.silver < recipe.silverCost) return false;
    return recipe.ingredients.every((ing) => this.getItemCount(ing.templateId) >= ing.qty);
  }

  // Central Village Storage Chest operations
  public depositToChest(uid: string): void {
    const idx = this.progress.inventory.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const item = this.progress.inventory[idx];
    const tpl = ITEM_TEMPLATES[item.templateId];
    this.progress.inventory.splice(idx, 1);

    if (tpl?.stackable) {
      const ex = this.progress.villageChest.find((c) => c.templateId === item.templateId);
      if (ex) {
        ex.qty += item.qty;
      } else {
        this.progress.villageChest.push(item);
      }
    } else {
      this.progress.villageChest.push(item);
    }
    sound.playCoin();
    this.saveProgress();
    this.notifyProgress();
  }

  public withdrawFromChest(uid: string): void {
    const idx = this.progress.villageChest.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const item = this.progress.villageChest[idx];
    this.progress.villageChest.splice(idx, 1);
    this.addItemToInventory(item.templateId, item.qty, item.rarity);
    sound.playCoin();
    this.saveProgress();
    this.notifyProgress();
  }

  public depositAllResourcesToChest(): void {
    let moved = 0;
    for (let i = this.progress.inventory.length - 1; i >= 0; i--) {
      const it = this.progress.inventory[i];
      const tpl = ITEM_TEMPLATES[it.templateId];
      if (tpl && (tpl.category === 'resource' || tpl.category === 'refined')) {
        this.depositToChest(it.uid);
        moved++;
      }
    }
    if (moved > 0) this.showToast(`Stored ${moved} resource stacks in Village Chest`, 'gold');
  }

  public transferChestSilver(amount: number, direction: 'deposit' | 'withdraw'): void {
    const amt = Math.max(0, Math.floor(amount));
    if (amt <= 0) return;
    if (direction === 'deposit') {
      const actual = Math.min(amt, this.progress.silver);
      this.progress.silver -= actual;
      this.progress.chestSilver += actual;
    } else {
      const actual = Math.min(amt, this.progress.chestSilver);
      this.progress.chestSilver -= actual;
      this.progress.silver += actual;
    }
    sound.playCoin();
    this.saveProgress();
    this.notifyProgress();
  }

  // Market & Direct Trade Helpers
  public removeItemForMarketListing(uid: string): InventoryItem | null {
    const idx = this.progress.inventory.findIndex((i) => i.uid === uid);
    if (idx === -1) return null;
    const [removed] = this.progress.inventory.splice(idx, 1);
    this.saveProgress();
    this.notifyProgress();
    return removed;
  }

  public restoreCancelledListingItem(item: InventoryItem): void {
    this.addItemToInventory(item.templateId, item.qty, item.rarity);
    this.saveProgress();
    this.notifyProgress();
  }

  public completeMarketPurchase(listing: MarketListing): boolean {
    if (this.progress.silver < listing.price) {
      sound.playError();
      this.showToast('Not enough Silver!', 'warn');
      return false;
    }
    this.progress.silver -= listing.price;
    this.addItemToInventory(listing.item.templateId, listing.item.qty, listing.item.rarity);
    sound.playCoin();
    this.showToast(
      `Bought ${listing.item.qty}× ${ITEM_TEMPLATES[listing.item.templateId]?.name} for ${listing.price} Silver`,
      'gold',
    );
    this.saveProgress();
    this.notifyProgress();
    return true;
  }

  public creditMarketSale(itemName: string, silverEarned: number, buyerName: string): void {
    this.progress.silver += silverEarned;
    sound.playCoin();
    this.showToast(`${buyerName} bought your ${itemName} for +${silverEarned} Silver!`, 'gold');
    this.saveProgress();
    this.notifyProgress();
  }

  public buyFromAiAdventurer(aiId: string, templateId: string): boolean {
    const ai = this.aiAdventurers.find((a) => a.id === aiId);
    if (!ai) return false;
    const stock = ai.tradeInventory.find((s) => s.templateId === templateId && s.qty > 0);
    if (!stock) return false;
    if (this.progress.silver < stock.price) {
      sound.playError();
      this.showToast('Not enough Silver for trade!', 'warn');
      return false;
    }
    this.progress.silver -= stock.price;
    stock.qty -= 1;
    this.addItemToInventory(templateId, 1);
    sound.playCoin();
    this.showToast(`Traded ${stock.price} Silver for ${ITEM_TEMPLATES[templateId]?.name}`, 'gold');
    this.saveProgress();
    this.notifyProgress();
    return true;
  }

  public sellToAiAdventurer(uid: string): boolean {
    const idx = this.progress.inventory.findIndex((i) => i.uid === uid);
    if (idx === -1) return false;
    const item = this.progress.inventory[idx];
    const tpl = ITEM_TEMPLATES[item.templateId];
    if (!tpl) return false;
    const payout = Math.max(5, Math.round(tpl.basePrice * 0.78 * RARITY_META[item.rarity].mult * item.qty));
    this.progress.inventory.splice(idx, 1);
    this.progress.silver += payout;
    sound.playCoin();
    this.showToast(`Sold ${item.qty}× ${tpl.name} for +${payout} Silver`, 'gold');
    this.saveProgress();
    this.notifyProgress();
    return true;
  }

  // ================= XP, MASTERY, HELPERS & RENDERING =================

  private grantPlayerXp(amount: number): void {
    this.progress.xp += amount;
    while (this.progress.xp >= this.progress.xpToNext) {
      this.progress.xp -= this.progress.xpToNext;
      this.progress.level += 1;
      this.progress.xpToNext = Math.round(120 * Math.pow(1.28, this.progress.level - 1));
      this.recomputeVitals(true);
      sound.playLevelUp();
      this.spawnParticles(this.progress.x, this.progress.y, '#FFE38A', 28, 170);
      this.spawnFloatText(this.progress.x, this.progress.y - 46, `LEVEL ${this.progress.level}!`, '#FFE38A', 18);
      this.showToast(`Reached Adventurer Level ${this.progress.level}!`, 'gold');
    }
  }

  private grantMasteryXp(tree: MasteryTree, amount: number): void {
    const m = this.progress.mastery[tree];
    m.xp += amount;
    const needed = m.level * 90;
    if (m.xp >= needed) {
      m.xp -= needed;
      m.level += 1;
      this.showToast(`${tree.charAt(0).toUpperCase() + tree.slice(1)} Mastery Lv.${m.level}!`, 'gold');
    }
  }

  private getMoveVector(): { x: number; y: number } {
    let inX = this.stickVec.x;
    let inY = this.stickVec.y;
    if (this.heldKeys.has('w') || this.heldKeys.has('arrowup')) inY -= 1;
    if (this.heldKeys.has('s') || this.heldKeys.has('arrowdown')) inY += 1;
    if (this.heldKeys.has('a') || this.heldKeys.has('arrowleft')) inX -= 1;
    if (this.heldKeys.has('d') || this.heldKeys.has('arrowright')) inX += 1;
    const mag = Math.hypot(inX, inY);
    if (mag > 1) {
      inX /= mag;
      inY /= mag;
    }
    // Align screen movement cleanly with the slight-3/4 Albion camera yaw (atan2(4.2, 16.4))
    const camYaw = 0.2507;
    const cosA = Math.cos(camYaw);
    const sinA = Math.sin(camYaw);
    return {
      x: inX * cosA + inY * sinA,
      y: -inX * sinA + inY * cosA,
    };
  }

  private isBlocked(x: number, y: number): boolean {
    const zone = ZONE_CONFIGS[this.progress.zoneId];
    if (x < 30 || x > zone.width - 30 || y < 30 || y > zone.height - 30) return true;
    for (const w of zone.waterPools) {
      const dx = (x - w.x) / (w.rx - 4);
      const dy = (y - w.y) / (w.ry - 4);
      if (dx * dx + dy * dy < 1) return true;
    }
    for (const st of zone.structures) {
      if (Math.hypot(x - st.x, y - st.y) < st.radius * 0.72) return true;
    }
    return false;
  }

  private spawnParticles(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    ring = false,
  ): void {
    const cap =
      this.settings.graphicsQuality === 'low'
        ? 70
        : this.settings.graphicsQuality === 'medium'
        ? 150
        : 260;
    if (this.particles.length > cap) return;
    const adjustedCount =
      this.settings.graphicsQuality === 'low' ? Math.max(1, Math.round(count * 0.45)) : count;
    for (let i = 0; i < adjustedCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: ring ? 16 + Math.random() * 8 : 3 + Math.random() * 4,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        color,
        gravity: ring ? 0 : 90,
        ring: ring && i === 0,
      });
    }
  }

  private spawnFloatText(x: number, y: number, text: string, color: string, size = 13): void {
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 14,
      y,
      vy: -42,
      text,
      color,
      size,
      life: 1.05,
      maxLife: 1.05,
    });
  }

  public showToast(text: string, tone: 'info' | 'gold' | 'warn' | 'danger' = 'info'): void {
    this.toast = { id: this.toastSeq++, text, tone, timer: 3.4 };
  }

  private notifyProgress(): void {
    this.callbacks.onProgressChange({
      ...this.progress,
      inventory: [...this.progress.inventory],
      villageChest: [...this.progress.villageChest],
      equipment: { ...this.progress.equipment },
      tools: { ...this.progress.tools },
      buffs: [...this.progress.buffs],
      gearSpellChoice: this.progress.gearSpellChoice
        ? { ...this.progress.gearSpellChoice }
        : { helmet: 0, chest: 0, boots: 0 },
      actionBarSlots: this.progress.actionBarSlots
        ? [...this.progress.actionBarSlots]
        : [...DEFAULT_ACTION_BAR_SLOTS],
    });
  }

  private renderFrame(): void {
    if (!this.renderer3d) return;
    const zone = ZONE_CONFIGS[this.progress.zoneId];
    const stats = this.getDerivedStats();
    const mountItem = this.progress.equipment.mount;
    const mountTpl = mountItem ? ITEM_TEMPLATES[mountItem.templateId] : undefined;
    const offhandItem = this.progress.equipment.offhand;
    const offhandTpl = offhandItem ? ITEM_TEMPLATES[offhandItem.templateId] : undefined;

    const playerRender: RenderPlayerState = {
      x: this.progress.x,
      y: this.progress.y,
      facing: this.facing,
      walkCycle: this.walkCycle,
      swingAnim: this.swingAnim,
      dodgeTimer: this.dodgeTimer,
      parryTimer: this.parryTimer,
      riposteReady: this.riposteReady,
      hitFlash: this.hitFlash,
      mounted: this.mounted,
      mountKind: mountTpl?.mountKind,
      armorClass: stats.armorClass,
      weaponArchetype: stats.weaponArchetype,
      offhandStyle: offhandTpl?.offhandStyle,
      shieldHp: this.shieldHp,
      hasCape: Boolean(this.progress.equipment.cape),
      gatherChannelPct: this.gatherTask ? Math.min(1, this.gatherTask.elapsed / this.gatherTask.duration) : 0,
      mountChannelPct: this.mountChannel > 0 ? Math.min(1, this.mountChannel / this.mountChannelDuration) : 0,
      name: this.progress.name,
      hp: this.progress.hp,
      maxHp: this.progress.maxHp,
    };

    const shakeX = this.settings.screenShake && this.shakeMag > 0.2 ? (Math.random() - 0.5) * this.shakeMag * 2 : 0;
    const shakeY = this.settings.screenShake && this.shakeMag > 0.2 ? (Math.random() - 0.5) * this.shakeMag * 2 : 0;
    const nearby = this.screen === 'PLAYING' ? this.findNearestInteraction() : null;

    this.renderer3d.render(
      this.elapsedTime,
      this.camX,
      this.camY,
      shakeX,
      shakeY,
      zone,
      this.zoneNodes.get(this.progress.zoneId) ?? [],
      this.zoneEnemies.get(this.progress.zoneId) ?? [],
      this.aiAdventurers,
      this.remotePlayers,
      playerRender,
      this.projectiles,
      this.groundEffects,
      this.particles,
      this.floatingTexts,
      this.fishing,
      this.aimPreview,
      nearby?.id ?? null,
      this.settings,
      this.screen === 'TITLE',
    );
  }

  private emitHud(): void {
    const zone = ZONE_CONFIGS[this.progress.zoneId];
    const stats = this.getDerivedStats();
    const enemies = this.zoneEnemies.get(this.progress.zoneId) ?? [];

    let activeBoss: HudSnapshot['activeBoss'] = null;
    for (const e of enemies) {
      if (
        e.isBoss &&
        e.state !== 'dead' &&
        e.state !== 'carcass' &&
        Math.hypot(e.x - this.progress.x, e.y - this.progress.y) < 540
      ) {
        activeBoss = {
          name: e.name,
          hp: Math.ceil(e.hp),
          maxHp: e.maxHp,
          tier: e.tier,
          state: e.state === 'staggered' ? 'STAGGERED' : e.state === 'windup' ? 'CHARGING ATTACK' : 'ACTIVE',
        };
        break;
      }
    }

    const potCount = this.progress.inventory
      .filter((i) => ITEM_TEMPLATES[i.templateId]?.consumable?.healHp)
      .reduce((acc, i) => acc + i.qty, 0);
    const firstPot = this.progress.inventory.find((i) => ITEM_TEMPLATES[i.templateId]?.consumable?.healHp);

    this.callbacks.onHudUpdate({
      screen: this.screen,
      zoneId: zone.id,
      zoneName: zone.name,
      zoneTier: zone.tierLabel,
      zoneRisk: zone.risk,
      playerName: this.progress.name,
      level: this.progress.level,
      xp: this.progress.xp,
      xpToNext: this.progress.xpToNext,
      hp: Math.ceil(this.progress.hp),
      maxHp: Math.ceil(this.progress.maxHp),
      shieldHp: Math.ceil(this.shieldHp),
      energy: Math.ceil(this.progress.energy),
      maxEnergy: Math.ceil(this.progress.maxEnergy),
      silver: this.progress.silver,
      carryWeight: this.getCarryWeight(),
      maxCarryWeight: stats.maxCarryWeight,
      mounted: this.mounted,
      hasMountEquipped: Boolean(this.progress.equipment.mount),
      mountChannelPct: this.mountChannel > 0 ? Math.min(1, this.mountChannel / this.mountChannelDuration) : 0,
      gatherChannelPct: this.gatherTask ? Math.min(1, this.gatherTask.elapsed / this.gatherTask.duration) : 0,
      gatherLabel: this.gatherTask?.label ?? '',
      parryActive: this.parryTimer > 0,
      riposteReady: this.riposteReady,
      dodgeCooldownPct: this.dodgeCd / 1.65,
      parryCooldownPct: this.parryCd / 2.6,
      skills: this.getActionBarSlots(),
      quickPotionCount: potCount,
      quickPotionName: firstPot ? ITEM_TEMPLATES[firstPot.templateId]?.name ?? 'Potion' : 'No Potion',
      buffs: [...this.progress.buffs],
      nearby: this.screen === 'PLAYING' ? this.findNearestInteraction() : null,
      activeBoss,
      fishing: this.fishing ? { ...this.fishing } : null,
      onlineCount: this.onlineCount,
      toast: this.toast ? { id: this.toast.id, text: this.toast.text, tone: this.toast.tone } : null,
      minimap: {
        width: zone.width,
        height: zone.height,
        playerX: this.progress.x,
        playerY: this.progress.y,
        structures: zone.structures.map((s) => ({
          x: s.x,
          y: s.y,
          color: s.accent,
          isCenter: s.kind === 'village_chest',
        })),
        portals: zone.portals.map((p) => ({ x: p.x, y: p.y, label: p.label })),
        bosses: enemies
          .filter((e) => e.isBoss)
          .map((b) => ({ x: b.x, y: b.y, alive: b.state !== 'dead' && b.state !== 'carcass' })),
        adventurers: [
          ...this.aiAdventurers
            .filter((a) => a.zoneId === zone.id)
            .map((a) => ({ x: a.x, y: a.y, isPlayer: false })),
          ...this.remotePlayers
            .filter((r) => r.zoneId === zone.id)
            .map((r) => ({ x: r.x, y: r.y, isPlayer: true })),
        ],
      },
      armorClass: stats.armorClass,
      weaponDamageType: stats.damageType,
      muted: sound.muted,
      settings: { ...this.settings },
      defeatSummary: this.defeatSummary,
    });
  }
}
