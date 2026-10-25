import { useState, type ReactNode } from 'react';
import { AlertDialog as A } from 'radix-ui';
import { cn } from '@/lib/cn';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** Return a promise to keep the dialog open with a loading state until it settles. */
  onConfirm: () => void | Promise<unknown>;
  children?: ReactNode;
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  children,
  confirmDisabled,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller surfaces the error (toast / inline); keep the dialog open.
    } finally {
      setBusy(false);
    }
  }

  return (
    <A.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <A.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-6 shadow-lg',
            'focus:outline-none data-[state=open]:animate-scale-in',
          )}
        >
          <A.Title className="text-lg font-semibold tracking-tight">{title}</A.Title>
          {description ? (
            <A.Description className="mt-2 text-sm leading-6 text-ink-muted">{description}</A.Description>
          ) : (
            <A.Description className="sr-only">{title}</A.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <A.Cancel asChild>
              <Button variant="outline" disabled={busy}>
                {cancelLabel}
              </Button>
            </A.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={busy}
              disabled={confirmDisabled}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
