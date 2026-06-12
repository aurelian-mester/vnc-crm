import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface Customer {
  id: string;
  name: string;
}

interface Opportunity {
  id: number;
  title: string;
}

interface Project {
  id: number;
  customer_id: string;
  customer_name?: string;
  name: string;
  status: string;
  opportunity_id: number | null;
  delivery_date: string;
  created_at: string;
}

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const { locale, t } = useI18n();
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProject, setNewProject] = useState({
    customer_id: '',
    name: '',
    status: 'Planning',
    opportunity_id: null as number | null,
    delivery_date: ''
  });

  const fetchData = () => {
    setLoading(true);
    const token = localStorage.getItem('vnc_token');

    // Fetch projects
    fetch('/vnc-crm/api/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => setProjects(data || []))
      .catch(err => console.error('Failed to load projects', err));

    // Fetch customers
    fetch('/vnc-crm/api/customers', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => setCustomers(data || []))
      .catch(err => console.error('Failed to load customers', err));

    // Fetch opportunities
    fetch('/vnc-crm/api/opportunities', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => {
        setOpportunities(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load opportunities', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('vnc_token');

    fetch('/vnc-crm/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newProject)
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(() => {
        setShowAddModal(false);
        setNewProject({ customer_id: '', name: '', status: 'Planning', opportunity_id: null, delivery_date: '' });
        fetchData();
      })
      .catch(err => console.error('Failed to create project', err));
  };

  const handleStatusChange = (projectId: number, status: string) => {
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;

    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/projects/${projectId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ...proj, status })
    })
      .then(() => fetchData())
      .catch(err => console.error('Failed to update status', err));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Planning': return '#7f8c8d';
      case 'Production': return '#3498db';
      case 'Shipped': return '#f39c12';
      case 'Completed': return '#2ecc71';
      default: return '#95a5a6';
    }
  };

  const getStatusTranslation = (status: string) => {
    switch (status.toLowerCase()) {
      case 'planning': return t('planning');
      case 'production': return t('production');
      case 'shipped': return t('shipped');
      case 'completed': return t('completed');
      default: return status;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--secondary-color)' }}>{t('projects_tracker')}</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('delivery_monitoring')}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          ➕ {t('new_project')}
        </button>
      </div>

      {/* KPI summaries */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('total_projects')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{projects.length}</span>
        </div>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', borderLeft: '4px solid #3498db' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('in_production')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{projects.filter(p => p.status === 'Production').length}</span>
        </div>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', borderLeft: '4px solid #f39c12' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('shipped')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{projects.filter(p => p.status === 'Shipped').length}</span>
        </div>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', borderLeft: '4px solid #2ecc71' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('completed')}</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{projects.filter(p => p.status === 'Completed').length}</span>
        </div>
      </div>

      {/* Projects List Table */}
      <div className="card" style={{ padding: '24px' }}>
        {loading ? (
          <div>{t('loading')}</div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            {t('no_projects')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '12px 8px' }}>{t('project_name')}</th>
                <th style={{ padding: '12px 8px' }}>{t('customer')}</th>
                <th style={{ padding: '12px 8px' }}>{t('associated_opportunity')}</th>
                <th style={{ padding: '12px 8px' }}>{t('delivery_deadline')}</th>
                <th style={{ padding: '12px 8px' }}>{t('status')}</th>
                <th style={{ padding: '12px 8px' }}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                  <td style={{ padding: '15px 8px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '15px 8px' }}>{p.customer_name || p.customer_id || 'N/A'}</td>
                  <td style={{ padding: '15px 8px' }}>
                    {p.opportunity_id ? `${t('opportunities').slice(0, 3)} #${p.opportunity_id}` : t('direct_project', { defaultValue: 'Direct Project' })}
                  </td>
                  <td style={{ padding: '15px 8px', color: '#b45309', fontWeight: 600 }}>
                    {p.delivery_date ? new Date(p.delivery_date).toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-US') : t('unscheduled', { defaultValue: 'Unscheduled' })}
                  </td>
                  <td style={{ padding: '15px 8px' }}>
                    <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', backgroundColor: getStatusColor(p.status) + '1a', color: getStatusColor(p.status), fontWeight: 700 }}>
                      {getStatusTranslation(p.status)}
                    </span>
                  </td>
                  <td style={{ padding: '15px 8px' }}>
                    <select 
                      value={p.status} 
                      onChange={e => handleStatusChange(p.id, e.target.value)}
                      style={{ padding: '4px', fontSize: '0.8rem' }}
                    >
                      <option value="Planning">{t('planning')}</option>
                      <option value="Production">{t('production')}</option>
                      <option value="Shipped">{t('shipped')}</option>
                      <option value="Completed">{t('completed')}</option>
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
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--secondary-color)' }}>{t('create_project')}</h3>
            
            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('project_name')}</label>
                <input 
                  type="text" 
                  value={newProject.name} 
                  onChange={e => setNewProject({ ...newProject, name: e.target.value })} 
                  placeholder="e.g. Alprom Box Production Run"
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                  required 
                />
              </div>
              
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('customer')}</label>
                <select 
                  value={newProject.customer_id} 
                  onChange={e => setNewProject({ ...newProject, customer_id: e.target.value })}
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
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('link_to_opportunity')}</label>
                  <select 
                    value={newProject.opportunity_id || ''} 
                    onChange={e => setNewProject({ ...newProject, opportunity_id: e.target.value ? Number(e.target.value) : null })}
                    style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                  >
                    <option value="">-- {t('no_opportunity_linked')} --</option>
                    {opportunities.map(o => (
                      <option key={o.id} value={o.id}>{t('opportunities').slice(0, 3)} #{o.id}: {o.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('delivery_deadline')}</label>
                  <input 
                    type="date" 
                    value={newProject.delivery_date} 
                    onChange={e => setNewProject({ ...newProject, delivery_date: e.target.value })} 
                    style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                    required 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary" style={{ padding: '8px 16px', boxShadow: 'none' }}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '8px 16px' }}>
                  {t('create_project')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
