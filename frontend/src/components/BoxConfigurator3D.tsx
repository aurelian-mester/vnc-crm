import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

// All dimensions are in decimetres (1 unit = 100 mm), matching the page props.
const T = 0.04;     // cardboard thickness (~4 mm)
const SLOT = 0.045; // die-cut slot trimmed off each side of a flap (~4.5 mm)
const GAP = 0.06;   // clearance where two flaps meet edge-to-edge (~6 mm)

// Sub-stage interpolator: maps fold progress p through segment [a, b] to 0..1.
const stage = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------------------
// Camera: keeps the orbit radius fitted to the current extent of the model.
// Only refits when the target radius changes (user zoom is preserved between
// refits). The fold slider changes the radius continuously, so following it
// here gives a smooth zoom-out toward the flat blank.
// ---------------------------------------------------------------------------
const CameraRig: React.FC<{ fitRadius: number; controlsRef: React.MutableRefObject<any> }> = ({ fitRadius, controlsRef }) => {
  const { camera } = useThree();
  useEffect(() => {
    const dir = camera.position.clone().normalize();
    if (dir.lengthSq() === 0) dir.set(1, 0.8, 1).normalize();
    camera.position.copy(dir.multiplyScalar(fitRadius));
    camera.updateProjectionMatrix();
    if (controlsRef.current) controlsRef.current.update();
  }, [fitRadius, camera, controlsRef]);
  return null;
};

// ---------------------------------------------------------------------------
// Procedural textures. Everything is generated locally (intranet-safe).
// The kraft base is seamless — panel edges are conveyed by real geometry and
// die-cut slots, not by painted borders.
// ---------------------------------------------------------------------------
interface MaterialPalette { base: string; dark: string; fiber: string; lightFiber: string; stripe: string; }
const palette = (material: string): MaterialPalette => {
  if (material === 'Schrenz') return { base: '#a9a9a7', dark: '#8d8d8b', fiber: 'rgba(45,45,45,0.20)', lightFiber: 'rgba(235,235,235,0.25)', stripe: 'rgba(40,40,40,0.05)' };
  if (material === 'Wellenstoff') return { base: '#c29a6e', dark: '#a37e54', fiber: 'rgba(70,44,22,0.22)', lightFiber: 'rgba(255,250,240,0.16)', stripe: 'rgba(64,40,18,0.06)' };
  return { base: '#d3aa7c', dark: '#b78e5f', fiber: 'rgba(92,61,37,0.18)', lightFiber: 'rgba(255,252,245,0.15)', stripe: 'rgba(74,46,22,0.05)' }; // Testliner
};

const paintKraft = (ctx: CanvasRenderingContext2D, w: number, h: number, pal: MaterialPalette) => {
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, w, h);
  // grain noise
  for (let i = 0; i < (w * h) / 18; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const v = Math.random() * 0.09;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${v})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  // dark fiber specks
  ctx.fillStyle = pal.fiber;
  for (let i = 0; i < (w * h) / 360; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 5 + 2, Math.random() * 2.4 + 1.6);
  }
  // light recycled flecks
  ctx.fillStyle = pal.lightFiber;
  for (let i = 0; i < (w * h) / 700; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 4 + 2, Math.random() * 2 + 1.5);
  }
  // very faint corrugation striping
  ctx.fillStyle = pal.stripe;
  for (let y = 0; y < h; y += 10) ctx.fillRect(0, y, w, 4);
};

interface TexSet {
  plain: THREE.CanvasTexture | null;
  printedFront: THREE.CanvasTexture | null;
  printedSide: THREE.CanvasTexture | null;
  bumpH: THREE.CanvasTexture | null;
  bumpV: THREE.CanvasTexture | null;
  alpha: THREE.CanvasTexture | null;
}

const useCardboardTextures = (
  material: string,
  hasHandle: boolean,
  printColor: string,
  printText: string,
  hasRecycling: boolean,
  hasFragile: boolean,
  hasUpArrows: boolean,
  logoImage: HTMLImageElement | null,
  frontAspect: number,
  sideAspect: number
): TexSet => {
  return useMemo(() => {
    const pal = palette(material);

    // --- plain kraft -------------------------------------------------------
    const plainCanvas = document.createElement('canvas');
    plainCanvas.width = 512; plainCanvas.height = 512;
    const pctx = plainCanvas.getContext('2d');
    if (!pctx) return { plain: null, printedFront: null, printedSide: null, bumpH: null, bumpV: null, alpha: null };
    paintKraft(pctx, 512, 512, pal);
    const plain = new THREE.CanvasTexture(plainCanvas);
    plain.colorSpace = THREE.SRGBColorSpace;

    // --- printed face (aspect-correct so text is not distorted) ------------
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const makePrinted = (aspect: number): THREE.CanvasTexture => {
      const cw = 1024;
      const ch = Math.round(Math.min(1536, Math.max(384, cw / Math.max(0.3, aspect))));
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const ctx = c.getContext('2d')!;
      paintKraft(ctx, cw, ch, pal);
      ctx.globalCompositeOperation = 'multiply';

      const u = Math.min(cw, ch); // scale unit
      // stamp frame
      const mx = cw * 0.09, my = ch * 0.14;
      ctx.strokeStyle = hexToRgba(printColor, 0.65);
      ctx.lineWidth = u * 0.012;
      ctx.strokeRect(mx, my, cw - 2 * mx, ch - 2 * my);
      ctx.strokeStyle = hexToRgba(printColor, 0.5);
      ctx.lineWidth = u * 0.004;
      ctx.strokeRect(mx + u * 0.02, my + u * 0.02, cw - 2 * mx - u * 0.04, ch - 2 * my - u * 0.04);

      // brand text
      ctx.fillStyle = hexToRgba(printColor, 0.92);
      ctx.font = `bold ${Math.round(u * 0.13)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(printText || 'VRANCART', cw / 2, ch * 0.36);
      ctx.fillStyle = hexToRgba(printColor, 0.72);
      ctx.font = `bold ${Math.round(u * 0.045)}px monospace`;
      ctx.fillText('DO NOT DOUBLE STACK', cw / 2, ch * 0.46);
      ctx.fillText('FRAGILE - HANDLE WITH CARE', cw / 2, ch * 0.52);

      // handling symbols
      const ink = hexToRgba(printColor, 0.88);
      const s = u * 0.0011; // symbol scale relative to the original 1024px art
      const drawUpArrows = (x: number, y: number) => {
        ctx.strokeStyle = ink; ctx.lineWidth = 6 * s * 1000 / 1024 * u / u; ctx.lineWidth = u * 0.006;
        ctx.beginPath(); ctx.moveTo(x - 36 * s * 1000, y + 30 * s * 1000); ctx.lineTo(x + 36 * s * 1000, y + 30 * s * 1000); ctx.stroke();
        for (const dx of [-18, 18]) {
          ctx.beginPath(); ctx.moveTo(x + dx * s * 1000, y + 20 * s * 1000); ctx.lineTo(x + dx * s * 1000, y - 30 * s * 1000); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + (dx - 10) * s * 1000, y - 10 * s * 1000); ctx.lineTo(x + dx * s * 1000, y - 30 * s * 1000); ctx.lineTo(x + (dx + 10) * s * 1000, y - 10 * s * 1000); ctx.stroke();
        }
      };
      const drawFragile = (x: number, y: number) => {
        ctx.strokeStyle = ink; ctx.lineWidth = u * 0.006;
        const k = s * 1000;
        ctx.beginPath(); ctx.moveTo(x - 26 * k, y - 30 * k); ctx.lineTo(x + 26 * k, y - 30 * k); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - 30 * k, 26 * k, 0, Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 24 * k); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 20 * k, y + 24 * k); ctx.lineTo(x + 20 * k, y + 24 * k); ctx.stroke();
        ctx.lineWidth = u * 0.003;
        ctx.beginPath(); ctx.moveTo(x - 8 * k, y - 30 * k); ctx.lineTo(x - 2 * k, y - 10 * k); ctx.lineTo(x - 14 * k, y + 4 * k); ctx.stroke();
      };
      const drawRecycling = (x: number, y: number) => {
        ctx.strokeStyle = ink; ctx.lineWidth = u * 0.006;
        const r = 30 * s * 1000;
        for (let angle = 0; angle < 2 * Math.PI; angle += (2 * Math.PI) / 3) {
          ctx.beginPath();
          ctx.arc(x, y, r, angle + 0.2, angle + (2 * Math.PI) / 3 - 0.45);
          ctx.stroke();
          const endAngle = angle + (2 * Math.PI) / 3 - 0.45;
          const ax = x + r * Math.cos(endAngle), ay = y + r * Math.sin(endAngle);
          const psi = endAngle + Math.PI / 2;
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          const al = 14 * s * 1000, ha = 0.5;
          ctx.lineTo(ax - al * Math.cos(psi - ha), ay - al * Math.sin(psi - ha));
          ctx.lineTo(ax - al * Math.cos(psi + ha), ay - al * Math.sin(psi + ha));
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = ink;
        ctx.font = `bold ${Math.round(u * 0.03)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('20', x, y + u * 0.01);
        ctx.font = `bold ${Math.round(u * 0.022)}px monospace`;
        ctx.fillText('PAP', x, y + u * 0.034);
      };

      const active: string[] = [];
      if (hasRecycling) active.push('recycling');
      if (hasFragile) active.push('fragile');
      if (hasUpArrows) active.push('upArrows');
      const sy = ch * 0.68;
      const xs = active.length === 1 ? [cw / 2] : active.length === 2 ? [cw * 0.38, cw * 0.62] : [cw * 0.3, cw * 0.5, cw * 0.7];
      active.forEach((sym, i) => {
        if (sym === 'recycling') drawRecycling(xs[i], sy);
        if (sym === 'fragile') drawFragile(xs[i], sy);
        if (sym === 'upArrows') drawUpArrows(xs[i], sy);
      });

      // monochromatized logo
      if (logoImage) {
        const la = logoImage.width / logoImage.height;
        let dw = u * 0.24, dh = dw / la;
        if (dh > u * 0.2) { dh = u * 0.2; dw = dh * la; }
        try {
          const tc = document.createElement('canvas');
          tc.width = logoImage.width; tc.height = logoImage.height;
          const tctx = tc.getContext('2d');
          if (tctx) {
            tctx.drawImage(logoImage, 0, 0);
            const imgData = tctx.getImageData(0, 0, tc.width, tc.height);
            const data = imgData.data;
            const rI = parseInt(printColor.slice(1, 3), 16), gI = parseInt(printColor.slice(3, 5), 16), bI = parseInt(printColor.slice(5, 7), 16);
            for (let i = 0; i < data.length; i += 4) {
              const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              const dens = (255 - gray) / 255;
              data[i] = rI; data[i + 1] = gI; data[i + 2] = bI;
              data[i + 3] = data[i + 3] * dens * 0.9;
            }
            tctx.putImageData(imgData, 0, 0);
            ctx.drawImage(tc, cw / 2 - dw / 2, ch * 0.6 - dh / 2, dw, dh);
          }
        } catch (err) {
          console.error('Error rendering monochrome logo:', err);
        }
      }

      // flexo ink-skipping
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = pal.dark;
      for (let i = 0; i < 9000; i++) {
        ctx.fillRect(mx + Math.random() * (cw - 2 * mx), my + Math.random() * (ch - 2 * my), Math.random() * 2 + 0.5, Math.random() * 2 + 0.5);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const printedFront = makePrinted(frontAspect);
    const printedSide = makePrinted(sideAspect);

    // --- corrugation bump maps (H = flutes run horizontally in UV) ---------
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256; bumpCanvas.height = 256;
    const bctx = bumpCanvas.getContext('2d')!;
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const ripple = Math.sin((y / 6) * Math.PI * 2) * 7;
      const v = Math.round(128 + ripple);
      bctx.fillStyle = `rgb(${v},${v},${v})`;
      bctx.fillRect(0, y, 256, 1);
    }
    for (let i = 0; i < 6000; i++) {
      const off = Math.random() * 14 - 7;
      bctx.fillStyle = off > 0 ? `rgba(255,255,255,${off / 255})` : `rgba(0,0,0,${-off / 255})`;
      bctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
    const bumpH = new THREE.CanvasTexture(bumpCanvas);
    const bumpV = new THREE.CanvasTexture(bumpCanvas);
    bumpV.center.set(0.5, 0.5);
    bumpV.rotation = HALF_PI;

    // --- alpha map for die-cut handle holes --------------------------------
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 256; alphaCanvas.height = 256;
    const actx = alphaCanvas.getContext('2d')!;
    actx.fillStyle = '#ffffff';
    actx.fillRect(0, 0, 256, 256);
    if (hasHandle) {
      actx.fillStyle = '#000000';
      const hx = 68, hy = 100, hw = 120, hh = 30, r = 15;
      actx.beginPath();
      actx.moveTo(hx + r, hy);
      actx.lineTo(hx + hw - r, hy);
      actx.quadraticCurveTo(hx + hw, hy, hx + hw, hy + r);
      actx.lineTo(hx + hw, hy + hh - r);
      actx.quadraticCurveTo(hx + hw, hy + hh, hx + hw - r, hy + hh);
      actx.lineTo(hx + r, hy + hh);
      actx.quadraticCurveTo(hx, hy + hh, hx, hy + hh - r);
      actx.lineTo(hx, hy + r);
      actx.quadraticCurveTo(hx, hy, hx + r, hy);
      actx.closePath();
      actx.fill();
    }
    const alpha = new THREE.CanvasTexture(alphaCanvas);

    return { plain, printedFront, printedSide, bumpH, bumpV, alpha };
  }, [material, hasHandle, printColor, printText, hasRecycling, hasFragile, hasUpArrows, logoImage, frontAspect, sideAspect]);
};

// ---------------------------------------------------------------------------
// One cardboard panel. Flutes: 'v' runs the corrugation vertically (walls),
// 'h' runs it horizontally (flaps, lids, bottoms).
// ---------------------------------------------------------------------------
interface PanelProps {
  w: number;
  h: number;
  tex: TexSet;
  face?: 'plain' | 'front' | 'side';
  flute?: 'v' | 'h';
  withAlpha?: boolean;
  glue?: boolean;
}

const Panel: React.FC<PanelProps> = ({ w, h, tex, face = 'plain', flute = 'v', withAlpha = false, glue = false }) => {
  const map = face === 'front' ? tex.printedFront : face === 'side' ? tex.printedSide : tex.plain;
  const bump = flute === 'v' ? tex.bumpV : tex.bumpH;
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[w, h, T]} />
      <meshStandardMaterial
        color={glue ? '#a8825a' : '#ffffff'}
        map={map || undefined}
        alphaMap={withAlpha ? (tex.alpha || undefined) : undefined}
        alphaTest={withAlpha ? 0.5 : 0}
        roughness={0.88}
        metalness={0.02}
        side={THREE.DoubleSide}
        bumpMap={glue ? undefined : (bump || undefined)}
        bumpScale={0.012}
      />
    </mesh>
  );
};

// Small metallic staple
const BoxStaple = ({ position }: { position: [number, number, number] }) => (
  <mesh position={position}>
    <boxGeometry args={[0.04, 0.015, 0.015]} />
    <meshStandardMaterial color="#b0bec5" roughness={0.3} metalness={0.8} />
  </mesh>
);

// ---------------------------------------------------------------------------
// A flap hinged on the top or bottom edge of a wall panel.
// `lift` raises the hinge line as the flap folds so an outer (major) flap
// rests one board thickness above the minor flaps it covers — this is what
// prevents the panels from intersecting when the box closes.
// ---------------------------------------------------------------------------
interface FlapProps {
  wallH: number;
  width: number;
  depth: number;
  fold: number;       // 0 open (coplanar with wall) .. 1 closed (horizontal)
  edge: 'top' | 'bottom';
  liftLayers: number; // 0 = innermost layer, 1 = one thickness above, 2 = two
  tex: TexSet;
}

const Flap: React.FC<FlapProps> = ({ wallH, width, depth, fold, edge, liftLayers, tex }) => {
  if (depth <= 0.01) return null;
  const sign = edge === 'top' ? 1 : -1;
  const hingeY = sign * (wallH / 2 + liftLayers * T * fold);
  const angle = sign * -HALF_PI * fold; // fold inward over the opening
  return (
    <group position={[0, hingeY, 0]} rotation={[angle, 0, 0]}>
      <group position={[0, sign * depth / 2, 0]}>
        <Panel w={width} h={depth} tex={tex} face="plain" flute="h" />
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Slotted styles (FEFCO 0200/0201/0202/0203) + telescopic trays (0300/0301).
// Wall chain: FRONT anchors the assembly; RIGHT and BACK wrap to the right,
// LEFT and the glue tab wrap to the left — identical topology to a real
// blank, so foldWalls=0 lays out the true die-cut pattern.
// ---------------------------------------------------------------------------
interface SlottedProps {
  L: number; W: number; H: number;
  style: string; // '200' | '201' | '202' | '203' | '300' | '301'
  p: number;
  tex: TexSet;
  printCoverageBack: boolean;
  printCoverageSide: boolean;
  withHandles: boolean;
  gluing: boolean;
  stapling: boolean;
}

const SlottedBox: React.FC<SlottedProps> = ({ L, W, H, style, p, tex, printCoverageBack, printCoverageSide, withHandles, gluing, stapling }) => {
  const fW = stage(p, 0, 0.5);
  const fMin = stage(p, 0.5, 0.74);
  const overlapping = style === '202' || style === '203';
  // Overlapping styles close one major flap at a time (the second lands on
  // top of the first); meeting flaps close together.
  const fMaj1 = overlapping ? stage(p, 0.74, 0.87) : stage(p, 0.74, 1);
  const fMaj2 = overlapping ? stage(p, 0.87, 1) : fMaj1;

  const minD = Math.min(W / 2, L / 2) - GAP;
  const overlap = Math.min(W * 0.3, Math.max(0.3, W * 0.25));
  const majD = style === '203' ? W - 2 * SLOT
    : style === '202' ? Math.min((W + overlap) / 2, W - 0.1)
    : W / 2 - GAP;
  const hasTop = style === '201' || style === '202' || style === '203';

  const wallAngle = -HALF_PI * fW;

  const majorW = L - 2 * SLOT;
  const minorW = W - 2 * SLOT;

  // FEFCO 300/301 telescopic lid
  const isScope = style === '300' || style === '301';
  const rimH = style === '301' ? H * 0.96 : Math.max(0.4, H * 0.24);
  const clear = 0.07;
  const lidL = L + 2 * clear + 2 * T;
  const lidW = W + 2 * clear + 2 * T;
  const fRim = stage(p, 0.5, 0.75);
  const fDrop = stage(p, 0.75, 1);
  // Lid travel: lies in the blank plane beyond the top flaps while flat,
  // hovers above the tray folding its rims, then descends onto it. The lid
  // counter-rotates against the assembly tilt so it stays world-horizontal.
  const fWalls = stage(p, 0, 0.5);
  const lidBlankY = H / 2 + majD + lidW / 2 + 0.5;
  const lidHoverY = H / 2 + rimH + 1.0;
  const lidSeatY = H / 2 + T / 2 + 0.012;
  const lidY = lidBlankY + (lidHoverY - lidBlankY) * fWalls - (lidHoverY - lidSeatY) * fDrop;
  const lidCounterTilt = HALF_PI * (1 - fWalls);
  const lidRimAngle = HALF_PI * (1 - fRim); // 0 = rims hanging down (closed)

  return (
    <group>
      {/* FRONT (anchor) */}
      <group position={[0, 0, (W / 2) * fW]}>
        <Panel w={L} h={H} tex={tex} face="front" flute="v" />
        {hasTop && <Flap wallH={H} width={majorW} depth={majD} fold={fMaj1} edge="top" liftLayers={1} tex={tex} />}
        <Flap wallH={H} width={majorW} depth={majD} fold={fMaj1} edge="bottom" liftLayers={1} tex={tex} />

        {/* RIGHT (hinged to front's right edge) */}
        <group position={[L / 2, 0, 0]} rotation={[0, -wallAngle, 0]}>
          <group position={[W / 2, 0, 0]}>
            <Panel w={W} h={H} tex={tex} face={printCoverageSide ? 'side' : 'plain'} flute="v" withAlpha={withHandles} />
            {hasTop && <Flap wallH={H} width={minorW} depth={minD} fold={fMin} edge="top" liftLayers={0} tex={tex} />}
            <Flap wallH={H} width={minorW} depth={minD} fold={fMin} edge="bottom" liftLayers={0} tex={tex} />
          </group>

          {/* BACK (hinged to right's far edge) */}
          <group position={[W, 0, 0]} rotation={[0, -wallAngle, 0]}>
            <group position={[L / 2, 0, 0]}>
              <Panel w={L} h={H} tex={tex} face={printCoverageBack ? 'front' : 'plain'} flute="v" />
              {hasTop && <Flap wallH={H} width={majorW} depth={majD} fold={fMaj2} edge="top" liftLayers={overlapping ? 2 : 1} tex={tex} />}
              <Flap wallH={H} width={majorW} depth={majD} fold={fMaj2} edge="bottom" liftLayers={overlapping ? 2 : 1} tex={tex} />
            </group>
          </group>
        </group>

        {/* LEFT (hinged to front's left edge) */}
        <group position={[-L / 2, 0, 0]} rotation={[0, wallAngle, 0]}>
          <group position={[-W / 2, 0, 0]}>
            <Panel w={W} h={H} tex={tex} face={printCoverageSide ? 'side' : 'plain'} flute="v" withAlpha={withHandles} />
            {hasTop && <Flap wallH={H} width={minorW} depth={minD} fold={fMin} edge="top" liftLayers={0} tex={tex} />}
            <Flap wallH={H} width={minorW} depth={minD} fold={fMin} edge="bottom" liftLayers={0} tex={tex} />

            {/* glue tab wraps onto the back wall */}
            <group position={[-W / 2, 0, 0]} rotation={[0, -wallAngle, 0]}>
              <group position={[0.15, 0, 0]}>
                <Panel w={0.3} h={H - 0.1} tex={tex} glue />
                {gluing && (
                  <group position={[0, 0, T / 2 + 0.004]}>
                    {[0.2, 0, -0.2].map(f => (
                      <mesh key={f} position={[0, H * f, 0]}>
                        <cylinderGeometry args={[0.012, 0.012, H * 0.18, 8]} />
                        <meshStandardMaterial color="#e5c158" roughness={0.15} transparent opacity={0.75} />
                      </mesh>
                    ))}
                  </group>
                )}
              </group>
            </group>
            {stapling && (
              <group position={[-W / 2, 0, 0]}>
                {[0.3, 0.1, -0.1, -0.3].map(f => <BoxStaple key={f} position={[-0.04, H * f, T]} />)}
              </group>
            )}
          </group>
        </group>
      </group>

      {/* Telescopic lid for 0300/0301 */}
      {isScope && (
        <group position={[0, lidY, 0]} rotation={[lidCounterTilt, 0, 0]}>
          <group rotation={[HALF_PI, 0, 0]}>
            <Panel w={lidL} h={lidW} tex={tex} face="plain" flute="h" />
          </group>
          {/* four rims: hang down when closed (angle 0), splay flat when open */}
          <group position={[0, 0, lidW / 2]} rotation={[-lidRimAngle, 0, 0]}>
            <group position={[0, -rimH / 2, 0]}>
              <Panel w={lidL} h={rimH} tex={tex} face="plain" flute="h" />
            </group>
          </group>
          <group position={[0, 0, -lidW / 2]} rotation={[lidRimAngle, 0, 0]}>
            <group position={[0, -rimH / 2, 0]}>
              <Panel w={lidL} h={rimH} tex={tex} face="plain" flute="h" />
            </group>
          </group>
          <group position={[lidL / 2, 0, 0]} rotation={[0, 0, lidRimAngle]}>
            <group position={[0, -rimH / 2, 0]} rotation={[0, HALF_PI, 0]}>
              <Panel w={lidW - 2 * SLOT} h={rimH} tex={tex} face="plain" flute="h" />
            </group>
          </group>
          <group position={[-lidL / 2, 0, 0]} rotation={[0, 0, -lidRimAngle]}>
            <group position={[0, -rimH / 2, 0]} rotation={[0, HALF_PI, 0]}>
              <Panel w={lidW - 2 * SLOT} h={rimH} tex={tex} face="plain" flute="h" />
            </group>
          </group>
        </group>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// FEFCO 0427 die-cut mailer (simplified, recognizable shape).
// Bottom-anchored: the blank already lies flat at fold 0.
// Box is centred: bottom panel at y=-H/2, walls rise to +H/2.
// ---------------------------------------------------------------------------
interface OnePieceProps {
  L: number; W: number; H: number;
  p: number;
  tex: TexSet;
  printCoverageSide: boolean;
}

const MailerBox: React.FC<OnePieceProps> = ({ L, W, H, p, tex, printCoverageSide }) => {
  const fSide = stage(p, 0, 0.28);
  const fTab = stage(p, 0.28, 0.44);
  const fFB = stage(p, 0.44, 0.6);
  const fLid = stage(p, 0.6, 0.95);
  const fTuck = stage(p, 0.72, 0.9);

  const tabD = Math.min(W * 0.28, L * 0.25);
  const lidDepth = W - T - 0.04;
  const lidWidth = L + 2 * T + 0.04;
  const skirtD = H * 0.8;
  const tuckD = Math.min(H * 0.7, W * 0.45);

  const baseY = -H / 2 + T / 2;

  return (
    <group position={[0, baseY, 0]}>
      {/* bottom */}
      <group rotation={[HALF_PI, 0, 0]}>
        <Panel w={L} h={W} tex={tex} face="plain" flute="h" />
      </group>

      {/* side walls with dust tabs */}
      {[1, -1].map(s => (
        <group key={'sw' + s} position={[s * L / 2, 0, 0]} rotation={[0, 0, s * -HALF_PI * (1 - fSide)]}>
          <group position={[0, H / 2, 0]}>
            <group rotation={[0, HALF_PI, 0]}>
              <Panel w={W - 2 * SLOT} h={H} tex={tex} face={printCoverageSide ? 'side' : 'plain'} flute="v" />
            </group>
            {/* dust tabs fold inward against the future front/back walls */}
            {[1, -1].map(zs => (
              <group key={'tab' + zs} position={[0, 0, zs * (W / 2 - T - 0.012)]} rotation={[0, zs * s * -HALF_PI * fTab, 0]}>
                <group position={[0, 0, zs * tabD / 2]} rotation={[0, HALF_PI, 0]}>
                  <Panel w={tabD} h={H - 2 * SLOT} tex={tex} face="plain" flute="h" />
                </group>
              </group>
            ))}
          </group>
        </group>
      ))}

      {/* front wall */}
      <group position={[0, 0, W / 2]} rotation={[HALF_PI * (1 - fFB), 0, 0]}>
        <group position={[0, H / 2, 0]}>
          <Panel w={L} h={H} tex={tex} face="front" flute="v" />
        </group>
      </group>

      {/* back wall + lid + skirts + tuck */}
      <group position={[0, 0, -W / 2]} rotation={[-HALF_PI * (1 - fFB), 0, 0]}>
        <group position={[0, H / 2, 0]}>
          <Panel w={L} h={H} tex={tex} face="plain" flute="v" />
          {/* lid hinged on the back wall's top edge */}
          <group position={[0, H / 2 + 0.012 * fLid, 0]} rotation={[HALF_PI * fLid, 0, 0]}>
            <group position={[0, lidDepth / 2, 0]}>
              <Panel w={lidWidth} h={lidDepth} tex={tex} face="plain" flute="h" />
              {/* side skirts fold down outside the side walls */}
              {[1, -1].map(s => (
                <group key={'sk' + s} position={[s * lidWidth / 2, 0, 0]} rotation={[0, -s * HALF_PI * fTuck, 0]}>
                  <group position={[s * skirtD / 2, 0, 0]}>
                    <Panel w={skirtD} h={lidDepth - 0.15} tex={tex} face="plain" flute="h" />
                  </group>
                </group>
              ))}
              {/* front tuck flap slides inside the front wall */}
              <group position={[0, lidDepth / 2, 0]} rotation={[HALF_PI * fTuck, 0, 0]}>
                <group position={[0, tuckD / 2, 0]}>
                  <Panel w={lidWidth - 2 * skirtTrim} h={tuckD} tex={tex} face="plain" flute="h" />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
const skirtTrim = 0.12;

// ---------------------------------------------------------------------------
// FEFCO 0410 wrap-around folder (simplified). Bottom-anchored.
// Strip: topB / back wall / bottom / front wall / topA, with end-closing
// flaps on the walls' vertical edges.
// ---------------------------------------------------------------------------
const WrapBox: React.FC<OnePieceProps> = ({ L, W, H, p, tex, printCoverageSide }) => {
  const fFB = stage(p, 0, 0.45);
  const fEnd = stage(p, 0.45, 0.68);
  const fA = stage(p, 0.68, 0.84);
  const fB = stage(p, 0.84, 1);

  const endD = W / 2 - GAP;
  const topD = W * 0.6;
  const baseY = -H / 2 + T / 2;

  const wall = (zs: 1 | -1, fold: number, topFold: number, lift: number, printed: boolean) => (
    <group position={[0, 0, zs * W / 2]} rotation={[zs * HALF_PI * (1 - fold), 0, 0]}>
      <group position={[0, H / 2, 0]}>
        <Panel w={L} h={H} tex={tex} face={printed ? 'front' : 'plain'} flute="v" />
        {/* end-closing flaps on the wall's vertical edges */}
        {[1, -1].map(xs => (
          <group key={'e' + xs} position={[xs * (L / 2 - SLOT), 0, 0]} rotation={[0, xs * zs * HALF_PI * fEnd, 0]}>
            <group position={[xs * endD / 2, 0, 0]}>
              <Panel w={endD} h={H - 2 * SLOT} tex={tex} face={printCoverageSide ? 'side' : 'plain'} flute="h" />
            </group>
          </group>
        ))}
        {/* top half-panel folds inward over the opening */}
        <group position={[0, H / 2 + lift * T * topFold, 0]} rotation={[-zs * HALF_PI * topFold, 0, 0]}>
          <group position={[0, topD / 2, 0]}>
            <Panel w={L - 2 * SLOT} h={topD} tex={tex} face="plain" flute="h" />
          </group>
        </group>
      </group>
    </group>
  );

  return (
    <group position={[0, baseY, 0]}>
      <group rotation={[HALF_PI, 0, 0]}>
        <Panel w={L} h={W} tex={tex} face="plain" flute="h" />
      </group>
      {wall(1, fFB, fA, 0, true)}
      {wall(-1, fFB, fB, 1, false)}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Dimension line with floating label
// ---------------------------------------------------------------------------
const DimensionOverlay = ({ start, end, label, offset, dir }: {
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  offset: number;
  dir: 'x' | 'y' | 'z';
}) => {
  const linePoints = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const shift = new THREE.Vector3();
    if (dir === 'x') shift.set(0, offset, 0);
    else shift.set(offset, 0, 0);
    const fStart = s.clone().add(shift);
    const fEnd = e.clone().add(shift);
    const mid = fStart.clone().lerp(fEnd, 0.5);
    const tick = (v: THREE.Vector3) => dir === 'x'
      ? [new THREE.Vector3(v.x, v.y - 0.1, v.z), new THREE.Vector3(v.x, v.y + 0.1, v.z)]
      : [new THREE.Vector3(v.x - 0.1, v.y, v.z), new THREE.Vector3(v.x + 0.1, v.y, v.z)];
    const mk = (pts: THREE.Vector3[], color: number) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
    return { mainLine: mk([fStart, fEnd], 0x2d3748), tickSLine: mk(tick(fStart), 0x718096), tickELine: mk(tick(fEnd), 0x718096), mid };
  }, [start, end, offset, dir]);

  useEffect(() => {
    return () => {
      [linePoints.mainLine, linePoints.tickSLine, linePoints.tickELine].forEach(l => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      });
    };
  }, [linePoints]);

  return (
    <group>
      <primitive object={linePoints.mainLine} />
      <primitive object={linePoints.tickSLine} />
      <primitive object={linePoints.tickELine} />
      <Html position={[linePoints.mid.x, linePoints.mid.y, linePoints.mid.z]} center>
        <div style={{ backgroundColor: 'rgba(15,23,42,0.88)', color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'monospace', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
          {label}
        </div>
      </Html>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Main component (public interface unchanged)
// ---------------------------------------------------------------------------
interface BoxConfigProps {
  length?: number;
  width?: number;
  height?: number;
  material?: string;
  printing?: boolean;
  dieCutting?: boolean;
  gluing?: boolean;
  stapling?: boolean;
  foldPercent?: number;
  fefcoCode?: string; // '200'|'201'|'202'|'203'|'300'|'301'|'427'|'410'
  printColor?: string;
  printText?: string;
  hasRecycling?: boolean;
  hasFragile?: boolean;
  hasUpArrows?: boolean;
  printCoverage?: string;
  viewMode?: 'box' | 'flat-box';
  logoUrl?: string;
}

const BoxConfigurator3D: React.FC<BoxConfigProps> = ({
  length = 4,
  width = 3,
  height = 2,
  material = 'Testliner',
  printing = false,
  dieCutting = false,
  gluing = true,
  stapling = false,
  foldPercent = 1.0,
  fefcoCode = '201',
  printColor = '#1a365d',
  printText = 'VRANCART',
  hasRecycling = false,
  hasFragile = false,
  hasUpArrows = false,
  printCoverage = 'front',
  viewMode = 'box',
  logoUrl = '',
}) => {
  const [logoImage, setLogoImage] = React.useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!logoUrl) { setLogoImage(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = logoUrl;
    img.onload = () => setLogoImage(img);
    img.onerror = () => { console.error('Failed to load custom brand logo image:', logoUrl); setLogoImage(null); };
  }, [logoUrl]);

  const L = length, W = width, H = height;
  const tex = useCardboardTextures(
    material, dieCutting, printColor, printText,
    hasRecycling, hasFragile, hasUpArrows, logoImage,
    printing ? L / H : 1, printing ? W / H : 1
  );

  // Blank front face: printed when printing is on; back/sides per coverage.
  const texForBox: TexSet = useMemo(() => ({
    ...tex,
    printedFront: printing ? tex.printedFront : tex.plain,
    printedSide: printing && printCoverage === 'all' ? tex.printedSide : tex.plain,
  }), [tex, printing, printCoverage]);
  const coverBack = printing && (printCoverage === 'front-back' || printCoverage === 'all');
  const coverSide = printing && printCoverage === 'all';

  const numericFold = typeof foldPercent === 'string' ? parseFloat(foldPercent as any) : foldPercent;
  const p = Math.min(1, Math.max(0, numericFold));

  const style = fefcoCode || '201';
  const bottomAnchored = style === '427' || style === '410';
  const isScope = style === '300' || style === '301';

  const fW = stage(p, 0, 0.5);

  // Grounding. Slotted blanks tilt from a vertical sheet down onto the floor;
  // bottom-anchored styles (mailer/wrap) are already flat at fold 0.
  const groundY = -H / 2 - 2 * T - 0.012;
  const slottedFlatY = groundY + T / 2 + 0.008;
  const groupY = bottomAnchored ? -1.5 * T : slottedFlatY * (1 - fW);
  const groupTilt = bottomAnchored ? 0 : -HALF_PI * (1 - fW);

  // The shadow floor follows the model's lowest point: open bottom flaps
  // hang below the box and the tilting blank sweeps below its pivot, so a
  // fixed floor would slice through them. Tracking the live lower bound
  // keeps the shadow hugging the cardboard at every fold stage instead.
  const gMinD = Math.min(W / 2, L / 2) - GAP;
  const gOverlap = Math.min(W * 0.3, Math.max(0.3, W * 0.25));
  const gMajD = style === '203' ? W - 2 * SLOT
    : style === '202' ? Math.min((W + gOverlap) / 2, W - 0.1)
    : W / 2 - GAP;
  const gBotMax = Math.max(gMinD, gMajD);
  const gOverlapping = style === '202' || style === '203';
  const gFMin = stage(p, 0.5, 0.74);
  const gFM1 = gOverlapping ? stage(p, 0.74, 0.87) : stage(p, 0.74, 1);
  const gFM2 = gOverlapping ? stage(p, 0.87, 1) : gFM1;
  const depthBelow = fW < 1
    ? T / 2 + (H / 2 + gBotMax) * Math.cos(HALF_PI * (1 - fW)) + 2 * T * fW
    : H / 2 + Math.max(gMinD * Math.cos(HALF_PI * gFMin), gMajD * Math.cos(HALF_PI * gFM1), gMajD * Math.cos(HALF_PI * gFM2)) + 2 * T;
  const floorY = bottomAnchored ? groundY : Math.min(groundY, groupY - depthBelow - 0.004);

  // Camera fit: interpolates between the flat-blank footprint and the folded
  // box extent as the slider moves.
  const majDFit = style === '203' ? W : style === '202' ? W * 0.65 : W / 2;
  const flatExtent = bottomAnchored
    ? Math.max(L + 2 * H + 2, 2 * W + 3 * H + 1)
    : Math.max(2 * L + 2 * W + 1.2, H + 2 * majDFit + 0.5) + (isScope ? (W + 2) : 0);
  // Vertical extent of the standing box follows the open flaps: top flaps
  // shrink as they close, hanging bottom flaps are covered by depthBelow.
  const hasTopFit = !(style === '200' || isScope || bottomAnchored);
  const topOpenFit = hasTopFit ? Math.max(gMinD * (1 - gFMin), gMajD * (1 - gFM1)) : 0;
  const foldedExtent = bottomAnchored
    ? Math.max(L, W, H + W * 0.8) + 1.2
    : Math.max(L, W, H / 2 + topOpenFit + depthBelow) + (isScope ? 1.5 : 0);
  const singleFit = flatExtent * 1.35 * (1 - fW) + foldedExtent * 2.4 * fW;
  const dualFit = flatExtent * 1.2 + foldedExtent * 0.8;
  const fitRadius = Math.max(7, viewMode === 'flat-box' ? dualFit : singleFit);

  // The slotted blank extends asymmetrically to +x (right+back+left panels
  // chain to one side); re-centre it while flat so it orbits nicely.
  const blankShiftX = bottomAnchored ? 0 : -(L / 2) * (1 - fW);

  const [autoRotate, setAutoRotate] = React.useState(true);
  const controlsRef = useRef<any>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const handleInteractionStart = () => {
    setAutoRotate(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };
  const handleInteractionEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAutoRotate(true), 6000);
  };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const assembly = (foldP: number) => bottomAnchored
    ? (style === '427'
      ? <MailerBox L={L} W={W} H={H} p={foldP} tex={texForBox} printCoverageSide={coverSide} />
      : <WrapBox L={L} W={W} H={H} p={foldP} tex={texForBox} printCoverageSide={coverSide} />)
    : <SlottedBox L={L} W={W} H={H} style={style} p={foldP} tex={texForBox} printCoverageBack={coverBack} printCoverageSide={coverSide} withHandles={dieCutting && !isScope} gluing={gluing} stapling={stapling} />;

  // Flat blank presentation for the side-by-side view
  const flatBlank = bottomAnchored ? (
    <group position={[-(L + 2 * H) * 0.7 - L / 2, 0, 0]}>
      <group position={[0, -1.5 * T, 0]}>{assembly(0)}</group>
    </group>
  ) : (
    <group position={[-(L + W) - 1.2, slottedFlatY, 0]} rotation={[-HALF_PI, 0, 0]}>
      {assembly(0)}
    </group>
  );

  return (
    <Canvas camera={{ position: [9, 7, 9], fov: 42 }} shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}>
      <CameraRig fitRadius={fitRadius} controlsRef={controlsRef} />
      <color attach="background" args={['#e9eef5']} />
      <fog attach="fog" args={['#e9eef5', fitRadius * 2.2, fitRadius * 5]} />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 5]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02}>
        <orthographicCamera attach="shadow-camera" args={[-24, 24, 18, -18, 1, 60]} />
      </directionalLight>
      <directionalLight position={[-6, 5, -6]} intensity={0.3} />
      <Environment frames={1} resolution={64}>
        <Lightformer intensity={0.9} rotation-x={HALF_PI} position={[0, 5, 0]} scale={[12, 12, 1]} />
        <Lightformer intensity={0.45} rotation-y={HALF_PI} position={[-8, 3, 0]} scale={[10, 4, 1]} />
        <Lightformer intensity={0.45} rotation-y={-HALF_PI} position={[8, 3, 0]} scale={[10, 4, 1]} />
      </Environment>

      {/* studio floor: shadow catcher only — it can never occlude geometry,
          and it tracks the model's lowest point while flaps hang open */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} receiveShadow>
        <circleGeometry args={[Math.max(40, fitRadius * 2.4), 64]} />
        <shadowMaterial transparent opacity={0.22} />
      </mesh>

      <group>
        {viewMode === 'box' && (
          <group position={[blankShiftX, groupY, 0]} rotation={[groupTilt, 0, 0]}>
            {assembly(p)}
          </group>
        )}

        {viewMode === 'flat-box' && (
          <group>
            {flatBlank}
            <group position={[L / 2 + 0.5, 0, 0]}>
              <group position={[0, groupY, 0]} rotation={[groupTilt, 0, 0]}>
                {assembly(p)}
              </group>
            </group>
          </group>
        )}

        {/* dimension overlays once the box stands upright */}
        {p >= 0.5 && (
          <group position={viewMode === 'flat-box' ? [L / 2 + 0.5, 0, 0] : [0, 0, 0]}>
            <DimensionOverlay start={[-L / 2, -H / 2, W / 2]} end={[L / 2, -H / 2, W / 2]} label={`${Math.round(L * 100)} mm`} offset={-0.6} dir="x" />
            <DimensionOverlay start={[-L / 2, -H / 2, W / 2]} end={[-L / 2, H / 2, W / 2]} label={`${Math.round(H * 100)} mm`} offset={-0.6} dir="y" />
            <DimensionOverlay start={[L / 2, -H / 2, W / 2]} end={[L / 2, -H / 2, -W / 2]} label={`${Math.round(W * 100)} mm`} offset={0.6} dir="z" />
          </group>
        )}
      </group>

      <OrbitControls
        ref={controlsRef}
        minDistance={2.5}
        maxDistance={70}
        autoRotate={autoRotate}
        autoRotateSpeed={0.8}
        maxPolarAngle={HALF_PI - 0.03}
        onStart={handleInteractionStart}
        onEnd={handleInteractionEnd}
      />
    </Canvas>
  );
};

export default BoxConfigurator3D;
