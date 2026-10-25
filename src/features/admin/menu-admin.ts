import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/errors';
import { menuKeys } from '@/features/menu/queries';
import type { Category, MenuItem } from '@/types/database';
import { adminKeys } from './queries';

export function useAdminMenu() {
  return useQuery({
    queryKey: adminKeys.menu,
    queryFn: async () => {
      const [cats, items] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order').order('name'),
        supabase.from('menu_items').select('*').order('sort_order').order('name'),
      ]);
      if (cats.error) throw cats.error;
      if (items.error) throw items.error;
      return { categories: cats.data as Category[], items: items.data as MenuItem[] };
    },
  });
}

function useInvalidateMenu() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.menu });
    void queryClient.invalidateQueries({ queryKey: menuKeys.menu });
  };
}

/* ------------------------------------------------------------------ Items */
const rupees = z
  .string()
  .trim()
  .regex(/^\d{1,5}(\.\d{1,2})?$/, 'Enter a price like 45 or 45.50')
  .transform((v) => Math.round(Number(v) * 100))
  .refine((p) => p >= 100, 'Price must be at least ₹1')
  .refine((p) => p <= 1_000_000, 'Price must be at most ₹10,000');

export const itemFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(80, 'Keep the name under 80 characters'),
    description: z.string().trim().max(280, 'Keep the description under 280 characters'),
    category_id: z.uuid('Choose a category'),
    price: rupees,
    image_url: z
      .string()
      .trim()
      .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'Use an https:// image URL')
      .transform((v) => v || null),
    diet: z.enum(['unspecified', 'veg', 'nonveg']),
    dietary_notes: z
      .string()
      .trim()
      .max(200, 'Keep notes under 200 characters')
      .transform((v) => v || null),
    track_stock: z.boolean(),
    stock: z.string().trim(),
    is_available: z.boolean(),
    is_featured: z.boolean(),
    sort_order: z.coerce.number().int('Whole numbers only').min(0).max(9999),
  })
  .superRefine((v, ctx) => {
    if (v.track_stock && !/^\d{1,6}$/.test(v.stock)) {
      ctx.addIssue({ code: 'custom', path: ['stock'], message: 'Enter the number of portions available (0 or more)' });
    }
  })
  .transform((v) => ({
    name: v.name,
    description: v.description,
    category_id: v.category_id,
    price_paise: v.price,
    image_url: v.image_url,
    is_vegetarian: v.diet === 'unspecified' ? null : v.diet === 'veg',
    dietary_notes: v.dietary_notes,
    stock_quantity: v.track_stock ? Number(v.stock) : null,
    is_available: v.is_available,
    is_featured: v.is_featured,
    sort_order: v.sort_order,
  }));

export type ItemFormInput = z.input<typeof itemFormSchema>;
export type ItemPayload = z.output<typeof itemFormSchema>;

export function itemToForm(item: MenuItem | null, fallbackCategory: string): ItemFormInput {
  return {
    name: item?.name ?? '',
    description: item?.description ?? '',
    category_id: item?.category_id ?? fallbackCategory,
    price: item ? (item.price_paise / 100).toString() : '',
    image_url: item?.image_url ?? '',
    diet: item?.is_vegetarian == null ? 'unspecified' : item.is_vegetarian ? 'veg' : 'nonveg',
    dietary_notes: item?.dietary_notes ?? '',
    track_stock: item?.stock_quantity != null,
    stock: item?.stock_quantity != null ? String(item.stock_quantity) : '',
    is_available: item?.is_available ?? true,
    is_featured: item?.is_featured ?? false,
    sort_order: item?.sort_order ?? 0,
  };
}

export function useSaveItem() {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: ItemPayload }) => {
      const query = id
        ? supabase.from('menu_items').update(payload).eq('id', id).select().single()
        : supabase.from('menu_items').insert(payload).select().single();
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => toast.success(vars.id ? 'Item updated' : 'Item added to the menu'),
    onError: (e) => toast.error(getErrorMessage(e, 'Could not save the item.')),
    onSettled: invalidate,
  });
}

/** Quick inline updates (availability, archive) with optimistic UI. */
export function usePatchItem() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MenuItem>; message?: string }) => {
      const { error } = await supabase.from('menu_items').update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.menu });
      const prev = queryClient.getQueryData<{ categories: Category[]; items: MenuItem[] }>(adminKeys.menu);
      if (prev) {
        queryClient.setQueryData(adminKeys.menu, {
          ...prev,
          items: prev.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        });
      }
      return { prev };
    },
    onSuccess: (_d, vars) => vars.message && toast.success(vars.message),
    onError: (e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(adminKeys.menu, ctx.prev);
      toast.error(getErrorMessage(e, 'Could not update the item.'));
    },
    onSettled: invalidate,
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => toast.success('Item deleted'),
    onError: (e) =>
      toast.error(
        ['23503', '23001'].includes((e as { code?: string }).code ?? '')
          ? 'This item appears in past orders, so it can’t be deleted. Keep it archived instead.'
          : getErrorMessage(e, 'Could not delete the item.'),
      ),
    onSettled: invalidate,
  });
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadMenuImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Images must be 2 MB or smaller.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `items/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('menu-images').upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error('Upload failed. Check that the menu-images storage bucket exists.');
  return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
}

/* ------------------------------------------------------------------ Categories */
export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Keep it under 40 characters'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes'),
  description: z
    .string()
    .trim()
    .max(160, 'Keep it under 160 characters')
    .transform((v) => v || null),
  image_url: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'Use an https:// image URL')
    .transform((v) => v || null),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_active: z.boolean(),
});

export type CategoryFormInput = z.input<typeof categoryFormSchema>;

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function useSaveCategory() {
  const invalidate = useInvalidateMenu();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: z.output<typeof categoryFormSchema> }) => {
      const { error } = id
        ? await supabase.from('categories').update(payload).eq('id', id)
        : await supabase.from('categories').insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => toast.success(v.id ? 'Category updated' : 'Category added'),
    onError: (e) =>
      toast.error((e as { code?: string }).code === '23505' ? 'That URL slug is already used by another category.' : getErrorMessage(e)),
    onSettled: invalidate,
  });
}
