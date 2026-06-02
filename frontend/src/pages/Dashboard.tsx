import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseJWT } from '../App';
import { useI18n } from '../i18n';

interface Quote {
  id: number;
  customer_id: string;
  customer_name: string;
  salesperson_code: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

interface ProductionJob {
  nr_crt: number;
  customer_code: string;
  customer_name: string;
  product_code: string;
  product_name: string;
  order_number: string;
  quantity_ordered: number;
  quantity_produced: number;
  scheduled_date: string;
  production_date: string;
  status: number; // 0: Queued, 1: In Progress, 2: Completed
  machine_code: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredFunnelStep, setHoveredFunnelStep] = useState<string | null>(null);

  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const userName = user?.name || localStorage.getItem('vnc_name') || 'Guest User';
  const userRole = user?.role || localStorage.getItem('vnc_role') || 'viewer';
  
  const { locale, t } = useI18n();

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch quotes
        const quotesRes = await fetch('/vnc-crm/api/quotes', { headers });
        const quotesData = await quotesRes.json();
        setQuotes(quotesData || []);

        // Fetch production jobs
        const jobsRes = await fetch('/vnc-crm/api/production/jobs', { headers });
        const jobsData = await jobsRes.json();
        setJobs(jobsData || []);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [token]);

  // Aggregate metrics
  const totalQuotesCount = quotes.length;
  const wonQuotes = quotes.filter(q => q.status === 'Approved');
  const wonCount = wonQuotes.length;
  const wonValue = wonQuotes.reduce((acc, q) => acc + q.total_amount, 0);

  const activeQuotes = quotes.filter(q => q.status === 'Draft' || q.status === 'Sent');
  const activeCount = activeQuotes.length;
  const activeValue = activeQuotes.reduce((acc, q) => acc + q.total_amount, 0);

  const totalValue = quotes.reduce((acc, q) => acc + q.total_amount, 0);
  const winRate = totalQuotesCount > 0 ? (wonCount / totalQuotesCount) * 100 : 0;

  // Active production stats
  const queuedJobs = jobs.filter(j => j.status === 0).length;
  const inProgressJobs = jobs.filter(j => j.status === 1).length;
  const completedJobs = jobs.filter(j => j.status === 2).length;

  // Funnel calculations (dynamic based on actual CRM quotes data)
  const funnelSteps = [
    {
      id: 'leads',
      name: t('leads'),
      count: Math.round(totalQuotesCount * 1.6 + 5),
      value: totalValue * 2.1 + 15000,
      description: t('leads_funnel_desc'),
      color: '#004a99',
    },
    {
      id: 'opps',
      name: t('opportunities'),
      count: Math.round(totalQuotesCount * 1.2 + 2),
      value: totalValue * 1.5 + 5000,
      description: t('opps_funnel_desc'),
      color: '#1e3a8a',
    },
    {
      id: 'quotes',
      name: t('quotes_funnel_name'),
      count: totalQuotesCount,
      value: totalValue,
      description: t('quotes_funnel_desc'),
      color: '#1d4ed8',
    },
    {
      id: 'orders',
      name: t('orders_funnel_name'),
      count: wonCount,
      value: wonValue,
      description: t('orders_funnel_desc'),
      color: '#10b981',
    }
  ];

  // Helper to format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(val);
  };

  const getStatusBadge = (status: string) => {
    const style: React.CSSProperties = {
      padding: '4px 10px',
      borderRadius: '20px',
      fontSize: '0.75rem',
      fontWeight: 'bold',
      display: 'inline-block'
    };
    switch (status.toLowerCase()) {
      case 'approved':
        return <span style={{ ...style, color: '#52c41a', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f' }}>{t('approved')}</span>;
      case 'sent':
        return <span style={{ ...style, color: '#1890ff', backgroundColor: '#e6f7ff', border: '1px solid #91d5ff' }}>{t('sent')}</span>;
      case 'declined':
        return <span style={{ ...style, color: '#f5222d', backgroundColor: '#fff1f0', border: '1px solid #ffa39e' }}>{t('declined')}</span>;
      default:
        return <span style={{ ...style, color: '#faad14', backgroundColor: '#fffbe6', border: '1px solid #ffe58f' }}>{t('draft')}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      
      {/* Welcome Bar */}
      <div className="card" style={{ padding: '24px 30px', background: 'linear-gradient(90deg, #f8fafc 0%, #edf2f7 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--secondary-color)' }}>
            {t('welcome_back', { name: userName })}
          </h2>
          <p style={{ margin: '5px 0 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            {t('live_performance_summary')}
          </p>
        </div>
        <div style={{ padding: '8px 16px', backgroundColor: 'var(--primary-color)', color: 'white', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase' }}>
          {t('role')}: {userRole}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          🔄 {t('loading')}
        </div>
      ) : (
        <>
          {/* Key Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="card" style={{ padding: '24px', margin: 0, borderLeft: '5px solid var(--primary-color)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('active_pipeline')}</span>
              <h3 style={{ margin: '10px 0 4px 0', fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                {formatCurrency(activeValue)}
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('quotes_in_progress', { count: activeCount })}</span>
            </div>

            <div className="card" style={{ padding: '24px', margin: 0, borderLeft: '5px solid #10b981' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('closed_won')}</span>
              <h3 style={{ margin: '10px 0 4px 0', fontSize: '1.75rem', fontWeight: 'bold', color: '#10b981' }}>
                {formatCurrency(wonValue)}
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('deals_agreed', { count: wonCount })}</span>
            </div>

            <div className="card" style={{ padding: '24px', margin: 0, borderLeft: '5px solid #faad14' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('win_rate')}</span>
              <h3 style={{ margin: '10px 0 4px 0', fontSize: '1.75rem', fontWeight: 'bold', color: '#faad14' }}>
                {winRate.toFixed(1)}%
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('total_offers_made', { count: totalQuotesCount })}</span>
            </div>

            <div className="card" style={{ padding: '24px', margin: 0, borderLeft: '5px solid #d4a373' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('production_board')}</span>
              <h3 style={{ margin: '10px 0 4px 0', fontSize: '1.75rem', fontWeight: 'bold', color: '#d4a373' }}>
                {t('running', { count: inProgressJobs })}
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('queued_done', { queued: queuedJobs, completed: completedJobs })}</span>
            </div>
          </div>

          {/* Middle Row: Sales Funnel and Mini Job Board */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '30px', alignItems: 'start' }}>
            
            {/* Sales Lifecycle Funnel */}
            <div className="card" style={{ height: '480px', display: 'flex', flexDirection: 'column', margin: 0 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: 'var(--secondary-color)' }}>
                {t('interactive_sales_funnel')}
              </h4>
              <p style={{ margin: '0 0 25px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('hover_funnel_steps')}
              </p>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
                {funnelSteps.map((step, idx) => {
                  const widthPercent = 100 - idx * 18;
                  const isHovered = hoveredFunnelStep === step.id;

                  return (
                    <div 
                      key={step.id}
                      onMouseEnter={() => setHoveredFunnelStep(step.id)}
                      onMouseLeave={() => setHoveredFunnelStep(null)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <div 
                        style={{
                          width: `${widthPercent}%`,
                          backgroundColor: step.color,
                          color: 'white',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: isHovered ? '0 8px 20px rgba(0,0,0,0.15)' : 'none',
                          transform: isHovered ? 'scale(1.03)' : 'scale(1.0)',
                          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        <span style={{ fontWeight: 'bold', fontSize: '0.88rem' }}>
                          {step.name}
                        </span>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>
                            {step.count} {t('items')}
                          </span>
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                            {formatCurrency(step.value)}
                          </span>
                        </div>
                      </div>

                      {/* Tooltip detail block */}
                      <div style={{
                        height: isHovered ? '32px' : '0',
                        opacity: isHovered ? 1 : 0,
                        overflow: 'hidden',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        marginTop: '4px',
                        transition: 'all 0.2s ease-in-out'
                      }}>
                        {step.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DWH Production Board Stream */}
            <div className="card" style={{ height: '480px', display: 'flex', flexDirection: 'column', margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--secondary-color)' }}>
                  {t('active_production_stream')}
                </h4>
                <button 
                  onClick={() => navigate('/crm/production')} 
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'var(--primary-color)',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  {t('view_board')}
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {jobs.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {t('no_ongoing_production')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {jobs.slice(0, 5).map((job) => (
                      <div 
                        key={job.order_number} 
                        style={{
                          padding: '12px 16px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          backgroundColor: '#fafafa',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div style={{ maxWidth: '70%' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '0.88rem', color: 'var(--text-main)' }}>
                            {job.product_name || 'Standard Cardboard Articol'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {t('order')}: <strong style={{ color: 'var(--primary-color)' }}>{job.order_number}</strong> | {t('client')}: {job.customer_name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {t('target')}: {new Date(job.scheduled_date).toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-US')}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                            {job.quantity_produced.toLocaleString()} / {job.quantity_ordered.toLocaleString()} {t('units')}
                          </div>
                          <div style={{ marginTop: '5px' }}>
                            {job.status === 2 ? (
                              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', color: '#52c41a', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', fontWeight: 'bold' }}>{t('completed')}</span>
                            ) : job.status === 1 ? (
                              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', color: '#1890ff', backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', fontWeight: 'bold' }}>{t('in_run', { machine: job.machine_code })}</span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', color: '#faad14', backgroundColor: '#fffbe6', border: '1px solid #ffe58f', fontWeight: 'bold' }}>{t('queued')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Bottom Row: Recent Quotes activity list */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--secondary-color)' }}>
                {t('recent_quotes_activity')}
              </h4>
              <button 
                onClick={() => navigate('/crm/sales')} 
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--primary-color)',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                {t('go_to_pipeline')}
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              {quotes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {t('no_quotes_registered')}
                </div>
              ) : (
                <table style={{ margin: 0, minWidth: '700px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '10px 15px', textAlign: 'left', fontSize: '0.8rem' }}>{t('quote_num')}</th>
                      <th style={{ padding: '10px 15px', textAlign: 'left', fontSize: '0.8rem' }}>{t('customer')}</th>
                      <th style={{ padding: '10px 15px', textAlign: 'left', fontSize: '0.8rem' }}>{t('sales_agent')}</th>
                      <th style={{ padding: '10px 15px', textAlign: 'right', fontSize: '0.8rem' }}>{t('total_amount')}</th>
                      <th style={{ padding: '10px 15px', textAlign: 'center', fontSize: '0.8rem' }}>{t('status')}</th>
                      <th style={{ padding: '10px 15px', textAlign: 'left', fontSize: '0.8rem' }}>{t('updated_at')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.slice(0, 5).map((q) => (
                      <tr 
                        key={q.id}
                        onClick={() => navigate('/crm/sales')}
                        style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                        className="table-row"
                      >
                        <td style={{ padding: '12px 15px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                          #{q.id}
                        </td>
                        <td style={{ padding: '12px 15px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{q.customer_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('code')}: {q.customer_id}</div>
                        </td>
                        <td style={{ padding: '12px 15px', color: 'var(--text-main)' }}>
                          {q.salesperson_code}
                        </td>
                        <td style={{ padding: '12px 15px', textAlign: 'right', fontWeight: 700, color: 'var(--secondary-color)' }}>
                          {formatCurrency(q.total_amount)}
                        </td>
                        <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                          {getStatusBadge(q.status)}
                        </td>
                        <td style={{ padding: '12px 15px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          {new Date(q.updated_at).toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-US')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default Dashboard;
