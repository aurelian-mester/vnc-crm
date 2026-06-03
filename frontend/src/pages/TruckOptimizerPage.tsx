import React, { useEffect, useState, useRef } from 'react';
import { useI18n } from '../i18n';
import { parseJWT } from '../App';

interface PalletPreset {
  id: number;
  name: string;
  length_mm: number;
  width_mm: number;
  max_height_mm: number;
  tare_weight_kg: number;
}

interface TruckPreset {
  id: number;
  name: string;
  type: string;
  bed_length_mm: number;
  bed_width_mm: number;
  bed_height_mm: number;
  max_payload_kg: number;
  is_tandem: boolean;
  trailer_length_mm: number;
  trailer_payload_kg: number;
}

interface LoadPlan {
  id: number;
  title: string;
  truck_preset_id: number;
  total_pallets: number;
  utilization_percentage: number;
  total_weight_kg: number;
  payload_layout: string;
  created_at: string;
}

interface QueueItem {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  quantity: number;
  stackable: boolean;
  color: string;
}

interface PackedPallet {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number; // Z offset (0 = floor, >0 for stacked height)
  length: number;
  width: number;
  height: number;
  weight: number;
  rotated: boolean;
  color: string;
  is_trailer: boolean;
}

const TruckOptimizerPage: React.FC = () => {
  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const role = user?.role || 'viewer';
  const { locale, t } = useI18n();

  // Presets & Plans state
  const [truckPresets, setTruckPresets] = useState<TruckPreset[]>([]);
  const [palletPresets, setPalletPresets] = useState<PalletPreset[]>([]);
  const [loadPlans, setLoadPlans] = useState<LoadPlan[]>([]);
  const [activeTruck, setActiveTruck] = useState<TruckPreset | null>(null);
  
  // Packing queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [formPalletType, setFormPalletType] = useState<string>('custom');
  const [customPallet, setCustomPallet] = useState({
    name: 'Custom Pallet',
    length: 1200,
    width: 800,
    height: 1600,
    weight: 450,
    quantity: 10,
    stackable: true,
    color: '#e74c3c'
  });

  // Pack result state
  const [packedItems, setPackedItems] = useState<PackedPallet[]>([]);
  const [unpackedItems, setUnpackedItems] = useState<PackedPallet[]>([]);
  const [stats, setStats] = useState({
    floorSpaceUtil: 0,
    volumeUtil: 0,
    weightUtil: 0,
    totalWeight: 0,
    axleDistribution: 'Balanced'
  });

  // Dragging state
  const [draggingPalletId, setDraggingPalletId] = useState<string | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartCoords = useRef({ x: 0, y: 0 });
  
  // Notification state
  const [saveTitle, setSaveTitle] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Color options
  const colorList = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

  useEffect(() => {
    fetchPresets();
    fetchLoadPlans();
  }, [token]);

  const fetchPresets = async () => {
    try {
      const res = await fetch('/vnc-crm/api/logistics/presets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTruckPresets(data.trucks || []);
        setPalletPresets(data.pallets || []);
        if (data.trucks && data.trucks.length > 0) {
          setActiveTruck(data.trucks[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch presets', err);
    }
  };

  const fetchLoadPlans = async () => {
    try {
      const res = await fetch('/vnc-crm/api/logistics/load-plans', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLoadPlans(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch load plans', err);
    }
  };

  // Add Item to Packing Queue
  const handleAddToQueue = (e: React.FormEvent) => {
    e.preventDefault();
    const id = 'Q-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const color = colorList[queue.length % colorList.length];

    let newItem: QueueItem;
    if (formPalletType === 'custom') {
      newItem = { ...customPallet, id, color };
    } else {
      const preset = palletPresets.find(p => p.id.toString() === formPalletType);
      if (!preset) return;
      newItem = {
        id,
        name: preset.name,
        length: preset.length_mm,
        width: preset.width_mm,
        height: customPallet.height,
        weight: customPallet.weight,
        quantity: customPallet.quantity,
        stackable: customPallet.stackable,
        color
      };
    }
    setQueue([...queue, newItem]);
  };

  const handleRemoveFromQueue = (id: string) => {
    setQueue(queue.filter(q => q.id !== id));
  };

  // Trigger Backend Optimizer Packing Algorithm
  const handleOptimize = async () => {
    if (!activeTruck) return;
    setLoading(true);
    try {
      const res = await fetch('/vnc-crm/api/logistics/optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          truck_preset_id: activeTruck.id,
          items: queue.map(q => ({
            id: q.id,
            name: q.name,
            length_mm: q.length,
            width_mm: q.width,
            height_mm: q.height,
            weight_kg: q.weight,
            quantity: q.quantity,
            stackable: q.stackable,
            color: q.color
          }))
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPackedItems(data.packed_items || []);
        setUnpackedItems(data.unpacked_items || []);
        setStats({
          floorSpaceUtil: data.floor_space_utilization,
          volumeUtil: data.volume_utilization,
          weightUtil: data.weight_utilization,
          totalWeight: data.total_weight_kg,
          axleDistribution: data.axle_distribution
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Dragging interaction handlers on the SVG Canvas
  const handleMouseDown = (e: React.MouseEvent, pId: string) => {
    e.preventDefault();
    setDraggingPalletId(pId);
    const pallet = packedItems.find(p => p.id === pId);
    if (!pallet) return;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartCoords.current = { x: pallet.x, y: pallet.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingPalletId || !activeTruck) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    
    // Scale factor is 0.05 (20mm = 1px)
    const scale = 20.0;
    const mmDx = Math.round(dx * scale);
    const mmDy = Math.round(dy * scale);

    setPackedItems(prev => prev.map(p => {
      if (p.id !== draggingPalletId) return p;
      let newX = dragStartCoords.current.x + mmDx;
      let newY = dragStartCoords.current.y + mmDy;

      // Keep within truck borders
      const lenLimit = p.is_trailer ? activeTruck.trailer_length_mm : activeTruck.bed_length_mm;
      newX = Math.max(0, Math.min(newX, lenLimit - p.length));
      newY = Math.max(0, Math.min(newY, activeTruck.bed_width_mm - p.width));

      return { ...p, x: newX, y: newY };
    }));
  };

  const handleMouseUp = () => {
    if (!draggingPalletId) return;
    
    // Snap positions to nearest 50mm on drag release
    setPackedItems(prev => prev.map(p => {
      if (p.id !== draggingPalletId) return p;
      const snapX = Math.round(p.x / 50) * 50;
      const snapY = Math.round(p.y / 50) * 50;
      return { ...p, x: snapX, y: snapY };
    }));

    setDraggingPalletId(null);
    recalculateStats();
  };

  // Double Click to Rotate Pallet
  const handleDoubleClick = (pId: string) => {
    setPackedItems(prev => prev.map(p => {
      if (p.id !== pId) return p;
      const nextRotated = !p.rotated;
      return {
        ...p,
        rotated: nextRotated,
        length: p.width,
        width: p.length
      };
    }));
    recalculateStats();
  };

  // Client-Side Live Recalculations of stats after manual adjustments
  const recalculateStats = () => {
    if (!activeTruck) return;
    let packedFloorArea = 0;
    let packedVol = 0;
    let totalWt = 0;

    packedItems.forEach(p => {
      if (p.z === 0) {
        packedFloorArea += p.length * p.width;
      }
      packedVol += p.length * p.width * p.height;
      totalWt += p.weight;
    });

    let totalFloorArea = activeTruck.bed_length_mm * activeTruck.bed_width_mm;
    let totalBedVol = activeTruck.bed_length_mm * activeTruck.bed_width_mm * activeTruck.bed_height_mm;
    let maxPayload = activeTruck.max_payload_kg;

    if (activeTruck.is_tandem) {
      totalFloorArea += activeTruck.trailer_length_mm * activeTruck.bed_width_mm;
      totalBedVol += activeTruck.trailer_length_mm * activeTruck.bed_width_mm * activeTruck.bed_height_mm;
      maxPayload += activeTruck.trailer_payload_kg;
    }

    const spaceUtil = (packedFloorArea / totalFloorArea) * 100;
    const volUtil = (packedVol / totalBedVol) * 100;
    const weightUtil = (totalWt / maxPayload) * 100;

    // COG balance
    let axleDistribution = 'Balanced';
    let sumWtX = 0;
    let sumWt = 0;
    packedItems.forEach(p => {
      if (!p.is_trailer) {
        sumWtX += p.weight * (p.x + p.length / 2);
        sumWt += p.weight;
      }
    });

    if (sumWt > 0) {
      const cogPct = (sumWtX / activeTruck.bed_length_mm) / sumWt * 100;
      if (cogPct < 40) axleDistribution = 'Front heavy';
      else if (cogPct > 60) axleDistribution = 'Rear heavy';
    }

    setStats({
      floorSpaceUtil: spaceUtil,
      volumeUtil: volUtil,
      weightUtil: weightUtil,
      totalWeight: totalWt,
      axleDistribution
    });
  };

  // Save the load plan
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTruck || !saveTitle) return;

    try {
      const res = await fetch('/vnc-crm/api/logistics/load-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: saveTitle,
          truck_preset_id: activeTruck.id,
          total_pallets: packedItems.length,
          utilization_percentage: stats.floorSpaceUtil,
          total_weight_kg: stats.totalWeight,
          payload_layout: JSON.stringify(packedItems)
        })
      });
      if (res.ok) {
        fetchLoadPlans();
        setShowSaveModal(false);
        setSaveTitle('');
        alert('Load plan saved successfully!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Load a saved plan
  const handleLoadPlan = (plan: LoadPlan) => {
    const truck = truckPresets.find(t => t.id === plan.truck_preset_id);
    if (truck) setActiveTruck(truck);
    try {
      const layout = JSON.parse(plan.payload_layout);
      setPackedItems(layout || []);
      setUnpackedItems([]);
      // Sync stats
      setTimeout(() => recalculateStats(), 100);
    } catch (e) {
      console.error(e);
    }
  };

  // Trigger printable PDF style layout sheet
  const handlePrintSheet = () => {
    window.print();
  };

  // SVG Scalers & Coordinate Helpers
  // Bed Width is always 2450mm -> Scaled to 122.5px (scale = 0.05)
  // Bed Length 13600mm -> Scaled to 680px
  const scale = 0.05;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      
      {/* Header and Quick stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--secondary-color)', fontWeight: 700, fontSize: '1.6rem' }}>
            🚚 {locale === 'ro' ? 'Optimizare Încărcare Camioane' : 'Truck Loading Optimization'}
          </h1>
          <p style={{ margin: '5px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {locale === 'ro' ? 'Planifică și așază paleții pe camioane semi sau tandem pentru a optimiza volumul și greutatea.' : 'Arrange and pack pallets onto semi-trailers or tandem rigs to maximize volumetric yield and maintain axle balance.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-primary" onClick={handleOptimize} disabled={queue.length === 0 || loading}>
            {loading ? 'Optimizing...' : '⚡ ' + (locale === 'ro' ? 'Calculare Automată' : 'Autofill Optimizer')}
          </button>
          <button 
            className="btn-primary" 
            style={{ backgroundColor: '#2ecc71' }} 
            onClick={() => setShowSaveModal(true)} 
            disabled={packedItems.length === 0}
          >
            💾 {locale === 'ro' ? 'Salvează Configurația' : 'Save Load Plan'}
          </button>
          <button 
            className="btn-primary" 
            style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)' }} 
            onClick={handlePrintSheet}
            disabled={packedItems.length === 0}
          >
            🖨️ {locale === 'ro' ? 'Printează Fișa' : 'Print Loading Sheet'}
          </button>
        </div>
      </div>

      {/* KPI Stats Gauges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        
        <div className="card" style={{ padding: '20px', borderLeft: '4px solid #3498db' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3498db', textTransform: 'uppercase' }}>
            {locale === 'ro' ? 'Grad Ocupare Podea' : 'Floor Space Utilization'}
          </span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '1.6rem', color: 'var(--secondary-color)' }}>
            {stats.floorSpaceUtil.toFixed(1)}%
          </h3>
          <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, stats.floorSpaceUtil)}%`, height: '100%', backgroundColor: '#3498db', borderRadius: '3px' }} />
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderLeft: '4px solid #9b59b6' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9b59b6', textTransform: 'uppercase' }}>
            {locale === 'ro' ? 'Grad Ocupare Volum' : 'Volumetric Utilization'}
          </span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '1.6rem', color: 'var(--secondary-color)' }}>
            {stats.volumeUtil.toFixed(1)}%
          </h3>
          <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, stats.volumeUtil)}%`, height: '100%', backgroundColor: '#9b59b6', borderRadius: '3px' }} />
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderLeft: `4px solid ${stats.weightUtil > 100 ? '#e74c3c' : '#2ecc71'}` }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: stats.weightUtil > 100 ? '#e74c3c' : '#2ecc71', textTransform: 'uppercase' }}>
            {locale === 'ro' ? 'Greutate Încărcătură' : 'Payload Weight'}
          </span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '1.6rem', color: 'var(--secondary-color)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{(stats.totalWeight).toLocaleString('en-US', { maximumFractionDigits: 0 })} kg</span>
            <span style={{ fontSize: '1rem', color: '#7f8c8d' }}>({stats.weightUtil.toFixed(1)}%)</span>
          </h3>
          <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, stats.weightUtil)}%`, height: '100%', backgroundColor: stats.weightUtil > 100 ? '#e74c3c' : '#2ecc71', borderRadius: '3px' }} />
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderLeft: `4px solid ${stats.axleDistribution === 'Balanced' ? '#2ecc71' : '#f1c40f'}` }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: stats.axleDistribution === 'Balanced' ? '#2ecc71' : '#f1c40f', textTransform: 'uppercase' }}>
            {locale === 'ro' ? 'Distribuție Masă Osii' : 'Axle Load Distribution'}
          </span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '1.6rem', color: 'var(--secondary-color)' }}>
            {stats.axleDistribution === 'Balanced' ? 'Balanced' : stats.axleDistribution === 'Front heavy' ? '⚠️ Front Heavy' : '⚠️ Rear Heavy'}
          </h3>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Center of Gravity is at the {stats.axleDistribution === 'Balanced' ? 'center' : stats.axleDistribution === 'Front heavy' ? 'front' : 'rear'} section.
          </div>
        </div>

      </div>

      {/* Main workspace layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '30px', alignItems: 'start' }}>
        
        {/* Left Side Config & Queue Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Truck Selector */}
          <div className="card" style={{ padding: '20px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: 'var(--secondary-color)', fontSize: '0.95rem' }}>
              🚛 {locale === 'ro' ? 'Alege Camion / Remorcă' : 'Select Transport Vehicle'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {truckPresets.map(tPreset => (
                <button
                  key={tPreset.id}
                  onClick={() => {
                    setActiveTruck(tPreset);
                    setPackedItems([]);
                    setUnpackedItems([]);
                  }}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: activeTruck?.id === tPreset.id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                    backgroundColor: activeTruck?.id === tPreset.id ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                >
                  <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--secondary-color)' }}>{tPreset.name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Payload: {tPreset.max_payload_kg + (tPreset.trailer_payload_kg || 0)} kg | {tPreset.bed_length_mm / 1000}m bed
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Pallet Adder Form */}
          <div className="card" style={{ padding: '20px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: 'var(--secondary-color)', fontSize: '0.95rem' }}>
              📦 {locale === 'ro' ? 'Adaugă Paleți în Listă' : 'Add Pallets to Load'}
            </h4>
            <form onSubmit={handleAddToQueue} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {locale === 'ro' ? 'Tip Palet' : 'Pallet Dimension Standard'}
                </label>
                <select
                  value={formPalletType}
                  onChange={(e) => setFormPalletType(e.target.value)}
                  className="config-input"
                  style={{ marginBottom: 0 }}
                >
                  <option value="custom">Custom Dimensions</option>
                  {palletPresets.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.length_mm}x{p.width_mm})</option>
                  ))}
                </select>
              </div>

              {formPalletType === 'custom' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Length (mm)</label>
                    <input
                      type="number"
                      value={customPallet.length}
                      onChange={e => setCustomPallet({ ...customPallet, length: Number(e.target.value) })}
                      className="config-input"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Width (mm)</label>
                    <input
                      type="number"
                      value={customPallet.width}
                      onChange={e => setCustomPallet({ ...customPallet, width: Number(e.target.value) })}
                      className="config-input"
                    />
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Height (mm)</label>
                  <input
                    type="number"
                    value={customPallet.height}
                    onChange={e => setCustomPallet({ ...customPallet, height: Number(e.target.value) })}
                    className="config-input"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Weight/Pallet (kg)</label>
                  <input
                    type="number"
                    value={customPallet.weight}
                    onChange={e => setCustomPallet({ ...customPallet, weight: Number(e.target.value) })}
                    className="config-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Qty (Pallets)</label>
                  <input
                    type="number"
                    value={customPallet.quantity}
                    onChange={e => setCustomPallet({ ...customPallet, quantity: Number(e.target.value) })}
                    className="config-input"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '20px' }}>
                  <input
                    type="checkbox"
                    id="stackable-chk"
                    checked={customPallet.stackable}
                    onChange={e => setCustomPallet({ ...customPallet, stackable: e.target.checked })}
                  />
                  <label htmlFor="stackable-chk" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer' }}>
                    Stackable
                  </label>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Description / Order Ref</label>
                <input
                  type="text"
                  value={customPallet.name}
                  onChange={e => setCustomPallet({ ...customPallet, name: e.target.value })}
                  className="config-input"
                  placeholder="e.g., Won Quote #12 sheets"
                />
              </div>

              <button type="submit" className="btn-primary" style={{ padding: '8px 12px', marginTop: '6px' }}>
                ➕ {locale === 'ro' ? 'Adaugă în Coadă' : 'Add to Queue'}
              </button>
            </form>
          </div>

          {/* Queue Listing */}
          <div className="card" style={{ padding: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0', color: 'var(--secondary-color)', fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 {locale === 'ro' ? 'Coada de Încărcare' : 'Queue to Pack'}</span>
              <span className="badge-count" style={{ backgroundColor: 'var(--primary-color)', color: 'white' }}>{queue.length}</span>
            </h4>

            {queue.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '15px 0' }}>
                Queue is empty. Add pallets above.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {queue.map(q => (
                  <div key={q.id} style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: q.color }} />
                      <div style={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{q.name}</div>
                        <div style={{ color: 'var(--text-muted)' }}>
                          {q.quantity}x | {q.length}x{q.width}x{q.height} | {q.weight}kg
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRemoveFromQueue(q.id)}
                      style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Side Visualizer & Canvas Workspace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Top-Down visualizer bed */}
          <div className="card" style={{ padding: '25px', overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 15px 0', color: 'var(--secondary-color)', fontSize: '0.95rem' }}>
              🗺️ {locale === 'ro' ? 'Harta Încărcare Podea (Vedere de sus)' : 'Floor Grid Packing Plan (Top-Down)'}
            </h4>

            {activeTruck && (
              <div 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '30px', 
                  alignItems: 'center',
                  backgroundColor: '#0f172a', // Dark theme background for visual pop
                  padding: '40px 20px',
                  borderRadius: '12px',
                  position: 'relative'
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                
                {/* Main truck bed SVG */}
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
                    CABIN FRONT (X=0) ➔➔ REAR (X={activeTruck.bed_length_mm})
                  </div>
                  <svg 
                    width={activeTruck.bed_length_mm * scale + 40} 
                    height={activeTruck.bed_width_mm * scale + 30} 
                    style={{ overflow: 'visible' }}
                  >
                    {/* Cabin representation */}
                    <rect x="-30" y="20" width="25" height={activeTruck.bed_width_mm * scale - 40} fill="#475569" rx="4" />
                    <line x1="-30" y1="20" x2="-5" y2="40" stroke="#64748b" strokeWidth="2" />
                    
                    {/* Bed layout */}
                    <rect 
                      x="0" 
                      y="0" 
                      width={activeTruck.bed_length_mm * scale} 
                      height={activeTruck.bed_width_mm * scale} 
                      fill="#1e293b" 
                      stroke="#475569" 
                      strokeWidth="3"
                    />

                    {/* Guidelines and grid */}
                    <line x1={activeTruck.bed_length_mm * scale / 2} y1="0" x2={activeTruck.bed_length_mm * scale / 2} y2={activeTruck.bed_width_mm * scale} stroke="#334155" strokeDasharray="5,5" />

                    {/* Wheel axles indicator */}
                    <circle cx="90" cy={activeTruck.bed_width_mm * scale + 10} r="8" fill="#475569" />
                    <circle cx={activeTruck.bed_length_mm * scale - 90} cy={activeTruck.bed_width_mm * scale + 10} r="8" fill="#475569" />
                    <circle cx={activeTruck.bed_length_mm * scale - 120} cy={activeTruck.bed_width_mm * scale + 10} r="8" fill="#475569" />

                    {/* Packed items */}
                    {packedItems.filter(p => !p.is_trailer).map(p => (
                      <g 
                        key={p.id}
                        transform={`translate(${p.x * scale}, ${p.y * scale})`}
                        onMouseDown={(e) => handleMouseDown(e, p.id)}
                        onDoubleClick={() => handleDoubleClick(p.id)}
                        style={{ cursor: draggingPalletId === p.id ? 'grabbing' : 'grab' }}
                      >
                        <rect
                          width={p.length * scale}
                          height={p.width * scale}
                          fill={p.color}
                          stroke="#ffffff"
                          strokeWidth={draggingPalletId === p.id ? "2" : "1"}
                          opacity={p.z > 0 ? 0.9 : 1}
                          rx="3"
                        />
                        {/* If stacked, draw small tier indicator box */}
                        {p.z > 0 ? (
                          <rect
                            x="4"
                            y="4"
                            width={p.length * scale - 8}
                            height={p.width * scale - 8}
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                            strokeDasharray="2,2"
                          />
                        ) : null}

                        {/* Label */}
                        {p.length * scale > 30 && (
                          <text
                            x={p.length * scale / 2}
                            y={p.width * scale / 2 + 4}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="8"
                            fontWeight="bold"
                            style={{ userSelect: 'none', pointerEvents: 'none' }}
                          >
                            {p.z > 0 ? `➋ ${p.name.slice(0,4)}` : p.name.slice(0,6)}
                          </text>
                        )}
                        <title>{`${p.name}\nSize: ${p.length}x${p.width}x${p.height}mm\nWeight: ${p.weight}kg\nZ-Height: ${p.z > 0 ? 'Double Stack' : 'Floor'}\n(Double click to rotate)`}</title>
                      </g>
                    ))}
                  </svg>
                </div>

                {/* Trailer bed layout (only if Tandem type) */}
                {activeTruck.is_tandem && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
                      TRAILER BACK BED (Length: {activeTruck.trailer_length_mm}mm)
                    </div>
                    <svg 
                      width={activeTruck.trailer_length_mm * scale + 40} 
                      height={activeTruck.bed_width_mm * scale + 30} 
                      style={{ overflow: 'visible' }}
                    >
                      {/* Hook representation */}
                      <line x1="-30" y1={activeTruck.bed_width_mm * scale / 2} x2="0" y2={activeTruck.bed_width_mm * scale / 2} stroke="#64748b" strokeWidth="4" />
                      
                      <rect 
                        x="0" 
                        y="0" 
                        width={activeTruck.trailer_length_mm * scale} 
                        height={activeTruck.bed_width_mm * scale} 
                        fill="#1e293b" 
                        stroke="#475569" 
                        strokeWidth="3"
                      />

                      {/* Wheels */}
                      <circle cx="80" cy={activeTruck.bed_width_mm * scale + 10} r="8" fill="#475569" />
                      <circle cx="110" cy={activeTruck.bed_width_mm * scale + 10} r="8" fill="#475569" />
                      <circle cx={activeTruck.trailer_length_mm * scale - 80} cy={activeTruck.bed_width_mm * scale + 10} r="8" fill="#475569" />

                      {/* Packed trailer items */}
                      {packedItems.filter(p => p.is_trailer).map(p => (
                        <g 
                          key={p.id}
                          transform={`translate(${p.x * scale}, ${p.y * scale})`}
                          onMouseDown={(e) => handleMouseDown(e, p.id)}
                          onDoubleClick={() => handleDoubleClick(p.id)}
                          style={{ cursor: draggingPalletId === p.id ? 'grabbing' : 'grab' }}
                        >
                          <rect
                            width={p.length * scale}
                            height={p.width * scale}
                            fill={p.color}
                            stroke="#ffffff"
                            strokeWidth={draggingPalletId === p.id ? "2" : "1"}
                            opacity={p.z > 0 ? 0.9 : 1}
                            rx="3"
                          />
                          {p.z > 0 && (
                            <rect
                              x="4"
                              y="4"
                              width={p.length * scale - 8}
                              height={p.width * scale - 8}
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                              strokeDasharray="2,2"
                            />
                          )}

                          {p.length * scale > 30 && (
                            <text
                              x={p.length * scale / 2}
                              y={p.width * scale / 2 + 4}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                              style={{ userSelect: 'none', pointerEvents: 'none' }}
                            >
                              {p.z > 0 ? `➋ ${p.name.slice(0,4)}` : p.name.slice(0,6)}
                            </text>
                          )}
                          <title>{`${p.name}\nSize: ${p.length}x${p.width}x${p.height}mm\nWeight: ${p.weight}kg`}</title>
                        </g>
                      ))}
                    </svg>
                  </div>
                )}
                
              </div>
            )}
          </div>

          {/* Side View Double-Stack representations */}
          <div className="card" style={{ padding: '25px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: 'var(--secondary-color)', fontSize: '0.95rem' }}>
              📊 {locale === 'ro' ? 'Structură Stive Inălțime (Vedere laterală)' : 'Double Stacking Structure (Side Elevation)'}
            </h4>

            {activeTruck && (
              <div style={{ backgroundColor: '#0f172a', padding: '30px 20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '20px', overflowX: 'auto' }}>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
                    MAIN BED HEIGHT PROFILE (H: {activeTruck.bed_height_mm}mm)
                  </div>
                  <svg 
                    width={activeTruck.bed_length_mm * scale + 20} 
                    height={activeTruck.bed_height_mm * scale + 10} 
                    style={{ border: '1px solid #475569', backgroundColor: '#1e293b' }}
                  >
                    {/* Floor line */}
                    <line x1="0" y1={activeTruck.bed_height_mm * scale} x2={activeTruck.bed_length_mm * scale} y2={activeTruck.bed_height_mm * scale} stroke="#475569" strokeWidth="2" />
                    
                    {/* Render side view boxes */}
                    {packedItems.filter(p => !p.is_trailer).map(p => (
                      <rect
                        key={p.id}
                        x={p.x * scale}
                        // SVG renders Y from top, so we subtract height to draw upwards from bed bottom
                        y={(activeTruck.bed_height_mm - p.z - p.height) * scale}
                        width={p.length * scale}
                        height={p.height * scale}
                        fill={p.color}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        opacity="0.85"
                        rx="2"
                      />
                    ))}
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Unpacked Tray Container */}
          {unpackedItems.length > 0 && (
            <div className="card" style={{ padding: '20px', borderLeft: '4px solid #f1c40f', backgroundColor: '#fffdf5' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#856404', fontSize: '0.95rem' }}>
                ⚠️ {locale === 'ro' ? 'Paleți Neîncăpuți (Depășire spațiu/greutate)' : 'Unpacked Items Tray (Overflow)'}
              </h4>
              <p style={{ margin: '0 0 15px 0', fontSize: '0.8rem', color: '#856404' }}>
                The following items could not fit due to dimension constraints or payload limits.
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {unpackedItems.map(p => (
                  <div 
                    key={p.id} 
                    style={{ 
                      padding: '8px 12px', 
                      backgroundColor: p.color, 
                      color: 'white', 
                      borderRadius: '6px', 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    {p.name} ({p.length}x{p.width}) | {p.weight}kg
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saved Plans List */}
          <div className="card" style={{ padding: '25px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: 'var(--secondary-color)', fontSize: '0.95rem' }}>
              💾 {locale === 'ro' ? 'Planuri de Încărcare Salvate' : 'Saved Loading Sheet History'}
            </h4>

            {loadPlans.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                No load sheets registered. Save configurations to view them here.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f0f0f0', color: 'var(--text-muted)', fontWeight: 600 }}>
                      <th style={{ padding: '12px 15px' }}>Load Sheet Title</th>
                      <th style={{ padding: '12px 15px' }}>Total Loaded</th>
                      <th style={{ padding: '12px 15px' }}>Floor Util (%)</th>
                      <th style={{ padding: '12px 15px' }}>Total Cargo Weight</th>
                      <th style={{ padding: '12px 15px' }}>Created Date</th>
                      <th style={{ padding: '12px 15px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadPlans.map(lp => (
                      <tr key={lp.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px 15px', fontWeight: 'bold', color: 'var(--primary-color)' }}>{lp.title}</td>
                        <td style={{ padding: '12px 15px' }}>{lp.total_pallets} pallets</td>
                        <td style={{ padding: '12px 15px', fontWeight: 600 }}>{lp.utilization_percentage.toFixed(1)}%</td>
                        <td style={{ padding: '12px 15px', fontWeight: 600 }}>{lp.total_weight_kg.toLocaleString('en-US')} kg</td>
                        <td style={{ padding: '12px 15px', color: 'var(--text-muted)' }}>{new Date(lp.created_at).toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-US')}</td>
                        <td style={{ padding: '12px 15px' }}>
                          <button 
                            className="btn-move" 
                            style={{ backgroundColor: '#eff6ff', color: 'var(--primary-color)', border: '1px solid #bfdbfe' }}
                            onClick={() => handleLoadPlan(lp)}
                          >
                            Load Plan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Save Layout Modal Popup */}
      {showSaveModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-header">{locale === 'ro' ? 'Salvează Fișă Încărcare' : 'Save Loading Sheet Plan'}</h3>
            <form onSubmit={handleSavePlan}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Load Plan Title / Description
                </label>
                <input 
                  type="text" 
                  required 
                  className="config-input" 
                  value={saveTitle} 
                  onChange={e => setSaveTitle(e.target.value)}
                  placeholder="e.g. Orders dispatch batch 2026-06"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn-move" style={{ padding: '8px 16px' }} onClick={() => setShowSaveModal(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary">
                  {locale === 'ro' ? 'Salvează' : 'Confirm Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default TruckOptimizerPage;
