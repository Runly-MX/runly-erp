import { useEffect } from "react";
import { unlockCallSounds } from "./callSounds.js";
import { listenForCallSoundUnlock } from "./callSoundActivation.js";

export function useCallSoundUnlock() {
  useEffect(() => {
    return listenForCallSoundUnlock(document, unlockCallSounds);
  }, []);
}
