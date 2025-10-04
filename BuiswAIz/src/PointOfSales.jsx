import React from 'react';
import { useNavigate } from 'react-router-dom';
import "./stylecss/PointOfSales.css";
import "./stylecss/Dashboard/Dashboard.css";

const PointOfSales = () => {
  const navigate = useNavigate();

  return (
    <div className="pos-page">
      {/* Header */}
      <header className="header-bar">
        <h1 className="header-title">BuiswAIz</h1>
      </header>
      
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="nav-section">
            <p className="nav-header">GENERAL</p>
            <ul>
              <li onClick={() => navigate("/Dashboard")}>Dashboard</li>
              <li onClick={() => navigate("/inventory")}>Inventory</li>
              <li onClick={() => navigate("/supplier")}>Supplier</li>
              <li className="active">Point of Sales</li>
              <li onClick={() => navigate("/TablePage")}>Sales</li>
              <li onClick={() => navigate("/expenses")}>Expenses</li>
              <li onClick={() => navigate("/assistant")}>AI Assistant</li>
            </ul>
            <p className="nav-header">SUPPORT</p>
            <ul>
              <li>Help</li>
              <li>Settings</li>
            </ul>
          </div>
        </aside>
    </div>
  );
};

export default PointOfSales;