import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { DropdownMenu as DM, Switch as SwitchPrimitive, Tabs as T } from 'radix-ui';
import { cn } from '@/lib/cn';

/* ---------------------------------------------------------------- Switch */
export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'bg-line-strong data-[state=checked]:bg-brand disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:shadow-(--shadow-focus) focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
});

/* ---------------------------------------------------------------- Tabs */
export const Tabs = T.Root;
export const TabsContent = T.Content;

export const TabsList = forwardRef<ElementRef<typeof T.List>, ComponentPropsWithoutRef<typeof T.List>>(
  function TabsList({ className, ...props }, ref) {
    return (
      <T.List
        ref={ref}
        className={cn(
          'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-md bg-surface-muted p-1 [scrollbar-width:none]',
          className,
        )}
        {...props}
      />
    );
  },
);

export const TabsTrigger = forwardRef<ElementRef<typeof T.Trigger>, ComponentPropsWithoutRef<typeof T.Trigger>>(
  function TabsTrigger({ className, ...props }, ref) {
    return (
      <T.Trigger
        ref={ref}
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-2 rounded-sm px-3 text-sm font-medium text-ink-muted transition-colors',
          'hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-xs',
          'focus-visible:shadow-(--shadow-focus) focus-visible:outline-none',
          className,
        )}
        {...props}
      />
    );
  },
);

/* ---------------------------------------------------------------- Dropdown */
export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DM.Separator>,
  ComponentPropsWithoutRef<typeof DM.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DM.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />;
});

export const DropdownMenuContent = forwardRef<ElementRef<typeof DM.Content>, ComponentPropsWithoutRef<typeof DM.Content>>(
  function DropdownMenuContent({ className, sideOffset = 8, ...props }, ref) {
    return (
      <DM.Portal>
        <DM.Content
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={12}
          className={cn(
            'z-50 min-w-52 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-md data-[state=open]:animate-fade-in',
            className,
          )}
          {...props}
        />
      </DM.Portal>
    );
  },
);

export const DropdownMenuItem = forwardRef<ElementRef<typeof DM.Item>, ComponentPropsWithoutRef<typeof DM.Item>>(
  function DropdownMenuItem({ className, ...props }, ref) {
    return (
      <DM.Item
        ref={ref}
        className={cn(
          'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-sm text-ink outline-none select-none',
          'data-highlighted:bg-surface-muted data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-muted',
          className,
        )}
        {...props}
      />
    );
  },
);

export const DropdownMenuLabel = forwardRef<ElementRef<typeof DM.Label>, ComponentPropsWithoutRef<typeof DM.Label>>(
  function DropdownMenuLabel({ className, ...props }, ref) {
    return <DM.Label ref={ref} className={cn('px-2.5 py-2 text-xs text-ink-muted', className)} {...props} />;
  },
);
