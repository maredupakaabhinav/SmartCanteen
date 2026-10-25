import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes, type ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlay =
  'fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:opacity-0';

interface ContentProps extends ComponentPropsWithoutRef<typeof D.Content> {
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
}

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };

/**
 * Centered modal on desktop, bottom sheet on small screens. Focus is trapped
 * and returned to the trigger by Radix.
 */
export const DialogContent = forwardRef<ElementRef<typeof D.Content>, ContentProps>(function DialogContent(
  { className, children, size = 'md', hideClose, ...props },
  ref,
) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex max-h-[min(92dvh,48rem)] w-full flex-col overflow-hidden bg-surface shadow-lg focus:outline-none',
          // mobile: bottom sheet
          'inset-x-0 bottom-0 rounded-t-2xl data-[state=open]:animate-slide-up safe-bottom',
          // desktop: centered
          'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:rounded-xl sm:data-[state=open]:animate-scale-in',
          'sm:-translate-x-1/2 sm:-translate-y-1/2',
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <D.Close
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-surface/90 text-ink-muted shadow-xs backdrop-blur transition-colors hover:bg-surface-muted hover:text-ink focus-visible:shadow-(--shadow-focus) focus-visible:outline-none"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
});

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pr-14 sm:px-6 sm:pt-6', className)} {...props} />;
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6',
        className,
      )}
      {...props}
    />
  );
}

export const DialogTitle = forwardRef<ElementRef<typeof D.Title>, ComponentPropsWithoutRef<typeof D.Title>>(
  function DialogTitle({ className, ...props }, ref) {
    return <D.Title ref={ref} className={cn('text-lg font-semibold tracking-tight text-ink', className)} {...props} />;
  },
);

export const DialogDescription = forwardRef<
  ElementRef<typeof D.Description>,
  ComponentPropsWithoutRef<typeof D.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return <D.Description ref={ref} className={cn('mt-1 text-sm text-ink-muted', className)} {...props} />;
});

/** Slide-in panel used for the mobile navigation drawer. */
export function SheetContent({
  children,
  title,
  side = 'right',
  className,
}: {
  children: ReactNode;
  title: string;
  side?: 'right' | 'left';
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(22rem,88vw)] flex-col bg-surface shadow-lg focus:outline-none',
          side === 'right' ? 'right-0 data-[state=open]:animate-slide-in-right' : 'left-0',
          className,
        )}
        aria-describedby={undefined}
      >
        <D.Title className="sr-only">{title}</D.Title>
        {children}
      </D.Content>
    </D.Portal>
  );
}
