import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildRecoveryMediaUrl,
  calculateThumbnailDimensions,
  clampSeekTime,
  computePosterBudget,
  formatVideoDuration,
  isSafePosterDataUrl,
  MAX_POSTER_CHARS_PER_VIDEO,
  MAX_TOTAL_POSTER_CHARS_PER_ENTRY,
  PLAYBACK_RATES,
  resolveDoubleTapZone,
  resolveUploadMimeType,
  sanitizeVideoDuration,
  stepPlaybackRate,
} from '../lib/video-utils.ts';
import { isVideoFile } from '../components/entries/entry-types.ts';

test('formatVideoDuration handles seconds, minutes, hours, and invalid inputs', () => {
  assert.equal(formatVideoDuration(0), '0:00');
  assert.equal(formatVideoDuration(5.9), '0:05');
  assert.equal(formatVideoDuration(65), '1:05');
  assert.equal(formatVideoDuration(3661), '1:01:01');
  assert.equal(formatVideoDuration(-1), '');
  assert.equal(formatVideoDuration(Number.NaN), '');
  assert.equal(formatVideoDuration(Number.POSITIVE_INFINITY), '');
  assert.equal(formatVideoDuration(undefined), '');
});

test('isSafePosterDataUrl accepts compact WebP/JPEG data URLs and blocks unsafe or oversized values', () => {
  const validWebp = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const validJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
  assert.equal(isSafePosterDataUrl(validWebp), true);
  assert.equal(isSafePosterDataUrl(validJpeg), true);

  // Reject unsafe schemes, SVGs, PNGs, and oversized payloads
  assert.equal(isSafePosterDataUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isSafePosterDataUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isSafePosterDataUrl('https://evil.example/poster.webp'), false);
  assert.equal(isSafePosterDataUrl('javascript:alert(1)'), false);
  assert.equal(isSafePosterDataUrl(''), false);
  assert.equal(isSafePosterDataUrl(null), false);

  const oversized = `data:image/webp;base64,${'A'.repeat(MAX_POSTER_CHARS_PER_VIDEO + 1)}`;
  assert.equal(isSafePosterDataUrl(oversized), false);
});

test('computePosterBudget scales multi-video batches well inside the 250 KB entry meta limit', () => {
  for (const count of [1, 2, 4, 8, 12, 20]) {
    const perVideo = computePosterBudget(count);
    assert.ok(perVideo >= 4_000 && perVideo <= 18_000);
    assert.ok(perVideo * count <= MAX_TOTAL_POSTER_CHARS_PER_ENTRY);
  }
  assert.equal(computePosterBudget(0), 18_000);
});

test('calculateThumbnailDimensions preserves aspect ratio without upscaling', () => {
  assert.deepEqual(calculateThumbnailDimensions(1920, 1080, 480), { width: 480, height: 270 });
  assert.deepEqual(calculateThumbnailDimensions(1080, 1920, 480), { width: 270, height: 480 });
  assert.deepEqual(calculateThumbnailDimensions(320, 180, 480), { width: 320, height: 180 });
  assert.deepEqual(calculateThumbnailDimensions(0, 0, 480), { width: 320, height: 180 });
});

test('resolveUploadMimeType infers canonical video MIME when OS leaves type blank or generic', () => {
  assert.equal(resolveUploadMimeType('iphone-clip.MOV', ''), 'video/quicktime');
  assert.equal(resolveUploadMimeType('demo.mp4', 'application/octet-stream'), 'video/mp4');
  assert.equal(resolveUploadMimeType('capture.m4v', ''), 'video/mp4');
  assert.equal(resolveUploadMimeType('clip.webm', ''), 'video/webm');
  assert.equal(resolveUploadMimeType('sample.ogv', ''), 'video/ogg');
  assert.equal(resolveUploadMimeType('clip.mkv', ''), 'video/x-matroska');
  assert.equal(resolveUploadMimeType('clip.mp4', 'video/mp4'), 'video/mp4');
  assert.equal(resolveUploadMimeType('notes.bin', ''), 'application/octet-stream');
});

test('playback seek clamping, double-tap zones, and speed stepping behave deterministically', () => {
  assert.equal(clampSeekTime(-10, 120), 0);
  assert.equal(clampSeekTime(150, 120), 120);
  assert.equal(clampSeekTime(45, 120), 45);
  assert.equal(clampSeekTime(Number.NaN, 120), 0);

  assert.equal(resolveDoubleTapZone(100, 1000), 'left');
  assert.equal(resolveDoubleTapZone(360, 1000), 'left');
  assert.equal(resolveDoubleTapZone(500, 1000), 'center');
  assert.equal(resolveDoubleTapZone(640, 1000), 'right');
  assert.equal(resolveDoubleTapZone(950, 1000), 'right');

  assert.equal(stepPlaybackRate(1, 1), 1.25);
  assert.equal(stepPlaybackRate(1, -1), 0.75);
  assert.equal(stepPlaybackRate(PLAYBACK_RATES[0], -1), PLAYBACK_RATES[0]);
  assert.equal(stepPlaybackRate(PLAYBACK_RATES.at(-1), 1), PLAYBACK_RATES.at(-1));
});

test('buildRecoveryMediaUrl busts redirect cache only for private /api/files/ paths', () => {
  assert.equal(
    buildRecoveryMediaUrl('/api/files/space-1/video.mp4', 1, 999),
    '/api/files/space-1/video.mp4?_r=1-999',
  );
  assert.equal(
    buildRecoveryMediaUrl('/api/files/space-1/video.mp4?foo=1', 2, 123),
    '/api/files/space-1/video.mp4?foo=1&_r=2-123',
  );
  assert.equal(
    buildRecoveryMediaUrl('blob:https://woff.space/abc', 1, 999),
    'blob:https://woff.space/abc',
  );
});

test('sanitizeVideoDuration bounds and rounds reported durations', () => {
  assert.equal(sanitizeVideoDuration(12.345), 12.3);
  assert.equal(sanitizeVideoDuration(0), undefined);
  assert.equal(sanitizeVideoDuration(-5), undefined);
  assert.equal(sanitizeVideoDuration(100_000), undefined);
  assert.equal(sanitizeVideoDuration('12'), undefined);
});

test('isVideoFile recognizes standard browser and mobile video formats', () => {
  for (const [type, name] of [
    ['video/mp4', 'demo.mp4'],
    ['video/quicktime', 'IMG_1234.MOV'],
    ['', 'screen-recording.webm'],
    ['application/octet-stream', 'clip.m4v'],
    ['', 'movie.mkv'],
    ['', 'clip.ogv'],
  ]) {
    assert.equal(isVideoFile(type, name), true, `Expected ${type}/${name} to be video`);
  }
  for (const [type, name] of [
    ['image/png', 'photo.png'],
    ['application/pdf', 'doc.pdf'],
    ['text/markdown', 'readme.md'],
  ]) {
    assert.equal(isVideoFile(type, name), false, `Expected ${type}/${name} not to be video`);
  }
});

test('file delivery route allows safe inline playback for browser video formats without weakening HTML/SVG blocking', () => {
  const routeSource = readFileSync(
    new URL('../app/api/files/[...path]/route.ts', import.meta.url),
    'utf8',
  );
  const match = routeSource.match(/const safeInline =\s*(\/\^[\s\S]*?\/i)\.test/);
  assert.ok(match, 'safeInline allowlist regex must exist');
  const safeInlineRe = new RegExp(match[1].slice(1, -2), 'i');

  for (const mime of [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/ogg',
    'video/x-m4v',
  ]) {
    assert.equal(safeInlineRe.test(mime), true, `Expected ${mime} to be inline-playable`);
  }
  for (const unsafe of [
    'text/html',
    'image/svg+xml',
    'application/javascript',
    'application/octet-stream',
  ]) {
    assert.equal(safeInlineRe.test(unsafe), false, `Expected ${unsafe} to remain attachment-only`);
  }
});
