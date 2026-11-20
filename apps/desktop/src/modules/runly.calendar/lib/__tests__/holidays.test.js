import test from "node:test";
import assert from "node:assert/strict";

import { holidaysForYear } from "../holidays.js";

const days = (year, c) => Object.fromEntries(holidaysForYear(year, [c]).map((h) => [h.title, h.startAt.slice(0, 10)]));

test("mexico 2026 movable holidays", () => {
  const mx = days(2026, "MX");
  assert.equal(mx["Día de la Constitución"], "2026-02-02");
  assert.equal(mx["Natalicio de Benito Juárez"], "2026-03-16");
  assert.equal(mx["Día de la Revolución"], "2026-11-16");
  assert.equal(mx["Viernes Santo"], "2026-04-03");
  assert.equal(mx["Transmisión del Poder Ejecutivo Federal"], undefined);
  assert.equal(days(2030, "MX")["Transmisión del Poder Ejecutivo Federal"], "2030-10-01");
});

test("usa 2026 movable holidays", () => {
  const us = days(2026, "US");
  assert.equal(us["Martin Luther King Jr. Day"], "2026-01-19");
  assert.equal(us["Memorial Day"], "2026-05-25");
  assert.equal(us["Thanksgiving Day"], "2026-11-26");
});

test("no countries, no holidays", () => {
  assert.deepEqual(holidaysForYear(2026, []), []);
});
