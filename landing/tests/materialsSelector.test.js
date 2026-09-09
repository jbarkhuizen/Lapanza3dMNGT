import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterAndRank } from '../public/js/materials-selector.js';

const PROFILE_HOBBYIST = {
  maxNozzleTempC: 260,
  maxBedTempC: 100,
  hasEnclosure: false,
  hasHardenedNozzle: false,
  hasDirectDrive: false,
};

const PLA_LIKE = {
  id: 'pla-like', name: 'PLA-like', chemistry: 'x', bestFor: 'x',
  printerRequirements: {
    nozzleTempC: 200, bedTempC: 60,
    requiresEnclosure: false, requiresHardenedNozzle: false, requiresDirectDrive: false,
    recommendsDryFilament: false, recommendsVentilation: false,
  },
  difficulty: 'Beginner', moisture: 'Low', abrasive: false,
  priceZarPerKg: { low: 100, high: 200, estimated: false },
  whyChooseIt: 'x', avoidWhenText: 'x', tags: [],
  capabilities: {
    outdoorUV: false, flexibility: false, chemicalResistance: false, foodContact: false,
    easyToPrint: true, lowCost: true, smoothAppearance: true, highDimensionalAccuracy: true,
  },
};

const PEEK_LIKE = {
  id: 'peek-like', name: 'PEEK-like', chemistry: 'x', bestFor: 'x',
  printerRequirements: {
    nozzleTempC: 360, bedTempC: 120,
    requiresEnclosure: true, requiresHardenedNozzle: true, requiresDirectDrive: false,
    recommendsDryFilament: true, recommendsVentilation: true,
  },
  difficulty: 'Advanced', moisture: 'Medium', abrasive: false,
  priceZarPerKg: { low: 8000, high: 15000, estimated: true },
  whyChooseIt: 'x', avoidWhenText: 'x', tags: [],
  capabilities: {
    outdoorUV: true, flexibility: false, chemicalResistance: true, foodContact: false,
    easyToPrint: false, lowCost: false, smoothAppearance: false, highDimensionalAccuracy: true,
  },
};

const OUTDOOR_ADVANCED = {
  id: 'outdoor-advanced', name: 'Outdoor Advanced', chemistry: 'x', bestFor: 'x',
  printerRequirements: {
    nozzleTempC: 240, bedTempC: 90,
    requiresEnclosure: false, requiresHardenedNozzle: false, requiresDirectDrive: false,
    recommendsDryFilament: true, recommendsVentilation: false,
  },
  difficulty: 'Intermediate', moisture: 'Medium', abrasive: false,
  priceZarPerKg: { low: 300, high: 500, estimated: false },
  whyChooseIt: 'x', avoidWhenText: 'x', tags: [],
  capabilities: {
    outdoorUV: true, flexibility: false, chemicalResistance: false, foodContact: false,
    easyToPrint: false, lowCost: true, smoothAppearance: false, highDimensionalAccuracy: false,
  },
};

test('drops a material whose nozzle temp exceeds the printer profile', () => {
  const result = filterAndRank([PEEK_LIKE], PROFILE_HOBBYIST, {});
  assert.equal(result.matches.length, 0);
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].material.id, 'peek-like');
  assert.match(result.dropped[0].reason, /nozzle/i);
});

test('drops a material requiring an enclosure the printer profile lacks', () => {
  const enclosureMaterial = {
    ...PLA_LIKE,
    id: 'needs-enclosure',
    printerRequirements: { ...PLA_LIKE.printerRequirements, requiresEnclosure: true },
  };
  const result = filterAndRank([enclosureMaterial], PROFILE_HOBBYIST, {});
  assert.equal(result.matches.length, 0);
  assert.match(result.dropped[0].reason, /enclosure/i);
});

test('a material passes when the printer profile meets every hard requirement', () => {
  const result = filterAndRank([PLA_LIKE], PROFILE_HOBBYIST, {});
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].id, 'pla-like');
});

test('soft (recommends*) requirements never disqualify a material', () => {
  const dryOnly = {
    ...PLA_LIKE,
    id: 'dry-only',
    printerRequirements: { ...PLA_LIKE.printerRequirements, recommendsDryFilament: true, recommendsVentilation: true },
  };
  const result = filterAndRank([dryOnly], PROFILE_HOBBYIST, {});
  assert.equal(result.matches.length, 1);
});

test('drops a material that fails a ticked capability requirement', () => {
  const result = filterAndRank([PLA_LIKE], PROFILE_HOBBYIST, { outdoorUV: true });
  assert.equal(result.matches.length, 0);
  assert.match(result.dropped[0].reason, /outdoor/i);
});

test('a material passes when it satisfies every ticked capability', () => {
  const result = filterAndRank([OUTDOOR_ADVANCED], PROFILE_HOBBYIST, { outdoorUV: true });
  assert.equal(result.matches.length, 1);
});

test('ranking prefers lower difficulty, then lower price, among survivors', () => {
  const result = filterAndRank([OUTDOOR_ADVANCED, PLA_LIKE], PROFILE_HOBBYIST, {});
  // PLA_LIKE is Beginner + cheaper — must rank first
  assert.equal(result.matches[0].id, 'pla-like');
  assert.equal(result.matches[1].id, 'outdoor-advanced');
});

test('an unticked capability never filters anything out', () => {
  const result = filterAndRank([PLA_LIKE, OUTDOOR_ADVANCED, PEEK_LIKE], PROFILE_HOBBYIST, {
    outdoorUV: false,
    flexibility: false,
  });
  // PEEK_LIKE still drops on printer requirements, but not because of the (all-false) capability ticks
  const peekDrop = result.dropped.find((d) => d.material.id === 'peek-like');
  assert.ok(peekDrop);
  assert.match(peekDrop.reason, /nozzle|enclosure|hardened/i);

  // The actual point of this test: PLA_LIKE and OUTDOOR_ADVANCED both have
  // capabilities.outdoorUV/flexibility explicitly set to false — an
  // implementation bug that treated an explicit `false` tick the same as
  // "required" would wrongly drop them here, even though neither
  // capability was actually ticked (both requested values are false).
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map((m) => m.id).sort(),
    ['outdoor-advanced', 'pla-like'],
  );
});
