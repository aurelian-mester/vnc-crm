import React from 'react';
import Sidebar from './Sidebar';
import { VrancartLogo } from './Logos';
import { parseJWT } from '../App';
import { useI18n } from '../i18n';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

const MainLayout: React.FC<LayoutProps> = ({ children, title }) => {
  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const { locale, setLocale, t } = useI18n();

  const displayName = user?.name || localStorage.getItem('vnc_name') || "Guest User";
  const displayRoleRaw = user?.role || localStorage.getItem('vnc_role') || "viewer";

  const roleMap: Record<string, string> = {
    'admin': t('administrator'),
    'sales': t('sales_manager'),
    'production': t('production_specialist'),
    'viewer': t('guest_viewer')
  };
  const displayRole = roleMap[displayRoleRaw] || displayRoleRaw;

  // Extract initials dynamically
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .filter((n) => n.length > 0)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };
  const initials = getInitials(displayName) || "GU";

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/vnc-crm/login';
  };

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <header className="header">
          <VrancartLogo />
          <div className="header-title">{t(title)}</div>
          
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Glassmorphic/Premium Language Switcher */}
            <div className="language-switcher" style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '24px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
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

            <div className="user-profile">
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, color: 'var(--secondary-color)' }}>{displayName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '2px' }}>
                  <span>{displayRole}</span>
                  <span>•</span>
                  <button 
                    onClick={handleLogout} 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: '#d63031', 
                      cursor: 'pointer', 
                      padding: 0, 
                      fontSize: '0.75rem', 
                      fontWeight: 600,
                      textDecoration: 'underline'
                    }}
                  >
                    {t('logout')}
                  </button>
                </div>
              </div>
              <div 
                style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '50%', 
                  backgroundColor: 'var(--primary-color)', 
                  color: 'white',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  boxShadow: '0 2px 5px rgba(0,74,153,0.2)'
                }}
              >
                {initials}
              </div>
            </div>
          </div>
        </header>
        <main className="content-wrapper">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
