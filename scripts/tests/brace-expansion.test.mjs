import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const eslintMinimatch = require.resolve('minimatch', { paths: [dirname(require.resolve('eslint'))] });
const archiver = require.resolve('archiver', { paths: [dirname(require.resolve('exceljs'))] });
const readdir = require.resolve('readdir-glob', { paths: [dirname(archiver)] });
const archiveMinimatch = require.resolve('minimatch', { paths: [dirname(readdir)] });

for (const [consumer, minimatchPath, minimum] of [['eslint', eslintMinimatch, '1.1.21'], ['exceljs/archive', archiveMinimatch, '2.1.7']]) {
  const path = require.resolve('brace-expansion', { paths: [dirname(minimatchPath)] });
  const expand = require(path);
  test(`${consumer}: brace expansion includes the security patch`, () => {
    const actual = require(join(dirname(path), 'package.json')).version.split('.').map(Number);
    const expected = minimum.split('.').map(Number);
    assert.equal(actual[0], expected[0]);
    assert.ok(actual[1] > expected[1] || (actual[1] === expected[1] && actual[2] >= expected[2]));
  });
  test(`${consumer}: ordinary range, alternatives and minimatch contracts remain compatible`, () => {
    assert.deepEqual(expand('src/{api,web}/{1..3}.js'), ['src/api/1.js', 'src/api/2.js', 'src/api/3.js', 'src/web/1.js', 'src/web/2.js', 'src/web/3.js']);
    assert.deepEqual(expand('literal.js'), ['literal.js']);
    assert.equal(require(minimatchPath)('src/api/file.js', 'src/{api,web}/*.js'), true);
  });
  test(`${consumer}: malformed rewrite input completes inside an isolated process budget`, () => {
    // A child timeout prevents a regression from blocking the test runner itself.
    const code = `const expand=require(process.argv[1]);const result=expand('{a}'+'}'.repeat(64000)+',z}');if(!Array.isArray(result)||result.length>2)process.exit(2);`;
    const child = spawnSync(process.execPath, ['-e', code, path], { timeout: 2000, encoding: 'utf8', windowsHide: true });
    assert.equal(child.error, undefined, 'Expansion must complete within the broad two-second budget');
    assert.equal(child.status, 0, child.stderr);
  });
}
