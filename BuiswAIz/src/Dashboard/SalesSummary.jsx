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
      
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];

      // Calculate yesterday's date
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];
      
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

      // Fetch today's sales
      const { data: todaysOrders, error: todaysError } = await supabase
        .from('orders')
        .select('totalamount')
        .gte('orderdate', todayString)
        .lt('orderdate', tomorrowString);

      if (todaysError) throw todaysError;

      // Fetch yesterday's sales
      const { data: yesterdaysOrders, error: yesterdaysError } = await supabase
        .from('orders')
        .select('totalamount')
        .gte('orderdate', yesterdayString)
        .lt('orderdate', todayString);

      if (yesterdaysError) throw yesterdaysError;

      // Fetch this month's sales
      const { data: monthlyOrders, error: monthlyError } = await supabase
        .from('orders')
        .select('totalamount')
        .gte('orderdate', startOfMonth)
        .lte('orderdate', endOfMonth);

      if (monthlyError) throw monthlyError;

      // Fetch today's transaction count
      const { data: todaysTransactions, error: transactionsError } = await supabase
        .from('orders')
        .select('orderid')
        .gte('orderdate', todayString)
        .lt('orderdate', tomorrowString);

      if (transactionsError) throw transactionsError;

      // Fetch this month's expenses
      const { data: monthlyExpenses, error: expensesError } = await supabase
        .from('expenses')
        .select('amount')
        .gte('expensedate', startOfMonth)
        .lte('expensedate', endOfMonth);

      if (expensesError) throw expensesError;

      // Calculate values
      const todaysSale = todaysOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
      const yesterdaysSale = yesterdaysOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
      const monthlyTotalSales = monthlyOrders.reduce((sum, order) => sum + (parseFloat(order.totalamount) || 0), 0);
      const monthlyExpensesTotal = monthlyExpenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
      const netIncome = monthlyTotalSales - monthlyExpensesTotal;
      const dailyTransactions = todaysTransactions.length;

      // Calculate percentage change
      let percentageChange = 0;
      if (yesterdaysSale > 0) {
        percentageChange = ((todaysSale - yesterdaysSale) / yesterdaysSale) * 100;
      } else if (todaysSale > 0) {
        percentageChange = 100; // If yesterday was 0 but today has sales, it's 100% increase
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
      setError('Failed to load sales data');
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
    if (change > 0) return '#059669'; // Green for positive
    if (change < 0) return '#dc2626'; // Red for negative
    return '#6b7280'; // Gray for no change
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