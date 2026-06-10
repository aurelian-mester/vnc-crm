import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

// External dimensions are in millimetres; we render in metres (S = 0.001).
const S = 0.001;
const DECK_Y = 1.05;  // trailer floor height above the road (m)
const WOOD_H = 0.144; // EUR pallet wooden base height (m)
const GAP_MM = 1200;  // visual gap between a tandem truck body and its drawbar trailer

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

// ---- Shared procedural textures & materials (module singletons) ---------
// Everything is generated locally — no external assets, intranet-safe.
let cargoTex: THREE.CanvasTexture | null = null;
function getCargoTexture(): THREE.CanvasTexture {
  if (cargoTex) return cargoTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  // brick-pattern of stacked boxes; the material color tints it per group
  const rows = 3, cols = 3;
  for (let r = 0; r < rows; r++) {
    const y0 = (r * 256) / rows, y1 = ((r + 1) * 256) / rows;
    const grad = g.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.85, 'rgba(0,0,0,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.16)');
    g.fillStyle = grad;
    g.fillRect(0, y0, 256, y1 - y0);
    g.strokeStyle = 'rgba(35,25,15,0.32)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, y1 - 1); g.lineTo(256, y1 - 1); g.stroke();
    const off = (r % 2) * (256 / cols / 2);
    g.strokeStyle = 'rgba(35,25,15,0.20)';
    for (let k = 0; k <= cols; k++) {
      const x = ((k * 256) / cols + off) % 256;
      g.beginPath(); g.moveTo(x, y0 + 2); g.lineTo(x, y1 - 2); g.stroke();
    }
  }
  cargoTex = new THREE.CanvasTexture(c);
  cargoTex.colorSpace = THREE.SRGBColorSpace;
  cargoTex.wrapS = cargoTex.wrapT = THREE.RepeatWrapping;
  return cargoTex;
}

let woodTex: THREE.CanvasTexture | null = null;
function getWoodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  const streaks = [8, 22, 31, 47, 58, 70, 83, 95, 104, 118];
  streaks.forEach((y, i) => {
    g.fillStyle = `rgba(90,55,25,${0.10 + (i % 3) * 0.05})`;
    g.fillRect(0, y, 128, 2 + (i % 2));
  });
  woodTex = new THREE.CanvasTexture(c);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  return woodTex;
}

let woodMat: THREE.MeshStandardMaterial | null = null;
function getWoodMat(): THREE.MeshStandardMaterial {
  if (!woodMat) woodMat = new THREE.MeshStandardMaterial({ map: getWoodTexture(), color: '#b5895c', roughness: 0.85 });
  return woodMat;
}

let strapMat: THREE.MeshStandardMaterial | null = null;
function getStrapMat(): THREE.MeshStandardMaterial {
  if (!strapMat) strapMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.6, transparent: true, opacity: 0.38 });
  return strapMat;
}

const cargoMats = new Map<string, THREE.MeshPhysicalMaterial>();
function getCargoMat(color: string): THREE.MeshPhysicalMaterial {
  let m = cargoMats.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color, map: getCargoTexture(), roughness: 0.55, metalness: 0.02,
      clearcoat: 0.4, clearcoatRoughness: 0.6, // shrink-wrap sheen
    });
    cargoMats.set(color, m);
  }
  return m;
}

// ---- Running gear -------------------------------------------------------
const Wheel: React.FC<{ x: number; z: number; r?: number; w?: number }> = ({ x, z, r = 0.5, w = 0.32 }) => (
  <group position={[x, r, z]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh castShadow><cylinderGeometry args={[r, r, w, 28]} /><meshStandardMaterial color="#15181c" roughness={0.92} /></mesh>
    <mesh><cylinderGeometry args={[r * 0.55, r * 0.55, w * 1.04, 20]} /><meshStandardMaterial color="#c9cfd6" metalness={0.85} roughness={0.3} /></mesh>
    <mesh><cylinderGeometry args={[r * 0.16, r * 0.16, w * 1.12, 12]} /><meshStandardMaterial color="#3d434b" metalness={0.6} roughness={0.4} /></mesh>
  </group>
);

const Axle: React.FC<{ x: number; halfW: number; dual?: boolean; r?: number }> = ({ x, halfW, dual = true, r = 0.5 }) => (
  <group>
    {[1, -1].map(s => (
      <group key={s}>
        <Wheel x={x} z={s * (halfW - 0.18)} r={r} />
        {dual && <Wheel x={x} z={s * (halfW - 0.52)} r={r} />}
      </group>
    ))}
    <mesh position={[x, r, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.07, 0.07, halfW * 2, 10]} /><meshStandardMaterial color="#23272d" metalness={0.5} roughness={0.5} /></mesh>
  </group>
);

// ---- Tractor cab --------------------------------------------------------
const CAB_LEN = 2.3;
const Cab: React.FC<{ frontX: number; width: number; trailerTop: number }> = ({ frontX, width, trailerTop }) => {
  const w = width * 0.99;
  const x0 = frontX - CAB_LEN; // front face of the cab
  const baseY = 0.8;
  const topY = trailerTop - 0.55;
  const bodyH = topY - baseY;
  const cx = x0 + CAB_LEN / 2;
  const paint = { color: '#1d5fad', metalness: 0.35, roughness: 0.28 };
  return (
    <group>
      {/* chassis + fifth-wheel area under the trailer nose */}
      <mesh position={[frontX + 0.6, 0.78, 0]} castShadow><boxGeometry args={[3.2, 0.22, w * 0.45]} /><meshStandardMaterial color="#2b3038" metalness={0.5} roughness={0.5} /></mesh>
      {/* cab shell */}
      <RoundedBox args={[CAB_LEN, bodyH, w]} radius={0.13} smoothness={4} position={[cx, baseY + bodyH / 2, 0]} castShadow>
        <meshStandardMaterial {...paint} />
      </RoundedBox>
      {/* roof air deflector */}
      <mesh position={[cx + 0.35, topY + 0.18, 0]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[1.35, 0.07, w * 0.92]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      {/* windshield */}
      <mesh position={[x0 - 0.012, baseY + bodyH * 0.72, 0]} rotation={[0, 0, -0.09]}>
        <boxGeometry args={[0.05, bodyH * 0.32, w * 0.84]} />
        <meshStandardMaterial color="#0b1d2c" roughness={0.06} metalness={0.5} />
      </mesh>
      {/* side windows */}
      {[1, -1].map(s => (
        <mesh key={s} position={[x0 + CAB_LEN * 0.32, baseY + bodyH * 0.7, s * (w / 2 + 0.002)]}>
          <boxGeometry args={[CAB_LEN * 0.42, bodyH * 0.2, 0.03]} />
          <meshStandardMaterial color="#0b1d2c" roughness={0.08} metalness={0.5} />
        </mesh>
      ))}
      {/* grille + chrome slats */}
      <mesh position={[x0 - 0.01, baseY + bodyH * 0.2, 0]}>
        <boxGeometry args={[0.06, bodyH * 0.28, w * 0.8]} />
        <meshStandardMaterial color="#15202b" roughness={0.5} metalness={0.4} />
      </mesh>
      {[0.12, 0.2, 0.28].map(f => (
        <mesh key={f} position={[x0 - 0.045, baseY + bodyH * f, 0]}>
          <boxGeometry args={[0.02, 0.03, w * 0.78]} />
          <meshStandardMaterial color="#9aa4af" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
      {/* bumper */}
      <RoundedBox args={[0.4, 0.46, w]} radius={0.06} position={[x0 + 0.1, 0.5, 0]} castShadow>
        <meshStandardMaterial color="#272c33" roughness={0.6} metalness={0.3} />
      </RoundedBox>
      {/* headlights */}
      {[1, -1].map(s => (
        <mesh key={s} position={[x0 - 0.02, 0.6, s * w * 0.36]}>
          <boxGeometry args={[0.05, 0.14, 0.3]} />
          <meshStandardMaterial color="#fff7d6" emissive="#ffe16b" emissiveIntensity={0.85} />
        </mesh>
      ))}
      {/* mirrors */}
      {[1, -1].map(s => (
        <group key={s} position={[x0 + 0.18, baseY + bodyH * 0.88, s * (w / 2 + 0.16)]}>
          <mesh><boxGeometry args={[0.04, 0.04, 0.32]} /><meshStandardMaterial color="#23272d" /></mesh>
          <mesh position={[0.04, -0.24, s * 0.12]}><boxGeometry args={[0.05, 0.44, 0.2]} /><meshStandardMaterial color="#1b212a" roughness={0.3} /></mesh>
        </group>
      ))}
      {/* fuel tank */}
      <mesh position={[frontX - 0.4, 0.55, w * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.25, 0.25, 1.1, 18]} />
        <meshStandardMaterial color="#aeb6bf" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* exhaust stack */}
      <mesh position={[x0 + CAB_LEN - 0.1, baseY + bodyH * 0.5, -(w / 2 - 0.08)]}>
        <cylinderGeometry args={[0.06, 0.06, bodyH * 0.9, 10]} />
        <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
};

// ---- Trailer body (curtain-sider) ---------------------------------------
// Origin: front-bottom-left corner, local y=0 at the floor's load surface.
// Both side curtains are translucent so the load stays visible from any
// camera angle; rear doors are rendered swung open.
const TrailerBody: React.FC<{ length: number; width: number; height: number; deckY?: number; doorsOpen?: boolean }> = ({ length, width, height, deckY, doorsOpen = true }) => {
  const nPosts = Math.max(2, Math.round(length / 2.4)) + 1;
  return (
    <group>
      {/* floor */}
      <mesh position={[length / 2, -0.04, width / 2]} receiveShadow castShadow><boxGeometry args={[length, 0.08, width]} /><meshStandardMaterial color="#646c76" roughness={0.9} /></mesh>
      {/* chassis rails */}
      {[0.32, 0.68].map(f => (
        <mesh key={f} position={[length / 2, -0.22, width * f]} castShadow><boxGeometry args={[length * 0.96, 0.26, 0.12]} /><meshStandardMaterial color="#2b3038" metalness={0.4} roughness={0.6} /></mesh>
      ))}
      {/* aerodynamic side skirts between the axle groups */}
      {[0, width].map(z => (
        <mesh key={'skirt' + z} position={[length * 0.4, -0.48, z]} castShadow><boxGeometry args={[length * 0.48, 0.5, 0.03]} /><meshStandardMaterial color="#dde3ea" roughness={0.5} metalness={0.15} /></mesh>
      ))}
      {/* headboard */}
      <mesh position={[-0.025, height / 2, width / 2]} castShadow><boxGeometry args={[0.05, height, width]} /><meshStandardMaterial color="#e8ecf1" roughness={0.5} metalness={0.15} /></mesh>
      {/* translucent side curtains */}
      {[0, width].map(z => (
        <mesh key={'cur' + z} position={[length / 2, height / 2 + 0.1, z]}>
          <boxGeometry args={[length, height - 0.42, 0.02]} />
          <meshStandardMaterial color="#b8c6d8" transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* bottom rail + brand stripe + top rail, both sides */}
      {[0, width].map(z => (
        <group key={'rails' + z}>
          <mesh position={[length / 2, 0.16, z]} castShadow><boxGeometry args={[length, 0.32, 0.05]} /><meshStandardMaterial color="#9aa6b4" metalness={0.3} roughness={0.5} /></mesh>
          <mesh position={[length / 2, 0.27, z === 0 ? -0.028 : z + 0.028]}><boxGeometry args={[length, 0.07, 0.012]} /><meshStandardMaterial color="#2563eb" /></mesh>
          <mesh position={[length / 2, height - 0.06, z]} castShadow><boxGeometry args={[length, 0.12, 0.06]} /><meshStandardMaterial color="#c3ccd6" metalness={0.3} roughness={0.5} /></mesh>
        </group>
      ))}
      {/* curtain posts */}
      {Array.from({ length: nPosts }).map((_, i) => {
        const px = Math.min(Math.max((i / (nPosts - 1)) * length, 0.03), length - 0.03);
        return (
          <group key={'post' + i}>
            {[0, width].map(z => (
              <mesh key={z} position={[px, height / 2, z]}><boxGeometry args={[0.06, height, 0.05]} /><meshStandardMaterial color="#aab3bd" metalness={0.35} roughness={0.5} /></mesh>
            ))}
          </group>
        );
      })}
      {/* translucent roof */}
      <mesh position={[length / 2, height - 0.02, width / 2]}>
        <boxGeometry args={[length, 0.04, width]} />
        <meshStandardMaterial color="#e8ecf1" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* rear header + doors swung open */}
      <mesh position={[length - 0.03, height - 0.07, width / 2]}><boxGeometry args={[0.06, 0.14, width]} /><meshStandardMaterial color="#e8ecf1" /></mesh>
      <group position={[length, 0, 0]} rotation={[0, doorsOpen ? 1.95 : 0, 0]}>
        <mesh position={[0.025, height / 2, width / 4]} castShadow><boxGeometry args={[0.05, height * 0.96, width / 2 - 0.04]} /><meshStandardMaterial color="#f4f7fa" roughness={0.45} metalness={0.1} /></mesh>
      </group>
      <group position={[length, 0, width]} rotation={[0, doorsOpen ? -1.95 : 0, 0]}>
        <mesh position={[0.025, height / 2, -width / 4]} castShadow><boxGeometry args={[0.05, height * 0.96, width / 2 - 0.04]} /><meshStandardMaterial color="#f4f7fa" roughness={0.45} metalness={0.1} /></mesh>
      </group>
      {/* rear underrun bar + taillights */}
      <mesh position={[length - 0.15, -0.6, width / 2]} castShadow><boxGeometry args={[0.08, 0.1, width * 0.85]} /><meshStandardMaterial color="#2b3038" /></mesh>
      {[0.12, 0.88].map(f => (
        <mesh key={'tl' + f} position={[length - 0.02, -0.32, width * f]}><boxGeometry args={[0.04, 0.12, 0.24]} /><meshStandardMaterial color="#7f1d1d" emissive="#dc2626" emissiveIntensity={0.6} /></mesh>
      ))}
      {/* intermediate deck floor for double-deckers */}
      {deckY !== undefined && (
        <mesh position={[length / 2, deckY - 0.03, width / 2]} receiveShadow><boxGeometry args={[length, 0.05, width]} /><meshStandardMaterial color="#8a93a0" roughness={0.85} transparent opacity={0.95} /></mesh>
      )}
    </group>
  );
};

// ---- Pallet: wooden EUR base + shrink-wrapped box stack ------------------
const PalletUnit: React.FC<{ p: VizPallet; offsetX: number; bedWidth: number; showLabel?: boolean }> = ({ p, offsetX, bedWidth, showLabel }) => {
  const l = p.length * S, w = p.width * S, hTot = p.height * S;
  const cx = offsetX + (p.x + p.length / 2) * S;
  const cz = (p.y + p.width / 2) * S - (bedWidth * S) / 2;
  const y0 = DECK_Y + p.z * S;
  const woodH = Math.min(WOOD_H, hTot * 0.3);
  const cargoH = Math.max(hTot - woodH, 0.05);
  const boardW = (w / 5) * 0.7;
  return (
    <group position={[cx, y0, cz]}>
      {/* 5 top deck boards */}
      {[0, 1, 2, 3, 4].map(i => (
        <mesh key={'b' + i} position={[0, woodH - 0.012, -w / 2 + (i + 0.5) * (w / 5)]} castShadow material={getWoodMat()}>
          <boxGeometry args={[l * 0.99, 0.024, boardW]} />
        </mesh>
      ))}
      {/* 3 transverse bearers */}
      {[-0.405, 0, 0.405].map(f => (
        <mesh key={'r' + f} position={[f * l, (woodH - 0.024) / 2, 0]} material={getWoodMat()}>
          <boxGeometry args={[l * 0.13, woodH - 0.024, w * 0.96]} />
        </mesh>
      ))}
      {/* shrink-wrapped cargo stack */}
      <RoundedBox args={[l * 0.97, cargoH, w * 0.97]} radius={Math.min(0.03, cargoH * 0.15, l * 0.1)} smoothness={2} position={[0, woodH + cargoH / 2, 0]} castShadow receiveShadow material={getCargoMat(p.color)} />
      {/* strapping bands */}
      {[-0.28, 0.28].map(f => (
        <mesh key={'s' + f} position={[f * l, woodH + cargoH / 2, 0]} material={getStrapMat()}>
          <boxGeometry args={[0.02, cargoH * 1.005, w * 0.99]} />
        </mesh>
      ))}
      {showLabel && (p.sequence !== undefined || p.destination) && (
        <Html position={[0, hTot + 0.14, 0]} center distanceFactor={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(15,23,42,0.85)', color: '#fff', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif', boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
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

  const totalLen = CAB_LEN + bedL + (truck.is_tandem ? gap + trailerL : 0);
  const shiftX = -totalLen / 2 + CAB_LEN;
  const deckClear = deckClearanceMm ? deckClearanceMm * S : bedH / 2;
  const trailerOffsetX = shiftX + bedL + gap;
  const rearX = shiftX + bedL + (truck.is_tandem ? gap + trailerL : 0);
  const halfW = bedW / 2;
  const trailerTop = DECK_Y + bedH;
  const rigCenterX = (shiftX - CAB_LEN + rearX) / 2;

  const fitDist = Math.max(totalLen * 1.6, 10);
  const camPos: [number, number, number] = [fitDist * 0.5, fitDist * 0.35, fitDist * 0.85];

  const bodyPallets = pallets.filter(p => !p.is_trailer);
  const trailerPallets = pallets.filter(p => p.is_trailer);

  // Label only the first pallet of each destination/drop group to avoid clutter.
  const labelIds = useMemo(() => {
    const seen = new Set<string>(), ids = new Set<string>();
    for (const p of pallets) {
      const k = `${p.sequence ?? ''}|${p.destination ?? ''}`;
      if ((p.sequence !== undefined || p.destination) && !seen.has(k)) { seen.add(k); ids.add(p.id); }
    }
    return ids;
  }, [pallets]);

  const markerPos: [number, number, number] = unloadSide === 'side'
    ? [shiftX + bedL / 2, DECK_Y + 0.3, halfW + 1.1]
    : [rearX + 1.3, DECK_Y + 0.3, 0];

  return (
    <Canvas camera={{ position: camPos, fov: 35 }} shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}>
      <color attach="background" args={['#e9eef5']} />
      <fog attach="fog" args={['#e9eef5', fitDist * 1.5, fitDist * 3.6]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[fitDist * 0.4, fitDist * 0.75, fitDist * 0.3]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02}>
        <orthographicCamera attach="shadow-camera" args={[-totalLen * 1.1, totalLen * 1.1, totalLen * 0.7, -totalLen * 0.7, 1, fitDist * 4]} />
      </directionalLight>
      <directionalLight position={[-fitDist * 0.5, fitDist * 0.35, -fitDist * 0.45]} intensity={0.3} />
      {/* local studio environment for reflections — rendered in-app, no fetches */}
      <Environment frames={1} resolution={64}>
        <Lightformer intensity={1.0} rotation-x={Math.PI / 2} position={[0, 5, 0]} scale={[12, 12, 1]} />
        <Lightformer intensity={0.5} rotation-y={Math.PI / 2} position={[-8, 3, 0]} scale={[10, 4, 1]} />
        <Lightformer intensity={0.5} rotation-y={-Math.PI / 2} position={[8, 3, 0]} scale={[10, 4, 1]} />
      </Environment>

      {/* road surface + parking-bay lines */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[totalLen * 2.4, 64]} />
        <meshStandardMaterial color="#d3d9e2" roughness={0.96} />
      </mesh>
      {[1, -1].map(s => (
        <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[rigCenterX, 0.004, s * (halfW + 0.9)]}>
          <planeGeometry args={[totalLen + 2, 0.12]} />
          <meshStandardMaterial color="#aeb7c4" />
        </mesh>
      ))}

      <Cab frontX={shiftX} width={bedW} trailerTop={trailerTop} />

      {/* Main load body */}
      <group position={[shiftX, DECK_Y, -halfW]}>
        <TrailerBody length={bedL} width={bedW} height={bedH} deckY={doubleDeck ? deckClear : undefined} doorsOpen={!truck.is_tandem} />
      </group>
      {truck.is_tandem && (
        <>
          {/* drawbar */}
          <mesh position={[shiftX + bedL + gap / 2, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.05, 0.05, gap + 0.6, 8]} />
            <meshStandardMaterial color="#2b3038" metalness={0.5} roughness={0.5} />
          </mesh>
          <group position={[trailerOffsetX, DECK_Y, -halfW]}>
            <TrailerBody length={trailerL} width={bedW} height={bedH} deckY={doubleDeck ? deckClear : undefined} />
          </group>
        </>
      )}

      {/* Running gear */}
      <Axle x={shiftX - CAB_LEN + 0.75} halfW={halfW} dual={false} r={0.52} />
      {truck.is_tandem ? (
        <>
          <Axle x={shiftX + bedL - 1.8} halfW={halfW} />
          <Axle x={shiftX + bedL - 0.7} halfW={halfW} />
          <Axle x={trailerOffsetX + 1.0} halfW={halfW} />
          <Axle x={trailerOffsetX + trailerL - 1.0} halfW={halfW} />
        </>
      ) : (
        <>
          <Axle x={shiftX + 0.6} halfW={halfW} />
          <Axle x={shiftX + bedL - 2.7} halfW={halfW} />
          <Axle x={shiftX + bedL - 1.85} halfW={halfW} />
          <Axle x={shiftX + bedL - 1.0} halfW={halfW} />
        </>
      )}

      {/* Pallets */}
      {bodyPallets.map(p => <PalletUnit key={p.id} p={p} offsetX={shiftX} bedWidth={truck.bed_width_mm} showLabel={showLabels && labelIds.has(p.id)} />)}
      {trailerPallets.map(p => <PalletUnit key={p.id} p={p} offsetX={trailerOffsetX} bedWidth={truck.bed_width_mm} showLabel={showLabels && labelIds.has(p.id)} />)}

      {/* Unload-end marker */}
      <Html position={markerPos} center>
        <div style={{ background: '#dc2626', color: '#fff', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif', boxShadow: '0 1px 5px rgba(0,0,0,0.4)' }}>
          {unloadSide === 'side' ? '⇐ SIDE UNLOAD' : 'DOORS / 1st DROP'}
        </div>
      </Html>

      <OrbitControls minDistance={fitDist * 0.25} maxDistance={fitDist * 2.2} enablePan maxPolarAngle={Math.PI / 2 - 0.04} target={[0, DECK_Y + bedH * 0.35, 0]} />
    </Canvas>
  );
};

export default TruckVisualizer3D;
