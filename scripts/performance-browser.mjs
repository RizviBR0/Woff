import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.loadEnvFile('.env.local');
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const mobile = process.argv.includes('--mobile');
const throttled = process.argv.includes('--throttled');
const context = await browser.newContext({ acceptDownloads: true, viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
const page = await context.newPage();
if (throttled) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1024 * 1024 / 8, uploadThroughput: 1024 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}
await page.addInitScript(() => {
  window.__woffPerformance = { longTasks: 0, longestTaskMs: 0, peakJsHeapBytes: 0 };
  window.__woffSockets = [];
  const OriginalSocket = window.WebSocket;
  window.WebSocket = class extends OriginalSocket {
    constructor(...args) { super(...args); window.__woffSockets.push(this); }
  };
  new PerformanceObserver(list => { for (const entry of list.getEntries()) { window.__woffPerformance.longTasks++; window.__woffPerformance.longestTaskMs = Math.max(window.__woffPerformance.longestTaskMs, Math.round(entry.duration)); } }).observe({ type: 'longtask', buffered: true });
  setInterval(() => { window.__woffPerformance.peakJsHeapBytes = Math.max(window.__woffPerformance.peakJsHeapBytes, performance.memory?.usedJSHeapSize || 0); }, 250);
});
const base = process.env.PERFORMANCE_URL || 'http://localhost:3001';
const metrics = [];
const rooms = [];
const tempDirectory = mkdtempSync(join(tmpdir(), 'woff-performance-'));
const fixturePaths = [];
let requests = 0;
let errors = 0;
let storageTransfers = 0;
page.on('request', () => requests++);
page.on('request', request => { if (request.url().includes('/upload/resumable') && ['POST', 'PATCH'].includes(request.method())) storageTransfers++; });
page.on('pageerror', () => errors++);
const timed = async (operation, action) => {
  const start = performance.now(), count = requests;
  await action();
  const runtime = await page.evaluate(() => window.__woffPerformance);
  metrics.push({ operation, milliseconds: Math.round(performance.now() - start), requests: requests - count, runtime });
  console.log(JSON.stringify(metrics.at(-1)));
};
const saved = () => page.getByText('Saved in this space', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 30000 });
const closeMobileSidebar = async () => {
  if (!mobile) return;
  const close = page.getByRole('button', { name: 'Close sidebar', exact: true });
  if (await close.count()) await close.click();
};
const polling = async (check, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Database assertion timed out');
    await new Promise(resolve => setTimeout(resolve, 300));
  }
};
try {
  await page.goto(base);
  await timed('cold-room-create', async () => {
    await page.getByRole('button', { name: 'Start sharing', exact: true }).filter({ visible: true }).first().click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor({ timeout: 60000 });
  });
  const roomPath = new URL(page.url()).pathname;
  const { data: room, error: roomError } = await service.from('spaces').select('id').eq('slug', roomPath.slice(1)).single();
  assert.ifError(roomError);
  rooms.push(room.id);
  await closeMobileSidebar();
  assert.equal(await page.getByText('This is a temporary sharing space.', { exact: false }).count(), 0);
  await timed('note-create', async () => {
    await page.getByRole('button', { name: 'Create note', exact: true }).click();
    await page.locator('.tiptap').waitFor({ timeout: 60000 });
  });
  const notePath = new URL(page.url()).pathname;
  const slug = notePath.split('/').at(-1);
  const edit = page.locator('.tiptap');
  const rival = await context.newPage();
  await rival.goto(`${base}${notePath}`);
  await rival.locator('.tiptap').waitFor();
  await timed('note-save-including-debounce', async () => {
    await edit.fill('Performance fixture revision one');
    await polling(async () => (await service.from('notes').select('content_html').eq('slug', slug).single()).data?.content_html.includes('revision one'));
    await saved();
  });
  await rival.locator('.tiptap').fill('Conflicting fixture');
  await rival.getByText('Save failed', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 30000 });
  await rival.getByText('This note changed elsewhere. Reload before saving again.', { exact: true }).waitFor();
  assert.equal(await rival.evaluate(key => Boolean(localStorage.getItem(key)), `woff-note-draft:${slug}`), true);
  await rival.close();
  await context.setOffline(true);
  await edit.fill('Offline fixture survives reconnect');
  await polling(() => page.evaluate(key => localStorage.getItem(key)?.includes('Offline fixture survives reconnect'), `woff-note-draft:${slug}`));
  await context.setOffline(false);
  await saved();
  await page.reload();
  await page.locator('.tiptap').waitFor();
  assert.match(await page.locator('.tiptap').innerText(), /Offline fixture survives reconnect/);
  metrics.push({ operation: 'offline-and-conflict-checks', passed: true });
  // Hold an old acknowledgement while a newer edit is waiting to save.
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let observed;
  const started = new Promise(resolve => { observed = resolve; });
  let intercept = true;
  await page.route(`${base}${notePath}`, async route => {
    if (route.request().method() !== 'POST' || !intercept) return route.continue();
    intercept = false;
    const response = await route.fetch();
    observed();
    await held;
    await route.fulfill({ response });
  });
  await page.locator('.tiptap').fill('Old in-flight revision');
  await started;
  await page.locator('.tiptap').fill('Newest pending revision');
  await polling(() => page.evaluate(key => localStorage.getItem(key)?.includes('Newest pending revision'), `woff-note-draft:${slug}`));
  release();
  await polling(async () => (await service.from('notes').select('content_html').eq('slug', slug).single()).data?.content_html.includes('Newest pending revision'));
  await saved();
  await page.unroute(`${base}${notePath}`);
  metrics.push({ operation: 'in-flight-revision-check', passed: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
  await timed('note-three-image-upload', async () => {
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(Array.from({ length: 3 }, (_, index) => ({ name: `inline-${index}.png`, mimeType: 'image/png', buffer: png })));
    await polling(async () => (await page.locator('.tiptap img.note-image').count()) === 3);
    await saved();
  });
  const alt = await page.locator('.tiptap img.note-image').evaluateAll(images => images.map(image => image.alt));
  assert.deepEqual(alt, ['inline-0.png', 'inline-1.png', 'inline-2.png']);
  await page.getByRole('link', { name: 'Back to room', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  await closeMobileSidebar();
  let uploadReached;
  const uploadStarted = new Promise(resolve => { uploadReached = resolve; });
  let resumeCancelled;
  const cancelBarrier = new Promise(resolve => { resumeCancelled = resolve; });
  await page.route('**/storage/v1/upload/resumable', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    uploadReached();
    await cancelBarrier;
    await route.abort().catch(() => undefined);
  });
  await page.locator('input[type=file]:not([accept])').setInputFiles({ name: 'cancelled-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('cancel fixture') });
  await uploadStarted;
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  resumeCancelled();
  await page.getByText('Upload cancelled', { exact: true }).waitFor();
  await page.unroute('**/storage/v1/upload/resumable');
  assert.equal((await service.from('entries').select('meta').eq('space_id', room.id)).data.some(entry => entry.meta?.items?.some(item => item.name === 'cancelled-fixture.txt')), false);
  metrics.push({ operation: 'upload-cancellation-check', passed: true });
  const upload = async (count, bytes = 1024) => {
    const prefix = `fixture-${count}-${bytes}`;
    const files = Array.from({ length: count }, (_, index) => ({ name: `${prefix}-${index}.txt`, mimeType: 'text/plain', buffer: Buffer.alloc(bytes, 65) }));
    await timed(`upload-${count}-files-${bytes}-bytes`, async () => {
      let inputs = files;
      if (bytes >= 50 * 1024 * 1024) {
        inputs = files.map(file => { const path = join(tempDirectory, file.name); writeFileSync(path, file.buffer); fixturePaths.push(path); return path; });
      }
      await page.locator('input[type=file]:not([accept])').setInputFiles(inputs);
      await polling(async () => (await service.from('entries').select('meta').eq('space_id', room.id)).data?.some(entry => entry.meta?.items?.some(item => item.name === files.at(-1).name)), 180000);
      await page.getByRole('button', { name: `Download ${files.at(-1).name}`, exact: true }).waitFor({ timeout: 180000 });
    });
  };
  await upload(5);
  let failPublication = true;
  await page.route(`${base}${roomPath}`, async route => {
    if (failPublication && route.request().method() === 'POST' && route.request().postData()?.includes('"path"')) {
      failPublication = false;
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Fixture publication failure' });
    }
    return route.continue();
  });
  const retryName = 'fixture-retry.txt';
  await page.locator('input[type=file]:not([accept])').setInputFiles({ name: retryName, mimeType: 'text/plain', buffer: Buffer.from('retry fixture') });
  await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ timeout: 60000 });
  const beforeRetry = storageTransfers;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await polling(async () => (await service.from('entries').select('meta').eq('space_id', room.id)).data?.some(entry => entry.meta?.items?.some(item => item.name === retryName)));
  assert.equal(storageTransfers, beforeRetry);
  await page.unroute(`${base}${roomPath}`);
  metrics.push({ operation: 'publication-retry-without-retransfer', passed: true });
  await upload(20);
  await timed('twenty-file-zip', async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download all (.zip)', exact: true }).last().click();
    assert.equal(await (await download).failure(), null);
  });
  if (process.argv.includes('--large')) await upload(1, 50 * 1024 * 1024);
  const filename = 'বাংলা report.txt';
  await page.locator('input[type=file]:not([accept])').setInputFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from('unicode fixture') });
  await polling(async () => (await service.from('entries').select('meta').eq('space_id', room.id)).data?.some(entry => entry.meta?.items?.some(item => item.name === filename)));
  await page.getByRole('button', { name: `Download ${filename}`, exact: true }).waitFor({ timeout: 60000 });
  await timed('native-download-start', async () => {
    const started = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download ${filename}`, exact: true }).click();
    const download = await started;
    assert.equal(download.suggestedFilename(), filename);
    assert.equal(await download.failure(), null);
  });
  const { data: asset } = await service.from('assets').select('bucket_key, entry_id').in('entry_id', (await service.from('entries').select('id').eq('space_id', room.id)).data.map(entry => entry.id)).limit(1).single();
  const assetUrl = `${base}/api/files/${asset.bucket_key.split('/').map(encodeURIComponent).join('/')}`;
  const ranged = await context.request.get(assetUrl, { headers: { Range: 'bytes=0-3' } });
  assert.equal(ranged.status(), 206);
  assert.match(ranged.headers()['content-range'], /^bytes 0-3\//);
  const isolated = await browser.newContext();
  assert.equal((await isolated.request.get(assetUrl, { maxRedirects: 0 })).status(), 404);
  await isolated.close();
  await service.from('entries').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', asset.entry_id);
  assert.equal((await context.request.get(`${assetUrl}?download=test.txt`, { maxRedirects: 0 })).status(), 404);
  metrics.push({ operation: 'download-access-and-expiry-checks', passed: true });
  await polling(() => page.evaluate(() => window.__woffSockets.some(socket => socket.readyState === WebSocket.OPEN)));
  await context.setOffline(true);
  await page.evaluate(() => window.__woffSockets.forEach(socket => socket.close()));
  const { data: ownerRow } = await service.from('spaces').select('creator_device_id').eq('id', room.id).single();
  const { error: missedError } = await service.from('entries').insert({ space_id: room.id, kind: 'text', text: 'Reconnect fixture message', created_by_device_id: ownerRow.creator_device_id });
  assert.ifError(missedError);
  await context.setOffline(false);
  await page.getByText('Reconnect fixture message', { exact: true }).waitFor({ timeout: 60000 });
  metrics.push({ operation: 'reconnect-missed-message-check', passed: true });
  await page.goto(base);
  await timed('room-join', async () => {
    await page.getByRole('textbox', { name: 'Digit 1', exact: true }).fill(roomPath[1]);
    await page.getByRole('textbox', { name: 'Digit 2', exact: true }).fill(roomPath[2]);
    await page.getByRole('textbox', { name: 'Digit 3', exact: true }).fill(roomPath[3]);
    await page.getByRole('textbox', { name: 'Digit 4', exact: true }).fill(roomPath[4]);
    await page.getByRole('textbox', { name: 'Digit 4', exact: true }).press('Enter');
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor({ timeout: 60000 });
  });
  await service.from('spaces').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', room.id);
  await page.goto(base);
  await polling(async () => (await page.getByRole('textbox', { name: 'Digit 4', exact: true }).inputValue()) === roomPath[4]);
  await page.getByRole('textbox', { name: 'Digit 4', exact: true }).press('Enter');
  await page.getByText('Room not found or expired — please check the code', { exact: true }).waitFor({ timeout: 30000 });
  await polling(async () => (await page.getByRole('button', { name: 'Join Room', exact: true }).last().isEnabled()));
  await service.from('spaces').update({ expires_at: new Date(Date.now() + 3600000).toISOString() }).eq('id', room.id);
  await page.getByRole('textbox', { name: 'Digit 4', exact: true }).press('Enter');
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor({ timeout: 60000 });
  metrics.push({ operation: 'expired-room-feedback-and-retry-check', passed: true });
  assert.equal(errors, 0);
  const runtime = await page.evaluate(() => window.__woffPerformance);
  writeFileSync(`docs/performance-results${mobile ? '-mobile' : ''}${throttled ? '-throttled' : ''}.json`, JSON.stringify({ samples: 1, environment: `local production / Edge / ${mobile ? 'emulated mobile' : 'desktop'} / ${throttled ? '1 Mbps, 150ms latency, 4x CPU' : 'normal network'}`, metrics, runtime }, null, 2));
  console.log(JSON.stringify(metrics));
} finally {
  for (const id of rooms) {
    const { data: entries } = await service.from('entries').select('id').eq('space_id', id);
    if (entries?.length) {
      const { data: assets } = await service.from('assets').select('bucket_key').in('entry_id', entries.map(entry => entry.id));
      if (assets?.length) await service.storage.from('files').remove(assets.map(asset => asset.bucket_key));
    }
    await service.from('spaces').delete().eq('id', id);
  }
  await browser.close();
  fixturePaths.forEach(path => unlinkSync(path));
  rmdirSync(tempDirectory);
}
