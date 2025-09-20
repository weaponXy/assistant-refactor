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

      let todaysSale = 0;
      let yesterdaysSale = 0;
      let monthlyTotalSales = 0;
      let dailyTransactions = 0;

      // Fetch from orderitems
      const { data: todaysOrderItems } = await supabase
        .from('orderitems')
        .select('subtotal, createdat, orderid')
        .gte('createdat', todayString)
        .lt('createdat', tomorrowString);

      if (todaysOrderItems) {
        todaysSale = todaysOrderItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
        dailyTransactions = new Set(todaysOrderItems.map(i => i.orderid)).size;
      }

      const { data: yesterdaysOrderItems } = await supabase
        .from('orderitems')
        .select('subtotal')
        .gte('createdat', yesterdayString)
        .lt('createdat', todayString);

      if (yesterdaysOrderItems) {
        yesterdaysSale = yesterdaysOrderItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
      }

      const { data: monthlyOrderItems } = await supabase
        .from('orderitems')
        .select('subtotal')
        .gte('createdat', startOfMonth)
        .lte('createdat', endOfMonth);

      if (monthlyOrderItems) {
        monthlyTotalSales = monthlyOrderItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
      }

      // ✅ Fixed: fetch all expenses and filter client-side
      let monthlyExpensesTotal = 0;
      try {
        const { data: allExpenses, error: expensesError } = await supabase
          .from('expenses')
          .select('*');

        if (!expensesError && allExpenses) {
          const dateKey = allExpenses.length
            ? (['expensedate','expense_date','expenseDate','date','created_at']
                .find(k => k in allExpenses[0]) || 'expensedate')
            : 'expensedate';

          const inRange = allExpenses.filter(e => {
            const raw = e[dateKey];
            if (!raw) return false;
            const d = new Date(raw);
            if (isNaN(d)) return false;
            return d >= new Date(startOfMonth) && d <= new Date(endOfMonth);
          });

          monthlyExpensesTotal = inRange.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        }
      } catch (expensesError) {
        console.warn('Expenses table might not exist:', expensesError);
      }

      const netIncome = monthlyTotalSales - monthlyExpensesTotal;
      let percentageChange = 0;
      if (yesterdaysSale > 0) {
        percentageChange = ((todaysSale - yesterdaysSale) / yesterdaysSale) * 100;
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
    } catch (err) {
      console.error(err);
      setError("Failed to fetch sales data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading sales summary...</div>;
  if (error) return <div>{error}</div>;

  return (
    <section className="sales-summary">
      <h2>Sales Summary</h2>
      <p>Today's Sales: ₱{salesData.todaysSale.toFixed(2)}</p>
      <p>Yesterday's Sales: ₱{salesData.yesterdaysSale.toFixed(2)}</p>
      <p>Change: {salesData.percentageChange.toFixed(2)}%</p>
      <p>Monthly Total Sales: ₱{salesData.monthlyTotalSales.toFixed(2)}</p>
      <p>Monthly Net Income: ₱{salesData.netIncome.toFixed(2)}</p>
      <p>Daily Transactions: {salesData.dailyTransactions}</p>
    </section>
  );
};

export default SalesSummary;
