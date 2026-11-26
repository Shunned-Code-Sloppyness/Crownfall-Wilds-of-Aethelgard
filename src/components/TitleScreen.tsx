import React from 'react';

interface TitleScreenProps {
  onStart: () => void;
  onlineCount: number;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, onlineCount }) => {
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-between px-6 py-10 pointer-events-none bg-gradient-to-b from-[#140F0C]/55 via-transparent to-[#140F0C]/85">
      <div className="w-full max-w-4xl flex items-center justify-between text-xs text-[#E8DFD3]/85">
        <span className="font-mono-num tracking-wide">AETHELGARD FRONTIER</span>
        <span className="font-mono-num">
          {onlineCount} {onlineCount === 1 ? 'Adventurer' : 'Adventurers'} Connected · Shared Market Active
        </span>
      </div>

      <div className="flex flex-col items-center text-center max-w-2xl pointer-events-auto">
        {/* Bespoke inline SVG medieval crest & crown-sword emblem */}
        <svg
          width="96"
          height="78"
          viewBox="0 0 96 78"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mb-4 drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)]"
          aria-hidden="true"
        >
          <path
            d="M48 6L57 22L77 16L68 38H28L19 16L39 22L48 6Z"
            fill="#E5A93C"
            stroke="#3B2412"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M28 42H68L63 52H33L28 42Z"
            fill="#C98A2E"
            stroke="#3B2412"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path
            d="M48 16V72"
            stroke="#F5EFE6"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <path
            d="M35 58H61"
            stroke="#E5A93C"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="48" cy="30" r="4.5" fill="#9C2F26" stroke="#3B2412" strokeWidth="1.5" />
          <circle cx="31" cy="31" r="3" fill="#4A8FE7" stroke="#3B2412" strokeWidth="1.2" />
          <circle cx="65" cy="31" r="3" fill="#48A868" stroke="#3B2412" strokeWidth="1.2" />
        </svg>

        <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-wide text-[#FAF4E8] drop-shadow-[0_4px_16px_rgba(16,10,6,0.9)] [text-wrap:balance]">
          Crownfall
        </h1>
        <p className="font-display text-base sm:text-xl text-[#E5A93C] tracking-[0.18em] uppercase mt-1 drop-shadow-[0_2px_10px_rgba(16,10,6,0.9)]">
          Wilds of Aethelgard
        </p>

        <p className="mt-4 text-sm sm:text-base text-[#E8DFD3] max-w-lg leading-relaxed drop-shadow-[0_2px_8px_rgba(16,10,6,0.95)]">
          Master active dodge-rolls, timed parry counters, and skill-shot combat. Mine iron ore, fish sunlit waters, hunt and skin frontier wildlife, ride mounts, craft every blade, and trade in a live shared market.
        </p>

        <button
          onClick={onStart}
          className="mt-8 min-h-[52px] px-10 py-3.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0BA52] active:scale-[0.98] text-[#1A1512] font-bold text-base tracking-wide shadow-[0_8px_28px_rgba(229,169,60,0.35)] border border-[#FFE38A]/70 transition-all cursor-pointer whitespace-nowrap"
        >
          Enter World
        </button>
      </div>

      <div className="text-center text-xs sm:text-sm text-[#D8CEC0] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
        WASD / Stick Move · Click Attack · Q/E/R Skills · Space Dodge · F Parry · M Mount · E Interact
      </div>
    </div>
  );
};
