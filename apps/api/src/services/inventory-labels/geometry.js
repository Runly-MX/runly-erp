// geometry.js — label geometry (pure, in @runly/core/labels) with the QR matrix
// from the `qrcode` package injected.
import { computeGeometry as coreGeometry } from '@runly/core/labels';
import { qrMatrix } from './qr-content.js';

export const computeGeometry = (layout, lines, content) => coreGeometry(layout, lines, content, { qrMatrix });
