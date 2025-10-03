import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import '../stylecss/Dashboard/SalesSummary.css';

const SalesSummary = () => {
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

  useEffect(() => {
    fetchSalesData();
  }, []);

  const fetchSalesData = async () => {
    try {
      setLoading(true);
      
      // Get current date in Philippine timezone (UTC+8) using reliable method
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      const todayString = formatter.format(now); // Returns "YYYY-MM-DD" format
      
      // Calculate yesterday and tomorrow using Philippine time
      const phTimeFormatter = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const phTimeParts = phTimeFormatter.formatToParts(now);
      const currentYear = parseInt(phTimeParts.find(p => p.type === 'year').value);
      const currentMonth = parseInt(phTimeParts.find(p => p.type === 'month').value) - 1; // 0-indexed
      const currentDay = parseInt(phTimeParts.find(p => p.type === 'day').value);
      
      const phTime = new Date(currentYear, currentMonth, currentDay);

      const yesterday = new Date(phTime);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];
      
      // Calculate month boundaries using Philippine timezone
      // First day of current month (October 1, 2025 for example)
      const startOfMonthString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      
      // Last day of current month (handles 28, 29, 30, or 31 days automatically)
      const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
      const endOfMonthString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth.getDate()).padStart(2, '0')}`;

      // ================================
      // Daily Sales - Using orders table with orderdate and totalamount
      // ================================
      let todaysSale = 0;
      let yesterdaysSale = 0;
      let dailyTransactions = 0;

      // Create datetime ranges for accurate filtering
      const todayStart = `${todayString} 00:00:00`;
      const todayEnd = `${todayString} 23:59:59`;

      // Fetch today's sales from orders table
      const { data: todaysOrders, error: todaysError } = await supabase
        .from('orders')
        .select('totalamount, orderdate, orderid')
        .gte('orderdate', todayStart)
        .lte('orderdate', todayEnd);

      if (todaysError) {
        console.warn('Failed to fetch today\'s orders:', todaysError);
      } else if (todaysOrders) {
        todaysSale = todaysOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
        dailyTransactions = todaysOrders.length;
      }

      // Fetch yesterday's sales from orders table
      // Use a more flexible query that handles different date formats
      const { data: yesterdaysOrders, error: yesterdaysError } = await supabase
        .from('orders')
        .select('totalamount, orderdate')
        .gte('orderdate', yesterdayString)
        .lt('orderdate', todayString);

      if (yesterdaysError) {
        console.warn('Failed to fetch yesterday\'s orders:', yesterdaysError);
      } else if (yesterdaysOrders) {
        yesterdaysSale = yesterdaysOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
      }

      // ================================
      // Monthly Sales and Expenses calculation for Net Income
      // ================================
      let monthlyTotalSales = 0;
      let monthlyExpensesTotal = 0;

      // Create datetime ranges for monthly filtering
      const monthStart = `${startOfMonthString} 00:00:00`;
      const monthEnd = `${endOfMonthString} 23:59:59`;

      // Get monthly sales from orders table using orderdate and totalamount
      const { data: monthlyOrders, error: monthlyOrdersError } = await supabase
        .from('orders')
        .select('totalamount, orderdate')
        .gte('orderdate', monthStart)
        .lte('orderdate', monthEnd);

      if (monthlyOrdersError) {
        console.warn('Monthly sales lookup failed:', monthlyOrdersError);
      } else if (monthlyOrders) {
        monthlyTotalSales = monthlyOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
      }

      // Get monthly expenses from expenses table using occurred_on and amount
      const { data: monthlyExpenses, error: monthlyExpensesError } = await supabase
        .from('expenses')
        .select('amount, occurred_on')
        .gte('occurred_on', startOfMonthString)
        .lte('occurred_on', endOfMonthString);

      if (monthlyExpensesError) {
        console.warn('Monthly expenses lookup failed:', monthlyExpensesError);
      } else if (monthlyExpenses) {
        monthlyExpensesTotal = monthlyExpenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
      }

      // Calculate Monthly Net Income
      const monthlyNetIncome = monthlyTotalSales - monthlyExpensesTotal;

      // Calculate percentage change
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
          <div className="sales-icon trend-up">
            <span>📈</span>
          </div>
          <div className="sales-info">
            <div className="sales-amount">₱{salesData.todaysSale.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
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
          <div className="sales-icon calendar">
            <span>📅</span>
          </div>
          <div className="sales-info">
            <div className="sales-amount">₱{salesData.monthlyTotalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            <div className="sales-label">Monthly Total Sales</div>
          </div>
        </div>

        <div className="sales-card">
          <div className="sales-icon dollar">
            <span>💰</span>
          </div>
          <div className="sales-info">
            <div className={`sales-amount ${salesData.monthlyNetIncome < 0 ? 'negative' : 'positive'}`}>
              ₱{salesData.monthlyNetIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
            <div className="sales-label">Monthly Net Income</div>
          </div>
        </div>

        <div className="sales-card">
          <div className="sales-icon transactions">
            <span>🧾</span>
          </div>
          <div className="sales-info">
            <div className="sales-amount">{salesData.dailyTransactions}</div>
            <div className="sales-label">Daily Transactions</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesSummary;