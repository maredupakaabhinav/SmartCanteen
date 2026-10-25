import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:shadow-(--shadow-focus)',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white shadow-xs hover:bg-brand-hover active:bg-brand-pressed',
        secondary: 'bg-surface-muted text-ink hover:bg-surface-sunken',
        outline: 'border border-line-strong bg-surface text-ink shadow-xs hover:border-ink/25 hover:bg-surface-muted/60',
        ghost: 'text-ink hover:bg-surface-muted',
        soft: 'bg-brand-soft text-brand-ink hover:bg-[#d8e8dd]',
        danger: 'bg-danger text-white shadow-xs hover:bg-[#962b1f]',
        'danger-outline': 'border border-danger/30 bg-surface text-danger hover:bg-danger-soft',
        link: 'text-brand underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-9 rounded-sm px-3 text-sm [&_svg]:size-4',
        md: 'h-11 rounded-md px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 rounded-md px-5 text-[15px] [&_svg]:size-[18px]',
        icon: 'size-11 rounded-md [&_svg]:size-5',
        'icon-sm': 'size-9 rounded-sm [&_svg]:size-4',
      },
      block: { true: 'w-full' },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading = false, loadingText, disabled, children, type, ...props },
  ref,
) {
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
