import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { CanteenSettings, Category, MenuItem } from '@/types/database';

export const menuKeys = {
  menu: ['menu'] as const,
  popular: ['menu', 'popular'] as const,
  settings: ['settings'] as const,
};

export interface MenuData {
  categories: Category[];
  items: MenuItem[];
  byId: Map<string, MenuItem>;
}

export async function fetchMenu(): Promise<MenuData> {
  const [cats, items] = await Promise.all([
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('menu_items').select('*').eq('is_archived', false).order('sort_order').order('name'),
  ]);
  if (cats.error) throw cats.error;
  if (items.error) throw items.error;
  const activeCategories = new Set(cats.data.map((c) => c.id));
  const visible = items.data.filter((i) => activeCategories.has(i.category_id));
  return { categories: cats.data, items: visible, byId: new Map(visible.map((i) => [i.id, i])) };
}

export function useMenu() {
  return useQuery({
    queryKey: menuKeys.menu,
    queryFn: fetchMenu,
    enabled: env.isSupabaseConfigured,
    staleTime: 60_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: menuKeys.settings,
    enabled: env.isSupabaseConfigured,
    staleTime: 60_000,
    queryFn: async (): Promise<CanteenSettings> => {
      const { data, error } = await supabase.from('canteen_settings').select('*').single();
      if (error) throw error;
      return data;
    },
  });
}

export interface PopularEntry {
  menu_item_id: string;
  units_sold: number;
  order_count: number;
}

/** Real popularity from paid orders in the last 30 days (aggregate only). */
export function usePopularItems() {
  return useQuery({
    queryKey: menuKeys.popular,
    enabled: env.isSupabaseConfigured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PopularEntry[]> => {
      const { data, error } = await supabase.rpc('get_popular_items', { p_days: 30, p_limit: 8 });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, units_sold: Number(r.units_sold), order_count: Number(r.order_count) }));
    },
  });
}

/** Keep menu availability and canteen status live while the app is open. */
export function useMenuRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!env.isSupabaseConfigured) return;
    const channel = supabase
      .channel('public-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        void queryClient.invalidateQueries({ queryKey: menuKeys.menu, exact: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canteen_settings' }, () => {
        void queryClient.invalidateQueries({ queryKey: menuKeys.settings });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function stockLabel(item: MenuItem): { available: boolean; label: string | null } {
  if (!item.is_available) return { available: false, label: 'Unavailable' };
  if (item.stock_quantity === 0) return { available: false, label: 'Sold out' };
  if (item.stock_quantity !== null && item.stock_quantity <= 5) return { available: true, label: `Only ${item.stock_quantity} left` };
  return { available: true, label: null };
}
