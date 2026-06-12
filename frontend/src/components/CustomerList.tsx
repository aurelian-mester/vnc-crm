import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface Customer {
  id: string;
  name: string;
  email: string;
  city: string;
  address: string;
  county: string;
  contact: string;
  phone: string;
  registration_no: string;
  vat_registration_no: string;
  payment_terms_code: string;
  salesperson_code: string;
  credit_limit: number;
  blocked: string;
  post_code: string;
  commerce_trade_no: string;
  total_quantity_tons: number;
  main_competitor: string;
  main_competitor_volume: number;
  potential: string;
  cardboard_utilization_category: string;
}

interface CustomerListProps {
  onSelectCustomer: (customer: Customer) => void;
}

interface ColumnOption {
  key: keyof Customer;
  label: string;
}

const CustomerList: React.FC<CustomerListProps> = ({ onSelectCustomer }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showColDropdown, setShowColDropdown] = useState(false);
  const { t } = useI18n();

  // Load visible columns from LocalStorage (persisting user preference)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('vnc_customer_columns');
    return saved ? JSON.parse(saved) : ['id', 'name', 'email', 'city', 'address', 'county'];
  });

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    id: '',
    name: '',
    email: '',
    city: '',
    address: '',
    county: ''
  });

  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer | ''; direction: 'asc' | 'desc' | null }>({
    key: '',
    direction: null
  });

  // Save visible columns to LocalStorage on change
  useEffect(() => {
    localStorage.setItem('vnc_customer_columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  useEffect(() => {
    const token = localStorage.getItem('vnc_token');
    fetch('/vnc-crm/api/customers', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then((res) => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then((data) => {
        setCustomers(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch customers', err);
        setLoading(false);
      });
  }, []);

  const handleSort = (key: keyof Customer) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') direction = null;
    }
    setSortConfig({ key: direction ? key : '', direction });
  };

  const toggleColumn = (key: string) => {
    if (visibleColumns.includes(key)) {
      // Keep at least one column visible
      if (visibleColumns.length > 1) {
        setVisibleColumns(visibleColumns.filter((col) => col !== key));
      }
    } else {
      setVisibleColumns([...visibleColumns, key]);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setColumnFilters({ ...columnFilters, [key]: value });
  };

  const columns: ColumnOption[] = [
    { key: 'id', label: t('id_code') },
    { key: 'name', label: t('name') },
    { key: 'email', label: t('email_address') },
    { key: 'city', label: t('city') },
    { key: 'address', label: t('billing_address') },
    { key: 'county', label: t('county') }
  ];

  // Filtering and Sorting logic
  const filteredCustomers = customers
    .filter((c) => {
      // 1. Global Search Box Filter
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        c.id.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.city.toLowerCase().includes(term) ||
        (c.address && c.address.toLowerCase().includes(term)) ||
        (c.county && c.county.toLowerCase().includes(term));
      
      if (!matchesSearch) return false;

      // 2. Individual Column Filters
      for (const [key, value] of Object.entries(columnFilters)) {
        if (value) {
          const fieldVal = (c[key as keyof Customer] ?? '').toString().toLowerCase();
          if (!fieldVal.includes(value.toLowerCase())) {
            return false;
          }
        }
      }

      return true;
    })
    .sort((a, b) => {
      // 3. Sorting Logic
      if (!sortConfig.key || !sortConfig.direction) return 0;
      
      const key = sortConfig.key;
      const valA = (a[key] || '').toString().toLowerCase();
      const valB = (b[key] || '').toString().toLowerCase();

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>{t('loading_customers')}</div>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div>
      {/* Grid Controls (Search & Column Configurator) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '20px', flexWrap: 'wrap' }}>
        
        {/* Global Search Box */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
          <input 
            type="text" 
            placeholder={t('search_customers_placeholder')} 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              width: '100%', 
              maxWidth: '400px', 
              padding: '10px 16px', 
              boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
            }} 
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              style={{ background: 'none', border: 'none', color: '#d63031', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
            >
              {t('clear')}
            </button>
          )}
        </div>

        {/* Column Manager Dropdown Menu */}
        <div style={{ position: 'relative' }}>
          <button 
            className="btn-primary"
            onClick={() => setShowColDropdown(!showColDropdown)}
            style={{ 
              background: 'none', 
              color: 'var(--text-main)', 
              border: '1px solid var(--border-color)', 
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            ⚙ {t('columns_visibility')} {showColDropdown ? '▲' : '▼'}
          </button>
          
          {showColDropdown && (
            <div 
              style={{ 
                position: 'absolute', 
                right: 0, 
                top: '45px', 
                backgroundColor: 'white', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px', 
                padding: '15px', 
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
                zIndex: 100, 
                minWidth: '200px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <h5 style={{ margin: '0 0 5px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px', color: 'var(--text-muted)' }}>{t('show_columns')}</h5>
              {columns.map((col) => (
                <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes(col.key)} 
                    onChange={() => toggleColumn(col.key)} 
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Database Grid Table */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <table style={{ minWidth: '800px' }}>
          <thead>
            {/* Headers with Sorting */}
            <tr style={{ backgroundColor: 'var(--bg-color)' }}>
              {columns.map((col) => {
                if (!visibleColumns.includes(col.key)) return null;
                const isSorted = sortConfig.key === col.key;
                return (
                  <th 
                    key={col.key} 
                    onClick={() => handleSort(col.key)} 
                    style={{ 
                      cursor: 'pointer', 
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      padding: '15px 20px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{col.label}</span>
                      <span style={{ fontSize: '0.8rem', color: isSorted ? 'var(--primary-color)' : 'var(--text-muted)' }}>
                        {isSorted ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
            
            {/* Row of Column-Level Filters */}
            <tr style={{ backgroundColor: '#fff', borderBottom: '2px solid var(--border-color)' }}>
              {columns.map((col) => {
                if (!visibleColumns.includes(col.key)) return null;
                return (
                  <td key={`filter-${col.key}`} style={{ padding: '8px 12px', borderBottom: '2px solid var(--border-color)' }}>
                    <input 
                      type="text" 
                      placeholder={`${t('filter')} ${col.label}...`}
                      value={columnFilters[col.key] || ''}
                      onChange={(e) => handleFilterChange(col.key, e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '6px 10px', 
                        fontSize: '0.8rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={columns.filter(c => visibleColumns.includes(c.key)).length} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  {t('no_customers_found')}
                </td>
              </tr>
            ) : (
              filteredCustomers.map((c) => (
                <tr 
                  key={c.id} 
                  onClick={() => onSelectCustomer(c)}
                  style={{ 
                    cursor: 'pointer',
                    transition: 'background-color 0.15s'
                  }}
                  className="table-row"
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 74, 153, 0.015)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {visibleColumns.includes('id') && (
                    <td style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{c.id}</td>
                  )}
                  {visibleColumns.includes('name') && (
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                  )}
                  {visibleColumns.includes('email') && (
                    <td style={{ color: 'var(--text-muted)' }}>{c.email || '-'}</td>
                  )}
                  {visibleColumns.includes('city') && (
                    <td>{c.city || '-'}</td>
                  )}
                  {visibleColumns.includes('address') && (
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{c.address || '-'}</td>
                  )}
                  {visibleColumns.includes('county') && (
                    <td>{c.county || '-'}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerList;
