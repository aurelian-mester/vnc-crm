import React, { useState } from 'react';
import CustomerList from '../components/CustomerList';
import CustomerDetail from '../components/CustomerDetail';
import { useI18n } from '../i18n';

const CustomersPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('list');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  
  const { t } = useI18n();

  // If a customer is clicked, render their detail dashboard directly
  if (selectedCustomer) {
    return (
      <div className="card" style={{ padding: '30px' }}>
        <CustomerDetail 
          customer={selectedCustomer} 
          onBack={() => setSelectedCustomer(null)} 
        />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="tabs-container">
        <div className={`tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>
          {t('customer_list')}
        </div>
        <div className={`tab ${activeTab === 'interactions' ? 'active' : ''}`} onClick={() => setActiveTab('interactions')}>
          {t('recent_interactions')}
        </div>
        <div className={`tab ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>
          {t('geographic_distribution')}
        </div>
      </div>

      <div className="tab-content">
        {activeTab === 'list' && (
          <CustomerList onSelectCustomer={(c) => setSelectedCustomer(c)} />
        )}
        {activeTab === 'interactions' && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
            {t('interactions_log_placeholder')}
          </div>
        )}
        {activeTab === 'map' && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
            {t('locations_map_placeholder')}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomersPage;
