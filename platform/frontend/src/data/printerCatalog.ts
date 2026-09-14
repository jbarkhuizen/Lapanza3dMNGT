// Reference catalog of popular consumer/prosumer 3D printers, used to
// pre-fill the "New Printer" form so a user doesn't have to look up specs
// by hand. Sourced from manufacturer spec pages and reputable
// review/retailer sites (filascope.com, 3dpros.com, Prusa/Creality/Bambu
// official docs) — see docs/IMPLEMENTATION.md for the research notes.
//
// Power draw is genuinely ambiguous across the industry (PSU rating vs.
// AC-input rating vs. measured average draw can differ 3-5x for the same
// machine) — these use the PSU/AC-input rating where published, which is
// the more conservative "won't undersize your electricity cost" number,
// not a measured average. Treat every value here as a starting point the
// user can and should adjust once they know their own printer's actual
// behavior, not a guarantee.
export interface CatalogPrinter {
  make: string;
  model: string;
  process: 'fdm' | 'resin';
  buildVolumeXMm: number;
  buildVolumeYMm: number;
  buildVolumeZMm: number;
  powerDrawWatts: number;
  /** Resin (MSLA/LCD) printers have no swappable nozzle — omitted for those. */
  nozzleDiameterMm?: number;
}

export const PRINTER_CATALOG: CatalogPrinter[] = [
  // Bambu Lab
  { make: 'Bambu Lab', model: 'X1 Carbon', process: 'fdm', buildVolumeXMm: 256, buildVolumeYMm: 256, buildVolumeZMm: 256, powerDrawWatts: 1000, nozzleDiameterMm: 0.4 },
  { make: 'Bambu Lab', model: 'P1S', process: 'fdm', buildVolumeXMm: 256, buildVolumeYMm: 256, buildVolumeZMm: 256, powerDrawWatts: 1000, nozzleDiameterMm: 0.4 },
  { make: 'Bambu Lab', model: 'A1', process: 'fdm', buildVolumeXMm: 256, buildVolumeYMm: 256, buildVolumeZMm: 256, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },
  { make: 'Bambu Lab', model: 'A1 mini', process: 'fdm', buildVolumeXMm: 180, buildVolumeYMm: 180, buildVolumeZMm: 180, powerDrawWatts: 150, nozzleDiameterMm: 0.4 },

  // Prusa Research
  { make: 'Prusa Research', model: 'MK4S', process: 'fdm', buildVolumeXMm: 250, buildVolumeYMm: 210, buildVolumeZMm: 220, powerDrawWatts: 240, nozzleDiameterMm: 0.4 },
  { make: 'Prusa Research', model: 'Mini+', process: 'fdm', buildVolumeXMm: 180, buildVolumeYMm: 180, buildVolumeZMm: 180, powerDrawWatts: 150, nozzleDiameterMm: 0.4 },
  { make: 'Prusa Research', model: 'XL (single toolhead)', process: 'fdm', buildVolumeXMm: 360, buildVolumeYMm: 360, buildVolumeZMm: 360, powerDrawWatts: 240, nozzleDiameterMm: 0.4 },
  { make: 'Prusa Research', model: 'CORE One', process: 'fdm', buildVolumeXMm: 250, buildVolumeYMm: 220, buildVolumeZMm: 270, powerDrawWatts: 240, nozzleDiameterMm: 0.4 },

  // Creality
  { make: 'Creality', model: 'Ender-3 V3', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 250, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },
  { make: 'Creality', model: 'Ender-3 V3 SE', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 250, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },
  { make: 'Creality', model: 'Ender-3 V3 KE', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 240, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },
  { make: 'Creality', model: 'K1', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 250, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },
  { make: 'Creality', model: 'K1 Max', process: 'fdm', buildVolumeXMm: 300, buildVolumeYMm: 300, buildVolumeZMm: 300, powerDrawWatts: 1000, nozzleDiameterMm: 0.4 },
  { make: 'Creality', model: 'K1C', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 250, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },
  { make: 'Creality', model: 'CR-10 SE', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 265, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },

  // Anycubic
  { make: 'Anycubic', model: 'Kobra 2', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 250, powerDrawWatts: 400, nozzleDiameterMm: 0.4 },
  { make: 'Anycubic', model: 'Kobra 2 Pro', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 250, powerDrawWatts: 400, nozzleDiameterMm: 0.4 },
  { make: 'Anycubic', model: 'Kobra 2 Max', process: 'fdm', buildVolumeXMm: 420, buildVolumeYMm: 420, buildVolumeZMm: 500, powerDrawWatts: 500, nozzleDiameterMm: 0.4 },
  { make: 'Anycubic', model: 'Kobra 3', process: 'fdm', buildVolumeXMm: 250, buildVolumeYMm: 250, buildVolumeZMm: 260, powerDrawWatts: 400, nozzleDiameterMm: 0.4 },

  // Elegoo (FDM)
  { make: 'Elegoo', model: 'Neptune 4', process: 'fdm', buildVolumeXMm: 225, buildVolumeYMm: 225, buildVolumeZMm: 265, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },
  { make: 'Elegoo', model: 'Neptune 4 Pro', process: 'fdm', buildVolumeXMm: 225, buildVolumeYMm: 225, buildVolumeZMm: 265, powerDrawWatts: 400, nozzleDiameterMm: 0.4 },
  { make: 'Elegoo', model: 'Neptune 4 Max', process: 'fdm', buildVolumeXMm: 420, buildVolumeYMm: 420, buildVolumeZMm: 480, powerDrawWatts: 500, nozzleDiameterMm: 0.4 },

  // Sovol
  { make: 'Sovol', model: 'SV06', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 250, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },
  { make: 'Sovol', model: 'SV06 Plus', process: 'fdm', buildVolumeXMm: 300, buildVolumeYMm: 300, buildVolumeZMm: 340, powerDrawWatts: 500, nozzleDiameterMm: 0.4 },
  { make: 'Sovol', model: 'SV07', process: 'fdm', buildVolumeXMm: 220, buildVolumeYMm: 220, buildVolumeZMm: 250, powerDrawWatts: 350, nozzleDiameterMm: 0.4 },

  // Resin (MSLA/LCD) — no nozzle field; process is 'resin'
  { make: 'Elegoo', model: 'Mars 5 Ultra', process: 'resin', buildVolumeXMm: 153.4, buildVolumeYMm: 77.8, buildVolumeZMm: 165, powerDrawWatts: 72 },
  { make: 'Elegoo', model: 'Saturn 4 Ultra', process: 'resin', buildVolumeXMm: 211.7, buildVolumeYMm: 118.4, buildVolumeZMm: 220, powerDrawWatts: 144 },
  { make: 'Anycubic', model: 'Photon Mono M7', process: 'resin', buildVolumeXMm: 223, buildVolumeYMm: 126, buildVolumeZMm: 230, powerDrawWatts: 110 },
];
