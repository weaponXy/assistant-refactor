import { useNavigate } from "react-router-dom";
import React, { useState, useEffect } from "react";
import "./stylecss/dashboard.css";
import { supabase } from "./supabase"; 
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, ResponsiveContainer,
} from 'recharts';
import TopSellingProducts from "./Dashboard/TopSellingProducts";
import SalesSummary from "./Dashboard/SalesSummary";
import DailyGrossSales from "./Dashboard/DailyGrossSales";
import UploadSheets from "./components/UploadSheets";

const Dashboard = () => {
  const navigate = useNavigate(); 

  const [user, setUser] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [topSellingProducts, setTopSellingProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [expenseChartData, setExpenseChartData] = useState([]);

useEffect(() => {
  const loadChartData = async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("amount, expensedate");

    if (error) {
      console.error("Failed to fetch expenses for chart:", error);
      setExpenseChartData([]); // show empty state if needed
      return;
    }

    // Sum totals per month (0–11)
    const totals = new Array(12).fill(0);
    data.forEach(({ amount, expensedate }) => {
      if (!expensedate) return;
      const m = new Date(expensedate).getMonth();
      totals[m] += Number(amount) || 0;
    });

    const months = Array.from({ length: 12 }, (_, m) =>
      new Date(0, m).toLocaleString("default", { month: "short" })
    );

    const chart = months.map((label, m) => ({
      month: label,
      total: Number(totals[m].toFixed(2)),
    }));

    setExpenseChartData(chart);
  };

  loadChartData();
}, []);


  useEffect(() => {
    const getUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        window.location.href = '/';
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('systemuser')
        .select('*')
        .eq('userid', user.id)
        .single();

      if (profileError) {
        console.error("Error fetching user profile:", profileError);
        setLoading(false);
        return;
      }

      setUser(profile);
      setLoading(false);
    };
    
    getUser();
  }, []);

  const fetchTopSellingProducts = async () => {
    try {
      setProductsLoading(true);

      const { data, error } = await supabase
        .from('orderitems')
        .select(`
          orderid,
          productid,
          quantity,
          unitprice,
          subtotal,
          createdat,
          products (productname, image_url)
        `);

      if (error) throw error;

      const summary = {};
      data.forEach(item => {
        const id = item.productid;
        const name = item.products?.productname || 'Unknown';
        const imageUrl = item.products?.image_url || '';

        if (!summary[id]) {
          summary[id] = {
            productid: id,
            productname: name,
            image_url: imageUrl,
            totalQuantity: 0,
            timesBought: new Set(),
          };
        }

        summary[id].totalQuantity += item.quantity;
        summary[id].timesBought.add(item.orderid);
      });

      const topSellingArray = Object.values(summary).map(item => ({
        ...item,
        timesBought: item.timesBought.size,
      }));

      topSellingArray.sort((a, b) => b.totalQuantity - a.totalQuantity);
      const sortedProducts = topSellingArray.slice(0, 5);

      setTopSellingProducts(sortedProducts);
      setProductsError(null);
    } catch (error) {
      console.error('Error fetching top selling products:', error);
      setProductsError('Failed to load top selling products');
      setTopSellingProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    fetchTopSellingProducts();
  }, []);

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

        <div className="main-content">
          <div className="dashboard-content">
            <div className="dashboard-panel sales-summary">
              <h3>Sales Summary</h3>
              <div className="panel-content">
                <SalesSummary />
              </div>
            </div>

            <div className="charts-section">
              <div className="dashboard-panel daily-sales">
                <h3>Daily Gross Sales</h3>

                <div className="panel-content">
                  <DailyGrossSales />
                </div>
                <button className="add-product-button" onClick={() => setShowUploadModal(true)}>Upload Sheets
                </button>

              </div>

              <div className="dashboard-panel monthly-expense">
              <h3>Monthly Expense</h3>

                <div className="panel-content" style={{ minWidth: 0 }}>
                  {expenseChartData.length === 0 ? (
                  <p style={{ padding: 12 }}>No expense data yet.</p>
                    ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={expenseChartData}>
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <CartesianGrid strokeDasharray="5 5" />
                        <Line
                          type="monotone"
                          dataKey="total"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

            </div>

            <div className="bottom-section">
              <div className="dashboard-panel notifications">
                <h3>Notifications</h3>
                <div className="panel-content"></div>
              </div>

              <div className="dashboard-panel top-selling">
                <h3>Top Selling Products</h3>
                <div className="panel-content">
                  {productsLoading ? (
                    <div className="loading-state">
                      <p>Loading products...</p>
                    </div>
                  ) : productsError ? (
                    <div className="error-state">
                      <p>{productsError}</p>
                    </div>
                  ) : topSellingProducts.length === 0 ? (
                    <div className="no-data-state">
                      <p>No top selling products available.</p>
                    </div>
                  ) : (
                    <TopSellingProducts topSellingProducts={topSellingProducts} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="right-panel">
            <div className="user-info-card">
              <div className="user-left">
                <div className="user-avatar" />
                <div className="user-username">
                  {loading ? "Loading..." : user?.username || "No username found"}
                </div>
              </div>
              <button
                className="logout-button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  localStorage.clear();
                  window.location.href = "/";
                }}
              >
                Logout
              </button>
            </div>

            <div className="dashboard-panel transaction-history">
              <h3>Transaction History</h3>
              <div className="panel-content"></div>
            </div>
          </div>
        </div>
      </div>
      {showUploadModal && (
  <div className="modal-overlay">
    <div className="modal">
      <div className="modal-header">
        <h2>Upload Sales Spreadsheet</h2>
        <button
          className="close-btn"
          onClick={() => setShowUploadModal(false)}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* The uploader */}
      <UploadSheets />

      <div className="modal-actions">
        <button onClick={() => setShowUploadModal(false)}>Close</button>
      </div>
    </div>
  </div>
)}

    </div>
  );
};

export default Dashboard;