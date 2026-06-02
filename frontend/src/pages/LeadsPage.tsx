import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface Lead {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: string;
  salesperson_code: string;
  created_at: string;
}

const LeadsPage: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  
  // Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    status: 'New',
    salesperson_code: localStorage.getItem('vnc_role') === 'sales' ? localStorage.getItem('vnc_name')?.slice(0, 2).toUpperCase() || 'AM' : 'AM'
  });

  const fetchLeads = () => {
    setLoading(true);
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/leads', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setLeads(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch leads', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('vnc_token');
    
    fetch('/vnc-crm/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newLead)
    })
      .then(res => res.json())
      .then(() => {
        setShowAddModal(false);
        setNewLead({ name: '', company: '', email: '', phone: '', status: 'New', salesperson_code: 'AM' });
        fetchLeads();
      })
      .catch(err => console.error('Failed to create lead', err));
  };

  const handleStatusChange = (leadId: number, status: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/leads/${leadId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ...lead, status })
    })
      .then(() => fetchLeads())
      .catch(err => console.error('Failed to update lead status', err));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return '#3498db';
      case 'Contacted': return '#f39c12';
      case 'Qualified': return '#2ecc71';
      case 'Unqualified': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const getStatusTranslation = (status: string) => {
    switch (status.toLowerCase()) {
      case 'new': return t('new');
      case 'contacted': return t('contacted');
      case 'qualified': return t('qualified');
      case 'unqualified': return t('unqualified');
      default: return status;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--secondary-color)' }}>{t('leads_management')}</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('leads_desc')}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          ➕ {t('new_lead')}
        </button>
      </div>

      {/* KPI summaries */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('total_pipeline_leads')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{leads.length}</span>
        </div>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', borderLeft: '4px solid #3498db' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('new')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{leads.filter(l => l.status === 'New').length}</span>
        </div>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', borderLeft: '4px solid #f39c12' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('contacted')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{leads.filter(l => l.status === 'Contacted').length}</span>
        </div>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', borderLeft: '4px solid #2ecc71' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('qualified_won')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{leads.filter(l => l.status === 'Qualified').length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: '24px' }}>
        {loading ? (
          <div>{t('loading')}</div>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            {t('no_leads_in_pipeline')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '12px 8px' }}>{t('lead_name')}</th>
                <th style={{ padding: '12px 8px' }}>{t('company')}</th>
                <th style={{ padding: '12px 8px' }}>{t('email')}</th>
                <th style={{ padding: '12px 8px' }}>{t('phone')}</th>
                <th style={{ padding: '12px 8px' }}>{t('salesperson')}</th>
                <th style={{ padding: '12px 8px' }}>{t('status')}</th>
                <th style={{ padding: '12px 8px' }}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                  <td style={{ padding: '15px 8px', fontWeight: 600 }}>{l.name}</td>
                  <td style={{ padding: '15px 8px' }}>{l.company}</td>
                  <td style={{ padding: '15px 8px' }}>{l.email || 'N/A'}</td>
                  <td style={{ padding: '15px 8px' }}>{l.phone || 'N/A'}</td>
                  <td style={{ padding: '15px 8px', fontWeight: 700 }}>{l.salesperson_code}</td>
                  <td style={{ padding: '15px 8px' }}>
                    <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', backgroundColor: getStatusColor(l.status) + '1a', color: getStatusColor(l.status), fontWeight: 700 }}>
                      {getStatusTranslation(l.status)}
                    </span>
                  </td>
                  <td style={{ padding: '15px 8px' }}>
                    <select 
                      value={l.status} 
                      onChange={e => handleStatusChange(l.id, e.target.value)}
                      style={{ padding: '4px', fontSize: '0.8rem' }}
                    >
                      <option value="New">{t('new')}</option>
                      <option value="Contacted">{t('contacted')}</option>
                      <option value="Qualified">{t('qualified')}</option>
                      <option value="Unqualified">{t('unqualified')}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '30px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)' }}>{t('add_new_lead')}</h3>
            
            <form onSubmit={handleCreateLead} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('contact_name')}</label>
                <input 
                  type="text" 
                  value={newLead.name} 
                  onChange={e => setNewLead({ ...newLead, name: e.target.value })} 
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                  required 
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('company_name')}</label>
                <input 
                  type="text" 
                  value={newLead.company} 
                  onChange={e => setNewLead({ ...newLead, company: e.target.value })} 
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                  required 
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('email_address')}</label>
                <input 
                  type="email" 
                  value={newLead.email} 
                  onChange={e => setNewLead({ ...newLead, email: e.target.value })} 
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }} 
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('phone_number')}</label>
                <input 
                  type="text" 
                  value={newLead.phone} 
                  onChange={e => setNewLead({ ...newLead, phone: e.target.value })} 
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }} 
                />
              </div>
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary" style={{ padding: '8px 16px', boxShadow: 'none' }}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '8px 16px' }}>
                  {t('add_lead')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsPage;
