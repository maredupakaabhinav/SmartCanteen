import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/auth-context';
import type { Order, OrderStatusEventRow, OrderWithItems } from '@/types/database';
import { isActiveOrder } from './status';

export const orderKeys = {
  all: ['orders'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  mine: (userId: string | null, page: number) => ['orders', 'mine', userId, page] as const,
  active: (userId: string | null) => ['orders', 'active', userId] as const,
};

export type OrderDetail = OrderWithItems & { order_status_events: OrderStatusEventRow[] };

/** Subscribe to realtime changes on one order; reports whether the socket is live. */
function useOrderChannel(orderId: string | undefined, onChange: () => void) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, onChange)
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
    // onChange is stable enough per order; re-subscribing on every render is wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  return live;
}

export function useOrder(orderId: string | undefined) {
  const queryClient = useQueryClient();
  const live = useOrderChannel(orderId, () => {
    if (orderId) void queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
  });

  return {
    live,
    ...useQuery({
      queryKey: orderKeys.detail(orderId ?? ''),
      enabled: Boolean(orderId),
      queryFn: async (): Promise<OrderDetail | null> => {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*), order_status_events(*)')
          .eq('id', orderId!)
          .order('created_at', { referencedTable: 'order_items', ascending: true })
          .order('id', { referencedTable: 'order_status_events', ascending: true })
          .maybeSingle();
        if (error) throw error;
        return data as OrderDetail | null;
      },
      // Fallback polling: frequent while realtime is unavailable, slow safety net otherwise.
      refetchInterval: (query) => {
        const order = query.state.data;
        if (!order || !isActiveOrder(order.order_status)) return false;
        return live ? 60_000 : 10_000;
      },
      refetchOnWindowFocus: true,
    }),
  };
}

export const ORDERS_PAGE_SIZE = 10;

export function useMyOrders(page: number) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: orderKeys.mine(userId, page),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * ORDERS_PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('orders')
        .select('*, order_items(*)', { count: 'exact' })
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .range(from, from + ORDERS_PAGE_SIZE - 1);
      if (error) throw error;
      return { orders: (data ?? []) as OrderWithItems[], total: count ?? 0 };
    },
  });
}

/** The signed-in student's in-progress orders, for the header indicator and home page. */
export function useActiveOrders() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: orderKeys.active(userId),
    enabled: Boolean(userId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId!)
        .in('order_status', ['placed', 'accepted', 'preparing', 'ready'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
}
