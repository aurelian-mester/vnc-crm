import React from 'react';
import MainLayout from '../components/MainLayout';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProductConfigurator from './ProductConfigurator';
import CustomersPage from './CustomersPage';
import AdminPage from './AdminPage';
import SalesPage from './SalesPage';
import Dashboard from './Dashboard';
import ProductionBoard from '../components/ProductionBoard';
import LeadsPage from './LeadsPage';
import OpportunitiesPage from './OpportunitiesPage';
import ProjectsPage from './ProjectsPage';
import ClaimsPage from './ClaimsPage';
import TruckOptimizerPage from './TruckOptimizerPage';
import { parseJWT } from '../App';



// Route Guard Component for Role-Based Access Control
const RoleGuard = ({ 
  allowedRoles, 
  children 
}: { 
  allowedRoles: string[]; 
  children: React.ReactElement 
}) => {
  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const role = user?.role || localStorage.getItem('vnc_role') || "viewer";

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/crm/dashboard" replace />;
  }

  return children;
};

const InternalCRM: React.FC = () => {
  return (
    <MainLayout title="Management System">
      <Routes>
        <Route 
          path="dashboard" 
          element={
            <RoleGuard allowedRoles={['admin', 'sales', 'production', 'viewer', 'internal', 'management', 'sales_manager', 'rsm', 'asm', 'ai', 'quality']}>
              <Dashboard />
            </RoleGuard>
          } 
        />
        
        <Route 
          path="customers" 
          element={
            <RoleGuard allowedRoles={['admin', 'sales', 'asm', 'ai', 'rsm', 'sales_manager', 'management']}>
              <CustomersPage />
            </RoleGuard>
          } 
        />
        
        <Route 
          path="configurator" 
          element={
            <RoleGuard allowedRoles={['admin', 'sales', 'production', 'viewer', 'management', 'sales_manager', 'rsm', 'asm', 'ai', 'quality']}>
              <ProductConfigurator />
            </RoleGuard>
          } 
        />
        
        <Route 
          path="sales" 
          element={
            <RoleGuard allowedRoles={['admin', 'sales', 'asm', 'ai', 'rsm', 'sales_manager', 'management']}>
              <SalesPage />
            </RoleGuard>
          } 
        />
        
        <Route 
          path="production" 
          element={
            <RoleGuard allowedRoles={['admin', 'production', 'sales', 'viewer', 'management', 'sales_manager', 'rsm', 'asm', 'ai', 'quality']}>
              <ProductionBoard />
            </RoleGuard>
          } 
        />
        
        <Route 
          path="admin" 
          element={
            <RoleGuard allowedRoles={['admin', 'management', 'sales_manager', 'rsm']}>
              <AdminPage />
            </RoleGuard>
          } 
        />
        
        <Route 
          path="leads" 
          element={
            <RoleGuard allowedRoles={['admin', 'sales', 'asm', 'ai', 'rsm', 'sales_manager', 'management']}>
              <LeadsPage />
            </RoleGuard>
          } 
        />
        
        <Route 
          path="opportunities" 
          element={
            <RoleGuard allowedRoles={['admin', 'sales', 'asm', 'ai', 'rsm', 'sales_manager', 'management']}>
              <OpportunitiesPage />
            </RoleGuard>
          } 
        />

        <Route 
          path="projects" 
          element={
            <RoleGuard allowedRoles={['admin', 'sales', 'production', 'viewer', 'management', 'sales_manager', 'rsm', 'asm', 'ai', 'quality']}>
              <ProjectsPage />
            </RoleGuard>
          } 
        />

        <Route 
          path="claims" 
          element={
            <RoleGuard allowedRoles={['admin', 'quality', 'management', 'sales']}>
              <ClaimsPage />
            </RoleGuard>
          } 
        />

        <Route 
          path="truck-optimizer" 
          element={
            <RoleGuard allowedRoles={['admin', 'quality', 'management', 'sales', 'production', 'sales_manager', 'rsm', 'asm', 'ai']}>
              <TruckOptimizerPage />
            </RoleGuard>
          } 
        />

        <Route path="/" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </MainLayout>
  );
};

export default InternalCRM;
