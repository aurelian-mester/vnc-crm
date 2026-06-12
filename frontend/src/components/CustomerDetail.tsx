import React, { useEffect, useState } from 'react';
import QuoteModal from './QuoteModal';
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
  registration_no: string;
  vat_registration_no: string;
  payment_terms_code: string;
  salesperson_code: string;
  customer_price_group: string;
  credit_limit: number;
  blocked: string;
  post_code: string;
  commerce_trade_no: string;
  total_quantity_tons: number;
  main_competitor: string;
  main_competitor_volume: number;
  potential: string;
  cardboard_utilization_category: string;
}

interface CustomerDetailProps {
  customer: Customer;
  onBack: () => void;
}

const CustomerDetail: React.FC<CustomerDetailProps> = ({ customer, onBack }) => {
  const isBlocked = customer.blocked && customer.blocked.trim() !== "" && customer.blocked.trim() !== "0" && customer.blocked.toLowerCase() !== "false";
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'metrics' | 'claims'>('profile');
  const [metrics, setMetrics] = useState<any>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<'1m' | '2m' | '3m' | '6m' | '12m'>('12m');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [customerClaims, setCustomerClaims] = useState<any[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (activeTab === 'metrics' && !metrics && !loadingMetrics) {
      setLoadingMetrics(true);
      const token = localStorage.getItem('vnc_token');
      fetch(`/vnc-crm/api/customers/${customer.id}/metrics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
        .then(data => {
          setMetrics(data);
          setLoadingMetrics(false);
        })
        .catch(err => {
          console.error('Failed to fetch metrics', err);
          setLoadingMetrics(false);
        });
    }
  }, [activeTab, customer.id, metrics, loadingMetrics]);

  const fetchCustomerQuotes = () => {
    setLoadingQuotes(true);
    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/customers/${customer.id}/quotes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => {
        setQuotes(data || []);
        setLoadingQuotes(false);
      })
      .catch(err => {
        console.error('Failed to fetch customer quotes', err);
        setLoadingQuotes(false);
      });
  };

  useEffect(() => {
    fetchCustomerQuotes();
    setCustomerClaims([]);
  }, [customer.id]);

  useEffect(() => {
    if (activeTab === 'claims' && customerClaims.length === 0 && !loadingClaims) {
      setLoadingClaims(true);
      const token = localStorage.getItem('vnc_token');
      fetch('/vnc-crm/api/claims', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
        .then(data => {
          const filtered = (data || []).filter((c: any) => c.customer_id === customer.id);
          setCustomerClaims(filtered);
          setLoadingClaims(false);
        })
        .catch(err => {
          console.error('Failed to load customer claims', err);
          setLoadingClaims(false);
        });
    }
  }, [activeTab, customer.id, customerClaims, loadingClaims]);

  const getStatusTranslation = (statusStr: string) => {
    switch (statusStr.toLowerCase()) {
      case 'approved': return t('approved');
      case 'sent': return t('sent');
      case 'declined': return t('declined');
      default: return t('draft');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      {/* Top action header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <button 
            className="btn-primary" 
            onClick={onBack}
            style={{ 
              background: 'none', 
              color: 'var(--primary-color)', 
              border: '1px solid var(--primary-color)', 
              boxShadow: 'none',
              padding: '8px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              borderRadius: '6px',
              fontWeight: 600
            }}
          >
            {t('back_to_directory')}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-primary" onClick={() => setIsQuoteModalOpen(true)} style={{ padding: '8px 18px', borderRadius: '6px', cursor: 'pointer' }}>{t('create_new_quote')}</button>
          <button 
            className="btn-primary" 
            style={{ 
              background: 'none', 
              color: 'var(--text-muted)', 
              border: '1px solid var(--border-color)', 
              boxShadow: 'none',
              padding: '8px 18px',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {t('edit_profile')}
          </button>
        </div>
      </div>

      {/* Tab Selector */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color, #e4e7ed)', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('profile')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'profile' ? '3px solid var(--primary-color)' : '3px solid transparent',
            color: activeTab === 'profile' ? 'var(--primary-color)' : 'var(--text-muted)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.95rem',
            transition: 'all 0.2s'
          }}
        >
          {t('profile_details')}
        </button>
        <button
          onClick={() => setActiveTab('metrics')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'metrics' ? '3px solid var(--primary-color)' : '3px solid transparent',
            color: activeTab === 'metrics' ? 'var(--primary-color)' : 'var(--text-muted)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.95rem',
            transition: 'all 0.2s'
          }}
        >
          {t('performance_metrics')}
        </button>
        <button
          onClick={() => setActiveTab('claims')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'claims' ? '3px solid var(--primary-color)' : '3px solid transparent',
            color: activeTab === 'claims' ? 'var(--primary-color)' : 'var(--text-muted)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.95rem',
            transition: 'all 0.2s'
          }}
        >
          {t('qa_claims')}
        </button>
      </div>

      {activeTab === 'profile' ? (
        /* Main profile layout grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px', alignItems: 'start' }}>
          
          {/* Card: Summary and Contact Info */}
          <div className="card" style={{ padding: '25px', backgroundColor: 'var(--white)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div 
                style={{ 
                  width: '80px', 
                  height: '80px', 
                  borderRadius: '50%', 
                  backgroundColor: 'var(--kraft-accent-light, #fdf6ec)', 
                  color: 'var(--kraft-accent, #e6a23c)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '2rem', 
                  fontWeight: 700,
                  margin: '0 auto 15px auto',
                  border: '2px dashed var(--kraft-accent, #e6a23c)'
                }}
              >
                {customer.name.slice(0, 2).toUpperCase()}
              </div>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '1.3rem', color: 'var(--secondary-color, #1f2d3d)' }}>{customer.name}</h3>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-color, #f5f7fa)', padding: '4px 12px', borderRadius: '20px', fontWeight: 600 }}>
                  {t('code')}: {customer.id}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#1890ff', backgroundColor: '#e6f7ff', padding: '4px 12px', borderRadius: '20px', fontWeight: 600 }}>
                  Agent: {customer.salesperson_code || t('unassigned')}
                </span>
                {isBlocked && (
                  <span style={{ fontSize: '0.8rem', color: '#ff4d4f', backgroundColor: '#fff2f0', padding: '4px 12px', borderRadius: '20px', fontWeight: 600 }}>
                    {t('blocked_upper', { reason: customer.blocked })}
                  </span>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color, #e4e7ed)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h4 style={{ margin: '0 0 5px 0', color: 'var(--primary-color)', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('contact_information')}</h4>
              
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>{t('contact_person')}</label>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{customer.contact || t('no_contact_registered')}</span>
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>{t('phone_number')}</label>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{customer.phone || t('no_phone_registered')}</span>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>{t('email_address')}</label>
                <span style={{ fontSize: '0.9rem', fontWeight: 500, wordBreak: 'break-word' }}>{customer.email || t('no_email_registered')}</span>
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>{t('billing_address')}</label>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  {customer.address ? `${customer.address}, ` : ''}{customer.city || ''}{customer.post_code ? ` (${customer.post_code})` : ''}{customer.county ? `, ${customer.county}` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Column 2: Financials & Cardboard Volume Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            {/* Card: Financial Profile */}
            <div className="card" style={{ padding: '20px 25px' }}>
              <h4 style={{ margin: '0 0 15px 0', color: 'var(--secondary-color)', fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                {t('financial_credit_profile')}
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t('credit_limit')}</label>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary-color)' }}>
                    {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(customer.credit_limit || 0)}
                  </span>
                </div>
                
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t('payment_terms')}</label>
                  <span style={{ fontSize: '1.2rem', fontWeight: 600, color: '#2f3542' }}>
                    {customer.payment_terms_code || t('immediate_payment')}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t('fiscal_reg_no')}</label>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: '#2f3542' }}>
                    {customer.registration_no || '-'}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t('trade_registry')}</label>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: '#2f3542' }}>
                    {customer.commerce_trade_no || '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card: Cardboard & Volume Statistics */}
            <div className="card" style={{ padding: '20px 25px', backgroundColor: 'var(--kraft-bg, #fdfaf7)', border: '1px solid var(--kraft-accent-light, #fbf2e3)' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#8a6d3b', fontSize: '1rem', borderBottom: '1px solid var(--kraft-accent-light, #fbf2e3)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {t('cardboard_business_metrics')}
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#8a6d3b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t('annual_quantity_tons')}</label>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--kraft-accent, #d9534f)' }}>
                    {customer.total_quantity_tons ? `${customer.total_quantity_tons.toLocaleString('ro-RO')} tons` : '0 tons'}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#8a6d3b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t('potential_category')}</label>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#2f3542', display: 'inline-block', backgroundColor: '#fcf8e3', border: '1px solid #faebcc', padding: '2px 8px', borderRadius: '4px' }}>
                    {customer.potential || 'N/A'}
                  </span>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.75rem', color: '#8a6d3b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{t('cardboard_utilization_profile')}</label>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: '#2f3542' }}>
                    {customer.cardboard_utilization_category || t('no_utilization_mapped')}
                  </span>
                </div>
              </div>
            </div>

            {/* List of Recent Quotes */}
            <div className="card" style={{ padding: '20px 25px' }}>
              <h4 style={{ margin: '0 0 15px 0', color: 'var(--secondary-color)', fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                {t('recent_quotes_status')}
              </h4>
              
              {loadingQuotes ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('loading')}</div>
              ) : quotes.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('no_quotes_registered')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {quotes.slice(0, 4).map(q => (
                    <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f9f9f9', paddingBottom: '8px' }}>
                      <div>
                        <strong style={{ color: 'var(--primary-color)' }}>{t('quote_num')} #{q.id}</strong>
                        <span style={{ 
                          marginLeft: '10px', 
                          fontSize: '0.75rem', 
                          padding: '2px 8px', 
                          borderRadius: '12px', 
                          fontWeight: 600,
                          backgroundColor: q.status === 'Approved' ? '#f6ffed' : q.status === 'Sent' ? '#e6f7ff' : '#fffbe6',
                          color: q.status === 'Approved' ? '#52c41a' : q.status === 'Sent' ? '#1890ff' : '#faad14'
                        }}>
                          {getStatusTranslation(q.status)}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {t('created')}: {new Date(q.created_at).toLocaleDateString('ro-RO')}
                        </div>
                      </div>
                      <strong style={{ color: 'var(--secondary-color)' }}>
                        {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(q.total_amount)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      ) : activeTab === 'metrics' ? (
        /* Performance Metrics Dashboard Layout */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Interval Selector Pills */}
          <div className="card" style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
            <span style={{ fontWeight: 600, color: 'var(--secondary-color)', fontSize: '0.95rem' }}>{t('select_historical_period')}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['1m', '2m', '3m', '6m', '12m'] as const).map(interval => (
                <button
                  key={interval}
                  onClick={() => setSelectedInterval(interval)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--border-color, #e4e7ed)',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    backgroundColor: selectedInterval === interval ? 'var(--primary-color)' : 'white',
                    color: selectedInterval === interval ? 'white' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                    boxShadow: selectedInterval === interval ? '0 4px 6px rgba(0, 74, 153, 0.15)' : 'none'
                  }}
                >
                  {interval === '1m' ? 'Last 1 Month' :
                   interval === '2m' ? 'Last 2 Months' :
                   interval === '3m' ? 'Last 3 Months' :
                   interval === '6m' ? 'Last 6 Months' : 'Last 12 Months'}
                </button>
              ))}
            </div>
          </div>

          {loadingMetrics ? (
            <div className="card" style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {t('fetching_erp_history')}
            </div>
          ) : !metrics ? (
            <div className="card" style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)' }}>
              {t('failed_load_metrics')}
            </div>
          ) : (() => {
            const getIntervalData = (src: any) => {
              if (!src) return { val: 0, qty: 0, kg: 0 };
              switch (selectedInterval) {
                case '1m': return { val: src.val_1m, qty: src.qty_1m, kg: src.kg_1m };
                case '2m': return { val: src.val_2m, qty: src.qty_2m, kg: src.kg_2m };
                case '3m': return { val: src.val_3m, qty: src.qty_3m, kg: src.kg_3m };
                case '6m': return { val: src.val_6m, qty: src.qty_6m, kg: src.kg_6m };
                case '12m':
                default: return { val: src.val_12m, qty: src.qty_12m, kg: src.kg_12m };
              }
            };

            const invData = getIntervalData(metrics.invoices);
            const ordData = getIntervalData(metrics.orders);

            const gapVal = invData.val - ordData.val;
            const gapQty = invData.qty - ordData.qty;
            const gapKg = invData.kg - ordData.kg;

            return (
              <>
                {/* KPI Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                  
                  {/* Card 1: Posted Invoices (Revenue) */}
                  <div className="card" style={{ padding: '20px 25px', borderLeft: '4px solid #52c41a', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#52c41a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('posted_sales_invoices')}</span>
                      <h3 style={{ margin: '5px 0 0 0', fontSize: '1.6rem', color: 'var(--secondary-color)' }}>
                        {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(invData.val)}
                      </h3>
                    </div>
                    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>{t('total_pieces')}</span>
                        <strong style={{ color: '#2f3542' }}>{invData.qty.toLocaleString('ro-RO')} pcs</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>{t('total_weight')}</span>
                        <strong style={{ color: '#2f3542' }}>{invData.kg.toLocaleString('ro-RO', { maximumFractionDigits: 0 })} kg</strong>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Sales Orders (Pipeline) */}
                  <div className="card" style={{ padding: '20px 25px', borderLeft: '4px solid #1890ff', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1890ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('active_sales_orders')}</span>
                      <h3 style={{ margin: '5px 0 0 0', fontSize: '1.6rem', color: 'var(--secondary-color)' }}>
                        {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(ordData.val)}
                      </h3>
                    </div>
                    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>{t('ordered_pieces')}</span>
                        <strong style={{ color: '#2f3542' }}>{ordData.qty.toLocaleString('ro-RO')} pcs</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>{t('ordered_weight')}</span>
                        <strong style={{ color: '#2f3542' }}>{ordData.kg.toLocaleString('ro-RO', { maximumFractionDigits: 0 })} kg</strong>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Gap Compare */}
                  <div className="card" style={{ 
                    padding: '20px 25px', 
                    borderLeft: `4px solid ${gapVal >= 0 ? '#faad14' : '#ff4d4f'}`, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '15px',
                    backgroundColor: gapVal >= 0 ? 'rgba(250, 173, 20, 0.02)' : 'rgba(255, 77, 79, 0.02)'
                  }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: gapVal >= 0 ? '#faad14' : '#ff4d4f', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {t('gap_invoiced_ordered')}
                      </span>
                      <h3 style={{ margin: '5px 0 0 0', fontSize: '1.6rem', color: gapVal >= 0 ? '#fa8c16' : '#cf1322' }}>
                        {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', signDisplay: 'always' }).format(gapVal)}
                      </h3>
                    </div>
                    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>{t('pieces_gap')}</span>
                        <strong style={{ color: '#2f3542' }}>{gapQty.toLocaleString('ro-RO', { signDisplay: 'always' })} pcs</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>{t('weight_gap')}</span>
                        <strong style={{ color: '#2f3542' }}>{gapKg.toLocaleString('ro-RO', { maximumFractionDigits: 0, signDisplay: 'always' })} kg</strong>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Main comparison breakdown table */}
                <div className="card" style={{ padding: '25px' }}>
                  <h4 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)', fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    {t('detailed_comparison')}
                  </h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #f0f0f0', color: 'var(--text-muted)', fontWeight: 600 }}>
                          <th style={{ padding: '12px 15px' }}>{t('metric_lbl')}</th>
                          <th style={{ padding: '12px 15px' }}>{t('invoiced_posted_lbl')}</th>
                          <th style={{ padding: '12px 15px' }}>{t('ordered_pipeline_lbl')}</th>
                          <th style={{ padding: '12px 15px' }}>{t('gap_difference_lbl')}</th>
                          <th style={{ padding: '12px 15px' }}>{t('fulfillment_ratio_lbl')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '12px 15px', fontWeight: 600 }}>{t('sales_value_ron')}</td>
                          <td style={{ padding: '12px 15px', color: '#2e7d32', fontWeight: 600 }}>
                            {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(invData.val)}
                          </td>
                          <td style={{ padding: '12px 15px', color: '#1565c0', fontWeight: 600 }}>
                            {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(ordData.val)}
                          </td>
                          <td style={{ padding: '12px 15px', fontWeight: 600, color: gapVal >= 0 ? '#fa8c16' : '#d32f2f' }}>
                            {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', signDisplay: 'always' }).format(gapVal)}
                          </td>
                          <td style={{ padding: '12px 15px', fontWeight: 600 }}>
                            {ordData.val > 0 ? `${Math.round((invData.val / ordData.val) * 100)}%` : '-'}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '12px 15px', fontWeight: 600 }}>{t('quantity_pieces')}</td>
                          <td style={{ padding: '12px 15px' }}>{invData.qty.toLocaleString('ro-RO')} pcs</td>
                          <td style={{ padding: '12px 15px' }}>{ordData.qty.toLocaleString('ro-RO')} pcs</td>
                          <td style={{ padding: '12px 15px', color: gapQty >= 0 ? '#fa8c16' : '#d32f2f', fontWeight: 600 }}>
                            {gapQty.toLocaleString('ro-RO', { signDisplay: 'always' })} pcs
                          </td>
                          <td style={{ padding: '12px 15px', fontWeight: 600 }}>
                            {ordData.qty > 0 ? `${Math.round((invData.qty / ordData.qty) * 100)}%` : '-'}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '12px 15px', fontWeight: 600 }}>{t('volume_kg')}</td>
                          <td style={{ padding: '12px 15px' }}>{invData.kg.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} kg</td>
                          <td style={{ padding: '12px 15px' }}>{ordData.kg.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} kg</td>
                          <td style={{ padding: '12px 15px', color: gapKg >= 0 ? '#fa8c16' : '#d32f2f', fontWeight: 600 }}>
                            {gapKg.toLocaleString('ro-RO', { maximumFractionDigits: 1, signDisplay: 'always' })} kg
                          </td>
                          <td style={{ padding: '12px 15px', fontWeight: 600 }}>
                            {ordData.kg > 0 ? `${Math.round((invData.kg / ordData.kg) * 100)}%` : '-'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cardboard Grades ordered breakdown progress table */}
                <div className="card" style={{ padding: '25px' }}>
                  <h4 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)', fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    {t('top_grades_ordered')}
                  </h4>
                  {metrics.grades.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                      {t('no_grades_found')}
                    </div>
                  ) : (() => {
                    const maxVal = Math.max(...metrics.grades.map((g: any) => g.total_value), 1);
                    return (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #f0f0f0', color: 'var(--text-muted)', fontWeight: 600 }}>
                              <th style={{ padding: '12px 15px', width: '20%' }}>{t('grade_lbl')}</th>
                              <th style={{ padding: '12px 15px', width: '35%' }}>{t('value_share_lbl')}</th>
                              <th style={{ padding: '12px 15px', width: '20%' }}>{t('total_pieces_lbl')}</th>
                              <th style={{ padding: '12px 15px', width: '25%' }}>{t('total_weight_lbl')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {metrics.grades.map((grade: any, idx: number) => {
                              const pct = Math.round((grade.total_value / maxVal) * 100);
                              return (
                                <tr key={grade.board_grade || idx} style={{ borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }}>
                                  <td style={{ padding: '12px 15px', fontWeight: 700, color: 'var(--primary-color)' }}>{grade.board_grade}</td>
                                  <td style={{ padding: '12px 15px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                      <span style={{ fontWeight: 600, width: '90px' }}>
                                        {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(grade.total_value)}
                                      </span>
                                      <div style={{ flex: 1, height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--primary-color)', borderRadius: '4px', transition: 'width 0.3s' }} />
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: '12px 15px' }}>{grade.total_qty.toLocaleString('ro-RO')} pcs</td>
                                  <td style={{ padding: '12px 15px', fontWeight: 500 }}>{grade.total_kg.toLocaleString('ro-RO', { maximumFractionDigits: 0 })} kg</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                {/* Item Production Cost History Card */}
                <div className="card" style={{ padding: '25px' }}>
                  <h4 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)', fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {t('item_production_cost_history')}
                  </h4>
                  {!metrics.item_costs || metrics.item_costs.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                      {t('no_items_cost_found')}
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #f0f0f0', color: 'var(--text-muted)', fontWeight: 600 }}>
                            <th style={{ padding: '12px 15px', width: '15%' }}>{t('item_no_lbl')}</th>
                            <th style={{ padding: '12px 15px', width: '40%' }}>{t('description_lbl')}</th>
                            <th style={{ padding: '12px 15px', width: '20%' }}>{t('last_production_cost_lbl')}</th>
                            <th style={{ padding: '12px 15px', width: '15%' }}>{t('last_month_lbl')}</th>
                            <th style={{ padding: '12px 15px', width: '10%' }}>{t('actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.item_costs.map((item: any, idx: number) => {
                            const isExpanded = expandedItem === item.item_no;
                            return (
                              <React.Fragment key={item.item_no || idx}>
                                <tr 
                                  style={{ 
                                    borderBottom: isExpanded ? 'none' : '1px solid #f0f0f0', 
                                    verticalAlign: 'middle', 
                                    cursor: 'pointer',
                                    backgroundColor: isExpanded ? 'rgba(0, 74, 153, 0.02)' : 'transparent',
                                    transition: 'background-color 0.2s'
                                  }}
                                  onClick={() => setExpandedItem(isExpanded ? null : item.item_no)}
                                >
                                  <td style={{ padding: '12px 15px', fontWeight: 700, color: 'var(--primary-color)' }}>{item.item_no}</td>
                                  <td style={{ padding: '12px 15px' }}>{item.description}</td>
                                  <td style={{ padding: '12px 15px', fontWeight: 600, color: item.last_cost > 0 ? 'var(--secondary-color)' : 'var(--text-muted)' }}>
                                    {item.last_cost > 0 
                                      ? new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(item.last_cost)
                                      : 'N/A'}
                                  </td>
                                  <td style={{ padding: '12px 15px' }}>
                                    {item.last_cost_date ? (
                                      <span style={{ 
                                        padding: '4px 8px', 
                                        backgroundColor: 'var(--kraft-bg, #fdfaf7)', 
                                        border: '1px solid var(--kraft-accent-light, #fbf2e3)', 
                                        borderRadius: '4px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600
                                      }}>
                                        {item.last_cost_date}
                                      </span>
                                    ) : '-'}
                                  </td>
                                  <td style={{ padding: '12px 15px' }}>
                                    <button 
                                      style={{
                                        padding: '4px 8px',
                                        backgroundColor: 'transparent',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                        color: 'var(--primary-color)',
                                        fontWeight: 600
                                      }}
                                    >
                                      {isExpanded ? t('hide') : t('history_action')}
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr style={{ backgroundColor: 'rgba(0, 74, 153, 0.02)' }}>
                                    <td colSpan={5} style={{ padding: '0 25px 15px 25px' }}>
                                      <div style={{ 
                                        padding: '15px', 
                                        backgroundColor: 'white', 
                                        borderRadius: '6px', 
                                        border: '1px solid var(--border-color)',
                                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                                      }}>
                                        <h5 style={{ margin: '0 0 10px 0', color: 'var(--secondary-color)', fontSize: '0.85rem' }}>
                                          {t('monthly_cost_history')}
                                        </h5>
                                        {!item.history || item.history.length === 0 ? (
                                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('no_historical_data')}</span>
                                        ) : (
                                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            {item.history.map((h: any, hIdx: number) => (
                                              <div 
                                                key={hIdx}
                                                style={{ 
                                                  display: 'flex', 
                                                  flexDirection: 'column', 
                                                  alignItems: 'center', 
                                                  padding: '6px 10px', 
                                                  backgroundColor: 'var(--bg-color, #f8f9fa)', 
                                                  border: '1px solid var(--border-color)', 
                                                  borderRadius: '4px',
                                                  minWidth: '70px'
                                                }}
                                              >
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{h.month}</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--secondary-color)' }}>
                                                  {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 2 }).format(h.cost)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            );
          })()}

        </div>
      ) : (
        <div className="card" style={{ padding: '25px' }}>
          <h4 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)', fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            {t('rma_quality_claims')}
          </h4>
          {loadingClaims ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)' }}>{t('loading')}</div>
          ) : customerClaims.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
              No claims or quality complaints registered for this customer.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f0f0f0', color: 'var(--text-muted)', fontWeight: 600 }}>
                    <th style={{ padding: '12px 15px' }}>Claim ID</th>
                    <th style={{ padding: '12px 15px' }}>Batch ID</th>
                    <th style={{ padding: '12px 15px' }}>Category</th>
                    <th style={{ padding: '12px 15px' }}>Details</th>
                    <th style={{ padding: '12px 15px' }}>Status</th>
                    <th style={{ padding: '12px 15px' }}>Decision</th>
                    <th style={{ padding: '12px 15px' }}>Credit Note Value</th>
                  </tr>
                </thead>
                <tbody>
                  {customerClaims.map((claim) => (
                    <tr key={claim.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '12px 15px', fontWeight: 'bold' }}>RMA #{claim.id}</td>
                      <td style={{ padding: '12px 15px' }}>{claim.batch_id || '-'}</td>
                      <td style={{ padding: '12px 15px' }}>
                        <span style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                          {claim.root_cause_category || 'General'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 15px' }}>
                        <div style={{ fontWeight: 600 }}>{claim.root_cause_details}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{claim.description}</div>
                      </td>
                      <td style={{ padding: '12px 15px' }}>
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: '12px', 
                          fontWeight: 600, 
                          fontSize: '0.75rem',
                          backgroundColor: ['Credit Issued', 'Replacement Queued'].includes(claim.status) ? '#e6f7ed' : claim.status === 'Rejected' ? '#fff0f6' : '#fffbe6',
                          color: ['Credit Issued', 'Replacement Queued'].includes(claim.status) ? '#2e7d32' : claim.status === 'Rejected' ? '#c41d7f' : '#faad14'
                        }}>
                          {claim.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 15px', fontWeight: '600' }}>{claim.resolution_decision || '-'}</td>
                      <td style={{ padding: '12px 15px', fontWeight: 'bold', color: claim.credit_note_amount > 0 ? '#c53030' : 'inherit' }}>
                        {claim.credit_note_amount > 0 ? `${claim.credit_note_amount.toFixed(2)} RON` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isQuoteModalOpen && (
        <QuoteModal 
          quoteId={null}
          preselectedCustomerId={customer.id}
          onClose={() => setIsQuoteModalOpen(false)}
          onSave={() => {
            setIsQuoteModalOpen(false);
            fetchCustomerQuotes();
          }}
        />
      )}
    </div>
  );
};

export default CustomerDetail;
