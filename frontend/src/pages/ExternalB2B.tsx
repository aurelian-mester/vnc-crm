import React, { useEffect, useState } from 'react';
import BoxConfigurator3D from '../components/BoxConfigurator3D';
import { parseJWT } from '../App';
import { useI18n } from '../i18n';

interface Customer {
  id: string;
  name: string;
  email: string;
  city: string;
  address: string;
  county: string;
  contact: string;
  phone: string;
  payment_terms_code: string;
  customer_price_group: string;
  credit_limit: number;
}

interface QuoteItem {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  config_params: string;
}

interface Quote {
  id: number;
  customer_id: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  items?: QuoteItem[];
}

interface ProductionJob {
  nr_crt: number;
  product_code: string;
  product_name: string;
  order_number: string;
  quantity_ordered: number;
  quantity_produced: number;
  scheduled_date: string;
  production_date: string;
  status: number;
  machine_code: string;
}

interface PricingResult {
  baseCost: number;
  operationCost: number;
  totalCost: number;
  finalPrice: number;
  unitPrice: number;
}

const ExternalB2B: React.FC = () => {
  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const customerID = user?.customer_id || '';
  const customerEmail = user?.email || '';
  const customerName = user?.name || 'B2B Customer';
  const { locale, setLocale, t } = useI18n();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'configurator' | 'orders'>('dashboard');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [loading, setLoading] = useState(false);

  // Configurator state
  const [config, setConfig] = useState({
    length: 400,
    width: 300,
    height: 200,
    quantity: 1000,
    material: 'Testliner',
    printing: false,
    dieCutting: false,
    gluing: true,
    stapling: false,
    fefco_code: '201'
  });
  const [foldPercent, setFoldPercent] = useState(1.0);
  const [printColor, setPrintColor] = useState('#1a365d');
  const [printText, setPrintText] = useState('VRANCART');
  const [printSymbols, setPrintSymbols] = useState({
    recycling: true,
    fragile: false,
    upArrows: false
  });
  const [printCoverage, setPrintCoverage] = useState('front');
  const [priceResult, setPriceResult] = useState<PricingResult | null>(null);
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [viewingQuoteDetails, setViewingQuoteDetails] = useState(false);

  const fetchCustomerData = () => {
    if (!token) return;
    setLoading(true);

    // Fetch customer details
    fetch(`/vnc-crm/api/customers/${customerID}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setCustomer(data))
      .catch(err => console.error('Failed to load B2B customer profile', err));

    // Fetch quotes
    fetch(`/vnc-crm/api/customers/${customerID}/quotes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setQuotes(data || []))
      .catch(err => console.error('Failed to load customer quotes history', err));

    // Fetch production jobs
    fetch(`/vnc-crm/api/production/jobs?customer_id=${customerID}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setJobs(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load active production jobs', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (customerID) {
      fetchCustomerData();
    }
  }, [customerID, token]);

  // Recalculate price dynamically when configurator params change
  useEffect(() => {
    if (activeTab === 'configurator' && customer) {
      const payload = {
        length: config.length,
        width: config.width,
        height: config.height,
        quantity: config.quantity,
        material: config.material,
        printing: config.printing,
        dieCutting: config.dieCutting,
        gluing: config.gluing,
        stapling: config.stapling,
        customer_price_group: customer.customer_price_group,
        customer_id: customer.id
      };
      fetch('/vnc-crm/api/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(data => setPriceResult(data))
        .catch(err => console.error('B2B calculation failed', err));
    }
  }, [config, activeTab, customer]);

  const handleCreateB2BQuote = () => {
    if (!customer) return;
    setSubmittingQuote(true);

    const payload = {
      customer_id: customer.id,
      salesperson_code: 'AM',
      status: 'Sent', // Mark as sent so internal managers see it
      items: [
        {
          product_id: '',
          description: `B2B Custom Box (${config.length}x${config.width}x${config.height}mm) - ${config.material}`,
          quantity: config.quantity,
          unit_price: priceResult?.unitPrice || 0,
          config_params: JSON.stringify({
            length: config.length,
            width: config.width,
            height: config.height,
            material: config.material,
            printing: config.printing,
            dieCutting: config.dieCutting,
            gluing: config.gluing,
            stapling: config.stapling,
            fefco_code: config.fefco_code
          })
        }
      ]
    };

    fetch('/vnc-crm/api/quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(() => {
        alert(t('b2b_quote_success_alert'));
        setSubmittingQuote(false);
        setActiveTab('dashboard');
        fetchCustomerData();
      })
      .catch(err => {
        console.error('Failed to submit quote request', err);
        setSubmittingQuote(false);
        alert(t('b2b_quote_fail_alert'));
      });
  };

  const handleViewQuoteDetails = (qId: number) => {
    fetch(`/vnc-crm/api/quotes/${qId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setSelectedQuote(data);
        setViewingQuoteDetails(true);
      })
      .catch(err => console.error('Failed to load quote details', err));
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/vnc-crm/login';
  };

  const getStatusColor = (statusStr: string) => {
    switch (statusStr) {
      case 'Draft': return '#f39c12';
      case 'Sent': return '#3498db';
      case 'Approved': return '#2ecc71';
      case 'Declined': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const getStatusTranslation = (statusStr: string) => {
    switch (statusStr.toLowerCase()) {
      case 'approved': return t('approved');
      case 'sent': return t('sent');
      case 'declined': return t('declined');
      default: return t('draft');
    }
  };

  const getJobStatusString = (jobStatus: number) => {
    switch (jobStatus) {
      case 0: return t('queued');
      case 1: return t('running');
      case 2: return t('completed');
      default: return 'Pending';
    }
  };

  if (loading && !customer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-color)' }}>
        <div style={{ textAlign: 'center' }}>
          <h3>{t('loading_portal')}</h3>
          <div style={{ width: '40px', height: '40px', border: '4px solid #eee', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', margin: '20px auto', animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Top Header */}
      <header className="header" style={{ padding: '0 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-color)', letterSpacing: '0.5px' }}>
            VRANCART <span style={{ color: 'var(--kraft-accent)', fontWeight: 500 }}>B2B PORTAL</span>
          </div>
          <div style={{ display: 'flex', gap: '5px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
            <button 
              className={`btn-primary ${activeTab === 'dashboard' ? '' : 'btn-secondary'}`}
              style={{ padding: '6px 16px', fontSize: '0.85rem', background: activeTab === 'dashboard' ? 'var(--primary-color)' : 'none', border: 'none', color: activeTab === 'dashboard' ? 'white' : 'var(--text-muted)', boxShadow: 'none' }}
              onClick={() => setActiveTab('dashboard')}
            >
              📊 {t('dashboard')}
            </button>
            <button 
              className={`btn-primary ${activeTab === 'configurator' ? '' : 'btn-secondary'}`}
              style={{ padding: '6px 16px', fontSize: '0.85rem', background: activeTab === 'configurator' ? 'var(--primary-color)' : 'none', border: 'none', color: activeTab === 'configurator' ? 'white' : 'var(--text-muted)', boxShadow: 'none' }}
              onClick={() => setActiveTab('configurator')}
            >
              📦 {t('configurator')}
            </button>
            <button 
              className={`btn-primary ${activeTab === 'orders' ? '' : 'btn-secondary'}`}
              style={{ padding: '6px 16px', fontSize: '0.85rem', background: activeTab === 'orders' ? 'var(--primary-color)' : 'none', border: 'none', color: activeTab === 'orders' ? 'white' : 'var(--text-muted)', boxShadow: 'none' }}
              onClick={() => setActiveTab('orders')}
            >
              📋 {t('recent_quotes_status')}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Language Switcher */}
          <div className="language-switcher" style={{ display: 'flex', gap: '6px', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setLocale('en')}
              style={{
                background: locale === 'en' ? '#ffffff' : 'transparent',
                border: 'none',
                boxShadow: locale === 'en' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: locale === 'en' ? 600 : 500,
                color: locale === 'en' ? 'var(--primary-color)' : 'var(--text-muted)',
                transition: 'all 0.2s'
              }}
            >
              <span>🇬🇧</span> EN
            </button>
            <button
              onClick={() => setLocale('ro')}
              style={{
                background: locale === 'ro' ? '#ffffff' : 'transparent',
                border: 'none',
                boxShadow: locale === 'ro' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: locale === 'ro' ? 600 : 500,
                color: locale === 'ro' ? 'var(--primary-color)' : 'var(--text-muted)',
                transition: 'all 0.2s'
              }}
            >
              <span>🇷🇴</span> RO
            </button>
          </div>

          <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: 'var(--secondary-color)', fontSize: '0.95rem' }}>{customerName}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Client ID: <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{customerID || 'External'}</span>
                <span style={{ margin: '0 8px' }}>•</span>
                <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 600 }}>{t('logout')}</button>
              </div>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--kraft-accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              B2B
            </div>
          </div>
        </div>
      </header>

      {/* Workspace Area */}
      <div className="content-wrapper" style={{ flex: 1, padding: '30px', overflowY: 'auto', backgroundColor: 'var(--bg-color)' }}>
        
        {/* VIEW 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* Top Row: Customer Info & Financial Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '20px' }}>
              
              {/* Profile Card */}
              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', right: '-20px', bottom: '-20px', width: '120px', height: '120px', background: 'var(--kraft-accent-light)', borderRadius: '50%', zIndex: 0 }} />
                <h4 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.1rem', zIndex: 1 }}>{t('customer_profile')}</h4>
                {customer ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', color: '#4b5563', zIndex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--secondary-color)', fontSize: '1.05rem' }}>{customer.name}</div>
                    <div>📍 {customer.address}, {customer.city}, {customer.county}</div>
                    <div>📞 {customer.phone || 'N/A'}</div>
                    <div>✉️ {customer.email || customerEmail}</div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('no_profile_synced')}</div>
                )}
              </div>

              {/* Credit Limit & Terms */}
              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <h4 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.1rem' }}>{t('credit_status')}</h4>
                {customer ? (
                  <div style={{ margin: '15px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('approved_credit_limit')}</span>
                      <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
                        {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(customer.credit_limit || 0)}
                      </span>
                    </div>
                    {/* Visual Progress bar */}
                    <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--accent-color)' }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ height: '50px' }} />
                )}
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {t('payment_terms')}: <span style={{ fontWeight: 700, color: 'var(--secondary-color)' }}>{customer?.payment_terms_code ? customer.payment_terms_code : t('immediate_payment')}</span>
                </div>
              </div>

              {/* Quick Actions / Quote summary */}
              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid var(--kraft-accent)' }}>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.1rem' }}>{t('quotes_pipeline_lbl')}</h4>
                  <div style={{ display: 'flex', gap: '30px', marginTop: '20px' }}>
                    <div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-color)' }}>{quotes.length}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('total_quotes_lbl')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                        {quotes.filter(q => q.status === 'Approved').length}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('approved_offers_lbl')}</div>
                    </div>
                  </div>
                </div>
                <button 
                  className="btn-primary" 
                  style={{ width: '100%', background: 'var(--primary-color)' }}
                  onClick={() => setActiveTab('configurator')}
                >
                  {t('request_new_box_design')}
                </button>
              </div>

            </div>

            {/* Bottom Row: Production Status (DWH) & Recent Quotes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '30px' }}>
              
              {/* DWH Production jobs */}
              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.1rem' }}>{t('live_production_stream')}</h4>
                  <span style={{ fontSize: '0.75rem', color: 'white', padding: '3px 8px', borderRadius: '12px', background: 'var(--primary-color)', fontWeight: 600 }}>{t('active_ssi02_sequences')}</span>
                </div>

                {jobs.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                    <span>{t('no_active_jobs_erp')}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', maxHeight: '350px' }}>
                    {jobs.map(j => {
                      const pct = j.quantity_ordered > 0 ? Math.min(100, (j.quantity_produced / j.quantity_ordered) * 100) : 0;
                      return (
                        <div key={j.nr_crt} style={{ padding: '15px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#fcfcfc' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--secondary-color)' }}>{j.product_name}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: j.status === 2 ? '#e2fbe8' : j.status === 1 ? '#e0f2fe' : '#fef3c7', color: j.status === 2 ? '#15803d' : j.status === 1 ? '#0369a1' : '#b45309' }}>
                              {getJobStatusString(j.status)}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span>{t('order_ref')}: {j.order_number}</span>
                            <span>{t('machine')}: <span style={{ fontWeight: 600, color: 'var(--secondary-color)' }}>{j.machine_code}</span></span>
                            <span>{t('sched')}: {new Date(j.scheduled_date).toLocaleDateString('ro-RO')}</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '5px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                              <span>{t('production_progress')}</span>
                              <span>{new Intl.NumberFormat('ro-RO').format(Math.round(j.quantity_produced))} / {new Intl.NumberFormat('ro-RO').format(j.quantity_ordered)} {t('units')}</span>
                            </div>
                            <div style={{ height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: j.status === 2 ? 'var(--accent-color)' : '#0284c7', transition: 'width 0.5s ease' }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Quotes */}
              <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h4 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.1rem' }}>{t('recent_offers')}</h4>
                {quotes.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                    <span>{t('no_historical_quotes_found')}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {quotes.slice(0, 5).map(q => (
                      <div key={q.id} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fcfcfc' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--secondary-color)' }}>{t('quote_num')} #{q.id}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{new Date(q.created_at).toLocaleDateString('ro-RO')}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '0.92rem' }}>
                              {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(q.total_amount)}
                            </div>
                            <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: getStatusColor(q.status) + '1a', color: getStatusColor(q.status), fontWeight: 700 }}>
                              {getStatusTranslation(q.status)}
                            </span>
                          </div>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '6px 10px', fontSize: '0.8rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}
                            onClick={() => handleViewQuoteDetails(q.id)}
                          >
                            {t('view_action')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* VIEW 2: CONFIGURATOR */}
        {activeTab === 'configurator' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '30px', alignItems: 'stretch' }}>
            
            {/* Box configuration params */}
            <div className="card" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                {t('custom_packaging_design')}
              </h3>

              {/* FEFCO Style */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('fefco_code_standard')}</label>
                <select 
                  value={config.fefco_code} 
                  onChange={e => setConfig({ ...config, fefco_code: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginTop: '6px' }}
                >
                  <option value="201">{t('fefco_201_desc')}</option>
                  <option value="200">{t('fefco_200_desc')}</option>
                  <option value="301">{t('fefco_301_desc')}</option>
                </select>
              </div>

              {/* Box Dimensions */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('length_mm')}</label>
                  <input 
                    type="number" 
                    value={config.length} 
                    onChange={e => setConfig({ ...config, length: Math.max(50, Number(e.target.value)) })}
                    style={{ width: '100%', padding: '10px', marginTop: '6px' }} 
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('width_mm')}</label>
                  <input 
                    type="number" 
                    value={config.width} 
                    onChange={e => setConfig({ ...config, width: Math.max(50, Number(e.target.value)) })}
                    style={{ width: '100%', padding: '10px', marginTop: '6px' }} 
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('height_mm')}</label>
                  <input 
                    type="number" 
                    value={config.height} 
                    onChange={e => setConfig({ ...config, height: Math.max(50, Number(e.target.value)) })}
                    style={{ width: '100%', padding: '10px', marginTop: '6px' }} 
                  />
                </div>
              </div>

              {/* Material and Quantity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('material_grade')}</label>
                  <select 
                    value={config.material} 
                    onChange={e => setConfig({ ...config, material: e.target.value })}
                    style={{ width: '100%', padding: '10px', marginTop: '6px' }}
                  >
                    <option value="Testliner">{t('testliner_desc')}</option>
                    <option value="Schrenz">{t('schrenz_desc')}</option>
                    <option value="Wellenstoff">{t('wellenstoff_desc')}</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('order_quantity_units')}</label>
                  <input 
                    type="number" 
                    value={config.quantity} 
                    onChange={e => setConfig({ ...config, quantity: Math.max(1, Number(e.target.value)) })}
                    style={{ width: '100%', padding: '10px', marginTop: '6px' }} 
                  />
                </div>
              </div>

              {/* Finishing checklist */}
              <div style={{ backgroundColor: 'var(--bg-color)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--secondary-color)', fontWeight: 700 }}>{t('additional_operations')}</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={config.printing} onChange={e => setConfig({ ...config, printing: e.target.checked })} /> {t('flexographic_print')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={config.dieCutting} onChange={e => setConfig({ ...config, dieCutting: e.target.checked })} /> {t('rotary_die_cut')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={config.gluing} onChange={e => setConfig({ ...config, gluing: e.target.checked })} /> {t('inline_folder_gluer')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={config.stapling} onChange={e => setConfig({ ...config, stapling: e.target.checked })} /> {t('stitcher_stapling')}
                  </label>
                </div>
              </div>

              {/* Print Personalization Section (shown only when printing checked) */}
              {config.printing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '15px', border: '1px solid var(--kraft-accent-light)', backgroundColor: 'var(--kraft-bg)', borderRadius: '6px' }}>
                  <h5 style={{ margin: 0, color: '#8a6d3b', fontSize: '0.85rem' }}>{t('ink_brand_personalization')}</h5>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: '#8a6d3b' }}>{t('printed_text_logo')}</label>
                    <input type="text" value={printText} onChange={e => setPrintText(e.target.value)} style={{ width: '100%', padding: '6px', marginTop: '4px' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '15px' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#8a6d3b' }}>{t('ink_color_pantone')}</label>
                      <input type="color" value={printColor} onChange={e => setPrintColor(e.target.value)} style={{ width: '100%', height: '34px', padding: '2px', border: '1px solid #ccc', borderRadius: '4px', marginTop: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#8a6d3b' }}>{t('print_coverage_area')}</label>
                      <select value={printCoverage} onChange={e => setPrintCoverage(e.target.value)} style={{ width: '100%', padding: '6px', marginTop: '4px' }}>
                        <option value="front">{t('front_panel_only')}</option>
                        <option value="front-back">{t('front_back_panels')}</option>
                        <option value="all">{t('full_exterior_cover')}</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: '#2f3542' }}>
                      <input type="checkbox" checked={printSymbols.recycling} onChange={e => setPrintSymbols({ ...printSymbols, recycling: e.target.checked })} /> {t('recycling_logo_lbl')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: '#2f3542' }}>
                      <input type="checkbox" checked={printSymbols.fragile} onChange={e => setPrintSymbols({ ...printSymbols, fragile: e.target.checked })} /> {t('fragile_logo_lbl')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: '#2f3542' }}>
                      <input type="checkbox" checked={printSymbols.upArrows} onChange={e => setPrintSymbols({ ...printSymbols, upArrows: e.target.checked })} /> {t('up_arrows_lbl')}
                    </label>
                  </div>
                </div>
              )}

              {/* Price Calculation results card */}
              {priceResult && (
                <div style={{ borderTop: '2px solid var(--border-color)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <span>{t('est_unit_price')}</span>
                    <span style={{ fontWeight: 600 }}>{new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', minimumFractionDigits: 4 }).format(priceResult.unitPrice)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary-color)' }}>
                    <span>{t('est_total')}</span>
                    <span>{new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(priceResult.finalPrice)}</span>
                  </div>
                </div>
              )}

              <button 
                className="btn-primary" 
                onClick={handleCreateB2BQuote} 
                disabled={submittingQuote}
                style={{ background: 'var(--accent-color)', width: '100%', marginTop: '10px' }}
              >
                {submittingQuote ? t('sending_request') : t('request_official_b2b_quote')}
              </button>

            </div>

            {/* 3D Preview Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card" style={{ flex: 1, overflow: 'hidden', minHeight: '450px', background: '#fcfcfc', border: '1px solid var(--border-color)', position: 'relative' }}>
                <BoxConfigurator3D 
                  length={config.length / 100} 
                  width={config.width / 100} 
                  height={config.height / 100} 
                  material={config.material}
                  printing={config.printing}
                  dieCutting={config.dieCutting}
                  gluing={config.gluing}
                  stapling={config.stapling}
                  foldPercent={foldPercent}
                  fefcoCode={config.fefco_code}
                  printColor={printColor}
                  printText={printText}
                  hasRecycling={printSymbols.recycling}
                  hasFragile={printSymbols.fragile}
                  hasUpArrows={printSymbols.upArrows}
                  printCoverage={printCoverage}
                />
              </div>

              {/* Fold presets below viewer */}
              <div className="card" style={{ padding: '15px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--secondary-color)' }}>{t('crease_fold_controller')}</span>
                  <span style={{ fontSize: '0.8rem', backgroundColor: 'var(--primary-color)', color: 'white', padding: '1px 6px', borderRadius: '4px' }}>{t('percent_folded_lower', { count: Math.round(foldPercent * 100) })}</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={foldPercent} 
                  onChange={e => setFoldPercent(Number(e.target.value))}
                  style={{ width: '100%', marginBottom: '15px' }}
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button onClick={() => setFoldPercent(0)} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.8rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}>{t('flat_sheet_0')}</button>
                  <button onClick={() => setFoldPercent(0.5)} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.8rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}>{t('half_open_50')}</button>
                  <button onClick={() => setFoldPercent(1.0)} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.8rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}>{t('closed_box_100')}</button>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* VIEW 3: QUOTE HISTORY LIST */}
        {activeTab === 'orders' && (
          <div className="card" style={{ padding: '30px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)', fontSize: '1.2rem' }}>{t('historical_b2b_quotes')}</h3>
            
            {quotes.length === 0 ? (
              <div style={{ padding: '40px', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                {t('no_quotes_found_account')}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '12px 8px' }}>{t('quote_id')}</th>
                    <th style={{ padding: '12px 8px' }}>{t('creation_date')}</th>
                    <th style={{ padding: '12px 8px' }}>{t('updated_date')}</th>
                    <th style={{ padding: '12px 8px' }}>{t('total_amount')}</th>
                    <th style={{ padding: '12px 8px' }}>{t('status')}</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map(q => (
                    <tr key={q.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem', color: 'var(--secondary-color)' }}>
                      <td style={{ padding: '15px 8px', fontWeight: 700 }}>#{q.id}</td>
                      <td style={{ padding: '15px 8px' }}>{new Date(q.created_at).toLocaleDateString('ro-RO')}</td>
                      <td style={{ padding: '15px 8px' }}>{new Date(q.updated_at).toLocaleDateString('ro-RO')}</td>
                      <td style={{ padding: '15px 8px', fontWeight: 700, color: 'var(--primary-color)' }}>
                        {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(q.total_amount)}
                      </td>
                      <td style={{ padding: '15px 8px' }}>
                        <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', backgroundColor: getStatusColor(q.status) + '1a', color: getStatusColor(q.status), fontWeight: 700 }}>
                          {getStatusTranslation(q.status)}
                        </span>
                      </td>
                      <td style={{ padding: '15px 8px', textAlign: 'right' }}>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '5px 12px', fontSize: '0.8rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}
                          onClick={() => handleViewQuoteDetails(q.id)}
                        >
                          {t('view_details')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>

      {/* Quote Details Modal */}
      {viewingQuoteDetails && selectedQuote && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '650px', display: 'flex', flexDirection: 'column', maxHeight: '80vh', padding: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: 'var(--secondary-color)' }}>{t('quote_details_num', { id: selectedQuote.id })}</h3>
              <button onClick={() => setViewingQuoteDetails(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '0.9rem', backgroundColor: 'var(--bg-color)', padding: '15px', borderRadius: '6px' }}>
                <div><strong>{t('status')}:</strong> <span style={{ color: getStatusColor(selectedQuote.status), fontWeight: 700 }}>{getStatusTranslation(selectedQuote.status)}</span></div>
                <div><strong>{t('total_amount_label')}</strong> <span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>{new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(selectedQuote.total_amount)}</span></div>
                <div><strong>{t('created_at_label')}</strong> {new Date(selectedQuote.created_at).toLocaleString('ro-RO')}</div>
                <div><strong>{t('last_update_label')}</strong> {new Date(selectedQuote.updated_at).toLocaleString('ro-RO')}</div>
              </div>

              <h4 style={{ margin: '15px 0 5px 0', fontSize: '1rem', color: 'var(--secondary-color)' }}>{t('line_items')}</h4>
              {selectedQuote.items && selectedQuote.items.map((item, idx) => (
                <div key={idx} style={{ padding: '15px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.92rem' }}>
                    <span>{item.description}</span>
                    <span>{new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(item.quantity * item.unit_price)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>{t('quantity')}: {item.quantity} {t('units')}</span>
                    <span>{t('unit_price')}: {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', minimumFractionDigits: 4 }).format(item.unit_price)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
              <button className="btn-primary" onClick={() => setViewingQuoteDetails(false)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ExternalB2B;
