import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import '../stylecss/Dashboard/SalesSummaryDashboard.css';

const SalesSummaryDashboard = () => {
  const [salesData, setSalesData] = useState({
    todaysSale: 0,
    yesterdaysSale: 0,
    percentageChange: 0,
    monthlyTotalSales: 0,
    monthlyNetIncome: 0,
    dailyTransactions: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchSalesData();
  }, []);

  const fetchSalesData = async () => {
    try {
      setLoading(true);

      const now = new Date();
      const phTimeFormatter = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour12: false
      });
      const phTimeParts = phTimeFormatter.formatToParts(now);
      const currentYear = parseInt(phTimeParts.find(p => p.type === 'year').value);
      const currentMonth = parseInt(phTimeParts.find(p => p.type === 'month').value);
      const currentDay = parseInt(phTimeParts.find(p => p.type === 'day').value);

      const todayString = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
      const todayDate = new Date(currentYear, currentMonth - 1, currentDay);
      const yesterdayDate = new Date(todayDate);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayString = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
      const startOfMonthString = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0);
      const endOfMonthString = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDayOfMonth.getDate()).padStart(2, '0')}`;

      let todaysSale = 0;
      let yesterdaysSale = 0;
      let dailyTransactions = 0;

      const { data: todaysOrders } = await supabase
        .from('orders')
        .select('totalamount, orderdate, orderid')
        .gte('orderdate', `${todayString} 00:00:00`)
        .lte('orderdate', `${todayString} 23:59:59`);
      if (todaysOrders) {
        todaysSale = todaysOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
        dailyTransactions = todaysOrders.length;
      }

      const { data: yesterdaysOrders } = await supabase
        .from('orders')
        .select('totalamount, orderdate, orderid')
        .gte('orderdate', `${yesterdayString} 00:00:00`)
        .lte('orderdate', `${yesterdayString} 23:59:59`);
      if (yesterdaysOrders) {
        yesterdaysSale = yesterdaysOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
      }

      const { data: monthlyOrders } = await supabase
        .from('orders')
        .select('totalamount, orderdate')
        .gte('orderdate', `${startOfMonthString} 00:00:00`)
        .lte('orderdate', `${endOfMonthString} 23:59:59`);
      const monthlyTotalSales = monthlyOrders
        ? monthlyOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0)
        : 0;

      const { data: monthlyExpenses } = await supabase
        .from('expenses')
        .select('amount, occurred_on')
        .gte('occurred_on', startOfMonthString)
        .lte('occurred_on', endOfMonthString);
      const monthlyExpensesTotal = monthlyExpenses
        ? monthlyExpenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0)
        : 0;

      const monthlyNetIncome = monthlyTotalSales - monthlyExpensesTotal;

      let percentageChange = 0;
      if (yesterdaysSale > 0) {
        percentageChange = ((todaysSale - yesterdaysSale) / yesterdaysSale) * 100;
      } else if (todaysSale > 0) {
        percentageChange = 100;
      }

      setSalesData({
        todaysSale,
        yesterdaysSale,
        percentageChange,
        monthlyTotalSales,
        monthlyNetIncome,
        dailyTransactions
      });
      setError(null);
    } catch (error) {
      console.error('Error fetching sales data:', error);
      setError('Failed to load sales data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPercentageChange = (change) => {
    const absChange = Math.abs(change);
    const sign = change >= 0 ? '+' : '-';
    return `${sign}${absChange.toFixed(1)}%`;
  };

  const getChangeIcon = (change) => {
    if (change > 0) return '↗️';
    if (change < 0) return '↘️';
    return '➖';
  };

  const getChangeColor = (change) => {
    if (change > 0) return '#059669';
    if (change < 0) return '#dc2626';
    return '#6b7280';
  };

  if (loading) {
    return (
      <div className="sales-summary-container">
        <div className="loading-state">
          <p>Loading sales data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sales-summary-container">
        <div className="error-state">
          <p>{error}</p>
          <button onClick={fetchSalesData} style={{ marginTop: '10px', padding: '5px 10px' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sales-summary-container">
      <div className="sales-summary-grid">
        <div className="sales-card">
          <div className="sales-icon trend-up"><span>📈</span></div>
          <div className="sales-info">
            <div className="sales-amount">
              ₱{salesData.todaysSale.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
            <div className="sales-label">
              Today's Sale
              <span
                className="percentage-change"
                style={{
                  color: getChangeColor(salesData.percentageChange),
                  marginLeft: '4px',
                  fontSize: '9px',
                  fontWeight: '600'
                }}
              >
                {getChangeIcon(salesData.percentageChange)} {formatPercentageChange(salesData.percentageChange)}
              </span>
            </div>
          </div>
        </div>

        <div className="sales-card">
          <div className="sales-icon calendar"><span>📅</span></div>
          <div className="sales-info">
            <div className="sales-amount">
              ₱{salesData.monthlyTotalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
            <div className="sales-label">Monthly Total Sales</div>
          </div>
        </div>

        <div className="sales-card">
          <div className="sales-icon dollar"><span>💰</span></div>
          <div className="sales-info">
            <div className={`sales-amount ${salesData.monthlyNetIncome < 0 ? 'negative' : 'positive'}`}>
              ₱{salesData.monthlyNetIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
            <div className="sales-label">Monthly Net Income</div>
          </div>
        </div>

        <div className="sales-card">
          <div className="sales-icon transactions"><span>🧾</span></div>
          <div className="sales-info">
            <div className="sales-amount">{salesData.dailyTransactions}</div>
            <div className="sales-label">Daily Transactions</div>
          </div>
        </div>
      </div>

      {/* View More Button */}
      <div className="view-more" onClick={() => setShowModal(true)}>
        <button>Click here to view more...</button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Sales Summary Details</h3>
            <ul>
              <li><strong>Today's Sale:</strong> ₱{salesData.todaysSale.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</li>
              <li><strong>Yesterday's Sale:</strong> ₱{salesData.yesterdaysSale.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</li>
              <li><strong>Monthly Total Sales:</strong> ₱{salesData.monthlyTotalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</li>
              <li><strong>Monthly Net Income:</strong> ₱{salesData.monthlyNetIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</li>
              <li><strong>Daily Transactions:</strong> {salesData.dailyTransactions}</li>
            </ul>
            <button className="close-modal" onClick={() => setShowModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesSummaryDashboard;
