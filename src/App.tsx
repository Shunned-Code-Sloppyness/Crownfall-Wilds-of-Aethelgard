import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameModals } from './components/GameModals';
import { TitleScreen } from './components/TitleScreen';
import { CrownfallEngine } from './game/engine';
import {
  ActiveModalState,
  HudSnapshot,
  MarketListing,
  PlayerProgress,
} from './game/types';
import { MarketNetworkClient } from './net/marketClient';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CrownfallEngine | null>(null);
  const netRef = useRef<MarketNetworkClient | null>(null);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [progress, setProgress] = useState<PlayerProgress | null>(null);
  const [modal, setModal] = useState<ActiveModalState>({ type: 'none' });
  const [marketListings, setMarketListings] = useState<MarketListing[]>([]);

  const handleOpenModal = useCallback((nextModal: ActiveModalState) => {
    setModal(nextModal);
    engineRef.current?.setModalOpen(nextModal.type !== 'none');
  }, []);

  useEffect(() => {
    const net = new MarketNetworkClient({
      onListings: (listings) => {
        setMarketListings(listings);
        if (engineRef.current) engineRef.current.marketListings = listings;
      },
      onRemotePlayers: (players, onlineCount) => {
        if (engineRef.current) {
          engineRef.current.remotePlayers = players;
          engineRef.current.onlineCount = Math.max(1, onlineCount);
        }
      },
      onSaleNotification: (itemName, silverEarned, buyerName) => {
        engineRef.current?.creditMarketSale(itemName, silverEarned, buyerName);
      },
    });
    netRef.current = net;

    const engine = new CrownfallEngine({
      onHudUpdate: (snapshot) => setHud(snapshot),
      onProgressChange: (prog) => setProgress(prog),
      onOpenModal: (nextModal) => {
        setModal(nextModal);
        engine.setModalOpen(nextModal.type !== 'none');
      },
      onPresenceSync: (payload) => net.sendPresence(payload),
    });
    engineRef.current = engine;

    if (canvasRef.current && overlayCanvasRef.current) {
      engine.attachCanvas(canvasRef.current, overlayCanvasRef.current);
    }
    net.connect();

    return () => {
      net.destroy();
      engine.detachCanvas();
    };
  }, []);

  const handleListMarketItem = async (uid: string, price: number) => {
    const engine = engineRef.current;
    const net = netRef.current;
    if (!engine || !net) return;
    const removed = engine.removeItemForMarketListing(uid);
    if (!removed) return;
    const res = await net.createListing(engine.progress.name, removed, price);
    if (!res.ok) {
      engine.restoreCancelledListingItem(removed);
      engine.showToast(res.error ?? 'Failed to list item on market', 'warn');
    } else {
      engine.showToast(`Listed on Grand Market for ${price} Silver!`, 'gold');
    }
  };

  const handleBuyMarketListing = async (listing: MarketListing) => {
    const engine = engineRef.current;
    const net = netRef.current;
    if (!engine || !net) return;
    if (engine.progress.silver < listing.price) {
      engine.showToast('Not enough Silver!', 'warn');
      return;
    }
    const res = await net.buyListing(listing.id, engine.progress.name);
    if (res.ok && res.listing) {
      engine.completeMarketPurchase(res.listing);
    } else {
      engine.showToast(res.error ?? 'Listing no longer available', 'warn');
    }
  };

  const handleCancelMarketListing = async (listingId: string) => {
    const engine = engineRef.current;
    const net = netRef.current;
    if (!engine || !net) return;
    const res = await net.cancelListing(listingId);
    if (res.ok && res.listing) {
      engine.restoreCancelledListingItem(res.listing.item);
      engine.showToast('Listing cancelled and item returned to bag', 'info');
    }
  };

  const handleRefreshMarket = async () => {
    await netRef.current?.fetchListingsHttp();
  };

  const engine = engineRef.current;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#1A1512]">
      {/* Isolated 3D WebGL Stylized World Canvas + Crisp Projected 2D World Labels Overlay */}
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair touch-none"
      />
      <canvas
        ref={overlayCanvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full z-10"
      />

      {/* Atmospheric Title Screen */}
      {hud && hud.screen === 'TITLE' && engine && (
        <TitleScreen
          onlineCount={hud.onlineCount}
          onStart={() => engine.startGame()}
        />
      )}

      {/* Low-Occlusion Gameplay HUD */}
      {hud && hud.screen === 'PLAYING' && engine && (
        <GameHud
          hud={hud}
          onOpenModal={handleOpenModal}
          onOpenSettings={(tab = 'gameplay') =>
            handleOpenModal({ type: 'settings', settingsTab: tab })
          }
          onToggleMute={() => engine.toggleMute()}
          onStickMove={(x, y) => engine.setVirtualStick(x, y)}
          onBasicAttack={() => engine.triggerBasicAttack()}
          onDodge={() => engine.triggerDodge()}
          onParry={() => engine.triggerParry()}
          onToggleMount={() => engine.toggleMount()}
          onQuickPotion={() => engine.useQuickPotion()}
          onInteract={() => engine.triggerInteract()}
          onSlotAim={(slotIndex, dx, dy) => engine.setSlotAimPreview(slotIndex, dx, dy)}
          onSlotCast={(slotIndex, dx, dy) => engine.castSlotFromTouch(slotIndex, dx, dy)}
          onFishingReelHold={(h) => engine.setFishingReelHold(h)}
          onCancelFishing={() => engine.cancelFishing()}
          onZoomDelta={(d) => engine.adjustCameraZoom(d)}
        />
      )}

      {/* Modals (Character/Gear, Village Chest, Crafting Stations, Auction Market, Direct Trade, Menu & Settings, Defeat) */}
      {hud && progress && engine && (
        <GameModals
          engine={engine}
          hud={hud}
          progress={progress}
          modal={modal}
          marketListings={marketListings}
          clientId={netRef.current?.clientId ?? ''}
          onClose={() => handleOpenModal({ type: 'none' })}
          onOpenModal={handleOpenModal}
          onListMarketItem={handleListMarketItem}
          onBuyMarketListing={handleBuyMarketListing}
          onCancelMarketListing={handleCancelMarketListing}
          onRefreshMarket={handleRefreshMarket}
        />
      )}
    </div>
  );
}
