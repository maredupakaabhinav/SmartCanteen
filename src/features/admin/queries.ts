import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/errors';
import type { AdminOverview, OrderStatus, OrderWithItems, ReportSummary } from '@/types/database';
import { ORDER_STATUS } from '@/features/orders/status';

export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  queue: ['admin', 'queue'] as const,
  menu: ['admin', 'menu'] as const,
  staff: ['admin', 'staff'] as const,
  reports: (from: string, to: string) => ['admin', 'reports', from, to] as const,
  topItems: (from: string, to: string) => ['admin', 'top-items', from, to] as const,
};

/**
 * One realtime subscription for all staff screens. Any change to an order
 * refreshes the queue and overview. Returns whether the socket is live so the
 * UI can show a fallback indicator (queries also poll as a safety net).
 */
export function useAdminRealtime() {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(() => {
    const channel = supabase
      .channel('staff-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void queryClient.invalidateQueries({ queryKey: adminKeys.queue });
        void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
  return live;
}

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    refetchInterval: 30_000,
    queryFn: async (): Promise<AdminOverview> => {
      // Release stock held by abandoned unpaid orders before counting.
      await supabase.rpc('expire_stale_orders');
      const { data, error } = await supabase.rpc('admin_overview');
      if (error) throw error;
      return data as unknown as AdminOverview;
    },
  });
}

/** Active orders plus anything closed in the last 18 hours (covers one service day). */
export function useOrderQueue() {
  return useQuery({
    queryKey: adminKeys.queue,
    refetchInterval: 20_000,
    queryFn: async (): Promise<OrderWithItems[]> => {
      const since = new Date(Date.now() - 18 * 3600_000).toISOString();
      const [active, recent] = await Promise.all([
        supabase
          .from('orders')
          .select('*, order_items(*)')
          .in('order_status', ['awaiting_payment', 'placed', 'accepted', 'preparing', 'ready'])
          .order('placed_at', { ascending: true, nullsFirst: false })
          .limit(200),
        supabase
          .from('orders')
          .select('*, order_items(*)')
          .in('order_status', ['completed', 'rejected', 'cancelled'])
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(100),
      ]);
      if (active.error) throw active.error;
      if (recent.error) throw recent.error;
      return [...(active.data as OrderWithItems[]), ...(recent.data as OrderWithItems[])];
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { order: OrderWithItems; to: OrderStatus; note?: string }) => {
      const { data, error } = await supabase.rpc('update_order_status', {
        p_order_id: vars.order.id,
        p_expected_status: vars.order.order_status,
        p_new_status: vars.to,
        p_note: vars.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      toast.success(`Order #${String(vars.order.pickup_number ?? '').padStart(3, '0')} → ${ORDER_STATUS[vars.to].label}`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Could not update the order. Check your connection and try again.'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.queue });
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
    },
  });
}

export function useReportSummary(from: string, to: string) {
  return useQuery({
    queryKey: [...adminKeys.reports(from, to), 'summary'],
    queryFn: async (): Promise<ReportSummary> => {
      const { data, error } = await supabase.rpc('report_summary', { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as ReportSummary;
    },
  });
}

export function useReportDaily(from: string, to: string) {
  return useQuery({
    queryKey: [...adminKeys.reports(from, to), 'daily'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_daily', { p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        day: d.day,
        orders: Number(d.orders),
        paidOrders: Number(d.paid_orders),
        revenuePaise: Number(d.revenue_paise),
        simulatedOrders: Number(d.simulated_orders),
      }));
    },
  });
}

export function useTopItems(from: string, to: string, limit = 10) {
  return useQuery({
    queryKey: [...adminKeys.topItems(from, to), limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_top_items', { p_from: from, p_to: to, p_limit: limit });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.menu_item_id,
        name: r.item_name,
        unitsPaid: Number(r.units_paid),
        unitsSimulated: Number(r.units_simulated),
        revenuePaise: Number(r.revenue_paise),
      }));
    },
  });
}

export function usePaymentOutcomes(from: string, to: string) {
  return useQuery({
    queryKey: [...adminKeys.reports(from, to), 'payments'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_payment_outcomes', { p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, attempts: Number(r.attempts), amount_paise: Number(r.amount_paise) }));
    },
  });
}

export function useStatusDistribution(from: string, to: string) {
  return useQuery({
    queryKey: [...adminKeys.reports(from, to), 'status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_status_distribution', { p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []).map((r) => ({ status: r.order_status, orders: Number(r.orders) }));
    },
  });
}
