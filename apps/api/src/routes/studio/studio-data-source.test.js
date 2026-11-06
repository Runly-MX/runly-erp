import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { parseStudioDataFile } from './studio-data-source.js'

test('reads CSV with semicolons, duplicate and blank headers', async () => {
  const result = await parseStudioDataFile(Buffer.from('﻿Nombre;Nombre;\nAna;Ruiz;x\n;;\nLuis;;\n'), 'datos.csv')
  assert.deepEqual(result.headers, ['Nombre', 'Nombre (2)', 'Columna 3'])
  assert.deepEqual(result.rows, [{ Nombre: 'Ana', 'Nombre (2)': 'Ruiz', 'Columna 3': 'x' }, { Nombre: 'Luis', 'Nombre (2)': '', 'Columna 3': '' }])
})

test('reads the first XLSX sheet and rejects other formats', async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Hoja')
  sheet.addRow(['Nombre', 'Fecha']); sheet.addRow(['Ana', new Date(Date.UTC(2026, 10, 6))])
  const result = await parseStudioDataFile(Buffer.from(await workbook.xlsx.writeBuffer()), 'datos.xlsx')
  assert.deepEqual(result.rows, [{ Nombre: 'Ana', Fecha: '2026-11-06' }])
  await assert.rejects(parseStudioDataFile(Buffer.from('x'), 'datos.pdf'), /Formato no admitido/)
})
