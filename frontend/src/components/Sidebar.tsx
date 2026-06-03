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
    { name: 'Dashboard', path: '/crm/dashboard', roles: ['admin', 'sales', 'production', 'viewer', 'management', 'sales_manager', 'rsm', 'asm', 'ai', 'quality'] },
    { name: 'Leads', path: '/crm/leads', roles: ['admin', 'sales', 'asm', 'ai', 'rsm', 'sales_manager', 'management'] },
    { name: 'Opportunities', path: '/crm/opportunities', roles: ['admin', 'sales', 'asm', 'ai', 'rsm', 'sales_manager', 'management'] },
    { name: 'Customers', path: '/crm/customers', roles: ['admin', 'sales', 'asm', 'ai', 'rsm', 'sales_manager', 'management'] },
    { name: 'Configurator', path: '/crm/configurator', roles: ['admin', 'sales', 'production', 'viewer', 'management', 'sales_manager', 'rsm', 'asm', 'ai', 'quality'] },
    { name: 'Sales', path: '/crm/sales', roles: ['admin', 'sales', 'asm', 'ai', 'rsm', 'sales_manager', 'management'] },
    { name: 'Projects', path: '/crm/projects', roles: ['admin', 'sales', 'production', 'viewer', 'management', 'sales_manager', 'rsm', 'asm', 'ai', 'quality'] },
    { name: 'Production', path: '/crm/production', roles: ['admin', 'production', 'sales', 'viewer', 'management', 'sales_manager', 'rsm', 'asm', 'ai', 'quality'] },
    { name: 'QA & Claims', path: '/crm/claims', roles: ['admin', 'quality', 'management', 'sales'] },
    { name: 'Load Optimizer', path: '/crm/truck-optimizer', roles: ['admin', 'quality', 'management', 'sales', 'production', 'sales_manager', 'rsm', 'asm', 'ai'] },
    { name: 'Admin', path: '/crm/admin', roles: ['admin', 'management', 'sales_manager', 'rsm'] },
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
