// Handwriting can commit a word and its trailing space before the next word.
// HTML restoration must preserve that boundary, including when seeding Y.js.
export const NOTE_HTML_PARSE_OPTIONS = { preserveWhitespace: 'full' }

export function noteTextInputAttributes(platform) {
  if (platform === 'android') {
    // Let the Android IME apply the user's natural-language writing settings.
    // Chromium forwards autocorrect/autocomplete hints to native EditorInfo.
    return {
      inputmode: 'text',
      spellcheck: 'true',
      autocorrect: 'on',
      autocomplete: 'on',
      autocapitalize: 'sentences',
    }
  }
  return { spellcheck: 'false', autocorrect: 'off', autocapitalize: 'sentences' }
}
