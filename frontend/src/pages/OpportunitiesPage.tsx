import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface Customer {
  id: string;
  name: string;
}

interface Quote {
  id: number;
  total_amount: number;
}

interface Opportunity {
  id: number;
  customer_id: string;
  customer_name?: string;
  title: string;
  stage: string;
  expected_value: number;
  quote_id: number | null;
  salesperson_code: string;
  created_at: string;
}

const OpportunitiesPage: React.FC = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOpp, setNewOpp] = useState({
    customer_id: '',
    title: '',
    stage: 'Qualification',
    expected_value: 0,
    quote_id: null as number | null,
    salesperson_code: localStorage.getItem('vnc_role') === 'sales' ? localStorage.getItem('vnc_name')?.slice(0, 2).toUpperCase() || 'AM' : 'AM'
  });

  const fetchData = () => {
    setLoading(true);
    const token = localStorage.getItem('vnc_token');

    // Fetch opportunities
    fetch('/vnc-crm/api/opportunities', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => setOpportunities(data || []))
      .catch(err => console.error('Failed to load opportunities', err));

    // Fetch customers for selector
    fetch('/vnc-crm/api/customers', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => setCustomers(data || []))
      .catch(err => console.error('Failed to load customers', err));

    // Fetch quotes for selector
    fetch('/vnc-crm/api/quotes', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => {
        setQuotes(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load quotes', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateOpp = (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('vnc_token');

    fetch('/vnc-crm/api/opportunities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newOpp)
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(() => {
        setShowAddModal(false);
        setNewOpp({ customer_id: '', title: '', stage: 'Qualification', expected_value: 0, quote_id: null, salesperson_code: 'AM' });
        fetchData();
      })
      .catch(err => console.error('Failed to create opportunity', err));
  };

  const handleStageChange = (oppId: number, stage: string) => {
    const opp = opportunities.find(o => o.id === oppId);
    if (!opp) return;

    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/opportunities/${oppId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ...opp, stage })
    })
      .then(() => fetchData())
      .catch(err => console.error('Failed to update stage', err));
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'Qualification': return '#7f8c8d';
      case 'Proposal': return '#3498db';
      case 'Negotiation': return '#f39c12';
      case 'Closed Won': return '#2ecc71';
      case 'Closed Lost': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getStageTranslation = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'qualification': return t('qualification');
      case 'proposal': return t('proposal');
      case 'negotiation': return t('negotiation');
      case 'closed won': return t('closed_won');
      case 'closed lost': return t('closed_lost');
      default: return stage;
    }
  };

  // Computations
  const totalValue = opportunities.reduce((acc, o) => acc + o.expected_value, 0);
  const wonValue = opportunities
    .filter(o => o.stage === 'Closed Won')
    .reduce((acc, o) => acc + o.expected_value, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--secondary-color)' }}>{t('opportunities_pipeline')}</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('deals_qualification')}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          ➕ {t('new_opportunity')}
        </button>
      </div>

      {/* KPI summaries */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('total_deals')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{opportunities.length}</span>
        </div>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', borderLeft: '4px solid #3498db' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('pipeline_value')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-color)' }}>
            {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(totalValue)}
          </span>
        </div>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', borderLeft: '4px solid #2ecc71' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('won_sales_value')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-color)' }}>
            {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(wonValue)}
          </span>
        </div>
      </div>

      {/* Pipeline List */}
      <div className="card" style={{ padding: '24px' }}>
        {loading ? (
          <div>{t('loading')}</div>
        ) : opportunities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            {t('no_opportunities')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '12px 8px' }}>{t('deal_name')}</th>
                <th style={{ padding: '12px 8px' }}>{t('customer')}</th>
                <th style={{ padding: '12px 8px' }}>{t('expected_value')}</th>
                <th style={{ padding: '12px 8px' }}>{t('associated_quote')}</th>
                <th style={{ padding: '12px 8px' }}>{t('salesperson')}</th>
                <th style={{ padding: '12px 8px' }}>{t('stage')}</th>
                <th style={{ padding: '12px 8px' }}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                  <td style={{ padding: '15px 8px', fontWeight: 600 }}>{o.title}</td>
                  <td style={{ padding: '15px 8px' }}>{o.customer_name || o.customer_id || 'N/A'}</td>
                  <td style={{ padding: '15px 8px', fontWeight: 700, color: 'var(--secondary-color)' }}>
                    {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(o.expected_value)}
                  </td>
                  <td style={{ padding: '15px 8px' }}>
                    {o.quote_id ? `${t('quote_num').replace(' #', '')} #${o.quote_id}` : 'None'}
                  </td>
                  <td style={{ padding: '15px 8px', fontWeight: 700 }}>{o.salesperson_code}</td>
                  <td style={{ padding: '15px 8px' }}>
                    <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', backgroundColor: getStageColor(o.stage) + '1a', color: getStageColor(o.stage), fontWeight: 700 }}>
                      {getStageTranslation(o.stage)}
                    </span>
                  </td>
                  <td style={{ padding: '15px 8px' }}>
                    <select 
                      value={o.stage} 
                      onChange={e => handleStageChange(o.id, e.target.value)}
                      style={{ padding: '4px', fontSize: '0.8rem' }}
                    >
                      <option value="Qualification">{t('qualification')}</option>
                      <option value="Proposal">{t('proposal')}</option>
                      <option value="Negotiation">{t('negotiation')}</option>
                      <option value="Closed Won">{t('closed_won')}</option>
                      <option value="Closed Lost">{t('closed_lost')}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '30px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)' }}>{t('new_opportunity')}</h3>
            
            <form onSubmit={handleCreateOpp} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('deal_title')}</label>
                <input 
                  type="text" 
                  value={newOpp.title} 
                  onChange={e => setNewOpp({ ...newOpp, title: e.target.value })} 
                  placeholder="e.g. 50k RSC Corrugated Boxes"
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                  required 
                />
              </div>
              
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('customer')}</label>
                <select 
                  value={newOpp.customer_id} 
                  onChange={e => setNewOpp({ ...newOpp, customer_id: e.target.value })}
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                  required
                >
                  <option value="">-- {t('choose_customer')} --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('expected_value_ron')}</label>
                  <input 
                    type="number" 
                    value={newOpp.expected_value} 
                    onChange={e => setNewOpp({ ...newOpp, expected_value: Number(e.target.value) })} 
                    style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                    required 
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('link_to_quote')}</label>
                  <select 
                    value={newOpp.quote_id || ''} 
                    onChange={e => setNewOpp({ ...newOpp, quote_id: e.target.value ? Number(e.target.value) : null })}
                    style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                  >
                    <option value="">-- {t('no_quote_linked')} --</option>
                    {quotes.map(q => (
                      <option key={q.id} value={q.id}>{t('quote_num').replace(' #', '')} #{q.id} ({new Intl.NumberFormat('ro-RO').format(q.total_amount)} RON)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary" style={{ padding: '8px 16px', boxShadow: 'none' }}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '8px 16px' }}>
                  {t('create_deal')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpportunitiesPage;
