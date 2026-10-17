import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function getDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const IDLE_GESTURE = {
  mode: null,
  startDistance: 0,
  startZoom: 1,
  startPan: { x: 0, y: 0 },
  startPoint: { x: 0, y: 0 },
};

// Image view state for AdvancedFileViewer: zoom/pan/rotate/flip, mouse and
// pen gestures (touch lives in useViewerTouchGestures), wheel zoom and the
// fit-to-container scale. Everything resets when `resetKey` (the file id)
// changes.
export function useViewerImageTransform({ resetKey }) {
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  // `zoom` is a multiplier over the computed fit scale (see fitScale below), so
  // zoom === 1 always means "fills the visible area" and the toolbar's 100%
  // reads true regardless of the file's natural pixel size.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [pinching, setPinching] = useState(false);
  const [naturalSize, setNaturalSize] = useState(null);   // { w, h } from <img onLoad>
  const [containerSize, setContainerSize] = useState(null); // { w, h } from ResizeObserver
  // Callback ref (state, not useRef): the wheel listener and ResizeObserver
  // bind whenever the image container actually mounts. With a plain ref read
  // inside a deps-keyed effect they sometimes missed the mount (the dialog
  // portal mounting a frame late, a remount with unchanged deps), leaving the
  // wheel zoom dead until another file was opened.
  const [containerEl, setContainerEl] = useState(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(IDLE_GESTURE);
  // Set when the touch double-tap handler fires, so the mouse dblclick
  // handler can ignore the synthetic dblclick some mobile browsers fire right
  // after two touchend events — that MouseEvent has no usable pointerType, so
  // it slips past the touch guard and would otherwise instantly undo the zoom.
  const suppressDblClickRef = useRef(0);

  useEffect(() => {
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    setPinching(false);
    setNaturalSize(null);
    pointersRef.current.clear();
    gestureRef.current = IDLE_GESTURE;
  }, [resetKey]);

  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  const nudgeZoom = useCallback((direction) => {
    setZoom((value) => clampZoom(Number((value + direction * ZOOM_STEP).toFixed(2))));
  }, []);

  useEffect(() => {
    if (!containerEl) return undefined;
    const measure = () => {
      const r = containerEl.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerEl);

    function handleWheel(event) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.deltaY) return;
      // Mouse wheels send ~100px notches, trackpads a stream of tiny deltas
      // (and pinch arrives as ctrl+wheel): scale by the delta instead of a
      // fixed step so neither jumps to the limits nor stalls.
      const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
      const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002));
      setZoom((value) => clampZoom(Number((value * factor).toFixed(3))));
    }
    containerEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      ro.disconnect();
      containerEl.removeEventListener("wheel", handleWheel);
    };
  }, [containerEl]);

  // Scale at which the image, at its natural size, exactly fills the visible
  // area (by whichever axis binds first). No cap: big images shrink, small
  // images grow. Accounts for the 90/270 rotation swap.
  const rotatedQuarter = Math.abs(rotation % 180) === 90;
  const fitScale = useMemo(() => {
    if (!naturalSize || !containerSize || !naturalSize.w || !naturalSize.h) return 1;
    const natW = rotatedQuarter ? naturalSize.h : naturalSize.w;
    const natH = rotatedQuarter ? naturalSize.w : naturalSize.h;
    const s = Math.min(containerSize.w / natW, containerSize.h / natH);
    return Number.isFinite(s) && s > 0 ? s : 1;
  }, [naturalSize, containerSize, rotatedQuarter]);

  const effectiveScale = fitScale * zoom;

  const clampPan = useCallback(
    (next) => {
      if (!naturalSize || !containerSize) return { x: 0, y: 0 };
      const natW = rotatedQuarter ? naturalSize.h : naturalSize.w;
      const natH = rotatedQuarter ? naturalSize.w : naturalSize.h;
      const maxX = Math.max(0, (natW * effectiveScale - containerSize.w) / 2);
      const maxY = Math.max(0, (natH * effectiveScale - containerSize.h) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [naturalSize, containerSize, effectiveScale, rotatedQuarter],
  );

  function onPointerDown(event) {
    if (event.pointerType === "touch") return;
    // Only the primary button pans. Capturing the pointer on a right-click
    // retargets the following contextmenu event to the container.
    if (event.button !== 0) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);

    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      gestureRef.current = {
        ...gestureRef.current,
        mode: "pinch",
        startDistance: getDistance(points[0], points[1]),
        startZoom: zoom,
      };
      setDragging(false);
      setPinching(true);
      return;
    }
    gestureRef.current = {
      ...gestureRef.current,
      mode: "pan",
      startPan: pan,
      startPoint: { x: event.clientX, y: event.clientY },
    };
    setDragging(true);
  }

  function onPointerMove(event) {
    if (event.pointerType === "touch" || !pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length >= 2 && gestureRef.current.startDistance > 0) {
      const ratio = getDistance(points[0], points[1]) / gestureRef.current.startDistance;
      setZoom(clampZoom(Number((gestureRef.current.startZoom * ratio).toFixed(2))));
      return;
    }
    if (gestureRef.current.mode !== "pan") return;
    setPan({
      x: gestureRef.current.startPan.x + event.clientX - gestureRef.current.startPoint.x,
      y: gestureRef.current.startPan.y + event.clientY - gestureRef.current.startPoint.y,
    });
  }

  function onPointerEnd(event) {
    if (event.pointerType === "touch") return;
    pointersRef.current.delete(event.pointerId);
    setDragging(false);
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = {
        ...gestureRef.current,
        mode: "pan",
        startPan: pan,
        startPoint: { x: points[0].x, y: points[0].y },
      };
      return;
    }
    if (points.length === 0) {
      setPinching(false);
      gestureRef.current = { ...gestureRef.current, mode: null, startDistance: 0 };
    }
  }

  function onDoubleClick(event) {
    if (event.pointerType === "touch") return;
    if (Date.now() - suppressDblClickRef.current < 500) return;
    event.preventDefault();
    const nextZoom = zoom > 1 ? 1 : 2;
    setZoom(nextZoom);
    if (nextZoom === 1) {
      setPan({ x: 0, y: 0 });
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - (rect.left + rect.width / 2);
    const offsetY = event.clientY - (rect.top + rect.height / 2);
    setPan(clampPan({ x: -offsetX * 0.6, y: -offsetY * 0.6 }));
  }

  function resetZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function resetTransforms() {
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    resetZoom();
  }

  const gestureActive = dragging || pinching;
  const transition = gestureActive ? "none" : "transform 120ms ease";

  return {
    rotation, setRotation, flipX, setFlipX, flipY, setFlipY,
    zoom, setZoom, pan, setPan, dragging, setDragging, setPinching,
    naturalSize, setNaturalSize, clampPan, gestureRef, suppressDblClickRef,
    gestureActive, nudgeZoom, resetZoom, resetTransforms,
    containerRef: setContainerEl,
    containerHandlers: {
      onDoubleClick,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerLeave: onPointerEnd,
    },
    // scale() is the fit-relative effective scale, so the image renders at its
    // natural box size and this brings it to "fills the visible area" at zoom 1.
    imageStyle: {
      transform: `rotate(${rotation}deg) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1}) scale(${effectiveScale})`,
      transformOrigin: "center",
      transition,
      width: naturalSize ? `${naturalSize.w}px` : undefined,
      height: naturalSize ? `${naturalSize.h}px` : undefined,
      maxWidth: "none",
      maxHeight: "none",
    },
    panStyle: { transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`, transition },
  };
}
