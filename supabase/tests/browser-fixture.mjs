// Run from E:\Woff: node supabase/tests/browser-fixture.mjs
// No environment file is loaded. Next runs from an isolated source snapshot.
import { cp, mkdir, stat, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { startFixtureTransport, FIXTURE_API, FIXTURE_ANON_KEY } from './browser-fixture-transport.mjs';

const root = path.resolve('.');
const app = path.join(root,'internal/browser-app');
await mkdir(app,{recursive:true});
for (const name of ['app','components','lib','public','middleware.ts','package.json','next.config.js','postcss.config.js','tailwind.config.js','tsconfig.json','next-env.d.ts']) {
  await cp(path.join(root,name),path.join(app,name),{recursive:true});
}
try { await stat(path.join(app,'node_modules')); } catch { await symlink(path.join(root,'node_modules'),path.join(app,'node_modules'),'junction'); }
const fixture = await startFixtureTransport();
const env = { ...process.env, TZ:'UTC', NODE_ENV:'development', WOFF_TEST_FIXTURE:'true', NEXT_PUBLIC_SUPABASE_URL:FIXTURE_API, NEXT_PUBLIC_SUPABASE_ANON_KEY:FIXTURE_ANON_KEY, NEXT_PUBLIC_SITE_URL:'http://localhost:3002', SUPABASE_SERVICE_ROLE_KEY:'', WOFF_ACCOUNTS_ENABLED:'true', WOFF_EMAIL_DELIVERY_VERIFIED:'false', WOFF_STORAGE_CAPACITY_VERIFIED:'false', WOFF_BILLING_ENABLED:'false', LEMON_SQUEEZY_API_KEY:'', LEMON_SQUEEZY_STORE_ID:'', LEMON_SQUEEZY_VARIANT_ID:'', LEMON_SQUEEZY_WEBHOOK_SECRET:'' };
const next = spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','-p','3002','-H','127.0.0.1'],{cwd:app,env,stdio:'inherit',windowsHide:true});
console.log(`LOCAL ONLY: ${FIXTURE_API} -> woff_browser_fixture; app http://localhost:3002; snapshot ${app}`);
let stopping = false;
async function stop() { if (stopping) return; stopping=true; next.kill(); await fixture.close(); }
process.on('SIGINT',() => void stop().finally(() => process.exit(0)));
process.on('SIGTERM',() => void stop().finally(() => process.exit(0)));
next.on('exit',() => void stop().finally(() => process.exit(0)));
