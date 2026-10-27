import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  arrowHead, bounds, brushPasses, hitTest, isMeaningful, newAnnotationId, normalizeRect, textBackground, textBox, translateAnnotation,
} from "../lib/imageAnnotations.js";
import { AREA_SHAPES } from "../lib/imageErase.js";

function Shape({ a }) {
  const common = { fill: "none", stroke: a.color, strokeWidth: a.width, strokeLinecap: "round", strokeLinejoin: "round" };
  if (a.type === "pen") {
    const pts = a.points.map((p) => p.join(",")).join(" ");
    return (
      <g>
        {brushPasses(a).map((pass, i) => (
          <polyline key={i} points={pts} {...common} strokeWidth={a.width * pass.w} strokeOpacity={pass.o} strokeLinecap={pass.cap} />
        ))}
      </g>
    );
  }
  if (a.type === "rect") return <rect x={a.x} y={a.y} width={a.w} height={a.h} {...common} />;
  if (a.type === "ellipse") return <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={a.w / 2} ry={a.h / 2} {...common} />;
  if (a.type === "line") return <line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} {...common} />;
  if (a.type === "arrow") {
    const head = arrowHead(a.from, a.to, a.width).map((p) => p.join(",")).join(" ");
    return (
      <g stroke={a.color} fill={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round">
        <line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} />
        <polygon points={head} />
      </g>
    );
  }
  if (a.type === "text") {
    const box = a.bg ? textBox(a) : null;
    return (
      <g>
        {box ? <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={textBackground(a)} /> : null}
        <text x={a.x} y={a.y} fill={a.color} fontSize={a.size} fontWeight={a.bold ? 700 : 600} fontFamily="sans-serif" dominantBaseline="hanging">
          {a.text}
        </text>
      </g>
    );
  }
  return null; // "fx" strokes are painted into the photo canvas
}

// Dashed outline of the area being erased (rectangle, oval or lasso).
function EraseOutline({ a, unit }) {
  const first = a.points[0];
  const last = a.points[a.points.length - 1];
  const common = { fill: "none", strokeDasharray: `${unit * 6} ${unit * 4}`, pointerEvents: "none" };
  let node;
  if (a.shape === "lasso") node = (c) => <polygon points={a.points.map((q) => q.join(",")).join(" ")} {...c} />;
  else {
    const x = Math.min(first[0], last[0]);
    const y = Math.min(first[1], last[1]);
    const w = Math.abs(first[0] - last[0]);
    const h = Math.abs(first[1] - last[1]);
    node = a.shape === "rect"
      ? (c) => <rect x={x} y={y} width={w} height={h} {...c} />
      : (c) => <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...c} />;
  }
  return (
    <>
      {node({ ...common, stroke: "#000", strokeWidth: unit * 3, opacity: 0.5 })}
      {node({ ...common, stroke: "#fff", strokeWidth: unit * 1.5 })}
    </>
  );
}

// SVG layer over the editor stage. Always renders the vector annotations; when
// `tool` is set it also captures pointer input:
//   select | pen | line | arrow | rect | ellipse | text | dropper | fx
// `size` is the picture's pixel size (the SVG viewBox), so everything is in
// picture pixels. Retouch ("fx") strokes are reported through `onLiveFx` while
// drawing (the editor paints a live preview into the photo canvas) and added
// as elements on release.
//
//   unit        picture px per screen px at the current view zoom
//   viewScale   stage view zoom (sizes chosen in screen px are view-independent)
export function ImageAnnotationLayer({
  size, annotations, tool = null, brush = "pen", color, width, text = { bold: true, bg: false }, fx = null,
  selectedId = null, showSelection = false, unit = 1, viewScale = 1, multiRef = null, textPortal = null,
  onSelect, onAdd, onChange, onLiveFx, onPick,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [textAt, setTextAt] = useState(null);
  const [hover, setHover] = useState(null);

  const box = () => svgRef.current.getBoundingClientRect();
  const toPicture = (event) => {
    const b = box();
    return [((event.clientX - b.left) * size.w) / b.width, ((event.clientY - b.top) * size.h) / b.height];
  };
  // Picture px per screen px at view zoom 1: brush sizes picked in the panel stay constant on screen.
  const k = () => size.w / (box().width / viewScale);

  function handleDown(event) {
    if (!tool || textAt || multiRef?.current) return;
    const p = toPicture(event);
    const kk = k();
    if (tool === "dropper") {
      onPick?.(p);
      return;
    }
    if (tool === "select") {
      const id = hitTest(annotations, p, 14 * unit);
      onSelect?.(id);
      if (id) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { id, start: p, orig: annotations.find((a) => a.id === id) };
      }
      return;
    }
    if (tool === "text") {
      const b = box();
      setTextAt({ x: p[0], y: p[1], left: event.clientX - b.left, top: event.clientY - b.top, cx: event.clientX, cy: event.clientY, k: kk });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const base = { id: newAnnotationId(), color, width: width * kk };
    if (tool === "fx") {
      const erase = fx.mode === "erase";
      const shape = erase ? fx.shape : null;
      const stroke = {
        id: base.id, type: "fx", mode: fx.mode, size: shape && shape !== "brush" ? 0 : fx.size * kk, strength: fx.strength, points: [p],
        ...(erase ? { shape, tolerance: fx.tolerance, contiguous: fx.contiguous } : {}),
      };
      setDraft(stroke);
      if (shape !== "color") onLiveFx?.(stroke);
    } else if (tool === "pen") setDraft({ ...base, type: "pen", brush, points: [p] });
    else if (tool === "line" || tool === "arrow") setDraft({ ...base, type: tool, from: p, to: p });
    else if (tool === "rect" || tool === "ellipse") setDraft({ ...base, type: tool, origin: p, x: p[0], y: p[1], w: 0, h: 0 });
  }

  function handleMove(event) {
    if (tool === "fx" && event.pointerType === "mouse") setHover(toPicture(event));
    if (multiRef?.current) {
      if (draft) {
        setDraft(null);
        if (draft.type === "fx") onLiveFx?.(null);
      }
      dragRef.current = null;
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const p = toPicture(event);
      onChange?.(drag.id, translateAnnotation(drag.orig, p[0] - drag.start[0], p[1] - drag.start[1]), `move-${drag.id}`);
      return;
    }
    if (!draft) return;
    const p = toPicture(event);
    let next;
    if (draft.shape === "color") return;
    if (draft.shape === "rect" || draft.shape === "ellipse") next = { ...draft, points: [draft.points[0], p] };
    else if (draft.type === "pen" || draft.type === "fx") next = { ...draft, points: [...draft.points, p] };
    else if (draft.type === "line" || draft.type === "arrow") next = { ...draft, to: p };
    else next = { ...draft, ...normalizeRect(draft.origin, p) };
    setDraft(next);
    if (draft.type === "fx") onLiveFx?.(next);
  }

  function handleUp(event) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (!draft) return;
    const { origin: _origin, ...done } = draft;
    setDraft(null);
    // A tap with a retouch brush is a single dab.
    if (AREA_SHAPES.includes(done.shape)) {
      const xs = done.points.map((q) => q[0]);
      const ys = done.points.map((q) => q[1]);
      if (Math.max(...xs) - Math.min(...xs) < 4 * unit || Math.max(...ys) - Math.min(...ys) < 4 * unit) {
        onLiveFx?.(null);
        return;
      }
    }
    if (done.type === "fx" && done.points.length === 1) done.points = [done.points[0], [done.points[0][0] + 0.01, done.points[0][1]]];
    if (isMeaningful(done)) onAdd?.(done);
    else if (done.type === "fx") onLiveFx?.(null);
  }

  function handleDoubleClick(event) {
    if (tool !== "select") return;
    const p = toPicture(event);
    const a = annotations.find((x) => x.id === hitTest(annotations, p, 14 * unit));
    if (a?.type !== "text") return;
    const b = box();
    setTextAt({ x: a.x, y: a.y, left: event.clientX - b.left, top: event.clientY - b.top, cx: event.clientX, cy: event.clientY, k: k(), editId: a.id, value: a.text });
  }

  function commitText(value) {
    const at = textAt;
    setTextAt(null);
    if (!at) return;
    const content = value.trim();
    if (at.editId) {
      const current = annotations.find((a) => a.id === at.editId);
      if (current && content) onChange?.(at.editId, { ...current, text: content });
      return;
    }
    const annotation = { id: newAnnotationId(), type: "text", color, size: (12 + width * 2.5) * at.k, x: at.x, y: at.y, text: content, bold: text.bold, bg: text.bg };
    if (isMeaningful(annotation)) onAdd?.(annotation);
  }

  // The input lives outside the scaled picture layer when a portal target is given.
  const wrapInput = (node) => (textPortal ? createPortal(node, textPortal) : node);
  const selected = showSelection ? annotations.find((a) => a.id === selectedId) : null;
  const sel = selected ? bounds(selected) : null;
  const cursor = tool === "text" ? "text" : tool === "select" ? "default" : tool === "dropper" ? "copy" : "crosshair";
  const ringAt = draft?.type === "fx" ? draft.points[draft.points.length - 1] : null;

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.w} ${size.h}`}
        preserveAspectRatio="none"
        className={`absolute inset-0 h-full w-full ${tool ? "" : "pointer-events-none"}`}
        style={{ touchAction: "none", cursor }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={handleDoubleClick}
      >
        {annotations.map((a) => <Shape key={a.id} a={a} />)}
        {draft && draft.type !== "fx" ? <Shape a={draft} /> : null}
        {draft?.shape && AREA_SHAPES.includes(draft.shape) ? <EraseOutline a={draft} unit={unit} /> : null}
        {ringAt && draft.size > 0 ? <circle cx={ringAt[0]} cy={ringAt[1]} r={draft.size / 2} fill="none" stroke="#fff" strokeWidth={unit * 1.5} /> : null}
        {!draft && hover && tool === "fx" && (fx.mode !== "erase" || fx.shape === "brush") ? <circle cx={hover[0]} cy={hover[1]} r={(fx.size * k()) / 2} fill="none" stroke="#fff" strokeWidth={unit * 1.5} /> : null}
        {sel ? (
          <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="none" strokeWidth={unit * 2} strokeDasharray={`${unit * 6} ${unit * 4}`} style={{ stroke: "hsl(var(--primary))" }} pointerEvents="none" />
        ) : null}
      </svg>
      {textAt ? wrapInput(
        <input
          autoFocus
          type="text"
          defaultValue={textAt.value ?? ""}
          aria-label="Texto de la anotación"
          placeholder="Escribe y presiona Enter"
          className="absolute z-10 min-w-48 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm text-[hsl(var(--foreground))] shadow-lg outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          style={textPortal ? { position: "fixed", left: textAt.cx, top: textAt.cy } : { left: textAt.left, top: textAt.top }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitText(e.currentTarget.value);
            if (e.key === "Escape") setTextAt(null);
          }}
          onBlur={(e) => commitText(e.currentTarget.value)}
        />,
      ) : null}
    </>
  );
}
