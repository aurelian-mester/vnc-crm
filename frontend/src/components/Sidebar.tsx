import React from 'react';
import { NavLink } from 'react-router-dom';
import { VncCrmLogo } from './Logos';
import { parseJWT } from '../App';
import { useI18n } from '../i18n';

const Sidebar: React.FC = () => {
  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const role = user?.role || localStorage.getItem('vnc_role') || "viewer";
  const { t } = useI18n();

  const allMenuItems = [
    { name: 'Dashboard', path: '/crm/dashboard', roles: ['admin', 'sales', 'production', 'viewer'] },
    { name: 'Leads', path: '/crm/leads', roles: ['admin', 'sales'] },
    { name: 'Opportunities', path: '/crm/opportunities', roles: ['admin', 'sales'] },
    { name: 'Customers', path: '/crm/customers', roles: ['admin', 'sales'] },
    { name: 'Configurator', path: '/crm/configurator', roles: ['admin', 'sales', 'production', 'viewer'] },
    { name: 'Sales', path: '/crm/sales', roles: ['admin', 'sales'] },
    { name: 'Projects', path: '/crm/projects', roles: ['admin', 'sales', 'production', 'viewer'] },
    { name: 'Production', path: '/crm/production', roles: ['admin', 'production'] },
    { name: 'Admin', path: '/crm/admin', roles: ['admin'] },
  ];

  // Filter menu items by user role
  const visibleMenuItems = allMenuItems.filter((item) => item.roles.includes(role));

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <VncCrmLogo />
      </div>
      <div className="sidebar-menu">
        {visibleMenuItems.map((item) => (
          <NavLink 
            key={item.path} 
            to={item.path} 
            className={({ isActive }) => isActive ? "menu-item active" : "menu-item"}
          >
            {t(item.name)}
          </NavLink>
        ))}
      </div>
      <div style={{ padding: '20px', fontSize: '0.8rem', color: '#7f8c8d' }}>
        v1.0.0-staging
      </div>
    </div>
  );
};

export default Sidebar;
