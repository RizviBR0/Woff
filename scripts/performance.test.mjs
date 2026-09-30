import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { addArchiveFiles, generateArchive } from '../lib/archive.ts';
import { downloadFileFromUrl } from '../lib/download.ts';

test('ZIP queue bounds concurrency, keeps duplicate filenames and reports all completions', async () => {
  const original = globalThis.fetch;
  let active = 0, peak = 0;
  const reports = [];
  globalThis.fetch = async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return new Response('file');
  };
  try {
    const zip = new JSZip();
    await addArchiveFiles(zip, Array.from({ length: 20 }, () => ({ url: 'https://fixture.invalid', name: 'report.pdf' })), { onProgress: (done, total) => reports.push([done, total]) });
    assert.equal(peak, 3);
    assert.equal(Object.keys(zip.files).length, 20);
    assert.deepEqual(reports.at(-1), [20, 20]);
    const loaded = await JSZip.loadAsync(await (await generateArchive(zip)).arrayBuffer());
    assert.equal(Object.keys(loaded.files).length, 20);
  } finally { globalThis.fetch = original; }
});

test('ZIP queue rejects HTTP errors and never presents them as files', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('missing', { status: 404 });
  try {
    const zip = new JSZip();
    await assert.rejects(addArchiveFiles(zip, [{ url: 'https://fixture.invalid', name: 'missing.txt' }]), /unavailable/);
    assert.equal(Object.keys(zip.files).length, 0);
  } finally { globalThis.fetch = original; }
});

test('cancelled archives do not fetch or generate a download', async () => {
  const controller = new AbortController();
  controller.abort();
  const zip = new JSZip();
  await assert.rejects(addArchiveFiles(zip, [{ url: 'https://fixture.invalid', name: 'x' }], { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(generateArchive(zip, { signal: controller.signal }), { name: 'AbortError' });
});

test('individual private downloads dispatch an attachment URL without buffering bytes', async () => {
  const original = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
  const anchor = { click() {}, remove() {} };
  globalThis.window = { location: { href: 'https://woff.test/1234', origin: 'https://woff.test' } };
  globalThis.document = { createElement: () => anchor, body: { appendChild() {} } };
  globalThis.fetch = () => { throw new Error('Native download must not fetch a Blob'); };
  try {
    await downloadFileFromUrl('/api/files/space/object', 'বাংলা report.pdf');
    assert.equal(new URL(anchor.href).searchParams.get('download'), 'বাংলা report.pdf');
  } finally { Object.assign(globalThis, original); }
});
