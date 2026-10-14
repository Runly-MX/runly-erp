// Shared `{{ }}` tag scanning for the document template engines (docx/xlsx).
//
// A tag is `{{name}}`, `{{#loop}}`, `{{/loop}}`, `{{^inverted}}` or
// `{{%image}}`. Tags inside a loop are reported as `<loop>.<name>` so a caller
// can validate them against the loop's field list.

export const TAG_PATTERN = /\{\{\s*([#/%^]?)\s*([^{}]*?)\s*\}\}/g;

export class TemplateError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'TemplateError';
    this.status = status;
  }
}

// Returns the unique tags found in `texts` (an array of strings scanned in
// document order), e.g. ['folio', '#items', 'items.model', '%receiverSignature'].
export function collectTags(texts) {
  const tags = new Set();
  const stack = [];
  for (const text of texts) {
    for (const match of String(text ?? '').matchAll(TAG_PATTERN)) {
      const [, prefix, rawName] = match;
      const name = rawName.trim();
      if (!name) continue;
      if (prefix === '#' || prefix === '^') {
        tags.add(`${prefix}${name}`);
        stack.push(name);
      } else if (prefix === '/') {
        if (stack[stack.length - 1] === name) stack.pop();
      } else {
        const scoped = stack.length ? `${stack[stack.length - 1]}.${name}` : name;
        tags.add(`${prefix}${scoped}`);
      }
    }
  }
  return [...tags];
}

// Resolves a dotted path (`company.name`) against a scope object.
export function resolvePath(scope, path) {
  if (path === '.') return scope;
  return String(path).split('.').reduce((value, key) => (value == null ? undefined : value[key]), scope);
}

export function toText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
