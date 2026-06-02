import React, { useState, useEffect } from 'react';
import BoxConfigurator3D from '../components/BoxConfigurator3D';
import { parseJWT } from '../App';
import { useI18n } from '../i18n';

interface PricingResult {
  baseCost: number;
  operationCost: number;
  totalCost: number;
  finalPrice: number;
  unitPrice: number;
}

interface SpecsResult {
  caliper: number;
  grammage: number;
  burstingStrength: number;
  ect: number;
  setupTime: number;
  runSpeed: number;
  wasteQty: number;
  steamUsage: number;
  electricityUsage: number;
  starchGlueUsage: number;
}

const ProductConfigurator: React.FC = () => {
  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const role = user?.role || localStorage.getItem('vnc_role') || 'viewer';
  const { t } = useI18n();

  const [params, setParams] = useState({
    length: 400,
    width: 300,
    height: 200,
    quantity: 1000,
    material: 'Testliner',
    printing: false,
    dieCutting: false,
    gluing: true,
    stapling: false,
    discount: 0,
    fefco_code: '201',
    flute_type: 'B'
  });

  const [result, setResult] = useState<PricingResult | null>(null);
  const [specs, setSpecs] = useState<SpecsResult | null>(null);
  const [loadingSpecs, setLoadingSpecs] = useState(false);
  const [activeTab, setActiveTab] = useState('3d');
  const [foldPercent, setFoldPercent] = useState(1.0);
  const [printColor, setPrintColor] = useState('#1a365d'); // Eco Blue
  const [printText, setPrintText] = useState('VRANCART');
  const [printSymbols, setPrintSymbols] = useState({
    recycling: true,
    fragile: false,
    upArrows: false
  });
  const [printCoverage, setPrintCoverage] = useState('front'); // 'front' | 'front-back' | 'all'

  const calculatePrice = () => {
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/pricing/calculate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(params)
    })
    .then(res => res.json())
    .then(data => setResult(data))
    .catch(err => console.error('Calculation failed', err));
  };

  const calculateSpecs = () => {
    setLoadingSpecs(true);
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/pricing/specs', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        length: params.length,
        width: params.width,
        height: params.height,
        quantity: params.quantity,
        material: params.material,
        fluteType: params.flute_type,
        printing: params.printing,
        dieCutting: params.dieCutting,
        gluing: params.gluing,
        stapling: params.stapling
      })
    })
      .then(res => res.json())
      .then(data => {
        setSpecs(data);
        setLoadingSpecs(false);
      })
      .catch(err => {
        console.error('Specs calculation failed', err);
        setLoadingSpecs(false);
      });
  };

  useEffect(() => {
    calculatePrice();
    calculateSpecs();
  }, [params]);

  return (
    <div className="card">
      <div className="tabs-container">
        <div className={`tab ${activeTab === '3d' ? 'active' : ''}`} onClick={() => setActiveTab('3d')}>
          {t('visualizer_3d')}
        </div>
        <div className={`tab ${activeTab === 'specs' ? 'active' : ''}`} onClick={() => setActiveTab('specs')}>
          {t('technical_specs')}
        </div>
        <div className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          {t('recent_versions')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '30px' }}>
        <div style={{ flex: 1 }}>
          {activeTab === '3d' && (
            <div>
              <div style={{ height: '500px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', background: '#fcfcfc' }}>
                <BoxConfigurator3D 
                  length={params.length / 100} 
                  width={params.width / 100} 
                  height={params.height / 100} 
                  material={params.material}
                  printing={params.printing}
                  dieCutting={params.dieCutting}
                  gluing={params.gluing}
                  stapling={params.stapling}
                  foldPercent={foldPercent}
                  fefcoCode={params.fefco_code}
                  printColor={printColor}
                  printText={printText}
                  hasRecycling={printSymbols.recycling}
                  hasFragile={printSymbols.fragile}
                  hasUpArrows={printSymbols.upArrows}
                  printCoverage={printCoverage}
                />
              </div>

              <div style={{ marginTop: '15px', padding: '15px', background: '#fbf2e3', border: '1px solid #f5e6d3', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#8a6d3b' }}>
                    {t('interactive_3d_fold_controller')}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: '#8a6d3b', color: 'white', padding: '2px 8px', borderRadius: '12px' }}>
                    {t('percent_folded', { count: Math.round(foldPercent * 100) })}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={foldPercent}
                  onChange={e => setFoldPercent(Number(e.target.value))}
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    outline: 'none',
                    accentColor: '#8a6d3b'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#8a6d3b', marginTop: '4px' }}>
                  <span>{t('flat_cardboard_pattern')}</span>
                  <span>{t('fully_folded_box')}</span>
                </div>
                {/* Quick Fold Presets */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setFoldPercent(0)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      backgroundColor: foldPercent === 0 ? '#8a6d3b' : '#fcf8e3',
                      color: foldPercent === 0 ? 'white' : '#8a6d3b',
                      border: '1px solid #8a6d3b',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {t('flat_0')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFoldPercent(0.5)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      backgroundColor: foldPercent === 0.5 ? '#8a6d3b' : '#fcf8e3',
                      color: foldPercent === 0.5 ? 'white' : '#8a6d3b',
                      border: '1px solid #8a6d3b',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {t('half_50')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFoldPercent(1.0)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      backgroundColor: foldPercent === 1.0 ? '#8a6d3b' : '#fcf8e3',
                      color: foldPercent === 1.0 ? 'white' : '#8a6d3b',
                      border: '1px solid #8a6d3b',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {t('closed_100')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'specs' && (
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)', fontWeight: 600 }}>{t('mfg_tech_specs')}</h3>
              
              {loadingSpecs ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '1.1rem', marginBottom: '10px' }}>{t('calculating_prod_params')}</div>
                  <div style={{ width: '30px', height: '30px', border: '3px solid #f3f3f3', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
                  <style>{`
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  `}</style>
                </div>
              ) : specs ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                  {/* Corrugation metrics */}
                  <div style={{ padding: '20px', backgroundColor: 'var(--kraft-bg)', borderRadius: '12px', border: '1px solid var(--kraft-accent-light)' }}>
                    <h4 style={{ margin: '0 0 15px 0', color: '#a07850', borderBottom: '1px solid var(--kraft-accent-light)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {t('corrugation_quality_metrics')}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('caliper')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.caliper.toFixed(1)} mm</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('grammage')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.grammage.toFixed(0)} g/m²</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Edge Crush Test (ECT)</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.ect.toFixed(2)} kN/m</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('bursting_strength')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.burstingStrength.toFixed(0)} kPa</strong>
                      </div>
                    </div>
                  </div>

                  {/* Converting Metrics */}
                  <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ margin: '0 0 15px 0', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {t('converting_assembly_operations')}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('machine_run_speed')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.runSpeed.toLocaleString()} units/hr</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('total_setup_time')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.setupTime.toFixed(0)} minutes</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('estimated_waste_sheets')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.wasteQty} sheets</strong>
                      </div>
                    </div>
                  </div>

                  {/* Utilities & Consumables */}
                  <div style={{ padding: '20px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    <h4 style={{ margin: '0 0 15px 0', color: 'var(--accent-color)', borderBottom: '1px solid #bbf7d0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {t('utilities_consumables')}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('steam_consumption')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.steamUsage.toFixed(1)} kg</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('electricity_consumption')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{specs.electricityUsage.toFixed(1)} kWh</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('starch_glue_dry_weight')}</span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{(specs.starchGlueUsage / 1000.0).toFixed(2)} kg</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>{t('failed_fetch_specs')}</div>
              )}
            </div>
          )}
          {activeTab === 'history' && <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>{t('placeholder_history')}</div>}
        </div>

        <div style={{ width: '380px', padding: '25px', backgroundColor: '#fafafa', borderRadius: '8px' }}>
          <h4 style={{ marginTop: 0, marginBottom: '20px' }}>{t('configuration_parameters')}</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('length_mm')}</label>
              <input type="number" value={params.length} onChange={e => setParams({...params, length: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('width_mm')}</label>
              <input type="number" value={params.width} onChange={e => setParams({...params, width: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
          </div>
          
          <div style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('height_mm')}</label>
            <input type="number" value={params.height} onChange={e => setParams({...params, height: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
          </div>

          <div style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('quantity')}</label>
            <input type="number" value={params.quantity} onChange={e => setParams({...params, quantity: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
          </div>

          <div style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('fefco_box_style')}</label>
            <select value={params.fefco_code} onChange={e => setParams({...params, fefco_code: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
              <option value="201">FEFCO 201 (Standard Slotted Box)</option>
              <option value="200">FEFCO 200 (Half Slotted Open Box)</option>
              <option value="203">FEFCO 203 (Fully Overlapping Flaps)</option>
              <option value="300">FEFCO 300 (Telescopic Lid & Tray)</option>
            </select>
          </div>

          <div style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('material_grade')}</label>
            <select value={params.material} onChange={e => setParams({...params, material: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
              <option value="Testliner">Testliner</option>
              <option value="Schrenz">Schrenz</option>
              <option value="Wellenstoff">Wellenstoff</option>
            </select>
          </div>

          <div style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('flute_type_structure')}</label>
            <select value={params.flute_type} onChange={e => setParams({...params, flute_type: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
              <optgroup label="Single-Face (CO2)">
                <option value="CO2">CO2 (Single-Face default)</option>
              </optgroup>
              <optgroup label="Single-Wall (CO3)">
                <option value="F">F Flute (0.8mm)</option>
                <option value="E">E Flute (1.5mm)</option>
                <option value="B">B Flute (3.0mm)</option>
                <option value="C">C Flute (4.0mm)</option>
                <option value="CO3">CO3 (Single-Wall default)</option>
              </optgroup>
              <optgroup label="Double-Wall (CO5 / CO4)">
                <option value="BC">BC Flute (7.6mm)</option>
                <option value="EB">EB Flute (5.1mm)</option>
                <option value="EE">EE Flute (3.6mm)</option>
                <option value="CO4">CO4 (Double-Wall default)</option>
                <option value="CO5">CO5 (Double-Wall default)</option>
              </optgroup>
            </select>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={params.printing} onChange={e => setParams({...params, printing: e.target.checked})} /> {t('printing')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={params.dieCutting} onChange={e => setParams({...params, dieCutting: e.target.checked})} /> {t('die_cut')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={params.gluing} onChange={e => setParams({...params, gluing: e.target.checked})} /> {t('gluing')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={params.stapling} onChange={e => setParams({...params, stapling: e.target.checked})} /> {t('stapling')}
            </label>
          </div>

          {params.printing && (
            <div style={{
              marginTop: '15px',
              padding: '15px',
              backgroundColor: '#f5f5f5',
              borderRadius: '6px',
              borderLeft: '4px solid #1a365d'
            }}>
              <h5 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#1a365d' }}>{t('print_artwork_customization')}</h5>
              
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px' }}>{t('ink_color')}</label>
                <select value={printColor} onChange={e => setPrintColor(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem' }}>
                  <option value="#1a365d">🔵 Eco Blue (Standard)</option>
                  <option value="#1a1a1a">⚫ Carbon Black (Matte)</option>
                  <option value="#a82020">🔴 Signal Red (Warning)</option>
                  <option value="#1c6b30">🟢 Forest Green (Eco)</option>
                </select>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px' }}>{t('custom_print_text')}</label>
                <input
                  type="text"
                  value={printText}
                  maxLength={24}
                  onChange={e => setPrintText(e.target.value.toUpperCase())}
                  placeholder="E.G. VRANCART"
                  style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px' }}>{t('print_placement_coverage')}</label>
                <select value={printCoverage} onChange={e => setPrintCoverage(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem' }}>
                  <option value="front">{t('front_panel_only')}</option>
                  <option value="front-back">{t('front_back_panels')}</option>
                  <option value="all">{t('full_exterior_cover')}</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '6px' }}>{t('handling_shipping_marks')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={printSymbols.recycling} onChange={e => setPrintSymbols({...printSymbols, recycling: e.target.checked})} />
                    {t('recyclable_material')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={printSymbols.fragile} onChange={e => setPrintSymbols({...printSymbols, fragile: e.target.checked})} />
                    {t('fragile_cargo')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={printSymbols.upArrows} onChange={e => setPrintSymbols({...printSymbols, upArrows: e.target.checked})} />
                    {t('keep_up')}
                  </label>
                </div>
              </div>
            </div>
          )}

          {role !== 'production' && (
            <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('applied_discount')}</label>
              <input type="number" value={params.discount} onChange={e => setParams({...params, discount: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
          )}

          {result && role !== 'production' && (
            <div style={{ marginTop: '25px', padding: '20px', background: '#e3f2fd', borderRadius: '12px', border: '1px solid #bbdefb', boxShadow: '0 4px 12px rgba(30,136,229,0.08)' }}>
              {/* Cost structures: visible only to admin */}
              {role === 'admin' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <span>{t('raw_material_price')}:</span>
                    <strong>€{result.baseCost.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <span>{t('operations_price')}:</span>
                    <strong>€{result.operationCost.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)', borderBottom: '1px dashed #bbdefb', paddingBottom: '8px' }}>
                    <span>{t('est_production_cost')}:</span>
                    <strong>€{(result.totalCost * 0.7).toFixed(2)}</strong>
                  </div>
                </>
              )}
              
              {/* Final Price: visible to admin, sales, and external/viewer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-color)' }}>{t('total_price')}:</span>
                <strong style={{ fontSize: '1.4rem', color: 'var(--primary-color)' }}>€{result.finalPrice.toFixed(2)}</strong>
              </div>

              {/* Margins: visible to admin and sales */}
              {(role === 'admin' || role === 'sales') && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #90caf9' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--secondary-color)', fontWeight: 500 }}>
                    {role === 'admin' ? t('estimated_profit_margin') : t('sales_margin')}
                  </span>
                  <strong style={{ fontSize: '1rem', color: 'var(--accent-color)' }}>
                    {role === 'admin' 
                      ? `€${(result.finalPrice - result.totalCost * 0.7).toFixed(2)} (${((result.finalPrice - result.totalCost * 0.7) / result.finalPrice * 100).toFixed(1)}%)`
                      : `${((result.finalPrice - result.totalCost * 0.7) / result.finalPrice * 100).toFixed(1)}%`
                    }
                  </strong>
                </div>
              )}
              
              <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#546e7a', marginTop: '10px', fontStyle: 'italic' }}>
                {t('unit_price')}: €{result.unitPrice.toFixed(4)}
              </div>
            </div>
          )}
          
          {role !== 'production' && (
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }}>{t('create_quote')}</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductConfigurator;
