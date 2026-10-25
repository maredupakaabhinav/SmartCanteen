/**
 * Database types for the Supabase client, mirroring supabase/migrations.
 * Regenerate with `npx supabase gen types typescript --linked > src/types/database.ts`
 * after schema changes (and keep the domain aliases at the bottom).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'student' | 'staff' | 'admin';
export type OrderStatus =
  | 'awaiting_payment'
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'rejected'
  | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'simulated';
export type PaymentRecordStatus = 'created' | 'paid' | 'failed' | 'simulated';

type Timestamp = string;

export type CanteenSettingsRow = {
  id: boolean;
  canteen_name: string;
  location: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  timezone: string;
  opening_time: string;
  closing_time: string;
  open_days: number[];
  accepting_orders: boolean;
  announcement: string | null;
  service_fee_paise: number;
  allowed_email_domains: string[];
  updated_at: Timestamp;
}

export type ProfileRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: UserRole;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type MenuItemRow = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_paise: number;
  image_url: string | null;
  is_vegetarian: boolean | null;
  dietary_notes: string | null;
  is_available: boolean;
  stock_quantity: number | null;
  is_featured: boolean;
  is_archived: boolean;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type OrderRow = {
  id: string;
  order_number: string;
  pickup_number: number | null;
  pickup_date: string | null;
  user_id: string | null;
  customer_name: string;
  note: string | null;
  subtotal_paise: number;
  charges_paise: number;
  total_paise: number;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  idempotency_key: string;
  status_note: string | null;
  placed_at: Timestamp | null;
  accepted_at: Timestamp | null;
  preparing_at: Timestamp | null;
  ready_at: Timestamp | null;
  completed_at: Timestamp | null;
  closed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type OrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name_snapshot: string;
  unit_price_paise: number;
  quantity: number;
  line_total_paise: number;
  created_at: Timestamp;
}

export type PaymentRow = {
  id: string;
  order_id: string;
  provider: 'razorpay' | 'demo';
  provider_order_id: string | null;
  provider_payment_id: string | null;
  amount_paise: number;
  currency: string;
  status: PaymentRecordStatus;
  failure_reason: string | null;
  verified_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type OrderStatusEventRow = {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  actor_id: string | null;
  created_at: Timestamp;
}

type Table<Row, Required extends keyof Row = never, Rel extends unknown[] = []> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: Rel;
};

export type AdminOverview = {
  business_date: string;
  orders_today: number;
  revenue_today_paise: number;
  simulated_today: number;
  awaiting_payment: number;
  new_orders: number;
  in_kitchen: number;
  ready: number;
  completed_today: number;
  rejected_today: number;
}

export type ReportSummary = {
  orders: number;
  paid_orders: number;
  revenue_paise: number;
  simulated_orders: number;
  simulated_amount_paise: number;
  rejected_orders: number;
  refund_due_paise: number;
  completed_orders: number;
}

export type Database = {
  public: {
    Tables: {
      canteen_settings: Table<CanteenSettingsRow>;
      profiles: Table<ProfileRow, 'id'>;
      categories: Table<CategoryRow, 'name' | 'slug'>;
      menu_items: Table<
        MenuItemRow,
        'category_id' | 'name' | 'price_paise',
        [
          {
            foreignKeyName: 'menu_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ]
      >;
      orders: Table<
        OrderRow,
        'order_number' | 'subtotal_paise' | 'total_paise' | 'idempotency_key',
        [
          {
            foreignKeyName: 'orders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ]
      >;
      order_items: Table<
        OrderItemRow,
        'order_id' | 'menu_item_id' | 'item_name_snapshot' | 'unit_price_paise' | 'quantity' | 'line_total_paise',
        [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
        ]
      >;
      payments: Table<
        PaymentRow,
        'order_id' | 'provider' | 'amount_paise',
        [
          {
            foreignKeyName: 'payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ]
      >;
      order_status_events: Table<
        OrderStatusEventRow,
        'order_id' | 'to_status',
        [
          {
            foreignKeyName: 'order_status_events_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ]
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      place_order: {
        Args: { p_items: Json; p_idempotency_key: string; p_customer_name?: string | null; p_note?: string | null };
        Returns: OrderRow;
      };
      cancel_unpaid_order: { Args: { p_order_id: string }; Returns: OrderRow };
      expire_stale_orders: { Args: never; Returns: number };
      update_order_status: {
        Args: { p_order_id: string; p_expected_status: OrderStatus; p_new_status: OrderStatus; p_note?: string | null };
        Returns: OrderRow;
      };
      admin_set_role: { Args: { p_email: string; p_role: UserRole }; Returns: ProfileRow };
      is_canteen_open: { Args: never; Returns: boolean };
      app_today: { Args: never; Returns: string };
      get_popular_items: {
        Args: { p_days?: number; p_limit?: number };
        Returns: { menu_item_id: string; units_sold: number; order_count: number }[];
      };
      admin_overview: { Args: never; Returns: Json };
      report_summary: { Args: { p_from: string; p_to: string }; Returns: Json };
      report_daily: {
        Args: { p_from: string; p_to: string };
        Returns: { day: string; orders: number; paid_orders: number; revenue_paise: number; simulated_orders: number }[];
      };
      report_top_items: {
        Args: { p_from: string; p_to: string; p_limit?: number };
        Returns: { menu_item_id: string; item_name: string; units_paid: number; units_simulated: number; revenue_paise: number }[];
      };
      report_payment_outcomes: {
        Args: { p_from: string; p_to: string };
        Returns: { provider: string; status: PaymentRecordStatus; attempts: number; amount_paise: number }[];
      };
      report_status_distribution: {
        Args: { p_from: string; p_to: string };
        Returns: { order_status: OrderStatus; orders: number }[];
      };
    };
    Enums: {
      user_role: UserRole;
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      payment_record_status: PaymentRecordStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

/* Domain aliases used across the app */
export type CanteenSettings = CanteenSettingsRow;
export type Profile = ProfileRow;
export type Category = CategoryRow;
export type MenuItem = MenuItemRow;
export type Order = OrderRow;
export type OrderItem = OrderItemRow;
export type OrderWithItems = OrderRow & { order_items: OrderItemRow[] };
