import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

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
  status: number;
  machine_code: string;
}

interface Customer {
  id: string;
  name: string;
}

const ProductionBoard: React.FC = () => {
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { t } = useI18n();

  // Fetch customers for the filter dropdown
  useEffect(() => {
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/customers', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setCustomers(data || []))
      .catch(err => console.error('Failed to load customers list', err));
  }, []);

  // Fetch production jobs (live from DWH ss02 via API Gateway)
  const fetchJobs = () => {
    setLoading(true);
    setError('');
    const token = localStorage.getItem('vnc_token');
    
    let url = '/vnc-crm/api/production/jobs';
    if (selectedCustomerId) {
      url += `?customer_id=${selectedCustomerId}`;
    }

    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error(t('failed_retrieve_jobs'));
        return res.json();
      })
      .then(data => {
        setJobs(data || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || t('error_connecting_dwh'));
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchJobs();
  }, [selectedCustomerId]);

  const getMachineColor = (code: string) => {
    const clean = code.toUpperCase();
    if (clean.includes('FOSBER')) return '#0f978e'; // Teal
    if (clean.includes('BOBST')) return '#e65100'; // Orange
    if (clean.includes('MARTIN')) return '#311b92'; // Deep Purple
    return '#455a64'; // Blue Grey
  };

  // Filter jobs based on text query (searching order number, product name, or machine code)
  const filteredJobs = jobs.filter(job => {
    const query = searchQuery.toLowerCase();
    return (
      job.order_number.toLowerCase().includes(query) ||
      job.product_name.toLowerCase().includes(query) ||
      job.product_code.toLowerCase().includes(query) ||
      job.machine_code.toLowerCase().includes(query)
    );
  });

  const queuedJobs = filteredJobs.filter(j => j.status === 0);
  const runningJobs = filteredJobs.filter(j => j.status === 1);
  const completedJobs = filteredJobs.filter(j => j.status === 2);

  return (
    <div style={{ padding: '5px' }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#1a365d' }}>{t('live_production_monitor')}</h1>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '0.9rem' }}>{t('realtime_mes_tracking')}</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {/* Customer filter */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}>{t('filter_by_client')}</label>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                backgroundColor: 'white',
                minWidth: '220px',
                outline: 'none',
                fontSize: '0.9rem'
              }}
            >
              <option value="">{t('all_cardboard_clients')}</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}>{t('search_orders')}</label>
            <input
              type="text"
              placeholder={t('search_orders_placeholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                outline: 'none',
                minWidth: '200px',
                fontSize: '0.9rem'
              }}
            />
          </div>

          <button
            onClick={fetchJobs}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3182ce',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              alignSelf: 'flex-end',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            {loading ? t('loading') : t('refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: '#fed7d7', color: '#c53030', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold' }}>
          {error}
        </div>
      )}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div className="card" style={{ padding: '15px', borderLeft: '4px solid #718096', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('planned_queued')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#2d3748' }}>{queuedJobs.length}</span>
        </div>
        <div className="card" style={{ padding: '15px', borderLeft: '4px solid #3182ce', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('in_progress_running')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#3182ce' }}>{runningJobs.length}</span>
        </div>
        <div className="card" style={{ padding: '15px', borderLeft: '4px solid #48bb78', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('done_completed')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#48bb78' }}>{completedJobs.length}</span>
        </div>
        <div className="card" style={{ padding: '15px', borderLeft: '4px solid #d69e2e', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('total_active_orders')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#d69e2e' }}>{filteredJobs.length}</span>
        </div>
      </div>

      {/* Kanban Board Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', minHeight: '500px', alignItems: 'start' }}>
        {/* Column 1: Queued */}
        <div style={{ backgroundColor: '#edf2f7', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e0', paddingBottom: '10px' }}>
            <h3 style={{ margin: 0, color: '#4a5568' }}>{t('planned_or_queued')}</h3>
            <span style={{ padding: '2px 8px', borderRadius: '20px', backgroundColor: '#cbd5e0', fontSize: '0.8rem', fontWeight: 'bold' }}>{queuedJobs.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '600px', overflowY: 'auto' }}>
            {queuedJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#718096', fontSize: '0.9rem' }}>{t('no_orders_queued')}</div>
            ) : (
              queuedJobs.map(job => <JobCard key={job.order_number} job={job} getMachineColor={getMachineColor} />)
            )}
          </div>
        </div>

        {/* Column 2: In Progress */}
        <div style={{ backgroundColor: '#ebf8ff', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #bee3f8', paddingBottom: '10px' }}>
            <h3 style={{ margin: 0, color: '#2b6cb0' }}>{t('running_or_converting')}</h3>
            <span style={{ padding: '2px 8px', borderRadius: '20px', backgroundColor: '#bee3f8', fontSize: '0.8rem', fontWeight: 'bold', color: '#2b6cb0' }}>{runningJobs.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '600px', overflowY: 'auto' }}>
            {runningJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#718096', fontSize: '0.9rem' }}>{t('no_orders_running')}</div>
            ) : (
              runningJobs.map(job => <JobCard key={job.order_number} job={job} getMachineColor={getMachineColor} />)
            )}
          </div>
        </div>

        {/* Column 3: Completed */}
        <div style={{ backgroundColor: '#f0fff4', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #c6f6d5', paddingBottom: '10px' }}>
            <h3 style={{ margin: 0, color: '#2f855a' }}>{t('completed')}</h3>
            <span style={{ padding: '2px 8px', borderRadius: '20px', backgroundColor: '#c6f6d5', fontSize: '0.8rem', fontWeight: 'bold', color: '#2f855a' }}>{completedJobs.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '600px', overflowY: 'auto' }}>
            {completedJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#718096', fontSize: '0.9rem' }}>{t('no_completed_orders')}</div>
            ) : (
              completedJobs.map(job => <JobCard key={job.order_number} job={job} getMachineColor={getMachineColor} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-component for individual job cards
const JobCard: React.FC<{ job: ProductionJob; getMachineColor: (code: string) => string }> = ({ job, getMachineColor }) => {
  const { t } = useI18n();
  const percent = job.quantity_ordered > 0 ? (job.quantity_produced / job.quantity_ordered) * 100 : 0;
  const progressPercent = Math.min(100, Math.max(0, percent));
  
  // Format Date display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    // Remove milliseconds and timezone offsets if present in the cast string
    const idx = dateStr.indexOf('.');
    return idx > 0 ? dateStr.substring(0, idx) : dateStr;
  };

  return (
    <div className="card" style={{ padding: '14px', borderRadius: '8px', borderLeft: `5px solid ${getMachineColor(job.machine_code)}`, transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          backgroundColor: '#ebf8ff',
          color: '#2b6cb0',
          padding: '3px 8px',
          borderRadius: '4px',
          fontWeight: 'bold',
          fontSize: '0.75rem'
        }}>
          {job.order_number}
        </span>
        <span style={{
          backgroundColor: getMachineColor(job.machine_code),
          color: 'white',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.7rem',
          fontWeight: 'bold',
          textTransform: 'uppercase'
        }}>
          {job.machine_code || 'N/A'}
        </span>
      </div>

      <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#2d3748', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={job.product_name}>
        {job.product_name}
      </div>

      <div style={{ fontSize: '0.75rem', color: '#718096', display: 'flex', justifyContent: 'space-between' }}>
        <span>{t('client')}: {job.customer_name}</span>
        <span style={{ fontWeight: 'bold' }}>{job.customer_code}</span>
      </div>

      {/* Progress Section */}
      <div style={{ marginTop: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
          <span>{t('produced_volume')}</span>
          <span>{Math.round(job.quantity_produced).toLocaleString()} / {job.quantity_ordered.toLocaleString()} {t('units')}</span>
        </div>
        <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor: job.status === 2 ? '#48bb78' : '#3182ce',
            borderRadius: '4px',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Dates Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#718096', borderTop: '1px solid #edf2f7', paddingTop: '6px', marginTop: '4px' }}>
        <span>{t('sched')}: {formatDate(job.scheduled_date)}</span>
        {job.status === 2 && <span>{t('done')}: {formatDate(job.production_date)}</span>}
      </div>
    </div>
  );
};

export default ProductionBoard;
