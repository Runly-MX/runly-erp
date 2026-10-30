// jsPDF's built-in Helvetica only encodes WinAnsi (Latin-1 + the cp1252
// extras). A single character outside it (a narrow no-break space from
// toLocaleString, a non-breaking hyphen, an arrow or emoji the AI wrote, a
// decomposed accent from speech recognition) makes jsPDF fall back to a
// 16-bit encoding for the WHOLE string: every letter renders spaced apart and
// the text can no longer be selected or copied properly. Every string written
// to a transcript PDF goes through pdfSafeText first.

const CP1252_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const REPLACEMENTS = {
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", "　": " ",
  "​": "", "‌": "", "‍": "", "⁠": "", "﻿": "", "­": "",
  "‐": "-", "‑": "-", "‒": "-", "−": "-", "⁃": "-",
  "―": "—", "′": "'", "″": "\"", "‛": "'", "‟": "\"",
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~",
  "✓": "", "✔": "", "✅": "", "✗": "", "❌": "",
  "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "ı": "i",
  "●": "•", "▪": "•", "◦": "•", "‣": "•", "∙": "•", "·": "·",
};

function isWinAnsi(char) {
  const code = char.codePointAt(0);
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || char === "\n" || CP1252_EXTRAS.has(char);
}

export function pdfSafeText(value) {
  const text = String(value ?? "").normalize("NFC").replace(/\t/g, " ");
  let out = "";
  for (const char of text) {
    if (char in REPLACEMENTS) { out += REPLACEMENTS[char]; continue; }
    if (isWinAnsi(char)) { out += char; continue; }
    // Accented letters without a precomposed Latin-1 form: keep the base letter.
    const base = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (base && [...base].every(isWinAnsi)) out += base;
  }
  return out.replace(/ {2,}/g, " ");
}
