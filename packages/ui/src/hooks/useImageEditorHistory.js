import { useCallback, useRef, useState } from "react";

const LIMIT = 80;
const MERGE_MS = 700;

// Undo/redo over one immutable document. `update(patch, mergeKey?)` records a
// step; consecutive updates with the same mergeKey inside MERGE_MS (slider
// drags, repeated nudges of the same control) collapse into a single step.
export function useImageEditorHistory(initial) {
  const [state, setState] = useState({ past: [], doc: initial, future: [] });
  const lastRef = useRef({ key: null, at: 0 });

  const update = useCallback((patch, mergeKey = null) => {
    const now = Date.now();
    const merge = Boolean(mergeKey) && lastRef.current.key === mergeKey && now - lastRef.current.at < MERGE_MS;
    lastRef.current = { key: mergeKey, at: now };
    setState((s) => ({
      past: merge ? s.past : [...s.past, s.doc].slice(-LIMIT),
      doc: { ...s.doc, ...(typeof patch === "function" ? patch(s.doc) : patch) },
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    lastRef.current = { key: null, at: 0 };
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), doc: s.past[s.past.length - 1], future: [s.doc, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    lastRef.current = { key: null, at: 0 };
    setState((s) => (s.future.length ? { past: [...s.past, s.doc], doc: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  const reset = useCallback((doc) => {
    lastRef.current = { key: null, at: 0 };
    setState({ past: [], doc, future: [] });
  }, []);

  return { doc: state.doc, update, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
