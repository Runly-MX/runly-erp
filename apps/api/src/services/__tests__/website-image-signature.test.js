import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSvg } from '@runly/studio-interchange/svg';
import { PUBLISHABLE_IMAGE_MIME, imageSignatureMatches } from '../website-image-signature.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const svg = sanitizeSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>')).data;

test('release accepts the SVG mime and keeps the raster signatures', () => {
  assert.ok(PUBLISHABLE_IMAGE_MIME.test('image/svg+xml') && PUBLISHABLE_IMAGE_MIME.test('image/png') && !PUBLISHABLE_IMAGE_MIME.test('text/html'));
  assert.equal(imageSignatureMatches('image/png', png), true);
  assert.equal(imageSignatureMatches('image/png', svg), false);
  assert.equal(imageSignatureMatches('image/jpeg', png), false);
});

test('release only publishes canonical sanitized SVG', () => {
  assert.equal(imageSignatureMatches('image/svg+xml', svg), true);
  assert.equal(imageSignatureMatches('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" onload="x()"/>')), false);
  assert.equal(imageSignatureMatches('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"> <rect/></svg>')), false);
  assert.equal(imageSignatureMatches('image/svg+xml', png), false);
  assert.equal(imageSignatureMatches('image/x-icon', png), false);
});
