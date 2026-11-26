import React, { useRef, useState } from 'react';
import {
  Backpack,
  Hammer,
  Pickaxe,
  Shield,
  SlidersHorizontal,
  Store,
  Volume2,
  VolumeX,
  Wind,
  Sparkles,
  Swords,
  FlaskConical,
  Footprints,
  Crown,
  Shirt,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ITEM_TEMPLATES } from '../game/catalog';
import { AbilitySource, ActionBarSlotHud, ActiveModalState, HudSnapshot } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  onOpenModal: (modal: ActiveModalState) => void;
  onOpenSettings: (tab?: 'gameplay' | 'display' | 'controls' | 'slots') => void;
  onToggleMute: () => void;
  onStickMove: (x: number, y: number) => void;
  onBasicAttack: () => void;
  onDodge: () => void;
  onParry: () => void;
  onToggleMount: () => void;
  onQuickPotion: () => void;
  onInteract: () => void;
  onSlotAim: (slotIndex: number | null, dx?: number, dy?: number) => void;
  onSlotCast: (slotIndex: number, dx: number, dy: number) => void;
  onFishingReelHold: (holding: boolean) => void;
  onCancelFishing: () => void;
  onZoomDelta: (delta: number) => void;
}

const SOURCE_SHORT: Record<AbilitySource, string> = {
  weapon: 'WPN',
  helmet: 'HLM',
  chest: 'CHS',
  boots: 'BTS',
};

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onOpenModal,
  onOpenSettings,
  onToggleMute,
  onStickMove,
  onBasicAttack,
  onDodge,
  onParry,
  onToggleMount,
  onQuickPotion,
  onInteract,
  onSlotAim,
  onSlotCast,
  onFishingReelHold,
  onCancelFishing,
  onZoomDelta,
}) => {
  const settings = hud.settings;

  // Virtual thumbstick state
  const stickBaseRef = useRef<HTMLDivElement | null>(null);
  const stickPointerId = useRef<number | null>(null);
  const [stickKnob, setStickKnob] = useState({ x: 0, y: 0 });

  // Drag-aim ability button state (supports all 6 customizable slots)
  const slotDragRef = useRef<{
    slotIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
  } | null>(null);
  const [draggingSlotIdx, setDraggingSlotIdx] = useState<number | null>(null);

  const handleStickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    stickPointerId.current = e.pointerId;
    updateStickFromEvent(e);
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateStickFromEvent(e);
  };

  const handleStickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    stickPointerId.current = null;
    setStickKnob({ x: 0, y: 0 });
    onStickMove(0, 0);
  };

  const updateStickFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stickBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.4;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setStickKnob({ x: dx, y: dy });
    onStickMove(dx / maxR, dy / maxR);
  };

  const handleSlotDown = (slot: ActionBarSlotHud) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!settings.dragSkillShots || slot.def.aimType === 'self') {
      onSlotCast(slot.slotIndex, 0, 0);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    slotDragRef.current = {
      slotIndex: slot.slotIndex,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
    };
    setDraggingSlotIdx(slot.slotIndex);
    onSlotAim(slot.slotIndex, 0, 0);
  };

  const handleSlotMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = slotDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = (e.clientX - drag.startX) / 55;
    const dy = (e.clientY - drag.startY) / 55;
    const mag = Math.hypot(dx, dy);
    const nx = mag > 1 ? dx / mag : dx;
    const ny = mag > 1 ? dy / mag : dy;
    drag.dx = nx;
    drag.dy = ny;
    onSlotAim(drag.slotIndex, nx, ny);
  };

  const handleSlotUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = slotDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const { slotIndex, dx, dy } = drag;
    slotDragRef.current = null;
    setDraggingSlotIdx(null);
    onSlotAim(null);
    onSlotCast(slotIndex, dx, dy);
  };

  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const shieldPct = Math.max(0, Math.min(100, (hud.shieldHp / Math.max(1, hud.maxHp)) * 100));
  const enPct = Math.max(0, Math.min(100, (hud.energy / Math.max(1, hud.maxEnergy)) * 100));
  const xpPct = Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpToNext)) * 100));

  const riskColor =
    hud.zoneRisk === 'safe'
      ? 'text-[#56B870]'
      : hud.zoneRisk === 'high_risk'
      ? 'text-[#F06454]'
      : 'text-[#E5A93C]';

  const stickSizeClass =
    settings.stickSize === 'small'
      ? 'w-24 h-24'
      : settings.stickSize === 'large'
      ? 'w-32 h-32 sm:w-36 sm:h-36'
      : 'w-28 h-28 sm:w-32 sm:h-32';

  const scaleClass =
    settings.hudScale === 'compact'
      ? 'scale-95 origin-bottom-right'
      : settings.hudScale === 'large'
      ? 'scale-105 origin-bottom-right'
      : '';

  const primarySlots = hud.skills.slice(0, 3);
  const secondarySlots = hud.skills.slice(3, 6);

  const nearbyActionLabel = hud.nearby
    ? hud.nearby.kind === 'fish'
      ? 'FISH'
      : hud.nearby.kind === 'skin'
      ? 'SKIN'
      : hud.nearby.kind === 'gather'
      ? 'GATHER'
      : hud.nearby.kind === 'portal'
      ? 'TRAVEL'
      : hud.nearby.kind === 'trade_ai'
      ? 'TRADE'
      : 'OPEN'
    : 'GATHER';

  const renderSlotIcon = (slot: ActionBarSlotHud) => {
    if (slot.source === 'helmet') return <Crown className="w-3.5 h-3.5" style={{ color: slot.def.color }} />;
    if (slot.source === 'chest') return <Shirt className="w-3.5 h-3.5" style={{ color: slot.def.color }} />;
    if (slot.source === 'boots') return <Footprints className="w-3.5 h-3.5" style={{ color: slot.def.color }} />;
    return <Sparkles className="w-3.5 h-3.5" style={{ color: slot.def.color }} />;
  };

  const renderAbilityButton = (slot: ActionBarSlotHud, compact = false) => {
    const onCd = slot.cooldownRemaining > 0.05;
    const isDragging = draggingSlotIdx === slot.slotIndex;
    const sizeCls = compact
      ? 'w-[48px] h-[48px] sm:w-[54px] sm:h-[54px]'
      : 'w-[54px] h-[54px] sm:w-[60px] sm:h-[60px]';
    return (
      <button
        key={`${slot.slotIndex}_${slot.bindingId}`}
        onPointerDown={handleSlotDown(slot)}
        onPointerMove={handleSlotMove}
        onPointerUp={handleSlotUp}
        onPointerCancel={handleSlotUp}
        title={`${slot.def.name} (${slot.hotkey}) [${SOURCE_SHORT[slot.source]}] — ${slot.def.description}`}
        className={`relative ${sizeCls} rounded-full border-2 flex flex-col items-center justify-center touch-none cursor-pointer transition-transform ${
          isDragging
            ? 'scale-110 border-[#FFE38A] bg-[#3A2D20]'
            : onCd || !slot.canAfford
            ? 'border-[#574B42] bg-[#1A1512]/82 opacity-65'
            : slot.source === 'weapon'
            ? 'border-[#D4A857]/75 bg-[#221B16]/92 hover:bg-[#30261F]'
            : 'border-[#7DD4E8]/60 bg-[#1B2024]/92 hover:bg-[#262E35]'
        }`}
      >
        <span className="absolute -top-1.5 -right-1 px-1 rounded bg-[#14100D] border border-[#D4A857]/40 text-[8px] font-mono-num font-bold text-[#FFE38A] leading-tight">
          {slot.hotkey}
        </span>
        {renderSlotIcon(slot)}
        <span className="text-[8px] font-mono-num font-semibold text-[#D8CEC0] leading-none mt-0.5">
          {SOURCE_SHORT[slot.source]}
        </span>
        <span className="text-[8px] text-[#F5EFE6] truncate max-w-[44px] leading-tight">
          {slot.def.name.split(' ')[0]}
        </span>
        {onCd && (
          <span className="absolute inset-0 rounded-full bg-black/68 flex items-center justify-center font-mono-num text-xs sm:text-sm font-bold text-[#FFE38A]">
            {slot.cooldownRemaining.toFixed(1)}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none flex flex-col justify-between p-2.5 sm:p-4">
      {/* ================= TOP ROW: VITALS · ZONE/BOSS · MINIMAP & MENUS ================= */}
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left Character Cluster */}
        <div className="pointer-events-auto bg-[#1A1512]/90 border border-[#D4A857]/30 rounded-lg px-3 py-2 w-[205px] sm:w-[250px] shadow-lg">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-[#F5EFE6] truncate">
              {hud.playerName} · Lv <span className="font-mono-num text-[#E5A93C]">{hud.level}</span>
            </span>
            <span className="font-mono-num text-[#E5A93C] font-semibold">
              {hud.silver.toLocaleString()} Ag
            </span>
          </div>

          {/* HP + Active Armor Shield Bar */}
          <div className="relative h-3.5 bg-[#2B201B] rounded overflow-hidden mb-1">
            <div
              className="h-full bg-[#C94438] transition-[width] duration-100"
              style={{ width: `${hpPct}%` }}
            />
            {hud.shieldHp > 0 && (
              <div
                className="absolute top-0 bottom-0 left-0 bg-[#7DD4E8]/55 border-r border-[#D6F7FF]"
                style={{ width: `${shieldPct}%` }}
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono-num font-semibold text-[#FAF4E8]">
              HP {hud.hp}/{hud.maxHp}
              {hud.shieldHp > 0 ? ` (+${hud.shieldHp})` : ''}
            </span>
          </div>

          {/* Energy Bar */}
          <div className="relative h-3 bg-[#1B2533] rounded overflow-hidden mb-1">
            <div
              className="h-full bg-[#4A8FE7] transition-[width] duration-100"
              style={{ width: `${enPct}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono-num font-medium text-[#EBF4FF]">
              EN {hud.energy}/{hud.maxEnergy}
            </span>
          </div>

          {/* XP Hairline */}
          <div className="h-1 bg-[#2E2620] rounded overflow-hidden mb-1.5">
            <div className="h-full bg-[#E5A93C]" style={{ width: `${xpPct}%` }} />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#B8AA99]">
            <span className="capitalize">
              {hud.armorClass} · {hud.weaponDamageType}
            </span>
            <span
              className={`font-mono-num ${
                hud.carryWeight > hud.maxCarryWeight ? 'text-[#F06454] font-semibold' : ''
              }`}
            >
              {hud.carryWeight}/{hud.maxCarryWeight}kg
            </span>
          </div>

          {/* Active Potion / Food / Armor Buffs */}
          {hud.buffs.length > 0 && (
            <div className="mt-1.5 pt-1 border-t border-[#D4A857]/20 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[#8CF59E]">
              {hud.buffs.map((b) => (
                <span key={b.id} className="font-mono-num">
                  {b.name} {Math.ceil(b.remaining)}s
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Top-Center: Zone Header, Boss Health Bar & Notifications */}
        <div className="hidden md:flex flex-col items-center gap-2 max-w-md flex-1">
          <div className="bg-[#1A1512]/88 border border-[#D4A857]/25 rounded-lg px-4 py-1.5 text-center shadow">
            <div className="font-display text-sm font-semibold text-[#F5EFE6] tracking-wide">
              {hud.zoneName}
            </div>
            <div className={`text-[11px] font-medium ${riskColor}`}>
              {hud.zoneTier} · {hud.onlineCount} Online
            </div>
          </div>

          {hud.activeBoss && (
            <div className="w-full max-w-sm bg-[#1F1514]/92 border border-[#E5A93C]/50 rounded-lg px-3.5 py-2 shadow-lg">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-display font-bold text-[#FFE38A]">
                  T{hud.activeBoss.tier} {hud.activeBoss.name}
                </span>
                <span className="font-mono-num text-[10px] text-[#FF9B8A]">
                  {hud.activeBoss.state}
                </span>
              </div>
              <div className="relative h-3.5 bg-[#331B1A] rounded overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#C93B2E] to-[#E89B3C]"
                  style={{
                    width: `${Math.max(0, (hud.activeBoss.hp / Math.max(1, hud.activeBoss.maxHp)) * 100)}%`,
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono-num font-bold text-white">
                  {hud.activeBoss.hp} / {hud.activeBoss.maxHp}
                </span>
              </div>
            </div>
          )}

          {hud.toast && (
            <div
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium border shadow-md ${
                hud.toast.tone === 'gold'
                  ? 'bg-[#292014]/95 border-[#E5A93C]/60 text-[#FFE38A]'
                  : hud.toast.tone === 'danger'
                  ? 'bg-[#2E1614]/95 border-[#D94E41]/60 text-[#FFB4AB]'
                  : hud.toast.tone === 'warn'
                  ? 'bg-[#2E2114]/95 border-[#E89B3C]/60 text-[#FFD08A]'
                  : 'bg-[#1E1A16]/95 border-[#D4A857]/30 text-[#F5EFE6]'
              }`}
            >
              {hud.toast.text}
            </div>
          )}
        </div>

        {/* Top-Right: Gear · Craft · Market · Audio · Menu/Settings & Live Minimap */}
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={() => onOpenModal({ type: 'character' })}
              title="Gear, Offhands, Tools & Bag (I)"
              className="min-h-[44px] min-w-[44px] px-2 sm:px-2.5 rounded-lg bg-[#1A1512]/90 hover:bg-[#2B221C] border border-[#D4A857]/30 flex items-center justify-center gap-1.5 text-xs font-medium text-[#F5EFE6] cursor-pointer"
            >
              <Backpack className="w-4 h-4 text-[#E5A93C]" />
              <span className="hidden sm:inline">Gear</span>
            </button>
            <button
              onClick={() => onOpenModal({ type: 'craft', station: 'field' })}
              title="Field Crafting (K)"
              className="min-h-[44px] min-w-[44px] px-2 sm:px-2.5 rounded-lg bg-[#1A1512]/90 hover:bg-[#2B221C] border border-[#D4A857]/30 flex items-center justify-center gap-1.5 text-xs font-medium text-[#F5EFE6] cursor-pointer"
            >
              <Hammer className="w-4 h-4 text-[#E5A93C]" />
              <span className="hidden sm:inline">Craft</span>
            </button>
            <button
              onClick={() => onOpenModal({ type: 'market' })}
              title="Grand Auction Market"
              className="min-h-[44px] min-w-[44px] px-2 sm:px-2.5 rounded-lg bg-[#1A1512]/90 hover:bg-[#2B221C] border border-[#D4A857]/30 flex items-center justify-center gap-1.5 text-xs font-medium text-[#F5EFE6] cursor-pointer"
            >
              <Store className="w-4 h-4 text-[#E5A93C]" />
              <span className="hidden sm:inline">Market</span>
            </button>
            <button
              onClick={onToggleMute}
              title="Mute / Unmute Audio"
              className="min-h-[44px] min-w-[44px] rounded-lg bg-[#1A1512]/90 hover:bg-[#2B221C] border border-[#D4A857]/30 flex items-center justify-center text-[#F5EFE6] cursor-pointer"
            >
              {hud.muted ? <VolumeX className="w-4 h-4 text-[#B8AA99]" /> : <Volume2 className="w-4 h-4 text-[#E5A93C]" />}
            </button>
            <button
              onClick={() => onOpenSettings('gameplay')}
              title="Menu, Settings, Controls & Spell Slots (O / Esc)"
              className="min-h-[44px] min-w-[44px] px-2 sm:px-2.5 rounded-lg bg-[#241C16]/95 hover:bg-[#342920] border border-[#E5A93C]/55 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#FFE38A] cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#E5A93C]" />
              <span className="hidden sm:inline">Menu</span>
            </button>
          </div>

          {/* Camera Zoom Controls (Closer Heroic View <-> Wider Tactical View) */}
          <div className="pointer-events-auto flex items-center gap-1 bg-[#1A1512]/90 border border-[#D4A857]/30 rounded-lg p-1 shadow">
            <button
              onClick={() => onZoomDelta(-0.14)}
              title="Zoom Closer to Character & Ground (= / Scroll Up)"
              className="min-h-[36px] min-w-[36px] rounded bg-[#261F1A] hover:bg-[#362C24] flex items-center justify-center text-[#FFE38A] cursor-pointer"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="px-1.5 font-mono-num text-[10px] text-[#D8CEC0] font-semibold">
              {Math.round((1 / Math.max(0.5, settings.cameraZoom ?? 0.85)) * 85)}%
            </span>
            <button
              onClick={() => onZoomDelta(0.14)}
              title="Zoom Farther Out (- / Scroll Down)"
              className="min-h-[36px] min-w-[36px] rounded bg-[#261F1A] hover:bg-[#362C24] flex items-center justify-center text-[#FFE38A] cursor-pointer"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>

          {/* Crisp SVG Minimap (Respects Display Settings) */}
          {settings.showMinimap && (
            <div className="hidden sm:block bg-[#1A1512]/90 border border-[#D4A857]/35 rounded-lg p-1.5 shadow-lg">
              <svg width="136" height="96" viewBox={`0 0 ${hud.minimap.width} ${hud.minimap.height}`} className="rounded bg-[#2A241D]">
                {hud.minimap.structures.map((s, idx) => (
                  <circle
                    key={idx}
                    cx={s.x}
                    cy={s.y}
                    r={s.isCenter ? 78 : 52}
                    fill={s.isCenter ? '#FFE38A' : s.color}
                  />
                ))}
                {hud.minimap.portals.map((p, idx) => (
                  <rect key={idx} x={p.x - 55} y={p.y - 55} width="110" height="110" rx="20" fill="#56B870" />
                ))}
                {hud.minimap.bosses.map(
                  (b, idx) =>
                    b.alive && (
                      <circle key={idx} cx={b.x} cy={b.y} r={82} fill="#D94E41" stroke="#FFE38A" strokeWidth="20" />
                    ),
                )}
                {hud.minimap.adventurers.map((a, idx) => (
                  <circle key={idx} cx={a.x} cy={a.y} r={40} fill={a.isPlayer ? '#7DD4E8' : '#A8E6B8'} />
                ))}
                <circle
                  cx={hud.minimap.playerX}
                  cy={hud.minimap.playerY}
                  r={58}
                  fill="#FFFFFF"
                  stroke="#1A1512"
                  strokeWidth="20"
                />
              </svg>
              <div className="text-[10px] text-[#B8AA99] text-center mt-0.5 truncate max-w-[136px]">
                {hud.zoneName}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Toast & Boss Bar */}
      <div className="flex md:hidden flex-col items-center gap-1.5 my-auto pointer-events-none">
        {hud.activeBoss && (
          <div className="w-64 bg-[#1F1514]/92 border border-[#E5A93C]/50 rounded-lg px-3 py-1.5">
            <div className="flex justify-between text-[11px] font-display font-bold text-[#FFE38A]">
              <span>{hud.activeBoss.name}</span>
              <span className="font-mono-num">{hud.activeBoss.hp}</span>
            </div>
            <div className="h-2.5 bg-[#331B1A] rounded overflow-hidden mt-1">
              <div
                className="h-full bg-[#E89B3C]"
                style={{ width: `${(hud.activeBoss.hp / Math.max(1, hud.activeBoss.maxHp)) * 100}%` }}
              />
            </div>
          </div>
        )}
        {hud.toast && (
          <div className="px-3 py-1 rounded bg-[#1E1814]/95 border border-[#E5A93C]/45 text-xs text-[#FFE38A]">
            {hud.toast.text}
          </div>
        )}
      </div>

      {/* ================= ALBION-STYLE FISHING MINIGAME OVERLAY ================= */}
      {hud.fishing && hud.fishing.active && (
        <div className="pointer-events-auto self-center mb-3 w-[320px] sm:w-[400px] bg-[#1A1512]/95 border border-[#7DD4E8]/55 rounded-xl p-3.5 shadow-2xl">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-display font-semibold text-[#9CE5FA]">
              Fishing · T{hud.fishing.tier}{' '}
              {ITEM_TEMPLATES[hud.fishing.fishTemplateId]?.name ?? 'Fish'}
            </span>
            <button
              onClick={onCancelFishing}
              className="text-[#B8AA99] hover:text-white text-xs px-2 py-0.5 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {hud.fishing.phase === 'waiting' && (
            <div className="text-center py-3 text-sm text-[#D8CEC0]">
              Bobber floating... watch for the splash bite!
            </div>
          )}

          {hud.fishing.phase === 'bite' && (
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onFishingReelHold(true);
              }}
              className="w-full min-h-[48px] rounded-lg bg-[#E5A93C] hover:bg-[#F5BE54] text-[#1A1512] font-bold text-sm cursor-pointer"
            >
              FISH BITING! Tap or Press Space to Hook!
            </button>
          )}

          {hud.fishing.phase === 'reeling' && (
            <div>
              <div className="relative h-8 rounded-md bg-[#261F1A] border border-[#D4A857]/30 overflow-hidden mb-2">
                <div
                  className="absolute top-0 bottom-0 bg-[#48A868]/45 border-x-2 border-[#7FF598]"
                  style={{
                    left: `${hud.fishing.zoneCenter - hud.fishing.zoneWidth / 2}%`,
                    width: `${hud.fishing.zoneWidth}%`,
                  }}
                />
                <div
                  className="absolute top-1 bottom-1 w-4 -ml-2 rounded bg-[#FFE38A] border border-[#1A1512] shadow"
                  style={{ left: `${hud.fishing.fishPos}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono-num text-[#D8CEC0] mb-2">
                <span>Catch: {Math.round(hud.fishing.progress)}%</span>
                <span className={hud.fishing.tension > 75 ? 'text-[#F06454] font-bold' : ''}>
                  Line Tension: {Math.round(hud.fishing.tension)}%
                </span>
              </div>

              <div className="h-2 bg-[#2B221D] rounded overflow-hidden mb-2.5">
                <div
                  className="h-full bg-[#56B870]"
                  style={{ width: `${hud.fishing.progress}%` }}
                />
              </div>

              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onFishingReelHold(true);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onFishingReelHold(false);
                }}
                onPointerLeave={() => onFishingReelHold(false)}
                className={`w-full min-h-[48px] rounded-lg font-bold text-sm transition-colors cursor-pointer ${
                  hud.fishing.holdingReel
                    ? 'bg-[#56B870] text-[#141A14]'
                    : 'bg-[#362C24] text-[#F5EFE6] border border-[#D4A857]/40'
                }`}
              >
                {hud.fishing.holdingReel ? 'REELING RIGHT...' : 'HOLD TO REEL (or Hold Space)'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= BOTTOM ROW: THUMBSTICK · CONTEXT INTERACT · 6-SLOT ABILITY & COMBAT WHEEL ================= */}
      <div
        className={`flex items-end justify-between gap-2 pb-1 ${
          settings.leftHandedLayout ? 'flex-row-reverse' : ''
        }`}
      >
        {/* Movement Side: Virtual Thumbstick + Mount, Potion & Slot Config Quick Buttons */}
        <div
          className={`flex items-end gap-2.5 sm:gap-3 ${
            settings.leftHandedLayout ? 'flex-row-reverse' : ''
          }`}
        >
          {settings.showVirtualStick !== 'off' && (
            <div
              ref={stickBaseRef}
              onPointerDown={handleStickDown}
              onPointerMove={handleStickMove}
              onPointerUp={handleStickUp}
              onPointerCancel={handleStickUp}
              className={`pointer-events-auto relative ${stickSizeClass} rounded-full bg-[#1A1512]/55 border-2 border-[#D4A857]/35 flex items-center justify-center touch-none`}
              aria-label="Movement thumbstick"
            >
              <div className="w-10 h-10 rounded-full border border-[#D4A857]/25" />
              <div
                className="absolute w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#E5A93C]/85 border-2 border-[#FFF2CC] shadow-lg"
                style={{
                  transform: `translate(${stickKnob.x}px, ${stickKnob.y}px)`,
                }}
              />
            </div>
          )}

          <div className="pointer-events-auto flex flex-col gap-1.5 sm:gap-2">
            <button
              onClick={onToggleMount}
              title="Mount / Dismount (M)"
              className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                hud.mounted
                  ? 'bg-[#E5A93C] text-[#1A1512] border-[#FFE38A]'
                  : 'bg-[#1A1512]/88 text-[#F5EFE6] border-[#D4A857]/35 hover:bg-[#2B221C]'
              }`}
            >
              <Footprints className="w-4 h-4 shrink-0" />
              <span>{hud.mounted ? 'Dismount' : 'Mount'}</span>
              <span className="hidden sm:inline font-mono-num text-[10px] opacity-75">M</span>
            </button>

            <button
              onClick={onQuickPotion}
              title="Drink Healing Potion / Food (H)"
              className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-lg bg-[#1A1512]/88 hover:bg-[#2B221C] border border-[#D94E41]/45 flex items-center gap-1.5 text-xs font-semibold text-[#F5EFE6] cursor-pointer"
            >
              <FlaskConical className="w-4 h-4 text-[#F06454] shrink-0" />
              <span className="font-mono-num">{hud.quickPotionCount}</span>
              <span className="hidden sm:inline font-mono-num text-[10px] text-[#B8AA99]">H</span>
            </button>

            <button
              onClick={() => onOpenSettings('slots')}
              title="Customize Gear Spells & Button Slots"
              className="min-h-[36px] px-2.5 rounded-lg bg-[#1A1512]/82 hover:bg-[#2B221C] border border-[#7DD4E8]/35 flex items-center gap-1.5 text-[11px] font-medium text-[#BFE9F7] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#7DD4E8] shrink-0" />
              <span>Spells</span>
            </button>
          </div>
        </div>

        {/* Center-Bottom: Channel Bar & Contextual Interact Banner */}
        <div className="flex flex-col items-center gap-1.5 mb-1 max-w-[230px] sm:max-w-xs">
          {hud.gatherChannelPct > 0 && (
            <div className="bg-[#1A1512]/92 border border-[#E5A93C]/50 rounded-lg px-3.5 py-1.5 w-48 sm:w-52 text-center">
              <div className="text-[11px] font-medium text-[#FFE38A] mb-1 truncate">
                {hud.gatherLabel}
              </div>
              <div className="h-2 bg-[#2B221D] rounded overflow-hidden">
                <div
                  className="h-full bg-[#E5A93C]"
                  style={{ width: `${Math.round(hud.gatherChannelPct * 100)}%` }}
                />
              </div>
            </div>
          )}

          {hud.nearby && !(hud.fishing && hud.fishing.active) && (
            <button
              onClick={onInteract}
              className={`pointer-events-auto min-h-[46px] px-3.5 py-1.5 rounded-xl border shadow-xl flex flex-col items-center cursor-pointer active:scale-[0.98] transition-transform ${
                hud.nearby.blockedReason
                  ? 'bg-[#2C1814]/95 border-[#E8704A]/65 text-[#FFD2C2]'
                  : 'bg-[#211A14]/95 border-[#E5A93C]/75 text-[#FAF4E8] hover:bg-[#2E241C]'
              }`}
            >
              <span className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                <span className="font-mono-num text-[10px] px-1.5 py-0.5 rounded bg-[#E5A93C] text-[#1A1512]">
                  G
                </span>
                {hud.nearby.label}
              </span>
              <span className="text-[10px] sm:text-[11px] text-[#D8CEC0] mt-0.5">
                {hud.nearby.blockedReason ?? hud.nearby.sublabel}
              </span>
            </button>
          )}
        </div>

        {/* Combat & Ability Wheel Side: 6 Customizable Weapon+Armor Slots + Gather/Parry/Dodge/Strike */}
        <div
          className={`pointer-events-auto flex flex-col gap-1.5 sm:gap-2 ${scaleClass} ${
            settings.leftHandedLayout ? 'items-start' : 'items-end'
          }`}
        >
          {/* Row 1: Armor / Custom Slots 4, 5, 6 (Default: Helmet [Z], Chest [X], Boots [C]) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {secondarySlots.map((slot) => renderAbilityButton(slot, true))}
          </div>

          {/* Row 2: Weapon / Custom Slots 1, 2, 3 (Default: Q, E, R — Drag to Aim Skill-Shots!) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {primarySlots.map((slot) => renderAbilityButton(slot, false))}
          </div>

          {/* Row 3: Mobile Gather/Interact · Parry · Dodge · Primary Strike */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onInteract();
              }}
              title="Gather / Skin / Fish / Open Nearby (G)"
              className={`relative w-[48px] h-[48px] sm:w-[54px] sm:h-[54px] rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                hud.nearby && !hud.nearby.blockedReason
                  ? 'bg-[#E5A93C] text-[#1A1512] border-[#FFF2CC] shadow-lg'
                  : hud.nearby?.blockedReason
                  ? 'bg-[#361B16] text-[#FFB8A8] border-[#E8704A]/70'
                  : 'bg-[#1D1713]/85 text-[#B8AA99] border-[#574B42] hover:bg-[#2A221C]'
              }`}
            >
              <Pickaxe className="w-4 h-4" />
              <span className="text-[8px] font-bold mt-0.5 leading-none">{nearbyActionLabel}</span>
            </button>

            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onParry();
              }}
              title="Parry Counter (F or Right-Click)"
              className={`relative w-[50px] h-[50px] sm:w-[56px] sm:h-[56px] rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                hud.parryActive || hud.riposteReady
                  ? 'bg-[#E5A93C] text-[#1A1512] border-[#FFF2CC]'
                  : hud.parryCooldownPct > 0.05
                  ? 'bg-[#1A1512]/75 text-[#B8AA99] border-[#574B42]'
                  : 'bg-[#221B16]/92 text-[#F5EFE6] border-[#E5A93C]/70 hover:bg-[#322820]'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span className="text-[8px] sm:text-[9px] font-bold mt-0.5">
                {hud.riposteReady ? 'RIPOSTE' : 'PARRY'}
              </span>
            </button>

            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onDodge();
              }}
              title="Dodge-Roll (Space)"
              className={`relative w-[50px] h-[50px] sm:w-[56px] sm:h-[56px] rounded-full border-2 flex flex-col items-center justify-center cursor-pointer ${
                hud.dodgeCooldownPct > 0.05
                  ? 'bg-[#1A1512]/75 text-[#B8AA99] border-[#574B42]'
                  : 'bg-[#221B16]/92 text-[#F5EFE6] border-[#7DD4E8]/65 hover:bg-[#2B2520]'
              }`}
            >
              <Wind className="w-4 h-4 text-[#9CE5FA]" />
              <span className="text-[8px] sm:text-[9px] font-bold mt-0.5">DODGE</span>
            </button>

            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onBasicAttack();
              }}
              title="Attack (Click)"
              className="w-[62px] h-[62px] sm:w-[68px] sm:h-[68px] rounded-full bg-[#C94438] hover:bg-[#D95548] active:scale-95 border-2 border-[#FFE38A] shadow-xl flex flex-col items-center justify-center text-[#FAF4E8] cursor-pointer"
            >
              <Swords className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="text-[9px] sm:text-[10px] font-bold mt-0.5">STRIKE</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
