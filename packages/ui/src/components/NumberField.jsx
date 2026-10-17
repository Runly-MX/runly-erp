// packages/ui/src/components/NumberField.jsx
//
// Numeric input with optional bounds. Re-exported from FormFieldsInput.jsx so
// every existing import path keeps working.
//
// min / max   bounds. On blur an out-of-range value is clamped to the nearest
//             bound, onChange receives { target: { value, name } } and a short
//             inline note explains the adjustment. Passed to the input too.
// allowNegative  default true; forced to false when min >= 0. Blocks typing
//             and pasting "-".
// allowDecimal   default true; when false, decimals are rounded on blur.
import { useEffect, useRef, useState, forwardRef } from "react";
import { Hash } from "lucide-react";
import { autoFieldIcon } from "../lib/field-icon-inference.js";
import { cn } from "../lib/utils.js";
import {
  adjustmentNote,
  normalizeNumber,
  resolveAllowNegative,
  sanitizePastedNumber,
} from "../lib/number-bounds.js";
import { fieldCls, InputIcon, FieldWrapper } from "./form-field-base.jsx";

const NOTE_MS = 4000;

// Native <input type="number"> silently lets the caret buffer hold "e", "+",
// "-" and other syntax valid only in scientific/signed notation — visually
// typeable even though a bad final string just resolves to an empty value.
// Block anything that isn't a digit, a single decimal point, or (when
// allowed) a single leading minus, so what you type is what you get.
function handleNumericKeyDown(e, { allowNegative, allowDecimal }) {
  const allowed = [
    "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
    "Tab", "Enter", "Home", "End",
  ];
  if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
  if (/^[0-9]$/.test(e.key)) return;
  const el = e.currentTarget;
  if (allowDecimal && e.key === ".") {
    if (el.value.includes(".")) e.preventDefault();
    return;
  }
  if (allowNegative && e.key === "-") {
    if (el.selectionStart !== 0 || el.value.includes("-")) e.preventDefault();
    return;
  }
  e.preventDefault();
}

export const NumberField = forwardRef(function NumberField(
  {
    label,
    error: externalError,
    hint,
    required,
    validate,
    onBlur,
    onChange,
    onKeyDown,
    onPaste,
    id,
    icon: iconProp,
    prefix,
    suffix,
    className,
    min,
    max,
    allowNegative: allowNegativeProp = true,
    allowDecimal = true,
    ...props
  },
  ref,
) {
  const icon = prefix ? iconProp : autoFieldIcon(iconProp, { label, name: props.name, id }, Hash);
  const allowNegative = resolveAllowNegative(allowNegativeProp, min);
  const [localError, setLocalError] = useState("");
  const [note, setNote] = useState("");
  const noteTimer = useRef(null);
  const error = externalError || localError;

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  function showNote(text) {
    clearTimeout(noteTimer.current);
    setNote(text);
    noteTimer.current = setTimeout(() => setNote(""), NOTE_MS);
  }

  function emit(input, value) {
    input.value = value;
    onChange?.({ target: { value, name: props.name } });
  }

  function handleBlur(e) {
    const fix = normalizeNumber(e.target.value, { min, max, allowDecimal });
    if (fix) {
      emit(e.target, String(fix.value));
      showNote(adjustmentNote(fix));
    }
    if (validate) setLocalError(validate(e.target.value) || "");
    onBlur?.(e);
  }

  function handleChange(e) {
    if (note) setNote("");
    onChange?.(e);
  }

  function handleKeyDown(e) {
    handleNumericKeyDown(e, { allowNegative, allowDecimal });
    onKeyDown?.(e);
  }

  function handlePaste(e) {
    const cleaned = sanitizePastedNumber(e.clipboardData?.getData("text"), { allowNegative });
    if (cleaned !== null) {
      e.preventDefault();
      if (cleaned) {
        emit(e.currentTarget, cleaned);
        showNote("Este campo no admite números negativos.");
      }
    }
    onPaste?.(e);
  }

  const hasLeft = icon || prefix;

  return (
    <FieldWrapper
      label={label}
      labelFor={id}
      error={error}
      hint={note || hint}
      required={required}
    >
      <div className="relative flex items-center">
        {icon && !prefix && <InputIcon icon={icon} />}
        {prefix && (
          <span className="absolute left-3.5 text-sm text-muted-foreground select-none pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type="number"
          inputMode={allowDecimal ? "decimal" : "numeric"}
          min={min}
          max={max}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={fieldCls(
            error,
            cn(
              hasLeft && "pl-9",
              suffix && "pr-9",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              className,
            ),
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3.5 text-sm text-muted-foreground select-none pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {note ? <span className="sr-only" role="status">{note}</span> : null}
    </FieldWrapper>
  );
});
