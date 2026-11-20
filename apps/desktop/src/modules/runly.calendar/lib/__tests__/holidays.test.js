import test from "node:test";
import assert from "node:assert/strict";

import { holidaysForYear } from "../holidays.js";

const days = (year, c) => Object.fromEntries(holidaysForYear(year, [c]).map((h) => [h.title, h.startAt.slice(0, 10)]));

test("mexico 2026: real dates plus the LFT Monday rest days", () => {
  const mx = days(2026, "MX");
  assert.equal(mx["Día de la Revolución Mexicana"], "2026-11-20");
  assert.equal(mx["Descanso por el Día de la Revolución"], "2026-11-16");
  assert.equal(mx["Día de la Constitución"], "2026-02-05");
  assert.equal(mx["Descanso por el Día de la Constitución"], "2026-02-02");
  assert.equal(mx["Descanso por el Natalicio de Benito Juárez"], "2026-03-16");
  assert.equal(mx["Viernes Santo"], "2026-04-03");
  assert.equal(mx["Nochebuena"], "2026-12-24");
  assert.equal(mx["Día de la Virgen de Guadalupe"], "2026-12-12");
  assert.equal(mx["Día del Padre"], "2026-06-21");
  assert.equal(mx["Transmisión del Poder Ejecutivo Federal"], undefined);
  assert.equal(days(2030, "MX")["Transmisión del Poder Ejecutivo Federal"], "2030-10-01");
});

test("usa 2026 movable holidays", () => {
  const us = days(2026, "US");
  assert.equal(us["Día de Martin Luther King Jr."], "2026-01-19");
  assert.equal(us["Día de los Caídos (Memorial Day)"], "2026-05-25");
  assert.equal(us["Día de Acción de Gracias"], "2026-11-26");
  assert.equal(us["Día de las Madres (EE. UU.)"], "2026-05-10");
  assert.equal(us["Black Friday"], "2026-11-27");
});

test("usa weekend federal holidays get an observed weekday", () => {
  // July 4 2026 is a Saturday -> Friday July 3; Juneteenth 2027 Saturday -> Friday 18.
  assert.equal(days(2026, "US")["Descanso por Día de la Independencia (EE. UU.)"], "2026-07-03");
  assert.equal(days(2027, "US")["Descanso por Juneteenth"], "2027-06-18");
  // Jan 1 2022 was a Saturday -> observed Friday Dec 31 2021, listed in 2021 only.
  assert.equal(days(2021, "US")["Descanso por Año Nuevo (EE. UU.)"], "2021-12-31");
  assert.equal(days(2022, "US")["Descanso por Año Nuevo (EE. UU.)"], undefined);
  // Weekday holidays get no extra entry.
  assert.equal(days(2026, "US")["Descanso por Navidad (EE. UU.)"], undefined);
});

test("no countries, no holidays", () => {
  assert.deepEqual(holidaysForYear(2026, []), []);
});
