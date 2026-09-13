// Builds the PrusaSlicer .ini config text handed to the CLI via `--load`.
// Per-material default temp/speed fallbacks are used when no PrinterPreset
// is linked to the job — see the design spec's "Print profile inputs".
// filamentDensityGCm3 is required for PrusaSlicer to report a non-zero
// "total filament used [g]" at all -- weight is computed from sliced
// extrusion volume × density, and PrusaSlicer defaults to 0 g/cm3 (i.e.
// always reports 0.00g) when no density is configured. Confirmed live
// against a real slice during the production VPS install.
const MATERIAL_DEFAULTS: Record<string, { nozzleTempC: number; bedTempC: number; printSpeedMmS: number; filamentDensityGCm3: number }> = {
  PLA: { nozzleTempC: 200, bedTempC: 60, printSpeedMmS: 60, filamentDensityGCm3: 1.24 },
  PETG: { nozzleTempC: 235, bedTempC: 80, printSpeedMmS: 50, filamentDensityGCm3: 1.27 },
  ABS: { nozzleTempC: 245, bedTempC: 100, printSpeedMmS: 50, filamentDensityGCm3: 1.04 },
};
const FALLBACK_MATERIAL_DEFAULTS = MATERIAL_DEFAULTS.PLA;
const DEFAULT_LAYER_HEIGHT_MM = 0.2;
const DEFAULT_INFILL_PERCENT = 15;
const DEFAULT_NOZZLE_DIAMETER_MM = 0.4;

export interface ProfileBuilderInput {
  printerPreset?: { layerHeightMm: number | null; infillPercent: number | null; nozzleTempC: number | null; bedTempC: number | null; printSpeedMmS: number | null } | null;
  filamentMaterialType?: string | null;
  nozzleDiameterMm?: number | null;
}

export function buildSlicerProfile(input: ProfileBuilderInput): string {
  const materialDefaults = MATERIAL_DEFAULTS[(input.filamentMaterialType ?? '').toUpperCase()] ?? FALLBACK_MATERIAL_DEFAULTS;
  const preset = input.printerPreset;
  const layerHeightMm = preset?.layerHeightMm ?? DEFAULT_LAYER_HEIGHT_MM;
  const infillPercent = preset?.infillPercent ?? DEFAULT_INFILL_PERCENT;
  const nozzleTempC = preset?.nozzleTempC ?? materialDefaults.nozzleTempC;
  const bedTempC = preset?.bedTempC ?? materialDefaults.bedTempC;
  const printSpeedMmS = preset?.printSpeedMmS ?? materialDefaults.printSpeedMmS;
  const nozzleDiameterMm = input.nozzleDiameterMm ?? DEFAULT_NOZZLE_DIAMETER_MM;

  // Flat `key = value` lines, NO `[section]` headers -- confirmed live
  // against the real PrusaSlicer CLI during the production VPS install.
  // `--load`/`--save` use Slic3r's flat config format regardless of the
  // logical group a setting belongs to; bracketed sections like `[print]`
  // are only used inside PrusaSlicer's internal named-preset bundle files,
  // never accepted by `--load`. An earlier version of this function wrote
  // bracketed sections, which PrusaSlicer silently ignored entirely (every
  // setting inside them, including filament_density, was dropped).
  return [
    `layer_height = ${layerHeightMm}`,
    `fill_density = ${infillPercent}%`,
    'support_material = 1',
    `perimeter_speed = ${printSpeedMmS}`,
    `temperature = ${nozzleTempC}`,
    `bed_temperature = ${bedTempC}`,
    `filament_density = ${materialDefaults.filamentDensityGCm3}`,
    `nozzle_diameter = ${nozzleDiameterMm}`,
    '',
  ].join('\n');
}
