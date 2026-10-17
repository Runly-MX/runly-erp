// Pure rule behind FormSaveBar `dock`: the save pill floats at the bottom of
// the viewport while there are pending changes and the form's end is off
// screen; once the end is visible the bar is shown docked in its place.
export function saveBarFloating({ dirty = false, submitting = false, forceVisible = false, endVisible = false } = {}) {
  return (dirty || submitting || forceVisible) && !endVisible;
}
