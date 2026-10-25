/**
 * LOCAL QA ONLY — a tiny Supabase-compatible server for running Smart Canteen
 * end-to-end on machines without Docker. NOT for production.
 *
 *  - Postgres: PGlite (real Postgres 18 in WASM) running the real migrations,
 *    RLS policies and SQL functions from supabase/migrations.
 *  - REST: the subset of the PostgREST protocol the app uses (select with
 *    embeds, filters, order, limit/offset, count, insert/update/delete, rpc).
 *  - Auth: the subset of GoTrue the app uses (password sign-up/sign-in,
 *    refresh, get/update user, logout, recover). Emails are auto-confirmed.
 *  - Storage: public bucket upload + download for menu images.
 *  - Realtime: not implemented — the app falls back to polling.
 *
 * Every request runs inside a transaction as the caller's Postgres role
 * (anon / authenticated / service_role) with auth.uid() set, so RLS and
 * grants behave as they do on Supabase.
 *
 * Usage: npm run local:db   (then `npm run dev` in another terminal)
 */
import http from 'node:http';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, '.local-supabase');
const PORT = Number(process.env.LOCAL_SUPABASE_PORT ?? 54321);
const JWT_SECRET = 'smart-canteen-local-dev-only-secret';

/* ------------------------------------------------------------------ JWT */
const b64url = (buf) => Buffer.from(buf).toString('base64url');
function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = String(token).split('.');
  if (!h || !b || !s) return null;
  const expected = createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
  if (expected.length !== s.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}
const ANON_KEY = signJwt({ iss: 'local-supabase', role: 'anon', iat: 1760000000, exp: 2000000000 });
const SERVICE_KEY = signJwt({ iss: 'local-supabase', role: 'service_role', iat: 1760000000, exp: 2000000000 });

/* ------------------------------------------------------------------ Database */
mkdirSync(DATA_DIR, { recursive: true });
const firstRun = !existsSync(join(DATA_DIR, 'pgdata', 'PG_VERSION'));
const db = new PGlite(join(DATA_DIR, 'pgdata'));

if (firstRun) {
  console.log('[local-supabase] First run: applying migrations and demo seed…');
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text unique,
      encrypted_password text,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_sign_in_at timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  const migrations = readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of migrations) {
    await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8'));
    console.log(`  ✓ ${f}`);
  }
  await db.exec(readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
  console.log('  ✓ seed.sql (demonstration data)');
}

// Introspect column and function types so parameters can be cast correctly.
const columnTypes = new Map();
for (const r of (
  await db.query(`
    select c.relname as t, a.attname as c, format_type(a.atttypid, a.atttypmod) as ty
      from pg_attribute a join pg_class c on c.oid = a.attrelid
     where c.relnamespace = 'public'::regnamespace and a.attnum > 0 and not a.attisdropped`)
).rows) {
  columnTypes.set(`${r.t}.${r.c}`, r.ty);
}
const functions = new Map();
for (const r of (
  await db.query(`
    select p.proname as name, p.proretset as set, t.typtype as kind, p.proargnames as names,
           array(select format_type(x, null) from unnest(p.proargtypes) x) as types
      from pg_proc p join pg_type t on t.oid = p.prorettype
     where p.pronamespace = 'public'::regnamespace`)
).rows) {
  functions.set(r.name, { set: r.set || r.kind === 'p', composite: r.kind === 'c', names: r.names ?? [], types: r.types });
}

/* ------------------------------------------------------------------ Helpers */
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw httpError(400, 'PGRST100', `Invalid identifier: ${s}`);
  return `"${s}"`;
};
function httpError(status, code, message, extra = {}) {
  return Object.assign(new Error(message), { status, body: { code, message, details: null, hint: null, ...extra } });
}
function pgStatus(code) {
  if (code === '42501') return 403;
  if (code === '23503' || code === '23505') return 409;
  if (code === '28000') return 403;
  return 400;
}

async function asRole(actor, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${actor.role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [actor.sub ?? '']);
    return fn(tx);
  });
}

function actorFrom(req) {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
  const payload = verifyJwt(bearer ?? req.headers.apikey ?? '');
  if (!payload) return { role: 'anon' };
  if (payload.role === 'service_role') return { role: 'service_role' };
  if (payload.role === 'authenticated' && payload.sub) return { role: 'authenticated', sub: payload.sub };
  return { role: 'anon' };
}

/* ------------------------------------------------------------------ PostgREST subset */
const EMBEDS = {
  orders: { order_items: 'order_id', order_status_events: 'order_id', payments: 'order_id' },
};

function parseSelect(select = '*') {
  const cols = [];
  const embeds = [];
  let depth = 0;
  let cur = '';
  for (const ch of `${select},`) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      const part = cur.trim();
      if (part) {
        const m = /^([a-z_]+)\((.*)\)$/.exec(part);
        if (m) embeds.push(m[1]);
        else cols.push(part);
      }
      cur = '';
    } else cur += ch;
  }
  return { cols: cols.length ? cols : ['*'], embeds };
}

function parseOrder(table, value, alias) {
  return value
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [col, ...mods] = part.split('.');
      ident(col);
      const dir = mods.includes('desc') ? 'desc' : 'asc';
      const nulls = mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : '';
      return `${alias}.${ident(col)} ${dir}${nulls}`;
    })
    .join(', ');
}

function buildWhere(table, params, values, alias = 't') {
  const clauses = [];
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key) || key.includes('.')) continue;
    const col = ident(key);
    const type = columnTypes.get(`${table}.${key}`) ?? 'text';
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    const push = (v) => {
      values.push(v);
      return `$${values.length}::${type}`;
    };
    switch (op) {
      case 'eq': clauses.push(`${alias}.${col} = ${push(val)}`); break;
      case 'neq': clauses.push(`${alias}.${col} <> ${push(val)}`); break;
      case 'gt': clauses.push(`${alias}.${col} > ${push(val)}`); break;
      case 'gte': clauses.push(`${alias}.${col} >= ${push(val)}`); break;
      case 'lt': clauses.push(`${alias}.${col} < ${push(val)}`); break;
      case 'lte': clauses.push(`${alias}.${col} <= ${push(val)}`); break;
      case 'is':
        clauses.push(`${alias}.${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
        break;
      case 'in': {
        const items = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
        clauses.push(`${alias}.${col} in (${items.map(push).join(', ')})`);
        break;
      }
      default:
        throw httpError(400, 'PGRST100', `Unsupported filter operator: ${op}`);
    }
  }
  return clauses.length ? `where ${clauses.join(' and ')}` : '';
}

function wantsObject(req) {
  return (req.headers.accept ?? '').includes('application/vnd.pgrst.object+json');
}
function prefer(req, key) {
  return new RegExp(`${key}=([a-z]+)`).exec(req.headers.prefer ?? '')?.[1];
}

async function handleRest(req, res, url, body) {
  const actor = actorFrom(req);
  const path = url.pathname.replace(/^\/rest\/v1\//, '');
  const params = [...url.searchParams.entries()];

  // ---- RPC
  if (path.startsWith('rpc/')) {
    const name = path.slice(4);
    const fn = functions.get(name);
    if (!fn) throw httpError(404, 'PGRST202', `Could not find the function public.${name}`);
    const args = body ? JSON.parse(body) : {};
    const values = [];
    const named = Object.entries(args).map(([k, v]) => {
      const i = fn.names.indexOf(k);
      if (i < 0) throw httpError(404, 'PGRST202', `Function public.${name} has no argument ${k}`);
      values.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
      return `${ident(k)} => $${values.length}::${fn.types[i]}`;
    });
    const call = `public.${ident(name)}(${named.join(', ')})`;
    const sql = fn.set || fn.composite ? `select to_jsonb(r) as v from ${call} r` : `select to_jsonb(${call}) as v`;
    const rows = await asRole(actor, async (tx) => (await tx.query(sql, values)).rows.map((r) => r.v));
    if (fn.set) return send(res, 200, wantsObject(req) ? rows[0] ?? null : rows);
    if (fn.composite && rows[0] && Object.values(rows[0]).every((v) => v === null)) return send(res, 200, null);
    return send(res, 200, rows[0] ?? null);
  }

  // ---- Tables
  const table = path;
  ident(table);
  const values = [];
  const where = buildWhere(table, params, values);

  if (req.method === 'GET' || req.method === 'HEAD') {
    const { cols, embeds } = parseSelect(url.searchParams.get('select') ?? '*');
    const base = cols.includes('*') ? 'to_jsonb(t)' : `jsonb_build_object(${cols.map((c) => `'${ident(c).slice(1, -1)}', t.${ident(c)}`).join(', ')})`;
    const embedSql = embeds
      .map((e) => {
        const fk = EMBEDS[table]?.[e];
        if (!fk) throw httpError(400, 'PGRST200', `No relationship ${table} -> ${e}`);
        const ord = url.searchParams.get(`${e}.order`);
        const orderBy = ord ? ` order by ${parseOrder(e, ord, 'c')}` : '';
        return ` || jsonb_build_object('${e}', (select coalesce(jsonb_agg(to_jsonb(c)${orderBy}), '[]'::jsonb) from public.${ident(e)} c where c.${ident(fk)} = t.id))`;
      })
      .join('');
    const order = url.searchParams.get('order');
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');
    const sql = `select ${base}${embedSql} as v from public.${ident(table)} t ${where}${order ? ` order by ${parseOrder(table, order, 't')}` : ''}${limit ? ` limit ${Number(limit)}` : ''}${offset ? ` offset ${Number(offset)}` : ''}`;
    const countMode = prefer(req, 'count');
    const { rows, total } = await asRole(actor, async (tx) => {
      const rows = (await tx.query(sql, values)).rows.map((r) => r.v);
      const total = countMode ? Number((await tx.query(`select count(*)::int as n from public.${ident(table)} t ${where}`, values)).rows[0].n) : null;
      return { rows, total };
    });
    const headers = {};
    const start = Number(offset ?? 0);
    headers['content-range'] = `${rows.length ? `${start}-${start + rows.length - 1}` : '*'}/${total ?? '*'}`;
    if (wantsObject(req)) {
      if (rows.length !== 1) {
        throw httpError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', {
          details: `The result contains ${rows.length} rows`,
        });
      }
      return send(res, 200, rows[0], headers);
    }
    return send(res, 200, rows, headers);
  }

  const returnRep = prefer(req, 'return') === 'representation';
  const selectList = url.searchParams.get('select');

  if (req.method === 'POST') {
    const payload = JSON.parse(body || '[]');
    const list = Array.isArray(payload) ? payload : [payload];
    const out = await asRole(actor, async (tx) => {
      const rows = [];
      for (const obj of list) {
        const keys = Object.keys(obj).map(ident);
        const r = await tx.query(
          `insert into public.${ident(table)} (${keys.join(', ')})
           select ${keys.join(', ')} from jsonb_populate_record(null::public.${ident(table)}, $1::jsonb)
           returning to_jsonb(public.${ident(table)}.*) as v`,
          [JSON.stringify(obj)],
        );
        rows.push(r.rows[0].v);
      }
      return rows;
    });
    if (!returnRep && !selectList) return send(res, 201, null);
    return send(res, 201, wantsObject(req) ? out[0] : out);
  }

  if (req.method === 'PATCH') {
    const obj = JSON.parse(body || '{}');
    const keys = Object.keys(obj).map(ident);
    values.push(JSON.stringify(obj));
    const sql = `update public.${ident(table)} t set (${keys.join(', ')}) = (select ${keys.join(', ')} from jsonb_populate_record(null::public.${ident(table)}, $${values.length}::jsonb)) ${where} returning to_jsonb(t) as v`;
    const rows = await asRole(actor, async (tx) => (await tx.query(sql, values)).rows.map((r) => r.v));
    if (!returnRep && !selectList) return send(res, 204, null);
    if (wantsObject(req)) {
      if (rows.length !== 1) throw httpError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
      return send(res, 200, rows[0]);
    }
    return send(res, 200, rows);
  }

  if (req.method === 'DELETE') {
    const rows = await asRole(actor, async (tx) =>
      (await tx.query(`delete from public.${ident(table)} t ${where} returning to_jsonb(t) as v`, values)).rows.map((r) => r.v),
    );
    return send(res, returnRep ? 200 : 204, returnRep ? rows : null);
  }

  throw httpError(405, 'PGRST000', 'Method not allowed');
}

/* ------------------------------------------------------------------ GoTrue subset */
const refreshTokens = new Map();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = scryptSync(password, salt, 32);
  return timingSafeEqual(a, Buffer.from(hash, 'hex'));
}

function userJson(u) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.created_at,
    confirmed_at: u.created_at,
    phone: '',
    last_sign_in_at: u.last_sign_in_at ?? u.created_at,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [],
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const access = signJwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + expiresIn, session_id: randomUUID() });
  const refresh = randomBytes(24).toString('hex');
  refreshTokens.set(refresh, u.id);
  return { access_token: access, token_type: 'bearer', expires_in: expiresIn, expires_at: now + expiresIn, refresh_token: refresh, user: userJson(u) };
}

const authError = (status, code, msg) => Object.assign(new Error(msg), { status, body: { code: status, error_code: code, msg } });

async function getAuthUser(where, value) {
  const r = await db.query(`select * from auth.users where ${where} = $1`, [value]);
  return r.rows[0] ?? null;
}

async function handleAuth(req, res, url, body) {
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  const json = body ? JSON.parse(body) : {};

  if (path === '/settings') return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });

  if (path === '/signup' && req.method === 'POST') {
    const email = String(json.email ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw authError(400, 'validation_failed', 'Unable to validate email address: invalid format');
    if (String(json.password ?? '').length < 6) throw authError(422, 'weak_password', 'Password should be at least 6 characters.');
    if (await getAuthUser('email', email)) throw authError(422, 'user_already_exists', 'User already registered');
    const id = randomUUID();
    try {
      await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, $3, $4)`, [
        id,
        email,
        hashPassword(json.password),
        JSON.stringify(json.data ?? {}),
      ]);
    } catch {
      throw authError(500, 'unexpected_failure', 'Database error saving new user');
    }
    return send(res, 200, session(await getAuthUser('id', id)));
  }

  if (path === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = await getAuthUser('email', String(json.email ?? '').trim().toLowerCase());
      if (!u || !checkPassword(String(json.password ?? ''), u.encrypted_password)) {
        throw authError(400, 'invalid_credentials', 'Invalid login credentials');
      }
      await db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [u.id]);
      return send(res, 200, session(u));
    }
    if (grant === 'refresh_token') {
      const uid = refreshTokens.get(json.refresh_token);
      if (!uid) throw authError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refreshTokens.delete(json.refresh_token);
      return send(res, 200, session(await getAuthUser('id', uid)));
    }
    throw authError(400, 'validation_failed', 'Unsupported grant type');
  }

  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
  const claims = verifyJwt(bearer ?? '');

  if (path === '/user') {
    if (!claims?.sub) throw authError(401, 'no_authorization', 'Invalid JWT');
    let u = await getAuthUser('id', claims.sub);
    if (!u) throw authError(404, 'user_not_found', 'User not found');
    if (req.method === 'PUT') {
      if (json.password) {
        if (String(json.password).length < 6) throw authError(422, 'weak_password', 'Password should be at least 6 characters.');
        await db.query(`update auth.users set encrypted_password = $2, updated_at = now() where id = $1`, [u.id, hashPassword(json.password)]);
      }
      if (json.data) {
        await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1`, [u.id, JSON.stringify(json.data)]);
      }
      u = await getAuthUser('id', claims.sub);
    }
    return send(res, 200, userJson(u));
  }

  if (path === '/logout') return send(res, 204, null);
  if (path === '/recover') return send(res, 200, {});

  throw authError(404, 'not_found', `Auth endpoint not emulated: ${path}`);
}

/* ------------------------------------------------------------------ Storage subset */
async function handleStorage(req, res, url, rawBody) {
  const pub = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (pub && req.method === 'GET') {
    const file = join(DATA_DIR, 'storage', pub[1], decodeURIComponent(pub[2]));
    if (!existsSync(file)) return send(res, 404, { message: 'Object not found' });
    const ext = file.split('.').pop();
    res.writeHead(200, { 'content-type': ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', 'access-control-allow-origin': '*' });
    return res.end(readFileSync(file));
  }
  const up = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (up && req.method === 'POST') {
    const actor = actorFrom(req);
    const allowed = await asRole(actor, async (tx) => (await tx.query(`select public.is_staff() as ok`)).rows[0].ok);
    if (!allowed) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const dir = join(DATA_DIR, 'storage', up[1], dirname(decodeURIComponent(up[2])));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(DATA_DIR, 'storage', up[1], decodeURIComponent(up[2])), rawBody);
    return send(res, 200, { Key: `${up[1]}/${up[2]}`, Id: randomUUID() });
  }
  return send(res, 404, { message: 'Not found' });
}

/* ------------------------------------------------------------------ HTTP */
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range, x-total-count',
    ...headers,
  });
  res.end(body === null || status === 204 ? undefined : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
      'access-control-max-age': '600',
    });
    return res.end();
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const started = Date.now();
  try {
    if (url.pathname.startsWith('/rest/v1/')) await handleRest(req, res, url, raw.toString());
    else if (url.pathname.startsWith('/auth/v1/')) await handleAuth(req, res, url, raw.toString());
    else if (url.pathname.startsWith('/storage/v1/')) await handleStorage(req, res, url, raw);
    else send(res, 404, { message: 'Not emulated (realtime is not available locally; the app polls instead).' });
  } catch (error) {
    if (error.status) {
      send(res, error.status, error.body);
    } else if (error.code) {
      send(res, pgStatus(error.code), { code: error.code, message: error.message, details: error.detail ?? null, hint: error.hint ?? null });
    } else {
      console.error(error);
      send(res, 500, { code: 'PGRST000', message: 'Internal error' });
    }
  } finally {
    if (process.env.LOCAL_SUPABASE_LOG && !url.pathname.startsWith('/realtime')) console.log(`${req.method} ${url.pathname}${url.search} ${res.statusCode} ${Date.now() - started}ms`);
  }
});

// Realtime is not emulated: refuse WebSocket upgrades immediately so they never
// hold a connection open (the app falls back to polling). PGlite serialises
// queries and transactions internally, so requests can run concurrently.
server.on('upgrade', (_req, socket) => {
  socket.end('HTTP/1.1 404 Not Found' + String.fromCharCode(13, 10) + 'Connection: close' + String.fromCharCode(13, 10, 13, 10));
});

server.listen(PORT, () => {
  const envFile = join(ROOT, '.env.local');
  if (!existsSync(envFile)) {
    writeFileSync(
      envFile,
      [
        '# Generated by scripts/local-supabase for LOCAL QA ONLY. Do not commit.',
        `VITE_SUPABASE_URL=http://localhost:${PORT}`,
        `VITE_SUPABASE_ANON_KEY=${ANON_KEY}`,
        `SUPABASE_URL=http://localhost:${PORT}`,
        `SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}`,
        'PAYMENT_MODE=demo',
        '',
      ].join('\n'),
    );
    console.log('[local-supabase] Wrote .env.local for the dev server.');
  }
  console.log(`[local-supabase] Listening on http://localhost:${PORT} (data in .local-supabase/)`);
  console.log('[local-supabase] Promote a user to admin with: npm run make-admin -- you@example.com');
});
