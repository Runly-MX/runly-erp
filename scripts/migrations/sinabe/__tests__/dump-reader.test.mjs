import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDumpParser, parseDumpString, readDump } from '../dump-reader.mjs'

const HEADER = `-- MySQL dump 10.13
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET TIME_ZONE='+00:00' */;
DROP TABLE IF EXISTS \`Thing\`;
CREATE TABLE \`Thing\` (
  \`id\` varchar(191) NOT NULL,
  \`count\` int NOT NULL DEFAULT '0',
  \`enabled\` tinyint(1) NOT NULL DEFAULT '1',
  \`status\` enum('ALTA','BAJA') NOT NULL,
  \`note\` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (\`id\`),
  KEY \`Thing_count_idx\` (\`count\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
LOCK TABLES \`Thing\` WRITE;
`

test('parses CREATE TABLE column order and types', () => {
  const { tables } = parseDumpString(HEADER)
  assert.deepEqual(tables.Thing.columns, ['id', 'count', 'enabled', 'status', 'note'])
  assert.equal(tables.Thing.types.enabled, 'tinyint(1)')
  assert.equal(tables.Thing.types.status, "enum('alta','baja')")
})

test('decodes extended inserts with escapes, NULL and numbers', () => {
  const sql = HEADER + "INSERT INTO `Thing` VALUES ('a',1,1,'ALTA','it\\'s; \\\"x\\\" \\\\ \\n\\r\\t\\0\\Z end'),('b;c',-2,0,'BAJA',NULL),('d',3.5,1,'ALTA','o''k');\nUNLOCK TABLES;\n"
  const rows = parseDumpString(sql).tables.Thing.rows
  assert.equal(rows.length, 3)
  assert.equal(rows[0].note, 'it\'s; "x" \\ \n\r\t\0\x1a end')
  assert.deepEqual(rows[1], { id: 'b;c', count: -2, enabled: 0, status: 'BAJA', note: null })
  assert.equal(rows[2].count, 3.5)
  assert.equal(rows[2].note, "o'k")
})

test('honours explicit column lists and hex / _binary / bit literals', () => {
  const sql = HEADER + "INSERT INTO `Thing` (`note`,`id`,`count`) VALUES (0x4142,_binary 'zz','1'),(X'43',b'101',99999999999999999999);"
  const rows = parseDumpString(sql).tables.Thing.rows
  assert.ok(Buffer.isBuffer(rows[0].note))
  assert.equal(rows[0].note.toString(), 'AB')
  assert.equal(rows[0].id.toString(), 'zz')
  assert.equal(rows[0].count, '1')
  assert.equal(rows[1].note.toString(), 'C')
  assert.equal(rows[1].id, 5)
  assert.equal(rows[1].count, '99999999999999999999')
})

test('filters tables and streams rows through onRow', () => {
  const sql = HEADER + "INSERT INTO `Thing` VALUES ('a',1,1,'ALTA',NULL);\nCREATE TABLE `Other` (\n  `id` int NOT NULL\n);\nINSERT INTO `Other` VALUES (1),(2);\n"
  const only = parseDumpString(sql, { tables: ['Other'] })
  assert.deepEqual(Object.keys(only.tables), ['Other'])
  assert.equal(only.tables.Other.rows.length, 2)
  const seen = []
  parseDumpString(sql, { onRow: (t, r) => seen.push([t, r.id]) })
  assert.deepEqual(seen, [['Thing', 'a'], ['Other', 1], ['Other', 2]])
})

test('survives arbitrary chunk boundaries and huge strings', () => {
  const big = 'QUJD'.repeat(800_000) // ~3.2 MB base64-like literal
  const sql = HEADER + `INSERT INTO \`Thing\` VALUES ('x',1,1,'ALTA','${big}'),('y',2,1,'ALTA','a\\'b');\n`
  for (const size of [1, 7, 4096]) {
    const parser = createDumpParser()
    const head = sql.slice(0, 2000)
    for (let i = 0; i < head.length; i += size) parser.push(head.slice(i, i + size))
    for (let i = 2000; i < sql.length; i += 65536) parser.push(sql.slice(i, i + 65536))
    const rows = parser.end().tables.Thing.rows
    assert.equal(rows.length, 2)
    assert.equal(rows[0].note.length, big.length)
    assert.equal(rows[1].note, "a'b")
  }
})

test('skips DELIMITER blocks (triggers) and reads files from disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dump-reader-'))
  try {
    const file = join(dir, 'd.sql')
    const sql = HEADER + "DELIMITER ;;\n/*!50003 CREATE TRIGGER t BEFORE INSERT ON `Thing` FOR EACH ROW BEGIN SET NEW.count = 1; END */;;\nDELIMITER ;\nINSERT INTO `Thing` VALUES ('z',1,1,'ALTA','ok');\n"
    writeFileSync(file, sql)
    const { tables } = await readDump(file)
    assert.equal(tables.Thing.rows.length, 1)
    assert.equal(tables.Thing.rows[0].note, 'ok')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
