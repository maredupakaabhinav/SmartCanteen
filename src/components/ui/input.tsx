import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export const fieldBase = cn(
  'w-full rounded-md border border-line-strong bg-surface px-3.5 text-[15px] text-ink shadow-xs',
  'placeholder:text-ink-subtle transition-[border-color,box-shadow] duration-150',
  'hover:border-ink/25 focus:border-brand focus:shadow-(--shadow-focus) focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70',
  'aria-invalid:border-danger',
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldBase, 'min-h-24 resize-y py-2.5 leading-6', className)} {...props} />;
});

/** Native select: accessible, keyboard friendly and uses the OS picker on mobile. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(fieldBase, 'h-11 cursor-pointer appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted" />
    </div>
  );
});
