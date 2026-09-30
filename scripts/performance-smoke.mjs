import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let fixtureId;

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext();
const page = await context.newPage();
const metrics = [];
let requests = 0;
page.on('request', () => requests++);
const base = process.env.PERFORMANCE_URL || 'http://localhost:3001';
try {
  await page.goto(base);
  const before = requests;
  const start = performance.now();
  await page.getByRole('button', { name: 'Start sharing', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor({ timeout: 60000 });
  const { data } = await service.from('spaces').select('id').eq('slug', new URL(page.url()).pathname.slice(1)).single();
  fixtureId = data?.id;
  metrics.push({ operation: 'cold-room-create', milliseconds: Math.round(performance.now() - start), requests: requests - before });
  const noteStart = performance.now();
  const noteRequests = requests;
  await page.getByRole('button', { name: 'Create note', exact: true }).click();
  await page.locator('.tiptap').waitFor({ timeout: 60000 });
  metrics.push({ operation: 'note-create', milliseconds: Math.round(performance.now() - noteStart), requests: requests - noteRequests });
  console.log(JSON.stringify(metrics));
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ samples: 1, metrics }, null, 2));
} finally {
  if (fixtureId) await service.from('spaces').delete().eq('id', fixtureId);
  await browser.close();
}
