// Parametric die-line (desfășurată) SVG generator for the technical spec
// sheet. Drawing conventions: cuts = solid dark lines, creases (biguri) =
// dashed blue, perforations = dash-dot red. All coordinates in millimetres.
//
// The slotted family (0200/0201/0202/0203/0204/0711/0800 and the 03xx tray)
// is drawn exactly; the die-cut families are drawn as clean simplified
// blanks matching the 3D model's construction and are marked as indicative.

export interface DielineParams {
  length: number; // mm
  width: number;
  height: number;
  fefco: string;
  locale: string;
}

const GLUE = 35;  // glue tab width
const SLOTW = 5;  // visual slot gap between adjacent flaps

class Drawer {
  parts: string[] = [];
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;

  private grow(x: number, y: number) {
    this.minX = Math.min(this.minX, x); this.maxX = Math.max(this.maxX, x);
    this.minY = Math.min(this.minY, y); this.maxY = Math.max(this.maxY, y);
  }
  line(x1: number, y1: number, x2: number, y2: number, kind: 'cut' | 'crease' | 'perf') {
    this.grow(x1, y1); this.grow(x2, y2);
    const style = kind === 'cut'
      ? 'stroke="#1a202c" stroke-width="1.6"'
      : kind === 'crease'
        ? 'stroke="#2563eb" stroke-width="1.1" stroke-dasharray="7 5"'
        : 'stroke="#dc2626" stroke-width="1.1" stroke-dasharray="6 3 1.5 3"';
    this.parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${style}/>`);
  }
  rect(x: number, y: number, w: number, h: number, kind: 'cut' | 'crease') {
    this.line(x, y, x + w, y, kind);
    this.line(x + w, y, x + w, y + h, kind);
    this.line(x + w, y + h, x, y + h, kind);
    this.line(x, y + h, x, y, kind);
  }
  label(x: number, y: number, text: string, size = 26, color = '#475569') {
    this.grow(x, y);
    this.parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${color}" text-anchor="middle" font-family="monospace">${text}</text>`);
  }
  // dimension line with arrowheads; horizontal (dy offset) or vertical (dx)
  dimH(x1: number, x2: number, y: number, text: string) {
    this.line(x1, y, x2, y, 'cut'); // reuse style then overwrite below
    this.parts.pop();
    this.grow(x1, y - 14); this.grow(x2, y + 14);
    this.parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#64748b" stroke-width="1"/>`);
    [[x1, 1], [x2, -1]].forEach(([x, s]) => {
      this.parts.push(`<path d="M ${x} ${y} l ${10 * (s as number)} -5 l 0 10 z" fill="#64748b"/>`);
    });
    [[x1, y - 10, x1, y + 10], [x2, y - 10, x2, y + 10]].forEach(([a, b, c, d]) => {
      this.parts.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#94a3b8" stroke-width="0.8"/>`);
    });
    this.label((x1 + x2) / 2, y - 8, text, 24, '#334155');
  }
  dimV(y1: number, y2: number, x: number, text: string) {
    this.grow(x - 14, y1); this.grow(x + 14, y2);
    this.parts.push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#64748b" stroke-width="1"/>`);
    [[y1, 1], [y2, -1]].forEach(([y, s]) => {
      this.parts.push(`<path d="M ${x} ${y} l -5 ${10 * (s as number)} l 10 0 z" fill="#64748b"/>`);
    });
    [[x - 10, y1, x + 10, y1], [x - 10, y2, x + 10, y2]].forEach(([a, b, c, d]) => {
      this.parts.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#94a3b8" stroke-width="0.8"/>`);
    });
    this.parts.push(`<text x="${x - 8}" y="${(y1 + y2) / 2}" font-size="24" fill="#334155" text-anchor="middle" font-family="monospace" transform="rotate(-90 ${x - 8} ${(y1 + y2) / 2})">${text}</text>`);
  }
  svg(): string {
    const pad = 30;
    const x = this.minX - pad, y = this.minY - pad;
    const w = this.maxX - this.minX + 2 * pad, h = this.maxY - this.minY + 2 * pad;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(0)} ${y.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" style="width:100%;height:auto;background:#fff">${this.parts.join('')}</svg>`;
  }
}

const norm = (f: string) => (f || '201').trim().replace(/^0+/, '');

// ---- exact slotted-family blank ------------------------------------------
const drawSlotted = (d: Drawer, L: number, W: number, H: number, style: string) => {
  const overlap = Math.min(W * 0.3, Math.max(30, W * 0.25));
  const majD = style === '203' ? W : style === '202' ? Math.min((W + overlap) / 2, W - 10) : W / 2;
  const minD = style === '204' ? L / 2 : Math.min(W / 2, L / 2);
  const hasTop = ['201', '202', '203', '204', '711', '800'].includes(style);
  const isScope = ['300', '301', '302'].includes(style);
  const botMajD = style === '711' ? Math.min(W * 0.62, W - 10) : majD;
  const botMinD = style === '711' ? W * 0.28 : minD;

  const panels = [
    { w: L, top: hasTop ? majD : 0, bot: botMajD },
    { w: W, top: hasTop ? minD : 0, bot: botMinD },
    { w: L, top: hasTop ? majD : 0, bot: botMajD },
    { w: W, top: hasTop ? minD : 0, bot: botMinD },
  ];
  const topMax = Math.max(...panels.map(p => p.top));
  const y0 = topMax;       // top score line
  const y1 = topMax + H;   // bottom score line

  // glue tab (chamfered)
  d.line(0, y0, -GLUE + 8, y0 + 12, 'cut');
  d.line(-GLUE + 8, y0 + 12, -GLUE, y0 + 40, 'cut');
  d.line(-GLUE, y0 + 40, -GLUE, y1 - 40, 'cut');
  d.line(-GLUE, y1 - 40, -GLUE + 8, y1 - 12, 'cut');
  d.line(-GLUE + 8, y1 - 12, 0, y1, 'cut');
  d.line(0, y0, 0, y1, 'crease');

  let x = 0;
  panels.forEach((p, i) => {
    const xR = x + p.w;
    // body verticals: crease between panels, cut at the far right end
    d.line(xR, y0, xR, y1, i === panels.length - 1 ? 'cut' : 'crease');
    // top flap
    if (p.top > 0) {
      d.line(x + SLOTW, y0, x + SLOTW, y0 - p.top, 'cut');
      d.line(x + SLOTW, y0 - p.top, xR - SLOTW, y0 - p.top, 'cut');
      d.line(xR - SLOTW, y0 - p.top, xR - SLOTW, y0, 'cut');
      d.line(x + SLOTW, y0, xR - SLOTW, y0, 'crease');
      if (x === 0) d.line(0, y0, SLOTW, y0, 'cut');
      d.line(xR - SLOTW, y0, xR + SLOTW > x + p.w + SLOTW ? xR : xR, y0, 'cut');
    } else {
      d.line(x, y0, xR, y0, 'cut');
    }
    // bottom flap
    if (p.bot > 0) {
      d.line(x + SLOTW, y1, x + SLOTW, y1 + p.bot, 'cut');
      d.line(x + SLOTW, y1 + p.bot, xR - SLOTW, y1 + p.bot, 'cut');
      d.line(xR - SLOTW, y1 + p.bot, xR - SLOTW, y1, 'cut');
      d.line(x + SLOTW, y1, xR - SLOTW, y1, 'crease');
      if (x === 0) d.line(0, y1, SLOTW, y1, 'cut');
      d.line(xR - SLOTW, y1, xR, y1, 'cut');
      // crash-lock mains carry diagonal glue creases
      if (style === '711' && p.w === L) {
        d.line(x + SLOTW, y1, x + SLOTW + p.bot * 0.9, y1 + p.bot * 0.9, 'crease');
        d.line(xR - SLOTW, y1, xR - SLOTW - p.bot * 0.9, y1 + p.bot * 0.9, 'crease');
      }
    } else {
      d.line(x, y1, xR, y1, 'cut');
    }
    // SRP perforation around the walls
    if (style === '800') {
      d.line(x, y0 + H * 0.42, xR, y0 + H * 0.42, 'perf');
    }
    d.label(x + p.w / 2, y0 + H / 2, i % 2 === 0 ? `L ${L}` : `W ${W}`, 28, '#94a3b8');
    x = xR;
  });

  const BW = 2 * L + 2 * W;
  d.dimH(-GLUE, BW, y1 + Math.max(...panels.map(p => p.bot)) + 55, `${Math.round(BW + GLUE)} mm`);
  d.dimV(y0, y1, -GLUE - 45, `H ${H}`);
  d.dimV(y0 - (panels[0].top || 0), y1 + panels[0].bot, BW + 50, `${Math.round((panels[0].top || 0) + H + panels[0].bot)} mm`);

  // telescope lid drawn as a second piece beside the body
  if (isScope) {
    const rim = style === '302' ? H * 0.97 : style === '301' ? H * 0.62 : Math.max(40, H * 0.24);
    const c = 7 + 4; // clearance + board allowance
    const lx = BW + 160, ly = y0;
    const LL = L + 2 * c, LW = W + 2 * c;
    // cross: centre panel + 4 rims
    d.rect(lx, ly, LL, LW, 'crease');
    d.line(lx, ly - rim, lx + LL, ly - rim, 'cut');
    d.line(lx, ly + LW + rim, lx + LL, ly + LW + rim, 'cut');
    d.line(lx - rim, ly, lx - rim, ly + LW, 'cut');
    d.line(lx + LL + rim, ly, lx + LL + rim, ly + LW, 'cut');
    d.line(lx, ly - rim, lx, ly, 'cut'); d.line(lx + LL, ly - rim, lx + LL, ly, 'cut');
    d.line(lx, ly + LW, lx, ly + LW + rim, 'cut'); d.line(lx + LL, ly + LW, lx + LL, ly + LW + rim, 'cut');
    d.line(lx - rim, ly, lx, ly, 'cut'); d.line(lx - rim, ly + LW, lx, ly + LW, 'cut');
    d.line(lx + LL, ly, lx + LL + rim, ly, 'cut'); d.line(lx + LL, ly + LW, lx + LL + rim, ly + LW, 'cut');
    d.label(lx + LL / 2, ly + LW / 2, 'CAPAC / LID', 30, '#94a3b8');
    d.dimV(ly - rim, ly, lx + LL + rim + 40, `${Math.round(rim)}`);
  }
};

// ---- simplified cross / strip blanks for the die-cut families -------------
const drawCross = (d: Drawer, L: number, W: number, H: number, opts: { lid?: boolean; tabs?: boolean; skirts?: boolean }) => {
  // centre bottom panel at (0,0)
  d.rect(0, 0, L, W, 'crease');
  // side walls (x edges)
  d.rect(-H, 0, H, W, 'crease');
  d.rect(L, 0, H, W, 'crease');
  d.line(-H, 0, -H, W, 'cut'); d.line(L + H, 0, L + H, W, 'cut');
  if (opts.tabs) {
    [[-H, -H * 0.5], [L, -H * 0.5]].forEach(([sx]) => {
      d.rect(sx as number, -W * 0.22, H, W * 0.22, 'crease');
      d.rect(sx as number, W, H, W * 0.22, 'crease');
    });
  }
  // front wall (below)
  d.rect(0, W, L, H, 'crease');
  d.line(0, W + H, L, W + H, 'cut');
  // back wall + lid + tuck (above)
  d.rect(0, -H, L, H, 'crease');
  if (opts.lid) {
    d.rect(0, -H - W, L, W, 'crease');
    d.rect(0, -H - W - H * 0.6, L, H * 0.6, 'crease');
    d.line(0, -H - W - H * 0.6, L, -H - W - H * 0.6, 'cut');
    if (opts.skirts) {
      d.rect(-H * 0.8, -H - W, H * 0.8, W, 'crease');
      d.rect(L, -H - W, H * 0.8, W, 'crease');
    }
  } else {
    d.line(0, -H, L, -H, 'cut');
  }
  d.dimH(0, L, W + H + 60, `L ${L}`);
  d.dimV(0, W, -H - (opts.skirts ? H * 0.8 : 0) - 50, `W ${W}`);
  d.dimV(W, W + H, L + H + 45, `H ${H}`);
};

const drawStrip = (d: Drawer, L: number, W: number, H: number, folder: boolean) => {
  const topD = W * (folder ? 0.66 : 0.6);
  let y = 0;
  const bands = [topD, H, W, H, topD];
  bands.forEach((bh, i) => {
    d.rect(0, y, L, bh, i === 0 || i === bands.length - 1 ? 'crease' : 'crease');
    y += bh;
  });
  d.line(0, 0, L, 0, 'cut');
  d.line(0, y, L, y, 'cut');
  // end closures: flaps on the wall bands (0410) or on the bottom (0401)
  const endD = folder ? H : W / 2;
  if (folder) {
    d.rect(-endD, topD + H, endD, W, 'crease');
    d.rect(L, topD + H, endD, W, 'crease');
  } else {
    [topD, topD + H + W].forEach(by => {
      d.rect(-endD, by, endD, H, 'crease');
      d.rect(L, by, endD, H, 'crease');
    });
  }
  d.dimH(0, L, y + 55, `L ${L}`);
  d.dimV(topD + H, topD + H + W, -endD - 50, `W ${W}`);
  d.dimV(topD, topD + H, L + endD + 45, `H ${H}`);
};

const drawPartition = (d: Drawer, L: number, W: number, H: number) => {
  // 2 longitudinal + 3 transverse strips with halving slots
  for (let i = 0; i < 2; i++) {
    const y = i * (H + 40);
    d.rect(0, y, L, H, 'cut');
    [-L / 4, 0, L / 4].forEach(cx => {
      d.line(L / 2 + cx, y, L / 2 + cx, y + H / 2, 'cut');
    });
    d.label(L / 2, y + H * 0.8, `${L} × ${H}`, 24, '#94a3b8');
  }
  for (let j = 0; j < 3; j++) {
    const y = 2 * (H + 40) + j * (H + 40);
    d.rect(0, y, W, H, 'cut');
    [-W / 6, W / 6].forEach(cx => {
      d.line(W / 2 + cx, y + H, W / 2 + cx, y + H / 2, 'cut');
    });
    d.label(W / 2, y + H * 0.8, `${W} × ${H}`, 24, '#94a3b8');
  }
};

export const buildDielineSVG = (p: DielineParams): { svg: string; exact: boolean } => {
  const d = new Drawer();
  const { length: L, width: W, height: H } = p;
  const style = norm(p.fefco);
  let exact = true;

  switch (style) {
    case '200': case '201': case '202': case '203': case '204':
    case '711': case '800': case '300': case '301': case '302':
      drawSlotted(d, L, W, H, style);
      break;
    case '427':
      exact = false; drawCross(d, L, W, H, { lid: true, tabs: true, skirts: true }); break;
    case '426':
      exact = false; drawCross(d, L, W, H, { lid: true, tabs: true, skirts: false }); break;
    case '421':
      exact = false; drawCross(d, L, W, H, { lid: false, tabs: true }); break;
    case '410':
      exact = false; drawStrip(d, L, W, H, false); break;
    case '401':
      exact = false; drawStrip(d, L, W, H, true); break;
    case '501': {
      exact = false;
      drawCross(d, L, W, H, { lid: false, tabs: false });
      // sleeve strip beside the tray
      const c = 10;
      const bands = [W + 2 * c, H + 2 * c, W + 2 * c, H + 2 * c];
      let y = -H - 80 - bands.reduce((a, b) => a + b, 0);
      const x0 = L + H + 120;
      bands.forEach(bh => { d.rect(x0, y, L * 0.98, bh, 'crease'); y += bh; });
      d.line(x0, -H - 80 - bands.reduce((a, b) => a + b, 0), x0 + L * 0.98, -H - 80 - bands.reduce((a, b) => a + b, 0), 'cut');
      d.label(x0 + L / 2, y - bands[3] / 2, 'MANȘON / SLEEVE', 28, '#94a3b8');
      break;
    }
    case '601': {
      exact = false;
      const fl = Math.min(L * 0.14, 60);
      // body strip: wall / bottom / wall with flanges
      d.rect(0, 0, L, H, 'crease');
      d.rect(0, H, L, W, 'crease');
      d.rect(0, H + W, L, H, 'crease');
      d.line(0, 0, L, 0, 'cut'); d.line(0, 2 * H + W, L, 2 * H + W, 'cut');
      [[0, 0], [0, H + W]].forEach(([, by]) => {
        d.rect(-fl, by as number, fl, H, 'crease');
        d.rect(L, by as number, fl, H, 'crease');
      });
      // end caps
      d.rect(L + fl + 100, H, W, H, 'cut');
      d.rect(L + fl + 100 + W + 40, H, W, H, 'cut');
      d.label(L + fl + 100 + W / 2, H + H / 2, 'CAPĂT', 26, '#94a3b8');
      d.dimH(0, L, 2 * H + W + 55, `L ${L}`);
      d.dimV(H, H + W, -fl - 50, `W ${W}`);
      break;
    }
    case '933':
      drawPartition(d, L, W, H); break;
    case '901':
      d.rect(0, 0, L, W, 'cut');
      d.dimH(0, L, W + 55, `L ${L}`);
      d.dimV(0, W, -50, `W ${W}`);
      break;
    case '904':
      d.rect(0, 0, L, H, 'crease');
      d.rect(0, H, L, W, 'crease');
      d.rect(0, H + W, L, H, 'crease');
      d.line(0, 0, L, 0, 'cut'); d.line(0, 2 * H + W, L, 2 * H + W, 'cut');
      d.line(0, 0, 0, 2 * H + W, 'cut'); d.line(L, 0, L, 2 * H + W, 'cut');
      d.dimH(0, L, 2 * H + W + 55, `L ${L}`);
      d.dimV(H, H + W, -50, `W ${W}`);
      d.dimV(0, H, L + 45, `H ${H}`);
      break;
    default:
      drawSlotted(d, L, W, H, '201');
  }

  return { svg: d.svg(), exact };
};
