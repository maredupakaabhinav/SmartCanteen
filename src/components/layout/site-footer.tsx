import { Link } from 'react-router';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { useSettings } from '@/features/menu/queries';
import { describeOpenDays } from '@/features/menu/hours';
import { formatClock } from '@/lib/format';
import { env } from '@/lib/env';

export function SiteFooter() {
  const { data: settings } = useSettings();
  const email = settings?.contact_email || env.supportEmail;

  return (
    <footer className="no-print mt-24 border-t border-line bg-surface pb-24 md:pb-0">
      <div className="page-container grid gap-10 py-12 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-6 text-ink-muted">
            Order from the campus canteen, pay online and collect with your pickup number — no waiting at the counter.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Visit</h2>
          <ul className="mt-4 space-y-3 text-sm text-ink-muted">
            {settings && (
              <li className="flex gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {describeOpenDays(settings.open_days)}
                  <br />
                  {formatClock(settings.opening_time)} – {formatClock(settings.closing_time)}
                </span>
              </li>
            )}
            {settings?.location && (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                {settings.location}
              </li>
            )}
            {settings?.contact_phone && (
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                <a className="hover:text-ink" href={`tel:${settings.contact_phone.replace(/\s/g, '')}`}>
                  {settings.contact_phone}
                </a>
              </li>
            )}
            {email && (
              <li className="flex gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                <a className="hover:text-ink" href={`mailto:${email}`}>
                  {email}
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Ordering</h2>
          <ul className="mt-4 space-y-3 text-sm text-ink-muted">
            <li><Link className="hover:text-ink" to="/menu">Browse the menu</Link></li>
            <li><Link className="hover:text-ink" to="/orders">Track an order</Link></li>
            <li><Link className="hover:text-ink" to="/#faq">Help &amp; FAQ</Link></li>
            <li><Link className="hover:text-ink" to="/account">Your account</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="page-container flex flex-col gap-2 py-6 text-xs text-ink-muted sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {settings?.canteen_name ?? 'Smart Canteen'}</p>
          <p>Payments are processed securely by Razorpay.</p>
        </div>
      </div>
    </footer>
  );
}
