// National holidays computed on the client (no API): synthetic all-day events
// merged into the calendar views when the user enables a country.

export const HOLIDAY_COUNTRIES = [
  { code: 'MX', label: 'México', calendarName: 'Días festivos de México', color: '#15803D' },
  { code: 'US', label: 'Estados Unidos', calendarName: 'Días festivos de Estados Unidos', color: '#1D4ED8' },
]

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

// n-th weekday (0=Sun) of a month; n = -1 means the last one.
function nthWeekday(y, m, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay()
  return iso(y, m, lastDay - ((last - weekday + 7) % 7))
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(y, month - 1, day)
}

const shift = (ms, days) => {
  const d = new Date(ms + days * 86400000)
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

// official: true = descanso obligatorio (LFT art. 74 / federal holiday).
// Constitución, Juárez and Revolución are commemorated on their real date; the
// LFT moves the rest day to a Monday, shown as a separate "Descanso" entry.
function mexico(y) {
  const e = easter(y)
  const list = [
    [iso(y, 1, 1), 'Año Nuevo', true],
    [iso(y, 1, 6), 'Día de Reyes', false],
    [iso(y, 2, 2), 'Día de la Candelaria', false],
    [iso(y, 2, 5), 'Día de la Constitución', false],
    [nthWeekday(y, 2, 1, 1), 'Descanso por el Día de la Constitución', true],
    [iso(y, 2, 14), 'Día del Amor y la Amistad', false],
    [iso(y, 2, 24), 'Día de la Bandera', false],
    [iso(y, 3, 18), 'Aniversario de la Expropiación Petrolera', false],
    [iso(y, 3, 21), 'Natalicio de Benito Juárez', false],
    [nthWeekday(y, 3, 1, 3), 'Descanso por el Natalicio de Benito Juárez', true],
    [shift(e, -7), 'Domingo de Ramos', false],
    [shift(e, -3), 'Jueves Santo', false],
    [shift(e, -2), 'Viernes Santo', false],
    [shift(e, 0), 'Domingo de Resurrección', false],
    [iso(y, 4, 30), 'Día del Niño', false],
    [iso(y, 5, 1), 'Día del Trabajo', true],
    [iso(y, 5, 5), 'Batalla de Puebla', false],
    [iso(y, 5, 10), 'Día de las Madres', false],
    [iso(y, 5, 15), 'Día del Maestro', false],
    [nthWeekday(y, 6, 0, 3), 'Día del Padre', false],
    [iso(y, 9, 13), 'Día de los Niños Héroes', false],
    [iso(y, 9, 15), 'Noche del Grito de Independencia', false],
    [iso(y, 9, 16), 'Día de la Independencia', true],
    [iso(y, 10, 12), 'Día de la Raza', false],
    [iso(y, 11, 1), 'Día de Todos los Santos', false],
    [iso(y, 11, 2), 'Día de Muertos', false],
    [iso(y, 11, 20), 'Día de la Revolución Mexicana', false],
    [nthWeekday(y, 11, 1, 3), 'Descanso por el Día de la Revolución', true],
    [iso(y, 12, 12), 'Día de la Virgen de Guadalupe', false],
    [iso(y, 12, 24), 'Nochebuena', false],
    [iso(y, 12, 25), 'Navidad', true],
    [iso(y, 12, 28), 'Día de los Santos Inocentes', false],
    [iso(y, 12, 31), 'Fin de Año', false],
  ]
  if ((y - 2024) % 6 === 0 && y >= 2024) list.push([iso(y, 10, 1), 'Transmisión del Poder Ejecutivo Federal', true])
  return list
}

function usa(y) {
  return [
    [iso(y, 1, 1), 'Año Nuevo (EE. UU.)', true],
    [nthWeekday(y, 1, 1, 3), 'Día de Martin Luther King Jr.', true],
    [iso(y, 2, 14), 'San Valentín (EE. UU.)', false],
    [nthWeekday(y, 2, 1, 3), 'Día de los Presidentes', true],
    [nthWeekday(y, 5, 0, 2), 'Día de las Madres (EE. UU.)', false],
    [nthWeekday(y, 5, 1, -1), 'Día de los Caídos (Memorial Day)', true],
    [nthWeekday(y, 6, 0, 3), 'Día del Padre (EE. UU.)', false],
    [iso(y, 6, 19), 'Juneteenth', true],
    [iso(y, 7, 4), 'Día de la Independencia (EE. UU.)', true],
    [nthWeekday(y, 9, 1, 1), 'Día del Trabajo (Labor Day)', true],
    [nthWeekday(y, 10, 1, 2), 'Día de Colón', true],
    [iso(y, 10, 31), 'Halloween', false],
    [iso(y, 11, 11), 'Día de los Veteranos', true],
    [nthWeekday(y, 11, 4, 4), 'Día de Acción de Gracias', true],
    [iso(y, 12, 24), 'Nochebuena (EE. UU.)', false],
    [iso(y, 12, 25), 'Navidad (EE. UU.)', true],
    [iso(y, 12, 31), 'Fin de Año (EE. UU.)', false],
  ]
}

const BUILDERS = { MX: mexico, US: usa }

export function holidaysForYear(year, countries = []) {
  const out = []
  for (const country of HOLIDAY_COUNTRIES) {
    if (!countries.includes(country.code)) continue
    for (const [day, title, official] of BUILDERS[country.code](year)) {
      const at = `${day}T00:00:00.000Z`
      out.push({
        id: `holiday:${country.code}:${day}`,
        title,
        description: official
          ? (country.code === 'US' ? 'Día festivo federal.' : 'Día de descanso obligatorio (Ley Federal del Trabajo).')
          : 'Fecha conmemorativa (no es día de descanso obligatorio).',
        startAt: at,
        endAt: at,
        allDay: true,
        sourceModule: 'holidays',
        _holiday: true,
        calendar: { id: `holidays-${country.code}`, name: country.calendarName, color: country.color },
      })
    }
  }
  return out
}
