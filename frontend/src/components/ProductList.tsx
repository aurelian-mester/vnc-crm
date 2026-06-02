import React, { useEffect, useState } from 'react';

interface Product {
  id: string;
  name: string;
  type: string;
  material: string;
  grammage: number;
  dimensions?: string;
}

const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const mockProducts: Product[] = [
      { id: "1", name: "Eco-Tissue 2-Ply", type: "Tissue", material: "Recycled Paper", grammage: 35 },
      { id: "2", name: "Testliner 125g", type: "PaperGrade", material: "Recycled Fiber", grammage: 125 },
      { id: "3", name: "Standard Shipping Box A", type: "CardboardBox", material: "Wellenstoff", grammage: 140, dimensions: "400x300x200" },
    ];
    setProducts(mockProducts);
  }, []);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2>Product Catalog & Prototypes</h2>
        <button style={{ 
          padding: '8px 16px', 
          backgroundColor: 'var(--accent-color)', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          + New Prototype
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {products.map(product => (
          <div key={product.id} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '15px' }}>
            <span style={{ 
              fontSize: '0.8rem', 
              backgroundColor: '#e1f5fe', 
              color: '#01579b', 
              padding: '2px 8px', 
              borderRadius: '10px',
              textTransform: 'uppercase'
            }}>
              {product.type}
            </span>
            <h3 style={{ margin: '10px 0' }}>{product.name}</h3>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>
              <p>Material: {product.material}</p>
              <p>Grammage: {product.grammage} g/m²</p>
              {product.dimensions && <p>Dims: {product.dimensions}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductList;
