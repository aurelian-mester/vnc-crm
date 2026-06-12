import React, { useMemo, useState } from 'react';

// Board structures (tipuri de carton) replicated from the DWH. The picker
// shows visual swatches (colour chip + flute profile); the cross-section
// draws the real layer stack with the component papers and grammages.

export interface BoardPaper {
  code: string;
  name: string;
  grammage: number;
  qty: number; // m² of paper per m² of board (fluted layers carry take-up)
  fluting: boolean;
}

export interface BoardStructure {
  code: string;
  description: string;
  tip_carton: string;
  flute: string;
  color: string; // 'NATUR NATUR' | 'ALB NATUR' | 'ALB ALB'
  papers: BoardPaper[] | null;
  total_grammage: number;
}

const KRAFT = '#c89a62';
const WHITE = '#f4f1e8';
const SEMI = '#d8b67e';
const SCHRENZ = '#bda584';

const paperFill = (p?: BoardPaper, white?: boolean): string => {
  if (white) return WHITE;
  if (!p) return KRAFT;
  if (p.name === 'Semichimică') return SEMI;
  if (p.name === 'Schrenz') return SCHRENZ;
  return KRAFT;
};

// visual flute heights per letter (px in the cross-section)
const FLUTE_H: Record<string, number> = { F: 18, E: 24, B: 34, C: 44 };

export interface BoardLayer {
  kind: 'liner' | 'flute';
  letter?: string;
  paper?: BoardPaper;
  white?: boolean;
  label: string;
}

// Derive the drawable layer stack from flute letters + BOM papers. Liners
// are the non-fluting papers in BOM order (outer first); fluted layers take
// the fluting papers (their qty includes the ~1.45 take-up factor).
export const boardLayers = (s: BoardStructure, locale: string): BoardLayer[] => {
  const papers = s.papers || [];
  const linerPool: BoardPaper[] = [];
  const flutePool: BoardPaper[] = [];
  papers.forEach(p => {
    const copies = Math.max(1, Math.round(p.fluting ? p.qty / 1.45 : p.qty));
    for (let i = 0; i < copies; i++) (p.fluting ? flutePool : linerPool).push(p);
  });
  const letters = (s.flute || 'B').trim().toUpperCase().split('').filter(c => c >= 'A' && c <= 'Z');
  const singleFace = (s.tip_carton || '').trim() === 'TIP II';
  const albOuter = (s.color || '').trim().startsWith('ALB');
  const albInner = (s.color || '').trim() === 'ALB ALB';

  const ro = locale === 'ro';
  const layers: BoardLayer[] = [];
  let li = 0, fi = 0;
  const nextLiner = () => linerPool[li++] || linerPool[linerPool.length - 1] || flutePool[0];
  const nextFlute = () => flutePool[fi++] || flutePool[flutePool.length - 1] || linerPool[0];

  if (!singleFace) {
    layers.push({ kind: 'liner', paper: nextLiner(), white: albOuter, label: ro ? 'Liner exterior' : 'Outer liner' });
  }
  letters.forEach((letter, idx) => {
    layers.push({ kind: 'flute', letter, paper: nextFlute(), label: (ro ? 'Ondulă ' : 'Flute ') + letter });
    if (idx < letters.length - 1) {
      layers.push({ kind: 'liner', paper: nextLiner(), label: ro ? 'Liner intermediar' : 'Middle liner' });
    }
  });
  layers.push({ kind: 'liner', paper: nextLiner(), white: albInner, label: ro ? 'Liner interior' : 'Inner liner' });
  return layers;
};

// ---- cross-section drawing ------------------------------------------------
export const BoardCrossSection: React.FC<{ s: BoardStructure; locale: string }> = ({ s, locale }) => {
  const layers = useMemo(() => boardLayers(s, locale), [s, locale]);
  const LINER_H = 14;
  const W = 460;
  const PAD = 8;
  let y = PAD;
  const rows: React.ReactNode[] = [];

  layers.forEach((l, i) => {
    const h = l.kind === 'liner' ? LINER_H : (FLUTE_H[l.letter || 'B'] || 34);
    const fill = paperFill(l.paper, l.white);
    if (l.kind === 'liner') {
      rows.push(<rect key={'l' + i} x={PAD} y={y} width={W} height={h} fill={fill} stroke="#8a6f4d" strokeWidth="0.8" rx="2" />);
    } else {
      const period = h * 1.6;
      const n = Math.ceil(W / period);
      let dPath = `M ${PAD} ${y + h / 2}`;
      for (let k = 0; k < n; k++) {
        const x0 = PAD + k * period;
        dPath += ` Q ${x0 + period * 0.25} ${y - h * 0.15}, ${x0 + period * 0.5} ${y + h / 2}`;
        dPath += ` Q ${x0 + period * 0.75} ${y + h * 1.15}, ${x0 + period} ${y + h / 2}`;
      }
      rows.push(<path key={'f' + i} d={dPath} fill="none" stroke={fill} strokeWidth={5} strokeLinecap="round" style={{ filter: 'drop-shadow(0 1px 1px rgba(90,60,30,0.25))' }} />);
    }
    const labelText = `${l.label}${l.paper ? ` — ${l.paper.code} (${l.paper.name}, ${l.paper.grammage} g/m²)` : ''}`;
    rows.push(
      <text key={'t' + i} x={W + PAD + 12} y={y + h / 2 + 4} fontSize="11.5" fill="#475569" fontFamily="system-ui, sans-serif">
        {labelText}
      </text>
    );
    y += h + 4;
  });

  const totalH = y + PAD;
  return (
    <svg viewBox={`0 0 ${W + 330} ${totalH}`} style={{ width: '100%', height: 'auto', background: '#fcfbf8', borderRadius: 8 }}>
      {rows}
    </svg>
  );
};

// ---- mini swatch used in the list ----------------------------------------
const Swatch: React.FC<{ s: BoardStructure }> = ({ s }) => {
  const albOuter = (s.color || '').startsWith('ALB');
  const albInner = (s.color || '').trim() === 'ALB ALB';
  const letters = (s.flute || 'B').trim().toUpperCase();
  return (
    <svg width="54" height="34" viewBox="0 0 54 34" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="52" height="9" rx="2" fill={albOuter ? WHITE : KRAFT} stroke="#a08a66" strokeWidth="0.7" />
      <path d={`M 2 17 ${Array.from({ length: 6 }).map((_, k) => `Q ${4 + k * 9 + 2.2} 11, ${4 + k * 9 + 4.5} 17 Q ${4 + k * 9 + 6.8} 23, ${4 + k * 9 + 9} 17`).join(' ')}`} fill="none" stroke={SEMI} strokeWidth="2.4" />
      <rect x="1" y="24" width="52" height="9" rx="2" fill={albInner ? WHITE : KRAFT} stroke="#a08a66" strokeWidth="0.7" />
      <text x="27" y="20.5" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#6b4f2f">{letters}</text>
    </svg>
  );
};

// ---- searchable visual picker ---------------------------------------------
interface PickerProps {
  structures: BoardStructure[];
  value: string; // selected structure code
  onChange: (s: BoardStructure) => void;
  locale: string;
}

export const BoardStructurePicker: React.FC<PickerProps> = ({ structures, value, onChange, locale }) => {
  const [search, setSearch] = useState('');
  const [fluteFilter, setFluteFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');

  const flutes = useMemo(() => Array.from(new Set(structures.map(s => s.flute.trim()).filter(Boolean))).sort(), [structures]);
  const colors = useMemo(() => Array.from(new Set(structures.map(s => s.color.trim()).filter(Boolean))).sort(), [structures]);

  const filtered = useMemo(() => structures.filter(s =>
    (!fluteFilter || s.flute.trim() === fluteFilter) &&
    (!colorFilter || s.color.trim() === colorFilter) &&
    (!search || s.code.toLowerCase().includes(search.toLowerCase()))
  ), [structures, search, fluteFilter, colorFilter]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 1fr', gap: '6px', marginBottom: '8px' }}>
        <input
          type="text"
          placeholder={locale === 'ro' ? 'Caută cod…' : 'Search code…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.8rem', boxSizing: 'border-box', width: '100%' }}
        />
        <select value={fluteFilter} onChange={e => setFluteFilter(e.target.value)} style={{ padding: '6px 4px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.8rem' }}>
          <option value="">{locale === 'ro' ? 'Ondulă' : 'Flute'}</option>
          {flutes.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={colorFilter} onChange={e => setColorFilter(e.target.value)} style={{ padding: '6px 4px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.8rem' }}>
          <option value="">{locale === 'ro' ? 'Culoare' : 'Colour'}</option>
          {colors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ maxHeight: '264px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '14px', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
            {locale === 'ro' ? 'Nicio structură nu corespunde filtrelor.' : 'No structure matches the filters.'}
          </div>
        )}
        {filtered.map(s => (
          <button
            key={s.code}
            type="button"
            onClick={() => onChange(s)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
              padding: '7px 10px', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
              backgroundColor: value === s.code ? '#eff6ff' : 'white',
              outline: value === s.code ? '2px solid #2563eb' : 'none', outlineOffset: '-2px',
            }}
          >
            <Swatch s={s} />
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontWeight: 700, fontSize: '0.83rem', color: '#1e293b' }}>{s.code}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                {s.flute.trim()} · {s.color.trim() || '—'}{s.total_grammage > 0 ? ` · ~${Math.round(s.total_grammage)} g/m²` : ''}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
        {filtered.length}/{structures.length} {locale === 'ro' ? 'structuri (sincronizate din DWH la 4h)' : 'structures (synced from DWH every 4h)'}
      </div>
    </div>
  );
};
