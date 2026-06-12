import React, { useState, useEffect } from 'react';
import BoxConfigurator3D from '../components/BoxConfigurator3D';
import { parseJWT } from '../App';
import { useI18n } from '../i18n';
import { planPallets, planToHandoffItems, pushHandoff, DEFAULT_PALLET, PalletConstraints } from '../boxLogistics';

interface PriceTier {
  quantity: number;
  baseCost: number;
  setupCost: number;
  runCost: number;
  toolingCost: number;
  totalCost: number;
  finalPrice: number;
  unitPrice: number;
}

interface PricingResult {
  baseCost: number;
  operationCost: number;
  totalCost: number;
  finalPrice: number;
  unitPrice: number;
  setupCost: number;
  runCost: number;
  tiers: PriceTier[];
}

// FEFCO styles made of multiple pieces (telescopic lid, sleeve, bliss end
// panels), where the secondary piece can be ordered in a different board grade.
const TWO_PIECE_STYLES = ['300', '301', '302', '501', '601'];

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
  const { t, locale } = useI18n();

  const RON_TO_EUR = 4.97;
  const formatPrice = (ronAmount: number, isLarge = false) => {
    const eurAmount = ronAmount / RON_TO_EUR;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: isLarge ? '1.4rem' : '0.95rem', fontWeight: 'bold' }}>
          {ronAmount.toFixed(2)} RON
        </span>
        <span style={{ fontSize: isLarge ? '0.9rem' : '0.75rem', color: '#666', fontWeight: 'normal' }}>
          (€{eurAmount.toFixed(2)})
        </span>
      </span>
    );
  };
  const formatUnitPrice = (ronAmount: number) => {
    const eurAmount = ronAmount / RON_TO_EUR;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px' }}>
        <span style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>
          {ronAmount.toFixed(4)} RON
        </span>
        <span style={{ fontSize: '0.75rem', color: '#666', fontWeight: 'normal' }}>
          (€{eurAmount.toFixed(4)})
        </span>
      </span>
    );
  };

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
    lid_material: '', // '' = same board as the body; only used by two-piece styles
    flute_type: 'B',
    tooling_printing_plates_cost: 0,
    tooling_die_cut_molds_cost: 0,
    tooling_amortization_volume: 10000,
    amortize_tooling: false
  });

  // Effective lid board grade: only two-piece styles have a separate lid;
  // empty selection means "same as body" and is resolved here so pricing is
  // consistent regardless of how the user expressed it.
  const effectiveLidMaterial = TWO_PIECE_STYLES.includes(params.fefco_code)
    ? (params.lid_material || params.material)
    : '';

  const [result, setResult] = useState<PricingResult | null>(null);

  // Hand-off to the Truck Load Optimizer
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipMode, setShipMode] = useState<'flat' | 'erected'>('flat');
  const [shipMaxStack, setShipMaxStack] = useState(1800);
  const [shipDest, setShipDest] = useState('');
  const [shipSeq, setShipSeq] = useState(1);
  const [shipPallets, setShipPallets] = useState<any[]>([]);
  const [shipPalletId, setShipPalletId] = useState<string>('');

  const [margins, setMargins] = useState<any[]>([]);
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
  const [logoUrl, setLogoUrl] = useState('');
  const [viewMode, setViewMode] = useState<'box' | 'flat-box'>('box');

  // Customer selection & granular pricing tiers states
  const [baseQuantity, setBaseQuantity] = useState<number>(1000);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [checkedTiers, setCheckedTiers] = useState<number[]>([]);
  const [hoveredTierIdx, setHoveredTierIdx] = useState<number | null>(null);
  const [quoteSuccessMsg, setQuoteSuccessMsg] = useState<string | null>(null);

  // Target sales margin (%) that derives the quoted price from cost (margin
  // pyramid). Replaces the old straight discount: the salesperson picks a
  // margin within their role-allowed band.
  const [targetMargin, setTargetMargin] = useState<number>(20);

  // Saved configurations (History tab, persisted in the backend).
  const [savedConfigs, setSavedConfigs] = useState<any[]>([]);
  const [configName, setConfigName] = useState('');

  const handleExportPDF = () => {
    const canvas = document.querySelector('canvas');
    let snapshotUrl = '';
    if (canvas) {
      try {
        snapshotUrl = canvas.toDataURL('image/png');
      } catch (err) {
        console.error('Failed to capture 3D box snapshot', err);
      }
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(locale === 'ro' ? 'Vă rugăm să permiteți pop-up-urile pentru a exporta PDF-ul.' : 'Please allow pop-ups to export the PDF.');
      return;
    }

    const titleText = locale === 'ro' ? 'Fișă Tehnică Produs - Vrancart Packaging' : 'Product Technical Spec Sheet - Vrancart Packaging';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>${titleText}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #2d3748;
              margin: 0;
              padding: 40px;
              line-height: 1.5;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #1a365d;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #1a365d;
              letter-spacing: 1px;
            }
            .doc-type {
              text-align: right;
            }
            .doc-type h1 {
              margin: 0;
              font-size: 20px;
              color: #1a365d;
              text-transform: uppercase;
            }
            .doc-type p {
              margin: 4px 0 0 0;
              font-size: 12px;
              color: #718096;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 30px;
              margin-bottom: 30px;
            }
            .visual-card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 10px;
              background-color: #f7fafc;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 320px;
            }
            .visual-card img {
              max-width: 100%;
              max-height: 100%;
              object-fit: contain;
            }
            .specs-card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 20px;
              background-color: #fff;
            }
            .specs-card h2 {
              margin-top: 0;
              margin-bottom: 15px;
              font-size: 16px;
              color: #2b6cb0;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 6px;
            }
            .spec-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
              font-size: 13px;
            }
            .spec-label {
              color: #718096;
            }
            .spec-val {
              font-weight: bold;
            }
            .table-container {
              margin-bottom: 30px;
            }
            .table-container h2 {
              font-size: 16px;
              color: #2b6cb0;
              margin-bottom: 10px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 6px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            th, td {
              border: 1px solid #e2e8f0;
              padding: 8px 12px;
              text-align: left;
            }
            th {
              background-color: #ebf8ff;
              color: #2b6cb0;
              font-weight: bold;
            }
            .footer {
              margin-top: 60px;
              border-top: 1px solid #e2e8f0;
              padding-top: 20px;
              font-size: 11px;
              color: #a0aec0;
              text-align: center;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">
              <span>VRANCART</span>
              <div style="font-size: 10px; color: #a07850; font-weight: normal;">PACKAGING SOLUTIONS</div>
            </div>
            <div class="doc-type">
              <h1>${locale === 'ro' ? 'Fișă Tehnică Produs' : 'Product Technical Spec Sheet'}</h1>
              <p>${locale === 'ro' ? 'Generat la' : 'Generated on'}: ${new Date().toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-US')} ${new Date().toLocaleTimeString(locale === 'ro' ? 'ro-RO' : 'en-US')}</p>
            </div>
          </div>

          <div class="grid">
            <div class="visual-card">
              ${snapshotUrl ? `<img src="${snapshotUrl}" alt="3D Model Visual" />` : `<div style="color: #a0aec0; font-size: 14px;">${locale === 'ro' ? 'Previzualizare 3D indisponibilă' : '3D Preview unavailable'}</div>`}
            </div>
            
            <div class="specs-card">
              <h2>${locale === 'ro' ? 'Parametri Configurație' : 'Configuration Parameters'}</h2>
              <div class="spec-row">
                <span class="spec-label">${locale === 'ro' ? 'Cod FEFCO' : 'FEFCO Style'}:</span>
                <span class="spec-val">FEFCO ${params.fefco_code}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">${locale === 'ro' ? 'Dimensiuni (LxLxÎ)' : 'Dimensions (LxWxH)'}:</span>
                <span class="spec-val">${params.length} x ${params.width} x ${params.height} mm</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">${locale === 'ro' ? 'Compoziție Material' : 'Material Grade'}:</span>
                <span class="spec-val">${params.material}</span>
              </div>
              ${effectiveLidMaterial && effectiveLidMaterial !== params.material ? `
              <div class="spec-row">
                <span class="spec-label">${locale === 'ro' ? 'Material Capac / Manșon' : 'Lid / Sleeve Material'}:</span>
                <span class="spec-val">${effectiveLidMaterial}</span>
              </div>` : ''}
              <div class="spec-row">
                <span class="spec-label">${locale === 'ro' ? 'Tip Ondulă / Structură' : 'Flute Type / Structure'}:</span>
                <span class="spec-val">${params.flute_type} ${locale === 'ro' ? 'Ondulă' : 'Flute'}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">${locale === 'ro' ? 'Cantitate' : 'Quantity'}:</span>
                <span class="spec-val">${params.quantity.toLocaleString()} ${locale === 'ro' ? 'bucăți' : 'units'}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">${locale === 'ro' ? 'Imprimare' : 'Printing'}:</span>
                <span class="spec-val">${params.printing ? `${locale === 'ro' ? 'Da' : 'Yes'} (${printCoverage}, ${printText})` : (locale === 'ro' ? 'Nu' : 'No')}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">${locale === 'ro' ? 'Finisaje' : 'Finishing'}:</span>
                <span class="spec-val">
                  ${[
                    params.dieCutting && (locale === 'ro' ? 'Ștanțare' : 'Die Cut'),
                    params.gluing && (locale === 'ro' ? 'Lipire' : 'Gluing'),
                    params.stapling && (locale === 'ro' ? 'Capsare' : 'Stapling')
                  ].filter(Boolean).join(', ') || (locale === 'ro' ? 'Fără finisaje' : 'None')}
                </span>
              </div>
              
              ${result && role !== 'production' ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                  <div class="spec-row">
                    <span class="spec-label" style="font-weight: bold; color: #1a365d;">${locale === 'ro' ? 'Preț Unitar' : 'Unit Price'}:</span>
                    <span class="spec-val" style="font-weight: bold; color: #1a365d; font-size: 14px;">
                      ${result.unitPrice.toFixed(4)} RON <span style="font-size: 11px; color: #666; font-weight: normal;">(€${(result.unitPrice / 4.97).toFixed(4)})</span>
                    </span>
                  </div>
                  <div class="spec-row">
                    <span class="spec-label" style="font-weight: bold; color: #1a365d;">${locale === 'ro' ? 'Valoare Totală' : 'Total Price'}:</span>
                    <span class="spec-val" style="font-weight: bold; color: #1a365d; font-size: 14px;">
                      ${result.finalPrice.toFixed(2)} RON <span style="font-size: 11px; color: #666; font-weight: normal;">(€${(result.finalPrice / 4.97).toFixed(2)})</span>
                    </span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          ${specs ? `
            <div class="table-container">
              <h2>${locale === 'ro' ? 'Specificații Tehnice Fabricație' : 'Manufacturing Technical Specifications'}</h2>
              <table>
                <thead>
                  <tr>
                    <th>${locale === 'ro' ? 'Parametru Tehnic' : 'Technical Parameter'}</th>
                    <th>${locale === 'ro' ? 'Valoare Calculată' : 'Calculated Value'}</th>
                    <th>${locale === 'ro' ? 'Parametru Operativ' : 'Operation Parameter'}</th>
                    <th>${locale === 'ro' ? 'Valoare Calculată' : 'Calculated Value'}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>${locale === 'ro' ? 'Grosime (Caliper)' : 'Caliper'}</strong></td>
                    <td>${specs.caliper.toFixed(1)} mm</td>
                    <td><strong>${locale === 'ro' ? 'Viteză Mașină' : 'Machine Run Speed'}</strong></td>
                    <td>${specs.runSpeed.toLocaleString()} units/hr</td>
                  </tr>
                  <tr>
                    <td><strong>${locale === 'ro' ? 'Gramaj' : 'Grammage'}</strong></td>
                    <td>${specs.grammage.toFixed(0)} g/m²</td>
                    <td><strong>${locale === 'ro' ? 'Timp Pregătire' : 'Total Setup Time'}</strong></td>
                    <td>${specs.setupTime.toFixed(0)} minutes</td>
                  </tr>
                  <tr>
                    <td><strong>Edge Crush Test (ECT)</strong></td>
                    <td>${specs.ect.toFixed(2)} kN/m</td>
                    <td><strong>${locale === 'ro' ? 'Deșeuri Pregătire' : 'Estimated Waste Sheets'}</strong></td>
                    <td>${specs.wasteQty} sheets</td>
                  </tr>
                  <tr>
                    <td><strong>${locale === 'ro' ? 'Rezistență Plesnire' : 'Bursting Strength'}</strong></td>
                    <td>${specs.burstingStrength.toFixed(0)} kPa</td>
                    <td><strong>${locale === 'ro' ? 'Consum Amidon' : 'Starch Glue Consumption'}</strong></td>
                    <td>${(specs.starchGlueUsage / 1000.0).toFixed(2)} kg</td>
                  </tr>
                  <tr>
                    <td><strong>${locale === 'ro' ? 'Consum Energie Electr.' : 'Electricity Consumption'}</strong></td>
                    <td>${specs.electricityUsage.toFixed(1)} kWh</td>
                    <td><strong>${locale === 'ro' ? 'Consum Abur' : 'Steam Consumption'}</strong></td>
                    <td>${specs.steamUsage.toFixed(1)} kg</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ` : ''}

          <div class="footer">
            <p>Vrancart S.A. | Adresă: B-dul Ecaterina Teodoroiu nr. 17, Adjud, Vrancea, România</p>
            <p>© 2026 Vrancart Packaging. All rights reserved. Document generated for internal B2B pricing and packaging specifications.</p>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const calculatePrice = () => {
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ...params, lid_material: effectiveLidMaterial, target_margin: targetMargin })
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
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/auth/margins', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => res.json())
    .then(data => setMargins(data || []))
    .catch(err => console.error('Failed to fetch margins config', err));

    fetch('/vnc-crm/api/customers', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => res.json())
    .then(data => setCustomers(data || []))
    .catch(err => console.error('Failed to fetch customers', err));

    fetchSavedConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSavedConfigs = () => {
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/box-configs', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => (res.ok ? res.json() : []))
      .then(data => setSavedConfigs(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to fetch saved configs', err));
  };

  const handleSaveConfig = async () => {
    const token = localStorage.getItem('vnc_token');
    const name = configName.trim() ||
      `FEFCO ${params.fefco_code} ${params.length}x${params.width}x${params.height} ${params.material}`;
    const config = JSON.stringify({
      params, printColor, printText, printSymbols, printCoverage, logoUrl, viewMode, foldPercent, targetMargin
    });
    try {
      const res = await fetch('/vnc-crm/api/box-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name, config })
      });
      if (!res.ok) throw new Error('save failed');
      setConfigName('');
      fetchSavedConfigs();
    } catch (err) {
      console.error('Failed to save configuration', err);
      alert(locale === 'ro' ? 'Eroare la salvarea configurației.' : 'Failed to save configuration.');
    }
  };

  const handleLoadConfig = (cfg: any) => {
    try {
      const b = JSON.parse(cfg.config);
      if (b.params) {
        setParams(b.params);
        setBaseQuantity(b.params.quantity || 1000);
      }
      if (b.printColor !== undefined) setPrintColor(b.printColor);
      if (b.printText !== undefined) setPrintText(b.printText);
      if (b.printSymbols) setPrintSymbols(b.printSymbols);
      if (b.printCoverage) setPrintCoverage(b.printCoverage);
      if (b.logoUrl !== undefined) setLogoUrl(b.logoUrl);
      if (b.viewMode) setViewMode(b.viewMode);
      if (typeof b.foldPercent === 'number') setFoldPercent(b.foldPercent);
      if (typeof b.targetMargin === 'number') setTargetMargin(b.targetMargin);
      setActiveTab('3d');
    } catch (err) {
      console.error('Failed to load configuration', err);
    }
  };

  const handleDeleteConfig = async (id: number) => {
    const token = localStorage.getItem('vnc_token');
    try {
      const res = await fetch(`/vnc-crm/api/box-configs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('delete failed');
      fetchSavedConfigs();
    } catch (err) {
      console.error('Failed to delete configuration', err);
    }
  };

  // Update base quantity in checked tiers when base quantity changes
  useEffect(() => {
    setCheckedTiers([baseQuantity]);
  }, [baseQuantity]);

  // Keep checking the baseQuantity when a new calculation result returns
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (result?.tiers && checkedTiers.length === 0) {
      if (result.tiers.some(t => t.quantity === baseQuantity)) {
        setCheckedTiers([baseQuantity]);
      }
    }
  }, [result]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    calculatePrice();
    calculateSpecs();
  }, [params, targetMargin]);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setParams(prev => ({
      ...prev,
      customer_id: customerId
    }));
  };

  const handleToggleTier = (qty: number) => {
    setCheckedTiers(prev => {
      if (prev.includes(qty)) {
        return prev.filter(q => q !== qty);
      } else {
        return [...prev, qty];
      }
    });
  };

  const allTiersQuantities = result?.tiers?.map(t => t.quantity) || [];
  const isAllChecked = allTiersQuantities.length > 0 && allTiersQuantities.every(q => checkedTiers.includes(q));

  const handleToggleAllTiers = () => {
    if (isAllChecked) {
      setCheckedTiers([]);
    } else {
      setCheckedTiers(allTiersQuantities);
    }
  };

  const handleCreateQuoteFromTiers = async () => {
    if (!selectedCustomerId) {
      alert(locale === 'ro' ? 'Vă rugăm să selectați un client mai întâi.' : 'Please select a customer first.');
      return;
    }
    if (checkedTiers.length === 0) {
      alert(locale === 'ro' ? 'Selectați cel puțin un volum pentru ofertă.' : 'Please select at least one quantity break.');
      return;
    }

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    const salespersonCode = selectedCustomer?.salesperson_code || 'AM';
    const token = localStorage.getItem('vnc_token');

    // Materialize a real catalog product for this custom box so the quote lines
    // reference a concrete product_id instead of an empty string.
    let customProductId = '';
    try {
      const pres = await fetch('/vnc-crm/api/pricing/custom-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          fefco_code: params.fefco_code,
          length: params.length,
          width: params.width,
          height: params.height,
          material: params.material,
          flute_type: params.flute_type,
          lid_material: effectiveLidMaterial
        })
      });
      if (pres.ok) {
        const pj = await pres.json();
        customProductId = pj.id || '';
      } else {
        console.error('Custom product creation returned', pres.status);
      }
    } catch (err) {
      console.error('Custom product creation failed', err);
    }

    const items = checkedTiers.map(qty => {
      const tier = result?.tiers.find(t => t.quantity === qty);
      const price = tier ? tier.unitPrice : (result?.unitPrice || 0);

      return {
        product_id: customProductId,
        description: `Custom Box FEFCO ${params.fefco_code} (${params.length}x${params.width}x${params.height} mm) ${params.material}${effectiveLidMaterial && effectiveLidMaterial !== params.material ? ` / ${locale === 'ro' ? 'capac' : 'lid'} ${effectiveLidMaterial}` : ''}`,
        quantity: qty,
        unit_price: price,
        config_params: JSON.stringify({
          length: params.length,
          width: params.width,
          height: params.height,
          material: params.material,
          lid_material: effectiveLidMaterial,
          fefco_code: params.fefco_code,
          flute_type: params.flute_type,
          printing: params.printing,
          dieCutting: params.dieCutting,
          gluing: params.gluing,
          stapling: params.stapling,
          tooling_printing_plates_cost: params.tooling_printing_plates_cost,
          tooling_die_cut_molds_cost: params.tooling_die_cut_molds_cost,
          tooling_amortization_volume: params.tooling_amortization_volume,
          amortize_tooling: params.amortize_tooling
        })
      };
    });

    const payload = {
      customer_id: selectedCustomerId,
      salesperson_code: salespersonCode,
      status: 'draft',
      items: items
    };

    try {
      const res = await fetch('/vnc-crm/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to create quote');
      }
      setQuoteSuccessMsg(locale === 'ro'
        ? 'Ofertă salvată ca schiță în CRM cu volumele selectate!'
        : 'Draft quote successfully created in CRM with selected quantity tiers!');
      setCheckedTiers([baseQuantity]);
      setTimeout(() => setQuoteSuccessMsg(null), 8500);
    } catch (err) {
      console.error('Failed to create quote', err);
      alert(locale === 'ro' ? 'Eroare la crearea ofertei.' : 'Failed to create quote.');
    }
  };

  const canSeeMargins = role === 'admin' || role === 'management' || role === 'sales_manager' || role === 'rsm' || role === 'asm' || role === 'sales' || role === 'ai';
  const activeMarginConfig = margins.find(m => m.role === role) || { min_margin: 10.0, max_margin: 20.0 };
  const minM = activeMarginConfig.min_margin;
  const maxM = activeMarginConfig.max_margin;
  const currentMargin = result && result.finalPrice > 0 ? ((result.finalPrice - result.totalCost) / result.finalPrice * 100) : 0;
  const isViolation = !!(result && canSeeMargins && (currentMargin < minM || currentMargin > maxM));

  // Slider bounds: clamp the upper margin below 100% so price = cost/(1-m) stays finite.
  const marginSliderMin = minM;
  const marginSliderMax = Math.min(maxM, 90);

  // Initialize the target margin within the role's band once margins load.
  // Sales roles default to their max (list price) and can slide down toward
  // their floor to discount; roles without margin visibility get a fixed 20%.
  useEffect(() => {
    if (canSeeMargins) {
      setTargetMargin(Math.max(marginSliderMin, Math.min(marginSliderMax, 20)));
    } else {
      setTargetMargin(20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margins, role]);

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
                  lidMaterial={effectiveLidMaterial || undefined}
                  printColor={printColor}
                  printText={printText}
                  hasRecycling={printSymbols.recycling}
                  hasFragile={printSymbols.fragile}
                  hasUpArrows={printSymbols.upArrows}
                  printCoverage={printCoverage}
                  viewMode={viewMode}
                  logoUrl={logoUrl}
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

                {/* View Mode Selector */}
                <div style={{ marginTop: '15px', borderTop: '1px solid #f5e6d3', paddingTop: '12px' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#8a6d3b', marginBottom: '8px' }}>
                    {t('view_mode')}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setViewMode('box')}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        backgroundColor: viewMode === 'box' ? '#8a6d3b' : '#fcf8e3',
                        color: viewMode === 'box' ? 'white' : '#8a6d3b',
                        border: '1px solid #8a6d3b',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      📦 {t('visualizer_3d')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('flat-box')}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        backgroundColor: viewMode === 'flat-box' ? '#8a6d3b' : '#fcf8e3',
                        color: viewMode === 'flat-box' ? 'white' : '#8a6d3b',
                        border: '1px solid #8a6d3b',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      {locale === 'ro' ? '🗺️ Desfășurat & 3D' : '🗺️ Flat & 3D'}
                    </button>
                  </div>
                </div>

                {/* Export Actions */}
                <div style={{ marginTop: '15px', borderTop: '1px solid #f5e6d3', paddingTop: '12px' }}>
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    style={{
                      width: '100%',
                      padding: '10px 15px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      backgroundColor: '#1a365d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 4px rgba(26,54,93,0.15)'
                    }}
                  >
                    📄 {locale === 'ro' ? 'Exportă Fișă Specificații PDF' : 'Export PDF Spec Sheet'}
                  </button>
                </div>
              </div>

              {/* Volume Tiered Pricing Breaks */}
              {result && result.tiers && result.tiers.length > 0 && role !== 'production' && (
                <>
                  <div style={{
                    marginTop: '25px',
                    padding: '20px',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'
                  }}>
                    <h4 style={{ margin: '0 0 15px 0', color: '#1a365d', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #edf2f7', paddingBottom: '10px', fontWeight: 600 }}>
                      📊 {t('tiered_pricing_breaks')}
                    </h4>
                    
                    {quoteSuccessMsg && (
                      <div style={{
                        backgroundColor: '#def7ec',
                        color: '#03543f',
                        padding: '12px 15px',
                        borderRadius: '8px',
                        border: '1px solid #bcf0da',
                        marginBottom: '15px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>{quoteSuccessMsg}</span>
                        <button type="button" onClick={() => setQuoteSuccessMsg(null)} style={{ background: 'none', border: 'none', color: '#03543f', fontWeight: 'bold', cursor: 'pointer' }}>&times;</button>
                      </div>
                    )}

                    <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '15px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#ffffff', zIndex: 1, boxShadow: '0 1px 0 #edf2f7' }}>
                          <tr style={{ borderBottom: '2px solid #edf2f7' }}>
                            <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600, textAlign: 'center', width: '40px' }}>
                              <input
                                type="checkbox"
                                checked={isAllChecked}
                                onChange={handleToggleAllTiers}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                              />
                            </th>
                            <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600 }}>{t('quantity_tier')}</th>
                            <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600 }}>{t('unit_price_tier')}</th>
                            <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600 }}>{t('total_price_tier')}</th>
                            {role === 'admin' && <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600 }}>{t('allocated_tooling')}</th>}
                            <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600 }}>{t('savings_vs_requested')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.tiers.map((tier, idx) => {
                            const isCurrent = tier.quantity === params.quantity;
                            const isBase = tier.quantity === baseQuantity;
                            const requestedTier = result.tiers.find(t => t.quantity === baseQuantity) || result;
                            const savingsPercent = requestedTier.unitPrice > tier.unitPrice 
                              ? ((requestedTier.unitPrice - tier.unitPrice) / requestedTier.unitPrice) * 100 
                              : 0;

                            return (
                              <tr
                                key={idx}
                                onClick={() => setParams({ ...params, quantity: tier.quantity })}
                                style={{
                                  borderBottom: '1px solid #f7fafc',
                                  borderLeft: isBase ? '4px solid #d97706' : 'none',
                                  backgroundColor: isCurrent ? '#ebf8ff' : (isBase ? '#fffbeb' : 'transparent'),
                                  fontWeight: isCurrent ? 'bold' : 'normal',
                                  cursor: 'pointer',
                                  transition: 'background-color 0.2s',
                                }}
                                onMouseEnter={e => !isCurrent && !isBase && (e.currentTarget.style.backgroundColor = '#f7fafc')}
                                onMouseLeave={e => !isCurrent && !isBase && (e.currentTarget.style.backgroundColor = 'transparent')}
                              >
                                <td onClick={(e) => e.stopPropagation()} style={{ padding: '12px', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={checkedTiers.includes(tier.quantity)}
                                    onChange={() => handleToggleTier(tier.quantity)}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                </td>
                                <td style={{ padding: '12px', color: isCurrent ? '#2b6cb0' : '#2d3748' }}>
                                  {tier.quantity.toLocaleString()} 
                                  {isBase && (
                                    <span style={{ 
                                      marginLeft: '8px', 
                                      fontSize: '0.7rem', 
                                      padding: '2px 6px', 
                                      borderRadius: '4px', 
                                      backgroundColor: '#d97706', 
                                      color: '#ffffff', 
                                      fontWeight: 'bold' 
                                    }}>
                                      {locale === 'ro' ? 'Solicitat' : 'Requested'}
                                    </span>
                                  )}
                                  {isCurrent && !isBase && ' ⭐'}
                                </td>
                                <td style={{ padding: '12px', color: '#2d3748' }}>
                                  {formatUnitPrice(tier.unitPrice)}
                                </td>
                                <td style={{ padding: '12px', color: '#2d3748' }}>
                                  {formatPrice(tier.finalPrice)}
                                </td>
                                {role === 'admin' && (
                                  <td style={{ padding: '12px', color: '#718096' }}>
                                    {formatPrice(tier.toolingCost)}
                                  </td>
                                )}
                                <td style={{ padding: '12px', color: savingsPercent > 0 ? '#48bb78' : '#718096' }}>
                                  {savingsPercent > 0 ? `-${savingsPercent.toFixed(1)}%` : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginTop: '15px', borderTop: '1px solid #edf2f7', paddingTop: '15px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ fontSize: '0.8rem', color: '#4a5568', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                          👤 {locale === 'ro' ? 'Selectează Clientul' : 'Select Customer'}
                        </label>
                        <select
                          value={selectedCustomerId}
                          onChange={e => handleCustomerChange(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '0.85rem' }}
                        >
                          <option value="">-- {locale === 'ro' ? 'Alege Client' : 'Choose Customer'} --</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={handleCreateQuoteFromTiers}
                          disabled={checkedTiers.length === 0 || !selectedCustomerId}
                          style={{
                            padding: '10px 20px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            backgroundColor: checkedTiers.length === 0 || !selectedCustomerId ? '#cbd5e0' : 'var(--kraft-accent)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: checkedTiers.length === 0 || !selectedCustomerId ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            marginTop: '18px'
                          }}
                        >
                          💼 {locale === 'ro' ? `Creează Ofertă (${checkedTiers.length} volume)` : `Create Quote (${checkedTiers.length} tiers)`}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Pricing Curve Chart Card */}
                  {(() => {
                    const N = result.tiers.length;
                    const padding = { top: 20, right: 30, bottom: 40, left: 60 };
                    const chartWidth = 800 - padding.left - padding.right;
                    const chartHeight = 240 - padding.top - padding.bottom;

                    const prices = result.tiers.map(t => t.unitPrice);
                    const maxPrice = Math.max(...prices);
                    const minPrice = Math.min(...prices);
                    const priceRange = maxPrice - minPrice || 1.0;

                    const yMin = Math.max(0, minPrice - priceRange * 0.15);
                    const yMax = maxPrice + priceRange * 0.15;

                    const points = result.tiers.map((t, idx) => {
                      const x = padding.left + (idx / (N - 1)) * chartWidth;
                      const y = padding.top + (1 - (t.unitPrice - yMin) / (yMax - yMin)) * chartHeight;
                      return { x, y, tier: t, index: idx };
                    });

                    const areaD = N > 0 ? [
                      `M ${points[0].x} ${padding.top + chartHeight}`,
                      ...points.map(p => `L ${p.x} ${p.y}`),
                      `L ${points[N - 1].x} ${padding.top + chartHeight}`,
                      'Z'
                    ].join(' ') : '';

                    const lineD = N > 0 ? points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') : '';

                    const yTicks = [0, 0.33, 0.66, 1.0].map(pct => {
                      const val = yMin + pct * (yMax - yMin);
                      const y = padding.top + (1 - pct) * chartHeight;
                      return { val, y };
                    });

                    const labelStep = Math.max(1, Math.floor(N / 7));
                    const labelIndices = [];
                    for (let i = 0; i < N; i += labelStep) {
                      labelIndices.push(i);
                    }
                    if (labelIndices[labelIndices.length - 1] !== N - 1) {
                      labelIndices.push(N - 1);
                    }

                    const hoveredPoint = hoveredTierIdx !== null ? points[hoveredTierIdx] : null;

                    return (
                      <div style={{
                        position: 'relative',
                        marginTop: '25px',
                        padding: '20px',
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                      }}>
                        <h4 style={{ margin: '0 0 15px 0', color: '#1a365d', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #edf2f7', paddingBottom: '10px', fontWeight: 600 }}>
                          📈 {locale === 'ro' ? 'Curba de Preț și Analiză Upsell' : 'Price Curve & Upsell Analysis'}
                        </h4>
                        
                        <div style={{ position: 'relative' }}>
                          <svg viewBox="0 0 800 240" width="100%" height="240" style={{ overflow: 'visible' }}>
                            <defs>
                              <linearGradient id="priceCurveGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Y-axis gridlines */}
                            {yTicks.map((tick, idx) => (
                              <g key={idx}>
                                <line
                                  x1={padding.left}
                                  y1={tick.y}
                                  x2={800 - padding.right}
                                  y2={tick.y}
                                  stroke="#e2e8f0"
                                  strokeDasharray="4 4"
                                />
                                <text
                                  x={padding.left - 10}
                                  y={tick.y + 4}
                                  textAnchor="end"
                                  style={{ fontSize: '10px', fill: '#718096', fontFamily: 'Inter, sans-serif' }}
                                >
                                  {tick.val.toFixed(2)} RON
                                </text>
                              </g>
                            ))}

                            {/* X-axis labels and gridlines */}
                            {labelIndices.map(idx => {
                              const p = points[idx];
                              if (!p) return null;
                              return (
                                <g key={idx}>
                                  <line
                                    x1={p.x}
                                    y1={padding.top}
                                    x2={p.x}
                                    y2={padding.top + chartHeight}
                                    stroke="#f1f5f9"
                                    strokeWidth="1.5"
                                  />
                                  <text
                                    x={p.x}
                                    y={padding.top + chartHeight + 18}
                                    textAnchor="middle"
                                    style={{ fontSize: '10px', fill: '#718096', fontFamily: 'Inter, sans-serif' }}
                                  >
                                    {p.tier.quantity >= 1000 ? `${(p.tier.quantity / 1000).toFixed(0)}k` : p.tier.quantity}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Filled Area */}
                            {areaD && (
                              <path
                                d={areaD}
                                fill="url(#priceCurveGradient)"
                              />
                            )}

                            {/* Price line */}
                            {lineD && (
                              <path
                                d={lineD}
                                fill="none"
                                stroke="#2563eb"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            )}

                            {/* Highlight base quantity dot */}
                            {(() => {
                              const basePt = points.find(p => p.tier.quantity === baseQuantity);
                              if (!basePt) return null;
                              return (
                                <g>
                                  <circle
                                    cx={basePt.x}
                                    cy={basePt.y}
                                    r="8"
                                    fill="#d97706"
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                  />
                                  <circle
                                    cx={basePt.x}
                                    cy={basePt.y}
                                    r="13"
                                    fill="none"
                                    stroke="#d97706"
                                    strokeWidth="1.5"
                                    strokeDasharray="3 3"
                                  />
                                </g>
                              );
                            })()}

                            {/* Highlight checked quantities dots */}
                            {points.filter(p => checkedTiers.includes(p.tier.quantity) && p.tier.quantity !== baseQuantity).map(p => (
                              <circle
                                key={p.tier.quantity}
                                cx={p.x}
                                cy={p.y}
                                r="6"
                                fill="#10b981"
                                stroke="#ffffff"
                                strokeWidth="2"
                              />
                            ))}

                            {/* Highlight viewed quantity dot */}
                            {(() => {
                              const viewedPt = points.find(p => p.tier.quantity === params.quantity);
                              if (!viewedPt) return null;
                              return (
                                <g>
                                  <circle
                                    cx={viewedPt.x}
                                    cy={viewedPt.y}
                                    r="7"
                                    fill="#3b82f6"
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                  />
                                </g>
                              );
                            })()}

                            {/* Hover interaction vertical slices */}
                            {points.map((p, idx) => {
                              const barWidth = chartWidth / N;
                              return (
                                <rect
                                  key={idx}
                                  x={p.x - barWidth / 2}
                                  y={padding.top}
                                  width={barWidth}
                                  height={chartHeight}
                                  fill="transparent"
                                  style={{ cursor: 'pointer' }}
                                  onMouseEnter={() => setHoveredTierIdx(idx)}
                                  onMouseLeave={() => setHoveredTierIdx(null)}
                                  onClick={() => setParams({ ...params, quantity: p.tier.quantity })}
                                />
                              );
                            })}
                          </svg>

                          {/* Hover Tooltip HTML */}
                          {hoveredPoint && (
                            <div style={{
                              position: 'absolute',
                              left: `${hoveredPoint.x}px`,
                              top: `${hoveredPoint.y - 120}px`,
                              transform: 'translateX(-50%)',
                              backgroundColor: '#1e293b',
                              color: '#ffffff',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              pointerEvents: 'none',
                              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                              zIndex: 10,
                              whiteSpace: 'nowrap',
                              border: '1px solid #475569'
                            }}>
                              <div style={{ fontWeight: 'bold', borderBottom: '1px solid #475569', paddingBottom: '4px', marginBottom: '6px' }}>
                                {locale === 'ro' ? `Cantitate: ${hoveredPoint.tier.quantity.toLocaleString()} buc` : `Quantity: ${hoveredPoint.tier.quantity.toLocaleString()} units`}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', marginBottom: '4px' }}>
                                <span style={{ color: '#94a3b8' }}>{locale === 'ro' ? 'Preț Unitar' : 'Unit Price'}:</span>
                                <span style={{ fontWeight: 'bold', color: '#60a5fa' }}>{hoveredPoint.tier.unitPrice.toFixed(4)} RON</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', marginBottom: '4px' }}>
                                <span style={{ color: '#94a3b8' }}>{locale === 'ro' ? 'Preț Total' : 'Total Price'}:</span>
                                <span style={{ fontWeight: 'bold' }}>{hoveredPoint.tier.finalPrice.toFixed(2)} RON</span>
                              </div>
                              
                              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                {hoveredPoint.tier.quantity === baseQuantity && (
                                  <span style={{ backgroundColor: '#d97706', color: 'white', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>
                                    {locale === 'ro' ? 'Solicitat' : 'Requested'}
                                  </span>
                                )}
                                {checkedTiers.includes(hoveredPoint.tier.quantity) && (
                                  <span style={{ backgroundColor: '#10b981', color: 'white', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>
                                    {locale === 'ro' ? 'Inclus' : 'Included'}
                                  </span>
                                )}
                                {hoveredPoint.tier.quantity === params.quantity && (
                                  <span style={{ backgroundColor: '#2563eb', color: 'white', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>
                                    {locale === 'ro' ? 'Vizualizat' : 'Active'}
                                  </span>
                                )}
                              </div>
                              <div style={{
                                position: 'absolute',
                                bottom: '-6px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: 0,
                                height: 0,
                                borderLeft: '6px solid transparent',
                                borderRight: '6px solid transparent',
                                borderTop: '6px solid #1e293b'
                              }} />
                            </div>
                          )}
                        </div>

                        {/* Chart Legend info */}
                        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '15px', fontSize: '0.78rem', color: '#4a5568' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#d97706' }}></span>
                            <span>{locale === 'ro' ? 'Cantitate Solicitată' : 'Requested Quantity'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                            <span>{locale === 'ro' ? 'Adăugat în Ofertă' : 'Included in Quote'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>
                            <span>{locale === 'ro' ? 'Vizualizat (Selectat)' : 'Active (Previewed)'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
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
          {activeTab === 'history' && (
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)', fontWeight: 600 }}>{t('recent_versions')}</h3>

              {/* Save current configuration */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={configName}
                  onChange={e => setConfigName(e.target.value)}
                  placeholder={locale === 'ro' ? 'Nume configurație (opțional)' : 'Configuration name (optional)'}
                  style={{ flex: 1, minWidth: '220px', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
                />
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  style={{ padding: '10px 18px', fontWeight: 'bold', backgroundColor: 'var(--kraft-accent)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  💾 {locale === 'ro' ? 'Salvează Configurația Curentă' : 'Save Current Configuration'}
                </button>
              </div>

              {savedConfigs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#999', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
                  {locale === 'ro' ? 'Nicio configurație salvată încă.' : 'No saved configurations yet.'}
                </div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f7fafc', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600 }}>{locale === 'ro' ? 'Nume' : 'Name'}</th>
                        <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600 }}>{locale === 'ro' ? 'Salvat de' : 'Saved by'}</th>
                        <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600 }}>{locale === 'ro' ? 'Data' : 'Date'}</th>
                        <th style={{ padding: '10px 12px', color: '#4a5568', fontWeight: 600, textAlign: 'right' }}>{locale === 'ro' ? 'Acțiuni' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedConfigs.map(cfg => (
                        <tr key={cfg.id} style={{ borderTop: '1px solid #edf2f7' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: '#2d3748' }}>{cfg.name}</td>
                          <td style={{ padding: '10px 12px', color: '#718096' }}>{cfg.created_by || '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#718096' }}>
                            {cfg.created_at ? new Date(cfg.created_at).toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-US') : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => handleLoadConfig(cfg)}
                              style={{ padding: '6px 12px', marginRight: '8px', fontWeight: 'bold', backgroundColor: '#2b6cb0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              {locale === 'ro' ? 'Încarcă' : 'Load'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteConfig(cfg.id)}
                              style={{ padding: '6px 12px', fontWeight: 'bold', color: '#a82020', backgroundColor: '#fde8e8', border: '1px solid #f8b4b4', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              {locale === 'ro' ? 'Șterge' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
            <input 
              type="number" 
              value={params.quantity} 
              onChange={e => {
                const val = Number(e.target.value);
                setBaseQuantity(val);
                setParams({ ...params, quantity: val });
              }} 
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} 
            />
          </div>

          <div style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('fefco_box_style')}</label>
            <select value={params.fefco_code} onChange={e => setParams({...params, fefco_code: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
              <option value="201">FEFCO 201 (Standard Slotted Box)</option>
              <option value="200">FEFCO 200 (Half Slotted Open Box)</option>
              <option value="202">FEFCO 202 (Partial Overlap Slotted)</option>
              <option value="203">FEFCO 203 (Fully Overlapping Flaps)</option>
              <option value="204">FEFCO 204 (Centre Special Slotted)</option>
              <option value="300">FEFCO 300 (Telescopic Lid & Tray)</option>
              <option value="301">FEFCO 301 (Partial Telescope Box)</option>
              <option value="302">FEFCO 302 (Full Telescope, Equal Halves)</option>
              <option value="401">FEFCO 401 (One-Piece Book Wrap)</option>
              <option value="426">FEFCO 426 (Pizza Box, Hinged Lid)</option>
              <option value="427">FEFCO 427 (Die-Cut Mailer)</option>
              <option value="410">FEFCO 410 (Wrap-Around Folder)</option>
              <option value="421">FEFCO 421 (Die-Cut Four-Corner Tray)</option>
              <option value="501">FEFCO 501 (Slide Box: Sleeve & Tray)</option>
              <option value="601">FEFCO 601 (Bliss Box: Body + End Panels)</option>
              <option value="711">FEFCO 711 (Crash-Lock Bottom)</option>
              <option value="800">FEFCO 800 (Shelf-Ready / SRP, 08xx series)</option>
              <option value="901">FEFCO 901 (Layer Pad / Flat Sheet)</option>
              <option value="904">FEFCO 904 (U-Profile Protector)</option>
              <option value="933">FEFCO 933 (Partition / Divider Insert)</option>
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

          {/* Two-piece styles (tray + lid / sleeve) can use a different board for the lid */}
          {TWO_PIECE_STYLES.includes(params.fefco_code) && (
            <div style={{ marginTop: '15px' }}>
              <label style={{ fontSize: '0.8rem', color: '#666' }}>
                {locale === 'ro' ? 'Material Capac / Manșon / Capete' : 'Lid / Sleeve / End-Panel Material'}
              </label>
              <select value={params.lid_material} onChange={e => setParams({...params, lid_material: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                <option value="">{locale === 'ro' ? 'Același ca și corpul' : 'Same as body'}</option>
                <option value="Testliner">Testliner</option>
                <option value="Schrenz">Schrenz</option>
                <option value="Wellenstoff">Wellenstoff</option>
              </select>
            </div>
          )}

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

          <button
            type="button"
            onClick={() => {
              setShipDest(customers.find(c => c.id === selectedCustomerId)?.name || '');
              if (shipPallets.length === 0) {
                const token2 = localStorage.getItem('vnc_token');
                fetch('/vnc-crm/api/logistics/presets', { headers: { 'Authorization': `Bearer ${token2}` } })
                  .then(res => (res.ok ? res.json() : null))
                  .then(data => { if (data?.pallets) setShipPallets(data.pallets); })
                  .catch(() => {});
              }
              setShowShipModal(true);
            }}
            style={{ marginTop: '15px', width: '100%', padding: '10px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🚚 {locale === 'ro' ? 'Trimite în Optimizatorul de Încărcare' : 'Send to Truck Load Optimizer'}
          </button>

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

              {/* Custom Logo Image Uploader */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px' }}>{t('custom_logo_image')}</label>
                
                {!logoUrl ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          if (event.target?.result) {
                            setLogoUrl(event.target.result as string);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{
                      border: '2px dashed #1a365d',
                      borderRadius: '6px',
                      padding: '15px 10px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: '#fff',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (event.target?.result) {
                              setLogoUrl(event.target.result as string);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                  >
                    <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '4px' }}>📤</span>
                    <span style={{ fontSize: '0.8rem', color: '#1a365d', fontWeight: 'bold' }}>
                      {locale === 'ro' ? 'Trageți și plasați sigla aici sau faceți clic' : 'Drag & drop logo here or click to browse'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#666', display: 'block', marginTop: '2px' }}>
                      {locale === 'ro' ? 'Format PNG, JPG, SVG acceptat (max 2MB)' : 'PNG, JPG, SVG supported (max 2MB)'}
                    </span>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px',
                    backgroundColor: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '6px'
                  }}>
                    <img
                      src={logoUrl}
                      alt="Logo Preview"
                      style={{
                        width: '40px',
                        height: '40px',
                        objectFit: 'contain',
                        border: '1px solid #eee',
                        borderRadius: '4px',
                        backgroundColor: '#f9f9f9'
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.75rem', color: '#333', fontWeight: 'bold', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {locale === 'ro' ? 'Logo personalizat activ' : 'Custom Logo Active'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#666' }}>
                        {locale === 'ro' ? 'Monocromizat la culoarea cernelii' : 'Monochromed to ink color'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        color: '#a82020',
                        backgroundColor: '#fde8e8',
                        border: '1px solid #f8b4b4',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      {locale === 'ro' ? 'Șterge' : 'Remove'}
                    </button>
                  </div>
                )}
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
            <>
              {/* Tooling & Setup Options */}
              <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                <h5 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--primary-color)', fontWeight: 600 }}>{t('tooling_setup_options')}</h5>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px' }}>{t('printing_plates_cost')}</label>
                    <input
                      type="number"
                      value={params.tooling_printing_plates_cost}
                      onChange={e => setParams({...params, tooling_printing_plates_cost: Math.max(0, Number(e.target.value))})}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px' }}>{t('die_molds_cost')}</label>
                    <input
                      type="number"
                      value={params.tooling_die_cut_molds_cost}
                      onChange={e => setParams({...params, tooling_die_cut_molds_cost: Math.max(0, Number(e.target.value))})}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={params.amortize_tooling}
                      onChange={e => setParams({...params, amortize_tooling: e.target.checked})}
                    />
                    {t('amortize_tooling_cost')}
                  </label>
                </div>

                {params.amortize_tooling && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px' }}>{t('amortization_volume')}</label>
                    <input
                      type="number"
                      value={params.tooling_amortization_volume}
                      onChange={e => setParams({...params, tooling_amortization_volume: Math.max(1, Number(e.target.value))})}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>

              {canSeeMargins && (
                <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: '#666', fontWeight: 600 }}>{t('target_sales_margin')}</label>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: isViolation ? '#e74c3c' : 'var(--accent-color)' }}>{targetMargin.toFixed(1)}%</span>
                  </div>
                  <input
                    type="range"
                    min={marginSliderMin}
                    max={marginSliderMax}
                    step={0.5}
                    value={targetMargin}
                    onChange={e => setTargetMargin(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--kraft-accent)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#999', marginTop: '2px' }}>
                    <span>{marginSliderMin.toFixed(0)}%</span>
                    <span>{locale === 'ro' ? 'Interval permis pe rol' : 'Role-allowed band'}</span>
                    <span>{marginSliderMax.toFixed(0)}%</span>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  👤 {locale === 'ro' ? 'Selectează Clientul' : 'Select Customer'}
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={e => handleCustomerChange(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                >
                  <option value="">-- {locale === 'ro' ? 'Alege Client' : 'Choose Customer'} --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {result && role !== 'production' && (
            <div style={{ marginTop: '25px', padding: '20px', background: '#e3f2fd', borderRadius: '12px', border: '1px solid #bbdefb', boxShadow: '0 4px 12px rgba(30,136,229,0.08)' }}>
              {/* Cost structures: visible only to admin */}
              {role === 'admin' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <span>{t('raw_material_price')}:</span>
                    <strong>{formatPrice(result.baseCost)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <span>{t('operations_price')}:</span>
                    <strong>{formatPrice(result.operationCost)}</strong>
                  </div>
                  {result.setupCost !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-muted)', paddingLeft: '15px' }}>
                      <span>└ {t('setup_cost_lbl')}:</span>
                      <strong>{formatPrice(result.setupCost)}</strong>
                    </div>
                  )}
                  {result.runCost !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-muted)', paddingLeft: '15px' }}>
                      <span>└ {t('run_cost_lbl')}:</span>
                      <strong>{formatPrice(result.runCost)}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)', borderBottom: '1px dashed #bbdefb', paddingBottom: '8px' }}>
                    <span>{t('est_production_cost')}:</span>
                    <strong>{formatPrice(result.totalCost)}</strong>
                  </div>
                </>
              )}
              
              {/* Final Price: visible to admin, sales, and external/viewer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-color)' }}>{t('total_price')}:</span>
                {formatPrice(result.finalPrice, true)}
              </div>

              {/* Margins: visible to all sales/admin/management roles */}
              {canSeeMargins && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #90caf9' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--secondary-color)', fontWeight: 500 }}>
                    {role === 'admin' ? t('estimated_profit_margin') : t('sales_margin')}
                  </span>
                  <strong style={{ fontSize: '1rem', color: isViolation ? '#e74c3c' : 'var(--accent-color)', fontWeight: 'bold' }}>
                    {role === 'admin' 
                      ? (
                          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
                            {formatPrice(result.finalPrice - result.totalCost)}
                            <span style={{ fontSize: '0.9rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                              ({currentMargin.toFixed(1)}%)
                            </span>
                          </span>
                        )
                      : `${currentMargin.toFixed(1)}%`
                    }
                  </strong>
                </div>
              )}
              
              <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#546e7a', marginTop: '10px', fontStyle: 'italic', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                <span>{t('unit_price')}:</span>
                {formatUnitPrice(result.unitPrice)}
              </div>
            </div>
          )}
          
          {isViolation && (
            <div style={{
              marginTop: '15px',
              padding: '12px 15px',
              backgroundColor: '#fde8e8',
              border: '1px solid #f8b4b4',
              borderRadius: '6px',
              color: '#9b1c1c',
              fontSize: '0.85rem',
              fontWeight: 500
            }}>
              ⚠️ {t('sales_margin_violation', { 
                min: minM.toFixed(1), 
                max: maxM.toFixed(1), 
                current: currentMargin.toFixed(1) 
              })}
            </div>
          )}

          {role !== 'production' && (
            <button 
              type="button"
              className="btn-primary" 
              disabled={isViolation || !selectedCustomerId || checkedTiers.length === 0}
              onClick={handleCreateQuoteFromTiers}
              style={{ 
                width: '100%', 
                marginTop: '20px',
                background: (isViolation || !selectedCustomerId || checkedTiers.length === 0) ? '#cbd5e0' : 'linear-gradient(135deg, var(--kraft-accent) 0%, #a07850 100%)',
                cursor: (isViolation || !selectedCustomerId || checkedTiers.length === 0) ? 'not-allowed' : 'pointer'
              }}
            >
              {t('create_quote')} {checkedTiers.length > 0 ? `(${checkedTiers.length})` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Hand-off to the Truck Load Optimizer */}
      {showShipModal && (() => {
        const preset = shipPallets.find(pp => pp.id?.toString() === shipPalletId);
        const constraints: PalletConstraints = {
          ...DEFAULT_PALLET,
          palletLengthMm: preset?.length_mm || DEFAULT_PALLET.palletLengthMm,
          palletWidthMm: preset?.width_mm || DEFAULT_PALLET.palletWidthMm,
          palletTareKg: preset?.tare_weight_kg || DEFAULT_PALLET.palletTareKg,
          maxStackMm: shipMaxStack,
        };
        const boxSpec = {
          lengthMm: params.length, widthMm: params.width, heightMm: params.height,
          fefco: params.fefco_code, fluteType: params.flute_type, quantity: params.quantity,
          grammage: specs?.grammage, caliperMm: specs?.caliper,
        };
        const plan = planPallets(boxSpec, shipMode, constraints);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '460px', maxWidth: '92vw', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
              <h3 style={{ margin: '0 0 14px 0', color: 'var(--secondary-color)' }}>
                🚚 {locale === 'ro' ? 'Trimite în Optimizatorul de Încărcare' : 'Send to Truck Load Optimizer'}
              </h3>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                {(['flat', 'erected'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setShipMode(m)}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', border: '1px solid #16a34a', backgroundColor: shipMode === m ? '#16a34a' : '#f0fdf4', color: shipMode === m ? 'white' : '#166534' }}>
                    {m === 'flat' ? (locale === 'ro' ? '📦 Pliate (bax)' : '📦 Flat-packed') : (locale === 'ro' ? '🧊 Formate' : '🧊 Erected')}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#666' }}>{locale === 'ro' ? 'Palet' : 'Pallet'}</label>
                  <select value={shipPalletId} onChange={e => setShipPalletId(e.target.value)} style={{ width: '100%', padding: '7px', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <option value="">EUR 1200×800 (implicit)</option>
                    {shipPallets.map(pp => <option key={pp.id} value={pp.id}>{pp.name} ({pp.length_mm}×{pp.width_mm})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#666' }}>{locale === 'ro' ? 'Înălțime max. (mm)' : 'Max height (mm)'}</label>
                  <input type="number" min={500} value={shipMaxStack} onChange={e => setShipMaxStack(Math.max(500, Number(e.target.value)))} style={{ width: '100%', padding: '7px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#666' }}>{locale === 'ro' ? 'Destinație / Client' : 'Destination / Customer'}</label>
                  <input type="text" value={shipDest} onChange={e => setShipDest(e.target.value)} style={{ width: '100%', padding: '7px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#666' }}>{locale === 'ro' ? 'Oprire livrare #' : 'Drop #'}</label>
                  <input type="number" min={1} value={shipSeq} onChange={e => setShipSeq(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: '7px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '14px' }}>
                {plan.totalPallets > 0 ? (
                  <>
                    <div><strong>{params.quantity}</strong> {locale === 'ro' ? 'cutii' : 'boxes'} → <strong>{plan.totalPallets}</strong> {locale === 'ro' ? 'paleți' : 'pallets'}</div>
                    {plan.groups.map((g, i) => (
                      <div key={i} style={{ color: '#166534' }}>
                        {g.palletCount} × {g.boxesPerPallet} {locale === 'ro' ? 'buc/palet' : 'pcs/pallet'} · {g.heightMm} mm · {g.weightKg} kg
                      </div>
                    ))}
                    {plan.warnings.includes('flat_forced') && <div style={{ color: '#b45309' }}>⚠ {locale === 'ro' ? 'Acest produs se livrează doar plat.' : 'This product ships flat only.'}</div>}
                    {plan.warnings.includes('overhang') && <div style={{ color: '#b45309' }}>⚠ {locale === 'ro' ? 'Semifabricatul depășește paletul (overhang).' : 'Blank overhangs the pallet.'}</div>}
                  </>
                ) : (
                  <div style={{ color: '#b91c1c' }}>{locale === 'ro' ? 'Nu încape pe paletul ales — mărește înălțimea maximă.' : 'Does not fit the chosen pallet — raise the max height.'}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowShipModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer' }}>
                  {t('cancel')}
                </button>
                <button type="button" disabled={plan.totalPallets === 0}
                  onClick={() => {
                    pushHandoff(planToHandoffItems(plan, boxSpec, shipMode, shipDest, shipSeq, constraints));
                    setShowShipModal(false);
                    window.location.href = '/vnc-crm/crm/truck-optimizer';
                  }}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: plan.totalPallets === 0 ? '#cbd5e0' : '#16a34a', color: 'white', fontWeight: 'bold', cursor: plan.totalPallets === 0 ? 'not-allowed' : 'pointer' }}>
                  {locale === 'ro' ? 'Trimite' : 'Send'} ({plan.totalPallets})
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ProductConfigurator;
