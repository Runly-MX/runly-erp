// apps/desktop/src/modules/runly.chat/lib/messageActionLayout.js
//
// Pure positioning math for MessageActionSheet — extracted so the safe-area /
// scale / flip logic is unit-testable (the repo has no React-component test
// runner). The component measures the DOM, calls this, and renders.
//
// Touch (WhatsApp-style): a pixel copy of the pressed bubble is lifted onto an
// overlay, the pill sits above it and the action card below. When that stack
// (pill + bubble + card) is taller than the space between the safe insets the
// bubble copy is scaled down uniformly — never clipped, never overlapping the
// dimmed original — and the whole group is nudged vertically to land inside the
// safe area. Mouse: a bare menu anchored at the cursor, no spotlight, no scale.
export function computeActionSheetLayout({
  vw,
  vh,
  rect,                 // LIVE bubble/attachment rect { top, bottom, left, right }, measured at open
  anchorPoint,          // { x, y } cursor point for mouse, else null
  pillSize,             // { width, height }
  panelSize,            // { width, height }
  coarse,               // touch?
  isOwn,                // hug the bubble's right edge on touch
  safeTop = 0,
  safeBottom = 0,
  gap = 8,
  margin = 8,
  minScale = 0.55,
}) {
  const mTop = margin + safeTop;
  const mBottom = margin + safeBottom;
  const pw = panelSize.width;
  const ph = panelSize.height;
  const pillW = pillSize.width;
  const pillH = pillSize.height;
  const clampX = (x, w) => Math.max(margin, Math.min(x, vw - w - margin));

  // --- MOUSE: anchor a bare menu at the cursor. No spotlight, no scale, no shift.
  if (!coarse && anchorPoint) {
    const panelLeft = clampX(anchorPoint.x, pw);
    const panelTop = Math.max(mTop, Math.min(anchorPoint.y, vh - ph - mBottom));
    return {
      mode: "menu",
      scale: 1,
      cloneLeft: 0, cloneTop: 0, cloneWidth: 0, cloneHeight: 0,
      panelLeft,
      panelTop,
      pillLeft: panelLeft,
      pillTop: Math.max(mTop, panelTop - gap - pillH),
      sRect: rect
        ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
        : { top: anchorPoint.y, bottom: anchorPoint.y, left: anchorPoint.x, right: anchorPoint.x },
    };
  }

  // --- TOUCH: lift + spotlight the pressed bubble.
  const r = rect ?? { top: vh / 2 - 40, bottom: vh / 2 + 40, left: margin, right: vw - margin };
  const bw = Math.max(1, r.right - r.left);   // pre-scale width  (the copy renders at this width, then scale())
  const bh = Math.max(1, r.bottom - r.top);   // pre-scale height

  const safeH = vh - mTop - mBottom;

  // Scale the bubble copy down only as far as needed for pill + bubble + card to
  // fit vertically, and never past `minScale` (below that it's unreadable — the
  // card is allowed to run long instead).
  const roomForBubble = safeH - pillH - ph - gap * 2;
  let scale = 1;
  if (roomForBubble > 0 && bh > roomForBubble) scale = roomForBubble / bh;
  const maxW = vw - margin * 2;
  if (bw * scale > maxW) scale = maxW / bw;
  scale = Math.max(minScale, Math.min(1, scale));

  const cw = bw * scale;                       // on-screen size of the lifted copy
  const ch = bh * scale;

  // Horizontal: keep the copy on the sender's own side; only pull it in when
  // scaling shrank it off that edge or it would cross a screen margin.
  const cloneLeft = isOwn ? clampX(r.right - cw, cw) : clampX(r.left, cw);

  // Vertical: prefer leaving the copy exactly where the real bubble is, then
  // clamp so the pill clears the top inset and the card clears the bottom one.
  const stackH = pillH + gap + ch + gap + ph;
  // Even at minScale the full pill+bubble+card stack can't fit the safe area
  // (a very tall image/attachment message) — no vertical position avoids the
  // card overlapping the bubble in that case, so it's detached entirely and
  // pinned to a screen corner instead of tracking the bubble's position.
  const sideOverflow = stackH > safeH;
  let cloneTop;
  if (!sideOverflow) {
    const minTop = mTop + pillH + gap;
    const maxTop = vh - mBottom - ph - gap - ch;
    cloneTop = Math.max(minTop, Math.min(r.top, maxTop));
  } else {
    cloneTop = Math.max(mTop + pillH + gap, Math.round((vh - ch) / 2));
  }

  const alignRight = Boolean(isOwn);

  let pillLeft, panelLeft, panelTop, pillTop;
  if (sideOverflow) {
    // Pin pill + card to the same edge the bubble hugs — own (right-aligned)
    // messages open their menu on the right, received (left-aligned) ones on
    // the left — near the top of the safe area, well clear of the (still
    // centered, possibly full-height) bubble copy below.
    pillLeft = alignRight ? clampX(vw - margin - pillW, pillW) : clampX(margin, pillW);
    panelLeft = alignRight ? clampX(vw - margin - pw, pw) : clampX(margin, pw);
    pillTop = mTop;
    panelTop = mTop + pillH + gap;
  } else {
    pillLeft = alignRight ? clampX(cloneLeft + cw - pillW, pillW) : clampX(cloneLeft, pillW);
    panelLeft = alignRight ? clampX(cloneLeft + cw - pw, pw) : clampX(cloneLeft, pw);
    const belowTop = cloneTop + ch + gap;
    const flip = belowTop + ph > vh - mBottom;
    panelTop = flip
      ? Math.max(mTop + pillH + gap, cloneTop - gap - ph)
      : belowTop;
    pillTop = Math.max(mTop, cloneTop - gap - pillH);
  }

  return {
    mode: "spotlight",
    scale,
    cloneLeft,
    cloneTop,
    cloneWidth: bw,      // component sets width:bw and transform:scale(scale), origin top-left
    cloneHeight: bh,
    // Where the real bubble actually sits — the lifted copy animates FROM here
    // TO (cloneLeft, cloneTop) so it reads as the message itself rising, not a
    // separate card sliding in.
    originLeft: r.left,
    originTop: r.top,
    panelLeft,
    panelTop,
    pillLeft,
    pillTop,
    sRect: { top: cloneTop, bottom: cloneTop + ch, left: cloneLeft, right: cloneLeft + cw },
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
  // cloneLeft/Top/Width: where the lifted bubble copy sits — exactly over the
  // real bubble (only used when keepClear / a copy is mounted).
  return { left, top, maxHeight, originY, cloneLeft: r.left, cloneTop: r.top, cloneWidth: r.right - r.left };
}
