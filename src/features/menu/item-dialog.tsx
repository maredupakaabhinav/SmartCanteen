import { useState } from 'react';
import { Info } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FoodImage, QuantityStepper, VegMark } from '@/components/common';
import { cart, useCartQuantity } from '@/features/cart/cart-store';
import { formatPrice } from '@/lib/format';
import type { Category, MenuItem } from '@/types/database';
import { addToCart, maxQuantityFor } from './food-card';
import { stockLabel } from './queries';

interface ItemDialogProps {
  item: MenuItem | null;
  category?: Category;
  onOpenChange: (open: boolean) => void;
}

export function ItemDialog({ item, category, onOpenChange }: ItemDialogProps) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      {item && <ItemDialogBody key={item.id} item={item} category={category} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ItemDialogBody({ item, category, onDone }: { item: MenuItem; category?: Category; onDone: () => void }) {
  const inCart = useCartQuantity(item.id);
  const [rawQuantity, setQuantity] = useState(inCart || 1);
  const { available, label } = stockLabel(item);
  const max = maxQuantityFor(item);
  // Clamp if stock dropped while the dialog was open.
  const quantity = Math.min(rawQuantity, Math.max(1, max));

  function submit() {
    if (inCart) {
      cart.setQuantity(item.id, quantity);
    } else {
      addToCart(item, quantity);
    }
    onDone();
  }

  return (
    <DialogContent size="md" aria-describedby={`dialog-desc-${item.id}`}>
      <FoodImage src={item.image_url} alt={item.name} className="aspect-[16/10] w-full shrink-0" width={960} priority />
      <DialogBody className="pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {category && <Badge tone="neutral">{category.name}</Badge>}
          {item.is_vegetarian !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <VegMark vegetarian={item.is_vegetarian} /> {item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian'}
            </span>
          )}
          {label && <Badge tone={available ? 'warning' : 'danger'}>{label}</Badge>}
        </div>
        <DialogTitle className="mt-3 text-2xl">{item.name}</DialogTitle>
        <p className="tabular mt-1 text-lg font-semibold">{formatPrice(item.price_paise)}</p>
        <DialogDescription id={`dialog-desc-${item.id}`} className="mt-3 text-[15px] leading-6">
          {item.description || 'Freshly prepared at the canteen.'}
        </DialogDescription>
        {item.dietary_notes && (
          <div className="mt-4 flex gap-2.5 rounded-md bg-surface-muted px-3.5 py-3 text-sm text-ink-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <span className="font-medium text-ink">From the canteen: </span>
              {item.dietary_notes}
            </p>
          </div>
        )}
        {!available && (
          <p className="mt-4 text-sm text-ink-muted" role="status">
            This item can’t be ordered right now. Check back later or ask at the counter.
          </p>
        )}
      </DialogBody>
      {available && (
        <DialogFooter className="items-stretch sm:items-center">
          <QuantityStepper value={quantity} onChange={(q) => setQuantity(Math.max(1, q))} min={1} max={max} label={item.name} className="self-center" />
          <Button size="lg" onClick={submit} className="flex-1 sm:flex-none">
            {inCart ? 'Update cart' : 'Add to cart'} · {formatPrice(item.price_paise * quantity)}
          </Button>
        </DialogFooter>
      )}
    </DialogContent>
  );
}
