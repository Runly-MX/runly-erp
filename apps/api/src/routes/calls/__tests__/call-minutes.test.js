import test from 'node:test'
import assert from 'node:assert/strict'
import { aiMinutes, minutesPdf, minutesText, plainMinutes } from '../call-minutes-service.js'

const header = { title: 'Revisión semanal', date: '3 de noviembre de 2026, 9:00', duration: '32 min', participants: ['Ana Pérez', 'Laura (externa)'] }
const segments = [
  { startMs: 0, text: 'Buenos días, empezamos con el inventario.', speakerUser: { displayName: 'Ana Pérez' } },
  { startMs: 65_000, text: 'Quedamos en que Laura entrega la cotización el viernes.', speakerGuestId: 'g1' },
  { startMs: 90_000, text: 'Queda pendiente revisar el contrato.', speakerLabel: 'Hablante 2' },
]

test('without AI the minuta keeps the transcript by speaker and finds possible agreements', () => {
  const minutes = plainMinutes({ header, segments, guestNames: new Map([['g1', 'Laura (externa)']]) })
  assert.equal(minutes.kind, 'PLAIN')
  assert.deepEqual(minutes.highlights.map((line) => line.speaker), ['Laura (externa)', 'Hablante 2'])
  const text = minutesText(minutes)
  assert.match(text, /^Minuta: Revisión semanal/)
  assert.match(text, /Participantes: Ana Pérez, Laura \(externa\)/)
  assert.match(text, /Posibles acuerdos y pendientes\n- \[01:05\] Laura \(externa\): Quedamos/)
  assert.match(text, /\[00:00\] Ana Pérez: Buenos días/)
})

test('the email text is cut to fit and points to the PDF; the AI minuta leads with summary and commitments', async () => {
  const long = plainMinutes({ header, segments: Array.from({ length: 400 }, (_, i) => ({ startMs: i * 1000, text: `Frase número ${i} de la reunión.`, speakerLabel: 'A' })) })
  const text = minutesText(long)
  assert.ok(text.length <= 4500)
  assert.match(text, /Continúa en el PDF adjunto/)
  const ai = aiMinutes({ header, content: { objective: 'Cerrar compras', executiveSummary: 'Se revisó el inventario.', sections: [{ title: 'Inventario', startMs: 0, body: 'x', bullets: [] }], commitments: [{ text: 'Enviar cotización', owner: 'Laura', due: 'viernes' }], openDecisions: ['Proveedor de envíos'] } })
  assert.match(minutesText(ai), /Resumen\nSe revisó el inventario\.\n\nCompromisos\n- Enviar cotización \(Laura, viernes\)/)
  const pdf = await minutesPdf(ai)
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.equal((await minutesPdf(long)).subarray(0, 4).toString(), '%PDF')
})
