// Reference catalog of common filament material types, used to pre-fill
// the "New Filament" form's material type, diameter, and a short printing-
// notes blurb — a convenience, not a data source. Deliberately does NOT
// include cost figures: unlike printer hardware specs (fixed, manufacturer-
// published facts), filament pricing varies too widely by brand, region,
// and market conditions to responsibly hardcode — the user's own cost per
// kg/spool is exactly the number Barkie's costing math actually needs, and
// guessing it here would risk quietly feeding a wrong number into every
// job costed with this filament.
export interface CatalogMaterial {
  materialType: string;
  diameterMm: 1.75 | 2.85;
  notes: string;
}

export const FILAMENT_MATERIAL_CATALOG: CatalogMaterial[] = [
  { materialType: 'PLA', diameterMm: 1.75, notes: 'Easy to print, low warp, biodegradable. Nozzle 190-220°C, bed 50-60°C. No enclosure needed.' },
  { materialType: 'PLA+', diameterMm: 1.75, notes: 'Tougher/less brittle than standard PLA, similar ease of printing. Nozzle 200-230°C, bed 50-60°C.' },
  { materialType: 'PETG', diameterMm: 1.75, notes: 'Stronger and more heat/chemical resistant than PLA, slightly stringier. Nozzle 230-250°C, bed 70-80°C.' },
  { materialType: 'ABS', diameterMm: 1.75, notes: 'Durable, heat resistant, prone to warping — enclosure strongly recommended. Nozzle 230-250°C, bed 90-110°C.' },
  { materialType: 'ASA', diameterMm: 1.75, notes: 'UV-resistant alternative to ABS, good for outdoor parts. Nozzle 240-260°C, bed 90-110°C, enclosure recommended.' },
  { materialType: 'TPU (95A)', diameterMm: 1.75, notes: 'Flexible, print slowly (20-35mm/s). Nozzle 210-230°C, bed 30-60°C. Direct-drive extruder recommended.' },
  { materialType: 'Nylon (PA)', diameterMm: 1.75, notes: 'Strong, wear-resistant, very hygroscopic — dry before printing. Nozzle 240-270°C, bed 70-90°C, enclosure recommended.' },
  { materialType: 'Nylon-CF', diameterMm: 1.75, notes: 'Carbon-fibre-reinforced nylon, stiff and strong. Needs a hardened/steel nozzle. Nozzle 250-280°C, bed 70-90°C.' },
  { materialType: 'PC (Polycarbonate)', diameterMm: 1.75, notes: 'Very strong, high heat resistance, hygroscopic. Nozzle 260-300°C, bed 100-120°C, enclosure required.' },
  { materialType: 'HIPS', diameterMm: 1.75, notes: 'Often used as a dissolvable support material alongside ABS (limonene-soluble). Nozzle 220-240°C, bed 90-110°C.' },
  { materialType: 'PVA', diameterMm: 1.75, notes: 'Water-soluble support material, very hygroscopic — store sealed with desiccant. Nozzle 190-210°C, bed 45-60°C.' },
  { materialType: 'PLA — Wood-fill', diameterMm: 1.75, notes: 'PLA blended with wood fibre — sand/stain like wood. Needs a larger nozzle (0.6mm+) to avoid clogging. Nozzle 190-220°C, bed 50-60°C.' },
  { materialType: 'PETG — Carbon Fibre', diameterMm: 1.75, notes: 'Stiffer, matte-finish PETG. Needs a hardened/steel nozzle. Nozzle 240-260°C, bed 70-80°C.' },
  { materialType: 'PLA (2.85mm)', diameterMm: 2.85, notes: 'Same PLA properties, sized for 2.85mm-only printers (e.g. some Ultimaker/German RepRap machines). Nozzle 190-220°C, bed 50-60°C.' },
];
