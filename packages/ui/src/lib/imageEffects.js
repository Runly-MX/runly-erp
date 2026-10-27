// Pixel effects behind the "artistic" and "effects" filters of the image
// editor (duotone, posterize, cartoon, pencil, oil, watercolor, mosaic,
// halftone, glitch, emboss, neon, thermal and grain). A filter preset names one
// as `effect: { id, ...params }`. The effect is computed on a copy and laid over
// the photo with `amount`, keeping the transparency of the picture.
//
// Sizes are relative to the picture (a 1800 px photo is about 1.8 units), so a
// look is the same on the thumbnail, the preview and the full-resolution export.

import { softBlur } from "./canvasColor.js";

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const clamp = (v, min = 0, max = 255) => (v < min ? min : v > max ? max : v);

const makeCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

function withPixels(canvas, fn) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  fn(image.data, canvas.width, canvas.height);
  ctx.putImageData(image, 0, 0);
}

function luma(d, n) {
  const out = new Float32Array(n);
  for (let p = 0; p < n; p++) out[p] = d[p * 4] * 0.299 + d[p * 4 + 1] * 0.587 + d[p * 4 + 2] * 0.114;
  return out;
}

// Sobel gradient of a luminance map: magnitude 0-1 (and its angle on request).
function sobel(lum, w, h, withAngle = false) {
  const mag = new Float32Array(w * h);
  const ang = withAngle ? new Float32Array(w * h) : null;
  const at = (x, y) => lum[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const i = y * w + x;
      mag[i] = Math.min(1, (Math.hypot(gx, gy) / 1020) * 3);
      if (ang) ang[i] = Math.atan2(gy, gx);
    }
  }
  return { mag, ang };
}

// Deterministic noise so a look never flickers between renders.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const posterizeData = (d, n, levels) => {
  const step = 255 / (levels - 1);
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) d[p * 4 + c] = Math.round(d[p * 4 + c] / step) * step;
};

const EFFECTS = {
  duotone(canvas, e) {
    const dark = hex(e.dark);
    const light = hex(e.light);
    withPixels(canvas, (d, w, h) => {
      for (let p = 0; p < w * h; p++) {
        const t = (d[p * 4] * 0.299 + d[p * 4 + 1] * 0.587 + d[p * 4 + 2] * 0.114) / 255;
        for (let c = 0; c < 3; c++) d[p * 4 + c] = dark[c] + (light[c] - dark[c]) * t;
      }
    });
  },

  posterize(canvas, e) {
    withPixels(canvas, (d, w, h) => posterizeData(d, w * h, e.levels ?? 5));
  },

  cartoon(canvas, e, s) {
    softBlur(canvas, 1.2 * s);
    withPixels(canvas, (d, w, h) => {
      const { mag } = sobel(luma(d, w * h), w, h);
      posterizeData(d, w * h, e.levels ?? 6);
      for (let p = 0; p < w * h; p++) {
        const line = 1 - clamp((mag[p] - 0.22) * 3, 0, 1) * 0.92;
        for (let c = 0; c < 3; c++) d[p * 4 + c] *= line;
      }
    });
  },

  pencil(canvas, e, s) {
    softBlur(canvas, 0.8 * s);
    withPixels(canvas, (d, w, h) => {
      const { mag } = sobel(luma(d, w * h), w, h);
      const gain = e.gain ?? 1.6;
      for (let p = 0; p < w * h; p++) {
        const v = 250 - clamp(mag[p] * gain, 0, 1) * 235;
        d[p * 4] = v;
        d[p * 4 + 1] = v * 0.985;
        d[p * 4 + 2] = v * 0.95;
      }
    });
  },

  oil(canvas, e, s) {
    const r = clamp(Math.round((e.radius ?? 1.4) * s), 2, 4);
    withPixels(canvas, (d, w, h) => {
      const src = new Uint8ClampedArray(d);
      const bins = 20;
      const count = new Uint16Array(bins);
      const sr = new Uint32Array(bins);
      const sg = new Uint32Array(bins);
      const sb = new Uint32Array(bins);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          count.fill(0); sr.fill(0); sg.fill(0); sb.fill(0);
          for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
            for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
              const i = (yy * w + xx) * 4;
              const b = Math.min(bins - 1, (((src[i] + src[i + 1] + src[i + 2]) / 3) * bins) / 256 | 0);
              count[b]++; sr[b] += src[i]; sg[b] += src[i + 1]; sb[b] += src[i + 2];
            }
          }
          let best = 0;
          for (let b = 1; b < bins; b++) if (count[b] > count[best]) best = b;
          const o = (y * w + x) * 4;
          d[o] = sr[best] / count[best]; d[o + 1] = sg[best] / count[best]; d[o + 2] = sb[best] / count[best];
        }
      }
    });
  },

  watercolor(canvas, e, s) {
    softBlur(canvas, 2.4 * s);
    withPixels(canvas, (d, w, h) => {
      posterizeData(d, w * h, e.levels ?? 9);
      for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) d[p * 4 + c] = d[p * 4 + c] * 0.88 + 30;
    });
  },

  mosaic(canvas, e, s) {
    const block = Math.max(3, Math.round((e.block ?? 18) * s));
    const small = makeCanvas(Math.ceil(canvas.width / block), Math.ceil(canvas.height / block));
    small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(small, 0, 0, small.width * block, small.height * block);
    ctx.restore();
    if (e.levels) withPixels(canvas, (d, w, h) => posterizeData(d, w * h, e.levels));
  },

  halftone(canvas, e, s) {
    const cell = Math.max(4, Math.round((e.cell ?? 11) * s));
    const small = makeCanvas(Math.ceil(canvas.width / cell), Math.ceil(canvas.height / cell));
    small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
    const colors = small.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, small.width, small.height).data;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = e.paper ?? "#fffaf0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let cy = 0; cy < small.height; cy++) {
      for (let cx = 0; cx < small.width; cx++) {
        const i = (cy * small.width + cx) * 4;
        const dark = 1 - (colors[i] * 0.299 + colors[i + 1] * 0.587 + colors[i + 2] * 0.114) / 255;
        const radius = Math.sqrt(clamp(dark, 0, 1)) * cell * 0.72;
        if (radius < 0.4) continue;
        ctx.fillStyle = e.mono ? "#111" : `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`;
        ctx.beginPath();
        ctx.arc((cx + 0.5) * cell, (cy + 0.5) * cell, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  glitch(canvas, e, s) {
    const shift = Math.max(2, Math.round((e.shift ?? 9) * s));
    withPixels(canvas, (d, w, h) => {
      const src = new Uint8ClampedArray(d);
      const rand = rng(7);
      const rowShift = new Int32Array(h);
      for (let b = 0; b < 9; b++) {
        const y0 = Math.floor(rand() * h);
        const len = Math.floor((0.01 + rand() * 0.05) * h);
        const off = Math.round((rand() - 0.5) * shift * 6);
        for (let y = y0; y < Math.min(h, y0 + len); y++) rowShift[y] = off;
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sx = clamp(x - rowShift[y], 0, w - 1);
          const o = (y * w + x) * 4;
          d[o] = src[(y * w + clamp(sx - shift, 0, w - 1)) * 4];
          d[o + 1] = src[(y * w + sx) * 4 + 1];
          d[o + 2] = src[(y * w + clamp(sx + shift, 0, w - 1)) * 4 + 2];
        }
      }
    });
  },

  emboss(canvas) {
    withPixels(canvas, (d, w, h) => {
      const lum = luma(d, w * h);
      const at = (x, y) => lum[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = clamp(128 + 2 * (at(x + 1, y + 1) - at(x - 1, y - 1)) + (at(x + 1, y) - at(x - 1, y)) + (at(x, y + 1) - at(x, y - 1)));
          const o = (y * w + x) * 4;
          d[o] = d[o + 1] = d[o + 2] = v;
        }
      }
    });
  },

  neon(canvas, e, s) {
    softBlur(canvas, 0.8 * s);
    withPixels(canvas, (d, w, h) => {
      const { mag, ang } = sobel(luma(d, w * h), w, h, true);
      const a = hex(e.a ?? "#00f0ff");
      const b = hex(e.b ?? "#ff2bd6");
      for (let p = 0; p < w * h; p++) {
        const edge = clamp((mag[p] - 0.08) * 2.4, 0, 1);
        const t = (Math.sin(ang[p]) + 1) / 2;
        for (let c = 0; c < 3; c++) d[p * 4 + c] = clamp(d[p * 4 + c] * 0.16 + edge * (a[c] + (b[c] - a[c]) * t));
      }
    });
  },

  thermal(canvas) {
    const stops = [[10, 10, 90], [120, 20, 160], [230, 40, 60], [255, 200, 40], [255, 255, 230]];
    withPixels(canvas, (d, w, h) => {
      for (let p = 0; p < w * h; p++) {
        const t = ((d[p * 4] * 0.299 + d[p * 4 + 1] * 0.587 + d[p * 4 + 2] * 0.114) / 255) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(t));
        const f = t - i;
        for (let c = 0; c < 3; c++) d[p * 4 + c] = stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f;
      }
    });
  },

  grain(canvas, e) {
    const amount = e.amount ?? 38;
    withPixels(canvas, (d, w, h) => {
      const rand = rng(11);
      for (let p = 0; p < w * h; p++) {
        const n = (rand() - 0.5) * amount;
        for (let c = 0; c < 3; c++) d[p * 4 + c] = clamp(d[p * 4 + c] + n);
      }
    });
  },
};

// Lays `effect` over the canvas at `amount` (0-100). Unknown ids do nothing.
export function applyEffect(canvas, effect, amount = 100) {
  const run = effect && EFFECTS[effect.id];
  if (!run || amount <= 0) return;
  const out = makeCanvas(canvas.width, canvas.height);
  out.getContext("2d").drawImage(canvas, 0, 0);
  run(out, effect, Math.max(0.3, Math.max(canvas.width, canvas.height) / 1000));
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = Math.min(1, amount / 100);
  ctx.drawImage(out, 0, 0);
  ctx.restore();
  out.width = 0;
  out.height = 0;
}
