// Builds the PrusaSlicer .ini config text handed to the CLI via `--load`.
// Per-material default temp/speed fallbacks are used when no PrinterPreset
// is linked to the job — see the design spec's "Print profile inputs".
const MATERIAL_DEFAULTS: Record<string, { nozzleTempC: number; bedTempC: number; printSpeedMmS: number }> = {
  PLA: { nozzleTempC: 200, bedTempC: 60, printSpeedMmS: 60 },
  PETG: { nozzleTempC: 235, bedTempC: 80, printSpeedMmS: 50 },
  ABS: { nozzleTempC: 245, bedTempC: 100, printSpeedMmS: 50 },
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

  return [
    '[print]',
    `layer_height = ${layerHeightMm}`,
    `fill_density = ${infillPercent}%`,
    'support_material = 1',
    `perimeter_speed = ${printSpeedMmS}`,
    '',
    '[filament]',
    `temperature = ${nozzleTempC}`,
    `bed_temperature = ${bedTempC}`,
    '',
    '[printer]',
    `nozzle_diameter = ${nozzleDiameterMm}`,
    '',
  ].join('\n');
}
