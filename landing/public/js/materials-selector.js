const DIFFICULTY_RANK = { Beginner: 0, Intermediate: 1, Advanced: 2 };

/**
 * @param {import('./materials-data.js').Material[]} materials
 * @param {{ maxNozzleTempC: number, maxBedTempC: number, hasEnclosure: boolean, hasHardenedNozzle: boolean, hasDirectDrive: boolean }} printerProfile
 * @param {Partial<Record<keyof import('./materials-data.js').Material['capabilities'], boolean>>} requiredCapabilities
 * @returns {{ matches: Array, dropped: Array<{ material: Object, reason: string }> }}
 */
export function filterAndRank(materials, printerProfile, requiredCapabilities) {
  const matches = [];
  const dropped = [];

  for (const material of materials) {
    const req = material.printerRequirements;

    if (req.nozzleTempC > printerProfile.maxNozzleTempC) {
      dropped.push({ material, reason: `Needs a ${req.nozzleTempC}°C nozzle — your printer maxes out at ${printerProfile.maxNozzleTempC}°C.` });
      continue;
    }
    if (req.bedTempC > printerProfile.maxBedTempC) {
      dropped.push({ material, reason: `Needs a ${req.bedTempC}°C bed — your printer maxes out at ${printerProfile.maxBedTempC}°C.` });
      continue;
    }
    if (req.requiresEnclosure && !printerProfile.hasEnclosure) {
      dropped.push({ material, reason: 'Needs an enclosure your printer doesn’t have.' });
      continue;
    }
    if (req.requiresHardenedNozzle && !printerProfile.hasHardenedNozzle) {
      dropped.push({ material, reason: 'Needs a hardened nozzle your printer doesn’t have.' });
      continue;
    }
    if (req.requiresDirectDrive && !printerProfile.hasDirectDrive) {
      dropped.push({ material, reason: 'Needs a direct-drive extruder your printer doesn’t have.' });
      continue;
    }

    const failedCapability = Object.entries(requiredCapabilities).find(
      ([capability, required]) => required && !material.capabilities[capability],
    );
    if (failedCapability) {
      dropped.push({ material, reason: `Doesn’t meet your "${failedCapability[0]}" requirement.` });
      continue;
    }

    matches.push(material);
  }

  matches.sort((a, b) => {
    const difficultyDiff = DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
    if (difficultyDiff !== 0) return difficultyDiff;
    return a.priceZarPerKg.low - b.priceZarPerKg.low;
  });

  return { matches, dropped };
}
