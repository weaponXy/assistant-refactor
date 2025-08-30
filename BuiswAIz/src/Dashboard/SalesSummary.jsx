import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import '../stylecss/SalesSummary.css';

const SalesSummary = () => {
  const [salesData, setSalesData] = useState({
    todaysSale: 0,
    yesterdaysSale: 0,
    percentageChange: 0,
    monthlyTotalSales: 0,
    netIncome: 0,
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
      
      // Get current date in local timezone
      const today = new Date();
      const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
      const todayString = localToday.toISOString().split('T')[0];
      
      const tomorrow = new Date(localToday);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];

      const yesterday = new Date(localToday);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];
      
      const currentMonth = localToday.getMonth() + 1;
      const currentYear = localToday.getFullYear();
      const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];



      // Method 1: Try using orderitems table (like your Dashboard does)
      let todaysSale = 0;
      let yesterdaysSale = 0;
      let monthlyTotalSales = 0;
      let dailyTransactions = 0;

      try {
        // Fetch today's sales from orderitems
        const { data: todaysOrderItems, error: todaysError } = await supabase
          .from('orderitems')
          .select('subtotal, createdat, orderid')
          .gte('createdat', todayString)
          .lt('createdat', tomorrowString);

        if (!todaysError && todaysOrderItems) {
          todaysSale = todaysOrderItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
          // Count unique orders for transactions
          const uniqueOrders = new Set(todaysOrderItems.map(item => item.orderid));
          dailyTransactions = uniqueOrders.size;
        }

        // Fetch yesterday's sales from orderitems
        const { data: yesterdaysOrderItems, error: yesterdaysError } = await supabase
          .from('orderitems')
          .select('subtotal')
          .gte('createdat', yesterdayString)
          .lt('createdat', todayString);

        if (!yesterdaysError && yesterdaysOrderItems) {
          yesterdaysSale = yesterdaysOrderItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
        }

        // Fetch this month's sales from orderitems
        const { data: monthlyOrderItems, error: monthlyError } = await supabase
          .from('orderitems')
          .select('subtotal')
          .gte('createdat', startOfMonth)
          .lte('createdat', endOfMonth);

        if (!monthlyError && monthlyOrderItems) {
          monthlyTotalSales = monthlyOrderItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
        }

      } catch (orderitemsError) {
        console.warn('Failed to fetch from orderitems table:', orderitemsError);
        
        // Method 2: Fallback to orders table
        const { data: todaysOrders, error: todaysOrdersError } = await supabase
          .from('orders')
          .select('totalamount, orderdate, orderid')
          .gte('orderdate', todayString)
          .lt('orderdate', tomorrowString);

        if (!todaysOrdersError && todaysOrders) {
          todaysSale = todaysOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
          dailyTransactions = todaysOrders.length;
        }

        const { data: yesterdaysOrders, error: yesterdaysOrdersError } = await supabase
          .from('orders')
          .select('totalamount')
          .gte('orderdate', yesterdayString)
          .lt('orderdate', todayString);

        if (!yesterdaysOrdersError && yesterdaysOrders) {
          yesterdaysSale = yesterdaysOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
        }

        const { data: monthlyOrders, error: monthlyOrdersError } = await supabase
          .from('orders')
          .select('totalamount')
          .gte('orderdate', startOfMonth)
          .lte('orderdate', endOfMonth);

        if (!monthlyOrdersError && monthlyOrders) {
          monthlyTotalSales = monthlyOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
        }
      }

      // Method 3: If both methods give us zero, try a broader query to see if there's any data
      if (todaysSale === 0 && monthlyTotalSales === 0) {
        const { data: allRecentData, error: recentError } = await supabase
          .from('orderitems')
          .select('subtotal, createdat, orderid')
          .order('createdat', { ascending: false })
          .limit(10);

        if (!recentError && allRecentData && allRecentData.length > 0) {
          // Filter manually for today
          const todaysData = allRecentData.filter(item => {
            const itemDate = new Date(item.createdat);
            const itemDateString = itemDate.toISOString().split('T')[0];
            return itemDateString === todayString;
          });

          if (todaysData.length > 0) {
            todaysSale = todaysData.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
            const uniqueOrders = new Set(todaysData.map(item => item.orderid));
            dailyTransactions = uniqueOrders.size;
          }
        }
      }

      // Fetch this month's expenses
      let monthlyExpensesTotal = 0;
      try {
        const { data: monthlyExpenses, error: expensesError } = await supabase
          .from('expenses')
          .select('amount')
          .gte('expensedate', startOfMonth)
          .lte('expensedate', endOfMonth);

        if (!expensesError && monthlyExpenses) {
          monthlyExpensesTotal = monthlyExpenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
        }
      } catch (expensesError) {
        console.warn('Expenses table might not exist:', expensesError);
        // Expenses table might not exist, continue without it
      }

      const netIncome = monthlyTotalSales - monthlyExpensesTotal;

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
        netIncome,
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
            <div className={`sales-amount ${salesData.netIncome < 0 ? 'negative' : 'positive'}`}>
              ₱{salesData.netIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
            <div className="sales-label">Net Income</div>
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