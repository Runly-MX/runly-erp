import { useEffect, useRef, useState } from "react";
import { advanceSpeakingFocus, SPEAKING_FOCUS_STABLE_MS } from "../lib/callLayout";

const TICK_MS = 300;

// The identity that has been the loudest remote speaker for a stable moment
// (debounced like useSpeakingOrder, so a cough doesn't steal the stage).
// The local participant is never chosen: you don't need to see yourself big.
export function useFocusedSpeaker(speakingIds, localIdentity) {
  const [focusedId, setFocusedId] = useState(null);
  const stateRef = useRef(null);
  const idsRef = useRef(speakingIds);
  idsRef.current = speakingIds;

  useEffect(() => {
    const tick = () => {
      const candidateId = [...idsRef.current].find((id) => id !== localIdentity) ?? null;
      const next = advanceSpeakingFocus(stateRef.current, { candidateId, now: Date.now(), stableMs: SPEAKING_FOCUS_STABLE_MS });
      stateRef.current = next;
      setFocusedId((current) => (current === next.focusedId ? current : next.focusedId));
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [localIdentity]);

  return focusedId;
}
