import { coreModules } from "../manifests/official/core-modules.js";
import { featureModules } from "../manifests/official/feature-modules.js";
import { getLegacyModuleKey, getModuleKeyAliases } from '@runly/core';

export function listOfficialModuleManifests() {
  return [...coreModules, ...featureModules];
}

const officialCoreKeys = new Set(listOfficialModuleManifests().filter(manifest => manifest.core === true).map(manifest => getLegacyModuleKey(manifest.key)));

export function isOfficialCoreModuleKey(key) {
  return officialCoreKeys.has(getLegacyModuleKey(key));
}

const officialKeys = new Set(listOfficialModuleManifests().map(manifest => getLegacyModuleKey(manifest.key)));

export function isOfficialModuleKey(key) {
  return officialKeys.has(getLegacyModuleKey(key));
}

export function listOfficialFallbackManifests(discoveredKeys = new Set()) {
  return listOfficialModuleManifests().filter(manifest => !getModuleKeyAliases(manifest.key).some(key => discoveredKeys.has(key)));
}
