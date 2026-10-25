import { cn } from '@/lib/cn';

/** Smart Canteen mark: a bowl with two rising lines of steam. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="9" fill="var(--color-brand)" />
      <path d="M8.5 16.5h15a7.5 7.5 0 0 1-15 0Z" fill="#FAF9F6" />
      <path d="M7.5 16.5h17" stroke="#FAF9F6" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M13.2 8.6c-.9.9-.9 1.9 0 2.8.9.9.9 1.9 0 2.8M18.4 8.6c-.9.9-.9 1.9 0 2.8.9.9.9 1.9 0 2.8"
        stroke="#FAF9F6"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('text-[17px] leading-none font-semibold tracking-[-0.02em] text-ink', compact && 'max-[359px]:sr-only')}>
        Smart<span className="text-brand"> Canteen</span>
      </span>
    </span>
  );
}
