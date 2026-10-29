// apps/desktop/src/modules/runly.chat/lib/messageActionLayout.js
//
// Pure positioning math for MessageActionSheet — extracted so the safe-area /
// shift / scroll logic is unit-testable (the repo has no React-component test
// runner). The component measures the DOM, calls this, and renders.

// Touch (WhatsApp-style): a pixel copy of the pressed bubble is lifted onto the
// dimmed overlay, the reaction pill sits right above it and the action card
// right below. Nothing ever overlaps the copy:
//   1. the copy stays where the real bubble is when the stack fits;
//   2. otherwise the whole group shifts vertically into the safe area;
//   3. when there still isn't room, the card gets a max height and scrolls
//      (never below `minCard`, so a few actions stay visible);
//   4. only a bubble taller than what remains is cropped (`cloneHeight`), and
//      the component clips it — the copy is never scaled.
export function computeSpotlightLayout({
  vw,
  vh,
  rect,                 // LIVE bubble rect { top, bottom, left, right }
  pillSize,             // { width, height }
  cardSize,             // { width, height } natural (unclamped) size of the action card
  isOwn = false,
  safeTop = 0,
  safeBottom = 0,
  gap = 8,
  margin = 8,
  minCard = 200,
}) {
  const mTop = margin + safeTop;
  const mBottom = margin + safeBottom;
  const safeH = Math.max(0, vh - mTop - mBottom);
  const clampX = (x, w) => Math.max(margin, Math.min(x, vw - w - margin));

  const r = rect ?? { top: vh / 2 - 40, bottom: vh / 2 + 40, left: margin, right: vw - margin };
  const bw = Math.max(1, r.right - r.left);
  const bh = Math.max(1, r.bottom - r.top);
  const pillH = pillSize.height;
  const cardNatural = cardSize.height;

  // Room shared by the bubble copy and the card once the pill and gaps are out.
  const room = Math.max(0, safeH - pillH - gap * 2);
  const cardFloor = Math.min(cardNatural, minCard, room);
  const cardH = Math.min(cardNatural, Math.max(cardFloor, room - bh));
  const cloneHeight = Math.min(bh, Math.max(0, room - cardH));
  const cropped = cloneHeight < bh;

  // Vertical: keep the copy over the real bubble, then shift the group so the
  // pill clears the top inset and the card clears the bottom one.
  const minTop = mTop + pillH + gap;
  const maxTop = vh - mBottom - cardH - gap - cloneHeight;
  const cloneTop = cropped ? minTop : Math.max(minTop, Math.min(r.top, maxTop));

  const cloneLeft = clampX(r.left, Math.min(bw, vw - margin * 2));
  const side = (w) => (isOwn ? clampX(r.right - w, w) : clampX(r.left, w));

  return {
    cloneLeft,
    cloneTop,
    cloneWidth: bw,
    cloneHeight,
    cropped,
    pillLeft: side(pillSize.width),
    pillTop: cloneTop - gap - pillH,
    cardLeft: side(cardSize.width),
    cardTop: cloneTop + cloneHeight + gap,
    cardMaxHeight: cardH,
  };
}

// One combined menu (reactions row + actions) anchored to a bubble rect or a
// cursor point. Prefers opening below the anchor, flips above when there is
// more room there, and otherwise clamps inside the safe area — the menu itself
// scrolls (maxHeight) instead of ever running off screen. Also returns the
// transform-origin so the entrance grows from the anchored edge.
export function computeAnchoredMenuLayout({
  vw,
  vh,
  rect,
  anchorPoint,
  size,                 // { width, height } natural size of the menu
  isOwn = false,
  safeTop = 0,
  safeBottom = 0,
  gap = 6,
  margin = 8,
}) {
  const mTop = margin + safeTop;
  const mBottom = margin + safeBottom;
  const maxHeight = Math.max(120, vh - mTop - mBottom);
  const w = size.width;
  const h = Math.min(size.height, maxHeight);
  const clampX = (x) => Math.max(margin, Math.min(x, vw - w - margin));

  if (!rect && anchorPoint) {
    const top = Math.max(mTop, Math.min(anchorPoint.y, vh - h - mBottom));
    return { left: clampX(anchorPoint.x), top, maxHeight, originY: "top" };
  }

  const r = rect ?? { top: vh / 2 - 40, bottom: vh / 2 + 40, left: margin, right: vw - margin };
  const left = clampX(isOwn ? r.right - w : r.left);
  const roomBelow = vh - mBottom - (r.bottom + gap);
  const roomAbove = r.top - gap - mTop;
  let top;
  let originY = "top";
  if (h <= roomBelow) {
    top = r.bottom + gap;
  } else if (h <= roomAbove) {
    top = r.top - gap - h;
    originY = "bottom";
  } else {
    // Neither side fits the whole menu (tall bubble): sit over the bubble,
    // clamped on screen — the menu scrolls internally.
    top = Math.max(mTop, Math.min(r.bottom - h, vh - mBottom - h));
  }
  return { left, top, maxHeight, originY };
}
