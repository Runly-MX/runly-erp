#!/usr/bin/env node
// Read-only diagnostic for RUNLY_TRUSTED_PROXIES. Prints only this setting, never
// other env values. Default checks: file value, value inside the API container,
// Docker networks to compare against. `--probe <URL publica de la API, RUNLY_API_URL>` additionally sends
// ~40 forged-header requests to a rate-limited public endpoint to verify behavior
// (it briefly rate-limits the machine running it).
//   node diagnose-trusted-proxies.mjs [--mode local|external] [--probe https://api.example.com --yes]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TRUSTED_PROXY_KEYS, validateProxyList, readEnvValue } from './lib/trusted-proxies.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opt = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : undefined; };
const mode = opt('--mode') ?? (fs.existsSync(path.join(dir, '.env.external')) && !fs.existsSync(path.join(dir, '.env.local')) ? 'external' : 'local');
const envText = fs.existsSync(path.join(dir, `.env.${mode}`)) ? fs.readFileSync(path.join(dir, `.env.${mode}`), 'utf8') : null;
let failures = 0, warnings = 0;
const ok = m => console.log(`  [ok]   ${m}`), warn = m => { warnings++; console.log(`  [warn] ${m}`); }, bad = m => { failures++; console.log(`  [FAIL] ${m}`); };
const docker = (...a) => { const r = spawnSync('docker', a, { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };

console.log(`Runly trusted proxies - modo ${mode}`);
if (envText === null) bad(`.env.${mode} no existe en ${dir}; usa --mode o ejecuta desde la carpeta del instalador.`);
else {
  const effective = readEnvValue(envText, 'RUNLY_TRUSTED_PROXIES') ?? readEnvValue(envText, 'RUNLY_MCP_TRUSTED_PROXIES');
  if (effective === undefined) warn('Ninguna clave definida: la API usa la IP del socket. Detras de nginx/Docker todas las visitas comparten cuota. Ejecuta ./update-' + mode + '.sh o define RUNLY_TRUSTED_PROXIES.');
  else {
    for (const key of TRUSTED_PROXY_KEYS) {
      const value = readEnvValue(envText, key);
      if (value === undefined) continue;
      const r = validateProxyList(value);
      if (!r.ok) bad(`${key} invalido: ${r.invalid.join(', ')}`);
      else if (!value.trim()) warn(`${key} vacio: se usa la IP del socket.`);
      else ok(`${key}=${value} (valido${r.broad.length ? `; amplio: ${r.broad.join(', ')}` : ''})`);
    }
  }
  const prefix = readEnvValue(envText, 'RUNLY_CONTAINER_PREFIX') || 'runly';
  const api = `${prefix}-api-${mode}`, web = `${prefix}-web-${mode}`;
  if (docker('version', '--format', '{{.Server.Version}}') === null) warn('Docker no responde: se omiten las comprobaciones de contenedores.');
  else {
    const applied = docker('exec', api, 'printenv', 'RUNLY_TRUSTED_PROXIES');
    if (applied === null) warn(`No pude leer RUNLY_TRUSTED_PROXIES dentro de ${api} (contenedor detenido o variable ausente).`);
    else if (applied === (readEnvValue(envText, 'RUNLY_TRUSTED_PROXIES') ?? '')) ok('El contenedor de la API recibe el mismo valor que el archivo.');
    else bad('El contenedor tiene un valor distinto al archivo: recrea la API (./update-' + mode + '.sh o docker compose up -d --force-recreate).');
    for (const name of [api, web]) {
      const nets = docker('inspect', name, '--format', '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} ip={{$v.IPAddress}} gateway={{$v.Gateway}}{{"\\n"}}{{end}}');
      if (nets) console.log(`  ${name}:\n${nets.split('\n').map(l => `    ${l}`).join('\n')}`);
    }
    console.log('  La lista debe incluir los saltos que ponen X-Forwarded-For: el contenedor web (red Docker) y, si existe, el proxy del host. Nunca la IP de los visitantes.');
  }
}

const target = opt('--probe');
if (target && !args.includes('--yes')) { console.error('La sonda envia 40 solicitudes y limita brevemente la IP de origen. Pruebala primero en staging o aislada; para ejecutarla agrega --yes.'); process.exit(2); }
if (target) {
  const url = `${target.replace(/\/$/, '')}/public/lms/certificates/diagnostico-${Date.now()}`;
  const statuses = [];
  for (let i = 0; i < 40; i++) {
    try { statuses.push((await fetch(url, { headers: { 'x-forwarded-for': `198.51.100.${(i % 250) + 1}` }, signal: AbortSignal.timeout(10000) })).status); }
    catch (error) { statuses.push(`error:${error.cause?.code ?? error.message}`); break; }
  }
  console.log(`Sonda ${url}`);
  const limited = statuses.filter(s => s === 429).length;
  if (statuses.some(s => typeof s === 'string')) bad(`No se pudo alcanzar la URL (${statuses.at(-1)}). Verifica la ruta publica de la API.`);
  else if (statuses.every(s => s === 404 || s === 200)) bad('40 solicitudes con X-Forwarded-For distinto NO activaron el limite: una cabecera falsificada cambia la identidad. Si pruebas desde la red del servidor (IP privada confiable) puede ser un falso positivo; repite desde fuera.');
  else if (limited) ok(`El limite se activo (${limited}/40 con 429) aunque cada solicitud falsificaba una IP distinta: la cabecera cliente no se acepta.`);
  else warn(`Respuestas inesperadas: ${[...new Set(statuses)].join(', ')}`);
}

console.log(failures ? `\n${failures} problema(s). Ver docs/deployment/trusted-proxies.md` : warnings ? `\nSin errores, ${warnings} aviso(s).` : '\nTodo correcto.');
process.exitCode = failures ? 1 : 0;
