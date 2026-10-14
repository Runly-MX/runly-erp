// Writes a mysqldump-like file (MySQL 8 style) for the CURRENT sinabe schema.
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { SINABE_TABLES, MIGRATIONS_TABLE, SINABE_MIGRATIONS } from './source-schema.mjs'


const LONG_TEXT = new Set(['comments', 'description', 'receiverSignature', 'delivererSignature', 'changes', 'fileUrl', 'xmlUrl', 'features'])
const SQL_TYPES = { s: 'varchar(191)', i: 'int', f: 'double', b: 'tinyint(1)', d: 'datetime(3)', j: 'json' }
// Real columns the migrator never reads, kept so the dump mirrors production.
const EXTRA_COLUMNS = {
  User: { after: 'phone', columns: [['password', 'varchar(191)']] },
  CustodyRecord: { after: 'status', columns: [['publicToken', 'varchar(191)'], ['tokenExpiresAt', 'datetime(3)']] },
}

function tableColumns(def) {
  const columns = Object.entries(def.fields).map(([name, kind]) => {
    const type = LONG_TEXT.has(name) ? (/Signature|changes/.test(name) ? 'longtext' : 'text') : SQL_TYPES[kind]
    return [name, type]
  })
  const extra = EXTRA_COLUMNS[def.table]
  if (extra) columns.splice(columns.findIndex(([n]) => n === extra.after) + 1, 0, ...extra.columns)
  return columns
}

const ESC = { '\0': '\\0', '\n': '\\n', '\r': '\\r', '\\': '\\\\', "'": "\\'", '"': '\\"', '\x1a': '\\Z' }
export function sqlValue(value) {
  if (value == null) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  if (value instanceof Date) return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'` // dump is UTC
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replace(/[\0\n\r\\'"\x1a]/g, (c) => ESC[c])}'`
}

export async function writeSyntheticDump(filePath, tables) {
  const out = createWriteStream(filePath, { encoding: 'utf8' })
  const write = async (text) => { if (!out.write(text)) await once(out, 'drain') }
  await write('-- MySQL dump 10.13  Distrib 8.0.42, for Linux (x86_64)\n--\n-- Host: localhost    Database: sinabe_synthetic\n' +
    '-- ------------------------------------------------------\n-- Server version\t8.0.42\n\n' +
    "/*!40101 SET NAMES utf8mb4 */;\n/*!40103 SET TIME_ZONE='+00:00' */;\n/*!40014 SET FOREIGN_KEY_CHECKS=0 */;\n\n")
  const defs = Object.values(SINABE_TABLES).map((def) => ({ table: def.table, columns: tableColumns(def) }))
  defs.push({ table: MIGRATIONS_TABLE, columns: [['id', 'varchar(36)'], ['checksum', 'varchar(64)'], ['finished_at', 'datetime(3)'],
    ['migration_name', 'varchar(255)'], ['logs', 'text'], ['rolled_back_at', 'datetime(3)'], ['started_at', 'datetime(3)'], ['applied_steps_count', 'int unsigned']] })
  const migrations = SINABE_MIGRATIONS.map((name, i) => {
    const at = new Date(Date.UTC(2025, 5, 9) + i * 86_400_000)
    return { id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, checksum: 'f'.repeat(64), finished_at: at, migration_name: name, logs: null, rolled_back_at: null, started_at: at, applied_steps_count: 1 }
  })
  for (const { table, columns } of defs) {
    const rows = table === MIGRATIONS_TABLE ? migrations : (tables[table] ?? [])
    await write(`--\n-- Table structure for table \`${table}\`\n--\n\nDROP TABLE IF EXISTS \`${table}\`;\n` +
      '/*!40101 SET @saved_cs_client     = @@character_set_client */;\n' +
      `CREATE TABLE \`${table}\` (\n${columns.map(([n, ty]) => `  \`${n}\` ${ty}${n === 'id' ? ' NOT NULL' : ' DEFAULT NULL'},`).join('\n')}\n` +
      `  PRIMARY KEY (\`${columns[0][0]}\`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n` +
      '/*!40101 SET character_set_client = @saved_cs_client */;\n\n')
    if (!rows.length) continue
    await write(`LOCK TABLES \`${table}\` WRITE;\n/*!40000 ALTER TABLE \`${table}\` DISABLE KEYS */;\n`)
    let buffer = '', count = 0
    for (const row of rows) {
      const tuple = `(${columns.map(([n]) => sqlValue(row[n])).join(',')})`
      if (count && buffer.length + tuple.length > 1_000_000) { await write(`${buffer};\n`); buffer = ''; count = 0 }
      buffer += count ? `,${tuple}` : `INSERT INTO \`${table}\` VALUES ${tuple}`
      count++
    }
    if (count) await write(`${buffer};\n`)
    await write(`/*!40000 ALTER TABLE \`${table}\` ENABLE KEYS */;\nUNLOCK TABLES;\n\n`)
  }
  await write('-- Dump completed\n')
  out.end()
  await once(out, 'finish')
}
