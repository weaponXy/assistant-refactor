import React, { useEffect, useState } from "react";
import { fetchProducts } from "../inventory/fetchproducttable";
import "../stylecss/inventory.css";
import AddProduct from "../inventory/AddProduct";
import ViewProduct from "../inventory/ViewProduct";

const Inventory = () => {
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);

  const loadProducts = async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err) {
      console.error("Error loading products", err);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = products.filter((product) =>
    product.productname.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="inventory-page">
      <header className="header-bar">
        <h1 className="header-title">BuiswAIz</h1>
      </header>

      <div className="main-section">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="nav-section">
            <p className="nav-header">GENERAL</p>
            <ul>
              <li>Dashboard</li>
              <li className="active">Inventory</li>
              <li>Sales</li>
              <li>Expenses</li>
              <li>AI Assistant</li>
            </ul>
            <p className="nav-header">SUPPORT</p>
            <ul>
              <li>Help</li>
              <li>Settings</li>
            </ul>
          </div>
        </aside>

        {/* Main Content */}
        <div className="main-content">
          <div className="product-panel">
            <div className="panel-header">
              <h2 className="panel-title">Inventory</h2>
              <div className="panel-actions">
                <input className="inventory-search" type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <button className="add-product-button" onClick={() => setShowModal(true)}>
                  + Add Product
                </button>
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Price</th>
                    <th>Cost</th>
                    <th>Quantity</th>
                    <th>Supplier</th>
                    <th>Image</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, i) => (
                    <tr
                      key={product.productid || i}
                      onClick={() => setSelectedProduct(product)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{product.productname}</td>
                      <td>{product.productid}</td>
                      <td>{product.description}</td>
                      <td>{product.price}</td>
                      <td>{product.cost}</td>
                      <td>{product.currentstock}</td>
                      <td>{product.suppliers?.suppliername || "Unknown"}</td>
                      <td>
                        <div className="image-cell">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt="Product"
                              className="product-thumbnail"
                            />
                          ) : (
                            <div className="img-placeholder" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Panel */}
          <div className="right-panel">
            <div className="user-info-card">
              <div className="user-left">
                <div className="user-avatar" />
                <div className="user-username">person</div>
              </div>
              <button className="logout-button">Logout</button>
            </div>

            <div className="availability-panel">
              <h3>Product Availability</h3>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="availability-item">
                  <div className="img-placeholder" />
                  <div className="availability-details">
                    <span className="name">Product Name</span>
                    <span className="stock">4 pcs left</span>
                    <span className="time">1 hour ago</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="defective-panel">
              <div className="panel-title-row">
                <h3>Defective Item</h3>
                <button className="panel-action-button">+Add-Defect</button>
              </div>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="defective-item">
                  <div className="defectimg-placeholder" />
                  <div className="defective-details">
                    <span className="defect-name">Product Name</span>
                    <span className="Description">Description</span>
                    <span className="Quantity"># pcs left</span>
                    <span className="Status">In-progress</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="activity-panel">
              <h3>Recent Activity</h3>
              <ul>
                {[...Array(4)].map((_, i) => (
                  <li key={i} className="activity-item">
                    <span>removed a product</span>
                    <span className="time">2h ago</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <AddProduct
          onClose={() => {
            setShowModal(false);
            loadProducts(); 
          }}
        />
      )}

      {selectedProduct && (
        <ViewProduct
          product={selectedProduct}
          onClose={() => {
            setSelectedProduct(null);
            loadProducts();
          }}
        />
      )}
    </div>
  );
};

export default Inventory;
