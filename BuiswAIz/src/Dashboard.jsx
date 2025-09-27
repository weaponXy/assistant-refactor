import { useNavigate } from "react-router-dom";
import React, { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "./supabase"; 
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, ResponsiveContainer,
} from 'recharts';
import TopSellingProducts from "./Dashboard/TopSellingProducts";
import SalesSummary from "./Dashboard/SalesSummary";
import DailyGrossSales from "./Dashboard/DailyGrossSales";
import Notifications from "./Dashboard/Notifications";
import UploadSheets from "./components/UploadSheets";

import "./stylecss/Dashboard/Dashboard.css";

const Dashboard = () => {
  const navigate = useNavigate(); 

  const [user, setUser] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [topSellingProducts, setTopSellingProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [expenseChartData, setExpenseChartData] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  function getExpenseDate(row) {
    // Prefer your domain date fields
    const raw =
      row.occured_on ??           // common misspelling in schemas
      row.occurred_on ??          // correct spelling
      row.expensedate ??
      row.expense_date ??
      row.expenseDate ??
      row.date ??
      row.created_at;             // LAST resort fallback

    if (!raw) return null;

    // If it's a DATE like "YYYY-MM-DD", build a local date to avoid timezone shifts
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number);
      return new Date(y, m - 1, d); // local time
    }

    const d = new Date(raw);
    return isNaN(d) ? null : d;
  }



  function buildDailySeries(rows, opts = {}) {
    const now = new Date();
    const year = opts.year ?? now.getFullYear();
    const monthIndex = opts.monthIndex ?? now.getMonth(); // 0..11

    const lastDay = new Date(year, monthIndex + 1, 0);
    const daysInMonth = lastDay.getDate();

    const byDay = Array.from({ length: daysInMonth }, () => 0);

    for (const row of rows) {
      const amt =
        Number(row.amount) ??
        Number(row.expense_amount) ??
        Number(row.total) ?? 0;

      const d = getExpenseDate(row);
      if (!d) continue;

      if (d.getFullYear() === year && d.getMonth() === monthIndex) {
        const dayIdx = d.getDate() - 1;
        byDay[dayIdx] += Number.isFinite(amt) ? amt : 0;
      }
    }

    return byDay.map((total, i) => ({
      day: i + 1,
      total: Number(total.toFixed(2)),
    }));
  }




  useEffect(() => {
    const loadChartData = async () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth(); // 0..11

      const start = new Date(y, m, 1);
      const next  = new Date(y, m + 1, 1);

      const toISO = (dt) => dt.toISOString().slice(0, 10); // YYYY-MM-DD

      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        // use the name your table actually has; try occured_on first
        .gte("occured_on", toISO(start))
        .lt("occured_on", toISO(next));

      if (error) {
        console.error("Failed to fetch expenses for chart:", error);
        setExpenseChartData([]);
        return;
      }

      setExpenseChartData(buildDailySeries(data, { year: y, monthIndex: m }));
    };

    loadChartData();
  }, []);




     const loadActivityLogs = async () => {
      // Align table and relationship names with what your API logs show
        const { data, error } = await supabase
         .from("activitylog") // <- match your working Inventory page
         .select("*, systemuser(username)")
         .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch activity logs:", error);
        return;
      }

      setActivityLogs(data.slice(0, 50)); 

      
      if (data.length > 50) {
        const logsToDelete = data.slice(50); 
        const idsToDelete = logsToDelete.map(log => log.activity_id); 

        const { error: deleteError } = await supabase
          .from("activitylog")
          .delete()
          .in("activity_id", idsToDelete);

        if (deleteError) {
          console.error("Failed to delete old logs:", deleteError);
        } else {
          console.log(`Deleted ${idsToDelete.length} old logs.`);
        }
      }
    };
  // actually run it
  useEffect(() => {
   loadActivityLogs();
    const id = setInterval(loadActivityLogs, 5000);
    return () => clearInterval(id);
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
                        <XAxis dataKey="day" />
                        <YAxis domain={[0, (dataMax) => (dataMax && dataMax > 0 ? dataMax : 1)]} />
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
                <div className="panel-content">
                  <Notifications />
                </div>
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

            <div className="activity-panel">
              <h3>Recent Activity</h3>
              <div className="activity-container">
                <ul>
                  {activityLogs.length === 0 ? (
                    <li className="activity-item">No recent activity</li>
                  ) : (
                    activityLogs.map((log, i) => (
                      <li key={i} className="activity-item">
                        <span>
                          <span className="log-username">
                            {log.systemuser?.username ? log.systemuser.username : "Someone"}
                          </span>{" "}
                          {log.action_desc}
                        </span>
                        <span className="time">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
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