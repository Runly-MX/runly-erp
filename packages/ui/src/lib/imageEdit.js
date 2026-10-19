// Canvas helpers shared by image tools (avatar framing today; a future image
// editor for the file viewer / files module). Pure functions, no React.

const MAX_WORK_SIDE = 1800;

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

export const NO_ADJUST = Object.freeze({ brightness: 100, contrast: 100, saturation: 100 });

export function adjustFilter(adjust) {
  if (!adjust) return "";
  const { brightness = 100, contrast = 100, saturation = 100 } = adjust;
  if (brightness === 100 && contrast === 100 && saturation === 100) return "";
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
}

export function loadImageFromUrl(url) {
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("No se pudo cargar la imagen");
      return res.blob();
    })
    .then((blob) => loadImageFromFile(blob));
}

// Copies a rectangle (source pixels) of `source` into a new canvas.
export function cropRect(source, { x, y, w, h }) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  canvas.getContext("2d").drawImage(source, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Renders `img` into a new canvas after applying, in screen space:
// rotation (`quarterTurns` * 90 + `angle` degrees) and then optional mirroring.
// The canvas is the bounding box of the rotated picture (corners transparent
// when `angle` is not a multiple of 90) and is capped to MAX_WORK_SIDE.
// `adjust` ({ brightness, contrast, saturation }, 100 = unchanged) is baked in
// through ctx.filter (Chromium/WebView2, Firefox, Safari 18+).
export function renderTransformed(img, { quarterTurns = 0, angle = 0, flipX = false, flipY = false, adjust = null } = {}) {
  const scale = Math.min(1, MAX_WORK_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const rad = ((quarterTurns * 90 + angle) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * cos + h * sin));
  canvas.height = Math.max(1, Math.round(w * sin + h * cos));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  const filter = adjustFilter(adjust);
  if (filter) ctx.filter = filter;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return canvas;
}

// Copies a square region of `source` into a new `size` x `size` canvas.
export function cropSquare(source, { x, y, side }, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(source, x, y, side, side, 0, 0, size, size);
  return canvas;
}

export function canvasToFile(canvas, { name, type, quality = 0.92 }) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type })) : reject(new Error("No se pudo generar la imagen"))),
      type,
      quality,
    );
  });
}
