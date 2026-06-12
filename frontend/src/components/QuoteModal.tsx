import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { parseJWT } from '../App';

interface Customer {
  id: string;
  name: string;
  customer_price_group: string;
  credit_limit: number;
  payment_terms_code: string;
  salesperson_code: string;
}

interface Product {
  id: string;
  description: string;
  unit_price: number;
  unit_cost: number;
}

interface QuoteItemInput {
  product_type: 'standard' | 'custom';
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  // Custom box config parameters
  length: number;
  width: number;
  height: number;
  material: string;
  printing: boolean;
  dieCutting: boolean;
  gluing: boolean;
  stapling: boolean;
}

interface QuoteModalProps {
  quoteId: number | null; // null if creating a new one
  preselectedCustomerId?: string;
  onClose: () => void;
  onSave: () => void;
}

const QuoteModal: React.FC<QuoteModalProps> = ({ quoteId, preselectedCustomerId, onClose, onSave }) => {
  const token = localStorage.getItem('vnc_token');
  const user = token ? parseJWT(token) : null;
  const role = user?.role || localStorage.getItem('vnc_role') || "viewer";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [materialsList, setMaterialsList] = useState<Product[]>([]);
  const [roleMargins, setRoleMargins] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomerId || '');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const { t } = useI18n();

  const RON_TO_EUR = 4.97;
  const formatPrice = (ronAmount: number, isLarge = false) => {
    const eurAmount = ronAmount / RON_TO_EUR;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: isLarge ? '1.25rem' : '0.95rem', fontWeight: 'bold' }}>
          {ronAmount.toFixed(2)} RON
        </span>
        <span style={{ fontSize: isLarge ? '0.85rem' : '0.75rem', color: '#666', fontWeight: 'normal' }}>
          (€{eurAmount.toFixed(2)})
        </span>
      </span>
    );
  };


  
  const [items, setItems] = useState<QuoteItemInput[]>([
    {
      product_type: 'standard',
      product_id: '',
      description: '',
      quantity: 100,
      unit_price: 0,
      length: 400,
      width: 300,
      height: 200,
      material: 'Testliner',
      printing: false,
      dieCutting: false,
      gluing: true,
      stapling: false
    }
  ]);
  const [discount, setDiscount] = useState(0);
  const [status, setStatus] = useState('Draft');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Versions state
  interface QuoteVersion {
    version: number;
    status: string;
    total_amount: number;
    created_at: string;
  }
  const [versions, setVersions] = useState<QuoteVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const fetchVersions = () => {
    if (!quoteId) return;
    setLoadingVersions(true);
    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/quotes/${quoteId}/versions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => {
        setVersions(data || []);
        setLoadingVersions(false);
      })
      .catch(err => {
        console.error('Failed to fetch versions', err);
        setLoadingVersions(false);
      });
  };

  const fetchQuoteDetails = () => {
    setLoading(true);
    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/quotes/${quoteId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then((q) => {
        setSelectedCustomerId(q.customer_id);
        setStatus(q.status);
        // Map saved quote items to inputs
        if (q.items && q.items.length > 0) {
          const mappedItems: QuoteItemInput[] = q.items.map((it: any) => {
            let config = {
              length: 400,
              width: 300,
              height: 200,
              material: 'Testliner',
              printing: false,
              dieCutting: false,
              gluing: true,
              stapling: false
            };
            if (it.config_params) {
              try {
                config = JSON.parse(it.config_params);
              } catch (e) {
                console.error('Failed to parse item config', e);
              }
            }
            return {
              product_type: it.product_id ? 'standard' : 'custom',
              product_id: it.product_id || '',
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              ...config
            };
          });
          setItems(mappedItems);
        }
        fetchVersions();
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load quote details', err);
        setLoading(false);
      });
  };

  const handleRestoreVersion = (versionNum: number) => {
    if (!window.confirm(t('confirm_restore_version', { version: versionNum }))) return;
    
    setLoading(true);
    const token = localStorage.getItem('vnc_token');
    fetch(`/vnc-crm/api/quotes/${quoteId}/versions/${versionNum}/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(() => {
        fetchQuoteDetails();
      })
      .catch(err => {
        console.error('Failed to restore version', err);
        setLoading(false);
      });
  };

  // Fetch initial configuration data
  useEffect(() => {
    setLoading(true);
    const token = localStorage.getItem('vnc_token');

    // Fetch allowed role margins
    fetch('/vnc-crm/api/auth/margins', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(marginsData => {
        setRoleMargins(marginsData || []);
      })
      .catch(err => console.error('Failed to load margins list', err));

    // Fetch board grades
    fetch('/vnc-crm/api/products?category=board_grades', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(materialsData => {
        setMaterialsList(materialsData || []);
      })
      .catch(err => console.error('Failed to load board grades list', err));

    // Fetch customers list
    fetch('/vnc-crm/api/customers', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(customersData => {
        setCustomers(customersData || []);
        
        // If editing a quote, fetch its details
        if (quoteId) {
          fetchQuoteDetails();
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load customers list', err);
        setLoading(false);
      });
  }, [quoteId]);

  // Fetch customer-specific products when selectedCustomerId changes
  useEffect(() => {
    if (!selectedCustomerId) {
      setProductsList([]);
      return;
    }
    const token = localStorage.getItem('vnc_token');
    setLoading(true);
    fetch(`/vnc-crm/api/products?customer_id=${selectedCustomerId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => {
        setProductsList(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load customer-specific product catalog', err);
        setLoading(false);
      });
  }, [selectedCustomerId]);

  // Set selected customer data when ID changes
  useEffect(() => {
    const cust = customers.find(c => c.id === selectedCustomerId);
    setSelectedCustomer(cust || null);
  }, [selectedCustomerId, customers]);

  const handleAddItemRow = () => {
    setItems([
      ...items,
      {
        product_type: 'standard',
        product_id: '',
        description: '',
        quantity: 100,
        unit_price: 0,
        length: 400,
        width: 300,
        height: 200,
        material: 'Testliner',
        printing: false,
        dieCutting: false,
        gluing: true,
        stapling: false
      }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, idx) => idx !== index));
    }
  };

  const handleItemTypeChange = (index: number, type: 'standard' | 'custom') => {
    const updated = [...items];
    updated[index].product_type = type;
    updated[index].product_id = '';
    updated[index].description = '';
    updated[index].unit_price = 0;
    setItems(updated);
  };

  const handleStandardProductSelect = (index: number, prodId: string) => {
    const updated = [...items];
    const prod = productsList.find(p => p.id === prodId);
    if (prod) {
      updated[index].product_id = prod.id;
      updated[index].description = prod.description;
      
      // Attempt to check if customer has a price group and verify pricing
      const token = localStorage.getItem('vnc_token');
      const group = selectedCustomer?.customer_price_group || '';
      
      setLoading(true);
      fetch('/vnc-crm/api/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          material: prod.id,
          quantity: updated[index].quantity,
          customer_price_group: group,
          customer_id: selectedCustomerId,
          // Box dimensions are zero for standard items
          length: 0, width: 0, height: 0
        })
      })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => {
        updated[index].unit_price = data.unitPrice || prod.unit_price;
        setItems(updated);
        setLoading(false);
      })
      .catch(() => {
        updated[index].unit_price = prod.unit_price;
        setItems(updated);
        setLoading(false);
      });
    }
  };

  const calculateCustomBoxPrice = (index: number) => {
    const it = items[index];
    const token = localStorage.getItem('vnc_token');
    const group = selectedCustomer?.customer_price_group || '';

    fetch('/vnc-crm/api/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        length: it.length,
        width: it.width,
        height: it.height,
        quantity: it.quantity,
        material: it.material,
        printing: it.printing,
        dieCutting: it.dieCutting,
        gluing: it.gluing,
        stapling: it.stapling,
        customer_price_group: group,
        customer_id: selectedCustomerId
      })
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => {
        const updated = [...items];
        updated[index].unit_price = data.unitPrice || 0;
        updated[index].description = `Custom Box (${it.length}x${it.width}x${it.height}mm) - ${it.material}`;
        setItems(updated);
      })
      .catch(err => console.error('Pricing calculation failed', err));
  };

  const handleParamChange = (index: number, field: keyof QuoteItemInput, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);

    // Re-trigger pricing for custom packaging box
    if (updated[index].product_type === 'custom') {
      calculateCustomBoxPrice(index);
    }
  };

  // Calculations
  const getItemProductionUnitCost = (it: QuoteItemInput) => {
    if (it.product_type === 'standard') {
      const prod = productsList.find(p => p.id === it.product_id);
      if (prod) {
        return prod.unit_cost || (it.unit_price * 0.7);
      }
      return it.unit_price * 0.7;
    } else {
      // Custom box
      const length = it.length;
      const width = it.width;
      const height = it.height;
      const quantity = it.quantity || 1;
      const material = it.material;
      const printing = it.printing;
      const dieCutting = it.dieCutting;
      const gluing = it.gluing;
      const stapling = it.stapling;

      const surfaceArea = 2.0 * (length * width + length * height + width * height) / 1000000.0;
      
      const mat = materialsList.find(m => m.id === material);
      let materialPricePerSQM = mat ? mat.unit_price : 0.80;
      if (!mat) {
        switch (material) {
          case 'Testliner': materialPricePerSQM = 0.80; break;
          case 'Schrenz': materialPricePerSQM = 0.60; break;
          case 'Wellenstoff': materialPricePerSQM = 0.70; break;
          default: materialPricePerSQM = 0.80;
        }
      }

      const basePrice = surfaceArea * materialPricePerSQM * quantity;
      let operationPrice = 0.0;
      if (printing) operationPrice += 0.10 * quantity;
      if (dieCutting) operationPrice += 0.05 * quantity;
      if (gluing) operationPrice += 0.03 * quantity;
      if (stapling) operationPrice += 0.02 * quantity;

      const totalPrice = basePrice + operationPrice;
      const estProductionCost = totalPrice * 0.7;
      return estProductionCost / quantity;
    }
  };

  const activeMarginConfig = roleMargins.find(m => m.role === role) || { min_margin: 10.0, max_margin: 20.0 };
  const minM = activeMarginConfig.min_margin;
  const maxM = activeMarginConfig.max_margin;

  const violatingItems = items.map((it, index) => {
    if (it.unit_price <= 0) return null;
    const cost = getItemProductionUnitCost(it);
    const margin = ((it.unit_price - cost) / it.unit_price) * 100;
    const isViolated = margin < minM || margin > maxM;
    return isViolated ? { index, margin, description: it.description || `${t('custom_packaging_box')} (${it.length}x${it.width}x${it.height})` } : null;
  }).filter(v => v !== null) as { index: number; margin: number; description: string }[];

  const isQuoteViolated = violatingItems.length > 0;

  const subtotal = items.reduce((acc, it) => acc + (it.quantity * it.unit_price), 0);
  const discountAmount = subtotal * (discount / 100);
  const total = subtotal - discountAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      alert(t('select_customer_alert'));
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem('vnc_token');

    // Structure quote payload
    const payload = {
      customer_id: selectedCustomerId,
      salesperson_code: selectedCustomer?.salesperson_code || 'AM',
      status: status,
      items: items.map(it => ({
        product_id: it.product_type === 'standard' ? it.product_id : '',
        description: it.description || 'Custom Packaging Box',
        quantity: it.quantity,
        unit_price: it.unit_price,
        config_params: it.product_type === 'custom' ? JSON.stringify({
          length: it.length,
          width: it.width,
          height: it.height,
          material: it.material,
          printing: it.printing,
          dieCutting: it.dieCutting,
          gluing: it.gluing,
          stapling: it.stapling
        }) : ''
      }))
    };

    const url = quoteId ? `/vnc-crm/api/quotes/${quoteId}` : '/vnc-crm/api/quotes';
    const method = quoteId ? 'PUT' : 'POST';

    fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(() => {
        setSubmitting(false);
        onSave();
      })
      .catch(err => {
        console.error('Failed to save quote', err);
        setSubmitting(false);
      });
  };

  const getStatusTranslation = (statusStr: string) => {
    switch (statusStr.toLowerCase()) {
      case 'approved': return t('approved');
      case 'sent': return t('sent');
      case 'declined': return t('declined');
      default: return t('draft');
    }
  };

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', color: 'white' }}>
        <div style={{ background: '#fff', color: '#1f2d3d', padding: '30px', borderRadius: '8px', textAlign: 'center' }}>
          <h4>{t('loading_form_details')}</h4>
          <div style={{ width: '30px', height: '30px', border: '3px solid #eee', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', margin: '15px auto 0 auto', animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '20px', overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', width: '100%', maxWidth: '1000px', borderRadius: '12px', boxShadow: '0 15px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 30px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--secondary-color)' }}>
            {quoteId ? t('edit_quote_num', { id: quoteId }) : t('create_new_sales_quote')}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: 1, padding: '30px' }}>
          <div style={{ display: 'flex', gap: '30px', flex: 1, alignItems: 'stretch' }}>
            <div style={{ flex: quoteId ? 2.3 : 1, display: 'flex', flexDirection: 'column' }}>
          
          {/* Customer Selection Info Block */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px', padding: '20px', backgroundColor: 'var(--bg-color)', borderRadius: '8px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px', fontWeight: 600 }}>{t('select_customer')}</label>
              <select 
                value={selectedCustomerId} 
                onChange={e => setSelectedCustomerId(e.target.value)}
                style={{ width: '100%', padding: '10px' }}
                disabled={!!quoteId} // Lock customer selection on edit
                required
              >
                <option value="">{t('choose_synced_customer')}</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                ))}
              </select>
            </div>

            {selectedCustomer && (
              <>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('price_list_group')}</label>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '4px' }}>
                    {selectedCustomer.customer_price_group || t('standard_pricing')}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('payment_terms')}</label>
                  <div style={{ fontSize: '1rem', fontWeight: 600, marginTop: '4px' }}>
                    {selectedCustomer.payment_terms_code || 'Immediate'}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('credit_limit')}</label>
                  <div style={{ fontSize: '1rem', fontWeight: 600, marginTop: '4px' }}>
                    {new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(selectedCustomer.credit_limit || 0)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Items Configuration Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <h4 style={{ margin: 0, color: 'var(--secondary-color)' }}>{t('offer_items')}</h4>
              <button type="button" onClick={handleAddItemRow} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>{t('add_item')}</button>
            </div>

            {items.map((it, idx) => (
              <div key={idx} style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '8px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <button 
                  type="button" 
                  onClick={() => handleRemoveItemRow(idx)} 
                  style={{ position: 'absolute', right: '15px', top: '15px', background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: '1.1rem' }}
                  disabled={items.length === 1}
                >
                  {t('remove')}
                </button>

                {/* Grid row 1: Type Selection */}
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 120px 120px 140px', gap: '15px', alignItems: 'end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('product_type')}</label>
                    <select 
                      value={it.product_type} 
                      onChange={e => handleItemTypeChange(idx, e.target.value as 'standard' | 'custom')}
                      style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                    >
                      <option value="standard">{t('standard_sync_product')}</option>
                      <option value="custom">{t('custom_packaging_box')}</option>
                    </select>
                  </div>

                  {it.product_type === 'standard' ? (
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('select_product')}</label>
                      <select 
                        value={it.product_id} 
                        onChange={e => handleStandardProductSelect(idx, e.target.value)}
                        style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                        required
                      >
                        <option value="">{t('choose_product')}</option>
                        {productsList.map(p => (
                          <option key={p.id} value={p.id}>{p.description} ({p.id})</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('material_grade')}</label>
                      <select 
                        value={it.material} 
                        onChange={e => handleParamChange(idx, 'material', e.target.value)}
                        style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                      >
                        <option value="">{t('choose_material')}</option>
                        {materialsList.map(m => (
                          <option key={m.id} value={m.id}>{m.description || m.id} ({m.id})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('quantity')}</label>
                    <input 
                      type="number" 
                      value={it.quantity} 
                      onChange={e => handleParamChange(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                      style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('unit_price')}</label>
                    <input 
                      type="number" 
                      step="0.0001"
                      value={it.unit_price} 
                      onChange={e => handleParamChange(idx, 'unit_price', Number(e.target.value))}
                      style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                      required
                    />
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>{t('line_total')}</label>
                    <span style={{ display: 'block', marginTop: '10px' }}>
                      {formatPrice(it.quantity * it.unit_price)}
                    </span>
                    {it.unit_price > 0 && (() => {
                      const cost = getItemProductionUnitCost(it);
                      const margin = ((it.unit_price - cost) / it.unit_price) * 100;
                      const isItemViolated = margin < minM || margin > maxM;
                      return (
                        <div style={{ fontSize: '0.78rem', color: isItemViolated ? '#ff4d4f' : '#2ecc71', fontWeight: 'bold', marginTop: '4px' }}>
                          {t('sales_margin')}: {margin.toFixed(1)}%
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Custom Box configuration fields (shown only when product type is custom) */}
                {it.product_type === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', backgroundColor: 'var(--kraft-bg, #fdfaf7)', padding: '15px', borderRadius: '6px', border: '1px solid var(--kraft-accent-light, #fbf2e3)' }}>
                    <h5 style={{ margin: 0, color: '#8a6d3b' }}>{t('dimensions_finishing')}</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#8a6d3b' }}>{t('length_mm')}</label>
                        <input type="number" value={it.length} onChange={e => handleParamChange(idx, 'length', Number(e.target.value))} style={{ width: '100%', padding: '6px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#8a6d3b' }}>{t('width_mm')}</label>
                        <input type="number" value={it.width} onChange={e => handleParamChange(idx, 'width', Number(e.target.value))} style={{ width: '100%', padding: '6px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#8a6d3b' }}>{t('height_mm')}</label>
                        <input type="number" value={it.height} onChange={e => handleParamChange(idx, 'height', Number(e.target.value))} style={{ width: '100%', padding: '6px' }} />
                      </div>
                      
                      <div style={{ gridColumn: 'span 2', display: 'flex', gap: '12px', alignItems: 'center', marginTop: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', color: '#2f3542' }}>
                          <input type="checkbox" checked={it.printing} onChange={e => handleParamChange(idx, 'printing', e.target.checked)} /> {t('print')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', color: '#2f3542' }}>
                          <input type="checkbox" checked={it.dieCutting} onChange={e => handleParamChange(idx, 'dieCutting', e.target.checked)} /> {t('die_cut')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', color: '#2f3542' }}>
                          <input type="checkbox" checked={it.gluing} onChange={e => handleParamChange(idx, 'gluing', e.target.checked)} /> {t('gluing')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', color: '#2f3542' }}>
                          <input type="checkbox" checked={it.stapling} onChange={e => handleParamChange(idx, 'stapling', e.target.checked)} /> {t('staple')}
                        </label>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>

          {/* Status & Pricing totals footer */}
          <div style={{ marginTop: '40px', borderTop: '2px solid var(--border-color)', paddingTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px', alignItems: 'end' }}>
            
            {/* Status Option dropdown */}
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>{t('offer_status')}</label>
              <select 
                value={status} 
                onChange={e => setStatus(e.target.value)}
                style={{ width: '200px', padding: '10px' }}
              >
                <option value="Draft">{t('draft')}</option>
                <option value="Sent">{t('sent_reviewing')}</option>
                <option value="Approved">{t('approved_won')}</option>
                <option value="Declined">{t('declined_lost')}</option>
              </select>
            </div>

            {/* Price Calculations */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '400px', marginLeft: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', alignItems: 'center' }}>
                <span>{t('items_subtotal')}</span>
                {formatPrice(subtotal)}
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.95rem' }}>
                <span>{t('manual_discount')}</span>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={discount}
                  onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                  style={{ width: '80px', padding: '4px 8px', textAlign: 'right' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.3rem', color: 'var(--primary-color)', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '10px' }}>
                <span>{t('total_price_upper')}</span>
                {formatPrice(total, true)}
              </div>
            </div>
            </div>
          </div>

            {/* Version History Sidebar (shown only when editing) */}
            {quoteId && (
              <div style={{ flex: 1, borderLeft: '1px solid var(--border-color)', paddingLeft: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h4 style={{ margin: 0, color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {t('version_history')}
                </h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {t('restore_version_warning')}
                </p>

                {loadingVersions ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '20px 0' }}>{t('loading_archives')}</div>
                ) : versions.length === 0 ? (
                  <div style={{ padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('no_archived_versions')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '55vh' }}>
                    {versions.map(v => (
                      <div 
                        key={v.version} 
                        style={{
                          padding: '12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          backgroundColor: '#fafafa',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                            {t('version_num', { version: v.version })}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {new Date(v.created_at).toLocaleDateString('ro-RO')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <span>
                            {formatPrice(v.total_amount)}
                          </span>
                          <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: 'var(--text-muted)' }}>
                            {getStatusTranslation(v.status)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRestoreVersion(v.version)}
                          style={{
                            marginTop: '5px',
                            padding: '6px',
                            backgroundColor: 'white',
                            border: '1px solid var(--primary-color)',
                            color: 'var(--primary-color)',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {t('restore_version')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submission Buttons */}
          {isQuoteViolated && (
            <div style={{
              margin: '20px 0 0 0',
              padding: '15px 20px',
              backgroundColor: '#fde8e8',
              border: '1px solid #f8b4b4',
              borderRadius: '8px',
              color: '#9b1c1c',
              fontSize: '0.9rem',
              fontWeight: 500
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>⚠️ {t('sales_margin_violation_title')}</div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {violatingItems.map(vi => (
                  <li key={vi.index}>
                    {t('sales_margin_violation_item', { 
                      item: vi.description, 
                      margin: vi.margin.toFixed(1),
                      min: minM.toFixed(1),
                      max: maxM.toFixed(1)
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '35px' }}>
            <button type="button" onClick={onClose} className="btn-primary" style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)', boxShadow: 'none' }}>
              {t('cancel')}
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={submitting || isQuoteViolated} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                background: isQuoteViolated ? '#ccc' : 'linear-gradient(135deg, var(--kraft-accent) 0%, #a07850 100%)',
                cursor: isQuoteViolated ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? t('saving_offer') : (quoteId ? t('save_changes') : t('save_offer'))}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default QuoteModal;
