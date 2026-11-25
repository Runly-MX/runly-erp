import { useEffect, useState } from "react";

// PREPARED, NOT ACTIVE: replacement for lib/geoData.js (country-state-city, GPL-3.0) built on the pinned
// ODbL dataset converted by scripts/geo/build-geo-dataset.mjs into src/geo-data/<ISO2>.json (generated, not
// committed until the migration in docs/audits/RUNLY_GEO_SERVICE_PLAN.md is approved). Same read API as the
// package: Country.getAllCountries(), State.getStatesOfCountry(iso), City.getCitiesOfState(iso, state).
const cache = { countries: null, byCountry: new Map() };
const pending = new Map();

function load(name) {
  // import.meta.glob must be a literal call: the bundler rewrites it into lazy per-file imports.
  const loader = import.meta.glob("../geo-data/*.json")[`../geo-data/${name}.json`];
  return loader ? loader().then((m) => m.default ?? m) : Promise.resolve(null);
}

function once(key, run) {
  if (!pending.has(key)) pending.set(key, run().catch((error) => { pending.delete(key); throw error; }));
  return pending.get(key);
}

export const loadGeoCountries = () => once("countries", () => load("countries").then((list) => { cache.countries = list ?? []; }));

export function loadGeoCountry(iso) {
  const code = String(iso ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return Promise.resolve();
  return once(code, () => load(code).then((data) => { cache.byCountry.set(code, data?.states ?? []); }));
}

const statesOf = (iso) => cache.byCountry.get(String(iso ?? "").toUpperCase()) ?? [];
const Country = { getAllCountries: () => cache.countries ?? [] };
const State = { getStatesOfCountry: (iso) => statesOf(iso).map(({ isoCode, name }) => ({ isoCode, name })) };
const City = {
  getCitiesOfState: (iso, stateCode) => (statesOf(iso).find((s) => s.isoCode === stateCode)?.cities ?? []).map((name) => ({ name })),
};

// Country is null until the list has loaded; State/City until the selected country's file has loaded.
export function useGeoData({ country = "", cities = false } = {}) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const jobs = [];
    if (!cache.countries) jobs.push(loadGeoCountries());
    if (country && !cache.byCountry.has(String(country).toUpperCase())) jobs.push(loadGeoCountry(country));
    if (jobs.length === 0) return undefined;
    let alive = true;
    Promise.all(jobs).then(() => { if (alive) setVersion((v) => v + 1); }).catch(() => {});
    return () => { alive = false; };
  }, [country]);
  const ready = Boolean(country) && cache.byCountry.has(String(country).toUpperCase());
  return { Country: cache.countries ? Country : null, State: ready ? State : null, City: cities && ready ? City : null };
}
