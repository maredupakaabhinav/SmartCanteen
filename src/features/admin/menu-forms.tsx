import { useRef, useState, type FormEvent } from 'react';
import type { z } from 'zod';
import { ImageUp, Link2 } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Switch } from '@/components/ui/misc';
import { FoodImage } from '@/components/common';
import type { Category, MenuItem } from '@/types/database';
import {
  categoryFormSchema,
  itemFormSchema,
  itemToForm,
  slugify,
  uploadMenuImage,
  useSaveCategory,
  useSaveItem,
  type CategoryFormInput,
  type ItemFormInput,
} from './menu-admin';

function issuesToErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-line px-4 py-3">
      <label htmlFor={id} className="cursor-pointer text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] text-ink-muted">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ Item form */
export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MenuItem | null;
  categories: Category[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ItemForm key={item?.id ?? 'new'} item={item} categories={categories} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ItemForm({ item, categories, onDone }: { item: MenuItem | null; categories: Category[]; onDone: () => void }) {
  const [values, setValues] = useState<ItemFormInput>(() => itemToForm(item, categories[0]?.id ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useSaveItem();
  const set = <K extends keyof ItemFormInput>(key: K, value: ItemFormInput[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setErrors((e) => ({ ...e, image_url: '' }));
    try {
      set('image_url', await uploadMenuImage(file));
    } catch (err) {
      setErrors((e) => ({ ...e, image_url: err instanceof Error ? err.message : 'Upload failed.' }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = itemFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync({ id: item?.id ?? null, payload: parsed.data });
      onDone();
    } catch {
      // toast already shown
    }
  }

  return (
    <DialogContent size="lg">
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'Add menu item'}</DialogTitle>
          <DialogDescription>Prices are in rupees. Changes appear on the student menu immediately.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
            <div>
              <FoodImage src={values.image_url || null} alt="Item photo preview" width={320} sizes="160px" className="aspect-[4/3] w-full rounded-md border border-line" />
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="item-image-file" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" block className="mt-2" loading={uploading} loadingText="Uploading…" onClick={() => fileRef.current?.click()}>
                <ImageUp aria-hidden /> Upload photo
              </Button>
            </div>
            <div className="space-y-5">
              <Field label="Name" error={errors.name}>
                <Input value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Price (₹)" error={errors.price}>
                  <Input inputMode="decimal" value={values.price} onChange={(e) => set('price', e.target.value)} placeholder="45" />
                </Field>
                <Field label="Category" error={errors.category_id}>
                  <Select value={values.category_id} onChange={(e) => set('category_id', e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.is_active ? '' : ' (hidden)'}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          </div>

          <Field label="Description" optional error={errors.description}>
            <Textarea value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={280} rows={2} />
          </Field>

          <Field label="Image URL" optional hint="Upload a photo above or paste an https:// link." error={errors.image_url || null}>
            <div className="relative">
              <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
              <Input value={values.image_url} onChange={(e) => set('image_url', e.target.value)} className="pl-9" placeholder="https://…" />
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Food type" hint="Only set this if the canteen has confirmed it.">
              <Select value={values.diet} onChange={(e) => set('diet', e.target.value as ItemFormInput['diet'])}>
                <option value="unspecified">Not specified</option>
                <option value="veg">Vegetarian</option>
                <option value="nonveg">Non-vegetarian</option>
              </Select>
            </Field>
            <Field label="Display order" hint="Lower numbers appear first." error={errors.sort_order}>
              <Input inputMode="numeric" value={String(values.sort_order)} onChange={(e) => set('sort_order', e.target.value as unknown as number)} />
            </Field>
          </div>

          <Field label="Dietary information" optional hint="Shown to students exactly as written, e.g. “Contains dairy”." error={errors.dietary_notes}>
            <Input value={values.dietary_notes} onChange={(e) => set('dietary_notes', e.target.value)} maxLength={200} />
          </Field>

          <div className="space-y-3">
            <SwitchRow id="avail" label="Available to order" hint="Turn off when the kitchen runs out or stops serving it." checked={values.is_available} onChange={(v) => set('is_available', v)} />
            <SwitchRow id="track" label="Track stock" hint="Limit orders to a number of portions. Stock is reserved when an order is placed." checked={values.track_stock} onChange={(v) => set('track_stock', v)} />
            {values.track_stock && (
              <Field label="Portions in stock" error={errors.stock}>
                <Input inputMode="numeric" value={values.stock} onChange={(e) => set('stock', e.target.value)} className="sm:w-40" />
              </Field>
            )}
            <SwitchRow id="featured" label="Feature on the home page" hint="Shown as a highlight until real popularity data is available." checked={values.is_featured} onChange={(v) => set('is_featured', v)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending} disabled={uploading}>
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ------------------------------------------------------------------ Category form */
export function CategoryFormDialog({ open, onOpenChange, category }: { open: boolean; onOpenChange: (o: boolean) => void; category: Category | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <CategoryForm key={category?.id ?? 'new'} category={category} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const [values, setValues] = useState<CategoryFormInput>({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    image_url: category?.image_url ?? '',
    sort_order: category?.sort_order ?? 0,
    is_active: category?.is_active ?? true,
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveCategory();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = categoryFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync({ id: category?.id ?? null, payload: parsed.data });
      onDone();
    } catch {
      // toast shown
    }
  }

  return (
    <DialogContent size="sm">
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'Add category'}</DialogTitle>
          <DialogDescription>Categories group the menu and power the home page tiles.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <Field label="Name" error={errors.name}>
            <Input
              value={values.name}
              onChange={(e) => {
                const name = e.target.value;
                setValues((v) => ({ ...v, name, slug: slugTouched ? v.slug : slugify(name) }));
              }}
            />
          </Field>
          <Field label="URL slug" hint="Used in links like /menu?category=snacks" error={errors.slug}>
            <Input
              value={values.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setValues((v) => ({ ...v, slug: e.target.value }));
              }}
            />
          </Field>
          <Field label="Short description" optional error={errors.description}>
            <Input value={values.description ?? ''} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} />
          </Field>
          <Field label="Tile image URL" optional error={errors.image_url}>
            <Input value={values.image_url ?? ''} onChange={(e) => setValues((v) => ({ ...v, image_url: e.target.value }))} placeholder="https://…" />
          </Field>
          <Field label="Display order" error={errors.sort_order}>
            <Input inputMode="numeric" value={String(values.sort_order)} onChange={(e) => setValues((v) => ({ ...v, sort_order: e.target.value as unknown as number }))} className="w-32" />
          </Field>
          <SwitchRow id="cat-active" label="Visible to students" checked={values.is_active} onChange={(is_active) => setValues((v) => ({ ...v, is_active }))} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {category ? 'Save changes' : 'Add category'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
