import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, mkdir, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inputError, resolveRecoveryConfig, serializeRecoveryEnv, validateImage, validateSnapshotId, validateDockerEndpoint } from './recovery-config.mjs';
import { validateOutputPath, validateSnapshotNodes, assertNoLinks } from './recovery-paths.mjs';
import { assessRecovery, publicAssessment } from './recovery-assessment.mjs';

const execute = promisify(execFile);
const OPTIONS = { inspect: ['config', 'image'], extract: ['config', 'image', 'snapshot', 'output'], assess: ['input'] };

export function parseArguments(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { command: 'help' };
  const [command, ...args] = argv;
  if (!OPTIONS[command]) throw inputError('Usa inspect, extract o assess. Consulta --help.');
  const options = { command };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2);
    if (!args[i]?.startsWith('--') || !OPTIONS[command].includes(key) || options[key] !== undefined ||
      !args[i + 1] || args[i + 1].startsWith('--')) throw inputError('Argumento desconocido, duplicado o incompleto.');
    options[key] = args[i + 1];
  }
  for (const key of OPTIONS[command]) if (!options[key]) throw inputError(`Falta --${key}.`);
  if (options.image) validateImage(options.image);
  if (options.snapshot) validateSnapshotId(options.snapshot);
  return options;
}

async function defaultRun(executable, args, options = {}) {
  try {
    const result = await execute(executable, args, { maxBuffer: 128 * 1024 * 1024, windowsHide: true, ...options });
    return result.stdout;
  } catch (error) {
    // Child output can include full URLs, credentials, names or object paths.
    throw Object.assign(new Error('Falló la operación de recuperación; revisa acceso, contraseña, imagen y disponibilidad del origen.'),
      { exitCode: 1, interrupted: error.name === 'AbortError' });
  }
}

async function protectPrivateDirectory(directory) {
  if (process.platform !== 'win32') return chmod(directory, 0o700);
  const identity = (await execute('whoami', [], { windowsHide: true })).stdout.trim();
  if (!identity || /[\r\n]/.test(identity)) throw new Error('No se pudo proteger la configuración temporal.');
  await execute('icacls', [directory, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)F`], { windowsHide: true });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { throw new Error('El origen devolvió metadatos no válidos.'); }
}

export async function runRecovery(argv, { run = defaultRun, signal, assess = assessRecovery } = {}) {
  const options = parseArguments(argv);
  if (options.command === 'help') return { exitCode: 0, help: true };
  if (options.command === 'assess') {
    const result = await assess(options.input);
    return { exitCode: result.status === 'incomplete' ? 3 : 0, assessment: publicAssessment(result) };
  }
  const config = resolveRecoveryConfig(await readFile(options.config));
  if (options.command === 'extract') await validateOutputPath(options.output);
  if (process.env.DOCKER_HOST) validateDockerEndpoint(process.env.DOCKER_HOST);
  validateDockerEndpoint(parseJson(await run('docker', ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], { signal })));
  const inspect = parseJson(await run('docker', ['image', 'inspect', '--format', '{{json .}}', options.image], { signal }));
  const imageId = inspect.Id;
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? '')) throw inputError('No se pudo resolver el digest de la imagen local.');
  const temp = await mkdtemp(path.join(os.tmpdir(), 'runly-recovery-'));
  try {
    await protectPrivateDirectory(temp);
    const envFile = path.join(temp, 'recovery.env');
    await writeFile(envFile, serializeRecoveryEnv(config.env), { mode: 0o600, flag: 'wx' });
    async function docker(command, { mount, entrypoint = 'restic' } = {}) {
      if (entrypoint === 'restic' && !['snapshots', 'ls', 'restore', 'version'].includes(command[0])) throw inputError('Operación de repositorio no permitida.');
      if (entrypoint === 'pg_restore' && command[0] !== '--list') throw inputError('Solo se permite inspeccionar el dump.');
      const name = `runly-recovery-${randomUUID()}`;
      const args = ['run', '--rm', '--name', name, '--cap-drop=ALL', '--security-opt=no-new-privileges',
        '--env-file', envFile, '--entrypoint', entrypoint];
      if (process.getuid) args.push('--user', `${process.getuid()}:${process.getgid()}`);
      if (mount) args.push('--mount', `type=bind,source=${mount.source},target=/extracted${mount.readonly ? ',readonly' : ''}`);
      args.push(imageId, ...(entrypoint === 'restic' ? ['--no-lock', '--no-cache'] : []), ...command);
      try { return await run('docker', args, { signal }); }
      finally {
        if (signal?.aborted) await run('docker', ['rm', '--force', name]).catch(() => {});
      }
    }
    const snapshots = parseJson(await docker(['snapshots', '--json', '--host', config.instanceId]));
    if (!Array.isArray(snapshots) || snapshots.some(s => s.hostname !== config.instanceId || !/^[a-f0-9]{64}$/.test(s.id ?? '') || Number.isNaN(Date.parse(s.time)))) {
      throw inputError('La lista de snapshots no corresponde a la instancia original.');
    }
    if (options.command === 'inspect') return {
      exitCode: 0, imageId, snapshots: snapshots.map(s => ({ id: s.id, time: s.time,
        coverage: s.tags?.includes('runly-complete-v1') ? 'complete-declared' : s.tags?.includes('runly-database-only-v1') ? 'database-only' : 'legacy-unknown' })),
    };
    const selected = snapshots.filter(s => s.id.startsWith(options.snapshot));
    if (selected.length !== 1) throw inputError('El ID no identifica exactamente un snapshot de la instancia original.');
    const snapshot = selected[0];
    const listing = await docker(['ls', '--json', snapshot.id]);
    const lines = listing.trim().split(/\r?\n/).filter(Boolean).map(parseJson);
    if (!lines.length || lines[0].struct_type !== 'snapshot' || lines[0].id !== snapshot.id) throw inputError('No se pudo validar el inventario del snapshot.');
    const nodes = lines.slice(1);
    if (!nodes.length || nodes.some(n => n.struct_type !== 'node')) throw inputError('El snapshot no contiene un inventario válido.');
    validateSnapshotNodes(nodes);
    const output = await validateOutputPath(options.output);
    await mkdir(output, { mode: 0o700 });
    await protectPrivateDirectory(output);
    // Recheck links after creation; destination belongs only to this operation.
    await assertNoLinks(output);
    await writeFile(path.join(output, '.runly-recovery-incomplete'), 'Extracción en curso; no usar como instalación.\n', { flag: 'wx', mode: 0o600 });
    await docker(['restore', snapshot.id, '--target', '/extracted', '--verify'], { mount: { source: output } });
    const result = await assess(output, { expectedInstanceId: config.instanceId });
    await docker(['--list', `/extracted/${path.relative(output, result.root).split(path.sep).join('/')}/db.dump`],
      { entrypoint: 'pg_restore', mount: { source: output, readonly: true } });
    const summary = { exitCode: result.status === 'incomplete' ? 3 : 0, imageId, snapshotId: snapshot.id,
      snapshotTime: snapshot.time, assessment: { ...publicAssessment(result), databaseValidation: 'pg_restore-list' } };
    await writeFile(path.join(output, '.runly-recovery-result.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
    if (!summary.exitCode) await rm(path.join(output, '.runly-recovery-incomplete'));
    return summary;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

const HELP = `Recuperación de Runly (no restaura una base de datos):
  inspect --config <archivo-privado> --image <imagen-fija>
  extract --config <archivo-privado> --image <imagen-fija> --snapshot <id> --output <carpeta-nueva>
  assess --input <carpeta-extraída>
La imagen debe existir localmente. El ID de instancia y la contraseña deben ser los originales.
La evaluación de cobertura no certifica que la aplicación esté recuperada.\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const result = await runRecovery(process.argv.slice(2), { signal: controller.signal });
    process.stdout.write(result.help ? HELP : JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.exitCode;
  } catch (error) {
    // Only explicitly constructed input errors are safe to display.
    process.stderr.write((error.exitCode === 2 ? error.message : 'No se completó la recuperación. Revisa configuración, acceso e integridad del origen.') + '\n');
    process.exitCode = error.exitCode ?? 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
