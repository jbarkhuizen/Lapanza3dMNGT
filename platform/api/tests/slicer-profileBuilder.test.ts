import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlicerProfile } from '../src/slicer/profileBuilder.js';

test('no preset + PLA material uses PLA defaults', () => {
  const profile = buildSlicerProfile({ printerPreset: null, filamentMaterialType: 'PLA', nozzleDiameterMm: null });
  assert.match(profile, /layer_height = 0\.2/);
  assert.match(profile, /fill_density = 15%/);
  assert.match(profile, /temperature = 200/);
  assert.match(profile, /bed_temperature = 60/);
  assert.match(profile, /perimeter_speed = 60/);
  assert.match(profile, /nozzle_diameter = 0\.4/);
  // filament_density is required for PrusaSlicer to report a non-zero
  // "total filament used [g]" at all -- confirmed missing live during the
  // production VPS install, where every slice reported 0.00g until this
  // was added. See profileBuilder.ts's comment on MATERIAL_DEFAULTS.
  assert.match(profile, /filament_density = 1\.24/);
});

test('no preset + unrecognized material string falls back to PLA defaults', () => {
  const profile = buildSlicerProfile({ printerPreset: null, filamentMaterialType: 'UNOBTAINIUM', nozzleDiameterMm: null });
  assert.match(profile, /temperature = 200/);
  assert.match(profile, /bed_temperature = 60/);
});

test('preset present with all fields set uses preset values verbatim, ignoring material defaults', () => {
  const profile = buildSlicerProfile({
    printerPreset: {
      layerHeightMm: 0.28,
      infillPercent: 40,
      nozzleTempC: 250,
      bedTempC: 90,
      printSpeedMmS: 80,
    },
    filamentMaterialType: 'PLA',
    nozzleDiameterMm: 0.6,
  });
  assert.match(profile, /layer_height = 0\.28/);
  assert.match(profile, /fill_density = 40%/);
  assert.match(profile, /temperature = 250/);
  assert.match(profile, /bed_temperature = 90/);
  assert.match(profile, /perimeter_speed = 80/);
  assert.match(profile, /nozzle_diameter = 0\.6/);
});

test('preset present but layerHeightMm null falls back to the layer-height default while keeping the preset\'s other fields', () => {
  const profile = buildSlicerProfile({
    printerPreset: {
      layerHeightMm: null,
      infillPercent: 40,
      nozzleTempC: 250,
      bedTempC: 90,
      printSpeedMmS: 80,
    },
    filamentMaterialType: 'PLA',
    nozzleDiameterMm: null,
  });
  assert.match(profile, /layer_height = 0\.2\n/);
  assert.match(profile, /fill_density = 40%/);
  assert.match(profile, /temperature = 250/);
});
