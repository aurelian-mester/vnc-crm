import React, { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// Procedural Cardboard & Custom Canvas Texture Generator Hook
const useCardboardTextures = (
  material: string,
  hasHandle: boolean,
  printColor: string,
  printText: string,
  hasRecycling: boolean,
  hasFragile: boolean,
  hasUpArrows: boolean
) => {
  return useMemo(() => {
    // 1. Generate Canvas for Plain Cardboard
    const plainCanvas = document.createElement('canvas');
    plainCanvas.width = 512;
    plainCanvas.height = 512;
    const pctx = plainCanvas.getContext('2d');
    if (!pctx) return { plainTexture: null, printedTexture: null, alphaTexture: null };

    // Set up material grade aesthetics (radial gradients, custom fiber tones, crease outlines)
    let centerColor = '#dbb07d'; // Premium golden kraft brown
    let edgeColor = '#bf9460';
    let fiberColor = 'rgba(92, 61, 37, 0.18)';
    let stripeColor = 'rgba(74, 46, 22, 0.06)';
    let creaseColor = 'rgba(102, 71, 41, 0.48)';
    let dashColor = 'rgba(102, 71, 41, 0.32)';

    if (material === 'Schrenz') {
      centerColor = '#a3a3a3'; // Recycled cool gray
      edgeColor = '#808080';
      fiberColor = 'rgba(40, 40, 40, 0.22)';
      stripeColor = 'rgba(30, 30, 30, 0.08)';
      creaseColor = 'rgba(50, 50, 50, 0.5)';
      dashColor = 'rgba(50, 50, 50, 0.35)';
    } else if (material === 'Wellenstoff') {
      centerColor = '#c49f76'; // Coarse wave fluting brown
      edgeColor = '#9e7a50';
      fiberColor = 'rgba(64, 40, 20, 0.24)';
      stripeColor = 'rgba(58, 36, 16, 0.09)';
      creaseColor = 'rgba(74, 48, 25, 0.5)';
      dashColor = 'rgba(74, 48, 25, 0.35)';
    }

    // Fill base cardboard color with a radial gradient for depth
    const gradient = pctx.createRadialGradient(256, 256, 60, 256, 256, 360);
    gradient.addColorStop(0, centerColor);
    gradient.addColorStop(1, edgeColor);
    pctx.fillStyle = gradient;
    pctx.fillRect(0, 0, 512, 512);

    // Draw realistic crease borders and fold markings (material themed)
    pctx.strokeStyle = creaseColor;
    pctx.lineWidth = 8;
    pctx.strokeRect(0, 0, 512, 512);

    // Dashed inner crease lines
    pctx.strokeStyle = dashColor;
    pctx.lineWidth = 4;
    pctx.setLineDash([12, 8]);
    pctx.strokeRect(8, 8, 496, 496);
    pctx.setLineDash([]);

    // Subtle grain noise
    for (let i = 0; i < 15000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const val = Math.random() * 0.1;
      pctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${val})` : `rgba(0,0,0,${val})`;
      pctx.fillRect(x, y, 1, 1);
    }

    // Cardboard fiber specks (material themed)
    pctx.fillStyle = fiberColor;
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const w = Math.random() * 3 + 1;
      const h = Math.random() * 1.5 + 1;
      pctx.fillRect(x, y, w, h);
    }

    // Secondary light fiber flecks for recycled look
    const lightFiberColor = material === 'Schrenz' ? 'rgba(230, 230, 230, 0.25)' : 'rgba(255, 255, 255, 0.15)';
    pctx.fillStyle = lightFiberColor;
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const w = Math.random() * 2 + 1;
      const h = Math.random() * 1 + 1;
      pctx.fillRect(x, y, w, h);
    }

    // Horizontal fiber lines (corrugation pattern look)
    pctx.fillStyle = stripeColor;
    for (let y = 0; y < 512; y += 6) {
      pctx.fillRect(0, y, 512, 3.0);
    }

    const plainTex = new THREE.CanvasTexture(plainCanvas);
    plainTex.colorSpace = THREE.SRGBColorSpace;
    plainTex.needsUpdate = true; // Force GPU upload

    // 2. Generate Canvas for Printed Cardboard
    const printedCanvas = document.createElement('canvas');
    printedCanvas.width = 512;
    printedCanvas.height = 512;
    const sctx = printedCanvas.getContext('2d');
    if (!sctx) return { plainTexture: plainTex, printedTexture: null, alphaTexture: null };

    // Copy plain canvas background to preserve identical cardboard noise
    sctx.drawImage(plainCanvas, 0, 0);

    // Helper to convert hex to rgba
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Realistic print ink blending simulation using MULTIPLY composite mode
    sctx.globalCompositeOperation = 'multiply';

    const inkColor = hexToRgba(printColor, 0.88);

    // Draw stamp border
    sctx.strokeStyle = hexToRgba(printColor, 0.65);
    sctx.lineWidth = 6;
    sctx.strokeRect(50, 110, 412, 292);

    sctx.strokeStyle = hexToRgba(printColor, 0.55);
    sctx.lineWidth = 2;
    sctx.strokeRect(60, 120, 392, 272);

    // Draw main custom brand text
    sctx.fillStyle = hexToRgba(printColor, 0.92);
    sctx.font = 'bold 34px monospace';
    sctx.textAlign = 'center';
    sctx.fillText(printText || 'VRANCART', 256, 185);

    // Sub-labels
    sctx.fillStyle = hexToRgba(printColor, 0.75);
    sctx.font = 'bold 12px monospace';
    sctx.fillText('DO NOT DOUBLE STACK', 256, 225);
    sctx.fillText('FRAGILE - HANDLE WITH CARE', 256, 245);

    // Draw custom symbols centered at the bottom of the stamp
    const drawUpArrows = (x: number, y: number) => {
      sctx.strokeStyle = inkColor;
      sctx.lineWidth = 3;
      // Baseline
      sctx.beginPath();
      sctx.moveTo(x - 18, y + 15);
      sctx.lineTo(x + 18, y + 15);
      sctx.stroke();
      // Arrow 1 (left)
      sctx.beginPath();
      sctx.moveTo(x - 9, y + 10);
      sctx.lineTo(x - 9, y - 15);
      sctx.stroke();
      sctx.beginPath();
      sctx.moveTo(x - 14, y - 5);
      sctx.lineTo(x - 9, y - 15);
      sctx.lineTo(x - 4, y - 5);
      sctx.stroke();
      // Arrow 2 (right)
      sctx.beginPath();
      sctx.moveTo(x + 9, y + 10);
      sctx.lineTo(x + 9, y - 15);
      sctx.stroke();
      sctx.beginPath();
      sctx.moveTo(x + 4, y - 5);
      sctx.lineTo(x + 9, y - 15);
      sctx.lineTo(x + 14, y - 5);
      sctx.stroke();
    };

    const drawFragile = (x: number, y: number) => {
      sctx.strokeStyle = inkColor;
      sctx.lineWidth = 3;
      // Bowl top rim
      sctx.beginPath();
      sctx.moveTo(x - 13, y - 15);
      sctx.lineTo(x + 13, y - 15);
      sctx.stroke();
      // Bowl U-shape bowl
      sctx.beginPath();
      sctx.arc(x, y - 15, 13, 0, Math.PI);
      sctx.stroke();
      // Stem
      sctx.beginPath();
      sctx.moveTo(x, y);
      sctx.lineTo(x, y + 12);
      sctx.stroke();
      // Base
      sctx.beginPath();
      sctx.moveTo(x - 10, y + 12);
      sctx.lineTo(x + 10, y + 12);
      sctx.stroke();
      // Diagonal crack
      sctx.strokeStyle = inkColor;
      sctx.lineWidth = 1.5;
      sctx.beginPath();
      sctx.moveTo(x - 4, y - 15);
      sctx.lineTo(x - 1, y - 5);
      sctx.lineTo(x - 7, y + 2);
      sctx.stroke();
    };

    const drawRecycling = (x: number, y: number) => {
      sctx.strokeStyle = inkColor;
      sctx.lineWidth = 3;
      const r = 15;
      for (let angle = 0; angle < 2 * Math.PI; angle += (2 * Math.PI) / 3) {
        // Draw the curved arc of the arrow
        sctx.beginPath();
        sctx.arc(x, y, r, angle + 0.2, angle + (2 * Math.PI) / 3 - 0.45);
        sctx.stroke();

        // Calculate end point of the arc where arrowhead goes
        const endAngle = angle + (2 * Math.PI) / 3 - 0.45;
        const ax = x + r * Math.cos(endAngle);
        const ay = y + r * Math.sin(endAngle);

        // Tangent angle at the end of the arc (pointing counter-clockwise)
        const psi = endAngle + Math.PI / 2;

        // Draw triangular arrowhead
        sctx.fillStyle = inkColor;
        sctx.beginPath();
        sctx.moveTo(ax, ay); // Tip of arrow at the end of the arc

        // Back-left of the arrowhead
        const arrowLength = 7;
        const arrowHalfAngle = 0.5; // approx 28 degrees
        const x1 = ax - arrowLength * Math.cos(psi - arrowHalfAngle);
        const y1 = ay - arrowLength * Math.sin(psi - arrowHalfAngle);
        sctx.lineTo(x1, y1);

        // Back-right of the arrowhead
        const x2 = ax - arrowLength * Math.cos(psi + arrowHalfAngle);
        const y2 = ay - arrowLength * Math.sin(psi + arrowHalfAngle);
        sctx.lineTo(x2, y2);

        sctx.closePath();
        sctx.fill();
      }
      sctx.fillStyle = inkColor;
      sctx.font = 'bold 8px monospace';
      sctx.textAlign = 'center';
      sctx.fillText('20', x, y + 2.5);
      sctx.font = 'bold 6px monospace';
      sctx.fillText('PAP', x, y + 9);
    };

    const activeSymbols = [];
    if (hasRecycling) activeSymbols.push('recycling');
    if (hasFragile) activeSymbols.push('fragile');
    if (hasUpArrows) activeSymbols.push('upArrows');

    const symbolY = 320;
    if (activeSymbols.length === 1) {
      if (activeSymbols[0] === 'recycling') drawRecycling(256, symbolY);
      if (activeSymbols[0] === 'fragile') drawFragile(256, symbolY);
      if (activeSymbols[0] === 'upArrows') drawUpArrows(256, symbolY);
    } else if (activeSymbols.length === 2) {
      activeSymbols.forEach((sym, idx) => {
        const sx = idx === 0 ? 200 : 312;
        if (sym === 'recycling') drawRecycling(sx, symbolY);
        if (sym === 'fragile') drawFragile(sx, symbolY);
        if (sym === 'upArrows') drawUpArrows(sx, symbolY);
      });
    } else if (activeSymbols.length === 3) {
      drawRecycling(160, symbolY);
      drawFragile(256, symbolY);
      drawUpArrows(352, symbolY);
    }

    // Apply flexographic print ink-skipping / fiber knockout effect
    // We switch back to normal composite mode and overlay tiny base cardboard-colored dots to create rough ink gaps
    sctx.globalCompositeOperation = 'source-over';
    sctx.fillStyle = edgeColor;
    for (let i = 0; i < 4500; i++) {
      const x = 50 + Math.random() * 412;
      const y = 110 + Math.random() * 292;
      const size = Math.random() * 1.5 + 0.5; // microscopic fiber knockout
      sctx.fillRect(x, y, size, size);
    }

    const printedTex = new THREE.CanvasTexture(printedCanvas);
    printedTex.colorSpace = THREE.SRGBColorSpace;
    printedTex.needsUpdate = true; // Force GPU upload

    // 3. Alpha Map Canvas for Handle Holes
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 256;
    alphaCanvas.height = 256;
    const actx = alphaCanvas.getContext('2d');
    if (!actx) return { plainTexture: plainTex, printedTexture: printedTex, alphaTexture: null };

    // Standard panel is fully opaque (white)
    actx.fillStyle = '#ffffff';
    actx.fillRect(0, 0, 256, 256);

    if (hasHandle) {
      // Draw transparent cutout slot (black)
      actx.fillStyle = '#000000';
      const hx = 68;
      const hy = 113;
      const hw = 120;
      const hh = 30;
      const r = 15; // rounded corner radius

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

    const alphaTex = new THREE.CanvasTexture(alphaCanvas);
    alphaTex.needsUpdate = true; // Force GPU upload
    return { plainTexture: plainTex, printedTexture: printedTex, alphaTexture: alphaTex };
  }, [material, hasHandle, printColor, printText, hasRecycling, hasFragile, hasUpArrows]);
};

// Panel component holding geometry, textures, and flaps
interface PanelProps {
  width: number;
  height: number;
  thickness: number;
  colorTexture: THREE.CanvasTexture | null;
  alphaTexture: THREE.CanvasTexture | null;
  isGlueTab?: boolean;
}

const CardboardPanel: React.FC<PanelProps> = ({
  width,
  height,
  thickness,
  colorTexture,
  alphaTexture,
  isGlueTab = false,
}) => {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[width, height, thickness]} />
      <meshStandardMaterial
        color={isGlueTab ? '#9c7346' : '#ffffff'}
        map={colorTexture || undefined}
        alphaMap={alphaTexture || undefined}
        transparent={!!alphaTexture && !isGlueTab}
        roughness={0.9}
        metalness={0.0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// Horizontal/Vertical Dimension Line
const DimensionOverlay = ({
  start,
  end,
  label,
  offset,
  dir
}: {
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
    else if (dir === 'y') shift.set(offset, 0, 0);
    else if (dir === 'z') shift.set(offset, 0, 0);

    const fStart = s.clone().add(shift);
    const fEnd = e.clone().add(shift);
    const mid = fStart.clone().lerp(fEnd, 0.5);

    // Ends vertical ticks
    const tickStart = dir === 'x' 
      ? [new THREE.Vector3(fStart.x, fStart.y - 0.1, fStart.z), new THREE.Vector3(fStart.x, fStart.y + 0.1, fStart.z)]
      : [new THREE.Vector3(fStart.x - 0.1, fStart.y, fStart.z), new THREE.Vector3(fStart.x + 0.1, fStart.y, fStart.z)];
      
    const tickEnd = dir === 'x'
      ? [new THREE.Vector3(fEnd.x, fEnd.y - 0.1, fEnd.z), new THREE.Vector3(fEnd.x, fEnd.y + 0.1, fEnd.z)]
      : [new THREE.Vector3(fEnd.x - 0.1, fEnd.y, fEnd.z), new THREE.Vector3(fEnd.x + 0.1, fEnd.y, fEnd.z)];

    // Construct lines imperatively to avoid JSX TS typings bugs with bufferAttribute
    const mainGeometry = new THREE.BufferGeometry().setFromPoints([fStart, fEnd]);
    const mainMaterial = new THREE.LineBasicMaterial({ color: 0x2d3748 });
    const mainLine = new THREE.Line(mainGeometry, mainMaterial);

    const tickSGeometry = new THREE.BufferGeometry().setFromPoints(tickStart);
    const tickSMaterial = new THREE.LineBasicMaterial({ color: 0x718096 });
    const tickSLine = new THREE.Line(tickSGeometry, tickSMaterial);

    const tickEGeometry = new THREE.BufferGeometry().setFromPoints(tickEnd);
    const tickEMaterial = new THREE.LineBasicMaterial({ color: 0x718096 });
    const tickELine = new THREE.Line(tickEGeometry, tickEMaterial);

    return { mainLine, tickSLine, tickELine, mid };
  }, [start, end, offset, dir]);

  // Clean up geometries/materials on unmount to prevent WebGL leaks
  useEffect(() => {
    return () => {
      linePoints.mainLine.geometry.dispose();
      (linePoints.mainLine.material as THREE.Material).dispose();
      linePoints.tickSLine.geometry.dispose();
      (linePoints.tickSLine.material as THREE.Material).dispose();
      linePoints.tickELine.geometry.dispose();
      (linePoints.tickELine.material as THREE.Material).dispose();
    };
  }, [linePoints]);

  return (
    <group>
      <primitive object={linePoints.mainLine} />
      <primitive object={linePoints.tickSLine} />
      <primitive object={linePoints.tickELine} />
      {/* Floating Label */}
      <Html position={[linePoints.mid.x, linePoints.mid.y, linePoints.mid.z]} center>
        <div style={{
          backgroundColor: '#1a365d',
          color: '#ffffff',
          padding: '3px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
          border: '1px solid #2b6cb0',
          fontFamily: 'monospace'
        }}>
          {label}
        </div>
      </Html>
    </group>
  );
};

// Staple component (small metallic wire mesh)
const BoxStaple = ({ position }: { position: [number, number, number] }) => (
  <mesh position={position}>
    <boxGeometry args={[0.04, 0.015, 0.015]} />
    <meshStandardMaterial color="#b0bec5" roughness={0.3} metalness={0.8} />
  </mesh>
);

interface BoxConfigProps {
  length?: number;    // scaled dimensions in decimeters (e.g. 4.0 = 400mm)
  width?: number;
  height?: number;
  material?: string;
  printing?: boolean;
  dieCutting?: boolean;
  gluing?: boolean;
  stapling?: boolean;
  foldPercent?: number; // 0 (flat pattern) to 1 (fully folded box)
  fefcoCode?: string;  // "201" | "200" | "203" | "300"
  printColor?: string;
  printText?: string;
  hasRecycling?: boolean;
  hasFragile?: boolean;
  hasUpArrows?: boolean;
  printCoverage?: string;
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
}) => {
  // Generate textures once for the entire scene (optimizes rendering)
  const { plainTexture, printedTexture, alphaTexture } = useCardboardTextures(
    material,
    dieCutting,
    printColor,
    printText,
    hasRecycling,
    hasFragile,
    hasUpArrows
  );

  // Define texture mappings based on coverage selection
  const frontTexture = printing ? printedTexture : plainTexture;
  const backTexture = printing && (printCoverage === 'front-back' || printCoverage === 'all') ? printedTexture : plainTexture;
  const sideTexture = printing && printCoverage === 'all' ? printedTexture : plainTexture;

  // Ensure foldPercent is treated as a clean number type
  const numericFold = typeof foldPercent === 'string' ? parseFloat(foldPercent) : foldPercent;

  // Stage interpolators:
  // fWalls: folding walls from flat sheet into vertical box tube (range [0, 0.5])
  const fWalls = Math.min(1.0, Math.max(0.0, numericFold * 2.0));
  // fFlaps: folding top and bottom flaps inside to close box lids (range [0.5, 1.0])
  const fFlaps = Math.min(1.0, Math.max(0.0, (numericFold - 0.5) * 2.0));

  const t = 0.04; // cardboard panel thickness
  
  // Dynamic Flap heights based on FEFCO Style selection
  const { topFlapH, bottomFlapH, hasTopFlaps } = useMemo(() => {
    switch (fefcoCode) {
      case '200': // Open Top: No top flaps, bottom flaps meet in middle
        return { topFlapH: 0, bottomFlapH: width / 2, hasTopFlaps: false };
      case '203': // Overlapping: Flaps are full width (fully overlaps top and bottom)
        return { topFlapH: width, bottomFlapH: width, hasTopFlaps: true };
      case '300': // Telescopic Lid: Separate lid, tray has no top flaps, bottom flaps meet in middle
        return { topFlapH: 0, bottomFlapH: width / 2, hasTopFlaps: false };
      case '201': // Standard Slotted: Top & bottom flaps meet in middle
      default:
        return { topFlapH: width / 2, bottomFlapH: width / 2, hasTopFlaps: true };
    }
  }, [fefcoCode, width]);

  // Hinge angles
  const wallAngle = (Math.PI / 2) * fWalls;
  const flapAngle = (Math.PI / 2) * fFlaps;

  // Debugging console log to track states
  console.log('R3F Box config render:', { length, width, height, numericFold, fWalls, fFlaps, flapAngle, fefcoCode });

  // FEFCO 300 Lid calculations
  const lidL = length + 0.12;
  const lidW = width + 0.12;
  const lidH = 0.35;
  
  // Lid positions: when foldPercent is 1, it sits on the box. When flat, it hovers high above the sheet
  const lidY = height / 2 + 0.05 + (1.0 - numericFold) * 2.0;
  const lidZ = 0; // Centered on the box when folded

  return (
    <Canvas camera={{ position: [6, 5, 6], fov: 42 }} shadows>
      <ambientLight intensity={0.7} />
      <directionalLight 
        position={[8, 12, 5]} 
        intensity={0.9} 
        castShadow 
        shadow-mapSize={[1024, 1024]} 
      />
      <directionalLight position={[-8, -5, -5]} intensity={0.2} />

      <group position={[0, -0.5, 0]}>
        {/* --- SCENE HIERARCHY FOR PANEL ASSEMBLING --- */}
        
        {/* 1. FRONT PANEL GROUP (Stationary Anchor) */}
        <group position={[0, 0, (width / 2) * fWalls]}>
          <CardboardPanel 
            width={length} 
            height={height} 
            thickness={t} 
            colorTexture={frontTexture}
            alphaTexture={null}
          />

          {/* Front Top Flap */}
          {hasTopFlaps && topFlapH > 0 && (
            <group position={[0, height / 2, 0]} rotation={[-flapAngle, 0, 0]}>
              <group position={[0, topFlapH / 2, 0]}>
                <CardboardPanel width={length} height={topFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
              </group>
            </group>
          )}

          {/* Front Bottom Flap */}
          {bottomFlapH > 0 && (
            <group position={[0, -height / 2, 0]} rotation={[flapAngle, 0, 0]}>
              <group position={[0, -bottomFlapH / 2, 0]}>
                <CardboardPanel width={length} height={bottomFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
              </group>
            </group>
          )}

          {/* 2. RIGHT PANEL GROUP (Hinged to right side of Front) */}
          <group position={[length / 2, 0, 0]} rotation={[0, -wallAngle, 0]}>
            <group position={[width / 2, 0, 0]}>
              <CardboardPanel 
                width={width} 
                height={height} 
                thickness={t} 
                colorTexture={sideTexture}
                alphaTexture={alphaTexture}
              />

              {/* Right Top Flap (centered along the Right Panel width at local x = width/2) */}
              {hasTopFlaps && topFlapH > 0 && (
                <group position={[0, height / 2, 0]} rotation={[-flapAngle, 0, 0]}>
                  <group position={[0, topFlapH / 2, 0]}>
                    <CardboardPanel width={width} height={topFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
                  </group>
                </group>
              )}

              {/* Right Bottom Flap */}
              {bottomFlapH > 0 && (
                <group position={[0, -height / 2, 0]} rotation={[flapAngle, 0, 0]}>
                  <group position={[0, -bottomFlapH / 2, 0]}>
                    <CardboardPanel width={width} height={bottomFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
                  </group>
                </group>
              )}
            </group>

            {/* 3. BACK PANEL GROUP (Hinged to right side of Right) */}
            <group position={[width, 0, 0]} rotation={[0, -wallAngle, 0]}>
              <group position={[length / 2, 0, 0]}>
                <CardboardPanel 
                  width={length} 
                  height={height} 
                  thickness={t} 
                  colorTexture={backTexture}
                  alphaTexture={null}
                />

                {/* Back Top Flap */}
                {hasTopFlaps && topFlapH > 0 && (
                  <group position={[0, height / 2, 0]} rotation={[flapAngle, 0, 0]}>
                    <group position={[0, topFlapH / 2, 0]}>
                      <CardboardPanel width={length} height={topFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
                    </group>
                  </group>
                )}

                {/* Back Bottom Flap */}
                {bottomFlapH > 0 && (
                  <group position={[0, -height / 2, 0]} rotation={[-flapAngle, 0, 0]}>
                    <group position={[0, -bottomFlapH / 2, 0]}>
                      <CardboardPanel width={length} height={bottomFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
                    </group>
                  </group>
                )}
              </group>
            </group>
          </group>

          {/* 4. LEFT PANEL GROUP (Hinged to left side of Front) */}
          <group position={[-length / 2, 0, 0]} rotation={[0, wallAngle, 0]}>
            <group position={[-width / 2, 0, 0]}>
              <CardboardPanel 
                width={width} 
                height={height} 
                thickness={t} 
                colorTexture={sideTexture}
                alphaTexture={alphaTexture}
              />

              {/* Left Top Flap (centered along the Left Panel width at local x = -width/2) */}
              {hasTopFlaps && topFlapH > 0 && (
                <group position={[0, height / 2, 0]} rotation={[-flapAngle, 0, 0]}>
                  <group position={[0, topFlapH / 2, 0]}>
                    <CardboardPanel width={width} height={topFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
                  </group>
                </group>
              )}

              {/* Left Bottom Flap */}
              {bottomFlapH > 0 && (
                <group position={[0, -height / 2, 0]} rotation={[flapAngle, 0, 0]}>
                  <group position={[0, -bottomFlapH / 2, 0]}>
                    <CardboardPanel width={width} height={bottomFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
                  </group>
                </group>
              )}

              {/* GLUE TAB / CORNER JOINT JOINT FLAP */}
              <group position={[-width / 2, 0, 0]} rotation={[0, -wallAngle, 0]}>
                <group position={[0.15, 0, 0]}>
                  <CardboardPanel 
                    width={0.3} 
                    height={height - 0.1} 
                    thickness={t - 0.005} 
                    colorTexture={plainTexture}
                    alphaTexture={null}
                    isGlueTab={true}
                  />
                  
                  {/* Adhesive Seam Visual (Glossy Hot-Melt Glue Beads) */}
                  {gluing && (
                    <group position={[0, 0, t / 2 + 0.004]}>
                      {/* Top Bead */}
                      <mesh position={[0, height * 0.2, 0]}>
                        <cylinderGeometry args={[0.012, 0.012, height * 0.18, 8]} />
                        <meshStandardMaterial color="#e5c158" roughness={0.15} metalness={0.0} transparent opacity={0.75} />
                      </mesh>
                      {/* Middle Bead */}
                      <mesh position={[0, 0, 0]}>
                        <cylinderGeometry args={[0.012, 0.012, height * 0.18, 8]} />
                        <meshStandardMaterial color="#e5c158" roughness={0.15} metalness={0.0} transparent opacity={0.75} />
                      </mesh>
                      {/* Bottom Bead */}
                      <mesh position={[0, -height * 0.2, 0]}>
                        <cylinderGeometry args={[0.012, 0.012, height * 0.18, 8]} />
                        <meshStandardMaterial color="#e5c158" roughness={0.15} metalness={0.0} transparent opacity={0.75} />
                      </mesh>
                    </group>
                  )}
                </group>
              </group>

              {/* Metal Staples along Joint Seam (rendered if stapling enabled) */}
              {stapling && (
                <group position={[-width / 2, 0, 0]}>
                  <BoxStaple position={[-0.04, height * 0.3, t]} />
                  <BoxStaple position={[-0.04, height * 0.1, t]} />
                  <BoxStaple position={[-0.04, -height * 0.1, t]} />
                  <BoxStaple position={[-0.04, -height * 0.3, t]} />
                </group>
              )}
            </group>
          </group>

        </group>

        {/* --- TELESCOPIC LID (RENDERED ONLY FOR FEFCO 300) --- */}
        {fefcoCode === '300' && (
          <group position={[0, lidY, lidZ]}>
            {/* Lid Top Face (horizontal) */}
            <group position={[0, lidH / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <CardboardPanel width={lidL} height={lidW} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
            </group>

            {/* Lid Front Rim */}
            <group position={[0, 0, lidW / 2]}>
              <CardboardPanel width={lidL} height={lidH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
            </group>

            {/* Lid Back Rim */}
            <group position={[0, 0, -lidW / 2]}>
              <CardboardPanel width={lidL} height={lidH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
            </group>

            {/* Lid Left Rim */}
            <group position={[-lidL / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <CardboardPanel width={lidW} height={lidH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
            </group>

            {/* Lid Right Rim */}
            <group position={[lidL / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <CardboardPanel width={lidW} height={lidH} thickness={t} colorTexture={plainTexture} alphaTexture={null} />
            </group>
          </group>
        )}

        {/* --- DYNAMIC DIMENSIONS OVERLAYS --- */}
        {numericFold > 0.05 && (
          <group>
            {/* Length Dimension Line (Front Bottom) */}
            <DimensionOverlay
              start={[-length / 2, -height / 2, width / 2]}
              end={[length / 2, -height / 2, width / 2]}
              label={`${Math.round(length * 100)} mm`}
              offset={-0.6}
              dir="x"
            />

            {/* Height Dimension Line (Left Side Front Corner) */}
            <DimensionOverlay
              start={[-length / 2, -height / 2, width / 2]}
              end={[-length / 2, height / 2, width / 2]}
              label={`${Math.round(height * 100)} mm`}
              offset={-0.6}
              dir="y"
            />

            {/* Width Dimension Line (Right Side Bottom Panel) */}
            <DimensionOverlay
              start={[length / 2, -height / 2, width / 2]}
              end={[length / 2, -height / 2, -width / 2]}
              label={`${Math.round(width * 100)} mm`}
              offset={0.6}
              dir="z"
            />
          </group>
        )}
      </group>

      <OrbitControls minDistance={2} maxDistance={15} />
    </Canvas>
  );
};

export default BoxConfigurator3D;
