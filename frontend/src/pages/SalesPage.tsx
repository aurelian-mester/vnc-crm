import React, { useEffect, useState } from 'react';
import QuoteModal from '../components/QuoteModal';
import { useI18n } from '../i18n';
import { planPallets, planToHandoffItems, pushHandoff, DEFAULT_PALLET, HandoffItem } from '../boxLogistics';

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

const SalesPage: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const { t, locale } = useI18n();

  const fetchQuotes = () => {
    setLoading(true);
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/quotes', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then((res) => res.json())
      .then((data) => {
        setQuotes(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch quotes', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t('confirm_delete_quote'))) return;
    
    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/quotes/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'success') {
          setQuotes(quotes.filter(q => q.id !== id));
        }
      })
      .catch(err => console.error('Failed to delete quote', err));
  };

  const handleUpdateStatus = (id: number, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/quotes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    })
      .then((res) => res.json())
      .then(() => {
        setQuotes(quotes.map(q => q.id === id ? { ...q, status: newStatus } : q));
      })
      .catch(err => console.error('Failed to update quote status', err));
  };

  // Send a quote's custom-box lines to the Truck Load Optimizer as pallets
  // (flat-packed bundles on EUR pallets — the standard way boxes ship).
  const handleSendToOptimizer = (id: number, customerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/quotes/${id}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('quote fetch failed'))))
      .then(q => {
        const items: HandoffItem[] = [];
        let skipped = 0;
        (q.items || []).forEach((it: any) => {
          let cfg: any = null;
          try { cfg = it.config_params ? JSON.parse(it.config_params) : null; } catch { cfg = null; }
          if (!cfg || !cfg.length || !cfg.width || !cfg.height) { skipped++; return; }
          const box = {
            lengthMm: Number(cfg.length), widthMm: Number(cfg.width), heightMm: Number(cfg.height),
            fefco: String(cfg.fefco_code || '201'), fluteType: String(cfg.flute_type || 'B'),
            quantity: Number(it.quantity) || 0,
          };
          if (box.quantity <= 0) { skipped++; return; }
          const plan = planPallets(box, 'flat', DEFAULT_PALLET);
          items.push(...planToHandoffItems(plan, box, 'flat', customerName, 1, DEFAULT_PALLET, `#Q${id} `));
        });
        if (items.length === 0) {
          alert(locale === 'ro' ? 'Oferta nu are linii de cutii configurate.' : 'This quote has no configured box lines.');
          return;
        }
        const totalPallets = items.reduce((a, i) => a + i.quantity, 0);
        const msg = locale === 'ro'
          ? `${totalPallets} paleți → Optimizatorul de Încărcare${skipped > 0 ? ` (${skipped} linii standard sărite)` : ''}. Continui?`
          : `${totalPallets} pallets → Truck Load Optimizer${skipped > 0 ? ` (${skipped} standard lines skipped)` : ''}. Continue?`;
        if (!window.confirm(msg)) return;
        pushHandoff(items);
        window.location.href = '/vnc-crm/crm/truck-optimizer';
      })
      .catch(err => console.error('Send to optimizer failed', err));
  };

  // Metrics Calculations
  const totalValue = quotes.reduce((acc, q) => acc + q.total_amount, 0);
  const activeValue = quotes.filter(q => q.status === 'Draft' || q.status === 'Sent').reduce((acc, q) => acc + q.total_amount, 0);
  const wonValue = quotes.filter(q => q.status === 'Approved').reduce((acc, q) => acc + q.total_amount, 0);
  const totalCount = quotes.length;
  const wonCount = quotes.filter(q => q.status === 'Approved').length;
  const winRate = totalCount > 0 ? (wonCount / totalCount) * 100 : 0;

  const filteredQuotes = quotes.filter(q => {
    const matchesSearch = 
      q.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.customer_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.id.toString().includes(searchTerm) ||
      q.salesperson_code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || q.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeStyle = (status: string) => {
    const base = {
      padding: '4px 10px',
      borderRadius: '20px',
      fontSize: '0.8rem',
      fontWeight: 600,
      display: 'inline-block'
    };
    switch (status.toLowerCase()) {
      case 'approved':
        return { ...base, color: '#52c41a', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f' };
      case 'sent':
        return { ...base, color: '#1890ff', backgroundColor: '#e6f7ff', border: '1px solid #91d5ff' };
      case 'declined':
        return { ...base, color: '#f5222d', backgroundColor: '#fff1f0', border: '1px solid #ffa39e' };
      default: // Draft
        return { ...base, color: '#faad14', backgroundColor: '#fffbe6', border: '1px solid #ffe58f' };
    }
  };

  const getStatusTranslation = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return t('approved');
      case 'sent': return t('sent');
      case 'declined': return t('declined');
      default: return t('draft');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '35px' }}>
      
      {/* Metrics Cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="card" style={{ padding: '20px', backgroundColor: 'white', borderLeft: '5px solid var(--primary-color)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('total_pipeline')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: 'var(--secondary-color)' }}>
            {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(totalValue)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t('total_offers_created', { count: totalCount })}</div>
        </div>

        <div className="card" style={{ padding: '20px', backgroundColor: 'white', borderLeft: '5px solid #1890ff' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('active_offers')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: '#1890ff' }}>
            {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(activeValue)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t('draft_out_for_review')}</div>
        </div>

        <div className="card" style={{ padding: '20px', backgroundColor: 'white', borderLeft: '5px solid #52c41a' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('closed_won_approved')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: '#52c41a' }}>
            {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(wonValue)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t('won_agreements', { count: wonCount })}</div>
        </div>

        <div className="card" style={{ padding: '20px', backgroundColor: 'white', borderLeft: '5px solid var(--kraft-accent, #e6a23c)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('win_rate')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: 'var(--kraft-accent, #e6a23c)' }}>
            {winRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t('conversion_metrics')}</div>
        </div>
      </div>

      {/* Grid Controls (Search, Status Filter, Create Trigger) */}
      <div className="card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '15px', flex: 1, minWidth: '300px', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder={t('search_quotes_placeholder')} 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '10px 16px', flex: 1, maxWidth: '400px' }}
            />
            
            <select 
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '10px 16px', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
            >
              <option value="ALL">{t('all_statuses')}</option>
              <option value="DRAFT">{t('draft')}</option>
              <option value="SENT">{t('sent_in_review')}</option>
              <option value="APPROVED">{t('approved_won')}</option>
              <option value="DECLINED">{t('declined_lost')}</option>
            </select>
          </div>
          
          <button 
            className="btn-primary" 
            onClick={() => { setSelectedQuoteId(null); setIsModalOpen(true); }}
            style={{ padding: '10px 24px', borderRadius: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {t('create_sales_quote')}
          </button>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              {t('loading_pipeline_data')}
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              {t('no_quotes_match_filters')}
            </div>
          ) : (
            <table style={{ minWidth: '850px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left' }}>{t('quote_num')}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left' }}>{t('customer')}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left' }}>{t('salesperson')}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>{t('total_amount')}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center' }}>{t('status')}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left' }}>{t('created_date')}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center' }}>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((q) => (
                  <tr 
                    key={q.id} 
                    onClick={() => { setSelectedQuoteId(q.id); setIsModalOpen(true); }}
                    style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                    className="table-row"
                  >
                    <td style={{ padding: '15px 20px', fontWeight: 600, color: 'var(--primary-color)' }}>
                      #{q.id}
                    </td>
                    <td style={{ padding: '15px 20px', fontWeight: 600 }}>
                      <div style={{ color: 'var(--text-main)' }}>{q.customer_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('code')}: {q.customer_id}</div>
                    </td>
                    <td style={{ padding: '15px 20px', color: 'var(--text-main)' }}>
                      {q.salesperson_code}
                    </td>
                    <td style={{ padding: '15px 20px', textAlign: 'right', fontWeight: 700, color: 'var(--secondary-color)' }}>
                      {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(q.total_amount)}
                    </td>
                    <td style={{ padding: '15px 20px', textAlign: 'center' }}>
                      <span style={getStatusBadgeStyle(q.status)}>
                        {getStatusTranslation(q.status)}
                      </span>
                    </td>
                    <td style={{ padding: '15px 20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {new Date(q.created_at).toLocaleDateString('ro-RO')}
                    </td>
                    <td style={{ padding: '15px 20px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        {q.status === 'Draft' && (
                          <button 
                            onClick={(e) => handleUpdateStatus(q.id, 'Sent', e)}
                            style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', color: '#1890ff', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            {t('send')}
                          </button>
                        )}
                        {q.status === 'Sent' && (
                          <>
                            <button 
                              onClick={(e) => handleUpdateStatus(q.id, 'Approved', e)}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', color: '#52c41a', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              {t('approve')}
                            </button>
                            <button 
                              onClick={(e) => handleUpdateStatus(q.id, 'Declined', e)}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#f5222d', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              {t('decline')}
                            </button>
                          </>
                        )}
                        <button
                          onClick={(e) => handleSendToOptimizer(q.id, q.customer_name, e)}
                          title="Truck Load Optimizer"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          🚚
                        </button>
                        <button
                          onClick={(e) => handleDelete(q.id, e)}
                          style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#fff2f0', border: '1px solid #ffa39e', color: '#f5222d', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quote Builder / Details Modal */}
      {isModalOpen && (
        <QuoteModal 
          quoteId={selectedQuoteId}
          onClose={() => setIsModalOpen(false)}
          onSave={() => { setIsModalOpen(false); fetchQuotes(); }}
        />
      )}

    </div>
  );
};

export default SalesPage;
