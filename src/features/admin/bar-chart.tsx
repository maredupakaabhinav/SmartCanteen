import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Formatted value for tooltips and the table view. */
  display: string;
  /** Optional secondary line in the tooltip (e.g. order count). */
  detail?: string;
}

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Bar path with a 4px rounded data-end and a square baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Single-series column chart (one measure, one axis). Hover/focus shows a
 * tooltip; the parent provides a table view for accessibility.
 */
export function BarChart({
  data,
  formatAxis,
  height = 220,
  ariaLabel,
}: {
  data: BarDatum[];
  formatAxis: (v: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  // Measure before paint so the first render never overflows, then track resizes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.floor(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const padL = 52;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const slot = data.length ? innerW / data.length : innerW;
  const gap = Math.max(2, Math.min(12, slot * 0.28));
  const barW = Math.max(2, slot - gap);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56)));
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
        {ticks.map((t) => {
          const y = padT + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--color-line)" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={padL - 8} y={y} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular">
                {formatAxis(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const x = padL + i * slot + gap / 2;
          const y = padT + innerH - h;
          const active = hover === i;
          return (
            <g key={d.key}>
              {h > 0 && (
                <path
                  d={barPath(x, y, barW, h)}
                  fill="var(--color-brand)"
                  opacity={hover === null || active ? 1 : 0.45}
                  className="transition-opacity duration-150"
                />
              )}
              {/* Hit target: the whole column, larger than the mark */}
              <rect
                x={padL + i * slot}
                y={padT}
                width={slot}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.label}: ${d.display}${d.detail ? `, ${d.detail}` : ''}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="cursor-default outline-none"
              />
              {i % labelEvery === 0 && (
                <text x={padL + i * slot + slot / 2} y={height - 8} textAnchor="middle" className="fill-ink-muted text-[11px]">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md',
          )}
          style={{ left: Math.min(Math.max(padL + hover * slot + slot / 2, 60), width - 60) }}
        >
          <p className="font-medium text-ink">{hovered.label}</p>
          <p className="tabular mt-0.5 text-sm font-semibold text-ink">{hovered.display}</p>
          {hovered.detail && <p className="text-ink-muted">{hovered.detail}</p>}
        </div>
      )}
    </div>
  );
}
