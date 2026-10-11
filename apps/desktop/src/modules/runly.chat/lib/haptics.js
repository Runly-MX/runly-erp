import { native } from "../../../native";

// A short tactile tick for gesture thresholds (swipe to reply / go back).
// Native haptics in the mobile app, the Vibration API on Android browsers,
// nothing elsewhere. Never throws.
export function hapticTick() {
  try {
    if (native.supports("haptics")) {
      native.haptics.impact("light").catch(() => {});
      return;
    }
    globalThis.navigator?.vibrate?.(8);
  } catch { /* no haptics available */ }
}
