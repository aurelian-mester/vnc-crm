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
  hasUpArrows: boolean,
  logoImage: HTMLImageElement | null
) => {
  return useMemo(() => {
    // 1. Generate Canvas for Plain Cardboard (High Resolution: 1024x1024)
    const plainCanvas = document.createElement('canvas');
    plainCanvas.width = 1024;
    plainCanvas.height = 1024;
    const pctx = plainCanvas.getContext('2d');
    if (!pctx) return { plainTexture: null, printedTexture: null, alphaTexture: null, bumpTexture: null };

    // Set up material grade aesthetics
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
    const gradient = pctx.createRadialGradient(512, 512, 120, 512, 512, 720);
    gradient.addColorStop(0, centerColor);
    gradient.addColorStop(1, edgeColor);
    pctx.fillStyle = gradient;
    pctx.fillRect(0, 0, 1024, 1024);

    // Draw realistic crease borders and fold markings
    pctx.strokeStyle = creaseColor;
    pctx.lineWidth = 16;
    pctx.strokeRect(0, 0, 1024, 1024);

    // Dashed inner crease lines
    pctx.strokeStyle = dashColor;
    pctx.lineWidth = 8;
    pctx.setLineDash([24, 16]);
    pctx.strokeRect(16, 16, 992, 992);
    pctx.setLineDash([]);

    // Subtle grain noise
    for (let i = 0; i < 60000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const val = Math.random() * 0.1;
      pctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${val})` : `rgba(0,0,0,${val})`;
      pctx.fillRect(x, y, 1, 1);
    }

    // Cardboard fiber specks
    pctx.fillStyle = fiberColor;
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const w = Math.random() * 6 + 2;
      const h = Math.random() * 3 + 2;
      pctx.fillRect(x, y, w, h);
    }

    // Secondary light fiber flecks for recycled look
    const lightFiberColor = material === 'Schrenz' ? 'rgba(230, 230, 230, 0.25)' : 'rgba(255, 255, 255, 0.15)';
    pctx.fillStyle = lightFiberColor;
    for (let i = 0; i < 1500; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const w = Math.random() * 4 + 2;
      const h = Math.random() * 2 + 2;
      pctx.fillRect(x, y, w, h);
    }

    // Horizontal fiber lines (corrugation pattern look)
    pctx.fillStyle = stripeColor;
    for (let y = 0; y < 1024; y += 12) {
      pctx.fillRect(0, y, 1024, 6.0);
    }

    const plainTex = new THREE.CanvasTexture(plainCanvas);
    plainTex.colorSpace = THREE.SRGBColorSpace;
    plainTex.needsUpdate = true;

    // 2. Generate Canvas for Printed Cardboard
    const printedCanvas = document.createElement('canvas');
    printedCanvas.width = 1024;
    printedCanvas.height = 1024;
    const sctx = printedCanvas.getContext('2d');
    if (!sctx) return { plainTexture: plainTex, printedTexture: null, alphaTexture: null, bumpTexture: null };

    // Copy plain canvas background to preserve identical cardboard noise
    sctx.drawImage(plainCanvas, 0, 0);

    // Realistic print ink blending simulation using MULTIPLY composite mode
    sctx.globalCompositeOperation = 'multiply';

    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const inkColor = hexToRgba(printColor, 0.88);

    // Draw stamp border
    sctx.strokeStyle = hexToRgba(printColor, 0.65);
    sctx.lineWidth = 12;
    sctx.strokeRect(100, 220, 824, 584);

    sctx.strokeStyle = hexToRgba(printColor, 0.55);
    sctx.lineWidth = 4;
    sctx.strokeRect(120, 240, 784, 544);

    // Draw main custom brand text
    sctx.fillStyle = hexToRgba(printColor, 0.92);
    sctx.font = 'bold 68px monospace';
    sctx.textAlign = 'center';
    sctx.fillText(printText || 'VRANCART', 512, 370);

    // Sub-labels
    sctx.fillStyle = hexToRgba(printColor, 0.75);
    sctx.font = 'bold 24px monospace';
    sctx.fillText('DO NOT DOUBLE STACK', 512, 450);
    sctx.fillText('FRAGILE - HANDLE WITH CARE', 512, 490);

    // Draw custom symbols centered at the bottom of the stamp
    const drawUpArrows = (x: number, y: number) => {
      sctx.strokeStyle = inkColor;
      sctx.lineWidth = 6;
      // Baseline
      sctx.beginPath();
      sctx.moveTo(x - 36, y + 30);
      sctx.lineTo(x + 36, y + 30);
      sctx.stroke();
      // Arrow 1
      sctx.beginPath();
      sctx.moveTo(x - 18, y + 20);
      sctx.lineTo(x - 18, y - 30);
      sctx.stroke();
      sctx.beginPath();
      sctx.moveTo(x - 28, y - 10);
      sctx.lineTo(x - 18, y - 30);
      sctx.lineTo(x - 8, y - 10);
      sctx.stroke();
      // Arrow 2
      sctx.beginPath();
      sctx.moveTo(x + 18, y + 20);
      sctx.lineTo(x + 18, y - 30);
      sctx.stroke();
      sctx.beginPath();
      sctx.moveTo(x + 8, y - 10);
      sctx.lineTo(x + 18, y - 30);
      sctx.lineTo(x + 28, y - 10);
      sctx.stroke();
    };

    const drawFragile = (x: number, y: number) => {
      sctx.strokeStyle = inkColor;
      sctx.lineWidth = 6;
      sctx.beginPath();
      sctx.moveTo(x - 26, y - 30);
      sctx.lineTo(x + 26, y - 30);
      sctx.stroke();
      sctx.beginPath();
      sctx.arc(x, y - 30, 26, 0, Math.PI);
      sctx.stroke();
      sctx.beginPath();
      sctx.moveTo(x, y);
      sctx.lineTo(x, y + 24);
      sctx.stroke();
      sctx.beginPath();
      sctx.moveTo(x - 20, y + 24);
      sctx.lineTo(x + 20, y + 24);
      sctx.stroke();
      // Crack
      sctx.strokeStyle = inkColor;
      sctx.lineWidth = 3;
      sctx.beginPath();
      sctx.moveTo(x - 8, y - 30);
      sctx.lineTo(x - 2, y - 10);
      sctx.lineTo(x - 14, y + 4);
      sctx.stroke();
    };

    const drawRecycling = (x: number, y: number) => {
      sctx.strokeStyle = inkColor;
      sctx.lineWidth = 6;
      const r = 30;
      for (let angle = 0; angle < 2 * Math.PI; angle += (2 * Math.PI) / 3) {
        sctx.beginPath();
        sctx.arc(x, y, r, angle + 0.2, angle + (2 * Math.PI) / 3 - 0.45);
        sctx.stroke();

        const endAngle = angle + (2 * Math.PI) / 3 - 0.45;
        const ax = x + r * Math.cos(endAngle);
        const ay = y + r * Math.sin(endAngle);
        const psi = endAngle + Math.PI / 2;

        sctx.fillStyle = inkColor;
        sctx.beginPath();
        sctx.moveTo(ax, ay);
        const arrowLength = 14;
        const arrowHalfAngle = 0.5;
        const x1 = ax - arrowLength * Math.cos(psi - arrowHalfAngle);
        const y1 = ay - arrowLength * Math.sin(psi - arrowHalfAngle);
        sctx.lineTo(x1, y1);
        const x2 = ax - arrowLength * Math.cos(psi + arrowHalfAngle);
        const y2 = ay - arrowLength * Math.sin(psi + arrowHalfAngle);
        sctx.lineTo(x2, y2);
        sctx.closePath();
        sctx.fill();
      }
      sctx.fillStyle = inkColor;
      sctx.font = 'bold 16px monospace';
      sctx.textAlign = 'center';
      sctx.fillText('20', x, y + 5);
      sctx.font = 'bold 12px monospace';
      sctx.fillText('PAP', x, y + 18);
    };

    const activeSymbols = [];
    if (hasRecycling) activeSymbols.push('recycling');
    if (hasFragile) activeSymbols.push('fragile');
    if (hasUpArrows) activeSymbols.push('upArrows');

    const symbolY = 640;
    if (activeSymbols.length === 1) {
      if (activeSymbols[0] === 'recycling') drawRecycling(512, symbolY);
      if (activeSymbols[0] === 'fragile') drawFragile(512, symbolY);
      if (activeSymbols[0] === 'upArrows') drawUpArrows(512, symbolY);
    } else if (activeSymbols.length === 2) {
      activeSymbols.forEach((sym, idx) => {
        const sx = idx === 0 ? 400 : 624;
        if (sym === 'recycling') drawRecycling(sx, symbolY);
        if (sym === 'fragile') drawFragile(sx, symbolY);
        if (sym === 'upArrows') drawUpArrows(sx, symbolY);
      });
    } else if (activeSymbols.length === 3) {
      drawRecycling(320, symbolY);
      drawFragile(512, symbolY);
      drawUpArrows(704, symbolY);
    }

    // Logo image rendering with monochromatization
    if (logoImage) {
      const aspect = logoImage.width / logoImage.height;
      let drawW = 240;
      let drawH = 240 / aspect;
      if (drawH > 200) {
        drawH = 200;
        drawW = 200 * aspect;
      }
      const drawX = 512 - drawW / 2;
      const drawY = 600 - drawH / 2; // Position centered within the bottom half

      try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = logoImage.width;
        tempCanvas.height = logoImage.height;
        const tctx = tempCanvas.getContext('2d');
        if (tctx) {
          tctx.drawImage(logoImage, 0, 0);
          const imgData = tctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          const data = imgData.data;

          const rInk = parseInt(printColor.slice(1, 3), 16);
          const gInk = parseInt(printColor.slice(3, 5), 16);
          const bInk = parseInt(printColor.slice(5, 7), 16);

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const alpha = data[i+3];

            // Grayscale filter
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const inkDensity = (255 - gray) / 255;

            data[i] = rInk;
            data[i+1] = gInk;
            data[i+2] = bInk;
            data[i+3] = alpha * inkDensity * 0.90;
          }
          tctx.putImageData(imgData, 0, 0);
          sctx.drawImage(tempCanvas, drawX, drawY, drawW, drawH);
        }
      } catch (err) {
        console.error('Error rendering monochrome logo:', err);
      }
    }

    // Apply flexographic print ink-skipping / fiber knockout effect
    sctx.globalCompositeOperation = 'source-over';
    sctx.fillStyle = edgeColor;
    for (let i = 0; i < 18000; i++) {
      const x = 100 + Math.random() * 824;
      const y = 220 + Math.random() * 584;
      const size = Math.random() * 2 + 0.5;
      sctx.fillRect(x, y, size, size);
    }

    const printedTex = new THREE.CanvasTexture(printedCanvas);
    printedTex.colorSpace = THREE.SRGBColorSpace;
    printedTex.needsUpdate = true;

    // 3. Alpha Map Canvas for Handle Holes
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 256;
    alphaCanvas.height = 256;
    const actx = alphaCanvas.getContext('2d');
    if (!actx) return { plainTexture: plainTex, printedTexture: printedTex, alphaTexture: null, bumpTexture: null };

    actx.fillStyle = '#ffffff';
    actx.fillRect(0, 0, 256, 256);

    if (hasHandle) {
      actx.fillStyle = '#000000';
      const hx = 68;
      const hy = 113;
      const hw = 120;
      const hh = 30;
      const r = 15;

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
    alphaTex.needsUpdate = true;

    // 4. Generate Canvas for Bump Map (Detailed Cardboard Structure)
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 1024;
    bumpCanvas.height = 1024;
    const bctx = bumpCanvas.getContext('2d');
    if (!bctx) return { plainTexture: plainTex, printedTexture: printedTex, alphaTexture: alphaTex, bumpTexture: null };

    // Fill base height (neutral gray - 128)
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 1024, 1024);

    // Corrugation flutes ripples (height sine wave)
    for (let y = 0; y < 1024; y++) {
      const ripple = Math.sin((y / 12) * Math.PI * 2) * 8; // Wave frequency of 12px
      const grayVal = Math.round(128 + ripple);
      bctx.fillStyle = `rgb(${grayVal}, ${grayVal}, ${grayVal})`;
      bctx.fillRect(0, y, 1024, 1);
    }

    // Crease lines (deep pressed-down indentations)
    bctx.strokeStyle = '#404040';
    bctx.lineWidth = 16;
    bctx.strokeRect(0, 0, 1024, 1024);

    // Dashed inner crease lines
    bctx.strokeStyle = '#585858';
    bctx.lineWidth = 8;
    bctx.setLineDash([24, 16]);
    bctx.strokeRect(16, 16, 992, 992);
    bctx.setLineDash([]);

    // Paper grain micro height variations
    for (let i = 0; i < 40000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const offset = Math.round(Math.random() * 16 - 8); // +/- 8 depth variation
      bctx.fillStyle = offset > 0 ? `rgba(255, 255, 255, ${offset / 255})` : `rgba(0, 0, 0, ${Math.abs(offset) / 255})`;
      bctx.fillRect(x, y, 1, 1);
    }

    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.needsUpdate = true;

    return { plainTexture: plainTex, printedTexture: printedTex, alphaTexture: alphaTex, bumpTexture: bumpTex };
  }, [material, hasHandle, printColor, printText, hasRecycling, hasFragile, hasUpArrows, logoImage]);
};

// Panel component holding geometry, textures, bump maps, and flaps
interface PanelProps {
  width: number;
  height: number;
  thickness: number;
  colorTexture: THREE.CanvasTexture | null;
  alphaTexture: THREE.CanvasTexture | null;
  bumpTexture: THREE.CanvasTexture | null;
  isGlueTab?: boolean;
}

const CardboardPanel: React.FC<PanelProps> = ({
  width,
  height,
  thickness,
  colorTexture,
  alphaTexture,
  bumpTexture,
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
        roughness={0.95} // Cardboard is very matte/rough
        metalness={0.0}
        side={THREE.DoubleSide}
        bumpMap={isGlueTab ? undefined : (bumpTexture || undefined)}
        bumpScale={0.006} // Subtle tactile surface bumps
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

// Unified assembly of box panels supporting side-by-side 2D and 3D folding structures
interface BoxAssemblyProps {
  length: number;
  width: number;
  height: number;
  fefcoCode: string;
  fWalls: number;
  fFlaps: number;
  wallAngle: number;
  flapAngle: number;
  frontTexture: THREE.CanvasTexture | null;
  backTexture: THREE.CanvasTexture | null;
  sideTexture: THREE.CanvasTexture | null;
  plainTexture: THREE.CanvasTexture | null;
  alphaTexture: THREE.CanvasTexture | null;
  bumpTexture: THREE.CanvasTexture | null;
  gluing: boolean;
  stapling: boolean;
  hasTopFlaps: boolean;
  topFlapH: number;
  bottomFlapH: number;
  t: number;
}

const BoxAssembly: React.FC<BoxAssemblyProps> = ({
  length,
  width,
  height,
  fefcoCode,
  fWalls,
  fFlaps,
  wallAngle,
  flapAngle,
  frontTexture,
  backTexture,
  sideTexture,
  plainTexture,
  alphaTexture,
  bumpTexture,
  gluing,
  stapling,
  hasTopFlaps,
  topFlapH,
  bottomFlapH,
  t,
}) => {
  // FEFCO 300 Lid calculations
  const lidL = length + 0.12;
  const lidW = width + 0.12;
  const lidH = 0.35;
  
  // Lid positions: when folded (fFlaps = 1), sits on top. When flat, slides to the side out of layout bounds
  const lidZOffset = (width / 2 + bottomFlapH + lidW / 2 + 0.5) * (1.0 - fFlaps);
  
  // Rims on lid fold from horizontal (90 deg relative to lid) inwards to vertical (0 deg relative to lid)
  const lidFlapAngle = (1.0 - fFlaps) * (Math.PI / 2);
  
  // Lid height: sits on box top when closed (fFlaps = 1), lies flat on ground when open (fFlaps = 0)
  const lidY = (height / 2 + lidH / 2) * fFlaps + (t / 2) * (1.0 - fFlaps);

  return (
    <group castShadow receiveShadow>
      {/* 1. FRONT PANEL GROUP (Stationary Anchor) */}
      <group position={[0, 0, (width / 2) * fWalls]}>
        <CardboardPanel 
          width={length} 
          height={height} 
          thickness={t} 
          colorTexture={frontTexture}
          alphaTexture={null}
          bumpTexture={bumpTexture}
        />

        {/* Front Top Flap */}
        {hasTopFlaps && topFlapH > 0 && (
          <group position={[0, height / 2, 0]} rotation={[-flapAngle, 0, 0]}>
            <group position={[0, topFlapH / 2, 0]}>
              <CardboardPanel width={length} height={topFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
            </group>
          </group>
        )}

        {/* Front Bottom Flap */}
        {bottomFlapH > 0 && (
          <group position={[0, -height / 2, 0]} rotation={[flapAngle, 0, 0]}>
            <group position={[0, -bottomFlapH / 2, 0]}>
              <CardboardPanel width={length} height={bottomFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
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
              bumpTexture={bumpTexture}
            />

            {/* Right Top Flap */}
            {hasTopFlaps && topFlapH > 0 && (
              <group position={[0, height / 2, 0]} rotation={[-flapAngle, 0, 0]}>
                <group position={[0, topFlapH / 2, 0]}>
                  <CardboardPanel width={width} height={topFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
                </group>
              </group>
            )}

            {/* Right Bottom Flap */}
            {bottomFlapH > 0 && (
              <group position={[0, -height / 2, 0]} rotation={[flapAngle, 0, 0]}>
                <group position={[0, -bottomFlapH / 2, 0]}>
                  <CardboardPanel width={width} height={bottomFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
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
                bumpTexture={bumpTexture}
              />

              {/* Back Top Flap */}
              {hasTopFlaps && topFlapH > 0 && (
                <group position={[0, height / 2, 0]} rotation={[-flapAngle, 0, 0]}>
                  <group position={[0, topFlapH / 2, 0]}>
                    <CardboardPanel width={length} height={topFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
                  </group>
                </group>
              )}

              {/* Back Bottom Flap */}
              {bottomFlapH > 0 && (
                <group position={[0, -height / 2, 0]} rotation={[flapAngle, 0, 0]}>
                  <group position={[0, -bottomFlapH / 2, 0]}>
                    <CardboardPanel width={length} height={bottomFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
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
              bumpTexture={bumpTexture}
            />

            {/* Left Top Flap */}
            {hasTopFlaps && topFlapH > 0 && (
              <group position={[0, height / 2, 0]} rotation={[-flapAngle, 0, 0]}>
                <group position={[0, topFlapH / 2, 0]}>
                  <CardboardPanel width={width} height={topFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
                </group>
              </group>
            )}

            {/* Left Bottom Flap */}
            {bottomFlapH > 0 && (
              <group position={[0, -height / 2, 0]} rotation={[flapAngle, 0, 0]}>
                <group position={[0, -bottomFlapH / 2, 0]}>
                  <CardboardPanel width={width} height={bottomFlapH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
                </group>
              </group>
            )}

            {/* GLUE TAB / CORNER JOINT FLAP */}
            <group position={[-width / 2, 0, 0]} rotation={[0, -wallAngle, 0]}>
              <group position={[0.15, 0, 0]}>
                <CardboardPanel 
                  width={0.3} 
                  height={height - 0.1} 
                  thickness={t - 0.005} 
                  colorTexture={plainTexture}
                  alphaTexture={null}
                  bumpTexture={bumpTexture}
                  isGlueTab={true}
                />
                
                {/* Adhesive Seam Visual (Glossy Hot-Melt Glue Beads) */}
                {gluing && (
                  <group position={[0, 0, t / 2 + 0.004]}>
                    <mesh position={[0, height * 0.2, 0]}>
                      <cylinderGeometry args={[0.012, 0.012, height * 0.18, 8]} />
                      <meshStandardMaterial color="#e5c158" roughness={0.15} metalness={0.0} transparent opacity={0.75} />
                    </mesh>
                    <mesh position={[0, 0, 0]}>
                      <cylinderGeometry args={[0.012, 0.012, height * 0.18, 8]} />
                      <meshStandardMaterial color="#e5c158" roughness={0.15} metalness={0.0} transparent opacity={0.75} />
                    </mesh>
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
        <group position={[0, lidY, -lidZOffset]}>
          {/* Lid Top Face (horizontal) */}
          <group position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <CardboardPanel width={lidL} height={lidW} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
          </group>

          {/* Lid Front Rim Hinge: rotated around local X by lidFlapAngle, centered downwards */}
          <group position={[0, 0, lidW / 2]} rotation={[-lidFlapAngle, 0, 0]}>
            <group position={[0, -lidH / 2, 0]}>
              <CardboardPanel width={lidL} height={lidH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
            </group>
          </group>

          {/* Lid Back Rim Hinge: rotated around local X by -lidFlapAngle, centered downwards */}
          <group position={[0, 0, -lidW / 2]} rotation={[lidFlapAngle, 0, 0]}>
            <group position={[0, -lidH / 2, 0]}>
              <CardboardPanel width={lidL} height={lidH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
            </group>
          </group>

          {/* Lid Right Rim Hinge: rotated around local Z by -lidFlapAngle, facing sideways */}
          <group position={[lidL / 2, 0, 0]} rotation={[0, 0, -lidFlapAngle]}>
            <group position={[0, -lidH / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
              <CardboardPanel width={lidW} height={lidH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
            </group>
          </group>

          {/* Lid Left Rim Hinge: rotated around local Z by lidFlapAngle, facing sideways */}
          <group position={[-lidL / 2, 0, 0]} rotation={[0, 0, lidFlapAngle]}>
            <group position={[0, -lidH / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
              <CardboardPanel width={lidW} height={lidH} thickness={t} colorTexture={plainTexture} alphaTexture={null} bumpTexture={bumpTexture} />
            </group>
          </group>
        </group>
      )}
    </group>
  );
};

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
  // Pre-load custom brand logo image
  const [logoImage, setLogoImage] = React.useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!logoUrl) {
      setLogoImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = logoUrl;
    img.onload = () => {
      setLogoImage(img);
    };
    img.onerror = () => {
      console.error('Failed to load custom brand logo image:', logoUrl);
      setLogoImage(null);
    };
  }, [logoUrl]);

  // Generate textures once for the entire scene (optimizes rendering)
  const { plainTexture, printedTexture, alphaTexture, bumpTexture } = useCardboardTextures(
    material,
    dieCutting,
    printColor,
    printText,
    hasRecycling,
    hasFragile,
    hasUpArrows,
    logoImage
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

  // Hinge angles. Walls hinge inward (negative Y rotation) so the side/back
  // panels wrap into a closed box instead of splaying outward.
  const wallAngle = -(Math.PI / 2) * fWalls;
  const flapAngle = (Math.PI / 2) * fFlaps;

  // Auto-rotation idle timers
  const [autoRotate, setAutoRotate] = React.useState(true);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleInteractionStart = () => {
    setAutoRotate(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleInteractionEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setAutoRotate(true);
    }, 6000); // Resume auto-rotate after 6 seconds of idle inactivity
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Canvas camera={{ position: [6, 5, 6], fov: 42 }} shadows gl={{ preserveDrawingBuffer: true }}>
      <ambientLight intensity={0.6} />
      
      {/* Dynamic Key Studio Light */}
      <directionalLight 
        position={[5, 8, 5]} 
        intensity={0.8} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-bias={-0.0001}
      />
      
      {/* Studio Fill Light */}
      <directionalLight position={[-5, 4, -5]} intensity={0.3} />
      
      {/* Point highlight for tactile staples/glue gloss */}
      <pointLight position={[0, 4, 2]} intensity={0.4} />

      {/* Ground Floor Stage */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -height / 2 - 0.02, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.8} />
      </mesh>

      {/* Floor grid overlay matching CRM styling */}
      <gridHelper args={[30, 30, '#cbd5e0', '#e2e8f0']} position={[0, -height / 2 - 0.015, 0]} />

      <group position={[0, -0.2, 0]}>
        {/* VIEWMODE: SINGLE 3D BOX VIEW */}
        {viewMode === 'box' && (
          <group position={[0, 0, 0]}>
            <BoxAssembly 
              length={length}
              width={width}
              height={height}
              fefcoCode={fefcoCode}
              fWalls={fWalls}
              fFlaps={fFlaps}
              wallAngle={wallAngle}
              flapAngle={flapAngle}
              frontTexture={frontTexture}
              backTexture={backTexture}
              sideTexture={sideTexture}
              plainTexture={plainTexture}
              alphaTexture={alphaTexture}
              bumpTexture={bumpTexture}
              gluing={gluing}
              stapling={stapling}
              hasTopFlaps={hasTopFlaps}
              topFlapH={topFlapH}
              bottomFlapH={bottomFlapH}
              t={t}
            />
          </group>
        )}

        {/* VIEWMODE: 2D FLAT PATTERN & 3D BOX SIDE-BY-SIDE */}
        {viewMode === 'flat-box' && (
          <group>
            {/* 2D Flat Sheet Layout (positioned on the left, rotated flat on the ground) */}
            <group position={[-length - 0.8, -height / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <BoxAssembly 
                length={length}
                width={width}
                height={height}
                fefcoCode={fefcoCode}
                fWalls={0}
                fFlaps={0}
                wallAngle={0}
                flapAngle={0}
                frontTexture={frontTexture}
                backTexture={backTexture}
                sideTexture={sideTexture}
                plainTexture={plainTexture}
                alphaTexture={alphaTexture}
                bumpTexture={bumpTexture}
                gluing={gluing}
                stapling={stapling}
                hasTopFlaps={hasTopFlaps}
                topFlapH={topFlapH}
                bottomFlapH={bottomFlapH}
                t={t}
              />
            </group>

            {/* 3D Folding Box (positioned on the right) */}
            <group position={[length / 2 + 0.3, 0, 0]}>
              <BoxAssembly 
                length={length}
                width={width}
                height={height}
                fefcoCode={fefcoCode}
                fWalls={fWalls}
                fFlaps={fFlaps}
                wallAngle={wallAngle}
                flapAngle={flapAngle}
                frontTexture={frontTexture}
                backTexture={backTexture}
                sideTexture={sideTexture}
                plainTexture={plainTexture}
                alphaTexture={alphaTexture}
                bumpTexture={bumpTexture}
                gluing={gluing}
                stapling={stapling}
                hasTopFlaps={hasTopFlaps}
                topFlapH={topFlapH}
                bottomFlapH={bottomFlapH}
                t={t}
              />
            </group>
          </group>
        )}

        {/* --- DYNAMIC DIMENSIONS OVERLAYS --- */}
        {numericFold > 0.05 && (
          <group position={viewMode === 'flat-box' ? [length / 2 + 0.3, 0, 0] : [0, 0, 0]}>
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

      <OrbitControls 
        minDistance={2} 
        maxDistance={15} 
        autoRotate={autoRotate} 
        autoRotateSpeed={0.8}
        onStart={handleInteractionStart}
        onEnd={handleInteractionEnd}
      />
    </Canvas>
  );
};

export default BoxConfigurator3D;
