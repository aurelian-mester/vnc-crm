import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import InternalCRM from './pages/InternalCRM';
import ExternalB2B from './pages/ExternalB2B';
import Login from './pages/Login';
import { I18nProvider } from './i18n';

interface JWTPayload {
  email: string;
  name: string;
  role: string;
  customer_id?: string;
  locale?: string;
  exp: number;
}

// Utility to safely parse JWT payload on client side
export const parseJWT = (token: string): JWTPayload | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

// Enhanced Auth Hook
const useAuth = () => {
  const token = localStorage.getItem('vnc_token');
  let isAuthenticated = false;
  let role = localStorage.getItem('vnc_role') || null;

  if (token) {
    const payload = parseJWT(token);
    if (payload && payload.exp * 1000 > Date.now()) {
      isAuthenticated = true;
    } else {
      // Token is expired or invalid! Clear localStorage auth keys.
      localStorage.removeItem('vnc_token');
      localStorage.removeItem('vnc_role');
      localStorage.removeItem('vnc_name');
      localStorage.removeItem('vnc_email');
      role = null;
    }
  }

  const [auth, setAuth] = useState<{ isAuthenticated: boolean; role: string | null }>({
    isAuthenticated,
    role,
  });

  return { ...auth, setAuth };
};

// Component to capture token from URL and parse it
const TokenHandler = ({ setAuth }: { setAuth: any }) => {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('vnc_token', token);
      const payload = parseJWT(token);
      if (payload) {
        localStorage.setItem('vnc_role', payload.role);
        localStorage.setItem('vnc_name', payload.name);
        localStorage.setItem('vnc_email', payload.email);
        if (payload.locale) {
          localStorage.setItem('vnc_locale', payload.locale);
        }
        setAuth({ isAuthenticated: true, role: payload.role });
      } else {
        // Fallback if parsing fails
        localStorage.setItem('vnc_role', 'viewer');
        setAuth({ isAuthenticated: true, role: 'viewer' });
      }
      // Clean up URL parameters
      window.history.replaceState({}, document.title, "/vnc-crm/");
    }
  }, [location, setAuth]);

  return null;
};

function App() {
  const { isAuthenticated, role, setAuth } = useAuth();

  const isInternal = isAuthenticated && ['admin', 'sales', 'production', 'viewer', 'internal'].includes(role || '');
  const isExternal = isAuthenticated && role === 'external';

  return (
    <I18nProvider>
      <BrowserRouter basename="/vnc-crm">
        <TokenHandler setAuth={setAuth} />
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Internal Staff CRM Route */}
          <Route 
            path="/crm/*" 
            element={isInternal ? <InternalCRM /> : <Navigate to="/login" />} 
          />
          
          {/* External B2B Customer Portal Route */}
          <Route 
            path="/portal/*" 
            element={isExternal ? <ExternalB2B /> : <Navigate to="/login" />} 
          />
          
          {/* Default route redirects based on role, or to login */}
          <Route 
            path="/" 
            element={
              isAuthenticated 
                ? <Navigate to={isInternal ? "/crm" : "/portal"} /> 
                : <Navigate to="/login" />
            } 
          />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}

export default App;
