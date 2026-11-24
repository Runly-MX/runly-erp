import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertModuleCodeTrusted, ModuleQuarantinedError } from '../lib/module-trust.js'
import {
  resolveModuleRoots,
  resolveProjectRootInfo,
} from './module-root-resolver.js'
import {
  validateManifest,
  validateModel,
  validatePage,
  validateView,
} from '@runly/module-engine'

const SOURCE_OFFICIAL = 'official'
const SOURCE_CUSTOM = 'custom'

const RESERVED_CUSTOM_PREFIXES = ['runly.', 'atlas.', 'core.', 'system.', 'identity.']

function toErrorMessage(error) {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error.message === 'string') return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function isDirectory(targetPath) {
  try {
    const stats = await fs.stat(targetPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export async function getDiscoveryRootInfo(options = {}) {
  const info = await resolveModuleRoots({
    ...options,
    sourceDir: options.sourceDir ?? path.dirname(fileURLToPath(import.meta.url)),
  })
  return {
    cwd: info.cwd,
    projectRoot: info.projectRoot,
    resolution: info.resolution,
    modulesDirExists: info.modulesDirExists,
    customModulesDirExists: info.customModulesDirExists,
    officialModulesDirExists: info.officialModulesDirExists,
    customModulesDir: info.customModulesDir,
    officialModulesDir: info.officialModulesDir,
    customModulesSource: info.customModulesSource,
  }
}

export async function resolveProjectRoot(options = {}) {
  const info = await resolveProjectRootInfo({
    ...options,
    sourceDir: options.sourceDir ?? path.dirname(fileURLToPath(import.meta.url)),
  })
  return info.projectRoot
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toRequiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function toRecordError(code, error, extra = {}) {
  return {
    code,
    message: toErrorMessage(error),
    ...extra,
  }
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function relativePath(rootDir, absolutePath) {
  return toPosixPath(path.relative(rootDir, absolutePath))
}

function isWithinPath(parentPath, childPath) {
  const rel = path.relative(parentPath, childPath)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function ensureInsideRoot(rootPath, candidatePath, label) {
  const rootReal = await fs.realpath(rootPath)
  const candidateReal = await fs.realpath(candidatePath)
  if (!isWithinPath(rootReal, candidateReal)) {
    throw new Error(`${label} resolves outside the allowed discovery root`)
  }
  return candidateReal
}

async function resolveDeclaredModuleFile({ moduleDir, declaredPath, label }) {
  const safeModuleDir = path.resolve(moduleDir)
  const safeDeclaredPath = toRequiredString(declaredPath, label)
  const normalized = safeDeclaredPath.replaceAll('\\', '/')

  if (path.isAbsolute(safeDeclaredPath)) {
    throw new Error(`${label} must be a relative path inside moduleDir`)
  }
  if (normalized.includes('\0')) {
    throw new Error(`${label} contains invalid null byte`)
  }
  if (normalized.split('/').includes('..')) {
    throw new Error(`${label} must not contain traversal segments`)
  }

  const resolvedPath = path.resolve(safeModuleDir, safeDeclaredPath)
  if (!isWithinPath(safeModuleDir, resolvedPath)) {
    throw new Error(`${label} resolves outside moduleDir`)
  }
  if (!(await pathExists(resolvedPath))) {
    throw new Error(`${label} not found: ${safeDeclaredPath}`)
  }
  return ensureInsideRoot(safeModuleDir, resolvedPath, label)
}

function readManifestReferencePaths({ manifest, key, label }) {
  const value = manifest?.[key]
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array when provided`)
  }

  return value.map((entry, index) => {
    if (typeof entry === 'string') {
      return toRequiredString(entry, `${label}[${index}]`)
    }
    if (isPlainObject(entry) && typeof entry.path === 'string') {
      return toRequiredString(entry.path, `${label}[${index}].path`)
    }
    throw new Error(`${label}[${index}] must be a string path or { path } object`)
  })
}

function extractObjectExports(moduleNamespace) {
  if (!isPlainObject(moduleNamespace)) return []

  const values = []
  if (isPlainObject(moduleNamespace.default)) {
    values.push(moduleNamespace.default)
  }

  for (const [exportName, exportValue] of Object.entries(moduleNamespace)) {
    if (exportName === 'default') continue
    if (isPlainObject(exportValue)) {
      values.push(exportValue)
    }
  }

  return values
}

function toPageAsView(pageDeclaration) {
  return {
    key: pageDeclaration.key,
    kind: 'PAGE',
    type: 'PAGE',
    title: pageDeclaration.title,
    schema: {
      ...pageDeclaration,
      page: {
        ...pageDeclaration,
      },
    },
    enabled: true,
  }
}

async function importLocalModule(filePath) {
  await assertModuleCodeTrusted(filePath)
  const url = new URL(pathToFileURL(filePath).href)
  url.searchParams.set('t', Date.now())
  return import(url.href)
}

function looksLikePageDeclaration(value) {
  if (!isPlainObject(value)) return false
  return (
    typeof value.path === 'string' &&
    value.path.startsWith('/') &&
    typeof value.title === 'string' &&
    !isPlainObject(value.schema)
  )
}

export function validateDiscoveredModule(record) {
  const errors = []
  if (!isPlainObject(record)) {
    return { valid: false, errors: ['record must be a plain object'] }
  }

  if (!record.key || typeof record.key !== 'string') {
    errors.push('manifest key is required')
  }

  if (!record.manifest || !isPlainObject(record.manifest)) {
    errors.push('manifest must be a plain object')
  } else {
    const manifestValidation = validateManifest(record.manifest)
    if (!manifestValidation.valid) {
      errors.push(...manifestValidation.errors)
    }

    const key = record.manifest.key
    if (record.source === SOURCE_OFFICIAL) {
      if (typeof key !== 'string' || !['runly.', 'atlas.'].some(prefix => key.startsWith(prefix))) {
        errors.push('official modules must use the runly.* or legacy atlas.* namespace')
      }
    }

    if (record.source === SOURCE_CUSTOM) {
      const reserved = RESERVED_CUSTOM_PREFIXES.find((prefix) => key?.startsWith(prefix))
      if (reserved) {
        errors.push(
          `custom/community modules cannot use reserved namespace "${reserved}" (key: ${key})`
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export async function loadModuleManifest({ manifestPath, source }) {
  const safeManifestPath = path.resolve(manifestPath)

  if (path.basename(safeManifestPath) !== 'module.manifest.js') {
    return {
      key: null,
      manifest: null,
      status: 'ERROR',
      error: toRecordError('INVALID_MANIFEST_PATH', 'manifest filename must be module.manifest.js'),
    }
  }

  try {
    const manifestModule = await importLocalModule(safeManifestPath)
    const manifest = manifestModule?.default

    if (!isPlainObject(manifest)) {
      return {
        key: null,
        manifest: null,
        status: 'ERROR',
        error: toRecordError('INVALID_MANIFEST_EXPORT', 'module manifest default export must be an object'),
      }
    }

    const validation = validateDiscoveredModule({ key: manifest.key, manifest, source })
    if (!validation.valid) {
      return {
        key: typeof manifest.key === 'string' ? manifest.key : null,
        manifest,
        status: 'ERROR',
        error: toRecordError('INVALID_MANIFEST', validation.errors.join('; ')),
      }
    }

    return {
      key: manifest.key,
      manifest,
      source,
      status: 'VALID',
      error: null,
    }
  } catch (error) {
    if (error instanceof ModuleQuarantinedError) {
      return { key: null, manifest: null, status: 'ERROR', error: toRecordError('MODULE_QUARANTINED', error.message) }
    }
    const importMessage = toErrorMessage(error)
    const packageResolutionHint = importMessage.includes("@runly/module-engine")
      ? ' Module package resolution must be fixed through workspace/dependency linking; discovery does not rewrite source imports.'
      : ''
    return {
      key: null,
      manifest: null,
      status: 'ERROR',
      error: toRecordError('MANIFEST_IMPORT_FAILED', `${importMessage}${packageResolutionHint}`),
    }
  }
}

export async function loadModuleModels({ moduleDir, manifest }) {
  const safeModuleDir = path.resolve(moduleDir)
  const modelRefs = readManifestReferencePaths({
    manifest,
    key: 'models',
    label: 'manifest.models',
  })

  const models = []
  for (const modelRef of modelRefs) {
    const modelPath = await resolveDeclaredModuleFile({
      moduleDir: safeModuleDir,
      declaredPath: modelRef,
      label: `manifest.models path "${modelRef}"`,
    })

    const modelModule = await importLocalModule(modelPath)
    const declarations = extractObjectExports(modelModule)
    if (!declarations.length) {
      throw new Error(`Model declaration file exported no plain objects: ${modelRef}`)
    }

    for (const declaration of declarations) {
      const validation = validateModel(declaration)
      if (!validation.valid) {
        throw new Error(
          `Invalid model declaration in ${modelRef} for module ${manifest?.key ?? 'unknown'}: ${validation.errors.join('; ')}`
        )
      }
      models.push(declaration)
    }
  }

  return models
}

export async function loadModuleViews({ moduleDir, manifest }) {
  const safeModuleDir = path.resolve(moduleDir)
  const viewRefs = readManifestReferencePaths({
    manifest,
    key: 'views',
    label: 'manifest.views',
  }).map((declaredPath) => ({ declaredPath, type: 'view' }))
  const pageRefs = readManifestReferencePaths({
    manifest,
    key: 'pages',
    label: 'manifest.pages',
  }).map((declaredPath) => ({ declaredPath, type: 'page' }))
  const declarationRefs = [...viewRefs, ...pageRefs]

  const views = []
  for (const ref of declarationRefs) {
    const viewPath = await resolveDeclaredModuleFile({
      moduleDir: safeModuleDir,
      declaredPath: ref.declaredPath,
      label: `manifest.${ref.type === 'page' ? 'pages' : 'views'} path "${ref.declaredPath}"`,
    })

    const viewModule = await importLocalModule(viewPath)
    const declarations = extractObjectExports(viewModule)
    if (!declarations.length) {
      throw new Error(`View/page declaration file exported no plain objects: ${ref.declaredPath}`)
    }

    for (const declaration of declarations) {
      if (ref.type === 'page' || looksLikePageDeclaration(declaration)) {
        const pageValidation = validatePage(declaration)
        if (!pageValidation.valid) {
          throw new Error(
            `Invalid page declaration in ${ref.declaredPath} for module ${manifest?.key ?? 'unknown'}: ${pageValidation.errors.join('; ')}`
          )
        }
        views.push(toPageAsView(declaration))
        continue
      }

      const viewValidation = validateView(declaration)
      if (!viewValidation.valid) {
        throw new Error(
          `Invalid view declaration in ${ref.declaredPath} for module ${manifest?.key ?? 'unknown'}: ${viewValidation.errors.join('; ')}`
        )
      }

      views.push({
        ...declaration,
        type: declaration.type ?? declaration.kind,
      })
    }
  }

  return views
}

export async function loadModuleMigrations({ moduleDir, manifest }) {
  const safeModuleDir = path.resolve(moduleDir)
  const migrationEntries = Array.isArray(manifest?.migrations) ? manifest.migrations : []
  if (!migrationEntries.length) return []

  const migrations = []
  for (let i = 0; i < migrationEntries.length; i += 1) {
    const entry = migrationEntries[i]
    if (!isPlainObject(entry)) {
      throw new Error(`manifest.migrations[${i}] must be an object`)
    }

    const declaredPath = toRequiredString(entry.path, `manifest.migrations[${i}].path`)
    const filePath = await resolveDeclaredModuleFile({
      moduleDir: safeModuleDir,
      declaredPath,
      label: `manifest.migrations path "${declaredPath}"`,
    })
    const filename = path.basename(filePath)
    const checksum = toRequiredString(entry.checksum, `manifest.migrations[${i}].checksum`).toLowerCase()
    const unsafe = entry.unsafe === true
    const sql = await fs.readFile(filePath, 'utf8')
    if (!sql.trim()) {
      throw new Error(`Migration file is empty: ${declaredPath}`)
    }
    const computedChecksum = createHash('sha256').update(sql).digest('hex')
    if (computedChecksum !== checksum) {
      const checksumError = new Error(
        `Checksum mismatch for migration "${declaredPath}": expected ${checksum}, got ${computedChecksum}`
      )
      checksumError.code = 'MANIFEST_MIGRATION_CHECKSUM_MISMATCH'
      checksumError.expectedChecksum = checksum
      checksumError.computedChecksum = computedChecksum
      checksumError.path = declaredPath
      throw checksumError
    }

    migrations.push({
      path: declaredPath,
      localPath: relativePath(safeModuleDir, filePath),
      absolutePath: filePath,
      filename,
      checksum,
      unsafe,
      sql,
    })
  }

  return migrations
}

async function discoverModulesBySource({ rootDir, source }) {
  const moduleRoots = await resolveModuleRoots({
    rootDir,
    sourceDir: path.dirname(fileURLToPath(import.meta.url)),
  })
  const safeRootDir = moduleRoots.projectRoot
  const sourceRoot = source === SOURCE_CUSTOM
    ? moduleRoots.customModulesDir
    : moduleRoots.officialModulesDir

  if (!(await pathExists(sourceRoot))) {
    return []
  }

  const sourceRootReal = await fs.realpath(sourceRoot)
  if (!isWithinPath(safeRootDir, sourceRootReal)) {
    throw new Error(`Discovery source root for ${source} resolves outside rootDir`)
  }

  const entries = await fs.readdir(sourceRoot, { withFileTypes: true })
  const directories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const records = []
  for (const dirName of directories) {
    const moduleDir = path.join(sourceRoot, dirName)
    const manifestPath = path.join(moduleDir, 'module.manifest.js')

    if (!(await pathExists(manifestPath))) {
      continue
    }

    try {
      const moduleDirReal = await ensureInsideRoot(sourceRoot, moduleDir, 'module directory')
      const manifestReal = await ensureInsideRoot(moduleDirReal, manifestPath, 'module manifest')

      const loadedManifest = await loadModuleManifest({ manifestPath: manifestReal, source })
      const localPath = isWithinPath(safeRootDir, moduleDirReal)
        ? relativePath(safeRootDir, moduleDirReal)
        : relativePath(sourceRootReal, moduleDirReal)
      const baseRecord = {
        key: loadedManifest.key ?? null,
        manifest: loadedManifest.manifest ?? null,
        source,
        localPath,
        moduleDir: moduleDirReal,
        status: loadedManifest.status,
        error: loadedManifest.error,
        models: [],
        views: [],
        migrations: [],
      }

      if (loadedManifest.status === 'ERROR') {
        records.push(baseRecord)
        continue
      }

      try {
        baseRecord.models = await loadModuleModels({
          moduleDir: moduleDirReal,
          manifest: loadedManifest.manifest,
        })
        baseRecord.views = await loadModuleViews({
          moduleDir: moduleDirReal,
          manifest: loadedManifest.manifest,
        })
        // Custom modules now migrate declaratively from model definitions.
        // Legacy manifest.migrations SQL entries are ignored to avoid brittle
        // checksum/version chains between module revisions.
        baseRecord.migrations = source === SOURCE_CUSTOM
          ? []
          : await loadModuleMigrations({
            moduleDir: moduleDirReal,
            manifest: loadedManifest.manifest,
          })
      } catch (error) {
        baseRecord.status = 'ERROR'
        const errorCode =
          typeof error?.code === 'string' && error.code.trim()
            ? error.code.trim()
            : 'DECLARATION_LOAD_FAILED'
        baseRecord.error = toRecordError(errorCode, error)
        records.push(baseRecord)
        continue
      }

      const validation = validateDiscoveredModule(baseRecord)
      if (!validation.valid) {
        baseRecord.status = 'ERROR'
        baseRecord.error = toRecordError('INVALID_DISCOVERED_MODULE', validation.errors.join('; '))
      }

      records.push(baseRecord)
    } catch (error) {
      records.push({
        key: null,
        manifest: null,
        source,
        localPath: isWithinPath(safeRootDir, path.resolve(moduleDir))
          ? relativePath(safeRootDir, moduleDir)
          : relativePath(sourceRoot, moduleDir),
        moduleDir: path.resolve(moduleDir),
        status: 'ERROR',
        error: toRecordError('DISCOVERY_IO_ERROR', error),
        models: [],
        views: [],
        migrations: [],
      })
    }
  }

  return records
}

function applyDuplicateKeyPolicy(records) {
  const grouped = new Map()
  for (let i = 0; i < records.length; i += 1) {
    const key = records[i].key
    if (typeof key !== 'string' || !key.trim()) continue
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(i)
  }

  for (const [key, indices] of grouped.entries()) {
    if (indices.length < 2) continue

    const winnerIndex =
      indices.find((idx) => records[idx].source === SOURCE_OFFICIAL) ??
      indices[0]

    for (const idx of indices) {
      if (idx === winnerIndex) continue
      records[idx].status = 'ERROR'
      records[idx].error = toRecordError(
        'DUPLICATE_MODULE_KEY',
        `Duplicate module key "${key}" detected. ${records[winnerIndex].source} module at ${records[winnerIndex].localPath} takes precedence.`,
        {
          key,
          winnerSource: records[winnerIndex].source,
          winnerPath: records[winnerIndex].localPath,
        }
      )
    }
  }

  return records
}

export async function discoverOfficialModules({ rootDir }) {
  return discoverModulesBySource({ rootDir, source: SOURCE_OFFICIAL })
}

export async function discoverCustomModules({ rootDir }) {
  return discoverModulesBySource({ rootDir, source: SOURCE_CUSTOM })
}

export async function discoverModules({ rootDir }) {
  const info = await resolveProjectRootInfo({
    rootDir,
    sourceDir: path.dirname(fileURLToPath(import.meta.url)),
  })
  const official = await discoverOfficialModules({ rootDir: info.projectRoot })
  const custom = await discoverCustomModules({ rootDir: info.projectRoot })
  return applyDuplicateKeyPolicy([...official, ...custom])
}
