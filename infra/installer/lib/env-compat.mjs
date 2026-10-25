import fs from 'node:fs/promises';

// Normalize each configuration source before merging it. This lets an explicit
// process override beat a stored value even when they use different brand names.
export function withRunlyEnvAliases(...sources) {
  const result = {};
  for (const source of sources) {
    Object.assign(result, source);
    for (const key of Object.keys(source ?? {})) {
      if (!/^(VITE_)?(ATLAS|RUNLY)_/.test(key)) continue;
      const current = key.replace(/^(VITE_)?ATLAS_/, '$1RUNLY_');
      const legacy = current.replace(/^(VITE_)?RUNLY_/, '$1ATLAS_');
      const value = source[current] ?? source[legacy];
      if (value === undefined) continue;
      result[current] = value;
      result[legacy] = value;
    }
  }
  return result;
}

// Keep the raw quoting/value of existing configuration, changing only the key.
// If both spellings exist, the canonical assignment is authoritative.
export function canonicalizeRunlyEnvText(text) {
  const currentKeys = new Set([...text.matchAll(/^(?:VITE_)?RUNLY_[A-Z0-9_]+(?==)/gm)].map(match => match[0]));
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^((?:VITE_)?ATLAS_[A-Z0-9_]+)=/);
    if (!match) return [line];
    const current = match[1].replace(/^(VITE_)?ATLAS_/, '$1RUNLY_');
    return currentKeys.has(current) ? [] : [current + line.slice(match[1].length)];
  }).join('\n');
}

// Refresh generated defaults without dropping existing Runly/Atlas settings.
// Preserve raw stored values (including quotes); process overrides are explicit.
export function mergeRunlyEnvText(generated, stored, environment = {}) {
  const assignments = new Map();
  for (const text of [generated, stored]) {
    for (const line of canonicalizeRunlyEnvText(text).split(/\r?\n/)) {
      const match = line.match(/^((?:VITE_)?RUNLY_[A-Z0-9_]+)=/);
      if (match) assignments.set(match[1], line);
    }
  }
  const overrides = withRunlyEnvAliases(environment);
  for (const key of assignments.keys()) {
    if (overrides[key] !== undefined) assignments.set(key, `${key}=${JSON.stringify(String(overrides[key]))}`);
  }
  const output = canonicalizeRunlyEnvText(generated).split(/\r?\n/).flatMap(line => {
    const match = line.match(/^((?:VITE_)?RUNLY_[A-Z0-9_]+)=/);
    if (!match) return [line];
    const assignment = assignments.get(match[1]);
    assignments.delete(match[1]);
    return assignment ? [assignment] : [];
  });
  return [...output, ...assignments.values(), ''].join('\n');
}

// Read assignments without evaluating values. Consume quoted multiline values
// so an apparent KEY= inside a secret is never mistaken for an assignment.
export function envAssignments(text) {
  const expression = /^[\t \uFEFF]*(?:export[\t ]+)?([A-Za-z_][A-Za-z0-9_]*)[\t ]*=[\t ]*(?:'[^']*'|"(?:\\[\s\S]|[^"\\])*"|`[^`]*`|[^\r\n]*)[^\r\n]*/gm;
  return [...text.matchAll(expression)].map(match => ({ key: match[1], raw: match[0], start: match.index, end: match.index + match[0].length }));
}

// Template values copied when a key is missing. Only non-secret, host-agnostic
// defaults that are correct for every installer deployment belong here.
export const SAFE_TEMPLATE_DEFAULTS = new Set([
  // The API sits behind the web container/host proxy on the Docker network.
  'RUNLY_MCP_TRUSTED_PROXIES',
  // Same proxy trust for the client IP of incoming automation webhooks.
  'RUNLY_TRUSTED_PROXIES',
]);

// Add only missing declarations, preserving every existing byte, including
// explicit empty values, quoting, comments and line endings. New template keys
// default to blank: example credentials/hosts must not become deployment values,
// except the SAFE_TEMPLATE_DEFAULTS allowlist, which keeps the template value.
export function appendMissingEnvText(stored, template) {
  const present = new Set(envAssignments(stored).map(entry => entry.key));
  const addedKeys = [], lines = [];
  for (const entry of envAssignments(template)) {
    if (present.has(entry.key)) continue;
    present.add(entry.key);
    addedKeys.push(entry.key);
    lines.push(SAFE_TEMPLATE_DEFAULTS.has(entry.key) ? entry.raw.trim() : `${entry.key}=`);
  }
  if (!lines.length) return { text: stored, addedKeys };
  const eol = stored.includes('\r\n') ? '\r\n' : '\n';
  return { text: stored + (stored && !stored.endsWith('\n') ? eol : '') + lines.join(eol) + eol, addedKeys };
}

// The existing generators own their usual keys. Retain unknown custom settings
// and exact MCP assignments even when a shell override or canonicalizing merge
// would otherwise replace them. This also keeps newly synchronized template keys
// through subsequent regenerations of .env.local and Compose's .env.
export function preserveEnvAssignments(generated, stored) {
  const entries = envAssignments(stored);
  const preserved = entries.filter(entry => entry.key.startsWith('RUNLY_MCP_'));
  const protectedKeys = new Set(preserved.map(entry => entry.key));
  let output = generated;
  for (const entry of envAssignments(generated).reverse()) {
    if (protectedKeys.has(entry.key)) output = output.slice(0, entry.start) + output.slice(entry.end);
  }
  const present = new Set(envAssignments(output).map(entry => entry.key));
  const retained = entries.filter(entry => !protectedKeys.has(entry.key) && !present.has(entry.key) && !present.has(entry.key.replace(/^(VITE_)?ATLAS_/, '$1RUNLY_')));
  const extra = [...retained, ...preserved].map(entry => entry.raw).join('\n');
  return extra ? output + (output.endsWith('\n') ? '' : '\n') + extra + '\n' : output;
}

export async function syncMissingEnvFile(file, templateFile, { log = console.info } = {}) {
  const template = await fs.readFile(templateFile, 'utf8');
  let stored = '';
  try { stored = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = appendMissingEnvText(stored, template);
  if (result.addedKeys.length) {
    // Append, rather than rewrite, an existing file so permissions and raw
    // administrator configuration remain intact. No values are logged.
    await fs.appendFile(file, result.text.slice(stored.length), { encoding: 'utf8', mode: 0o600 });
    log(`[runly-env] Variables agregadas: ${result.addedKeys.join(', ')}. Los valores existentes se conservaron.`);
  }
  return result;
}
