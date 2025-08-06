import React, { useState } from "react";
import "./stylecss/Dashboard.css"; // Import the CSS file

const Dashboard = () => {
  const navigate = (path) => {
    console.log(`Navigate to: ${path}`);
  };
  const [user] = useState({ username: "Admin User" }); // Mock user data

  return (
    <div className="dashboard-page">
      <header className="header-bar">
        <h1 className="header-title">BuiswAIz</h1>
      </header>

      <div className="main-section">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="nav-section">
            <p className="nav-header">GENERAL</p>
            <ul>
              <li className="active">Dashboard</li>
              <li onClick={() => navigate("/inventory")}>Inventory</li>
              <li onClick={() => navigate("/supplier")}>Supplier</li>
              <li onClick={() => navigate("/TablePage")}>Sales</li>
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
          {/* Left Section - Main Dashboard Content */}
          <div className="dashboard-content">
            {/* Sales Summary */}
            <div className="dashboard-panel sales-summary">
              <h3>Sales Summary</h3>
              <div className="panel-content">
                {/* Sales summary content placeholder */}
              </div>
            </div>

            {/* Charts Section */}
            <div className="charts-section">
              <div className="dashboard-panel daily-sales">
                <h3>Daily Gross Sales</h3>
                <div className="panel-content">
                  {/* Daily gross sales chart placeholder */}
                </div>
              </div>

              <div className="dashboard-panel monthly-expense">
                <h3>Monthly Expense</h3>
                <div className="panel-content">
                  {/* Monthly expense chart placeholder */}
                </div>
              </div>
            </div>

            {/* Notifications and Top Selling */}
            <div className="bottom-section">
              <div className="dashboard-panel notifications">
                <h3>Notifications</h3>
                <div className="panel-content">
                  {/* Notifications content placeholder */}
                </div>
              </div>

              <div className="dashboard-panel top-selling">
                <h3>Top Selling Products</h3>
                <div className="panel-content">
                  {/* Top selling products content placeholder */}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="right-panel">
            {/* User Info Card with Logout */}
            <div className="user-info-card">
              <div className="user-left">
                <div className="user-avatar" />
                <div className="user-username">
                  {user ? user.username : "Loading..."}
                </div>
              </div>
              <button className="logout-button"
                onClick={async () => {
                  // Logout functionality
                  localStorage.clear();
                  window.location.href = '/';
                }}
              >
                Logout
              </button>
            </div>

            {/* Transaction History */}
            <div className="dashboard-panel transaction-history">
              <h3>Transaction History</h3>
              <div className="panel-content">
                {/* Transaction history content placeholder */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;