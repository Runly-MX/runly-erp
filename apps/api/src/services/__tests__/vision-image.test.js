import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepareVisionImage } from '../vision-image.js';

test('native SVG decoder is at or above the corrected librsvg release', () => {
  const version = sharp.versions.rsvg;
  assert.equal(typeof version, 'string');
  const [major, minor, patch] = version.split('.').map(Number);
  assert.ok(major > 2 || (major === 2 && (minor > 63 || (minor === 63 && patch >= 2))),
    'The loaded native librsvg must include the upstream security fix');
});

test('vision preparation preserves small image dimensions and produces bounded JPEG output', async () => {
  const png = await sharp({ create: { width: 32, height: 16, channels: 3, background: '#2468ac' } }).png().toBuffer();
  const result = await prepareVisionImage(png);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 32); assert.equal(metadata.height, 16);
  assert.ok(result.length <= 3 * 1024 * 1024);
});

test('valid SVG and large raster inputs retain the vision resize contract', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#2468ac"/></svg>');
  const small = await sharp(await prepareVisionImage(svg)).metadata();
  assert.equal(small.format, 'jpeg'); assert.equal(small.width, 40); assert.equal(small.height, 20);
  const large = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#2468ac' } }).png().toBuffer();
  const resized = await sharp(await prepareVisionImage(large)).metadata();
  assert.equal(resized.width, 2000); assert.equal(resized.height, 667);
});

test('vision preparation rejects corrupt input', async () => {
  await assert.rejects(prepareVisionImage(Buffer.from('not an image')));
});
