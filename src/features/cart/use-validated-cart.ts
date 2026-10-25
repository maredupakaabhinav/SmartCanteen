import { useEffect, useMemo, useState } from 'react';
import { useMenu, useSettings } from '@/features/menu/queries';
import { getOpenState } from '@/features/menu/hours';
import type { MenuItem } from '@/types/database';
import { cart, useCart, type CartLine } from './cart-store';

export type LineIssue = 'removed' | 'unavailable' | 'sold-out' | 'insufficient-stock';

export interface ValidatedLine extends CartLine {
  item: MenuItem | null;
  issue: LineIssue | null;
  issueText: string | null;
  priceChanged: boolean;
}

/**
 * Re-checks the cart against the live menu: availability, stock and current
 * prices. Display prices are refreshed automatically; the database re-prices
 * the order again at checkout, so the client is never the source of truth.
 */
export function useValidatedCart() {
  const { lines } = useCart();
  const menu = useMenu();
  const settings = useSettings();

  const validated = useMemo<ValidatedLine[]>(() => {
    const byId = menu.data?.byId;
    return lines.map((line) => {
      if (!byId) return { ...line, item: null, issue: null, issueText: null, priceChanged: false };
      const item = byId.get(line.itemId) ?? null;
      let issue: LineIssue | null = null;
      let issueText: string | null = null;
      if (!item) {
        issue = 'removed';
        issueText = 'No longer on the menu';
      } else if (!item.is_available) {
        issue = 'unavailable';
        issueText = 'Currently unavailable';
      } else if (item.stock_quantity === 0) {
        issue = 'sold-out';
        issueText = 'Sold out';
      } else if (item.stock_quantity !== null && item.stock_quantity < line.quantity) {
        issue = 'insufficient-stock';
        issueText = `Only ${item.stock_quantity} left — reduce the quantity`;
      }
      return {
        ...line,
        item,
        issue,
        issueText,
        priceChanged: Boolean(item && item.price_paise !== line.pricePaise),
      };
    });
  }, [lines, menu.data]);

  // Keep the display snapshot in sync with live prices and names.
  const [pricesUpdated, setPricesUpdated] = useState(false);
  const anyPriceChanged = validated.some((l) => l.priceChanged);
  if (anyPriceChanged && !pricesUpdated) setPricesUpdated(true); // remember until the page is left
  useEffect(() => {
    for (const line of validated) {
      if (line.item && (line.priceChanged || line.item.name !== line.name || line.item.image_url !== line.imageUrl)) {
        cart.refresh(line.itemId, { pricePaise: line.item.price_paise, name: line.item.name, imageUrl: line.item.image_url });
      }
    }
  }, [validated]);

  const subtotalPaise = validated.reduce((sum, l) => sum + (l.item?.price_paise ?? l.pricePaise) * l.quantity, 0);
  const chargesPaise = settings.data?.service_fee_paise ?? 0;
  const count = validated.reduce((sum, l) => sum + l.quantity, 0);
  const openState = settings.data ? getOpenState(settings.data) : null;

  return {
    lines: validated,
    count,
    subtotalPaise,
    chargesPaise,
    totalPaise: subtotalPaise + chargesPaise,
    hasIssues: validated.some((l) => l.issue),
    priceChanged: pricesUpdated || anyPriceChanged,
    loading: menu.isPending || settings.isPending,
    error: menu.error ?? settings.error,
    openState,
  };
}
