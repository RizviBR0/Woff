import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

process.loadEnvFile('.env.local');
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const base = process.env.PERFORMANCE_URL || 'http://localhost:3001';
let room;
const polling = async check => {
  const deadline = Date.now() + 30000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Note assertion timed out');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
};
const saved = () => page.getByText('Saved in this space', { exact: true }).filter({ visible: true }).first().waitFor();
try {
  await page.goto(base);
  await page.getByRole('button', { name: 'Start sharing', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  const roomPath = new URL(page.url()).pathname;
  const lookup = await service.from('spaces').select('id').eq('slug', roomPath.slice(1)).single();
  assert.ifError(lookup.error);
  room = lookup.data;
  await page.getByRole('button', { name: 'Create note', exact: true }).click();
  await page.locator('.tiptap').waitFor();
  const notePath = new URL(page.url()).pathname;
  const slug = notePath.split('/').at(-1);
  await page.getByRole('button', { name: 'Raw Markdown', exact: true }).click();
  const raw = page.getByPlaceholder('Start typing in Markdown format…');
  await raw.fill('# Merged Markdown\n\n**Initial text**');
  await saved();
  await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('Merged title');
  await saved();
  const getNote = async () => (await service.from('notes').select('title,content_html').eq('slug', slug).single()).data;
  assert.match((await getNote()).content_html, /<strong>Initial text<\/strong>/);
  assert.equal((await getNote()).title, 'Merged title');

  await context.setOffline(true);
  await raw.fill('# Offline Markdown\n\nDurable raw draft');
  await polling(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').rawContent?.includes('Durable raw draft'), `woff-note-draft:${slug}`));
  await context.setOffline(false);
  await saved();
  assert.match((await getNote()).content_html, /Durable raw draft/);

  let release, observed;
  const held = new Promise(resolve => { release = resolve; });
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
  await raw.fill('# Older Markdown');
  await started;
  await raw.fill('# Latest Markdown\n\nLatest **revision**');
  await polling(() => page.evaluate(key => localStorage.getItem(key)?.includes('Latest **revision**'), `woff-note-draft:${slug}`));
  release();
  await polling(async () => (await getNote()).content_html.includes('Latest <strong>revision</strong>'));
  await saved();
  await page.unroute(`${base}${notePath}`);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'Merged title.md');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.match(Buffer.concat(chunks).toString(), /Latest \*\*revision\*\*/);
  await page.getByRole('button', { name: 'Rich Text', exact: true }).click();
  await polling(async () => (await page.locator('.tiptap strong').innerText()) === 'revision');
  await saved();
  await page.getByRole('button', { name: 'Raw Markdown', exact: true }).click();
  await raw.fill('');
  await saved();
  assert.equal((await getNote()).content_html, '');
  await page.reload();
  await page.locator('.tiptap').waitFor();
  assert.equal((await page.locator('.tiptap').innerText()).trim(), '');

  await page.goto(`${base}${roomPath}`);
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  await page.locator('input[type=file]:not([accept])').setInputFiles({ name: 'merge-fixture.md', mimeType: 'text/markdown', buffer: Buffer.from('# Imported Markdown\n\nFile to **note**') });
  const open = page.getByRole('button', { name: 'Open merge-fixture.md in Rich Note', exact: true });
  await open.waitFor();
  await open.click();
  await page.locator('.tiptap').waitFor();
  assert.match(await page.locator('.tiptap').innerText(), /Imported Markdown/);
  assert.equal(await page.getByText('This is a temporary sharing space.', { exact: false }).count(), 0);
  console.log('PASS: Markdown autosave, title changes, offline draft, pending revisions, download, mode switching, empty content, file-to-note, removed warning');
} finally {
  await browser.close();
  if (room) {
    const { data: entries } = await service.from('entries').select('id').eq('space_id', room.id);
    if (entries?.length) {
      const { data: assets } = await service.from('assets').select('bucket_key').in('entry_id', entries.map(entry => entry.id));
      if (assets?.length) await service.storage.from('files').remove(assets.map(asset => asset.bucket_key));
    }
    await service.from('spaces').delete().eq('id', room.id);
  }
}
