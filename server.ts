import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createItemInstance, ITEM_TEMPLATES } from './src/game/catalog.ts';
import type { MarketListing, RemotePlayer } from './src/game/types.ts';

const PORT = Number(process.env.PORT || 3000);
const MARKET_FILE = path.resolve(process.cwd(), '.crownfall-market.json');

interface MarketStore {
  listings: MarketListing[];
}

const AI_MERCHANTS = [
  { id: 'ai_aldric', name: 'Aldric Ironforge' },
  { id: 'ai_lyra', name: 'Lyra Swiftbow' },
  { id: 'ai_seraphina', name: 'Seraphina Dawn' },
  { id: 'ai_garrick', name: 'Garrick Wolfbane' },
  { id: 'ai_talia', name: 'Talia Sunblade' },
];

const AI_CATALOG_POOL: { templateId: string; qty: number; rarity?: 'common' | 'uncommon' | 'rare' | 'epic' }[] = [
  { templateId: 'ore_iron', qty: 6 },
  { templateId: 'bar_iron', qty: 4 },
  { templateId: 'bar_bronze', qty: 5 },
  { templateId: 'plank_oak', qty: 5 },
  { templateId: 'leather_thin', qty: 5 },
  { templateId: 'cloth_skyweave', qty: 4 },
  { templateId: 'tool_pickaxe_t2', qty: 1 },
  { templateId: 'tool_pickaxe_t3', qty: 1 },
  { templateId: 'tool_axe_t2', qty: 1 },
  { templateId: 'tool_knife_t2', qty: 1 },
  { templateId: 'tool_rod_t2', qty: 1 },
  { templateId: 'wpn_greataxe_t2', qty: 1, rarity: 'uncommon' },
  { templateId: 'wpn_hammer_t3', qty: 1, rarity: 'rare' },
  { templateId: 'wpn_bow_t3', qty: 1, rarity: 'uncommon' },
  { templateId: 'wpn_frost_staff_t2', qty: 1, rarity: 'uncommon' },
  { templateId: 'wpn_nature_staff_t3', qty: 1, rarity: 'rare' },
  { templateId: 'off_shield_t2', qty: 1, rarity: 'uncommon' },
  { templateId: 'off_buckler_t3', qty: 1, rarity: 'rare' },
  { templateId: 'off_torch_t2', qty: 1, rarity: 'uncommon' },
  { templateId: 'off_dirk_t3', qty: 1, rarity: 'rare' },
  { templateId: 'off_tome_t2', qty: 1, rarity: 'uncommon' },
  { templateId: 'off_orb_t3', qty: 1, rarity: 'rare' },
  { templateId: 'arm_plate_chest_t3', qty: 1, rarity: 'uncommon' },
  { templateId: 'arm_leather_chest_t2', qty: 1, rarity: 'uncommon' },
  { templateId: 'arm_cloth_chest_t3', qty: 1, rarity: 'rare' },
  { templateId: 'mount_ox_t3', qty: 1, rarity: 'uncommon' },
  { templateId: 'mount_stag_t3', qty: 1, rarity: 'rare' },
  { templateId: 'pot_heal_minor', qty: 4 },
  { templateId: 'pot_berserk', qty: 2 },
  { templateId: 'pot_stoneskin', qty: 2 },
  { templateId: 'food_carp_pie', qty: 2 },
  { templateId: 'food_venison', qty: 3 },
  { templateId: 'fish_carp', qty: 3 },
  { templateId: 'fish_pike', qty: 2 },
];

function createSeededListings(): MarketListing[] {
  const listings: MarketListing[] = [];
  for (let i = 0; i < 16; i++) {
    const pick = AI_CATALOG_POOL[i % AI_CATALOG_POOL.length];
    const tpl = ITEM_TEMPLATES[pick.templateId];
    if (!tpl) continue;
    const merchant = AI_MERCHANTS[i % AI_MERCHANTS.length];
    const item = createItemInstance(pick.templateId, pick.qty, pick.rarity);
    const price = Math.max(15, Math.round(tpl.basePrice * pick.qty * (0.92 + Math.random() * 0.2)));
    listings.push({
      id: `mkt_seed_${i}_${Date.now().toString(36)}`,
      sellerId: merchant.id,
      sellerName: merchant.name,
      isAiSeller: true,
      item,
      price,
      createdAt: Date.now() - i * 45000,
    });
  }
  return listings;
}

function loadMarketStore(): MarketStore {
  try {
    if (fs.existsSync(MARKET_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(MARKET_FILE, 'utf-8')) as MarketStore;
      if (Array.isArray(parsed.listings) && parsed.listings.length > 0) {
        parsed.listings = parsed.listings.filter((l) => Boolean(ITEM_TEMPLATES[l.item?.templateId]));
        if (parsed.listings.length > 0) return parsed;
      }
    }
  } catch {
    // Re-seed if file corrupt
  }
  const seeded = { listings: createSeededListings() };
  saveMarketStore(seeded);
  return seeded;
}

function saveMarketStore(store: MarketStore): void {
  try {
    fs.writeFileSync(MARKET_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only environments
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const store = loadMarketStore();
  const activePlayers = new Map<string, RemotePlayer>();

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (payload: unknown) => {
    const text = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    }
  };

  const broadcastPresence = () => {
    const now = Date.now();
    for (const [id, p] of activePlayers.entries()) {
      if (now - p.lastSeen > 25000) activePlayers.delete(id);
    }
    broadcast({ type: 'presence:state', players: Array.from(activePlayers.values()) });
  };

  // ================= MARKET REST API =================

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, listings: store.listings.length, onlinePlayers: activePlayers.size });
  });

  app.get('/api/market', (_req, res) => {
    res.json({ listings: store.listings });
  });

  app.post('/api/market/list', (req, res) => {
    const { sellerId, sellerName, item, price } = req.body ?? {};
    if (
      typeof sellerId !== 'string' ||
      typeof sellerName !== 'string' ||
      !item ||
      typeof item.templateId !== 'string' ||
      !ITEM_TEMPLATES[item.templateId]
    ) {
      res.status(400).json({ error: 'Invalid listing item payload' });
      return;
    }
    const cleanPrice = Math.floor(Number(price));
    if (!Number.isFinite(cleanPrice) || cleanPrice < 1 || cleanPrice > 1000000) {
      res.status(400).json({ error: 'Price must be between 1 and 1,000,000 Silver' });
      return;
    }

    const listing: MarketListing = {
      id: `mkt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      sellerId,
      sellerName: sellerName.slice(0, 28),
      isAiSeller: false,
      item: {
        uid: String(item.uid || `itm_${Date.now()}`),
        templateId: item.templateId,
        qty: Math.max(1, Math.min(999, Math.floor(Number(item.qty) || 1))),
        rarity: item.rarity || ITEM_TEMPLATES[item.templateId].rarity,
        durability: item.durability,
      },
      price: cleanPrice,
      createdAt: Date.now(),
    };

    store.listings.unshift(listing);
    if (store.listings.length > 60) {
      store.listings = store.listings.slice(0, 60);
    }
    saveMarketStore(store);
    broadcast({ type: 'market:state', listings: store.listings });
    res.json({ ok: true, listing, listings: store.listings });
  });

  app.post('/api/market/buy', (req, res) => {
    const { listingId, buyerId, buyerName } = req.body ?? {};
    const idx = store.listings.findIndex((l) => l.id === listingId);
    if (idx === -1) {
      res.status(404).json({ error: 'Listing already sold or cancelled', listings: store.listings });
      return;
    }
    const listing = store.listings[idx];
    if (listing.sellerId === buyerId) {
      res.status(400).json({ error: 'Use Cancel to reclaim your own listing' });
      return;
    }
    store.listings.splice(idx, 1);
    saveMarketStore(store);

    const itemName = ITEM_TEMPLATES[listing.item.templateId]?.name ?? listing.item.templateId;
    broadcast({ type: 'market:state', listings: store.listings });
    if (!listing.isAiSeller) {
      broadcast({
        type: 'market:sold',
        sellerId: listing.sellerId,
        itemName: `${listing.item.qty}× ${itemName}`,
        price: listing.price,
        buyerName: String(buyerName || 'Adventurer'),
      });
    }

    res.json({ ok: true, listing, listings: store.listings });
  });

  app.post('/api/market/cancel', (req, res) => {
    const { listingId, sellerId } = req.body ?? {};
    const idx = store.listings.findIndex((l) => l.id === listingId && l.sellerId === sellerId);
    if (idx === -1) {
      res.status(404).json({ error: 'Listing not found', listings: store.listings });
      return;
    }
    const [removed] = store.listings.splice(idx, 1);
    saveMarketStore(store);
    broadcast({ type: 'market:state', listings: store.listings });
    res.json({ ok: true, listing: removed, listings: store.listings });
  });

  // ================= WEBSOCKET REAL-TIME PRESENCE & MARKET SYNC =================

  wss.on('connection', (ws) => {
    let boundPlayerId: string | null = null;
    ws.send(JSON.stringify({ type: 'market:state', listings: store.listings }));
    ws.send(JSON.stringify({ type: 'presence:state', players: Array.from(activePlayers.values()) }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'market:sync') {
          ws.send(JSON.stringify({ type: 'market:state', listings: store.listings }));
        } else if (msg.type === 'presence:update' && typeof msg.id === 'string') {
          boundPlayerId = msg.id;
          activePlayers.set(msg.id, {
            id: msg.id,
            name: String(msg.name || 'Warden').slice(0, 24),
            zoneId: msg.zoneId || 'oakhaven',
            x: Number(msg.x) || 1100,
            y: Number(msg.y) || 900,
            facing: Number(msg.facing) || 0,
            armorClass: msg.armorClass || 'leather',
            weaponArchetype: msg.weaponArchetype || 'sword',
            mounted: Boolean(msg.mounted),
            level: Number(msg.level) || 1,
            lastSeen: Date.now(),
          });
          broadcastPresence();
        }
      } catch {
        // Ignore invalid WS messages
      }
    });

    ws.on('close', () => {
      if (boundPlayerId) {
        activePlayers.delete(boundPlayerId);
        broadcastPresence();
      }
    });
  });

  // ================= AUTONOMOUS AI ADVENTURER ECONOMY LOOP =================
  // Keeps the shared market lively: AI adventurers restock crafted goods & buy fairly-priced player listings!
  setInterval(() => {
    let changed = false;

    // 1. AI Adventurers evaluate and purchase fairly-priced player listings
    const playerListingIdx = store.listings.findIndex((l) => {
      if (l.isAiSeller) return false;
      const tpl = ITEM_TEMPLATES[l.item.templateId];
      if (!tpl) return false;
      const fairValue = tpl.basePrice * l.item.qty * 1.35;
      return l.price <= fairValue && Date.now() - l.createdAt > 12000;
    });

    if (playerListingIdx !== -1 && Math.random() < 0.65) {
      const [bought] = store.listings.splice(playerListingIdx, 1);
      const buyer = AI_MERCHANTS[Math.floor(Math.random() * AI_MERCHANTS.length)];
      const itemName = ITEM_TEMPLATES[bought.item.templateId]?.name ?? bought.item.templateId;
      broadcast({
        type: 'market:sold',
        sellerId: bought.sellerId,
        itemName: `${bought.item.qty}× ${itemName}`,
        price: bought.price,
        buyerName: buyer.name,
      });
      changed = true;
    }

    // 2. Keep at least 14 AI merchant listings stocked with fresh Iron Bars, Gear, Mounts, Fish & Potions
    const aiCount = store.listings.filter((l) => l.isAiSeller).length;
    if (aiCount < 14) {
      const pick = AI_CATALOG_POOL[Math.floor(Math.random() * AI_CATALOG_POOL.length)];
      const tpl = ITEM_TEMPLATES[pick.templateId];
      if (tpl) {
        const merchant = AI_MERCHANTS[Math.floor(Math.random() * AI_MERCHANTS.length)];
        store.listings.push({
          id: `mkt_ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          sellerId: merchant.id,
          sellerName: merchant.name,
          isAiSeller: true,
          item: createItemInstance(pick.templateId, pick.qty, pick.rarity),
          price: Math.max(15, Math.round(tpl.basePrice * pick.qty * (0.9 + Math.random() * 0.22))),
          createdAt: Date.now(),
        });
        changed = true;
      }
    }

    if (changed) {
      saveMarketStore(store);
      broadcast({ type: 'market:state', listings: store.listings });
    }
  }, 15000);

  // ================= VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING =================
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist/index.html'));
  if (isProd) {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Crownfall: Wilds of Aethelgard server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
