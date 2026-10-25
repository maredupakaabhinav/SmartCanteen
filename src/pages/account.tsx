import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChefHat, KeyRound, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Notice, PageHeader } from '@/components/common';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/use-document-title';

export default function AccountPage() {
  useDocumentTitle('Your account');
  const { user, profile, isStaff, signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [nameDraft, setName] = useState<string | null>(null);
  const name = nameDraft ?? profile?.display_name ?? '';
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError('Enter at least 2 characters.');
      return;
    }
    setNameError(null);
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', user!.id);
    setSaving(false);
    if (error) {
      toast.error(getErrorMessage(error));
      return;
    }
    toast.success('Name updated');
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setPasswordError('Use at least 8 characters.');
      return;
    }
    setPasswordError(null);
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      setPasswordError('We couldn’t update your password. Please try again.');
      return;
    }
    setPassword('');
    toast.success('Password updated');
  }

  return (
    <div className="page-container max-w-2xl pt-8 pb-16 sm:pt-10">
      <PageHeader
        title="Your account"
        description={user?.email}
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            <LogOut aria-hidden /> Sign out
          </Button>
        }
      />

      {params.get('password') === 'updated' && (
        <Notice tone="brand" className="mt-6">
          Your password has been updated.
        </Notice>
      )}

      {isStaff && (
        <div className="mt-8 flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
              <ChefHat className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">Canteen {profile?.role === 'admin' ? 'administrator' : 'staff'}</p>
              <p className="text-sm text-ink-muted">You can manage orders and the menu.</p>
            </div>
          </div>
          <Button asChild>
            <Link to="/admin">Open dashboard</Link>
          </Button>
        </div>
      )}

      <section aria-labelledby="profile-heading" className="mt-8 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="profile-heading" className="text-base font-semibold">
            Profile
          </h2>
          {profile && <Badge tone="neutral">Member since {formatDate(profile.created_at)}</Badge>}
        </div>
        <form onSubmit={saveName} noValidate className="mt-5 space-y-5">
          <Field label="Display name" hint="Used at the counter when your order is ready." error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
          </Field>
          <Field label="Email" hint="Contact the canteen to change the email on your account.">
            <Input value={user?.email ?? ''} readOnly disabled />
          </Field>
          <Button type="submit" loading={saving} disabled={name.trim() === (profile?.display_name ?? '')}>
            Save changes
          </Button>
        </form>
      </section>

      <section aria-labelledby="security-heading" className="mt-6 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <h2 id="security-heading" className="flex items-center gap-2 text-base font-semibold">
          <KeyRound className="size-4 text-ink-muted" aria-hidden /> Password
        </h2>
        <form onSubmit={savePassword} noValidate className="mt-5 space-y-5">
          <Field label="New password" hint="At least 8 characters." error={passwordError}>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" loading={savingPassword} disabled={!password}>
            Update password
          </Button>
        </form>
      </section>
    </div>
  );
}
