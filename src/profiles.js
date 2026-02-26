/**
 * Charger profile loader and validation.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_PATH = join(__dirname, '../profiles.json');

let _profiles = null;

export function loadProfiles() {
  if (_profiles) return _profiles;
  try {
    const raw = readFileSync(PROFILES_PATH, 'utf-8');
    _profiles = JSON.parse(raw);
    return _profiles;
  } catch (err) {
    throw new Error(`Failed to load profiles: ${err.message}`);
  }
}

export function getProfile(name) {
  const profiles = loadProfiles();
  const p = profiles[name];
  if (!p) return null;
  return {
    id: name,
    ...p,
    maxPowerKw: p.maxPowerKw ?? 7.4,
    meterValueIntervalSec: p.meterValueIntervalSec ?? 60,
    measurands: p.measurands ?? ['Energy.Active.Import.Register'],
    quirks: p.quirks ?? [],
  };
}

export function listProfiles() {
  const profiles = loadProfiles();
  return Object.keys(profiles).map((id) => ({ id, ...getProfile(id) }));
}
