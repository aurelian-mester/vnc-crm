import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// External dimensions are in millimetres; we render in metres (S = 0.001).
const S = 0.001;

export interface VizPallet {
  id: string;
  name: string;
  x: number;      // mm, along bed length from the front/headboard
  y: number;      // mm, across bed width from the left wall
  z: number;      // mm, stack height (0 = floor)
  length: number; // mm (along x)
  width: number;  // mm (along y)
  height: number; // mm (along z)
  weight: number;
  color: string;
  rotated: boolean;
  is_trailer: boolean;
  deck?: 'lower' | 'upper';
  destination?: string;
  sequence?: number;
}

export interface VizTruck {
  name?: string;
  type?: string;
  bed_length_mm: number;
  bed_width_mm: number;
  bed_height_mm: number;
  is_tandem: boolean;
  trailer_length_mm: number;
}

interface Props {
  truck: VizTruck;
  pallets: VizPallet[];
  doubleDeck?: boolean;
  deckClearanceMm?: number; // clear height of the lower deck when double-decked
  showLabels?: boolean;
  unloadSide?: 'rear' | 'side';
}

const GAP_MM = 1200; // visual gap between a tandem truck body and its drawbar trailer

// ---- Running gear -------------------------------------------------------
const Tyre: React.FC<{ position: [number, number, number]; r?: number; w?: number }> = ({ position, r = 0.5, w = 0.26 }) => (
  <group position={position} rotation={[Math.PI / 2, 0, 0]}>
    <mesh castShadow><cylinderGeometry args={[r, r, w, 22]} /><meshStandardMaterial color="#171717" roughness={0.85} metalness={0.05} /></mesh>
    <mesh><cylinderGeometry args={[r * 0.42, r * 0.42, w * 1.02, 14]} /><meshStandardMaterial color="#9aa1a9" metalness={0.7} roughness={0.35} /></mesh>
  </group>
);

// Single-tyre steered axle (front of the tractor).
const SteerAxle: React.FC<{ lx: number; halfW: number; groundY: number; r?: number }> = ({ lx, halfW, groundY, r = 0.55 }) => (
  <group>
    <Tyre position={[lx, groundY + r, halfW + 0.1]} r={r} />
    <Tyre position={[lx, groundY + r, -(halfW + 0.1)]} r={r} />
    <mesh position={[lx, groundY + r, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, (halfW + 0.1) * 2, 8]} /><meshStandardMaterial color="#26292e" metalness={0.6} roughness={0.4} /></mesh>
  </group>
);

// Dual-tyre driven/trailer axle.
const DualAxle: React.FC<{ lx: number; halfW: number; groundY: number; r?: number }> = ({ lx, halfW, groundY, r = 0.5 }) => (
  <group>
    {[1, -1].map(side => (
      <group key={side}>
        <Tyre position={[lx, groundY + r, side * (halfW + 0.16)]} r={r} />
        <Tyre position={[lx, groundY + r, side * (halfW + 0.44)]} r={r} />
      </group>
    ))}
    <mesh position={[lx, groundY + r, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.07, 0.07, (halfW + 0.44) * 2, 8]} /><meshStandardMaterial color="#26292e" metalness={0.6} roughness={0.4} /></mesh>
  </group>
);

// Mud-guards over a (tandem) axle group.
const Mudguards: React.FC<{ lx: number; halfW: number; groundY: number; r?: number; len?: number }> = ({ lx, halfW, groundY, r = 0.5, len = 1.7 }) => (
  <group>
    {[1, -1].map(side => (
      <mesh key={side} position={[lx, groundY + r * 2 + 0.12, side * (halfW + 0.3)]} castShadow>
        <boxGeometry args={[len, 0.07, 0.78]} />
        <meshStandardMaterial color="#2a2f36" roughness={0.7} metalness={0.2} />
      </mesh>
    ))}
  </group>
);

// ---- Trailer body -------------------------------------------------------
// Solid floor/roof/front/far-wall; the near side (facing the default camera)
// is left open with corner posts + ribs so the load is always visible —
// a curtain-sider feel. Origin at front-bottom-left corner.
const CargoBox: React.FC<{ length: number; width: number; height: number; deckY?: number }> = ({ length, width, height, deckY }) => {
  const t = 0.05;
  const skin = { color: '#e3e7ec', roughness: 0.55, metalness: 0.12, side: THREE.DoubleSide } as const;
  const nPosts = Math.max(2, Math.round(length / 2.5)) + 1;
  const nRibs = Math.max(2, Math.round(length / 2.2));
  return (
    <group>
      {/* floor */}
      <mesh position={[length / 2, -t / 2, width / 2]} receiveShadow castShadow><boxGeometry args={[length, t, width]} /><meshStandardMaterial color="#7c848d" roughness={0.85} metalness={0.15} /></mesh>
      {/* front headboard */}
      <mesh position={[-t / 2, height / 2, width / 2]} castShadow><boxGeometry args={[t, height, width]} /><meshStandardMaterial {...skin} /></mesh>
      {/* far side wall (solid) */}
      <mesh position={[length / 2, height / 2, 0]} castShadow><boxGeometry args={[length, height, t]} /><meshStandardMaterial {...skin} /></mesh>
      {/* far-wall ribs */}
      {Array.from({ length: nRibs }).map((_, i) => {
        const px = ((i + 0.5) / nRibs) * length;
        return <mesh key={'rib' + i} position={[px, height / 2, t * 0.9]}><boxGeometry args={[0.05, height * 0.96, 0.03]} /><meshStandardMaterial color="#c7cdd4" metalness={0.2} roughness={0.6} /></mesh>;
      })}
      {/* translucent roof */}
      <mesh position={[length / 2, height, width / 2]}><boxGeometry args={[length, t, width]} /><meshStandardMaterial color="#cfd5db" transparent opacity={0.22} side={THREE.DoubleSide} /></mesh>
      {/* near side: open — bottom rail + vertical posts only */}
      <mesh position={[length / 2, t * 0.9, width]}><boxGeometry args={[length, t * 1.6, t]} /><meshStandardMaterial color="#aeb6bf" metalness={0.3} roughness={0.5} /></mesh>
      {Array.from({ length: nPosts }).map((_, i) => {
        const px = (i / (nPosts - 1)) * length;
        return <mesh key={'post' + i} position={[px, height / 2, width]}><boxGeometry args={[0.05, height, 0.05]} /><meshStandardMaterial color="#9aa2ab" metalness={0.35} roughness={0.5} /></mesh>;
      })}
      {/* top rails (front-back) on both sides */}
      {[0, width].map(z => <mesh key={'tr' + z} position={[length / 2, height - t / 2, z]}><boxGeometry args={[length, t, t]} /><meshStandardMaterial color="#aeb6bf" metalness={0.3} roughness={0.5} /></mesh>)}
      {/* rear door frame */}
      <mesh position={[length, height / 2, 0]}><boxGeometry args={[t, height, t]} /><meshStandardMaterial {...skin} /></mesh>
      <mesh position={[length, height / 2, width]}><boxGeometry args={[t, height, t]} /><meshStandardMaterial {...skin} /></mesh>
      <mesh position={[length, height - t / 2, width / 2]}><boxGeometry args={[t, t, width]} /><meshStandardMaterial {...skin} /></mesh>
      {/* intermediate deck floor for double-deckers */}
      {deckY !== undefined && (
        <mesh position={[length / 2, deckY, width / 2]} receiveShadow><boxGeometry args={[length, 0.05, width]} /><meshStandardMaterial color="#7f8893" roughness={0.85} metalness={0.15} transparent opacity={0.92} /></mesh>
      )}
    </group>
  );
};

// ---- Tractor unit -------------------------------------------------------
const Cab: React.FC<{ width: number; bedHeight: number; frontX: number; groundY: number }> = ({ width, bedHeight, frontX, groundY }) => {
  const cabLen = 2.3;
  const cabH = Math.max(bedHeight * 1.0, 2.7);
  const chassisH = 0.55;
  const x0 = frontX - cabLen;
  return (
    <group>
      {/* frame rail / 5th-wheel area linking cab to trailer */}
      <mesh position={[frontX - 0.1, groundY + chassisH, width / 2]}><boxGeometry args={[1.3, 0.18, width * 0.55]} /><meshStandardMaterial color="#33383f" metalness={0.5} roughness={0.5} /></mesh>
      {/* cab body */}
      <mesh position={[x0 + cabLen / 2, groundY + chassisH + cabH / 2, width / 2]} castShadow><boxGeometry args={[cabLen, cabH, width]} /><meshStandardMaterial color="#1f6fb2" roughness={0.3} metalness={0.5} /></mesh>
      {/* windshield */}
      <mesh position={[x0 + 0.05, groundY + chassisH + cabH * 0.68, width / 2]}><boxGeometry args={[0.09, cabH * 0.4, width * 0.84]} /><meshStandardMaterial color="#0d2233" roughness={0.1} metalness={0.6} transparent opacity={0.9} /></mesh>
      {/* bumper / grille */}
      <mesh position={[x0 - 0.08, groundY + chassisH + cabH * 0.2, width / 2]}><boxGeometry args={[0.16, cabH * 0.34, width * 0.96]} /><meshStandardMaterial color="#11202c" metalness={0.5} roughness={0.4} /></mesh>
      {/* headlights */}
      {[1, -1].map(s => <mesh key={s} position={[x0 - 0.12, groundY + chassisH + cabH * 0.26, width / 2 + s * width * 0.34]}><boxGeometry args={[0.06, 0.2, 0.3]} /><meshStandardMaterial color="#fde68a" emissive="#fde047" emissiveIntensity={0.5} /></mesh>)}
      {/* fuel tank */}
      <mesh position={[x0 + cabLen * 0.72, groundY + chassisH * 0.75, width * 0.04]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.28, 0.28, 1.0, 16]} /><meshStandardMaterial color="#aab0b8" metalness={0.75} roughness={0.3} /></mesh>
      {/* exhaust stack */}
      <mesh position={[x0 + cabLen - 0.12, groundY + chassisH + cabH * 0.55, width - 0.06]}><cylinderGeometry args={[0.06, 0.06, cabH * 0.95, 10]} /><meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.3} /></mesh>
    </group>
  );
};

// ---- Pallet -------------------------------------------------------------
const PalletBox: React.FC<{ p: VizPallet; offsetX: number; bedWidth: number; showLabel?: boolean }> = ({ p, offsetX, bedWidth, showLabel }) => {
  const l = p.length * S, w = p.width * S, h = p.height * S;
  const cx = offsetX + (p.x + p.length / 2) * S;
  const cz = (p.y + p.width / 2) * S - (bedWidth * S) / 2;
  const cy = (p.z + p.height / 2) * S;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(l, h, w)), [l, h, w]);
  return (
    <group position={[cx, cy, cz]}>
      <mesh castShadow receiveShadow><boxGeometry args={[l, h, w]} /><meshStandardMaterial color={p.color} roughness={0.62} metalness={0.05} /></mesh>
      <lineSegments geometry={edges}><lineBasicMaterial color="#1f2937" transparent opacity={0.55} /></lineSegments>
      {showLabel && (p.sequence !== undefined || p.destination) && (
        <Html position={[0, h / 2 + 0.05, 0]} center distanceFactor={16} occlude>
          <div style={{ background: 'rgba(17,24,39,0.9)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
            {p.sequence !== undefined ? `#${p.sequence}` : ''}{p.destination ? ` ${p.destination}` : ''}
          </div>
        </Html>
      )}
    </group>
  );
};

const TruckVisualizer3D: React.FC<Props> = ({ truck, pallets, doubleDeck = false, deckClearanceMm, showLabels = false, unloadSide = 'rear' }) => {
  const bedL = truck.bed_length_mm * S;
  const bedW = truck.bed_width_mm * S;
  const bedH = truck.bed_height_mm * S;
  const trailerL = truck.is_tandem ? truck.trailer_length_mm * S : 0;
  const gap = truck.is_tandem ? GAP_MM * S : 0;

  const cabLen = 2.3;
  const totalLen = cabLen + bedL + (truck.is_tandem ? gap + trailerL : 0);
  const shiftX = -totalLen / 2 + cabLen;
  const groundY = 0;
  const deckClear = deckClearanceMm ? deckClearanceMm * S : bedH / 2;

  const fitDist = totalLen * 1.6;
  const camPos: [number, number, number] = [fitDist * 0.55, fitDist * 0.42, fitDist * 0.72];

  const trailerOffsetX = shiftX + bedL + gap;
  const bodyPallets = pallets.filter(p => !p.is_trailer);
  const trailerPallets = pallets.filter(p => p.is_trailer);
  const halfW = bedW / 2;

  return (
    <Canvas camera={{ position: camPos, fov: 40 }} shadows gl={{ preserveDrawingBuffer: true }}>
      <ambientLight intensity={0.65} />
      <directionalLight position={[fitDist * 0.5, fitDist * 0.8, fitDist * 0.4]} intensity={0.85} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
      <directionalLight position={[-fitDist * 0.4, fitDist * 0.5, -fitDist * 0.4]} intensity={0.3} />

      {/* ground + grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.001, 0]} receiveShadow>
        <planeGeometry args={[totalLen * 2.4, totalLen * 2.4]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.95} />
      </mesh>
      <gridHelper args={[totalLen * 2.4, Math.round(totalLen * 2.4), '#cbd5e0', '#e2e8f0']} position={[0, groundY, 0]} />

      <Cab width={bedW} bedHeight={bedH} frontX={shiftX} groundY={groundY} />

      {/* Main load body */}
      <group position={[shiftX, groundY, -bedW / 2]}>
        <CargoBox length={bedL} width={bedW} height={bedH} deckY={doubleDeck ? deckClear : undefined} />
      </group>
      {truck.is_tandem && (
        <group position={[trailerOffsetX, groundY, -bedW / 2]}>
          <CargoBox length={trailerL} width={bedW} height={bedH} deckY={doubleDeck ? deckClear : undefined} />
        </group>
      )}

      {/* Running gear: steer axle under cab, tandem drive bogie under body rear */}
      <SteerAxle lx={shiftX - cabLen + 0.7} halfW={halfW} groundY={groundY} />
      <DualAxle lx={shiftX + bedL - 2.0} halfW={halfW} groundY={groundY} />
      <DualAxle lx={shiftX + bedL - 0.9} halfW={halfW} groundY={groundY} />
      <Mudguards lx={shiftX + bedL - 1.45} halfW={halfW} groundY={groundY} />
      {truck.is_tandem && (
        <>
          <DualAxle lx={trailerOffsetX + trailerL - 1.4} halfW={halfW} groundY={groundY} />
          <DualAxle lx={trailerOffsetX + trailerL - 0.4} halfW={halfW} groundY={groundY} />
          <Mudguards lx={trailerOffsetX + trailerL - 0.9} halfW={halfW} groundY={groundY} />
        </>
      )}

      {/* Pallets */}
      {bodyPallets.map(p => <PalletBox key={p.id} p={p} offsetX={shiftX} bedWidth={truck.bed_width_mm} showLabel={showLabels} />)}
      {trailerPallets.map(p => <PalletBox key={p.id} p={p} offsetX={trailerOffsetX} bedWidth={truck.bed_width_mm} showLabel={showLabels} />)}

      {/* Unload-end marker */}
      <Html position={[shiftX + bedL + (truck.is_tandem ? gap + trailerL : 0) + 0.5, groundY + 0.35, 0]} center>
        <div style={{ background: '#dc2626', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {unloadSide === 'side' ? '⇐ SIDE UNLOAD' : 'DOORS / 1st DROP'}
        </div>
      </Html>

      <OrbitControls minDistance={fitDist * 0.2} maxDistance={fitDist * 2.5} enablePan target={[0, bedH / 2, 0]} />
    </Canvas>
  );
};

export default TruckVisualizer3D;
