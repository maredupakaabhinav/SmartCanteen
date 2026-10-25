import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/misc';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState, Notice, PageHeader } from '@/components/common';
import { useAuth } from '@/features/auth/auth-context';
import { menuKeys, useSettings } from '@/features/menu/queries';
import { adminKeys } from '@/features/admin/queries';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/errors';
import { useDocumentTitle } from '@/lib/use-document-title';
import type { CanteenSettings, Profile, UserRole } from '@/types/database';
import { cn } from '@/lib/cn';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SettingsForm({ settings, editable }: { settings: CanteenSettings; editable: boolean }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState({
    canteen_name: settings.canteen_name,
    location: settings.location ?? '',
    contact_phone: settings.contact_phone ?? '',
    contact_email: settings.contact_email ?? '',
    opening_time: settings.opening_time.slice(0, 5),
    closing_time: settings.closing_time.slice(0, 5),
    open_days: settings.open_days,
    accepting_orders: settings.accepting_orders,
    announcement: settings.announcement ?? '',
    service_fee: (settings.service_fee_paise / 100).toString(),
    allowed_email_domains: settings.allowed_email_domains.join(', '),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (patch: Partial<CanteenSettings>) => {
      const { data, error } = await supabase.from('canteen_settings').update(patch).eq('id', true).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast.success('Settings saved'),
    onError: (e) => toast.error(getErrorMessage(e, 'Could not save settings.')),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: menuKeys.settings }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!v.canteen_name.trim()) next.canteen_name = 'Enter a name.';
    if (v.closing_time <= v.opening_time) next.closing_time = 'Closing time must be after opening time.';
    if (!v.open_days.length) next.open_days = 'Choose at least one day.';
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(v.service_fee.trim()) || Number(v.service_fee) > 100) next.service_fee = 'Enter an amount between ₹0 and ₹100.';
    if (v.contact_email && !/^\S+@\S+\.\S+$/.test(v.contact_email)) next.contact_email = 'Enter a valid email.';
    const domains = v.allowed_email_domains
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    if (domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) next.allowed_email_domains = 'Use domains like college.edu.in, separated by commas.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      canteen_name: v.canteen_name.trim(),
      location: v.location.trim() || null,
      contact_phone: v.contact_phone.trim() || null,
      contact_email: v.contact_email.trim() || null,
      opening_time: v.opening_time,
      closing_time: v.closing_time,
      open_days: [...v.open_days].sort(),
      accepting_orders: v.accepting_orders,
      announcement: v.announcement.trim() || null,
      service_fee_paise: Math.round(Number(v.service_fee) * 100),
      allowed_email_domains: domains,
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset disabled={!editable} className="space-y-6">
        <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Accepting online orders</h2>
              <p className="mt-1 text-sm text-ink-muted">Pause instantly if the kitchen is overwhelmed. Students can still browse.</p>
            </div>
            <Switch
              checked={v.accepting_orders}
              onCheckedChange={(accepting_orders) => {
                setV((s) => ({ ...s, accepting_orders }));
                if (editable) save.mutate({ accepting_orders });
              }}
              aria-label="Accepting online orders"
            />
          </div>
        </section>

        <section className="space-y-5 rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold">Opening hours</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Opens at">
              <Input type="time" value={v.opening_time} onChange={(e) => setV((s) => ({ ...s, opening_time: e.target.value }))} />
            </Field>
            <Field label="Closes at" error={errors.closing_time}>
              <Input type="time" value={v.closing_time} onChange={(e) => setV((s) => ({ ...s, closing_time: e.target.value }))} />
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Open on</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const day = i + 1;
                const on = v.open_days.includes(day);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setV((s) => ({ ...s, open_days: on ? s.open_days.filter((x) => x !== day) : [...s.open_days, day] }))}
                    className={cn('h-10 w-12 rounded-md border text-sm font-medium transition-colors', on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-surface-muted')}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {errors.open_days && <p className="mt-1.5 text-[13px] text-danger">{errors.open_days}</p>}
          </fieldset>
          <p className="text-xs text-ink-muted">Times use the canteen timezone ({settings.timezone}).</p>
        </section>

        <section className="space-y-5 rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold">Canteen details</h2>
          <Field label="Name" error={errors.canteen_name}>
            <Input value={v.canteen_name} onChange={(e) => setV((s) => ({ ...s, canteen_name: e.target.value }))} maxLength={80} />
          </Field>
          <Field label="Location" optional hint="e.g. Ground floor, Main Block">
            <Input value={v.location} onChange={(e) => setV((s) => ({ ...s, location: e.target.value }))} maxLength={160} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact phone" optional>
              <Input type="tel" value={v.contact_phone} onChange={(e) => setV((s) => ({ ...s, contact_phone: e.target.value }))} maxLength={32} />
            </Field>
            <Field label="Contact email" optional error={errors.contact_email}>
              <Input type="email" value={v.contact_email} onChange={(e) => setV((s) => ({ ...s, contact_email: e.target.value }))} maxLength={120} />
            </Field>
          </div>
          <Field label="Announcement" optional hint="Shown at the top of the home page. Leave empty to hide.">
            <Textarea value={v.announcement} onChange={(e) => setV((s) => ({ ...s, announcement: e.target.value }))} maxLength={280} rows={2} />
          </Field>
        </section>

        <section className="space-y-5 rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold">Charges &amp; access</h2>
          <Field label="Service charge per order (₹)" hint="Shown as a separate line in the cart and receipt. Use 0 for none." error={errors.service_fee}>
            <Input inputMode="decimal" value={v.service_fee} onChange={(e) => setV((s) => ({ ...s, service_fee: e.target.value }))} className="sm:w-40" />
          </Field>
          <Field
            label="Allowed sign-up email domains"
            optional
            hint="Restrict new accounts to your institution, e.g. college.edu.in. Leave empty to allow any email. Enforced by the database."
            error={errors.allowed_email_domains}
          >
            <Input value={v.allowed_email_domains} onChange={(e) => setV((s) => ({ ...s, allowed_email_domains: e.target.value }))} placeholder="college.edu.in" />
          </Field>
        </section>
      </fieldset>
      {editable && (
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      )}
    </form>
  );
}

function StaffManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [removing, setRemoving] = useState<Profile | null>(null);

  const staff = useQuery({
    queryKey: adminKeys.staff,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').neq('role', 'student').order('role').order('display_name');
      if (error) throw error;
      return data;
    },
  });

  const setUserRole = useMutation({
    mutationFn: async (vars: { email: string; role: UserRole }) => {
      const { data, error } = await supabase.rpc('admin_set_role', { p_email: vars.email, p_role: vars.role });
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      toast.success(`${p.display_name || p.email} is now ${p.role === 'student' ? 'a student' : p.role}`);
      setEmail('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: adminKeys.staff }),
  });

  return (
    <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ShieldCheck className="size-4 text-ink-muted" aria-hidden /> Staff access
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Staff can run the order queue, menu and reports. Administrators can also change settings and staff access. The person must sign up first.
      </p>
      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\S+@\S+\.\S+$/.test(email.trim())) setUserRole.mutate({ email: email.trim(), role });
          else toast.error('Enter the email address they signed up with.');
        }}
      >
        <Field label="Email" className="flex-1">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@college.edu" />
        </Field>
        <Field label="Role" className="sm:w-36">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Button type="submit" loading={setUserRole.isPending}>
          <UserPlus aria-hidden /> Grant access
        </Button>
      </form>

      <ul className="mt-6 divide-y divide-line rounded-md border border-line">
        {staff.isPending ? (
          <li className="p-4"><Skeleton className="h-10 w-full" /></li>
        ) : (
          staff.data?.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.display_name || '—'} {p.id === user?.id && <span className="text-ink-muted">(you)</span>}
                </p>
                <p className="truncate text-xs text-ink-muted">{p.email}</p>
              </div>
              <Badge tone={p.role === 'admin' ? 'solid' : 'neutral'} className="capitalize">{p.role}</Badge>
              {p.id !== user?.id && (
                <Button variant="ghost" size="icon-sm" aria-label={`Remove staff access for ${p.email}`} onClick={() => setRemoving(p)}>
                  <UserMinus aria-hidden />
                </Button>
              )}
            </li>
          ))
        )}
      </ul>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove staff access?"
        description={`${removing?.email ?? ''} will become a regular student account and lose access to the dashboard.`}
        confirmLabel="Remove access"
        tone="danger"
        onConfirm={() => setUserRole.mutateAsync({ email: removing!.email ?? '', role: 'student' })}
      />
    </section>
  );
}

export default function AdminSettingsPage() {
  useDocumentTitle('Settings');
  const { isAdmin } = useAuth();
  const { data, isPending, isError, error, refetch } = useSettings();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Opening hours, ordering status and who can access the dashboard." />
      {!isAdmin && (
        <Notice tone="neutral" icon={<Lock />}>
          Only administrators can change these settings.
        </Notice>
      )}
      {isPending ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : (
        <SettingsForm settings={data} editable={isAdmin} />
      )}
      {isAdmin && <StaffManagement />}
    </div>
  );
}
