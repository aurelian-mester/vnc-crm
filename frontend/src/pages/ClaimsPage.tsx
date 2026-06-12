import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { parseJWT } from '../App';

interface LabTest {
  id: number;
  batch_id: string;
  production_line: string;
  testing_timestamp: string;
  ect: number;
  bct: number;
  fct: number;
  bursting_strength: number;
  cobb_test: number;
  material_grade: string;
  delivery_note_no?: string;
}

interface Claim {
  id: number;
  customer_id: string;
  customer_name?: string;
  quote_id?: number;
  batch_id?: string;
  root_cause_category?: string;
  root_cause_details?: string;
  status: string;
  description: string;
  resolution_decision?: string;
  credit_note_amount: number;
  replacement_quote_id?: number;
  created_at: string;
  updated_at: string;
}

interface Quote {
  id: number;
  customer_id: string;
  total_amount: number;
}

const ClaimsPage: React.FC = () => {
  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const role = user?.role || 'viewer';
  const { locale, t } = useI18n();

  const [activeTab, setActiveTab] = useState<'kanban' | 'labTests'>('kanban');
  
  // State lists
  const [claims, setClaims] = useState<Claim[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [cobbThreshold, setCobbThreshold] = useState<number>(150);

  // Lab Test details modal state
  const [selectedLabTest, setSelectedLabTest] = useState<LabTest | null>(null);
  const [mckeeParams, setMckeeParams] = useState({
    caliper: 4.0,
    length: 400,
    width: 300
  });

  // Create Lab Test state
  const [showAddLabModal, setShowAddLabModal] = useState(false);
  const [newLabTest, setNewLabTest] = useState({
    batch_id: '',
    production_line: 'Corrugator L1',
    ect: 0,
    bct: 0,
    fct: 0,
    bursting_strength: 0,
    cobb_test: 0,
    material_grade: 'Testliner',
    delivery_note_no: ''
  });

  // Resolve Claim Form state
  const [resolvingClaim, setResolvingClaim] = useState<Claim | null>(null);
  const [resolutionChoice, setResolutionChoice] = useState<'Re-produce' | 'Credit Note' | 'Reject'>('Re-produce');
  const [creditAmount, setCreditAmount] = useState<number>(0);

  // Configuration slide state
  const [updatingThreshold, setUpdatingThreshold] = useState(false);

  const fetchClaims = () => {
    fetch('/vnc-crm/api/claims', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => setClaims(data || []))
      .catch(err => console.error('Failed to load claims', err));
  };

  const fetchLabTests = () => {
    fetch('/vnc-crm/api/lab-tests', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => setLabTests(data || []))
      .catch(err => console.error('Failed to load lab tests', err));
  };

  const fetchQuotes = () => {
    fetch('/vnc-crm/api/quotes', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => setQuotes(data || []))
      .catch(err => console.error('Failed to load quotes', err));
  };

  const fetchConfig = () => {
    fetch('/vnc-crm/api/quality-config', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => {
        if (data && data.cobb_threshold) {
          setCobbThreshold(data.cobb_threshold);
        }
      })
      .catch(err => console.error('Failed to load quality config', err));
  };

  useEffect(() => {
    fetchClaims();
    fetchLabTests();
    fetchQuotes();
    fetchConfig();
  }, [token]);

  const handleUpdateCobbThreshold = (val: number) => {
    setCobbThreshold(val);
    setUpdatingThreshold(true);
    fetch('/vnc-crm/api/quality-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ cobb_threshold: val })
    })
      .then(() => setUpdatingThreshold(false))
      .catch(err => {
        console.error('Failed to save cobb threshold', err);
        setUpdatingThreshold(false);
      });
  };

  const handleUpdateClaimStatus = (claimId: number, nextStatus: string) => {
    fetch(`/vnc-crm/api/claims/${claimId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: nextStatus })
    })
      .then(() => fetchClaims())
      .catch(err => console.error('Failed to update claim status', err));
  };

  const handleCreateLabTest = (e: React.FormEvent) => {
    e.preventDefault();
    fetch('/vnc-crm/api/lab-tests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newLabTest)
    })
      .then(res => {
        if (!res.ok) throw new Error('Create lab test failed');
        return res.json();
      })
      .then(() => {
        fetchLabTests();
        setShowAddLabModal(false);
        setNewLabTest({
          batch_id: '',
          production_line: 'Corrugator L1',
          ect: 0,
          bct: 0,
          fct: 0,
          bursting_strength: 0,
          cobb_test: 0,
          material_grade: 'Testliner',
          delivery_note_no: ''
        });
      })
      .catch(err => alert(err.message));
  };

  const handleResolveClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingClaim) return;

    fetch(`/vnc-crm/api/claims/${resolvingClaim.id}/resolve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        decision: resolutionChoice,
        credit_note_amount: resolutionChoice === 'Credit Note' ? creditAmount : 0
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Resolve failed');
        return res.json();
      })
      .then(() => {
        fetchClaims();
        setResolvingClaim(null);
        setCreditAmount(0);
      })
      .catch(err => alert(err.message));
  };

  // McKee formula: BCT_est = 5.87 * ECT * sqrt(caliper * perimeter_m)
  const calculateMcKee = (ect: number, caliper: number, length: number, width: number) => {
    const perimeter = (2 * (length + width)) / 1000; // in meters
    return 5.87 * ect * Math.sqrt(caliper * perimeter);
  };

  const printCoA = (test: LabTest) => {
    const p = (2 * (mckeeParams.length + mckeeParams.width)) / 1000;
    const estBCT = 5.87 * test.ect * Math.sqrt(mckeeParams.caliper * p);
    const passMcKee = test.bct >= (0.85 * estBCT);
    const passCobb = test.cobb_test < cobbThreshold;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Escape any free-text field before inlining it into the printed HTML (prevents stored XSS).
    const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

    printWindow.document.write(`
      <html>
        <head>
          <title>CoA - ${esc(test.batch_id)}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2c3e50; padding: 40px; line-height: 1.6; }
            .header { text-align: center; border-bottom: 2px solid #004abb; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { color: #004abb; margin: 0; font-size: 24px; text-transform: uppercase; }
            .header p { margin: 5px 0 0 0; color: #7f8c8d; font-size: 14px; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .meta-item { font-size: 14px; }
            .meta-item strong { color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: left; font-size: 14px; }
            th { background-color: #f1f5f9; color: #334155; }
            .status { font-weight: bold; }
            .status-pass { color: #16a34a; }
            .status-fail { color: #dc2626; }
            .mckee-section { background: #eff6ff; border: 1px solid #bfdbfe; padding: 20px; border-radius: 8px; margin-bottom: 40px; }
            .mckee-title { font-weight: bold; color: #1d4ed8; margin-top: 0; font-size: 16px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 60px; text-align: center; }
            .sig-line { border-top: 1px solid #94a3b8; margin-top: 40px; padding-top: 10px; font-size: 14px; color: #64748b; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: right; margin-bottom: 20px;">
            <button onclick="window.print()" style="background: #004abb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">Print Certificate</button>
          </div>
          <div class="header">
            <h1>Vrancart S.A.</h1>
            <p>Certificat de Analiză Calitate / Certificate of Analysis</p>
            <p>Quality Control Laboratory - Corrugated Packaging Division</p>
          </div>

          <div class="meta-grid">
            <div class="meta-item"><strong>Batch ID:</strong> ${esc(test.batch_id)}</div>
            <div class="meta-item"><strong>Date of Test:</strong> ${new Date(test.testing_timestamp).toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-US')}</div>
            <div class="meta-item"><strong>Production Line:</strong> ${esc(test.production_line)}</div>
            <div class="meta-item"><strong>Material Grade:</strong> ${esc(test.material_grade)}</div>
            <div class="meta-item"><strong>Delivery Note Ref:</strong> ${esc(test.delivery_note_no || 'N/A')}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Test Parameter</th>
                <th>Unit</th>
                <th>Measured Value</th>
                <th>Threshold Limit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Edge Crush Test (ECT)</td>
                <td>kN/m</td>
                <td>${test.ect.toFixed(2)}</td>
                <td>-</td>
                <td class="status status-pass">COMPLIANT</td>
              </tr>
              <tr>
                <td>Flat Crush Test (FCT)</td>
                <td>kPa</td>
                <td>${test.fct.toFixed(2)}</td>
                <td>-</td>
                <td class="status status-pass">COMPLIANT</td>
              </tr>
              <tr>
                <td>Bursting Strength</td>
                <td>kPa</td>
                <td>${test.bursting_strength.toFixed(2)}</td>
                <td>-</td>
                <td class="status status-pass">COMPLIANT</td>
              </tr>
              <tr>
                <td>Cobb<sub>60</sub> Water Absorption</td>
                <td>g/m²</td>
                <td>${test.cobb_test.toFixed(2)}</td>
                <td>&lt; ${cobbThreshold} g/m²</td>
                <td class="status ${passCobb ? 'status-pass' : 'status-fail'}">${passCobb ? 'PASSED' : 'WARNING (High Absorption)'}</td>
              </tr>
              <tr>
                <td>Box Compression Test (BCT)</td>
                <td>N</td>
                <td>${test.bct.toFixed(2)}</td>
                <td>Min. 85% of McKee Estimate</td>
                <td class="status ${passMcKee ? 'status-pass' : 'status-fail'}">${passMcKee ? 'PASSED' : 'DEFECT WARNING'}</td>
              </tr>
            </tbody>
          </table>

          <div class="mckee-section">
            <p class="mckee-title">McKee Structural Integrity Assessment</p>
            <p>Box Dimensions used for estimation: <strong>${mckeeParams.length} x ${mckeeParams.width} x [h: ${mckeeParams.caliper}mm]</strong></p>
            <p>Estimated McKee BCT Limit: <strong>${estBCT.toFixed(2)} N</strong></p>
            <p>Measured Box BCT: <strong>${test.bct.toFixed(2)} N</strong> (${((test.bct / estBCT) * 100).toFixed(1)}% of estimate)</p>
            <p>Status: <strong class="${passMcKee ? 'status-pass' : 'status-fail'}">${passMcKee ? 'PASSED (Structural integrity within limits)' : 'STRUCTURAL COLLAPSE RISK (Under 85%)'}</strong></p>
          </div>

          <div class="signatures">
            <div>
              <div class="sig-line">Laboratory QA Inspector</div>
            </div>
            <div>
              <div class="sig-line">Quality Department Director</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Kanban Stage configuration
  const stages = [
    { key: 'New', name: locale === 'ro' ? 'Sesizare Nouă' : 'New Claim' },
    { key: 'RMA Route to QA', name: locale === 'ro' ? 'Verificare Lab' : 'QA Route' },
    { key: 'Material Analysis', name: locale === 'ro' ? 'Analiză Defecte' : 'Material Analysis' },
    { key: 'Resolution Decision', name: locale === 'ro' ? 'Decizie Rezoluție' : 'Resolution Decision' }
  ];

  const getResolvedClaims = () => {
    return claims.filter(c => ['Credit Issued', 'Replacement Queued', 'Rejected'].includes(c.status));
  };

  const getActiveClaimsForStage = (stageKey: string) => {
    return claims.filter(c => c.status === stageKey);
  };

  return (
    <>
      <style>{`
        .claims-dashboard {
          padding: 10px 0;
          font-family: inherit;
        }
        .quality-slider-panel {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 16px 20px;
          border: 1px solid #e2e8f0;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .quality-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 2px;
        }
        .q-tab {
          border: none;
          background: none;
          padding: 10px 20px;
          font-size: 1rem;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          border-bottom: 3px solid transparent;
          transition: all 0.2s;
        }
        .q-tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }
        .kanban-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 32px;
          align-items: start;
        }
        .kanban-col {
          background: #f8fafc;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding: 14px;
          min-height: 450px;
        }
        .kanban-col h3 {
          font-size: 0.95rem;
          color: #334155;
          margin-top: 0;
          margin-bottom: 14px;
          padding-bottom: 8px;
          border-bottom: 2px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .badge-count {
          background: #cbd5e1;
          color: #334155;
          font-size: 0.75rem;
          padding: 2px 8px;
          border-radius: 10px;
        }
        .kanban-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .kanban-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .card-title {
          font-weight: 700;
          font-size: 0.85rem;
          color: #0f172a;
        }
        .cause-badge {
          background: #fee2e2;
          color: #991b1b;
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }
        .card-body {
          font-size: 0.8rem;
          color: #475569;
          line-height: 1.4;
          margin-bottom: 12px;
        }
        .card-meta {
          font-size: 0.75rem;
          color: #94a3b8;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .card-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid #f1f5f9;
        }
        .btn-move {
          background: #f1f5f9;
          border: none;
          color: #475569;
          font-size: 0.75rem;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        }
        .btn-move:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        .btn-resolve {
          background: #004abb;
          color: white;
          border: none;
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
        }
        .resolved-section {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
        }
        .resolved-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: #0f172a;
          margin-top: 0;
          margin-bottom: 16px;
        }
        .resolved-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .resolved-card {
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          padding: 12px;
          background: #f8fafc;
        }
        .decision-badge {
          background: #dcfce7;
          color: #166534;
          font-size: 0.75rem;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: bold;
          display: inline-block;
        }
        .decision-badge.reject {
          background: #fee2e2;
          color: #991b1b;
        }
        .decision-badge.replace {
          background: #eff6ff;
          color: #1d4ed8;
        }
        .lab-grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 24px;
          align-items: start;
        }
        .lab-list-panel {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          max-height: 600px;
          overflow-y: auto;
        }
        .lab-detail-panel {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
        }
        .test-row {
          padding: 12px;
          border-bottom: 1px solid #f1f5f9;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.2s;
        }
        .test-row:hover {
          background: #f8fafc;
        }
        .test-row.active {
          background: #eff6ff;
          border-left: 4px solid var(--primary-color);
        }
        .grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 20px;
        }
        .metric-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px;
          text-align: center;
        }
        .metric-val {
          font-size: 1.3rem;
          font-weight: bold;
          color: #0f172a;
        }
        .metric-lbl {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 4px;
        }
        .alert-box {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 0.85rem;
          margin-bottom: 12px;
          font-weight: 600;
          border: 1px solid transparent;
        }
        .alert-hazard {
          background-color: #fff5f5;
          color: #c53030;
          border-color: #feb2b2;
        }
        .alert-ok {
          background-color: #f0fff4;
          color: #276749;
          border-color: #9ae6b4;
        }
        .config-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.9rem;
          margin-bottom: 10px;
        }
        .btn-primary {
          background: #004abb;
          color: white;
          border: none;
          padding: 10px 16px;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
        }
        .btn-primary:hover {
          background: #003688;
        }
        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-card {
          background: white;
          border-radius: 12px;
          width: 500px;
          max-width: 90%;
          padding: 24px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .modal-header {
          font-size: 1.2rem;
          font-weight: 700;
          margin-top: 0;
          margin-bottom: 16px;
          color: #0f172a;
        }
      `}</style>

      <div className="claims-dashboard">
        
        {/* Administrator Settings Slider */}
        {(role === 'admin' || role === 'management') && (
          <div className="quality-slider-panel">
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>
                🔧 {locale === 'ro' ? 'Parametri Limită Laborator (Admin)' : 'Lab Limits Configuration (Admin)'}
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                {locale === 'ro' ? 'Ajustează pragul maxim de absorbție apă pentru testul Cobb60.' : 'Configure the maximum allowable water absorption for Cobb60 tests.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                  Cobb<sub>60</sub> Threshold:
                </span>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#004abb' }}>
                  {cobbThreshold} g/m²
                </div>
              </div>
              <input
                type="range"
                min="50"
                max="300"
                step="5"
                value={cobbThreshold}
                onChange={(e) => handleUpdateCobbThreshold(Number(e.target.value))}
                style={{ width: '180px', cursor: 'pointer' }}
                disabled={updatingThreshold}
              />
            </div>
          </div>
        )}

        <div className="quality-tabs">
          <button 
            className={`q-tab ${activeTab === 'kanban' ? 'active' : ''}`}
            onClick={() => setActiveTab('kanban')}
          >
            📋 {locale === 'ro' ? 'Kanban Reclamații' : 'Claims Workflow (RMA)'}
          </button>
          <button 
            className={`q-tab ${activeTab === 'labTests' ? 'active' : ''}`}
            onClick={() => setActiveTab('labTests')}
          >
            🧪 {locale === 'ro' ? 'Bază Date Laborator' : 'QA Lab Database'}
          </button>
        </div>

        {activeTab === 'kanban' ? (
          <div>
            <div className="kanban-grid">
              {stages.map((stg) => {
                const stageClaims = getActiveClaimsForStage(stg.key);
                return (
                  <div key={stg.key} className="kanban-col">
                    <h3>
                      <span>{stg.name}</span>
                      <span className="badge-count">{stageClaims.length}</span>
                    </h3>

                    {stageClaims.map((claim) => (
                      <div key={claim.id} className="kanban-card">
                        <div className="card-header">
                          <span className="card-title">RMA #{claim.id}</span>
                          <span className="cause-badge">{claim.root_cause_category || 'General'}</span>
                        </div>
                        <div className="card-body">
                          {claim.description.length > 90 ? `${claim.description.slice(0, 90)}...` : claim.description}
                        </div>
                        <div className="card-meta">
                          <span>👤 {claim.customer_name || claim.customer_id}</span>
                          {claim.batch_id && <span>📦 Batch: <strong>{claim.batch_id}</strong></span>}
                          {claim.quote_id && <span>📄 Quote Ref: #{claim.quote_id}</span>}
                        </div>

                        <div className="card-actions">
                          {/* Navigation buttons to move stages */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {stg.key !== 'New' && (
                              <button 
                                className="btn-move"
                                onClick={() => {
                                  const idx = stages.findIndex(s => s.key === stg.key);
                                  handleUpdateClaimStatus(claim.id, stages[idx-1].key);
                                }}
                              >
                                ◀
                              </button>
                            )}
                            {stg.key !== 'Resolution Decision' && (
                              <button 
                                className="btn-move"
                                onClick={() => {
                                  const idx = stages.findIndex(s => s.key === stg.key);
                                  handleUpdateClaimStatus(claim.id, stages[idx+1].key);
                                }}
                              >
                                ▶
                              </button>
                            )}
                          </div>

                          {/* Trigger Resolution choice */}
                          {stg.key === 'Resolution Decision' && (
                            <button 
                              className="btn-resolve"
                              onClick={() => {
                                setResolvingClaim(claim);
                                const q = quotes.find(qt => qt.id === claim.quote_id);
                                if (q) setCreditAmount(q.total_amount);
                              }}
                            >
                              {locale === 'ro' ? 'Soluționează' : 'Resolve'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Resolved section */}
            <div className="resolved-section">
              <h3 className="resolved-title">
                ✅ {locale === 'ro' ? 'Sesizări Soluționate' : 'Resolved Quality Claims'}
              </h3>
              <div className="resolved-grid">
                {getResolvedClaims().map((claim) => (
                  <div key={claim.id} className="resolved-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '0.9rem' }}>RMA #{claim.id}</strong>
                      <span className={`decision-badge ${
                        claim.status === 'Rejected' ? 'reject' : claim.status === 'Replacement Queued' ? 'replace' : ''
                      }`}>
                        {claim.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#475569', margin: '0 0 10px 0' }}>
                      {claim.description}
                    </p>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      <div>👤 {claim.customer_name || claim.customer_id}</div>
                      <div>Decision: <strong>{claim.resolution_decision}</strong></div>
                      {claim.replacement_quote_id && (
                        <div>Replacement Quote: <strong>#{claim.replacement_quote_id} (0.00 RON)</strong></div>
                      )}
                      {claim.credit_note_amount > 0 && (
                        <div>Credit Value: <strong>{claim.credit_note_amount.toFixed(2)} RON</strong></div>
                      )}
                    </div>
                  </div>
                ))}
                {getResolvedClaims().length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', gridColumn: '1/-1' }}>
                    {locale === 'ro' ? 'Nicio reclamație soluționată în această sesiune.' : 'No resolved claims listed.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Lab Test database view tab */
          <div className="lab-grid">
            <div className="lab-list-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>
                  {locale === 'ro' ? 'Loturi Testate' : 'Production Batches'}
                </h3>
                {(role === 'admin' || role === 'management' || role === 'quality') && (
                  <button 
                    className="btn-primary" 
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => setShowAddLabModal(true)}
                  >
                    + {locale === 'ro' ? 'Adaugă Test' : 'New Lab Entry'}
                  </button>
                )}
              </div>
              <div>
                {labTests.map((test) => (
                  <div 
                    key={test.id} 
                    className={`test-row ${selectedLabTest?.batch_id === test.batch_id ? 'active' : ''}`}
                    onClick={() => setSelectedLabTest(test)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.85rem' }}>
                      <span>{test.batch_id}</span>
                      <span style={{ color: '#004abb' }}>{test.material_grade}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
                      <span>{test.production_line}</span>
                      <span>{new Date(test.testing_timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Batch lab test detail / evaluation */}
            <div className="lab-detail-panel">
              {selectedLabTest ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>
                      📊 Evaluation - {selectedLabTest.batch_id}
                    </h3>
                    <button 
                      className="btn-primary"
                      onClick={() => printCoA(selectedLabTest)}
                    >
                      🖨️ {locale === 'ro' ? 'Printează Certificat (CoA)' : 'Print Certificate (CoA)'}
                    </button>
                  </div>

                  <div className="grid-3">
                    <div className="metric-box">
                      <div className="metric-val">{selectedLabTest.ect}</div>
                      <div className="metric-lbl">ECT (kN/m)</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-val">{selectedLabTest.fct}</div>
                      <div className="metric-lbl">FCT (kPa)</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-val">{selectedLabTest.bursting_strength}</div>
                      <div className="metric-lbl">Bursting (kPa)</div>
                    </div>
                  </div>

                  {/* Cobb warning alert */}
                  {selectedLabTest.cobb_test >= cobbThreshold ? (
                    <div className="alert-box alert-hazard">
                      ⚠️ WATER ABSORPTION HAZARD: Cobb value ({selectedLabTest.cobb_test} g/m²) exceeds threshold ({cobbThreshold} g/m²). This cardboard is highly absorbent and susceptible to collapse in humid shipping environments.
                    </div>
                  ) : (
                    <div className="alert-box alert-ok">
                      ✅ Cobb Absorption Limit Compliant ({selectedLabTest.cobb_test} g/m² &lt; {cobbThreshold} g/m²)
                    </div>
                  )}

                  {/* McKee formula estimator */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginTop: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#334155' }}>
                      🧮 McKee's Box Compression Strength (BCT) Calculator
                    </h4>
                    
                    <div className="grid-3" style={{ marginBottom: '16px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Caliper (mm):</label>
                        <input
                          type="number"
                          step="0.1"
                          className="config-input"
                          style={{ marginBottom: 0, marginTop: '4px' }}
                          value={mckeeParams.caliper}
                          onChange={(e) => setMckeeParams({ ...mckeeParams, caliper: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Length (mm):</label>
                        <input
                          type="number"
                          className="config-input"
                          style={{ marginBottom: 0, marginTop: '4px' }}
                          value={mckeeParams.length}
                          onChange={(e) => setMckeeParams({ ...mckeeParams, length: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Width (mm):</label>
                        <input
                          type="number"
                          className="config-input"
                          style={{ marginBottom: 0, marginTop: '4px' }}
                          value={mckeeParams.width}
                          onChange={(e) => setMckeeParams({ ...mckeeParams, width: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    {(() => {
                      const estimatedBCT = calculateMcKee(selectedLabTest.ect, mckeeParams.caliper, mckeeParams.length, mckeeParams.width);
                      const isLowBCT = selectedLabTest.bct < (0.85 * estimatedBCT);

                      return (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Estimated BCT (McKee):</div>
                              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#475569' }}>{estimatedBCT.toFixed(1)} N</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Measured Batch BCT:</div>
                              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isLowBCT ? '#dc2626' : '#16a34a' }}>
                                {selectedLabTest.bct.toFixed(1)} N
                              </div>
                            </div>
                          </div>

                          {isLowBCT ? (
                            <div className="alert-box alert-hazard" style={{ marginBottom: 0 }}>
                              ⚠️ STRUCTURAL DEFECT HAZARD: Measured BCT is only {((selectedLabTest.bct / estimatedBCT) * 100).toFixed(1)}% of McKee's estimate. Flutes are likely crushed, or board de-laminated during production.
                            </div>
                          ) : (
                            <div className="alert-box alert-ok" style={{ marginBottom: 0 }}>
                              ✅ BCT Structural Strength complies with McKee estimation standards.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  {locale === 'ro' ? 'Selectează un lot testat din listă pentru detalii și calcul.' : 'Select a batch record to perform strength verification and view analysis.'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Lab Test Modal */}
      {showAddLabModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-header">🔬 {locale === 'ro' ? 'Adaugă Test Lot' : 'New Lab Test Entry'}</h3>
            <form onSubmit={handleCreateLabTest}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Batch ID / Lot</label>
                  <input
                    type="text"
                    required
                    className="config-input"
                    value={newLabTest.batch_id}
                    onChange={(e) => setNewLabTest({ ...newLabTest, batch_id: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Grade / Carton</label>
                  <input
                    type="text"
                    required
                    className="config-input"
                    value={newLabTest.material_grade}
                    onChange={(e) => setNewLabTest({ ...newLabTest, material_grade: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Production Line</label>
                  <select
                    className="config-input"
                    value={newLabTest.production_line}
                    onChange={(e) => setNewLabTest({ ...newLabTest, production_line: e.target.value })}
                  >
                    <option value="Corrugator L1">Corrugator L1</option>
                    <option value="Corrugator L2">Corrugator L2</option>
                    <option value="Bobst Line">Bobst Line</option>
                    <option value="Martin Inline">Martin Inline</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Delivery Note No</label>
                  <input
                    type="text"
                    className="config-input"
                    value={newLabTest.delivery_note_no}
                    onChange={(e) => setNewLabTest({ ...newLabTest, delivery_note_no: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginTop: '10px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>ECT (kN/m)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="config-input"
                    value={newLabTest.ect}
                    onChange={(e) => setNewLabTest({ ...newLabTest, ect: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>BCT (N)</label>
                  <input
                    type="number"
                    required
                    className="config-input"
                    value={newLabTest.bct}
                    onChange={(e) => setNewLabTest({ ...newLabTest, bct: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>FCT (kPa)</label>
                  <input
                    type="number"
                    required
                    className="config-input"
                    value={newLabTest.fct}
                    onChange={(e) => setNewLabTest({ ...newLabTest, fct: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Bursting (kPa)</label>
                  <input
                    type="number"
                    required
                    className="config-input"
                    value={newLabTest.bursting_strength}
                    onChange={(e) => setNewLabTest({ ...newLabTest, bursting_strength: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Cobb60 (g/m²)</label>
                  <input
                    type="number"
                    required
                    className="config-input"
                    value={newLabTest.cobb_test}
                    onChange={(e) => setNewLabTest({ ...newLabTest, cobb_test: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button 
                  type="button" 
                  className="btn-move" 
                  style={{ padding: '8px 16px' }}
                  onClick={() => setShowAddLabModal(false)}
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Claim Modal */}
      {resolvingClaim && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-header">⚖️ {locale === 'ro' ? 'Decizie Rezoluție Reclamație' : 'Resolve Quality Claim'}</h3>
            <form onSubmit={handleResolveClaimSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                  Select processing method for claim linked to Customer ID: <strong>{resolvingClaim.customer_id}</strong>
                </p>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Resolution Choice</label>
                <select
                  className="config-input"
                  value={resolutionChoice}
                  onChange={(e) => setResolutionChoice(e.target.value as any)}
                >
                  <option value="Re-produce">{locale === 'ro' ? 'Refacere Comandă (0.00 RON)' : 'Re-produce Order (0.00 RON)'}</option>
                  <option value="Credit Note">{locale === 'ro' ? 'Emitere Notă de Credit' : 'Issue Credit Note'}</option>
                  <option value="Reject">{locale === 'ro' ? 'Respingere Reclamație' : 'Reject Claim'}</option>
                </select>
              </div>

              {resolutionChoice === 'Credit Note' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Credit Value (RON)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="config-input"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(Number(e.target.value))}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Original Quotation total value was: {quotes.find(q => q.id === resolvingClaim.quote_id)?.total_amount || 0} RON
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button 
                  type="button" 
                  className="btn-move" 
                  style={{ padding: '8px 16px' }}
                  onClick={() => setResolvingClaim(null)}
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                >
                  {locale === 'ro' ? 'Soluționează' : 'Process Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default ClaimsPage;
