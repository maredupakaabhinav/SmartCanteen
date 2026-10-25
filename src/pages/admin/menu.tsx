import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, EllipsisVertical, Pencil, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/misc';
import { EmptyState, ErrorState, FoodImage, PageHeader, VegMark } from '@/components/common';
import { useAdminMenu, useDeleteItem, usePatchItem, useSaveCategory } from '@/features/admin/menu-admin';
import { CategoryFormDialog, ItemFormDialog } from '@/features/admin/menu-forms';
import { getErrorMessage } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/use-document-title';
import type { Category, MenuItem } from '@/types/database';

function StockCell({ item }: { item: MenuItem }) {
  if (item.stock_quantity === null) return <span className="text-ink-muted">Not tracked</span>;
  return (
    <span className={cn('tabular font-medium', item.stock_quantity === 0 ? 'text-danger' : item.stock_quantity <= 5 ? 'text-warning' : '')}>
      {item.stock_quantity === 0 ? 'Sold out' : `${item.stock_quantity} left`}
    </span>
  );
}

function ItemActions({ item, onEdit, onDelete }: { item: MenuItem; onEdit: () => void; onDelete: () => void }) {
  const patch = usePatchItem();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.name}`}>
          <EllipsisVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden /> Edit details
        </DropdownMenuItem>
        {item.is_archived ? (
          <DropdownMenuItem onSelect={() => patch.mutate({ id: item.id, patch: { is_archived: false }, message: `${item.name} restored` })}>
            <ArchiveRestore aria-hidden /> Restore to menu
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => patch.mutate({ id: item.id, patch: { is_archived: true }, message: `${item.name} archived` })}>
            <Archive aria-hidden /> Archive
          </DropdownMenuItem>
        )}
        {item.is_archived && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-danger [&_svg]:text-danger">
              <Trash2 aria-hidden /> Delete permanently
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ItemsTab({ categories, items }: { categories: Category[]; items: MenuItem[] }) {
  const patch = usePatchItem();
  const del = useDeleteItem();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const catOrder = useMemo(() => new Map(categories.map((c, i) => [c.id, i])), [categories]);

  // Same order students see: by category, then the item's display order.
  const visible = items
    .filter((i) => {
      if (i.is_archived !== showArchived) return false;
      if (category !== 'all' && i.category_id !== category) return false;
      const q = query.trim().toLowerCase();
      return !q || i.name.toLowerCase().includes(q);
    })
    .sort(
      (a, b) =>
        (catOrder.get(a.category_id) ?? 0) - (catOrder.get(b.category_id) ?? 0) ||
        a.sort_order - b.sort_order ||
        a.name.localeCompare(b.name),
    );
  const archivedCount = items.filter((i) => i.is_archived).length;

  const openEditor = (item: MenuItem | null) => {
    setEditing(item);
    setFormOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <label htmlFor="item-search" className="sr-only">Search items</label>
          <Input id="item-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" className="h-10 pl-9 text-sm" />
        </div>
        <div className="sm:w-52">
          <label htmlFor="item-cat" className="sr-only">Filter by category</label>
          <Select id="item-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 text-sm">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted sm:ml-2">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived items" />
          Archived ({archivedCount})
        </label>
        <Button className="sm:ml-auto" onClick={() => openEditor(null)} disabled={!categories.length}>
          <Plus aria-hidden /> Add item
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface/60">
          <EmptyState
            icon={<UtensilsCrossed />}
            title={showArchived ? 'No archived items' : 'No items found'}
            description={showArchived ? 'Archived items are hidden from students but kept for order history.' : 'Try another search or add a new item.'}
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-6 hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-muted/60 text-left text-xs text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Available</th>
                  <th className="w-12 px-2 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FoodImage src={item.image_url} alt="" width={96} sizes="44px" className="size-11 shrink-0 rounded-sm" />
                        <div className="min-w-0">
                          <button type="button" onClick={() => openEditor(item)} className="flex items-center gap-2 text-left font-medium hover:underline">
                            <VegMark vegetarian={item.is_vegetarian} />
                            <span className="truncate">{item.name}</span>
                          </button>
                          {item.is_featured && <Badge tone="brand" className="mt-1">Featured</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{catName.get(item.category_id)}</td>
                    <td className="tabular px-4 py-3 text-right font-medium">{formatPrice(item.price_paise)}</td>
                    <td className="px-4 py-3"><StockCell item={item} /></td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={item.is_available}
                        disabled={item.is_archived}
                        aria-label={`${item.name} available`}
                        onCheckedChange={(v) => patch.mutate({ id: item.id, patch: { is_available: v }, message: `${item.name} ${v ? 'is available' : 'marked unavailable'}` })}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <ItemActions item={item} onEdit={() => openEditor(item)} onDelete={() => setDeleting(item)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="mt-6 space-y-3 md:hidden">
            {visible.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-lg border border-line bg-surface p-3">
                <FoodImage src={item.image_url} alt="" width={128} sizes="64px" className="size-16 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => openEditor(item)} className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold">
                      <VegMark vegetarian={item.is_vegetarian} />
                      <span className="truncate">{item.name}</span>
                    </button>
                    <ItemActions item={item} onEdit={() => openEditor(item)} onDelete={() => setDeleting(item)} />
                  </div>
                  <p className="tabular text-sm">
                    {formatPrice(item.price_paise)} · <span className="text-ink-muted">{catName.get(item.category_id)}</span>
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[13px]">
                    <StockCell item={item} />
                    <label className="flex items-center gap-2 text-ink-muted">
                      Available
                      <Switch
                        checked={item.is_available}
                        disabled={item.is_archived}
                        onCheckedChange={(v) => patch.mutate({ id: item.id, patch: { is_available: v }, message: `${item.name} ${v ? 'is available' : 'marked unavailable'}` })}
                      />
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ItemFormDialog open={formOpen} onOpenChange={setFormOpen} item={editing} categories={categories} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'item'}?`}
        description="This permanently removes the item. Items that appear in past orders can’t be deleted and stay archived instead."
        confirmLabel="Delete permanently"
        tone="danger"
        onConfirm={() => del.mutateAsync(deleting!.id)}
      />
    </>
  );
}

function CategoriesTab({ categories, items }: { categories: Category[]; items: MenuItem[] }) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const save = useSaveCategory();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    items.filter((i) => !i.is_archived).forEach((i) => m.set(i.category_id, (m.get(i.category_id) ?? 0) + 1));
    return m;
  }, [items]);

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus aria-hidden /> Add category
        </Button>
      </div>
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-4 px-4 py-3">
            <FoodImage src={c.image_url} alt="" width={96} sizes="44px" className="size-11 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="truncate text-xs text-ink-muted">
                /{c.slug} · {counts.get(c.id) ?? 0} items · order {c.sort_order}
              </p>
            </div>
            <label className="hidden items-center gap-2 text-sm text-ink-muted sm:flex">
              Visible
              <Switch
                checked={c.is_active}
                onCheckedChange={(is_active) =>
                  save.mutate({ id: c.id, payload: { name: c.name, slug: c.slug, description: c.description, image_url: c.image_url, sort_order: c.sort_order, is_active } })
                }
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(c);
                setOpen(true);
              }}
            >
              <Pencil aria-hidden /> Edit
            </Button>
          </li>
        ))}
      </ul>
      <CategoryFormDialog open={open} onOpenChange={setOpen} category={editing} />
    </>
  );
}

export default function AdminMenuPage() {
  useDocumentTitle('Menu management');
  const { data, isPending, isError, error, refetch } = useAdminMenu();
  return (
    <div>
      <PageHeader title="Menu" description="Manage dishes, prices, stock and availability. Changes go live instantly." />
      <Tabs defaultValue="items" className="mt-6">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        {isPending ? (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
        ) : (
          <>
            <TabsContent value="items" className="mt-6">
              <ItemsTab categories={data.categories} items={data.items} />
            </TabsContent>
            <TabsContent value="categories" className="mt-6">
              <CategoriesTab categories={data.categories} items={data.items} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
