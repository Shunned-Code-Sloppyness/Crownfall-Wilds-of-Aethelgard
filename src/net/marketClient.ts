import {
  ArmorClass,
  InventoryItem,
  MarketListing,
  RemotePlayer,
  WeaponArchetype,
  ZoneId,
} from '../game/types';

export interface MarketSyncCallbacks {
  onListings: (listings: MarketListing[]) => void;
  onRemotePlayers: (players: RemotePlayer[], onlineCount: number) => void;
  onSaleNotification: (itemName: string, silverEarned: number, buyerName: string) => void;
}

/**
 * WebSocket + HTTP client synchronizing the shared Auction Market and live player presence
 * with the authoritative Express/WebSocket server on port 3000.
 */
export class MarketNetworkClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private destroyed = false;
  public readonly clientId: string;
  private callbacks: MarketSyncCallbacks;
  private lastPresencePayload: Record<string, unknown> | null = null;

  constructor(callbacks: MarketSyncCallbacks) {
    this.callbacks = callbacks;
    const savedId =
      typeof window !== 'undefined' ? window.localStorage.getItem('crownfall_client_id') : null;
    if (savedId) {
      this.clientId = savedId;
    } else {
      this.clientId = `plr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('crownfall_client_id', this.clientId);
      }
    }
  }

  public connect(): void {
    if (typeof window === 'undefined' || this.destroyed) return;
    this.fetchListingsHttp().catch(() => {});

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        if (this.lastPresencePayload) {
          ws.send(JSON.stringify({ type: 'presence:update', ...this.lastPresencePayload }));
        }
        ws.send(JSON.stringify({ type: 'market:sync' }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'market:state' && Array.isArray(msg.listings)) {
            this.callbacks.onListings(msg.listings);
          } else if (msg.type === 'presence:state' && Array.isArray(msg.players)) {
            const others = (msg.players as RemotePlayer[]).filter((p) => p.id !== this.clientId);
            this.callbacks.onRemotePlayers(others, msg.players.length);
          } else if (msg.type === 'market:sold' && msg.sellerId === this.clientId) {
            this.callbacks.onSaleNotification(msg.itemName, msg.price, msg.buyerName);
          }
        } catch {
          // Ignore malformed payloads
        }
      };

      ws.onclose = () => {
        this.ws = null;
        if (!this.destroyed) {
          this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
        }
      };

      ws.onerror = () => {
        // Reconnect handled by onclose
      };
    } catch {
      // Fallback to HTTP polling if WS unavailable
    }
  }

  public sendPresence(data: {
    name: string;
    zoneId: ZoneId;
    x: number;
    y: number;
    facing: number;
    armorClass: ArmorClass;
    weaponArchetype: WeaponArchetype;
    mounted: boolean;
    level: number;
  }): void {
    const payload = { id: this.clientId, ...data };
    this.lastPresencePayload = payload;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'presence:update', ...payload }));
    }
  }

  public async fetchListingsHttp(): Promise<MarketListing[]> {
    const res = await fetch('/api/market');
    if (!res.ok) return [];
    const data = (await res.json()) as { listings: MarketListing[] };
    if (Array.isArray(data.listings)) {
      this.callbacks.onListings(data.listings);
      return data.listings;
    }
    return [];
  }

  public async createListing(
    sellerName: string,
    item: InventoryItem,
    price: number,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch('/api/market/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerId: this.clientId,
        sellerName,
        item,
        price,
      }),
    });
    const data = await res.json();
    if (Array.isArray(data.listings)) {
      this.callbacks.onListings(data.listings);
    }
    return { ok: res.ok, error: data.error };
  }

  public async buyListing(
    listingId: string,
    buyerName: string,
  ): Promise<{ ok: boolean; listing?: MarketListing; error?: string }> {
    const res = await fetch('/api/market/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId,
        buyerId: this.clientId,
        buyerName,
      }),
    });
    const data = await res.json();
    if (Array.isArray(data.listings)) {
      this.callbacks.onListings(data.listings);
    }
    return { ok: res.ok, listing: data.listing, error: data.error };
  }

  public async cancelListing(
    listingId: string,
  ): Promise<{ ok: boolean; listing?: MarketListing; error?: string }> {
    const res = await fetch('/api/market/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId,
        sellerId: this.clientId,
      }),
    });
    const data = await res.json();
    if (Array.isArray(data.listings)) {
      this.callbacks.onListings(data.listings);
    }
    return { ok: res.ok, listing: data.listing, error: data.error };
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
