import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface UserRecord {
  email: string;
  name: string;
  role: string;
  salesperson_code?: string;
  locale: string;
}

const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const token = localStorage.getItem('vnc_token');
  const { t } = useI18n();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/vnc-crm/api/auth/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(t('authorization_error'));
        }
        throw new Error('Failed to fetch user list');
      }

      const data = await res.json();
      setUsers(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching users.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncData = async () => {
    try {
      setSyncing(true);
      setNotification(null);
      const res = await fetch('/vnc-crm/api/auth/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to sync ERP data from Data Warehouse.');
      }

      const stats = await res.json();
      setNotification({
        message: `ERP Data Synced Successfully: Imported ${stats.customers_synced} active customers, ${stats.products_synced} items, ${stats.price_headers_synced} price lists, and ${stats.price_lines_synced} lines.`,
        type: 'success',
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Synchronization failed.',
        type: 'error',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleUserUpdate = async (email: string, newRole: string, newLocale: string) => {
    try {
      setNotification(null);
      const currentUser = users.find(u => u.email === email);
      const res = await fetch('/vnc-crm/api/auth/users/role', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          email, 
          role: newRole, 
          locale: newLocale,
          salesperson_code: currentUser?.salesperson_code || "" 
        }),
      });

      if (!res.ok) {
        const errMsg = await res.text();
        throw new Error(errMsg || 'Failed to update user parameters');
      }

      setUsers(users.map(u => u.email === email ? { ...u, role: newRole, locale: newLocale } : u));
      
      const roleLabel = roleLabels[newRole] || newRole;
      const langLabel = newLocale === 'en' ? 'English' : 'Română';
      
      setNotification({ 
        message: `${t('role_updated_success', { email, role: roleLabel })} ${t('lang_updated_success', { email, lang: langLabel })}`, 
        type: 'success' 
      });
      
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      setNotification({ message: err.message || 'Error updating user parameters', type: 'error' });
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const roleLabels: Record<string, string> = {
    'admin': t('administrator'),
    'sales': t('sales_manager'),
    'production': t('production_specialist'),
    'viewer': t('guest_viewer')
  };

  return (
    <div className="card" style={{ padding: '30px', position: 'relative' }}>
      <div style={{ marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--secondary-color)', fontWeight: 600 }}>{t('access_control_user_roles')}</h2>
          <p style={{ margin: '5px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {t('manage_permission_boundaries')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn-primary" 
            onClick={handleSyncData}
            disabled={syncing}
            style={{ 
              background: syncing ? 'var(--text-muted)' : 'linear-gradient(135deg, var(--kraft-accent) 0%, #a07850 100%)',
              boxShadow: syncing ? 'none' : '0 4px 10px rgba(212,163,115,0.25)',
              cursor: syncing ? 'not-allowed' : 'pointer'
            }}
          >
            {syncing ? t('syncing') : t('sync_erp_data')}
          </button>
          <button 
            className="btn-primary" 
            onClick={fetchUsers}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {t('refresh_list')}
          </button>
        </div>
      </div>

      {notification && (
        <div 
          style={{ 
            padding: '15px 20px', 
            borderRadius: '6px', 
            marginBottom: '20px',
            fontSize: '0.9rem',
            fontWeight: 500,
            transition: 'all 0.3s ease',
            backgroundColor: notification.type === 'success' ? '#d4edda' : '#f8d7da',
            color: notification.type === 'success' ? '#155724' : '#721c24',
            border: `1px solid ${notification.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
          }}
        >
          {notification.message}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>{t('loading_users')}</div>
          <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : error ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#e74c3c', border: '1px dashed #e74c3c', borderRadius: '8px' }}>
          <h3>{t('authorization_error')}</h3>
          <p>{error}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '12px 15px' }}>{t('full_name')}</th>
                <th style={{ padding: '12px 15px' }}>{t('email_address')}</th>
                <th style={{ padding: '12px 15px' }}>{t('assigned_system_role')}</th>
                <th style={{ padding: '12px 15px' }}>{t('preferred_language')}</th>
                <th style={{ padding: '12px 15px', textAlign: 'right' }}>{t('modify_permissions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('no_users_logged')}
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isMainAdmin = user.email.toLowerCase() === 'aurelian.mester@vrancart.com';
                  return (
                    <tr 
                      key={user.email} 
                      style={{ 
                        borderBottom: '1px solid var(--border-color)', 
                        transition: 'background-color 0.2s',
                        backgroundColor: isMainAdmin ? 'rgba(0, 74, 153, 0.02)' : 'transparent'
                      }}
                      onMouseEnter={(e) => {
                        if (!isMainAdmin) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.01)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isMainAdmin) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '15px', fontWeight: 600, color: 'var(--secondary-color)' }}>
                        {user.name} {isMainAdmin && <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--primary-color)', color: 'white', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px', fontWeight: 500 }}>{t('system_owner')}</span>}
                      </td>
                      <td style={{ padding: '15px', color: 'var(--text-muted)' }}>
                        {user.email}
                      </td>
                      <td style={{ padding: '15px' }}>
                        <span 
                          style={{ 
                            fontSize: '0.85rem', 
                            padding: '4px 10px', 
                            borderRadius: '20px', 
                            fontWeight: 600,
                            backgroundColor: user.role === 'admin' ? '#ffeecb' : user.role === 'sales' ? '#d1f2d9' : user.role === 'production' ? '#d4f2ff' : '#eee',
                            color: user.role === 'admin' ? '#b7791f' : user.role === 'sales' ? '#22543d' : user.role === 'production' ? '#2b6cb0' : '#4a5568'
                          }}
                        >
                          {roleLabels[user.role] || user.role}
                        </span>
                      </td>
                      <td style={{ padding: '15px' }}>
                        <span 
                          style={{ 
                            fontSize: '0.85rem', 
                            padding: '4px 10px', 
                            borderRadius: '20px', 
                            fontWeight: 600,
                            backgroundColor: '#f1f5f9',
                            color: 'var(--secondary-color)'
                          }}
                        >
                          {user.locale === 'ro' ? '🇷🇴 Română' : '🇬🇧 English'}
                        </span>
                      </td>
                      <td style={{ padding: '15px', textAlign: 'right' }}>
                        {isMainAdmin ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('locked_always_admin')}</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <select
                              value={user.role}
                              onChange={(e) => handleUserUpdate(user.email, e.target.value, user.locale || 'en')}
                              style={{ 
                                padding: '6px 12px', 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '4px',
                                backgroundColor: '#fff',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                outline: 'none'
                              }}
                            >
                              <option value="viewer">{t('guest_viewer')}</option>
                              <option value="sales">{t('sales_manager')}</option>
                              <option value="production">{t('production_specialist')}</option>
                              <option value="admin">{t('administrator')}</option>
                            </select>
                            
                            <select
                              value={user.locale || 'en'}
                              onChange={(e) => handleUserUpdate(user.email, user.role, e.target.value)}
                              style={{ 
                                padding: '6px 12px', 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '4px',
                                backgroundColor: '#fff',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                outline: 'none'
                              }}
                            >
                              <option value="en">🇬🇧 EN</option>
                              <option value="ro">🇷🇴 RO</option>
                            </select>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
