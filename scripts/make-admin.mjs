/**
 * Grant the admin role to an existing account (they must have signed up first).
 *
 *   npm run make-admin -- someone@college.edu.in
 *
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or
 * from .env.local / .env. The service-role key never leaves your machine.
 * Equivalent SQL (Supabase SQL editor):
 *   update public.profiles set role = 'admin' where email = 'someone@college.edu.in';
 */
import { existsSync, readFileSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const role = process.argv[3] ?? 'admin';

if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: npm run make-admin -- <email> [admin|staff|student]');
  process.exit(1);
}
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).');
  process.exit(1);
}
if (!['admin', 'staff', 'student'].includes(role)) {
  console.error('Role must be admin, staff or student.');
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email,role`, {
  method: 'PATCH',
  headers: {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    prefer: 'return=representation',
  },
  body: JSON.stringify({ role }),
});
const body = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`Failed (${res.status}):`, body?.message ?? body);
  process.exit(1);
}
if (!Array.isArray(body) || body.length === 0) {
  console.error(`No account found for ${email}. Ask them to sign up first.`);
  process.exit(1);
}
console.log(`✓ ${email} is now ${role}.`);
