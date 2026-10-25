/**
 * Cart state, persisted to localStorage and shared across tabs.
 * Only item IDs and quantities are authoritative; names and prices are a
 * display snapshot that the cart page re-validates against the live menu
 * (and the database re-prices everything at checkout anyway).
 */
import { useSyncExternalStore } from 'react';

export const MAX_QUANTITY = 20;
const STORAGE_KEY = 'smart-canteen:cart:v1';

export interface CartLine {
  itemId: string;
  quantity: number;
  name: string;
  pricePaise: number;
  imageUrl: string | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let lines: CartLine[] = load();

function isCartLine(value: unknown): value is CartLine {
  const v = value as CartLine;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.itemId === 'string' &&
    Number.isInteger(v.quantity) &&
    v.quantity > 0 &&
    typeof v.name === 'string' &&
    Number.isInteger(v.pricePaise)
  );
}

function load(): CartLine[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isCartLine).map((l) => ({ ...l, quantity: Math.min(l.quantity, MAX_QUANTITY) }))
      : [];
  } catch {
    return [];
  }
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); the cart still works in memory.
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      lines = load();
      listeners.forEach((l) => l());
    }
  });
}

export const cart = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => lines,

  add(item: Omit<CartLine, 'quantity'>, quantity = 1) {
    const existing = lines.find((l) => l.itemId === item.itemId);
    if (existing) {
      cart.setQuantity(item.itemId, existing.quantity + quantity);
    } else {
      commit([...lines, { ...item, quantity: Math.max(1, Math.min(quantity, MAX_QUANTITY)) }]);
    }
  },

  setQuantity(itemId: string, quantity: number) {
    const q = Math.floor(quantity);
    if (q <= 0) return cart.remove(itemId);
    commit(lines.map((l) => (l.itemId === itemId ? { ...l, quantity: Math.min(q, MAX_QUANTITY) } : l)));
  },

  /** Refresh display snapshot (name/price/image) from the live menu. */
  refresh(itemId: string, patch: Partial<Pick<CartLine, 'name' | 'pricePaise' | 'imageUrl'>>) {
    commit(lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
  },

  remove(itemId: string) {
    commit(lines.filter((l) => l.itemId !== itemId));
  },

  clear() {
    commit([]);
  },
};

export function cartTotals(current: CartLine[]) {
  return current.reduce(
    (acc, l) => ({ count: acc.count + l.quantity, subtotalPaise: acc.subtotalPaise + l.pricePaise * l.quantity }),
    { count: 0, subtotalPaise: 0 },
  );
}

export function useCart() {
  const current = useSyncExternalStore(cart.subscribe, cart.getSnapshot, cart.getSnapshot);
  return { lines: current, ...cartTotals(current) };
}

export function useCartQuantity(itemId: string) {
  return useSyncExternalStore(
    cart.subscribe,
    () => lines.find((l) => l.itemId === itemId)?.quantity ?? 0,
    () => 0,
  );
}
