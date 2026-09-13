export interface GcodeSliceResult {
  weightGrams: number;
  supportWeightGrams: number;
  filamentLengthMm: number;
  printTimeHours: number;
}

// PrusaSlicer writes lines like:
//   ; filament used [mm] = 456.70, 12.30
//   ; filament used [cm3] = 1.10
//   ; total filament used [g] = 12.34, 1.20
//   ; estimated printing time (normal mode) = 1h 23m 45s
// Confirmed against a real `prusa-slicer --export-gcode` run (2.8.1) during
// the production VPS install -- the weight line is "total filament used
// [g]", NOT "filament used [g]" (an earlier version of this parser assumed
// the latter, matched only by this file's own test stub, and was never
// actually exercised against real PrusaSlicer output until then). The first
// value in a comma-separated "total filament used" line is the model
// filament; a second value (if present) is support filament on a different
// extruder/tool. Time is normalized to fractional hours.
export function parseGcodeFooter(gcodeText: string): GcodeSliceResult | null {
  const weightMatch = gcodeText.match(/;\s*total filament used \[g\]\s*=\s*([\d.]+)(?:\s*,\s*([\d.]+))?/);
  const lengthMatch = gcodeText.match(/;\s*filament used \[mm\]\s*=\s*([\d.]+)/);
  const timeMatch = gcodeText.match(/;\s*estimated printing time.*=\s*(.+)/);
  if (!weightMatch || !lengthMatch || !timeMatch) {
    return null;
  }
  const printTimeHours = parseDurationToHours(timeMatch[1].trim());
  if (printTimeHours === null) {
    return null;
  }
  return {
    weightGrams: Number(weightMatch[1]),
    supportWeightGrams: weightMatch[2] ? Number(weightMatch[2]) : 0,
    filamentLengthMm: Number(lengthMatch[1]),
    printTimeHours,
  };
}

// Parses PrusaSlicer's "1d 2h 3m 4s" style duration (any subset of the four
// units, in that order) into fractional hours. Returns null rather than
// throwing on an unrecognized format, so the caller can treat it the same
// as a missing footer.
function parseDurationToHours(text: string): number | null {
  const match = text.match(/^(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?$/);
  if (!match || !match[0].trim()) {
    return null;
  }
  const [, days, hours, minutes, seconds] = match;
  const totalHours =
    Number(days ?? 0) * 24 +
    Number(hours ?? 0) +
    Number(minutes ?? 0) / 60 +
    Number(seconds ?? 0) / 3600;
  return totalHours;
}
