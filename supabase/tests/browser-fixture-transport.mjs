// Test-only local transport. PostgreSQL executes the real migrations and RLS.
// This is a bounded Auth/PostgREST adapter, not a replacement Supabase server.
// Billing opts in with { billingTestMode: true }; it always uses the separate
// disposable woff_billing_fixture database, never hosted/project configuration.
// Keep fixtureServiceRoleKey() in the local runner's server environment only.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('internal/db-runtime/local-fixture.cjs'));
const { Client, Pool } = require('pg');
const { WebSocketServer } = createRequire(import.meta.url)('next/dist/compiled/ws');
export const FIXTURE_DATABASE = 'woff_browser_fixture';
export const FIXTURE_PG = `postgresql://postgres@127.0.0.1:55439/${FIXTURE_DATABASE}`;
export const FIXTURE_API = 'http://127.0.0.1:55440';
export const BILLING_FIXTURE_DATABASE = 'woff_billing_fixture';
export const BILLING_FIXTURE_PG = `postgresql://postgres@127.0.0.1:55439/${BILLING_FIXTURE_DATABASE}`;
const fixturePools = new WeakMap();
const verifiedServiceClaims = new WeakSet();
function fixtureProfile(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => key !== 'billingTestMode')
    || (options.billingTestMode !== undefined && typeof options.billingTestMode !== 'boolean')) {
    throw new Error('Unsupported fixture profile');
  }
  const billingTestMode = options.billingTestMode === true;
  return { billingTestMode, database: billingTestMode ? BILLING_FIXTURE_DATABASE : FIXTURE_DATABASE,
    connectionString: billingTestMode ? BILLING_FIXTURE_PG : FIXTURE_PG };
}
const secret = 'woff-local-browser-fixture-only-never-a-production-key';
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export function fixtureJwt(claims, options = {}) {
  if (claims.role === 'service_role') {
    if (!fixtureProfile(options).billingTestMode) throw new Error('Service role requires explicit billing Test mode');
    claims = { ...claims, fixture: 'billing-test' };
  }
  const body = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ iss: `${FIXTURE_API}/auth/v1`, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, ...claims })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export const FIXTURE_ANON_KEY = fixtureJwt({ role: 'anon' });
export function fixtureServiceRoleKey(options = {}) {
  if (!fixtureProfile(options).billingTestMode) throw new Error('Service role requires explicit billing Test mode');
  return fixtureJwt({ role: 'service_role' }, options);
}
function verifiedClaims(token, options = {}) {
  const parts = (token || '').split('.');
  const [header, body, signature] = parts;
  if (parts.length !== 3 || !header || !body || !signature) throw new Error('Fixture JWT required');
  const actual = Buffer.from(signature, 'base64url');
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid fixture JWT');
  const algorithm = JSON.parse(Buffer.from(header, 'base64url'));
  const claims = JSON.parse(Buffer.from(body, 'base64url'));
  const serviceRole = fixtureProfile(options).billingTestMode && claims.role === 'service_role' && claims.fixture === 'billing-test';
  if (algorithm.alg !== 'HS256' || algorithm.typ !== 'JWT' || claims.iss !== `${FIXTURE_API}/auth/v1`
    || !Number.isFinite(claims.exp) || claims.exp <= Date.now()/1000
    || (!['anon', 'authenticated'].includes(claims.role) && !serviceRole)) throw new Error('Expired or unsupported fixture JWT');
  if (serviceRole) verifiedServiceClaims.add(claims);
  return claims;
}
export function fixtureUser(row) {
  return { id: row.id, aud: 'authenticated', role: 'authenticated', email: row.email || '', email_confirmed_at: row.email_confirmed_at?.toISOString?.() || row.email_confirmed_at, confirmed_at: row.email_confirmed_at?.toISOString?.() || row.email_confirmed_at, is_anonymous: row.is_anonymous, app_metadata: { provider: row.is_anonymous ? 'anonymous' : 'email', providers: [row.is_anonymous ? 'anonymous' : 'email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}
export function fixtureSession(row) {
  const user = fixtureUser(row);
  return { access_token: fixtureJwt({ sub: row.id, role: 'authenticated', email: user.email, is_anonymous: row.is_anonymous }), refresh_token: `fixture-${row.id}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user };
}
export function createFixturePool(options = {}) {
  const profile = fixtureProfile(options);
  const pool = new Pool({ connectionString: profile.connectionString, max: 12 });
  fixturePools.set(pool, profile.database);
  return pool;
}
export async function asFixtureUser(pool, claims, fn, options = {}) {
  const profile = fixtureProfile(options);
  if (typeof claims === 'string') claims = verifiedClaims(claims, options);
  if (!['anon', 'authenticated'].includes(claims.role)
    && !(claims.role === 'service_role' && profile.billingTestMode && claims.fixture === 'billing-test'
      && verifiedServiceClaims.has(claims)
      && fixturePools.get(pool) === BILLING_FIXTURE_DATABASE)) throw new Error('Unsupported fixture database role');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${claims.role}`);
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [claims.sub || '']);
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
const rpcNames = new Set(['consume_rate_limit','create_space','create_room_from_template','create_note_entry','save_note_snapshot','set_note_privacy','open_note','open_space','join_note','join_space','join_room_invitation','create_room_invitation','rotate_room_access','rotate_room_recovery_key','set_room_pairing','set_room_access','rotate_room_code','update_room_identity','recover_space_ownership','record_room_event','ensure_sender_account','get_sender_account','get_sender_dashboard','save_sender_template','update_room_settings','claim_legacy_space','get_room_upload_usage','cancel_upload_reservations']);
const billingRpcNames = new Set(['reserve_sender_checkout','release_sender_checkout','record_sender_checkout','process_billing_event']);
const serviceRpcNames = new Set(['record_sender_checkout','process_billing_event']);
const tables = new Set(['spaces','entries','notes','assets','space_members']);
const safeBillingMessages = new Set(['Verify your email','Checkout capacity is not ready','Sender account required',
  'Manage your existing subscription','Checkout is already being prepared','Pro pilot is full']);
function billingError(error) {
  // PostgreSQL details and JSON parse errors can include supplied payloads.
  const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : 'FIXTURE_ERROR';
  return { code, message: safeBillingMessages.has(error.message) ? error.message : 'Local billing fixture request rejected', details: null, hint: null };
}
function billingEndpoint(url) {
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1];
  if (rpc && (rpcNames.has(rpc) || billingRpcNames.has(rpc))) return `/rest/v1/rpc/${rpc}`;
  if (['/__fixture/health','/__fixture/reconnect','/auth/v1/signup','/auth/v1/user','/auth/v1/logout','/auth/v1/token',
    '/rest/v1/sender_entitlements'].includes(url.pathname)) return url.pathname;
  return '/unsupported';
}
const quote = identifier => { if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error('Unsupported identifier'); return `"${identifier}"`; };
async function bodyJson(request) {
  let body = '';
  for await (const chunk of request) { body += chunk; if (body.length > 4*1024*1024) throw new Error('Fixture request too large'); }
  return body ? JSON.parse(body) : {};
}
function reply(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(value === undefined ? '' : JSON.stringify(value)); }

export async function startFixtureTransport(options = {}) {
  const profile = fixtureProfile(options);
  const admin = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55439/postgres' });
  await admin.connect();
  try {
    // The fixed disposable database is the only database this fixture resets.
    await admin.query(`drop database if exists ${profile.database} with (force)`);
    await admin.query(`create database ${profile.database}`);
  } finally { await admin.end(); }
  const pool = createFixturePool(options);
  let functions;
  try {
    await pool.query(await readFile('supabase/tests/platform-bootstrap.sql', 'utf8'));
    for (const file of (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql')).sort()) {
      const sql = (await readFile(path.join('supabase/migrations', file), 'utf8')).replace(/create extension if not exists pg_net with schema extensions;/i, '-- Local pg_net fixture stub');
      try { await pool.query(sql); } catch (error) {
        if (profile.billingTestMode) throw new Error(`Local billing fixture migration failed: ${file}`);
        error.message = `${file}: ${error.message}`; throw error;
      }
    }
    functions = (await pool.query(`select p.proname,p.proargnames,oidvectortypes(p.proargtypes) types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows;
  } catch (error) {
    await pool.end();
    if (profile.billingTestMode) throw new Error('Local billing fixture database initialization failed');
    throw error;
  }
  const stats = { requests: 0, rpc: 0, rlsQueries: 0, unsupported: [], errors: [] };
  const server = createServer(async (request, response) => {
    stats.requests++;
    response.setHeader('Access-Control-Allow-Origin', 'http://localhost:3002');
    response.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,prefer,range,x-supabase-api-version');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') return reply(response, 204);
    const url = new URL(request.url, FIXTURE_API);
    try {
      if (url.pathname === '/__fixture/health') return reply(response, 200, { database: profile.database, stats });
      if (url.pathname === '/__fixture/reconnect' && request.method === 'POST') {
        for (const socket of ws.clients) socket.close(1012, 'Local fixture reconnect check');
        return reply(response, 200, { reconnected: true });
      }
      if (url.pathname === '/auth/v1/signup' && request.method === 'POST') {
        const input = await bodyJson(request);
        if (input.email || input.password) throw new Error('Fixture supports anonymous signup only');
        const row = (await pool.query('insert into auth.users(id,is_anonymous) values($1,true) returning *', [randomUUID()])).rows[0];
        return reply(response, 200, fixtureSession(row));
      }
      const claims = verifiedClaims(request.headers.authorization?.replace(/^Bearer\s+/i, '') || request.headers.apikey, options);
      if (claims.role === 'service_role') {
        const serviceRpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1];
        if (request.headers.origin || request.headers['sec-fetch-site'] || request.headers['sec-fetch-dest']
          || /^Mozilla\//i.test(request.headers['user-agent'] || '')
          || !((serviceRpcNames.has(serviceRpc) && request.method === 'POST')
            || (url.pathname === '/rest/v1/sender_entitlements' && request.method === 'GET'))) {
          throw new Error('Fixture service role is restricted to server billing operations');
        }
      }
      if (url.pathname === '/auth/v1/user') {
        if (claims.role !== 'authenticated') return reply(response, 401, { msg: 'Fixture user not found' });
        const row = (await pool.query('select * from auth.users where id=$1', [claims.sub])).rows[0];
        if (!row) return reply(response, 401, { msg: 'Fixture user not found' });
        return reply(response, 200, fixtureUser(row));
      }
      if (url.pathname === '/auth/v1/logout') return reply(response, 204);
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const input = await bodyJson(request);
        const row = (await pool.query('select * from auth.users where id=$1', [String(input.refresh_token).replace(/^fixture-/, '')])).rows[0];
        if (!row) throw new Error('Unknown fixture refresh token');
        return reply(response, 200, fixtureSession(row));
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').at(-1);
        if (!rpcNames.has(name) && !(profile.billingTestMode && billingRpcNames.has(name))) throw new Error(`Unsupported fixture RPC: ${name}`);
        if (profile.billingTestMode && billingRpcNames.has(name) && request.method !== 'POST') throw new Error('Billing fixture RPC requires POST');
        const input = request.method === 'GET' ? Object.fromEntries(url.searchParams) : await bodyJson(request);
        if (profile.billingTestMode && name === 'process_billing_event' && input.p_test_mode !== true) throw new Error('Billing fixture requires provider Test mode');
        const metadata = functions.find(fn => fn.proname === name && Object.keys(input).every(key => fn.proargnames?.includes(key)));
        if (!metadata) throw new Error(`Unknown RPC argument shape: ${name}`);
        const types = metadata.types.split(', ');
        const keys = Object.keys(input);
        const args = keys.map((key,index) => `${quote(key)} => $${index+1}::${types[metadata.proargnames.indexOf(key)]}`).join(',');
        stats.rpc++;
        const result = await asFixtureUser(pool, claims, async client => (await client.query(`select to_jsonb(public.${quote(name)}(${args})) result`, keys.map(key => input[key]))).rows[0]?.result, options);
        return reply(response, 200, result);
      }
      const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
      if (table && (tables.has(table) || (profile.billingTestMode && table === 'sender_entitlements'))) {
        if (table === 'sender_entitlements') {
          if (request.method !== 'GET') throw new Error('Fixture entitlements are read only');
          const filterKeys = [...url.searchParams.keys()].filter(key => !['select','order','limit','offset'].includes(key));
          const allowedFilters = claims.role === 'service_role' ? ['subscription_id','customer_id'] : ['user_id'];
          if (!filterKeys.length || filterKeys.some(key => !allowedFilters.includes(key))) throw new Error('Fixture entitlement identity filter required');
        }
        const input = ['POST','PATCH'].includes(request.method) ? await bodyJson(request) : {};
        const values = [];
        const filters = [];
        for (const [key,value] of url.searchParams) {
          if (['select','order','limit','offset'].includes(key)) continue;
          if (!value.startsWith('eq.')) throw new Error(`Unsupported fixture filter: ${value}`);
          values.push(value.slice(3)); filters.push(`${quote(key)} = $${values.length}`);
        }
        const where = filters.length ? ` where ${filters.join(' and ')}` : '';
        let sql;
        if (request.method === 'GET') {
          const select = url.searchParams.get('select') || '*';
          const columns = select === '*' ? '*' : select.split(',').map(column => quote(column.trim())).join(',');
          sql = `select ${columns} from public.${quote(table)}${where}`;
          if (url.searchParams.has('order')) sql += ' order by ' + url.searchParams.get('order').split(',').map(item => { const [column,direction] = item.split('.'); if (!['asc','desc'].includes(direction)) throw new Error('Unsupported order'); return `${quote(column)} ${direction}`; }).join(',');
          if (url.searchParams.has('limit')) { const limit = Number(url.searchParams.get('limit')); if (!Number.isInteger(limit) || limit < 0 || limit > 1000) throw new Error('Unsupported limit'); sql += ` limit ${limit}`; }
        } else if (request.method === 'POST') {
          const keys = Object.keys(input); values.push(...keys.map(key => input[key]));
          sql = `insert into public.${quote(table)}(${keys.map(quote).join(',')}) values(${keys.map((_,index) => `$${index+1}`).join(',')}) returning *`;
        } else if (request.method === 'PATCH') {
          const keys = Object.keys(input);
          const assignments = keys.map(key => { values.push(input[key]); return `${quote(key)}=$${values.length}`; });
          sql = `update public.${quote(table)} set ${assignments.join(',')}${where} returning *`;
        } else if (request.method === 'DELETE') sql = `delete from public.${quote(table)}${where} returning *`;
        else throw new Error('Unsupported fixture method');
        stats.rlsQueries++;
        const rows = await asFixtureUser(pool, claims, async client => (await client.query(sql,values)).rows, options);
        const single = request.headers.accept?.includes('application/vnd.pgrst.object+json');
        if (single && rows.length !== 1) return reply(response, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` });
        return reply(response, request.method === 'POST' ? 201 : 200, single ? rows[0] : rows);
      }
      stats.unsupported.push(`${request.method} ${profile.billingTestMode ? billingEndpoint(url) : url.pathname}`);
      reply(response, 501, { message: profile.billingTestMode ? 'Unsupported local billing fixture endpoint' : `Unsupported fixture endpoint: ${url.pathname}` });
    } catch (error) {
      const result = profile.billingTestMode ? billingError(error) : { code: error.code || 'FIXTURE_ERROR', message: error.message, details: error.detail || null, hint: null };
      stats.errors.push({ endpoint: profile.billingTestMode ? billingEndpoint(url) : url.pathname, message: result.message });
      reply(response, 400, result);
    }
  });
  // Minimal Phoenix acknowledgement only. No PostgreSQL-change delivery is faked.
  const ws = new WebSocketServer({ server });
  ws.on('connection', socket => socket.on('message', async raw => {
    try {
      const [joinRef,ref,topic,event,payload] = JSON.parse(raw.toString());
      let answer = {};
      if (event === 'phx_join') {
        const claims = verifiedClaims(payload.access_token, options);
        if (claims.role === 'service_role') throw new Error('Fixture service role cannot use realtime');
        const roomId = topic.match(/^realtime:space:(.+)$/)?.[1];
        if (roomId) {
          const visible = await asFixtureUser(pool,claims,async client => (await client.query('select id from public.spaces where id=$1',[roomId])).rowCount, options);
          if (!visible) throw new Error('Fixture realtime room access denied');
        }
        answer = { postgres_changes: (payload.config?.postgres_changes || []).map((change,index) => ({ ...change,id:index+1 })) };
      }
      socket.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{ status:'ok',response:answer }]));
      if (event === 'phx_join') socket.send(JSON.stringify([joinRef,null,topic,'presence_state',{}]));
    } catch { socket.close(1008,'Fixture channel denied'); }
  }));
  try {
    await new Promise((resolve,reject) => { server.once('error',reject); server.listen(55440,'127.0.0.1',resolve); });
  } catch (error) {
    ws.close();
    await pool.end();
    if (profile.billingTestMode) throw new Error('Local billing fixture loopback listener unavailable');
    throw error;
  }
  return { server,pool,stats,database: profile.database,close: async () => { for (const socket of ws.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); await pool.end(); } };
}
