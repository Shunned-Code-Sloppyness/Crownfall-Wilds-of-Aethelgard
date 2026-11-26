import React, { useMemo, useState } from 'react';
import {
  X,
  ArrowRightLeft,
  Coins,
  Hammer,
  Shield,
  Sparkles,
  Store,
  SlidersHorizontal,
  Monitor,
  Gamepad2,
  RotateCcw,
} from 'lucide-react';
import {
  ARMOR_ABILITIES,
  CRAFTING_RECIPES,
  DAMAGE_MATRIX,
  getEffectiveItemPower,
  ITEM_TEMPLATES,
  RARITY_META,
  WEAPON_SKILLS,
} from '../game/catalog';
import { CrownfallEngine, SLOT_HOTKEYS } from '../game/engine';
import {
  ActiveModalState,
  CraftingStationType,
  EquipSlot,
  HudSnapshot,
  MarketListing,
  PlayerProgress,
  Tier,
  ToolType,
} from '../game/types';

interface GameModalsProps {
  engine: CrownfallEngine;
  hud: HudSnapshot;
  progress: PlayerProgress;
  modal: ActiveModalState;
  marketListings: MarketListing[];
  clientId: string;
  onClose: () => void;
  onOpenModal: (next: ActiveModalState) => void;
  onListMarketItem: (uid: string, price: number) => Promise<void>;
  onBuyMarketListing: (listing: MarketListing) => Promise<void>;
  onCancelMarketListing: (listingId: string) => Promise<void>;
  onRefreshMarket: () => Promise<void>;
}

const STATION_META: Record<CraftingStationType, { label: string; desc: string }> = {
  smelter: { label: 'Smelter & Refinery', desc: 'Smelt Iron & Copper Ore into Bars · Planks · Cloth · Leather' },
  blacksmith: { label: 'Blacksmith Forge', desc: 'Forge Swords, Axes, Hammers, Shields, Bucklers, Plate Armor & Tools' },
  hunter: { label: "Hunter's Lodge", desc: 'Craft Bows, Daggers, Spears, Warhorn Torches, Offhand Dirks, Leather Armor & Mounts' },
  mage: { label: "Mage's Tower", desc: 'Weave Fire, Frost & Nature Staves, Spell Tomes, Arcane Orbs, Cloth Armor & Capes' },
  alchemist: { label: 'Alchemist & Cookfire', desc: 'Brew Healing/Boost Potions & Cook Fish and Wild Meat' },
  field: { label: 'Field Crafting', desc: 'Quick camp essentials craftable anywhere in the wild' },
};

const EQUIP_SLOTS: { slot: EquipSlot; label: string }[] = [
  { slot: 'weapon', label: 'Weapon' },
  { slot: 'offhand', label: 'Offhand' },
  { slot: 'helmet', label: 'Helmet' },
  { slot: 'chest', label: 'Chest' },
  { slot: 'boots', label: 'Boots' },
  { slot: 'cape', label: 'Cape' },
  { slot: 'bag', label: 'Satchel' },
  { slot: 'mount', label: 'Mount' },
];

const TOOL_SLOTS: { type: ToolType; label: string }[] = [
  { type: 'pickaxe', label: 'Pickaxe' },
  { type: 'axe', label: 'Wood Axe' },
  { type: 'sickle', label: 'Sickle' },
  { type: 'knife', label: 'Skinning Knife' },
  { type: 'rod', label: 'Fishing Rod' },
];

const ALL_BINDING_OPTIONS: { id: string; label: string }[] = [
  { id: 'weapon_0', label: 'Weapon Skill 1' },
  { id: 'weapon_1', label: 'Weapon Skill 2' },
  { id: 'weapon_2', label: 'Weapon Ultimate' },
  { id: 'helmet', label: 'Helmet Spell' },
  { id: 'chest', label: 'Chest Armor Spell' },
  { id: 'boots', label: 'Boots Mobility Spell' },
];

export const GameModals: React.FC<GameModalsProps> = ({
  engine,
  hud,
  progress,
  modal,
  marketListings,
  clientId,
  onClose,
  onOpenModal,
  onListMarketItem,
  onBuyMarketListing,
  onCancelMarketListing,
  onRefreshMarket,
}) => {
  const [bagFilter, setBagFilter] = useState<'all' | 'gear' | 'resources' | 'consumables'>('all');
  const [craftStation, setCraftStation] = useState<CraftingStationType>(modal.station ?? 'smelter');
  const [craftTierFilter, setCraftTierFilter] = useState<Tier | 0>(0);
  const [craftMsg, setCraftMsg] = useState<string>('');
  const [settingsTab, setSettingsTab] = useState<'gameplay' | 'display' | 'controls' | 'slots'>(
    modal.settingsTab ?? 'gameplay',
  );

  const [marketTab, setMarketTab] = useState<'buy' | 'sell'>('buy');
  const [marketSearch, setMarketSearch] = useState('');
  const [marketCat, setMarketCat] = useState<'all' | 'weapon' | 'armor' | 'mount' | 'tool' | 'resource' | 'consumable'>('all');
  const [sellPrices, setSellPrices] = useState<Record<string, string>>({});
  const [silverInput, setSilverInput] = useState('100');

  React.useEffect(() => {
    if (modal.type === 'craft' && modal.station) {
      setCraftStation(modal.station);
      setCraftMsg('');
    }
    if (modal.type === 'settings' && modal.settingsTab) {
      setSettingsTab(modal.settingsTab);
    }
  }, [modal.type, modal.station, modal.settingsTab]);

  const derived = engine.getDerivedStats();
  const settings = hud.settings;

  const filteredBag = useMemo(() => {
    return progress.inventory.filter((it) => {
      const tpl = ITEM_TEMPLATES[it.templateId];
      if (!tpl) return false;
      if (bagFilter === 'gear') {
        return ['weapon', 'offhand', 'helmet', 'chest', 'boots', 'cape', 'bag', 'mount', 'tool'].includes(tpl.category);
      }
      if (bagFilter === 'resources') {
        return ['resource', 'refined', 'artifact_core'].includes(tpl.category);
      }
      if (bagFilter === 'consumables') {
        return tpl.category === 'consumable';
      }
      return true;
    });
  }, [progress.inventory, bagFilter]);

  const visibleRecipes = useMemo(() => {
    return CRAFTING_RECIPES.filter((r) => {
      if (r.station !== craftStation) return false;
      if (craftTierFilter !== 0 && r.tier !== craftTierFilter) return false;
      return true;
    });
  }, [craftStation, craftTierFilter]);

  const filteredMarket = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    return marketListings.filter((l) => {
      const tpl = ITEM_TEMPLATES[l.item.templateId];
      if (!tpl) return false;
      if (q && !tpl.name.toLowerCase().includes(q) && !l.sellerName.toLowerCase().includes(q)) {
        return false;
      }
      if (marketCat === 'weapon' && tpl.category !== 'weapon') return false;
      if (
        marketCat === 'armor' &&
        !['helmet', 'chest', 'boots', 'offhand', 'cape', 'bag'].includes(tpl.category)
      )
        return false;
      if (marketCat === 'mount' && tpl.category !== 'mount') return false;
      if (marketCat === 'tool' && tpl.category !== 'tool') return false;
      if (
        marketCat === 'resource' &&
        !['resource', 'refined', 'artifact_core'].includes(tpl.category)
      )
        return false;
      if (marketCat === 'consumable' && tpl.category !== 'consumable') return false;
      return true;
    });
  }, [marketListings, marketSearch, marketCat]);

  // DEFEATED / RESPAWN MODAL
  if (hud.screen === 'DEFEATED') {
    return (
      <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#1F1514] border border-[#D94E41]/50 rounded-xl p-6 shadow-2xl text-center">
          <h2 className="font-display text-2xl font-bold text-[#FF8A7A]">Defeated in the Wilds</h2>
          <p className="text-sm text-[#D8CEC0] mt-2">
            Struck down by <span className="font-semibold text-white">{hud.defeatSummary?.cause ?? 'an enemy'}</span> in{' '}
            {hud.defeatSummary?.zoneName ?? hud.zoneName}.
          </p>
          <p className="text-xs text-[#B8AA99] mt-2 font-mono-num">
            Zone Risk Fee: {hud.defeatSummary?.silverLost ?? 0} Silver · All gear & Village Chest items kept safe.
          </p>
          <button
            onClick={() => engine.respawnInOakhaven()}
            className="mt-6 w-full min-h-[48px] rounded-lg bg-[#E5A93C] hover:bg-[#F0BA52] text-[#1A1512] font-bold text-sm cursor-pointer"
          >
            Respawn in Oakhaven Bastion
          </button>
        </div>
      </div>
    );
  }

  const isSettingsOpen = modal.type === 'settings' || hud.screen === 'PAUSED';
  if (!isSettingsOpen && modal.type === 'none') return null;

  const handleCloseAll = () => {
    if (hud.screen === 'PAUSED') engine.togglePause();
    onClose();
  };

  const ToggleRow: React.FC<{
    label: string;
    desc: string;
    checked: boolean;
    onChange: (next: boolean) => void;
  }> = ({ label, desc, checked, onChange }) => (
    <div className="p-3 rounded-lg bg-[#261F1A] border border-[#D4A857]/20 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#FAF4E8]">{label}</div>
        <div className="text-xs text-[#B8AA99] mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`min-w-[60px] min-h-[34px] px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors shrink-0 ${
          checked
            ? 'bg-[#E5A93C] text-[#1A1512]'
            : 'bg-[#17120F] text-[#B8AA99] border border-[#D4A857]/25'
        }`}
      >
        {checked ? 'ON' : 'OFF'}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/65 flex items-center justify-center p-2 sm:p-5">
      <div className="w-full max-w-5xl max-h-[90vh] bg-[#1E1814] border border-[#D4A857]/40 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* ================= MODAL HEADER ================= */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[#D4A857]/25 bg-[#17120F]">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#FAF4E8]">
              {isSettingsOpen && 'Menu, Settings & Ability Slots'}
              {!isSettingsOpen && modal.type === 'character' && 'Character, Equipment & Bag'}
              {!isSettingsOpen && modal.type === 'chest' && 'Oakhaven Central Village Storage Chest'}
              {!isSettingsOpen && modal.type === 'craft' && STATION_META[craftStation].label}
              {!isSettingsOpen && modal.type === 'market' && 'Grand Auction Market'}
              {!isSettingsOpen && modal.type === 'trade' && `Direct Trade · ${modal.tradeTargetName}`}
            </h2>
            <p className="text-xs text-[#B8AA99] mt-0.5">
              {isSettingsOpen && 'Customize display, audio, mobile touch controls, armor spells & action bar slots'}
              {!isSettingsOpen && modal.type === 'character' && 'Swap weapons, offhands (shields, bucklers, dirks, torches, tomes, orbs), armor, tools & mounts'}
              {!isSettingsOpen && modal.type === 'chest' && 'Safe central vault in Oakhaven Bastion · Unlimited categorized storage'}
              {!isSettingsOpen && modal.type === 'craft' && STATION_META[craftStation].desc}
              {!isSettingsOpen && modal.type === 'market' && 'Live server market shared with real players and autonomous AI adventurers'}
              {!isSettingsOpen && modal.type === 'trade' && 'Buy curated supplies or sell your gathered goods for instant Silver'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono-num text-sm font-semibold text-[#E5A93C]">
              {progress.silver.toLocaleString()} Silver
            </span>
            <button
              onClick={handleCloseAll}
              className="min-h-[40px] min-w-[40px] rounded-lg bg-[#2B221C] hover:bg-[#3A2E26] flex items-center justify-center text-[#F5EFE6] cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= MODAL BODY ================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* 0. UNIFIED MENU, SETTINGS, DISPLAY, CONTROLS & SPELL SLOT CUSTOMIZER */}
          {isSettingsOpen && (
            <div className="space-y-5">
              {/* Settings Category Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#16110E] rounded-lg">
                {(
                  [
                    { id: 'gameplay', label: 'Menu & Gameplay', icon: SlidersHorizontal },
                    { id: 'display', label: 'Display & Graphics', icon: Monitor },
                    { id: 'controls', label: 'Controls & Mobile', icon: Gamepad2 },
                    { id: 'slots', label: 'Spells & Button Slots', icon: Sparkles },
                  ] as const
                ).map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSettingsTab(t.id)}
                      className={`min-h-[40px] px-3.5 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                        settingsTab === t.id
                          ? 'bg-[#E5A93C] text-[#1A1512]'
                          : 'text-[#C9BEB2] hover:text-white hover:bg-[#241D18]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: MENU & GAMEPLAY */}
              {settingsTab === 'gameplay' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-5 space-y-2.5">
                    <h3 className="text-xs font-semibold text-[#E5A93C]">Adventure Menu</h3>
                    <button
                      onClick={handleCloseAll}
                      className="w-full min-h-[46px] rounded-lg bg-[#E5A93C] hover:bg-[#F0BA52] text-[#1A1512] font-bold text-sm cursor-pointer"
                    >
                      Resume Adventure
                    </button>
                    <button
                      onClick={() => {
                        engine.saveProgress();
                        engine.showToast('Progress saved to device', 'gold');
                      }}
                      className="w-full min-h-[44px] rounded-lg bg-[#261F1A] hover:bg-[#332922] border border-[#D4A857]/30 text-[#F5EFE6] text-sm font-medium cursor-pointer"
                    >
                      Save Progress Now
                    </button>
                    {progress.zoneId !== 'oakhaven' && (
                      <button
                        onClick={() => {
                          engine.travelToZone('oakhaven', 1100, 1015);
                          handleCloseAll();
                        }}
                        className="w-full min-h-[44px] rounded-lg bg-[#261F1A] hover:bg-[#332922] border border-[#D4A857]/30 text-[#F5EFE6] text-sm font-medium cursor-pointer"
                      >
                        Fast Travel to Oakhaven Bastion
                      </button>
                    )}
                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => engine.resetSettings()}
                        className="flex-1 min-h-[42px] rounded-lg bg-[#261F1A] hover:bg-[#332922] border border-[#D4A857]/25 text-[#D8CEC0] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reset Settings
                      </button>
                      <button
                        onClick={() => {
                          engine.resetCharacter();
                          handleCloseAll();
                        }}
                        className="flex-1 min-h-[42px] rounded-lg bg-[#331B1A] hover:bg-[#472422] border border-[#D94E41]/45 text-[#FFB4AB] text-xs font-semibold cursor-pointer"
                      >
                        New Character
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-7 space-y-2.5">
                    <h3 className="text-xs font-semibold text-[#E5A93C]">Audio & Gameplay Functionalities</h3>

                    {/* Master Volume Slider */}
                    <div className="p-3 rounded-lg bg-[#261F1A] border border-[#D4A857]/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#FAF4E8]">Master Sound Volume</span>
                        <span className="font-mono-num text-xs font-bold text-[#FFE38A]">
                          {settings.muted ? 'MUTED' : `${Math.round(settings.masterVolume * 100)}%`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(settings.masterVolume * 100)}
                          onChange={(e) =>
                            engine.updateSettings({
                              masterVolume: Number(e.target.value) / 100,
                              muted: false,
                            })
                          }
                          className="flex-1 accent-[#E5A93C] cursor-pointer"
                        />
                        <button
                          onClick={() => engine.updateSettings({ muted: !settings.muted })}
                          className="px-3 py-1.5 rounded bg-[#17120F] border border-[#D4A857]/30 text-xs font-semibold text-[#F5EFE6] cursor-pointer"
                        >
                          {settings.muted ? 'Unmute' : 'Mute'}
                        </button>
                      </div>
                    </div>

                    <ToggleRow
                      label="Auto-Equip Upgraded Gathering Tools"
                      desc="Automatically equips higher-tier pickaxes, axes, sickles, knives & fishing rods when crafted or looted"
                      checked={settings.autoEquipTools}
                      onChange={(v) => engine.updateSettings({ autoEquipTools: v })}
                    />
                    <ToggleRow
                      label="Floating Combat & Loot Numbers"
                      desc="Show damage numbers, crits, armor weakness tags, and gathered yield callouts"
                      checked={settings.showDamageNumbers}
                      onChange={(v) => engine.updateSettings({ showDamageNumbers: v })}
                    />
                    <ToggleRow
                      label="Resource Tier Labels"
                      desc="Show T1–T5 tier badges directly beneath ore veins, trees, flowers, and fishing shoals"
                      checked={settings.showResourceLabels}
                      onChange={(v) => engine.updateSettings({ showResourceLabels: v })}
                    />
                    <ToggleRow
                      label="Combat Camera Shake"
                      desc="Subtle impact shake on heavy boss slams, crits, and parry counters"
                      checked={settings.screenShake}
                      onChange={(v) => engine.updateSettings({ screenShake: v })}
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: DISPLAY & GRAPHICS */}
              {settingsTab === 'display' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20">
                      <div className="text-sm font-semibold text-[#FAF4E8] mb-1">Graphics Quality</div>
                      <div className="text-xs text-[#B8AA99] mb-2.5">
                        Controls particle density and ambient golden sunlight motes for smooth 60 FPS on mobile
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['low', 'medium', 'high'] as const).map((q) => (
                          <button
                            key={q}
                            onClick={() => engine.updateSettings({ graphicsQuality: q })}
                            className={`min-h-[38px] rounded-lg text-xs font-bold capitalize cursor-pointer ${
                              settings.graphicsQuality === q
                                ? 'bg-[#E5A93C] text-[#1A1512]'
                                : 'bg-[#17120F] text-[#C9BEB2] border border-[#D4A857]/25'
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20">
                      <div className="text-sm font-semibold text-[#FAF4E8] mb-1">Canvas Resolution Scale</div>
                      <div className="text-xs text-[#B8AA99] mb-2.5">
                        Lower for extra mobile battery life, or increase for crisp retina detail
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {([0.75, 1, 1.5] as const).map((sc) => (
                          <button
                            key={sc}
                            onClick={() => engine.updateSettings({ renderScale: sc })}
                            className={`min-h-[38px] rounded-lg text-xs font-mono-num font-bold cursor-pointer ${
                              settings.renderScale === sc
                                ? 'bg-[#E5A93C] text-[#1A1512]'
                                : 'bg-[#17120F] text-[#C9BEB2] border border-[#D4A857]/25'
                            }`}
                          >
                            {sc}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20">
                      <div className="text-sm font-semibold text-[#FAF4E8] mb-1">HUD Button Scale</div>
                      <div className="text-xs text-[#B8AA99] mb-2.5">
                        Adjust ability button wheel sizing for phones, tablets, or desktop screens
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['compact', 'standard', 'large'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => engine.updateSettings({ hudScale: s })}
                            className={`min-h-[38px] rounded-lg text-xs font-bold capitalize cursor-pointer ${
                              settings.hudScale === s
                                ? 'bg-[#E5A93C] text-[#1A1512]'
                                : 'bg-[#17120F] text-[#C9BEB2] border border-[#D4A857]/25'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Camera Zoom Distance Slider */}
                    <div className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/25 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#FAF4E8]">Camera Zoom Distance</span>
                        <span className="font-mono-num text-xs font-bold text-[#FFE38A]">
                          {(settings.cameraZoom ?? 0.85) <= 0.72
                            ? 'Close'
                            : (settings.cameraZoom ?? 0.85) >= 1.25
                            ? 'Wide'
                            : 'Albion 3/4'}
                        </span>
                      </div>
                      <div className="text-xs text-[#B8AA99]">
                        Zoom closer to your character &amp; ground or pull farther out for wide boss battles
                      </div>
                      <input
                        type="range"
                        min={58}
                        max={155}
                        value={Math.round((settings.cameraZoom ?? 0.85) * 100)}
                        onChange={(e) => engine.setCameraZoom(Number(e.target.value) / 100)}
                        className="w-full accent-[#E5A93C] cursor-pointer"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { label: 'Close', val: 0.65 },
                            { label: 'Albion Default', val: 0.85 },
                            { label: 'Wide', val: 1.35 },
                          ] as const
                        ).map((preset) => (
                          <button
                            key={preset.label}
                            onClick={() => engine.setCameraZoom(preset.val)}
                            className={`min-h-[34px] rounded-md text-[11px] font-bold cursor-pointer ${
                              Math.abs((settings.cameraZoom ?? 0.85) - preset.val) < 0.08
                                ? 'bg-[#E5A93C] text-[#1A1512]'
                                : 'bg-[#17120F] text-[#C9BEB2] border border-[#D4A857]/25'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <ToggleRow
                      label="Dynamic 3D Sun Shadows"
                      desc="Cast warm afternoon directional shadows beneath trees, ores, buildings, characters & bosses"
                      checked={settings.showShadows}
                      onChange={(v) => engine.updateSettings({ showShadows: v })}
                    />
                    <ToggleRow
                      label="Warm Afternoon Lighting & Sun Motes"
                      desc="Golden-hour sunlight glow, painted skybox clouds, and sunlit drifting pollen across all biomes"
                      checked={settings.warmLighting}
                      onChange={(v) => engine.updateSettings({ warmLighting: v })}
                    />
                    <ToggleRow
                      label="Show Live Zone Minimap"
                      desc="Display the top-right radar showing the Central Chest, stations, portals & bosses"
                      checked={settings.showMinimap}
                      onChange={(v) => engine.updateSettings({ showMinimap: v })}
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: CONTROLS & MOBILE LAYOUT */}
              {settingsTab === 'controls' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-6 space-y-3">
                    <div className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20">
                      <div className="text-sm font-semibold text-[#FAF4E8] mb-1">Virtual Movement Thumbstick</div>
                      <div className="text-xs text-[#B8AA99] mb-2.5">
                        Show or hide the on-screen touch movement joystick
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['auto', 'always', 'off'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => engine.updateSettings({ showVirtualStick: mode })}
                            className={`min-h-[38px] rounded-lg text-xs font-bold capitalize cursor-pointer ${
                              settings.showVirtualStick === mode
                                ? 'bg-[#E5A93C] text-[#1A1512]'
                                : 'bg-[#17120F] text-[#C9BEB2] border border-[#D4A857]/25'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20">
                      <div className="text-sm font-semibold text-[#FAF4E8] mb-1">Thumbstick Size</div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {(['small', 'medium', 'large'] as const).map((sz) => (
                          <button
                            key={sz}
                            onClick={() => engine.updateSettings({ stickSize: sz })}
                            className={`min-h-[38px] rounded-lg text-xs font-bold capitalize cursor-pointer ${
                              settings.stickSize === sz
                                ? 'bg-[#E5A93C] text-[#1A1512]'
                                : 'bg-[#17120F] text-[#C9BEB2] border border-[#D4A857]/25'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>

                    <ToggleRow
                      label="Left-Handed Mobile Layout"
                      desc="Flips the thumbstick to the right side and the 6-slot ability wheel to the left side"
                      checked={settings.leftHandedLayout}
                      onChange={(v) => engine.updateSettings({ leftHandedLayout: v })}
                    />

                    <ToggleRow
                      label="Drag-to-Aim Skill-Shots"
                      desc="Hold and drag ability buttons to aim directional lines, cones & AoEs; turn off for instant tap-cast"
                      checked={settings.dragSkillShots}
                      onChange={(v) => engine.updateSettings({ dragSkillShots: v })}
                    />
                  </div>

                  <div className="lg:col-span-6 p-4 rounded-lg bg-[#261F1A] border border-[#D4A857]/25">
                    <h3 className="text-xs font-semibold text-[#E5A93C] mb-3">
                      Controls Reference (Touch + Keyboard & Mouse)
                    </h3>
                    <div className="space-y-2 text-xs">
                      {[
                        ['Move', 'Virtual Thumbstick · WASD / Arrow Keys'],
                        ['Basic Attack', 'Tap STRIKE · Left-Click Canvas'],
                        ['Ability Slots 1–3 (Weapon)', 'Hold & Drag Buttons · Q / E / R or 1 / 2 / 3'],
                        ['Ability Slots 4–6 (Helmet/Chest/Boots)', 'Tap or Drag Buttons · Z / X / C or 4 / 5 / 6'],
                        ['Active Dodge-Roll (i-frames)', 'DODGE Button · Spacebar'],
                        ['Timed Parry Counter', 'PARRY Button · F or Right-Click'],
                        ['Gather / Skin / Fish / Open', 'GATHER Button · G (or E outside combat)'],
                        ['Summon / Dismount Steed', 'Mount Button · M'],
                        ['Quick Healing Potion', 'Potion Button · H'],
                        ['Camera Zoom In / Out', 'Scroll Wheel · 2-Finger Pinch · +/- HUD · - / ='],
                        ['Gear / Field Craft / Menu', 'Top Bar Buttons · I / K / O (or Esc)'],
                      ].map(([action, bind]) => (
                        <div
                          key={action}
                          className="flex items-center justify-between gap-3 py-1.5 border-b border-[#D4A857]/10"
                        >
                          <span className="text-[#FAF4E8] font-medium">{action}</span>
                          <span className="font-mono-num text-[11px] text-[#FFE38A] text-right">{bind}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: GEAR SPELL SELECTION & 6-SLOT ACTION BAR ASSIGNMENT */}
              {settingsTab === 'slots' && (
                <div className="space-y-5">
                  {/* Part A: Choose Armor Piece Abilities (Helmet, Chest, Boots) */}
                  <div>
                    <h3 className="text-xs font-semibold text-[#E5A93C] mb-2.5">
                      1. Select Abilities for Equipped Armor Slots (Helmet · Chest · Boots)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(['helmet', 'chest', 'boots'] as const).map((piece) => {
                        const cls = engine.getArmorPieceClass(piece);
                        const eqItem = progress.equipment[piece];
                        const eqTpl = eqItem ? ITEM_TEMPLATES[eqItem.templateId] : undefined;
                        const options = ARMOR_ABILITIES[cls][piece];
                        const selectedIdx = progress.gearSpellChoice?.[piece] ?? 0;
                        return (
                          <div
                            key={piece}
                            className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/25 space-y-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wide text-[#FFE38A]">
                                {piece} ({cls})
                              </span>
                              <span className="text-[11px] text-[#B8AA99] truncate max-w-[140px]">
                                {eqTpl ? `T${eqTpl.tier} ${eqTpl.name}` : 'Default Class'}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {options.map((spell, idx) => {
                                const active = selectedIdx === idx;
                                return (
                                  <button
                                    key={spell.id}
                                    onClick={() => engine.setGearSpellChoice(piece, idx)}
                                    className={`w-full text-left p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                      active
                                        ? 'bg-[#362B1E] border-[#E5A93C] text-[#FAF4E8]'
                                        : 'bg-[#1A1512] border-[#D4A857]/15 text-[#C9BEB2] hover:bg-[#241D18]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold" style={{ color: spell.color }}>
                                        {spell.name}
                                      </span>
                                      <span className="font-mono-num text-[10px] text-[#B8AA99]">
                                        {spell.cooldown}s · {spell.energyCost} EN
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[#C9BEB2] mt-1 leading-snug">
                                      {spell.description}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Part B: Assign Any Weapon or Armor Ability to Any of the 6 HUD Button Slots */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <h3 className="text-xs font-semibold text-[#E5A93C]">
                        2. Place Spells & Abilities Into Specific HUD Button Slots (Slots 1–6)
                      </h3>
                      <button
                        onClick={() => engine.resetActionBarSlots()}
                        className="px-3 py-1.5 rounded bg-[#261F1A] hover:bg-[#362C24] border border-[#D4A857]/30 text-xs text-[#D8CEC0] flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reset Default Layout
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {hud.skills.map((slot) => {
                        const wpnSkills = WEAPON_SKILLS[derived.weaponArchetype] ?? WEAPON_SKILLS.sword;
                        return (
                          <div
                            key={slot.slotIndex}
                            className="p-3 rounded-lg bg-[#261F1A] border border-[#D4A857]/25 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#FAF4E8]">
                                Button Slot {slot.slotIndex + 1}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-[#17120F] border border-[#E5A93C]/45 font-mono-num text-[11px] font-bold text-[#FFE38A]">
                                Key {SLOT_HOTKEYS[slot.slotIndex]} / {slot.slotIndex + 1}
                              </span>
                            </div>

                            <select
                              value={slot.bindingId}
                              onChange={(e) => engine.setActionBarSlot(slot.slotIndex, e.target.value)}
                              className="w-full px-2.5 py-2 rounded-lg bg-[#16110E] border border-[#D4A857]/35 text-xs font-semibold text-[#FAF4E8] cursor-pointer"
                            >
                              {ALL_BINDING_OPTIONS.map((opt) => {
                                let resolvedName = opt.label;
                                if (opt.id === 'weapon_0') resolvedName = `Weapon 1: ${wpnSkills[0].name}`;
                                if (opt.id === 'weapon_1') resolvedName = `Weapon 2: ${wpnSkills[1].name}`;
                                if (opt.id === 'weapon_2') resolvedName = `Weapon 3: ${wpnSkills[2].name}`;
                                if (opt.id === 'helmet' || opt.id === 'chest' || opt.id === 'boots') {
                                  const resolved = engine.getAbilityForBinding(opt.id);
                                  resolvedName = `${opt.id.toUpperCase()}: ${resolved.def.name}`;
                                }
                                return (
                                  <option key={opt.id} value={opt.id}>
                                    {resolvedName}
                                  </option>
                                );
                              })}
                            </select>

                            <div className="text-[11px] text-[#C9BEB2] leading-snug">
                              <span className="font-semibold" style={{ color: slot.def.color }}>
                                {slot.def.name}
                              </span>{' '}
                              — {slot.def.description}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 1. CHARACTER, GEAR, OFFHANDS, TOOLS, WEAKNESS MATRIX & BAG */}
          {!isSettingsOpen && modal.type === 'character' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Loadout + Tool Belt + Stats */}
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-[#E5A93C]">Equipped Gear, Offhand & Mount</h3>
                    <button
                      onClick={() => onOpenModal({ type: 'settings', settingsTab: 'slots' })}
                      className="text-[11px] px-2.5 py-1 rounded bg-[#2B221C] hover:bg-[#3A2E26] border border-[#E5A93C]/40 text-[#FFE38A] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Edit Spells & Slots
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {EQUIP_SLOTS.map(({ slot, label }) => {
                      const it = progress.equipment[slot];
                      const tpl = it ? ITEM_TEMPLATES[it.templateId] : undefined;
                      return (
                        <div
                          key={slot}
                          className="p-2.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-[10px] text-[#B8AA99]">
                              {label}
                              {tpl?.offhandStyle ? ` · ${tpl.offhandStyle}` : ''}
                              {tpl?.armorClass ? ` · ${tpl.armorClass}` : ''}
                            </div>
                            {tpl && it ? (
                              <div
                                className="text-xs font-semibold truncate"
                                style={{ color: RARITY_META[it.rarity].color }}
                              >
                                T{tpl.tier} {tpl.name}
                              </div>
                            ) : (
                              <div className="text-xs text-[#6B5F55]">Empty</div>
                            )}
                          </div>
                          {it && (
                            <button
                              onClick={() => engine.unequipSlot(slot)}
                              className="text-[11px] px-2 py-1 rounded bg-[#362C24] hover:bg-[#473A30] text-[#D8CEC0] shrink-0 cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Gathering Tools Belt */}
                <div>
                  <h3 className="text-xs font-semibold text-[#E5A93C] mb-2">
                    Gathering Tools (Gates Resource Tier)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TOOL_SLOTS.map(({ type, label }) => {
                      const it = progress.tools[type];
                      const tpl = it ? ITEM_TEMPLATES[it.templateId] : undefined;
                      return (
                        <div
                          key={type}
                          className="p-2 rounded-lg bg-[#261F1A] border border-[#D4A857]/20"
                        >
                          <div className="text-[10px] text-[#B8AA99]">{label}</div>
                          <div
                            className="text-xs font-semibold truncate"
                            style={{ color: tpl ? RARITY_META[it!.rarity].color : '#6B5F55' }}
                          >
                            {tpl ? `T${tpl.tier} ${tpl.name.split(' ')[0]}` : 'None'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Combat Attributes & Damage/Armor Weakness Profile */}
                <div className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#E5A93C] flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> Combat & Armor Profile
                    </span>
                    <span className="font-mono-num text-[#B8AA99] capitalize">
                      {derived.armorClass} Armor · {derived.damageType}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono-num">
                    <div>Atk: <span className="text-[#FAF4E8] font-semibold">{derived.attack}</span></div>
                    <div>HP: <span className="text-[#FAF4E8] font-semibold">{derived.maxHp}</span></div>
                    <div>Energy: <span className="text-[#FAF4E8] font-semibold">{derived.maxEnergy}</span></div>
                    <div>Phys Def: <span className="text-[#FAF4E8] font-semibold">{derived.physArmor}</span></div>
                    <div>Mag Def: <span className="text-[#FAF4E8] font-semibold">{derived.magicArmor}</span></div>
                    <div>Crit: <span className="text-[#FAF4E8] font-semibold">{Math.round(derived.critChance * 100)}%</span></div>
                  </div>
                  <div className="pt-2 border-t border-[#D4A857]/15 text-[11px] text-[#D8CEC0] leading-relaxed">
                    Incoming vs <span className="capitalize font-semibold">{derived.armorClass}</span>:{' '}
                    Slashing {Math.round(DAMAGE_MATRIX.slashing[derived.armorClass] * 100)}% ·
                    Piercing {Math.round(DAMAGE_MATRIX.piercing[derived.armorClass] * 100)}% ·
                    Crushing {Math.round(DAMAGE_MATRIX.crushing[derived.armorClass] * 100)}% ·
                    Arcane {Math.round(DAMAGE_MATRIX.arcane[derived.armorClass] * 100)}%
                  </div>
                </div>

                {/* Mastery Levels */}
                <div className="p-3 rounded-lg bg-[#261F1A] border border-[#D4A857]/20">
                  <div className="text-xs font-semibold text-[#E5A93C] mb-1.5">Mastery Trees</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {(Object.keys(progress.mastery) as (keyof typeof progress.mastery)[]).map((tree) => (
                      <div key={tree} className="flex justify-between font-mono-num">
                        <span className="capitalize text-[#D8CEC0]">{tree}</span>
                        <span className="text-[#FFE38A]">Lv {progress.mastery[tree].level}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Bag Inventory */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-1 p-1 bg-[#16110E] rounded-lg">
                    {(['all', 'gear', 'resources', 'consumables'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setBagFilter(tab)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer ${
                          bagFilter === tab
                            ? 'bg-[#E5A93C] text-[#1A1512] font-bold'
                            : 'text-[#B8AA99] hover:text-white'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-mono-num text-[#B8AA99]">
                    Weight: {engine.getCarryWeight()} / {derived.maxCarryWeight} kg
                  </span>
                </div>

                {filteredBag.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#8F8378] bg-[#261F1A] rounded-lg">
                    No items in this category.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {filteredBag.map((it) => {
                      const tpl = ITEM_TEMPLATES[it.templateId];
                      if (!tpl) return null;
                      const rMeta = RARITY_META[it.rarity];
                      const canEquip = [
                        'weapon',
                        'offhand',
                        'helmet',
                        'chest',
                        'boots',
                        'cape',
                        'bag',
                        'mount',
                        'tool',
                      ].includes(tpl.category);
                      const isConsumable = tpl.category === 'consumable';
                      return (
                        <div
                          key={it.uid}
                          className="p-3 rounded-lg bg-[#261F1A] border border-[#D4A857]/20 flex flex-col justify-between gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="w-9 h-9 rounded-md shrink-0 border border-black/40 flex items-center justify-center font-mono-num text-xs font-bold text-[#1A1512]"
                                style={{ backgroundColor: tpl.iconColor }}
                              >
                                T{tpl.tier}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate" style={{ color: rMeta.color }}>
                                  {tpl.name} {it.qty > 1 ? `×${it.qty}` : ''}
                                </div>
                                <div className="text-[11px] text-[#B8AA99]">
                                  {rMeta.label} · {tpl.offhandStyle ? `offhand (${tpl.offhandStyle})` : tpl.category}
                                  {!tpl.stackable ? ` · IP ${getEffectiveItemPower(it)}` : ''}
                                </div>
                              </div>
                            </div>
                          </div>
                          <p className="text-[11px] text-[#C9BEB2] leading-snug">{tpl.description}</p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] font-mono-num text-[#B8AA99]">
                              {(tpl.weight * it.qty).toFixed(1)}kg · ~{tpl.basePrice * it.qty} Ag
                            </span>
                            {(canEquip || isConsumable) && (
                              <button
                                onClick={() => engine.equipItem(it.uid)}
                                className="px-3 py-1.5 rounded bg-[#E5A93C] hover:bg-[#F0BA52] text-[#1A1512] text-xs font-bold cursor-pointer"
                              >
                                {isConsumable ? 'Use' : 'Equip'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. CENTRAL VILLAGE STORAGE CHEST */}
          {!isSettingsOpen && modal.type === 'chest' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/30 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Coins className="w-5 h-5 text-[#E5A93C]" />
                  <span>
                    Vault Silver:{' '}
                    <strong className="font-mono-num text-[#FFE38A]">
                      {progress.chestSilver.toLocaleString()} Ag
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    value={silverInput}
                    onChange={(e) => setSilverInput(e.target.value)}
                    className="w-24 px-2.5 py-1.5 rounded bg-[#17120F] border border-[#D4A857]/30 text-xs font-mono-num text-[#FAF4E8]"
                  />
                  <button
                    onClick={() => engine.transferChestSilver(Number(silverInput), 'deposit')}
                    className="px-3 py-1.5 rounded bg-[#362C24] hover:bg-[#473A30] text-xs font-semibold text-[#F5EFE6] cursor-pointer"
                  >
                    Deposit Silver
                  </button>
                  <button
                    onClick={() => engine.transferChestSilver(Number(silverInput), 'withdraw')}
                    className="px-3 py-1.5 rounded bg-[#362C24] hover:bg-[#473A30] text-xs font-semibold text-[#F5EFE6] cursor-pointer"
                  >
                    Withdraw Silver
                  </button>
                  <button
                    onClick={() => engine.depositAllResourcesToChest()}
                    className="px-3 py-1.5 rounded bg-[#E5A93C] hover:bg-[#F0BA52] text-xs font-bold text-[#1A1512] cursor-pointer"
                  >
                    Store All Resources
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#241D18] border border-[#D4A857]/20 rounded-lg p-3.5">
                  <h3 className="text-xs font-semibold text-[#E5A93C] mb-2.5">
                    Your Bag ({progress.inventory.length} stacks)
                  </h3>
                  <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
                    {progress.inventory.map((it) => {
                      const tpl = ITEM_TEMPLATES[it.templateId];
                      if (!tpl) return null;
                      return (
                        <div
                          key={it.uid}
                          className="p-2.5 rounded bg-[#1A1512] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div
                              className="text-xs font-semibold truncate"
                              style={{ color: RARITY_META[it.rarity].color }}
                            >
                              T{tpl.tier} {tpl.name} {it.qty > 1 ? `×${it.qty}` : ''}
                            </div>
                            <div className="text-[10px] text-[#B8AA99]">{tpl.category}</div>
                          </div>
                          <button
                            onClick={() => engine.depositToChest(it.uid)}
                            className="px-3 py-1.5 rounded bg-[#362C24] hover:bg-[#E5A93C] hover:text-[#1A1512] text-xs font-semibold text-[#F5EFE6] shrink-0 cursor-pointer"
                          >
                            Store
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#241D18] border border-[#E5A93C]/35 rounded-lg p-3.5">
                  <h3 className="text-xs font-semibold text-[#FFE38A] mb-2.5">
                    Village Storage Chest ({progress.villageChest.length} stacks)
                  </h3>
                  <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
                    {progress.villageChest.length === 0 ? (
                      <div className="text-xs text-[#8F8378] py-6 text-center">Chest is empty.</div>
                    ) : (
                      progress.villageChest.map((it) => {
                        const tpl = ITEM_TEMPLATES[it.templateId];
                        if (!tpl) return null;
                        return (
                          <div
                            key={it.uid}
                            className="p-2.5 rounded bg-[#1A1512] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div
                                className="text-xs font-semibold truncate"
                                style={{ color: RARITY_META[it.rarity].color }}
                              >
                                T{tpl.tier} {tpl.name} {it.qty > 1 ? `×${it.qty}` : ''}
                              </div>
                              <div className="text-[10px] text-[#B8AA99]">{tpl.category}</div>
                            </div>
                            <button
                              onClick={() => engine.withdrawFromChest(it.uid)}
                              className="px-3 py-1.5 rounded bg-[#E5A93C] hover:bg-[#F0BA52] text-xs font-bold text-[#1A1512] shrink-0 cursor-pointer"
                            >
                              Take
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. CRAFTING & REFINING STATIONS */}
          {!isSettingsOpen && modal.type === 'craft' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    progress.zoneId === 'oakhaven'
                      ? (['smelter', 'blacksmith', 'hunter', 'mage', 'alchemist', 'field'] as CraftingStationType[])
                      : (['field'] as CraftingStationType[])
                  ).map((st) => (
                    <button
                      key={st}
                      onClick={() => setCraftStation(st)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        craftStation === st
                          ? 'bg-[#E5A93C] text-[#1A1512]'
                          : 'bg-[#261F1A] text-[#D8CEC0] hover:bg-[#332922]'
                      }`}
                    >
                      {STATION_META[st].label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#16110E] rounded-lg">
                  {([0, 1, 2, 3, 4, 5] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setCraftTierFilter(t)}
                      className={`px-2.5 py-1 text-xs font-mono-num rounded cursor-pointer ${
                        craftTierFilter === t
                          ? 'bg-[#E5A93C] text-[#1A1512] font-bold'
                          : 'text-[#B8AA99] hover:text-white'
                      }`}
                    >
                      {t === 0 ? 'All' : `T${t}`}
                    </button>
                  ))}
                </div>
              </div>

              {progress.zoneId !== 'oakhaven' && (
                <div className="text-xs text-[#E5A93C] bg-[#292014] border border-[#E5A93C]/30 rounded-lg px-3 py-2">
                  You are in the wilds — Field Crafting is available here. Return to Oakhaven Bastion to use the Smelter, Blacksmith Forge, Hunter&apos;s Lodge, Mage&apos;s Tower, and Alchemist&apos;s Cauldron.
                </div>
              )}

              {craftMsg && (
                <div className="text-xs text-[#FFE38A] bg-[#292014] border border-[#E5A93C]/40 rounded-lg px-3 py-2">
                  {craftMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleRecipes.map((rec) => {
                  const outTpl = ITEM_TEMPLATES[rec.outputTemplateId];
                  if (!outTpl) return null;
                  const canCraft = engine.canCraftRecipe(rec);
                  return (
                    <div
                      key={rec.id}
                      className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-md shrink-0 flex items-center justify-center font-mono-num text-xs font-bold text-[#1A1512]"
                            style={{ backgroundColor: outTpl.iconColor }}
                          >
                            T{outTpl.tier}
                          </div>
                          <div className="min-w-0">
                            <div
                              className="text-sm font-semibold truncate"
                              style={{ color: RARITY_META[outTpl.rarity].color }}
                            >
                              {outTpl.name} {rec.outputQty > 1 ? `×${rec.outputQty}` : ''}
                            </div>
                            <div className="text-[11px] text-[#B8AA99]">
                              {RARITY_META[outTpl.rarity].label} · +{rec.xpReward} XP
                            </div>
                          </div>
                        </div>
                        <p className="text-[11px] text-[#C9BEB2] mt-2 leading-snug">
                          {outTpl.description}
                        </p>

                        <div className="mt-2.5 space-y-1">
                          {rec.ingredients.map((ing) => {
                            const have = engine.getItemCount(ing.templateId);
                            const ok = have >= ing.qty;
                            const ingTpl = ITEM_TEMPLATES[ing.templateId];
                            return (
                              <div
                                key={ing.templateId}
                                className="flex items-center justify-between text-[11px] font-mono-num"
                              >
                                <span className="text-[#D8CEC0] truncate">
                                  {ingTpl?.name ?? ing.templateId}
                                </span>
                                <span className={ok ? 'text-[#56B870]' : 'text-[#F06454]'}>
                                  {have}/{ing.qty}
                                </span>
                              </div>
                            );
                          })}
                          {rec.silverCost > 0 && (
                            <div className="flex items-center justify-between text-[11px] font-mono-num">
                              <span className="text-[#D8CEC0]">Crafting Fee</span>
                              <span
                                className={
                                  progress.silver >= rec.silverCost
                                    ? 'text-[#E5A93C]'
                                    : 'text-[#F06454]'
                                }
                              >
                                {rec.silverCost} Ag
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        disabled={!canCraft}
                        onClick={() => {
                          const res = engine.craftRecipe(rec.id);
                          setCraftMsg(res.message);
                        }}
                        className={`w-full min-h-[40px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          canCraft
                            ? 'bg-[#E5A93C] hover:bg-[#F0BA52] text-[#1A1512] cursor-pointer'
                            : 'bg-[#1A1512] text-[#756A60] cursor-not-allowed'
                        }`}
                      >
                        <Hammer className="w-3.5 h-3.5" />
                        Craft
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. GRAND AUCTION MARKET */}
          {!isSettingsOpen && modal.type === 'market' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 bg-[#16110E] rounded-lg">
                  <button
                    onClick={() => setMarketTab('buy')}
                    className={`px-4 py-2 text-xs font-bold rounded-md cursor-pointer ${
                      marketTab === 'buy'
                        ? 'bg-[#E5A93C] text-[#1A1512]'
                        : 'text-[#B8AA99] hover:text-white'
                    }`}
                  >
                    Browse Market ({marketListings.length})
                  </button>
                  <button
                    onClick={() => setMarketTab('sell')}
                    className={`px-4 py-2 text-xs font-bold rounded-md cursor-pointer ${
                      marketTab === 'sell'
                        ? 'bg-[#E5A93C] text-[#1A1512]'
                        : 'text-[#B8AA99] hover:text-white'
                    }`}
                  >
                    Sell From Bag
                  </button>
                </div>

                {marketTab === 'buy' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="Search shield, orb, dirk, iron..."
                      value={marketSearch}
                      onChange={(e) => setMarketSearch(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-[#16110E] border border-[#D4A857]/30 text-xs text-[#FAF4E8] w-44 sm:w-56"
                    />
                    <button
                      onClick={() => onRefreshMarket()}
                      className="px-3 py-1.5 rounded-lg bg-[#2B221C] hover:bg-[#3A2E26] text-xs text-[#F5EFE6] cursor-pointer"
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>

              {marketTab === 'buy' ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(['all', 'weapon', 'armor', 'mount', 'tool', 'resource', 'consumable'] as const).map(
                      (c) => (
                        <button
                          key={c}
                          onClick={() => setMarketCat(c)}
                          className={`px-3 py-1.5 rounded text-xs capitalize cursor-pointer ${
                            marketCat === c
                              ? 'bg-[#3D3127] text-[#FFE38A] border border-[#E5A93C]/50'
                              : 'bg-[#241D18] text-[#B8AA99] hover:text-white'
                          }`}
                        >
                          {c}
                        </button>
                      ),
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredMarket.map((listing) => {
                      const tpl = ITEM_TEMPLATES[listing.item.templateId];
                      if (!tpl) return null;
                      const isMine = listing.sellerId === clientId;
                      const canAfford = progress.silver >= listing.price;
                      return (
                        <div
                          key={listing.id}
                          className="p-3.5 rounded-lg bg-[#261F1A] border border-[#D4A857]/20 flex flex-col justify-between gap-2.5"
                        >
                          <div>
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-9 h-9 rounded-md shrink-0 flex items-center justify-center font-mono-num text-xs font-bold text-[#1A1512]"
                                style={{ backgroundColor: tpl.iconColor }}
                              >
                                T{tpl.tier}
                              </div>
                              <div className="min-w-0">
                                <div
                                  className="text-sm font-semibold truncate"
                                  style={{ color: RARITY_META[listing.item.rarity].color }}
                                >
                                  {tpl.name} {listing.item.qty > 1 ? `×${listing.item.qty}` : ''}
                                </div>
                                <div className="text-[11px] text-[#B8AA99] truncate">
                                  {listing.sellerName} · {listing.isAiSeller ? 'AI Trader' : 'Player'}
                                </div>
                              </div>
                            </div>
                            <p className="text-[11px] text-[#C9BEB2] mt-2 line-clamp-2">
                              {tpl.description}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-[#D4A857]/15">
                            <span className="font-mono-num text-sm font-bold text-[#FFE38A]">
                              {listing.price.toLocaleString()} Ag
                            </span>
                            {isMine ? (
                              <button
                                onClick={() => onCancelMarketListing(listing.id)}
                                className="px-3 py-1.5 rounded bg-[#4A2520] hover:bg-[#5E2E28] text-xs font-semibold text-[#FFD0C8] cursor-pointer"
                              >
                                Cancel
                              </button>
                            ) : (
                              <button
                                disabled={!canAfford}
                                onClick={() => onBuyMarketListing(listing)}
                                className={`px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-1 ${
                                  canAfford
                                    ? 'bg-[#E5A93C] hover:bg-[#F0BA52] text-[#1A1512] cursor-pointer'
                                    : 'bg-[#1A1512] text-[#756A60] cursor-not-allowed'
                                }`}
                              >
                                <Store className="w-3.5 h-3.5" />
                                Buy
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {progress.inventory.map((it) => {
                    const tpl = ITEM_TEMPLATES[it.templateId];
                    if (!tpl) return null;
                    const suggested = Math.max(
                      10,
                      Math.round(tpl.basePrice * it.qty * RARITY_META[it.rarity].mult),
                    );
                    const priceVal = sellPrices[it.uid] ?? String(suggested);
                    return (
                      <div
                        key={it.uid}
                        className="p-3 rounded-lg bg-[#261F1A] border border-[#D4A857]/20 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div
                            className="text-xs font-semibold truncate"
                            style={{ color: RARITY_META[it.rarity].color }}
                          >
                            T{tpl.tier} {tpl.name} {it.qty > 1 ? `×${it.qty}` : ''}
                          </div>
                          <div className="text-[11px] text-[#B8AA99]">
                            Fair Value ~{suggested} Ag
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            min={1}
                            value={priceVal}
                            onChange={(e) =>
                              setSellPrices((prev) => ({ ...prev, [it.uid]: e.target.value }))
                            }
                            className="w-20 px-2 py-1.5 rounded bg-[#16110E] border border-[#D4A857]/30 text-xs font-mono-num text-[#FAF4E8]"
                          />
                          <button
                            onClick={() => onListMarketItem(it.uid, Math.max(1, Number(priceVal) || suggested))}
                            className="px-3 py-1.5 rounded bg-[#E5A93C] hover:bg-[#F0BA52] text-[#1A1512] text-xs font-bold cursor-pointer"
                          >
                            List
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. DIRECT BARTER TRADE WITH AI ADVENTURERS */}
          {!isSettingsOpen && modal.type === 'trade' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(() => {
                const ai = engine.aiAdventurers.find((a) => a.id === modal.tradeTargetId);
                return (
                  <>
                    <div className="p-4 rounded-lg bg-[#261F1A] border border-[#D4A857]/25">
                      <h3 className="text-xs font-semibold text-[#FFE38A] mb-3 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> {ai?.name ?? 'Trader'}&apos;s Goods
                      </h3>
                      <div className="space-y-2">
                        {(ai?.tradeInventory ?? []).filter((s) => s.qty > 0).map((stock) => {
                          const tpl = ITEM_TEMPLATES[stock.templateId];
                          if (!tpl) return null;
                          const canAfford = progress.silver >= stock.price;
                          return (
                            <div
                              key={stock.templateId}
                              className="p-2.5 rounded bg-[#1A1512] flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div
                                  className="text-xs font-semibold truncate"
                                  style={{ color: RARITY_META[tpl.rarity].color }}
                                >
                                  T{tpl.tier} {tpl.name} ({stock.qty} avail)
                                </div>
                                <div className="text-[11px] font-mono-num text-[#E5A93C]">
                                  {stock.price} Silver
                                </div>
                              </div>
                              <button
                                disabled={!canAfford}
                                onClick={() => ai && engine.buyFromAiAdventurer(ai.id, stock.templateId)}
                                className={`px-3 py-1.5 rounded text-xs font-bold ${
                                  canAfford
                                    ? 'bg-[#E5A93C] hover:bg-[#F0BA52] text-[#1A1512] cursor-pointer'
                                    : 'bg-[#2B221C] text-[#756A60] cursor-not-allowed'
                                }`}
                              >
                                Buy
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-[#261F1A] border border-[#D4A857]/25">
                      <h3 className="text-xs font-semibold text-[#E5A93C] mb-3 flex items-center gap-1.5">
                        <ArrowRightLeft className="w-4 h-4" /> Sell From Your Bag (Instant Silver)
                      </h3>
                      <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                        {progress.inventory.map((it) => {
                          const tpl = ITEM_TEMPLATES[it.templateId];
                          if (!tpl) return null;
                          const payout = Math.max(
                            5,
                            Math.round(tpl.basePrice * 0.78 * RARITY_META[it.rarity].mult * it.qty),
                          );
                          return (
                            <div
                              key={it.uid}
                              className="p-2.5 rounded bg-[#1A1512] flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div
                                  className="text-xs font-semibold truncate"
                                  style={{ color: RARITY_META[it.rarity].color }}
                                >
                                  T{tpl.tier} {tpl.name} {it.qty > 1 ? `×${it.qty}` : ''}
                                </div>
                                <div className="text-[11px] font-mono-num text-[#56B870]">
                                  +{payout} Silver
                                </div>
                              </div>
                              <button
                                onClick={() => engine.sellToAiAdventurer(it.uid)}
                                className="px-3 py-1.5 rounded bg-[#362C24] hover:bg-[#E5A93C] hover:text-[#1A1512] text-xs font-semibold text-[#F5EFE6] cursor-pointer"
                              >
                                Sell
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
