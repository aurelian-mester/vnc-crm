import React from 'react';

const Login: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Vrancart Platform Login</h1>
      <button onClick={() => window.location.href = '/vnc-crm/api/auth/login'}>Login (Internal Staff)</button>
      <br/>
      <button onClick={() => alert('Custom Auth Placeholder')}>Login (B2B Portal)</button>
    </div>
  );
};

export default Login;
