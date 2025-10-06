import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../supabase';
import '../stylecss/Sales/NetIncome.css';

const NetIncome = ({ orderData, statsFilter }) => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localFilter, setLocalFilter] = useState(statsFilter || 'all');

  // Fetch expenses data
  useEffect(() => {
    const fetchExpenses = async () => {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select('amount, occurred_on');

        if (error) {
          console.error('Error fetching expenses:', error);
          return;
        }

        setExpenses(data || []);
      } catch (error) {
        console.error('Unexpected error fetching expenses:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchExpenses();
  }, []);

  // Sync localFilter with statsFilter prop
  useEffect(() => {
    setLocalFilter(statsFilter || 'all');
  }, [statsFilter]);

  // Calculate financial metrics
  const financialMetrics = useMemo(() => {
    if (!orderData.length) {
      return {
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
        totalExpenses: 0,
        netProfit: 0
      };
    }

    const now = new Date();
    const currentFilter = localFilter;

    // Filter order data based on statsFilter
    const filteredOrderData = orderData.filter(item => {
      const orderDate = item.orders?.orderdate;
      if (!orderDate) return false;
      
      const date = new Date(orderDate);
      
      if (currentFilter.startsWith('year-')) {
        const year = parseInt(currentFilter.replace('year-', ''));
        return date.getFullYear() === year;
      }

      switch (currentFilter) {
        case 'all':
          return true;
        case 'today':
          return date.toDateString() === now.toDateString();
        case 'week1':
          return date.getDate() <= 7 && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case 'week2':
          return date.getDate() > 7 && date.getDate() <= 14 && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case 'week3':
          return date.getDate() > 14 && date.getDate() <= 21 && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case 'month':
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    });

    // Filter expenses based on statsFilter
    const filteredExpenses = expenses.filter(expense => {
      const occurredOn = expense.occurred_on;
      if (!occurredOn) return false;
      
      const date = new Date(occurredOn);
      
      if (currentFilter.startsWith('year-')) {
        const year = parseInt(currentFilter.replace('year-', ''));
        return date.getFullYear() === year;
      }

      switch (currentFilter) {
        case 'all':
          return true;
        case 'today':
          return date.toDateString() === now.toDateString();
        case 'week1':
          return date.getDate() <= 7 && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case 'week2':
          return date.getDate() > 7 && date.getDate() <= 14 && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case 'week3':
          return date.getDate() > 14 && date.getDate() <= 21 && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case 'month':
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    });

    // Calculate Net Sales (sum of all order totals)
    const uniqueOrders = new Map();
    filteredOrderData.forEach(item => {
      if (!uniqueOrders.has(item.orderid)) {
        uniqueOrders.set(item.orderid, item.orders?.totalamount || 0);
      }
    });
    const netSales = Array.from(uniqueOrders.values()).reduce((sum, amount) => sum + amount, 0);

    // Calculate COGS (Cost of Goods Sold)
    const cogs = filteredOrderData.reduce((sum, item) => {
      const cost = item.productcategory?.cost || 0;
      const quantity = item.quantity || 0;
      return sum + (cost * quantity);
    }, 0);

    // Calculate Gross Profit
    const grossProfit = netSales - cogs;

    // Calculate Total Expenses
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);

    // Calculate Net Profit
    const netProfit = grossProfit - totalExpenses;

    return {
      netSales,
      cogs,
      grossProfit,
      totalExpenses,
      netProfit
    };
  }, [orderData, expenses, localFilter]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const handleFilterChange = (e) => {
    setLocalFilter(e.target.value);
  };

  // Debug logging
    if (loading) {
        return (
        <div className="net-income-container">
            <div className="net-income-header">
            <h3>Net Income</h3>
            </div>
            <div className="loading-state">Loading financial data...</div>
        </div>
        );
    }

  return (
    <div className="net-income-container">
      <div className="net-income-header">
        <h3>Net Income</h3>
        <select 
          className="filter-dropdown" 
          value={localFilter} 
          onChange={handleFilterChange}
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week1">Week 1</option>
          <option value="week2">Week 2</option>
          <option value="week3">Week 3</option>
          <option value="month">This Month</option>
          <option value="year-2024">2024</option>
          <option value="year-2025">2025</option>
        </select>
      </div>

      <div className="metrics-grid">
        {/* Net Sales Card */}
        <div className="metric-card net-sales-card">
          <div className="metric-content">
            <p className="metric-label">Net Sales</p>
            <p className="metric-value">{formatCurrency(financialMetrics.netSales)}</p>
            <p className="metric-description">Total revenue from orders</p>
          </div>
        </div>

        <div className="metric-card cogs-card">
          <div className="metric-content">
            <p className="metric-label">Cost of Goods Sold</p>
            <p className="metric-value cogs-value">{formatCurrency(financialMetrics.cogs)}</p>
            <p className="metric-description">Total product costs</p>
          </div>
        </div>

        {/* Gross Profit Card */}
        <div className="metric-card gross-profit-card">
          <div className="metric-content">
            <p className="metric-label">Gross Profit</p>
            <p className={`metric-value ${financialMetrics.grossProfit >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(financialMetrics.grossProfit)}
            </p>
            <p className="metric-description">Sales minus COGS</p>
            <div className="metric-badge">
              {financialMetrics.netSales > 0 
                ? `${((financialMetrics.grossProfit / financialMetrics.netSales) * 100).toFixed(1)}% margin`
                : '0% margin'}
            </div>
          </div>
        </div>

        {/* Expenses Card */}
        <div className="metric-card expenses-card">
          <div className="metric-content">
            <p className="metric-label">Total Expenses</p>
            <p className="metric-value expenses-value">{formatCurrency(financialMetrics.totalExpenses)}</p>
            <p className="metric-description">Operating expenses</p>
          </div>
        </div>

        {/* Net Profit Card - Featured */}
        <div className="metric-card net-profit-card featured">
          <div className="metric-content">
            <p className="metric-label">Net Profit</p>
            <p className={`metric-value large ${financialMetrics.netProfit >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(financialMetrics.netProfit)}
            </p>
            <p className="metric-description">Gross profit minus expenses</p>
            <div className="profit-breakdown">
              <div className="breakdown-item">
                <span className="breakdown-label">Gross:</span>
                <span className="breakdown-value">{formatCurrency(financialMetrics.grossProfit)}</span>
              </div>
              <div className="breakdown-divider">−</div>
              <div className="breakdown-item">
                <span className="breakdown-label">Expenses:</span>
                <span className="breakdown-value">{formatCurrency(financialMetrics.totalExpenses)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Card */}
        <div className="metric-card summary-card">
          <div className="summary-header">
            <h4>Quick Summary</h4>
          </div>
          <div className="summary-content">
            <div className="summary-row">
              <span className="summary-label">Profit Margin:</span>
              <span className={`summary-value ${financialMetrics.netProfit >= 0 ? 'positive' : 'negative'}`}>
                {financialMetrics.netSales > 0 
                  ? `${((financialMetrics.netProfit / financialMetrics.netSales) * 100).toFixed(2)}%`
                  : '0%'}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Expense Ratio:</span>
              <span className="summary-value">
                {financialMetrics.netSales > 0 
                  ? `${((financialMetrics.totalExpenses / financialMetrics.netSales) * 100).toFixed(2)}%`
                  : '0%'}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Cost of Goods Sold Ratio:</span>
              <span className="summary-value">
                {financialMetrics.netSales > 0 
                  ? `${((financialMetrics.cogs / financialMetrics.netSales) * 100).toFixed(2)}%`
                  : '0%'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetIncome;