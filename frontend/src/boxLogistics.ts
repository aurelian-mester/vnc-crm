// Shared box → pallet planning used by the Configurator and the Quotes page
// to hand finished goods over to the Truck Load Optimizer.
//
// A corrugated plant ships boxes either knocked-down flat (bundled stacks of
// folded blanks — the normal case) or erected (rare). Both modes are
// supported; the caller picks one in the hand-off dialog.

export interface BoxSpec {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  fefco: string;        // e.g. '201', '0426' (leading zero tolerated)
  fluteType: string;    // 'B', 'C', 'EB', 'CO3', ...
  quantity: number;
  grammage?: number;    // g/m² board weight; defaulted when unknown
  caliperMm?: number;   // board thickness; defaulted from fluteType
}

export interface PalletConstraints {
  palletLengthMm: number; // 1200 EUR default
  palletWidthMm: number;  // 800 EUR default
  maxStackMm: number;     // total handling-unit height incl. the wood base
  palletWoodMm: number;   // EUR pallet base height
  palletTareKg: number;
}

export interface PalletGroup {
  palletCount: number;
  boxesPerPallet: number;
  heightMm: number; // full handling-unit height incl. wood base
  weightKg: number; // per pallet, incl. tare
  label: string;
}

export interface PalletPlan {
  groups: PalletGroup[];   // full pallets + (optionally) one partial pallet
  totalPallets: number;
  boxWeightKg: number;
  flatUnit?: { wMm: number; hMm: number; thicknessMm: number };
  warnings: string[];
}

export const DEFAULT_PALLET: PalletConstraints = {
  palletLengthMm: 1200,
  palletWidthMm: 800,
  maxStackMm: 1800,
  palletWoodMm: 144,
  palletTareKg: 25,
};

const norm = (fefco: string) => (fefco || '201').trim().replace(/^0+/, '');

// Board thickness by flute (mm) — used when the specs API hasn't been called.
const CALIPER_BY_FLUTE: Record<string, number> = {
  F: 0.8, E: 1.5, B: 3.0, C: 4.0, BC: 7.6, EB: 5.1, EE: 3.6,
  CO2: 1.5, CO3: 3.0, CO4: 7.0, CO5: 7.0,
};

export const caliperForFlute = (flute: string): number =>
  CALIPER_BY_FLUTE[(flute || 'B').toUpperCase()] ?? 3.0;

// Board area per box (m²) — mirrors the pricing service approximations.
export const boardAreaSQM = (b: BoxSpec): number => {
  const { lengthMm: L, widthMm: W, heightMm: H } = b;
  switch (norm(b.fefco)) {
    case '901': return (L * W) / 1e6;
    case '904': return (L * (W + 2 * H)) / 1e6;
    case '933': return (2 * L * H + 3 * W * H) / 1e6;
    case '300': return (2 * (L * W + L * H + W * H) + (L * W + 2 * Math.max(40, 0.24 * H) * (L + W))) / 1e6;
    case '301': return (2 * (L * W + L * H + W * H) + (L * W + 2 * 0.62 * H * (L + W))) / 1e6;
    case '302': return (2 * (L * W + L * H + W * H) + (L * W + 2 * 0.97 * H * (L + W))) / 1e6;
    case '501': return (2 * (L * W + L * H + W * H) + 2 * L * (W + H)) / 1e6;
    case '601': return (2 * (L * W + L * H + W * H) + 2 * W * H) / 1e6;
    default: return (2 * (L * W + L * H + W * H)) / 1e6;
  }
};

// Footprint and ply count of one knocked-down (flat) unit on the pallet.
// Approximations are per style family and intentionally conservative.
const flatUnitFor = (b: BoxSpec): { wMm: number; hMm: number; plies: number } => {
  const { lengthMm: L, widthMm: W, heightMm: H } = b;
  switch (norm(b.fefco)) {
    case '901': return { wMm: L, hMm: W, plies: 1 };
    case '904': return { wMm: L, hMm: W + 2 * H, plies: 1 };
    case '933': return { wMm: Math.max(L, W), hMm: H, plies: 5 }; // bundle of 5 strips
    case '427': case '426':
      return { wMm: L + 2 * H, hMm: 2 * W + 3 * H, plies: 1 }; // die-cut cross blank
    case '421': return { wMm: L + 2 * H, hMm: W + 2 * H, plies: 1 };
    case '410': case '401':
      return { wMm: L + W, hMm: 2.2 * W + 2 * H, plies: 1 };
    case '501': return { wMm: L + 2 * H, hMm: Math.max(W + 2 * H, 2 * (W + H) + 40), plies: 2 }; // tray + sleeve
    case '601': return { wMm: 1.3 * L, hMm: W + 2 * H, plies: 2 }; // body + stacked end caps
    case '300': case '301': case '302':
      return { wMm: L + W + 40, hMm: H + W, plies: 4 }; // glued tray + lid, both folded flat
    default: // slotted family + 0711 + 0800: glued tube folded flat
      return { wMm: L + W + 40, hMm: H + W, plies: 2 };
  }
};

const fitPerLayer = (palL: number, palW: number, uW: number, uH: number): number => {
  const a = Math.floor(palL / uW) * Math.floor(palW / uH);
  const b = Math.floor(palL / uH) * Math.floor(palW / uW);
  return Math.max(a, b);
};

export const planPallets = (
  box: BoxSpec,
  mode: 'flat' | 'erected',
  c: PalletConstraints = DEFAULT_PALLET
): PalletPlan => {
  const warnings: string[] = [];
  const caliper = box.caliperMm && box.caliperMm > 0 ? box.caliperMm : caliperForFlute(box.fluteType);
  const grammage = box.grammage && box.grammage > 0 ? box.grammage : 550;
  const boxWeightKg = (boardAreaSQM(box) * grammage) / 1000;
  const stackAvail = Math.max(0, c.maxStackMm - c.palletWoodMm);

  let boxesPerPallet = 0;
  let flatUnit: PalletPlan['flatUnit'];

  const erectable = !['901', '904', '933'].includes(norm(box.fefco));
  const effMode = mode === 'erected' && !erectable ? 'flat' : mode;
  if (mode === 'erected' && !erectable) {
    warnings.push('flat_forced'); // fitments are always shipped flat
  }

  if (effMode === 'flat') {
    const u = flatUnitFor(box);
    const thickness = u.plies * caliper + 0.5; // small air gap per unit
    flatUnit = { wMm: u.wMm, hMm: u.hMm, thicknessMm: thickness };
    let perLayer = fitPerLayer(c.palletLengthMm, c.palletWidthMm, u.wMm, u.hMm);
    if (perLayer === 0) {
      // oversized blank: allow one unit per layer with overhang
      perLayer = 1;
      warnings.push('overhang');
    }
    const layers = Math.floor(stackAvail / thickness);
    boxesPerPallet = perLayer * layers;
  } else {
    let perLayer = fitPerLayer(c.palletLengthMm, c.palletWidthMm, box.lengthMm, box.widthMm);
    if (perLayer === 0) {
      perLayer = 1;
      warnings.push('overhang');
    }
    const layers = Math.floor(stackAvail / box.heightMm);
    boxesPerPallet = perLayer * layers;
  }

  if (boxesPerPallet <= 0) {
    return { groups: [], totalPallets: 0, boxWeightKg, flatUnit, warnings: [...warnings, 'no_fit'] };
  }

  const fullPallets = Math.floor(box.quantity / boxesPerPallet);
  const remainder = box.quantity - fullPallets * boxesPerPallet;
  const groups: PalletGroup[] = [];

  const heightFor = (count: number): number => {
    if (effMode === 'flat') {
      const u = flatUnitFor(box);
      const perLayer = Math.max(1, fitPerLayer(c.palletLengthMm, c.palletWidthMm, u.wMm, u.hMm));
      const layers = Math.ceil(count / perLayer);
      return c.palletWoodMm + Math.round(layers * (u.plies * caliper + 0.5));
    }
    const perLayer = Math.max(1, fitPerLayer(c.palletLengthMm, c.palletWidthMm, box.lengthMm, box.widthMm));
    return c.palletWoodMm + Math.ceil(count / perLayer) * box.heightMm;
  };

  if (fullPallets > 0) {
    groups.push({
      palletCount: fullPallets,
      boxesPerPallet,
      heightMm: heightFor(boxesPerPallet),
      weightKg: Math.round((c.palletTareKg + boxesPerPallet * boxWeightKg) * 10) / 10,
      label: 'full',
    });
  }
  if (remainder > 0) {
    groups.push({
      palletCount: 1,
      boxesPerPallet: remainder,
      heightMm: heightFor(remainder),
      weightKg: Math.round((c.palletTareKg + remainder * boxWeightKg) * 10) / 10,
      label: 'partial',
    });
  }

  return { groups, totalPallets: fullPallets + (remainder > 0 ? 1 : 0), boxWeightKg, flatUnit, warnings };
};

// Queue items in the shape TruckOptimizerPage expects, handed over via
// localStorage (the two pages live in different routes).
export const HANDOFF_KEY = 'vnc_optimizer_import';

export interface HandoffItem {
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  quantity: number;
  stackable: boolean;
  destination: string;
  sequence: number;
}

export const planToHandoffItems = (
  plan: PalletPlan,
  box: BoxSpec,
  mode: 'flat' | 'erected',
  destination: string,
  sequence: number,
  c: PalletConstraints = DEFAULT_PALLET,
  labelPrefix = ''
): HandoffItem[] =>
  plan.groups.map(g => ({
    name: `${labelPrefix}FEFCO ${box.fefco} ${box.lengthMm}x${box.widthMm}x${box.heightMm} (${g.boxesPerPallet} buc/palet, ${mode === 'flat' ? 'pliat' : 'format'})`,
    length: c.palletLengthMm,
    width: c.palletWidthMm,
    height: g.heightMm,
    weight: g.weightKg,
    quantity: g.palletCount,
    stackable: false,
    destination,
    sequence,
  }));

export const pushHandoff = (items: HandoffItem[]) => {
  const existing = JSON.parse(localStorage.getItem(HANDOFF_KEY) || '[]');
  localStorage.setItem(HANDOFF_KEY, JSON.stringify([...existing, ...items]));
};
