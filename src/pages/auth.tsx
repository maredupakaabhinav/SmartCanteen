import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { FoodImage, Notice } from '@/components/common';
import { Logo } from '@/components/brand/logo';
import { useAuth } from '@/features/auth/auth-context';
import { useSettings } from '@/features/menu/queries';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/lib/use-document-title';

/** Only allow same-site relative redirects after sign-in. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

function authErrorMessage(error: { message?: string; code?: string } | null): string {
  const msg = error?.message ?? '';
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Check them and try again.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered|already been registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
  if (/database error saving new user/i.test(msg)) return 'Sign-up is limited to approved campus email addresses.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/password/i.test(msg) && /weak|short|least/i.test(msg)) return 'Choose a stronger password (at least 8 characters).';
  if (/fetch|network/i.test(msg)) return 'You appear to be offline. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="page-container grid min-h-[calc(100dvh-var(--spacing-header))] items-center gap-12 py-10 lg:grid-cols-2">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-ink-muted">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-8 text-sm text-ink-muted">{footer}</div>}
      </div>
      <div className="relative hidden overflow-hidden rounded-2xl lg:block">
        <FoodImage
          src="https://images.unsplash.com/photo-1742281257687-092746ad6021"
          alt="A vegetarian thali with rice, dal, curries and rotis"
          width={960}
          sizes="50vw"
          className="aspect-[4/5] w-full"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-8 text-white">
          <Logo className="[&_span]:text-white" />
          <p className="mt-3 max-w-sm text-white/85">Order ahead between lectures and collect without the queue.</p>
        </div>
      </div>
    </div>
  );
}

const emailSchema = z.email('Enter a valid email address.');

export function SignInPage() {
  useDocumentTitle('Sign in');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  if (user && !busy) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!emailSchema.safeParse(email.trim()).success) nextErrors.email = 'Enter a valid email address.';
    if (!password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setErrors({ form: authErrorMessage(error) });
      return;
    }
    navigate(next, { replace: true });
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={next === '/checkout' ? 'Sign in to place your order. Your cart is saved.' : 'Sign in to order and track your food.'}
      footer={
        <>
          New to Smart Canteen?{' '}
          <Link className="font-medium text-brand hover:underline" to={`/sign-up?next=${encodeURIComponent(next)}`}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors.form && (
          <Notice tone="danger" className="text-sm">
            <span role="alert">{errors.form}</span>
          </Notice>
        )}
        <Field label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={<span className="flex w-full items-center justify-between">Password</span>} error={errors.password}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="-mt-2 text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={busy} loadingText="Signing in…">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export function SignUpPage() {
  useDocumentTitle('Create account');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const domains = settings?.allowed_email_domains ?? [];

  if (user && !busy) return <Navigate to={next} replace />;

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle={<>We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>.</>}>
        <Notice tone="brand" icon={<MailCheck />}>
          Open the link to activate your account, then come back and sign in. It can take a minute to arrive — check spam too.
        </Notice>
        <Button asChild variant="outline" block size="lg" className="mt-6">
          <Link to={`/sign-in?next=${encodeURIComponent(next)}`}>Back to sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    const trimmedEmail = email.trim().toLowerCase();
    if (name.trim().length < 2) nextErrors.name = 'Enter your name (at least 2 characters).';
    if (!emailSchema.safeParse(trimmedEmail).success) nextErrors.email = 'Enter a valid email address.';
    else if (domains.length && !domains.some((d) => trimmedEmail.endsWith(`@${d.toLowerCase()}`))) {
      nextErrors.email = `Use your campus email (${domains.map((d) => `@${d}`).join(' or ')}).`;
    }
    if (password.length < 8) nextErrors.password = 'Use at least 8 characters.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/sign-in?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) {
      setErrors({ form: authErrorMessage(error) });
      return;
    }
    if (data.session) navigate(next, { replace: true });
    else setSentTo(trimmedEmail);
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Takes less than a minute. We only ask for what we need to run your orders."
      footer={
        <>
          Already have an account?{' '}
          <Link className="font-medium text-brand hover:underline" to={`/sign-in?next=${encodeURIComponent(next)}`}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors.form && (
          <Notice tone="danger">
            <span role="alert">{errors.form}</span>
          </Notice>
        )}
        <Field label="Your name" hint="Shown at the counter with your pickup number." error={errors.name}>
          <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field
          label="Email"
          hint={domains.length ? `Campus email required (${domains.map((d) => `@${d}`).join(', ')}).` : undefined}
          error={errors.email}
        >
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 8 characters." error={errors.password}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" block loading={busy} loadingText="Creating account…">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  useDocumentTitle('Reset password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!emailSchema.safeParse(email.trim()).success) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err && /rate|too many|fetch|network/i.test(err.message)) {
      setError(authErrorMessage(err));
      return;
    }
    // Same response whether or not the account exists, so emails can't be probed.
    setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we’ll send you a reset link."
      footer={
        <Link to="/sign-in" className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Notice tone="brand" icon={<MailCheck />} title="Check your inbox">
          If an account exists for {email.trim()}, a reset link is on its way.
        </Notice>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <Field label="Email" error={error}>
            <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" block loading={busy} loadingText="Sending…">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const { user, initializing } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (confirm !== password) next.confirm = 'Passwords don’t match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setErrors({ form: authErrorMessage(error) });
      return;
    }
    navigate('/account?password=updated', { replace: true });
  }

  if (!initializing && !user) {
    return (
      <AuthShell title="Link expired" subtitle="This password reset link is invalid or has expired.">
        <Button asChild size="lg" block>
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} noValidate className="space-y-5">
        {errors.form && (
          <Notice tone="danger">
            <span role="alert">{errors.form}</span>
          </Notice>
        )}
        <Field label="New password" hint="At least 8 characters." error={errors.password}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" block loading={busy} loadingText="Saving…">
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
