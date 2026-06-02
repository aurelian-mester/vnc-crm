import React from 'react';

export const VrancartLogo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="20" fill="#004a99"/>
      <path d="M30 30L50 70L70 30" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M40 50H60" stroke="white" strokeWidth="4" strokeLinecap="round"/>
    </svg>
    <span style={{ fontWeight: 800, fontSize: '1.4rem', color: '#004a99' }}>VRANCART</span>
  </div>
);

export const VncCrmLogo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
    <svg width="30" height="30" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="45" stroke="white" strokeWidth="8"/>
      <path d="M35 50L45 60L65 40" stroke="#27ae60" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <span style={{ fontWeight: 600, fontSize: '1.1rem', color: '#ecf0f1', letterSpacing: '1px' }}>CRM</span>
  </div>
);
