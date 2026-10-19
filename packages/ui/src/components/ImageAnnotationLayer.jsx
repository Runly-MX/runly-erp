import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { arrowHead, isMeaningful, normalizeRect } from "../lib/imageAnnotations.js";

function Shape({ a }) {
  if (a.type === "pen") {
    return <polyline points={a.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (a.type === "rect") {
    return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinejoin="round" />;
  }
  if (a.type === "arrow") {
    const head = arrowHead(a.from, a.to, a.width).map((p) => p.join(",")).join(" ");
    return (
      <g stroke={a.color} fill={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round">
        <line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} />
        <polygon points={head} />
      </g>
    );
  }
  return (
    <text x={a.x} y={a.y} fill={a.color} fontSize={a.size} fontWeight={600} fontFamily="sans-serif" dominantBaseline="hanging">
      {a.text}
    </text>
  );
}

// SVG layer over the editor stage. Always renders the annotations; when
// `tool` is set it also captures pointer input to draw new ones. `size` is the
// picture's pixel size (the SVG viewBox), so everything is in picture pixels.
// `viewScale` is the stage zoom: stroke/text sizes are picture-relative, so they
// do not change with the view zoom. `multiRef` cancels drawing on multi-touch.
export function ImageAnnotationLayer({ size, annotations, tool = null, color, width, viewScale = 1, multiRef = null, textPortal = null, onAdd }) {
  const svgRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [textAt, setTextAt] = useState(null);

  function toPicture(event) {
    const box = svgRef.current.getBoundingClientRect();
    return [((event.clientX - box.left) * size.w) / box.width, ((event.clientY - box.top) * size.h) / box.height];
  }
  const scale = () => size.w / (svgRef.current.getBoundingClientRect().width / viewScale);

  function handleDown(event) {
    if (!tool || textAt || multiRef?.current) return;
    const p = toPicture(event);
    const k = scale();
    if (tool === "text") {
      const box = svgRef.current.getBoundingClientRect();
      setTextAt({ x: p[0], y: p[1], left: event.clientX - box.left, top: event.clientY - box.top, cx: event.clientX, cy: event.clientY, k });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const base = { color, width: width * k };
    if (tool === "pen") setDraft({ ...base, type: "pen", points: [p] });
    if (tool === "arrow") setDraft({ ...base, type: "arrow", from: p, to: p });
    if (tool === "rect") setDraft({ ...base, type: "rect", origin: p, x: p[0], y: p[1], w: 0, h: 0 });
  }

  function handleMove(event) {
    if (!draft) return;
    if (multiRef?.current) {
      setDraft(null);
      return;
    }
    const p = toPicture(event);
    if (draft.type === "pen") setDraft({ ...draft, points: [...draft.points, p] });
    else if (draft.type === "arrow") setDraft({ ...draft, to: p });
    else setDraft({ ...draft, ...normalizeRect(draft.origin, p) });
  }

  function handleUp(event) {
    if (!draft) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const { origin: _origin, ...done } = draft;
    if (isMeaningful(done)) onAdd(done);
    setDraft(null);
  }

  function commitText(value) {
    const at = textAt;
    setTextAt(null);
    if (!at) return;
    const annotation = { type: "text", color, size: (14 + width * 3) * at.k, x: at.x, y: at.y, text: value.trim() };
    if (isMeaningful(annotation)) onAdd(annotation);
  }

  // The input lives outside the scaled picture layer when a portal target is given.
  const wrapInput = (node) => (textPortal ? createPortal(node, textPortal) : node);

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.w} ${size.h}`}
        preserveAspectRatio="none"
        className={`absolute inset-0 h-full w-full ${tool ? "" : "pointer-events-none"}`}
        style={{ touchAction: "none", cursor: tool === "text" ? "text" : "crosshair" }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        {annotations.map((a, i) => <Shape key={i} a={a} />)}
        {draft ? <Shape a={draft} /> : null}
      </svg>
      {textAt ? wrapInput(
        <input
          autoFocus
          type="text"
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
